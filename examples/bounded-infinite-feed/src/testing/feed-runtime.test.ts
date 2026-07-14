import { Deferred, Effect, Layer } from "effect";
import { describe, expect, it } from "vite-plus/test";

import * as flow from "flow-state";
import { selectView } from "flow-state";
import { graphOf, whyNoTransition } from "flow-state/inspect";
import { runFlowScenario, test } from "flow-state/testing";

import { FeedApp } from "../app/app";
import { feedStories } from "../app/behavior";
import { createFeedTestRuntime } from "../app/runtime";
import { ProjectPageUnavailable } from "../domain/projects";
import type { ProjectPage } from "../domain/projects";
import { feedMachine } from "../features/feed/machine";
import { projectPageResource } from "../features/feed/resources";
import { feedView } from "../features/feed/view";
import { projectPageFixture, ProjectFeedLive } from "../services/layers";
import { ProjectFeedService } from "../services/project-feed-service";
import type { ProjectFeedServiceShape } from "../services/project-feed-service";

function runtimeWith(service: ProjectFeedServiceShape) {
  const serviceLayer = Layer.succeed(ProjectFeedService, ProjectFeedService.of(service));
  return flow.runtime(
    FeedApp.layer<readonly [typeof serviceLayer]>({
      store: flow.store.test(),
      orchestrators: flow.orchestrators.test(),
      services: [serviceLayer],
    }),
  );
}

