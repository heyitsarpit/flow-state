import { assert, describe, it } from "@effect/vitest";
import { Deferred, Effect, Exit, Fiber, Result, Scope } from "effect";

import { definition } from "../../definition/definition.js";
import { actorRef } from "../../runtime/actor-ref.js";
import { makeActorDirectory } from "../actor/actor-directory.js";
import { checkedContextGeneration, type ContextNode } from "../context/context-coordinator.js";
import { makeContextTicket, type ContextOffer } from "../context/context-ticket.js";
import {
  applyContextWave,
  buildContextGraph,
  installContextBaseline,
  planContextWave,
  type ContextGraphNode,
  type ContextSelectionBatch,
} from "../context/context-wave.js";
import { reconcileContextEdgeDebt } from "../context/context-debt.js";
import type { ActorSnapshot } from "../runtime.js";
import {
  Consumer,
  ConsumerMachine,
  DualConsumer,
  identity,
  isProviderState,
  makeDiamondHarness,
  makeHarness,
  Provider,
  ProviderMachine,
  type ProviderValue,
  unavailable,
} from "./context-fixture.js";

describe("runtime-next context", () => {
  // Owner: P05.
  // Source: context-wave.test.ts:275 "installs a provider-first owned baseline before activation".
  // Source: context-wave.test.ts:814 "selects scalar provider state from one captured snapshot".
  // Source: runtime-architecture.test.ts:286 "walkthrough: a consumer starts with context selected from its provider".
  // Source: runtime-architecture.test.ts:681 "reconciles provider baselines before exposure".
  // Source: runtime.test.ts:317 "reconciles a queued provider publication before exposing the consumer".
  // Contract/correction: SEM-026; refactor.md ContextCoordinator.
  // Setup: Registered provider and dormant dependent ContextParticipant snapshots.
  // Action: Install and enable the dependent baseline through the context owner port.
  // Observable result: The first offered context contains all selected provider slots from one current cut.
  // Failure/cleanup: If a slot cannot be selected, registration rejects before enabling a partial participant.
  it.effect("RN-CONTEXT-001 consumer starts from one complete provider cut", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make();
      const fixture = yield* makeHarness(scope);

      assert.strictEqual(fixture.baselineAdmittedBeforeEnable, true);
      assert.strictEqual(fixture.offerAdmissions(), 1);
      yield* fixture.coordinator.drain();
      assert.deepStrictEqual(
        fixture.offered.map((offer) => offer.revision),
        [1],
      );
      assert.strictEqual(fixture.consumerSnapshot().context.value, Provider.S.ready);
      yield* fixture.coordinator.close();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  // Owner: P05.
  // Source: context-wave.test.ts:1130 "preserves provider truth when a real context consumer mailbox overflows".
  // Source: context-wave.test.ts:1290 "keeps context delivery backpressure local".
  // Source: runtime-integration.test.ts:1386 "preserves provider truth when the real consumer mailbox is full".
  // Contract/correction: SEM-026; approved correction 5; refactor.md ContextCoordinator.
  // Frozen outcome: Frozen full-consumer delivery could wait or drop without naming the retained participant.
  // Required new outcome: Provider truth remains committed and blocked delivery converges or reports a named typed diagnostic.
  // Setup: A committed provider snapshot and a ContextParticipant whose offer reports typed capacity rejection.
  // Action: Publish the prepared root notification, then allow the participant to accept a later offer.
  // Observable result: The provider cut remains committed while the participant converges to the latest complete context; frozen behavior could defer or silently drop.
  // Failure/cleanup: The retained participant is named in a diagnostic when delivery cannot complete.
  it.effect("RN-CONTEXT-002 participant offer backpressure retains provider truth", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make();
      const fixture = yield* makeHarness(scope);
      yield* fixture.coordinator.drain();
      fixture.setRejectOffers(true);
      fixture.setProviderChanged();

      const rejected = Result.getOrThrow(
        fixture.coordinator.prepareNotification({
          identity: fixture.providerIdentity,
          snapshot: fixture.providerSnapshot(),
        }),
      );

      assert.strictEqual(fixture.coordinator.publish(rejected), "accepted");
      assert.ok(Exit.isFailure(yield* Effect.exit(fixture.coordinator.drain())));
      assert.strictEqual(fixture.providerSnapshot().state, Provider.S.changed);
      assert.strictEqual(fixture.consumerSnapshot().context.value, Provider.S.ready);
      fixture.setRejectOffers(false);
      fixture.setProviderChanged();

      const recovered = Result.getOrThrow(
        fixture.coordinator.prepareNotification({
          identity: fixture.providerIdentity,
          snapshot: fixture.providerSnapshot(),
        }),
      );

      fixture.coordinator.publish(recovered);
      yield* fixture.coordinator.drain();
      assert.strictEqual(fixture.consumerSnapshot().context.value, Provider.S.changed);
      assert.strictEqual(fixture.offered.at(-1)?.revision, fixture.providerSnapshot().revision);
      yield* fixture.coordinator.close();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  // Owner: P05.
  // Source: context-wave.test.ts:424 "retains last-valid selection for one issue-only defect and retries a newer vector".
  // Source: context-wave.test.ts:664 "keeps passive observer defects from publishing or replacing dependencies".
  // Source: context-wave.test.ts:933 "retains thrown selector defects without clearing consumer state".
  // Source: context-wave.test.ts:1385 "suppresses a repeated selector defect at one provider revision while retaining a pending sibling change".
  // Source: runtime-integration.test.ts:1521 "publishes one selector issue through the real context consumer".
  // Source: runtime-integration.test.ts:3732 "retains all last-valid context slots through a sibling selector defect and recovers on a newer provider revision".
  // Contract/correction: SEM-026; refactor.md ContextCoordinator.
  // Setup: A context participant with multiple selected slots and one selector that defects.
  // Action: Plan one defective wave, then publish a later healthy provider revision.
  // Observable result: One issue-only offer retains sibling slots; the later wave offers a complete recovered context.
  // Failure/cleanup: Failed selection does not consume a valid future provider update.
  it("RN-CONTEXT-003 selector defects retain the last valid context until recovery", () => {
    const provider = identity("defect-provider");

    const batch = (revision: number, state: typeof Provider.S.ready | typeof Provider.S.changed) =>
      ({
        slots: ["left", "right"],
        requests: [
          {
            slot: "left",
            provider,
            cut: { identity: provider, revision },
            input: { state, memory: {}, context: {} },
            select: ({ state: selected }) => selected,
            opaqueIdentities: [Provider.S.ready, Provider.S.changed],
          },
          {
            slot: "right",
            provider,
            cut: { identity: provider, revision },
            input: { state, memory: {}, context: {} },
            select: ({ state: selected }) => selected,
            opaqueIdentities: [Provider.S.ready, Provider.S.changed],
          },
        ],
      }) satisfies ContextSelectionBatch<typeof DualConsumer>;

    const baseline = Result.getOrThrow(
      installContextBaseline<typeof DualConsumer>(batch(1, Provider.S.ready)),
    );

    const defective = batch(2, Provider.S.changed);
    let calls = 0;

    const failingRight = {
      ...defective.requests[1]!,
      select: () => {
        calls += 1;
        throw Error("selection failed");
      },
    };

    const issue = Result.getOrThrow(
      applyContextWave<typeof DualConsumer>(baseline, {
        slots: defective.slots,
        requests: [defective.requests[0]!, failingRight],
      }),
    );

    assert.strictEqual(issue.publication, "issue-only");
    assert.strictEqual(issue.projection.values.get("left"), Provider.S.ready);
    assert.strictEqual(issue.projection.values.get("right"), Provider.S.ready);
    assert.strictEqual(issue.selectorDefects.length, 1);

    const repeated = Result.getOrThrow(
      applyContextWave<typeof DualConsumer>(issue, {
        slots: defective.slots,
        requests: [defective.requests[0]!, failingRight],
      }),
    );

    assert.strictEqual(calls, 1);
    assert.strictEqual(repeated.publication, "unchanged");
    assert.strictEqual(repeated.selectorDefects.length, 0);

    const recovered = Result.getOrThrow(
      applyContextWave<typeof DualConsumer>(repeated, batch(3, Provider.S.changed)),
    );

    assert.strictEqual(recovered.publication, "changed");
    assert.strictEqual(recovered.projection.values.get("left"), Provider.S.changed);
    assert.strictEqual(recovered.projection.values.get("right"), Provider.S.changed);
  });

  // Owner: P05.
  // Source: runtime-integration.test.ts:3806 "propagates one diamond wave without an intermediate context cut".
  // Source: runtime-integration.test.ts:3889 "offers a healthy diamond sibling before awaiting a gated peer".
  // Source: runtime-integration.test.ts:4126 "holds diamond descendants when an upstream context delivery is rejected".
  // Contract/correction: SEM-026; STD-06/09; refactor.md ContextCoordinator.
  // Setup: A diamond of registered ContextParticipants with one gated sibling offer.
  // Action: Publish the root notification and allow one sibling offer before the other.
  // Observable result: The healthy sibling may progress, but the descendant receives one offer only after all required ancestors settle.
  // Failure/cleanup: A rejected upstream delivery blocks the descendant without contaminating unrelated branches.
  it.effect("RN-CONTEXT-004 diamond waves publish only complete descendant cuts", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make();
      const fixture = yield* makeDiamondHarness(scope);
      const gate = yield* Deferred.make<void>();
      fixture.holdOffers(gate);
      fixture.resetRightSignal();
      fixture.setProviderChanged();

      const prepared = Result.getOrThrow(
        fixture.coordinator.prepareNotification({
          identity: fixture.providerIdentity,
          snapshot: fixture.providerSnapshot(),
        }),
      );

      fixture.coordinator.publish(prepared);
      yield* fixture.awaitRightOffer();
      assert.strictEqual(fixture.rightSnapshot().context.value, Provider.S.changed);
      assert.strictEqual(fixture.leafOffers.length, 1);
      yield* Deferred.succeed(gate, undefined);
      yield* fixture.coordinator.drain();
      assert.deepStrictEqual(fixture.leafOffers.at(-1), {
        left: Provider.S.changed,
        right: Provider.S.changed,
      });
      assert.strictEqual(fixture.leafOffers.length, 2);
      yield* fixture.coordinator.close();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  // Owner: P05.
  // Source: runtime-integration.test.ts:3939 "isolates one full context dependent while preserving a healthy fanout peer".
  // Contract/correction: SEM-026; STD-09; refactor.md ContextCoordinator.
  // Setup: A provider participant with one dependent whose offer reports typed capacity rejection and one healthy peer.
  // Action: Publish multiple root notifications while one dependent offer is blocked.
  // Observable result: The healthy participant receives offers while the blocked participant later receives a complete latest cut.
  // Failure/cleanup: No indefinite wait or silent drop hides the blocked participant.
  it.effect("RN-CONTEXT-005 fanout isolates a full dependent and makes peer progress", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make();
      const fixture = yield* makeDiamondHarness(scope);
      fixture.setRejectOffers(true);
      fixture.setProviderChanged();

      const blocked = Result.getOrThrow(
        fixture.coordinator.prepareNotification({
          identity: fixture.providerIdentity,
          snapshot: fixture.providerSnapshot(),
        }),
      );

      fixture.coordinator.publish(blocked);
      assert.ok(Exit.isFailure(yield* Effect.exit(fixture.coordinator.drain())));
      assert.strictEqual(fixture.rightSnapshot().context.value, Provider.S.changed);
      assert.strictEqual(fixture.leafOffers.length, 1);
      fixture.setRejectOffers(false);
      fixture.setProviderChanged();

      const recovered = Result.getOrThrow(
        fixture.coordinator.prepareNotification({
          identity: fixture.providerIdentity,
          snapshot: fixture.providerSnapshot(),
        }),
      );

      fixture.coordinator.publish(recovered);
      yield* fixture.coordinator.drain();
      assert.deepStrictEqual(fixture.leafOffers.at(-1), {
        left: Provider.S.changed,
        right: Provider.S.changed,
      });
      yield* fixture.coordinator.close();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  // Owner: P05.
  // Source: runtime-integration.test.ts:4655 "blocks stale or suspended diamond tickets without substituting a newer live cut".
  // Source: runtime-integration.test.ts:4706 "rejects mismatched vector, stale consumer fence, and foreign provider tickets".
  // Source: runtime-integration.test.ts:4775 "rejects a ticket with a mutated captured origin before descendant publication".
  // Source: runtime-integration.test.ts:4823 "rejects a ticket with a mutated graph generation before descendant publication".
  // Source: runtime-integration.test.ts:4871 "rejects an in-place origin mutation without consuming the selected cut".
  // Source: runtime-integration.test.ts:4933 "rejects a replaced ticket validator without consuming the selected cut".
  // Source: runtime-integration.test.ts:4996 "rejects a constructor-forged context witness without committing its ledger".
  // Source: runtime-integration.test.ts:5078 "rejects cloned and proxied context witnesses".
  // Source: runtime-integration.test.ts:5118 "rejects an in-place forged context carrier before descendant publication".
  // Source: runtime-integration.test.ts:5151 "rejects forged carrier methods and iterators before descendant publication".
  // Source: runtime-integration.test.ts:5191 "stales a mutated selector-defect carrier and retries at the same revision".
  // Source: runtime-integration.test.ts:5305 "keeps accepted provider fences owned after ticket settlement".
  // Source: runtime-integration.test.ts:5351 "rejects an in-place nested carrier mutation and retries the unconsumed cut".
  // Source: runtime-integration.test.ts:5413 "rejects each forged outer context lead without issuing or consuming the cut".
  // Source: runtime-integration.test.ts:5477 "owns settled nested context against retained carrier and snapshot mutation".
  // Source: runtime-integration.test.ts:5539 "rejects a forged expected revision behind a queued consumer command".
  // Source: runtime-integration.test.ts:5609 "rejects an in-place consumer fence mutation without changing actor identity".
  // Contract/correction: STD-01/06; refactor.md ContextCoordinator owner proof matrix.
  // Setup: A context participant with selected cuts and coordinator-issued one-shot tickets.
  // Action: Replay, forge, mutate, or use a stale ticket; cancel one authentic prepared ticket and attempt to consume it; then prepare a later valid ticket.
  // Observable result: Only an authentic current uncancelled ticket publishes; cancelling a prepared ticket causes no publication and the later valid ticket progresses.
  // Failure/cleanup: Rejected or cancelled attempts leave prior context unchanged and return typed diagnostics without consuming later valid work.
  it("RN-CONTEXT-006 stale, forged, or cancelled context authority cannot publish", () => {
    const consumer = identity("ticket-consumer");
    const foreign = identity("ticket-foreign");
    const provider = identity("ticket-provider");

    const offer: ContextOffer<typeof Consumer> = {
      entries: [
        { slot: "value", value: Provider.S.ready, provider: { identity: provider, revision: 2 } },
      ],
      issueOnly: false,
      selectorDefects: [],
    };

    const mint = () =>
      makeContextTicket<typeof Consumer>({
        offer,
        identity: consumer,
        expectedRevision: 1,
        validateCurrent: () => Result.succeed(undefined),
      });

    const first = mint();

    assert.ok(Result.isFailure(new Proxy(first.ticket, {}).consume(consumer, 1)));
    assert.ok(Result.isFailure(first.ticket.consume(foreign, 1)));
    assert.ok(Result.isFailure(first.ticket.consume(consumer, 1)));
    const cancelled = mint();
    cancelled.cancel();
    assert.ok(Result.isFailure(cancelled.ticket.consume(consumer, 1)));
    const stale = mint();
    assert.ok(Result.isFailure(stale.ticket.consume(consumer, 2)));
    const later = mint();
    assert.strictEqual(Result.getOrThrow(later.ticket.consume(consumer, 1)), offer);
    assert.ok(Result.isFailure(later.ticket.consume(consumer, 1)));
  });

  // Owner: P05.
  // Source: context-wave.test.ts:1319 "closes context waves through the owning runtime scope".
  // Source: runtime-integration.test.ts:5979 "settles captured context receipts across graph changes and shutdown".
  // Source: runtime-integration.test.ts:6090 "tracks queued reconcile waves through drain and close".
  // Source: runtime-integration.test.ts:6165 "drains captured context generations while newer roots continue arriving".
  // Source: runtime-integration.test.ts:6283 "settles a captured latest root when its provider unregisters or quiesces".
  // Contract/correction: SEM-026; STD-08/09; refactor.md ContextCoordinator.
  // Setup: Queued root updates with gated dependent delivery and a captured drain boundary.
  // Action: Drain while newer roots arrive, then quiesce or close.
  // Observable result: The first drain accounts for its captured generations; later work belongs to a later drain.
  // Failure/cleanup: Every queued wave settles on provider unregistration or shutdown with a named diagnostic.
  it.effect("RN-CONTEXT-007 drain captures generations and shutdown settles queued waves", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make();
      const fixture = yield* makeHarness(scope);
      yield* fixture.coordinator.drain();
      const gate = yield* Deferred.make<void>();
      fixture.holdOffers(gate);
      fixture.setProviderChanged();

      const first = Result.getOrThrow(
        fixture.coordinator.prepareNotification({
          identity: fixture.providerIdentity,
          snapshot: fixture.providerSnapshot(),
        }),
      );

      fixture.coordinator.publish(first);
      yield* fixture.awaitOffer();
      fixture.toggleProvider();

      const later = Result.getOrThrow(
        fixture.coordinator.prepareNotification({
          identity: fixture.providerIdentity,
          snapshot: fixture.providerSnapshot(),
        }),
      );

      fixture.coordinator.publish(later);

      const draining = yield* Effect.exit(fixture.coordinator.drain()).pipe(
        Effect.forkIn(scope, { startImmediately: true }),
      );

      yield* Effect.yieldNow;
      yield* fixture.coordinator.close();
      assert.ok(Exit.isFailure(yield* Fiber.join(draining)));
      assert.ok(
        Result.isFailure(
          fixture.coordinator.prepareNotification({
            identity: fixture.providerIdentity,
            snapshot: fixture.providerSnapshot(),
          }),
        ),
      );
      yield* Scope.close(scope, Exit.void);
    }),
  );

  // Owner: P05.
  // Source: context-wave.test.ts:1217 "handles provider disposal without stale selection".
  // Source: runtime-integration.test.ts:1920 "rejected provider disposal leaves active and suspended dependents live".
  // Source: runtime-integration.test.ts:5854 "does not commit a no-projection selection after its provider is invalidated".
  // Source: runtime-integration.test.ts:5925 "invalidates an offered wave when its provider is unregistered".
  // Contract/correction: SEM-026; STD-01/06; refactor.md ContextCoordinator.
  // Setup: A selected provider cut held before ContextParticipant offer settlement.
  // Action: Invalidate or unregister the provider and then release the held wave.
  // Observable result: No obsolete offer commits and downstream participants remain blocked until a valid new lineage.
  // Failure/cleanup: The stale wave settles and a later valid wave can reconcile.
  it.effect("RN-CONTEXT-008 provider retirement cannot publish an obsolete selection", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make();
      const fixture = yield* makeHarness(scope);
      yield* fixture.coordinator.drain();
      const gate = yield* Deferred.make<void>();
      fixture.holdOffers(gate);
      fixture.setProviderChanged();

      const prepared = Result.getOrThrow(
        fixture.coordinator.prepareNotification({
          identity: fixture.providerIdentity,
          snapshot: fixture.providerSnapshot(),
        }),
      );

      fixture.coordinator.publish(prepared);
      yield* fixture.awaitOffer();

      const draining = yield* Effect.exit(fixture.coordinator.drain()).pipe(
        Effect.forkIn(scope, { startImmediately: true }),
      );

      yield* Effect.yieldNow;
      fixture.providerRegistration.unregister();
      yield* Deferred.succeed(gate, undefined);
      assert.ok(Exit.isFailure(yield* Fiber.join(draining)));
      assert.strictEqual(fixture.consumerSnapshot().context.value, Provider.S.ready);
      yield* fixture.coordinator.close();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  // Owner: P05.
  // Source: context-wave.test.ts:325 "publishes one complete changed projection without an intermediate cut".
  // Source: context-wave.test.ts:356 "carries each settled projection through an A-to-B-to-C wave".
  // Source: context-wave.test.ts:699 "propagates one provider revision in dependency order".
  // Source: context-wave.test.ts:839 "publishes one wave when one named field changes".
  // Source: context-wave.test.ts:974 "coalesces adjacent provider revisions into one wave".
  // Source: context-wave.test.ts:1000 "keeps unrelated provider publications out of the wave".
  // Source: context-wave.test.ts:1020 "publishes affected consumers from one atomic wave cut".
  // Source: context-wave.test.ts:1056 "publishes and detaches context through real provider and consumer owners".
  // Source: context-wave.test.ts:1197 "fences a late wave after consumer disposal".
  // Source: context-wave.test.ts:1270 "keeps an empty context wave free of synthetic publication".
  // Contract/correction: SEM-026; refactor.md ContextCoordinator.
  // Setup: A provider ContextParticipant, dependent chain, and unrelated registered participant.
  // Action: Publish one provider change and drain its wave.
  // Observable result: Affected participants receive complete latest offers in provider-first order; unchanged or unrelated actors do not publish.
  // Failure/cleanup: Unregistered participants ignore later waves and coordinator close settles outstanding delivery.
  it.effect("RN-CONTEXT-009 provider changes propagate through the affected graph", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make();
      const fixture = yield* makeHarness(scope);

      fixture.setProviderChanged();

      const prepared = Result.getOrThrow(
        fixture.coordinator.prepareNotification({
          identity: fixture.providerIdentity,
          snapshot: fixture.providerSnapshot(),
        }),
      );

      assert.strictEqual(fixture.coordinator.publish(prepared), "accepted");
      yield* fixture.coordinator.drain();
      assert.strictEqual(fixture.consumerSnapshot().context.value, Provider.S.changed);
      assert.deepStrictEqual(
        fixture.offered.map((offer) => offer.revision),
        [1, 2],
      );
      yield* fixture.coordinator.close();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  // Owner: P05.
  // Source: context-wave.test.ts:403 "uses exact authored equality for scalars and fixed named records".
  // Source: context-wave.test.ts:509 "publishes owned graph, fence, wave, ledger, and publication envelopes".
  // Source: context-wave.test.ts:831 "compares named records fieldwise by Object.is".
  // Source: context-wave.test.ts:869 "publishes selected null without treating it as absence".
  // Source: context-wave.test.ts:885 "publishes selected undefined separately from absent metadata".
  // Source: context-wave.test.ts:923 "stores an authored diagnostic as ordinary context data".
  // Source: context-wave.test.ts:1327 "keeps authored record field presence distinct from selected undefined".
  // Source: context-wave.test.ts:1534 "uses exact authored equality for scalars, arrays, and fixed named records".
  // Source: context-wave.test.ts:1696 "retains registered operation and context selector identities inside owned context".
  // Source: context-wave.test.ts:1749 "retains registered selector identity after its mutable kind changes or is deleted".
  // Contract/correction: STD-11; refactor.md ContextCoordinator pure model.
  // Setup: Selectors returning nested records, arrays, null, present undefined, and registered opaque values.
  // Action: Mutate source and a published projection, then replace a selected field reference.
  // Observable result: Owned context retains the valid prior value; registered opaque identities remain exact, and a changed field publishes one new cut.
  // Failure/cleanup: Caller data is not frozen; malformed or throwing selector data becomes an issue without corrupting last-valid context.
  it("RN-CONTEXT-010 context selection owns structured values and authored identity", () => {
    const provider = identity("structured-provider");
    const opaque = Provider.S.ready;
    const shared = { count: 1 };

    type Cycle = Array<number | Cycle>;

    const cycle: Cycle = [];
    cycle.push(cycle);
    const sparse = [1];
    sparse.length = 3;
    const source = { left: shared, right: shared, cycle, sparse, opaque, present: undefined };

    const Structured = Result.getOrThrow(
      definition({
        id: "runtime-next/context-scenario-structured",
        states: ["idle"],
        events: {},
        context: { value: Provider.select(() => source) },
      }),
    );

    // RETURN_TYPE: The fixture retains the structured definition slot mapping.
    const batch = (revision: number): ContextSelectionBatch<typeof Structured> => ({
      slots: ["value"],
      requests: [
        {
          slot: "value",
          provider,
          cut: { identity: provider, revision },
          input: { state: Provider.S.ready, memory: {}, context: {} },
          select: () => source,
          opaqueIdentities: [Provider.S.ready, opaque],
        },
      ],
    });

    const baseline = Result.getOrThrow(installContextBaseline<typeof Structured>(batch(1)));
    const owned = baseline.projection.values.get("value");

    if (owned === undefined) throw Error("Expected owned structured context");

    assert.notStrictEqual(owned, source);
    assert.strictEqual(owned.left, owned.right);
    assert.strictEqual(owned.cycle[0], owned.cycle);
    assert.strictEqual(1 in owned.sparse, false);
    assert.strictEqual(owned.opaque, opaque);
    assert.strictEqual(Object.hasOwn(owned, "present"), true);
    shared.count = 9;
    assert.strictEqual(owned.left.count, 1);
    assert.strictEqual(Object.isFrozen(source), false);
    source.left = { count: 2 };
    const changed = Result.getOrThrow(applyContextWave<typeof Structured>(baseline, batch(2)));

    assert.strictEqual(changed.publication, "changed");
    assert.strictEqual(changed.projection.values.get("value")?.left.count, 2);
    assert.strictEqual(owned.left.count, 1);
    const invalid = { ...source };
    Object.defineProperty(invalid, "accessor", { enumerable: true, get: () => 1 });

    const rejected = applyContextWave<typeof Structured>(changed, {
      slots: ["value"],
      requests: [{ ...batch(3).requests[0]!, select: () => invalid }],
    });

    assert.ok(Result.isFailure(rejected));
    assert.strictEqual(changed.projection.values.get("value")?.left.count, 2);
  });

  // Owner: P05.
  // Source: actor-admission.test.ts:1028 "rejects a cyclic fixed graph before any edge becomes visible".
  // Source: actor-admission.test.ts:1431 "rejects context dependency cycles before activation".
  // Source: context-wave.test.ts:294 "derives one bounded provider-first wave and coalesces unchanged revisions".
  // Source: context-wave.test.ts:495 "rejects dependency cycles before retaining a graph".
  // Source: context-wave.test.ts:552 "rejects issue-only revision overflow before changing the input cut".
  // Source: context-wave.test.ts:620 "rejects normal revision overflow before changing the input cut".
  // Source: context-wave.test.ts:683 "builds forward and reverse context graph indexes".
  // Source: context-wave.test.ts:750 "rejects direct and indirect context cycles before publication".
  // Source: context-wave.test.ts:1333 "exposes context dependency graphs with the expected topology".
  // Source: context-wave.test.ts:1346 "rejects context revision overflow before increment".
  // Contract/correction: STD-10/12; refactor.md ContextCoordinator owner proof matrix.
  // Setup: A provider graph with direct and indirect cycles, unrelated nodes, and a near-limit generation.
  // Action: Plan a wave and attempt invalid edges or successor overflow through the narrow owner port.
  // Observable result: Valid affected order is provider-first and independent of insertion; invalid graph or overflow returns a typed diagnostic before publication.
  // Failure/cleanup: No unrelated node, graph edge, or revision changes after rejection.
  it("RN-CONTEXT-011 graph planning rejects cycles and overflow before publication", () => {
    const root = identity("graph-root");
    const child = identity("graph-child");
    const unrelated = identity("graph-unrelated");

    const nodes: ContextGraphNode[] = [
      { identity: child, providers: [{ slot: "source", provider: root }] },
      { identity: unrelated, providers: [] },
      { identity: root, providers: [] },
    ];

    const graph = Result.getOrThrow(buildContextGraph(nodes));
    const plan = Result.getOrThrow(planContextWave(graph, root));

    assert.deepStrictEqual(plan.order, [root, child]);
    assert.strictEqual(plan.affected.has(unrelated.key), false);
    assert.ok(
      Result.isFailure(
        buildContextGraph([
          { identity: root, providers: [{ slot: "source", provider: child }] },
          nodes[0]!,
        ]),
      ),
    );
    assert.ok(Result.isFailure(checkedContextGeneration(Number.MAX_SAFE_INTEGER)));
    assert.strictEqual(Result.getOrThrow(checkedContextGeneration(4)), 5);
    assert.deepStrictEqual(Result.getOrThrow(planContextWave(graph, root)).order, [root, child]);
  });

  // Owner: P05.
  // Source: context-wave.test.ts:1238 "distinguishes provider incarnations at one actor key".
  // Source: context-wave.test.ts:1897 "retains every unresolved ancestor requirement when context debt is updated".
  // Source: context-wave.test.ts:1972 "does not replace unresolved debt with a different incarnation at the same actor key".
  // Contract/correction: STD-01/10; refactor.md ContextCoordinator owner proof matrix.
  // Setup: A dependent with multiple unresolved ancestor requirements.
  // Action: Cover one requirement, then offer the same actor key from a different incarnation.
  // Observable result: Only matching fence and revision clear the corresponding debt; other requirements remain.
  // Failure/cleanup: Conflicting incarnation is typed and cannot authorize publication.
  it.effect("RN-CONTEXT-012 lineage debt requires exact incarnation coverage", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make();
      const fixture = yield* makeDiamondHarness(scope);
      fixture.setRejectOffers(true);
      fixture.setProviderChanged();

      const blocked = Result.getOrThrow(
        fixture.coordinator.prepareNotification({
          identity: fixture.providerIdentity,
          snapshot: fixture.providerSnapshot(),
        }),
      );

      fixture.coordinator.publish(blocked);
      assert.ok(Exit.isFailure(yield* Effect.exit(fixture.coordinator.drain())));
      assert.strictEqual(fixture.leafOffers.length, 1);
      fixture.setRejectOffers(false);
      fixture.setProviderChanged();

      const covering = Result.getOrThrow(
        fixture.coordinator.prepareNotification({
          identity: fixture.providerIdentity,
          snapshot: fixture.providerSnapshot(),
        }),
      );

      fixture.coordinator.publish(covering);
      yield* fixture.coordinator.drain();
      assert.strictEqual(fixture.leafOffers.at(-1)?.left, Provider.S.changed);
      assert.strictEqual(fixture.leafOffers.at(-1)?.right, Provider.S.changed);

      const ancestorA = identity("debt-a");
      const directory = makeActorDirectory<string>({ machines: [ProviderMachine] });
      const ref = actorRef(ProviderMachine, "debt-b");
      const first = Result.getOrThrow(directory.reserve({ kind: "stable", ref }));

      if (first._tag !== "create") return yield* Effect.fail(unavailable());

      yield* directory.rollback(first.reservation, unavailable());
      const second = Result.getOrThrow(directory.reserve({ kind: "stable", ref }));

      if (second._tag !== "create") return yield* Effect.fail(unavailable());

      const ancestorB = first.reservation.identity;
      const recycledB = second.reservation.identity;
      const edge = fixture.consumerIdentity.key;

      const required = new Map([
        [ancestorA.key, { identity: ancestorA, revision: 4 }],
        [ancestorB.key, { identity: ancestorB, revision: 5 }],
      ]);

      const pending = Result.getOrThrow(
        reconcileContextEdgeDebt(
          new Map(),
          edge,
          required,
          new Map([[ancestorA.key, { identity: ancestorA, revision: 4 }]]),
        ),
      );

      assert.strictEqual(pending.get(edge)?.get(ancestorA.key), undefined);
      assert.strictEqual(pending.get(edge)?.get(ancestorB.key)?.revision, 5);
      assert.ok(
        Result.isFailure(
          reconcileContextEdgeDebt(
            pending,
            edge,
            new Map(),
            new Map([[ancestorB.key, { identity: recycledB, revision: 6 }]]),
          ),
        ),
      );
      assert.strictEqual(pending.get(edge)?.get(ancestorB.key)?.identity, ancestorB);
      yield* fixture.coordinator.close();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  // Owner: P05.
  // Source: new refactor.md owner proof; no frozen source declaration.
  // Contract/correction: Approved correction 3; STD-09/12; refactor.md ContextCoordinator owner proof matrix.
  // Frozen outcome: Frozen graph traversal or fanout could recurse or expand work without a finite bound.
  // Required new outcome: Iterative affected-graph work, finite fanout, and fair scheduling let a queued cold root progress.
  // Setup: A deep chain, wide fanout, one hot root, and a queued cold root.
  // Action: Publish repeated hot-root updates while measuring affected work and holding some consumers.
  // Observable result: Traversal stays iterative and O(V+E), fanout concurrency stays finite, and the cold root completes without starvation; frozen worklists could recurse or grow without a bound.
  // Failure/cleanup: Quiesce and close settle all held waves and tickets without stranded work.
  it.effect("RN-CONTEXT-013 deep and wide context graphs make bounded fair progress", () =>
    Effect.gen(function* () {
      const directory = makeActorDirectory<string>({ machines: [ProviderMachine] });
      const deep: ContextGraphNode[] = [];
      let previous: ContextGraphNode["identity"] | undefined;

      for (let index = 0; index < 20_000; index += 1) {
        const admission = Result.getOrThrow(
          directory.reserve({
            kind: "stable",
            ref: actorRef(ProviderMachine, `deep-${index}`),
          }),
        );

        if (admission._tag !== "create") return yield* Effect.fail(unavailable());

        const current = admission.reservation.identity;
        deep.push({
          identity: current,
          providers: previous === undefined ? [] : [{ slot: "source", provider: previous }],
        });
        previous = current;
      }

      const root = deep[0]?.identity;

      if (root === undefined) return yield* Effect.fail(unavailable());

      const deepPlan = Result.getOrThrow(
        planContextWave(Result.getOrThrow(buildContextGraph(deep)), root),
      );

      assert.strictEqual(deepPlan.order.length, deep.length);
      assert.strictEqual(deepPlan.order.at(-1), previous);
      const wide: ContextGraphNode[] = [{ identity: root, providers: [] }];

      for (const node of deep.slice(1, 2_001))
        wide.push({ identity: node.identity, providers: [{ slot: "source", provider: root }] });

      assert.strictEqual(
        Result.getOrThrow(planContextWave(Result.getOrThrow(buildContextGraph(wide)), root)).order
          .length,
        2_001,
      );

      const scope = yield* Scope.make();
      const hot = yield* makeHarness(scope);
      yield* hot.coordinator.drain();

      const coldDirectory = makeActorDirectory<string>({
        machines: [ProviderMachine, ConsumerMachine],
      });

      const coldRootRef = actorRef(ProviderMachine, "cold-root");
      const coldConsumerRef = actorRef(ConsumerMachine, "cold-consumer");

      const coldRootAdmission = Result.getOrThrow(
        coldDirectory.reserve({ kind: "stable", ref: coldRootRef }),
      );

      const coldConsumerAdmission = Result.getOrThrow(
        coldDirectory.reserve({ kind: "stable", ref: coldConsumerRef }),
      );

      if (coldRootAdmission._tag !== "create" || coldConsumerAdmission._tag !== "create")
        return yield* Effect.fail(unavailable());

      const coldRoot = coldRootAdmission.reservation.identity;
      const coldConsumer = coldConsumerAdmission.reservation.identity;
      let coldState: ProviderValue = Provider.S.ready;
      let coldRevision = 1;
      let coldValue: ProviderValue = Provider.S.ready;
      let coldConsumerRevision = 1;
      let coldPublished = Deferred.makeUnsafe<void>();

      // RETURN_TYPE: The root fixture must satisfy the actor snapshot port.
      const coldRootSnapshot = (): ActorSnapshot<typeof Provider> => ({
        state: coldState,
        memory: {},
        context: {},
        lifecycle: "active",
        operations: [],
        timers: [],
        issues: [],
        revision: coldRevision,
        observedStoreRevision: 0,
      });

      // RETURN_TYPE: The consumer fixture must satisfy the actor snapshot port.
      const coldConsumerSnapshot = (): ActorSnapshot<typeof Consumer> => ({
        state: Consumer.S.idle,
        memory: {},
        context: { value: coldValue },
        lifecycle: "active",
        operations: [],
        timers: [],
        issues: [],
        revision: coldConsumerRevision,
        observedStoreRevision: 0,
      });

      const coldRootNode: ContextNode<typeof Provider> = {
        identity: coldRoot,
        participant: {
          ref: coldRootRef,
          snapshot: coldRootSnapshot,
          offerContext: () => Result.fail(unavailable()),
        },
        providers: [],
        opaqueIdentities: [Provider.S.ready, Provider.S.changed],
        selectionBatch: () => Result.succeed({ slots: [], requests: [] }),
      };

      const coldConsumerNode: ContextNode<typeof Consumer> = {
        identity: coldConsumer,
        participant: {
          ref: coldConsumerRef,
          snapshot: coldConsumerSnapshot,
          offerContext(ticket) {
            return Result.succeed({
              wait: Effect.sync(() => {
                const offer = Result.getOrThrow(ticket.consume(coldConsumer, coldConsumerRevision));
                const value = offer.entries[0]?.value;

                assert.ok(value !== undefined);

                coldValue = value;
                coldConsumerRevision += 1;
                Deferred.doneUnsafe(coldPublished, Effect.void);

                return { status: "published" as const, snapshot: coldConsumerSnapshot() };
              }),
              cancel() {},
            });
          },
        },
        providers: [{ slot: "value", provider: coldRoot }],
        opaqueIdentities: [Provider.S.ready, Provider.S.changed],
        selectionBatch(captured) {
          const observed = captured.get(coldRoot.key);

          if (observed === undefined || !isProviderState(observed.snapshot.state))
            return Result.fail(unavailable());

          return Result.succeed({
            slots: ["value"],
            requests: [
              {
                slot: "value",
                provider: coldRoot,
                cut: { identity: coldRoot, revision: observed.snapshot.revision },
                input: { state: observed.snapshot.state, memory: {}, context: {} },
                select: ({ state }) => state,
                opaqueIdentities: [Provider.S.ready, Provider.S.changed],
              },
            ],
          });
        },
      };

      Result.getOrThrow(hot.coordinator.register(coldRootNode)).enable();
      Result.getOrThrow(hot.coordinator.register(coldConsumerNode)).enable();
      yield* hot.coordinator.drain();
      coldPublished = Deferred.makeUnsafe();
      const gate = yield* Deferred.make<void>();
      hot.holdOffers(gate);
      hot.toggleProvider();

      const active = Result.getOrThrow(
        hot.coordinator.prepareNotification({
          identity: hot.providerIdentity,
          snapshot: hot.providerSnapshot(),
        }),
      );

      hot.coordinator.publish(active);
      yield* hot.awaitOffer();

      for (let update = 0; update < 32; update += 1) {
        hot.toggleProvider();

        const prepared = Result.getOrThrow(
          hot.coordinator.prepareNotification({
            identity: hot.providerIdentity,
            snapshot: hot.providerSnapshot(),
          }),
        );

        hot.coordinator.publish(prepared);
      }

      coldState = Provider.S.changed;
      coldRevision += 1;

      const coldPrepared = Result.getOrThrow(
        hot.coordinator.prepareNotification({
          identity: coldRoot,
          snapshot: coldRootSnapshot(),
        }),
      );

      hot.coordinator.publish(coldPrepared);
      yield* Deferred.succeed(gate, undefined);
      yield* Deferred.await(coldPublished);
      assert.ok(Object.is(coldValue, Provider.S.changed));
      yield* hot.coordinator.close();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  // Owner: P05.
  // Source: new refactor.md owner proof; no frozen source declaration.
  // Contract/correction: Approved correction 3/5; refactor.md ContextCoordinator bounded root work.
  // Frozen outcome: Frozen root queues could accumulate updates or silently drop blocked delivery.
  // Required new outcome: Root work coalesces within a bound and retains the latest complete required cut or a named failure.
  // Setup: A provider producing many updates while its dependent is blocked.
  // Action: Publish repeatedly, release the dependent, then drain.
  // Observable result: Queue retention stays bounded and the dependent reaches the latest complete required context; frozen root queues could grow or silently drop.
  // Failure/cleanup: Close settles every captured generation with a named diagnostic when a participant remains blocked.
  it.effect("RN-CONTEXT-014 root updates coalesce without losing the latest required cut", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make();
      const fixture = yield* makeHarness(scope);
      yield* fixture.coordinator.drain();
      const gate = yield* Deferred.make<void>();
      fixture.holdOffers(gate);
      fixture.toggleProvider();

      const active = Result.getOrThrow(
        fixture.coordinator.prepareNotification({
          identity: fixture.providerIdentity,
          snapshot: fixture.providerSnapshot(),
        }),
      );

      assert.strictEqual(fixture.coordinator.publish(active), "accepted");
      yield* fixture.awaitOffer();
      const statuses: string[] = [];

      for (let update = 0; update < 4; update += 1) {
        fixture.toggleProvider();

        const prepared = Result.getOrThrow(
          fixture.coordinator.prepareNotification({
            identity: fixture.providerIdentity,
            snapshot: fixture.providerSnapshot(),
          }),
        );

        statuses.push(fixture.coordinator.publish(prepared));
      }

      assert.deepStrictEqual(statuses, ["accepted", "coalesced", "coalesced", "coalesced"]);
      yield* Deferred.succeed(gate, undefined);
      yield* Effect.exit(fixture.coordinator.drain());
      yield* Effect.exit(fixture.coordinator.drain());
      yield* fixture.coordinator.drain();
      assert.strictEqual(fixture.consumerSnapshot().context.value, Provider.S.changed);
      assert.strictEqual(fixture.offered.at(-1)?.revision, fixture.providerSnapshot().revision);
      yield* fixture.coordinator.close();
      yield* Scope.close(scope, Exit.void);
    }),
  );
});
