# Examples [Linear implementation path]

Status: implementation guide.

This page defines the example suite we will build to cover the API surface in batches. The examples should progress from a narrow machine runtime to the full product story without creating too many separate apps.

Each example must include client code and tests. If an API cannot be evaluated in one of these examples, it probably needs a stronger reason to exist.

## Progression Rule

Build examples in order. Do not start the next example until the current one has:

- a visible client workflow
- representative tests
- documented API pressure
- clear missing runtime semantics
- a decision about which stubs became real

## Next Agent Handoff

Read this before implementing the next example.

Current vNext flagship status:

- `examples/launch-workspace` is the new contract-first flagship package.
- It is not a production app; it is the reviewable API proof surface for
  `reference-next`.
- The package now contains domain schemas, typed errors, Effect service Layers,
  vNext descriptors, screen-level scenario tests, API coverage tests, and a
  thin React shell.
- `examples/launch-workspace/API_INVENTORY.md` is the linked export inventory
  and proof matrix. It separates executable slices from contract-only runtime
  semantics.
- `flowTest.app` can now seed app ResourceStore snapshots, and the flagship
  project save path proves preview patch plus rollback receipts.
- Live resource lookup execution, state-scoped stream fibers, child
  supervision, virtual time, bounded settle, and persistence storage remain
  contract-only until the next runtime slices land.
- Treat the old example packages as legacy implementation snapshots unless a
  use case is being folded into `launch-workspace`.

The examples are API pressure tests, not UI showcases. Keep the UI thin and let the tests carry the product/runtime proof. The important output from each example is the shape of the public API, the runtime semantics it forces, and the test harness surface needed to prove it.

Current lessons from Todo List and Project Editor:

- Keep app context for product state only. Runtime lifecycle state belongs on `snapshot.resources`, `snapshot.mutations`, `snapshot.receipts`, and `snapshot.issues`.
- Use Effect services through `Context.Service` and fake them with real `Layer`s. Tests should call `flowTest(machine).provide(layer)`, not bypass the runtime unless they are testing a helper directly.
- Use Vitest assertions. Flow State exposes probes and receipts; it should not own `expect*` functions.
- Keep expected failures, defects, and interruptions separate. Routes should make all outcome categories explicit, or the docs must say which outcomes are receipt-only.
- `flush()` must drain ready continuations without waiting forever for active Effects, timers, or streams. Use bounded `settle(...)` later for quiescence diagnostics.
- Controlled test handles must be deterministic even when tests complete work immediately after sending an event. Avoid random sleeps.
- If an example must hand-write request IDs, cache state, invalidation logs, or late-result guards in app context, that is a sign the runtime API is missing something.
- Do not build generic statechart parity for its own sake. XState already owns nested/parallel/history semantics. Add those only when a later example forces a concrete product need.
- Do not clone TanStack Query's full option surface. Only add cache semantics that matter because the machine owns observer lifecycle, routing, invalidation, or stale-result behavior.
- Before claiming an API is `ready`, add the example test that proves it through the runtime, then update the reference docs in the same change.

Recommended implementation loop for the next agent:

1. Start with the next example's test file and write the transcript-style scenarios first.
2. Add the smallest runtime API that lets those tests avoid app-owned lifecycle bookkeeping.
3. Keep the example app code boring: product events, product context, selectors, and minimal rendering.
4. Run focused tests for core and the example before expanding docs.
5. Update `examples.md`, `lib_api.md`, `test_api.md`, and `runtime_semantics.md` when a stub becomes real or a claimed-ready surface is still only partial.
6. Finish with `pnpm verify`, then remove generated `dist` directories before handoff.

## Example Suite

