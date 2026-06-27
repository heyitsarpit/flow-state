import { Context, Effect, Layer, Option } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, it } from "vite-plus/test";

import { flow } from "./public/flow.js";
import { createKey, createTag } from "./public/keys.js";
import { NotificationScheduler } from "./services/notification-scheduler.js";
import { ResourceStore } from "./services/resource-store.js";
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

const notificationSchedulerLayer = NotificationScheduler.testLayer;
const resourceStoreLayer = Layer.mergeAll(
  notificationSchedulerLayer,
  ResourceStore.layer.pipe(Layer.provide(notificationSchedulerLayer)),
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

describe("Phase 2 resource store contract", () => {
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
});
