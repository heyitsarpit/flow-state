import { Data, type Option } from "effect";
import type { Values } from "./compiled.ts";
import type { ActorId, CallId, TicketId, TimerId, Use } from "./world.ts";

/**
 * How a call ended, as the host classifies its fiber's Exit.
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
 * One input to the core: a public call, a step of the bootstrap, a host answer or a timer.
 */
export type Input = Data.TaggedEnum<{
  Start: {};
  // The store's record texts, decoded by the core once; `None` when the store failed to load.
  Boot: { stored: Option.Option<ReadonlyMap<string, string>> };
  BootFailed: {};
  Ensure: {
    actor: ActorId;
    use: Option.Option<Use>;
    existing: boolean;
    wiring: Option.Option<ReadonlyMap<string, ActorId>>;
  };
  Create: { actor: ActorId; input: Values };
  Serve: {};
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
