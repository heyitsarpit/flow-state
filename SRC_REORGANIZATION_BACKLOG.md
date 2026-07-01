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

- [ ] Keep only entry shims at `src/` root.
      Why: the root currently mixes public entrypoints with implementation files
      like
      [flow-paths.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/flow-paths.ts).

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

- [ ] Remove `public/` as a top-level dumping ground.
      Why: it currently holds three different concerns:
      core DSL assembly in
      [public/flow-core.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/flow-core.ts:39),
      React-facing `flow.use*` wrappers in
      [public/flow.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/flow.ts:10),
      and inspect helpers in
      [public/inspect.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/inspect.ts:10).

- [ ] Move core-facing API builders and public types under `core/api/`.
      Candidates:
  - `flow-core.ts`
  - `keys.ts`
  - `types.ts`
  - `app-types.ts`
  - `data-types.ts`
  - `machine-types.ts`
    Progress landed:
  - [x] `flow-core.ts` -> `core/api/flow-core.ts`
  - [x] `data-types.ts` -> `core/api/data-types.ts`
  - [x] `keys.ts` -> `core/api/keys.ts`
  - [x] `machine-types.ts` -> `core/api/machine-types.ts`
  - [x] `types.ts` -> `core/api/types.ts`

- [x] Move `public/flow.ts` under `react/flow.ts`.
      Receipt:
      [react-entry.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/react-entry.ts:1)
      already proves this file is a React concern.

- [x] Move `public/inspect.ts` under a core inspection folder.
      Candidate:
      `core/inspection/inspect.ts`

- [ ] Split `public/app-types.ts` by export-path ownership instead of keeping
      one giant shared type bucket.
      Receipts:
      [public/app-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/app-types.ts:197)
      mixes runtime boot and inspection types with testing types, and
      [core/api/types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/types.ts:1)
      re-exports everything through one broad barrel.
      Progress landed:
  - [x] inspect-owned `FlowStoryDoc*`, `FlowStoryCoverage*`, and
        `FlowStoriesDescriptor` now live under
        [public/inspect-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/inspect-types.ts:916),
        while
        [public/app-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/app-types.ts:264)
        keeps the shared `FlowStory*` input shapes.
  - [x] inspect-owned `FlowGraph*`, `FlowTrace*`, and
        `FlowLocalInspectionProof` now live under
        [public/inspect-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/inspect-types.ts:358),
        while
        [public/app-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/app-types.ts:51)
        now keeps the app/runtime/story-input contracts that still belong on
        the non-inspect routes.

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

- [ ] Keep `core/store/` but tighten its boundary.
      Why: today store internals are real, but they are mixed with duplicated
      metadata and some naming drift.

## Phase 4. Attack The Biggest Concern Buckets

- [ ] Split
      [core/orchestrator/orchestrator-system.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator/orchestrator-system.ts:96).
      Why: `createContractActor` currently owns controller wiring, child lifecycle,
      state-owned work reconciliation, flush/dispose, and actor API assembly in one
      file.

- [ ] Split
      [store/resource-store-memory.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/store/resource-store-memory.ts:111).
      Why: it currently owns subscription registry, online pause/resume,
      mutation/hydration, and the lookup engine.

- [ ] Split
      [core/orchestrator/orchestrator-streams-timers.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator/orchestrator-streams-timers.ts:87)
      into stream ownership and timer/after ownership.

- [ ] Split
      [testing/flow-test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/testing/flow-test.ts:290)
      so testing architecture matches the stricter runtime decomposition standard.
      Why: it currently owns harness bootstrap, stream/timer runtime, transaction
      preview/rollback/invalidation, pending-work inspection, and the builder API.

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
      [selection-source.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/store/selection-source.ts:15)
      now owns writable creation plus `selectSource`/`deriveSource`, and
      [selection-source.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/store/selection-source.test.ts:1)
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
      [store/resource-snapshot.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/store/resource-snapshot.ts:61)
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
      [public/app-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/app-types.ts:197).
      Why: each export path should own more of its types and helpers directly.
      Progress landed:
  - `FlowRuntimeInspection` now lives under
    [public/inspect-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/inspect-types.ts:27)
    instead of `public/app-types.ts`, and
    [public-typing-architecture.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public-typing-architecture.test.ts:83)
    now proves the app-type bucket no longer owns that inspect-only handle type.
  - `FlowRehydratedTestHarness` now lives under
    [public/testing-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/testing-types.ts:14)
    instead of `public/app-types.ts`, and
    [testing.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/testing.ts:38)
    now re-exports that testing-only handle directly from the testing-owned
    type module.
  - `FlowTestChildTreeNode`, `FlowTestChildTree`, `FlowTestChildSummary`, and
    `FlowTestProgressBounds` now live under
    [public/testing-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/testing-types.ts:12)
    instead of `public/app-types.ts`, and
    [testing.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/testing.ts:36)
    now re-exports those testing-only helper types from the testing-owned type
    module.
  - `FlowTestCache`, `FlowTestTransactions`, and `FlowTestTimers` now live
    under
    [public/testing-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/testing-types.ts:54)
    instead of `public/app-types.ts`, and
    [testing.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/testing.ts:32)
    now re-exports those harness-only inspector helper types from the
    testing-owned type module.
  - `FlowTestPendingMailbox`, `FlowTestPendingTimer`,
    `FlowTestPendingChild`, and `FlowTestPendingWork` now live under
    [public/testing-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/testing-types.ts:76)
    instead of `public/app-types.ts`, and
    [testing.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/testing.ts:32)
    now re-exports those pending-work helper types from the testing-owned type
    module.
  - `FlowStoryRunBlockedReason`, `FlowStoryRunBlocked`,
    `FlowStoryRunResult`, `FlowStoryRunOutcome`, `FlowStoryTestCheckKind`,
    `FlowStoryTestCheck`, and `FlowStoryTestReport` now live under
    [public/testing-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/testing-types.ts:100)
    instead of `public/app-types.ts`, and
    [testing.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/testing.ts:26)
    now re-exports those story execution result types from the testing-owned
    type module.
  - `FlowModelStep`, `FlowModelPath`, and `FlowModelTraversalOptions` now
    live under
    [public/testing-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/testing-types.ts:163)
    instead of `public/app-types.ts`, and
    [testing.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/testing.ts:26)
    now re-exports those raw model-path helper types from the testing-owned
    type module.
  - `FlowModelDescriptor` and `FlowModelReplayConfig` now live under
    [public/testing-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/testing-types.ts:201)
    instead of `public/app-types.ts`, and
    [testing.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/testing.ts:13)
    now re-exports those model descriptor types from the testing-owned type
    module.
  - `FlowTestHarness`, `FlowStartedTestBuilder`, and `FlowTestBuilder` now
    live under
    [public/testing-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/testing-types.ts:266)
    instead of `public/app-types.ts`, and
    [testing.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/testing.ts:13)
    now re-exports those harness and builder types from the testing-owned type
    module.
    Completion note: `public/app-types.ts` no longer exports any `FlowTest*`
    or `FlowModel*` types, while `testing.ts` now directly owns the public
    testing-route type surface via `public/testing-types.ts`.

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
