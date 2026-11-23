import { Data, Option, Predicate, Result } from "effect";
import type { Values } from "./compiled.ts";
import { CallResult } from "./input.ts";
import type { Channel } from "./vocabulary.ts";
import type { AttemptId, CallId, IncarnationId, OwnedBy, ActorId } from "./world.ts";

/**
 * A read entry's name: its contract and its key's canonical text. It still names an entry after
 * the entry is removed.
 */
export type EntryKey = string;

/**
 * An entry's name from its contract and its key's canonical text.
 */
export const entryKeyOf = (contract: string, keyText: string) => `${contract}\u0000${keyText}`;

/**
 * Where an entry's one request stands: none, or one call asked at a position, with whether one
 * trailing request is wanted after it.
 */
export type Request = Data.TaggedEnum<{
  Idle: {};
  Running: { call: CallId; asked: number; again: boolean };
}>;

/**
 * Constructors and matchers for {@link Request}.
 */
export const Request = Data.taggedEnum<Request>();

/**
 * A read's ending as a row carries it: a success with its value, or a failure by its tag, `Defect`
 * or `Interrupted`, with the lookup's error.
 */
export type ReadEnding = {
  readonly channel: "success" | "failure";
  readonly reason: string;
  // FLOW_STATE_ALLOW_UNKNOWN: a read's value or error is the lookup's own, mapped when heard.
  readonly value: unknown;
};

/**
 * One commit's optimistic update of an entry: its Attempt, the update readers see applied over
 * confirmed data, and the position its success settled at, after which a landed read confirms it.
 */
export type Layer = {
  readonly attempt: AttemptId;
  readonly update: Update;
  readonly settled: Option.Option<number>;
};

/**
 * An update of a read's current value, as a commit's optimistic value or a write gives it.
 */
// FLOW_STATE_ALLOW_UNKNOWN: an update takes and returns the read's own value, typed at the commit.
export type Update = (current: unknown) => unknown;

/**
 * One entry per contract and key, per Runtime: its key (the read's whole input), the landed data
 * with when it landed and the position its request was asked at (none when restored), the position
 * of the last Invalidate, Written or Clear, its one request, its last landed ending that was not a
 * success, when it lost its last hold, and each live commit's optimistic update in start order.
 */
export type Entry = {
  readonly contract: string;
  readonly key: Values;
  // The machine and operation whose call reads it: its first holder's, which share the contract.
  readonly read: { readonly machine: string; readonly operation: string };
  // FLOW_STATE_ALLOW_UNKNOWN: landed data is the lookup's own value.
  readonly data: Option.Option<{ value: unknown; at: number; asked: Option.Option<number> }>;
  readonly staleAt: number;
  readonly request: Request;
  readonly last: Option.Option<ReadEnding>;
  readonly unheldSince: Option.Option<number>;
  readonly layers: ReadonlyArray<Layer>;
};

/**
 * One read slot per life and operation: the entry it points at, its identity, the activation that
 * owns its ask, and whether it waits for an answer.
 */
export type ReadSlot = {
  readonly entry: EntryKey;
  readonly actor: ActorId;
  readonly owner: OwnedBy;
  readonly waiting: boolean;
};

/**
 * A slot as its entry's holders name it: its life and its operation.
 */
export type Holder = { readonly life: IncarnationId; readonly operation: string };

/**
 * A holder's text, which its entry's holders are kept under.
 */
export const holderText = (h: Holder) => `${h.life}\u0000${h.operation}`;

/**
 * An entry's phase in its table, derived from its request: Idle, or Running with the request
 * current (asked after the last invalidation) or behind.
 */
export type Phase = "Idle" | "Current" | "Behind";

/**
 * An entry's phase.
 */
export const phaseOf = (entry: Entry) =>
  Request.$match(entry.request, {
    Idle: () => PHASE.idle,
    Running: ({ asked }) => (asked > entry.staleAt ? PHASE.current : PHASE.behind),
  });

const PHASE = {
  idle: "Idle",
  current: "Current",
  behind: "Behind",
} as const satisfies Record<string, Phase>;

/**
 * One asking slot with its holder, or nobody: a commit's unknown ending asks by itself.
 */
export type Asker = Option.Option<{ readonly h: Holder; readonly slot: ReadSlot }>;

/**
 * The cues of the entry table: everything that changes an entry.
 */
