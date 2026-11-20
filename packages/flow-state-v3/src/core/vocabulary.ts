import { Schema } from "effect";

/**
 * Flow's decline reasons: the failure NotSent { why }.
 */
export const Decline = Schema.Literals([
  "Cancelled",
  "Restored",
  "Rejected",
  "StorageRefused",
  "Disposed",
  "NoPersistence",
  "Unencodable",
]);

/**
 * The decoded {@link Decline}.
 */
export type Decline = typeof Decline.Type;

/**
 * Why a boot could not read a record: its text is not canonical JSON, its key names no kind, or a
 * part of it fails its check (its format, its kind's Schema, its machine, its name, its operation,
 * its key or lane, a lane's input, or an actor's memory, last selections or baselines).
 */
export const ReadFailure = Schema.Literals([
  "text",
  "kind",
  "format",
  "schema",
  "machine",
  "name",
  "operation",
  "key",
  "lane",
  "input",
  "memory",
  "seen",
  "baseline",
]);

/**
 * The decoded {@link ReadFailure}.
 */
export type ReadFailure = typeof ReadFailure.Type;

/**
 * The channel an ending was decided on.
 */
export const Channel = Schema.Literals(["success", "failure", "unknown", "notSent"]);

/**
 * The decoded {@link Channel}.
 */
export type Channel = typeof Channel.Type;

/**
 * Why a turn was refused before commit.
 */
export const RefusedCode = Schema.Literals(["Defect", "InvalidTurn", "GuardDefect"]);

/**
 * The decoded {@link RefusedCode}.
 */
export type RefusedCode = typeof RefusedCode.Type;

/**
 * The codes of the issues reported: a turn's refusal, a callback's or a call's defect, a final
 * write still pending when the Runtime's disposal bound passes, or a cleanup that failed when its
 * Scope closed.
 */
export const IssueCode = Schema.Literals([
  ...RefusedCode.literals,
  "StorageFailure",
  "CleanupFailed",
]);

/**
 * The decoded {@link IssueCode}.
 */
export type IssueCode = typeof IssueCode.Type;

/**
 * A schedule's saved timer, as an actor record holds it: its name, a keyed one's key, and while
 * armed its arming time, its firings since and its `dueAt`, or its `left` with the reasons that
 * held it. A timer with neither is idle: its entry armed it once and it has ended or was disarmed.
 */
export const SavedTimer = Schema.Struct({
  name: Schema.String,
  // FLOW_STATE_ALLOW_UNKNOWN: a key's values are the application's; the canonical encoder checks them.
  key: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
  armedAt: Schema.optionalKey(Schema.Number),
  attempt: Schema.optionalKey(Schema.Number),
  dueAt: Schema.optionalKey(Schema.Number),
  left: Schema.optionalKey(Schema.Number),
  pausedBy: Schema.optionalKey(Schema.Array(Schema.String)),
});

/**
 * The decoded {@link SavedTimer}.
 */
export type SavedTimer = typeof SavedTimer.Type;
