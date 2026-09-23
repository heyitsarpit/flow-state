import { assert, describe, it } from "@effect/vitest";
import { Cause, Clock, Deferred, Effect, Exit, Fiber, Option, Result, Scope } from "effect";
import { TestClock } from "effect/testing";

import { definition } from "../../definition/definition.js";
import { Failure } from "../../diagnostic/diagnostic.js";
import { machine } from "../../machine/machine.js";
import { makeActorDirectory } from "../actor/actor-directory.js";
import { makeEvidenceJournal } from "../evidence/evidence-journal.js";
import {
  publishEvidenceSequence,
  reserveEvidenceSequence,
} from "../evidence/evidence-journal-sequence.js";
import { evidenceSequence } from "../evidence/evidence-record.js";
import { makeEvidenceSink, type EvidenceSink } from "../evidence/evidence-sink.js";
import { makeRuntimeEvidencePolicy } from "../runtime-services.js";

const Definition = definition({
  id: "runtime-next/evidence-owner",
  states: ["idle"],
  events: {},
});

const Machine = Result.getOrThrow(
  machine(Definition, ({ S }) => ({ default: S.idle, states: { idle: {} } })),
);

const fixture = (capacity = 8) =>
  Effect.gen(function* () {
    const ownerScope = yield* Scope.make();
    const app = {};
    const plan = {};
    const journal = Result.getOrThrow(makeEvidenceJournal({ app, plan, ownerScope, capacity }));
    const directory = makeActorDirectory<string>({ machines: [Machine] });

    const fence = (id: string) => {
      const position = Result.getOrThrow(
        directory.reserve({
          kind: "stable",
          ref: { machine: Machine, id, persist: false },
        }),
      );

      assert.ok(position._tag === "create");

      return position.reservation.identity;
    };

    const turn = (actor: ReturnType<typeof fence>) => ({
      _tag: "turn" as const,
      fence: actor,
      provenance: { app, plan, actor },
      cause: { _tag: "event", event: { type: "go" } },
      before: { value: 0 },
      after: { value: 1 },
      timestamp: 100,
      publicationRevision: 1,
      machineTurnRevision: 1,
    });

    const turnWith = <Snapshot>(actor: ReturnType<typeof fence>, value: Snapshot) => ({
      ...turn(actor),
      after: value,
    });

    const lifecycle = (actor: ReturnType<typeof fence>, terminal = false) => ({
      _tag: "lifecycle" as const,
      machineTurn: false as const,
      fence: actor,
      provenance: { app, plan, actor },
      cause: { _tag: "start" },
      before: { phase: "prepared" },
      after: { phase: terminal ? "disposed" : "active" },
      from: "prepared",
      to: terminal ? "disposed" : "active",
      timestamp: 200,
      publicationRevision: 1,
      machineTurnRevision: 0,
      terminal,
    });

    return { ownerScope, app, plan, journal, directory, fence, turn, turnWith, lifecycle };
  });

const store = (revision: number) => ({ revision, changed: [] });

