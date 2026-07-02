# Src Reorganization Backlog

This file is the whole-tree de-sloppify and folder-reorganization backlog for
`packages/flow-state/src`.

It is intentionally structural.

The goal is not to add features yet. The goal is to make the source tree match
the export surface and the real ownership boundaries of the library.

It complements:

- [CORE_REACT_DE_SLOPPIFY.md](/Users/arpit/Developer/flow-state/CORE_REACT_DE_SLOPPIFY.md)
- [DE_SLOPPIFY_OPPORTUNITIES.md](/Users/arpit/Developer/flow-state/DE_SLOPPIFY_OPPORTUNITIES.md)
- [INSPECT.md](/Users/arpit/Developer/flow-state/INSPECT.md)
- [TESTING.md](/Users/arpit/Developer/flow-state/TESTING.md)

## Scope

Included:

- the full `packages/flow-state/src` tree
- folder ownership
- file placement
- export-path alignment
- oversized concern buckets
- small-cut wrapper ceremony and naming drift

Excluded:

- actually moving files yet
- package split execution
- docs-site rewrites beyond receipts

## Verification

Architecture proof run:

```sh
pnpm exec vitest run \
  packages/flow-state/src/package-hygiene.test.ts \
  packages/flow-state/src/public-typing-architecture.test.ts \
  packages/flow-state/src/runtime-architecture.test.ts \
  packages/flow-state/src/transaction-architecture.test.ts \
  packages/flow-state/src/diagnostics-architecture.test.ts
```

Result: `5` files passed, `22` tests passed.

## Core Call

The published package surface is already export-path oriented:

- `.`
- `./server`
- `./inspect`
- `./testing`
- `./react`

Receipts:
[packages/flow-state/package.json](/Users/arpit/Developer/flow-state/packages/flow-state/package.json:13),
[package-hygiene.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/package-hygiene.test.ts:54).

The source tree underneath it is not.

The right move is:

- keep the five top-level entry files as thin shims
- stop treating `src/` root as an implementation strip
- reorganize the real code underneath into `core`, `react`, `testing`,
  `shared`, and `utils`

## Target Shape

This target structure is now fixed for Goal 5. Do not improvise a different
tree mid-migration unless the backlog is updated first.

```text
src/
  index.ts
  server.ts
  inspect.ts
  react-entry.ts
  testing.ts

  core/
    api/
    descriptors/
    inspection/
    machines/
    orchestrator/
    runtime/
      contract-runtime.ts
      request-runtime.ts
      services/
    scheduling/
    store/
    streams/
    transactions/

  react/
    flow.ts

  testing/
    fixtures/

  shared/
    contracts.ts
    diagnostics.ts

  utils/
```

Folder ownership decisions:

- `src/` root is only for public entry shims, repo-wide test files, and
  lightweight proof artifacts like `*.snapshots.json` or `*.d.ts`.
- `core/api/` owns public builder assembly plus public-facing library types for
  the core, server, inspect, and testing entrypoints.
- `core/descriptors/` owns descriptor definition and validation logic.
- `core/runtime/` owns runtime boot/disposal assembly; `core/runtime/services/`
  owns runtime-scoped ports and policy services.
- `core/orchestrator/` owns actor lifecycle, child lifecycle, app ownership,
  and transaction/stream reconciliation that currently lives under
  `services/orchestrator-*`.
- `core/store/` owns resource snapshot, hydration, invalidation, patching, and
  selection primitives; it should not also become a dumping ground for runtime
  service wrappers.
- `core/machines/`, `core/streams/`, `core/transactions/`, and
  `core/inspection/` own their respective execution engines and helpers.
- `core/scheduling/` owns delayed-work and ready-work primitives only.
- `react/` owns React-only adapters, hooks, sources, and React-specific
  diagnostics.
- `testing/` owns the harness, controlled helpers that survive, testing models,
  pending-work helpers, and runtime test fixtures.
- `shared/` is intentionally tiny and only holds cross-cutting contracts and
  diagnostics that are truly used across several ownership areas.
- `utils/` is intentionally tiny and only for low-level generic helpers like
  queues, not domain-shaped runtime code.

Important rules:

- `core`, `react`, and `testing` are folders, not separate packages yet.
- root files are entry shims, not implementation owners.
- Goal 5 may move files to this structure, but it must not change public import
  paths or runtime semantics on its own.

Binding phase order for Goal 5:

1. Phase 1. Make the root boring.
2. Phase 2. Dissolve `public/`.
3. Phase 3. Split core by real ownership.
4. Then continue with later cleanup phases in order.

## Phase 1. Make The Root Boring

