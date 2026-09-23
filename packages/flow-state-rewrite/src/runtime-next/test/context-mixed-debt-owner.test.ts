import { assert, describe, it } from "@effect/vitest";
import { Deferred, Effect, Exit, Result, Scope } from "effect";

import { actorRef } from "../../runtime/actor-ref.js";
import { makeActorDirectory } from "../actor/actor-directory.js";
import type { ContextNode } from "../context/context-coordinator.js";
import type { ActorSnapshot } from "../runtime.js";
import {
  Consumer,
  ConsumerMachine,
  isProviderState,
  makeHarness,
  Provider,
  type ProviderValue,
  unavailable,
} from "./context-fixture.js";

const measureMixedWave = (prefix: number) =>
  Effect.gen(function* () {
    const scope = yield* Scope.make();
    const fixture = yield* makeHarness(scope);
    const directory = makeActorDirectory<string>({ machines: [ConsumerMachine] });
    const rejectedIndex = prefix;
    const count = prefix * 2 + 1;
    const published: number[] = Array.from({ length: count }, () => 0);
    let advanceRejectedRevision = () => {};

    const rejectionStarted = Deferred.makeUnsafe<void>();
    const rejectionGate = Deferred.makeUnsafe<void>();
    let reject = false;
    let keyReads = 0;
    let mapWrites = 0;
    let prefixWrites = 0;
    let parent = fixture.consumerIdentity;

    for (let index = 0; index < count; index += 1) {
      const ref = actorRef(ConsumerMachine, `mixed-${String(index).padStart(4, "0")}`);
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
                if (index === rejectedIndex && reject) {
                  Deferred.doneUnsafe(rejectionStarted, Effect.void);
                  yield* Deferred.await(rejectionGate);

                  return yield* Effect.fail(unavailable());
                }

                const offer = Result.getOrThrow(ticket.consume(identity, revision));
                const next = offer.entries[0]?.value;

                if (next === undefined) return yield* Effect.fail(unavailable());
                value = next;
                revision += 1;
                published[index] = (published[index] ?? 0) + 1;

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

      if (index === rejectedIndex)
        advanceRejectedRevision = () => {
          revision += 1;
        };

      parent = identity;
    }

    const baseline = Result.getOrThrow(
      fixture.coordinator.prepareNotification({
        identity: fixture.providerIdentity,
        snapshot: fixture.providerSnapshot(),
      }),
    );

    fixture.coordinator.publish(baseline);
    yield* fixture.coordinator.drain();
    assert.deepStrictEqual(
      published,
      Array.from({ length: count }, () => 1),
    );

    const setDescriptor = Object.getOwnPropertyDescriptor(Map.prototype, "set");

    if (setDescriptor === undefined)
      return yield* Effect.die(new Error("Map.set descriptor is unavailable"));

    Object.defineProperty(Map.prototype, "set", {
      ...setDescriptor,
      value: function (this: Map<unknown, unknown>, key: unknown, value: unknown) {
        mapWrites += 1;

        return setDescriptor.value.call(this, key, value);
      },
    });

    try {
      keyReads = 0;
      reject = true;
      advanceRejectedRevision();
      fixture.setProviderChanged();

      const changed = Result.getOrThrow(
        fixture.coordinator.prepareNotification({
          identity: fixture.providerIdentity,
          snapshot: fixture.providerSnapshot(),
        }),
      );

      fixture.coordinator.publish(changed);

      yield* Deferred.await(rejectionStarted);
      prefixWrites = mapWrites;
      assert.deepStrictEqual(
        published.slice(0, prefix),
        Array.from({ length: prefix }, () => 2),
      );
      assert.deepStrictEqual(
        published.slice(rejectedIndex),
        Array.from({ length: prefix + 1 }, () => 1),
      );
      yield* Deferred.succeed(rejectionGate, undefined);
      assert.ok(Exit.isFailure(yield* Effect.exit(fixture.coordinator.drain())));
      assert.deepStrictEqual(
        published.slice(rejectedIndex),
        Array.from({ length: prefix + 1 }, () => 1),
      );

      // Each node has one edge and a fixed-length key. The affected graph has O(prefix) size.
      assert.ok(keyReads <= count * 80, `${keyReads} key reads for ${count} nodes`);
      assert.ok(mapWrites <= count * 1_000, `${mapWrites} Map writes for ${count} nodes`);
      assert.ok(
        mapWrites - prefixWrites <= count * 300,
        `${mapWrites - prefixWrites} blocked-suffix Map writes for ${count} nodes`,
      );
    } finally {
      Object.defineProperty(Map.prototype, "set", setDescriptor);
    }

    reject = false;

    const covering = Result.getOrThrow(
      fixture.coordinator.prepareNotification({
        identity: fixture.providerIdentity,
        snapshot: fixture.providerSnapshot(),
      }),
    );

    fixture.coordinator.publish(covering);
    yield* fixture.coordinator.drain();
    assert.deepStrictEqual(
      published,
      Array.from({ length: count }, () => 2),
    );
    yield* fixture.coordinator.close();
    yield* Scope.close(scope, Exit.void);

    return { mapWrites, blockedWrites: mapWrites - prefixWrites };
  });

describe("runtime-next context mixed debt cost", () => {
  it.effect("shares changed prefix cuts across blocked descendants at increasing sizes", () =>
    Effect.gen(function* () {
      const small = yield* measureMixedWave(24);
      const large = yield* measureMixedWave(48);

      assert.ok(
        large.mapWrites <= small.mapWrites * 2.5,
        `Map writes grew ${small.mapWrites} -> ${large.mapWrites}`,
      );
      assert.ok(
        large.blockedWrites <= small.blockedWrites * 2.5,
        `blocked-suffix Map writes grew ${small.blockedWrites} -> ${large.blockedWrites}`,
      );
    }),
  );
});
