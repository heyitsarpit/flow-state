import { Option, Predicate } from "effect";
import {
  Action,
  type Alternative,
  type Denial,
  Guard,
  type GuardInput,
  type Level,
  type Node,
  type SelectInput,
  Target,
  type UpdateInput,
  type Values,
} from "./core/compiled.ts";
import type { HistoryToken, StateToken } from "./definition.ts";
import type { SendInternals, SendToken } from "./send.ts";
import type { ActorRef } from "./definition.ts";
import { is } from "./config.ts";
import { invalid } from "./error.ts";
import type { TreeNode } from "./construction.ts";
import { type Compile, foreign, type Path, slotOf } from "./compile-names.ts";
import { scheduleOf } from "./compile-schedules.ts";
import {
  type ActionInternals,
  type ActivityInternals,
  type GuardInternals,
  slot,
} from "./handles.ts";
import { endingOf } from "./events.ts";
import { internalsOf, ownerOf } from "./made.ts";
import type { TokenInternals } from "./definition.ts";
import type { ActionToken, ActivityToken, Change, ErasedPlacement, GuardToken } from "./tokens.ts";

// One guard element as the compiler reads it: its callback takes `never`.
type AnyGuard = StateToken | GuardToken<never> | ((input: never) => true | Denial);

// One alternative as the compiler reads it, its callbacks taking `never`.
type AnyConfig = {
  readonly target?: StateToken | HistoryToken | "self";
  readonly guard?: AnyGuard | ReadonlyArray<AnyGuard>;
  readonly updateMemory?: (input: never) => Values;
  readonly actions?: ReadonlyArray<ActionToken<never> | SendToken>;
};

type AnyAlternative = AnyConfig | StateToken | HistoryToken;

/**
 * A state's body as the compiler walks it, its literal types erased: every callback takes `never`
 * and every optional record may be `undefined`, so each body a definition types assigns to it with
 * no cast, inside a generic function too.
 */
export type AnyState = {
  readonly default?: StateToken;
  readonly on?:
    | Readonly<Partial<Record<string, AnyAlternative | ReadonlyArray<AnyAlternative>>>>
    | undefined;
  readonly schedules?: Readonly<Partial<Record<string, ErasedPlacement>>> | undefined;
  readonly activities?: ReadonlyArray<ActivityToken> | undefined;
  readonly states?: Readonly<Partial<Record<string, AnyState>>> | undefined;
};

/**
 * A machine body as the compiler walks it: the root's state body and its `onContext` reactions.
 */
export type AnyBody = AnyState & { readonly onContext?: ReadonlyArray<Change> };

/**
 * A machine's body function as the compiler calls it: the definition's `S`, `E`, `O` and its
 * `C` reactions in, the body out, their literal types erased.
 */
export type BodyFunction = (tokens: {
  readonly S: Values;
  readonly E: Values;
  readonly O: Values;
  readonly C: Values;
}) => AnyBody;

const unknownEvent = (at: Path, event: string, help: string) =>
  invalid(at, "UnknownEvent", `no event ${event}`, help);

// RETURN_TYPE: the Compiled shape this part builds.
const guardOf = (compile: Compile, element: AnyGuard, at: Path): Guard => {
  if (is.state(element)) {
    const path = compile.tokens.get(element);

    if (path === undefined) compile.findings.push(foreign(at, "a guard's state token"));

    return Guard.InState({
      state: path ?? internalsOf<TokenInternals>("state", element).path,
    });
  }

  if (is.guard(element)) {
    if (ownerOf("guard", element) !== compile.owner)
      compile.findings.push(foreign(at, `the operation ${element.operation}`));

    return internalsOf<GuardInternals>("guard", element).make(slotOf(at));
  }

  return Guard.Check({
    check: slot<(input: GuardInput) => true | Denial>(slotOf(at), element),
  });
};

// RETURN_TYPE: the Compiled shape this part builds.
const targetOf = (
  compile: Compile,
  given: Option.Option<StateToken | HistoryToken | "self">,
  at: Path,
): Option.Option<Target> => {
  if (Option.isNone(given) || given.value === "self") return Option.none();

  const state = compile.tokens.get(given.value);

  if (state !== undefined) return Option.some(Target.State({ path: state }));

  const history = compile.histories.get(given.value);

  if (history !== undefined) return Option.some(Target.History({ path: history }));

  compile.findings.push(foreign([...at, "target"], "the target"));

  return Option.none();
};

// FLOW_STATE_ALLOW_UNKNOWN: an authored value that may be a callback.
// RETURN_TYPE: a type guard states the callback type it narrows to.
const isCallback = (x: unknown): x is (input: never) => unknown => Predicate.isFunction(x);