- [x] Keep only entry shims at `src/` root.
      Why: the root currently mixes public entrypoints with implementation files
      like
      [transaction-inspection-facts.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/transaction-inspection-facts.ts).
      Receipt:
      [public-typing-architecture.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public-typing-architecture.test.ts:238)
      now proves the moved ownership seams stay out of `src/` root, and the
      live root file list contains only entry shims, repo-wide tests, and
      lightweight proof artifacts.
      Progress landed:
  - [x] `flow-paths.ts` -> `core/machines/flow-paths.ts`
        Receipt:
        [core/machines/flow-paths.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/machines/flow-paths.ts:1)
        now owns the shared machine-path traversal helper that
        `graph-descriptor.ts` and `testing/flow-model.ts` both consume.
  - [x] `graph-descriptor.ts` -> `core/inspection/graph-descriptor.ts`
        Receipt:
        [core/inspection/graph-descriptor.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/graph-descriptor.ts:1)
        now owns the inspect-route graph descriptor implementation consumed by
        [core/inspection/inspect.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/inspect.ts:24).
  - [x] `inspection-format.ts` -> `core/inspection/inspection-format.ts`
        Receipt:
        [core/inspection/inspection-format.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/inspection-format.ts:1)
        now owns the inspect-route formatting helper consumed by
        [core/inspection/inspect.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/inspect.ts:30)
        and
        [core/inspection/inspection-local-proof.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/inspection-local-proof.ts:6).
  - [x] `inspection-local-proof.ts` -> `core/inspection/inspection-local-proof.ts`
        Receipt:
        [core/inspection/inspection-local-proof.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/inspection-local-proof.ts:1)
        now owns the inspect-route local-proof helper consumed by
        [core/inspection/inspect.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/inspect.ts:37).
  - [x] `inspection-semantic-summary.ts` ->
        `core/inspection/inspection-semantic-summary.ts`
        Receipt:
        [core/inspection/inspection-semantic-summary.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/inspection-semantic-summary.ts:1)
        now owns the inspect-route semantic-summary helper consumed by
        [core/inspection/inspect.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/inspect.ts:39).
  - [x] `inspection-events.ts` -> `core/inspection/inspection-events.ts`
        Receipt:
        [core/inspection/inspection-events.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/inspection-events.ts:1)
        now owns the inspect-route event filtering, export, and ownership
        stamping helpers consumed by
        [core/runtime/services/inspection.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/runtime/services/inspection.ts:3),
        [core/orchestrator/orchestrator-system.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator/orchestrator-system.ts:15),
        [inspection-retention.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/inspection-retention.ts:4),
        and
        [inspection-sink.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/inspection-sink.ts:1).
  - [x] `inspection-sink.ts` -> `core/inspection/inspection-sink.ts`
        Receipt:
        [core/inspection/inspection-sink.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/inspection-sink.ts:1)
        now owns the inspect-route history catchup and sink-attachment helper
        consumed by
        [core/inspection/inspect.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/inspect.ts:25).
  - [x] `inspection-retention.ts` -> `core/inspection/inspection-retention.ts`
        Receipt:
        [core/inspection/inspection-retention.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/inspection-retention.ts:1)
        now owns the inspect-route retention normalization, pruning, and
        snapshot helpers consumed by
        [core/runtime/services/inspection.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/runtime/services/inspection.ts:9).
  - [x] `inspection-observer.ts` -> `core/inspection/inspection-observer.ts`
        Receipt:
        [core/inspection/inspection-observer.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/inspection-observer.ts:1)
        now owns the inspect-route observer normalization helper consumed by
        [core/inspection/inspection-sink.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/inspection-sink.ts:1)
        and
        [core/runtime/services/inspection.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/runtime/services/inspection.ts:8).
  - [x] `inspection-subscription.ts` -> `core/inspection/inspection-subscription.ts`
        Receipt:
        [core/inspection/inspection-subscription.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/inspection-subscription.ts:1)
        now owns the inspect-route unsubscribe wrapper consumed by
        [core/inspection/inspection-sink.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/inspection-sink.ts:5),
        [core/runtime/services/inspection.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/runtime/services/inspection.ts:15),
        and
        [inspection-sink.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/inspection-sink.test.ts:10).
  - [x] `machine-transition-inspection.ts` ->
        `core/inspection/machine-transition-inspection.ts`
        Receipt:
        [core/inspection/machine-transition-inspection.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/machine-transition-inspection.ts:1)
        now owns the inspect-route transition, microstep, action, and
        no-transition analysis helpers consumed by
        [core/inspection/inspect.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/inspect.ts:45).
  - [x] `story-doc.ts` -> `core/inspection/story-doc.ts`
        Receipt:
        [core/inspection/story-doc.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/story-doc.ts:1)
        now owns the inspect-route story-document helper consumed by
        [core/inspection/inspect.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/inspect.ts:50).
  - [x] `story-coverage.ts` -> `core/inspection/story-coverage.ts`
        Receipt:
        [core/inspection/story-coverage.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/story-coverage.ts:1)
        now owns the inspect-route story-coverage helper consumed by
        [core/inspection/graph-descriptor.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/graph-descriptor.ts:22).
  - [x] `trace-artifact.ts` -> `core/inspection/trace-artifact.ts`
        Receipt:
        [core/inspection/trace-artifact.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/trace-artifact.ts:1)
        now owns the inspect-route trace artifact import/export and gzip helper
        consumed by
        [core/inspection/inspect.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/inspect.ts:52)
        and
        [core/inspection/inspection-local-proof.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/inspection-local-proof.ts:8).
  - [x] `trace-incident-summary.ts` ->
        `core/inspection/trace-incident-summary.ts`
        Receipt:
        [core/inspection/trace-incident-summary.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/trace-incident-summary.ts:1)
        now owns the inspect-route trace summary helper consumed by
        [core/inspection/inspect.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/inspect.ts:59)
        and
        [core/inspection/inspection-format.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/inspection-format.ts:9).
  - [x] `trace-diff.ts` -> `core/inspection/trace-diff.ts`
        Receipt:
        [core/inspection/trace-diff.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/trace-diff.ts:1)
        now owns the inspect-route trace diff helper consumed by
        [core/inspection/inspect.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/inspect.ts:58).
  - [x] `trace-actor-hierarchy.ts` -> `core/inspection/trace-actor-hierarchy.ts`
        Receipt:
        [core/inspection/trace-actor-hierarchy.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/trace-actor-hierarchy.ts:1)
        now owns the inspect-route actor tree helper consumed by
        [core/inspection/trace-descriptor.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/trace-descriptor.ts:3)
        and
        [testing/flow-test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/testing/flow-test.ts:82).
  - [x] `trace-descriptor.ts` -> `core/inspection/trace-descriptor.ts`
        Receipt:
        [core/inspection/trace-descriptor.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/trace-descriptor.ts:1)
        now owns the inspect-route trace capture helper consumed by
        [core/inspection/inspect.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/inspect.ts:57),
        [core/inspection/trace-artifact.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/trace-artifact.ts:10),
        and
        [testing/flow-stories.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/testing/flow-stories.ts:15).
  - [x] `trace-correlation-details.ts` ->
        `core/inspection/trace-correlation-details.ts`
        Receipt:
        [core/inspection/trace-correlation-details.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/trace-correlation-details.ts:1)
        now owns the inspect-route correlation detail helper consumed by
        [core/inspection/trace-report.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/trace-report.ts:16).
  - [x] `child-lifecycle-inspection-facts.ts` ->
        `core/orchestrator/child-lifecycle-inspection-facts.ts`
        Receipt:
        [core/orchestrator/child-lifecycle-inspection-facts.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator/child-lifecycle-inspection-facts.ts:1)
        now owns the child-lifecycle receipt fact helper consumed by
        [core/orchestrator/orchestrator-system.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator/orchestrator-system.ts:10)
        and
        [testing/flow-test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/testing/flow-test.ts:9).
  - [x] `stream-timer-inspection-facts.ts` ->
        `core/orchestrator/stream-timer-inspection-facts.ts`
        Receipt:
        [core/orchestrator/stream-timer-inspection-facts.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator/stream-timer-inspection-facts.ts:1)
        now owns the stream/timer receipt fact helpers consumed by
        [core/orchestrator/orchestrator-streams-timers.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator/orchestrator-streams-timers.ts:29),
        [core/orchestrator/orchestrator-system.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator/orchestrator-system.ts:49),
        and
        [testing/flow-test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/testing/flow-test.ts:104).
  - [x] `transaction-inspection-facts.ts` ->
        `core/orchestrator/transaction-inspection-facts.ts`
        Receipt:
        [core/orchestrator/transaction-inspection-facts.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator/transaction-inspection-facts.ts:1)
        now owns the transaction receipt fact helpers and overlap-cause type
        consumed by
        [core/orchestrator/orchestrator-transaction-preview.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator/orchestrator-transaction-preview.ts:8),
        [core/orchestrator/orchestrator-transaction-completion.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator/orchestrator-transaction-completion.ts:11),
        [core/orchestrator/orchestrator-transaction-start.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator/orchestrator-transaction-start.ts:8),
        [core/orchestrator/orchestrator-transaction-recovery.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator/orchestrator-transaction-recovery.ts:3),
        [core/orchestrator/orchestrator-transaction-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator/orchestrator-transaction-types.ts:17),
        and
        [testing/flow-test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/testing/flow-test.ts:111).

