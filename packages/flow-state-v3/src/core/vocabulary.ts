import { Schema } from "effect";

/**
 * Flow's decline reasons: the failure NotSent { why } (WriteLanes R3).
 */
export const Decline = Schema.Literals([
  "Cancelled",
  "Restored",
  "Rejected",
  "Overloaded",
  "StorageRefused",
  "Disposed",
  "NoPersistence",
  "OldVersion",
  "Unencodable",
]);

/**
 * The decoded {@link Decline}.
 */
export type Decline = typeof Decline.Type;

/**
 * Whether an ending's reason is one of Flow's declines.
 */
export const isDecline = Schema.is(Decline);

/**
 * The channel an ending was decided on (WriteLanes R2).
 */
export const Channel = Schema.Literals(["success", "failure", "unknown"]);

/**
 * The decoded {@link Channel}.
 */
export type Channel = typeof Channel.Type;

/**
 * Why a turn was refused before commit (Turn R8, R10).
 */
export type RefusedCode = "CallbackDefect" | "InvalidTurn" | "GuardDefect";

/**
 * The codes of the issues the core reports: a turn's refusal, or a call's defect.
 */
export type IssueCode = RefusedCode | "Defect";

/**
 * A schedule's saved deadline, as an actor record holds it (WriteAhead R4).
 */
export const ScheduleDeadline = Schema.Struct({
  name: Schema.String,
  dueAt: Schema.Number,
  send: Schema.String,
});
