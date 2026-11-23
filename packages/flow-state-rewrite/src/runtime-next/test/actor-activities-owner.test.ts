import { assert, describe, it } from "@effect/vitest";
import { Cause, Effect, Exit, Option, Result, Stream } from "effect";

import { Failure } from "../../diagnostic/diagnostic.js";
import { definition } from "../../definition/definition.js";
import { machine } from "../../machine/machine.js";
import { resource } from "../../operation/resource.js";
import { stream } from "../../operation/stream.js";
import { transaction } from "../../operation/transaction.js";
import {
  makeActorActivities,
  type OperationOccurrence,
  type ActorOperationReaders,
  type ActorOperationReadCut,
} from "../actor/actor-activities.js";
import { isPermitRollbackFailure, withPermitRollback } from "../actor/actor-state.js";
import { captureActorSnapshotCopyPolicy, type ActorPublication } from "../actor/actor-snapshot.js";
import { prepareOperationCut, prepareOperationLaunches } from "../actor/actor-operation-cut.js";
import { makeStoreFixture, StoreDefinition, StoreMachine, storeSnapshot } from "./actor-fixture.js";

const cache = resource({
  id: "runtime-next/actor-activities-cache",
  key: (id: number) => [id] as const,
  lookup: (id: number) => id * 2,
});

const save = transaction({
  id: "runtime-next/actor-activities-save",
  key: (id: number) => [id] as const,
  commit: (id: number) => id,
});

const updates = stream({
  id: "runtime-next/actor-activities-updates",
  key: (id: number) => [id] as const,
  subscribe: (_id: number) => Stream.empty,
});

const DefinitionResult = definition({
  id: "runtime-next/actor-activities-owner",
  states: ["ready"],
  events: {},
  operations: { cache, save, updates },
});

const Definition = Result.getOrThrow(DefinitionResult);

const Machine = Result.getOrThrow(
  machine(DefinitionResult, ({ S }) => ({ default: S.ready, states: { ready: {} } })),
);

const CacheDefinitionResult = definition({
  id: "runtime-next/actor-activities-cache-owner",
  states: ["ready"],
  events: {},
  operations: { cache },
});

const CacheDefinition = Result.getOrThrow(CacheDefinitionResult);

const CacheMachine = Result.getOrThrow(
  machine(CacheDefinitionResult, ({ S }) => ({ default: S.ready, states: { ready: {} } })),
);

const throwSync = (error: Error) => {
  throw error;
};

const assertExitDefect = (exit: Exit.Exit<unknown, unknown>, expected: unknown) => {
  assert.ok(Exit.isFailure(exit));

  if (Exit.isFailure(exit)) {
    const defect = Cause.findDefect(exit.cause);

    assert.ok(Result.isSuccess(defect));

    if (Result.isSuccess(defect)) assert.strictEqual(defect.success, expected);
  }
};

const makeCacheCut = (state: ReturnType<typeof cache.getState>) =>
  ({
    cache: {
      descriptor: cache,
      reader: {
        key: cache.key,
        getState: () => state,
        getData: () => ("data" in state ? state.data : undefined),
      },
    },
  }) satisfies ActorOperationReadCut<typeof CacheDefinition>;

const verifyNoExecutionSurface = (readers: ActorOperationReaders<typeof Definition>) => {
  // @ts-expect-error Resource readers do not expose operation execution methods.
  readers.cache.lookup(7);
  // @ts-expect-error Transaction readers do not expose operation execution methods.
  readers.save.commit(7);
  // @ts-expect-error Stream readers do not expose subscription methods.
  readers.updates.subscribe(7);
};

void verifyNoExecutionSurface;