- [x] Move runtime-only test helpers out of the root.
      Target:
      `src/testing/fixtures/runtime-test-fixtures.ts`
      Receipt:
      [runtime-test-fixtures.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/testing/fixtures/runtime-test-fixtures.ts)
      is runtime-test-only support.

- [x] Keep architecture tests proving the top-level export shims stay isolated.
      Receipt:
      [public-typing-architecture.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public-typing-architecture.test.ts:52).

## Phase 2. Dissolve `public/`

- [x] Remove `public/` as a top-level dumping ground.
      Why: it currently holds three different concerns:
      core DSL assembly in
      [public/flow-core.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/flow-core.ts:39),
      React-facing `flow.use*` wrappers in
      [public/flow.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/flow.ts:10),
      and inspect helpers in
      [public/inspect.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/inspect.ts:10).
      Completion note:
      `src/public/` now has no files, while the former concerns now live under
      [core/api/app-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/app-types.ts:36),
      [react/flow.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/react/flow.ts:1),
      and
      [core/inspection/inspect.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/inspect.ts:1).

- [x] Move core-facing API builders and public types under `core/api/`.
      Candidates:
  - `flow-core.ts`
  - `inspect-types.ts`
  - `keys.ts`
  - `types.ts`
  - `testing-types.ts`
  - `app-types.ts`
  - `data-types.ts`
  - `machine-types.ts`
    Progress landed:
  - [x] `flow-core.ts` -> `core/api/flow-core.ts`
  - [x] `data-types.ts` -> `core/api/data-types.ts`
  - [x] `inspect-types.ts` -> `core/api/inspect-types.ts`
  - [x] `keys.ts` -> `core/api/keys.ts`
  - [x] `machine-types.ts` -> `core/api/machine-types.ts`
  - [x] `testing-types.ts` -> `core/api/testing-types.ts`
  - [x] `types.ts` -> `core/api/types.ts`
  - [x] `app-types.ts` -> `core/api/app-types.ts`

