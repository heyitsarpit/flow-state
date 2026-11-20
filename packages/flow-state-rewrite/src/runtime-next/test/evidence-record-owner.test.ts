import { assert, describe, it } from "@effect/vitest";
import { Result } from "effect";

import { definition } from "../../definition/definition.js";
import { machine } from "../../machine/machine.js";
import { makeActorDirectory } from "../actor/actor-directory.js";
import { publishEvidenceAcceptance } from "../evidence/evidence-acceptance.js";
import {
  completeLifecycleEvidence,
  completeTurnEvidence,
  evidenceSequence,
  prepareLifecycleEvidence,
  prepareTurnEvidence,
} from "../evidence/evidence-record.js";

const Definition = definition({
  id: "runtime-next/evidence-record-owner",
  states: ["idle"],
  events: {},
});

const Machine = Result.getOrThrow(
  machine(Definition, ({ S }) => ({ default: S.idle, states: { idle: {} } })),
);

const identity = () => {
  const directory = makeActorDirectory<string>({ machines: [Machine] });

  const position = Result.getOrThrow(
    directory.reserve({ kind: "stable", ref: { machine: Machine, id: "record", persist: false } }),
  );

  if (position._tag !== "create") throw Error("Expected a fresh actor identity");

  return position.reservation.identity;
};

describe("runtime-next evidence record owner", () => {
  it("P055-RECORD-TURN: prepares owned cyclic turn fields before binding the typed store and sequence", () => {
    const actor = identity();
    const app = { opaque: "app" };
    const plan = { opaque: "plan" };
    const shared = { value: 1 };
    const before = { shared, self: {} };
    before.self = before;
    const after = { shared, self: {} };
    const cause = { payload: shared };

    const draft = {
      _tag: "turn" as const,
      fence: actor,
      provenance: { app, plan, actor },
      timestamp: 17,
      publicationRevision: 4,
      machineTurnRevision: 3,
      cause,
      before,
      after,
    };

    const prepared = Result.getOrThrow(prepareTurnEvidence(draft));
    assert.strictEqual(Reflect.set(prepared, "draft", draft), false);

    shared.value = 9;
    before.self = { changed: true };
    draft.timestamp = 18;
    const store = { revision: 8, changed: ["field"] };
    const record = completeTurnEvidence(prepared, store, Result.getOrThrow(evidenceSequence(1)));

    assert.strictEqual(record.store, store);
    assert.strictEqual(record.sequence, 1);
    assert.strictEqual(record.timestamp, 17);
    assert.strictEqual(record.provenance.app, app);
    assert.strictEqual(record.provenance.plan, plan);
    assert.strictEqual(record.fence, actor);
    assert.strictEqual(record.before.self, record.before);
    assert.strictEqual(record.before.shared, record.after.shared);
    assert.strictEqual(record.cause.payload, record.before.shared);
    assert.strictEqual(record.before.shared.value, 1);
    assert.ok(Object.isFrozen(record));
    assert.strictEqual(Reflect.set(record, "sequence", 99), false);
    assert.strictEqual(Reflect.set(record, "store", { revision: 99 }), false);
    assert.ok(!Object.isFrozen(shared));
    assert.strictEqual(Reflect.set(record.before.shared, "value", 6), false);

    const sinkOffer = {
      sink: "owned-by-sink",
      sequence: record.sequence,
      status: "accepted" as const,
    };

    const offers = [sinkOffer];
    const acceptance = publishEvidenceAcceptance(record, record.sequence, offers);
    const publishedOffer = acceptance.attachments[0];

    assert.ok(publishedOffer !== undefined);
    assert.strictEqual(Object.isFrozen(sinkOffer), false);
    assert.notStrictEqual(publishedOffer, sinkOffer);
    assert.strictEqual(Object.isFrozen(offers), false);
    offers.push(sinkOffer);
    assert.strictEqual(acceptance.attachments.length, 1);
    assert.strictEqual(Reflect.set(acceptance.attachments, 0, {}), false);
    assert.strictEqual(Reflect.set(acceptance, "sequence", 99), false);
    assert.strictEqual(Reflect.set(sinkOffer, "status", "dropped"), true);
    assert.strictEqual(publishedOffer.status, "accepted");
    assert.strictEqual(Reflect.set(publishedOffer, "status", "dropped"), false);
  });

  it("preflights invalid fields without reading accessors", () => {
    const actor = identity();

    const base = {
      _tag: "turn" as const,
      fence: actor,
      provenance: { app: {}, plan: {}, actor },
      timestamp: 10,
      publicationRevision: 1,
      machineTurnRevision: 1,
      cause: { _tag: "event" },
      before: { state: "idle" },
      after: { state: "idle" },
    };

    let reads = 0;

    const hostile = Object.defineProperty({ ...base }, "before", {
      enumerable: true,
      get: () => {
        reads += 1;

        return {};
      },
    });

    assert.ok(Result.isFailure(prepareTurnEvidence(hostile)));
    assert.strictEqual(reads, 0);
    assert.ok(Result.isFailure(prepareTurnEvidence({ ...base, timestamp: Number.NaN })));
    const sparse: number[] = [];
    sparse.length = 2;
    sparse[1] = 1;
    assert.ok(Result.isFailure(prepareTurnEvidence({ ...base, before: sparse, after: sparse })));
    assert.ok(Result.isFailure(evidenceSequence(0)));
  });

  it("P055-RECORD-LIFECYCLE: prepares lifecycle terminal disposition before total completion", () => {
    const actor = identity();
    const cause = { failure: { reason: "cleanup" } };

    const draft = {
      _tag: "lifecycle" as const,
      machineTurn: false as const,
      fence: actor,
      provenance: { app: {}, plan: {}, actor },
      timestamp: 21,
      publicationRevision: 5,
      machineTurnRevision: 4,
      from: "active",
      to: "disposed",
      terminal: true,
      cause,
      before: { state: "active" },
      after: { state: "disposed" },
    };

    const prepared = Result.getOrThrow(prepareLifecycleEvidence(draft));
    assert.strictEqual(Reflect.set(prepared, "draft", draft), false);

    cause.failure.reason = "changed";
    draft.terminal = false;
    const record = completeLifecycleEvidence(prepared, Result.getOrThrow(evidenceSequence(2)));

    assert.strictEqual(record.sequence, 2);
    assert.strictEqual(record.terminal, true);
    assert.strictEqual(record.cause.failure.reason, "cleanup");
    assert.strictEqual(record.machineTurnRevision, 4);
    assert.ok(Object.isFrozen(record));
    assert.strictEqual(Reflect.set(record, "sequence", 99), false);
    assert.strictEqual(Reflect.set(record, "terminal", false), false);
  });
});
