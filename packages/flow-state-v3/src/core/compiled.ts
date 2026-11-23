import {
  type Context,
  Data,
  Duration,
  type Effect,
  Option,
  Predicate,
  Result,
  Schedule as EffectSchedule,
  type Schema,
} from "effect";
import type { Walker } from "./boundary.ts";
import type { AttemptId } from "./world.ts";

/**
 * The key under which a value Flow made keeps what the core calls, off its public face: a
 * registered symbol, so a second loaded copy of Flow reads the first copy's values.
 */
export const InternalsId: unique symbol = Symbol.for("flow-state/Internals");

/**
 * A user closure named by its place in the definition (`operations.pay.failure.CardDeclined`), so
 * tools read the name and only the runtime calls the function.
 */
export type Slot<F> = { readonly slot: string; readonly run: F };

/**
 * Calls a slot's closure, the one boundary a user callback crosses: what it returns, or its slot's
 * name when it throws.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a slot's closure takes and returns the application's own values.
export const callSlot = <A extends ReadonlyArray<unknown>, R>(
  slot: Slot<(...args: A) => R>,
  ...args: A
) => Result.try({ try: () => slot.run(...args), catch: () => slot.slot });

/**
 * A memory or payload value as the core holds it: a decoded record of the definition's fields.
 */
// FLOW_STATE_ALLOW_UNKNOWN: field values are the application's, typed only at the definition; the core passes them through.
export type Values = Readonly<Record<string, unknown>>;

/**
 * A guard's refusal: a literal code (`deny`).
 */
export type Denial = { readonly _tag: "Flow/Denial"; readonly code: string };

/**
 * What one guard element reads: the pre-turn state, memory, context and event.
 */
export type GuardInput = {
  readonly state: string;
  readonly memory: Values;
  readonly context: Values;
  readonly event: Values;
};

/**
 * One element of a guard array.
 */
export type Guard = Data.TaggedEnum<{
  InState: { state: string };
  Check: { check: Slot<(input: GuardInput) => true | Denial> };
  Idle: { operation: string; key: Slot<(input: GuardInput) => Values> };
  Retryable: {
    operation: string;
    key: Option.Option<Slot<(input: GuardInput) => Values>>;
    times: number;
  };
}>;

/**
 * Constructors and matchers for {@link Guard}.
 */
export const Guard = Data.taggedEnum<Guard>();

/**
 * What an action's select reads: the turn's after memory and its event.
 */
export type SelectInput = { readonly memory: Values; readonly event: Values };

/**
 * One action of an alternative, in written order: a lane member, a lookup, or a send of a public
 * event to another actor, whose ref and event are computed when the turn runs.
 */
export type Action = Data.TaggedEnum<{
  // `optimistic`: the commit's values on reads, from the starting turn's after memory and event.
  Commit: {
    operation: string;
    select: Slot<(input: SelectInput) => Values>;
    optimistic: Option.Option<Slot<(input: SelectInput) => ReadonlyArray<ReadWrite>>>;
  };
  Retry: {
    operation: string;
    key: Option.Option<Slot<(input: SelectInput) => Values>>;
  };
  Cancel: {
    operation: string;
    key: Option.Option<Slot<(input: SelectInput) => Values>>;
  };
  Lookup: { operation: string; select: Slot<(input: SelectInput) => Values> };
  // A read's slot asked again, and the entries a partial key names made stale or emptied.
  Refetch: { operation: string };
  Invalidate: { operation: string; key: Slot<(input: SelectInput) => Values> };
  Clear: { operation: string; key: Slot<(input: SelectInput) => Values> };
  // FLOW_STATE_ALLOW_UNKNOWN: a send's ref and event are the application's, checked when the turn resolves them.
  Send: { to: Slot<(input: SelectInput) => unknown>; event: Slot<(input: SelectInput) => unknown> };
}>;

/**
 * Constructors and matchers for {@link Action}.
 */
