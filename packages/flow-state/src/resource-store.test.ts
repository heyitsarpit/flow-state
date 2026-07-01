import { Cause, Context, Effect, Fiber, Layer, Option } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, it } from "vite-plus/test";

import { FlowDiagnostic } from "./diagnostics.js";
import { flow } from "./public/flow-core.js";
import { createKey, createTag } from "./core/api/keys.js";
import type { FlowResourceSnapshot } from "./public/types.js";
import { NotificationScheduler } from "./services/notification-scheduler.js";
import { HostSignals } from "./services/host-signals.js";
import { ResourceStore } from "./services/resource-store.js";
import { FlowRuntimePolicy } from "./services/runtime-policy.js";
import { batchNotifications } from "./store/notification-batch.js";
import { selectSource } from "./store/selected-source.js";
import { createSelectionSource } from "./store/selection-source.js";

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

describe("resource store and selection source contracts", () => {
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

    batchNotifications(() => {
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
