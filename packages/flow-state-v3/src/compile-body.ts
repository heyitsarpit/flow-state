import { TIMER_LIMIT_MS } from "./core/defaults.ts";
import { Duration, Option, Predicate } from "effect";
import {
  Action,
  type Alternative,
  Delay,
  Guard,
  type Level,
  type Node,
  type Schedule,
  type SelectInput,
  Target,
  type Values,
} from "./core/compiled.ts";
import type {
  AlternativeConfig,
  AnyDefinition,
  GuardElement,
  HistoryToken,
  ScheduleConfig,
  StateToken,
} from "./definition.ts";
import type { SendToken } from "./send.ts";
import { is } from "./config.ts";
import { invalid } from "./error.ts";
import { checkName, type TreeNode } from "./construction.ts";
import { erase } from "./handles.ts";
import type { Finding } from "./error.ts";
import type { AnyBody } from "./machine.ts";

type AnyAlternative = AlternativeConfig<Values, Values, string> | StateToken | HistoryToken;

type Path = ReadonlyArray<string | number>;

const joined = (slot: string, segment: string) => (slot === "" ? segment : `${slot}.${segment}`);

// A place's slot name, as Compiled names its closures: `states.ON.on.Flip[0].guard[1]`.
const slotOf = (at: Path) =>
  at.reduce<string>(
    (slot, segment) =>
      Predicate.isNumber(segment) ? `${slot}[${segment}]` : joined(slot, segment),
    "",
  );

/**
 * Everything one compile reads and collects: the definition's tokens by identity, the tree, and
 * the findings in walk order.
 */
export type Compile = {
  readonly definition: AnyDefinition;
  readonly nodes: ReadonlyMap<string, TreeNode>;
  // FLOW_STATE_ALLOW_UNKNOWN: an authored or compiled value, checked here before it is trusted.
  readonly tokens: ReadonlyMap<unknown, string>;
  // FLOW_STATE_ALLOW_UNKNOWN: an authored or compiled value, checked here before it is trusted.
  readonly histories: ReadonlyMap<unknown, string>;
  readonly events: ReadonlySet<string>;
  // FLOW_STATE_ALLOW_UNKNOWN: an authored or compiled value, checked here before it is trusted.
  readonly sends: ReadonlySet<unknown>;
  readonly findings: Array<Finding>;
  readonly scheduleNames: Map<string, string>;
};

const foreign = (at: Path, what: string) =>
  invalid(
    at,
    "ForeignToken",
    `${what} is not this definition's`,
    "Use the tokens the machine body receives: S, E and O of this definition.",
  );

const unknownEvent = (at: Path, event: string, help: string) =>
  invalid(at, "UnknownEvent", `no event ${event}`, help);

// RETURN_TYPE: the Compiled shape this part builds.
const guardOf = (compile: Compile, element: GuardElement<Values, Values>, at: Path): Guard => {
  if (is.state(element)) {
    const path = compile.tokens.get(element);

    if (path === undefined) compile.findings.push(foreign(at, "a guard's state token"));

    return Guard.InState({ state: path ?? element["~path"] });
  }

  if (is.guard(element)) {
    if (element["~owner"] !== compile.definition["~owner"])
      compile.findings.push(foreign(at, `the operation ${element.operation}`));

    return element.make(slotOf(at));
  }

  return Guard.Check({
    check: { slot: slotOf(at), run: element },
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

// A send's event in one form: a token's mapping adds its tag to the payload it computes, a constant
// is returned as written, and a callback runs as it is.
// RETURN_TYPE: every form compiles to the one callback the Send action holds.
const sendEventOf = (
  // FLOW_STATE_ALLOW_UNKNOWN: a send's event in any of its three forms, told apart here.
  event: unknown,
): Option.Option<SendCallback> => {
  if (isCallback(event)) return Option.some(erase<SelectInput, ReturnType<SendCallback>>(event));

  if (
    Predicate.hasProperty(event, "ending") &&
    Predicate.hasProperty(event.ending, "event") &&
    Predicate.isString(event.ending.event) &&
    Predicate.hasProperty(event.ending, "from") &&
    Option.isOption(event.ending.from)
  ) {
    const tag = event.ending.event;

    return Option.map(
      Option.filter(event.ending.from, isCallback),
      (map) => (input: SelectInput) => {
        const payload = erase<SelectInput, ReturnType<SendCallback>>(map)(input);

        // A mapper that returns no record sends no event: the target's check refuses it.
        return Predicate.isReadonlyObject(payload) ? { ...payload, _tag: tag } : payload;
      },
    );
  }

  return Predicate.hasProperty(event, "_tag") && Predicate.isString(event._tag)
    ? Option.some(() => event)
    : Option.none();
};

const sendOf = (compile: Compile, token: SendToken<Values, Values>, at: Path) =>
  Option.match(sendEventOf(token.event), {
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
          to: {
            slot: slotOf([...at, "to"]),
            run: token.to,
          },
          event: { slot: slotOf([...at, "event"]), run: event },
        }),
      ),
  });

