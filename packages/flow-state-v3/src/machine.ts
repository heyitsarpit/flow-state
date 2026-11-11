import { Duration, Option, Predicate, Schema } from "effect";
import {
  type Alternative,
  Delay,
  type Denial,
  Guard,
  type GuardInput,
  type Level,
  type Mapping,
  type Node,
  Operation,
  type Schedule,
  type UpdateInput,
  type Values,
} from "./core/compiled.ts";
import type { Bound, Ending } from "./contract.ts";
import {
  type AlternativeConfig,
  type AnyDefinition,
  codecOf,
  type Definition,
  erase,
  type EventFields,
  fieldsOf,
  type GuardElement,
  type GuardToken,
  type Machine,
  type MemoryConfig,
  type MemoryOf,
  type On,
  type ScheduleConfig,
  type StateConfig,
  type StateToken,
} from "./definition.ts";
import { FlowError } from "./error.ts";

type DefinitionParts<D> =
  D extends Definition<infer States, infer Ev, infer In, infer M, infer _O>
    ? { readonly S: States[number]; readonly Events: Ev & In; readonly Memory: MemoryOf<M> }
    : never;

type MachineBody<D extends AnyDefinition> = {
  readonly default: StateToken<DefinitionParts<D>["S"]>;
  readonly on?: On<
    DefinitionParts<D>["Memory"],
    DefinitionParts<D>["Events"],
    DefinitionParts<D>["S"]
  >;
  readonly states?: {
    readonly [K in DefinitionParts<D>["S"]]?: StateConfig<
      DefinitionParts<D>["Memory"],
      DefinitionParts<D>["Events"],
      DefinitionParts<D>["S"]
    >;
  };
};

type AnyAlternative = AlternativeConfig<Values, Values, string> | StateToken;

// RETURN_TYPE: a type guard over handler elements.
const isToken = (x: AnyAlternative | GuardElement<Values, Values>): x is StateToken =>
  Predicate.hasProperty(x, "~flow") && x["~flow"] === "state";

// RETURN_TYPE: a type guard over guard elements.
const isGuardToken = (x: GuardElement<Values, Values>): x is GuardToken =>
  Predicate.hasProperty(x, "~flow") && x["~flow"] === "guard";

const guardOf = (element: GuardElement<Values, Values>, at: string) => {
  if (isToken(element)) return Guard.InState({ states: [element.node] });

  if (isGuardToken(element)) return element.make(at);

  return Guard.Check({ check: { slot: at, run: erase<GuardInput, true | Denial>(element) } });
};

// RETURN_TYPE: the Compiled Alternative shape.
const alternativeOf = (
  raw: AnyAlternative,
  at: string,
  states: ReadonlySet<string>,
  problems: Array<string>,
): Alternative => {
  const config: AlternativeConfig<Values, Values, string> = isToken(raw) ? { target: raw } : raw;
  const guards = config.guard === undefined ? [] : [config.guard].flat();

  const target =
    config.target === undefined || config.target === "self"
      ? Option.none<string>()
      : Option.some(config.target.node);

  if (Option.isSome(target) && !states.has(target.value))
    problems.push(`${at}.target: no state ${target.value}`);

  return {
    at,
    target,
    guards: guards.map((g, i) => guardOf(g, `${at}.guard[${i}]`)),
    update: Option.map(Option.fromUndefinedOr(config.updateMemory), (run) => ({
      slot: `${at}.updateMemory`,
      run: erase<UpdateInput, Values>(run),
    })),
    actions: (config.actions ?? []).map((a, i) => a.make(`${at}.actions[${i}]`)),
  };
};

// RETURN_TYPE: the Compiled Level shape.
const levelOf = (
  on: Values,
  prefix: string,
  context: {
    readonly states: ReadonlySet<string>;
    readonly events: ReadonlySet<string>;
    readonly problems: Array<string>;
  },
): Level =>
  new Map(
    Object.entries(on).flatMap(([event, handler]) => {
      if (handler === undefined) return [];

      if (!context.events.has(event))
        context.problems.push(`${prefix}on.${event}: no event ${event}`);

      // SAFETY: an On record's values are handlers: one alternative, a state token, or a list of them.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the On record's per-event handler types are erased here
      const list = (Array.isArray(handler) ? handler : [handler]) as ReadonlyArray<AnyAlternative>;

      return [
        [
          event,
          list.map((raw, i) =>
            alternativeOf(raw, `${prefix}on.${event}[${i}]`, context.states, context.problems),
          ),
        ],
      ];
    }),
  );

// RETURN_TYPE: the Compiled Schedule shape.
const scheduleOf = (name: string, config: ScheduleConfig<Values, Values>, at: string): Schedule => {
  const armOn = config.armOn ?? [];
  const events = armOn.filter(Predicate.isString);
  const delay = config.schedule;

  return {
    name,
    send: config.send.ending.event,
    delay: Predicate.isFunction(delay)
      ? Delay.Computed({ ms: { slot: `${at}.schedule`, run: delay } })
      : Delay.Fixed({ ms: Duration.toMillis(delay) }),
    armOn: events,
    onEntry: armOn.length === 0 || events.length < armOn.length,
  };
};