describe("runtime-next actor activities owner", () => {
  it.effect("operation preflight defects cancel acquired permits exactly once", () =>
    Effect.gen(function* () {
      const activities = makeActorActivities(CacheMachine);
      const defect = new Error("second occurrence defect");
      let occurrenceCancellations = 0;
      let preparedOccurrences = 0;
      let firstOccurrence: OperationOccurrence<typeof CacheDefinition> | undefined;

      const launchExit = yield* Effect.exit(
        Effect.sync(() =>
          prepareOperationLaunches({
            machine: CacheMachine,
            actions: [{ action: cache.lookup(1) }, { action: cache.lookup(2) }],
            beforeState: Option.none(),
            afterState: CacheDefinition.S.ready,
            hasRunner: true,
            hasStore: true,
            resolveDescriptor: (id) => activities.resolveDescriptor(id),
            prepareOccurrence: (operation, key, slot) => {
              preparedOccurrences += 1;

              if (preparedOccurrences === 2) return throwSync(defect);
              const prepared = activities.prepareOccurrence(operation, key, slot);

              if (Result.isFailure(prepared)) return prepared;
              firstOccurrence = prepared.success.occurrence;

              return Result.succeed({
                occurrence: prepared.success.occurrence,
                commit: prepared.success.commit,
                cancel: () => {
                  occurrenceCancellations += 1;
                  prepared.success.cancel();
                },
              });
            },
          }),
        ),
      );

      assertExitDefect(launchExit, defect);
      assert.strictEqual(preparedOccurrences, 2);
      assert.strictEqual(occurrenceCancellations, 1);
      assert.ok(firstOccurrence !== undefined);
      assert.strictEqual(activities.isLive(firstOccurrence), false);

      const store = makeStoreFixture();
      const storeActivities = makeActorActivities(StoreMachine);
      const descriptor = StoreDefinition.operations.cache;

      const occurrence = Result.getOrThrow(
        storeActivities.prepareOccurrence(descriptor, [3], Option.none()),
      ).occurrence;

      let storeCancellations = 0;

      const port: typeof store.port = {
        ...store.port,
        prepareProjection(fact) {
          const prepared = store.port.prepareProjection(fact);

          if (Result.isFailure(prepared)) return prepared;

          return Result.succeed({
            ...prepared.success,
            cancel: () => {
              storeCancellations += 1;
              prepared.success.cancel();
            },
          });
        },
      };

      const publication: ActorPublication<typeof StoreDefinition> = {
        snapshot: storeSnapshot(),
        machineTurnRevision: 0,
        evidenceSequence: 0,
      };

      const cutExit = yield* Effect.exit(
        Effect.sync(() =>
          prepareOperationCut({
            machine: StoreMachine,
            copyPolicy: captureActorSnapshotCopyPolicy(StoreMachine),
            publication,
            fact: {
              _tag: "terminal",
              occurrence,
              outcome: { _tag: "success", value: 3 },
            },
            store: Option.some(port),
            captureReaders: () => throwSync(defect),
            prepareNotification: () => Result.succeed(Option.none()),
          }),
        ),
      );

      assertExitDefect(cutExit, defect);
      assert.strictEqual(storeCancellations, 1);

      const rollbackOrder: number[] = [];
      const cancellationDefect = new Error("permit cancellation defect");

      const rollback = withPermitRollback((register) => {
        register(() => rollbackOrder.push(1));
        register(() => {
          rollbackOrder.push(2);
          throwSync(cancellationDefect);
        });
        register(() => rollbackOrder.push(3));

        return throwSync(defect);
      });

      assert.ok(Result.isFailure(rollback));

      if (Result.isFailure(rollback)) {
        assert.ok(isPermitRollbackFailure(rollback.failure));

        if (isPermitRollbackFailure(rollback.failure)) {
          assert.strictEqual(rollback.failure.primary._tag, "Defect");

          if (rollback.failure.primary._tag === "Defect")
            assert.strictEqual(rollback.failure.primary.defect, defect);

          assert.deepStrictEqual(rollback.failure.cleanupFailures, [cancellationDefect]);
        }
      }

      assert.deepStrictEqual(rollbackOrder, [3, 2, 1]);
    }),
  );

  it.effect("typed rejection retains every throwing permit cancellation cause", () =>
    Effect.sync(() => {
      const rejection = Failure({
        code: "SemanticValidation",
        path: ["actor", "activities", "permit"],
        details: {},
        summary: "Permit preparation rejected",
        help: "Retain this rejection with every reverse cancellation failure.",
      });

      const firstCancellation = new Error("first permit cancellation defect");
      const secondCancellation = new Error("second permit cancellation defect");
      const cancellationOrder: number[] = [];

      const prepared = withPermitRollback((register) => {
        register(() => {
          cancellationOrder.push(1);
          throwSync(firstCancellation);
        });
        register(() => {
          cancellationOrder.push(2);
          throwSync(secondCancellation);
        });

        return Result.fail(rejection);
      });

      assert.deepStrictEqual(cancellationOrder, [2, 1]);
      assert.ok(Result.isFailure(prepared));

      if (Result.isFailure(prepared)) {
        assert.ok(isPermitRollbackFailure(prepared.failure));

        if (isPermitRollbackFailure(prepared.failure)) {
          assert.strictEqual(prepared.failure.primary._tag, "Failure");

          if (prepared.failure.primary._tag === "Failure")
            assert.strictEqual(prepared.failure.primary.failure, rejection);

          assert.deepStrictEqual(prepared.failure.cleanupFailures, [
            secondCancellation,
            firstCancellation,
          ]);
        }
      }
    }),
  );

  it("captures exact family readers from each immutable store cut", () => {
    const activities = makeActorActivities(CacheMachine);
    const key = cache.key(7);

    const beforeState = { status: "ready", key, generation: 1, data: 14 } satisfies ReturnType<
      typeof cache.getState
    >;

    const afterState = { status: "refreshing", key, generation: 2, data: 18 } satisfies ReturnType<
      typeof cache.getState
    >;

    const beforeReaders = activities.captureReaders(makeCacheCut(beforeState));
    const afterReaders = activities.captureReaders(makeCacheCut(afterState));

    const resourceState: ReturnType<typeof cache.getState> = beforeReaders.cache.getState(key);

    const resourceData: number | undefined = beforeReaders.cache.getData(key);

    assert.strictEqual(resourceState.status, "ready");
    assert.strictEqual(resourceData, 14);
    assert.strictEqual(beforeReaders.cache.getData(key), 14);
    assert.strictEqual(afterReaders.cache.getData(key), 18);

    const exposedReaderKey = beforeReaders.cache.key(7);
    exposedReaderKey[0] = 99;

    assert.strictEqual(beforeReaders.cache.getData(key), 14);
    assert.strictEqual(Reflect.set(beforeReaders, "cache", afterReaders.cache), false);
    assert.strictEqual(
      Reflect.set(beforeReaders.cache, "getState", () => undefined),
      false,
    );

    const mutableCut = makeCacheCut(beforeState);
    const sourceReader = mutableCut.cache.reader;
    const sourceGetState = Object.getOwnPropertyDescriptor(sourceReader, "getState");
    const retainedReaders = activities.captureReaders(mutableCut);
    const laterEntry = makeCacheCut(afterState).cache;

    assert.notStrictEqual(retainedReaders.cache, sourceReader);
    assert.deepStrictEqual(
      Object.getOwnPropertyDescriptor(sourceReader, "getState"),
      sourceGetState,
    );
    assert.strictEqual(
      Object.getOwnPropertyDescriptor(retainedReaders.cache, "getState")?.writable,
      false,
    );
    assert.strictEqual(Reflect.set(mutableCut, "cache", laterEntry), true);
    assert.strictEqual(retainedReaders.cache.getData(key), 14);
  });

  it("returns descriptor-defined missing and idle states without materializing store entries", () => {
    const activities = makeActorActivities(Machine);
    const reads: string[] = [];

    const readers = activities.captureReaders({
      cache: {
        descriptor: cache,
        reader: {
          key: cache.key,
          getState: (key) => {
            reads.push(cache.id);

            return cache.getState(key);
          },
          getData: (key) => {
            reads.push(cache.id);
            const state = cache.getState(key);

            return "data" in state ? state.data : undefined;
          },
        },
      },
      save: {
        descriptor: save,
        reader: {
          key: save.key,
          getState: (key) => {
            reads.push(save.id);

            return save.getState(key);
          },
        },
      },
      updates: {
        descriptor: updates,
        reader: {
          key: updates.key,
          getState: (key) => {
            reads.push(updates.id);

            return updates.getState(key);
          },
        },
      },
    });

    const cacheKey = cache.key(9);

    assert.deepStrictEqual(readers.cache.getState(cacheKey), { status: "missing", key: cacheKey });
    assert.strictEqual(readers.cache.getData(cacheKey), undefined);
    assert.deepStrictEqual(readers.save.getState(save.key(9)), {
      status: "idle",
      key: save.key(9),
    });
    assert.deepStrictEqual(readers.updates.getState(updates.key(9)), {
      status: "idle",
      key: updates.key(9),
      generation: null,
      hasValue: false,
      emissionCount: 0,
    });
    assert.deepStrictEqual(reads, [cache.id, cache.id, save.id, updates.id]);
  });

  it("prepares replacements without disturbing live work until commit", () => {
    const activities = makeActorActivities(Machine);
    const inputKey: [number] = [3];
    const first = Result.getOrThrow(activities.prepareOccurrence(cache, inputKey));
    first.commit();

    inputKey.push(4);
    assert.deepStrictEqual(first.occurrence.key, [3]);
    assert.strictEqual(activities.isLive(first.occurrence), true);
    assert.strictEqual(activities.resolveDescriptor(cache.id), cache);
    assert.strictEqual(activities.resolveDescriptor("runtime-next/foreign-operation"), undefined);
    assert.strictEqual(Reflect.set(first.occurrence, "descriptor", save), false);
    assert.strictEqual(Reflect.set(first.occurrence, "generation", 999), false);

    const cancelled = Result.getOrThrow(activities.prepareOccurrence(cache, cache.key(3)));

    assert.strictEqual(first.occurrence.generation, 1);
    assert.strictEqual(cancelled.occurrence.generation, 2);
    assert.strictEqual(activities.isLive(first.occurrence), true);
    assert.strictEqual(activities.isLive(cancelled.occurrence), false);
    cancelled.cancel();
    cancelled.cancel();
    cancelled.commit();
    assert.strictEqual(activities.isLive(first.occurrence), true);
    assert.strictEqual(activities.settle(first.occurrence), true);
    assert.strictEqual(activities.isLive(first.occurrence), false);
    assert.strictEqual(activities.settle(first.occurrence), false);

    const replacement = Result.getOrThrow(activities.prepareOccurrence(cache, cache.key(3)));
    replacement.commit();
    replacement.commit();
    replacement.cancel();

    assert.strictEqual(replacement.occurrence.generation, 3);
    assert.strictEqual(activities.isLive(first.occurrence), false);
    assert.strictEqual(activities.isLive(replacement.occurrence), true);
    assert.strictEqual(activities.settle(first.occurrence), false);
    assert.strictEqual(activities.settle(replacement.occurrence), true);
    assert.strictEqual(activities.isLive(replacement.occurrence), false);
    assert.strictEqual(activities.settle(replacement.occurrence), false);

    const evicted = Result.getOrThrow(activities.prepareOccurrence(cache, cache.key(3)));
    evicted.commit();
    assert.strictEqual(activities.isLive(evicted.occurrence), true);
    activities.evict(cache, cache.key(3));
    assert.strictEqual(activities.isLive(evicted.occurrence), false);
    assert.strictEqual(activities.settle(evicted.occurrence), false);

    const afterEviction = Result.getOrThrow(activities.prepareOccurrence(cache, cache.key(3)));
    afterEviction.commit();
    assert.strictEqual(afterEviction.occurrence.generation, 5);
    assert.strictEqual(activities.isLive(afterEviction.occurrence), true);

    activities.clear();
    assert.strictEqual(activities.isLive(afterEviction.occurrence), false);
    assert.strictEqual(activities.settle(afterEviction.occurrence), false);

    const afterClear = Result.getOrThrow(activities.prepareOccurrence(cache, cache.key(3)));
    afterClear.commit();
    assert.strictEqual(afterClear.occurrence.generation, 6);
    assert.strictEqual(activities.settle(afterClear.occurrence), true);

    const otherActivities = makeActorActivities(Machine);
    const foreign = Result.getOrThrow(otherActivities.prepareOccurrence(cache, cache.key(3)));
    foreign.commit();
    assert.strictEqual(activities.isLive(foreign.occurrence), false);
  });

  it("owns nested occurrence keys and returns defensive copies", () => {
    const activities = makeActorActivities(Machine);
    const inputKey = [{ nested: [3] }];
    const prepared = Result.getOrThrow(activities.prepareOccurrence(cache, inputKey));

    prepared.commit();
    inputKey[0]!.nested.push(4);

    const exposedKey = prepared.occurrence.key;

    Reflect.set(exposedKey, "0", { nested: [5] });

    assert.deepStrictEqual(prepared.occurrence.key, [{ nested: [3] }]);
    assert.strictEqual(activities.isLive(prepared.occurrence), true);
    assert.strictEqual(activities.settle(prepared.occurrence), true);
  });

  it("keeps same-key named activity cursors independent through eviction", () => {
    const activities = makeActorActivities(CacheMachine);
    const key = cache.key(7);

    const first = Result.getOrThrow(
      activities.prepareOccurrence(cache, key, Option.some("S.active.S.A:first")),
    );

    const second = Result.getOrThrow(
      activities.prepareOccurrence(cache, key, Option.some("S.active.S.A:second")),
    );

    first.commit();
    second.commit();
    assert.strictEqual(activities.isLive(first.occurrence), true);
    assert.strictEqual(activities.isLive(second.occurrence), true);
    activities.evict(cache, key, Option.some("S.active.S.A:first"));
    assert.strictEqual(activities.isLive(first.occurrence), false);
    assert.strictEqual(activities.isLive(second.occurrence), true);
    assert.strictEqual(activities.settle(first.occurrence), false);
    assert.strictEqual(activities.settle(second.occurrence), true);
    assert.strictEqual(activities.isLive(second.occurrence), false);
  });

  it("releases settled cursors across distinct keys and fences stale duplicates", () => {
    const activities = makeActorActivities(Machine);
    const first = Result.getOrThrow(activities.prepareOccurrence(cache, cache.key(0)));

    first.commit();
    assert.strictEqual(activities.settle(first.occurrence), true);
    assert.strictEqual(activities.settle(first.occurrence), false);

    for (let id = 1; id <= 128; id += 1) {
      const completed = Result.getOrThrow(activities.prepareOccurrence(cache, cache.key(id)));

      completed.commit();
      assert.strictEqual(activities.isLive(completed.occurrence), true);
      assert.strictEqual(activities.settle(completed.occurrence), true);
      assert.strictEqual(activities.isLive(completed.occurrence), false);
      assert.strictEqual(activities.settle(completed.occurrence), false);
    }

    const replacement = Result.getOrThrow(activities.prepareOccurrence(cache, cache.key(0)));

    assert.strictEqual(replacement.occurrence.generation, 130);
    replacement.commit();
    assert.strictEqual(activities.isLive(first.occurrence), false);
    assert.strictEqual(activities.settle(first.occurrence), false);
    assert.strictEqual(activities.isLive(replacement.occurrence), true);
    assert.strictEqual(activities.settle(replacement.occurrence), true);
  });

  it("rejects generation overflow before publication without replacing live work", () => {
    const activities = makeActorActivities(Machine);
    const key = cache.key(4);
    const live = Result.getOrThrow(activities.prepareOccurrence(cache, key));

    live.commit();

    const isSafeInteger = Number.isSafeInteger;
    let overflow: ReturnType<typeof activities.prepareOccurrence>;

    try {
      Number.isSafeInteger = () => false;
      overflow = activities.prepareOccurrence(cache, key);
    } finally {
      Number.isSafeInteger = isSafeInteger;
    }

    assert.isTrue(Result.isFailure(overflow));
    assert.strictEqual(activities.settle(live.occurrence), true);

    const next = Result.getOrThrow(activities.prepareOccurrence(cache, key));
    assert.strictEqual(next.occurrence.generation, 2);
  });
});