describe("runtime-next evidence", () => {
  // Owner: P06.
  // Source: runtime-integration.test.ts:983 "keeps failed store evidence anchored to the last committed snapshot".
  // Contract/correction: SNAP-001; refactor.md EvidenceJournal and ActorEngine one-cut protocol.
  // Setup: An actor with a failing store write followed by a successful retry.
  // Action: Inspect turn records across both attempts.
  // Observable result: Failure evidence uses the prior committed state and issue; retry evidence and receipt use the new revision and store cursor.
  // Failure/cleanup: No journal record claims a cut that did not commit.
  it.todo("RN-EVIDENCE-001 failed turn evidence names the last committed state");

  // Owner: P04.
  // Source: evidence.test.ts:416 "uses the supplied runtime clock for publication timestamps".
  // Source: evidence.test.ts:930 "timestamps accepted publications from the supplied runtime clock".
  // Source: runtime-integration.test.ts:2146 "F3 keeps lifecycle evidence machine-turn revision actor-local".
  // Source: runtime-integration.test.ts:2222 "uses the provided Effect Clock for assembled lifecycle evidence".
  // Contract/correction: SNAP-001; refactor.md EvidenceJournal.
  // Setup: Two registered actor fences, lifecycle and turn drafts, and a controlled Effect Clock.
  // Action: Advance the clock, prepare and accept both records.
  // Observable result: Evidence sequences are unique and monotonic; each record names its own actor turn revision and supplied timestamp.
  // Failure/cleanup: Close drains accepted records without fabricating a new actor turn.
  it.effect(
    "RN-EVIDENCE-002 lifecycle evidence keeps actor-local revision and provided clock",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture();
        const first = f.fence("clock-first");
        const second = f.fence("clock-second");
        const firstCredit = Result.getOrThrow(f.journal.registerActor(first));
        const secondCredit = Result.getOrThrow(f.journal.registerActor(second));
        const clock = yield* Clock.Clock;
        const evidence = makeRuntimeEvidencePolicy(f.journal, clock);

        yield* TestClock.adjust(10);

        const lifecycle = Result.getOrThrow(
          evidence.prepareLifecycle(firstCredit, f.lifecycle(first)),
        ).accept();

        const committed = store(7);

        yield* TestClock.adjust(10);

        const turn = Result.getOrThrow(
          evidence.prepareTurn(secondCredit, {
            ...f.turn(second),
            machineTurnRevision: 3,
          }),
        ).accept(committed);

        assert.deepStrictEqual([lifecycle.sequence, turn.sequence], [1, 2]);
        assert.strictEqual(lifecycle.record.timestamp, 10);
        assert.strictEqual(lifecycle.record.machineTurnRevision, 0);
        assert.strictEqual(turn.record.timestamp, 20);
        assert.strictEqual(turn.record.machineTurnRevision, 3);
        firstCredit.release();
        secondCredit.release();
        assert.strictEqual((yield* f.journal.close()).through, 2);
        yield* Scope.close(f.ownerScope, Exit.void);
      }).pipe(Effect.provide(TestClock.layer())),
  );

  // Owner: P06.
  // Source: runtime-integration.test.ts:3690 "keeps sink delivery after the committed-turn acknowledgement".
  // Contract/correction: Approved correction 2; refactor.md EvidenceJournal and EvidenceSink.
  // Frozen outcome: Frozen acknowledgement preceded sink delivery but observer failure could still affect committed truth.
  // Required new outcome: Receipt is final at the cut and later sink or observer failure cannot roll it back.
  // Setup: A committed actor turn and a gated sink.
  // Action: Await the dispatch receipt while sink delivery remains held, then release delivery and close.
  // Observable result: The receipt proves the actor cut and evidence sequence before external delivery runs.
  // Failure/cleanup: Sink failure cannot retroactively reject the committed turn; close accounts for accepted records.
  it.todo("RN-EVIDENCE-003 committed acknowledgement precedes sink delivery");

  // Owner: P04.
  // Source: evidence.test.ts:2025 "drains a captured evidence prefix while a newer record is accepted".
  // Source: runtime-integration.test.ts:3612 "drains a captured evidence prefix while newer runtime records arrive".
  // Contract/correction: STD-08/09; refactor.md EvidenceSink.
  // Setup: An attached sink and two accepted records separated by a drain gate.
  // Action: Start a drain after the first record, accept another, then release delivery.
  // Observable result: The first drain reports the captured prefix and the second includes the newer record.
  // Failure/cleanup: Interruption or close settles each accepted record and retains delivery status.
  it.effect("RN-EVIDENCE-004 drain settles a captured prefix while later records arrive", () =>
    Effect.gen(function* () {
      const f = yield* fixture();
      const actor = f.fence("drain-prefix");
      const credit = Result.getOrThrow(f.journal.registerActor(actor));
      const entered = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      const delivered: number[] = [];

      const sink = yield* makeEvidenceSink({
        deliver: (record) =>
          Effect.gen(function* () {
            if (record.sequence === 1) {
              yield* Deferred.succeed(entered, undefined);
              yield* Deferred.await(release);
            }

            delivered.push(record.sequence);
          }),
      });

      assert.ok(
        Result.isSuccess(f.journal.attach(Result.getOrThrow(f.journal.issueAttachment(sink)))),
      );
      const firstStore = store(1);
      Result.getOrThrow(f.journal.prepareTurn(credit, f.turn(actor))).accept(firstStore);
      const firstDrain = yield* f.journal.drain().pipe(Effect.forkChild);
      yield* Deferred.await(entered);
      const secondStore = store(2);
      Result.getOrThrow(f.journal.prepareTurn(credit, f.turn(actor))).accept(secondStore);
      yield* Deferred.succeed(release, undefined);
      assert.strictEqual((yield* Fiber.join(firstDrain)).through, 1);
      assert.strictEqual((yield* f.journal.drain()).through, 2);
      assert.deepStrictEqual(delivered, [1, 2]);
      credit.release();
      yield* f.journal.close();
      yield* Scope.close(f.ownerScope, Exit.void);
    }),
  );

  // Owner: P07.
  // Source: runtime-integration.test.ts:6615 "releases unused terminal credit when actor admission rolls back".
  // Contract/correction: STD-01/06; refactor.md EvidenceJournal credit protocol.
  // Setup: An admission that reserves a complete-fence credit and then fails before exposure.
  // Action: Retry admission and perform a turn.
  // Observable result: The failed attempt leaves no credit or journal record; the retry can accept evidence.
  // Failure/cleanup: Disposal and runtime close release the surviving credit exactly once.
  it.todo("RN-EVIDENCE-005 rolled-back actor admission releases its evidence credit");

  // Owner: P07.
  // Source: runtime-architecture.test.ts:463 "drains accepted assembly evidence before closing the runtime".
  // Contract/correction: STD-05/08; refactor.md EvidenceSink and FlowRuntimeShell.
  // Setup: An actor with accepted lifecycle and turn evidence plus a sink.
  // Action: Dispose actor and runtime while delivery is pending.
  // Observable result: Turn and lifecycle records retain their causal sequence and close waits for accepted delivery accounting.
  // Failure/cleanup: Delivery failures remain in the close Cause and do not skip provider cleanup.
  it.todo("RN-EVIDENCE-006 runtime close drains accepted evidence after actor cleanup");

  // Owner: P04.
  // Source: evidence.test.ts:232 "prepares publication evidence before finalizing its committed store cut".
  // Source: evidence.test.ts:276 "tombstones prepared actor evidence when record construction fails".
  // Source: evidence.test.ts:641 "cancels a failed timestamp before the next actor publication".
  // Source: evidence.test.ts:1003 "constructs a complete unsequenced turn fact from app provenance".
  // Source: evidence.test.ts:1641 "keeps evidence acknowledgement private".
  // Source: lifecycle.test.ts:1860 "tombstones lifecycle evidence after acceptance failure".
  // Contract/correction: Approved correction 2; refactor.md EvidenceJournal preflight.
  // Frozen outcome: Frozen evidence preparation admitted a post-store failure window.
  // Required new outcome: Every fallible record/timestamp/copy step completes before store commit; acceptance after commit is total.
  // Setup: A registered actor fence, controlled clock, and records that can fail preflight.
  // Action: Prepare, fail one timestamp or copy, then accept a valid committed cut.
  // Observable result: No sequence is consumed before acceptance; the accepted record binds the committed store and snapshot with the supplied time; frozen publication allowed a post-store failure window.
  // Failure/cleanup: Cancellation returns capacity and close drains only accepted records.
  it.effect("RN-EVIDENCE-007 evidence preparation is fallible before the store cut", () =>
    Effect.gen(function* () {
      const f = yield* fixture(1);
      const actor = f.fence("preflight");
      const credit = Result.getOrThrow(f.journal.registerActor(actor));
      const invalidAfter = {};
      let getterReads = 0;
      let topLevelReads = 0;
      const delivered: number[] = [];

      const sink = yield* makeEvidenceSink({
        capacity: 1,
        deliver: (record) => Effect.sync(() => void delivered.push(record.sequence)),
      });

      Result.getOrThrow(f.journal.attach(Result.getOrThrow(f.journal.issueAttachment(sink))));

      Object.defineProperty(invalidAfter, "value", {
        enumerable: true,
        get: () => {
          getterReads += 1;

          return Result.getOrThrow(
            Result.fail(
              Failure({
                code: "InvalidTraceRecord",
                path: ["evidence", "getter"],
                details: {},
                summary: "Hostile getter",
                help: "Use a data property.",
              }),
            ),
          );
        },
      });

      assert.ok(Result.isFailure(f.journal.prepareTurn(credit, f.turnWith(actor, invalidAfter))));
      const policy = makeRuntimeEvidencePolicy(f.journal, yield* Clock.Clock);

      const hostileTurn = Object.defineProperty(f.turn(actor), "before", {
        enumerable: true,
        get: () => {
          topLevelReads += 1;

          return { value: 0 };
        },
      });

      const hostileLifecycle = Object.defineProperty(f.lifecycle(actor), "provenance", {
        enumerable: true,
        get: () => {
          topLevelReads += 1;

          return { app: f.app, plan: f.plan, actor };
        },
      });

      const turnFailure = policy.prepareTurn(credit, hostileTurn);
      const lifecycleFailure = policy.prepareLifecycle(credit, hostileLifecycle);

      assert.ok(Result.isFailure(turnFailure));
      assert.ok(Result.isFailure(lifecycleFailure));

      if (Result.isFailure(turnFailure))
        assert.strictEqual(turnFailure.failure.code, "SchemaValidation");

      if (Result.isFailure(lifecycleFailure))
        assert.strictEqual(lifecycleFailure.failure.code, "SchemaValidation");

      assert.ok(Result.isFailure(policy.prepareTurn(credit, f.turnWith(actor, invalidAfter))));
      assert.strictEqual(getterReads, 0);
      assert.strictEqual(topLevelReads, 0);
      assert.ok(
        Result.isFailure(f.journal.prepareTurn(credit, { ...f.turn(actor), timestamp: -1 })),
      );
      assert.strictEqual(f.journal.sequence(), 0);
      assert.ok(getterReads <= 1);
      const prepared = Result.getOrThrow(f.journal.prepareTurn(credit, f.turn(actor)));
      prepared.cancel();
      assert.strictEqual(f.journal.sequence(), 0);
      const committed = store(1);

      const accepted = Result.getOrThrow(f.journal.prepareTurn(credit, f.turn(actor))).accept(
        committed,
      );

      assert.strictEqual(accepted.sequence, 1);
      assert.strictEqual(accepted.record.timestamp, 100);
      assert.strictEqual(accepted.attachments[0]?.status, "accepted");
      credit.release();
      const closed = yield* f.journal.close();
      assert.strictEqual(closed.through, 1);
      assert.strictEqual(closed.attachments[0]?.accounting.accepted, 1);
      assert.strictEqual(closed.attachments[0]?.accounting.dropped, 0);
      assert.deepStrictEqual(delivered, [1]);
      yield* Scope.close(f.ownerScope, Exit.void);
    }),
  );

  // Owner: P04.
  // Source: evidence.test.ts:329 "JOURNAL-ORDER assigns evidence sequences in commit order despite reversed preparation order".
  // Source: evidence.test.ts:451 "orders turn and lifecycle records through one accepted prefix".
  // Source: evidence.test.ts:502 "tombstones a failed record and unblocks the next reservation".
  // Source: evidence.test.ts:535 "keeps lifecycle and actor acceptance in global sequence order".
  // Source: evidence.test.ts:1447 "linearizes concurrent evidence acceptance by sequence".
  // Source: evidence.test.ts:1489 "applies the no-op turn evidence policy explicitly".
  // Source: evidence.test.ts:1701 "cancels failed evidence reservations without blocking the prefix".
  // Source: evidence.test.ts:1720 "preserves actor and lifecycle evidence order across one interleave".
  // Source: evidence.test.ts:1919 "cancels an interrupted Journal acceptance waiter".
  // Source: evidence.test.ts:2005 "drains the accepted prefix after a cancelled reservation".
  // Contract/correction: STD-06/10; refactor.md EvidenceJournal.
  // Setup: Records A and B prepared in that order, plus a third preparation that will be cancelled.
  // Action: Accept B before A and cancel the third permit.
  // Observable result: The journal and sink observe B at sequence 1, then A at sequence 2; preparation order does not reserve publication order and cancellation leaves no gap.
  // Failure/cleanup: Total synchronous acceptance or cancellation cannot strand a preparation; drain reaches the accepted prefix and actor-lifetime credits release separately.
  it.effect("RN-EVIDENCE-008 accepted evidence forms one contiguous commit-order prefix", () =>
    Effect.gen(function* () {
      const f = yield* fixture(3);
      const actor = f.fence("commit-order");
      const credit = Result.getOrThrow(f.journal.registerActor(actor));
      const delivered: number[] = [];

      const sink = yield* makeEvidenceSink({
        deliver: (record) => Effect.sync(() => void delivered.push(record.sequence)),
      });

      Result.getOrThrow(f.journal.attach(Result.getOrThrow(f.journal.issueAttachment(sink))));
      const a = Result.getOrThrow(f.journal.prepareTurn(credit, f.turn(actor)));
      const b = Result.getOrThrow(f.journal.prepareTurn(credit, f.turn(actor)));
      const cancelled = Result.getOrThrow(f.journal.prepareTurn(credit, f.turn(actor)));
      const second = b.accept(store(2));
      const first = a.accept(store(1));
      cancelled.cancel();

      assert.deepStrictEqual([second.sequence, first.sequence], [1, 2]);
      assert.strictEqual(f.journal.sequence(), 2);
      assert.strictEqual((yield* f.journal.drain()).through, 2);
      assert.deepStrictEqual(delivered, [1, 2]);
      credit.release();
      yield* f.journal.close();
      yield* Scope.close(f.ownerScope, Exit.void);
    }),
  );

  // Owner: P04.
  // Source: evidence.test.ts:584 "rejects lifecycle preparation without a runtime-owned reservation".
  // Source: evidence.test.ts:1020 "accepts only hub-reserved evidence sequences".
  // Source: evidence.test.ts:1038 "rejects equal-sequence evidence from a foreign reservation".
  // Source: evidence.test.ts:1155 "rejects evidence from a foreign app identity".
  // Source: evidence.test.ts:1423 "admits each evidence sink to one Journal only".
  // Source: evidence.test.ts:1523 "rejects mismatched actor provenance before sequence reservation".
  // Source: evidence.test.ts:1879 "binds Journal acceptance to the registered actor fence".
  // Source: evidence.test.ts:2130 "rejects duplicate and mixed-runtime sink attachment while marking a late attach".
  // Source: lifecycle.test.ts:1954 "derives actor provenance separately for two lifecycle owners".
  // Contract/correction: STD-01/10; refactor.md EvidenceJournal.
  // Setup: Two journals with same-looking sequence and actor keys.
  // Action: Use foreign, stale, mismatched, duplicate, or replayed credits and sink attachments.
  // Observable result: Every invalid authority yields a typed diagnostic before local sequence or attachment mutation.
  // Failure/cleanup: The local valid retry accepts; a foreign release cannot retire the current incarnation.
  it.effect("RN-EVIDENCE-009 evidence credits and attachments reject foreign authority", () =>
    Effect.gen(function* () {
      const first = yield* fixture();
      const second = yield* fixture();
      const firstFence = first.fence("same-label");
      const secondFence = second.fence("same-label");
      const firstCredit = Result.getOrThrow(first.journal.registerActor(firstFence));
      const secondCredit = Result.getOrThrow(second.journal.registerActor(secondFence));
      const sink = yield* makeEvidenceSink();
      const token = Result.getOrThrow(first.journal.issueAttachment(sink));

      assert.ok(Result.isFailure(second.journal.attach(token)));
      assert.ok(Result.isSuccess(first.journal.attach(token)));
      assert.ok(Result.isFailure(first.journal.attach(token)));
      assert.ok(Result.isFailure(second.journal.issueAttachment(sink)));
      assert.ok(
        Result.isFailure(second.journal.prepareTurn(firstCredit, second.turn(secondFence))),
      );
      assert.ok(Result.isFailure(first.journal.prepareTurn(firstCredit, second.turn(secondFence))));
      const otherFence = first.fence("different-actor");

      assert.ok(
        Result.isFailure(
          first.journal.prepareTurn(firstCredit, {
            ...first.turn(firstFence),
            provenance: { app: first.app, plan: first.plan, actor: otherFence },
          }),
        ),
      );

      let getterReads = 0;

      class HostileProvenance {
        plan = first.plan;
        actor = firstFence;

        get app() {
          getterReads += 1;

          return first.app;
        }
      }

      assert.ok(
        Result.isFailure(
          first.journal.prepareTurn(firstCredit, {
            ...first.turn(firstFence),
            provenance: new HostileProvenance(),
          }),
        ),
      );
      assert.strictEqual(getterReads, 0);
      assert.strictEqual(first.journal.sequence(), 0);
      assert.strictEqual(second.journal.sequence(), 0);
      firstCredit.release();
      firstCredit.release();
      const replacement = Result.getOrThrow(first.journal.registerActor(firstFence));
      firstCredit.release();
      const committed = store(1);
      assert.strictEqual(
        Result.getOrThrow(first.journal.prepareTurn(replacement, first.turn(firstFence))).accept(
          committed,
        ).sequence,
        1,
      );
      replacement.release();
      secondCredit.release();
      yield* first.journal.close();
      yield* second.journal.close();
      yield* Scope.close(first.ownerScope, Exit.void);
      yield* Scope.close(second.ownerScope, Exit.void);
    }),
  );

  // Owner: P04.
  // Source: evidence.test.ts:716 "isolates bounded sink overflow and reports the greatest omitted sequence".
  // Source: evidence.test.ts:767 "delivers to healthy sinks after another sink fails".
  // Source: evidence.test.ts:826 "marks queued records omitted when a sink fails before drain".
  // Source: evidence.test.ts:870 "marks queued records omitted when a sink closes before drain".
  // Source: evidence.test.ts:901 "offers to a sink only when the offer effect runs".
  // Source: evidence.test.ts:1093 "keeps sink overflow local to the failing sink".
  // Source: evidence.test.ts:1123 "retains sink delivery failure after acceptance".
  // Source: evidence.test.ts:2080 "accepts zero sink capacity while preserving an exact positive bound".
  // Contract/correction: Approved correction 3/5; STD-09; refactor.md EvidenceSink.
  // Frozen outcome: Frozen sink buffering could grow or silently omit when a reader stalled.
  // Required new outcome: Finite per-sink bounds and exact omission or failure accounting preserve journal truth.
  // Setup: Small, zero-capacity, healthy, and failing sinks attached to one journal.
  // Action: Accept several records and drain.
  // Observable result: Each sink reports offered, dropped, truncated, or failed terminal accounting with greatest omitted sequence; healthy delivery continues.
  // Failure/cleanup: A failed or closed sink detaches while accepted journal truth remains intact.
  it.effect("RN-EVIDENCE-010 bounded sinks account for each omitted record independently", () =>
    Effect.gen(function* () {
      const f = yield* fixture();
      const actor = f.fence("sink-bounds");
      const credit = Result.getOrThrow(f.journal.registerActor(actor));
      const healthy: number[] = [];
      const zero = yield* makeEvidenceSink({ id: "zero", capacity: 0 });
      const one = yield* makeEvidenceSink({ id: "one", capacity: 1 });

      const good = yield* makeEvidenceSink({
        id: "good",
        deliver: (record) =>
          Effect.sync(() => {
            assert.strictEqual(Reflect.set(record, "sequence", 999), false);
            assert.strictEqual(Reflect.set(record, "store", store(999)), false);
            healthy.push(record.sequence);
          }),
      });

      const bad = yield* makeEvidenceSink({
        id: "bad",
        deliver: () =>
          Effect.fail(
            Failure({
              code: "CleanupFailed",
              path: ["sink"],
              details: {},
              summary: "Delivery failed",
              help: "Inspect the sink failure.",
            }),
          ),
      });

      for (const sink of [zero, one, good, bad])
        Result.getOrThrow(f.journal.attach(Result.getOrThrow(f.journal.issueAttachment(sink))));

      for (const revision of [1, 2]) {
        const committed = store(revision);

        const acceptance = Result.getOrThrow(f.journal.prepareTurn(credit, f.turn(actor))).accept(
          committed,
        );

        if (revision === 1) {
          const outcomes = acceptance.attachments.map((offer) => [offer.sink, offer.status]);
          const firstOffer = acceptance.attachments[0];
          assert.ok(firstOffer !== undefined);

          assert.ok(Object.isFrozen(acceptance));
          assert.ok(Object.isFrozen(acceptance.attachments));
          assert.ok(acceptance.attachments.every(Object.isFrozen));
          assert.strictEqual(Reflect.set(acceptance, "sequence", 999), false);
          assert.strictEqual(Reflect.set(acceptance.attachments, 0, {}), false);
          assert.strictEqual(Reflect.set(firstOffer, "status", "accepted"), false);
          assert.strictEqual(acceptance.sequence, 1);
          assert.deepStrictEqual(
            acceptance.attachments.map((offer) => [offer.sink, offer.status]),
            outcomes,
          );
        }
      }

      const drained = yield* f.journal.drain();
      const bySink = new Map(drained.attachments.map((result) => [result.sink, result]));

      assert.strictEqual(bySink.get("zero")?.accounting.dropped, 2);
      assert.strictEqual(bySink.get("one")?.accounting.accepted, 1);
      assert.strictEqual(bySink.get("one")?.accounting.truncated, 1);
      assert.deepStrictEqual(healthy, [1, 2]);
      assert.strictEqual(bySink.get("bad")?.status, "failed");
      assert.strictEqual(f.journal.sequence(), 2);
      credit.release();
      yield* f.journal.close();
      yield* Scope.close(f.ownerScope, Exit.void);
    }),
  );

  // Owner: P04.
  // Source: collection-copies.test.ts:6 "copies arrays without freezing them and preserves shallow element identity".
  // Source: collection-copies.test.ts:18 "copies objects without freezing them and preserves shallow value identity".
  // Source: collection-copies.test.ts:30 "uses ordinary mutable native Map and Set collections".
  // Source: evidence.test.ts:696 "deep-copies structured envelopes while retaining app and plan identity".
  // Source: evidence.test.ts:1352 "preserves null and undefined evidence payload values".
  // Contract/correction: STD-11; refactor.md structural-copy policies and EvidenceJournal.
  // Setup: An evidence payload with nested aliases, cycles, null, present undefined, opaque values, and app/plan identities.
  // Action: Accept a record and mutate the caller source before delivery.
  // Observable result: Delivered structured values are owned with aliases/cycles preserved; opaque identities remain exact and null differs from present undefined.
  // Failure/cleanup: Caller originals are neither frozen nor mutated, and deep copying does not recurse past stack capacity.
  it.effect("RN-EVIDENCE-011 evidence copy preserves structured topology and opaque identity", () =>
    Effect.gen(function* () {
      const f = yield* fixture();
      const actor = f.fence("topology");
      const credit = Result.getOrThrow(f.journal.registerActor(actor));
      const opaque = new Date(0);
      const shared = { value: 1, next: {} };
      shared.next = shared;

      const source = {
        left: shared,
        right: shared,
        opaque,
        nullValue: null,
        presentUndefined: undefined,
      };

      const prepared = Result.getOrThrow(f.journal.prepareTurn(credit, f.turnWith(actor, source)));
      shared.value = 2;
      const accepted = prepared.accept(store(1));

      assert.strictEqual(accepted.record._tag, "turn");
      assert.ok(Object.isFrozen(accepted.record));
      assert.strictEqual(Reflect.set(accepted.record, "sequence", 999), false);
      assert.strictEqual(Reflect.set(accepted.record, "store", store(999)), false);
      assert.strictEqual(accepted.sequence, 1);

      const snapshot = accepted.record.after;

      assert.strictEqual(snapshot.left, snapshot.right);
      assert.strictEqual(snapshot.left.next, snapshot.left);
      assert.strictEqual(snapshot.left.value, 1);
      assert.strictEqual(snapshot.opaque, opaque);
      assert.strictEqual(snapshot.nullValue, null);
      assert.ok(Object.hasOwn(snapshot, "presentUndefined"));
      assert.strictEqual(snapshot.presentUndefined, undefined);
      assert.strictEqual(accepted.record.provenance.app, f.app);

      assert.strictEqual(Object.isFrozen(source), false);
      credit.release();
      yield* f.journal.close();
      yield* Scope.close(f.ownerScope, Exit.void);
    }),
  );

  // Owner: P04.
  // Source: evidence.test.ts:1175 "retains lifecycle cleanup Cause through evidence acceptance".
  // Source: evidence.test.ts:1265 "orders the original lifecycle Cause before an evidence Cause".
  // Source: evidence.test.ts:1571 "keeps later cleanup failure separate from prior accepted truth".
  // Source: evidence.test.ts:1767 "LIFE-CREDIT retains terminal publication capacity during lifecycle cleanup".
  // Source: evidence.test.ts:1808 "closes after an admitted lifecycle outcome settles its Deferred credit".
  // Source: evidence.test.ts:1966 "CREDIT-FOLLOWER keeps an interrupted follower from stealing the owner outcome credit".
  // Contract/correction: STD-05/08; refactor.md EvidenceJournal terminal credit.
  // Setup: A registered actor fence, full ordinary preparation capacity, one reserved terminal permit, and an owned cleanup Cause.
  // Action: Accept terminal lifecycle evidence and release the actor-lifetime credit after the owner cleanup attempt.
  // Observable result: Accepted lifecycle evidence retains the supplied cleanup Cause and terminal capacity despite ordinary saturation.
  // Failure/cleanup: Journal close immediately reports a named retained-credit diagnostic if owner cleanup did not release it; release is idempotent and separate from permit cancellation.
  it.effect("RN-EVIDENCE-012 lifecycle outcome credit survives cleanup and failure", () =>
    Effect.gen(function* () {
      const f = yield* fixture(1);
      const actor = f.fence("terminal");
      const credit = Result.getOrThrow(f.journal.registerActor(actor));
      const delivered: number[] = [];

      const sink = yield* makeEvidenceSink({
        deliver: (record) =>
          Effect.sync(() => {
            assert.strictEqual(Reflect.set(record, "sequence", 999), false);
            assert.strictEqual(Reflect.set(record, "terminal", false), false);
            delivered.push(record.sequence);
          }),
      });

      Result.getOrThrow(f.journal.attach(Result.getOrThrow(f.journal.issueAttachment(sink))));
      const ordinary = Result.getOrThrow(f.journal.prepareTurn(credit, f.turn(actor)));
      const cleanupCause = new Error("cleanup failed");

      const terminal = Result.getOrThrow(
        f.journal.prepareLifecycle(credit, {
          ...f.lifecycle(actor, true),
          cause: cleanupCause,
        }),
      );

      ordinary.cancel();
      const accepted = terminal.accept();

      assert.strictEqual(accepted.sequence, 1);
      assert.strictEqual(accepted.record.cause, cleanupCause);
      assert.ok(Object.isFrozen(accepted));
      assert.ok(Object.isFrozen(accepted.attachments));
      assert.ok(accepted.attachments.every(Object.isFrozen));
      assert.strictEqual(Reflect.set(accepted, "sequence", 999), false);
      assert.strictEqual(Reflect.set(accepted.record, "terminal", false), false);
      assert.ok(Result.isFailure(f.journal.prepareTurn(credit, f.turn(actor))));
      credit.release();
      assert.strictEqual((yield* f.journal.close()).through, 1);
      assert.deepStrictEqual(delivered, [1]);
      yield* Scope.close(f.ownerScope, Exit.void);
    }),
  );

  // Owner: P04.
  // Source: evidence.test.ts:975 "closes idempotently after draining accepted evidence".
  // Source: evidence.test.ts:1059 "drains the accepted evidence prefix before sink close".
  // Source: evidence.test.ts:1384 "closes an empty evidence hub without synthetic records".
  // Source: evidence.test.ts:1396 "applies the late sink policy without hidden history replay".
  // Source: evidence.test.ts:1502 "drains evidence as part of owner disposal".
  // Contract/correction: STD-01/08; refactor.md EvidenceSink.
  // Setup: Evidence accepted before a sink attaches and an empty or already-closed journal.
  // Action: Attach late, drain, close twice, then attempt another preparation.
  // Observable result: Late sink receives only later records; repeated or empty close adds no synthetic sequence.
  // Failure/cleanup: Post-close preparation rejects and accepted prefix drains before sink close.
  it.effect("RN-EVIDENCE-013 late sink attach and repeated close never replay history", () =>
    Effect.gen(function* () {
      const f = yield* fixture();
      const actor = f.fence("late-attach");
      const credit = Result.getOrThrow(f.journal.registerActor(actor));
      Result.getOrThrow(f.journal.prepareTurn(credit, f.turn(actor))).accept(store(1));
      const delivered: number[] = [];

      const sink = yield* makeEvidenceSink({
        deliver: (record) => Effect.sync(() => void delivered.push(record.sequence)),
      });

      Result.getOrThrow(f.journal.attach(Result.getOrThrow(f.journal.issueAttachment(sink))));
      Result.getOrThrow(f.journal.prepareTurn(credit, f.turn(actor))).accept(store(2));
      assert.strictEqual((yield* f.journal.drain()).through, 2);
      assert.deepStrictEqual(delivered, [2]);
      credit.release();
      const first = yield* f.journal.close();
      const repeated = yield* f.journal.close();

      assert.strictEqual(first, repeated);
      assert.strictEqual(f.journal.sequence(), 2);
      assert.ok(Result.isFailure(f.journal.prepareTurn(credit, f.turn(actor))));
      yield* Scope.close(f.ownerScope, Exit.void);
    }),
  );

  // Owner: P04.
  // Source: evidence.test.ts:1657 "retains interrupted sink delivery during hub close".
  // Contract/correction: STD-08/09; refactor.md EvidenceSink.
  // Setup: One accepted record and a sink whose delivery is held at a gate.
  // Action: Run the sink's direct drain in a fiber, interrupt that drain fiber while delivery is gated, release the gate, then close.
  // Observable result: The accepted record reaches exactly one delivered, truncated/detached, or failed terminal accounting outcome; no second delivery occurs.
  // Failure/cleanup: The interrupted drain, attachment removal, and close settle without an indefinite wait or unaccounted accepted record.
  it.effect("RN-EVIDENCE-014 interrupted direct sink drain retains terminal accounting", () =>
    Effect.gen(function* () {
      const f = yield* fixture();
      const actor = f.fence("interrupted-drain");
      const credit = Result.getOrThrow(f.journal.registerActor(actor));
      const entered = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      let deliveries = 0;

      const sink = yield* makeEvidenceSink({
        deliver: () =>
          Effect.gen(function* () {
            deliveries += 1;
            yield* Deferred.succeed(entered, undefined);
            yield* Deferred.await(release);
          }),
      });

      Result.getOrThrow(f.journal.attach(Result.getOrThrow(f.journal.issueAttachment(sink))));

      const accepted = Result.getOrThrow(f.journal.prepareTurn(credit, f.turn(actor))).accept(
        store(1),
      );

      const direct = yield* sink.drain(accepted.sequence).pipe(Effect.forkChild);
      yield* Deferred.await(entered);
      yield* Fiber.interrupt(direct);
      const interrupted = yield* Fiber.await(direct);
      assert.ok(Exit.isFailure(interrupted));
      yield* Deferred.succeed(release, undefined);
      const accounted = yield* sink.drain(accepted.sequence);

      assert.strictEqual(accounted.accounting.accepted, 1);
      assert.strictEqual(
        accounted.accounting.delivered +
          accounted.accounting.truncated +
          accounted.accounting.failed,
        1,
      );
      assert.strictEqual(deliveries, 1);
      credit.release();
      yield* f.journal.close();
      yield* Scope.close(f.ownerScope, Exit.void);
    }),
  );

  // Owner: P04.
  // Source: new refactor.md owner proof; no frozen source declaration.
  // Contract/correction: Approved correction 5; refactor.md EvidenceJournal credit protocol.
  // Frozen outcome: Frozen close could wait indefinitely for a missing evidence credit.
  // Required new outcome: Close reports a typed diagnostic naming the retained participant or credit.
  // Setup: A registered actor-lifetime EvidenceCredit left unreleased after owner cleanup attempts.
  // Action: Close the journal while that actor-lifetime credit remains registered.
  // Observable result: Close reports a typed diagnostic naming the retained actor, fence, or credit; frozen close could wait indefinitely.
  // Failure/cleanup: In a fresh journal, EvidenceCredit.release() before close permits completion; permit cancellation alone does not release the actor-lifetime credit.
  it.effect("RN-EVIDENCE-015 stranded evidence credits close with a named diagnostic", () =>
    Effect.gen(function* () {
      const stranded = yield* fixture();
      const actor = stranded.fence("stranded-actor");
      const credit = Result.getOrThrow(stranded.journal.registerActor(actor));

      const permit = Result.getOrThrow(
        stranded.journal.prepareLifecycle(credit, stranded.lifecycle(actor, true)),
      );

      permit.cancel();
      const closed = yield* Effect.exit(stranded.journal.close());

      assert.ok(Exit.isFailure(closed));

      if (Exit.isFailure(closed)) {
        const error = closed.cause.reasons.find(Cause.isFailReason)?.error;

        assert.strictEqual(error?.code, "InvalidTraceRecord");
        assert.ok(String(error?.details.actors).includes(actor.key));
      }

      credit.release();
      yield* Scope.close(stranded.ownerScope, Exit.void);
      const settled = yield* fixture();
      const settledActor = settled.fence("released-actor");
      Result.getOrThrow(settled.journal.registerActor(settledActor)).release();
      assert.strictEqual((yield* settled.journal.close()).through, 0);
      yield* Scope.close(settled.ownerScope, Exit.void);
    }),
  );

  // Owner: P04.
  // Source: new refactor.md owner proof; no frozen source declaration.
  // Contract/correction: STD-07/08; refactor.md EvidenceSink owner proof matrix.
  // Setup: A sink callback that requests a nested drain or close while delivery is in flight.
  // Action: Accept a record, invoke delivery, and start close at the callback gate.
  // Observable result: One accepted record is delivered or terminally accounted exactly once and no owner lock is held across the callback.
  // Failure/cleanup: Both drain and close settle with bounded retention and full failure Cause if callback defects.
  it.effect("RN-EVIDENCE-016 sink callbacks may reenter drain or close without deadlock", () =>
    Effect.gen(function* () {
      const f = yield* fixture();
      const actor = f.fence("reentrant-sink");
      const credit = Result.getOrThrow(f.journal.registerActor(actor));
      const holder = { sink: Option.none<EvidenceSink>() };
      let calls = 0;

      const sink = yield* makeEvidenceSink({
        deliver: (record) =>
          Effect.gen(function* () {
            calls += 1;
            const current = Option.getOrThrow(holder.sink);
            const nested = yield* current.drain(record.sequence);
            assert.strictEqual(nested.status, "pending");
            yield* current.close();
          }),
      });

      holder.sink = Option.some(sink);
      Result.getOrThrow(f.journal.attach(Result.getOrThrow(f.journal.issueAttachment(sink))));

      const accepted = Result.getOrThrow(f.journal.prepareTurn(credit, f.turn(actor))).accept(
        store(1),
      );

      const direct = yield* sink.drain(accepted.sequence);

      assert.strictEqual(calls, 1);
      assert.strictEqual(direct.accounting.delivered, 1);
      assert.strictEqual((yield* sink.drain(accepted.sequence)).accounting.delivered, 1);
      credit.release();
      yield* f.journal.close();
      yield* Scope.close(f.ownerScope, Exit.void);
    }),
  );

  // Owner: P04.
  // Source: new refactor.md owner proof; no frozen source declaration.
  // Contract/correction: STD-10; refactor.md EvidenceJournal owner proof matrix.
  // Setup: A Journal at its checked sequence limit with an already accepted prefix and attached sink.
  // Action: Attempt to prepare one more record through the owner port.
  // Observable result: The near-limit overflow returns a typed diagnostic before advancing the accepted prefix, offering to the sink, or mutating journal credit and permit state.
  // Failure/cleanup: The prior accepted prefix still drains and close settles without a synthetic record.
  it.effect("RN-EVIDENCE-017 journal sequence overflow rejects before mutation", () =>
    Effect.gen(function* () {
      const f = yield* fixture();
      const actor = f.fence("overflow");
      const credit = Result.getOrThrow(f.journal.registerActor(actor));
      const sink = yield* makeEvidenceSink();
      Result.getOrThrow(f.journal.attach(Result.getOrThrow(f.journal.issueAttachment(sink))));

      const prior = Result.getOrThrow(f.journal.prepareTurn(credit, f.turn(actor))).accept(
        store(1),
      );

      const max = Number.MAX_SAFE_INTEGER;

      const sequenceState: Parameters<typeof reserveEvidenceSequence>[0] = {
        accepted: max - 1,
        pending: 0,
        current: Result.getOrThrow(evidenceSequence(max - 1)),
      };

      Result.getOrThrow(reserveEvidenceSequence(sequenceState));
      assert.strictEqual(publishEvidenceSequence(sequenceState), max);
      const beforeFailure = { ...sequenceState };
      const nearLimit = reserveEvidenceSequence(sequenceState);

      assert.ok(Result.isFailure(nearLimit));

      if (Result.isFailure(nearLimit))
        assert.strictEqual(nearLimit.failure.code, "InvariantViolation");

      assert.deepStrictEqual(sequenceState, beforeFailure);
      assert.strictEqual(sequenceState.pending, 0);
      assert.strictEqual(f.journal.sequence(), 1);
      const drained = yield* f.journal.drain();
      assert.strictEqual(drained.through, prior.sequence);
      assert.strictEqual(drained.attachments[0]?.accounting.accepted, 1);
      assert.strictEqual(drained.attachments[0]?.accounting.delivered, 1);
      assert.strictEqual(drained.attachments[0]?.accounting.dropped, 0);
      const retry = Result.getOrThrow(f.journal.prepareTurn(credit, f.turn(actor)));
      retry.cancel();
      assert.strictEqual(f.journal.sequence(), 1);
      credit.release();
      assert.strictEqual((yield* f.journal.close()).through, 1);
      yield* Scope.close(f.ownerScope, Exit.void);
    }),
  );
});
