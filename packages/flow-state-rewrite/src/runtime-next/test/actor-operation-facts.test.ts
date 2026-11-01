import { assert, describe, it } from "@effect/vitest";
import { Cause, Deferred, Effect, Exit, Fiber, Option, Result, Scope } from "effect";
import { TestClock } from "effect/testing";

import { cancelPreparedLifecycleCut } from "../actor/actor-engine-lifecycle.js";
import { Diagnostic, Failure } from "../../diagnostic/diagnostic.js";
import { operationOutcome } from "../actor/actor-operation-work.js";
import {
  makeContextCoordinator,
  type ContextCoordinator,
  type ContextNode,
} from "../context/context-coordinator.js";
import type { LifecycleEvidenceDraft } from "../evidence/evidence-record.js";
import { makeRuntimeEvidencePolicy } from "../runtime-services.js";
import {
  acquireActivityFixture,
  ActivityDefinition,
  ActivityMachine,
  activityRunner,
  activitySnapshot,
  activityStore,
  closeActivityFixture,
} from "./actor-operation-fixture.js";
import {
  makeActorFixture,
  makeStoreFixture,
  StoreDefinition,
  StoreMachine,
  storeRunner,
  storeSnapshot,
} from "./actor-fixture.js";

function throwSync(error: Error) {
  throw error;
}

const succeedAfterPreparation = <Value>(prepare: () => Value) => Result.succeed(prepare());

const throwDuringPreparation = <Value>(error: Error) =>
  succeedAfterPreparation<Value>(() => {
    throw error;
  });

type ExpectedCauseReason = { _tag: "Fail" | "Die"; value: unknown };

const assertCauseSequence = (cause: Cause.Cause<unknown>, expected: ExpectedCauseReason[]) => {
  assert.deepStrictEqual(
    cause.reasons.map(({ _tag }) => _tag),
    expected.map(({ _tag }) => _tag),
  );

  for (const [index, item] of expected.entries()) {
    const reason = cause.reasons[index];

    if (reason === undefined) throw new Error(`Missing cause reason at index ${index}`);

    if (item._tag === "Fail") {
      assert.ok(Cause.isFailReason(reason));

      if (Cause.isFailReason(reason)) assert.strictEqual(reason.error, item.value);
    } else {
      assert.ok(Cause.isDieReason(reason));

      if (Cause.isDieReason(reason)) assert.strictEqual(reason.defect, item.value);
    }
  }
};

const assertProjectionDefect = (exit: Exit.Exit<unknown, unknown>, expected: unknown) => {
  assert.ok(Exit.isFailure(exit));

  if (!Exit.isFailure(exit)) return;
  const defect = Cause.findDefect(exit.cause);

  assert.ok(Result.isSuccess(defect));

  if (Result.isSuccess(defect)) assert.strictEqual(defect.success, expected);
};

const assertJournalCloseFailure = (exit: Exit.Exit<unknown, unknown>) => {
  assert.ok(Exit.isFailure(exit));

  if (!Exit.isFailure(exit)) throw new Error("Expected journal close to retain its failure");
  const reason = exit.cause.reasons[0];

  if (reason === undefined) throw new Error("Expected a journal close reason");
  assert.ok(Cause.isFailReason(reason));

  if (!Cause.isFailReason(reason)) throw new Error("Expected a typed journal close failure");
  assert.ok(reason.error instanceof Diagnostic);

  if (!(reason.error instanceof Diagnostic)) throw new Error("Expected the journal Diagnostic");
  assert.strictEqual(reason.error.code, "InvalidTraceRecord");
  assert.deepStrictEqual(reason.error.path, ["evidence", "stranded-credit"]);

  return reason.error;
};

const assertFallbackCloseCause = (
  exit: Exit.Exit<unknown, unknown>,
  defect: unknown,
  journalFailure: Diagnostic,
  journalDefect: unknown,
  scopeDefect: unknown,
) => {
  assert.ok(Exit.isFailure(exit));

  if (!Exit.isFailure(exit)) return;

  assertCauseSequence(exit.cause, [
    { _tag: "Die", value: defect },
    { _tag: "Fail", value: journalFailure },
    { _tag: "Die", value: journalDefect },
    { _tag: "Die", value: scopeDefect },
  ]);
};