export const Action = Data.taggedEnum<Action>();

/**
 * What an `updateMemory` reads: the pre-turn memory and context, the event and the turn's time.
 */
export type UpdateInput = {
  readonly memory: Values;
  readonly context: Values;
  readonly event: Values;
  readonly now: number;
};

/**
 * Where an alternative goes: a state (a compound enters its default leaf), or a compound's history
 * (its last active child, through that child's defaults, else its default leaf).
 */
export type Target = Data.TaggedEnum<{
  State: { path: string };
  History: { path: string };
}>;

/**
 * Constructors and matchers for {@link Target}.
 */
export const Target = Data.taggedEnum<Target>();

/**
 * One alternative of a handler: its place, its target, its guards, its memory patch and its
 * actions.
 */
export type Alternative = {
  readonly at: string;
  readonly target: Option.Option<Target>;
  readonly guards: ReadonlyArray<Guard>;
  readonly update: Option.Option<Slot<(input: UpdateInput) => Values>>;
  readonly actions: ReadonlyArray<Action>;
};

/**
 * One level's handlers: each event's alternatives in selection order.
 */
export type Level = ReadonlyMap<string, ReadonlyArray<Alternative>>;

/**
 * An Effect Schedule a schedule steps: the host steps it, the core holds it as a value.
 */
// FLOW_STATE_ALLOW_UNKNOWN: any Effect Schedule, whatever its output; only its delays are read.
export type Series = EffectSchedule.Schedule<unknown>;

/**
 * One step of an Effect Schedule, as the host takes it: step `attempt` (1 gives the first delay)
 * of the series `id`, armed at `armedAt`, taken at `now`. It gives the step's delay in
 * milliseconds and its output, or none once the series is complete.
 */
export type StepSchedule = (request: {
  readonly id: string;
  readonly series: Series;
  readonly attempt: number;
  readonly armedAt: number;
  readonly now: number;
}) => Option.Option<{
  readonly ms: number;
  // FLOW_STATE_ALLOW_UNKNOWN: an Effect Schedule step's output, whatever its type.
  readonly output: unknown;
}>;

/**
 * What a schedule's functions read: its key (a keyed schedule's), the after memory, the context,
 * the lanes' rows and the turn's time.
 */
export type ScheduleInput = {
  // oxlint-disable-next-line lint-bomb/no-optional-domain-properties -- the user callback's `key?`: absent for an unkeyed schedule, as the Plan's API gives it
  readonly key: Values | undefined;
  readonly memory: Values;
  readonly context: Values;
  // FLOW_STATE_ALLOW_UNKNOWN: the lanes' rows, typed by the definition where the callback reads them.
  readonly operations: ReadonlyMap<string, ReadonlyMap<string, unknown>>;
  readonly now: number;
};

/**
 * A delay as a schedule computes it: milliseconds, or an Effect Schedule the host steps.
 */
export type Planned = Data.TaggedEnum<{
  Ms: { ms: number };
  Stepped: { series: Series };
}>;

/**
 * Constructors and matchers for {@link Planned}.
 */
export const Planned = Data.taggedEnum<Planned>();

/**
 * Whether a delay is an Effect Schedule, as the core steps it: the types admit only Schedules with
 * no error and no services, and the host passes no input.
 */
// RETURN_TYPE: a type guard states the Schedule type it narrows to.
export const isSeries = (
  // FLOW_STATE_ALLOW_UNKNOWN: a delay of any form, told apart here.
  value: unknown,
): value is Series => EffectSchedule.isSchedule(value);

// A computed delay that is no Schedule and no number, as the Duration input its types promise; one
// that is not decodes to no Duration and refuses its turn.
const durationOf = (
  // FLOW_STATE_ALLOW_UNKNOWN: whatever a computed schedule returned.
  value: unknown,
) =>
  // SAFETY: Duration.fromInput returns none for any value that is no Duration input.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- fromInput checks the value itself
  value as Duration.Input;

