# Flow State Documentation Rebuild Plan

Goal: rewrite `apps/docs/src/pages` into final-feeling product documentation for
Flow State, using the stable API usage proof in `examples/launch-workspace` and
the product contract in `apps/docs/src/pages/reference-next`.

This is a documentation task, not a runtime implementation task. The author AI
must not turn this into "make runtime-real APIs." The job is to represent the
API shape, usage patterns, code examples, semantics, limitations, and current
status professionally.

## Source Contract

- [ ] Read `examples/launch-workspace/README.md`.
- [ ] Read `examples/launch-workspace/API_INVENTORY.md`.
- [ ] Read the full Launch Workspace source:
  - [ ] `examples/launch-workspace/src/domain.ts`
  - [ ] `examples/launch-workspace/src/services.ts`
  - [ ] `examples/launch-workspace/src/launchWorkspaceResources.ts`
  - [ ] `examples/launch-workspace/src/launchWorkspaceStreams.ts`
  - [ ] `examples/launch-workspace/src/launchWorkspaceGuards.ts`
  - [ ] `examples/launch-workspace/src/launchWorkspace.ts`
  - [ ] `examples/launch-workspace/src/launchWorkspace.test.ts`
  - [ ] `examples/launch-workspace/src/launchWorkspaceServices.test.ts`
  - [ ] `examples/launch-workspace/src/main.tsx`
- [ ] Read all current contract docs:
  - [ ] `apps/docs/src/pages/reference-next.md`
  - [ ] `apps/docs/src/pages/reference-next/lib-api.md`
  - [ ] `apps/docs/src/pages/reference-next/core.md`
  - [ ] `apps/docs/src/pages/reference-next/effect-runtime.md`
  - [ ] `apps/docs/src/pages/reference-next/streams-schedules.md`
  - [ ] `apps/docs/src/pages/reference-next/tests-and-examples.md`
- [ ] Skim old docs under `apps/docs/src/pages/reference/*` only to avoid
      accidentally preserving stale terminology as current docs.
- [ ] Treat `examples/launch-workspace/API_INVENTORY.md` as the current truth for
      what is executable, compatibility-backed, descriptor-only, or contract-only.

Acceptance gate:

- [ ] The author can explain, before editing, which docs pages will teach stable
      API usage and which page will carry implementation status.
- [ ] The author can list every public API that Launch Workspace covers.
- [ ] The author can name the current partial surfaces without turning them into
      implementation tasks.

## Documentation Product Shape

The finished docs should feel like a professional product manual. They should
not feel like planning notes, experiment logs, or a vNext pitch deck.

- [ ] Remove "vNext" as the reader-facing information architecture.
- [ ] Replace "Status: draft", "target", "proposed", "current implementation
      note", and "while the runtime catches up" language with stable docs plus a
      dedicated status page.
- [ ] Keep status caveats honest, but do not sprinkle caveats through every
      page. Put the detailed executable/contract-only matrix in one place and
      link to it when needed.
- [ ] Make Launch Workspace the flagship example and source of concrete code
      patterns.
- [ ] Present old example packages as legacy examples or pressure-test history,
      not as the main docs path.
- [ ] Use one consistent mental model:

```txt
Resources model what the app knows.
Flows model what the app is doing.
Views model what the user sees.
Modules make product domains discoverable and composable.
The runtime wires resources, flows, services, streams, time, and tests together.
```

Acceptance gate:

- [ ] A new reader can start at the homepage and understand what Flow State is,
      when to use it, and how the main pieces fit together.
- [ ] A returning user can open the quick reference and find the right API
      without reading planning history.
- [ ] Partial surfaces are documented as current status, not hidden and not
      overclaimed.

## Target Page Map

Create or rewrite `apps/docs/src/pages` around this final structure.

- [ ] `index.mdx`
  - [ ] Crisp product introduction.
  - [ ] The Resources / Flows / Views model.
  - [ ] What Flow State adds on top of Effect.
  - [ ] A small code sample linking module, resource, transaction, machine, view,
        app, and test.
  - [ ] Links to Getting Started, Concepts, Quick Reference, Launch Workspace,
        and Status.
