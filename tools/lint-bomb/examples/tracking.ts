// Flow: tracking workflow -> carrier lookup; the workflow composes retry and deadline policy.
// Concern = responsibility; Boundary = its implementation through a contract.
// Protocol = data with agreed meaning; Established fact = what construction or validation proves.
// Composition level = depth in this workflow, not a required folder or class.
// A read-only carrier lookup is safe to repeat. A mutation would need a separate idempotency contract.
// The carrier adapter owns wire decoding; this module accepts its trusted domain values and errors.
import { Clock, Context, Data, Effect, Schedule } from "effect";

/*****************************************************************************/
/* Level 1: Carrier capability and domain protocols */
/*****************************************************************************/

// Protocol: ParcelStatus is trusted adapter output; Data constructs values without admitting wire input.
export class CarrierUnavailable extends Data.TaggedError("CarrierUnavailable")<{
  trackingId: string;
}> {}

export class ParcelNotFound extends Data.TaggedError("ParcelNotFound")<{
  trackingId: string;
}> {}

export class TrackingDeadline extends Data.TaggedError("TrackingDeadline")<{
  trackingId: string;
}> {}

export class ParcelStatus extends Data.Class<{
  trackingId: string;
  location: string;
}> {}

// Service is the foreign capability seam, not a second owner of retry counters or timers.
export class Carrier extends Context.Service<
  Carrier,
  {
    lookup: (
      trackingId: string,
    ) => Effect.Effect<ParcelStatus, CarrierUnavailable | ParcelNotFound>;
  }
>()("lint-bomb/examples/tracking/Carrier") {}

/*****************************************************************************/
/* Level 0: Tracking workflow and execution policy */
/*****************************************************************************/

// Contract: tracking ID -> status and observation time; needs Carrier; preserves terminal lookup failures.
// Requirement: at most five attempts; the deadline bounds the whole operation with cooperative cancellation.
// Composition site: retry transient reads, apply the deadline, then observe successful completion time.
// Schedule.min selects the shorter delay: exponential backoff capped at 400ms.
// Both component schedules continue indefinitely; upTo bounds the combined policy to four retries.
// Schedule owns each execution's progress; reusing this value does not share mutable retry state.
const retryPolicy = Schedule.min([
  Schedule.exponential("100 millis"),
  Schedule.spaced("400 millis"),
]).pipe(Schedule.upTo({ times: 4 }));

export const trackParcel = Effect.fn("trackParcel")(function* (trackingId: string) {
  const carrier = yield* Carrier;

  // The deadline surrounds the WHOLE retry operation, including a hanging adapter and backoff.
  // A Schedule elapsed-time bound alone cannot interrupt a lookup that never completes.
  const status = yield* carrier.lookup(trackingId).pipe(
    Effect.retry({
      schedule: retryPolicy,
      while: (error) => error._tag === "CarrierUnavailable",
    }),
    Effect.timeoutOrElse({
      duration: "2 seconds",
      orElse: () => Effect.fail(new TrackingDeadline({ trackingId })),
    }),
  );

  // Read injectable time only after success; do not capture Date.now() at module construction.
  const observedAt = yield* Clock.currentTimeMillis;

  // Carry established facts: preserve the adapter's domain result without decoding or rebuilding it.
  // Wire admission belongs to the real adapter; this example supplies only its trusted contract.
  return { status, observedAt };
});