const assertInterruptedFallbackCause = (
  exit: Exit.Exit<unknown, unknown>,
  fiberId: unknown,
  journalFailure: Diagnostic,
  journalDefect: unknown,
  scopeDefect: unknown,
) => {
  assert.ok(Exit.isFailure(exit));

  if (!Exit.isFailure(exit)) throw new Error("Expected teardown interruption");
  assert.deepStrictEqual(
    exit.cause.reasons.map(({ _tag }) => _tag),
    ["Interrupt", "Fail", "Die", "Die"],
  );
  const interruption = exit.cause.reasons[0];
  const journalRejection = exit.cause.reasons[1];
  const journalDefectReason = exit.cause.reasons[2];
  const scopeDefectReason = exit.cause.reasons[3];

  if (interruption === undefined) throw new Error("Expected the shutdown interruption");
  assert.ok(Cause.isInterruptReason(interruption));

  if (!Cause.isInterruptReason(interruption)) throw new Error("Expected interruption first");
  assert.strictEqual(interruption.fiberId, fiberId);

  if (journalRejection === undefined) throw new Error("Expected journal fallback rejection");
  assert.ok(Cause.isFailReason(journalRejection));

  if (!Cause.isFailReason(journalRejection)) throw new Error("Expected journal fallback rejection");
  assert.strictEqual(journalRejection.error, journalFailure);

  if (journalDefectReason === undefined) throw new Error("Expected journal fallback defect");
  assert.ok(Cause.isDieReason(journalDefectReason));

  if (!Cause.isDieReason(journalDefectReason)) throw new Error("Expected journal fallback defect");
  assert.strictEqual(journalDefectReason.defect, journalDefect);

  if (scopeDefectReason === undefined) throw new Error("Expected Scope fallback defect");
  assert.ok(Cause.isDieReason(scopeDefectReason));

  if (!Cause.isDieReason(scopeDefectReason)) throw new Error("Expected Scope fallback defect");
  assert.strictEqual(scopeDefectReason.defect, scopeDefect);
};

const makeEvidencePolicyWithThrowingCancel = (
  base: ReturnType<typeof makeRuntimeEvidencePolicy>,
  cancellationOrder: string[],
  defect: Error,
) => ({
  ...base,
  prepareLifecycle: <Before, After, CauseValue>(
    credit: Parameters<typeof base.prepareLifecycle<Before, After, CauseValue>>[0],
    draft: LifecycleEvidenceDraft<Before, After, CauseValue>,
  ) => {
    const prepared = base.prepareLifecycle(credit, draft);

    if (Result.isFailure(prepared)) return prepared;

    return Result.succeed({
      accept: () => prepared.success.accept(),
      cancel: () => {
        cancellationOrder.push("evidence");
        prepared.success.cancel();
        throwSync(defect);
      },
    });
  },
});

