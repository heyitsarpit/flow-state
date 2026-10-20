import { assert, describe, it } from "@effect/vitest";
import { Cause, Deferred, Effect, Exit, Fiber, Option, Result, Scope, Stream } from "effect";
import { TestClock } from "effect/testing";

import { Failure, type PublicDiagnostic } from "../../diagnostic/diagnostic.js";
import { makeActorLease } from "../actor/actor-lease.js";
import { makeFlowRuntimeShell } from "../runtime-shell.js";
import { copyStructural } from "../structural-copy.js";
import {
  ChainDefinition,
  ChainMachine,
  chainSteps,
  CounterDefinition,
  CounterMachine,
  chainSnapshot,
  counterSnapshot,
  makeActorFixture,
  makeStoreFixture,
  StoreDefinition,
  StoreMachine,
  storeRunner,
  storeSnapshot,
  ContextDefinition,
  ContextMachine,
  ContextProvider,
  ContextProviderMachine,
  contextSnapshot,
  contextProviderSnapshot,
} from "./actor-fixture.js";
import { makeActorMailbox } from "../actor/actor-mailbox.js";
import { makeContextTicket } from "../context/context-ticket.js";

const observerDefect = () => {
  throw new Error("observer defect");
};

const lateObserverDefect = (snapshot: { observedStoreRevision: number }) => {
  if (snapshot.observedStoreRevision === 1) throw new Error("late observer defect");
};

