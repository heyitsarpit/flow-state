import { batch } from "@tanstack/store";
import { Cause, Context, Effect, Fiber, Layer, Option } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, it } from "vite-plus/test";

import { FlowDiagnostic } from "./shared/diagnostics.js";
import * as flow from "./core/api/flow-core.js";
import { assertDurableFlowKey, createFlowKeyIdentityScope } from "./core/api/canonical-key.js";
import { createKey, createTag } from "./core/api/keys.js";
import type { FlowKey, FlowResourceRef, FlowResourceSnapshot } from "./core/api/types.js";
import { NotificationScheduler } from "./core/runtime/services/notification-scheduler.js";
import { HostSignals } from "./core/runtime/services/host-signals.js";
import { ResourceStore } from "./core/runtime/services/resource-store.js";
import type { PrevalidatedResourceRestoreEntry } from "./core/store/hydration.js";
import { FlowRuntimePolicy } from "./core/runtime/services/runtime-policy.js";
import {
  createEmptyResourceRecord,
  type InternalResourceRecord,
} from "./core/store/resource-snapshot.js";
import { resourceKeyOf } from "./core/store/invalidation.js";
import { createResourceStoreSubscriptionController } from "./core/store/resource-store-subscriptions.js";
import type { ResourceState } from "./core/store/resource-store-state-updates.js";
import { createSelectionSource, selectSource } from "./core/store/selection-source.js";

interface ProjectRecord {
  readonly id: string;
  readonly name: string;
}

class ProjectLookup extends Context.Service<
  ProjectLookup,
  {
    readonly load: (id: string) => Effect.Effect<ProjectRecord, "missing">;
  }
>()("test/ProjectLookup") {}

const projectTag = createTag("project");

function projectLookupLayer(
  lookup: (id: string) => Effect.Effect<ProjectRecord, "missing">,
): Layer.Layer<ProjectLookup> {
  return Layer.succeed(
    ProjectLookup,
    ProjectLookup.of({
      load: lookup,
    }),
  );
}

const projectResource = flow.resource<
  [projectId: string],
  ProjectRecord,
  "missing",
  Effect.Effect<ProjectRecord, "missing", ProjectLookup>
>({
  id: "project.byId",
  key: (projectId) => createKey("project", projectId),
  lookup: (projectId) =>
    Effect.gen(function* () {
      const lookup = yield* ProjectLookup;
      return yield* lookup.load(projectId);
    }),
  tags: () => [projectTag],
  placeholder: (projectId) =>
    Option.some({
      id: projectId,
      name: "Loading project",
    }),
  freshness: {
    staleAfter: "30 seconds",
    onInvalidate: "active",
  },
});

const projectRef = projectResource.ref("project-1");
const secondaryProjectRef = projectResource.ref("project-2");
const lazyProjectResource = flow.resource<
  [projectId: string],
  ProjectRecord,
  "missing",
  Effect.Effect<ProjectRecord, "missing", ProjectLookup>
>({
  id: "project.lazyById",
  key: (projectId) => createKey("project", "lazy", projectId),
  lookup: (projectId) =>
    Effect.gen(function* () {
      const lookup = yield* ProjectLookup;
      return yield* lookup.load(projectId);
    }),
  tags: () => [projectTag],
  freshness: {
    staleAfter: "30 seconds",
    onInvalidate: "lazy",
  },
});
const neverProjectResource = flow.resource<
  [projectId: string],
  ProjectRecord,
  "missing",
  Effect.Effect<ProjectRecord, "missing", ProjectLookup>
>({
  id: "project.neverById",
  key: (projectId) => createKey("project", "never", projectId),
  lookup: (projectId) =>
    Effect.gen(function* () {
      const lookup = yield* ProjectLookup;
      return yield* lookup.load(projectId);
    }),
  tags: () => [projectTag],
  freshness: {
    staleAfter: "30 seconds",
    onInvalidate: "never",
  },
});
const lazyProjectRef = lazyProjectResource.ref("project-1");
const neverProjectRef = neverProjectResource.ref("project-1");
const optionalProjectResource = flow.resource<
  [projectId: string],
  ProjectRecord | undefined,
  "missing",
  Effect.Effect<ProjectRecord | undefined, "missing", ProjectLookup>
>({
  id: "project.optionalById",
  key: (projectId) => createKey("project", "optional", projectId),
  lookup: (projectId) =>
    Effect.gen(function* () {
      const lookup = yield* ProjectLookup;
      return yield* lookup.load(projectId);
    }),
});
const optionalProjectRef = optionalProjectResource.ref("project-1");

const notificationSchedulerLayer = NotificationScheduler.testLayer;
const runtimePolicyLayer = FlowRuntimePolicy.layer({
  store: flow.store.test(),
  orchestrators: flow.orchestrators.test(),
}).pipe(Layer.provide(Layer.mergeAll(notificationSchedulerLayer, HostSignals.testLayer)));
const resourceStoreLayer = Layer.mergeAll(
  notificationSchedulerLayer,
  HostSignals.testLayer,
  runtimePolicyLayer,
  ResourceStore.layer.pipe(
    Layer.provide(
      Layer.mergeAll(notificationSchedulerLayer, HostSignals.testLayer, runtimePolicyLayer),
    ),
  ),
  TestClock.layer(),
);

function runResourceStore<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  lookup: (id: string) => Effect.Effect<ProjectRecord, "missing">,
): Promise<A> {
  const provided = effect.pipe(
    Effect.provide(Layer.mergeAll(resourceStoreLayer, projectLookupLayer(lookup))),
  ) as Effect.Effect<A, E>;

  return Effect.runPromise(provided);
}

function runResourceStoreExit<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  lookup: (id: string) => Effect.Effect<ProjectRecord, "missing">,
) {
  const provided = effect.pipe(
    Effect.provide(Layer.mergeAll(resourceStoreLayer, projectLookupLayer(lookup))),
  ) as Effect.Effect<A, E>;

  return Effect.runPromiseExit(provided);
}

function snapshotTrace(snapshot: FlowResourceSnapshot<ProjectRecord, unknown>) {
  return {
    status: snapshot.status,
    availability: snapshot.availability,
    activity: snapshot.activity,
    freshness: snapshot.freshness,
    value: snapshot.value?.name,
    previousValue: snapshot.previousValue?.name,
    error: snapshot.error,
  };
}

function frozenResourceRecord<Value, Error = unknown>(
  ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
  overrides: Partial<InternalResourceRecord<Value, Error>>,
): InternalResourceRecord<Value, Error> {
  const base = createEmptyResourceRecord<Value, Error>(ref);
  return Object.freeze({
    ...base,
    ...overrides,
    tags: Object.freeze([...(overrides.tags ?? base.tags)]),
  }) satisfies InternalResourceRecord<Value, Error>;
}

function restoreEntry<Value, Error = unknown>(
  record: InternalResourceRecord<Value, Error>,
  target: PrevalidatedResourceRestoreEntry<Value, Error>["target"] = {
    ref: record.ref,
  },
): PrevalidatedResourceRestoreEntry<Value, Error> {
  return Object.freeze({
    target: Object.freeze(target),
    record,
  });
}

