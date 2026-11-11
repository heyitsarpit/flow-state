import { Data } from "effect";

/**
 * Every Flow failure at a host boundary: one error with a closed code and what was found.
 *
 * **Details**
 *
 * `problems` lists each violation found, in declaration order, each with its field path.
 */
export class FlowError extends Data.TaggedError("FlowError")<{
  readonly code:
    | "InvalidMachine"
    | "DuplicateMachine"
    | "ServiceFailed"
    | "InvalidEvent"
    | "RuntimeNotReady";
  readonly problems: ReadonlyArray<string>;
  // FLOW_STATE_ALLOW_UNKNOWN: the failure Flow wraps, kept whole (an Effect error's standard field).
  readonly cause?: unknown;
}> {}