export type Cue = Data.TaggedEnum<{
  Ask: { asker: Asker; refetch: boolean };
  Invalidate: {};
  // FLOW_STATE_ALLOW_UNKNOWN: written data is the read's own value, given by a commit's `writes`.
  Written: { value: unknown };
  Clear: {};
  Settled: { asked: number; result: CallResult };
  LastHoldLeft: {};
  CollectDue: {};
  RuntimeEnds: {};
}>;

/**
 * Constructors and matchers for {@link Cue}.
 */
export const Cue = Data.taggedEnum<Cue>();

/**
 * One cell of the entry table: the moves an entry makes for a cue in one phase.
 */
export type Cell<T extends Cue["_tag"]> = (
  key: EntryKey,
  entry: Entry,
  cue: Data.TaggedEnum.Value<Cue, T>,
) => void;

/**
 * A row of the entry table: one cell per phase.
 */
export type Row<T extends Cue["_tag"]> = Record<Phase, Cell<T>>;

/**
 * Whether one trailing request is wanted: only while Running.
 */
export const againOf = (entry: Entry) =>
  Request.$match(entry.request, { Idle: () => false, Running: ({ again }) => again });

/**
 * An entry with one trailing request wanted, or not; Idle stays Idle.
 */
// RETURN_TYPE: the entry's own type, whichever request it has.
export const withAgain = (entry: Entry, again: boolean): Entry =>
  Request.$match(entry.request, {
    Idle: () => entry,
    Running: (running) => ({ ...entry, request: Request.Running({ ...running, again }) }),
  });

/**
 * A settled read's ending as its row carries it.
 */
export const endingOf = (result: CallResult) =>
  CallResult.$match(result, {
    Success: ({ value }) => ({ channel: "success", reason: "success", value }) satisfies ReadEnding,
    Failure: ({ reason, error }) =>
      ({ channel: "failure", reason, value: error }) satisfies ReadEnding,
    Unknown: ({ reason, error }) =>
      ({ channel: "failure", reason, value: error }) satisfies ReadEnding,
    Defect: () => ({ channel: "failure", reason: "Defect", value: undefined }) satisfies ReadEnding,
    Interrupted: () =>
      ({ channel: "failure", reason: "Interrupted", value: undefined }) satisfies ReadEnding,
  });

/**
 * How an Attempt's ending moves its updates: a success settles them, an unknown keeps them and
 * asks again, a failure or a NotSent removes them; so does an ending that says the commit was
 * cancelled, superseded or ended by the disposal, whatever its channel.
 */
export const movedBy = (channel: Channel, reason: string) =>
  GONE.has(reason) ? "removed" : BY_CHANNEL[channel];

const GONE = new Set(["Cancelled", "Superseded", "Disposed"]);

const BY_CHANNEL = {
  success: "success",
  unknown: "unknown",
  failure: "removed",
  notSent: "removed",
} as const satisfies Record<Channel, "success" | "unknown" | "removed">;

/**
 * A target as a commit or a write names it, `{ key, data }`, its data an update of the current
 * value or the value itself; none for any other shape.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a target is the callback's own value, read here once.
export const targetOf = (value: unknown) =>
  Predicate.hasProperty(value, "key") &&
  Predicate.isReadonlyObject(value.key) &&
  Predicate.hasProperty(value, "data")
    ? Option.some({ key: value.key, update: updateOf(value.data) })
    : Option.none();

// A target's data as an update: a function is one, a value replaces the current one.
// RETURN_TYPE: every target's data becomes the one Update shape.
const updateOf = (data: Values[string]): Update => (isUpdate(data) ? data : () => data);

// RETURN_TYPE: a type guard states the type it narrows to.
const isUpdate = (u: Values[string]): u is Update => Predicate.isFunction(u);

/**
 * An update applied to a value: its result, or the value itself when it throws or returns nothing.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a read's value is the lookup's own.
export const applied = (update: Update, value: unknown) =>
  Result.getOrElse(
    Result.try(() => update(value)),
    () => value,
  ) ?? value;

/**
 * What readers see of an entry: its confirmed value with each live update applied in start order.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a read's value is the lookup's own.
export const viewOf = (entry: Entry, confirmed: unknown) =>
  entry.layers.reduce((value, l) => applied(l.update, value), confirmed);

/**
 * Whether an entry's key holds every field of a partial key, by equal values.
 */
export const matches = (key: Values, partial: Values) =>
  Object.entries(partial).every(([field, value]) => Object.is(key[field], value));
