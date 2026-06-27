# Testing And Examples

Status: vNext reference draft.

Tests should prove the same mental model as production:

```txt
same modules
same resources
same flows
different Layers
deterministic runtime controls
```

Flow exposes runtime facts and controls. Vitest or `@effect/vitest` owns
assertions, diffs, reporters, snapshots, and property testing.

## Test Entry Points

```ts
const app = flowTest.app(App).provide(AppTest);

await app.resources.ensure(Project.byId("p1"));

expect(app.resources.get(Project.byId("p1"))).toMatchObject({
  availability: { tag: "data", data: fakeProject },
});

const editor = app.start(Project.editor, { input: { projectId: "p1" } });

expect(editor.state()).toBe("viewing");

editor.send({ type: "EDIT" }).send({ type: "SAVE" });
await editor.flush();

expect(editor.state()).toBe("conflict");
```

The app-level harness matters because resources and flows are siblings.

Focused flow tests remain valid and should be the default when the resource
store is not the behavior under test:

```ts
const editor = flowTest(Project.editor)
  .provide(AppTest)
  .start({ input: { projectId: "p1" } });

expect(editor.state()).toBe("viewing");
```

`flowTest.app(App)` is the target app-runtime test shape. If the implementation
has not caught up, use the same semantics through the current lower-level
runtime and harness APIs.

## Mocking Levels

Tests should choose the right layer of control.

| Level                   | Use when                                               | API shape                                         |
| ----------------------- | ------------------------------------------------------ | ------------------------------------------------- |
| API service mock        | Proving service failures, schemas, transport behavior. | `ProjectApi.layerMock(...)`                       |
| Resource store seed     | Starting with known canonical data.                    | `flow.store.test({ seed })`                       |
| Resource snapshot state | Proving stale/error/refresh UI without running lookup. | `store.seedSnapshot(ref, snapshot)`               |
| Mutation outcome        | Proving flow routes and transaction behavior.          | `mockMutation(Project.save, outcomes)`            |
| Orchestrator state      | Starting a flow in a rare process state.               | `fromState("editing", ctx)`                       |
| Time                    | Proving timers, stale, retry, polling, sampling.       | `advance("30 seconds")` / `TestClock.adjust(...)` |
| Stream                  | Proving progress, cancellation, pressure.              | `createControlledStream(...)`                     |

Do not force every test to mock the API. Sometimes seeding the ResourceStore is
the clearest proof. Sometimes direct service tests are better than flow tests.

## Effect Service Tests

Use direct Effect tests for service contracts.

```ts
import { it } from "@effect/vitest"
import { Effect, Layer } from "effect"

it.effect("normalizes not-found as a typed failure", () =>
  Effect.gen(function* () {
    const api = yield* ProjectApi
    const exit = yield* Effect.exit(api.getProject(ProjectId("missing")))
    expect(exit).toMatchObject(...)
  }).pipe(Effect.provide(ProjectApi.layerMock(...))),
)
```

Use service tests for:

- schema decoding
- redaction
- transport errors
- `RequestResolver` batching
- SQL/HTTP/client behavior
- typed Effect failure normalization

Use Flow tests for resource/orchestrator integration.

## Resource Tests

Resource tests assert shared data behavior without starting a flow unless the
flow is part of the behavior.

```ts
const harness = flowTest.app(App).provide(AppTest);

await harness.resources.ensure(Project.byId("p1"));

expect(harness.resources.get(Project.byId("p1"))).toMatchObject({
  availability: { tag: "data", data: fakeProject },
  activity: { tag: "idle" },
  freshness: { tag: "fresh" },
});
```

Stale/refresh:

```ts
await harness.resources.invalidate(Project.byId("p1"));

expect(harness.resources.get(Project.byId("p1")).freshness).toEqual({
  tag: "invalidated",
});

await harness.resources.refresh(Project.byId("p1"));
await harness.flush();
```

Resource tests should inspect resource snapshots and receipts:

```ts
expect(harness.receipts()).toContainEqual(
  expect.objectContaining({
    type: "resource:invalidate",
    id: "Project.byId",
  }),
);
```

## Flow Scenario Tests

Flow tests should read like product transcripts.

```ts
it("keeps a conflict editable and retryable", async () => {
  const harness = flowTest(Project.editor)
    .provide(AppTest)
    .start({ input: { projectId: "p1" } })

  expect(harness.state()).toBe("viewing")

  harness
    .send({ type: "EDIT" })
    .send({ type: "CHANGE_NAME", name: "Local name" })
    .send({ type: "SAVE" })

  await harness.flush()

  expect(harness.state()).toBe("conflict")
  expect(harness.context().draft).toEqual(Option.some(...))
  expect(harness.resources().project.availability.tag).toBe("data")
  expect(harness.transactions().latest(Project.save)).toMatchObject({
    status: "failure",
  })
})
```

Assertions can target:

- `state()`
- `context()`
- `snapshot()`
- `can(event)`
- `resources()`
- `mutations()` / `transactions()`
- `streams()`
- `timers()`
- `receipts()`
- `issues()`
- `trace()`

