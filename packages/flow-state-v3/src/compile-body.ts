import { Data, Duration, Option, Predicate } from "effect";
import {
  type Alternative,
  Delay,
  type Denial,
  Guard,
  type GuardInput,
  type Level,
  type Node,
  type Schedule,
  Target,
  type UpdateInput,
  type Values,
} from "./core/compiled.ts";
import type {
  ActionToken,
  AlternativeConfig,
  AnyDefinition,
  GuardElement,
  GuardToken,
  HistoryToken,
  ScheduleConfig,
  StateToken,
} from "./definition.ts";
import { checkName, type TreeNode } from "./construction.ts";
import { erase } from "./handles.ts";
import type { Finding } from "./error.ts";
import type { AnyBody } from "./machine.ts";

type AnyAlternative = AlternativeConfig<Values, Values, string> | StateToken | HistoryToken;

// RETURN_TYPE: a type guard states the type it narrows to.
const isState = (x: unknown): x is StateToken =>
  Predicate.hasProperty(x, "~flow") && x["~flow"] === "state";

// RETURN_TYPE: a type guard states the type it narrows to.
const isHistory = (x: unknown): x is HistoryToken =>
  Predicate.hasProperty(x, "~flow") && x["~flow"] === "history";

// RETURN_TYPE: a type guard states the type it narrows to.
const isGuardToken = (x: unknown): x is GuardToken =>
  Predicate.hasProperty(x, "~flow") && x["~flow"] === "guard";

// RETURN_TYPE: a type guard states the type it narrows to.
const isActionToken = (x: unknown): x is ActionToken =>
  Predicate.hasProperty(x, "~flow") && x["~flow"] === "action";

// RETURN_TYPE: the Compiled shape this part builds.
const invalid = (
  path: ReadonlyArray<string | number>,
  reason: string,
  summary: string,
  help: string,
): Finding => ({ code: "InvalidConfiguration", path, details: { reason }, summary, help });

const pathOf = (at: string) => at.split(/\.|\[|\]/u).filter((s) => s.length > 0);

/**
 * The largest delay a timer can hold: 2^31 - 1 ms.
 */
export const MAX_DELAY_MS = 2_147_483_647;

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

const foreign = (at: string, what: string) =>
  invalid(
    pathOf(at),
    "ForeignToken",
    `${what} is not this definition's`,
    "Use the tokens the machine body receives: S, E and O of this definition.",
  );

// RETURN_TYPE: the Compiled shape this part builds.
const guardOf = (compile: Compile, element: GuardElement<Values, Values>, at: string): Guard => {
  if (isState(element)) {
    const path = compile.tokens.get(element);

    if (path === undefined) compile.findings.push(foreign(at, "a guard's state token"));

    return Guard.InState({ state: path ?? element["~path"] });
  }

  if (isGuardToken(element)) {
    if (!Object.hasOwn(compile.definition.operations, element.operation))
      compile.findings.push(foreign(at, `the operation ${element.operation}`));

    return element.make(at);
  }

  return Guard.Check({ check: { slot: at, run: erase<GuardInput, true | Denial>(element) } });
};

// RETURN_TYPE: the Compiled shape this part builds.
const targetOf = (
  compile: Compile,
  given: Option.Option<StateToken | HistoryToken | "self">,
  at: string,
): Option.Option<Target> => {
  if (Option.isNone(given) || given.value === "self") return Option.none();

  const raw = given.value;

  const state = compile.tokens.get(raw);

  if (state !== undefined) return Option.some(Target.State({ path: state }));

  const history = compile.histories.get(raw);

  if (history !== undefined) return Option.some(Target.History({ path: history }));

  compile.findings.push(foreign(`${at}.target`, "the target"));

  return Option.none();
};

// RETURN_TYPE: the Compiled shape this part builds.
const alternativeOf = (compile: Compile, raw: AnyAlternative, at: string): Alternative => {
  const config: AlternativeConfig<Values, Values, string> =
    isState(raw) || isHistory(raw) ? { target: raw } : raw;

  const guards = config.guard === undefined ? [] : [config.guard].flat();

  const actions = (config.actions ?? []).flatMap((a, i) => {
    const place = `${at}.actions[${i}]`;

    if (!isActionToken(a) || !Object.hasOwn(compile.definition.operations, a.operation)) {
      compile.findings.push(foreign(place, "an action"));

      return [];
    }

    return [a.make(place)];
  });

  return {
    at,
    target: targetOf(compile, Option.fromUndefinedOr(config.target), at),
    guards: guards.map((g, i) => guardOf(compile, g, `${at}.guard[${i}]`)),
    update: Option.map(Option.fromUndefinedOr(config.updateMemory), (run) => ({
      slot: `${at}.updateMemory`,
      run: erase<UpdateInput, Values>(run),
    })),
    actions,
  };
};

