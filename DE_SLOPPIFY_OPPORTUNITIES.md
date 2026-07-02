# De-Sloppify Opportunities

This document is a cleanup backlog for the current Flow State repo.

It is intentionally biased toward places where the codebase feels more
AI-shaped than product-shaped:

- overlapping public entrypoints
- docs that repeat or oversell
- surfaces that exist mostly as wrappers or placeholders
- oversized files that mix too many concerns
- examples/tests that prove too much in one place

This is not a bug list. It is a de-sloppify list.

Decision locks for this backlog:

- Keep this goal narrow:
  - public API honesty
  - docs and vocabulary cleanup
  - removal or demotion of weak public surfaces
- Tree-shakeability is part of public API honesty. Favor named module exports
  on every public route over exported frozen namespace objects when they
  preserve the same user-facing call shape.
- Namespace aliases such as `flow`, `hooks`, `test`, `inspect`, or direct named
  imports should be user choices at import sites, not package-owned exported
  objects.
- Do not use this file to drive internal structural splits already owned by
  `CORE_REACT_DE_SLOPPIFY.md` or `SRC_REORGANIZATION_BACKLOG.md`.
- Do not do `examples/launch-workspace` cleanup work here. Treat that example as
  a proof surface only.

Paired structural progress:

- `src/flow-paths.ts` now lives under `src/core/machines/flow-paths.ts`; keep
  any future structural follow-up in `SRC_REORGANIZATION_BACKLOG.md`.
- `src/graph-descriptor.ts` now lives under
  `src/core/inspection/graph-descriptor.ts`; keep any future structural
  follow-up in `SRC_REORGANIZATION_BACKLOG.md`.
- `src/inspection-format.ts` now lives under
  `src/core/inspection/inspection-format.ts`; keep any future structural
  follow-up in `SRC_REORGANIZATION_BACKLOG.md`.
- `src/inspection-local-proof.ts` now lives under
  `src/core/inspection/inspection-local-proof.ts`; keep any future structural
  follow-up in `SRC_REORGANIZATION_BACKLOG.md`.
- `src/inspection-semantic-summary.ts` now lives under
  `src/core/inspection/inspection-semantic-summary.ts`; keep any future
  structural follow-up in `SRC_REORGANIZATION_BACKLOG.md`.
- `src/inspection-events.ts` now lives under
  `src/core/inspection/inspection-events.ts`; keep any future structural
  follow-up in `SRC_REORGANIZATION_BACKLOG.md`.
- `src/inspection-sink.ts` now lives under
  `src/core/inspection/inspection-sink.ts`; keep any future structural
  follow-up in `SRC_REORGANIZATION_BACKLOG.md`.
- `src/inspection-retention.ts` now lives under
  `src/core/inspection/inspection-retention.ts`; keep any future structural
  follow-up in `SRC_REORGANIZATION_BACKLOG.md`.
- `src/inspection-observer.ts` now lives under
  `src/core/inspection/inspection-observer.ts`; keep any future structural
  follow-up in `SRC_REORGANIZATION_BACKLOG.md`.
- `src/inspection-subscription.ts` now lives under
  `src/core/inspection/inspection-subscription.ts`; keep any future structural
  follow-up in `SRC_REORGANIZATION_BACKLOG.md`.
- `src/machine-transition-inspection.ts` now lives under
  `src/core/inspection/machine-transition-inspection.ts`; keep any future
  structural follow-up in `SRC_REORGANIZATION_BACKLOG.md`.
- `src/story-doc.ts` now lives under `src/core/inspection/story-doc.ts`; keep
  any future structural follow-up in `SRC_REORGANIZATION_BACKLOG.md`.
- `src/story-coverage.ts` now lives under
  `src/core/inspection/story-coverage.ts`; keep any future structural
  follow-up in `SRC_REORGANIZATION_BACKLOG.md`.
- `src/trace-artifact.ts` now lives under
  `src/core/inspection/trace-artifact.ts`; keep any future structural
  follow-up in `SRC_REORGANIZATION_BACKLOG.md`.
- `src/trace-incident-summary.ts` now lives under
  `src/core/inspection/trace-incident-summary.ts`; keep any future structural
  follow-up in `SRC_REORGANIZATION_BACKLOG.md`.
- `src/trace-diff.ts` now lives under `src/core/inspection/trace-diff.ts`;
  keep any future structural follow-up in `SRC_REORGANIZATION_BACKLOG.md`.
- `src/trace-actor-hierarchy.ts` now lives under
  `src/core/inspection/trace-actor-hierarchy.ts`; keep any future structural
  follow-up in `SRC_REORGANIZATION_BACKLOG.md`.
- `src/trace-descriptor.ts` now lives under
  `src/core/inspection/trace-descriptor.ts`; keep any future structural
  follow-up in `SRC_REORGANIZATION_BACKLOG.md`.
- `src/trace-correlation-details.ts` now lives under
  `src/core/inspection/trace-correlation-details.ts`; keep any future
  structural follow-up in `SRC_REORGANIZATION_BACKLOG.md`.
- `src/child-lifecycle-inspection-facts.ts` now lives under
  `src/core/orchestrator/child-lifecycle-inspection-facts.ts`; keep any
  future structural follow-up in `SRC_REORGANIZATION_BACKLOG.md`.
- `src/stream-timer-inspection-facts.ts` now lives under
  `src/core/orchestrator/stream-timer-inspection-facts.ts`; keep any future
  structural follow-up in `SRC_REORGANIZATION_BACKLOG.md`.
- `src/transaction-inspection-facts.ts` now lives under
  `src/core/orchestrator/transaction-inspection-facts.ts`; keep any future
  structural follow-up in `SRC_REORGANIZATION_BACKLOG.md`.
- `src/ready-work.ts` and `src/delayed-work.ts` now live under
  `src/core/scheduling/`; keep any future structural follow-up in
  `SRC_REORGANIZATION_BACKLOG.md`.
- `src/{inspection-receipts,receipt-correlation,receipt-summary,trace-report}.ts`
  now live under `src/core/inspection/`; keep any future structural follow-up
  in `SRC_REORGANIZATION_BACKLOG.md`.
- `src/{controlled-stream-source,stream-callbacks}.ts` now live under
  `src/core/streams/`, and `stream-route.ts` was folded into
  `src/core/streams/stream-callbacks.ts`; keep any future structural follow-up
  in `SRC_REORGANIZATION_BACKLOG.md`.
- `src/{transaction-callbacks,transaction-invalidation,transaction-outcome-callbacks}.ts`
  now live under `src/core/transactions/`, and `transaction-outcome.ts` was
  folded into `src/core/transactions/transaction-outcome-callbacks.ts`; keep
  any future structural follow-up in `SRC_REORGANIZATION_BACKLOG.md`.
- `src/machine-transition.ts` now lives under `src/core/machines/`,
  `machine-callbacks.ts` was folded into `src/descriptors/machine.ts` plus
  `src/core/machines/machine-transition.ts`, transition application now lives
  under `src/core/machines/machine-transition-application.ts`, config readers
  now live under `src/core/machines/machine-transition-config.ts`, receipt
  helpers now live under `src/core/machines/machine-transition-receipts.ts`,
  microstep runtime now lives under
  `src/core/machines/machine-transition-runtime.ts`, and `view-callbacks.ts`
  was folded into `src/core/api/flow-core.ts`; keep any future structural
  follow-up in `SRC_REORGANIZATION_BACKLOG.md`.
