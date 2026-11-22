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

const FailureJson = Schema.Struct({ code: IssueCode, slot: Schema.String });

/**
 * A schedule's saved timer, as an actor record holds it: a keyed one's key as its declared key
 * Schema encodes it, its `restartOn` baseline as its declared codec's text and that check's last
 * failure, the pause reasons it last read true, its arming (idle, refused with its failure, or a
 * run due or held), and its last firing's failure. Absent fields are the clean outcomes.
 */
export const SavedTimer = Schema.Struct({
  key: Schema.optionalKey(Schema.Json),
  selection: Schema.optionalKey(Schema.String),
  selectionFailed: Schema.optionalKey(FailureJson),
  reasons: Schema.optionalKey(Schema.Array(Schema.String)),
  arming: Schema.Union([
    Schema.TaggedStruct("Idle", {}),
    Schema.TaggedStruct("Refused", { code: IssueCode, slot: Schema.String }),
    Schema.TaggedStruct("Due", {
      armedAt: Schema.Number,
      attempt: Schema.Number,
      dueAt: Schema.Number,
    }),
    Schema.TaggedStruct("Held", {
      armedAt: Schema.Number,
      attempt: Schema.Number,
      left: Schema.Number,
    }),
  ]),
  firing: Schema.optionalKey(FailureJson),
});

/**
 * The decoded {@link SavedTimer}.
 */
export type SavedTimer = typeof SavedTimer.Type;

/**
 * An actor record's schedules: by the state path of the scope, then by name, an unkeyed
 * schedule's one timer or a keyed one's timers in key-text order.
 */
export const SavedSchedules = Schema.Record(
  Schema.String,
  Schema.Record(Schema.String, Schema.Union([SavedTimer, Schema.Array(SavedTimer)])),
);

/**
 * The decoded {@link SavedSchedules}.
 */
export type SavedSchedules = typeof SavedSchedules.Type;