- [x] Move `public/flow.ts` under `react/flow.ts`.
      Receipt:
      [react-entry.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/react-entry.ts:1)
      already proves this file is a React concern.

- [x] Move `public/inspect.ts` under a core inspection folder.
      Candidate:
      `core/inspection/inspect.ts`

- [x] Split `public/app-types.ts` by export-path ownership instead of keeping
      one giant shared type bucket.
      Receipts:
      [core/api/app-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/app-types.ts:195)
      now keeps only the app/runtime/story-input contracts that still span
      multiple non-root entrypoints,
      [core/api/types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/types.ts:1)
      now re-exports that bucket through `./app-types.js`, and
      [public-typing-architecture.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public-typing-architecture.test.ts:81)
      now proves `./public/app-types.ts` is gone.
      Progress landed:
  - [x] inspect-owned `FlowStoryDoc*`, `FlowStoryCoverage*`, and
        `FlowStoriesDescriptor` now live under
        [core/api/inspect-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/inspect-types.ts:988),
        while
        [core/api/app-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/app-types.ts:264)
        keeps the shared `FlowStory*` input shapes.
  - [x] inspect-owned `FlowGraph*`, `FlowTrace*`, and
        `FlowLocalInspectionProof` now live under
        [core/api/inspect-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/inspect-types.ts:459),
        while
        [core/api/app-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/app-types.ts:36)
        now keeps the app/runtime/story-input contracts that still belong on
        the non-inspect routes.
  - [x] testing-owned `FlowTest*`, `FlowModel*`, and
        `FlowRehydratedTestHarness` now live under
        [core/api/testing-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/testing-types.ts:34),
        while
        [core/api/app-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/app-types.ts:36)
        now keeps the app/runtime/story-input contracts that still belong on
        the non-testing routes.
  - [x] the remaining app/runtime/story-input bucket now lives under
        [core/api/app-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/app-types.ts:36),
        [core/api/app-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/app-types.ts:195),
        and
        [core/api/app-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/app-types.ts:264),
        while
        [core/api/types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/types.ts:3)
        re-exports `./app-types.js` and
        [public-typing-architecture.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public-typing-architecture.test.ts:111)
        proves `./public/app-types.ts` no longer exists.

## Phase 3. Split Core By Real Ownership

- [x] Create `core/orchestrator/` and move `services/orchestrator-*` plus
      `app-ownership.ts` there.
      Why: `services/` is overloaded and currently mixes orchestrator
      implementation with runtime ports and policies.
      Receipt:
      [core/orchestrator](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator),
      [transaction-architecture.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/transaction-architecture.test.ts:8),
      and
      [runtime-architecture.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/runtime-architecture.test.ts:11).

- [x] Create `core/runtime/services/` for runtime ports and policy services.
      Candidates:
  - `host-signal-source.ts`
  - `host-signals.ts`
  - `notification-scheduler.ts`
  - `resource-store.ts`
  - `runtime-policy.ts`
  - `trace.ts`
  - `inspection.ts`
    Receipt:
    [core/runtime/services/host-signal-source.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/runtime/services/host-signal-source.ts),
    [core/runtime/services/host-signals.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/runtime/services/host-signals.ts),
    [core/runtime/services/notification-scheduler.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/runtime/services/notification-scheduler.ts),
    [core/runtime/services/resource-store.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/runtime/services/resource-store.ts),
    [core/runtime/services/runtime-policy.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/runtime/services/runtime-policy.ts),
    [core/runtime/services/trace.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/runtime/services/trace.ts),
    and
    [core/runtime/services/inspection.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/runtime/services/inspection.ts)

- [x] Create `core/machines/`.
      Move:
  - `machine-transition.ts`
    Receipt:
    [core/machines/machine-transition.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/machines/machine-transition.ts)

- [x] Create `core/streams/`.
      Move:
  - `controlled-stream-source.ts`
  - `stream-callbacks.ts`
  - `stream-route.ts`
    Receipt:
    [core/streams/controlled-stream-source.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/streams/controlled-stream-source.ts),
    [core/streams/stream-callbacks.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/streams/stream-callbacks.ts),
    and
    [core/streams/stream-route.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/streams/stream-route.ts)