- transaction-driven invalidation and state-owned invalidation commands now
  share one orchestrator application path in
  `src/core/orchestrator/orchestrator-transaction-invalidation.ts`; keep any
  future invalidation-shape follow-up in `SRC_REORGANIZATION_BACKLOG.md`.
- timer and after ownership now lives under
  `src/core/orchestrator/orchestrator-after-timer-ownership.ts`, while
  `src/core/orchestrator/orchestrator-streams-timers.ts` now just assembles
  the focused orchestrator helper surfaces after moving the remaining stream
  ownership path into `src/core/orchestrator/orchestrator-stream-ownership.ts`;
  keep any future stream/timer behavior follow-up in
  `SRC_REORGANIZATION_BACKLOG.md`.
- `src/public/inspect-types.ts` now lives under `src/core/api/inspect-types.ts`.
- `src/public/testing-types.ts` now lives under `src/core/api/testing-types.ts`.
- `src/public/app-types.ts` now lives under `src/core/api/app-types.ts`, and
  `src/public/` no longer contains any files.
- `FlowRuntimeInspection` now lives under `src/core/api/inspect-types.ts`
  instead of `src/core/api/app-types.ts`.
- `FlowRehydratedTestHarness` now lives under `src/core/api/testing-types.ts`
  instead of `src/core/api/app-types.ts`.
- `FlowTestChildTreeNode`, `FlowTestChildTree`, `FlowTestChildSummary`, and
  `FlowTestProgressBounds` now live under `src/core/api/testing-types.ts`
  instead of `src/core/api/app-types.ts`.
- `FlowTestCache`, `FlowTestTransactions`, and `FlowTestTimers` now live under
  `src/core/api/testing-types.ts` instead of `src/core/api/app-types.ts`.
- `FlowTestPendingMailbox`, `FlowTestPendingTimer`, `FlowTestPendingChild`,
  and `FlowTestPendingWork` now live under `src/core/api/testing-types.ts`
  instead of `src/core/api/app-types.ts`.
- `FlowStoryRunBlockedReason`, `FlowStoryRunBlocked`,
  `FlowStoryRunResult`, `FlowStoryRunOutcome`, `FlowStoryTestCheckKind`,
  `FlowStoryTestCheck`, and `FlowStoryTestReport` now live under
  `src/core/api/testing-types.ts` instead of `src/core/api/app-types.ts`.
- `FlowModelStep`, `FlowModelPath`, and `FlowModelTraversalOptions` now live
  under `src/core/api/testing-types.ts` instead of `src/core/api/app-types.ts`.
- `FlowModelDescriptor` and `FlowModelReplayConfig` now live under
  `src/core/api/testing-types.ts` instead of `src/core/api/app-types.ts`.
- `FlowTestHarness`, `FlowStartedTestBuilder`, and `FlowTestBuilder` now live
  under `src/core/api/testing-types.ts` instead of `src/core/api/app-types.ts`.
- `src/core/api/app-types.ts` now keeps only the shared app/runtime/story-input
  contracts; the testing route owns `FlowTest*` and `FlowModel*` types through
  `src/core/api/testing-types.ts`.
- `FlowStoryDoc*`, `FlowStoryCoverage*`, and `FlowStoriesDescriptor` now live
  under `src/core/api/inspect-types.ts` instead of `src/core/api/app-types.ts`;
  `app-types.ts` still keeps the shared story input shapes.
- `FlowGraph*`, `FlowTrace*`, and `FlowLocalInspectionProof` now live under
  `src/core/api/inspect-types.ts` instead of `src/core/api/app-types.ts`;
  `app-types.ts` now keeps the app/runtime/story-input contracts that still
  belong on the non-inspect routes.
- `src/services/{host-signal-source,host-signals,notification-scheduler,resource-store,runtime-policy,trace,inspection}.ts`
  now live under `src/core/runtime/services/`; keep any future structural
  follow-up in `SRC_REORGANIZATION_BACKLOG.md`.
- `src/services/orchestrator-*` and `src/services/app-ownership.ts` now live under
  `src/core/orchestrator/`; keep any future structural follow-up in
  `SRC_REORGANIZATION_BACKLOG.md`.
- `src/store/{hydration,invalidation,resource-patch,resource-snapshot,resource-store-memory,selection-source}.ts`
  now live under `src/core/store/`, and `src/store/` no longer contains source
  files.
- the in-flight lookup registry plus online pause/resume gate now live under
  `src/core/store/resource-store-lookups.ts`; keep the remaining
  `resource-store-memory.ts` split follow-up in `SRC_REORGANIZATION_BACKLOG.md`.
- the seed/hydrate/patch/invalidate state-write loops now live under
  `src/core/store/resource-store-state-updates.ts`; keep the remaining
  subscription/selection follow-up in `SRC_REORGANIZATION_BACKLOG.md`.
- the selection cache plus active subscription registry now live under
  `src/core/store/resource-store-subscriptions.ts`; `resource-store-memory.ts`
  now mainly wires the focused store helpers together.
- `ResourceStoreService` now has one canonical orchestrator owner in
  `src/core/orchestrator/orchestrator-transaction-types.ts`; keep any broader
  orchestrator type cleanup in `SRC_REORGANIZATION_BACKLOG.md`.
- `src/store/selected-source.ts` is gone; writable creation plus
  `selectSource`/`deriveSource` now live together in
  `src/core/store/selection-source.ts`.
- `src/store/notification-batch.ts` is gone; the only remaining batching use on
  that path was test-only and now imports TanStack `batch` directly.
- `src/shared-contracts.ts` is gone; `SelectionSource` and
  `FlowConcurrencyPolicy` now live under `src/shared/contracts.ts` without the
  dead extra contract types.
- `src/diagnostics.ts` is gone; the shared diagnostic surface now lives under
  `src/shared/diagnostics.ts`.
- `src/fifo-queue.ts` now lives under `src/utils/fifo-queue.ts`; keep any
  future utility-shape follow-up in `SRC_REORGANIZATION_BACKLOG.md`.

## Audit Rules

When deciding whether to edit a surface, use this order:

1. delete it if it is not paying rent
2. narrow it if the concept is real but the surface is too broad
3. rename it if the behavior is fine but the story is confusing
4. split it if the responsibility is real but too concentrated
5. prove it if the docs are ahead of the implementation

Also: size alone is not enough reason to split a file. A large file should be
split only when it mixes concerns or keeps forcing readers to hold too much in
their head at once.

Demotion rule:

- If a weak surface is not deleted immediately, mark it with the standard
  `@deprecated` tag, include a short reason or replacement note, and leave a
  matching backlog trail for eventual deletion.

Settled delete-now calls:

- delete `createRuntime`
- delete the rest-arg `flow.app(...)` form
- delete the factory `flow.module(id, () => inventory)` form
- delete `flow.persist(...)`
- delete `flow.permission(...)`
- keep `flow.outcomes(...)` for now

