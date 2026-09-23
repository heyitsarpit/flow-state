import { assert, describe, it } from "@effect/vitest";
import { Cause, Deferred, Effect, Fiber, Option, Result } from "effect";

import { definition } from "../../definition/definition.js";
import { Failure } from "../../diagnostic/diagnostic.js";
import { machine } from "../../machine/machine.js";
import { makeActorDirectory } from "../actor/actor-directory.js";
import {
  completeLifecycleEvidence,
  evidenceSequence,
  prepareLifecycleEvidence,
} from "../evidence/evidence-record.js";
import { makeEvidenceSink, type EvidenceSink } from "../evidence/evidence-sink.js";

const Definition = definition({
  id: "runtime-next/evidence-sink-owner",
  states: ["idle"],
  events: {},
});

const Machine = Result.getOrThrow(
  machine(Definition, ({ S }) => ({ default: S.idle, states: { idle: {} } })),
);

const sequence = (value: number) => Result.getOrThrow(evidenceSequence(value));

const record = (value: number) => {
  const directory = makeActorDirectory<string>({ machines: [Machine] });

  const position = Result.getOrThrow(
    directory.reserve({
      kind: "stable",
      ref: { machine: Machine, id: `actor-${value}`, persist: false },
    }),
  );

  if (position._tag !== "create") throw new Error("Fresh directory must reserve a new actor");
  const identity = position.reservation.identity;

  const prepared = Result.getOrThrow(
    prepareLifecycleEvidence({
      _tag: "lifecycle",
      machineTurn: false,
      from: "idle",
      to: "idle",
      terminal: false,
      fence: identity,
      provenance: { app: {}, plan: {}, actor: identity },
      timestamp: 1,
      publicationRevision: 0,
      machineTurnRevision: 0,
      cause: { kind: "test" },
      before: { value },
      after: { value },
    }),
  );

  return completeLifecycleEvidence(prepared, sequence(value));
};

const offer = (sink: EvidenceSink, value: number) =>
  Result.getOrThrow(sink.prepareOffer()).accept(record(value));