- [x] Create `core/transactions/`.
      Move:
  - `transaction-callbacks.ts`
  - `transaction-invalidation.ts`
  - `transaction-outcome.ts`
  - `transaction-outcome-callbacks.ts`
    Receipt:
    [core/transactions/transaction-callbacks.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/transactions/transaction-callbacks.ts),
    [core/transactions/transaction-invalidation.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/transactions/transaction-invalidation.ts),
    [core/transactions/transaction-outcome.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/transactions/transaction-outcome.ts),
    and
    [core/transactions/transaction-outcome-callbacks.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/transactions/transaction-outcome-callbacks.ts)

- [x] Create `core/inspection/`.
      Move:
  - `inspection-receipts.ts`
  - `receipt-correlation.ts`
  - `receipt-summary.ts`
  - `trace-report.ts`
    Receipt:
    [core/inspection/inspection-receipts.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/inspection-receipts.ts),
    [core/inspection/receipt-correlation.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/receipt-correlation.ts),
    [core/inspection/receipt-summary.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/receipt-summary.ts),
    and
    [core/inspection/trace-report.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/inspection/trace-report.ts)

- [x] Create `core/scheduling/`.
      Move:
  - `delayed-work.ts`
  - `ready-work.ts`
    Receipt:
    [core/scheduling/delayed-work.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/scheduling/delayed-work.ts)
    and
    [core/scheduling/ready-work.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/scheduling/ready-work.ts)
    Why: these are runtime scheduling primitives, not generic utils.

- [x] Keep `core/store/` but tighten its boundary.
      Why: today store internals are real, but they are mixed with duplicated
      metadata and some naming drift.
      Completion note:
      [core/store/resource-store-memory.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/store/resource-store-memory.ts:110),
      [core/store/resource-snapshot.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/store/resource-snapshot.ts:26),
      [core/store/invalidation.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/store/invalidation.ts:1),
      [core/store/resource-patch.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/store/resource-patch.ts:1),
      and
      [core/store/selection-source.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/store/selection-source.ts:15)
      now sit under one canonical `core/store/` owner,
      [core/store/selection-source.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/store/selection-source.test.ts:1)
      moved with that owner, and
      [runtime-architecture.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/runtime-architecture.test.ts:70)
      now proves the old root `src/store/*.ts` bucket is gone.

## Phase 4. Attack The Biggest Concern Buckets

- [x] Split
      [core/orchestrator/orchestrator-system.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator/orchestrator-system.ts:112).
      Why: `createContractActor` currently owns controller wiring, child lifecycle,
      state-owned work reconciliation, flush/dispose, and actor API assembly in one
      file.
      Progress landed:
  - [x] child actor ownership now lives under
        [core/orchestrator/orchestrator-children.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator/orchestrator-children.ts:92),
        while
        [core/orchestrator/orchestrator-system.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator/orchestrator-system.ts:224)
        keeps the remaining controller wiring plus state-owned reconciliation and
        [runtime-architecture.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/runtime-architecture.test.ts:78)
        now proves the parent file no longer owns the `ownedChildren` registry
        or the child attach/start loops directly.
  - [x] actor snapshot and inspection receipt plumbing now lives under
        [core/orchestrator/orchestrator-inspection.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator/orchestrator-inspection.ts:34),
        while
        [core/orchestrator/orchestrator-system.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator/orchestrator-system.ts:151)
        keeps the remaining controller wiring and
        [runtime-architecture.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/runtime-architecture.test.ts:91)
        now proves the parent file no longer owns the inspection receipt
        annotation or correlation counter plumbing directly.
  - [x] registry ownership plus the `start/get/stop/stopAll` surface now lives
        under
        [core/orchestrator/orchestrator-registry.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator/orchestrator-registry.ts:68),
        while
        [core/orchestrator/orchestrator-system.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator/orchestrator-system.ts:413)
        keeps only the runtime-service wiring and
        [runtime-architecture.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/runtime-architecture.test.ts:104)
        now proves the parent file no longer owns the recursive registration
        helper or the `OrchestratorSystem.start(...)` implementation directly.
  - [x] transaction ownership now lives under
        [core/orchestrator/orchestrator-transaction-ownership.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator/orchestrator-transaction-ownership.ts:13),
        while
        [core/orchestrator/orchestrator-system.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator/orchestrator-system.ts:260)
        keeps only the transaction helper wiring and
        [runtime-architecture.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/runtime-architecture.test.ts:121)
        now proves the parent file no longer owns the state-owned transaction
        start loop or the actor-facing `transaction:reset` path directly.
  - [x] streams and timers ownership now lives under
        [core/orchestrator/orchestrator-stream-timer-ownership.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator/orchestrator-stream-timer-ownership.ts:75),
        while
        [core/orchestrator/orchestrator-system.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator/orchestrator-system.ts:280)
        keeps only the helper wiring and
        [runtime-architecture.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/runtime-architecture.test.ts:140)
        now proves the parent file no longer owns the timer-fire transition
        callback or direct `createStreamTimerController(...)` wiring.
  - [x] actor lifecycle and API assembly now lives under
        [core/orchestrator/orchestrator-actor-lifecycle.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator/orchestrator-actor-lifecycle.ts:68),
        while
        [core/orchestrator/orchestrator-system.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator/orchestrator-system.ts:143)
        keeps controller wiring plus state-owned reconciliation and
        [runtime-architecture.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/runtime-architecture.test.ts:61)
        now proves the parent file no longer owns listener bookkeeping or the
        Effect-native actor `flush`/`dispose` lifecycle paths directly.