/**
 * A computed delay as the core plans it: an Effect Schedule to step, or a Duration input in
 * milliseconds (a number as written; NaN when it is neither, which refuses its turn).
 */
export const plannedOf = (
  // FLOW_STATE_ALLOW_UNKNOWN: whatever a computed schedule returned, checked here.
  value: unknown,
) => {
  if (isSeries(value)) return Planned.Stepped({ series: value });

  if (Predicate.isNumber(value)) return Planned.Ms({ ms: value });

  return Planned.Ms({
    ms: Option.getOrElse(
      Option.map(Duration.fromInput(durationOf(value)), Duration.toMillis),
      () => Number.NaN,
    ),
  });
};

/**
 * When a schedule fires after its arming: a fixed delay, an Effect Schedule, or either computed
 * from the after memory, the key, the context and the arming turn's now.
 */
export type Delay = Data.TaggedEnum<{
  Fixed: { planned: Planned };
  Computed: { plan: Slot<(input: ScheduleInput) => Planned> };
}>;

/**
 * Constructors and matchers for {@link Delay}.
 */
export const Delay = Data.taggedEnum<Delay>();

/**
 * What a schedule's send maps from: the firing's metadata.
 */
export type FiringMetadata = {
  readonly attempt: number;
  readonly armedAt: number;
  readonly dueAt: number;
  readonly firedAt: number;
  // FLOW_STATE_ALLOW_UNKNOWN: an Effect Schedule's output, whatever its type; a Duration has none.
  readonly output: unknown;
  // oxlint-disable-next-line lint-bomb/no-optional-domain-properties -- the send mapper's `key`: absent for an unkeyed schedule, as the Plan's metadata gives it
  readonly key: Values | undefined;
};

/**
 * One schedule a state declares: its delay, the event it sends (mapped from the firing's metadata
 * when the send is `E.X.from`), the events that arm and disarm it, whether its entry arms it, its
 * restart selection, its keys and its pause reasons in declaration order.
 */
export type Schedule = {
  readonly name: string;
  // The slot its delay is named by (`states.ON.schedules.tick.schedule`).
  readonly slot: string;
  readonly send: string;
  readonly from: Option.Option<Slot<(metadata: FiringMetadata) => Values>>;
  readonly delay: Delay;
  readonly armOn: ReadonlyArray<string>;
  readonly disarmOn: ReadonlyArray<string>;
  readonly onEntry: boolean;
  // FLOW_STATE_ALLOW_UNKNOWN: a restart selection of any type, compared by Equal.equals.
  readonly restartOn: Option.Option<Slot<(input: ScheduleInput) => unknown>>;
  readonly keys: Option.Option<Slot<(input: ScheduleInput) => ReadonlyArray<Values>>>;
  readonly paused: ReadonlyArray<{
    readonly reason: string;
    readonly check: Slot<(input: ScheduleInput) => boolean>;
  }>;
};

/**
 * A declared schedule's codecs and reasons: its key's codec to canonical text when it is keyed, its
 * `restartOn` selection's codec when it declares one, and its pause reasons in declaration order.
 */
export type ScheduleCodecs = {
  readonly key: Option.Option<Schema.Codec<Values, string>>;
  // FLOW_STATE_ALLOW_UNKNOWN: a selection is of any declared type.
  readonly selection: Option.Option<Schema.Codec<unknown, string>>;
  readonly reasons: ReadonlyArray<string>;
};

/**
 * One state of the tree, by its path (`ON.PLAYING`): its parent, its children in declaration
 * order, its default child (compounds only), its handlers and its schedules; and, derived once when
 * the machine is built, the paths from the top level down to it (`chain`), its `depth` (the
 * chain's length) and the `leaf` its defaults reach (itself for a leaf).
 */