describe("bounded infinite feed", () => {
  it("traverses both directions, deduplicates projects, and stops at boundary cursors", async () => {
    const runtime = createFeedTestRuntime();
    const actor = runtime.orchestrators.start(feedMachine);
    try {
      await actor.flush();
      actor.send({ type: "NEXT" });
      await actor.flush();
      const overlapping = selectView(actor.snapshot(), feedView);
      expect(overlapping.cursors).toEqual([0, 4]);
      expect(overlapping.projects).toHaveLength(7);

      for (let index = 0; index < 4; index += 1) {
        actor.send({ type: "NEXT" });
        await actor.flush();
      }
      expect(actor.snapshot()).toMatchObject({ value: "plus-20", context: { frontier: 20 } });
      expect(selectView(actor.snapshot(), feedView).cursors).toEqual([12, 16, 20]);
      expect(flow.can(actor.snapshot(), { type: "NEXT" })).toBe(false);
      expect(whyNoTransition(feedMachine, actor.snapshot(), { type: "NEXT" })).toMatchObject({
        reason: "blocked-by-guard",
        guardFailures: [0],
      });

      actor.send({ type: "PREVIOUS" });
      await actor.flush();
      expect(actor.snapshot()).toMatchObject({ value: "plus-16", context: { frontier: 16 } });
      expect(selectView(actor.snapshot(), feedView).cursors).toEqual([8, 12, 16]);
    } finally {
      await runtime.dispose();
    }
  });

  it("keeps cached data visible during background refresh and replaces it on completion", async () => {
    const refreshStarted = Effect.runSync(Deferred.make<void>());
    const refreshGate = Effect.runSync(Deferred.make<ProjectPage>());
    let calls = 0;
    const runtime = runtimeWith(
      ProjectFeedService.of({
        page: (cursor) => {
          calls += 1;
          return calls === 1
            ? Effect.succeed(projectPageFixture(cursor))
            : Deferred.succeed(refreshStarted, undefined).pipe(
                Effect.andThen(Deferred.await(refreshGate)),
              );
        },
      }),
    );
    const actor = runtime.orchestrators.start(feedMachine);
    try {
      await actor.flush();
      actor.send({ type: "REFRESH" });
      await Effect.runPromise(Deferred.await(refreshStarted));
      const refreshing = runtime.resources.get(projectPageResource.ref(0));
      expect(refreshing).toMatchObject({
        status: "stale",
        activity: "fetching",
      });
      expect(refreshing?.value?.projects[0]?.revision).toBe(1);

      Effect.runSync(Deferred.succeed(refreshGate, projectPageFixture(0, 2)));
      await actor.flush();
      const refreshed = runtime.resources.get(projectPageResource.ref(0));
      expect(refreshed).toMatchObject({
        status: "success",
      });
      expect(refreshed?.value?.projects[0]?.revision).toBe(2);
    } finally {
      await runtime.dispose();
    }
  });

  it("publishes a typed page failure and retries the same cursor", async () => {
    let cursorFourCalls = 0;
    const runtime = runtimeWith(
      ProjectFeedService.of({
        page: (cursor) => {
          if (cursor !== 4) return Effect.succeed(projectPageFixture(cursor));
          cursorFourCalls += 1;
          return cursorFourCalls === 1
            ? Effect.fail(
                new ProjectPageUnavailable({ cursor, message: "controlled page failure" }),
              )
            : Effect.succeed(projectPageFixture(cursor));
        },
      }),
    );
    const actor = runtime.orchestrators.start(feedMachine);
    try {
      await actor.flush();
      actor.send({ type: "NEXT" });
      await actor.flush();
      expect(runtime.resources.get(projectPageResource.ref(4))).toMatchObject({
        status: "failure",
        error: { _tag: "ProjectPageUnavailable", cursor: 4 },
      });

      actor.send({ type: "RETRY" });
      await actor.flush();
      expect(runtime.resources.get(projectPageResource.ref(4))).toMatchObject({
        status: "success",
      });
    } finally {
      await runtime.dispose();
    }
  });

  it("rejects a late completion after its cursor leaves the visible window", async () => {
    const evictedStarted = Effect.runSync(Deferred.make<void>());
    const evictedGate = Effect.runSync(Deferred.make<ProjectPage>());
    const runtime = runtimeWith(
      ProjectFeedService.of({
        page: (cursor) =>
          cursor === 0
            ? Deferred.succeed(evictedStarted, undefined).pipe(
                Effect.andThen(Deferred.await(evictedGate)),
              )
            : Effect.succeed(projectPageFixture(cursor)),
      }),
    );
    const actor = runtime.orchestrators.start(feedMachine);
    try {
      await Effect.runPromise(Deferred.await(evictedStarted));
      actor.send({ type: "NEXT" });
      actor.send({ type: "NEXT" });
      actor.send({ type: "NEXT" });
      await actor.flush();
      expect(selectView(actor.snapshot(), feedView).cursors).toEqual([4, 8, 12]);

      Effect.runSync(Deferred.succeed(evictedGate, projectPageFixture(0, 99)));
      await actor.flush();
      const current = selectView(actor.snapshot(), feedView);
      expect(current.cursors).toEqual([4, 8, 12]);
      expect(current.projects.some((project) => project.revision === 99)).toBe(false);
    } finally {
      await runtime.dispose();
    }
  });

  it("shares path discovery, model replay, and deterministic non-React projection", async () => {
    const events = [
      { type: "NEXT" as const },
      { type: "NEXT" as const },
      { type: "NEXT" as const },
    ];
    const graph = graphOf(feedMachine);
    const path = graph.pathFromEvents(events);
    expect(path?.state.value).toBe("plus-12");
    expect(graph.outgoingEvents("plus-20")).toContain("PREVIOUS");

    const model = test.model(feedMachine);
    if (path === undefined) throw new Error("expected the forward feed path");
    const replay = model.replay(path);
    expect(replay.state()).toBe("plus-12");
    expect(selectView(replay.snapshot(), feedView).cursors).toEqual([4, 8, 12]);

    const story = feedStories.stories[1];
    if (story === undefined) throw new Error("expected the bounded-window story");
    const harness = test
      .app(FeedApp)
      .scenario(feedMachine)
      .with({ provide: ProjectFeedLive })
      .run();
    const scenario = await runFlowScenario(harness, story);
    expect(scenario.kind).toBe("story-run");
    expect(scenario.status).toBe("success");
  });
});