describe("runtime-next actors", () => {
  // Owner: P06.
  // Source: runtime-integration.test.ts:1082 "projects lifecycle consistently through snapshot, stream, callback, and evidence".
  // Source: runtime-integration.test.ts:2075 "publishes lifecycle transitions through one coherent snapshot cut".
  // Source: runtime-integration.test.ts:4490 "preserves fresh and restored revision baselines before later lifecycle cuts".
  // Contract/correction: SNAP-001; HOST-005; refactor.md ActorEngine lifecycle.
  // Setup: An active actor observed by snapshot query, stream, callback, and evidence.
  // Action: Suspend, resume, then dispose.
  // Observable result: Each lifecycle transition advances one publication revision and all observers see the same lifecycle and state cut.
  // Failure/cleanup: After disposal, commands reject and no later provider update publishes to that actor.
  it.effect("RN-ACTOR-002 lifecycle publishes one coherent snapshot revision", () =>
    Effect.gen(function* () {
      const callbacks: number[] = [];

      const f = yield* makeActorFixture({
        machine: CounterMachine,
        initial: counterSnapshot(),
        onSnapshot: (snapshot) => callbacks.push(snapshot.revision),
      });

      const snapshots = yield* Stream.runCollect(f.prepared.snapshots.pipe(Stream.take(3))).pipe(
        Effect.forkChild,
      );

      yield* Effect.yieldNow;
      const actor = yield* f.prepared.activate();
      const first = yield* actor.dispatch(Result.getOrThrow(CounterDefinition.E.go(2)));
      yield* actor.transitionLifecycle({ to: "suspended", cause: { kind: "attachment" } });
      const observed = yield* Fiber.join(snapshots);

      assert.deepStrictEqual(
        [...observed].map((snapshot) => snapshot.lifecycle),
        ["prepared", "active", "suspended"],
      );
      assert.deepStrictEqual(
        [...observed].map((snapshot) => snapshot.revision),
        [0, 1, 3],
      );
      assert.strictEqual(first.publicationRevision, 2);
      assert.deepStrictEqual(callbacks, [1, 2, 3]);
      assert.strictEqual(f.journal.sequence(), 3);

      yield* actor.transitionLifecycle({ to: "active", cause: { kind: "attachment" } });
      assert.strictEqual(actor.snapshot().revision, 4);
      assert.strictEqual(actor.snapshot().memory.count, 2);
      yield* f.close();
      assert.strictEqual(actor.snapshot().lifecycle, "disposed");
      assert.ok(Result.isFailure(actor.send(Result.getOrThrow(CounterDefinition.E.go(1)))));
    }),
  );

  // Owner: P06.
  // Source: actor-engine.test.ts:2623 "isolates a throwing snapshot callback from committed actor truth".
  // Source: runtime-integration.test.ts:1150 "keeps a committed resumed actor routable after a lifecycle callback defect".
  // Contract/correction: Approved correction 2; ARCH-012; refactor.md one-cut publication protocol.
  // Frozen outcome: Frozen observer failure could close or roll back an already committed actor.
  // Required new outcome: Observer failure leaves the committed actor routable and its receipt unchanged.
  // Setup: A lifecycle observer that throws after a resume cut commits.
  // Action: Resume and then dispatch an event.
  // Observable result: The actor stays active and routable; the committed revision and receipt remain valid; frozen behavior could close or roll back the actor.
  // Failure/cleanup: Observer failure is isolated and recorded without skipping actor cleanup later.
  it.effect("RN-ACTOR-003 observer defects cannot undo a committed lifecycle cut", () =>
    Effect.gen(function* () {
      const issues: PublicDiagnostic[] = [];

      const f = yield* makeActorFixture({
        machine: CounterMachine,
        initial: counterSnapshot(),
        onSnapshot: observerDefect,
        onObserverIssue: (issue) => {
          issues.push(issue);
        },
      });

      const actor = yield* f.prepared.activate();
      yield* actor.transitionLifecycle({ to: "suspended", cause: { kind: "attachment" } });
      yield* actor.transitionLifecycle({ to: "active", cause: { kind: "attachment" } });
      const receipt = yield* actor.dispatch(Result.getOrThrow(CounterDefinition.E.go(2)));

      assert.strictEqual(actor.snapshot().lifecycle, "active");
      assert.strictEqual(actor.snapshot().memory.count, 2);
      assert.strictEqual(receipt.publicationRevision, actor.snapshot().revision);
      assert.ok(issues.length >= 3);
      yield* f.close();
    }),
  );

  // Owner: P06.
  // Source: runtime-integration.test.ts:1205 "blocks assembled actor admission while suspend drains an in-flight command".
  // Source: runtime-integration.test.ts:1700 "walkthrough: suspension rejects commands and resume restores admission".
  // Source: runtime-integration.test.ts:4020 "keeps admission closed until resume reconciliation commits".
  // Contract/correction: SEM-024; HOST-005; refactor.md ActorEngine lifecycle.
  // Setup: An active actor with an in-flight command and a dependent provider.
  // Action: Suspend during work, attempt sends, then resume after context reconciliation.
  // Observable result: Admitted work drains before suspension; new sends reject while suspended; resumed actor accepts only after a coherent context cut.
  // Failure/cleanup: Disposal from either state closes resources once and rejects later sends.
  it.effect("RN-ACTOR-004 suspension gates sends until resume commits", () =>
    Effect.gen(function* () {
      const release = yield* Deferred.make<void>();
      let providerChecks = 0;

      const f = yield* makeActorFixture({
        machine: CounterMachine,
        initial: counterSnapshot(),
        validateProviders: Effect.suspend(() => {
          providerChecks += 1;

          return providerChecks === 1 ? Effect.void : Deferred.await(release);
        }),
      });

      const actor = yield* f.prepared.activate();
      yield* actor.transitionLifecycle({ to: "suspended", cause: { kind: "attachment" } });
      const event = Result.getOrThrow(CounterDefinition.E.go(1));
      assert.ok(Result.isFailure(actor.send(event)));

      const resume = yield* actor
        .transitionLifecycle({ to: "active", cause: { kind: "attachment" } })
        .pipe(Effect.forkChild);

      yield* Effect.yieldNow;
      assert.ok(Result.isFailure(actor.send(event)));
      yield* Deferred.succeed(release, undefined);
      yield* Fiber.join(resume);
      assert.ok(Result.isSuccess(actor.send(event)));
      yield* actor.flush();
      assert.strictEqual(actor.snapshot().memory.count, 1);
      yield* f.close();
    }),
  );

  // Owner: P06.
  // Source: actor-engine.test.ts:2772 "serializes owner disposal through the actor engine lane".
  // Source: runtime-integration.test.ts:1258 "drains admitted work before publishing assembled disposal".
  // Source: runtime-integration.test.ts:1322 "keeps assembled disposal gated when a public lifecycle command is invoked".
  // Contract/correction: SEM-024; STD-06/08; refactor.md ActorEngine lifecycle.
  // Setup: An actor with one admitted event and a disposal request.
  // Action: Hold the event cut, start disposal, then release the cut.
  // Observable result: The turn and acknowledgement precede the disposed lifecycle publication; later dispatch and send reject.
  // Failure/cleanup: Finalizers run once and a second disposal joins the same Exit.
  it.effect("RN-ACTOR-005 disposal drains prior work and closes admission", () =>
    Effect.gen(function* () {
      chainSteps.length = 0;

      const f = yield* makeActorFixture({
        machine: ChainMachine,
        initial: chainSnapshot(),
        journalCapacity: 128,
      });

      const actor = yield* f.prepared.activate();
      const event = Result.getOrThrow(ChainDefinition.E.step(70));
      const parent = actor.dispatch(event);
      const closing = yield* actor.shutdown().pipe(Effect.forkChild);
      const receipt = yield* parent;
      yield* Fiber.join(closing);

      assert.strictEqual(receipt.publicationRevision, 2);
      assert.deepStrictEqual(
        chainSteps,
        Array.from({ length: 71 }, (_, index) => 70 - index),
      );
      assert.strictEqual(actor.snapshot().memory.count, 71);
      assert.strictEqual(actor.snapshot().lifecycle, "disposed");
      assert.strictEqual(actor.snapshot().revision, 73);
      assert.ok(Result.isFailure(actor.send(event)));
      assert.ok(Exit.isFailure(yield* Effect.exit(actor.dispatch(event))));
      yield* f.close();
    }),
  );

  // Owner: P06.
  // Source: runtime-integration.test.ts:4561 "rejects lifecycle publication preflight before changing admission or resources".
  // Contract/correction: Approved correction 2; refactor.md ActorEngine one-cut publication protocol.
  // Frozen outcome: Frozen lifecycle publication could fail after changing admission or resources.
  // Required new outcome: Preflight rejects before any lifecycle, admission, evidence, or resource mutation.
  // Setup: An actor whose next lifecycle evidence preflight fails.
  // Action: Attempt suspend or dispose, inspect public snapshot and resource state, then retry.
  // Observable result: The failed attempt makes no partial lifecycle, admission, evidence, or resource change.
  // Failure/cleanup: Retry can commit; final cleanup still runs once.
  it.effect("RN-ACTOR-006 failed lifecycle preflight leaves actor and resources unchanged", () =>
    Effect.gen(function* () {
      const failure = Failure({
        code: "InvalidTraceRecord",
        path: ["test", "lifecycle"],
        details: {},
        summary: "Test preflight rejection",
        help: "Retry after evidence admission returns.",
      });

      let rejectNext = false;

      const f = yield* makeActorFixture({
        machine: CounterMachine,
        initial: counterSnapshot(),
        evidencePolicy: (base) => ({
          ...base,
          prepareLifecycle: (...args) =>
            rejectNext
              ? ((rejectNext = false), Result.fail(failure))
              : base.prepareLifecycle(...args),
        }),
      });

      const actor = yield* f.prepared.activate();
      rejectNext = true;
      const before = actor.snapshot();
      const sequence = f.journal.sequence();

      const rejected = yield* Effect.exit(
        actor.transitionLifecycle({ to: "suspended", cause: { kind: "attachment" } }),
      );

      assert.ok(Exit.isFailure(rejected));
      assert.strictEqual(actor.snapshot(), before);
      assert.strictEqual(f.journal.sequence(), sequence);
      assert.ok(Result.isSuccess(actor.send(Result.getOrThrow(CounterDefinition.E.go(1)))));
      yield* actor.flush();
      yield* actor.transitionLifecycle({ to: "suspended", cause: { kind: "attachment" } });
      yield* f.close();
    }),
  );

  // Owner: P06.
  // Source: runtime-integration.test.ts:3201 "TIM1 assembled runtime owns interrupted and overdue timer claims".
  // Contract/correction: SEM-024; STD-08; refactor.md ActorEngine timer behavior.
  // Setup: An actor with one armed deadline whose action sends an event under TestClock.
  // Action: Suspend before the deadline, advance past it, resume, then suspend and resume again.
  // Observable result: The overdue timer sends one event on resume and does not fire again.
  // Failure/cleanup: Close the actor after checking timer and event state.
  it.effect("RN-ACTOR-007 timer claims use Effect Clock and settle across interruption", () =>
    Effect.gen(function* () {
      let fires = 0;
      let trigger: () => Result.Result<void, PublicDiagnostic> = () => Result.succeed(undefined);

      const deadline = {
        name: "refresh",
        startedAt: 0,
        dueAt: 100,
        generation: 1,
        status: "armed" as const,
        fire: Option.some(
          Effect.sync(() => {
            fires += 1;
            Result.getOrThrow(trigger());
          }),
        ),
      };

      const f = yield* makeActorFixture({
        machine: CounterMachine,
        initial: { ...counterSnapshot(), timers: [{ name: "refresh", startedAt: 0, dueAt: 100 }] },
        work: { resources: [], tasks: [], deadlines: [deadline] },
      });

      const actor = yield* f.prepared.activate();
      trigger = () => actor.send(Result.getOrThrow(CounterDefinition.E.go(5)));
      yield* TestClock.adjust(60);
      yield* actor.transitionLifecycle({ to: "suspended", cause: { kind: "attachment" } });
      yield* TestClock.adjust(50);
      assert.strictEqual(fires, 0);
      yield* actor.transitionLifecycle({ to: "active", cause: { kind: "attachment" } });
      yield* Effect.yieldNow;
      yield* actor.flush();

      assert.strictEqual(fires, 1);
      assert.strictEqual(actor.snapshot().memory.count, 5);
      yield* actor.transitionLifecycle({ to: "suspended", cause: { kind: "attachment" } });
      yield* actor.transitionLifecycle({ to: "active", cause: { kind: "attachment" } });
      yield* TestClock.adjust(500);
      assert.strictEqual(fires, 1);
      yield* f.close();
    }).pipe(Effect.provide(TestClock.layer())),
  );

  // Owner: P06.
  // Source: actor-engine.test.ts:375 "recursively owns memory and issue data" (the memory-detachment case).
  // Contract/correction: STD-11; HOST-005; refactor.md port immutability.
  // Setup: A prepared actor with caller-owned memory and a retained snapshot.
  // Action: Mutate caller memory, publish one event, then attempt to change the captured snapshot.
  // Observable result: Actor memory stays detached from caller mutation and the published issue collection is frozen.
  // Failure/cleanup: Caller mutation cannot change actor truth; close the actor after the assertions.
  it.effect("RN-ACTOR-008 published snapshots and diagnostics are owned immutable data", () =>
    Effect.gen(function* () {
      const callerMemory = { count: 2 };

      const f = yield* makeActorFixture({
        machine: CounterMachine,
        initial: { ...counterSnapshot(), memory: callerMemory },
      });

      const prepared = f.prepared.snapshot();

      callerMemory.count = 99;
      assert.strictEqual(prepared.memory.count, 2);
      assert.strictEqual(Reflect.set(prepared.memory, "count", 500), false);
      const actor = yield* f.prepared.activate();
      yield* actor.dispatch(Result.getOrThrow(CounterDefinition.E.go(3)));
      assert.strictEqual(prepared.memory.count, 2);
      assert.strictEqual(actor.snapshot().memory.count, 5);
      assert.ok(Object.isFrozen(actor.snapshot().issues));
      yield* f.close();
    }),
  );

  // Owner: P06.
  // Source: runtime-integration.test.ts:6532 "preserves ordered snapshot delivery without making disposal wait for a slow reader".
  // Contract/correction: Approved correction 3; STD-09; refactor.md ActorEngine bounded snapshots.
  // Frozen outcome: Frozen snapshot subscriber queues could grow with a slow reader.
  // Required new outcome: Snapshot delivery is bounded or coalesced and actor close does not wait for a slow reader.
  // Setup: One subscriber held at revision 1 while the actor commits ten turns.
  // Action: Dispose before releasing the reader, then collect its retained snapshots.
  // Observable result: Disposal completes while the reader is gated; collection keeps revision 1 and the terminal cut within three values.
  // Failure/cleanup: Release and join the reader after actor close.
  it.effect("RN-ACTOR-009 slow snapshot readers cannot stall actor disposal", () =>
    Effect.gen(function* () {
      const f = yield* makeActorFixture({ machine: CounterMachine, initial: counterSnapshot() });
      const actor = yield* f.prepared.activate();
      const release = yield* Deferred.make<void>();

      const reader = yield* Stream.runCollect(
        actor.snapshots.pipe(
          Stream.mapEffect((snapshot) =>
            snapshot.revision === 1
              ? Deferred.await(release).pipe(Effect.as(snapshot))
              : Effect.succeed(snapshot),
          ),
        ),
      ).pipe(Effect.forkChild);

      yield* Effect.yieldNow;

      for (let index = 0; index < 10; index += 1)
        yield* actor.dispatch(Result.getOrThrow(CounterDefinition.E.go(1)));

      const closing = yield* f.close().pipe(Effect.forkChild);
      yield* Fiber.join(closing);
      yield* Deferred.succeed(release, undefined);
      const observed = yield* Fiber.join(reader);

      assert.ok(observed.length <= 3);
      assert.strictEqual(observed[0]?.revision, 1);
      assert.strictEqual(observed.at(-1)?.lifecycle, "disposed");
      assert.strictEqual(actor.snapshot().memory.count, 10);
    }),
  );

  // Owner: P03.
  // Source: runtime-integration.test.ts:3380 "caches a failed assembled actor release before evidence close".
  // Source: runtime-integration.test.ts:3443 "linearizes actor lease disposal against runtime shutdown".
  // Source: runtime-integration.test.ts:3523 "CREDIT-FOLLOWER preserves assembled actor credit during interrupted disposal".
  // Contract/correction: API-011; refactor.md ActorLease.
  // Setup: An exposed lease whose finalizer is gated.
  // Action: Start individual and owner-joined disposal concurrently, interrupt one waiter, then release cleanup.
  // Observable result: Completed callers observe the same terminal lease result.
  // Failure/cleanup: Exactly one finalizer runs; failed cleanup remains cached for later owner close.
  it.effect("RN-ACTOR-010 concurrent lease disposal callers share one cleanup", () =>
    Effect.gen(function* () {
      const shell = makeFlowRuntimeShell<void, never, PublicDiagnostic>({
        bootstrap: () => Effect.void,
      });

      yield* shell.ready;
      const ownerScope = yield* Scope.make();
      const entered = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();

      const failure = Failure({
        code: "CleanupFailed",
        path: [],
        details: {},
        summary: "Lease cleanup failed",
        help: "Inspect the retained cleanup cause.",
      });

      let cleanups = 0;

      const lease = makeActorLease({
        actor: "shared actor",
        ownerScope,
        preflight: () => Effect.void,
        cleanup: () =>
          Effect.gen(function* () {
            cleanups += 1;
            yield* Deferred.succeed(entered, undefined);
            yield* Deferred.await(release);

            return yield* Effect.fail(failure);
          }),
        retire: () => Effect.void,
      });

      assert.ok((yield* shell.registerActor({ dispose: () => lease.dispose() })).accepted);

      const individual = yield* lease.dispose().pipe(Effect.forkChild);
      yield* Deferred.await(entered);
      const ownerClose = yield* shell.close().pipe(Effect.forkChild);
      const second = yield* lease.dispose().pipe(Effect.forkChild);
      yield* Fiber.interrupt(individual);
      yield* Deferred.succeed(release, undefined);

      const secondExit = yield* Fiber.await(second);
      const closeExit = yield* Fiber.await(ownerClose);
      assert.ok(Exit.isFailure(secondExit));
      assert.ok(Exit.isFailure(closeExit));

      if (Exit.isFailure(closeExit))
        assert.strictEqual(closeExit.cause.reasons.find(Cause.isFailReason)?.error, failure);
      assert.deepStrictEqual(yield* Effect.exit(lease.dispose()), secondExit);
      assert.strictEqual(cleanups, 1);
      yield* Scope.close(ownerScope, Exit.void);
    }),
  );

  // Owner: P04.
  // Source: actor-engine.test.ts:345 "captures data properties before copying a prepared snapshot".
  // Contract/correction: STD-03/11; refactor.md structural-copy actor policy.
  // Setup: Nested actor-policy values including accessor, sparse, cyclic, and deep variants.
  // Action: Copy through the P04 structural-copy actor policy and mutate the original.
  // Observable result: The copy is independently owned; unsupported actor-policy values reject before returning a value; frozen copy used a recursive helper.
  // Failure/cleanup: Caller originals remain unfrozen and unchanged; rejection leaves no partial copied value.
  it("RN-ACTOR-012 actor copy policy owns structured snapshot values", () => {
    const shared = { value: 1 };
    const source = { left: shared, right: shared, values: [1, 2] };
    const copy = Result.getOrThrow(copyStructural(source, "actor"));

    shared.value = 2;
    source.values[0] = 9;
    assert.notStrictEqual(copy, source);
    assert.strictEqual(copy.left, copy.right);
    assert.strictEqual(copy.left.value, 1);
    assert.deepStrictEqual(copy.values, [1, 2]);
    assert.strictEqual(Object.isFrozen(source), false);

    const cyclic = { next: {} };
    cyclic.next = cyclic;
    assert.ok(Result.isFailure(copyStructural(cyclic, "actor")));
    const sparse = [1];
    sparse.length = 2;
    assert.ok(Result.isFailure(copyStructural(sparse, "actor")));

    const accessor = {};
    Object.defineProperty(accessor, "value", { enumerable: true, get: () => 1 });
    assert.ok(Result.isFailure(copyStructural(accessor, "actor")));

    type DeepNode = { next: DeepNode } | { value: number };

    let deep: DeepNode = { value: 1 };

    for (let index = 0; index < 20_000; index += 1) deep = { next: deep };

    assert.ok(Result.isSuccess(copyStructural(deep, "actor")));
  });

  // Owner: P06.
  // Source: actor-engine.test.ts:2942 "reserves one ordered control place after a full ordinary prefix".
  // Contract/correction: ARCH-012; STD-09; refactor.md ActorEngine mailbox.
  // Setup: A prepared actor with the ordinary command capacity and one suspend control.
  // Action: Fill the accepted prefix, enqueue suspend, reject one extra send, then activate and drain.
  // Observable result: The accepted prefix runs before suspend; overflow is a synchronous typed rejection.
  // Failure/cleanup: Close the actor after the accepted prefix and control command settle.
  it.effect("RN-ACTOR-013 mailbox preserves FIFO and reserved control capacity", () =>
    Effect.gen(function* () {
      const f = yield* makeActorFixture({
        machine: CounterMachine,
        initial: counterSnapshot(),
        journalCapacity: 128,
      });

      const event = Result.getOrThrow(CounterDefinition.E.go(1));

      for (let index = 0; index < 64; index += 1)
        assert.ok(Result.isSuccess(f.prepared.send(event)));

      const suspend = f.prepared.transitionLifecycle({
        to: "suspended",
        cause: { kind: "attachment" },
      });

      assert.ok(Result.isFailure(f.prepared.send(event)));
      const actor = yield* f.prepared.activate();
      yield* suspend;
      assert.strictEqual(actor.snapshot().memory.count, 64);
      assert.strictEqual(actor.snapshot().lifecycle, "suspended");
      assert.strictEqual(actor.snapshot().revision, 66);
      yield* f.close();
    }),
  );

  // Owner: P06.
  // Source: actor-engine.test.ts:804 "acknowledges the committed cut before user work begins".
  // Source: actor-engine.test.ts:929 "retains the prior cut after evidence preflight failure and retries later".
  // Source: actor-engine.test.ts:1013 "persists machine-turn revisions across successful event turns".
  // Source: actor-engine.test.ts:1069 "rejects a stale validated store result without changing the committed cut".
  // Source: actor-engine.test.ts:1126 "publishes one issue-only cut for typed failures, defects, and interruptions".
  // Source: actor-engine.test.ts:1643 "delivers snapshots only after evidence and acknowledgement".
  // Source: actor-engine.test.ts:1742 "publishes the matching actor snapshot after store commit".
  // Source: actor-engine.test.ts:1787 "rejects a hostile store result before owner mutation".
  // Source: actor-engine.test.ts:1848 "finalizes a production evidence record with the committed store cut".
  // Source: actor-engine.test.ts:2080 "commits one complete actor and store cut".
  // Source: actor-engine.test.ts:2119 "drops a failed plan without partial publication".
  // Source: actor-engine.test.ts:2162 "retains a planning defect and discards staged actions".
  // Source: actor-engine.test.ts:2661 "commits evidence when no snapshot subscriber is attached".
  // Source: actor-engine.test.ts:2797 "publishes complete actor snapshots".
  // Source: actor-engine.test.ts:2812 "prepares evidence before the atomic actor and store cut".
  // Source: turn-plan.test.ts:738 "keeps commit revisions and evidence allocation out of the pure plan".
  // Source: turn-plan.test.ts:906 "plans independently from the same captured pre-turn snapshot".
  // Contract/correction: ARCH-012; approved correction 2; refactor.md one-cut protocol.
  // Frozen outcome: Frozen evidence or context acceptance could fail after store commit.
  // Required new outcome: All fallible preflight finishes first; store/evidence/snapshot/receipt publish as one total cut.
  // Setup: An actor with a store that can reject precommit work, prepared evidence, and an observer that can defect.
  // Action: Dispatch failing and successful events, then observe each resulting cut.
  // Observable result: Before commit no new truth is visible; after commit store revision, actor snapshot, evidence sequence, and receipt agree; frozen path allowed a post-store expected failure.
  // Failure/cleanup: Precommit failures cancel permits and retain prior truth; postcommit observer defects cannot roll back or close actor.
  it.effect(
    "RN-ACTOR-014 one actor publication cut binds store, evidence, snapshot, and receipt",
    () =>
      Effect.gen(function* () {
        const store = makeStoreFixture();
        const observerIssues: PublicDiagnostic[] = [];

        const f = yield* makeActorFixture({
          machine: StoreMachine,
          initial: storeSnapshot(),
          store: store.port,
          operationRunner: storeRunner,
          onSnapshot: lateObserverDefect,
          onObserverIssue: (issue) => {
            observerIssues.push(issue);
          },
        });

        const actor = yield* f.prepared.activate();
        store.reject();

        const rejected = yield* Effect.exit(
          actor.dispatch(Result.getOrThrow(StoreDefinition.E.fetch(1))),
        );

        assert.ok(Exit.isFailure(rejected));
        assert.strictEqual(store.revision(), 0);
        assert.strictEqual(actor.snapshot().observedStoreRevision, 0);
        assert.strictEqual(actor.snapshot().memory.count, 0);
        assert.strictEqual(actor.snapshot().issues.length, 1);
        const issueRevision = actor.snapshot().revision;
        const issueSequence = f.journal.sequence();
        store.onCommit(() => {
          store.onCommit(() => {});
          assert.strictEqual(actor.snapshot().revision, issueRevision);
          assert.strictEqual(f.journal.sequence(), issueSequence);
        });
        const receipt = yield* actor.dispatch(Result.getOrThrow(StoreDefinition.E.fetch(1)));

        assert.strictEqual(store.revision(), 1);
        assert.strictEqual(actor.snapshot().observedStoreRevision, 1);
        assert.strictEqual(actor.snapshot().memory.count, 1);
        assert.strictEqual(receipt.publicationRevision, actor.snapshot().revision);
        assert.strictEqual(receipt.evidenceSequence, f.journal.sequence());
        yield* Effect.yieldNow;
        assert.strictEqual(observerIssues.length, 1);
        yield* f.close();
      }),
  );

  // Owner: P06.
  // Source: actor-engine.test.ts:1208 "publishes each passive projection fact as its own non-machine turn".
  // Source: actor-engine.test.ts:1320 "publishes one complete aggregate context cut and ignores its stale repeat".
  // Source: actor-engine.test.ts:1402 "publishes selector defects once and retries newer context revisions".
  // Source: actor-engine.test.ts:2508 "serializes context projection before a later event turn".
  // Source: actor-engine.test.ts:2724 "coalesces equal-revision passive projections".
  // Source: actor-engine.test.ts:3205 "publishes a passive projection without allocating evidence or machine-turn revision".
  // Source: turn-plan.test.ts:359 "plans retained selector defects as an issue-only context cut".
  // Source: turn-plan.test.ts:467 "keeps passive projections separate from event planning".
  // Source: turn-plan.test.ts:655 "rejects a candidate with a stale actor fence".
  // Source: turn-plan.test.ts:784 "coalesces equal context revisions in a plan".
  // Source: turn-plan.test.ts:815 "retains the last valid context through selector defect".
  // Contract/correction: SEM-026; SNAP-001; refactor.md ActorEngine publication cut.
  // Setup: An actor with valid selected context and a later event waiting behind projection.
  // Action: Offer changed, equal, stale, and defecting projections.
  // Observable result: Changed context publishes one complete cut before the later event; equal or stale offers publish nothing; defect retains last-valid slots with one issue.
  // Failure/cleanup: Disposal settles queued projections and prevents later provider delivery.
  it.effect("RN-ACTOR-016 passive context projections publish without synthetic turns", () =>
    Effect.gen(function* () {
      const provider = yield* makeActorFixture({
        machine: ContextProviderMachine,
        initial: contextProviderSnapshot(),
      });

      const consumer = yield* makeActorFixture({
        machine: ContextMachine,
        initial: contextSnapshot(),
      });

      yield* provider.prepared.activate();
      const actor = yield* consumer.prepared.activate();

      const issue = Failure({
        code: "MissingContextProvider",
        path: ["context", "value"],
        details: {},
        summary: "Selector failed",
        help: "Retry after a newer provider cut.",
      });

      const issueBefore = consumer.journal.sequence();

      const ticket = (revision: number, issueOnly = false) =>
        makeContextTicket<typeof ContextDefinition>({
          offer: {
            entries: [
              {
                slot: "value",
                value: ContextProvider.S.changed,
                provider: { identity: provider.identity, revision },
              },
            ],
            issueOnly,
            selectorDefects: issueOnly
              ? [{ slot: "value", provider: provider.identity, diagnostic: issue }]
              : [],
          },
          identity: consumer.identity,
          expectedRevision: actor.snapshot().revision,
          validateCurrent: () => Result.succeed(undefined),
        }).ticket;

      const changed = Result.getOrThrow(actor.offerContext(ticket(1)));
      const pendingEvent = actor.dispatch(Result.getOrThrow(ContextDefinition.E.go()));
      const changedOutcome = yield* changed.wait;
      const eventReceipt = yield* pendingEvent;

      assert.strictEqual(changedOutcome.status, "published");
      assert.strictEqual(actor.snapshot().context.value, ContextProvider.S.changed);
      assert.strictEqual(actor.snapshot().memory.observedChanged, true);
      assert.strictEqual(eventReceipt.publicationRevision, changedOutcome.snapshot.revision + 1);
      assert.strictEqual(consumer.journal.sequence(), issueBefore + 1);
      const beforeRepeat = actor.snapshot();
      assert.strictEqual(
        (yield* Result.getOrThrow(actor.offerContext(ticket(1))).wait).status,
        "no-op",
      );
      assert.strictEqual(
        (yield* Result.getOrThrow(actor.offerContext(ticket(0))).wait).status,
        "stale",
      );
      assert.strictEqual(actor.snapshot(), beforeRepeat);
      const defect = yield* Result.getOrThrow(actor.offerContext(ticket(1, true))).wait;
      assert.strictEqual(defect.status, "published");
      assert.strictEqual(defect.snapshot.context.value, ContextProvider.S.changed);
      assert.strictEqual(defect.snapshot.issues.length, 1);
      assert.strictEqual(consumer.journal.sequence(), issueBefore + 1);
      yield* consumer.close();
      yield* provider.close();
    }),
  );

  // Owner: P06.
  // Source: actor-engine.test.ts:3079 "settles an executing mapped-event turn before pending suspend control".
  // Source: actor-engine.test.ts:3131 "keeps a mapped event before control behind a full ordinary prefix".
  // Source: turn-plan.test.ts:913 "validates mapped event envelopes before scheduling them".
  // Contract/correction: STD-09; refactor.md ActorEngine mapped events.
  // Setup: A parent event producing mapped children while ordinary mailbox is full and suspend control is queued.
  // Action: Dispatch the parent and release its planning gate.
  // Observable result: Every mapped child runs before the parent receipt and pending control without needing an ordinary queue slot; frozen path used a reserved-control escape.
  // Failure/cleanup: Long chains yield cooperatively while preserving causal order and shutdown remains responsive.
  it.effect("RN-ACTOR-017 mapped events complete as one causal continuation", () =>
    Effect.gen(function* () {
      chainSteps.length = 0;

      const f = yield* makeActorFixture({
        machine: ChainMachine,
        initial: chainSnapshot(),
        journalCapacity: 160,
      });

      const actor = yield* f.prepared.activate();
      const parent = actor.dispatch(Result.getOrThrow(ChainDefinition.E.step(70)));
      const ordinary = Result.getOrThrow(ChainDefinition.E.step(0));

      for (let index = 0; index < 63; index += 1) assert.ok(Result.isSuccess(actor.send(ordinary)));

      const suspend = actor.transitionLifecycle({ to: "suspended", cause: { kind: "attachment" } });
      const receipt = yield* parent;

      assert.strictEqual(receipt.publicationRevision, 2);
      assert.ok(actor.snapshot().memory.count >= 71);
      yield* suspend;
      assert.deepStrictEqual(
        chainSteps.slice(0, 71),
        Array.from({ length: 71 }, (_, index) => 70 - index),
      );
      assert.strictEqual(actor.snapshot().memory.count, 134);
      assert.strictEqual(actor.snapshot().lifecycle, "suspended");
      yield* f.close();
    }),
  );

  // Owner: P06.
  // Source: new refactor.md owner proof; no frozen source declaration.
  // Contract/correction: STD-06/10; refactor.md ActorEngine drain protocol.
  // Setup: An actor with a gated admitted turn and later independent admissions.
  // Action: Start flush before and after the completion edge in both race orders.
  // Observable result: Flush waits through its captured generation and cannot miss completion or wait for later work.
  // Failure/cleanup: Shutdown settles every waiter and counter overflow rejects before admission.
  it.effect("RN-ACTOR-018 flush captures an atomic admission boundary", () =>
    Effect.gen(function* () {
      const ownerScope = yield* Scope.make();
      const firstGate = yield* Deferred.make<void>();
      const secondGate = yield* Deferred.make<void>();

      const mailbox = yield* makeActorMailbox<number, number>({
        run: (command) =>
          command === 1
            ? Deferred.await(firstGate).pipe(Effect.as(command))
            : Deferred.await(secondGate).pipe(Effect.as(command)),
        afterAcknowledgement() {},
        onInternalFailure: () => assert.fail("No internal command is admitted in this proof"),
      }).pipe(Effect.provideService(Scope.Scope, ownerScope));

      const first = Result.getOrThrow(mailbox.admit(1, false));
      const delayedFlush = mailbox.flush();
      const firstFlush = yield* mailbox.flush().pipe(Effect.forkChild);
      yield* Effect.yieldNow;
      const second = Result.getOrThrow(mailbox.admit(2, false));
      const secondFlush = yield* delayedFlush.pipe(Effect.forkChild);
      yield* Effect.yieldNow;
      yield* mailbox.activate();
      yield* Deferred.succeed(firstGate, undefined);
      yield* Fiber.join(firstFlush);

      assert.strictEqual(yield* Deferred.await(first), 1);
      assert.strictEqual(yield* Deferred.isDone(second), false);
      assert.strictEqual(secondFlush.pollUnsafe(), undefined);
      yield* Deferred.succeed(secondGate, undefined);
      yield* Fiber.join(secondFlush);
      assert.strictEqual(yield* Deferred.await(second), 2);
      yield* mailbox.flush();
      yield* mailbox.close();
      yield* Scope.close(ownerScope, Exit.void);
    }),
  );

  it.effect("active internal interruption reaches the flush failure lane", () =>
    Effect.gen(function* () {
      const ownerScope = yield* Scope.make();
      let failures = 0;

      const mailbox = yield* makeActorMailbox<number, number>({
        run: () => Effect.interrupt,
        afterAcknowledgement() {},
        onInternalFailure: () => {
          failures += 1;
        },
      }).pipe(Effect.provideService(Scope.Scope, ownerScope));

      yield* mailbox.activate();
      const acknowledged = yield* Effect.exit(mailbox.admitInternal(1));
      assert.ok(Exit.isFailure(acknowledged));
      assert.ok(Cause.hasInterrupts(acknowledged.cause));
      const flushed = yield* Effect.exit(mailbox.flush());
      assert.ok(Exit.isFailure(flushed));
      assert.ok(Cause.hasInterrupts(flushed.cause));
      assert.strictEqual(failures, 1);
      yield* mailbox.close();
      yield* Scope.close(ownerScope, Exit.void);
    }),
  );

  // Owner: P06.
  // Source: actor-engine.test.ts:315 "admits one exact prepared snapshot seam and rejects malformed truth".
  // Source: actor-engine.test.ts:375 "recursively owns memory and issue data and rejects unsupported values".
  // Source: actor-engine.test.ts:446 "rejects an unbranded initial snapshot before engine publication".
  // Contract/correction: STD-03/11; refactor.md ActorEngine snapshot admission and structural-copy owner proof matrix.
  // Setup: Initial actor data with nested caller-owned memory, followed by a cyclic memory value.
  // Action: Prepare and observe the valid snapshot, mutate its source, then attempt the cyclic snapshot.
  // Observable result: The valid nested value is detached; cyclic input receives a typed rejection before actor installation.
  // Failure/cleanup: Close the accepted engine and leave the rejected input without a partial actor.
  it.effect(
    "RN-ACTOR-023 real actor ingress owns deep snapshots and rejects cycles before publication",
    () =>
      Effect.gen(function* () {
        const initial = counterSnapshot();
        const nested = { value: 1 };
        Reflect.set(initial.memory, "nested", nested);
        const f = yield* makeActorFixture({ machine: CounterMachine, initial });
        nested.value = 99;
        assert.deepStrictEqual(
          Object.getOwnPropertyDescriptor(f.prepared.snapshot().memory, "nested")?.value,
          { value: 1 },
        );
        yield* f.close();

        const invalid = counterSnapshot();
        const cycle = {};
        Reflect.set(cycle, "self", cycle);
        Reflect.set(invalid.memory, "cycle", cycle);

        const rejected = yield* Effect.exit(
          makeActorFixture({ machine: CounterMachine, initial: invalid }),
        );

        assert.ok(Exit.isFailure(rejected));
      }),
  );

  // Owner: P07.
  // Source: actor-engine.test.ts:3269 "replays the correct lifecycle truth to prepared active suspended and disposed subscribers".
  // Source: actor-engine.test.ts:3398 "completes a subscriber after an onSnapshot defect and finalizes once".
  // Contract/correction: SNAP-001; refactor.md ActorEngine snapshot observation and final ActorHandle facade.
  // Setup: Actors observed through the supported ActorHandle snapshot stream while active, suspended, and disposed, with one consumer callback that defects.
  // Action: Subscribe at each lifecycle state, commit one changed cut, and close the actor.
  // Observable result: Each subscriber first receives the current immutable cut; suspended and disposed streams complete according to terminal lifecycle, and the defect cannot alter committed truth.
  // Failure/cleanup: Every subscription finalizes exactly once, including the defective consumer; actor shutdown settles all remaining streams.
  it.todo("RN-ACTOR-024 public snapshot streams replay the current cut and finalize once");

  // Owner: P06.
  // Source: actor-engine.test.ts:3351 "completes a prepared subscriber when the engine is abandoned" (retained stream behavior, not the frozen subscriber API).
  // Contract/correction: SNAP-001; refactor.md ActorEngine preparation and snapshot observation.
  // Setup: A prepared actor observed through its documented snapshot stream before activation.
  // Action: Subscribe, observe its permitted current prepared snapshot replay, then abandon the actor before activation.
  // Observable result: The prepared stream completes after that replay without publishing an active snapshot or actor work.
  // Failure/cleanup: The subscription finalizes exactly once; abandonment leaves no surviving subscriber or owned work.
  it.effect("RN-ACTOR-025 prepared snapshot stream completes on abandonment", () =>
    Effect.gen(function* () {
      const f = yield* makeActorFixture({ machine: CounterMachine, initial: counterSnapshot() });
      let finalized = 0;

      const reader = yield* Stream.runCollect(f.prepared.snapshots).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            finalized += 1;
          }),
        ),
        Effect.forkChild,
      );

      yield* Effect.yieldNow;
      yield* f.prepared.abandon();
      const observed = yield* Fiber.join(reader);

      assert.deepStrictEqual(
        [...observed].map((snapshot) => snapshot.lifecycle),
        ["prepared"],
      );
      assert.strictEqual(finalized, 1);
      assert.strictEqual(f.journal.sequence(), 0);
      yield* f.close();
    }),
  );
});