- [ ] `concepts.md`
  - [ ] Ownership rules for ResourceStore, OrchestratorSystem, views, and Effect
        services.
  - [ ] Decision guide: resource vs flow context vs view.
  - [ ] Explain modules as domain manifests.
  - [ ] Explain Effect posture: import Effect-native concepts from `effect`, not
        from Flow.
- [ ] `getting-started.md`
  - [ ] Minimal but real-feeling app slice.
  - [ ] Define a service with `Context.Service`.
  - [ ] Define a resource with `key`, `lookup`, `tags`, and `freshness`.
  - [ ] Define a transaction with `params`, `commit`, `preview`, and
        `invalidates`.
  - [ ] Define a machine with `guard`, `update`, `invoke`, and `flow.can`.
  - [ ] Define a view and a small React usage snippet.
  - [ ] Define a `flowTest` scenario with normal Vitest assertions.
- [ ] `guide/launch-workspace.md`
  - [ ] Walk through Launch Workspace as one cohesive app, not a gallery.
  - [ ] Map screens to modules: Session, Project, Checklist, Readiness, Assets,
        Approval, Assistant, Chat, Launch, Trace.
  - [ ] Explain how old example pressure areas are folded into one product.
  - [ ] Link product workflows to the tests that prove them.
- [ ] `guide/patterns.md`
  - [ ] Code pattern recommendations for domain modeling, services, resources,
        transactions, machines, views, React, and tests.
  - [ ] Short "prefer / avoid" tables.
  - [ ] Guidance for keeping canonical API data out of flow context.
- [ ] `guide/testing.md`
  - [ ] `flowTest(flow)` vs `flowTest.app(App)`.
  - [ ] `.provide(layer)`, `.start(...)`, `.send(...)`, `.flush()`.
  - [ ] App resource seeding, module fixtures, transaction probes, stream probes,
        timer probes, receipts, and issues.
  - [ ] Controlled effects and controlled streams.
  - [ ] Direct Effect service tests with `@effect/vitest` or regular Effect
        execution.
  - [ ] Explicitly state that Flow does not own `.expect*` assertion helpers.
- [ ] `reference/api.md`
  - [ ] Quick reference table for every public function and test utility.
  - [ ] Keep it short enough to scan.
  - [ ] Link each entry to the detailed reference page.
- [ ] `reference/resources.md`
  - [ ] `flow.resource`.
  - [ ] Resource refs and key identity.
  - [ ] `lookup`, `tags`, `cache`, `freshness`, `placeholder`, `schema`.
  - [ ] Resource snapshots.
  - [ ] ResourceStore reads, seeds, patching, subscriptions, invalidation, and
        status caveats.
- [ ] `reference/transactions.md`
  - [ ] `flow.transaction` as final write authoring API.
  - [ ] `params`, `commit`, `preview`, `invalidates`, `queue`, `routes`,
        `concurrency`.
  - [ ] Preview patch and rollback semantics.
  - [ ] Offline queue and undo pattern from Launch Workspace.
  - [ ] Compatibility note: current runtime receipts still use `mutation:*`.
- [ ] `reference/machines.md`
  - [ ] `flow.machine` process state model.
  - [ ] `guard`, `update`, `actions`, `invoke`, `after`, `flow.can`.
  - [ ] `flow.ensure`, `flow.observe`, `flow.refresh`, `flow.run`,
        `flow.patch`, `flow.invalidate`, `flow.stream`, `flow.child`.
  - [ ] What belongs in machine context.
  - [ ] What does not belong in machine context.
- [ ] `reference/views-react.md`
  - [ ] `flow.view` as the UI read-model boundary.
  - [ ] `FlowProvider`, `flow.useResource`, `flow.use`, `flow.useView`,
        `flow.can`.
  - [ ] Breadcrumb/resource-only pattern.
  - [ ] Workflow screen pattern.
  - [ ] Launch overview view pattern combining resources, flows, children,
        receipts, and issues.
  - [ ] Current React integration status.
- [ ] `reference/runtime.md`
  - [ ] `flow.app`, `App.layer`, `flow.runtime`.
  - [ ] `flow.store.memory`, `flow.store.test`.
  - [ ] `flow.orchestrators.live`, `flow.orchestrators.test`.
  - [ ] ResourceStore and OrchestratorSystem as sibling services.
  - [ ] Actor handle shape: `id`, `send`, `snapshot`, `subscribe`, `dispose`,
        `retryChild`, `children`, `receipts`, `issues`.
  - [ ] Trace, receipts, issues, failure/defect/interrupt lanes.