// A send's event as one callback returning the envelope.
// FLOW_STATE_ALLOW_UNKNOWN: the event a send's callback returns is checked when the turn resolves it.
type SendCallback = (input: SelectInput) => unknown;

// FLOW_STATE_ALLOW_UNKNOWN: an authored send callback, whose event is checked when the turn resolves it.
type AnyCallback = (input: never) => unknown;

// A send's event in one form: a token's mapping adds its tag to the payload it computes, a constant
// is returned as written, and a callback runs as it is.
// RETURN_TYPE: every form compiles to the one callback the Send action holds.
const sendEventOf = (
  // FLOW_STATE_ALLOW_UNKNOWN: a send's event in any of its three forms, told apart here.
  event: unknown,
): Option.Option<AnyCallback> => {
  if (isCallback(event)) return Option.some(event);

  const mapped = Option.filter(endingOf(event), (ending) => Option.isSome(ending.from));

  if (Option.isSome(mapped)) {
    const { event: tag, from } = mapped.value;

    return Option.map(from, (map) => (input: SelectInput) => {
      const payload = map(input, {});

      // A mapper that returns no record sends no event: the target's check refuses it.
      return Predicate.isReadonlyObject(payload) ? { ...payload, _tag: tag } : payload;
    });
  }

  return Predicate.hasProperty(event, "_tag") && Predicate.isString(event._tag)
    ? Option.some(() => event)
    : Option.none();
};

const sendOf = (compile: Compile, token: SendToken, at: Path) => {
  const send = internalsOf<SendInternals>("send", token);

  return Option.match(sendEventOf(send.event), {
    onNone: () => {
      compile.findings.push(
        invalid(
          [...at, "event"],
          "WrongKind",
          "a send's event is not an event of its target",
          "Send the target's token, Target.E.X.from(f) or Target.E.X(payload), or a callback returning the event.",
        ),
      );

      return Option.none<Action>();
    },
    onSome: (event) =>
      Option.some(
        Action.Send({
          to: slot<(input: SelectInput) => ActorRef>(slotOf([...at, "to"]), send.to),
          event: slot<SendCallback>(slotOf([...at, "event"]), event),
        }),
      ),
  });
};

// RETURN_TYPE: the Compiled shape this part builds.
const alternativeOf = (compile: Compile, raw: AnyAlternative, at: Path): Alternative => {
  const config: AnyConfig = is.state(raw) || is.history(raw) ? { target: raw } : raw;

  const target = targetOf(compile, Option.fromUndefinedOr(config.target), at);

  const guarded = (config.guard === undefined ? [] : [config.guard].flat()).map((g, i) =>
    guardOf(compile, g, [...at, "guard", i]),
  );

  const actions = (config.actions ?? []).flatMap((a, i) => {
    const place = [...at, "actions", i];

    if (is.send(a)) return Option.toArray(sendOf(compile, a, place));

    if (ownerOf("action", a) !== compile.owner) {
      compile.findings.push(foreign(place, "an action"));

      return [];
    }

    return [internalsOf<ActionInternals>("action", a).make(slotOf(place))];
  });

  return {
    at: slotOf(at),
    target,
    guards: guarded,
    update: Option.map(Option.fromUndefinedOr(config.updateMemory), (run) =>
      slot<(input: UpdateInput) => Values>(slotOf([...at, "updateMemory"]), run),
    ),
    actions,
  };
};

// RETURN_TYPE: the Compiled shape this part builds.
const levelOf = (compile: Compile, on: NonNullable<AnyState["on"]>, at: Path): Level =>
  new Map(
    Object.entries(on).flatMap(([event, handler]) => {
      if (handler === undefined) return [];

      if (!compile.events.has(event)) {
        compile.findings.push(
          unknownEvent([...at, "on", event], event, "Handle only events the definition declares."),
        );

        return [];
      }

      const list: ReadonlyArray<AnyAlternative> = Array.isArray(handler) ? handler : [handler];

      return [[event, list.map((raw, i) => alternativeOf(compile, raw, [...at, "on", event, i]))]];
    }),
  );

const nameOf = (here: string) => (here === "" ? "the root" : here);

const leafHasChildren = (here: string, at: Path) =>
  invalid(
    at,
    "LeafHasChildren",
    `the leaf ${here} declares a default or states`,
    "Give a leaf only on and schedules.",
  );

// A compound's default child, checked to be a direct child token of this definition.
const defaultOf = (
  compile: Compile,
  given: StateToken,
  children: ReadonlySet<string>,
  here: string,
  at: Path,
) => {
  const token = compile.tokens.get(given);

  if (token === undefined) {
    compile.findings.push(foreign(at, "the default"));

    return Option.none<string>();
  }

  if (!children.has(token)) {
    compile.findings.push(
      invalid(
        at,
        "DefaultNotChild",
        `${token} is not a direct child of ${nameOf(here)}`,
        "Name a direct child as default.",
      ),
    );

    return Option.none<string>();
  }

  return Option.some(token);
};