describe("resource store and selection source contracts", () => {
  it("returns null for an unknown ref read without creating a store record", async () => {
    const invalidRef = {
      kind: "resourceRef" as const,
      id: "project.unknown",
      key: createKey("project", "unknown"),
      params: ["unknown"] as const,
    } as FlowResourceRef<string, ReadonlyArray<unknown>, ProjectRecord>;

    const result = await runResourceStore(
      Effect.gen(function* () {
        const store = yield* ResourceStore;
        const before = yield* store.inspect();
        const snapshot = yield* store.get(invalidRef);
        const after = yield* store.inspect();

        return {
          before,
          snapshot,
          after,
        };
      }),
      (_id) => Effect.fail("missing" as const),
    );

    expect(result.before).toEqual([]);
    expect(result.snapshot).toBeNull();
    expect(result.after).toEqual([]);
  });

  it("releases inactive per-ref selection sources after unsubscribe churn", () => {
    const controller = createResourceStoreSubscriptionController({
      source: createSelectionSource<ResourceState>({
        records: new Map(),
      }),
      resourceKeyOf,
      readNow: () => Effect.succeed(0),
      currentTime: () => 0,
    });

    const unsubscribeFirst = Effect.runSync(controller.subscribe(projectRef, () => undefined));
    const unsubscribeSecond = Effect.runSync(controller.subscribe(projectRef, () => undefined));

    expect(controller.retainedSelectionCount()).toBe(1);

    unsubscribeFirst();
    expect(controller.retainedSelectionCount()).toBe(1);

    unsubscribeSecond();
    expect(controller.retainedSelectionCount()).toBe(0);

    const unsubscribeAgain = Effect.runSync(controller.subscribe(projectRef, () => undefined));
    expect(controller.retainedSelectionCount()).toBe(1);
    unsubscribeAgain();
    expect(controller.retainedSelectionCount()).toBe(0);
  });

  it("invalidates all resources with compatible same-id ID-only tags", async () => {
    const firstTag = createTag("project.compatible.shared");
    const secondTag = createTag("project.compatible.shared");
    const firstResource = flow.resource<
      [projectId: string],
      ProjectRecord,
      "missing",
      Effect.Effect<ProjectRecord, "missing", ProjectLookup>
    >({
      id: "project.compatible.first",
      key: (projectId) => createKey("project", "compatible", "first", projectId),
      lookup: (projectId) =>
        Effect.gen(function* () {
          const lookup = yield* ProjectLookup;
          return yield* lookup.load(projectId);
        }),
      tags: () => [firstTag],
    });
    const secondResource = flow.resource<
      [projectId: string],
      ProjectRecord,
      "missing",
      Effect.Effect<ProjectRecord, "missing", ProjectLookup>
    >({
      id: "project.compatible.second",
      key: (projectId) => createKey("project", "compatible", "second", projectId),
      lookup: (projectId) =>
        Effect.gen(function* () {
          const lookup = yield* ProjectLookup;
          return yield* lookup.load(projectId);
        }),
      tags: () => [secondTag],
    });
    const firstRef = firstResource.ref("project-1");
    const secondRef = secondResource.ref("project-2");

    const result = await runResourceStore(
      Effect.gen(function* () {
        const store = yield* ResourceStore;

        yield* store.seed([
          { ref: firstRef, value: { id: "project-1", name: "First" } },
          { ref: secondRef, value: { id: "project-2", name: "Second" } },
        ]);

        const invalidatedCount = yield* store.invalidate(firstTag);
        const first = yield* store.get(firstRef);
        const second = yield* store.get(secondRef);

        return {
          invalidatedCount,
          first,
          second,
        };
      }),
      (id) => Effect.succeed({ id, name: "Fetched" }),
    );

    expect(result.invalidatedCount).toBe(2);
    expect(result.first).toMatchObject({
      freshness: "invalidated",
      value: { id: "project-1", name: "First" },
    });
    expect(result.second).toMatchObject({
      freshness: "invalidated",
      value: { id: "project-2", name: "Second" },
    });
  });

  it("updates selection sources immediately while batching subscriber notifications", () => {
    const source = createSelectionSource({
      count: 0,
      ignored: "initial",
    });
    const parity = selectSource(source, (snapshot) => snapshot.count % 2);
    const sourceNotifications: number[] = [];
    const parityNotifications: number[] = [];

    const unsubscribeSource = source.subscribe(() => {
      sourceNotifications.push(source.getSnapshot().count);
    });
    const unsubscribeParity = parity.subscribe(() => {
      parityNotifications.push(parity.getSnapshot());
    });

    batch(() => {
      source.update((snapshot) => ({ ...snapshot, count: snapshot.count + 1 }));
      expect(source.getSnapshot()).toEqual({
        count: 1,
        ignored: "initial",
      });

      source.update((snapshot) => ({ ...snapshot, ignored: "changed" }));
      expect(source.getSnapshot()).toEqual({
        count: 1,
        ignored: "changed",
      });

      source.update((snapshot) => ({ ...snapshot, count: snapshot.count + 2 }));
      expect(source.getSnapshot()).toEqual({
        count: 3,
        ignored: "changed",
      });
    });

    expect(sourceNotifications).toEqual([3]);
    expect(parityNotifications).toEqual([1]);

    unsubscribeSource();
    unsubscribeParity();

    source.update((snapshot) => ({ ...snapshot, count: snapshot.count + 1 }));
    expect(sourceNotifications).toEqual([3]);
    expect(parityNotifications).toEqual([1]);
  });

  it("tracks resources by stable ref key, not only id, and exposes seeded snapshots to subscribers", async () => {
    const seenPrimaryNames: string[] = [];

    const result = await runResourceStore(
      Effect.gen(function* () {
        const store = yield* ResourceStore;
        const unsubscribe = yield* store.subscribe(projectRef, (snapshot) => {
          if (snapshot.value?.name !== undefined) {
            seenPrimaryNames.push(snapshot.value.name);
          }
        });

        yield* store.seed([
          { ref: projectRef, value: { id: "project-1", name: "Atlas" } },
          { ref: secondaryProjectRef, value: { id: "project-2", name: "Borealis" } },
        ]);

        yield* store.patch(projectRef, (current) => ({
          ...(current ?? { id: "project-1", name: "Atlas" }),
          name: "Atlas v2",
        }));

        const primary = yield* store.get(projectRef);
        const secondary = yield* store.get(secondaryProjectRef);
        const facts = yield* store.inspect();

        unsubscribe();

        return {
          primary,
          secondary,
          facts,
        };
      }),
      (_id) => Effect.fail("missing" as const),
    );

    expect(seenPrimaryNames).toEqual(["Atlas", "Atlas v2"]);
    expect(result.primary).toMatchObject({
      id: "project.byId",
      status: "success",
      availability: "value",
      activity: "idle",
      freshness: "fresh",
      value: { id: "project-1", name: "Atlas v2" },
      previousValue: { id: "project-1", name: "Atlas" },
    });
    expect(result.secondary).toMatchObject({
      id: "project.byId",
      status: "success",
      value: { id: "project-2", name: "Borealis" },
    });
    expect(result.facts).toHaveLength(2);
  });

  it("uses canonical resource identity without raw JSON key collapses", async () => {
    const matrixResource = flow.resource<[key: FlowKey], ProjectRecord>({
      id: "key.matrix",
      key: (key) => key,
      lookup: () => Effect.die("unused lookup"),
    });

    const emptyRef = matrixResource.ref(createKey());
    const undefinedRef = matrixResource.ref(createKey(undefined));
    const nullRef = matrixResource.ref(createKey(null));
    const manyRef = matrixResource.ref(createKey(undefined, null));
    const zeroRef = matrixResource.ref(createKey(0));
    const negativeZeroRef = matrixResource.ref(createKey(-0));
    const nanRef = matrixResource.ref(createKey(Number.NaN));
    const infinityRef = matrixResource.ref(createKey(Infinity));
    const negativeInfinityRef = matrixResource.ref(createKey(-Infinity));
    const bigintRef = matrixResource.ref(createKey(1n));

    const result = await runResourceStore(
      Effect.gen(function* () {
        const store = yield* ResourceStore;
        yield* store.seed([
          { ref: emptyRef, value: { id: "empty", name: "Empty" } },
          { ref: undefinedRef, value: { id: "undefined", name: "Undefined" } },
          { ref: nullRef, value: { id: "null", name: "Null" } },
          { ref: manyRef, value: { id: "many", name: "Many" } },
          { ref: zeroRef, value: { id: "zero", name: "Zero" } },
          { ref: negativeZeroRef, value: { id: "negative-zero", name: "Negative zero" } },
          { ref: nanRef, value: { id: "nan", name: "NaN" } },
          { ref: infinityRef, value: { id: "infinity", name: "Infinity" } },
          {
            ref: negativeInfinityRef,
            value: { id: "negative-infinity", name: "Negative infinity" },
          },
          { ref: bigintRef, value: { id: "bigint", name: "BigInt" } },
        ]);

        return {
          empty: yield* store.get(emptyRef),
          undefinedValue: yield* store.get(undefinedRef),
          nullValue: yield* store.get(nullRef),
          many: yield* store.get(manyRef),
          zero: yield* store.get(zeroRef),
          negativeZero: yield* store.get(negativeZeroRef),
          nan: yield* store.get(nanRef),
          infinity: yield* store.get(infinityRef),
          negativeInfinity: yield* store.get(negativeInfinityRef),
          bigint: yield* store.get(bigintRef),
          facts: yield* store.inspect(),
        };
      }),
      (_id) => Effect.fail("missing" as const),
    );

    expect(result.empty?.value?.name).toBe("Empty");
    expect(result.undefinedValue?.value?.name).toBe("Undefined");
    expect(result.nullValue?.value?.name).toBe("Null");
    expect(result.many?.value?.name).toBe("Many");
    expect(result.zero?.value?.name).toBe("Zero");
    expect(result.negativeZero?.value?.name).toBe("Negative zero");
    expect(result.nan?.value?.name).toBe("NaN");
    expect(result.infinity?.value?.name).toBe("Infinity");
    expect(result.negativeInfinity?.value?.name).toBe("Negative infinity");
    expect(result.bigint?.value?.name).toBe("BigInt");
    expect(result.facts).toHaveLength(10);
  });

  it("rejects unsupported durable key shapes without invoking user conversion hooks", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const sparse: Array<string | undefined> = [];
    sparse.length = 2;
    sparse[0] = "present";
    const accessor: Record<string, unknown> = {};
    let accessorCalled = false;
    Object.defineProperty(accessor, "danger", {
      enumerable: true,
      get: () => {
        accessorCalled = true;
        return "boom";
      },
    });
    const symbolKey = { [Symbol("secret")]: "hidden" };
    class UnsupportedKey {
      readonly id = "class-instance";
    }
    let toJsonCalled = false;
    const withToJson = {
      toJSON: () => {
        toJsonCalled = true;
        return "boom";
      },
    };

    for (const key of [
      createKey(cyclic),
      createKey(sparse),
      createKey(accessor),
      createKey(symbolKey),
      createKey(new UnsupportedKey()),
      createKey(new Date(0)),
      createKey(new Map()),
      createKey(withToJson),
    ]) {
      expect(() => assertDurableFlowKey(key)).toThrow(FlowDiagnostic);
    }

    expect(accessorCalled).toBe(false);
    expect(toJsonCalled).toBe(false);
  });

  it("keeps unsupported durable key shapes rejected after caller mutation", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const accessor: Record<string, unknown> = {};
    let accessorCalled = false;
    Object.defineProperty(accessor, "danger", {
      configurable: true,
      enumerable: true,
      get: () => {
        accessorCalled = true;
        return "boom";
      },
    });
    const sparse: Array<string | undefined> = [];
    sparse.length = 2;
    sparse[0] = "present";
    const accessorArray: Array<string | undefined> = [];
    Object.defineProperty(accessorArray, 0, {
      configurable: true,
      enumerable: true,
      get: () => {
        accessorCalled = true;
        return "boom";
      },
    });

    const cyclicKey = createKey(cyclic);
    const accessorKey = createKey(accessor);
    const sparseKey = createKey(sparse);
    const accessorArrayKey = createKey(accessorArray);
    cyclic.self = "safe";
    Object.defineProperty(accessor, "danger", {
      configurable: true,
      enumerable: true,
      value: "safe",
    });
    sparse[1] = "filled";
    Object.defineProperty(accessorArray, 0, {
      configurable: true,
      enumerable: true,
      value: "safe",
    });

    expect(() => assertDurableFlowKey(cyclicKey)).toThrow(FlowDiagnostic);
    expect(() => assertDurableFlowKey(accessorKey)).toThrow(FlowDiagnostic);
    expect(() => assertDurableFlowKey(sparseKey)).toThrow(FlowDiagnostic);
    expect(() => assertDurableFlowKey(accessorArrayKey)).toThrow(FlowDiagnostic);
    expect(accessorCalled).toBe(false);
  });

  it("keeps object-order invariant keys equal while separating descriptor identities", async () => {
    const orderResource = flow.resource<[key: FlowKey], ProjectRecord>({
      id: "key.order",
      key: (key) => key,
      lookup: () => Effect.die("unused lookup"),
    });
    const firstDescriptor = flow.resource<[], ProjectRecord>({
      id: "key.descriptor.first",
      key: () => createKey("shared"),
      lookup: () => Effect.die("unused lookup"),
    });
    const secondDescriptor = flow.resource<[], ProjectRecord>({
      id: "key.descriptor.second",
      key: () => createKey("shared"),
      lookup: () => Effect.die("unused lookup"),
    });

    const leftOrderRef = orderResource.ref(createKey({ b: 2, a: 1 }));
    const rightOrderRef = orderResource.ref(createKey({ a: 1, b: 2 }));
    const firstDescriptorRef = firstDescriptor.ref();
    const secondDescriptorRef = secondDescriptor.ref();

    const result = await runResourceStore(
      Effect.gen(function* () {
        const store = yield* ResourceStore;
        yield* store.seed([
          { ref: leftOrderRef, value: { id: "order", name: "Order invariant" } },
          { ref: firstDescriptorRef, value: { id: "first", name: "First descriptor" } },
          { ref: secondDescriptorRef, value: { id: "second", name: "Second descriptor" } },
        ]);

        return {
          rightOrder: yield* store.get(rightOrderRef),
          firstDescriptor: yield* store.get(firstDescriptorRef),
          secondDescriptor: yield* store.get(secondDescriptorRef),
          facts: yield* store.inspect(),
        };
      }),
      (_id) => Effect.fail("missing" as const),
    );

    expect(result.rightOrder?.value?.name).toBe("Order invariant");
    expect(result.firstDescriptor?.value?.name).toBe("First descriptor");
    expect(result.secondDescriptor?.value?.name).toBe("Second descriptor");
    expect(result.facts).toHaveLength(3);
  });

  it("keeps a ref identity stable when caller-owned nested key objects mutate", async () => {
    const mutableKey = { nested: { id: "before" } };
    const mutableResource = flow.resource<[], ProjectRecord>({
      id: "key.mutable",
      key: () => createKey(mutableKey),
      lookup: () => Effect.die("unused lookup"),
    });
    const ref = mutableResource.ref();

    const result = await runResourceStore(
      Effect.gen(function* () {
        const store = yield* ResourceStore;
        yield* store.seed([{ ref, value: { id: "mutable", name: "Before mutation" } }]);
        mutableKey.nested.id = "after";
        yield* store.patch(ref, (current) => ({
          ...(current ?? { id: "mutable", name: "Before mutation" }),
          name: "After mutation",
        }));

        return {
          snapshot: yield* store.get(ref),
          facts: yield* store.inspect(),
        };
      }),
      (_id) => Effect.fail("missing" as const),
    );

    expect(result.snapshot?.value?.name).toBe("After mutation");
    expect(result.facts).toHaveLength(1);
  });

  it("copies accepted durable key input before caller mutation can change ref identity", async () => {
    const mutableKey = { nested: { id: "before" } };
    const key = createKey(mutableKey);
    const keyResource = flow.resource<[key: FlowKey], ProjectRecord>({
      id: "key.copied",
      key: (refKey) => refKey,
      lookup: () => Effect.die("unused lookup"),
    });

    mutableKey.nested.id = "after";
    expect(Object.isFrozen(key[0])).toBe(true);
    expect(Object.isFrozen((key[0] as typeof mutableKey).nested)).toBe(true);
    const beforeRef = keyResource.ref(createKey({ nested: { id: "before" } }));
    const mutableRef = keyResource.ref(key);

    const result = await runResourceStore(
      Effect.gen(function* () {
        const store = yield* ResourceStore;
        yield* store.seed([{ ref: beforeRef, value: { id: "copied", name: "Copied key" } }]);

        return yield* store.get(mutableRef);
      }),
      (_id) => Effect.fail("missing" as const),
    );

    expect(result?.value?.name).toBe("Copied key");
  });

  it("rejects runtime-local keys when dehydrating durable resource payloads", async () => {
    const localResource = flow.resource<[], ProjectRecord>({
      id: "key.local",
      key: () => createKey("local", () => undefined),
      lookup: () => Effect.die("unused lookup"),
    });
    const localRef = localResource.ref();

    const result = await runResourceStoreExit(
      Effect.gen(function* () {
        const store = yield* ResourceStore;
        yield* store.seed([{ ref: localRef, value: { id: "local", name: "Local" } }]);
        return yield* store.dehydrate();
      }),
      (_id) => Effect.fail("missing" as const),
    );

    expect(result._tag).toBe("Failure");
    if (result._tag !== "Failure") {
      return;
    }

    const error = Cause.squash(result.cause);
    expect(error instanceof FlowDiagnostic).toBe(true);
    expect(error).toMatchObject({
      code: "FLOW-STORE-003",
      title: "Invalid resource key: runtime-local-value",
      debug: {
        reason: "runtime-local-value",
      },
    });
  });

  it("scopes runtime-local key identity to explicit owners", () => {
    const leftScope = createFlowKeyIdentityScope();
    const rightScope = createFlowKeyIdentityScope();
    const localObject = {};
    const localFunction = () => undefined;

    const leftObjectIdentity = leftScope.flowKeyIdentity(createKey(localObject));
    const rightObjectIdentity = rightScope.flowKeyIdentity(createKey(localObject));
    const leftFunctionIdentity = leftScope.flowKeyIdentity(createKey(localFunction));
    const rightFunctionIdentity = rightScope.flowKeyIdentity(createKey(localFunction));

    expect(leftObjectIdentity).toBe(rightObjectIdentity);
    expect(leftFunctionIdentity).toBe(rightFunctionIdentity);
    expect(leftScope.flowKeyIdentity(createKey(localObject))).toBe(leftObjectIdentity);
    expect(rightScope.flowKeyIdentity(createKey(localObject))).toBe(rightObjectIdentity);
  });

  it("returns fresh cached data from ensure, then fetches once the snapshot is stale or invalidated", async () => {
    const lookups: string[] = [];

    const result = await runResourceStore(
      Effect.gen(function* () {
        const store = yield* ResourceStore;

        yield* store.seed([{ ref: projectRef, value: { id: "project-1", name: "Seeded" } }]);

        const first = yield* store.ensure(projectRef);
        yield* TestClock.adjust("31 seconds");

        const staleBeforeRefresh = yield* store.get(projectRef);
        const invalidatedCount = yield* store.invalidate(projectTag);
        const afterInvalidate = yield* store.get(projectRef);
        const refreshed = yield* store.ensure(projectRef);

        return {
          first,
          staleBeforeRefresh,
          invalidatedCount,
          afterInvalidate,
          refreshed,
        };
      }),
      (id) =>
        Effect.sync(() => {
          lookups.push(id);
          return { id, name: "Fetched" };
        }),
    );

    expect(result.first).toEqual({ id: "project-1", name: "Seeded" });
    expect(result.staleBeforeRefresh).toMatchObject({
      status: "stale",
      freshness: "stale",
      value: { id: "project-1", name: "Seeded" },
    });
    expect(result.invalidatedCount).toBe(1);
    expect(result.afterInvalidate).toMatchObject({
      status: "stale",
      freshness: "invalidated",
      value: { id: "project-1", name: "Seeded" },
    });
    expect(result.refreshed).toEqual({ id: "project-1", name: "Fetched" });
    expect(lookups).toEqual(["project-1"]);
  });

  it("pauses an initial ensure while offline and resumes the lookup on reconnect", async () => {
    const lookups: string[] = [];
    const resumes = new Map<string, (value: ProjectRecord) => void>();

    const result = await runResourceStore(
      Effect.gen(function* () {
        const store = yield* ResourceStore;
        const signals = yield* HostSignals;

        yield* signals.setOnline(false);

        const ensureFiber = yield* store.ensure(projectRef).pipe(Effect.forkChild);
        yield* Effect.yieldNow;

        const whilePaused = yield* store.get(projectRef);
        expect(lookups).toEqual([]);

        yield* signals.setOnline(true);
        yield* Effect.yieldNow;

        const resume = resumes.get("project-1");
        if (resume === undefined) {
          throw new Error("expected paused ensure to start lookup after reconnect");
        }

        const afterReconnect = yield* store.get(projectRef);

        resume({ id: "project-1", name: "Resumed after reconnect" });
        const ensured = yield* Fiber.join(ensureFiber);
        const afterEnsure = yield* store.get(projectRef);

        return {
          whilePaused,
          afterReconnect,
          ensured,
          afterEnsure,
        };
      }),
      (id) =>
        Effect.callback<ProjectRecord, "missing">((resume) => {
          lookups.push(id);
          resumes.set(id, (value) => {
            resumes.delete(id);
            resume(Effect.succeed(value));
          });

          return Effect.sync(() => {
            resumes.delete(id);
          });
        }),
    );

    expect(result.whilePaused).toMatchObject({
      status: "success",
      availability: "value",
      activity: "paused",
      freshness: "fresh",
      value: { id: "project-1", name: "Loading project" },
      placeholder: { id: "project-1", name: "Loading project" },
      isPlaceholderData: true,
    });
    expect(result.afterReconnect).toMatchObject({
      status: "success",
      availability: "value",
      activity: "fetching",
      freshness: "fresh",
      value: { id: "project-1", name: "Loading project" },
      placeholder: { id: "project-1", name: "Loading project" },
      isPlaceholderData: true,
    });
    expect(result.ensured).toEqual({ id: "project-1", name: "Resumed after reconnect" });
    expect(result.afterEnsure).toMatchObject({
      status: "success",
      availability: "value",
      activity: "idle",
      freshness: "fresh",
      value: { id: "project-1", name: "Resumed after reconnect" },
    });
    expect(lookups).toEqual(["project-1"]);
  });

  it("keeps last good data visible while an offline refresh is paused and resumes on reconnect", async () => {
    const lookups: string[] = [];
    const resumes = new Map<string, (value: ProjectRecord) => void>();

    const result = await runResourceStore(
      Effect.gen(function* () {
        const store = yield* ResourceStore;
        const signals = yield* HostSignals;

        yield* store.seed([{ ref: projectRef, value: { id: "project-1", name: "Seeded" } }]);
        yield* signals.setOnline(false);

        const refreshFiber = yield* store.refresh(projectRef).pipe(Effect.forkChild);
        yield* Effect.yieldNow;

        const whilePaused = yield* store.get(projectRef);
        expect(lookups).toEqual([]);

        yield* signals.setOnline(true);
        yield* Effect.yieldNow;

        const resume = resumes.get("project-1");
        if (resume === undefined) {
          throw new Error("expected paused refresh to start lookup after reconnect");
        }

        const afterReconnect = yield* store.get(projectRef);

        resume({ id: "project-1", name: "Refetched after reconnect" });
        const refreshed = yield* Fiber.join(refreshFiber);
        const afterRefresh = yield* store.get(projectRef);

        return {
          whilePaused,
          afterReconnect,
          refreshed,
          afterRefresh,
        };
      }),
      (id) =>
        Effect.callback<ProjectRecord, "missing">((resume) => {
          lookups.push(id);
          resumes.set(id, (value) => {
            resumes.delete(id);
            resume(Effect.succeed(value));
          });

          return Effect.sync(() => {
            resumes.delete(id);
          });
        }),
    );

    expect(result.whilePaused).toMatchObject({
      status: "stale",
      availability: "value",
      activity: "paused",
      freshness: "stale",
      value: { id: "project-1", name: "Seeded" },
    });
    expect(result.afterReconnect).toMatchObject({
      status: "stale",
      availability: "value",
      activity: "fetching",
      freshness: "stale",
      value: { id: "project-1", name: "Seeded" },
    });
    expect(result.refreshed).toEqual({ id: "project-1", name: "Refetched after reconnect" });
    expect(result.afterRefresh).toMatchObject({
      status: "success",
      availability: "value",
      activity: "idle",
      freshness: "fresh",
      value: { id: "project-1", name: "Refetched after reconnect" },
      previousValue: { id: "project-1", name: "Seeded" },
    });
    expect(lookups).toEqual(["project-1"]);
  });

  it('schedules a refresh for actively subscribed resources when onInvalidate is "active"', async () => {
    const lookups: string[] = [];
    const resumes = new Map<string, (value: ProjectRecord) => void>();

    const result = await runResourceStore(
      Effect.gen(function* () {
        const store = yield* ResourceStore;

        yield* store.seed([{ ref: projectRef, value: { id: "project-1", name: "Seeded" } }]);

        const unsubscribe = yield* store.subscribe(projectRef, () => undefined);
        const invalidatedCount = yield* store.invalidate(projectTag);
        const duringRefresh = yield* store.get(projectRef);

        const resume = resumes.get("project-1");
        if (resume === undefined) {
          throw new Error("expected invalidate to schedule a refresh lookup");
        }

        resume({ id: "project-1", name: "Refetched" });
        yield* Effect.yieldNow;

        const afterRefresh = yield* store.get(projectRef);

        unsubscribe();

        return {
          invalidatedCount,
          duringRefresh,
          afterRefresh,
        };
      }),
      (id) =>
        Effect.callback<ProjectRecord, "missing">((resume) => {
          lookups.push(id);
          resumes.set(id, (value) => {
            resumes.delete(id);
            resume(Effect.succeed(value));
          });

          return Effect.sync(() => {
            resumes.delete(id);
          });
        }),
    );

    expect(lookups).toEqual(["project-1"]);
    expect(result.invalidatedCount).toBe(1);
    expect(result.duringRefresh).toMatchObject({
      status: "stale",
      activity: "fetching",
      freshness: "stale",
      value: { id: "project-1", name: "Seeded" },
    });
    expect(result.afterRefresh).toMatchObject({
      status: "success",
      activity: "idle",
      freshness: "fresh",
      value: { id: "project-1", name: "Refetched" },
    });
  });

  it("interrupts an active invalidation refresh when the ResourceStore scope closes", async () => {
    let interrupted = 0;
    let resolveLookup: ((value: ProjectRecord) => void) | undefined;
    let lookupStarted: (() => void) | undefined;
    const lookupStartedPromise = new Promise<void>((resolve) => {
      lookupStarted = resolve;
    });

    const result = await runResourceStore(
      Effect.gen(function* () {
        const store = yield* ResourceStore;

        yield* store.seed([{ ref: projectRef, value: { id: "project-1", name: "Seeded" } }]);

        const unsubscribe = yield* store.subscribe(projectRef, () => undefined);
        const invalidatedCount = yield* store.invalidate(projectTag);

        yield* Effect.promise(() => lookupStartedPromise);
        const duringRefresh = yield* store.get(projectRef);
        unsubscribe();

        return {
          invalidatedCount,
          duringRefresh,
        };
      }),
      (id) =>
        Effect.callback<ProjectRecord, "missing">((resume) => {
          lookupStarted?.();
          resolveLookup = (value) => {
            resume(Effect.succeed(value));
          };

          return Effect.sync(() => {
            interrupted += 1;
          });
        }).pipe(
          Effect.map((project) => ({
            ...project,
            id,
          })),
        ),
    );

    expect(result.invalidatedCount).toBe(1);
    expect(result.duringRefresh).toMatchObject({
      status: "stale",
      activity: "fetching",
      freshness: "stale",
      value: { id: "project-1", name: "Seeded" },
    });
    expect(interrupted).toBe(1);

    resolveLookup?.({ id: "project-1", name: "late result" });
    await Promise.resolve();
    expect(interrupted).toBe(1);
  });

  it("queues a follow-up refresh when active invalidation lands during an in-flight lookup", async () => {
    const lookups: string[] = [];
    const resumes: Array<(value: ProjectRecord) => void> = [];

    const result = await runResourceStore(
      Effect.gen(function* () {
        const store = yield* ResourceStore;

        yield* store.seed([{ ref: projectRef, value: { id: "project-1", name: "Seeded" } }]);

        const refreshFiber = yield* store.refresh(projectRef).pipe(Effect.forkChild);
        const unsubscribe = yield* store.subscribe(projectRef, () => undefined);

        yield* Effect.yieldNow;

        const firstResume = resumes.shift();
        if (firstResume === undefined) {
          throw new Error("expected the first refresh lookup to start");
        }

        const invalidatedCount = yield* store.invalidate(projectTag);
        const afterInvalidate = yield* store.get(projectRef);

        firstResume({ id: "project-1", name: "First result" });
        yield* Effect.yieldNow;

        const duringFollowUp = yield* store.get(projectRef);
        const secondResume = resumes.shift();
        if (secondResume === undefined) {
          throw new Error("expected active invalidation to queue a follow-up refresh");
        }

        secondResume({ id: "project-1", name: "Second result" });

        const refreshed = yield* Fiber.join(refreshFiber);
        const afterRefresh = yield* store.get(projectRef);

        unsubscribe();

        return {
          invalidatedCount,
          afterInvalidate,
          duringFollowUp,
          refreshed,
          afterRefresh,
        };
      }),
      (id) =>
        Effect.callback<ProjectRecord, "missing">((resume) => {
          lookups.push(id);
          resumes.push((value) => {
            resume(Effect.succeed(value));
          });

          return Effect.void;
        }),
    );

    expect(result.invalidatedCount).toBe(1);
    expect(result.afterInvalidate).toMatchObject({
      status: "stale",
      activity: "fetching",
      freshness: "invalidated",
      value: { id: "project-1", name: "Seeded" },
    });
    expect(result.duringFollowUp).toMatchObject({
      status: "stale",
      activity: "fetching",
      freshness: "stale",
      value: { id: "project-1", name: "First result" },
    });
    expect(result.refreshed).toEqual({ id: "project-1", name: "Second result" });
    expect(result.afterRefresh).toMatchObject({
      status: "success",
      activity: "idle",
      freshness: "fresh",
      value: { id: "project-1", name: "Second result" },
      previousValue: { id: "project-1", name: "First result" },
    });
    expect(lookups).toEqual(["project-1", "project-1"]);
  });

  it("does not schedule a refresh without an active subscription", async () => {
    const lookups: string[] = [];

    const result = await runResourceStore(
      Effect.gen(function* () {
        const store = yield* ResourceStore;

        yield* store.seed([{ ref: projectRef, value: { id: "project-1", name: "Seeded" } }]);

        const invalidatedCount = yield* store.invalidate(projectTag);
        const afterInvalidate = yield* store.get(projectRef);

        return {
          invalidatedCount,
          afterInvalidate,
        };
      }),
      (id) =>
        Effect.sync(() => {
          lookups.push(id);
          return { id, name: "Fetched" };
        }),
    );

    expect(lookups).toEqual([]);
    expect(result.invalidatedCount).toBe(1);
    expect(result.afterInvalidate).toMatchObject({
      status: "stale",
      activity: "idle",
      freshness: "invalidated",
      value: { id: "project-1", name: "Seeded" },
    });
  });

  it("keeps a settled lookup invalidated until next demand when invalidation lands mid-flight without active observers", async () => {
    const lookups: string[] = [];
    const resumes: Array<(value: ProjectRecord) => void> = [];

    const result = await runResourceStore(
      Effect.gen(function* () {
        const store = yield* ResourceStore;

        yield* store.seed([{ ref: projectRef, value: { id: "project-1", name: "Seeded" } }]);

        const refreshFiber = yield* store.refresh(projectRef).pipe(Effect.forkChild);
        yield* Effect.yieldNow;

        const firstResume = resumes.shift();
        if (firstResume === undefined) {
          throw new Error("expected the first refresh lookup to start");
        }

        const invalidatedCount = yield* store.invalidate(projectTag);
        const afterInvalidate = yield* store.get(projectRef);

        firstResume({ id: "project-1", name: "Fetched during invalidation" });

        const refreshed = yield* Fiber.join(refreshFiber);
        const afterRefresh = yield* store.get(projectRef);

        return {
          invalidatedCount,
          afterInvalidate,
          refreshed,
          afterRefresh,
        };
      }),
      (id) =>
        Effect.callback<ProjectRecord, "missing">((resume) => {
          lookups.push(id);
          resumes.push((value) => {
            resume(Effect.succeed(value));
          });

          return Effect.void;
        }),
    );

    expect(result.invalidatedCount).toBe(1);
    expect(result.afterInvalidate).toMatchObject({
      status: "stale",
      activity: "fetching",
      freshness: "invalidated",
      value: { id: "project-1", name: "Seeded" },
    });
    expect(result.refreshed).toEqual({ id: "project-1", name: "Fetched during invalidation" });
    expect(result.afterRefresh).toMatchObject({
      status: "stale",
      activity: "idle",
      freshness: "invalidated",
      value: { id: "project-1", name: "Fetched during invalidation" },
      previousValue: { id: "project-1", name: "Seeded" },
    });
    expect(lookups).toEqual(["project-1"]);
  });

  it('keeps active invalidation lazy until the next ensure when onInvalidate is "lazy"', async () => {
    const lookups: string[] = [];

    const result = await runResourceStore(
      Effect.gen(function* () {
        const store = yield* ResourceStore;

        yield* store.seed([{ ref: lazyProjectRef, value: { id: "project-1", name: "Seeded" } }]);

        const unsubscribe = yield* store.subscribe(lazyProjectRef, () => undefined);
        const invalidatedCount = yield* store.invalidate(projectTag);
        const afterInvalidate = yield* store.get(lazyProjectRef);
        const ensured = yield* store.ensure(lazyProjectRef);
        const afterEnsure = yield* store.get(lazyProjectRef);

        unsubscribe();

        return {
          invalidatedCount,
          afterInvalidate,
          ensured,
          afterEnsure,
        };
      }),
      (id) =>
        Effect.sync(() => {
          lookups.push(id);
          return { id, name: "Fetched lazily" };
        }),
    );

    expect(result.invalidatedCount).toBe(1);
    expect(result.afterInvalidate).toMatchObject({
      status: "stale",
      activity: "idle",
      freshness: "invalidated",
      value: { id: "project-1", name: "Seeded" },
    });
    expect(result.ensured).toEqual({ id: "project-1", name: "Fetched lazily" });
    expect(result.afterEnsure).toMatchObject({
      status: "success",
      freshness: "fresh",
      value: { id: "project-1", name: "Fetched lazily" },
    });
    expect(lookups).toEqual(["project-1"]);
  });

  it('requires an explicit refresh after invalidation when onInvalidate is "never"', async () => {
    const lookups: string[] = [];

    const result = await runResourceStore(
      Effect.gen(function* () {
        const store = yield* ResourceStore;

        yield* store.seed([{ ref: neverProjectRef, value: { id: "project-1", name: "Seeded" } }]);

        const unsubscribe = yield* store.subscribe(neverProjectRef, () => undefined);
        const invalidatedCount = yield* store.invalidate(projectTag);
        const afterInvalidate = yield* store.get(neverProjectRef);
        const ensured = yield* store.ensure(neverProjectRef);
        const afterEnsure = yield* store.get(neverProjectRef);
        const refreshed = yield* store.refresh(neverProjectRef);
        const afterRefresh = yield* store.get(neverProjectRef);

        unsubscribe();

        return {
          invalidatedCount,
          afterInvalidate,
          ensured,
          afterEnsure,
          refreshed,
          afterRefresh,
        };
      }),
      (id) =>
        Effect.sync(() => {
          lookups.push(id);
          return { id, name: "Fetched explicitly" };
        }),
    );

    expect(result.invalidatedCount).toBe(1);
    expect(result.afterInvalidate).toMatchObject({
      status: "stale",
      activity: "idle",
      freshness: "invalidated",
      value: { id: "project-1", name: "Seeded" },
    });
    expect(result.ensured).toEqual({ id: "project-1", name: "Seeded" });
    expect(result.afterEnsure).toMatchObject({
      status: "stale",
      activity: "idle",
      freshness: "invalidated",
      value: { id: "project-1", name: "Seeded" },
    });
    expect(result.refreshed).toEqual({ id: "project-1", name: "Fetched explicitly" });
    expect(result.afterRefresh).toMatchObject({
      status: "success",
      freshness: "fresh",
      value: { id: "project-1", name: "Fetched explicitly" },
    });
    expect(lookups).toEqual(["project-1"]);
  });

  it("emits a deterministic snapshot trace for active invalidation refresh success", async () => {
    const lookups: string[] = [];
    const traces: Array<ReturnType<typeof snapshotTrace>> = [];
    const resumes = new Map<string, (value: ProjectRecord) => void>();

    await runResourceStore(
      Effect.gen(function* () {
        const store = yield* ResourceStore;

        const unsubscribe = yield* store.subscribe(projectRef, (snapshot) => {
          traces.push(snapshotTrace(snapshot));
        });

        yield* store.seed([{ ref: projectRef, value: { id: "project-1", name: "Seeded" } }]);
        yield* store.invalidate(projectTag);

        const resume = resumes.get("project-1");
        if (resume === undefined) {
          throw new Error("expected active invalidation to start a refresh");
        }

        resume({ id: "project-1", name: "Refetched" });
        yield* Effect.yieldNow;

        unsubscribe();
      }),
      (id) =>
        Effect.callback<ProjectRecord, "missing">((resume) => {
          lookups.push(id);
          resumes.set(id, (value) => {
            resumes.delete(id);
            resume(Effect.succeed(value));
          });

          return Effect.sync(() => {
            resumes.delete(id);
          });
        }),
    );

    expect(lookups).toEqual(["project-1"]);
    expect(traces).toEqual([
      {
        status: "success",
        availability: "value",
        activity: "idle",
        freshness: "fresh",
        value: "Seeded",
        previousValue: undefined,
        error: undefined,
      },
      {
        status: "stale",
        availability: "value",
        activity: "idle",
        freshness: "invalidated",
        value: "Seeded",
        previousValue: undefined,
        error: undefined,
      },
      {
        status: "stale",
        availability: "value",
        activity: "fetching",
        freshness: "stale",
        value: "Seeded",
        previousValue: undefined,
        error: undefined,
      },
      {
        status: "success",
        availability: "value",
        activity: "idle",
        freshness: "fresh",
        value: "Refetched",
        previousValue: "Seeded",
        error: undefined,
      },
    ]);
  });

  it("emits a deterministic snapshot trace for refresh failure", async () => {
    const traces: Array<ReturnType<typeof snapshotTrace>> = [];

    await runResourceStoreExit(
      Effect.gen(function* () {
        const store = yield* ResourceStore;

        const unsubscribe = yield* store.subscribe(projectRef, (snapshot) => {
          traces.push(snapshotTrace(snapshot));
        });

        yield* store.seed([{ ref: projectRef, value: { id: "project-1", name: "Seeded" } }]);
        yield* Effect.exit(store.refresh(projectRef));

        unsubscribe();
      }),
      (_id) => Effect.fail("missing" as const),
    );

    expect(traces).toEqual([
      {
        status: "success",
        availability: "value",
        activity: "idle",
        freshness: "fresh",
        value: "Seeded",
        previousValue: undefined,
        error: undefined,
      },
      {
        status: "stale",
        availability: "value",
        activity: "fetching",
        freshness: "stale",
        value: "Seeded",
        previousValue: undefined,
        error: undefined,
      },
      {
        status: "stale",
        availability: "value",
        activity: "idle",
        freshness: "stale",
        value: "Seeded",
        previousValue: "Seeded",
        error: "missing",
      },
    ]);
  });

  it("reports a store diagnostic when a resource ref is missing runtime details", async () => {
    const invalidRef = {
      kind: "resourceRef" as const,
      id: "project.malformed",
      key: createKey("project", "malformed"),
      params: ["malformed"],
    };

    const result = await runResourceStoreExit(
      Effect.flatMap(ResourceStore, (store) => store.ensure(invalidRef as typeof projectRef)),
      (_id) => Effect.fail("missing" as const),
    );

    expect(result._tag).toBe("Failure");
    if (result._tag !== "Failure") {
      return;
    }

    const error = Cause.squash(result.cause);
    expect(error instanceof FlowDiagnostic).toBe(true);
    expect(error).toMatchObject({
      code: "FLOW-STORE-001",
      title: "Missing resource runtime details for project.malformed",
      debug: {
        refId: "project.malformed",
      },
    });
  });

  it("rejects forged refs before seed or patch can attach records", async () => {
    const invalidRef = {
      kind: "resourceRef" as const,
      id: "project.forged",
      key: createKey("project", "forged"),
      params: ["forged"],
    } as typeof projectRef;

    const result = await runResourceStore(
      Effect.gen(function* () {
        const store = yield* ResourceStore;
        const seedExit = yield* Effect.exit(
          store.seed([{ ref: invalidRef, value: { id: "forged", name: "Seeded" } }]),
        );
        const patchExit = yield* Effect.exit(
          store.patch(invalidRef, () => ({ id: "forged", name: "Patched" })),
        );

        return {
          seedExit,
          patchExit,
          records: yield* store.inspect(),
        };
      }),
      (_id) => Effect.fail("missing" as const),
    );

    for (const exit of [result.seedExit, result.patchExit]) {
      expect(exit._tag).toBe("Failure");
      if (exit._tag === "Failure") {
        expect(Cause.squash(exit.cause)).toMatchObject({
          code: "FLOW-STORE-001",
          debug: {
            refId: "project.forged",
          },
        });
      }
    }
    expect(result.records).toEqual([]);
  });

  it("rejects serialized ref copies through public hydrate before they attach records", async () => {
    const copiedRef = JSON.parse(JSON.stringify(projectRef)) as typeof projectRef;

    const result = await runResourceStore(
      Effect.gen(function* () {
        const store = yield* ResourceStore;
        const hydrateExit = yield* Effect.exit(
          store.hydrate([
            {
              ref: copiedRef,
              snapshot: {
                value: { id: "project-1", name: "Copied" },
                updatedAt: 1,
              },
            },
          ]),
        );

        return {
          hydrateExit,
          records: yield* store.inspect(),
        };
      }),
      (_id) => Effect.fail("missing" as const),
    );

    expect(result.hydrateExit._tag).toBe("Failure");
    if (result.hydrateExit._tag === "Failure") {
      expect(Cause.squash(result.hydrateExit.cause)).toMatchObject({
        code: "FLOW-STORE-001",
        debug: {
          refId: "project.byId",
        },
      });
    }
    expect(result.records).toEqual([]);
  });

  it("keeps previous successful data visible on refresh failure and only hydrates newer snapshots", async () => {
    const result = await runResourceStoreExit(
      Effect.gen(function* () {
        const store = yield* ResourceStore;

        yield* store.seed([{ ref: projectRef, value: { id: "project-1", name: "Seeded" } }]);

        yield* store.hydrate([
          {
            ref: projectRef,
            snapshot: {
              id: "project.byId",
              status: "success",
              availability: "value",
              activity: "idle",
              freshness: "fresh",
              value: { id: "project-1", name: "Hydrated newer" },
              updatedAt: 10,
            },
          },
          {
            ref: projectRef,
            snapshot: {
              id: "project.byId",
              status: "success",
              availability: "value",
              activity: "idle",
              freshness: "fresh",
              value: { id: "project-1", name: "Hydrated older" },
              updatedAt: 0,
            },
          },
          {
            ref: projectRef,
            snapshot: {
              id: "project.byId",
              status: "success",
              availability: "value",
              activity: "idle",
              freshness: "fresh",
              value: { id: "project-1", name: "Ignored invalid" },
              updatedAt: "broken" as never,
            },
          },
        ]);

        const beforeFailure = yield* store.get(projectRef);
        const refresh = yield* Effect.exit(store.refresh(projectRef));
        const afterFailure = yield* store.get(projectRef);

        return {
          beforeFailure,
          refresh,
          afterFailure,
        };
      }),
      (_id) => Effect.fail("missing" as const),
    );

    expect(result._tag).toBe("Success");
    if (result._tag !== "Success") {
      return;
    }

    expect(result.value.beforeFailure).toMatchObject({
      value: { id: "project-1", name: "Hydrated newer" },
      updatedAt: 10,
    });
    expect(result.value.refresh).toMatchObject({
      _tag: "Failure",
    });
    expect(result.value.afterFailure).toMatchObject({
      status: "stale",
      activity: "idle",
      freshness: "stale",
      value: { id: "project-1", name: "Hydrated newer" },
      previousValue: { id: "project-1", name: "Hydrated newer" },
      error: "missing",
    });
  });

  it("hydrates cache snapshot axes without triggering lookups and keeps older cache entries out", async () => {
    const lookups: string[] = [];

    const result = await runResourceStore(
      Effect.gen(function* () {
        const store = yield* ResourceStore;

        yield* store.seed([{ ref: projectRef, value: { id: "project-1", name: "Seeded" } }]);

        yield* store.hydrate([
          {
            ref: projectRef,
            snapshot: {
              id: "project.byId",
              status: "stale",
              availability: "value",
              activity: "idle",
              freshness: "invalidated",
              value: { id: "project-1", name: "Hydrated newest" },
              previousValue: { id: "project-1", name: "Seeded" },
              error: "missing",
              updatedAt: 25,
              invalidatedAt: 30,
              expiresAt: 55,
              requestId: "rehydrated-request",
            },
          },
          {
            ref: projectRef,
            snapshot: {
              id: "project.byId",
              status: "success",
              availability: "value",
              activity: "idle",
              freshness: "fresh",
              value: { id: "project-1", name: "Hydrated older" },
              updatedAt: 20,
            },
          },
        ]);

        return yield* store.get(projectRef);
      }),
      (id) => {
        lookups.push(id);
        return Effect.fail("missing" as const);
      },
    );

    expect(result).toMatchObject({
      status: "stale",
      availability: "value",
      activity: "idle",
      freshness: "invalidated",
      value: { id: "project-1", name: "Hydrated newest" },
      previousValue: { id: "project-1", name: "Seeded" },
      error: "missing",
      updatedAt: 25,
      invalidatedAt: 30,
      expiresAt: 55,
      requestId: "rehydrated-request",
      isPlaceholderData: false,
    });
    expect(lookups).toEqual([]);
  });

  it("restores a prevalidated immutable internal resource record without decoding snapshots", async () => {
    const restored = frozenResourceRecord(projectRef, {
      value: Option.some({ id: "project-1", name: "Internally restored" }),
      updatedAt: Option.some(25),
      expiresAt: Option.some(55),
      requestId: Option.some("internal-restore"),
      revision: 3,
      latestRequest: 2,
      tags: [projectTag],
    });

    const result = await runResourceStore(
      Effect.gen(function* () {
        const store = yield* ResourceStore;

        yield* store.restorePrevalidated([restoreEntry(restored)]);

        return yield* store.get(projectRef);
      }),
      (_id) => Effect.fail("missing" as const),
    );

    expect(result).toMatchObject({
      status: "success",
      availability: "value",
      activity: "idle",
      freshness: "fresh",
      value: { id: "project-1", name: "Internally restored" },
      updatedAt: 25,
      expiresAt: 55,
      requestId: "internal-restore",
      isPlaceholderData: false,
    });
  });

  it("rejects wrong target, runtime, and schema attachments before mutating records", async () => {
    const schema = { kind: "project-schema", version: 1 } as const;
    const wrongSchema = { kind: "project-schema", version: 2 } as const;
    const schemaResource = flow.resource<[projectId: string], ProjectRecord>({
      id: "project.schemaById",
      key: (projectId) => createKey("project", "schema", projectId),
      schema,
      lookup: () => Effect.die("unused lookup"),
    });
    const schemaRef = schemaResource.ref("project-1");
    const invalidRef = {
      kind: "resourceRef" as const,
      id: "project.detached",
      key: createKey("project", "detached"),
      params: ["project-1"] as const,
    } as FlowResourceRef<string, ReadonlyArray<unknown>, ProjectRecord>;
    const cases = [
      {
        name: "wrong-ref",
        entry: restoreEntry(
          frozenResourceRecord(secondaryProjectRef, {
            value: Option.some({ id: "project-2", name: "Wrong target" }),
          }),
          { ref: projectRef },
        ),
        reason: "record-target-ref-mismatch",
      },
      {
        name: "wrong-runtime",
        entry: restoreEntry(
          frozenResourceRecord(invalidRef, {
            value: Option.some({ id: "detached", name: "Detached" }),
          }),
        ),
        reason: "missing-runtime-definition",
      },
      {
        name: "wrong-schema",
        entry: restoreEntry(
          frozenResourceRecord(schemaRef, {
            value: Option.some({ id: "project-1", name: "Schema mismatch" }),
          }),
          { ref: schemaRef, schema: wrongSchema },
        ),
        reason: "schema-mismatch",
      },
    ] as const;

    for (const restoreCase of cases) {
      const result = await runResourceStoreExit(
        Effect.flatMap(ResourceStore, (store) => store.restorePrevalidated([restoreCase.entry])),
        (_id) => Effect.fail("missing" as const),
      );

      expect(result._tag).toBe("Failure");
      if (result._tag !== "Failure") {
        continue;
      }

      const error = Cause.squash(result.cause);
      expect(error instanceof FlowDiagnostic).toBe(true);
      expect(error).toMatchObject({
        code: "FLOW-STORE-005",
        debug: {
          reason: restoreCase.reason,
        },
      });
    }
  });

  it("leaves records, revisions, and notifications untouched when one internal restore entry is bad", async () => {
    const valid = frozenResourceRecord(secondaryProjectRef, {
      value: Option.some({ id: "project-2", name: "Should not attach" }),
      updatedAt: Option.some(30),
      revision: 1,
    });
    const badRef = {
      kind: "resourceRef" as const,
      id: "project.bad",
      key: createKey("project", "bad"),
      params: ["bad"] as const,
    } as FlowResourceRef<string, ReadonlyArray<unknown>, ProjectRecord>;
    const bad = frozenResourceRecord(badRef, {
      value: Option.some({ id: "bad", name: "Bad" }),
      updatedAt: Option.some(30),
      revision: 1,
    });

    const result = await runResourceStoreExit(
      Effect.gen(function* () {
        const store = yield* ResourceStore;

        yield* store.seed([{ ref: projectRef, value: { id: "project-1", name: "Seeded" } }]);
        const before = yield* store.get(projectRef);
        const notifications: Array<FlowResourceSnapshot<ProjectRecord>> = [];
        const unsubscribe = yield* store.subscribe(projectRef, (snapshot) => {
          notifications.push(snapshot);
        });

        const restore = yield* Effect.exit(
          store.restorePrevalidated([restoreEntry(valid), restoreEntry(bad)]),
        );
        const after = yield* store.get(projectRef);
        const secondary = yield* store.get(secondaryProjectRef);
        const facts = yield* store.inspect();
        unsubscribe();

        return {
          restore,
          before,
          after,
          secondary,
          facts,
          notifications,
        };
      }),
      (_id) => Effect.fail("missing" as const),
    );

    expect(result._tag).toBe("Success");
    if (result._tag !== "Success") {
      return;
    }

    expect(result.value.restore).toMatchObject({
      _tag: "Failure",
    });
    expect(result.value.after).toEqual(result.value.before);
    expect(result.value.secondary).toMatchObject({
      isPlaceholderData: true,
      value: { id: "project-2", name: "Loading project" },
    });
    expect(result.value.facts).toHaveLength(1);
    expect(result.value.notifications).toEqual([]);
  });

  it("preserves present undefined as a restored value instead of falling back to placeholder semantics", async () => {
    const restoredUndefined = frozenResourceRecord(optionalProjectRef, {
      value: Option.some(undefined),
      previousValue: Option.some({ id: "project-1", name: "Previous" }),
      updatedAt: Option.some(40),
      revision: 1,
    });

    const result = await runResourceStore(
      Effect.gen(function* () {
        const store = yield* ResourceStore;

        yield* store.restorePrevalidated([restoreEntry(restoredUndefined)]);

        return {
          snapshot: yield* store.get(optionalProjectRef),
          dehydrated: yield* store.dehydrate(),
        };
      }),
      (id) => Effect.succeed({ id, name: "unused" }),
    );

    expect(result.snapshot).toMatchObject({
      status: "success",
      availability: "value",
      activity: "idle",
      freshness: "fresh",
      value: undefined,
      previousValue: { id: "project-1", name: "Previous" },
      updatedAt: 40,
      isPlaceholderData: false,
    });
    expect(Object.prototype.hasOwnProperty.call(result.snapshot, "value")).toBe(true);
    expect(result.snapshot?.value).toBeUndefined();
    expect(result.dehydrated[0]?.snapshot).toMatchObject({
      availability: "value",
      status: "success",
      value: undefined,
    });
    expect(Object.prototype.hasOwnProperty.call(result.dehydrated[0]?.snapshot, "value")).toBe(
      true,
    );
    expect(result.dehydrated[0]?.snapshot.value).toBeUndefined();

    const hydrated = await runResourceStore(
      Effect.gen(function* () {
        const store = yield* ResourceStore;
        yield* store.hydrate(result.dehydrated);
        return yield* store.get(optionalProjectRef);
      }),
      (id) => Effect.succeed({ id, name: "unused" }),
    );

    expect(hydrated).toMatchObject({
      availability: "value",
      status: "success",
      value: undefined,
      isPlaceholderData: false,
    });
    expect(Object.prototype.hasOwnProperty.call(hydrated, "value")).toBe(true);
    expect(hydrated?.value).toBeUndefined();
  });

  it("reuses a fresh present undefined value instead of refetching it", async () => {
    const restoredUndefined = frozenResourceRecord(optionalProjectRef, {
      value: Option.some(undefined),
      updatedAt: Option.some(40),
      revision: 1,
    });
    const lookups: string[] = [];

    const result = await runResourceStoreExit(
      Effect.gen(function* () {
        const store = yield* ResourceStore;
        yield* store.restorePrevalidated([restoreEntry(restoredUndefined)]);
        return yield* store.ensure(optionalProjectRef);
      }),
      (id) => {
        lookups.push(id);
        return Effect.fail("missing" as const);
      },
    );

    expect(result._tag).toBe("Success");
    if (result._tag === "Success") {
      expect(result.value).toBeUndefined();
    }
    expect(lookups).toEqual([]);
  });

  it("joins concurrent ensure calls for the same ref into one lookup", async () => {
    const lookups: string[] = [];
    const resumes = new Map<string, (value: ProjectRecord) => void>();

    const result = await runResourceStore(
      Effect.gen(function* () {
        const store = yield* ResourceStore;

        const pending = yield* Effect.all([store.ensure(projectRef), store.ensure(projectRef)], {
          concurrency: "unbounded",
        }).pipe(Effect.forkChild);

        yield* Effect.yieldNow;

        const resume = resumes.get("project-1");
        if (resume === undefined) {
          throw new Error("expected ensure to start a lookup");
        }

        resume({ id: "project-1", name: "Joined ensure" });

        return yield* Fiber.join(pending);
      }),
      (id) =>
        Effect.callback<ProjectRecord, "missing">((resume) => {
          lookups.push(id);
          resumes.set(id, (value) => {
            resumes.delete(id);
            resume(Effect.succeed(value));
          });

          return Effect.sync(() => {
            resumes.delete(id);
          });
        }),
    );

    expect(result).toEqual([
      { id: "project-1", name: "Joined ensure" },
      { id: "project-1", name: "Joined ensure" },
    ]);
    expect(lookups).toEqual(["project-1"]);
  });

  it("joins concurrent refresh calls for the same ref into one lookup", async () => {
    const lookups: string[] = [];
    const resumes = new Map<string, (value: ProjectRecord) => void>();

    const result = await runResourceStore(
      Effect.gen(function* () {
        const store = yield* ResourceStore;

        yield* store.seed([{ ref: projectRef, value: { id: "project-1", name: "Seeded" } }]);

        const pending = yield* Effect.all([store.refresh(projectRef), store.refresh(projectRef)], {
          concurrency: "unbounded",
        }).pipe(Effect.forkChild);

        yield* Effect.yieldNow;

        const resume = resumes.get("project-1");
        if (resume === undefined) {
          throw new Error("expected refresh to start a lookup");
        }

        resume({ id: "project-1", name: "Joined refresh" });

        return yield* Fiber.join(pending);
      }),
      (id) =>
        Effect.callback<ProjectRecord, "missing">((resume) => {
          lookups.push(id);
          resumes.set(id, (value) => {
            resumes.delete(id);
            resume(Effect.succeed(value));
          });

          return Effect.sync(() => {
            resumes.delete(id);
          });
        }),
    );

    expect(result).toEqual([
      { id: "project-1", name: "Joined refresh" },
      { id: "project-1", name: "Joined refresh" },
    ]);
    expect(lookups).toEqual(["project-1"]);
  });
});
