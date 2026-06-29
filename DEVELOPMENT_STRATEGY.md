# Development Strategy

Use this when an AI is building or porting any app in Flow State.

The fastest path is not "start coding the UI." The fastest path is:

1. anchor on the proved Flow contract
2. find the smallest executable slice
3. add one inspection surface
4. let tests and runtime facts drive the next step

## Start Here

Read these before touching app code:

1. `IMPLEMENTATION.md`
2. `BUGS.md`
3. `TYPESCRIPT.md`
4. root `package.json`
5. `pnpm-workspace.yaml`

That gives you:

- what is still unfinished
- which constraints are intentional
- where TypeScript and package-boundary traps already exist

## Know The Repo Roles

Do not treat every folder as the same kind of app.

- `examples/launch-workspace` is the flagship product-shaped proof.
- `apps/docs` is a projection of live proof and status, not a separate source of truth.
- `examples/typescript-proof-*` are compiler-mode probes, not product behavior.
- `packages/flow-state` is the library contract and runtime.

If you are unsure where to start, start from Launch Workspace and map outward.

## Read Order

### If you are working on an app or example

Read in this order:

1. app `package.json`
2. real entrypoint
3. status or inventory file
4. scenario tests
5. only then the deeper source internals

For Launch Workspace, the usual order is:

1. `examples/launch-workspace/app/page.tsx`
2. `examples/launch-workspace/app/LaunchWorkspaceClient.tsx`
3. `examples/launch-workspace/API_INVENTORY.md`
4. `examples/launch-workspace/src/launchWorkspaceStatus.ts`
5. `examples/launch-workspace/src/launchWorkspace.test.ts`

### If you are working on docs

Start from the page you are changing, then follow its imports back to the proof.

For status and API docs, check:

1. `apps/docs/src/pages/reference/status.mdx`
2. `apps/docs/src/pages/reference/api.md`
3. the imported Launch Workspace status registry or inventory file

### If you are working on core

Read the public boundary first, then the proof tests:

1. `packages/flow-state/src/index.ts`
2. `packages/flow-state/src/server.ts`
3. `packages/flow-state/src/react-entry.ts`
4. `packages/flow-state/src/testing.ts`
5. `packages/flow-state/src/inspect.ts`
6. `packages/flow-state/src/public-api-types.test.ts`
7. the narrow runtime or typing test closest to the slice

## Build The Slice In This Order

For any random app, map the slice before implementing it:

- canonical data -> `flow.resource`
- workflow state -> `flow.machine`
- writes -> `flow.transaction`
- async or live work -> `flow.stream`, `flow.after`, `flow.child`
- joined projection -> `flow.view`
- React boundary -> `FlowProvider`, `flow.useResource`, `flow.use`, `flow.useView`
- server boundary -> request-scoped boot only

Then work in this order:

1. pick one user-visible slice
2. write the scenario test first
3. add one debug surface before polish
4. implement the contract
5. keep the UI thin
6. update docs only after proof is real

## Highest-Leverage Tools

These surfaces make an AI faster and less confused than reading UI code first.

### `flowTest` and `flowTest.app`

Use these first for almost every feature.

They expose:

- `send`
- `flush`
- `advance`
- `settle`
- `pendingWork`
- `transactions()`
- `streams()`
- `timers()`
- `receipts()`
- `issues()`

This is the fastest way to see what the runtime thinks is happening without React noise.

### `launchWorkspaceStatus.ts` and `API_INVENTORY.md`

Use these before trusting exports.

They tell you:

- what is executable
- what is partial
- what is contract-only
- which example owns each public API

### Inspect Surfaces

Use these when you need deeper runtime context:

- `captureTrace`
- `graphOf`
- `replayTrace`
- `flowStories`

These are better than guessing from snapshots when ownership or ordering is unclear.

### `flow.runtime(...)`

Use the runtime directly when you need host-level context:

- `runtime.resources`
- `runtime.orchestrators`
- boot hydration and restore boundaries

### Request-Scoped Server Boot

The current server story is intentionally narrow and useful:

1. build one request runtime with `withRequestRuntime(...)`
2. preload resources and selected actors
3. `dehydrateBoot(...)`
4. hydrate one client runtime

Do not assume broader SSR, RSC, or Server Actions ownership than that.

## Command Loop

Run the narrowest proof first.

For local slice work:

```sh
pnpm --filter <pkg> test -- --run
```

After any core change that affects examples:

```sh
pnpm --filter @flow-state/core build
```

If exported types, package boundaries, or app assembly changed:

```sh
pnpm exec tsc -p examples/launch-workspace/tsconfig.json --noEmit false --declaration --emitDeclarationOnly --declarationDir /tmp/flow-state-launch-workspace-dts
```

Use broader gates later, not first.

## Confusion Traps

- Do not equate exported names with implemented behavior. Trust tests, `API_INVENTORY.md`, and `launchWorkspaceStatus.ts` first.
- The current public surface is still staged under `@flow-state/core/*`. The final intent is five real packages, but do not pretend that migration is already finished.
- `flow.transaction` is the public write builder. `flow.run` is the machine-side invoke descriptor.
- `flush()` is not bounded quiescence. Use `advance`, `settle`, and `pendingWork` when async work, timers, or streams matter.
- Launch Workspace consumes built `dist`, so stale core builds can create fake example failures.
- Keep app code inference-first. Do not spread heavyweight `Flow*Definition` annotations through feature code just to satisfy one exported boundary.
- Use `flow.useView` for real joined or reusable projections, not by default in every component.
- Do not widen offline queue, replay, undo, or broader SSR/RSC semantics unless the proof surface expands first.

## Default Rule

When in doubt:

1. start from Launch Workspace
2. find the owning scenario test
3. expose runtime facts with inspection tools
4. prove one slice end to end
5. only then broaden the surface
