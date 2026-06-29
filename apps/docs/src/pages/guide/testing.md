# Testing

Flow State tests use the same definitions as production and swap the runtime Layer, services, resources, clock, or streams as needed.

## Entry Points

Import `flowTest`, `createControlledEffect`, and `createControlledStream` from `@flow-state/core/testing`.

Use `flowTest(flow)` for focused flow behavior.

```ts
const harness = flowTest(Project.editor).provide(LaunchWorkspaceTestServices).start();

harness.send({ type: "EDIT" });
expect(harness.state()).toBe("editing");
```

Use `flowTest.app(App)` when resources, module fixtures, transactions, or app runtime inventory are part of the behavior.

```ts
const harness = flowTest
  .app(LaunchWorkspaceApp)
  .seedResources(launchWorkspaceSeed)
  .start(launchWorkspaceMachine)
  .provide(LaunchWorkspaceTestServices)
  .start();

expect(harness.cache().query("launch.project")).toMatchObject({
  status: "success",
  value: fixtureProject,
});
```

## App Harness Controls

| API                         | Use for                                                                                                                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.provide(layer)`           | Install Effect services and test Layers.                                                                                                                                                      |
| `.seedResources(seed)`      | Seed concrete ResourceStore entries.                                                                                                                                                          |
| `.seedModuleFixtures(name)` | Load fixture records declared on modules.                                                                                                                                                     |
| `.start(machine, options)`  | Create a focused actor inside the app harness and optionally merge `options.input` into the initial context.                                                                                  |
| `.send(event)`              | Drive product scenarios.                                                                                                                                                                      |
| `.flush()`                  | Drain work that is ready now.                                                                                                                                                                 |
| `.advance(duration)`        | Move virtual time forward for delayed transitions without sleeping in real time.                                                                                                              |
| `.settle(bounds)`           | Run bounded quiescence across ready work and known delayed transitions; throws diagnostics that pinpoint ready mailboxes and live timers, streams, or transactions when bounds are exhausted. |
| `.pendingWork()`            | Inspect ready mailboxes, timers, streams, transactions, and live child snapshots without advancing the harness.                                                                               |
| `.state()`                  | Assert current process state.                                                                                                                                                                 |
| `.context()`                | Assert process-owned context.                                                                                                                                                                 |
| `.snapshot()`               | Inspect resources, transactions, streams, timers, children, receipts, and issues.                                                                                                             |
| `.can(event)`               | Assert legal commands using runtime guards.                                                                                                                                                   |
| `.transactions()`           | Inspect transaction status, preview patches, rollbacks, and receipts.                                                                                                                         |
| `.streams()`                | Inspect stream status, generation, emissions, cancellation, and receipts.                                                                                                                     |
| `.timers()`                 | Inspect timer lifecycle, generation, due time, cancellation, and receipts.                                                                                                                    |
| `.receipts()`               | Inspect trace facts.                                                                                                                                                                          |
| `.issues()`                 | Inspect typed failure, defect, and interrupt facts.                                                                                                                                           |

`advance(duration)` uses Effect `TestClock` virtual time for delayed transitions. `settle(bounds)` stays separate because bounded quiescence is a different contract from draining ready work: it may advance virtual time to the next delayed transition, loop through newly-ready callbacks, and fail with explicit diagnostics when `maxTicks` or `maxFibers` are exhausted while ready mailboxes or live timers, streams, or transactions remain. Those diagnostics also include the current live child snapshots so stuck ownership is visible without reconstructing it from the full runtime snapshot.

`flush()` is intentionally narrow: it drains the ready continuations that are already enqueued for the harness or actor. If a later promise resolution, timer, or stream emission enqueues more work after that drain completes, call `flush()` again when that work is actually ready. Use `pendingWork()` when you want the current pending snapshot without mutating time or draining anything.

## Transaction Probe

```ts
const harness = flowTest
  .app(LaunchWorkspaceApp)
  .seedResources(launchWorkspaceSeed)
  .start(launchWorkspaceMachine)
  .provide(conflictServices)
  .send({ type: "EDIT_PROJECT", draft: { ...projectDraftFrom(fixtureProject), name: "Atlas v2" } })
  .send({ type: "SAVE_PROJECT" });

expect(harness.transactions().previewPatches("launch.save-project")).toHaveLength(1);

await harness.flush();

expect(harness.transactions().rollbacks("launch.save-project")).toHaveLength(1);
expect(harness.issues()).toEqual([
  expect.objectContaining({ kind: "failure", source: "transaction", id: "launch.save-project" }),
]);
```

## Stream Probe

```ts
const tokens = createControlledStream<ChatToken, never>("launch.chat.tokens");
const stream = flow.stream({
  id: "Chat.tokenStream",
  subscribe: () => tokens.stream(),
  routes: { value: (token) => ({ type: "CHAT_TOKEN", token }) },
});

const harness = flowTest(createChatComposer(stream)).start();
harness
  .send({ type: "TYPE_PROMPT", prompt: "Draft launch summary" })
  .send({ type: "SUBMIT_PROMPT" });

tokens.emit({ index: 0, text: "Ready" });
await harness.flush();

expect(harness.streams().running("Chat.tokenStream")).toMatchObject({
  generation: 1,
  emitted: 1,
});
```

## Direct Effect Service Tests

Use direct Effect tests for schemas, redaction, validation, typed failures, batching, SQL/HTTP behavior, and service normalization.

```ts
const exit = await Effect.runPromiseExit(
  saveProject({
    id: fixtureProject.id,
    draft: projectDraftFrom(fixtureProject),
    baseVersion: 1,
  }).pipe(Effect.provide(conflictLayer)),
);

expect(Exit.isFailure(exit)).toBe(true);
```

Launch Workspace also tests `Schema.decodeUnknownSync`, redacted approval notes, validation before API access, and `RequestResolver` batching outside of screen scenarios.

## Assertion Rule

Flow State exposes runtime facts and controls. Vitest, `@effect/vitest`, or another host test runner owns assertions, diffs, reporters, snapshots, and property checks. Do not use or add Flow-owned `.expect*` assertion helpers.