describe("runtime-next actor operation facts", () => {
  it.effect("lifecycle rollback attempts every cancellation and retains the work Cause first", () =>
    Effect.gen(function* () {
      const starts: Parameters<typeof activityRunner>[0] = [];
      const finalizers: Parameters<typeof activityRunner>[1] = [];

      const workFailure = Failure({
        code: "SemanticValidation",
        path: ["actor", "lifecycle", "work"],
        details: {},
        summary: "Lifecycle work failed",
        help: "Retain this failure with all rollback defects.",
      });

      const notificationDefect = new Error("notification cancellation failed");
      const evidenceDefect = new Error("evidence cancellation failed");
      const cancellationOrder: string[] = [];
      const contextScope = yield* Scope.make();
      const coordinator = yield* makeContextCoordinator(contextScope);

      const context: ContextCoordinator = {
        ...coordinator,
        cancel: (notification) => {
          cancellationOrder.push("notification");
          coordinator.cancel(notification);
          throwSync(notificationDefect);
        },
      };

      const f = yield* makeActorFixture({
        machine: ActivityMachine,
        initial: activitySnapshot(ActivityDefinition.S.active.S.A),
        store: activityStore,
        operationRunner: activityRunner(starts, finalizers, () => {}),
        context,
        validateProviders: Effect.fail(workFailure),
        evidencePolicy: (base) =>
          makeEvidencePolicyWithThrowingCancel(base, cancellationOrder, evidenceDefect),
      });

      const active = activitySnapshot(ActivityDefinition.S.active.S.A);

      const registration = Result.getOrThrow(
        coordinator.register({
          identity: f.identity,
          participant: {
            ref: f.ref,
            snapshot: () => active,
            offerContext: () =>
              Result.succeed({
                wait: Effect.succeed({ status: "no-op", snapshot: active }),
                cancel: () => {},
              }),
          },
          providers: [],
          opaqueIdentities: [ActivityDefinition.S.active.S.A],
          selectionBatch: () => Result.succeed({ slots: [], requests: [] }),
        } satisfies ContextNode<typeof ActivityDefinition>),
      );

      registration.enable();

      const activation = yield* Effect.exit(f.prepared.activate());

      assert.ok(Exit.isFailure(activation));

      if (Exit.isFailure(activation)) {
        assert.deepStrictEqual(cancellationOrder, ["notification", "evidence"]);
        assertCauseSequence(activation.cause, [
          { _tag: "Fail", value: workFailure },
          { _tag: "Die", value: notificationDefect },
          { _tag: "Die", value: evidenceDefect },
        ]);
      }

      assert.deepStrictEqual(starts, []);
      yield* f.close();
      yield* coordinator.close();
      yield* Scope.close(contextScope, Exit.void);
    }),
  );

  it.effect("lifecycle permit rollback attempts launches in reverse order", () =>
    Effect.sync(() => {
      const order: string[] = [];
      const launchDefect = new Error("launch cancellation failed");
      const notificationDefect = new Error("notification cancellation failed");
      const evidenceDefect = new Error("evidence cancellation failed");

      const cleanup = cancelPreparedLifecycleCut(
        [
          {
            permit: {
              cancel: () => {
                order.push("first");
                throwSync(launchDefect);
              },
            },
          },
          { permit: { cancel: () => order.push("middle") } },
          {
            permit: {
              cancel: () => {
                order.push("last");
                throwSync(launchDefect);
              },
            },
          },
        ],
        () => {
          order.push("notification");
          throwSync(notificationDefect);
        },
        () => {
          order.push("evidence");
          throwSync(evidenceDefect);
        },
      );

      assert.deepStrictEqual(order, ["last", "middle", "first", "notification", "evidence"]);
      assertCauseSequence(Cause.fromReasons(cleanup), [
        { _tag: "Die", value: launchDefect },
        { _tag: "Die", value: launchDefect },
        { _tag: "Die", value: notificationDefect },
        { _tag: "Die", value: evidenceDefect },
      ]);
    }),
  );

  it.effect("runner classifies success, failure, defect, interruption, and mixed Cause", () =>
    Effect.gen(function* () {
      const store = makeStoreFixture();
      const allProjected = yield* Deferred.make<void>();
      const defect = new Error("adapter defect");
      const mixed = Cause.combine(Cause.fail("typed"), Cause.die(defect));
      let projections = 0;

      const port: typeof store.port = {
        ...store.port,
        prepareProjection(fact) {
          const prepared = store.port.prepareProjection(fact);

          if (fact._tag === "terminal" && ++projections === 5)
            Deferred.doneUnsafe(allProjected, Effect.void);

          return prepared;
        },
      };

      const f = yield* acquireActivityFixture({
        machine: StoreMachine,
        initial: storeSnapshot(),
        store: port,
        operationRunner: {
          runFinite: (_plan, _signal, occurrence) => {
            if (occurrence.key[0] === 1) return Effect.succeed(11);

            if (occurrence.key[0] === 2) return Effect.fail("expected");

            if (occurrence.key[0] === 3) return Effect.failCause(Cause.die(defect));

            if (occurrence.key[0] === 4) return Effect.interrupt;

            return Effect.failCause(mixed);
          },
          runActivity: (...args) => storeRunner.runActivity(...args),
        },
      });

      const actor = yield* f.prepared.activate();

      for (const id of [1, 2, 3, 4, 5])
        yield* actor.dispatch(Result.getOrThrow(StoreDefinition.E.fetch(id)));

      yield* Deferred.await(allProjected);
      yield* actor.flush();
      const readers = actor.snapshot().O.cache;
      assert.strictEqual(readers.getData([1]), 11);
      const failed = readers.getState([2]);

      assert.strictEqual(failed.status, "failure");

      if (failed.status === "failure") assert.strictEqual(failed.error, "expected");

      for (const id of [3, 5]) {
        const state = readers.getState([id]);

        assert.strictEqual(state.status, "defect");

        if (state.status === "defect") {
          assert.ok(state.defect instanceof Diagnostic);
          assert.strictEqual(state.defect.cause, defect);
        }
      }

      assert.strictEqual(readers.getState([4]).status, "interrupted");
      const classified = operationOutcome(Exit.failCause(mixed));

      assert.strictEqual(classified._tag, "defect");
      assert.strictEqual("cause" in classified, false);
    }),
  );

  it.effect("a rejected continuing completion retires its occurrence after one replay", () =>
    Effect.gen(function* () {
      const store = makeStoreFixture();
      const secondProjection = yield* Deferred.make<void>();
      let attempts = 0;
      let occurrence: Parameters<typeof storeRunner.runActivity>[2] | undefined;

      const port: typeof store.port = {
        ...store.port,
        prepareProjection(fact) {
          if (fact._tag === "complete" && ++attempts === 2)
            Deferred.doneUnsafe(secondProjection, Effect.void);

          return store.port.prepareProjection(fact);
        },
      };

      const f = yield* acquireActivityFixture({
        machine: StoreMachine,
        initial: storeSnapshot(),
        store: port,
        operationRunner: {
          runFinite: (...args) => storeRunner.runFinite(...args),
          runActivity: (_plan, _signal, current) => {
            occurrence = current;

            return Effect.void;
          },
        },
      });

      const actor = yield* f.prepared.activate();
      yield* actor.dispatch(Result.getOrThrow(StoreDefinition.E.start()));
      yield* Deferred.await(secondProjection);
      const failed = yield* Effect.exit(actor.flush());

      assert.ok(Exit.isFailure(failed));
      assert.strictEqual(attempts, 2);
      assert.ok(occurrence !== undefined);
      const revision = actor.snapshot().revision;
      yield* Result.getOrThrow(actor.offerOperationFact({ _tag: "value", occurrence, value: 777 }));
      assert.strictEqual(actor.snapshot().revision, revision);
      assert.strictEqual(actor.snapshot().O.cache.getState([7]).status, "missing");
    }),
  );

  it.effect("an active projection defect fails flush and retires the operation", () =>
    Effect.gen(function* () {
      const store = makeStoreFixture();
      const projected = yield* Deferred.make<void>();
      const defect = new Error("projection defect");
      const journalDefect = new Error("journal fallback defect");
      const scopeDefect = new Error("owner scope fallback defect");
      let attempts = 0;
      let occurrence: Parameters<typeof storeRunner.runFinite>[2] | undefined;
      let closeVerified = false;
      let journalCloseAttempts = 0;
      let journalCloseExit: Exit.Exit<unknown, unknown> = Exit.succeed(undefined);
      let ownerScopeFinalized = false;

      const port: typeof store.port = {
        ...store.port,
        prepareProjection(fact) {
          if (fact._tag !== "terminal") return store.port.prepareProjection(fact);
          attempts += 1;
          Deferred.doneUnsafe(projected, Effect.void);

          return throwDuringPreparation<
            Result.Result.Success<ReturnType<typeof store.port.prepareProjection>>
          >(defect);
        },
      };

      yield* Effect.acquireUseRelease(
        makeActorFixture({
          machine: StoreMachine,
          initial: storeSnapshot(),
          store: port,
          operationRunner: {
            runFinite: (_plan, _signal, current) => {
              occurrence = current;

              return Effect.succeed(33);
            },
            runActivity: (...args) => storeRunner.runActivity(...args),
          },
        }),
        (f) =>
          Effect.gen(function* () {
            yield* Scope.addFinalizer(
              f.ownerScope,
              Effect.sync(() => {
                ownerScopeFinalized = true;
              }).pipe(
                // oxlint-disable-next-line anti-slop/no-expected-failure-as-defect -- The fixture injects a fallback defect and checks that exact Cause.Die identity.
                Effect.andThen(Effect.die(scopeDefect)),
              ),
            );

            const closeJournal = f.journal.close.bind(f.journal);

            f.journal.close = () =>
              Effect.gen(function* () {
                journalCloseAttempts += 1;
                const closed = yield* Effect.exit(closeJournal());
                journalCloseExit = closed;

                if (Exit.isFailure(closed))
                  return yield* Effect.failCause(
                    Cause.fromReasons([
                      ...closed.cause.reasons,
                      Cause.makeDieReason(journalDefect),
                    ]),
                  );

                // oxlint-disable-next-line anti-slop/no-expected-failure-as-defect -- The fixture injects a fallback defect and checks that exact Cause.Die identity.
                return yield* Effect.die(journalDefect);
              });

            const actor = yield* f.prepared.activate();
            yield* actor.dispatch(Result.getOrThrow(StoreDefinition.E.fetch(33)));
            yield* Deferred.await(projected);
            const failed = yield* Effect.exit(actor.flush());

            assert.ok(Exit.isFailure(failed));

            assertProjectionDefect(failed, defect);

            assert.strictEqual(attempts, 1);
            assert.ok(occurrence !== undefined);
            const revision = actor.snapshot().revision;
            yield* Result.getOrThrow(
              actor.offerOperationFact({ _tag: "value", occurrence, value: 777 }),
            );
            assert.strictEqual(actor.snapshot().revision, revision);
            assert.strictEqual(actor.snapshot().O.cache.getState([33]).status, "missing");
            const closed = yield* Effect.exit(closeActivityFixture(f));

            closeVerified = true;
            assert.strictEqual(journalCloseAttempts, 1);
            const journalCloseFailure = assertJournalCloseFailure(journalCloseExit);
            assertFallbackCloseCause(
              closed,
              defect,
              journalCloseFailure,
              journalDefect,
              scopeDefect,
            );
            assert.strictEqual(ownerScopeFinalized, true);
          }),
        (f) => (closeVerified ? Effect.void : closeActivityFixture(f).pipe(Effect.orDie)),
      );
    }),
  );

  it.effect("teardown masks both fallback attempts after external shutdown interruption", () =>
    Effect.gen(function* () {
      const releaseEntered = yield* Deferred.make<void>();
      const interruptionAcknowledged = yield* Deferred.make<void>();
      const acknowledgementWaitStarted = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      const journalDefect = new Error("journal fallback failed");
      const scopeDefect = new Error("owner Scope fallback failed");
      let journalCloseAttempts = 0;
      let journalCloseExit: Exit.Exit<unknown, unknown> = Exit.succeed(undefined);
      let ownerScopeFinalized = false;

      const f = yield* makeActorFixture({
        machine: StoreMachine,
        initial: storeSnapshot(),
        work: {
          resources: [
            Effect.succeed({
              name: "blocked shutdown release",
              release: Deferred.succeed(releaseEntered, undefined).pipe(
                Effect.andThen(
                  Deferred.await(release).pipe(
                    Effect.onInterrupt(() => Deferred.succeed(interruptionAcknowledged, undefined)),
                  ),
                ),
              ),
              reacquire: Option.none(),
            }),
          ],
          tasks: [],
          deadlines: [],
        },
      });

      yield* Scope.addFinalizer(
        f.ownerScope,
        Effect.sync(() => {
          ownerScopeFinalized = true;
        }).pipe(
          // oxlint-disable-next-line anti-slop/no-expected-failure-as-defect -- This teardown proof checks the exact fallback finalizer defect after interruption.
          Effect.andThen(Effect.die(scopeDefect)),
        ),
      );

      const closeJournal = f.journal.close.bind(f.journal);

      f.journal.close = () =>
        Effect.gen(function* () {
          journalCloseAttempts += 1;
          const closed = yield* Effect.exit(closeJournal());
          journalCloseExit = closed;

          if (Exit.isFailure(closed))
            return yield* Effect.failCause(
              Cause.fromReasons([...closed.cause.reasons, Cause.makeDieReason(journalDefect)]),
            );

          // oxlint-disable-next-line anti-slop/no-expected-failure-as-defect -- This teardown proof checks the exact journal fallback defect after interruption.
          return yield* Effect.die(journalDefect);
        });

      yield* f.prepared.activate();
      const closing = yield* closeActivityFixture(f).pipe(Effect.forkChild);
      yield* Deferred.await(releaseEntered);

      const acknowledgement = yield* Effect.gen(function* () {
        yield* Deferred.succeed(acknowledgementWaitStarted, undefined);

        return yield* Deferred.await(interruptionAcknowledged).pipe(
          Effect.timeoutOption("1 second"),
        );
      }).pipe(Effect.forkChild);

      yield* Deferred.await(acknowledgementWaitStarted);
      const interrupter = yield* Fiber.interrupt(closing).pipe(Effect.forkChild);
      yield* Effect.yieldNow;
      yield* TestClock.adjust("1 second");
      const interruptionWasAcknowledged = Option.isSome(yield* Fiber.join(acknowledgement));
      yield* Deferred.succeed(release, undefined);
      const interrupted = yield* Fiber.await(closing);
      const journalFailure = assertJournalCloseFailure(journalCloseExit);

      assertInterruptedFallbackCause(
        interrupted,
        interrupter.id,
        journalFailure,
        journalDefect,
        scopeDefect,
      );
      assert.strictEqual(interruptionWasAcknowledged, true);
      assert.strictEqual(journalCloseAttempts, 1);
      assert.strictEqual(ownerScopeFinalized, true);
    }).pipe(Effect.provide(TestClock.layer())),
  );

  it.effect("actor Effect boundary retains a typed rejection and permit cleanup failures", () =>
    Effect.gen(function* () {
      const projected = yield* Deferred.make<void>();
      const contextScope = yield* Scope.make();
      const coordinator = yield* makeContextCoordinator(contextScope);
      const store = makeStoreFixture();

      const rejection = Failure({
        code: "SemanticValidation",
        path: ["actor", "notification", "preflight"],
        details: {},
        summary: "Notification preparation rejected",
        help: "Retain the typed rejection with permit cleanup failures.",
      });

      const cancellationDefect = new Error("projection permit cancellation failed");
      let notificationPreparations = 0;
      let cancellations = 0;
      let occurrence: Parameters<typeof storeRunner.runFinite>[2] | undefined;

      const context: ContextCoordinator = {
        ...coordinator,
        prepareNotification(root) {
          notificationPreparations += 1;

          return notificationPreparations === 3
            ? Result.fail(rejection)
            : coordinator.prepareNotification(root);
        },
      };

      const port: typeof store.port = {
        ...store.port,
        prepareProjection(fact) {
          const prepared = store.port.prepareProjection(fact);

          if (fact._tag === "terminal") Deferred.doneUnsafe(projected, Effect.void);

          if (Result.isFailure(prepared)) return prepared;

          return Result.succeed({
            ...prepared.success,
            cancel() {
              cancellations += 1;
              prepared.success.cancel();
              throwSync(cancellationDefect);
            },
          });
        },
      };

      const f = yield* makeActorFixture({
        machine: StoreMachine,
        initial: storeSnapshot(),
        store: port,
        context,
        operationRunner: {
          runFinite: (_plan, _signal, current) => {
            occurrence = current;

            return Effect.succeed(33);
          },
          runActivity: (...args) => storeRunner.runActivity(...args),
        },
      });

      const registration = Result.getOrThrow(
        coordinator.register({
          identity: f.identity,
          participant: {
            ref: f.ref,
            snapshot: () => storeSnapshot(),
            offerContext: () =>
              Result.succeed({
                wait: Effect.succeed({ status: "no-op", snapshot: storeSnapshot() }),
                cancel: () => {},
              }),
          },
          providers: [],
          opaqueIdentities: [],
          selectionBatch: () => Result.succeed({ slots: [], requests: [] }),
        } satisfies ContextNode<typeof StoreDefinition>),
      );

      registration.enable();

      const actor = yield* f.prepared.activate();
      yield* actor.dispatch(Result.getOrThrow(StoreDefinition.E.fetch(33)));
      yield* Deferred.await(projected);
      const failed = yield* Effect.exit(actor.flush());

      assert.ok(Exit.isFailure(failed));

      if (Exit.isFailure(failed))
        assertCauseSequence(failed.cause, [
          { _tag: "Fail", value: rejection },
          { _tag: "Die", value: cancellationDefect },
        ]);

      assert.strictEqual(notificationPreparations, 3);
      assert.strictEqual(cancellations, 1);
      assert.ok(occurrence !== undefined);
      yield* Effect.exit(closeActivityFixture(f));
      yield* coordinator.close();
      yield* Scope.close(contextScope, Exit.void);
    }),
  );

  it.effect("lifecycle notification rejection retains its evidence cancellation defect", () =>
    Effect.gen(function* () {
      const contextScope = yield* Scope.make();
      const coordinator = yield* makeContextCoordinator(contextScope);

      const rejection = Failure({
        code: "SemanticValidation",
        path: ["actor", "lifecycle", "notification"],
        details: {},
        summary: "Lifecycle notification preparation rejected",
        help: "Retain the typed rejection with evidence permit cancellation failure.",
      });

      const evidenceDefect = new Error("lifecycle evidence permit cancellation failed");
      const cancellationOrder: string[] = [];
      let rejectNotification = false;

      const context: ContextCoordinator = {
        ...coordinator,
        prepareNotification(root) {
          return rejectNotification
            ? Result.fail(rejection)
            : coordinator.prepareNotification(root);
        },
      };

      const f = yield* makeActorFixture({
        machine: StoreMachine,
        initial: storeSnapshot(),
        context,
        evidencePolicy: (base) =>
          makeEvidencePolicyWithThrowingCancel(base, cancellationOrder, evidenceDefect),
      });

      const registration = Result.getOrThrow(
        coordinator.register({
          identity: f.identity,
          participant: {
            ref: f.ref,
            snapshot: storeSnapshot,
            offerContext: () =>
              Result.succeed({
                wait: Effect.succeed({ status: "no-op", snapshot: storeSnapshot() }),
                cancel: () => {},
              }),
          },
          providers: [],
          opaqueIdentities: [],
          selectionBatch: () => Result.succeed({ slots: [], requests: [] }),
        } satisfies ContextNode<typeof StoreDefinition>),
      );

      registration.enable();

      const actor = yield* f.prepared.activate();
      rejectNotification = true;

      const failed = yield* Effect.exit(
        actor.transitionLifecycle({ to: "suspended", cause: { kind: "attachment" } }),
      );

      assert.ok(Exit.isFailure(failed));

      if (Exit.isFailure(failed))
        assertCauseSequence(failed.cause, [
          { _tag: "Fail", value: rejection },
          { _tag: "Die", value: evidenceDefect },
        ]);

      assert.deepStrictEqual(cancellationOrder, ["evidence"]);
      assert.strictEqual(actor.snapshot().lifecycle, "active");
      rejectNotification = false;
      yield* f.close();
      yield* coordinator.close();
      yield* Scope.close(contextScope, Exit.void);
    }),
  );

  it.effect("built-in completion replays its exact fact after one projection rejection", () =>
    Effect.gen(function* () {
      const secondProjection = yield* Deferred.make<void>();
      const store = makeStoreFixture();
      const projectedFacts: Parameters<typeof store.port.prepareProjection>[0][] = [];
      let attempts = 0;

      const rejection = Failure({
        code: "SemanticValidation",
        path: ["store", "projection", "once"],
        details: {},
        summary: "First projection rejected",
        help: "Retry the exact terminal fact.",
      });

      const port = {
        ...store.port,
        prepareProjection(fact: Parameters<typeof store.port.prepareProjection>[0]) {
          attempts += 1;
          projectedFacts.push(fact);

          if (attempts === 1) return Result.fail(rejection);
          Deferred.doneUnsafe(secondProjection, Effect.void);

          return store.port.prepareProjection(fact);
        },
      } satisfies typeof store.port;

      const f = yield* acquireActivityFixture({
        machine: StoreMachine,
        initial: storeSnapshot(),
        store: port,
        operationRunner: storeRunner,
      });

      const actor = yield* f.prepared.activate();
      yield* actor.dispatch(Result.getOrThrow(StoreDefinition.E.fetch(99)));
      yield* Deferred.await(secondProjection);
      yield* actor.flush();
      assert.strictEqual(attempts, 2);
      assert.strictEqual(projectedFacts[0], projectedFacts[1]);
      assert.strictEqual(actor.snapshot().O.cache.getState([99]).status, "ready");
      assert.strictEqual(actor.snapshot().O.cache.getData([99]), 99);
    }),
  );

  it.effect("persistent projection rejection reaches flush and retires its cursor", () =>
    Effect.gen(function* () {
      const secondProjection = yield* Deferred.make<void>();
      const store = makeStoreFixture();
      let attempts = 0;
      let occurrence: Parameters<typeof storeRunner.runFinite>[2] | undefined;

      const rejection = Failure({
        code: "SemanticValidation",
        path: ["store", "projection", "always"],
        details: {},
        summary: "Projection rejected",
        help: "Inspect the store projection.",
      });

      const port = {
        ...store.port,
        prepareProjection(_fact: Parameters<typeof store.port.prepareProjection>[0]) {
          attempts += 1;

          if (attempts === 2) Deferred.doneUnsafe(secondProjection, Effect.void);

          return Result.fail(rejection);
        },
      } satisfies typeof store.port;

      const f = yield* acquireActivityFixture({
        machine: StoreMachine,
        initial: storeSnapshot(),
        store: port,
        operationRunner: {
          ...storeRunner,
          runFinite: (...args) => {
            occurrence = args[2];

            return storeRunner.runFinite(...args);
          },
        },
      });

      const actor = yield* f.prepared.activate();
      yield* actor.dispatch(Result.getOrThrow(StoreDefinition.E.fetch(99)));
      yield* Deferred.await(secondProjection);
      const flushed = yield* Effect.exit(actor.flush());

      assert.ok(Exit.isFailure(flushed));
      assert.deepStrictEqual(
        flushed.cause.reasons.filter(Cause.isFailReason).map((reason) => reason.error),
        [rejection],
      );
      assert.strictEqual(attempts, 2);
      assert.ok(occurrence !== undefined);
      const revision = actor.snapshot().revision;
      yield* Result.getOrThrow(
        actor.offerOperationFact({
          _tag: "terminal",
          occurrence,
          outcome: { _tag: "success", value: 99 },
        }),
      );
      assert.strictEqual(actor.snapshot().revision, revision);
    }),
  );

  it.effect("shutdown seals operation facts before interrupted work reports completion", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const releaseEntered = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      let occurrence: Parameters<typeof storeRunner.runFinite>[2] | undefined;
      const store = makeStoreFixture();

      const f = yield* acquireActivityFixture({
        machine: StoreMachine,
        initial: storeSnapshot(),
        store: store.port,
        operationRunner: {
          runFinite: (_plan, _signal, current) =>
            Effect.sync(() => {
              occurrence = current;
            }).pipe(
              Effect.andThen(Deferred.succeed(started, undefined)),
              Effect.andThen(Effect.never),
            ),
          runActivity: (...args) => storeRunner.runActivity(...args),
        },
        work: {
          resources: [
            Effect.succeed({
              name: "gated",
              release: Deferred.succeed(releaseEntered, undefined).pipe(
                Effect.andThen(Deferred.await(release)),
              ),
              reacquire: Option.none(),
            }),
          ],
          tasks: [],
          deadlines: [],
        },
      });

      const actor = yield* f.prepared.activate();
      yield* actor.dispatch(Result.getOrThrow(StoreDefinition.E.fetch(1)));
      yield* Deferred.await(started);
      const closing = yield* actor.shutdown().pipe(Effect.forkChild);
      yield* Deferred.await(releaseEntered);
      assert.ok(occurrence !== undefined);
      assert.ok(Result.isFailure(actor.offerOperationFact({ _tag: "complete", occurrence })));
      yield* Deferred.succeed(release, undefined);
      yield* Fiber.join(closing);
      assert.strictEqual(actor.snapshot().lifecycle, "disposed");
    }),
  );
});
