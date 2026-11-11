import { assert, describe, it } from "@effect/vitest";
import { Cause, Clock, Deferred, Effect, Exit, Option, Result } from "effect";

import { captureActorSnapshotCopyPolicy, type ActorPublication } from "../actor/actor-snapshot.js";
import type { OperationOccurrence } from "../actor/actor-activities.js";
import { makeActorActivities } from "../actor/actor-activities.js";
import type { ContextNode, ContextNotification } from "../context/context-coordinator.js";
import { makeContextCoordinator } from "../context/context-coordinator.js";
import type { LifecycleEvidenceDraft } from "../evidence/evidence-record.js";
import { makeRuntimeEvidencePolicy } from "../runtime-services.js";
import { prepareActorLifecycleOperationCut } from "../actor/actor-operation-cut.js";
import {
  acquireActivityFixture,
  ActivityDefinition,
  ActivityMachine,
  activityRunner,
  activitySnapshot,
  activityStore,
  closeActivityFixture,
  type ActivityRun,
} from "./actor-operation-fixture.js";
import {
  makeActorFixture,
  makeStoreFixture,
  StoreDefinition,
  StoreMachine,
  storeRunner,
  storeSnapshot,
} from "./actor-fixture.js";

const throwSync = (error: Error) => {
  throw error;
};

const assertExitDefect = (exit: Exit.Exit<unknown, unknown>, expected: unknown) => {
  assert.ok(Exit.isFailure(exit));

  if (Exit.isFailure(exit)) {
    const defect = Cause.findDefect(exit.cause);

    assert.ok(Result.isSuccess(defect));

    if (Result.isSuccess(defect)) assert.strictEqual(defect.success, expected);
  }
};

