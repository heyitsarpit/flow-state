import { Data, type Effect, type Option, type Schema } from "effect";

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
  InState: { states: ReadonlyArray<string> };
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
 * One alternative of a handler: its place, its target, its guards, its memory patch and its
 * actions.
 */
export type Alternative = {
  readonly at: string;
  readonly target: Option.Option<string>;
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
 * One state: its handlers and its schedules.
 */
export type Node = { readonly on: Level; readonly schedules: ReadonlyArray<Schedule> };

/**
 * Where an ending goes: its event and the mapper that makes the event's payload.
 */
export type Mapping = {
  readonly event: string;
  // FLOW_STATE_ALLOW_UNKNOWN: an ending's value is the commit's or lookup's own type, typed at the contract.
  readonly from: Option.Option<Slot<(value: unknown) => Values>>;
};

/**
 * What a commit or lookup function receives beside its input.
 */
export type CallContext = { readonly attempt: Attempt };

/**
 * The Attempt a commit runs as (WriteLanes R5).
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
 * A call's function: the commit or lookup the contract declares, run by the host.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a contract's value, error and services are typed at the contract; the runtime only runs it.
export type Call = (
  input: Values,
  context: CallContext,
) => Effect.Effect<unknown, unknown, unknown>;

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
    key: Schema.Codec<Values, string>;
    concurrency: Concurrency;
    input: Schema.Codec<Values, Values>;
    call: Slot<Call>;
    success: Mapping;
    failure: ReadonlyMap<string, Mapping>;
    unknown: Mapping;
  };
  Read: {
    name: string;
    contract: string;
    keyFields: ReadonlyArray<string>;
    key: Schema.Codec<Values, string>;
    input: Schema.Codec<Values, Values>;
    call: Slot<Call>;
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
 * The state tree is flat in this build: `states` lists the top-level leaves in order, each with its
 * handlers; `root` holds the root's handlers.
 */
export type Compiled = {
  readonly id: string;
  readonly persist: boolean;
  readonly initial: string;
  readonly states: ReadonlyMap<string, Node>;
  readonly root: Level;
  readonly events: ReadonlyMap<string, Schema.Codec<Values, Values>>;
  readonly external: ReadonlySet<string>;
  readonly memory: Schema.Codec<Values, Values>;
  readonly initialMemory: Values;
  readonly operations: ReadonlyMap<string, Operation>;
};
