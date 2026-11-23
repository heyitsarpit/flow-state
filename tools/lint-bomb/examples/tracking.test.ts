import assert from "node:assert/strict";
import { describe, it } from "@effect/vitest";
import { Cause, Clock, Deferred, Effect, Exit, Fiber, Layer, Ref, Result } from "effect";
import { TestClock } from "effect/testing";
import {
  Carrier,
  CarrierUnavailable,
  ParcelNotFound,
  ParcelStatus,
  trackParcel,
} from "./tracking.ts";

// Only the external carrier is substituted. The workflow, Schedule, timeout, Clock, and fibers are real.
// Attempts record adapter calls, not private schedule steps. Expected timelines are worked examples.
const transientCarrier = (attempts: Ref.Ref<Array<number>>, failures: number) =>
  Layer.succeed(Carrier)({
    lookup: (trackingId) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        const count = yield* Ref.modify(attempts, (times) => [times.length + 1, [...times, now]]);

        if (count <= failures) {
          return yield* Effect.fail(new CarrierUnavailable({ trackingId }));
        }

        return new ParcelStatus({ trackingId, location: "London depot" });
      }),
  });

describe("Parcel tracking: retry policy and owned time", () => {
  it.effect("T01 transient reads back off, cap delays, and timestamp successful observation", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(10_000);

      const attempts = yield* Ref.make<Array<number>>([]);

      const fiber = yield* trackParcel("parcel-7").pipe(
        Effect.provide(transientCarrier(attempts, 4)),
        Effect.forkChild,
      );

      yield* TestClock.adjust("99 millis");
      assert.deepEqual(yield* Ref.get(attempts), [10_000]);

      yield* TestClock.adjust("1001 millis");

      const receipt = yield* Fiber.join(fiber);

      assert.deepEqual(yield* Ref.get(attempts), [10_000, 10_100, 10_300, 10_700, 11_100]);
      assert.deepEqual(
        receipt.status,
        new ParcelStatus({ trackingId: "parcel-7", location: "London depot" }),
      );
      assert.equal(receipt.observedAt, 11_100);
    }),
  );

  it.effect("T02 exhaustion retains the carrier failure and stops after five total attempts", () =>
    Effect.gen(function* () {
      const attempts = yield* Ref.make<Array<number>>([]);

      const fiber = yield* trackParcel("offline").pipe(
        Effect.provide(transientCarrier(attempts, 100)),
        Effect.result,
        Effect.forkChild,
      );

      yield* TestClock.adjust("10 seconds");

      const result = yield* Fiber.join(fiber);

      assert(Result.isFailure(result));
      assert.deepEqual(result.failure, new CarrierUnavailable({ trackingId: "offline" }));
      assert.deepEqual(yield* Ref.get(attempts), [0, 100, 300, 700, 1100]);
    }),
  );

  it.effect("T03 a permanent not-found result is never retried", () =>
    Effect.gen(function* () {
      const attempts = yield* Ref.make(0);

      const carrier = Layer.succeed(Carrier)({
        lookup: (trackingId) =>
          Ref.update(attempts, (n) => n + 1).pipe(
            Effect.andThen(Effect.fail(new ParcelNotFound({ trackingId }))),
          ),
      });

      const result = yield* trackParcel("missing").pipe(Effect.provide(carrier), Effect.result);

      yield* TestClock.adjust("10 seconds");
      assert(Result.isFailure(result));
      assert.deepEqual(result.failure, new ParcelNotFound({ trackingId: "missing" }));
      assert.equal(yield* Ref.get(attempts), 1);
    }),
  );

  it.effect("T04 the overall deadline interrupts a hung read and finishes adapter cleanup", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const cleaned = yield* Ref.make(false);

      const carrier = Layer.succeed(Carrier)({
        lookup: () =>
          Deferred.succeed(started, undefined).pipe(
            Effect.andThen(Effect.never),
            Effect.ensuring(Ref.set(cleaned, true)),
          ),
      });

      const fiber = yield* trackParcel("hung").pipe(
        Effect.provide(carrier),
        Effect.result,
        Effect.forkChild,
      );

      yield* Deferred.await(started);
      yield* TestClock.adjust("1999 millis");
      assert.equal(yield* Ref.get(cleaned), false);

      yield* TestClock.adjust("1 millis");

      const result = yield* Fiber.join(fiber);

      assert(Result.isFailure(result));
      assert.equal(result.failure._tag, "TrackingDeadline");
      assert.equal(yield* Ref.get(cleaned), true);
    }),
  );

  it.effect("T05 caller interruption retires backoff without later adapter calls", () =>
    Effect.gen(function* () {
      const attempts = yield* Ref.make<Array<number>>([]);

      const fiber = yield* trackParcel("cancelled").pipe(
        Effect.provide(transientCarrier(attempts, 100)),
        Effect.forkChild,
      );

      yield* TestClock.adjust("50 millis");
      yield* Fiber.interrupt(fiber);
      yield* TestClock.adjust("10 seconds");

      const exit = yield* Fiber.await(fiber);

      assert(Exit.isFailure(exit));
      assert(Cause.hasInterrupts(exit.cause));
      assert.deepEqual(yield* Ref.get(attempts), [0]);
    }),
  );
});
