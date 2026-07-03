# Application Behavior System Plan

This file is the concrete backlog for the shared application behavior contract
Flow State should generate from its executable descriptors and live runtime
facts.

It turns the current app inventory, graph analysis, stories, coverage, and
docs generation surfaces into one terse product with a single build/render/diff
loop.

It pairs with
[HOW_TO_USE_FLOW_STATE.md](/Users/arpit/Developer/flow-state/HOW_TO_USE_FLOW_STATE.md),
which captures the broader usage model. Unlike that note, this file is a coding
backlog. The exact generation/output contract lives in
[BEHAVIOR_CONTRACT.md](/Users/arpit/Developer/flow-state/BEHAVIOR_CONTRACT.md).

## Scope

- Build a first-class application behavior contract that composes live Flow
  descriptors and existing analysis surfaces into one app-level source of truth.
- Make humans, docs, tests, review workflows, and AI agents consume the same
  generated contract instead of parallel summaries.
- Keep runtime, testing, inspect, store, and React ownership where it already
  belongs. This plan adds a composer, not a second state model.
- Keep the minimal product terse: one canonical JSON artifact, one shared
  brief renderer, one detailed coverage view, and one diff surface.

## Decision locks

- The product target is a shared application behavior contract, not broad
  XState parity, a new runtime, or a browser-devtools rewrite.
- Start from executable descriptors and live proof surfaces only. Do not AST
  scrape components or infer workflow behavior from React trees.
- `flow.module(...)` and `flow.app(...)` remain the durable app boundary.
- Views are the render contract. Generated docs should describe views, not React
  components.
- Semantic coverage matters more than line coverage.
- Graph traversal, story execution, and trace analysis stay owned by their
  current packages. The new surface must compose them instead of cloning them.
- Machine-owned generated artifacts and user-owned editable scaffolds must stay
  separate.
- Commit one canonical machine-owned JSON artifact, then render the shared
  brief, detailed coverage, and diffs from it instead of generating parallel
  committed sources.
- Do not create separate AI-only and human-only outputs unless a later proof
  shows that the shared brief is not enough.
- Do not present queue/replay/undo, trace replay/time travel, or automatic
  child restart as finished product surfaces beyond the current status page.
- Treat `examples/launch-workspace` as the pressure-test and proof surface, not
  as the primary cleanup target.

## Guardrails

- Every phase must end with concrete generated output, test coverage, or docs
  receipts.
- Prefer one canonical generated contract artifact over many committed generated
  files that restate the same facts in different formats.
- Prefer one `behavior render` brief over multiple overlapping explain/summary
  commands.
- Prefer pure data outputs and deterministic scripts over UI-coupled helpers.
- Do not duplicate graph/path/runtime logic that already exists in inspect or
  testing.
- Do not expand descriptor metadata unless the behavior contract can consume it
  immediately.
- Keep assertions owned by the host test runner. Generated testing work should
  scaffold or report, not invent a Flow-owned assertion DSL.
- If a capability already exists in docs generation, testing, or inspect,
  extend that path before inventing a parallel mechanism.

## Upfront assumptions

- The worker should treat one explicit gateway file, such as
  `src/app/behavior.ts`, as the client-side integration surface.
- If the CLI loads that gateway, it should prefer an explicit entry path and
  use `src/app/behavior.ts` only as the docs/examples default.
- v1 discovery must stay explicit: load one gateway path, not a repo scan,
  glob, export-name guess, or AST/component-tree crawl.
- `flow.app({ modules: [...] })` is the canonical build root.
- `flow.module(...)` values are structured inputs under that root, not peer
  roots.
- Stories remain explicit curated inputs until Flow State owns an app-level
  story registry.
- Module-level work is a filtered slice over the app contract, not a second
  canonical artifact or build root.
- Screen metadata is coarse today; do not infer precise screen-to-view or
  component ownership from it.
- Module `dependencies`, `tags`, and similar metadata may still be mostly
  descriptive; expose them honestly without inventing stronger runtime meaning.
- App assembly validation is still selective; do not assume broad cross-module
  descriptor collision proof unless that capability is separately implemented.

## Baseline We Already Have

- [x] App and module inventory summaries already exist through
      `flow.module(...)`, `flow.app(...)`, and `App.inventory()`.
      Why it matters: app structure, fixtures, screens, and ownership metadata
      are already discoverable from live descriptors.