- [x] Split
      [core/store/resource-store-memory.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/store/resource-store-memory.ts:110).
      Why: it currently owns subscription registry, online pause/resume,
      mutation/hydration, and the lookup engine.
      Progress landed:
  - [x] the lookup engine plus online pause/resume gate now live under
        [core/store/resource-store-lookups.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/store/resource-store-lookups.ts:70),
        while
        [core/store/resource-store-memory.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/store/resource-store-memory.ts:179)
        wires that helper into the remaining store assembly and
        [runtime-architecture.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/runtime-architecture.test.ts:76)
        now proves the parent file no longer owns the in-flight lookup maps or
        `performLookup(...)` loop directly.
  - [x] the seed/hydrate/patch/invalidate state-write loops now live under
        [core/store/resource-store-state-updates.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/store/resource-store-state-updates.ts:33),
        while
        [core/store/resource-store-memory.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/store/resource-store-memory.ts:194)
        keeps the remaining selection/subscription assembly and
        [runtime-architecture.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/runtime-architecture.test.ts:89)
        now proves those write loops no longer live in the parent file.
  - [x] the selection cache plus active subscription registry now live under
        [core/store/resource-store-subscriptions.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/store/resource-store-subscriptions.ts:31),
        while
        [core/store/resource-store-memory.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/store/resource-store-memory.ts:181)
        now just wires the focused helpers together and
        [runtime-architecture.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/runtime-architecture.test.ts:102)
        proves the parent file no longer owns the selection cache or active
        subscription maps directly.
        Completion note:
        `resource-store-memory.ts` now delegates its three previously mixed
        concern buckets to
        `resource-store-lookups.ts`,
        `resource-store-state-updates.ts`,
        and
        `resource-store-subscriptions.ts`,
        leaving the parent file as the small assembly/read-surface owner.

- [x] Split
      [core/orchestrator/orchestrator-streams-timers.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator/orchestrator-streams-timers.ts:57)
      into stream ownership and timer/after ownership.
      Progress landed:
  - [x] timer and after ownership now lives under
        [core/orchestrator/orchestrator-after-timer-ownership.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator/orchestrator-after-timer-ownership.ts:79),
        while
        [core/orchestrator/orchestrator-streams-timers.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator/orchestrator-streams-timers.ts:57)
        now keeps the remaining stream ownership path and
        [runtime-architecture.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/runtime-architecture.test.ts:146)
        proves the parent file no longer owns the delayed-work timer maps or
        `startStateOwnedAfters(...)` implementation directly.
  - [x] stream ownership now lives under
        [core/orchestrator/orchestrator-stream-ownership.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator/orchestrator-stream-ownership.ts:73),
        while
        [core/orchestrator/orchestrator-streams-timers.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator/orchestrator-streams-timers.ts:57)
        now just assembles the focused stream and timer helpers and
        [runtime-architecture.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/runtime-architecture.test.ts:147)
        proves the parent file no longer owns the stream registry,
        `startStateOwnedStreams(...)`, or direct stream subscription wiring.

- [ ] Split
      [testing/flow-test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/testing/flow-test.ts:290)
      so testing architecture matches the stricter runtime decomposition standard.
      Why: it currently owns harness bootstrap, stream/timer runtime, transaction
      preview/rollback/invalidation, pending-work inspection, and the builder API.
      Progress landed:
  - [x] stream ownership now lives under
        [testing/flow-test-stream-ownership.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/testing/flow-test-stream-ownership.ts:87),
        while
        [testing/flow-test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/testing/flow-test.ts:523)
        now delegates the state-owned stream lifecycle to the focused helper and
        keeps only harness assembly plus the pending-work read surface, with
        [public-typing-architecture.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public-typing-architecture.test.ts:399)
        proving the testing seam owns the direct stream callback and
        controlled-stream wiring.
  - [x] timer and after ownership now lives under
        [testing/flow-test-after-timer-ownership.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/testing/flow-test-after-timer-ownership.ts:101),
        while
        [testing/flow-test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/testing/flow-test.ts:520)
        now delegates delayed-work timer lifecycle ownership to the focused
        helper and keeps only harness assembly plus pending-work consumption of
        the active timer entries, with
        [public-typing-architecture.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public-typing-architecture.test.ts:414)
        proving the testing seam owns the active timer registry,
        `startStateOwnedAfters(...)`, `createDelayedWorkPlan(...)`, and timer
        interrupt/fire receipt wiring.

- [ ] Split
      [machine-transition.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/machine-transition.ts:89)
      between config readers, receipt helpers, transition application, and
      microstep runtime.

## Phase 5. Shared And Utils Cleanup