describe("runtime-next EvidenceSink owner", () => {
  it.effect("reserves a finite bound and accounts independently for dropped records", () =>
    Effect.gen(function* () {
      const sink = yield* makeEvidenceSink({ id: "bounded", capacity: 1 });
      const first = Result.getOrThrow(sink.prepareOffer());
      const second = Result.getOrThrow(sink.prepareOffer());

      assert.strictEqual(first.accept(record(1)).status, "accepted");
      assert.strictEqual(second.accept(record(2)).status, "dropped");
      const drained = yield* sink.drain(sequence(2));
      assert.strictEqual(drained.status, "truncated");
      assert.deepStrictEqual(drained.accounting, {
        accepted: 1,
        dropped: 1,
        delivered: 1,
        truncated: 1,
        failed: 0,
        detached: 0,
        greatestOmittedSequence: Option.some(sequence(2)),
      });
      assert.ok(Object.isFrozen(drained));
      assert.ok(Object.isFrozen(drained.accounting));
      assert.ok(Object.isFrozen(drained.truncatedBefore));
      assert.ok(Object.isFrozen(drained.accounting.greatestOmittedSequence));
      assert.strictEqual(Reflect.set(drained, "status", "failed"), false);
      assert.strictEqual(Reflect.set(drained.accounting, "delivered", 100), false);
      assert.strictEqual(Reflect.set(drained.truncatedBefore, "value", 100), false);
      const repeated = yield* sink.drain(sequence(2));
      assert.strictEqual(repeated.status, "truncated");
      assert.strictEqual(repeated.accounting.delivered, 1);

      const zero = yield* makeEvidenceSink({ id: "zero", capacity: 0 });
      assert.strictEqual(offer(zero, 3).status, "dropped");
      assert.strictEqual((yield* zero.drain(sequence(3))).accounting.truncated, 1);
    }),
  );

  it.effect("releases cancelled reservations and binds a sink once", () =>
    Effect.gen(function* () {
      const sink = yield* makeEvidenceSink({ id: "claim", capacity: 1 });
      assert.ok(Result.isSuccess(sink.claimOnce()));
      assert.ok(Result.isFailure(sink.claimOnce()));
      Result.getOrThrow(sink.prepareOffer()).cancel();
      assert.strictEqual(offer(sink, 1).status, "accepted");
      assert.strictEqual((yield* sink.drain(sequence(1))).accounting.delivered, 1);
      yield* sink.close();
      assert.strictEqual(offer(sink, 2).status, "detached");
    }),
  );

  it.effect("settles direct drain interruption exactly once", () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      let deliveries = 0;

      const sink = yield* makeEvidenceSink({
        id: "interrupt",
        capacity: 1,
        deliver: () =>
          Effect.gen(function* () {
            deliveries++;
            yield* Deferred.succeed(entered, undefined);
            yield* Deferred.await(release);
          }),
      });

      assert.strictEqual(offer(sink, 1).status, "accepted");
      const draining = yield* sink.drain(sequence(1)).pipe(Effect.forkChild);
      yield* Deferred.await(entered);
      yield* Fiber.interrupt(draining);
      yield* Deferred.succeed(release, undefined);
      const settled = yield* sink.drain(sequence(1));
      assert.strictEqual(settled.accounting.delivered + settled.accounting.failed, 1);
      assert.strictEqual(settled.accounting.delivered, 0);
      assert.strictEqual(settled.accounting.failed, 1);
      assert.strictEqual(deliveries, 1);
      yield* sink.close();
    }),
  );

  it.effect("lets a delivery callback reenter drain and close without waiting on itself", () =>
    Effect.gen(function* () {
      let sink: EvidenceSink;
      let nestedStatus: string | undefined;
      sink = yield* makeEvidenceSink({
        id: "reentrant",
        capacity: 2,
        deliver: () =>
          Effect.gen(function* () {
            nestedStatus = (yield* sink.drain(sequence(1))).status;
            yield* sink.close();
          }),
      });

      assert.strictEqual(offer(sink, 1).status, "accepted");
      assert.strictEqual(offer(sink, 2).status, "accepted");
      const drained = yield* sink.drain(sequence(2));
      assert.strictEqual(nestedStatus, "pending");
      assert.strictEqual(drained.accounting.delivered, 1);
      assert.strictEqual(drained.accounting.truncated, 1);
      assert.deepStrictEqual(drained.accounting.greatestOmittedSequence, Option.some(sequence(2)));
      yield* sink.close();
    }),
  );

  it.effect("retains delivery failure and truncates queued work before idempotent close", () =>
    Effect.gen(function* () {
      const sinkFailure = Failure({
        code: "InvalidTraceRecord",
        path: ["evidence", "sink"],
        details: {},
        summary: "Delivery rejected",
        help: "Inspect the sink.",
      });

      const sink = yield* makeEvidenceSink({
        id: "failed",
        capacity: 2,
        deliver: () => Effect.fail(sinkFailure),
      });

      assert.strictEqual(offer(sink, 1).status, "accepted");
      assert.strictEqual(offer(sink, 2).status, "accepted");
      const drained = yield* sink.drain(sequence(2));
      assert.strictEqual(drained.status, "failed");
      assert.strictEqual(drained.accounting.failed, 1);
      assert.strictEqual(drained.accounting.truncated, 1);
      assert.deepStrictEqual(drained.accounting.greatestOmittedSequence, Option.some(sequence(2)));
      assert.ok(Option.isSome(drained.failureCause));

      if (Option.isSome(drained.failureCause)) {
        const reason = drained.failureCause.value.reasons.find((entry) => entry._tag === "Fail");
        assert.ok(reason?._tag === "Fail");
        assert.strictEqual(reason.error.code, sinkFailure.code);
        assert.strictEqual(reason.error.summary, sinkFailure.summary);
        assert.notStrictEqual(reason.error, sinkFailure);
      }

      assert.strictEqual(Reflect.set(sinkFailure, "summary", "Caller changed the error"), true);
      const repeatedDrain = yield* sink.drain(sequence(2));
      assert.ok(Option.isSome(repeatedDrain.failureCause));

      const repeatedReason = repeatedDrain.failureCause.value.reasons.find(
        (entry) => entry._tag === "Fail",
      );

      assert.ok(repeatedReason?._tag === "Fail");
      assert.strictEqual(repeatedReason.error.summary, "Delivery rejected");

      assert.strictEqual(offer(sink, 3).status, "detached");
      yield* sink.close();
      yield* sink.close();
      const afterClose = yield* sink.drain(sequence(3));
      assert.strictEqual(afterClose.accounting.detached, 1);
      assert.strictEqual(afterClose.accounting.delivered, 0);
    }),
  );

  it.effect("publishes ordered failure classes without exposing a defect object", () =>
    Effect.gen(function* () {
      const defect = { mutable: "original" };

      const typed = Failure({
        code: "InvalidTraceRecord",
        path: ["evidence", "sink"],
        details: {},
        summary: "Typed delivery failure",
        help: "Inspect delivery.",
      });

      const cause = Cause.combine(
        Cause.fail(typed),
        Cause.combine(Cause.die(defect), Cause.interrupt(7)),
      );

      const sink = yield* makeEvidenceSink({
        id: "failure-classes",
        capacity: 1,
        deliver: () => Effect.failCause(cause),
      });

      assert.strictEqual(offer(sink, 1).status, "accepted");
      const drained = yield* sink.drain(sequence(1));
      assert.strictEqual(drained.status, "failed");
      assert.ok(Option.isSome(drained.failureCause));
      assert.deepStrictEqual(
        drained.failureCause.value.reasons.map((reason) => reason._tag),
        ["Fail", "Die", "Interrupt"],
      );
      const [failure, died, interrupted] = drained.failureCause.value.reasons;
      assert.ok(failure?._tag === "Fail");
      assert.ok(died?._tag === "Die");
      assert.ok(interrupted?._tag === "Interrupt");
      assert.strictEqual(failure.error.code, typed.code);
      assert.strictEqual(died.defect.code, "Defect");
      assert.deepStrictEqual(interrupted.fiberId, Option.some(7));
      assert.strictEqual(Object.isFrozen(defect), false);
      assert.strictEqual(Reflect.set(defect, "mutable", "changed"), true);
      assert.strictEqual(drained.failureCause.value.reasons[1]?._tag, "Die");
    }),
  );
});
