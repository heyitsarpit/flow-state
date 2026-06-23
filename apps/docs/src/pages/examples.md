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

User workflow:

- open a project
- load project data
- edit draft fields
- save changes
- handle typed load and save failures
- show dirty/saving/saved/error states
- invalidate or refresh project data after save

API surfaces:

| Surface                  | What this example should prove                                             |
| ------------------------ | -------------------------------------------------------------------------- |
| `createRuntime`          | Runtime owns Effect services, cache, clock, trace, and disposal.           |
| `flow.machine`           | Basic states, events, context, guards, assignments, entry/exit, snapshots. |
| `flow.effect`            | Non-cached Effect work with success, typed failure, defect, interruption.  |
| `flow.query`             | Project load cache key, stale state, refetch, late result behavior.        |
| `flow.mutation`          | Save variables, success/failure routing, invalidation.                     |
| `flow.assign`            | Draft/context updates.                                                     |
| `flow.guard`             | Dirty check, can-save check, conflict handling.                            |
| `flow.action`            | Synchronous trace/local transition receipts only.                          |
| `FlowProvider`           | Runtime injection into React.                                              |
| `useFlow`                | Snapshot rendering and event sending.                                      |
| `useSelector`            | Stable selected draft/save status.                                         |
| `flowTest`               | Harness starts machine and drives product events.                          |
| `createTestLayer`        | Fake project service.                                                      |
| `createControlledEffect` | Controlled load/save success, failure, defect, cancellation.               |
| cache probes             | Assert cache hit, stale, invalidation, late completion behavior.           |

Tests:

| Test area     | Required coverage                                                       |
| ------------- | ----------------------------------------------------------------------- |
| happy path    | load, edit, save, return to clean viewing state                         |
| typed failure | load failure and save failure route to expected states                  |
| defect        | unexpected defect is separated from typed failure                       |
| cancellation  | leaving loading/saving interrupts state-owned work                      |
| cache         | save invalidates project query and active observer refetches            |
| late result   | inactive query/effect result cannot transition current actor generation |
| rendering     | buttons use `can`; selectors avoid unnecessary rerenders                |

Exit criteria:

- Core machine and Effect invoke semantics are no longer speculative.
- Query observer lifecycle has a documented decision.
- Mutation concurrency has at least one chosen default.

## 2. Streaming Upload Manager

Purpose: prove long-running scoped work.

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
| `createControlledStream` | Emit progress, fail, end, assert cancellation.                           |
| `flush` / `settle`       | Deterministic immediate work and bounded quiescence.                     |
| trace receipts           | Stream start, value, failure, completion, interruption, timer fired.     |

Implementation decisions this example must force:

- streaming pressure policy: queue all, coalesce by key, sample, or drop with diagnostics
- whether streamed values update a resource slot, enqueue events, or both
- how retry schedules are represented
- how cancellation appears in snapshot and trace

Exit criteria:

- Streaming lifecycle and cleanup are testable.
- Delayed transitions can be tested without real time.
- High-frequency events do not accidentally flood rendering.

## 3. Cached Dashboard

Purpose: prove cache and subscription semantics under fanout.

User workflow:

- load several dashboard panels
- refresh one panel
- mutate a record that invalidates multiple panels
- keep previous data while refetching
- show stale, fetching, success, and failure states independently

API surfaces:

| Surface         | What this example should prove                                                 |
| --------------- | ------------------------------------------------------------------------------ |
| `flow.query`    | Multiple keys, active/inactive observers, stale time, GC time, dedupe.         |
| `flow.mutation` | Invalidation by key, tag, and predicate.                                       |
| `createKey`     | Deterministic key construction and matching.                                   |
| `createTag`     | Group invalidation without exposing raw cache writes.                          |
| `useSelector`   | Equality and batching across frequent cache updates.                           |
| `flow.view`     | Stub or implement multi-source projection when dashboard composition needs it. |
| cache inspector | Assert writes, invalidations, refetches, stale state, and failure count.       |

Implementation decisions this example must force:

- key hashing and matching rules
- active versus inactive refetch behavior
- structural sharing policy
- notification batching
- whether `flow.view` is needed or `useSelector` is enough

Exit criteria:

- Cache is not just a map; lifecycle semantics are visible and tested.
- React rendering does not become the cache correctness mechanism.
- Public cache write API remains unnecessary unless this example proves otherwise.

## 4. Checkout Or Approval Flow

Purpose: prove structured workflow semantics.

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

Exit criteria:

- Nested workflow semantics are precise enough to implement beyond strings.
- Persistence shape exists without persisting fibers/scopes/services.
- Permission and invariant features have a real product reason.

## 5. Agent Workspace

Purpose: prove multi-actor runtime and tooling.

User workflow:

- start an agent run
- stream agent progress
- spawn child tasks
- approve or reject proposed actions
- inspect trace
- replay a run shape in tests
- generate stories or graph coverage from the machine

API surfaces:

| Surface           | What this example should prove                                        |
| ----------------- | --------------------------------------------------------------------- |
| `flow.child`      | Parent/child actor lifecycle, snapshots, completion/failure.          |
| `flow.view`       | Projection across parent actor, child actors, resources, and streams. |
| devtools protocol | Trace stream, actor tree, cache, mutations, active invokes.           |
| graph export      | Machine graph with effects, streams, failures, cache edges.           |
| graph diff        | PR-readable graph changes.                                            |
| stories/tours     | Capture representative states and scripted paths.                     |
| replay            | Trace shape can be validated and partially replayed.                  |
| `flowTest.model`  | Generate or inspect paths from graph metadata.                        |
| `flowTest.fuzz`   | Bounded event fuzzing with invariant diagnostics.                     |
| `playwrightFlow`  | Browser-level flow driver shape.                                      |

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