| Order | Example                   | Complexity     | Main purpose                                                                                            | Feature batch                    |
| ----- | ------------------------- | -------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------- |
| 0     | Todo List                 | Tiny           | Prove the absolute basics before async/cache/runtime complexity.                                        | Machine and test fundamentals.   |
| 1     | Project Editor            | Small but real | Prove the core machine, Effect, query, mutation, React, and test ergonomics.                            | Core workflow runtime.           |
| 2     | Streaming Upload Manager  | Medium         | Prove streaming, cancellation, delayed transitions, cleanup, and pressure policy.                       | Long-running scoped work.        |
| 3     | Cached Dashboard          | Medium         | Prove cache lifecycle, invalidation, observers, selectors, batching, and stale UI prevention.           | Query/cache/store semantics.     |
| 4     | Checkout Or Approval Flow | Medium-high    | Prove nested states, guarded transitions, history, persistence shape, permissions, and invariants.      | Structured workflow semantics.   |
| 5     | Agent Workspace           | High           | Prove child actors, streaming agent progress, trace, graph coverage, devtools protocol, stories, tests. | Multi-actor runtime and tooling. |

## 0. Todo List

Purpose: smallest useful example for the deterministic machine kernel and test harness.

User workflow:

- add a todo
- edit a todo title
- toggle complete
- filter all/active/completed
- clear completed
- reject empty titles
- show an empty state

API surfaces:

| Surface        | What this example should prove                                     |
| -------------- | ------------------------------------------------------------------ |
| `flow.machine` | Basic states, events, context, transition targets, snapshots.      |
| `flow.assign`  | Add, update, toggle, remove, clear completed.                      |
| `flow.guard`   | Reject empty title and block invalid edits.                        |
| `flow.action`  | Synchronous transition receipts only.                              |
| `flow.can`     | Disable add/edit/clear commands when invalid.                      |
| `flow.match`   | Render empty/list/filter states by snapshot.                       |
| `FlowProvider` | Runtime shell can exist even for no-async examples.                |
| `useFlow`      | Render snapshot and send events.                                   |
| `useSelector`  | Select visible todos and counts without unnecessary rerenders.     |
| `flowTest`     | Start machine, send events, assert state/context/snapshot.         |
| `flush`        | Prove immediate queued work drains deterministically when present. |

Tests:

| Test area       | Required coverage                                      |
| --------------- | ------------------------------------------------------ |
| add/edit/toggle | context updates are deterministic                      |
| guards          | empty titles do not mutate context                     |
| filtering       | visible todos derive correctly from state/context      |
| commands        | `can` reflects valid and invalid events                |
| rendering       | selectors expose count, completed count, visible todos |
| snapshot        | no impossible intermediate snapshot leaks              |

Exit criteria:

- We know the minimum machine config shape.
- We know how client code reads snapshots and sends events.
- We know how tests drive events and assert state/context.
- We have not introduced async, query, mutation, stream, persistence, or child actor complexity yet.

## 1. Project Editor

Purpose: first serious API pressure test.

Current implementation slice:

- `examples/project-editor` exists as an API-shaping example.
- The machine models async boundaries with explicit request ids and external result events.
- Boundary payloads and typed Effect errors use Effect Schema.
- Tests use Vitest assertions against `flowTest` probes; `flowTest` does not own `expect*` assertions.
- Tests cover load, edit, save, typed failures, defects, cancellation receipts, issue collection, cache invalidation intent, and late-result rejection.
- `flow.query` and `flow.mutation` now run through the test runtime for this example: state-entry load work and event-triggered save work are runtime-owned.
- Project app context holds product state; runtime query/mutation state is asserted through `snapshot.resources`, `snapshot.mutations`, `snapshot.receipts`, and `snapshot.issues`.
- `createTestLayer` now carries a real Effect `Layer`, and `createControlledEffect` is backed by `Deferred` so tests can complete running Effects.
- Full cache policy, active observer refetch, retry schedules, and `settle` diagnostics are still missing semantics.

User workflow:

- open a project
- load project data
- edit draft fields
- save changes
- handle typed load and save failures
- show dirty/saving/saved/error states
- invalidate or refresh project data after save

API surfaces:

