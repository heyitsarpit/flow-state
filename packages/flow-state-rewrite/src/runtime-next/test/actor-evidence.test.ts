import { assert, describe, it } from "@effect/vitest";
import { Deferred, Effect, Exit, Fiber, Result } from "effect";

import { Failure } from "../../diagnostic/diagnostic.js";
import {
  makeActorFixture,
  makeStoreFixture,
  StoreDefinition,
  StoreMachine,
  storeRunner,
  storeSnapshot,
} from "./actor-fixture.js";
import type { EvidenceRecord } from "../evidence/evidence-record.js";
import { makeEvidenceSink } from "../evidence/evidence-sink.js";

describe("runtime-next actor evidence", () => {
  // Owner: P06.
  // Source: runtime-integration.test.ts:983 "keeps failed store evidence anchored to the last committed snapshot".
  // Contract/correction: SNAP-001; refactor.md EvidenceJournal and ActorEngine one-cut protocol.
  // Setup: An actor with a failing store write followed by a successful retry.
  // Action: Inspect turn records across both attempts.
  // Observable result: Failure evidence uses the prior committed state and issue; retry evidence and receipt use the new revision and store cursor.
  // Failure/cleanup: No journal record claims a cut that did not commit.
  it.effect("RN-EVIDENCE-001 failed turn evidence names the last committed state", () =>
    Effect.gen(function* () {
      const storePort = makeStoreFixture();

      const f = yield* makeActorFixture({
        machine: StoreMachine,
        initial: storeSnapshot(),
        store: storePort.port,
        operationRunner: storeRunner,
      });

      const records: EvidenceRecord[] = [];

      const sink = yield* makeEvidenceSink({
        id: "p06-failed-turn",
        capacity: 8,
        deliver: (record) =>
          Effect.sync(() => {
            records.push(record);
          }),
      });

      Result.getOrThrow(f.journal.attach(Result.getOrThrow(f.journal.issueAttachment(sink))));
      const actor = yield* f.prepared.activate();
      const before = actor.snapshot();
      storePort.reject();

      const failed = yield* Effect.exit(
        actor.dispatch(Result.getOrThrow(StoreDefinition.E.fetch(1))),
      );

      assert.ok(Exit.isFailure(failed));
      const issue = actor.snapshot();
      const receipt = yield* actor.dispatch(Result.getOrThrow(StoreDefinition.E.fetch(1)));
      const after = actor.snapshot();
      yield* f.journal.drain();
      const turns = records.filter((record) => record._tag === "turn");

      assert.strictEqual(turns.length, 2);
      assert.deepStrictEqual(turns[0]?.before, before);
      assert.deepStrictEqual(turns[0]?.after, issue);
      assert.deepStrictEqual(turns[0]?.store, { revision: 0, changed: [] });
      assert.deepStrictEqual(turns[1]?.before, issue);
      assert.deepStrictEqual(turns[1]?.after, after);
      assert.deepStrictEqual(turns[1]?.store, { revision: 1, changed: [] });
      assert.strictEqual(turns[1]?.sequence, receipt.evidenceSequence);
      yield* f.close();
    }),
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
  it.effect("RN-EVIDENCE-003 committed acknowledgement precedes sink delivery", () =>
    Effect.gen(function* () {
      const operationGate = yield* Deferred.make<void>();

      const f = yield* makeActorFixture({
        machine: StoreMachine,
        initial: storeSnapshot(),
        store: makeStoreFixture().port,
        operationRunner: {
          runFinite: (plan, signal, occurrence) =>
            Deferred.await(operationGate).pipe(
              Effect.flatMap(() => storeRunner.runFinite(plan, signal, occurrence)),
            ),
          runActivity: (...args: Parameters<typeof storeRunner.runActivity>) =>
            storeRunner.runActivity(...args),
        },
      });

      const actor = yield* f.prepared.activate();
      const entered = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();

      const sink = yield* makeEvidenceSink({
        id: "p06-ack-before-delivery",
        capacity: 4,
        deliver: () =>
          Effect.gen(function* () {
            yield* Deferred.succeed(entered, undefined);
            yield* Deferred.await(release);

            return yield* Effect.fail(
              Failure({
                code: "InvalidTraceRecord",
                path: ["sink", "fixture"],
                details: {},
                summary: "Delivery failed after the actor cut",
                help: "Inspect the sink drain status.",
              }),
            );
          }),
      });

      Result.getOrThrow(f.journal.attach(Result.getOrThrow(f.journal.issueAttachment(sink))));
      const receipt = yield* actor.dispatch(Result.getOrThrow(StoreDefinition.E.fetch(1)));
      const committed = actor.snapshot();
      const draining = yield* f.journal.drain().pipe(Effect.forkChild);
      yield* Deferred.await(entered);

      assert.strictEqual(receipt.publicationRevision, committed.revision);
      assert.strictEqual(receipt.evidenceSequence, f.journal.sequence());
      assert.strictEqual(committed.memory.count, 1);
      yield* Deferred.succeed(release, undefined);
      const result = yield* Fiber.join(draining);
      assert.strictEqual(result.attachments[0]?.status, "failed");
      assert.strictEqual(actor.snapshot(), committed);
      yield* Deferred.succeed(operationGate, undefined);
      yield* f.close();
    }),
  );
});
