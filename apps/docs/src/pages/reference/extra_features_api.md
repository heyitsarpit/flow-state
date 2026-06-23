# Extra Features API

Status: stubbed extension surfaces.

This page keeps extension surfaces visible without pretending their runtime semantics are complete. These features can be stubbed early, but their real behavior must be built on stable graph, trace, snapshot, cache, and test contracts.

## Feature Buckets

| Feature              | Input                      | Output                    | Key properties                               | Why it may matter                 |
| -------------------- | -------------------------- | ------------------------- | -------------------------------------------- | --------------------------------- |
| Devtools             | runtime trace stream       | debugging UI              | machines, cache, mutations, streams, effects | Human debugging and AI handoff.   |
| Graph export         | machine definition         | graph artifact            | states, transitions, effects, cache edges    | Visualization, coverage, docs.    |
| Graph diff           | before/after graphs        | diff report               | added/removed states, changed effects/cache  | PR review.                        |
| Stories              | machine and state fixtures | story gallery             | loading/editing/saving/failure states        | Design review and state coverage. |
| Flow playback        | machine and scripted path  | tour/report/trace         | play, record, capture each state             | Product rehearsal and demos.      |
| Router adapter       | route config and machine   | route binding             | params, canLeave, restore                    | Workflow-aware routing.           |
| Persistence          | actor snapshot and storage | restored workflow         | version, migrate, redact                     | Checkout/editor/agent restore.    |
| Permissions          | event permission policy    | `can`/reason metadata     | buttons, route guards, tests                 | Admin and enterprise workflows.   |
| Invariants           | named predicates           | invariant reports         | state/context/trace checks                   | Business safety rules.            |
| Trace capture        | actor/runtime              | trace session             | events, transitions, effects, cache, streams | Replay and debugging.             |
| Machine explanation  | machine graph              | markdown/json explanation | audience, effects, cache, failures           | AI and human onboarding.          |
| ESLint plugin        | source files               | lint diagnostics          | no raw promises, no workflow `useEffect`     | Codegen and team rails.           |
| Cache contract tests | mutation contract          | contract report           | invalidates/updates/removes                  | Stale UI prevention.              |

## Devtools

| Function             | Input            | Output              | Stub behavior                                 | Runtime dependency                   |
| -------------------- | ---------------- | ------------------- | --------------------------------------------- | ------------------------------------ |
| `createFlowDevtools` | devtools options | devtools controller | Accepts options and documents trace channels. | Stable trace and snapshot contracts. |
| `attach`             | runtime          | devtools session    | Subscribes to trace if available.             | Runtime trace protocol.              |
| `open` / `close`     | none             | UI state            | Controls UI shell only.                       | Devtools app.                        |

Devtools should consume trace receipts. It should not define runtime semantics.

## Graph Features

| Function          | Input                      | Output                          | Stub behavior                         | Runtime dependency             |
| ----------------- | -------------------------- | ------------------------------- | ------------------------------------- | ------------------------------ |
| `graphOf`         | machine and export options | graph object or formatted graph | Returns compiled metadata if present. | Stable machine graph metadata. |
| `diffGraphs`      | before/after graph         | graph diff                      | Reports unsupported graph features.   | Stable graph shape.            |
| `formatGraphDiff` | graph diff                 | markdown/text report            | Formats current diff object.          | PR tooling layer.              |

Graph output should eventually include states, transitions, guards, invoked Effects, queries, mutations, streams, typed failure routes, and cache invalidation contracts.

## Stories And Playback

| Function           | Input                      | Output              | Stub behavior                               | Runtime dependency                      |
| ------------------ | -------------------------- | ------------------- | ------------------------------------------- | --------------------------------------- |
| `flowStories`      | machine and state fixtures | story list          | Lists fixture names and required snapshots. | Stable snapshot/fromState fixtures.     |
| `flowTour`         | machine and scripted path  | tour builder/report | Validates step shape.                       | Runtime trace and controlled steps.     |
| `captureEachState` | tour or machine            | story fixtures      | Reports graph nodes without fixtures.       | Graph traversal and fixture generation. |

These are valuable, but they should be built on top of the test harness, not inside the runtime.

## Router And Persistence

| Function          | Input                              | Output                   | Stub behavior                            | Runtime dependency                           |
| ----------------- | ---------------------------------- | ------------------------ | ---------------------------------------- | -------------------------------------------- |
| `createFlowRoute` | route path, machine, input mapper  | route binding            | Documents route/input/restore contract.  | Route adapter choice and snapshot semantics. |
| `persistFlow`     | actor, storage, version/migrations | persistence subscription | Validates version and redaction options. | Stable snapshot, schema, redaction.          |

Persistence is risky until snapshots are intentionally designed. Do not persist fibers, scopes, service instances, or raw sensitive data.

## Permissions And Invariants

| Feature     | Input                         | Output                | Stub behavior                            | Runtime dependency                 |
| ----------- | ----------------------------- | --------------------- | ---------------------------------------- | ---------------------------------- |
| permissions | event, context, policy        | allowed/denied reason | Returns declared policy metadata.        | Product-specific policy semantics. |
| invariants  | state/context/trace predicate | pass/fail report      | Runs static declarations where possible. | Graph/runtime stability.           |

These can become powerful test/devtools features, but they should not complicate first examples.

## Trace And Explanation

| Function         | Input                               | Output        | Stub behavior                        | Runtime dependency                          |
| ---------------- | ----------------------------------- | ------------- | ------------------------------------ | ------------------------------------------- |
| `captureTrace`   | actor/runtime and redaction options | trace session | Captures current receipt shape.      | Stable event/effect/cache receipt format.   |
| `explainMachine` | machine and audience/options        | explanation   | Summarizes available graph metadata. | Graph metadata and optional AI integration. |

Trace capture is foundational, but production replay and AI explanation must wait until redaction and versioning are serious.

## ESLint And Codegen Rails

Potential rules:

| Rule                                      | Why it may matter                         |
| ----------------------------------------- | ----------------------------------------- |
| `flow/no-raw-promise-in-machine`          | Keep Effect boundaries pure.              |
| `flow/no-use-effect-workflow`             | Prevent React from owning workflow logic. |
| `flow/no-unhandled-effect-failure`        | Keep typed failures visible.              |
| `flow/no-cache-mutation-outside-mutation` | Preserve cache transaction semantics.     |
| `flow/no-unreachable-state`               | Detect dead machine graph nodes.          |
| `flow/require-mutation-invalidation`      | Prevent stale UI bugs.                    |

Useful as team rails once the public API has enough shape. Stub rules can start as docs before an ESLint package exists.

## Core Boundary

These should not define core runtime semantics, but they should stay in the implementation guide as planned extension surfaces:

- devtools UI
- graph diff/export
- stories/tours
- router integration
- persistence
- permissions
- invariants
- production replay
- AI explanation
- ESLint plugin
- Playwright adapter
- public cache write API

## Open Decisions

- Which features consume trace receipts versus snapshots versus graph metadata.
- Whether graph export is custom or borrows XState graph ideas.
- How trace redaction is configured safely.
- Whether explanations are deterministic, AI-assisted, or both.
- Which adapter, if any, gets built first after React.
