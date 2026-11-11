import { Data, type Option } from "effect";
import type { Values } from "./compiled.ts";
import type { ActorId, CallId, TicketId, TimerId, Use } from "./world.ts";

/**
 * How a call ended, as the host classifies its fiber's Exit (WriteLanes R2).
 */
export type CallResult = Data.TaggedEnum<{
  // FLOW_STATE_ALLOW_UNKNOWN: a call's value and error are the contract's own, mapped at admission.
  Success: { value: unknown };
  // FLOW_STATE_ALLOW_UNKNOWN: a call's value and error are the contract's own, mapped at admission.
  Failure: { reason: string; error: unknown };
  // FLOW_STATE_ALLOW_UNKNOWN: a call's value and error are the contract's own, mapped at admission.
  Unknown: { reason: string; error: unknown };
  Defect: {};
  Interrupted: {};
}>;

/**
 * Constructors and matchers for {@link CallResult}.
 */
export const CallResult = Data.taggedEnum<CallResult>();

/**
 * One input to the core: a public call, a host answer or a timer.
 */
export type Input = Data.TaggedEnum<{
  // FLOW_STATE_ALLOW_UNKNOWN: the store's parsed records, decoded by the core once.
  Boot: { stored: ReadonlyMap<string, unknown> };
  Ensure: { actor: ActorId; use: Option.Option<Use>; existing: boolean };
  Release: { actor: ActorId; use: Use };
  Send: { actor: ActorId; tag: string; payload: Values };
  Settled: { call: CallId; result: CallResult };
  Fired: { timer: TimerId };
  Stored: { ticket: TicketId };
  Refused: { ticket: TicketId };
  DisposeRuntime: {};
  DisposeActor: { actor: ActorId };
  Forget: { actor: ActorId };
}>;

/**
 * Constructors and matchers for {@link Input}.
 */
export const Input = Data.taggedEnum<Input>();