- [x] Rename `shared-contracts.ts` to `shared/contracts.ts` and prune it.
      Receipt:
      [shared/contracts.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/shared/contracts.ts:1)
      now owns only `SelectionSource` and `FlowConcurrencyPolicy`, and the
      dead leftovers `FlowOperationLane`, `FlowOperationOutcome`,
      `FlowRegistry`, and `FlowTestControls` were removed with the old file.

- [x] Move `diagnostics.ts` to `shared/diagnostics.ts`.
      Receipt:
      [shared/diagnostics.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/shared/diagnostics.ts:1)
      now owns the shared diagnostic surface consumed across descriptors, runtime,
      store, services, React, and tests.

- [x] Keep `utils/` very small and honest.
      Receipt:
      [utils/fifo-queue.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/utils/fifo-queue.ts:1)
      now holds the queue helper, while domain-shaped runtime code stays outside
      `utils/`.

- [x] Reconsider
      `store/notification-batch.ts`.
      Receipt:
      [resource-store.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/resource-store.test.ts:1)
      now imports TanStack `batch` directly for its test-only batching need, and
      the store-owned passthrough file was removed.

## Phase 6. Remove Small-Cut Slop

- [x] Rename or consolidate `selection-source.ts` and `selected-source.ts`.
      Receipt:
      [selection-source.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/store/selection-source.ts:15)
      now owns writable creation plus `selectSource`/`deriveSource`, and
      [selection-source.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/store/selection-source.test.ts:1)
      proves that consolidated surface after removing `selected-source.ts`.

- [x] Stop repeating internal service type aliases.
      Receipt:
      [orchestrator-transaction-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator/orchestrator-transaction-types.ts:28)
      now owns `ResourceStoreService`, and
      [orchestrator-resources.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator/orchestrator-resources.ts:28)
      plus
      [orchestrator-system.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator/orchestrator-system.ts:72)
      import that shared alias instead of re-declaring it.

- [x] Reduce tiny wrapper file sprawl where the only job is “call pure helper,
      wrap diagnostic”.
      Progress landed:
  - `stream-route.ts` folded into
    [core/streams/stream-callbacks.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/streams/stream-callbacks.ts:1),
    removing the extra wrapper file while keeping route resolution exported from
    the canonical stream callback owner.
  - `transaction-outcome.ts` folded into
    [core/transactions/transaction-outcome-callbacks.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/transactions/transaction-outcome-callbacks.ts:1),
    keeping the pure route helper exported from the canonical diagnostics owner.
  - `view-callbacks.ts` folded into
    [core/api/flow-core.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/flow-core.ts:111),
    keeping view selection diagnostics on the canonical `selectView(...)`
    owner instead of a one-export wrapper file.
  - `machine-callbacks.ts` folded into
    [descriptors/machine.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/descriptors/machine.ts:4)
    for context-factory diagnostics and
    [core/machines/machine-transition.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/machines/machine-transition.ts:84)
    for transition/action diagnostics, leaving each callback path on its
    canonical owner.

- [x] Collapse duplicated invalidation paths.
      Receipt:
      [core/orchestrator/orchestrator-transaction-invalidation.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator/orchestrator-transaction-invalidation.ts:37)
      now owns the shared invalidation application loop used by both
      [core/orchestrator/orchestrator-transaction-completion.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator/orchestrator-transaction-completion.ts:13)
      and
      [core/orchestrator/orchestrator-resources.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator/orchestrator-resources.ts:20),
      while
      [core/transactions/transaction-invalidation.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/transactions/transaction-invalidation.ts:24)
      remains the pure target/ref resolution owner and
      [core/store/resource-snapshot.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/store/resource-snapshot.ts:70)
      remains the public freshness/status owner.

## Phase 7. API And Naming Cleanup That Affects The Tree

- [x] Remove one `flow.app(...)` assembly form.
      Receipt:
      [core/api/flow-core.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/flow-core.ts:91)
      now accepts only the config-object form, and
      [public-api-types.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public-api-types.test.ts:293)
      proves the rest-arg form is rejected.
      Why: this is not just API cleanup; it also simplifies the folder and type
      ownership story.

- [x] Keep `flow.module(id, inventory, meta?)` as the only supported authoring
      form.
      Receipt:
      [core/api/flow-core.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/flow-core.ts:183)
      accepts the direct inventory object only,
      [public-api-types.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public-api-types.test.ts:1940)
      proves the factory form is rejected, and
      [apps/docs/src/pages/concepts.md](/Users/arpit/Developer/flow-state/apps/docs/src/pages/concepts.md:30)
      plus
      [apps/docs/src/pages/guide/app-structure.md](/Users/arpit/Developer/flow-state/apps/docs/src/pages/guide/app-structure.md:47)
      now teach the object form consistently.
      Why: this keeps the module assembly story aligned with the real type
      surface while avoiding function-shaped APIs that imply laziness.

