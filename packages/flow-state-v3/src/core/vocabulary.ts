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
 * its key or lane, a lane's input, or an actor's memory, last-seen selections or frames).
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
  "frame",
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
export type RefusedCode = "Defect" | "InvalidTurn" | "GuardDefect";

/**
 * The codes of the issues reported: a turn's refusal, a callback's or a call's defect, a final
 * write still pending when the Runtime's disposal bound passes, or a cleanup that failed when its
 * Scope closed.
 */
export type IssueCode = RefusedCode | "StorageFailure" | "CleanupFailed";

/**
 * A schedule's saved deadline, as an actor record holds it.
 */
export const ScheduleDeadline = Schema.Struct({
  name: Schema.String,
  dueAt: Schema.Number,
  send: Schema.String,
});
