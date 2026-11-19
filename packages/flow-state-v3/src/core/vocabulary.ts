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
