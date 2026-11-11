import { assert, describe, it } from "@effect/vitest";
import { Cause, Deferred, Effect, Exit, Option, Result, Scope } from "effect";

import { Defect, Diagnostic } from "../../diagnostic/diagnostic.js";
import { acquireActivityFixture, closeActivityFixture } from "./actor-operation-fixture.js";
import {
  makeActorFixture,
  makeStoreFixture,
  StoreDefinition,
  StoreMachine,
  storeRunner,
  storeSnapshot,
} from "./actor-fixture.js";

describe("runtime-next actor operation results", () => {
  // Owner: P06.
  // Source: actor-admission.test.ts:1814 "allocates and settles distinct live operation occurrences".
  // Source: actor-engine.test.ts:1540 "ignores a duplicate completion for the same operation occurrence".
  // Source: actor-engine.test.ts:2193 "correlates operation completion with its descriptor and key".
  // Contract/correction: API-006; SEM-018; refactor.md ActorEngine operation cursors.
  // Setup: Two successive same-key finite occurrences and a reader retained from before their completion.
  // Action: Offer the replaced occurrence, complete the live occurrence, then repeat that completion.
  // Observable result: Stale and duplicate facts leave the cut unchanged; the live result appears only in a new reader.
  // Failure/cleanup: Close the actor after confirming the stale and duplicate facts are inert.
  it.effect("RN-ACTOR-011 operation completions follow their live occurrence fence", () =>
    Effect.gen(function* () {
      const store = makeStoreFixture();
      const held = yield* Deferred.make<number>();
      const firstStarted = yield* Deferred.make<void>();
      const secondStarted = yield* Deferred.make<void>();
      const occurrences: Parameters<typeof storeRunner.runFinite>[2][] = [];

      const runner = {
        runFinite: (
          _plan: Parameters<typeof storeRunner.runFinite>[0],
          _signal: AbortSignal,
          occurrence: Parameters<typeof storeRunner.runFinite>[2],
        ) => {
          occurrences.push(occurrence);

          if (occurrences.length === 1) Deferred.doneUnsafe(firstStarted, Effect.void);

          if (occurrences.length === 2) Deferred.doneUnsafe(secondStarted, Effect.void);

          return Deferred.await(held);
        },
        runActivity: (...args: Parameters<typeof storeRunner.runActivity>) =>
          storeRunner.runActivity(...args),
      };

      const f = yield* acquireActivityFixture({
        machine: StoreMachine,
        initial: storeSnapshot(),
        store: store.port,
        operationRunner: runner,
      });

      const actor = yield* f.prepared.activate();
      yield* actor.dispatch(Result.getOrThrow(StoreDefinition.E.fetch(1)));
      const retained = actor.snapshot().O.cache;
      yield* Deferred.await(firstStarted);
      const first = occurrences[0];

      assert.ok(first !== undefined);
      yield* actor.dispatch(Result.getOrThrow(StoreDefinition.E.fetch(1)));
      yield* Deferred.await(secondStarted);
      const second = occurrences[1];

      assert.ok(second !== undefined);
      assert.notStrictEqual(first, second);
      const beforeStale = actor.snapshot().revision;
      yield* Result.getOrThrow(
        actor.offerOperationFact({
          _tag: "terminal",
          occurrence: first,
          outcome: { _tag: "success", value: 99 },
        }),
      );
      assert.strictEqual(actor.snapshot().revision, beforeStale);

      const completed = {
        _tag: "terminal",
        occurrence: second,
        outcome: { _tag: "success", value: 22 },
      } as const;

      yield* Result.getOrThrow(actor.offerOperationFact(completed));
      assert.strictEqual(actor.snapshot().O.cache.getState([1]).status, "ready");
      assert.strictEqual(actor.snapshot().O.cache.getData([1]), 22);
      assert.strictEqual(retained.getState([1]).status, "missing");
      const publishedRevision = actor.snapshot().revision;
      yield* Result.getOrThrow(actor.offerOperationFact(completed));
      assert.strictEqual(actor.snapshot().revision, publishedRevision);
      yield* Deferred.succeed(held, 33);
      yield* actor.flush();
      assert.strictEqual(actor.snapshot().O.cache.getData([1]), 22);
    }),
  );

  it.effect("activity fixture cleanup propagates shutdown failures after fallback cleanup", () =>
    Effect.gen(function* () {
      const shutdownFailure: Error = new Error("activity fixture shutdown failure");
      let cleanupAttempted = false;

      yield* Effect.acquireUseRelease(
        makeActorFixture({ machine: StoreMachine, initial: storeSnapshot() }),
        (fixture) =>
          Effect.gen(function* () {
            let journalClosed = false;
            let scopeFinalized = false;
            const closeJournal = fixture.journal.close.bind(fixture.journal);

            fixture.journal.close = () =>
              Effect.sync(() => {
                journalClosed = true;
              }).pipe(Effect.andThen(closeJournal()));

            yield* Scope.addFinalizer(
              fixture.ownerScope,
              Effect.sync(() => {
                scopeFinalized = true;
              }),
            );

            const closed = yield* Effect.exit(
              closeActivityFixture({
                ...fixture,
                close: () => Effect.fail(shutdownFailure),
              }),
            );

            cleanupAttempted = true;
            assert.ok(Exit.isFailure(closed));
            const failure = Cause.findErrorOption(closed.cause);

            assert.ok(Option.isSome(failure));

            if (Option.isSome(failure)) assert.strictEqual(failure.value, shutdownFailure);
            assert.strictEqual(journalClosed, true);
            assert.strictEqual(scopeFinalized, true);
          }),
        (fixture) =>
          cleanupAttempted ? Effect.void : closeActivityFixture(fixture).pipe(Effect.orDie),
      );
    }),
  );

  // Owner: P06.
  // Source: actor-engine.test.ts:2281 "retains finite success and expected failure outcomes".
  // Source: actor-engine.test.ts:2318 "keeps interruption distinct during operation completion".
  // Source: actor-engine.test.ts:2336 "retains a defective operation exit and cause".
  // Contract/correction: ARCH-012; STD-05/08; refactor.md ActorEngine activities.
  // Setup: Four live keyed finite operations with separately retained occurrence fences.
  // Action: Offer success, typed failure, defect, and interruption, then suspend and offer a stale result.
  // Observable result: The four projected terminal categories stay distinct; stale data does not replace the committed cut.
  // Failure/cleanup: Suspension retires the occurrence; close the actor after the stale-result check.
  it.effect("RN-ACTOR-015 finite operation outcomes retain failure categories", () =>
    Effect.gen(function* () {
      const store = makeStoreFixture();
      const held = yield* Deferred.make<number>();
      const allStarted = yield* Deferred.make<void>();
      const occurrences: Parameters<typeof storeRunner.runFinite>[2][] = [];

      const f = yield* acquireActivityFixture({
        machine: StoreMachine,
        initial: storeSnapshot(),
        store: store.port,
        operationRunner: {
          runFinite: (_plan, _signal, occurrence) => {
            occurrences.push(occurrence);

            if (occurrences.length === 4) Deferred.doneUnsafe(allStarted, Effect.void);

            return Deferred.await(held);
          },
          runActivity: (...args) => storeRunner.runActivity(...args),
        },
      });

      const actor = yield* f.prepared.activate();

      for (const id of [1, 2, 3, 4]) {
        yield* actor.dispatch(Result.getOrThrow(StoreDefinition.E.fetch(id)));
      }

      yield* Deferred.await(allStarted);
      assert.strictEqual(occurrences.length, 4);
      const [success, failure, defect, interrupt] = occurrences;

      assert.ok(
        success !== undefined &&
          failure !== undefined &&
          defect !== undefined &&
          interrupt !== undefined,
      );
      const defectError = new Error("adapter defect");

      yield* Result.getOrThrow(
        actor.offerOperationFact({
          _tag: "terminal",
          occurrence: success,
          outcome: { _tag: "success", value: 11 },
        }),
      );
      yield* Result.getOrThrow(
        actor.offerOperationFact({
          _tag: "terminal",
          occurrence: failure,
          outcome: { _tag: "failure", error: "expected" },
        }),
      );
      yield* Result.getOrThrow(
        actor.offerOperationFact({
          _tag: "terminal",
          occurrence: defect,
          outcome: { _tag: "defect", diagnostic: Defect(defectError) },
        }),
      );
      yield* Result.getOrThrow(
        actor.offerOperationFact({
          _tag: "terminal",
          occurrence: interrupt,
          outcome: { _tag: "interrupt" },
        }),
      );

      const readers = actor.snapshot().O.cache;
      assert.strictEqual(readers.getState([1]).status, "ready");
      assert.strictEqual(readers.getData([1]), 11);
      const failed = readers.getState([2]);
      assert.strictEqual(failed.status, "failure");

      if (failed.status === "failure") assert.strictEqual(failed.error, "expected");
      const defective = readers.getState([3]);
      assert.strictEqual(defective.status, "defect");

      if (defective.status === "defect") {
        assert.ok(defective.defect instanceof Diagnostic);
        assert.strictEqual(defective.defect.cause, defectError);
      }

      assert.strictEqual(readers.getState([4]).status, "interrupted");

      const beforeSuspend = actor.snapshot().revision;
      yield* actor.transitionLifecycle({ to: "suspended", cause: { kind: "attachment" } });
      yield* Result.getOrThrow(
        actor.offerOperationFact({
          _tag: "terminal",
          occurrence: success,
          outcome: { _tag: "success", value: 99 },
        }),
      );
      assert.strictEqual(actor.snapshot().revision, beforeSuspend + 1);
      assert.strictEqual(actor.snapshot().O.cache.getData([1]), 11);
    }),
  );

  it.effect("initial and resumed activities use fresh occurrence gates", () =>
    Effect.gen(function* () {
      const store = makeStoreFixture();
      const held = yield* Deferred.make<void>();
      const firstStarted = yield* Deferred.make<void>();
      const resumedStarted = yield* Deferred.make<void>();
      const occurrences: Parameters<typeof storeRunner.runFinite>[2][] = [];
      const signals: AbortSignal[] = [];

      const f = yield* acquireActivityFixture({
        machine: StoreMachine,
        initial: { ...storeSnapshot(), state: StoreDefinition.S.subscribed },
        store: store.port,
        operationRunner: {
          runFinite: (...args) => storeRunner.runFinite(...args),
          runActivity: (_plan, signal, occurrence) => {
            occurrences.push(occurrence);
            signals.push(signal);

            if (occurrences.length === 1) Deferred.doneUnsafe(firstStarted, Effect.void);

            if (occurrences.length === 2) Deferred.doneUnsafe(resumedStarted, Effect.void);

            return Deferred.await(held);
          },
        },
      });

      const actor = yield* f.prepared.activate();
      yield* Deferred.await(firstStarted);
      const first = occurrences[0];

      assert.ok(first !== undefined);
      yield* actor.transitionLifecycle({ to: "suspended", cause: { kind: "attachment" } });
      assert.strictEqual(signals[0]?.aborted, true);
      yield* actor.transitionLifecycle({ to: "active", cause: { kind: "attachment" } });
      yield* Deferred.await(resumedStarted);
      const resumed = occurrences[1];

      assert.ok(resumed !== undefined);
      assert.notStrictEqual(first, resumed);
      const beforeStale = actor.snapshot().revision;
      yield* Result.getOrThrow(
        actor.offerOperationFact({ _tag: "value", occurrence: first, value: 1 }),
      );
      assert.strictEqual(actor.snapshot().revision, beforeStale);
      yield* Result.getOrThrow(
        actor.offerOperationFact({ _tag: "value", occurrence: resumed, value: 2 }),
      );
      assert.strictEqual(actor.snapshot().O.cache.getData([7]), 2);
    }),
  );
});