| Surface                  | What this example should prove                                                 |
| ------------------------ | ------------------------------------------------------------------------------ |
| `createRuntime`          | Runtime owns Effect services, cache, clock, trace, and disposal.               |
| `flow.machine`           | Basic states, events, context, guards, assignments, entry/exit, snapshots.     |
| `flow.effect`            | Non-cached Effect work with success, typed failure, defect, interruption.      |
| `flow.query`             | Project load cache key, stale state, pure result routes, late result behavior. |
| `flow.mutation`          | Save variables, pure result routes, issue collection, invalidation.            |
| `flow.assign`            | Draft/context updates.                                                         |
| `flow.guard`             | Dirty check, can-save check, conflict handling.                                |
| `flow.action`            | Synchronous trace/local transition receipts only.                              |
| `FlowProvider`           | Runtime injection into React.                                                  |
| `useFlow`                | Snapshot rendering and event sending.                                          |
| `useSelector`            | Stable selected draft/save status.                                             |
| `flowTest`               | Harness starts machine and drives product events.                              |
| `createTestLayer`        | Fake project service as a real Effect Layer.                                   |
| `createControlledEffect` | Controlled load/save attempts and deterministic success/failure/defect/cancel. |
| cache probes             | Assert cache hit, stale, invalidation, late completion behavior.               |

Tests:

| Test area     | Required coverage                                                           |
| ------------- | --------------------------------------------------------------------------- |
| happy path    | load, edit, save, return to clean viewing state                             |
| typed failure | load failure and save failure route to expected states                      |
| defect        | unexpected defect is separated from typed failure and collected as an issue |
| cancellation  | leaving loading/saving interrupts state-owned work                          |
| cache         | save invalidates project query and active observer refetches                |
| late result   | inactive query/effect result cannot transition current actor generation     |
| rendering     | buttons use `can`; selectors avoid unnecessary rerenders                    |

Exit criteria:

- Core machine and Effect invoke semantics are no longer speculative.
- Query observer lifecycle has a documented decision.
- Mutation concurrency has at least one chosen default.

## 2. Streaming Upload Manager

Purpose: lock the stream and timer API for long-running scoped work.

API status: `contract`. The example package, public types, docs, and tests define the stream/timer descriptor contract. Stream and timer runtime execution is intentionally outside this example slice.

Current implementation slice:

- `examples/streaming-upload-manager` exists as an API-shaping example.
- The visible client workflow stages sample files, starts upload, ticks progress, completes, cancels, retries, fails, and clears.
- The machine config uses the locked `flow.stream(...)` and `flow.after(...)` descriptor shape, but runtime stream invocation and delayed transitions are intentionally not implemented yet.
- Tests cover the stream/timer API shape, upload service test-layer shape, controlled stream handle shape, empty stream/timer snapshot slots, and product-event-driven upload workflow.
- Until stream runtime exists, progress is simulated through product `UPLOAD_PROGRESS` events instead of a runtime-owned stream fiber.

User workflow:

- choose files
- start upload
- stream progress
- pause/cancel/retry
- auto-dismiss completed uploads after a delay
- handle upload failure and cleanup

API surfaces:

| Surface                  | What this example should prove                                           |
| ------------------------ | ------------------------------------------------------------------------ |
| `flow.stream`            | State-scoped streaming progress with value, failure, done, cancellation. |
| `flow.after`             | Auto-dismiss and retry delay using `Clock` and `TestClock`.              |
| `flow.raise`             | Internal progress-derived events if needed.                              |
| `flow.effect`            | Start/finalize upload Effects.                                           |
| `createTestLayer`        | Upload service injection mirrors production Context service shape.       |
| `createControlledStream` | Emit progress, fail, end, assert cancellation.                           |
| `flush` / `settle`       | Deterministic immediate work and bounded quiescence.                     |
| trace receipts           | Stream start, value, failure, completion, interruption, timer fired.     |

Descriptor contract decisions:

- Stream lifecycle state lives on `snapshot.streams`, not in app context and not in `snapshot.resources`.
- Stream values may update the stream slot and enqueue mapped events. Product state changes only through normal transitions.
- `flow.stream(...)` is intended to be state-scoped by default. Leaving the invoking state should interrupt the stream and record `stream:cancel` once runtime stream execution exists.
- Stream interruption is receipt-only by default. A machine event is routed only when `routes.interrupt` is provided.
- Expected stream failures route through `routes.failure`; defects route through `routes.defect`; both also write `snapshot.issues`.
- Pressure policy is explicit on high-frequency streams. Upload progress uses `coalesce-latest` keyed by file id.
- `flow.after(...)` is a state-scoped timer descriptor with transition fields. It can target a state, run `guard`, run `update`, run `actions`, or route a fired event once timer execution exists.
- `flush()` drains only ready stream emissions, completions, timer events, and machine continuations. `settle(...)` is bounded and reports active streams/timers/effects when quiescence is not reached.
- `createControlledStream(...)` exposes `stream`, `emit`, `fail`, `die`, `end`, `active`, `cancelled`, and `events` so tests can prove lifecycle without sleeps.
- Stream snapshots include `id`, `status`, `latest`, `error`, `defect`, `emitted`, `coalesced`, `dropped`, `startedAt`, and `endedAt`.
- Timer snapshots include `id`, `status`, `delay`, `scheduledAt`, `fireAt`, `firedAt`, and `cancelledAt`.

The example should read like this API sketch:

```ts
const uploadProgress = flow.stream({
  id: "upload.progress",
  input: ({ context }) => ({ files: context.files }),
  stream: ({ input, services }) => services.upload.uploadFiles(input.files),
  pressure: {
    strategy: "coalesce-latest",
    key: (event) => event.fileId,
  },
  routes: {
    value: (progress) => ({ type: "UPLOAD_PROGRESS", progress }),
    done: () => ({ type: "UPLOAD_DONE" }),
    failure: (error) => ({ type: "UPLOAD_FAILED", error }),
    defect: (defect) => ({ type: "UPLOAD_DEFECT", defect }),
    interrupt: () => ({ type: "CANCEL_UPLOAD" }),
  },
});

const dismissCompleted = flow.after({
  id: "upload.dismiss-completed",
  delay: "2 seconds",
  target: "idle",
  update: resetUpload,
});

const uploadMachine = flow.machine({
  id: "example-2-streaming-upload-manager",
  initial: "idle",
  context: emptyUploadContext,
  states: {
    idle: {
      on: {
        CHOOSE_FILES: { target: "ready", update: chooseFiles },
      },
    },
    ready: {
      on: {
        START_UPLOAD: { target: "uploading", guard: hasFiles },
      },
    },
    uploading: {
      invoke: uploadProgress,
      on: {
        UPLOAD_PROGRESS: { update: applyProgress },
        UPLOAD_DONE: { target: "completed", update: markComplete },
        UPLOAD_FAILED: { target: "failed", update: recordFailure },
        UPLOAD_DEFECT: { target: "defect", update: recordDefect },
        CANCEL_UPLOAD: "cancelled",
      },
    },
    completed: {
      after: dismissCompleted,
      on: {
        DISMISS: { target: "idle", update: resetUpload },
      },
    },
    failed: {
      on: {
        RETRY_UPLOAD: "uploading",
        REMOVE_UPLOAD: "idle",
      },
    },
    cancelled: {
      on: {
        RETRY_UPLOAD: "uploading",
        REMOVE_UPLOAD: "idle",
      },
    },
    defect: {},
  },
});
```

Representative tests should use this shape:

```ts
const progress = createControlledStream<UploadProgress, UploadFailure>("upload.progress");
const harness = flowTest(uploadMachine)
  .provide(createUploadTestLayer({ uploadFiles: progress.stream }).layer)
  .send({ type: "CHOOSE_FILES", files })
  .send({ type: "START_UPLOAD" });

expect(harness.streams().running("upload.progress")).toMatchObject({
  id: "upload.progress",
  status: "running",
});

progress.emit({ fileId: "file-1", uploadedBytes: 50, totalBytes: 100 });
await harness.flush();
expect(harness.context().files[0]).toMatchObject({
  uploadedBytes: 50,
  status: "uploading",
});
expect(harness.streams().get("upload.progress")?.latest).toMatchObject({ fileId: "file-1" });

harness.send({ type: "CANCEL_UPLOAD" });
await harness.flush();
expect(progress.cancelled()).toBe(true);
expect(harness.receipts()).toContainEqual({
  type: "stream:cancel",
  id: "upload.progress",
});

progress.emit({ fileId: "file-1", uploadedBytes: 100, totalBytes: 100 });
await harness.flush();
expect(harness.state()).toBe("cancelled");

harness.send({ type: "RETRY_UPLOAD" });
progress.end();
await harness.flush();
expect(harness.state()).toBe("completed");

// Future timer-runtime proof:
// await harness.advance("2 seconds");
// expect(harness.state()).toBe("idle");
```

