import { Deferred, Effect, Layer } from "effect";
import { describe, expect, it } from "vite-plus/test";

import * as flow from "flow-state";
import { test } from "flow-state/testing";

import { PostsApp } from "../app/app";
import { createPostsTestRuntime } from "../app/runtime";
import { PostsUnavailable } from "../domain/posts";
import { postsScreenMachine } from "../features/posts/machine";
import { postDetailResource, postsResource } from "../features/posts/resources";
import { fixturePosts } from "../services/layers";
import { PostsService } from "../services/posts-service";
import type { PostsServiceShape } from "../services/posts-service";

function runtimeWith(service: PostsServiceShape) {
  const serviceLayer = Layer.succeed(PostsService, PostsService.of(service));
  return flow.runtime(
    PostsApp.layer<readonly [typeof serviceLayer]>({
      store: flow.store.test(),
      orchestrators: flow.orchestrators.test(),
      services: [serviceLayer],
    }),
  );
}

describe("basic cached posts", () => {
  it("loads the list, navigates to a keyed detail, and retains that detail across navigation", async () => {
    const runtime = createPostsTestRuntime();
    const actor = runtime.orchestrators.start(postsScreenMachine);

    await actor.flush();
    expect(runtime.resources.get(postsResource.ref())).toMatchObject({ status: "success" });

    actor.send({ type: "OPEN_POST", postId: 1 });
    await actor.flush();
    expect(runtime.resources.get(postDetailResource.ref(1))).toMatchObject({
      status: "success",
      value: { id: 1 },
    });

    actor.send({ type: "BACK" });
    actor.send({ type: "OPEN_POST", postId: 1 });
    expect(runtime.resources.get(postDetailResource.ref(1))).toMatchObject({
      status: "success",
      value: { id: 1 },
    });

    await runtime.dispose();
  });

  it("keeps keyed details independent and replaces cached data after a controlled refresh", async () => {
    const refreshGate = Effect.runSync(Deferred.make<(typeof fixturePosts)[1]>());
    const refreshStarted = Effect.runSync(Deferred.make<void>());
    let firstCalls = 0;
    const runtime = runtimeWith(
      PostsService.of({
        list: Effect.succeed(Object.values(fixturePosts)),
        detail: (id) => {
          if (id === 2) return Effect.succeed(fixturePosts[2]);
          firstCalls += 1;
          return firstCalls === 1
            ? Effect.succeed(fixturePosts[1])
            : Deferred.succeed(refreshStarted, undefined).pipe(
                Effect.andThen(Deferred.await(refreshGate)),
              );
        },
      }),
    );
    const actor = runtime.orchestrators.start(postsScreenMachine);
    await actor.flush();

    actor.send({ type: "OPEN_POST", postId: 1 });
    await actor.flush();
    actor.send({ type: "BACK" });
    actor.send({ type: "OPEN_POST", postId: 1 });
    await Effect.runPromise(Deferred.await(refreshStarted));
    expect(runtime.resources.get(postDetailResource.ref(1))).toMatchObject({
      status: "stale",
      activity: "fetching",
      value: { revision: 1 },
    });

    Effect.runSync(
      Deferred.succeed(refreshGate, {
        ...fixturePosts[1],
        title: "Flow State refreshed",
        revision: 2,
      }),
    );
    await actor.flush();
    expect(runtime.resources.get(postDetailResource.ref(1))).toMatchObject({
      status: "success",
      value: { title: "Flow State refreshed", revision: 2 },
    });

    actor.send({ type: "BACK" });
    actor.send({ type: "OPEN_POST", postId: 2 });
    await actor.flush();
    expect(runtime.resources.get(postDetailResource.ref(1))?.value).toMatchObject({ id: 1 });
    expect(runtime.resources.get(postDetailResource.ref(2))?.value).toMatchObject({ revision: 1 });

    await runtime.dispose();
  });

  it("publishes a typed failure and retries the same detail deterministically", async () => {
    let calls = 0;
    const runtime = runtimeWith(
      PostsService.of({
        list: Effect.succeed(Object.values(fixturePosts)),
        detail: () => {
          calls += 1;
          return calls === 1
            ? Effect.fail(
                new PostsUnavailable({ operation: "detail", message: "fixture unavailable" }),
              )
            : Effect.succeed(fixturePosts[1]);
        },
      }),
    );
    const actor = runtime.orchestrators.start(postsScreenMachine);
    await actor.flush();
    actor.send({ type: "OPEN_POST", postId: 1 });
    await actor.flush();
    expect(runtime.resources.get(postDetailResource.ref(1))).toMatchObject({
      status: "failure",
      error: { _tag: "PostsUnavailable", operation: "detail" },
    });

    actor.send({ type: "RETRY" });
    await actor.flush();
    expect(runtime.resources.get(postDetailResource.ref(1))).toMatchObject({ status: "success" });
    await runtime.dispose();
  });

  it("cancels actor-owned loading work during runtime cleanup", async () => {
    const detailGate = Effect.runSync(Deferred.make<(typeof fixturePosts)[1]>());
    const detailStarted = Effect.runSync(Deferred.make<void>());
    let finalizations = 0;
    const runtime = runtimeWith(
      PostsService.of({
        list: Effect.succeed(Object.values(fixturePosts)),
        detail: () =>
          Effect.scoped(
            Effect.acquireRelease(Deferred.succeed(detailStarted, undefined), () =>
              Effect.sync(() => void (finalizations += 1)),
            ).pipe(Effect.andThen(Deferred.await(detailGate))),
          ),
      }),
    );
    const actor = runtime.orchestrators.start(postsScreenMachine);
    await actor.flush();
    actor.send({ type: "OPEN_POST", postId: 1 });
    await Effect.runPromise(Deferred.await(detailStarted));
    expect(runtime.resources.get(postDetailResource.ref(1))).toMatchObject({ status: "loading" });

    await runtime.dispose();
    expect(finalizations).toBe(1);
  });

  it("exposes the same production machine through the app testing harness", () => {
    const harness = test
      .app(PostsApp)
      .scenario(postsScreenMachine)
      .with({ resources: [{ ref: postsResource.ref(), value: Object.values(fixturePosts) }] })
      .run()
      .send({ type: "OPEN_POST", postId: 2 });

    expect(harness.state()).toBe("detail-2");
    expect(harness.context()).toEqual({ selectedPostId: 2 });
  });
});