- [ ] `reference/streams-time.md`
  - [ ] `flow.stream` with `subscribe`.
  - [ ] `unsubscribe` vs `dispose`.
  - [ ] Stream snapshots, generation, stale token protection, cancellation, and
        routes.
  - [ ] Pressure vocabulary and the `coalesce-latest` compatibility/sugar note.
  - [ ] `flow.after`, `Duration.Input`, `Schedule`, `Clock`, `TestClock`.
  - [ ] `flush`, `settle`, and `advance` distinctions.
- [ ] `reference/status.mdx`
  - [ ] Professional current-status matrix.
  - [ ] Columns: API, docs status, example proof, executable status, caveat.
  - [ ] Include every API from Launch Workspace coverage.
  - [ ] Make it clear that API usage proof is complete and runtime-real work is
        not the current docs task.
- [ ] `migration.md`
  - [ ] `flow.query` -> `flow.resource`.
  - [ ] `flow.mutation` -> `flow.transaction`.
  - [ ] `input` -> `params`.
  - [ ] `effect` -> `commit`.
  - [ ] `optimistic` -> `preview`.
  - [ ] `stream` source field -> `subscribe`.
  - [ ] object-shaped durations -> Effect `Duration.Input` strings.
  - [ ] primary `AsyncIterable` streams -> Effect `Stream`.
  - [ ] Flow-owned assertion helpers -> host test runner assertions over
        harness facts.

Acceptance gate:

- [ ] The Vocs sidebar and top nav no longer expose "Reference vNext" as a
      separate future-looking section.
- [ ] Old reference pages are either removed from nav, rewritten into the final
      structure, or explicitly marked legacy.
- [ ] Every public API has both a quick reference entry and a deeper explanation.

## Public API Coverage Checklist

The final docs must cover all of these, with at least one code example or
specific Launch Workspace reference where useful.

- [ ] `flow.module`
- [ ] `flow.resource`
- [ ] `flow.transaction`
- [ ] `flow.mutation` as compatibility only
- [ ] `flow.machine`
- [ ] `flow.view`
- [ ] `flow.app`
- [ ] `App.layer`
- [ ] `flow.runtime`
- [ ] `flow.store.memory`
- [ ] `flow.store.test`
- [ ] `flow.orchestrators.live`
- [ ] `flow.orchestrators.test`
- [ ] `flow.ensure`
- [ ] `flow.observe`
- [ ] `flow.refresh`
- [ ] `flow.run`
- [ ] `flow.patch`
- [ ] `flow.invalidate`
- [ ] `flow.stream`
- [ ] `flow.after`
- [ ] `flow.child`
- [ ] `flow.can`
- [ ] `FlowProvider`
- [ ] `flow.useResource`
- [ ] `flow.use`
- [ ] `flow.useView`
- [ ] `flowTest`
- [ ] `flowTest.app`
- [ ] `createControlledEffect`
- [ ] `createControlledStream`

Runtime facts and inspectable state to document:

- [ ] Resource snapshots.
- [ ] Transaction/mutation snapshots.
- [ ] Stream snapshots.
- [ ] Timer snapshots.
- [ ] Child actor snapshots.
- [ ] Receipts.
- [ ] Issues.
- [ ] Trace/timeline facts.
- [ ] App and module inventory.

Acceptance gate:

- [ ] The docs author can grep the final docs for every API above and find a
      meaningful explanation.
- [ ] `flow.mutation`, `flow.query`, old submit-style helpers, and
      `optimistic` are not taught as primary final APIs.

## Code Examples To Extract Or Adapt

Use Launch Workspace as the concrete source. Do not invent generic toy snippets
when a real Launch Workspace pattern exists.

- [ ] Domain modeling examples from `domain.ts`:
  - [ ] branded IDs
  - [ ] schema-backed values
  - [ ] typed failures
  - [ ] redacted approval/customer data
  - [ ] `Option` / `Result` use
- [ ] Service examples from `services.ts`:
  - [ ] `Context.Service`
  - [ ] `Effect.fn`
  - [ ] `Layer.succeed` / merged test services
  - [ ] `Clock.currentTimeMillis` instead of `Date.now()`
  - [ ] service methods returning `Effect` and `Stream`