export type Node = {
  readonly path: string;
  readonly parent: Option.Option<string>;
  readonly children: ReadonlyArray<string>;
  readonly default: Option.Option<string>;
  readonly on: Level;
  readonly schedules: ReadonlyArray<Schedule>;
  readonly chain: ReadonlyArray<string>;
  readonly depth: number;
  readonly leaf: string;
};

/**
 * Where a memory field starts: the creator's input, a constant, or absence (an optional key, with
 * its Schema's default if it has one).
 */
export type Source = Data.TaggedEnum<{
  Input: {};
  // FLOW_STATE_ALLOW_UNKNOWN: a start has its field's type, typed at the definition.
  Constant: { value: unknown };
  Optional: {};
}>;

/**
 * Constructors and matchers for {@link Source}.
 */
export const Source = Data.taggedEnum<Source>();

/**
 * One memory field: its name, Schema, source and privacy.
 *
 * **Details**
 *
 * `is` checks a value by the Schema's type side and `fallback` is the Schema's own constructor
 * default; both are derived from the Schema.
 */
export type Field = {
  readonly name: string;
  // FLOW_STATE_ALLOW_UNKNOWN: a field's Schema has the application's type, typed at the definition.
  readonly schema: Schema.Codec<unknown, unknown>;
  // FLOW_STATE_ALLOW_UNKNOWN: the field's JSON codec, typed at the definition.
  readonly json: Schema.Codec<unknown, unknown>;
  // FLOW_STATE_ALLOW_UNKNOWN: the field's walkers, built from its JSON codec.
  readonly walk: Walker<unknown, unknown>;
  readonly source: Source;
  readonly private: boolean;
  // FLOW_STATE_ALLOW_UNKNOWN: an input value is checked here before it is trusted.
  readonly is: (value: unknown) => boolean;
  // FLOW_STATE_ALLOW_UNKNOWN: a default has its field's type, typed at the definition.
  readonly fallback: Option.Option<unknown>;
};

/**
 * One event: its payload Schema, whether it is public, and whether it is a `Flow.uncertain` event.
 */
export type EventEntry = {
  readonly payload: Schema.Codec<Values, Values>;
  readonly walk: Walker<Values, Values>;
  readonly names: ReadonlyArray<string>;
  readonly public: boolean;
  readonly uncertain: boolean;
};

/**
 * What an ending's mapper reads beside its value: the row's input and its key fields.
 */
export type EndingContext = { readonly input: Values; readonly key: Values };

/**
 * The context of a mapping that ends no call, such as a context reaction's: no input, no key.
 */
export const NO_CALL: EndingContext = { input: {}, key: {} };

/**
 * Where an ending goes: its event and the mapper that makes the event's payload.
 */
export type Mapping = {
  readonly event: string;
  // FLOW_STATE_ALLOW_UNKNOWN: an ending's value is the commit's or lookup's own type, typed at the contract.
  readonly from: Option.Option<Slot<(value: unknown, context: EndingContext) => Values>>;
};

/**
 * What a commit receives beside its input: the Attempt it runs as, and where it reports how far
 * it got.
 */
export type CommitContext = {
  readonly attempt: Attempt;
  // FLOW_STATE_ALLOW_UNKNOWN: a progress value has the type its contract's progress Schema decodes.
  readonly progress: (value: unknown) => void;
};

/**
 * The Attempt a commit runs as.
 */
export type Attempt<I = Values, K = Values> = {
  readonly id: AttemptId;
  readonly operation: string;
  readonly key: K;
  readonly input: I;
  readonly retryCount: number;
  readonly mayHaveApplied: boolean;
};

/**
 * A commit's function, run by the host with its Attempt.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a contract's value, error and services are typed at the contract; the runtime only runs it.
export type Commit = (
  input: Values,
  context: CommitContext,
) => Effect.Effect<unknown, unknown, unknown>;

/**
 * One change of a read's entry, as `resource.write(key, data)` names it: the read's contract, its
 * key's canonical text (none when the key has no valid form) and the update of its current value.
 */
