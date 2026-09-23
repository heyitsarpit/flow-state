import { assert, describe, it } from "@effect/vitest";
import { Deferred, Effect, Exit, Fiber, Result, Scope } from "effect";

import type { PublicDiagnostic } from "../../diagnostic/diagnostic.js";
import { actorRef } from "../../runtime/actor-ref.js";
import { makeActorDirectory } from "../actor/actor-directory.js";
import type { ContextNode } from "../context/context-coordinator.js";
import { makeContextRootQueue } from "../context/context-root-queue.js";
import type { ContextCut } from "../context/lineage.js";
import type { ActorSnapshot } from "../runtime.js";
import {
  Consumer,
  ConsumerMachine,
  isProviderState,
  makeHarness,
  Provider,
  ProviderMachine,
  type ProviderValue,
  unavailable,
} from "./context-fixture.js";

describe("runtime-next context coordinator queue owner", () => {
  it.effect("settles an invalidated active root and admits the same key again", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make();
      const fixture = yield* makeHarness(scope);
      yield* fixture.coordinator.drain();
      const gate = yield* Deferred.make<void>();
      const queue = yield* makeContextRootQueue(scope, 1, 1, () => Deferred.await(gate));
      const snapshot = fixture.providerSnapshot();
      const identity = fixture.providerIdentity;

      assert.strictEqual(queue.offer(identity, snapshot, 1), "accepted");
      yield* Effect.yieldNow;

      const draining = yield* Effect.exit(queue.drain()).pipe(
        Effect.forkIn(scope, { startImmediately: true }),
      );

      yield* Effect.yieldNow;
      queue.cancelIdentity(identity.key);
      assert.strictEqual(queue.offer(identity, snapshot, 2), "accepted");
      yield* Deferred.succeed(gate, undefined);
      yield* queue.drain();
      assert.ok(Exit.isFailure(yield* Fiber.join(draining)));
      yield* queue.close();
      yield* fixture.coordinator.close();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("keeps a new initial ticket when a cancelled key is reused", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make();
      const fixture = yield* makeHarness(scope);
      yield* fixture.coordinator.drain();
      const queue = yield* makeContextRootQueue(scope, 1, 1, () => Effect.void);
      const held = yield* Deferred.make<void>();
      const oldDone = Deferred.makeUnsafe<void, PublicDiagnostic>();
      const newDone = Deferred.makeUnsafe<void, PublicDiagnostic>();
      const snapshot = fixture.providerSnapshot();

      const oldInitial = {
        projection: {
          wait: Deferred.await(held).pipe(Effect.as({ status: "published" as const, snapshot })),
          cancel() {},
        },
        cancelTicket() {},
        done: oldDone,
      };

      const newInitial = {
        projection: {
          wait: Effect.succeed({ status: "published" as const, snapshot }),
          cancel() {},
        },
        cancelTicket() {},
        done: newDone,
      };

      assert.ok(queue.enqueueInitial("shared", oldInitial)._tag === "Success");
      yield* Effect.yieldNow;
      queue.cancelIdentity("shared");
      assert.ok(queue.enqueueInitial("shared", newInitial)._tag === "Success");
      yield* queue.drain();
      assert.ok(Exit.isFailure(yield* Effect.exit(Deferred.await(oldDone))));
      yield* queue.close();
      yield* fixture.coordinator.close();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("settles a held projection when the first close caller is interrupted", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make();
      const fixture = yield* makeHarness(scope);
      yield* fixture.coordinator.drain();
      const held = yield* Deferred.make<void>();
      fixture.holdOffers(held);
      fixture.setProviderChanged();

      const notification = Result.getOrThrow(
        fixture.coordinator.prepareNotification({
          identity: fixture.providerIdentity,
          snapshot: fixture.providerSnapshot(),
        }),
      );

      fixture.coordinator.publish(notification);
      yield* fixture.awaitOffer();

      const closing = yield* fixture.coordinator
        .close()
        .pipe(Effect.forkIn(scope, { startImmediately: true }));

      yield* Fiber.interrupt(closing);
      yield* fixture.coordinator.close();
      assert.strictEqual(fixture.offered.length, 1);
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

  it.effect("retires a provider before a dependent initial projection can publish", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make();
      const fixture = yield* makeHarness(scope);
      const publishedBefore = fixture.offered.length;
      fixture.consumerRegistration.unregister();
      const gate = yield* Deferred.make<void>();
      fixture.holdOffers(gate);
      Result.getOrThrow(fixture.coordinator.register(fixture.consumerNode)).enable();

      const draining = yield* Effect.exit(fixture.coordinator.drain()).pipe(
        Effect.forkIn(scope, { startImmediately: true }),
      );

      yield* fixture.awaitOffer();
      yield* Effect.yieldNow;
      fixture.providerRegistration.unregister();
      yield* Deferred.succeed(gate, undefined);
      assert.ok(Exit.isFailure(yield* Fiber.join(draining)));
      assert.strictEqual(fixture.offered.length, publishedBefore);
      yield* fixture.coordinator.close();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("rejects an initial projection after its provider revision changes", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make();
      const fixture = yield* makeHarness(scope);
      const publishedBefore = fixture.offered.length;
      fixture.consumerRegistration.unregister();
      const gate = yield* Deferred.make<void>();
      fixture.holdOffers(gate);
      Result.getOrThrow(fixture.coordinator.register(fixture.consumerNode)).enable();
      fixture.setProviderChanged();
      yield* Deferred.succeed(gate, undefined);
      assert.ok(Exit.isFailure(yield* Effect.exit(fixture.coordinator.drain())));
      assert.strictEqual(fixture.offered.length, publishedBefore);
      yield* fixture.coordinator.close();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("limits live participant fanout and visits only the affected component", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make();
      const fixture = yield* makeHarness(scope);

      const directory = makeActorDirectory<string>({
        machines: [ConsumerMachine, ProviderMachine],
      });

      let unrelatedSnapshots = 0;
      let selections = 0;
      let active = 0;
      let peak = 0;
      let waveGate: Deferred.Deferred<void> | undefined;
      const full = Deferred.makeUnsafe<void>();

      for (let index = 0; index < 20; index += 1) {
        const ref = actorRef(ConsumerMachine, `fanout-${index}`);
        const admitted = Result.getOrThrow(directory.reserve({ kind: "stable", ref }));

        if (admitted._tag !== "create") return yield* Effect.fail(unavailable());
        const identity = admitted.reservation.identity;
        let revision = 1;
        let value: ProviderValue = Provider.S.ready;

        // RETURN_TYPE: The participant's snapshot retains its machine contract.
        const snapshot = (): ActorSnapshot<typeof Consumer> => ({
          state: Consumer.S.idle,
          memory: {},
          context: { value },
          lifecycle: "active",
          operations: [],
          timers: [],
          issues: [],
          revision,
          observedStoreRevision: 0,
        });

        const node: ContextNode<typeof Consumer> = {
          identity,
          participant: {
            ref,
            snapshot,
            offerContext(ticket) {
              return Result.succeed({
                wait: Effect.gen(function* () {
                  if (waveGate !== undefined) {
                    active += 1;
                    peak = Math.max(peak, active);

                    if (active === 16) Deferred.doneUnsafe(full, Effect.void);
                    yield* Deferred.await(waveGate);
                    active -= 1;
                  }

                  const offer = Result.getOrThrow(ticket.consume(identity, revision));
                  const selected = offer.entries[0]?.value;

                  if (selected === undefined) return yield* Effect.fail(unavailable());
                  value = selected;
                  revision += 1;

                  return { status: "published" as const, snapshot: snapshot() };
                }),
                cancel() {},
              });
            },
          },
          providers: [{ slot: "value", provider: fixture.providerIdentity }],
          opaqueIdentities: [Provider.S.ready, Provider.S.changed],
          selectionBatch(captured) {
            selections += 1;
            const observed = captured.get(fixture.providerIdentity.key);

            if (observed === undefined || !isProviderState(observed.snapshot.state))
              return Result.fail(unavailable());

            return Result.succeed({
              slots: ["value"],
              requests: [
                {
                  slot: "value",
                  provider: fixture.providerIdentity,
                  cut: {
                    identity: fixture.providerIdentity,
                    revision: observed.snapshot.revision,
                  },
                  input: { state: observed.snapshot.state, memory: {}, context: {} },
                  select: ({ state }) => state,
                  opaqueIdentities: [Provider.S.ready, Provider.S.changed],
                },
              ],
            });
          },
        };

        Result.getOrThrow(fixture.coordinator.register(node)).enable();
      }

      for (let index = 0; index < 20; index += 1) {
        const ref = actorRef(ProviderMachine, `unrelated-${index}`);
        const admitted = Result.getOrThrow(directory.reserve({ kind: "stable", ref }));

        if (admitted._tag !== "create") return yield* Effect.fail(unavailable());
        const identity = admitted.reservation.identity;

        const node: ContextNode<typeof Provider> = {
          identity,
          participant: {
            ref,
            snapshot() {
              unrelatedSnapshots += 1;

              return fixture.providerSnapshot();
            },
            offerContext: () => Result.fail(unavailable()),
          },
          providers: [],
          opaqueIdentities: [Provider.S.ready, Provider.S.changed],
          selectionBatch: () => Result.succeed({ slots: [], requests: [] }),
        };

        Result.getOrThrow(fixture.coordinator.register(node)).enable();
      }

      yield* fixture.coordinator.drain();
      selections = 0;
      unrelatedSnapshots = 0;
      waveGate = Deferred.makeUnsafe();
      fixture.setProviderChanged();

      const notification = Result.getOrThrow(
        fixture.coordinator.prepareNotification({
          identity: fixture.providerIdentity,
          snapshot: fixture.providerSnapshot(),
        }),
      );

      fixture.coordinator.publish(notification);
      yield* Deferred.await(full);
      assert.strictEqual(peak, 16);
      assert.strictEqual(unrelatedSnapshots, 0);
      yield* Deferred.succeed(waveGate, undefined);
      yield* fixture.coordinator.drain();
      assert.strictEqual(selections, 20);
      assert.strictEqual(unrelatedSnapshots, 0);
      assert.strictEqual(peak, 16);
      yield* fixture.coordinator.close();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("retains an exact deep cut after a gated rejection and clears it on coverage", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make();
      const fixture = yield* makeHarness(scope);
      const directory = makeActorDirectory<string>({ machines: [ConsumerMachine] });
      const depth = 96;
      const gate = Deferred.makeUnsafe<void>();
      const started = Deferred.makeUnsafe<void>();
      let rejectEarly = false;
      let published = 0;
      let keyReads = 0;
      let parent = fixture.consumerIdentity;
      const actors: (typeof parent)[] = [];

      for (let index = 0; index < depth; index += 1) {
        const ref = actorRef(ConsumerMachine, `debt-chain-${index}`);
        const admitted = Result.getOrThrow(directory.reserve({ kind: "stable", ref }));

        if (admitted._tag !== "create") return yield* Effect.fail(unavailable());

        const identity = new Proxy(admitted.reservation.identity, {
          get(target, property) {
            if (property === "key") keyReads += 1;

            return Object.getOwnPropertyDescriptor(target, property)?.value;
          },
        });

        const provider = parent;
        let revision = 1;
        let value: ProviderValue = Provider.S.ready;

        // RETURN_TYPE: The participant snapshot retains its concrete machine contract.
        const snapshot = (): ActorSnapshot<typeof Consumer> => ({
          state: Consumer.S.idle,
          memory: {},
          context: { value },
          lifecycle: "active",
          operations: [],
          timers: [],
          issues: [],
          revision,
          observedStoreRevision: 0,
        });

        const node: ContextNode<typeof Consumer> = {
          identity,
          participant: {
            ref,
            snapshot,
            offerContext(ticket) {
              return Result.succeed({
                wait: Effect.gen(function* () {
                  if (index === 0 && rejectEarly) {
                    Deferred.doneUnsafe(started, Effect.void);
                    yield* Deferred.await(gate);

                    return yield* Effect.fail(unavailable());
                  }

                  const offer = Result.getOrThrow(ticket.consume(identity, revision));
                  const next = offer.entries[0]?.value;

                  if (next === undefined) return yield* Effect.fail(unavailable());
                  value = next;
                  revision += 1;
                  published += 1;

                  return { status: "published" as const, snapshot: snapshot() };
                }),
                cancel() {},
              });
            },
          },
          providers: [{ slot: "value", provider }],
          opaqueIdentities: [Provider.S.ready, Provider.S.changed],
          selectionBatch(captured) {
            const observed = captured.get(provider.key);
            const next = observed?.snapshot.context.value;

            if (observed === undefined || !isProviderState(next)) return Result.fail(unavailable());

            return Result.succeed({
              slots: ["value"],
              requests: [
                {
                  slot: "value",
                  provider,
                  cut: { identity: provider, revision: observed.snapshot.revision },
                  input: { state: next, memory: {}, context: {} },
                  select: ({ state }) => state,
                  opaqueIdentities: [Provider.S.ready, Provider.S.changed],
                },
              ],
            });
          },
        };

        Result.getOrThrow(fixture.coordinator.register(node)).enable();
        yield* fixture.coordinator.drain();
        actors.push(identity);
        parent = identity;
      }

      yield* fixture.coordinator.drain();

      const baseline = Result.getOrThrow(
        fixture.coordinator.prepareNotification({
          identity: fixture.providerIdentity,
          snapshot: fixture.providerSnapshot(),
        }),
      );

      fixture.coordinator.publish(baseline);
      yield* fixture.coordinator.drain();
      const publishedBefore = published;

      const deepEdge = actors.at(-2)!.key;
      const rootKey = fixture.providerIdentity.key;

      let deepDebt: ReadonlyMap<string, ContextCut> | undefined;
      let cleared = false;
      let writes = 0;

      // RETURN_TYPE: Narrow intercepted Map values to the private readonly debt view.
      const isDebtLineage = (value: unknown): value is ReadonlyMap<string, ContextCut> =>
        value !== null &&
        typeof value === "object" &&
        "get" in value &&
        typeof value.get === "function" &&
        "has" in value &&
        typeof value.has === "function" &&
        "entries" in value &&
        typeof value.entries === "function" &&
        "size" in value &&
        typeof value.size === "number" &&
        Symbol.iterator in value &&
        typeof value[Symbol.iterator] === "function";

      const setDescriptor = Object.getOwnPropertyDescriptor(Map.prototype, "set");
      const deleteDescriptor = Object.getOwnPropertyDescriptor(Map.prototype, "delete");

      if (setDescriptor === undefined || deleteDescriptor === undefined)
        return yield* Effect.die(new Error("Map descriptors are unavailable"));

      Object.defineProperty(Map.prototype, "set", {
        ...setDescriptor,
        value: function (this: Map<unknown, unknown>, key: unknown, value: unknown) {
          writes += 1;

          if (key === deepEdge && isDebtLineage(value)) deepDebt = value;

          return setDescriptor.value.call(this, key, value);
        },
      });

      Object.defineProperty(Map.prototype, "delete", {
        ...deleteDescriptor,
        value: function (this: Map<unknown, unknown>, key: unknown) {
          if (key === deepEdge) cleared = true;

          return deleteDescriptor.value.call(this, key);
        },
      });

      try {
        keyReads = 0;
        rejectEarly = true;
        fixture.setProviderChanged();

        const blocked = Result.getOrThrow(
          fixture.coordinator.prepareNotification({
            identity: fixture.providerIdentity,
            snapshot: fixture.providerSnapshot(),
          }),
        );

        fixture.coordinator.publish(blocked);

        yield* Deferred.await(started);
        assert.strictEqual(published, publishedBefore);
        yield* Deferred.succeed(gate, undefined);
        assert.ok(Exit.isFailure(yield* Effect.exit(fixture.coordinator.drain())));
        assert.strictEqual(published, publishedBefore);

        if (deepDebt === undefined) return yield* Effect.die(new Error("Expected deep edge debt"));

        assert.strictEqual(deepDebt.size, 2);
        assert.strictEqual(deepDebt.get(rootKey)?.identity, fixture.providerIdentity);
        assert.strictEqual(deepDebt.get(rootKey)?.revision, 2);
        assert.strictEqual(
          deepDebt.get(fixture.consumerIdentity.key)?.identity,
          fixture.consumerIdentity,
        );
        assert.strictEqual(
          deepDebt.get(fixture.consumerIdentity.key)?.revision,
          fixture.consumerSnapshot().revision,
        );
        assert.ok(keyReads <= depth * 20, `${keyReads} identity reads`);
        assert.ok(writes <= depth * 30, `${writes} map writes`);

        rejectEarly = false;

        const covering = Result.getOrThrow(
          fixture.coordinator.prepareNotification({
            identity: fixture.providerIdentity,
            snapshot: fixture.providerSnapshot(),
          }),
        );

        fixture.coordinator.publish(covering);

        yield* fixture.coordinator.drain();
        assert.ok(cleared);
        assert.ok(published > publishedBefore);
      } finally {
        Object.defineProperty(Map.prototype, "set", setDescriptor);
        Object.defineProperty(Map.prototype, "delete", deleteDescriptor);
      }

      yield* fixture.coordinator.close();
      yield* Scope.close(scope, Exit.void);
    }),
  );
});