// FLOW_STATE_ALLOW_UNKNOWN: an ending's value is the commit's or lookup's own; the mapper is written for it.
const endingValue = (value: unknown) =>
  // SAFETY: the runtime passes each mapper the ending value of the operation it is declared on.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, lint-bomb/no-escape-hatch-assertion -- an ending's value type is erased in Compiled and restored at its mapper
  value as never;

// RETURN_TYPE: the Compiled Mapping shape.
const mappingOf = (ending: Ending, slot: string): Mapping => ({
  event: ending.ending.event,
  from: Option.map(ending.ending.from, (map) => ({
    slot,
    // SAFETY: the mapper is written for this ending's value, which the runtime passes unchanged.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an ending's value type is erased in Compiled
    // FLOW_STATE_ALLOW_UNKNOWN: an ending's value is the call's own; its mapper is written for it.
    run: (value: unknown) => map(endingValue(value), {}),
  })),
});

const operationOf = (name: string, bound: Bound) => {
  const failure = new Map(
    Object.entries(bound.failure).map(([tag, ending]) => [
      tag,
      mappingOf(ending, `operations.${name}.failure.${tag}`),
    ]),
  );

  const shared = {
    name,
    contract: bound.contract,
    keyFields: bound.key,
    key: bound.keyText,
    input: bound.input,
    inputJson: bound.inputJson,
    call: { slot: `operations.${name}.call`, run: bound.call },
    success: mappingOf(bound.success, `operations.${name}.success`),
    failure,
  };

  return Option.match(bound.unknown, {
    onNone: () => Operation.Read(shared),
    onSome: (unknown) =>
      Operation.Write({
        ...shared,
        concurrency: bound.concurrency,
        unknown: mappingOf(unknown, `operations.${name}.unknown`),
      }),
  });
};

const memoryOf = (memory: MemoryConfig) => ({
  schema: codecOf<Values>(
    Schema.Struct(Object.fromEntries(Object.entries(memory).map(([k, f]) => [k, f.schema]))),
  ),
  initial: Object.fromEntries(Object.entries(memory).map(([k, f]) => [k, f.value])),
});

const eventsOf = (events: Readonly<Record<string, EventFields>>) =>
  new Map(
    Object.entries(events).map(([tag, fields]) => [
      tag,
      codecOf<Values>(Schema.Struct(fieldsOf(fields))),
    ]),
  );

type ErasedBody = {
  readonly default: StateToken;
  readonly on?: Values;
  readonly states?: Readonly<Record<string, StateConfig<Values, Values, string> | undefined>>;
};

const erasedBody = <B>(body: B) =>
  // SAFETY: MachineBody's handler records are On records over the definition's own events.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the definition's event and memory types are erased in Compiled
  body as ErasedBody;

/**
 * Compiles a definition and its handlers into a Machine (Machines O1, Runtime O1).
 *
 * **When to use**
 *
 * In a `*.machine.ts` file. The body runs exactly once with `{ S, E, O }` and returns static
 * configuration: the default state, the root's handlers and each state's handlers and schedules.
 *
 * **Gotchas**
 *
 * - An invalid body throws one {@link FlowError} listing every violation found.
 */
// RETURN_TYPE: the exported Machine keeps the definition's literal types.
export const machine = <D extends AnyDefinition>(
  definition: D,
  body: (tokens: { readonly S: D["S"]; readonly E: D["E"]; readonly O: D["O"] }) => MachineBody<D>,
): Machine<D> => {
  const config = body({ S: definition.S, E: definition.E, O: definition.O });
  const problems: Array<string> = [];
  const allEvents = { ...definition.events, ...definition.internalEvents };

  const context = {
    states: new Set<string>(definition.states),
    events: new Set(Object.keys(allEvents)),
    problems,
  };

  const erased = erasedBody(config);

  const states = new Map<string, Node>(
    definition.states.map((name) => {
      const state = erased.states?.[name];
      const prefix = `states.${name}.`;

      return [
        name,
        {
          on: levelOf(state?.on ?? {}, prefix, context),
          schedules: Object.entries(state?.schedules ?? {}).map(([schedule, s]) =>
            scheduleOf(schedule, s, `${prefix}schedules.${schedule}`),
          ),
        },
      ];
    }),
  );

  const root = levelOf(erased.on ?? {}, "", context);

  // Stated limit: this build runs only the reject policy; another is refused, never run as reject.
  for (const [name, bound] of Object.entries(definition.operations))
    if (bound.kind === "write" && bound.concurrency !== "reject")
      problems.push(
        `operations.${name}.concurrency: "${bound.concurrency}" is not built yet (T18)`,
      );

  if (problems.length > 0)
    // oxlint-disable-next-line lint-bomb/no-throw-in-core -- an invalid machine throws one FlowError before any work (Compile R2)
    throw new FlowError({ code: "InvalidMachine", problems });

  const memory = memoryOf(definition.memory);

  return {
    definition,
    compiled: {
      id: definition.id,
      persist: definition.persist,
      initial: erased.default.node,
      states,
      root,
      external: eventsOf(definition.events),
      memory: memory.schema,
      memoryJson: codecOf<Values>(Schema.toCodecJson(memory.schema)),
      sameMemory: Schema.toEquivalence(memory.schema),
      initialMemory: memory.initial,
      operations: new Map(
        Object.entries(definition.operations).map(([name, bound]) => [
          name,
          operationOf(name, bound),
        ]),
      ),
    },
  };
};