// RETURN_TYPE: the Compiled shape this part builds.
const alternativeOf = (compile: Compile, raw: AnyAlternative, at: Path): Alternative => {
  const config: AlternativeConfig<Values, Values, string> =
    is.state(raw) || is.history(raw) ? { target: raw } : raw;

  const target = targetOf(compile, Option.fromUndefinedOr(config.target), at);

  const guarded = (config.guard === undefined ? [] : [config.guard].flat()).map((g, i) =>
    guardOf(compile, g, [...at, "guard", i]),
  );

  const actions = (config.actions ?? []).flatMap((a, i) => {
    const place = [...at, "actions", i];

    if (a["~flow"] === "send") return Option.toArray(sendOf(compile, a, place));

    if (a["~owner"] !== compile.definition["~owner"]) {
      compile.findings.push(foreign(place, "an action"));

      return [];
    }

    return [a.make(slotOf(place))];
  });

  return {
    at: slotOf(at),
    target,
    guards: guarded,
    update: Option.map(Option.fromUndefinedOr(config.updateMemory), (run) => ({
      slot: slotOf([...at, "updateMemory"]),
      run,
    })),
    actions,
  };
};

// RETURN_TYPE: the Compiled shape this part builds.
const levelOf = (compile: Compile, on: Values, at: Path): Level =>
  new Map(
    Object.entries(on).flatMap(([event, handler]) => {
      if (handler === undefined) return [];

      if (!compile.events.has(event)) {
        compile.findings.push(
          unknownEvent([...at, "on", event], event, "Handle only events the definition declares."),
        );

        return [];
      }

      // SAFETY: a decoded On record's values are handlers: one alternative, a state token, or a list of them.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the On record's per-event handler types are erased here
      const list = (Array.isArray(handler) ? handler : [handler]) as ReadonlyArray<AnyAlternative>;

      return [[event, list.map((raw, i) => alternativeOf(compile, raw, [...at, "on", event, i]))]];
    }),
  );

// Whether a delay holds a NaN or infinite number: Duration reads a NaN part as 0, so each part
// is checked as written.
const partsOf = (delay: Duration.Input) => {
  if (Array.isArray(delay)) return delay;

  return Predicate.isObject(delay) && !Duration.isDuration(delay) ? Object.values(delay) : [];
};

const hasNonFinitePart = (delay: Duration.Input) =>
  partsOf(delay).some((part) => Predicate.isNumber(part) && !Number.isFinite(part));

// A fixed delay in ms, NaN when it has none: a number is read as written, since Duration clamps a
// negative one and keeps Infinity.
const msOf = (delay: Duration.Input) => {
  if (Predicate.isNumber(delay)) return delay;

  if (hasNonFinitePart(delay)) return Number.NaN;

  return Option.getOrElse(
    Option.map(Duration.fromInput(delay), Duration.toMillis),
    () => Number.NaN,
  );
};

const fixedDelay = (compile: Compile, delay: Duration.Input, at: Path) => {
  const ms = msOf(delay);

  if (!Number.isFinite(ms) || ms < 0 || ms > TIMER_LIMIT_MS)
    compile.findings.push(
      invalid(
        [...at, "schedule"],
        "DelayOutOfRange",
        "a schedule's delay is not between 0 and 2^31 - 1 ms",
        "Give the schedule a finite delay of at most 2^31 - 1 ms (about 24.8 days).",
      ),
    );

  return ms;
};