Flow must not own assertion helpers such as `.expectState()`, `.expectData()`,
or `.expectResource()`. The harness exposes facts and controls. Vitest,
`@effect/vitest`, or another host test runner owns assertions, diffs, reporters,
snapshots, and property checks.

## Controlled Effects

Controlled one-shot work should be `Deferred`-backed.

```ts
const save = createControlledEffect<SavedProject, ProjectSaveError>("Project.save")

save.fail(new ProjectConflict(...))
await harness.flush()
```

Outcome lanes:

| Test handle                | Runtime lane  |
| -------------------------- | ------------- |
| `succeed(value)`           | success       |
| `fail(error)`              | typed failure |
| `die(defect)`              | defect        |
| `interrupt()` / `cancel()` | interruption  |

Do not model expected domain failure with thrown exceptions.

## Controlled Streams

Controlled streams should converge on Effect `Stream`, `Queue`, or `PubSub`.

```ts
const progress = createControlledStream<UploadProgress, UploadFailure>("upload.progress");

const harness = flowTest(Upload.flow)
  .provide(UploadTest({ progress }))
  .start()
  .send({ type: "CHOOSE_FILES", files })
  .send({ type: "START" });

await progress.emit({ fileId: "f1", uploadedBytes: 500, totalBytes: 1000 });
await harness.flush();

expect(harness.streams().get("upload.progress")).toMatchObject({
  status: "running",
  emitted: 1,
});
```

Leaving the state should cancel the stream and record receipts.

## Time

Effect code should use `Clock`, `DateTime.now`, `Effect.sleep`, and
`Schedule`. Tests drive the same time boundary with `TestClock`.

```ts
await harness.advance("30 seconds");
expect(harness.resources.get(Project.byId("p1")).freshness).toEqual({
  tag: "stale",
});
```

If a test uses `@effect/vitest`, it may call `TestClock.adjust` directly:

```ts
yield * TestClock.adjust("2 seconds");
yield * Effect.promise(() => harness.flush());
```

Do not use real sleeps.

## Flush And Settle

`flush` drains work that is ready now.

It must not:

- wait for an unfinished `Deferred`
- advance time
- consume an unbounded stream
- chase polling forever
- hide leaked fibers

`settle` is broader and must be bounded:

```ts
await harness.settle({
  maxEvents: 25,
  maxEffects: 10,
  maxStreamEmissions: 100,
  maxVirtualTime: "5 seconds",
});
```

If quiescence is not reached, `settle` fails with diagnostics: active streams,
running effects, pending timers, last events, receipt tail, and which bound was
hit.

## Final Example Reading Guide

The final example should be one large flagship app, not a gallery of isolated
mini examples. Keep UI thin. Let tests prove semantics before React polish. The
existing examples are useful because they expose problems the API must solve,
but the vNext rewrite should teach the final mental model in one cohesive app.

Working app idea:

```txt
Launch Workspace
  Edit a launch project, track readiness metrics, upload assets, request
  approval, run an assistant that spawns child tasks, and chat with an LLM
  whose response streams into the workspace.
```

Coverage:

| Old pressure area        | Flagship use case                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------- |
| Todo List                | Launch checklist: pure flow state, guards, updates, views.                         |
| React Basic              | App shell, provider, hooks, routes, and view rendering.                            |
| Project Editor           | Project resource, comments resource, draft editor, save flow.                      |
| Streaming Upload Manager | Launch asset upload stream with cancellation and pressure.                         |
| Cached Dashboard         | Readiness dashboard resources with stale/refresh/invalidation.                     |
| Checkout Approval Flow   | Budget/legal approval flow with permissions and schema redaction.                  |
| Agent Workspace          | Assistant run with child flows, progress stream, approval gates.                   |
| Chat Stream              | Prompt input, streamed LLM text, stop/interrupt, offscreen subscriptions, cleanup. |

Before coding the flagship app, write a coverage matrix that assigns every
public API in `reference-next/lib-api.md` to a module, screen, and test. A
feature is not covered just because it appears in a detached snippet.

The chat screen should prove UI lifecycle semantics that uploads and assistant
tasks do not fully cover: React subscriptions can detach when the screen goes
offscreen, the actor can keep or stop work according to explicit policy, return
navigation must not duplicate the token stream, and actor disposal must interrupt
active generation and run cleanup finalizers.

## Rewrite Pressure From Current Examples

Current Project Editor and Cached Dashboard examples intentionally duplicated
resource data into machine context to prove the first runtime slice. Do not
preserve that shape in the flagship app. Under the vNext model:

- Project data moves to `Project.byId`.
- Panel payloads move to dashboard resources.
- Machine context keeps drafts, selected widget, conflict/error choice, and
  workflow-only state.
- Selectors read resource snapshots and flow snapshots together.
- Tests seed ResourceStore when canonical data is not the behavior under test.

If an example hand-writes request ids, stale flags, cache invalidation logs, or
late-result guards in app context, the runtime API is missing a feature.
