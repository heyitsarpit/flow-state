# Getting Started

This is the supported alpha onboarding path. It builds one Effect service into a
cached resource, a small workflow and view, a React screen, a deterministic test,
and a CLI-inspectable behavior contract. The complete executable version is
[`examples/basic-cached-posts`](https://github.com/arpit/flow-state/tree/main/examples/basic-cached-posts).

## 1. Install the alpha

Flow State is ESM-only and requires Node 22.18 or newer. React is optional unless
you import `flow-state/react`.

```sh
pnpm add flow-state@0.1.0-alpha.0 effect@4.0.0-beta.86
pnpm add react@^18 react-dom@^18
```

## 2. Put I/O behind an Effect service

```ts
import { Context, Effect, Layer } from "effect";

interface Post {
  readonly id: number;
  readonly title: string;
}

class PostsService extends Context.Service<
  PostsService,
  { readonly list: Effect.Effect<readonly Post[]> }
>()("guide/PostsService") {}

const PostsLive = Layer.succeed(
  PostsService,
  PostsService.of({ list: Effect.succeed([{ id: 1, title: "First post" }]) }),
);
```

The Layer remains the only I/O boundary, so production and deterministic tests
can install different implementations without changing the resource or machine.

## 3. Define the resource, machine, and view

```ts
import { Effect } from "effect";
import * as flow from "flow-state";

const postsResource = flow.resource({
  id: "posts.list",
  key: () => flow.createKey("posts", "list"),
  lookup: () => Effect.flatMap(PostsService, (service) => service.list),
  freshness: { staleAfter: "30 seconds", onInvalidate: "active" },
});

type PostsEvent = { readonly type: "REFRESH" } | { readonly type: "REFRESHED" };

const postsMachine = flow.machine<Record<never, never>, PostsEvent>()({
  id: "posts.screen",
  initial: "ready",
  context: () => ({}),
  states: {
    ready: {
      invoke: [flow.ensure(postsResource.ref())],
      on: { REFRESH: { target: "refreshing" } },
    },
    refreshing: {
      invoke: [
        flow.refresh(postsResource.ref(), {
          routes: flow.outcomes({
            success: () => ({ type: "REFRESHED" as const }),
          }),
        }),
      ],
      on: { REFRESHED: { target: "ready" } },
    },
  },
});

const postsView = flow.view({
  id: "posts.screen.view",
  sources: ["context"],
  select: ({ value }) => ({ refreshing: value === "refreshing" }),
});
```

Resources own canonical server data, while the machine owns the workflow state.
The view is a reusable projection; it does not copy resource data into machine
context.

## 4. Assemble one app and runtime

```ts
const PostsModule = flow.module("Posts", {
  resources: { list: postsResource },
  machines: { screen: postsMachine },
  views: { screen: postsView },
});

const PostsApp = flow.app({ modules: [PostsModule] as const });

const createPostsRuntime = () =>
  flow.runtime(
    PostsApp.layer({
      store: flow.store.memory(),
      orchestrators: flow.orchestrators.live(),
      services: [PostsLive],
    }),
  );
```

The caller owns this runtime and must dispose it when the application boundary
unmounts.

## 5. Read the same owners from React

```tsx
import { useEffect, useMemo, useState } from "react";
import { FlowProvider, useActor, useResource, useView } from "flow-state/react";

function PostsScreen() {
  const actor = useActor(postsMachine, { id: "posts.screen" });
  const screen = useView(actor, postsView);
  const posts = useResource(useMemo(() => postsResource.ref(), []));

  return (
    <main>
      <button disabled={screen.refreshing} onClick={() => actor.send({ type: "REFRESH" })}>
        Refresh
      </button>
      {posts?.value?.map((post) => (
        <p key={post.id}>{post.title}</p>
      ))}
    </main>
  );
}

export function App() {
  const [appRuntime] = useState(createPostsRuntime);
  useEffect(() => () => void appRuntime.dispose(), [appRuntime]);

  return (
    <FlowProvider runtime={appRuntime}>
      <PostsScreen />
    </FlowProvider>
  );
}
```

`FlowProvider` exposes the caller-owned runtime; it does not create a second
lifecycle. The root cleanup disposes every owned resource, actor, stream, timer,
and child when this generation unmounts.

## 6. Prove it deterministically

Use `test(machine).with(...).run()` for the first executable proof; move to
`test.app(App).scenario(machine)` only when named app fixtures or inventory are
part of the behavior under test.

```ts
import { expect, it } from "vite-plus/test";
import { test } from "flow-state/testing";

it("enters refresh through the production machine", () => {
  const harness = test(postsMachine)
    .with({ resources: [{ ref: postsResource.ref(), value: [] }] })
    .run()
    .send({ type: "REFRESH" });

  expect(harness.state()).toBe("refreshing");
  expect(harness.pendingWork().resources).toEqual([]);
});
```

The maintained recipe executes the full load, keyed-detail, refresh, typed
failure, and cleanup cases:

```sh
pnpm --filter @flow-state/basic-cached-posts test
pnpm --filter @flow-state/basic-cached-posts build
pnpm check:example-cli
```

The last command invokes the installed package bin through a clean consumer and
builds every maintained example's behavior contract. Continue with
[Recipes](/examples), [Incident Console](/examples#incident-console), and
[Current Status](/reference/status).