- [x] Machine graph, graph queries, and path utilities already exist through
      `graphOf(machine)`.
      Why it matters: state and transition discovery should be reused, not
      reimplemented.

- [x] Story descriptors, story docs, and story coverage already exist through
      `flowStories(...)`, `storyToDoc(...)`, and `graph.storyCoverage(...)`.
      Why it matters: curated scenarios already have typed structure and partial
      semantic coverage.

- [x] Trace capture, semantic summaries, and local proof bundles already exist
      through `captureTrace(...)`, `summarizeTrace(...)`, and local proof
      helpers.
      Why it matters: incident summaries and audit-trail facts already have a
      runtime-backed representation.

- [x] Model-path discovery and replay already exist through `test.model(...)`
      and `model.replay(...)`.
      Why it matters: scenario discovery and live proof already reinforce each
      other.

- [x] The docs app already has a generated-artifact pattern through
      `apps/docs/scripts/generate-api-reference.mjs` plus wrapper pages and
      stale-artifact tests.
      Why it matters: the behavior contract can follow an existing repo-native
      generation workflow instead of inventing a hidden codegen world.

## Binding phase order

- Phase 1 is the hard prerequisite for everything else.
- Follow the fixed order:
  1. Phase 1
  2. Phase 2
  3. Phase 3
  4. Phase 4
  5. Phase 5

## Phase 1. Define The Shared Behavior Contract Surface

- [x] Introduce a pure app-level behavior contract data model.
  - [x] Add a new library-side builder whose primary root input is a
        `FlowAppDefinition`, derives modules/resources/transactions/machines/
        streams/views from `app.modules`, and accepts explicit story inputs
        only where app assembly cannot discover them yet. It should return one
        JSON-safe contract object matching
        [BEHAVIOR_CONTRACT.md](/Users/arpit/Developer/flow-state/BEHAVIOR_CONTRACT.md).
  - [x] Keep the contract deterministic, serializable, and independent of the
        docs renderer.
  - [x] Compose existing owners: `App.inventory()`, `graphOf(...)`,
        `flowStories(...)`, `graph.storyCoverage(...)`, model/path facts, and
        trace/report helpers where those facts already exist.
  - [x] Do not treat `flow.module(...)` values as peer entrypoints once they
        are already reachable through `flow.app({ modules: [...] })`.
  - [x] Support module-level focus only as a derived slice over the app
        contract, not as a second canonical build root.
  - [x] Load one explicit behavior gateway path in v1 instead of scanning the
        repo for app/module/story entrypoints.
  - [x] Do not reimplement traversal, trace grouping, or inventory discovery in
        a second engine.
  - Why: the missing product is the composer that unifies the surfaces we
    already trust.

- [x] Decide and document the owner boundary for every major fact in the
      contract.
  - [x] Descriptor surfaces own app/module identity, fixtures, screens, and
        inventory.
  - [x] Treat screen metadata as coarse inventory facts, not as precise
        screen-to-view or component routing truth.
  - [x] Inspect owns machine shape, graph traversal, and trace analysis.
  - [x] Testing owns live scenario execution and model replay.
  - [x] The behavior contract projects those facts without becoming a second
        execution engine.
  - [x] Keep app-validation claims honest: selective duplicate/resource and
        ownership proof is real, but broad cross-module descriptor proof is not
        yet guaranteed.
  - [x] Add architecture tests that fail if the behavior contract starts
        cloning owner logic instead of projecting it.

- [x] Add first-class proof targets for the new surface.
  - [x] Create package architecture tests for contract shape, package
        boundaries, and JSON stability.
  - [x] Add one runnable proof script or test-backed fixture using Launch
        Workspace as the pressure test.
  - [x] Keep the proof app as verification only; do not start redesigning its
        internal architecture here.

## Phase 2. Generate The Shared Brief People Should Actually Read

- [x] Generate one shared brief renderer from the behavior contract.
  - [x] Default CLI output should be one terse shared brief for both humans and
        AI agents.
  - [x] Support `behavior render --module <id>` as a filtered module slice over
        the same brief shape.
  - [x] Summarize modules, screens, machines, states, key transitions,
        resources, transactions, streams, children, views, and current proof
        surface without opening component files.
  - [x] Keep the output workflow- and view-centered, not export-dump-centered.
  - [x] Do not add separate `explain`, `summary`, or `ai-context` commands.