- [ ] Resource examples from `launchWorkspaceResources.ts` and
      `launchWorkspace.ts`:
  - [ ] `Project.byId`
  - [ ] `Project.comments`
  - [ ] `Readiness.metrics`
  - [ ] permissions/approval/assets resources
  - [ ] `key`, `lookup`, `tags`, `placeholder`, `freshness`
- [ ] Transaction examples:
  - [ ] `Project.save`
  - [ ] approval submit/request transaction
  - [ ] `params`, `commit`, `preview`, `invalidates`, `routes`
  - [ ] offline queue and undo test pattern
- [ ] Machine examples:
  - [ ] Project editor loading/viewing/editing/saving/conflict flow
  - [ ] checklist pure local flow
  - [ ] assets upload state with stream and timer descriptors
  - [ ] approval permission gate
  - [ ] assistant parent/child actor flow
  - [ ] chat stream flow with `STOP_GENERATION`
- [ ] View examples:
  - [ ] Project editor view
  - [ ] Readiness dashboard view
  - [ ] Launch overview view
  - [ ] Trace timeline view
  - [ ] Chat lifecycle view
- [ ] Test examples:
  - [ ] API coverage test
  - [ ] app inventory/module fixture test
  - [ ] ResourceStore seed/get/patch/subscribe test
  - [ ] preview rollback test
  - [ ] offline queue/undo/replay test
  - [ ] chat route detach/reattach/dispose test
  - [ ] child actor failure/retry test
  - [ ] direct service tests for schema, redaction, typed failure, batching

Acceptance gate:

- [ ] Every major code snippet in the docs either comes from Launch Workspace or
      is a deliberate shortened adaptation of it.
- [ ] Shortened snippets preserve final API names and do not reintroduce old
      terms.
- [ ] Snippets are complete enough for readers to understand imports,
      ownership, and where the code belongs.

## Terminology Rules

Use these names consistently.

- [ ] Use `resource`, not `query`, for canonical shared reads.
- [ ] Use `lookup` for resource loading.
- [ ] Use `transaction`, not `mutation`, for final write authoring.
- [ ] Use `params`, not `input`, for transaction variables.
- [ ] Use `commit`, not `effect`, for transaction write Effects.
- [ ] Use `preview`, not `optimistic`, for rollbackable local patches.
- [ ] Use bare `guard` for predicates.
- [ ] Use pure `update` for context reducers.
- [ ] Use `actions` only for synchronous transition-side work/receipts.
- [ ] Use `ensure = process dependency`.
- [ ] Use `observe = data dependency`.
- [ ] Use `subscribe` for stream source functions.
- [ ] Use `unsubscribe` for concrete stream/subscription cleanup.
- [ ] Use `dispose` for runtime, actor, service, and large lifetime cleanup.
- [ ] Use `Duration.Input` strings like `"30 seconds"`, `"5 minutes"`, and
      `"250 millis"`.
- [ ] Say `Effect services` and `Layer`s, not custom dependency injection.
- [ ] Say `typed failure`, `defect`, and `interrupt`; do not collapse everything
      into "error".

Compatibility wording:

- [ ] `flow.mutation` is a compatibility surface.
- [ ] `mutation:*` receipts are current internal labels for transaction execution.
- [ ] `flow.query` is legacy/migration language.
- [ ] `submit` and old submit-style helpers are migration sugar.
- [ ] `coalesce-latest` is compatibility/product sugar unless the pressure API is
      intentionally kept.

Acceptance gate:

- [ ] `rg "Status:|vNext|draft|proposed|target|optimistic|flow.query|input:|effect:|coalesce-latest" apps/docs/src/pages`
      has only intentional migration/status hits.
- [ ] No reader-facing current docs call the final API "proposed".

## Status Representation

The docs should be final-feeling and honest. Use a dedicated status page to avoid
overclaiming.

- [ ] Build `reference/status.mdx` from the structured Launch Workspace status registry.
- [ ] Include statuses:
  - [ ] executable
  - [ ] executable through compatibility
  - [ ] descriptor-only
  - [ ] contract-only
  - [ ] legacy/migration
- [ ] Explain that Launch Workspace is the API usage proof and not a production
      app.
