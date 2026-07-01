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
      [machine-transition.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/machine-transition.ts),
      [stream-callbacks.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/stream-callbacks.ts),
      [transaction-callbacks.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/transaction-callbacks.ts),
      [receipt-summary.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/receipt-summary.ts),
      [ready-work.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/ready-work.ts),
      and
      [trace-report.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/trace-report.ts).

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

## Phase 3. Split Core By Real Ownership

- [ ] Create `core/orchestrator/` and move `services/orchestrator-*` plus
      `app-ownership.ts` there.
      Why: `services/` is overloaded and currently mixes orchestrator
      implementation with runtime ports and policies.
      Receipt:
      [services](/Users/arpit/Developer/flow-state/packages/flow-state/src/services).

- [ ] Create `core/runtime/services/` for runtime ports and policy services.
      Candidates:
  - `host-signal-source.ts`
  - `host-signals.ts`
  - `notification-scheduler.ts`
  - `resource-store.ts`
  - `runtime-policy.ts`
  - `trace.ts`
  - `inspection.ts`

- [ ] Create `core/machines/`.
      Move:
  - `machine-callbacks.ts`
  - `machine-transition.ts`
  - `view-callbacks.ts`
    Why: these are machine/view engine concerns, not root helpers.

- [ ] Create `core/streams/`.
      Move:
  - `controlled-stream-source.ts`
  - `stream-callbacks.ts`
  - `stream-route.ts`

- [ ] Create `core/transactions/`.
      Move:
  - `transaction-callbacks.ts`
  - `transaction-invalidation.ts`
  - `transaction-outcome.ts`
  - `transaction-outcome-callbacks.ts`

- [ ] Create `core/inspection/`.
      Move:
  - `inspection-receipts.ts`
  - `receipt-correlation.ts`
  - `receipt-summary.ts`
  - `trace-report.ts`

- [ ] Create `core/scheduling/`.
      Move:
  - `delayed-work.ts`
  - `ready-work.ts`
    Why: these are runtime scheduling primitives, not generic utils.

- [ ] Keep `core/store/` but tighten its boundary.
      Why: today store internals are real, but they are mixed with duplicated
      metadata and some naming drift.

## Phase 4. Attack The Biggest Concern Buckets

- [ ] Split
      [services/orchestrator-system.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/services/orchestrator-system.ts:96).
      Why: `createContractActor` currently owns controller wiring, child lifecycle,
      state-owned work reconciliation, flush/dispose, and actor API assembly in one
      file.

- [ ] Split
      [store/resource-store-memory.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/store/resource-store-memory.ts:111).
      Why: it currently owns subscription registry, online pause/resume,
      mutation/hydration, and the lookup engine.

- [ ] Split
      [services/orchestrator-streams-timers.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/services/orchestrator-streams-timers.ts:87)
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

- [ ] Rename `shared-contracts.ts` to `shared/contracts.ts` and prune it.
      Receipt:
      [shared-contracts.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/shared-contracts.ts:3)
      currently mixes `SelectionSource`, `FlowConcurrencyPolicy`, and likely-dead
      internal leftovers like `FlowOperationLane`, `FlowOperationOutcome`,
      `FlowRegistry`, and `FlowTestControls`.

- [ ] Move `diagnostics.ts` to `shared/diagnostics.ts`.
      Why: it is imported across descriptors, runtime, store, services, React, and
      tests, so it is truly shared infrastructure.

- [ ] Keep `utils/` very small and honest.
      Good candidate:
      [fifo-queue.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/fifo-queue.ts:1).
      Bad candidates:
      domain-specific runtime helpers that only look generic.

- [ ] Reconsider
      [store/notification-batch.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/store/notification-batch.ts:1).
      Why: it is a tiny passthrough while batching is already conceptually owned by
      [notification-scheduler.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/services/notification-scheduler.ts:12).

## Phase 6. Remove Small-Cut Slop

- [ ] Rename or consolidate `selection-source.ts` and `selected-source.ts`.
      Receipts:
      [selection-source.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/store/selection-source.ts:9),
      [selected-source.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/store/selected-source.ts:9).
      Why: the names are too close and too easy to confuse.

- [ ] Stop repeating internal service type aliases.
      Receipts:
      `ResourceStoreService = Parameters<(typeof ResourceStore)["of"]>[0]` is
      repeated in
      [orchestrator-system.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/services/orchestrator-system.ts:94),
      [orchestrator-resources.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/services/orchestrator-resources.ts:39),
      and
      [orchestrator-transaction-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/services/orchestrator-transaction-types.ts:27).

- [ ] Reduce tiny wrapper file sprawl where the only job is “call pure helper,
      wrap diagnostic”.
      Candidates:
  - `stream-route.ts` + `stream-callbacks.ts`
  - `transaction-outcome.ts` + `transaction-outcome-callbacks.ts`
  - `view-callbacks.ts`
  - `machine-callbacks.ts`

- [ ] Collapse duplicated invalidation paths.
      Receipts:
      [services/orchestrator-resources.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/services/orchestrator-resources.ts:334),
      [services/orchestrator-transaction-invalidation.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/services/orchestrator-transaction-invalidation.ts:16),
      [transaction-invalidation.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/transaction-invalidation.ts:9),
      [store/resource-snapshot.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/store/resource-snapshot.ts:99).

## Phase 7. API And Naming Cleanup That Affects The Tree

- [ ] Remove one `flow.app(...)` assembly form.
      Receipt:
      [public/flow-core.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/flow-core.ts:100)
      supports both config-object and rest-arg forms.
      Why: this is not just API cleanup; it also simplifies the folder and type
      ownership story.

- [ ] Stop treating inspect/testing separation as wrapper-only.
      Receipts:
      [inspect.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/inspect.ts:1),
      [testing.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/testing.ts:1),
      [public/app-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/app-types.ts:197).
      Why: each export path should own more of its types and helpers directly.

- [ ] Remove stale “staged entrypoint” language while doing the file moves.
      Receipts:
      [public-typing-architecture.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public-typing-architecture.test.ts:81),
      [apps/docs/src/pages/reference/inspection.md](/Users/arpit/Developer/flow-state/apps/docs/src/pages/reference/inspection.md:3),
      [IMPLEMENTATION.md](/Users/arpit/Developer/flow-state/IMPLEMENTATION.md:54).

## Suggested Move Map

- `src/public/flow.ts` -> `src/react/flow.ts`
- `src/public/inspect.ts` -> `src/core/inspection/inspect.ts`
- `src/public/{flow-core,keys,types,app-types,data-types,machine-types}.ts`
  -> `src/core/api/*`
- `src/{machine-transition,machine-callbacks,view-callbacks}.ts`
  -> `src/core/machines/*`
- `src/{stream-callbacks,stream-route,controlled-stream-source}.ts`
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
