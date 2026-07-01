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

- `src/ready-work.ts` and `src/delayed-work.ts` now live under
  `src/core/scheduling/`; keep any future structural follow-up in
  `SRC_REORGANIZATION_BACKLOG.md`.
- `src/{inspection-receipts,receipt-correlation,receipt-summary,trace-report}.ts`
  now live under `src/core/inspection/`; keep any future structural follow-up
  in `SRC_REORGANIZATION_BACKLOG.md`.
- `src/{controlled-stream-source,stream-callbacks,stream-route}.ts` now live
  under `src/core/streams/`; keep any future structural follow-up in
  `SRC_REORGANIZATION_BACKLOG.md`.

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

### 1. Collapse overlapping public runtime entrypoints

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

### 2. Drop one `flow.app(...)` authoring form

Status:

- `flow.app({ modules })`
- `flow.app(moduleA, moduleB, ...)`

Why it feels sloppy:

- both forms exist for a very small normalization win
- docs and tests must support both
- it makes examples less visually consistent

Evidence:

- `packages/flow-state/src/public/flow-core.ts`
- `packages/flow-state/src/public-api-types.test.ts`
- `packages/flow-state/src/app-inventory.test.ts`
- `examples/launch-workspace/src/launchWorkspaceAssembly.ts`

Suggested direction:

- keep `flow.app({ modules })`
- delete the rest-arg form
- prefer the form that best supports readable examples and diff stability

Action type: delete

### 3. Stop teaching the eager `flow.module(..., () => ({ ... }))` form as default

Status:

- the factory form exists
- the current behavior is eager, not lazy
- docs and examples still use the function shape in several places

Why it feels sloppy:

- a function-shaped API strongly suggests deferred work or late binding
- today it mostly adds ceremony unless a caller genuinely wants a grouping
  closure

Evidence:

- `packages/flow-state/src/descriptors/module.ts`
- `packages/flow-state/src/public/flow-core.ts`
- `apps/docs/src/pages/getting-started.md`
- `apps/docs/src/pages/guide/app-structure.md`
- `examples/launch-workspace/src/*Module*`

Suggested direction:

- keep the object form
- delete the eager factory form
- do not preserve a function-shaped API that implies laziness it does not have

Action type: delete

### 4. Re-evaluate `flow.persist(...)` and `flow.permission(...)` as public builders

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

- `packages/flow-state/src/public/flow-core.ts`
- `packages/flow-state/src/public/app-types.ts`
- `packages/flow-state/src/index.ts`
- `examples/launch-workspace/src/launchWorkspaceApproval.ts`

Suggested direction:

- delete them from the public contract
- rewrite or remove the remaining example usage
- do not keep metadata-only wrappers as first-class builders

Action type: delete

### 5. Replace repeated staged-package disclaimers with one durable contract page

Status:

- many docs pages repeat the same `@flow-state/core/*` split explanation
- many pages repeat the same `flow.module` / `flow.app` payoff story

Why it feels sloppy:

- users keep re-reading setup caveats instead of learning the concept
- repeated explanations drift out of sync
- it makes the docs feel generated from overlapping prompts rather than edited
  as one information architecture

Evidence:

- repeated subpath references across:
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

Action type: consolidate

## Public API Cleanup Backlog

### 6. Reduce public type sprawl around app/module/test surfaces

Status:

- `packages/flow-state/src/public/app-types.ts` is 1416 lines
- `packages/flow-state/src/core/api/data-types.ts` is 601 lines
- `packages/flow-state/src/core/api/machine-types.ts` is 346 lines

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

Action type: split

### 7. Tighten the real public contract around `flowTest.app(...)`

Status:

- docs often pitch `flowTest.app(App)` as the app-level harness
- the actual unique payoff is narrower: fixture-name resolution and app-backed
  inventory context
- plain `seedResources(...)` works without app composition

Why it feels sloppy:

- the docs make the app harness sound more required than it is
- it hides the lighter-weight path for many tests

Evidence:

- `packages/flow-state/src/testing/flow-test.ts`
- `apps/docs/src/pages/getting-started.md`
- `apps/docs/src/pages/guide/testing.md`
- `apps/docs/src/pages/guide/patterns.md`

Suggested direction:

- teach `flowTest(machine)` as the default
- teach `flowTest.app(App)` only when fixtures, ownership inventory, or
  app-layer runtime context actually matter

Action type: narrow

### 8. Clean up naming drift around resource receipts

Status:

- transaction naming has moved forward
- resource receipts still visibly use `query:*` lanes in real tests and runtime
  code

Why it feels sloppy:

- the user-facing authoring surface says `resource`, not `query`
- mixed vocabulary makes the runtime look half-migrated

Evidence:

- `examples/launch-workspace/src/launchWorkspace.test.ts`
- `packages/flow-state/src/services/orchestrator-resources.ts`
- `packages/flow-state/src/core/inspection/trace-report.ts`
- `packages/flow-state/src/runtime.test.ts`

Suggested direction:

- either fully bless `query:*` as an internal legacy lane and hide it from docs
- or migrate the receipt vocabulary to the current public model

Action type: rename or isolate

### 9. Review whether `moduleMap` deserves headline status

Status:

- `moduleMap` is a real typed surface
- most of the strongest proof is type-level
- it is featured heavily in the docs pitch

Why it feels sloppy:

- it may be a nice affordance, but it does not appear to be one of the biggest
  day-to-day productivity wins compared with fixtures, ownership, and layer
  assembly