- [x] Stop treating inspect/testing separation as wrapper-only.
      Receipts:
      [inspect.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/inspect.ts:1),
      [testing.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/testing.ts:1),
      [core/api/app-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/app-types.ts:195).
      Why: each export path should own more of its types and helpers directly.
      Progress landed:
  - `FlowRuntimeInspection` now lives under
    [core/api/inspect-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/inspect-types.ts:55)
    instead of `public/app-types.ts`, and
    [public-typing-architecture.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public-typing-architecture.test.ts:83)
    now proves the app-type bucket no longer owns that inspect-only handle type.
  - `FlowRehydratedTestHarness` now lives under
    [core/api/testing-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/testing-types.ts:371)
    instead of `public/app-types.ts`, and
    [testing.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/testing.ts:38)
    now re-exports that testing-only handle directly from the testing-owned
    type module.
  - `FlowTestChildTreeNode`, `FlowTestChildTree`, `FlowTestChildSummary`, and
    `FlowTestProgressBounds` now live under
    [core/api/testing-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/testing-types.ts:34)
    instead of `public/app-types.ts`, and
    [testing.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/testing.ts:36)
    now re-exports those testing-only helper types from the testing-owned type
    module.
  - `FlowTestCache`, `FlowTestTransactions`, and `FlowTestTimers` now live
    under
    [core/api/testing-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/testing-types.ts:74)
    instead of `public/app-types.ts`, and
    [testing.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/testing.ts:32)
    now re-exports those harness-only inspector helper types from the
    testing-owned type module.
  - `FlowTestPendingMailbox`, `FlowTestPendingTimer`,
    `FlowTestPendingChild`, and `FlowTestPendingWork` now live under
    [core/api/testing-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/testing-types.ts:96)
    instead of `public/app-types.ts`, and
    [testing.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/testing.ts:32)
    now re-exports those pending-work helper types from the testing-owned type
    module.
  - `FlowStoryRunBlockedReason`, `FlowStoryRunBlocked`,
    `FlowStoryRunResult`, `FlowStoryRunOutcome`, `FlowStoryTestCheckKind`,
    `FlowStoryTestCheck`, and `FlowStoryTestReport` now live under
    [core/api/testing-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/testing-types.ts:126)
    instead of `public/app-types.ts`, and
    [testing.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/testing.ts:26)
    now re-exports those story execution result types from the testing-owned
    type module.
  - `FlowModelStep`, `FlowModelPath`, and `FlowModelTraversalOptions` now
    live under
    [core/api/testing-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/testing-types.ts:183)
    instead of `public/app-types.ts`, and
    [testing.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/testing.ts:26)
    now re-exports those raw model-path helper types from the testing-owned
    type module.
  - `FlowModelDescriptor` and `FlowModelReplayConfig` now live under
    [core/api/testing-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/testing-types.ts:221)
    instead of `public/app-types.ts`, and
    [testing.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/testing.ts:13)
    now re-exports those model descriptor types from the testing-owned type
    module.
  - `FlowTestHarness`, `FlowStartedTestBuilder`, and `FlowTestBuilder` now
    live under
    [core/api/testing-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/testing-types.ts:269)
    instead of `public/app-types.ts`, and
    [testing.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/testing.ts:13)
    now re-exports those harness and builder types from the testing-owned type
    module.
    Completion note: `core/api/app-types.ts` now keeps only the shared
    app/runtime/story-input contracts, while `testing.ts` directly owns the
    public testing-route type surface via `core/api/testing-types.ts`.

- [x] Remove stale “staged entrypoint” language while doing the file moves.
      Receipts:
      [public-typing-architecture.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public-typing-architecture.test.ts:81),
      [apps/docs/src/pages/reference/inspection.md](/Users/arpit/Developer/flow-state/apps/docs/src/pages/reference/inspection.md:3),
      [IMPLEMENTATION.md](/Users/arpit/Developer/flow-state/IMPLEMENTATION.md:54).
      Completion note: the cited files now describe concrete owned entrypoints
      and current proof boundaries without any staged-entrypoint framing.

## Suggested Move Map

- `src/public/flow.ts` -> `src/react/flow.ts`
- `src/public/inspect.ts` -> `src/core/inspection/inspect.ts`
- `src/public/{flow-core,keys,types,app-types,data-types,machine-types}.ts`
  -> `src/core/api/*`
- `src/machine-transition.ts`
  -> `src/core/machines/*`
- `src/{stream-callbacks,controlled-stream-source}.ts`
  -> `src/core/streams/*`
- `src/{transaction-callbacks,transaction-invalidation,transaction-outcome,transaction-outcome-callbacks}.ts`
  -> `src/core/transactions/*`
- `src/{inspection-receipts,receipt-correlation,receipt-summary,trace-report}.ts`
  -> `src/core/inspection/*`
- `src/{ready-work,delayed-work}.ts`
  -> `src/core/scheduling/*`
- `src/shared-contracts.ts` -> `src/shared/contracts.ts`
- `src/diagnostics.ts` -> `src/shared/diagnostics.ts`
- `src/runtime-test-fixtures.ts` -> `src/testing/fixtures/runtime-test-fixtures.ts`

## Exit Criteria

- Root `src/` is mostly entry shims plus tests.
- `public/` is gone.
- `services/` is no longer a mixed runtime/orchestrator bucket.
- `shared/` contains truly shared contracts and diagnostics only.
- `utils/` stays tiny and honest.
- The source tree visually matches the package export model.
- The biggest concern buckets are split before any deeper package migration.
