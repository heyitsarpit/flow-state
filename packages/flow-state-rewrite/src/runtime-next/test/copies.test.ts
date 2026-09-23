import { assert, describe, it } from "@effect/vitest";
import { Deferred, Effect, Exit, Fiber, Result, Scope } from "effect";

import { definition } from "../../definition/definition.js";
import { Failure } from "../../diagnostic/diagnostic.js";
import { machine } from "../../machine/machine.js";
import { actorRef } from "../../runtime/actor-ref.js";
import { makeActorDirectory } from "../actor/actor-directory.js";
import { makeContextCoordinator, type ContextNode } from "../context/context-coordinator.js";
import { makeEvidenceJournal } from "../evidence/evidence-journal.js";
import type { ActorSnapshot } from "../runtime.js";

const Definition = definition({
  id: "runtime-next/evidence-copy-boundary",
  states: ["idle"],
  events: {},
});

const Machine = Result.getOrThrow(
  machine(Definition, ({ S }) => ({ default: S.idle, states: { idle: {} } })),
);

const missingCopyFixture = () =>
  Failure({
    code: "MissingContextProvider",
    path: ["context", "copy-fixture"],
    details: {},
    summary: "Context copy fixture could not be constructed.",
    help: "Use fresh provider and consumer fixture identities.",
  });

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
  it.effect("RN-COPY-002 context offers and tickets own the shared deep and cyclic fixtures", () =>
    Effect.gen(function* () {
      const Provider = Result.getOrThrow(Definition);
      const shared = { value: 1 };

      type DeepNode = { next: DeepNode } | { leaf: typeof shared };

      let deep: DeepNode = { leaf: shared };

      for (let index = 0; index < 20_000; index += 1) deep = { next: deep };

      type Cycle = Array<number | Cycle>;

      const cycle: Cycle = [];
      cycle.push(cycle);
      const sparse = [1];
      sparse.length = 3;

      const source = {
        deep,
        left: shared,
        right: shared,
        cycle,
        sparse,
        opaque: Provider.S.idle,
      };

      const ConsumerResult = definition({
        id: "runtime-next/context-copy-consumer",
        states: ["idle"],
        events: {},
        context: { value: Provider.select(() => source) },
      });

      const Consumer = Result.getOrThrow(ConsumerResult);

      const ConsumerMachine = Result.getOrThrow(
        machine(ConsumerResult, ({ S }) => ({ default: S.idle, states: { idle: {} } })),
      );

      const scope = yield* Scope.make();
      const coordinator = yield* makeContextCoordinator(scope);
      const directory = makeActorDirectory<string>({ machines: [Machine, ConsumerMachine] });
      const providerRef = actorRef(Machine, "copy-provider");
      const consumerRef = actorRef(ConsumerMachine, "copy-consumer");

      const providerAdmission = Result.getOrThrow(
        directory.reserve({ kind: "stable", ref: providerRef }),
      );

      const consumerAdmission = Result.getOrThrow(
        directory.reserve({ kind: "stable", ref: consumerRef }),
      );

      if (providerAdmission._tag !== "create" || consumerAdmission._tag !== "create")
        return yield* Effect.fail(missingCopyFixture());

      const providerIdentity = providerAdmission.reservation.identity;
      const consumerIdentity = consumerAdmission.reservation.identity;
      let providerRevision = 1;
      let consumerRevision = 1;
      let committed = source;
      let gate: Deferred.Deferred<void> | undefined;
      let offerSignal = Deferred.makeUnsafe<void>();

      // RETURN_TYPE: The copy provider fixture must satisfy the actor snapshot port.
      const providerSnapshot = (): ActorSnapshot<typeof Provider> => ({
        state: Provider.S.idle,
        memory: {},
        context: {},
        lifecycle: "active",
        operations: [],
        timers: [],
        issues: [],
        revision: providerRevision,
        observedStoreRevision: 0,
      });

      // RETURN_TYPE: The copy consumer fixture must satisfy the actor snapshot port.
      const consumerSnapshot = (): ActorSnapshot<typeof Consumer> => ({
        state: Consumer.S.idle,
        memory: {},
        context: { value: committed },
        lifecycle: "active",
        operations: [],
        timers: [],
        issues: [],
        revision: consumerRevision,
        observedStoreRevision: 0,
      });

      const providerNode: ContextNode<typeof Provider> = {
        identity: providerIdentity,
        participant: {
          ref: providerRef,
          snapshot: providerSnapshot,
          offerContext: () =>
            Result.fail(
              Failure({
                code: "MissingContextProvider",
                path: ["context"],
                details: {},
                summary: "Root has no provider offer.",
                help: "Offer only dependent context.",
              }),
            ),
        },
        providers: [],
        opaqueIdentities: [Provider.S.idle],
        selectionBatch: () => Result.succeed({ slots: [], requests: [] }),
      };

      const consumerNode: ContextNode<typeof Consumer> = {
        identity: consumerIdentity,
        participant: {
          ref: consumerRef,
          snapshot: consumerSnapshot,
          offerContext(ticket) {
            Deferred.doneUnsafe(offerSignal, Effect.void);

            return Result.succeed({
              wait: Effect.gen(function* () {
                if (gate !== undefined) yield* Deferred.await(gate);
                const offer = Result.getOrThrow(ticket.consume(consumerIdentity, consumerRevision));
                const entry = offer.entries[0];

                if (entry === undefined) return yield* Effect.fail(missingCopyFixture());

                committed = entry.value;
                consumerRevision += 1;

                return { status: "published" as const, snapshot: consumerSnapshot() };
              }),
              cancel() {},
            });
          },
        },
        providers: [{ slot: "value", provider: providerIdentity }],
        opaqueIdentities: [Provider.S.idle],
        selectionBatch(captured) {
          const observed = captured.get(providerIdentity.key);

          if (observed === undefined)
            return Result.fail(
              Failure({
                code: "MissingContextProvider",
                path: ["context"],
                details: {},
                summary: "Provider snapshot is missing.",
                help: "Register the provider first.",
              }),
            );

          return Result.succeed({
            slots: ["value"],
            requests: [
              {
                slot: "value",
                provider: providerIdentity,
                cut: { identity: providerIdentity, revision: observed.snapshot.revision },
                input: { state: Provider.S.idle, memory: {}, context: {} },
                select: () => source,
                opaqueIdentities: [Provider.S.idle],
              },
            ],
          });
        },
      };

      Result.getOrThrow(coordinator.register(providerNode)).enable();
      Result.getOrThrow(coordinator.register(consumerNode)).enable();
      shared.value = 9;
      yield* coordinator.drain();
      assert.notStrictEqual(committed, source);
      assert.strictEqual(committed.left, committed.right);
      assert.strictEqual(committed.left.value, 1);
      assert.strictEqual(committed.cycle[0], committed.cycle);
      assert.strictEqual(1 in committed.sparse, false);
      assert.strictEqual(committed.opaque, Provider.S.idle);
      let leaf: DeepNode = committed.deep;

      for (let index = 0; index < 20_000; index += 1) {
        assert.ok("next" in leaf);
        leaf = leaf.next;
      }

      assert.ok("leaf" in leaf);
      assert.strictEqual(leaf.leaf, committed.left);
      assert.strictEqual(Object.isFrozen(source), false);
      const selectedBefore = committed;
      Object.defineProperty(source, "accessor", {
        enumerable: true,
        configurable: true,
        get: () => 1,
      });
      providerRevision += 1;

      const bad = Result.getOrThrow(
        coordinator.prepareNotification({
          identity: providerIdentity,
          snapshot: providerSnapshot(),
        }),
      );

      coordinator.publish(bad);
      assert.ok(Exit.isFailure(yield* Effect.exit(coordinator.drain())));
      assert.strictEqual(committed, selectedBefore);
      assert.strictEqual(Object.isFrozen(source), false);
      Reflect.deleteProperty(source, "accessor");

      gate = yield* Deferred.make<void>();
      offerSignal = Deferred.makeUnsafe();
      source.left = { value: 3 };
      providerRevision += 1;

      const prepared = Result.getOrThrow(
        coordinator.prepareNotification({
          identity: providerIdentity,
          snapshot: providerSnapshot(),
        }),
      );

      coordinator.publish(prepared);
      yield* Deferred.await(offerSignal);

      const draining = yield* Effect.exit(coordinator.drain()).pipe(
        Effect.forkIn(scope, { startImmediately: true }),
      );

      yield* Effect.yieldNow;
      yield* coordinator.close();
      assert.ok(Exit.isFailure(yield* Fiber.join(draining)));
      assert.strictEqual(committed, selectedBefore);
      yield* Scope.close(scope, Exit.void);
    }),
  );
});