export type ReadWrite = {
  readonly contract: string;
  readonly keyText: Option.Option<string>;
  // FLOW_STATE_ALLOW_UNKNOWN: an update takes and returns the read's own value, typed at `write`.
  readonly update: (current: unknown) => unknown;
};

/**
 * Whether a callback's value is a list of read changes; anything else is a defect of the callback.
 */
// RETURN_TYPE: a type guard states the type it narrows to.
export const isReadWrites = (value: Values[string]): value is ReadonlyArray<ReadWrite> =>
  Array.isArray(value) &&
  value.every(
    (w) =>
      Predicate.hasProperty(w, "contract") &&
      Predicate.hasProperty(w, "keyText") &&
      Option.isOption(w.keyText) &&
      Predicate.hasProperty(w, "update") &&
      Predicate.isFunction(w.update),
  );

/**
 * A write's success writes: the read changes its answer and input name, run once on success.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a contract's value is typed at the contract; the runtime only runs it.
export type Writes = (success: {
  readonly value: unknown;
  readonly input: Values;
}) => ReadonlyArray<ReadWrite>;

/**
 * A lookup's function, run by the host with its input alone: a read has no Attempt.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a contract's value, error and services are typed at the contract; the runtime only runs it.
export type Lookup = (input: Values) => Effect.Effect<unknown, unknown, unknown>;

/**
 * An operation's walkers: its input's JSON form, and its key's text from a value's key fields
 * (none when they have no encoded form).
 */
export type OperationWalk = {
  readonly input: Walker<Values, Values>;
  readonly keyText: (value: Values) => Option.Option<string>;
};

/**
 * A write lane's concurrency policy.
 */
export type Concurrency = "reject" | "latest" | "serialize" | "cancel";

/**
 * One operation of a machine: a write over a transaction, or a read over a resource.
 */
export type Operation = Data.TaggedEnum<{
  Write: {
    name: string;
    contract: string;
    keyFields: ReadonlyArray<string>;
    inputFields: ReadonlyArray<string>;
    key: Schema.Codec<Values, string>;
    concurrency: Concurrency;
    input: Schema.Codec<Values, Values>;
    inputJson: Schema.Codec<Values, Values>;
    walk: OperationWalk;
    services: Slot<() => ServiceKeys>;
    // What the server keys the write by: the Attempt's id, or these input fields.
    idempotency: "attempt" | ReadonlyArray<string>;
    call: Slot<Commit>;
    writes: Option.Option<Slot<Writes>>;
    success: Mapping;
    failure: ReadonlyMap<string, Mapping>;
    notSent: Option.Option<Mapping>;
    unknown: Mapping;
  };
  Read: {
    name: string;
    contract: string;
    keyFields: ReadonlyArray<string>;
    inputFields: ReadonlyArray<string>;
    key: Schema.Codec<Values, string>;
    input: Schema.Codec<Values, Values>;
    inputJson: Schema.Codec<Values, Values>;
    walk: OperationWalk;
    services: Slot<() => ServiceKeys>;
    // How long landed data serves an ask, and an unheld entry is kept, in milliseconds.
    staleTime: number;
    gcTime: number;
    call: Slot<Lookup>;
    success: Mapping;
    failure: ReadonlyMap<string, Mapping>;
  };
}>;

/**
 * The services an operation's call needs, as its contract lists them: the boot refuses a Runtime
 * whose services lack one. Each key is an Effect value with methods, so Compiled reaches them
 * through a slot.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a service key's identifier and shape are its contract's; only its presence is read.
export type ServiceKeys = ReadonlyArray<Context.Key<unknown, unknown>>;

/**
 * Constructors and matchers for {@link Operation}.
 */
export const Operation = Data.taggedEnum<Operation>();