- [x] Add a hand-written docs wrapper around generated brief data.
  - [x] Follow the current API-reference pattern: generated JSON plus a small
        hand-written docs page.
  - [x] Add a stale-artifact check so docs build fails closed when the generated
        brief data drifts from live code.
  - [x] Ensure the docs page links back to deeper owner pages instead of
        duplicating their prose.
  - [x] Make the docs page use the same section order as the CLI brief instead
        of becoming a second hand-maintained explanation surface.

## Phase 3. Turn The Standard Test Matrix Into Semantic Coverage

- [ ] Generate one detailed derived coverage view, not a second canonical
      artifact.
  - [ ] States: reachable, error, final, and important UI-visible states.
  - [x] Transitions: legal branches, guard pass/fail branches, and
        no-transition lanes.
  - [ ] Effects: resource lifecycle, transaction outcomes, stream lifecycles,
        child supervision, and key view projections.
  - [x] Audit trail: receipts, issues, outcomes, and declared story facts.
  - [x] Keep this as `behavior render --section coverage` instead of a separate
        generation family.
  - [x] Support `behavior render --module <id> --section coverage` as the
        filtered module-level coverage lens.

- [x] Reuse stories and graph coverage as the first semantic-coverage backbone.
  - [x] Extend story coverage reporting where needed so uncovered states,
        transitions, issue lanes, and outcome lanes are explicit.
  - [x] Keep "story coverage" and "full behavioral coverage" clearly separated
        when stories intentionally cover only curated flows.
  - [x] Surface blocked or mismatch stories as first-class holes, not silent
        omissions.

- [x] Add missing-coverage outputs that drive work selection.
  - [x] Emit a report that tells the next developer or agent which behavior is
        still unproved.
  - [x] Prefer stable ids and human-readable labels over opaque internal names.
  - [x] Keep the report suitable for docs, CI logs, and AI handoff.

## Phase 4. Build Behavioral Diffing For Review And Change Triage

- [ ] Add contract-to-contract diffing.
  - [ ] Compare states, transitions, resources, transactions, streams,
        children, views, stories, and coverage obligations.
  - [ ] Support `behavior diff --module <id>` by diffing the filtered slice
        from each app contract, not by inventing a second module-only baseline.
  - [ ] Report added, removed, and changed behavior in terms a reviewer can act
        on.
  - [ ] Show new required proofs when behavior changes but tests or stories do
        not.

- [ ] Keep the diff output human-readable and machine-readable.
  - [ ] Support CLI/report usage for PR review and CI.
  - [ ] Make the structured form stable enough for future automation.
  - [ ] Avoid coupling the diff format to any single UI.

- [ ] Add pressure tests around realistic behavior changes.
  - [ ] Use the proof app to model a new transition, a changed guard branch, and
        a changed transaction lane.
  - [ ] Verify the diff reports the right required follow-up work.
  - [ ] Keep the phase about contract diffing, not broad example evolution.

## Phase 5. Harden The Minimal Loop And Keep Scaffolds Optional

- [ ] Add durable generation scripts and stale-artifact checks.
  - [ ] Follow the existing generated-docs pattern in `apps/docs/scripts`.
  - [ ] Fail closed when generated behavior artifacts drift from the live
        contract.
  - [ ] Keep generated artifact paths obvious and reviewable in git.

- [ ] Wire the contract into docs and task-routing guidance.
  - [ ] Add or update the appropriate guide/reference pages so the behavior
        contract becomes the recommended onboarding and planning surface.
  - [ ] Keep `HOW_TO_USE_FLOW_STATE.md` as the usage-model note, then point
        concrete build flow to this task list and the generated contract
        outputs.
  - [ ] Keep the default command surface to `build`, `render`, and `diff`.
  - [ ] Add one `/goal` prompt entry so the backlog can drive an autonomous
        build pass cleanly.
  - [ ] Keep the minimal product phrasing short: build, render, and diff.

- [ ] Keep user-owned scaffolds explicitly optional and later.
  - [ ] Do not build scaffold generation into the core loop unless the shared
        brief, detailed coverage view, and diff surface prove insufficient.
  - [ ] If scaffolds are added later, keep them opt-in and clearly
        non-canonical.

- [ ] Close with repo-level verification and honesty checks.
  - [ ] `pnpm check`
  - [ ] targeted package tests for the new contract surface
  - [ ] `pnpm docs:build`
  - [ ] any new generation `--check` gates
  - [ ] status/docs wording must stay honest about partial surfaces
