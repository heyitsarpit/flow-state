import { assert, describe, it } from "@effect/vitest";
import { Cause, Deferred, Effect, Exit, Fiber, Result, Scope } from "effect";

import { Failure, type PublicDiagnostic } from "../../diagnostic/diagnostic.js";
import { makeActorLease } from "../actor/actor-lease.js";
import { makeFlowRuntimeShell } from "../runtime-shell.js";
import { copyStructural } from "../structural-copy.js";

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
  it.todo("RN-ACTOR-002 lifecycle publishes one coherent snapshot revision");

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
  it.todo("RN-ACTOR-003 observer defects cannot undo a committed lifecycle cut");

  // Owner: P06.
  // Source: runtime-integration.test.ts:1205 "blocks assembled actor admission while suspend drains an in-flight command".
  // Source: runtime-integration.test.ts:1700 "walkthrough: suspension rejects commands and resume restores admission".
  // Source: runtime-integration.test.ts:4020 "keeps admission closed until resume reconciliation commits".
  // Contract/correction: SEM-024; HOST-005; refactor.md ActorEngine lifecycle.
  // Setup: An active actor with an in-flight command and a dependent provider.
  // Action: Suspend during work, attempt sends, then resume after context reconciliation.
  // Observable result: Admitted work drains before suspension; new sends reject while suspended; resumed actor accepts only after a coherent context cut.
  // Failure/cleanup: Disposal from either state closes resources once and rejects later sends.
  it.todo("RN-ACTOR-004 suspension gates sends until resume commits");

  // Owner: P06.
  // Source: actor-engine.test.ts:2772 "serializes owner disposal through the actor engine lane".
  // Source: runtime-integration.test.ts:1258 "drains admitted work before publishing assembled disposal".
  // Source: runtime-integration.test.ts:1322 "keeps assembled disposal gated when a public lifecycle command is invoked".
  // Contract/correction: SEM-024; STD-06/08; refactor.md ActorEngine lifecycle.
  // Setup: An actor with one admitted event and a disposal request.
  // Action: Hold the event cut, start disposal, then release the cut.
  // Observable result: The turn and acknowledgement precede the disposed lifecycle publication; later dispatch and send reject.
  // Failure/cleanup: Finalizers run once and a second disposal joins the same Exit.
  it.todo("RN-ACTOR-005 disposal drains prior work and closes admission");

  // Owner: P06.
  // Source: runtime-integration.test.ts:4561 "rejects lifecycle publication preflight before changing admission or resources".
  // Contract/correction: Approved correction 2; refactor.md ActorEngine one-cut publication protocol.
  // Frozen outcome: Frozen lifecycle publication could fail after changing admission or resources.
  // Required new outcome: Preflight rejects before any lifecycle, admission, evidence, or resource mutation.
  // Setup: An actor whose next lifecycle evidence preflight fails.
  // Action: Attempt suspend or dispose, inspect public snapshot and resource state, then retry.
  // Observable result: The failed attempt makes no partial lifecycle, admission, evidence, or resource change.
  // Failure/cleanup: Retry can commit; final cleanup still runs once.
  it.todo("RN-ACTOR-006 failed lifecycle preflight leaves actor and resources unchanged");

  // Owner: P06.
  // Source: runtime-integration.test.ts:3201 "TIM1 assembled runtime owns interrupted and overdue timer claims".
  // Contract/correction: SEM-024; STD-08; refactor.md ActorEngine timer behavior.
  // Setup: An actor with a due timer and gated work using TestClock.
  // Action: Advance clock, interrupt the claim or suspend, then resume.
  // Observable result: An overdue timer runs once at the authorized lifecycle edge and its work terminal state is visible.
  // Failure/cleanup: No timer or work fiber survives actor disposal.
  it.todo("RN-ACTOR-007 timer claims use Effect Clock and settle across interruption");

  // Owner: P06.
  // Source: lifecycle.test.ts:1061 "keeps nested provider and blocked-disposal snapshots detached".
  // Source: runtime-integration.test.ts:5718 "isolates onSnapshot mutation from coordinator publication state".
  // Source: runtime-integration.test.ts:5766 "deeply owns diagnostic data across an onSnapshot callback".
  // Source: runtime-integration.test.ts:5810 "always owns empty-context snapshots across query and callback boundaries".
  // Contract/correction: STD-11; HOST-005; refactor.md port immutability.
  // Setup: An actor with nested context and issue data plus mutating observers.
  // Action: Mutate a callback value or prior snapshot, then query or stream later state.
  // Observable result: Later snapshots, context, and diagnostics retain the committed values with no mutation leakage.
  // Failure/cleanup: Observer mutation cannot change owner truth or make close fail.
  it.todo("RN-ACTOR-008 published snapshots and diagnostics are owned immutable data");

  // Owner: P06.
  // Source: runtime-integration.test.ts:6532 "preserves ordered snapshot delivery without making disposal wait for a slow reader".
  // Contract/correction: Approved correction 3; STD-09; refactor.md ActorEngine bounded snapshots.
  // Frozen outcome: Frozen snapshot subscriber queues could grow with a slow reader.
  // Required new outcome: Snapshot delivery is bounded or coalesced and actor close does not wait for a slow reader.
  // Setup: A slow subscriber and repeated actor turns.
  // Action: Commit several revisions while the reader is gated, then dispose.
  // Observable result: Subscriber delivery stays ordered for retained values and bounded/coalesced according to policy; frozen queue was unbounded.
  // Failure/cleanup: Disposal completes without waiting for the slow reader and finalizes its subscription once.
  it.todo("RN-ACTOR-009 slow snapshot readers cannot stall actor disposal");

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

  // Owner: P06.
  // Source: actor-admission.test.ts:1790 "allocates a correlated operation occurrence fence".
  // Source: actor-admission.test.ts:1814 "allocates and settles distinct live operation occurrences".
  // Source: actor-engine.test.ts:739 "discards stale incarnation, generation, and lease facts before planning".
  // Source: actor-engine.test.ts:1540 "ignores a duplicate completion for the same operation occurrence".
  // Source: actor-engine.test.ts:2041 "discards stale command fences before mutation".
  // Source: actor-engine.test.ts:2193 "correlates operation completion with its descriptor and key".
  // Source: actor-engine.test.ts:2216 "settles distinct live occurrences delivered out of order".
  // Source: actor-engine.test.ts:2249 "discards completions from a prior actor incarnation".
  // Source: actor-engine.test.ts:2843 "matches nested operation keys structurally".
  // Source: turn-plan.test.ts:308 "matches nested canonical operation keys across independently-owned containers".
  // Source: turn-plan.test.ts:760 "preserves descriptor identity in stream projection plans".
  // Contract/correction: API-006; SEM-018; refactor.md ActorEngine operation cursors.
  // Setup: Two same-key live operations and a later actor incarnation.
  // Action: Deliver matching, duplicate, out-of-order, and stale completion or stream facts.
  // Observable result: Each live occurrence settles once with its own descriptor and outcome; stale or duplicated facts do not change a later actor.
  // Failure/cleanup: Outcome cursors leave retention at eviction, release, or actor close.
  it.todo("RN-ACTOR-011 operation completions follow their live occurrence fence");

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
  // Source: actor-engine.test.ts:570 "makes projection mailbox overflow explicit".
  // Source: actor-engine.test.ts:644 "joins repeated activation calls to one engine and one consumer".
  // Source: actor-engine.test.ts:670 "closes admission when the sole consumer fails".
  // Source: actor-engine.test.ts:701 "keeps normal and reentrant sends in one FIFO order".
  // Source: actor-engine.test.ts:1597 "settles the current and buffered accepted prefix on hard shutdown".
  // Source: actor-engine.test.ts:1978 "walkthrough: send returns immediately and drain observes completed work".
  // Source: actor-engine.test.ts:1996 "rejects a foreign event before mailbox mutation".
  // Source: actor-engine.test.ts:2021 "processes mailbox commands in FIFO turn order".
  // Source: actor-engine.test.ts:2568 "orders lifecycle suspension before later commands".
  // Source: actor-engine.test.ts:2882 "rejects admission when 64 commands wait behind one executing command".
  // Source: actor-engine.test.ts:2942 "reserves one ordered control place after a full ordinary prefix".
  // Source: actor-engine.test.ts:3008 "keeps the 64th ordinary place available behind one reserved control".
  // Contract/correction: ARCH-012; STD-09; refactor.md ActorEngine mailbox.
  // Setup: A gated executing turn, the configured ordinary command capacity, and one suspend control.
  // Action: Admit sends, dispatches, reentrant commands, and control while the consumer is held, then release it.
  // Observable result: Accepted work follows declared causal/FIFO order; ordinary overflow is synchronous typed rejection; control retains its reserved place.
  // Failure/cleanup: Hard shutdown settles every accepted acknowledgement and rejects later admission; preparation and abandonment are covered by RN-ACTOR-022.
  it.todo("RN-ACTOR-013 mailbox preserves FIFO and reserved control capacity");

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
  it.todo("RN-ACTOR-014 one actor publication cut binds store, evidence, snapshot, and receipt");

  // Owner: P06.
  // Source: actor-engine.test.ts:2281 "retains finite success and expected failure outcomes".
  // Source: actor-engine.test.ts:2318 "keeps interruption distinct during operation completion".
  // Source: actor-engine.test.ts:2336 "retains a defective operation exit and cause".
  // Source: actor-engine.test.ts:2445 "processes absolute timer projections once".
  // Source: actor-engine.test.ts:2476 "fences typed stream projections to their operation occurrence".
  // Source: actor-engine.test.ts:2700 "closes engine resources after interrupting owned work".
  // Contract/correction: ARCH-012; STD-05/08; refactor.md ActorEngine activities.
  // Setup: Keyed work, stream projection, and absolute timer with TestClock.
  // Action: Complete with success, typed failure, defect, interruption, duplicate, and stale generation.
  // Observable result: Only the matching live occurrence updates state once; each terminal category stays distinct.
  // Failure/cleanup: Replacement, suspension, and shutdown interrupt and settle owned work before resource finalizers.
  it.todo("RN-ACTOR-015 operation and timer outcomes retain failure categories");

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
  it.todo("RN-ACTOR-016 passive context projections publish without synthetic turns");

  // Owner: P06.
  // Source: actor-engine.test.ts:3079 "settles an executing mapped-event turn before pending suspend control".
  // Source: actor-engine.test.ts:3131 "keeps a mapped event before control behind a full ordinary prefix".
  // Source: turn-plan.test.ts:913 "validates mapped event envelopes before scheduling them".
  // Contract/correction: STD-09; refactor.md ActorEngine mapped events.
  // Setup: A parent event producing mapped children while ordinary mailbox is full and suspend control is queued.
  // Action: Dispatch the parent and release its planning gate.
  // Observable result: Every mapped child runs before the parent receipt and pending control without needing an ordinary queue slot; frozen path used a reserved-control escape.
  // Failure/cleanup: Long chains yield cooperatively while preserving causal order and shutdown remains responsive.
  it.todo("RN-ACTOR-017 mapped events complete as one causal continuation");

  // Owner: P06.
  // Source: new refactor.md owner proof; no frozen source declaration.
  // Contract/correction: STD-06/10; refactor.md ActorEngine drain protocol.
  // Setup: An actor with a gated admitted turn and later independent admissions.
  // Action: Start flush before and after the completion edge in both race orders.
  // Observable result: Flush waits through its captured generation and cannot miss completion or wait for later work.
  // Failure/cleanup: Shutdown settles every waiter and counter overflow rejects before admission.
  it.todo("RN-ACTOR-018 flush captures an atomic admission boundary");

  // Owner: P06.
  // Source: actor-engine.test.ts:1910 "fails before publication when the revision counter would wrap".
  // Contract/correction: STD-10; refactor.md ActorEngine owner proof matrix.
  // Setup: An actor publication revision near Number.MAX_SAFE_INTEGER.
  // Action: Attempt one more turn or lifecycle publication.
  // Observable result: A typed terminal result occurs before store, evidence, snapshot, or context mutation.
  // Failure/cleanup: Previously committed truth remains readable and cleanup still closes once.
  it.todo("RN-ACTOR-019 publication revision overflow rejects before actor mutation");

  // Owner: P06.
  // Source: new refactor.md owner proof; no frozen source declaration.
  // Contract/correction: STD-03/11; refactor.md ActorEngine immediate admission.
  // Setup: An actor with a gated mailbox and a nested caller-owned event.
  // Action: Call send or construct dispatch, mutate the event afterward, then execute and drain.
  // Observable result: The committed turn uses the event captured at method call; caller mutation cannot rewrite queued work.
  // Failure/cleanup: Unsupported cyclic or accessor event data rejects before mailbox admission without freezing the caller.
  it.todo("RN-ACTOR-020 send and dispatch own events before queued execution");

  // Owner: P06.
  // Source: actor-engine.test.ts:633 "rejects sends after active shutdown without exposing an async result".
  // Contract/correction: API-012; approved correction 1; refactor.md ActorEngine mailbox.
  // Frozen outcome: Frozen send could throw synchronously on full or closed mailbox.
  // Required new outcome: Full and closed send reject immediately through typed Result data without queue or snapshot mutation.
  // Setup: An active actor with a gated consumer and the configured ordinary mailbox capacity.
  // Action: Fill the mailbox, send one more event, then shut down and send again.
  // Observable result: Both rejections are immediate typed Result values; no rejected event enters the queue or changes the snapshot.
  // Failure/cleanup: Release the gate and settle every accepted receipt; shutdown rejects subsequent admission.
  it.todo("RN-ACTOR-021 full or closed send rejects synchronously without mutation");

  // Owner: P06.
  // Source: actor-engine.test.ts:479 "accepts a 64-command FIFO prefix and activates one consumer behind a barrier".
  // Source: actor-engine.test.ts:525 "abandons without delivering buffered commands and rejects later sends".
  // Source: actor-engine.test.ts:541 "returns a cached typed failure when activation follows abandonment".
  // Source: actor-engine.test.ts:2681 "abandons a prepared engine without publication".
  // Contract/correction: ARCH-012; refactor.md ActorEngine preparation and mailbox.
  // Setup: A prepared actor with commands buffered before activation and observable user callbacks.
  // Action: Observe it before activation, then activate one variant and abandon another; attempt send and activation after abandonment.
  // Observable result: Buffered commands produce no user work or publication before activation; activation runs the accepted prefix once; sends after abandonment reject.
  // Failure/cleanup: Abandonment runs or publishes none of its buffered commands, settles their acknowledgements, and later activation returns the same cached terminal failure.
  it.todo("RN-ACTOR-022 prepared actor work remains inert until activation");

  // Owner: P06.
  // Source: actor-engine.test.ts:315 "admits one exact prepared snapshot seam and rejects malformed truth".
  // Source: actor-engine.test.ts:375 "recursively owns memory and issue data and rejects unsupported values".
  // Source: actor-engine.test.ts:446 "rejects an unbranded initial snapshot before engine publication".
  // Contract/correction: STD-03/11; refactor.md ActorEngine snapshot admission and structural-copy owner proof matrix.
  // Setup: The same 20k-deep, cyclic, aliased, sparse, accessor, and opaque input shapes used by RN-COPY-001 and RN-COPY-002.
  // Action: Admit initial or restored actor data through the ActorEngine lifecycle, observe its snapshot, mutate caller data, and try invalid actor-policy variants.
  // Observable result: Accepted deep snapshot data remains independently owned; cyclic or malformed actor snapshot data gets a typed rejection before any actor publication.
  // Failure/cleanup: Sparse or accessor variants follow actor policy; rejection leaves no active partial actor or publication, and accepted actor scopes close once.
  it.todo(
    "RN-ACTOR-023 real actor ingress owns deep snapshots and rejects cycles before publication",
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
  it.todo("RN-ACTOR-025 prepared snapshot stream completes on abandonment");
});
