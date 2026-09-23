import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit, Result, Scope } from "effect";

import { definition } from "../../definition/definition.js";
import { machine } from "../../machine/machine.js";
import { makeActorDirectory } from "../actor/actor-directory.js";
import { makeEvidenceJournal } from "../evidence/evidence-journal.js";

const Definition = definition({
  id: "runtime-next/evidence-copy-boundary",
  states: ["idle"],
  events: {},
});

const Machine = Result.getOrThrow(
  machine(Definition, ({ S }) => ({ default: S.idle, states: { idle: {} } })),
);

describe("runtime-next copies", () => {
  // Owner: P04.
  // Source: evidence.test.ts:2181 "preserves record aliases, cycles, and opaque identity across acceptance".
  // Contract/correction: STD-11/12; refactor.md structural-copy owner proof matrix and EvidenceJournal.
  // Setup: The same 20k-deep, cyclic, aliased, sparse, accessor, and opaque input shapes used by RN-COPY-002 and RN-ACTOR-023.
  // Action: Prepare and accept evidence records through the Journal boundary, mutate caller inputs, then drain.
  // Observable result: Permitted cycles and aliases survive in owned records, opaque identities remain exact, and deep traversal completes iteratively.
  // Failure/cleanup: Evidence-policy invalid sparse or accessor values reject before acceptance; caller originals remain unfrozen and unchanged, and close settles accepted records.
  it.effect("RN-COPY-001 evidence records own the shared deep and cyclic fixtures", () =>
    Effect.gen(function* () {
      const ownerScope = yield* Scope.make();
      const app = {};
      const plan = {};

      const journal = Result.getOrThrow(
        makeEvidenceJournal({ app, plan, ownerScope, capacity: 8 }),
      );

      const directory = makeActorDirectory<string>({ machines: [Machine] });

      const position = Result.getOrThrow(
        directory.reserve({
          kind: "stable",
          ref: { machine: Machine, id: "deep", persist: false },
        }),
      );

      assert.strictEqual(position._tag, "create");

      if (position._tag !== "create") return;
      const fence = position.reservation.identity;
      const credit = Result.getOrThrow(journal.registerActor(fence));
      const opaque = new Date(0);
      const shared = { value: 1, self: {} };
      shared.self = shared;

      type DeepNode = { next: DeepNode } | { leaf: typeof shared };

      let deep: DeepNode = { leaf: shared };

      for (let index = 0; index < 20_000; index += 1) deep = { next: deep };

      const source = { deep, left: shared, right: shared, opaque };

      const draft = {
        _tag: "turn" as const,
        fence,
        provenance: { app, plan, actor: fence },
        cause: { _tag: "event", event: { type: "go" } },
        before: { value: 0 },
        after: source,
        timestamp: 1,
        publicationRevision: 1,
        machineTurnRevision: 1,
      };

      const prepared = Result.getOrThrow(journal.prepareTurn(credit, draft));
      shared.value = 2;
      const accepted = prepared.accept({ revision: 1, changed: [] });
      const copied = accepted.record.after;

      assert.notStrictEqual(copied, source);
      assert.strictEqual(copied.left, copied.right);
      assert.strictEqual(copied.left.value, 1);
      assert.strictEqual(copied.left.self, copied.left);
      assert.strictEqual(copied.opaque, opaque);
      let leaf: DeepNode = copied.deep;

      for (let index = 0; index < 20_000; index += 1) {
        assert.ok("next" in leaf);
        leaf = leaf.next;
      }

      assert.ok("leaf" in leaf);
      assert.strictEqual(leaf.leaf, copied.left);
      assert.strictEqual(Object.isFrozen(source), false);
      assert.strictEqual(Object.isFrozen(shared), false);
      const sparse = [1];
      sparse.length = 2;
      const invalid = { ...draft, after: { values: sparse } };
      assert.ok(Result.isFailure(journal.prepareTurn(credit, invalid)));
      const accessor = {};
      Object.defineProperty(accessor, "value", { enumerable: true, get: () => 1 });
      assert.ok(Result.isFailure(journal.prepareTurn(credit, { ...draft, after: accessor })));
      credit.release();
      assert.strictEqual((yield* journal.close()).through, 1);
      yield* Scope.close(ownerScope, Exit.void);
    }),
  );

  // Owner: P05.
  // Source: context-wave.test.ts:1573 "owns selected records and arrays across source and publication mutation".
  // Source: context-wave.test.ts:1807 "retains owned context for nested mutation and publishes a replaced field reference".
  // Contract/correction: STD-11/12; refactor.md structural-copy owner proof matrix and ContextCoordinator.
  // Setup: The same 20k-deep, cyclic, aliased, sparse, accessor, and opaque input shapes used by RN-COPY-001 and RN-ACTOR-023.
  // Action: Offer selected values through ContextCoordinator, prepare and consume an authentic ticket, then mutate caller inputs and returned values.
  // Observable result: The committed context cut owns the permitted cycle and aliases, retains opaque identity, and survives deep traversal and later mutation.
  // Failure/cleanup: Context-policy invalid sparse or accessor values fail before publication; cancellation or close settles the ticket without mutating caller originals.
  it.todo("RN-COPY-002 context offers and tickets own the shared deep and cyclic fixtures");
});