## Highest-ROI Opportunities

### [x] 1. Collapse overlapping public runtime entrypoints

Status:

- `packages/flow-state/src/index.ts` exports both `createRuntime` and
  `flow.runtime`.
- the docs repeatedly explain that `createRuntime()` is test-oriented while app
  code should usually use `flow.runtime(App.layer(...))`.

Why it feels sloppy:

- we are teaching two top-level ways to do nearly the same thing
- the docs need repeated caveats to explain which one is the "real" path
- tests repeatedly create empty app layers just to get a runtime shape that app
  code expects

Evidence:

- `packages/flow-state/src/index.ts`
- `packages/flow-state/src/public/flow-core.ts`
- `apps/docs/src/pages/getting-started.md`
- `apps/docs/src/pages/reference/api.md`
- `apps/docs/src/pages/reference/runtime.md`
- repeated `flow.app({ modules: [] }).layer(...)` usage across tests

Suggested direction:

- keep one obvious app/runtime path for user-facing docs
- delete `createRuntime()` instead of carrying a competing public entrypoint

Action type: delete

### [x] 2. Drop one `flow.app(...)` authoring form

Status:

- `flow.app({ modules })`
- the rest-arg `flow.app(moduleA, moduleB, ...)` form is already removed and
  rejected by the public type surface

Why it feels sloppy:

- stale docs/backlog language can still imply both forms exist
- tests should keep proving the object form is the only supported assembly path
- it makes examples less visually consistent

Evidence:

- `packages/flow-state/src/public/flow-core.ts`
- `packages/flow-state/src/public-api-types.test.ts`
- `packages/flow-state/src/app-inventory.test.ts`
- `examples/launch-workspace/src/launchWorkspaceAssembly.ts`

Suggested direction:

- keep `flow.app({ modules })` as the only supported form
- prefer the form that best supports readable examples and diff stability

Action type: delete

### [x] 3. Stop teaching the eager `flow.module(..., () => ({ ... }))` form as default

Status:

- the factory form is already rejected by the public type surface
- the remaining stale teaching was limited to two docs examples using the
  function shape

Why it feels sloppy:

- a function-shaped API strongly suggests deferred work or late binding
- today it mostly adds ceremony unless a caller genuinely wants a grouping
  closure

Evidence:

- `packages/flow-state/src/descriptors/module.ts`
- `packages/flow-state/src/core/api/flow-core.ts`
- `packages/flow-state/src/public-api-types.test.ts`
- `apps/docs/src/pages/concepts.md`
- `apps/docs/src/pages/guide/app-structure.md`
- `examples/launch-workspace/src/*`

Suggested direction:

- keep the object form
- delete the eager factory form
- do not preserve a function-shaped API that implies laziness it does not have

Progress landed:

- `flow.module(id, inventory, meta?)` is the only supported surface in
  `src/core/api/flow-core.ts`, `public-api-types.test.ts` keeps proving the
  factory form is rejected, and the stale docs examples now use the object form.

Action type: delete

### [x] 4. Re-evaluate `flow.persist(...)` and `flow.permission(...)` as public builders

Status:

- both are exported public builders and public types
- audited usage is extremely light
- the main visible product use is in
  `examples/launch-workspace/src/launchWorkspaceApproval.ts`

Why it feels sloppy:

- they look first-class in the namespace
- they do not currently feel central to the executable public contract
- they increase surface area and type/export noise

Evidence:

- `packages/flow-state/src/core/api/flow-core.ts`
- `packages/flow-state/src/core/api/app-types.ts`
- `packages/flow-state/src/index.ts`
- `examples/launch-workspace/src/launchWorkspaceApproval.ts`

Suggested direction:

- delete them from the public contract
- rewrite or remove the remaining example usage
- do not keep metadata-only wrappers as first-class builders

Action type: delete

### [x] 5. Replace repeated package-layout and module/app caveats with canonical docs

Status:

- `reference/api.md` already owns the current five-package `Import Paths` table
- `index.mdx`, `getting-started.md`, and `migration.md` still repeat the
  package topology directly
- `concepts.md`, `guide/app-structure.md`, `reference/api.md`, and
  `guide/ownership-and-runtime-facts.md` still repeat why `flow.module`,
  `flow.app`, and `App.layer` exist

Why it feels sloppy:

- users keep re-reading setup caveats instead of learning the concept
- repeated explanations drift out of sync
- it makes the docs feel generated from overlapping prompts rather than edited
  as one information architecture

Evidence:

- repeated package-layout references across:
  - `apps/docs/src/pages/index.mdx`
  - `apps/docs/src/pages/getting-started.md`
  - `apps/docs/src/pages/migration.md`
  - `apps/docs/src/pages/reference/api.md`
  - `apps/docs/src/pages/reference/runtime.md`
  - `apps/docs/src/pages/reference/inspection.md`
  - `apps/docs/src/pages/guide/server-hydration.md`
- repeated `flow.module` / `flow.app` motivation across:
  - `concepts.md`
  - `guide/app-structure.md`
  - `reference/api.md`
  - `guide/ownership-and-runtime-facts.md`

Suggested direction:

- keep one canonical contract page for package layout
- keep one canonical rationale page for module/app/layer
- turn the other pages into links plus local implications only

Concrete sub-items:

- [x] Decide whether `reference/api.md#Import Paths` stays the canonical
      package-layout contract or whether the repo wants a dedicated page for that
      role; do not keep full five-package lists in `index.mdx`,
      `getting-started.md`, and `migration.md` as parallel sources of truth.
- [x] Reduce `index.mdx`, `getting-started.md`, `reference/runtime.md`,
      `reference/inspection.md`, and `guide/server-hydration.md` to page-local
      implications plus links back to the canonical package-layout contract.
- [x] Keep `guide/ownership-and-runtime-facts.md` as the main "why do
      `flow.module` / `flow.app` / `App.layer` exist?" rationale page, and trim
      repeated payoff bullets from `concepts.md`, `guide/app-structure.md`, and
      `reference/api.md`.
- [x] Re-run `pnpm docs:build` after the link-and-trim pass so nav, links, and
      MDX imports stay honest.

Action type: consolidate

## Public API Cleanup Backlog

### [x] 6. Reduce public type sprawl around app/module/test surfaces

Status:

- `packages/flow-state/src/core/api/app-types.ts` is now a small curated barrel
  over `app-descriptor-types.ts`, `runtime-types.ts`, and `story-types.ts`
- `packages/flow-state/src/core/api/data-types.ts` is now a small curated barrel
  over `receipt-types.ts`, `inspection-event-types.ts`, `snapshot-types.ts`,
  and `resource-transaction-types.ts`
- `packages/flow-state/src/core/api/machine-types.ts` is now a small curated
  barrel over `machine-core-types.ts`, `machine-view-stream-types.ts`, and
  `machine-invoke-types.ts`
- the live proof gates for this split are `public-api-types.test.ts`,
  `package-hygiene.test.ts`, and
  `pnpm --filter @flow-state/launch-workspace check:typescript-mode-proofs`;
  broader declaration-emitter audits stay tracked in `TYPESCRIPT.md` and
  `BUGS.md`

Why it feels sloppy:

- many distinct public concepts are funneled through a few huge type files
- readers have to cross several dense type blocks to understand one concept
- it raises the chance that placeholder or weakly-justified types keep surviving
  because they live in a giant shared file

Suggested direction:

- split by ownership:
  - module/app descriptors
  - runtime handles
  - harness/test types
  - inspection/receipt types
- keep `core/api/types.ts` as an intentionally curated barrel, not a hiding place

Progress landed:

- `public/data-types.ts` -> `core/api/data-types.ts`
- `core/api/app-types.ts` -> `core/api/{app-descriptor-types,runtime-types,story-types}.ts`
- `core/api/data-types.ts` ->
  `core/api/{receipt-types,inspection-event-types,snapshot-types,resource-transaction-types}.ts`
- `core/api/machine-types.ts` ->
  `core/api/{machine-core-types,machine-view-stream-types,machine-invoke-types}.ts`

Concrete sub-items:

- [x] Split `app-types.ts` along real ownership seams: module/app descriptor
      types, runtime handle and boot types, and story authoring types.
- [x] Split `data-types.ts` along real ownership seams: receipt and issue
      facts, inspection event families, and resource/transaction authoring plus
      snapshot types.
- [x] Split `machine-types.ts` along real ownership seams: machine core types,
      view/stream/timer types, and child/invoke descriptor types.
- [x] Keep `core/api/types.ts` deliberate: explicitly re-export the stable
      public groups and do not turn the new files into another dumping ground.
- [x] Keep `public-api-types.test.ts`, `package-hygiene.test.ts`, and the
      shipped Launch Workspace TypeScript-mode proof green after each split so
      the cleanup does not quietly regress the consumer contract; keep broader
      declaration-emitter audits tracked separately in `TYPESCRIPT.md` and
      `BUGS.md`.

Action type: split

### [x] 7. Clarify the real public contract around focused and app-aware test harnesses

Status:

- `flowTest.app(App)` is already removed from the public contract
- the live focused surface is `test(machine).with(...).run()`
- the live app-aware surface is `test.app(App).scenario(machine)`
- `flowTest(machine).start()` still exists as a narrower compatibility surface
- the actual unique payoff is narrower: fixture-name resolution and app-backed
  inventory context
- plain `seedResources(...)` works without app composition
- `guide/testing.md`, `getting-started.md`, `guide/patterns.md`, and
  `reference/api.md` now all teach the same default story: focused `test(...)`
  first, app-aware `test.app(...)` only when fixtures or inventory pay rent
- `packages/flow-state/src/testing-docs-architecture.test.ts` now guards the
  removed `flow.test(...)` and `flowTest.app(App)` names from quietly
  reappearing in the public guides

Why it feels sloppy:

- stale docs/backlog wording can imply `flow.test(...)` or `flow.test.app(...)`
  are live APIs
- stale docs/backlog wording can imply `flowTest.app(App)` still exists
- the docs make the app-aware harness sound more required than it is
- it hides the lighter-weight path for many tests

Evidence:

- `packages/flow-state/src/testing/test.ts`
- `packages/flow-state/src/public-api-types.test.ts`
- `packages/flow-state/src/testing-docs-architecture.test.ts`
- `apps/docs/src/pages/getting-started.md`
- `apps/docs/src/pages/guide/testing.md`
- `apps/docs/src/pages/guide/patterns.md`
- `apps/docs/src/pages/reference/api.md`

Suggested direction:

- teach `test(machine).with(...).run()` as the default
- mention `flowTest(machine)` only as a narrower compatibility or migration
  surface if it remains public
- teach `test.app(App).scenario(machine)` only when fixtures, ownership
  inventory, or app-layer runtime context actually matter
- remove any stale `flow.test(...)`, `flow.test.app(...)`, or
  `flowTest.app(App)` wording from docs and backlog notes

Concrete sub-items:

- [x] Replace stale `flow.test(...)`, `flow.test.app(...)`, and
      `flowTest.app(...)` references in `guide/testing.md`.
- [x] Align `getting-started.md`, `guide/patterns.md`, and `reference/api.md`
      on one default story: focused harness first, app-aware harness only when
      inventory or fixtures matter, and `flowTest(machine)` only as compatibility
      language if needed.
- [x] Keep fixture and rehydration examples consistently on
      `test.app(App).scenario(...)` or `test.app(App).rehydrate(...)` instead of
      hybrid naming.
- [x] Keep the `public-api-types.test.ts` rejection for `flowTest.app(App)` and
      add a docs-level guard if needed so the removed name cannot quietly reappear.

Action type: narrow

### [x] 8. Clean up naming drift around resource receipts

Status:

- transaction naming has moved forward to the public `resource` / `transaction`
  vocabulary
- resource lookups now emit `resource:start`, and the resource lane now keeps
  one public `resource:*` vocabulary across runtime receipts, trace helpers,
  inspection typing, and proof surfaces
- the remaining `query` naming is now limited to unrelated helper/property
  names such as resource cache queries, not visible receipt types

Why it feels sloppy:

- the user-facing authoring surface says `resource`, not `query`
- mixed vocabulary makes the runtime look half-migrated

Evidence:

- `packages/flow-state/src/core/orchestrator/orchestrator-resources.ts`
- `packages/flow-state/src/core/inspection/trace-report.ts`
- `packages/flow-state/src/core/inspection/trace-correlation-details.ts`
- `packages/flow-state/src/core/inspection/inspection-events.ts`
- `packages/flow-state/src/core/api/inspection-event-types.ts`
- `packages/flow-state/src/runtime.test.ts`
- `packages/flow-state/src/flow-trace.test.ts`
- `packages/flow-state/src/inspection-semantic-summary.test.ts`
- `packages/flow-state/src/runtime-inspection.test.ts`
- `examples/launch-workspace/src/launchWorkspace.test.ts`

Suggested direction:

- either fully bless `query:*` as an internal legacy lane and hide it from docs
- or migrate the receipt vocabulary to the current public model

Concrete sub-items:

- [x] Inventory every remaining `query:*` producer and expectation in
      `orchestrator-resources.ts`, `runtime.test.ts`, `flow-trace.test.ts`, and
      `inspection-semantic-summary.test.ts`.
- [x] Decide the contract: either keep `query:*` fully internal and normalize
      it away at trace and summary boundaries, or rename the runtime emission and
      test expectations to `resource:*`.
- [x] Make `trace-report.ts` and the semantic summary helpers expose one public
      vocabulary instead of supporting mixed public names forever.
- [x] Update docs and proof surfaces so resource authoring never leaks
      `query:*` unless it is intentionally documented as a legacy internal lane.

Action type: rename or isolate

### [x] 9. Decide whether typed `moduleMap` deserves headline docs emphasis

Status:

- `moduleMap` is a real typed surface
- most of the strongest proof is type-level
- the strongest live payoffs around `flow.module(...)` / `flow.app(...)` are
  fixture-name inference, inventory, duplicate-id validation, app-scoped actor
  ownership, and `App.layer(...)`
- `moduleMap` now stays documented as a supporting typed convenience in
  `guide/app-structure.md` and `guide/ownership-and-runtime-facts.md`, not as a
  headline reason to reach for `flow.app(...)`