// RETURN_TYPE: the Compiled shape this part builds.
const levelOf = (compile: Compile, on: Values, prefix: string): Level =>
  new Map(
    Object.entries(on).flatMap(([event, handler]) => {
      if (handler === undefined) return [];

      if (!compile.events.has(event)) {
        compile.findings.push(
          invalid(
            pathOf(`${prefix}on.${event}`),
            "UnknownEvent",
            `no event ${event}`,
            "Handle only events the definition declares.",
          ),
        );

        return [];
      }

      // SAFETY: an On record's values are handlers: one alternative, a state token, or a list of them.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the On record's per-event handler types are erased here
      const list = (Array.isArray(handler) ? handler : [handler]) as ReadonlyArray<AnyAlternative>;

      return [
        [event, list.map((raw, i) => alternativeOf(compile, raw, `${prefix}on.${event}[${i}]`))],
      ];
    }),
  );

const fixedDelay = (compile: Compile, delay: Duration.Input, at: string) => {
  // A number is read as written: Duration clamps a negative one and keeps Infinity.
  const ms = Predicate.isNumber(delay)
    ? delay
    : Option.getOrElse(Option.map(Duration.fromInput(delay), Duration.toMillis), () => Number.NaN);

  if (!Number.isFinite(ms) || ms < 0 || ms > MAX_DELAY_MS)
    compile.findings.push(
      invalid(
        pathOf(`${at}.schedule`),
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
  at: string,
): Schedule => {
  compile.findings.push(...checkName(name, pathOf(at)));

  const first = compile.scheduleNames.get(name);

  if (first !== undefined)
    compile.findings.push(
      invalid(
        pathOf(at),
        "DuplicateName",
        `two schedules are named ${name}`,
        "Give every schedule of a machine its own name.",
      ),
    );
  else compile.scheduleNames.set(name, at);

  if (!compile.sends.has(config.send))
    compile.findings.push(foreign(`${at}.send`, "the send event"));

  const armOn = config.armOn ?? [];
  const events = armOn.filter(Predicate.isString);

  for (const event of events)
    if (!compile.events.has(event))
      compile.findings.push(
        invalid(
          pathOf(`${at}.armOn`),
          "UnknownEvent",
          `no event ${event}`,
          "List only events the definition declares.",
        ),
      );

  const delay = config.schedule;

  return {
    name,
    send: config.send.ending.event,
    delay: Predicate.isFunction(delay)
      ? Delay.Computed({ ms: { slot: `${at}.schedule`, run: delay } })
      : Delay.Fixed({ ms: fixedDelay(compile, delay, at) }),
    armOn: events,
    onEntry: armOn.length === 0 || events.length < armOn.length,
  };
};

const nameOf = (here: string) => (here === "" ? "the root" : here);

const leafHasChildren = (here: string, at: string) =>
  invalid(
    pathOf(at),
    "LeafHasChildren",
    `the leaf ${here} declares a default or states`,
    "Give a leaf only on and schedules.",
  );

const unknownField = (key: string, prefix: string) =>
  invalid(
    pathOf(`${prefix}${key}`),
    "UnknownField",
    `a state body has no field ${key}`,
    "Write on, schedules, and for a compound default and states.",
  );

// A compound's default child, checked to be a direct child token of this definition.
const defaultOf = (
  compile: Compile,
  // FLOW_STATE_ALLOW_UNKNOWN: an authored value, checked here before it is trusted.
  raw: unknown,
  children: ReadonlyArray<TreeNode>,
  here: string,
  prefix: string,
) => {
  const token = compile.tokens.get(raw);

  if (token === undefined) {
    compile.findings.push(foreign(`${prefix}default`, "the default"));

    return Option.none<string>();
  }

  if (!children.some((c) => c.path === token)) {
    compile.findings.push(
      invalid(
        pathOf(`${prefix}default`),
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

type Walk = {
  readonly compile: Compile;
  readonly children: ReadonlyArray<TreeNode>;
  readonly here: string;
  readonly prefix: string;
  readonly top: boolean;
  readonly isLeaf: boolean;
};

// The children's bodies, their names checked against the tree, compiled depth first.
const childNodes = (walk: Walk, states: Readonly<Partial<Record<string, AnyBody>>>) => {
  for (const key of Object.keys(states))
    if (!walk.children.some((c) => c.name === key))
      walk.compile.findings.push(
        invalid(
          pathOf(`${walk.prefix}states.${key}`),
          "UnknownState",
          `${nameOf(walk.here)} has no child ${key}`,
          "Write bodies only for the definition's states.",
        ),
      );

  return walk.children.flatMap(
    (child) =>
      nodesOf(
        walk.compile,
        states[child.name] ?? {},
        Option.some(child),
        `${walk.prefix}states.${child.name}.`,
      ).nodes,
  );
};

type Part = Data.TaggedEnum<{
  Default: { value: Option.Option<string> };
  On: { value: Level };
  Schedules: { value: ReadonlyArray<Schedule> };
  States: { value: ReadonlyArray<Node> };
  Refused: {};
}>;

const Part = Data.taggedEnum<Part>();

const refuse = (walk: Walk, finding: Finding) => {
  walk.compile.findings.push(finding);

  return Part.Refused();
};

// Each body field's compile; a field a node may not have is refused with its finding.
const FIELDS = {
  default: (walk, body) =>
    walk.isLeaf
      ? refuse(walk, leafHasChildren(walk.here, `${walk.prefix}default`))
      : Part.Default({
          value: defaultOf(walk.compile, body.default, walk.children, walk.here, walk.prefix),
        }),
  on: (walk, body) => Part.On({ value: levelOf(walk.compile, body.on ?? {}, walk.prefix) }),
  schedules: (walk, body) =>
    walk.top
      ? refuse(walk, unknownField("schedules", walk.prefix))
      : Part.Schedules({
          value: Object.entries(body.schedules ?? {}).map(([name, s]) =>
            scheduleOf(walk.compile, name, s, `${walk.prefix}schedules.${name}`),
          ),
        }),
  states: (walk, body) =>
    walk.isLeaf
      ? refuse(walk, leafHasChildren(walk.here, `${walk.prefix}states`))
      : Part.States({ value: childNodes(walk, body.states ?? {}) }),
} satisfies Readonly<Record<string, (walk: Walk, body: AnyBody) => Part>>;

// RETURN_TYPE: a type guard states the type it narrows to.
const isField = (key: string): key is keyof typeof FIELDS => Object.hasOwn(FIELDS, key);

const partOf = (walk: Walk, body: AnyBody, key: string) =>
  isField(key) ? FIELDS[key](walk, body) : refuse(walk, unknownField(key, walk.prefix));

// RETURN_TYPE: recursive: a body's nodes and its children's, depth first, with its handlers.
export const nodesOf = (
  compile: Compile,
  body: AnyBody,
  node: Option.Option<TreeNode>,
  prefix: string,
): Compiled => {
  const children = childrenOf(compile, node);
  const here = Option.match(node, { onNone: () => "", onSome: (n) => n.path });
  const isLeaf = Option.isSome(node) && children.length === 0;
  const walk: Walk = { compile, children, here, prefix, top: Option.isNone(node), isLeaf };

  if (!isLeaf && body.default === undefined)
    compile.findings.push(
      invalid(
        pathOf(`${prefix}default`),
        "MissingDefault",
        `${nameOf(here)} has no default`,
        "Name a direct child as default.",
      ),
    );

  const parts = Object.keys(body).map((key) => partOf(walk, body, key));
  const pick = <T extends Part["_tag"]>(tag: T) => parts.find(Part.$is(tag));
  const chosen = Option.flatMap(Option.fromUndefinedOr(pick("Default")), (p) => p.value);
  const level = pick("On")?.value ?? new Map();
  const schedules = pick("Schedules")?.value ?? [];
  const nodes = Option.map(Option.fromUndefinedOr(pick("States")), (p) => p.value);

  const below = Option.getOrElse(nodes, () => childNodes(walk, {}));
  const fallback = Option.fromUndefinedOr(children[0]?.path);

  const self = Option.map(node, (n) => ({
    path: n.path,
    parent: n.parent,
    children: n.children,
    default: isLeaf ? Option.none() : Option.orElse(chosen, () => fallback),
    on: level,
    schedules,
  }));

  return {
    root: level,
    initial: Option.getOrElse(
      Option.orElse(chosen, () => fallback),
      () => "",
    ),
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