Implementation decisions already settled by this example:

- Do not represent upload progress as a query resource.
- Do not make React rendering the stream observer.
- Do not expose component-owned stream subscriptions.
- Do not hide dropped or coalesced values; record pressure diagnostics in receipts.
- Do not make timer semantics test-only; tests use the same runtime `Clock` boundary through `advance(...)`.

Exit criteria:

- Streaming lifecycle and cleanup are testable.
- Delayed transitions can be tested without real time.
- High-frequency events do not accidentally flood rendering.

## 3. Cached Dashboard

Purpose: prove cache and subscription semantics under fanout.

API status: cache write receipts, tag/key/predicate invalidation targets, stale marking, freshness timestamps, and cache probes are now runtime-proven in core. Active observer refetch and GC are not part of this slice.

Current implementation slice:

- `examples/cached-dashboard` exists as the Example 3 package.
- The machine invokes three panel queries and submits a widget mutation through `flow.submit`.
- Tests prove cache write receipts, resource tags/timestamps, invalidation by tag/key/predicate/string, keep-previous-data refetch state, stale marking, failure routing, view descriptor shape, and product save flow.
- The UI shows a compact panel dashboard with refresh/edit/save/failure controls, while correctness remains asserted through `flowTest()` and `harness.cache()`.

User workflow:

- load several dashboard panels
- refresh dashboard panels through a state re-entry
- mutate a record that invalidates multiple panels
- keep previous data while refetching
- show stale, fetching, success, and failure states independently

API surfaces:

| Surface         | What this example should prove                                             |
| --------------- | -------------------------------------------------------------------------- |
| `flow.query`    | Multiple keys, stale/GC timestamps, keep previous data, fetching state.    |
| `flow.mutation` | Invalidation by key, tag, and predicate.                                   |
| `createKey`     | Deterministic key construction and matching.                               |
| `createTag`     | Group invalidation without exposing raw cache writes.                      |
| `useSelector`   | Snapshot selection and event gating for the React surface.                 |
| `flow.view`     | Define snapshot-backed context/resource projections consumed by `useView`. |
| cache inspector | Assert writes, invalidations, stale/fetching state, and failure count.     |

Implementation decisions this example must force:

- key hashing and matching rules
- state re-entry refetch behavior with previous values retained
- which cache lifecycle fields are runtime state versus descriptors
- which React reads should be `useSelector` versus descriptor-backed `useView`
- where `flow.view` is more expressive than ad hoc selectors

Current feature surface:

- `FlowQueryConfig` includes `tags`, `cache.staleTime`, `cache.gcTime`, `cache.keepPreviousData`, and `policy`.
- `FlowMutationConfig.invalidates` accepts keys, tags, strings, predicate targets, or a function of mutation input and success value.
- Query success records `cache:write` receipts.
- Successful mutation invalidation records `cache:invalidate`, marks matching resources stale, and records `cache:stale` receipts.
- `harness.cache()` exposes `get`, `query`, `stale`, `invalidations`, `writes`, and `snapshot`.
- `flow.view` descriptors record panel and summary projections, and React consumes them through `useView`.

Exit criteria:

- Cache is not just a map; lifecycle semantics are visible and tested.
- React rendering does not become the cache correctness mechanism.
- Public cache write API remains unnecessary unless this example proves otherwise.

## 4. Checkout Or Approval Flow

Purpose: prove structured workflow semantics.