- [ ] Explain that runtime-real implementation is not part of this docs pass.
- [ ] Keep partial surfaces visible:
  - [ ] live app-level resource lookup/freshness/cache semantics
  - [ ] `flow.ensure` / `observe` / `refresh` / `patch` / `invalidate` live
        behavior
  - [ ] final transaction receipt labels
  - [ ] offline queue persistence across reloads
  - [ ] stream pressure counters and broader runtime-owned stream disposal
  - [ ] virtual time, `flowTest.advance`, and `settle`
  - [ ] deterministic mailboxes
  - [ ] real Layer installers for orchestrator descriptors
  - [ ] automatic child restart policies
  - [ ] generated typed hooks and React live subscriptions
  - [ ] full trace correlation
- [ ] Do not let these caveats dominate the conceptual and quick-reference pages.

Acceptance gate:

- [ ] A skeptical reader can tell what exists today without reading source.
- [ ] A new reader can learn the intended API without wading through caveats.

## Page Content Requirements

Each page should follow a professional documentation shape.

- [ ] Start with what the concept is for.
- [ ] Show the smallest useful code example.
- [ ] Explain the ownership rule or runtime rule.
- [ ] Show the Launch Workspace pattern when relevant.
- [ ] Include "Use this when" and "Prefer / Avoid" guidance where useful.
- [ ] Link to detailed reference, examples, and status.
- [ ] Avoid long planning narrative.
- [ ] Avoid TODO-style prose inside the docs pages themselves.
- [ ] Avoid hiding important caveats in footnotes.
- [ ] Keep code examples consistent in import style.

Suggested per-page structure:

```txt
# Page Title

One-paragraph purpose.

## Quick Example
## How It Works
## Recommended Patterns
## Reference
## Status
```

Acceptance gate:

- [ ] Each page can stand alone.
- [ ] Related pages link to each other without circular "read everything first"
      dependency.
- [ ] The docs are useful to an app author, not only to Flow core contributors.

## Navigation And Old Docs

- [ ] Update `apps/docs/vocs.config.ts`.
- [ ] Top nav should be product-oriented:
  - [ ] Start
  - [ ] Guides
  - [ ] Reference
  - [ ] Status
- [ ] Sidebar should use the final page map, not Planning / Reference /
      Reference vNext split.
- [ ] Remove `reference-next` from reader-facing nav.
- [ ] Decide what to do with old files:
  - [ ] rewrite into final pages,
  - [ ] leave unlinked as legacy implementation notes,
  - [ ] or delete if they are fully superseded and not needed.
- [ ] Keep `examples.md` only if it becomes a polished examples/guide page. Do
      not leave it as an implementation roadmap in the public nav.
- [ ] Planning pages should be removed from primary docs nav unless they are
      intentionally private/internal docs.

Acceptance gate:

- [ ] The docs site no longer looks like two competing documentation sets.
- [ ] No public nav item suggests the docs are still a proposal.

## Verification Checklist

Run these after writing the docs.

- [ ] `pnpm --filter @flow-state/launch-workspace test -- --run`
- [ ] `pnpm --filter @flow-state/core test -- --run`
- [ ] `pnpm docs:build`
- [ ] `pnpm verify` if the docs build and package checks need full closeout.
- [ ] `git diff --check`
- [ ] Search for stale language:

```sh
rg -n "Status:|vNext|draft|proposed|target|optimistic|flow.query|flow.mutation|submit|AsyncIterable|Date.now|expectState|expectData|object-shaped|millis" apps/docs/src/pages
```

- [ ] For every hit, either remove it, move it to migration/status, or confirm it
      is intentionally documented as legacy/compatibility.
- [ ] Manually compare the final quick reference with
      `examples/launch-workspace/API_INVENTORY.md`.
- [ ] Manually compare code snippets with Launch Workspace source so examples do
      not teach APIs the example app does not use.

Final acceptance gate:

- [ ] Docs are final-feeling: no draft/vNext framing in the reader path.
- [ ] Quick reference covers every public API.
- [ ] Detailed pages explain semantics and code patterns.
- [ ] Launch Workspace is represented as the flagship API usage proof.
- [ ] Contract-only surfaces are documented honestly in one status page.
- [ ] Migration guidance prevents old terms from leaking into new examples.
- [ ] Verification commands pass or failures are documented with exact blockers.