/**
 * A machine as the runtime boots it: plain data plus Slots.
 *
 * **Details**
 *
 * `states` holds every node of the tree by its path, compounds included, in declaration order;
 * `root` holds the root's handlers and `initial` the leaf the root's defaults reach;
 * `handledTags` the events the root or some state handles; `memory` and `memoryJson` are derived
 * from the fields' Schemas. What the core calls sits under `InternalsId`.
 */
export type Compiled = {
  readonly id: string;
  readonly persist: boolean;
  readonly initial: string;
  readonly states: ReadonlyMap<string, Node>;
  readonly root: Level;
  readonly handledTags: ReadonlySet<string>;
  readonly events: ReadonlyMap<string, EventEntry>;
  readonly memory: Schema.Codec<Values, Values>;
  readonly memoryJson: Schema.Codec<Values, Values>;
  readonly operations: ReadonlyMap<string, Operation>;
  readonly context: ReadonlyMap<string, ContextSlot>;
  readonly schedules: ReadonlyMap<string, ScheduleCodecs>;
  readonly wiring: ReadonlyMap<string, { readonly machine: string; readonly name: string }>;
  readonly [InternalsId]: CompiledInternals;
};

/**
 * What the core calls on a Compiled, off the machine's public face: the memory's walker, the
 * identity's walker, the memory fields with theirs, and the `onContext` reactions with their
 * callbacks.
 */
export type CompiledInternals = {
  readonly fields: ReadonlyArray<Field>;
  readonly walk: Walker<Values, Values>;
  readonly identity: Walker<Values, Values>;
  readonly reactions: ReadonlyArray<Reaction>;
};

/**
 * What a context read takes from its provider's snapshot: a public memory field, whether the
 * provider is at a state or below it, or its state's name.
 */
export type Read =
  | { readonly kind: "memory"; readonly field: string }
  | { readonly kind: "state"; readonly path: string }
  | { readonly kind: "stateName" };

/**
 * A read named as its slot's select receives it.
 */
export type ContextRead = { readonly name: string } & Read;

/**
 * A context slot as the runtime binds it: the machine that provides it, what it reads of that
 * machine's snapshot, its select over those reads, and the JSON codec of its Schema, through which
 * every selection passes once: it is saved in that form and read back equal.
 */
export type ContextSlot = {
  readonly provider: string;
  readonly reads: ReadonlyArray<ContextRead>;
  // FLOW_STATE_ALLOW_UNKNOWN: a selection's JSON codec, typed at the definition.
  readonly json: Schema.Codec<unknown, unknown>;
  // FLOW_STATE_ALLOW_UNKNOWN: the selection's walkers, built from its JSON codec.
  readonly walk: Walker<unknown, unknown>;
  // FLOW_STATE_ALLOW_UNKNOWN: a selected value has the slot's type, typed at the definition.
  readonly select: Slot<(reads: Values) => unknown>;
};

/**
 * A `C.slot.change` reaction: the slot whose value it compares, when a change counts, and the event
 * it enqueues.
 */
export type Reaction = {
  readonly slot: string;
  readonly when: Option.Option<
    // FLOW_STATE_ALLOW_UNKNOWN: the slot's current and previous values, typed at the definition.
    Slot<(current: unknown, previous: unknown, extra: { readonly memory: Values }) => boolean>
  >;
  readonly event: Mapping;
};

/**
 * A machine's operation by name, among the machines a Runtime runs.
 */
export const operationOf = (
  machines: ReadonlyMap<string, Compiled>,
  machine: string,
  name: string,
) => Option.fromUndefinedOr(machines.get(machine)?.operations.get(name));

/**
 * A memory as an outsider reads it: without the machine's `Flow.private` fields.
 */
export const publicMemory = (compiled: Compiled, memory: Values) => {
  const hidden = new Set(compiled[InternalsId].fields.filter((f) => f.private).map((f) => f.name));

  return hidden.size === 0
    ? memory
    : Object.fromEntries(Object.entries(memory).filter(([name]) => !hidden.has(name)));
};