Why it feels sloppy:

- it may be a nice affordance, but it does not appear to be one of the biggest
  day-to-day productivity wins compared with fixtures, ownership, and layer
  assembly

Evidence:

- `packages/flow-state/src/public-api-types.test.ts`
- `packages/flow-state/src/app-inventory.test.ts`
- `packages/flow-state/src/app-docs-architecture.test.ts`
- docs emphasis in `reference/api.md`, `getting-started.md`,
  `guide/app-structure.md`, and `guide/ownership-and-runtime-facts.md`

Suggested direction:

- either show more real call sites that justify the emphasis
- or de-emphasize it in the public sales pitch

Concrete sub-items:

- [x] Gather the exact payoffs already proven live: typed lookup in
      `public-api-types.test.ts`, duplicate-id validation in
      `app-inventory.test.ts`, fixture-name inference in `test.app(...)`, and
      stable app assembly via `App.layer(...)`.
- [x] If `moduleMap` is mostly a typed convenience, move it out of headline
      bullets in `getting-started.md` and `reference/api.md` and keep it as a
      supporting detail in `guide/app-structure.md` or
      `guide/ownership-and-runtime-facts.md`.
- [x] Down-rank `moduleMap` from the headline pitch instead of adding a
      consumer example; keep it as a supporting typed convenience in the deeper
      app-ownership docs.
- [x] Rank the payoffs consistently across docs: inventory, fixtures,
      duplicate-id validation, and `App.layer(...)` first; `moduleMap` only where
      it materially helps.

Action type: prove or down-rank

### [ ] 9A. Finish the named-export and package-entry contract

Status:

- example and docs imports now pull shared builders and shared types from
  `@flow-state/core`, with route-only helpers left on their owning packages
- `packages/flow-state/src/package-route-ownership-architecture.test.ts` now
  fails closed if launch-workspace or the edited docs pages drift back to
  cross-route builder imports
- `packages/flow-state-server/src/index.ts` re-exports core builders like
  `createKey`, `createTag`, `flow`, and `selectView` from `@flow-state/core`
- `packages/flow-state-react/src/index.ts` still publishes a package-owned
  `flow` object that spreads core builders together with React hooks
- the repo still carries separate wrapper packages
  `packages/flow-state-server`, `packages/flow-state-react`,
  `packages/flow-state-testing`, and `packages/flow-state-inspect` instead of a
  single implementation-owned export map

Why it feels sloppy:

- core ownership gets blurred when server/react/testing routes can all hand out
  core builders
- package-owned namespace objects fight the stated goal that import-site aliases
  should be a user choice, not something bundled and published by the package
- consumers cannot easily tree-shake to only the builders they actually use if
  the docs and examples normalize `flow.*` objects everywhere
- the wrapper-package layout duplicates surface area and makes the repo look
  more fragmented than the public contract needs

Evidence:

- `examples/launch-workspace/src/launchWorkspaceDebug.ts`
- `examples/launch-workspace/src/launchWorkspaceApproval.ts`
- `examples/launch-workspace/src/launchWorkspaceAssistant.ts`
- `examples/launch-workspace/src/launchWorkspaceChat.ts`
- `examples/launch-workspace/src/launchWorkspaceStreams.ts`
- `examples/launch-workspace/src/launchWorkspaceViews.ts`
- `examples/launch-workspace/src/launchWorkspaceShell.tsx`
- `packages/flow-state/src/package-route-ownership-architecture.test.ts`
- `packages/flow-state-server/src/index.ts`
- `packages/flow-state-react/src/index.ts`
- `packages/flow-state-testing/src/index.ts`
- `packages/flow-state-inspect/src/index.ts`
- `packages/flow-state/package.json`
- `packages/flow-state-server/package.json`
- `packages/flow-state-react/package.json`
- `packages/flow-state-testing/package.json`
- `packages/flow-state-inspect/package.json`

Suggested direction:

- core builders, utils, and shared types should come from the core-owned route
  only
- route-specific APIs should come from their owning route only
- namespace imports such as `import * as flowCore`, `flowInspect`,
  `flowReact`, or `flowTest` should be import-site aliases for crowded files,
  not package-owned exported objects
- collapse the current wrapper-package sprawl into one implementation-owned
  export map if that still matches the repo direction

Concrete sub-items:

- [ ] Make the desired focused-import ergonomics explicit in the final contract,
      including import shapes like:
  ```ts
  import { machine, transaction, resource } from "@flow/core";
  ```
  so consumers can pull only the builders they need without routing through a
  package-owned `flow` object.
- [x] Audit example and docs imports for cross-route leakage:
  - core builder APIs should not be imported from `@flow-state/server`,
    `@flow-state/react`, `@flow-state/testing`, or `@flow-state/inspect`
  - route-specific helpers should not come from core when the owning route is
    the real public surface
- [x] Rewrite example files like `launchWorkspaceDebug.ts` so they import core
      builders from the core-owned route and only import server/react/testing
      helpers from their owning route.
- [ ] Update docs to teach named imports for focused concept pages, for example
      importing `machine`, `transaction`, or `resource` directly when only those
      surfaces are being taught.
- [ ] Reserve namespace imports for crowded files only, and make them user-side
      aliases such as:
  - `import * as flowCore from "..."`
  - `import * as flowInspect from "..."`
  - `import * as flowReact from "..."`
  - `import * as flowTest from "..."`
- [ ] Decide the final package contract explicitly:
  - either keep separate public routes but make them thin, ownership-clean
    entrypoints with no core-builder re-exports
  - or move to one `packages/flow-state/package.json` export map with multiple
    subpath entrypoints for core, inspect, react, server, and testing
- [ ] If the single-package-export-map direction wins, migrate the current
      `packages/flow-state-server`, `packages/flow-state-react`,
      `packages/flow-state-testing`, and `packages/flow-state-inspect` wrappers
      into `packages/flow-state` subpath exports and delete the extra workspace
      packages.
- [ ] Replace package-owned `flow` namespace exports with named top-level
      exports wherever possible; keep namespace-style grouping only as import-site
      aliasing, not as the published surface.
- [ ] Add fail-closed hygiene checks for the import contract:
  - `@flow-state/server`, `@flow-state/react`, `@flow-state/testing`, and
    `@flow-state/inspect` must not export core builder names such as
    `machine`, `transaction`, `resource`, `view`, `module`, `app`, `runtime`,
    `createKey`, `createTag`, or `selectView`
  - imports like
    `import { machine, transaction, resource } from "@flow-state/server"`
    must be impossible by the published type surface
  - imports like
    `import { flow } from "@flow-state/server"` or
    `import { flow } from "@flow-state/react"`
    must be rejected once the package-owned namespace object is removed
- [ ] Add a package-surface proof test that reads each public entrypoint and
      asserts allowed and forbidden export names explicitly, instead of only
      relying on broad hygiene snapshots.
- [ ] Add type-level negative tests that prove bad imports fail, including:
  - `import { machine, transaction, resource } from "@flow-state/server"`
  - `import { machine, transaction, resource } from "@flow-state/react"`
  - `import { machine, transaction, resource } from "@flow-state/testing"`
  - `import { machine, transaction, resource } from "@flow-state/inspect"`