it.effect("lifecycle activity preparation defects cancel evidence and notification once", () =>
  Effect.gen(function* () {
    const fixture = yield* acquireActivityFixture({
      machine: ActivityMachine,
      initial: activitySnapshot(ActivityDefinition.S.outside),
      store: activityStore,
    });

    const coordinator = yield* makeContextCoordinator(fixture.ownerScope);
    const active = activitySnapshot(ActivityDefinition.S.active.S.A);

    const node: ContextNode<typeof ActivityDefinition> = {
      identity: fixture.identity,
      participant: {
        ref: fixture.ref,
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
    };

    const registration = Result.getOrThrow(coordinator.register(node));

    registration.enable();

    const baseEvidence = makeRuntimeEvidencePolicy(fixture.journal, yield* Clock.Clock);
    const defect = new Error("activity preparation defect");
    let evidenceCancellations = 0;
    let notificationCancellations = 0;
    let occurrenceCancellations = 0;
    let preparedOccurrences = 0;
    let capturedNotification: Option.Option<ContextNotification> = Option.none();

    const evidence = {
      prepareLifecycle: <Before, After, CauseValue>(
        credit: Parameters<typeof baseEvidence.prepareLifecycle<Before, After, CauseValue>>[0],
        draft: LifecycleEvidenceDraft<Before, After, CauseValue>,
      ) => {
        const prepared = baseEvidence.prepareLifecycle(credit, draft);

        if (Result.isFailure(prepared)) return prepared;

        return Result.succeed({
          accept: () => prepared.success.accept(),
          cancel: () => {
            evidenceCancellations += 1;
            prepared.success.cancel();
          },
        });
      },
    };

    const activities = makeActorActivities(ActivityMachine);
    const before = { ...active, lifecycle: "prepared" as const };

    const publication: ActorPublication<typeof ActivityDefinition> = {
      snapshot: before,
      machineTurnRevision: 0,
      evidenceSequence: fixture.journal.sequence(),
    };

    const lifecycleExit = yield* Effect.exit(
      Effect.sync(() =>
        prepareActorLifecycleOperationCut({
          machine: ActivityMachine,
          copyPolicy: captureActorSnapshotCopyPolicy(ActivityMachine),
          publication,
          command: { to: "active", cause: { kind: "fresh" } },
          mayResume: true,
          identity: fixture.identity,
          provenance: { app: fixture.app, plan: fixture.plan, actor: fixture.identity },
          credit: fixture.credit,
          evidence,
          prepareNotification: (snapshot) => {
            const prepared = coordinator.prepareNotification({
              identity: fixture.identity,
              snapshot,
            });

            if (Result.isSuccess(prepared)) capturedNotification = Option.some(prepared.success);

            return prepared.pipe(Result.map(Option.some));
          },
          cancelNotification: (notification) => {
            notificationCancellations += 1;

            if (Option.isSome(notification)) coordinator.cancel(notification.value);
          },
          hasRunner: true,
          hasStore: true,
          resolveDescriptor: (id) => activities.resolveDescriptor(id),
          prepareOccurrence: (descriptor, key, slot) => {
            preparedOccurrences += 1;

            if (preparedOccurrences === 2) return throwSync(defect);
            const prepared = activities.prepareOccurrence(descriptor, key, slot);

            if (Result.isFailure(prepared)) return prepared;

            return Result.succeed({
              occurrence: prepared.success.occurrence,
              commit: prepared.success.commit,
              cancel: () => {
                occurrenceCancellations += 1;
                prepared.success.cancel();
              },
            });
          },
        }),
      ),
    );

    assertExitDefect(lifecycleExit, defect);
    assert.strictEqual(preparedOccurrences, 2);
    assert.strictEqual(occurrenceCancellations, 1);
    assert.strictEqual(evidenceCancellations, 1);
    assert.strictEqual(notificationCancellations, 1);
    assert.ok(Option.isSome(capturedNotification));
  }),
);

describe("runtime-next actor operations", () => {
  it.effect(
    "successful fact publication preserves static identity without rescanning definitions",
    () =>
      Effect.gen(function* () {
        const originalOperations = Object.getOwnPropertyDescriptor(
          StoreMachine.definition,
          "operations",
        );

        assert.ok(originalOperations !== undefined && "value" in originalOperations);

        let operationTableWalks = 0;

        const operations = new Proxy(StoreMachine.definition.operations, {
          ownKeys(target) {
            operationTableWalks += 1;

            return Reflect.ownKeys(target);
          },
        });

        Object.defineProperty(StoreMachine.definition, "operations", {
          ...originalOperations,
          value: operations,
        });

        const store = makeStoreFixture();
        const projected = yield* Deferred.make<void>();
        const operationStarted = yield* Deferred.make<void>();
        const releaseOperation = yield* Deferred.make<void>();

        const port: typeof store.port = {
          ...store.port,
          prepareProjection(fact) {
            const prepared = store.port.prepareProjection(fact);

            if (fact._tag === "terminal" && fact.outcome._tag === "success")
              Deferred.doneUnsafe(projected, Effect.void);

            return prepared;
          },
        };

        yield* Effect.acquireUseRelease(
          makeActorFixture({
            machine: StoreMachine,
            initial: storeSnapshot(),
            store: port,
            operationRunner: {
              ...storeRunner,
              runFinite: () =>
                Effect.sync(() => Deferred.doneUnsafe(operationStarted, Effect.void)).pipe(
                  Effect.andThen(Deferred.await(releaseOperation)),
                  Effect.as(73),
                ),
            },
          }),
          (fixture) =>
            Effect.gen(function* () {
              assert.strictEqual(operationTableWalks, 2);
              const actor = yield* fixture.prepared.activate();

              yield* actor.dispatch(Result.getOrThrow(StoreDefinition.E.fetch(73)));
              yield* Deferred.await(operationStarted);
              const scansBeforeFact = operationTableWalks;

              assert.strictEqual(scansBeforeFact, 4);
              yield* Deferred.succeed(releaseOperation, undefined);
              yield* Deferred.await(projected);
              yield* actor.flush();

              assert.strictEqual(actor.snapshot().state, StoreDefinition.S.ready);
              assert.strictEqual(actor.snapshot().O.cache.getData([73]), 73);
              assert.strictEqual(actor.snapshot().revision, 3);
              assert.strictEqual(actor.snapshot().observedStoreRevision, 2);
              assert.strictEqual(operationTableWalks, scansBeforeFact);
            }),
          (fixture) => fixture.close(),
        ).pipe(
          Effect.ensuring(
            Effect.sync(() =>
              Object.defineProperty(StoreMachine.definition, "operations", originalOperations),
            ),
          ),
        );
      }),
  );

  // Owner: P06.
  // Source: refactor.md ActorEngine activity reconciliation and SEM-019.
  // Contract/correction: Compound activities follow the active ancestor-to-leaf state path.
  // Setup: A compound active state owns one activity while its A and B leaves declare transitions.
  // Action: Enter, move between child leaves, then exit the compound state.
  // Observable result: The ancestor occurrence starts once, stays live across child transitions, then rejects stale facts.
  // Failure/cleanup: Shutdown finalizes the ancestor and every leaf activity exactly once.
  it.effect("compound state activities follow the active ancestor path", () =>
    Effect.gen(function* () {
      const starts: ActivityRun[] = [];
      const finalizers: OperationOccurrence<typeof ActivityDefinition>[] = [];
      const parentStarted = yield* Deferred.make<void>();
      const parentFinalized = yield* Deferred.make<void>();

      const outcome = yield* Effect.acquireUseRelease(
        makeActorFixture({
          machine: ActivityMachine,
          initial: activitySnapshot(ActivityDefinition.S.outside),
          store: activityStore,
          operationRunner: activityRunner(
            starts,
            finalizers,
            (run) => {
              if (run.occurrence.key[0] === 8) Deferred.doneUnsafe(parentStarted, Effect.void);
            },
            () => {},
            (run) => {
              if (run.occurrence.key[0] === 8) Deferred.doneUnsafe(parentFinalized, Effect.void);
            },
          ),
        }),
        (f) =>
          Effect.gen(function* () {
            const actor = yield* f.prepared.activate();

            yield* actor.dispatch(Result.getOrThrow(ActivityDefinition.E.enter()));
            yield* Deferred.await(parentStarted);
            const parent = starts.find((run) => run.occurrence.key[0] === 8);

            assert.ok(parent !== undefined);
            assert.strictEqual(starts.filter((run) => run.occurrence.key[0] === 8).length, 1);

            yield* actor.dispatch(Result.getOrThrow(ActivityDefinition.E.moveB(false)));
            yield* actor.dispatch(Result.getOrThrow(ActivityDefinition.E.backA()));

            assert.strictEqual(parent.signal.aborted, false);
            assert.strictEqual(starts.filter((run) => run.occurrence.key[0] === 8).length, 1);

            yield* actor.dispatch(Result.getOrThrow(ActivityDefinition.E.exit()));
            yield* Deferred.await(parentFinalized);
            assert.strictEqual(parent.signal.aborted, true);
            const revision = actor.snapshot().revision;

            yield* Result.getOrThrow(
              actor.offerOperationFact({ _tag: "complete", occurrence: parent.occurrence }),
            );
            assert.strictEqual(actor.snapshot().revision, revision);

            return parent.occurrence;
          }),
        closeActivityFixture,
      );

      assert.strictEqual(finalizers.filter((occurrence) => occurrence === outcome).length, 1);
    }),
  );

  // Owner: P06.
  // Source: refactor.md ActorEngine activity reconciliation and SEM-019.
  // Contract/correction: Each named declaration owns an independent activity slot.
  // Setup: Two activity names use the same descriptor and canonical key in one leaf state.
  // Action: Enter the leaf, exit it, and submit stale completion facts for both occurrences.
  // Observable result: Both workers are independently live and later fenced from publication.
  // Failure/cleanup: Shutdown finalizes each worker once.
  it.effect("same-key named activities retain independent slots", () =>
    Effect.gen(function* () {
      const starts: ActivityRun[] = [];
      const finalizers: OperationOccurrence<typeof ActivityDefinition>[] = [];
      const keyedStarts = yield* Deferred.make<void>();
      const keyedFinalizers = yield* Deferred.make<void>();
      let startCount = 0;
      let finalizerCount = 0;

      const outcome = yield* Effect.acquireUseRelease(
        makeActorFixture({
          machine: ActivityMachine,
          initial: activitySnapshot(ActivityDefinition.S.outside),
          store: activityStore,
          operationRunner: activityRunner(
            starts,
            finalizers,
            (run) => {
              if (run.occurrence.key[0] === 7 && ++startCount === 2)
                Deferred.doneUnsafe(keyedStarts, Effect.void);
            },
            () => {},
            (run) => {
              if (run.occurrence.key[0] === 7 && ++finalizerCount === 2)
                Deferred.doneUnsafe(keyedFinalizers, Effect.void);
            },
          ),
        }),
        (f) =>
          Effect.gen(function* () {
            const actor = yield* f.prepared.activate();

            yield* actor.dispatch(Result.getOrThrow(ActivityDefinition.E.enter()));
            yield* Deferred.await(keyedStarts);
            const keyed = starts.filter((run) => run.occurrence.key[0] === 7);

            assert.strictEqual(keyed.length, 2);
            assert.notStrictEqual(keyed[0]?.occurrence, keyed[1]?.occurrence);
            assert.strictEqual(keyed[0]?.signal.aborted, false);
            assert.strictEqual(keyed[1]?.signal.aborted, false);

            yield* actor.dispatch(Result.getOrThrow(ActivityDefinition.E.exit()));
            yield* Deferred.await(keyedFinalizers);
            assert.strictEqual(keyed[0]?.signal.aborted, true);
            assert.strictEqual(keyed[1]?.signal.aborted, true);
            const revision = actor.snapshot().revision;

            for (const run of keyed)
              yield* Result.getOrThrow(
                actor.offerOperationFact({ _tag: "complete", occurrence: run.occurrence }),
              );

            assert.strictEqual(actor.snapshot().revision, revision);

            return keyed.map((run) => run.occurrence);
          }),
        closeActivityFixture,
      );

      for (const occurrence of outcome)
        assert.strictEqual(finalizers.filter((finalized) => finalized === occurrence).length, 1);
    }),
  );

  // Owner: P06.
  // Source: RN-ACTOR-017 and refactor.md ActorEngine mapped-event worklist.
  // Contract/correction: Reconcile continuing launches against final live slots after A-to-B-to-C.
  // Setup: A mapped move leaves B before its activity can start; the parent action also launches a finite lookup.
  // Action: Drain the mapped chain, then submit a stale A activity completion.
  // Observable result: The evicted B activity never starts while the finite event-bound lookup still runs.
  // Failure/cleanup: Shutdown finalizes all started activities once.
  it.effect("mapped child activities start only while their final slot is live", () =>
    Effect.gen(function* () {
      const starts: ActivityRun[] = [];
      const finalizers: OperationOccurrence<typeof ActivityDefinition>[] = [];
      const aStarted = yield* Deferred.make<void>();
      const aFinalized = yield* Deferred.make<void>();
      const finiteStarted = yield* Deferred.make<void>();
      const finiteFinalized = yield* Deferred.make<void>();

      let finiteStarts = 0;
      let finiteFinalizers = 0;

      const bState = Object.values(ActivityMachine.compiled.states).find(
        (state) => state.kind === "leaf" && Object.is(state.state, ActivityDefinition.S.active.S.B),
      );

      const bActivity = bState?.activities.transient;

      const aState = Object.values(ActivityMachine.compiled.states).find(
        (state) => state.kind === "leaf" && Object.is(state.state, ActivityDefinition.S.active.S.A),
      );

      const aActivity = aState?.activities.first;

      const outcome = yield* Effect.acquireUseRelease(
        makeActorFixture({
          machine: ActivityMachine,
          initial: activitySnapshot(ActivityDefinition.S.outside),
          store: activityStore,
          operationRunner: activityRunner(
            starts,
            finalizers,
            (run) => {
              if (run.plan === aActivity) Deferred.doneUnsafe(aStarted, Effect.void);
            },
            () => {
              finiteStarts += 1;
              Deferred.doneUnsafe(finiteStarted, Effect.void);
            },
            (run) => {
              if (run.plan === aActivity) Deferred.doneUnsafe(aFinalized, Effect.void);
            },
            () => {
              finiteFinalizers += 1;
              Deferred.doneUnsafe(finiteFinalized, Effect.void);
            },
          ),
        }),
        (f) =>
          Effect.gen(function* () {
            const actor = yield* f.prepared.activate();

            yield* actor.dispatch(Result.getOrThrow(ActivityDefinition.E.enter()));
            yield* Deferred.await(aStarted);
            const aRun = starts.find((run) => run.plan === aActivity);

            assert.ok(aRun !== undefined);
            assert.strictEqual(aRun.signal.aborted, false);
            yield* actor.dispatch(Result.getOrThrow(ActivityDefinition.E.chain()));
            yield* Deferred.await(aFinalized);
            yield* Deferred.await(finiteStarted);
            assert.strictEqual(actor.snapshot().state, ActivityDefinition.S.active.S.C);
            assert.strictEqual(finiteStarts, 1);
            assert.strictEqual(finiteFinalizers, 0);
            assert.strictEqual(aRun.signal.aborted, true);
            assert.strictEqual(
              finalizers.filter((occurrence) => occurrence === aRun.occurrence).length,
              1,
            );
            assert.strictEqual(
              starts.some((run) => run.plan === bActivity),
              false,
            );
            const revision = actor.snapshot().revision;

            yield* Result.getOrThrow(
              actor.offerOperationFact({ _tag: "complete", occurrence: aRun.occurrence }),
            );
            assert.strictEqual(actor.snapshot().revision, revision);

            return starts.map((run) => run.occurrence);
          }),
        closeActivityFixture,
      );

      yield* Deferred.await(finiteFinalized);
      assert.strictEqual(finiteFinalizers, 1);

      for (const occurrence of outcome)
        assert.strictEqual(finalizers.filter((finalized) => finalized === occurrence).length, 1);
    }),
  );
});