// A compound's default, or the refusal of a missing one; a leaf declares none.
const chosenOf = (
  compile: Compile,
  body: AnyState,
  children: ReadonlySet<string>,
  here: string,
  at: Path,
) => {
  if (body.default !== undefined) return defaultOf(compile, body.default, children, here, at);

  compile.findings.push(
    invalid(
      at,
      "MissingDefault",
      `${nameOf(here)} has no default`,
      "Name a direct child as default.",
    ),
  );

  return Option.none<string>();
};

/**
 * What one state compiles to before `indexOf` derives its fields: its node without `chain`,
 * `depth` and `leaf`.
 */
export type NodeFacts = Omit<Node, "chain" | "depth" | "leaf">;

/**
 * A body compiled in one walk of the definition's tree: the root's handlers and default child, and
 * every state's facts, depth first, each parent before its children.
 */
export type Walked = {
  readonly root: Level;
  readonly initial: string;
  readonly nodes: ReadonlyArray<NodeFacts>;
};

/**
 * Compiles a body in one walk of the definition's tree, each state's facts appended to one list:
 * its handlers, schedules and default child, its body's names checked against the tree.
 */
export const walkOf = (compile: Compile, body: AnyBody) => {
  const nodes: Array<NodeFacts> = [];

  const visit = (state: AnyState, node: Option.Option<TreeNode>, at: Path) => {
    const paths = Option.match(node, { onNone: () => compile.top, onSome: (n) => n.children });
    const here = Option.match(node, { onNone: () => "", onSome: (n) => n.path });
    const isLeaf = Option.isSome(node) && paths.length === 0;

    const { on, initial, schedules, placements } = levelFacts(
      compile,
      state,
      paths,
      here,
      isLeaf,
      at,
    );

    const written = isLeaf ? {} : (state.states ?? {});

    const children = paths.flatMap((c) =>
      Option.toArray(Option.fromUndefinedOr(compile.nodes.get(c))),
    );

    unknownStates(compile, written, children, here, at);

    if (Option.isSome(node))
      nodes.push({
        path: node.value.path,
        parent: node.value.parent,
        children: node.value.children,
        default: isLeaf ? Option.none() : initial,
        on,
        schedules,
        placements,
      });

    for (const child of children)
      visit(written[child.name] ?? {}, Option.some(child), [...at, "states", child.name]);

    return { on, initial };
  };

  const root = visit(body, Option.none(), []);

  return { root: root.on, initial: Option.getOrElse(root.initial, () => ""), nodes };
};

// One state's own facts, its findings in walk order: a leaf's default, a compound's default child,
// its handlers and schedules, and a leaf's states.
const levelFacts = (
  compile: Compile,
  state: AnyState,
  paths: ReadonlyArray<string>,
  here: string,
  isLeaf: boolean,
  at: Path,
) => {
  if (isLeaf && state.default !== undefined)
    compile.findings.push(leafHasChildren(here, [...at, "default"]));

  const chosen = isLeaf
    ? Option.none<string>()
    : chosenOf(compile, state, new Set(paths), here, [...at, "default"]);

  const on = levelOf(compile, state.on ?? {}, at);

  const schedules = Object.entries(state.schedules ?? {}).flatMap(([name, entry]) =>
    entry === undefined ? [] : [scheduleOf(compile, name, entry, [...at, "schedules", name])],
  );

  const placements = (state.activities ?? []).map((activity, i) =>
    placementOf(compile, activity, [...at, "activities", i]),
  );

  if (isLeaf && state.states !== undefined)
    compile.findings.push(leafHasChildren(here, [...at, "states"]));

  return {
    on,
    schedules,
    placements,
    initial: Option.orElse(chosen, () => Option.fromUndefinedOr(paths[0])),
  };
};

// One placed read, checked to be this definition's own operation's.
const placementOf = (compile: Compile, activity: ActivityToken, at: Path) => {
  if (ownerOf("activity", activity) !== compile.owner)
    compile.findings.push(foreign(at, `the operation ${activity.operation}`));

  return internalsOf<ActivityInternals>("activity", activity).make(slotOf(at));
};

// A body written for a state the tree does not hold below this one.
const unknownStates = (
  compile: Compile,
  written: Readonly<Partial<Record<string, AnyState>>>,
  children: ReadonlyArray<TreeNode>,
  here: string,
  at: Path,
) => {
  const names = new Set(children.map((c) => c.name));

  for (const key of Object.keys(written).filter((k) => !names.has(k)))
    compile.findings.push(
      invalid(
        [...at, "states", key],
        "UnknownState",
        `${nameOf(here)} has no child ${key}`,
        "Write bodies only for the definition's states.",
      ),
    );
};