- [x] Add docs/example import hygiene checks that fail when:
  - core builder APIs are imported from non-core routes
  - route-specific APIs are imported from the wrong route
  - package-owned `flow` objects are used after the contract is removed
- [ ] Keep one positive proof for the desired contract, for example:
  ```ts
  import { machine, transaction, resource } from "@flow/core";
  ```
  and, for crowded files only, import-site namespace aliases such as
  `import * as flowCore from "@flow/core"` without requiring a package-published
  `flow` object.

Action type: narrow, rename, and collapse

## Docs And Recipes Cleanup Backlog

### [ ] 10. Turn recipe pages into decision guides, not snippet catalogs

Status:

- `apps/docs/src/pages/guide/recipes.md` is 172 lines spread across ten
  top-level recipe sections
- several sections are really adjacent choices on the same surface rather than
  distinct docs pages in miniature

Why it feels sloppy:

- it risks becoming a second API reference
- several recipes restate information better explained elsewhere
- the page does not strongly prioritize "when to choose this" over "here is a
  snippet"

Suggested direction:

- group recipes by decision:
  - blocking prerequisite
  - ongoing subscription
  - previewable write
  - child supervision
  - boot/restore
- cut recipes that are just restating API affordances

Concrete sub-items:

- [ ] Collapse the current sections into decision buckets: prerequisites and
      freshness, previewable writes and retry, child and stream work, boot and
      restore, and runtime escape hatches.
- [ ] Merge pairs that describe the same choice surface, especially
      `Require Data Before A State Can Proceed` with `Keep Data Fresh While A State
Is Visible`, and `Save With Preview And Rollback` with `Retry Or Reset A
Failed Transaction`.
- [ ] Cut or link out sections that are mostly API-shaped snippets, such as
      `Select A View Outside React` or one-shot timer wiring, unless they add a
      real choice rule that is missing from reference docs.
- [ ] Start each decision bucket with "use this when..." guidance and end it
      with links to the owning runtime, testing, or server-hydration page instead
      of restating full APIs inline.

Action type: rewrite

### [ ] 10A. Build a generated quick API reference page from live exports

Status:

- `apps/docs/src/pages/reference/api.md` already exists as a hand-written quick
  reference page
- the docs site is Vocs-based through `apps/docs/vocs.config.ts`
- the public surface already has stable entrypoints in
  `packages/flow-state/src/index.ts`, `testing.ts`, `server.ts`, `inspect.ts`,
  and `react-entry.ts`
- the `flow.*` builder surface is concentrated in
  `packages/flow-state/src/core/api/flow-core.ts`
- the public entry files do not currently carry machine-readable TSDoc-style
  descriptions, so names are easy to extract but polished descriptions are not

Why it feels sloppy:

- the current quick reference is manual, so it can drift from the live exports
- the shortest "what do we actually expose?" page is exactly the kind of thing
  that should be generated or at least export-driven
- a hand-written page has to be edited every time the public surface changes,
  which invites omissions and stale names

Evidence:

- `apps/docs/src/pages/reference/api.md`
- `apps/docs/vocs.config.ts`
- `packages/flow-state/src/index.ts`
- `packages/flow-state/src/testing.ts`
- `packages/flow-state/src/server.ts`
- `packages/flow-state/src/inspect.ts`
- `packages/flow-state/src/react-entry.ts`
- `packages/flow-state/src/core/api/flow-core.ts`

Suggested direction:

- keep a quick human-readable API reference page
- generate its symbol inventory from live package exports
- render the generated data through MDX so layout and grouping stay intentional
- use a library for extraction and a thin repo-owned layer for grouping,
  ordering, and short descriptions
- follow the common large-library pattern: one fast hub page that links into
  deeper owner pages, not one giant generated per-symbol dump

Concrete sub-items:

- [ ] Decide the extraction path:
  - `TypeDoc -> JSON -> repo script -> generated MDX/JSON` is likely the
    shortest path for this repo
  - `API Extractor` is the stronger option only if the repo wants a stricter
    API-report and TSDoc pipeline at the same time
- [ ] Decide the output shape:
  - either generate a full page like
    `apps/docs/src/pages/reference/api-generated.mdx`
  - or generate structured data like
    `apps/docs/src/generated/api-reference.json` and render it from a small MDX
    page wrapper
- [ ] Prefer `generated JSON -> MDX renderer` unless there is a strong reason to
      emit raw MDX directly; that keeps layout, sections, and hand-written notes
      easy to control in Vocs.
- [ ] Make the generated page table-first and quick to scan:
  - one section per public route or owner surface
  - a compact table such as `API | Route | Description`
  - at most one route-level import example per section, if any
  - no repeated import block under every symbol
- [ ] Group the generated reference by the real public surfaces:
  - `Core`
  - `React`
  - `Testing`
  - `Server`
  - `Inspect`
  - and a nested `flow.*` section for namespace members such as
    `flow.resource`, `flow.transaction`, `flow.machine`, `flow.app`, and
    `flow.runtime`
- [ ] Make API names clickable and route them to the deeper owner docs:
  - quick reference answers "what exists?"
  - deeper reference pages answer "how do I use it?"
  - prefer links to existing owner pages or symbol anchors such as
    `/reference/resources#resource` rather than generating a full page per
    symbol by default
- [ ] Make the extractor walk the actual entrypoints instead of deep source
      files wherever possible, so the page matches what consumers really import.
- [ ] Handle `flow.*` explicitly: the generator must read members from the
      exported `flow` object in `flow-core.ts`, not just top-level named exports.
- [ ] Add a small metadata layer for short descriptions and display order if the
      repo does not want to add TSDoc comments everywhere immediately.
- [ ] If descriptions should come directly from code long term, add TSDoc to the
      real public exports and make the generated page fail closed when a surfaced
      export is missing required doc metadata.
- [ ] Keep the generated page intentionally short: symbol name, section,
      one-line description, clickable destination, and maybe the owning route; do
      not dump every signature or type detail that belongs on deeper reference
      pages.
- [ ] Keep the generated page structurally similar to how large libraries
      usually handle API docs:
  - one quick generated hub page
  - curated owner pages behind the links
  - no requirement to generate a standalone page for every tiny helper unless
    the surface later grows enough to justify it
- [ ] Wire generation into the docs workflow so `pnpm docs:build` or a
      pre-build step refreshes the generated artifact before Vocs renders the page.
- [ ] Add a guard that fails when a public export is missing from the generated
      reference or when the checked-in generated artifact is stale relative to the
      live entrypoints.
- [ ] Decide whether the existing `reference/api.md` becomes:
  - the generated page itself
  - a short hand-written landing page that embeds generated sections
  - or a hand-written overview that links to a generated quick-reference page

Action type: generate and integrate

### [ ] 11. Route contested docs claims through the status contract

Status:

- the repo already has strong truth surfaces
- some docs and example inventories still oversell what is really executable

Why it feels sloppy:

- readers leave with a nicer story than the code currently proves
- cleanup work then becomes archaeology instead of explicit scope control

Evidence:

- `apps/docs/src/pages/reference/status.mdx`
- `examples/launch-workspace/API_INVENTORY.md`
- `examples/launch-workspace/src/launchWorkspaceStatus.ts`
- current module/app audit results around duplicate resource ids vs broader
  validation

Suggested direction:

- every high-level page should defer to status for contested surfaces
- remove phrases that imply dependency/cycle validation or broad runtime support
  where the audited code does not prove it

Concrete sub-items:

- [ ] Treat `reference/status.mdx` as the canonical executable/partial matrix
      and link to it from `reference/api.md`, `reference/runtime.md`,
      `reference/inspection.md`, `getting-started.md`, and other high-level pages
      whenever a surface is intentionally narrow.
- [ ] Audit claims around cross-module validation, `App.layer` policy breadth,
      runtime support, and params-schema validation against live tests and the
      current status notes before carrying them into docs prose.
- [ ] Keep example proof surfaces like `API_INVENTORY.md` and
      `launchWorkspaceStatus.ts` as evidence inputs, but summarize their language
      instead of copying flagship wording into public docs.
- [ ] Remove or qualify any phrasing that says "supports" when the code only
      proves "partial", "narrow", or "guide-only".

Action type: tighten

### [ ] 12. Simplify Getting Started so it teaches one ladder, not several side quests

Status:

- `apps/docs/src/pages/getting-started.md` is 295 lines
- it teaches service, resource, transaction, machine, `submit`, direct runtime,
  app-layer runtime, React, and testing in one page

Why it feels sloppy:

- too many concept transitions for an onboarding page
- it mixes "smallest slice" and "real app assembly" before the first path is
  fully internalized

Suggested direction:

- keep one minimal path
- move `submit`, app-layer composition, and request boot follow-ups into linked
  guides
- keep the first example visually consistent with the long-term recommended
  path

Concrete sub-items:

- [ ] Keep one primary ladder on this page: service -> resource -> transaction
      -> machine -> one focused runtime or test proof.
- [ ] Move `submit` detours, broader app-assembly rationale, and request-boot
      follow-ups into linked pages such as `guide/app-structure.md`,
      `guide/server-hydration.md`, or `reference/api.md` instead of inline side
      quests.
- [ ] Decide whether React mount and scenario testing both belong on the first
      page; if not, keep one here and move the other into `What To Learn Next`.
- [ ] Keep one recommended testing story on the page so onboarding does not
      fork between focused and app-aware harnesses before the first path is
      internalized.

Action type: split

### [ ] 13. Clean up information-architecture overlap across concept/guides/reference

Status:

- `concepts.md`, `guide/app-structure.md`, `reference/api.md`,
  `guide/ownership-and-runtime-facts.md`, and `reference/runtime.md` all explain
  overlapping ownership/app assembly material

Why it feels sloppy:

- readers can reach the same explanation from multiple doors
- the repo pays ongoing maintenance cost in five places

Suggested direction:

- `concepts.md`: ownership model only
- `guide/app-structure.md`: file layout and assembly pattern only
- `guide/ownership-and-runtime-facts.md`: justification and receipts only
- `reference/api.md`: concise index only
- `reference/runtime.md`: runtime handles and boundaries only

Concrete sub-items:

- [ ] Give each page one clear job and remove sections that are currently doing
      someone else's work: `concepts.md#Apps And Layers`,
      `guide/app-structure.md#App Assembly` payoff bullets,
      `reference/api.md#Why flow.module And flow.app Exist`, and repeated runtime
      motivation in `reference/runtime.md`.
- [ ] Replace repeated explanation blocks with short `Read This Next` links
      between `concepts.md`, `guide/app-structure.md`,
      `guide/ownership-and-runtime-facts.md`, `reference/api.md`, and
      `reference/runtime.md`.
- [ ] Keep `reference/api.md` as the shortest surface index, not a second
      conceptual guide, and keep `reference/runtime.md` focused on handles,
      request boot, and inspection boundaries.
- [ ] After the trim pass, re-read the five-page set front to back and make
      sure a new reader sees each explanation once instead of five near-duplicates.

Action type: consolidate and trim

## Core Codebase Cleanup Backlog

### [x] 14. Split `testing/flow-test.ts` by responsibility

Status:

- `packages/flow-state/src/testing/flow-test.ts` is 739 lines, and state-owned
  stream ownership, timer ownership, transaction bookkeeping, runtime boot,
  progress controls, and read-only harness helpers now live under dedicated
  testing helpers

Progress landed:

- direct state-owned stream subscription, routing, completion, interrupt, and
  generation bookkeeping now lives under
  `packages/flow-state/src/testing/flow-test-stream-ownership.ts`, while
  `public-typing-architecture.test.ts` now proves `flow-test.ts` delegates that
  seam instead of owning the callback and controlled-stream wiring inline
- direct state-owned timer scheduling, fire, interrupt, and generation
  bookkeeping now lives under
  `packages/flow-state/src/testing/flow-test-after-timer-ownership.ts`, while
  `public-typing-architecture.test.ts` now proves `flow-test.ts` delegates that
  seam instead of owning the delayed-work planning and timer receipt wiring
  inline
- pending-work snapshots, bounded timer advancement, the shared `until*`
  progress loop, and `settle(...)` now live under
  `packages/flow-state/src/testing/flow-test-progress-controls.ts`, while
  `public-typing-architecture.test.ts` now proves `flow-test.ts` delegates that
  seam instead of owning ready-work counting and settle-bounds diagnostics
  inline
- stream/timer/transaction inspectors, child summaries, receipt and issue
  summaries, and correlation-focused trace lookup now live under
  `packages/flow-state/src/testing/flow-test-read-surface.ts`, while
  `public-typing-architecture.test.ts` now proves `flow-test.ts` delegates that
  seam instead of owning the direct read-only inspector and trace wiring inline
- transaction preview overlays, invalidation, concurrency queues, interrupt
  recovery, and retry/reset bookkeeping now live under
  `packages/flow-state/src/testing/flow-test-transaction-bookkeeping.ts`,
  while `public-typing-architecture.test.ts` now proves `flow-test.ts`
  delegates that seam instead of owning the active transaction registry,
  preview patch application, and start/retry concurrency wiring inline
- runtime boot, managed runtime creation, `TestClock` ownership, and custom
  clock wiring now live under
  `packages/flow-state/src/testing/flow-test-runtime-boot.ts`, while
  `public-typing-architecture.test.ts` now proves `flow-test.ts` delegates that
  seam instead of owning `providedLayers`, `createRuntime(...)`, and
  `Clock.currentTimeMillis` plumbing inline
- builder state, app fixture resolution, and `start(...)` / `model(...)` wiring
  now live under `packages/flow-state/src/testing/flow-test-builder.ts`, while
  `public-typing-architecture.test.ts` now proves `flow-test.ts` delegates that
  seam instead of owning `BuilderState`, `fixtureResourcesForApp(...)`, and the
  recursive fixture/resource builder plumbing inline

Why it feels sloppy:

- the file owns builder setup, runtime creation, snapshots, transaction queues,
  preview overlays, stream/timer bookkeeping, pending work, settle semantics,
  and test harness APIs
- it is hard to change one harness concern without re-reading five others

Suggested split:

- builder/app/fixture wiring
- runtime boot and clock management
- transaction bookkeeping
- stream/timer bookkeeping
- settle/pending-work controls
- read-only harness query helpers

Action type: split

### [x] 15. Split `core/orchestrator/orchestrator-system.ts` by lifecycle concern

Status:

- `packages/flow-state/src/core/orchestrator/orchestrator-system.ts` is now 489
  lines after moving child actor ownership, inspection plumbing,
  registry/start-stop ownership, transaction ownership, streams/timers
  ownership, and actor lifecycle/API assembly into dedicated helpers

Progress landed:

- child actor ownership now lives under
  `packages/flow-state/src/core/orchestrator/orchestrator-children.ts`, while
  `runtime-architecture.test.ts` now proves the parent file no longer owns the
  `ownedChildren` registry or the child attach/start loops directly
- actor snapshot and inspection receipt plumbing now lives under
  `packages/flow-state/src/core/orchestrator/orchestrator-inspection.ts`, while
  `runtime-architecture.test.ts` now proves the parent file no longer owns the
  inspection receipt annotation or correlation counter plumbing directly
- registry ownership plus the `start/get/stop/stopAll` surface now lives under
  `packages/flow-state/src/core/orchestrator/orchestrator-registry.ts`, while
  `runtime-architecture.test.ts` now proves the parent file no longer owns the
  recursive registration helper or the `OrchestratorSystem.start(...)`
  implementation directly
- transaction ownership now lives under
  `packages/flow-state/src/core/orchestrator/orchestrator-transaction-ownership.ts`,
  while `runtime-architecture.test.ts` now proves the parent file no longer
  owns the state-owned transaction start loop or the actor-facing
  `transaction:reset` path directly
- streams and timers ownership now lives under
  `packages/flow-state/src/core/orchestrator/orchestrator-stream-timer-ownership.ts`,
  while `runtime-architecture.test.ts` now proves the parent file no longer
  owns the timer-fire transition callback or direct
  `createStreamTimerController(...)` wiring
- actor lifecycle and API assembly now lives under
  `packages/flow-state/src/core/orchestrator/orchestrator-actor-lifecycle.ts`,
  while `runtime-architecture.test.ts` now proves the parent file no longer
  owns listener bookkeeping or the Effect-native actor `flush`/`dispose`
  lifecycle paths directly

Why it feels sloppy:

- actor registration, ownership, child lifecycle, transaction wiring,
  streams/timers, issues, and stop/dispose logic are all concentrated together

Action type: split

### [x] 16. Tighten descriptor metadata to what is truly live

Status:

- module metadata carries `dependencies`, `tags`, `screens`, `fixtures`,
  `permissions`
- those fields now feed inventory summaries, app ownership, test fixtures, and
  inspection events, but validation had been looser than those executable uses

Progress landed:

- `packages/flow-state/src/descriptors/validation.ts` now rejects non-string
  `dependencies`, `tags`, `screens`, `fixtures`, and `permissions` metadata via
  a shared validator and the dedicated `FLOW-APP-008` diagnostic, while
  `packages/flow-state/src/app-inventory.test.ts` now proves `flow.module(...)`
  fails closed when a live ownership metadata field is not a string array

Why it feels sloppy:

- the shape looks more semantically complete than the implementation really is
- it invites weakly justified metadata accumulation

Evidence:

- `packages/flow-state/src/core/api/app-types.ts`
- `packages/flow-state/src/descriptors/inventory.ts`
- `packages/flow-state/src/descriptors/validation.ts`

Suggested direction:

- either make more metadata executable
- or clearly demote descriptive-only fields
- consider separating provider metadata from consumer metadata, especially for
  fixtures

Action type: narrow or split

### [x] 17. Remove or justify placeholder-feeling inventory surfaces like `policies`

Status:

- `policies` can still exist as a loose module bucket
- validation does not treat it as a first-class checked registry
- app inventory does not flatten it the way it flattens resources/actors/views

Progress landed:

- `packages/flow-state/src/core/api/app-types.ts` and
  `packages/flow-state/src/descriptors/inventory.ts` no longer advertise
  `policies` through `FlowModuleInventorySummary`, while
  `packages/flow-state/src/app-inventory.test.ts` now proves a module can still
  carry a loose `policies` bucket without the summarized inventory contract
  pretending it is first-class

Why it feels sloppy:

- it looks first-class in the type shape
- it behaves more like a loose bucket

Evidence:

- `packages/flow-state/src/core/api/app-types.ts`
- `packages/flow-state/src/descriptors/inventory.ts`
- `packages/flow-state/src/descriptors/validation.ts`
- example usage in `examples/launch-workspace/src/launchWorkspaceApproval.ts`

Suggested direction:

- either formalize the concept
- or remove it from the top-level inventory contract

Action type: delete or prove

### [x] 18. Replace repeated empty-app test setup with a dedicated internal helper

Status:

- an internal helper now owns most empty-app runtime installation boilerplate,
  and the only remaining raw `flow.app({ modules: [] }).layer(...)` calls under
  `packages/flow-state/src` are the `public-api-types.test.ts` assertions that
  explicitly exercise the app-layer surface

Why it feels sloppy:

- it is boilerplate
- it suggests the public app shape is doing setup work that tests do not
  actually care about

Progress landed:

- `packages/flow-state/src/testing/fixtures/runtime-test-fixtures.ts` now owns
  `createTestRuntimeWithInstallers(...)`, and the repeated empty-app runtime
  setup in `react/provider.test.ts`, `react/use-resource.test.ts`,
  `react/use-actor.test.ts`, `views.test.ts`, `runtime-rehydration.test.ts`,
  `runtime-inspection.test.ts`, `flow-story-run.test.ts`, `flush.test.ts`,
  `performance-regression.test.ts`, `inspection-local-proof.test.ts`, and the
  runtime-only parts of `public-api-types.test.ts` now delegate to that helper
  instead of inlining `flow.app({ modules: [] }).layer(...)`

Evidence:

- repeated in `public-api-types.test.ts`, `views.test.ts`,
  `runtime-rehydration.test.ts`, `runtime-inspection.test.ts`,
  `react/provider.test.ts`, and others

Suggested direction:

- add an internal helper for "test runtime with installers"
- keep app composition for tests that actually care about module ownership

Action type: extract

## Suggested Order Of Work

### Pass 1: Honesty And Surface Reduction

- tighten docs claims around executable vs contract-only
- collapse one `flow.app(...)` form
- stop teaching `flow.module(() => ...)` as the default
- decide what to do with `createRuntime()` vs `flow.runtime(App.layer(...))`

### Pass 2: Recipes And Onboarding

- rewrite `guide/recipes.md`
- split `getting-started.md`
- reduce repeated package-split and module/app explanations

### Pass 3: Public Contract Pruning

- review `persist`, `permission`, `policies`, and `moduleMap` emphasis
- narrow metadata fields that are not yet paying rent
- clean up naming drift like `query:*` receipts

## Success Criteria For The De-Sloppify Pass

The pass is working if, after the edits:

- a new user can tell which API path is the default without reading three pages
- the docs stop repeating the same caveats
- weak or placeholder-feeling public surfaces are either removed or explicitly
  future-flagged with `@deprecated` when needed