API status: workflow descriptors are now `api-settled` in core. The runtime still executes the flat state subset, but examples can encode state paths, permissions, invariants, schema descriptors, persistence descriptors, and history descriptors without inventing local conventions.

Current implementation slice:

- `examples/checkout-approval-flow` exists as the Example 4 package.
- The machine keeps flat runtime states while carrying nested workflow metadata through state paths, history, permissions, invariants, schema, persistence, and view descriptors.
- Tests prove descriptor shape, draft to review to approved/rejected product flow, denied approval, back/restore behavior, invariant helpers, and persistence select/redact/migrate hooks.
- The UI provides a usable checkout approval surface for quantities, approver assignment, reason entry, submit/back/restore/approve/reject commands.

User workflow:

- move through a multi-step checkout or approval process
- validate step input
- branch on permissions or policy
- return to previous step
- restore draft after refresh
- complete or reject the flow

API surfaces:

| Surface        | What this example should prove                              |
| -------------- | ----------------------------------------------------------- |
| nested states  | Compound state tree, parent fallback, child initial states. |
| final states   | Parent completion behavior.                                 |
| history states | Restore prior child state when returning to a section.      |
| `flow.can`     | Buttons, commands, and route guards use legal-event checks. |
| permissions    | Stub or implement allowed/denied reason metadata.           |
| invariants     | Business rules over state/context/trace.                    |
| `flow.schema`  | Input/context/snapshot validation.                          |
| persistence    | Snapshot version, migration, redaction, restore rules.      |
| router adapter | Stub route binding and can-leave semantics.                 |

Implementation decisions this example must force:

- exact state path representation
- history state semantics copied from or compared against XState
- persisted snapshot shape and what cannot be persisted
- route ownership: router drives machine, machine guards router, or adapter coordinates both

Current feature surface:

- `createStatePath(...)` creates stable state path ids such as `checkout.approval.review`.
- `flow.permission(...)` records permission checks with allowed/denied reason support plus descriptor metadata (`description`, `path`, `event`, `meta`).
- `flow.invariant(...)` records business invariants with severity, message, path, description, and metadata.
- `flow.persist(...)` records snapshot version, select, redact, and migrate contracts.
- `flow.schema(...)` records schema descriptors.
- `flow.history(...)` records history descriptors.
- State nodes can carry `initial`, `states`, `type`, `history`, `permissions`, and `invariants` metadata while the runtime remains on the current flat execution path.

Exit criteria:

- Nested workflow semantics are precise enough to implement beyond strings.
- Persistence shape exists without persisting fibers/scopes/services.
- Permission and invariant features have a real product reason.

## 5. Agent Workspace

Purpose: prove multi-actor runtime and tooling.

API status: core and experimental vocabulary is locked for this example slice. `examples/agent-workspace` consumes `flow.child(...)`, `flow.view(...)`, `useView(...)`, `flowExperimental.graphOf(...)`, `flowExperimental.captureTrace(...)`, `flowExperimental.replayTrace(...)`, `flowTest.model(...)`, `flowTest.fuzz(...)`, `flowExperimental.flowStories(...)`, `flowExperimental.flowTour(...)`, `flowExperimental.createFlowDevtools(...)`, and `flowExperimental.playwrightFlow(...)`.

Current implementation slice:

- `examples/agent-workspace` exists as the Example 5 package.
- The machine demonstrates a parent agent run, streaming progress events, child task spawn/progress/completion/failure, approval and rejection, trace capture, replay cursor movement, graph metadata, test-model metadata, persistence redaction, and a thin React client.
- `flow.child(...)` is runtime-visible as child summary snapshots and child start/stop receipts. It does not execute child machines, mailboxes, or supervision fibers yet.
- Devtools, graph, replay, stories/tours, fuzzing, and Playwright helpers are experimental tooling descriptors/reports that consume machine, snapshot, trace, and receipt contracts instead of hidden runtime state.

User workflow:

- start an agent run
- stream agent progress
- spawn child tasks
- approve or reject proposed actions
- inspect trace
- replay a run shape in tests
- generate stories or graph coverage from the machine

API surfaces:

| Surface           | What this example should prove                                                      |
| ----------------- | ----------------------------------------------------------------------------------- |
| `flow.child`      | Parent/child actor lifecycle, snapshots, completion/failure.                        |
| `flow.view`       | Snapshot projection across parent context, child summaries, resources, and streams. |
| devtools protocol | Trace stream, actor tree, cache, mutations, active invokes.                         |
| graph export      | Machine graph with effects, streams, failures, cache edges.                         |
| graph diff        | PR-readable graph changes.                                                          |
| stories/tours     | Capture representative states and scripted paths.                                   |
| replay            | Trace shape can be validated and partially replayed.                                |
| `flowTest.model`  | Generate or inspect paths from graph metadata.                                      |
| `flowTest.fuzz`   | Bounded event fuzzing with invariant diagnostics.                                   |
| `playwrightFlow`  | Browser-level flow driver shape.                                                    |

Current feature surface:

- Child actor descriptors use `{ kind: "child", config }`, with `id`, child `machine`, typed `input`, `supervision`, `mailbox`, routes, and metadata.
- `flowExperimental.captureTrace(...)` returns a versioned trace session from an actor, snapshot, or manual receipt list, with optional redaction and snapshots.
- `flowExperimental.graphOf(...)` returns machine graph metadata for states, transitions, invokes, child invokes, unsupported state types, and graph diffs.
- `flowExperimental.replayTrace(...)` validates trace shape and reports accepted/rejected deterministic events plus unsupported receipt kinds.
- `flowTest.model(...)` and `flowTest.fuzz(...)` expose model/fuzz reports on the existing fluent test entrypoint.
- `flowExperimental.flowStories(...)`, `flowExperimental.flowTour(...)`, and `flowExperimental.playwrightFlow(...)` are descriptor/report helpers layered on top of the machine/test contracts.
- Approval decisions are ordinary product events: `PROPOSE_ACTION`, `APPROVE_ACTION`, and `REJECT_ACTION`. Approval state is explicit as `awaitingApproval`.
- Replay is trace-id based. Deterministic product events and external stream/child results are separated in metadata.
- Persistence redacts the goal and high-risk trace summaries; it does not persist services, streams, or future child fibers.

Implementation decisions this example must force:

- child actor supervision policy
- trace redaction and versioning
- graph metadata shape
- replay boundary between deterministic machine events and external Effect results
- devtools package boundary

Exit criteria:

- Tooling features are consumers of trace/snapshot/graph contracts, not hidden runtime dependencies.
- Multi-actor state can be rendered without introducing a public atom/store mental model.
- Advanced tests prove real runtime behavior instead of becoming a separate framework.

## Coverage Matrix

| Surface area                        | Covered by                                           |
| ----------------------------------- | ---------------------------------------------------- |
| machine states/events/context       | Todo List, Project Editor, Checkout Or Approval Flow |
| guards/assign/actions/can           | Todo List, Project Editor, Checkout Or Approval Flow |
| Effect invokes and typed failures   | Project Editor, Streaming Upload Manager             |
| query lifecycle/cache/invalidation  | Project Editor, Cached Dashboard                     |
| mutation/concurrency/rollback shape | Project Editor, Cached Dashboard                     |
| streaming/backpressure/cleanup      | Streaming Upload Manager, Agent Workspace            |
| delayed transitions/TestClock       | Streaming Upload Manager                             |
| nested/final/history states         | Checkout Or Approval Flow                            |
| persistence/schema/redaction        | Checkout Or Approval Flow, Agent Workspace           |
| child actors                        | Agent Workspace                                      |
| selectors/batching/view projection  | Todo List, Cached Dashboard, Agent Workspace         |
| graph/devtools/replay/stories       | Agent Workspace                                      |
| test harness/controlled runtime     | All examples                                         |

## Linear Work Plan

1. Write the Todo List aspirational client API and tests.
2. Stub only the exports Todo List imports.
3. Implement the smallest runtime slice needed to make those tests meaningful.
4. Record every missing semantic in Vocs before moving to Project Editor.
5. Repeat for each example, promoting stubs to real behavior only when an example creates pressure.