Evidence:

- `packages/flow-state/src/public-api-types.test.ts`
- docs emphasis in `reference/api.md`, `getting-started.md`,
  `guide/app-structure.md`

Suggested direction:

- either show more real call sites that justify the emphasis
- or de-emphasize it in the public sales pitch

Action type: prove or down-rank

## Docs And Recipes Cleanup Backlog

### 10. Trim recipe pages to decision rules, not one-snippet-per-feature coverage

Status:

- `apps/docs/src/pages/guide/recipes.md` reads like a flat list of API-shaped
  snippets

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

Action type: rewrite

### 11. Make the docs honest about executable vs contract-only status everywhere

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

Action type: tighten

### 12. Simplify Getting Started so it teaches one ladder, not several side quests

Status:

- `apps/docs/src/pages/getting-started.md` is 305 lines
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

Action type: split

### 13. Clean up information-architecture overlap across concept/guides/reference

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

Action type: consolidate and trim

## Core Codebase Cleanup Backlog

### 14. Split `testing/flow-test.ts` by responsibility

Status:

- `packages/flow-state/src/testing/flow-test.ts` is 2023 lines

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

### 15. Split `services/orchestrator-system.ts` by lifecycle concern

Status:

- `packages/flow-state/src/services/orchestrator-system.ts` is 1080 lines

Why it feels sloppy:

- actor registration, ownership, child lifecycle, transaction wiring,
  streams/timers, issues, and stop/dispose logic are all concentrated together

Suggested split:

- registry/start-stop core
- child actor ownership
- transaction ownership
- streams/timers ownership
- issue/inspection plumbing

Action type: split

### 16. Tighten descriptor metadata to what is truly live

Status:

- module metadata carries `dependencies`, `tags`, `screens`, `fixtures`,
  `permissions`
- only some of these materially affect runtime/test behavior today

Why it feels sloppy:

- the shape looks more semantically complete than the implementation really is
- it invites weakly justified metadata accumulation

Evidence:

- `packages/flow-state/src/public/app-types.ts`
- `packages/flow-state/src/descriptors/inventory.ts`
- `packages/flow-state/src/descriptors/validation.ts`

Suggested direction:

- either make more metadata executable
- or clearly demote descriptive-only fields
- consider separating provider metadata from consumer metadata, especially for
  fixtures

Action type: narrow or split

### 17. Remove or justify placeholder-feeling inventory surfaces like `policies`

Status:

- `policies` appears in module inventory summaries
- validation does not treat it as a first-class checked registry
- app inventory does not flatten it the way it flattens resources/actors/views

Why it feels sloppy:

- it looks first-class in the type shape
- it behaves more like a loose bucket

Evidence:

- `packages/flow-state/src/public/app-types.ts`
- `packages/flow-state/src/descriptors/inventory.ts`
- `packages/flow-state/src/descriptors/validation.ts`
- example usage in `examples/launch-workspace/src/launchWorkspaceApproval.ts`

Suggested direction:

- either formalize the concept
- or remove it from the top-level inventory contract

Action type: delete or prove

### 18. Replace repeated empty-app test setup with a dedicated internal helper

Status:

- many tests build runtimes through `flow.app({ modules: [] }).layer(...)`

Why it feels sloppy:

- it is boilerplate
- it suggests the public app shape is doing setup work that tests do not
  actually care about

Evidence:

- repeated in `public-api-types.test.ts`, `views.test.ts`,
  `runtime-rehydration.test.ts`, `runtime-inspection.test.ts`,
  `react/provider.test.ts`, and others

Suggested direction:

- add an internal helper for "test runtime with installers"
- keep app composition for tests that actually care about module ownership

Action type: extract

## Parked Example Work

The items below are intentionally out of scope for Goal 6 under the current
repo rules. Keep them parked unless a future goal explicitly reopens
example-focused cleanup.

### 19. Split `launchWorkspace.test.ts` into intent-shaped suites

Status:

- `examples/launch-workspace/src/launchWorkspace.test.ts` is 1392 lines

Why it feels sloppy:

- it is doing too much as one flagship proof file
- it makes it harder to see which failures belong to API contract, runtime
  wiring, UI shell, or product-slice behavior

Suggested split:

- inventory/assembly
- resource/runtime handles
- transactions and invalidation
- assistant/chat/stream lifecycle
- trace/debug surface

Action type: split

### 20. Split `launchWorkspaceAssembly.ts` by module ownership

Status:

- `examples/launch-workspace/src/launchWorkspaceAssembly.ts` is 563 lines

Why it feels sloppy:

- the file aggregates module wiring, app assembly, layer assembly, runtime
  factory helpers, seeds, and request-boot helpers
- it makes the flagship app look more centralized than the ownership model says

Suggested direction:

- keep a thin top-level assembly file
- move module-local fixture/runtime wiring closer to the owning domain files
- keep request-boot and browser/test runtime factories in separate files

Action type: split

### 21. Keep `API_INVENTORY.md` as an audit surface, not a marketing page

Status:

- the inventory is useful
- it also currently mixes executable, partial, and aspirational language

Why it feels sloppy:

- a proof artifact should be blunter than a landing page
- if it starts smoothing over contract-only behavior, it stops serving its best
  purpose

Suggested direction:

- use strict language:
  - executable
  - partial
  - contract-only
  - misleading docs to fix
- link each disputed claim to its strongest test or status proof

Action type: tighten

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
