import { Data, type Effect, type Equivalence, type Option, type Schema } from "effect";

/**
 * A user closure named by its place in the definition (`operations.pay.failure.CardDeclined`), so
 * tools read the name and only the runtime calls the function.
 */
export type Slot<F> = { readonly slot: string; readonly run: F };

/**
 * A memory or payload value as the core holds it: a decoded record of the definition's fields.
 */
// FLOW_STATE_ALLOW_UNKNOWN: field values are the application's, typed only at the definition; the core passes them through.
export type Values = Readonly<Record<string, unknown>>;

/**
 * A guard's refusal: a literal code and optional explanatory data (`deny`).
 */
export type Denial = { readonly _tag: "Flow/Denial"; readonly code: string };

/**
 * What one guard element reads: the pre-turn state, memory and event.
 */
export type GuardInput = {
  readonly state: string;
  readonly memory: Values;
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
 * One action of an alternative, in written order.
 */
export type Action = Data.TaggedEnum<{
  Commit: { operation: string; select: Slot<(input: SelectInput) => Values> };
  Retry: {
    operation: string;
    key: Option.Option<Slot<(input: SelectInput) => Values>>;
  };
  Cancel: {
    operation: string;
    key: Option.Option<Slot<(input: SelectInput) => Values>>;
  };
  Lookup: { operation: string; select: Slot<(input: SelectInput) => Values> };
}>;

/**
 * Constructors and matchers for {@link Action}.
 */
export const Action = Data.taggedEnum<Action>();

/**
 * What an `updateMemory` reads: the pre-turn memory, the event and the turn's time.
 */
export type UpdateInput = { readonly memory: Values; readonly event: Values; readonly now: number };

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
 * When a schedule fires after its arming: a fixed delay, or one computed from the after memory.
 */
export type Delay = Data.TaggedEnum<{
  Fixed: { ms: number };
  Computed: { ms: Slot<(input: { readonly memory: Values }) => number> };
}>;

/**
 * Constructors and matchers for {@link Delay}.
 */
export const Delay = Data.taggedEnum<Delay>();

/**
 * One schedule a state declares.
 */
export type Schedule = {
  readonly name: string;
  readonly send: string;
  readonly delay: Delay;
  readonly armOn: ReadonlyArray<string>;
  readonly onEntry: boolean;
};

/**
 * One state of the tree, by its path (`ON.PLAYING`): its parent, its children in declaration
 * order, its default child (compounds only), its handlers and its schedules.
 */
export type Node = {
  readonly path: string;
  readonly parent: Option.Option<string>;
  readonly children: ReadonlyArray<string>;
  readonly default: Option.Option<string>;
  readonly on: Level;
  readonly schedules: ReadonlyArray<Schedule>;
};

/**
 * Where a memory field starts: the creator's input, a constant, a value computed from the input
 * and constant fields, or absence (an optional key, with its Schema's default if it has one).
 */
export type Source = Data.TaggedEnum<{
  Input: {};
  // FLOW_STATE_ALLOW_UNKNOWN: a start has its field's type, typed at the definition.
  Constant: { value: unknown };
  // FLOW_STATE_ALLOW_UNKNOWN: a start has its field's type, typed at the definition.
  Computed: { compute: Slot<(fields: Values) => unknown> };
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
  readonly public: boolean;
  readonly uncertain: boolean;
};

/**
 * Where an ending goes: its event and the mapper that makes the event's payload.
 */
export type Mapping = {
  readonly event: string;
  // FLOW_STATE_ALLOW_UNKNOWN: an ending's value is the commit's or lookup's own type, typed at the contract.
  readonly from: Option.Option<Slot<(value: unknown) => Values>>;
};

/**
 * What a commit receives beside its input: the Attempt it runs as.
 */
export type CommitContext = { readonly attempt: Attempt };

/**
 * The Attempt a commit runs as.
 */
export type Attempt = {
  readonly id: string;
  readonly operation: string;
  readonly key: Values;
  readonly input: Values;
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
 * A lookup's function, run by the host with its input alone: a read has no Attempt.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a contract's value, error and services are typed at the contract; the runtime only runs it.
export type Lookup = (input: Values) => Effect.Effect<unknown, unknown, unknown>;

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
    call: Slot<Commit>;
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
    call: Slot<Lookup>;
    success: Mapping;
    failure: ReadonlyMap<string, Mapping>;
  };
}>;

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
 * `root` holds the root's handlers and `initial` the leaf the root's defaults reach. `fields` lists
 * the memory fields; `memory`, `memoryJson` and `sameMemory` are derived from their Schemas.
 */
export type Compiled = {
  readonly id: string;
  readonly persist: boolean;
  readonly initial: string;
  readonly states: ReadonlyMap<string, Node>;
  readonly root: Level;
  readonly events: ReadonlyMap<string, EventEntry>;
  readonly fields: ReadonlyArray<Field>;
  readonly memory: Schema.Codec<Values, Values>;
  readonly memoryJson: Schema.Codec<Values, Values>;
  readonly sameMemory: Equivalence.Equivalence<Values>;
  readonly operations: ReadonlyMap<string, Operation>;
  readonly context: ReadonlyMap<string, ContextSlot>;
  readonly reactions: ReadonlyArray<Reaction>;
  readonly wiring: ReadonlyMap<string, { readonly machine: string; readonly name: string }>;
};

/**
 * A context slot as the runtime binds it: the machine that provides it and its selector over one
 * outside snapshot of the provider.
 */
export type ContextSlot = {
  readonly provider: string;
  // FLOW_STATE_ALLOW_UNKNOWN: a selected value has the slot's type, typed at the definition.
  readonly select: Slot<(snapshot: { readonly state: string; readonly memory: Values }) => unknown>;
};

/**
 * An `onContext` reaction: what it selects from context and memory, when a change counts, and the
 * event it enqueues.
 */
export type Reaction = {
  // FLOW_STATE_ALLOW_UNKNOWN: a reaction's selection has the type its select returns.
  readonly select: Slot<(input: { readonly context: Values; readonly memory: Values }) => unknown>;
  // FLOW_STATE_ALLOW_UNKNOWN: the reaction's current and previous selections.
  readonly when: Option.Option<Slot<(current: unknown, previous: unknown) => boolean>>;
  readonly event: Mapping;
};