// RETURN_TYPE: the Compiled shape this part builds.
const scheduleOf = (
  compile: Compile,
  name: string,
  config: ScheduleConfig<Values, Values>,
  at: Path,
): Schedule => {
  compile.findings.push(...checkName(name, at));

  if (compile.scheduleNames.has(name))
    compile.findings.push(
      invalid(
        at,
        "DuplicateName",
        `two schedules are named ${name}`,
        "Give every schedule of a machine its own name.",
      ),
    );
  else compile.scheduleNames.set(name, slotOf(at));

  if (!compile.sends.has(config.send))
    compile.findings.push(foreign([...at, "send"], "the send event"));

  const armOn = config.armOn ?? [];
  const events = armOn.filter(Predicate.isString);

  for (const event of events.filter((e) => !compile.events.has(e)))
    compile.findings.push(
      unknownEvent([...at, "armOn"], event, "List only events the definition declares."),
    );

  const delay = config.schedule;

  return {
    name,
    send: config.send.ending.event,
    delay: Predicate.isFunction(delay)
      ? Delay.Computed({ ms: { slot: slotOf([...at, "schedule"]), run: delay } })
      : Delay.Fixed({ ms: fixedDelay(compile, delay, at) }),
    armOn: events,
    onEntry: armOn.length === 0 || events.length < armOn.length,
  };
};

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
  children: ReadonlyArray<TreeNode>,
  here: string,
  at: Path,
) => {
  const token = compile.tokens.get(given);

  if (token === undefined) {
    compile.findings.push(foreign(at, "the default"));

    return Option.none<string>();
  }

  if (!children.some((c) => c.path === token)) {
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

const childrenOf = (compile: Compile, node: Option.Option<TreeNode>) =>
  Option.match(node, {
    onNone: () => [...compile.nodes.values()].filter((n) => Option.isNone(n.parent)),
    onSome: (n) =>
      n.children.flatMap((c) => Option.toArray(Option.fromUndefinedOr(compile.nodes.get(c)))),
  });

type Compiled = {
  readonly root: Level;
  readonly initial: string;
  readonly nodes: ReadonlyArray<Node>;
};

// The children's bodies, their names checked against the tree, compiled depth first.
const childNodes = (
  compile: Compile,
  children: ReadonlyArray<TreeNode>,
  here: string,
  at: Path,
  states: Readonly<Partial<Record<string, AnyBody>>>,
) => {
  for (const key of Object.keys(states).filter((k) => !children.some((c) => c.name === k)))
    compile.findings.push(
      invalid(
        [...at, "states", key],
        "UnknownState",
        `${nameOf(here)} has no child ${key}`,
        "Write bodies only for the definition's states.",
      ),
    );

  return children.flatMap(
    (child) =>
      nodesOf(compile, states[child.name] ?? {}, Option.some(child), [...at, "states", child.name])
        .nodes,
  );
};

// A compound's default, or the refusal of a missing one; a leaf declares none.
const chosenOf = (
  compile: Compile,
  body: AnyBody,
  children: ReadonlyArray<TreeNode>,
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

// RETURN_TYPE: recursive: a body's nodes and its children's, depth first, with its handlers.
export const nodesOf = (
  compile: Compile,
  body: AnyBody,
  node: Option.Option<TreeNode>,
  at: Path,
): Compiled => {
  const children = childrenOf(compile, node);
  const here = Option.match(node, { onNone: () => "", onSome: (n) => n.path });
  const isLeaf = Option.isSome(node) && children.length === 0;

  if (isLeaf && body.default !== undefined)
    compile.findings.push(leafHasChildren(here, [...at, "default"]));

  const chosen = isLeaf
    ? Option.none<string>()
    : chosenOf(compile, body, children, here, [...at, "default"]);

  const level = levelOf(compile, body.on ?? {}, at);

  const schedules = Object.entries(body.schedules ?? {}).map(([name, s]) =>
    scheduleOf(compile, name, s, [...at, "schedules", name]),
  );

  if (isLeaf && body.states !== undefined)
    compile.findings.push(leafHasChildren(here, [...at, "states"]));

  const below = childNodes(compile, children, here, at, isLeaf ? {} : (body.states ?? {}));
  const fallback = Option.fromUndefinedOr(children[0]?.path);
  const initial = Option.orElse(chosen, () => fallback);

  const self = Option.map(node, (n) => ({
    path: n.path,
    parent: n.parent,
    children: n.children,
    default: isLeaf ? Option.none() : initial,
    on: level,
    schedules,
  }));

  return {
    root: level,
    initial: Option.getOrElse(initial, () => ""),
    nodes: [...Option.toArray(self), ...below],
  };
};

export const tokenMaps = (definition: AnyDefinition, nodes: ReadonlyArray<TreeNode>) => {
  // FLOW_STATE_ALLOW_UNKNOWN: an authored or compiled value, checked here before it is trusted.
  const tokens = new Map<unknown, string>();
  // FLOW_STATE_ALLOW_UNKNOWN: an authored or compiled value, checked here before it is trusted.
  const histories = new Map<unknown, string>();

  for (const node of nodes) {
    // FLOW_STATE_ALLOW_UNKNOWN: an authored or compiled value, checked here before it is trusted.
    let at: unknown = definition.S;

    for (const segment of node.path.split("."))
      at = Predicate.hasProperty(at, segment) ? at[segment] : undefined;

    tokens.set(at, node.path);

    if (node.children.length > 0 && Predicate.hasProperty(at, "history"))
      histories.set(at.history, node.path);
  }

  return { tokens, histories };
};
