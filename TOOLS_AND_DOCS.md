# Agent Tools And Docs Plan

This file is the dedicated backlog for the new agent-facing tools and docs
surface.

It exists so the CLI, tool-call, proof, and docs interaction design can evolve
in one place instead of being scattered across `INSPECT.md`, `TESTING.md`,
example eval notes, and ad hoc scripts.

This file is intentionally about the durable interaction surface first and the
implementation second.

## Scope

This backlog covers:

- the public CLI surface agents and humans will actually call
- which capabilities stay library-first
- which capabilities stay app-owned or proof-owned
- the docs and receipts needed to teach and verify that surface

This backlog does not try to redefine the full `flow-state/inspect` library
contract or the full `flow-state/testing` library contract. Those continue to
live in `INSPECT.md` and `TESTING.md`.

## Decision Locks

- Design the interaction surface around jobs, not around internal package or
  helper names.
- Tool-callable for agents does not mean every helper must become a public CLI
  command.
- Keep declared facts, reproducible execution, and runtime evidence as separate
  surfaces.
- Prefer codebase-linked commands for common workflows and portable artifact
  commands as a secondary path.
- Treat `behavior`, `story`, and `trace` as the durable public command families
  for the first agent-facing release unless a new job appears that they cannot
  express cleanly.
- Do not promote the current proof-file-first `inspect-cli.mjs` helper shape as
  a public contract.
- Prefer composing the new CLI and docs surface out of existing
  `flow-state/inspect`, `flow-state/testing`, and runtime inspection primitives
  instead of building parallel debugging machinery.
- When a public command needs behavior we already have, wrap the existing
  primitive and stabilize the output contract rather than inventing a second
  implementation of the same analysis or formatting path.
- Within the job-first command families, preserve meaningful existing
  transformation names when they already represent distinct user-facing jobs.
  When an existing helper name misstates the job, rename the helper and the CLI
  surface toward the clearer job name instead of freezing the old label into
  the durable public contract. Important examples:
  `storyToDoc(...)` -> `describeStory(...)` -> `story describe`
  `storyToTest(...)` -> `checkStory(...)` -> `story run --check`
  `summarizeTrace(...)` -> `trace summarize`
  `analyzeTrace(...)` -> `contextualizeTrace(...)` -> `trace summarize --contextualize`
- Do not add one top-level CLI command per helper function; formatter helpers
  and low-level inspection helpers should usually power output modes inside a
  smaller command tree.
- The documented intent of `test.model(machine)` should move into the public
  CLI: model paths are for guard-aware path discovery and validation before or
  alongside a live scenario, not a replacement for runtime scenario execution.
- The CLI should expose model-path discovery under the durable agent-facing
  command tree instead of leaving it as a docs-only testing helper.
- Default to the existing `BehaviorGateway` contract shape for CLI loading.
  Today that contract is intentionally small:
  `app: FlowAppDefinition` plus optional
  `stories: ReadonlyArray<FlowStoriesDescriptor>`.
  Do not expand the gateway contract unless the `story` or `trace` CLI surfaces
  prove a concrete missing capability that cannot be solved by a shared loader
  or resolver.
- Build the durable CLI with `@effect/cli` v4 / `effect/unstable/cli`.
  Source and docs live under `docs/codebases/effect-v4`, especially:
  `docs/codebases/effect-v4/ai-docs/src/70_cli/index.md`,
  `docs/codebases/effect-v4/ai-docs/src/70_cli/10_basics.ts`, and
  `docs/codebases/effect-v4/LLMS.md`.
- Do not freeze throwaway eval scripts or weak helper identities into the final
  public command tree.
- Treat `cli.txt` as the canonical public command-surface spec.
  This file should hold decisions, sequencing, and proof work rather than
  restating the full command tree a second time.
- `story run` owns execution plus compact runtime facts.
- `story run --check` owns expectation deltas over a run outcome and should not
  turn `story run` into a giant second viewer mode by default.
- `story run` may emit or save trace/proof artifacts, but `trace ...` owns deep
  trace reading, comparison, and focused rendering.
- `trace summarize` owns the whole-trace overview.
- `trace summarize --contextualize` owns machine/graph/transition annotation
  over a trace, not a second generic summary.
- `trace proof` owns selector-first proof slices such as actor, correlation,
  issue, and timeline views, not a second whole-trace overview.
- `story paths ...` owns model-path discovery and validation.
  It should share one path workflow and output contract instead of growing
  separate mini-products per search strategy.
- Postpone any command whose only value would be to provide a second spelling,
  second viewer, or second renderer for facts already owned by another command.
- Favor one strong default output per job plus opt-in flags over several sibling
  commands that all print the same evidence with different framing.

## Surface Direction

The canonical command tree lives in `cli.txt`.

This backlog assumes the same three durable public families:

- `flow-state behavior ...`
  Job: inspect declared app and module facts
- `flow-state story ...`
  Job: run deterministic named scenarios and explore legal event paths from the
  codebase
- `flow-state trace ...`
  Job: summarize, compare, export, import, and inspect runtime evidence

The current design target is not:

- a giant `inspect` umbrella that owns every debug/test/runtime job
- one CLI command per helper function
- a public CLI that requires throwaway app-specific scripts for common use

## Phase 1. Lock The Durable Mental Model

- [x] Decide the final public nouns and keep them small.
      Decision target: `behavior`, `story`, and `trace` should be enough for
      the first durable agent-facing release unless a sharper split is proven.
      `inventory` is currently a postponed candidate, not part of the default
      public shape.
      Why: the user should not need to understand internal package layering to
      know which command family to reach for.

- [x] Decide whether `inspect` stays a library/package concept only or also
      survives as a secondary CLI namespace.
      Decision target: treat `inspect` as library/package language and helper
      implementation language, not as the public top-level CLI noun unless a
      strong new use case forces that change.
      Why: the current helper is proof-file-first and may be the wrong top-level
      interaction model.

- [x] Lock the direct-codebase-vs-artifact split.
      Decision target:
      direct codebase-linked commands should be the default for common agent
      work, while proof/trace artifacts remain a portable secondary path.
      Why: agents should usually say "run this scenario from the codebase" rather
      than "first make a proof file, then read the proof file."

- [x] Lock the gateway assumption explicitly.
      Decision target:
      the CLI should load the existing `BehaviorGateway` contract by default
      rather than inventing a second gateway shape.
      Current contract:
      `BehaviorGateway = { app, stories? }`
      Current leaning:
      this should be enough for `behavior`, `story`, and most `trace`
      codebase-linked workflows once we add one shared loader/resolver layer.
      Only extend the contract if we find a concrete missing capability that
      cannot be derived from `app` ownership plus the declared story registry.
      Why: "gateway" is currently referenced in many tasks, so we should state
      clearly whether we are standardizing a loader over the existing contract
      or redesigning the contract itself.

## Phase 2. Define The Public Command Families

- [x] Keep and sharpen the declared-facts surface under `behavior`.
      Initial command target:
      `flow-state behavior build`
      `flow-state behavior render`
      `flow-state behavior diff`
      Coverage should exist as `behavior render --section coverage`, but we should not
      preserve multiple public spellings for the same coverage job.
      Reuse target:
      build on `buildBehaviorContract(...)`, `renderBehaviorContract(...)`,
      `renderBehaviorCoverage(...)`, `diffBehaviorContracts(...)`, and
      `renderBehaviorDiff(...)` rather than introducing parallel behavior
      summarizers.
      Why: this is the cleanest answer to "what does the app claim?" and "what
      proof obligations are still open?"

- [ ] Decide whether any public `inventory` surface is still necessary after
      the reduced `behavior` surface is implemented.
      Current leaning: postpone `flow-state inventory ...` until we can prove it
      answers a distinct job instead of acting as a raw alternate rendering of
      `buildBehaviorContract(...)` inputs.
      Why: `.inventory()` is already upstream of behavior facts, so publishing
      both too early risks creating two competing source-of-truth lanes.

- [x] Make `story` the primary codebase-linked execution surface.
      Initial command target:
      `flow-state story list`
      `flow-state story run <story-id>`
      `flow-state story describe <story-id>`
      `flow-state story run <story-id> --check`
      `flow-state story paths [--strategy shortest|simple]`
      `flow-state story paths --check`
      Ownership rule:
      `story run` emits or saves artifacts; `trace ...` reads and renders them.
      Do not keep a separate `story trace <story-id>` command.
      Reuse target:
      build on `flowStories(...)`, `describeStory(...)` (current
      `storyToDoc(...)`), `runFlowStory(...)`, `checkStory(...)` (current
      `storyToTest(...)`), `test.model(machine)`, and `graph.pathFromEvents(...)`
      rather than creating a second scenario execution, path engine, or
      story-report path.
      Gateway assumption:
      resolve story ids from `BehaviorGateway.stories` and resolve machine lookup
      from the existing gateway/app ownership graph before considering any new
      gateway fields.
      Narrowness rule:
      `story run` is the only rich execution surface.
      `story describe` explains a story without running it.
      `--check` reports expectation deltas over the same run outcome instead of
      becoming a separate command or second full run viewer.
      Why: stories already encode seeded setup, event sequences, and expected
      facts, which makes them the cleanest bridge between codebase state and
      deterministic agent repro, while model paths give agents a codebase-linked
      way to discover legal flows that curated stories do not already cover.

- [x] Encode the `test.model(machine)` mental model directly into the CLI.
      Decision target:
      `story paths ...` is the public home for model-path discovery and
      validation.
      It should teach the same intent as the docs:
      discover guard-aware legal event paths first, then use live scenario
      execution when runtime facts, resources, transactions, timers, or child
      actors matter.
      Why: this is already the documented contract, but today it is easier to
      miss than it should be for agent tool use.

- [x] Make `trace` the primary runtime-evidence surface.
      Initial command target:
      `flow-state trace summarize <trace-or-proof>`
      `flow-state trace diff <left> <right>`
      `flow-state trace summarize <trace-or-proof> --contextualize`
      Add one coherent focused-view command for actor/failure/correlation
      slicing instead of publishing several overlapping one-off readers.
      Current direction:
      `flow-state trace proof <trace-or-proof> [--actor <actorId>] [--issues] [--correlation <correlationId>]`
      Do not ship separate top-level commands like `trace actor`,
      `trace failures`, and `trace correlation` unless a real workflow proves
      the flag-based surface is insufficient.
      Postpone `trace export`, `trace import`, `trace compress`, and
      `trace decompress` until the default codebase-linked workflow is stable.
      Reuse target:
      build on `captureTrace(...)`, `summarizeTrace(...)`, `diffTrace(...)`,
      `contextualizeTrace(...)` (current `analyzeTrace(...)`),
      `createTraceProof(...)` (current `createLocalInspectionProof(...)`), and
      the existing trace/inspection formatters instead of creating duplicate
      trace-analysis or trace-rendering stacks.
      Narrowness rule:
      `trace summarize` owns the overview.
      `--contextualize` adds machine-aware annotation and must not become a
      second summary workflow.
      `trace proof` owns selector-first proof slices and must not become a
      second whole-trace viewer.
      Why: agents need portable, comparable evidence after a run, not just raw
      library objects.

## Phase 3. Decide What Stays Out Of The Public CLI

- [ ] Keep low-level runtime inspection plumbing library-first by default.
      Examples:
      `runtime.inspection.entries()`
      `runtime.inspection.subscribe(...)`
      `attachInspectionSink(...)`
      `createInspectionBufferSink(...)`
      Why: these are building blocks for apps, tools, and docs, not necessarily
      the right public command vocabulary.

- [ ] Keep fine-grained machine-inspection helpers library-first unless a strong
      CLI workflow proves out.
      Examples:
      `graphOf(...)`
      `inspectTransition(...)`
      `inspectMicrosteps(...)`
      `inspectActions(...)`
      `whyNoTransition(...)`
      semantic summary helpers
      Why: promoting every helper one-to-one into CLI would mirror internals
      instead of designing a good interaction surface. The exception is the
      already-documented model-path workflow, which should get a CLI home via
      `story paths ...` rather than via raw `graphOf(...)` verbs.

- [ ] Keep testing debug formatters as renderer backends, not as top-level
      public verbs.
      Examples:
      `formatHarnessTracePretty(...)`
      `formatPendingWorkPretty(...)`
      `formatScenarioTranscript(...)`
      `formatTransactionEventsPretty(...)`
      Why: these are valuable output modes after a run, but turning each one
      into its own public command would overfit the CLI to helper names.

- [ ] Add a fail-closed reuse check before introducing any new debugging helper
      implementation.
      Review question:
      can this command be assembled by composing an existing inspect/testing/
      runtime primitive plus a stable output contract?
      If yes, reuse it. If no, record the exact missing capability before
      adding new lower-level code.
      Why: the main risk in this area is rebuilding existing debugging logic
      under new command names.

- [ ] Keep app-specific proof generation separate from generic public commands
      until the generic model is genuinely sharp.
      Decision target: the public CLI may read traces/proofs and run named
      codebase stories, but ad hoc package/example setup scripts can remain
      app-owned where the workflow is still exploratory.
      Why: this avoids turning the public CLI into a second app runner with
      baked-in assumptions.

## Phase 4. Add Agent-Grade Output Contracts

- [ ] Make every public read command support both human text and structured JSON
      where practical.
      Why: humans need readable output, and agents need stable machine-readable
      output for tool calls and follow-up automation.

- [x] Define one shared `story` output envelope and keep `run` / `check`
      responsibilities narrow.
      Decision target:
      `story run` should expose the execution envelope plus compact runtime
      facts.
      `story run --check` should expose the expectation-check delta over the same run
      outcome instead of reprinting a second full rich run payload.
      Both should reuse the same compact fact layer instead of inventing
      separate output shapes.
      Receipt and issue summaries should be part of the default compact fact
      layer rather than separate opt-in commands or sibling output blocks.
      Reuse target:
      build on `runFlowStory(...)`, `checkStory(...)`, `receiptSummary()`, and
      `issueSummary()`.
      Why: the docs already position receipt/issue summaries as the compact
      runtime fact layer, and this is the highest-risk duplication seam in the
      current design.

- [ ] Decide stable output shapes for:
      behavior brief
      behavior render section `coverage`
      story run
      story describe descriptor
      story run check delta
      story path list
      story path check result
      trace summarize
      trace summarize with context
      `trace proof`
      Why: the interaction surface is only real once its outputs are durable
      enough to script against.

- [ ] Decide which outputs come directly from `runFlowStory(...)` versus which
      are follow-on renderings over the returned trace.
      Decision target: avoid making `story run`, `story describe`, `story run --check`,
      `story paths ...`, and trace slice commands print the same payload three
      different ways by default.
      Why: this is the highest-risk duplication point in the current design.

- [ ] Add a stuck-run diagnostic surface under `story run`.
      Decision target:
      expose `pendingWork()` as a selector or flag on `story run`, with both
      machine-readable output and a pretty renderer for human debugging.
      Reuse target:
      build on `pendingWork()` and `formatPendingWorkPretty(...)`.
      Why: the docs already teach pending work as the first stop when a scenario
      will not progress, so the CLI should not force agents down into library
      calls for that question.

- [ ] Decide how command failures should teach the next step.
      Examples:
      story id not found
      proof file invalid
      gateway missing expected export
      Why: agents need clear recovery paths, not generic process errors.

- [x] Add one shared input-normalization layer for `trace` commands.
      Required capability:
      accept local inspection proof JSON, trace artifact JSON, and trace data
      emitted by `story run`, then normalize them into the structured data that
      `trace summarize`, `trace summarize --contextualize`, and `trace proof` expect.
      Why: we should not rebuild separate file-reading and shape-detection
      paths inside each trace command.

- [x] Keep `trace summarize`, `trace summarize --contextualize`, and `trace proof` sharply
      separated.
      Decision target:
      `trace summarize` owns whole-trace overview.
      `trace summarize --contextualize` owns machine-aware annotation.
      The extra codebase-linked inputs for context attachment should only apply
      when `--contextualize` is present.
      `trace proof` owns selector-first slices over proof bundles.
      None of them should become a second spelling for the others.
      Why: the trace family is the other major duplication seam after
      `story run` vs `story run --check`.

- [x] Add one shared path-request normalization layer for `story paths ...`.
      Required capability:
      accept repeated `--event` inputs, machine lookup, optional start-state
      overrides, and shortest/simple/check mode selection, then normalize them
      into the data expected by `test.model(machine)` and
      `graph.pathFromEvents(...)`.
      Why: path discovery is already real in the library; the new work should be
      stable CLI assembly, not a second path engine.

- [x] Add one shared gateway loader/resolver task and use it across command
      families.
      Required capability:
      load the existing `BehaviorGateway`,
      resolve the assembled app,
      resolve story registries from `gateway.stories`,
      resolve machines from app ownership for `story paths ...`,
      and provide the common codebase-linked entrypoint for `behavior` and
      `story`.
      Decision target:
      prefer one shared loader/resolver over per-command gateway handling and
      prefer that over expanding the gateway contract.
      Why: the current risk is duplicated gateway plumbing, not yet a proven
      gateway-contract gap.

- [x] Keep the path surface collapsed behind flags unless a stronger split is
      proven.
      Decision target:
      discovery stays under `story paths --strategy <shortest|simple>`.
      exact-sequence validation stays under `story paths --check`.
      Why: the path-discovery surface should feel like one workflow, not several
      overlapping micro-commands.

## Phase 5. Build The Docs Around The Final Surface

- [ ] Rewrite `HOW_TO_USE_FLOW_STATE.md` only after the durable interaction
      surface is settled.
      Decision target: that page should state present-tense decisions, not live
      deliberation or future possibilities.

- [ ] Add one docs page that explains the agent workflow by job:
      declared facts -> path discovery -> reproducible execution -> runtime
      evidence.
      Why: this is the real mental model we want agents and humans to use.

- [ ] Keep reference docs split by owner, not by marketing story.
      Examples:
      `behavior` docs for declared facts
      `testing` docs for deterministic execution
      `inspect` docs for library analysis/projection helpers
      `trace` or CLI docs for runtime-evidence commands
      Why: ownership clarity matters more than a single sweeping narrative page.

- [ ] Add receipt-backed examples for each durable command family.
      Why: command surfaces are easiest to trust when the repo shows exact inputs
      and outputs, not only prose.

- [ ] Add one mapping table in the docs from public jobs to internal helpers.
      Required rows should cover at least:
      `.inventory()`
      `buildBehaviorContract(...)`
      `renderBehaviorContract(...)`
      `renderBehaviorCoverage(...)`
      `diffBehaviorContracts(...)`
      `flowStories(...)`
      `describeStory(...)` / `storyToDoc(...)`
      `runFlowStory(...)`
      `checkStory(...)` / `storyToTest(...)`
      `receiptSummary()`
      `issueSummary()`
      `pendingWork()`
      `test.model(machine)`
      `graph.pathFromEvents(...)`
      `captureTrace(...)`
      `summarizeTrace(...)`
      `diffTrace(...)`
      `contextualizeTrace(...)` / `analyzeTrace(...)`
      `createTraceProof(...)` / `createLocalInspectionProof(...)`
      the testing debug formatters
      Why: agents need to know which public command is the right doorway and
      which lower-level helper sits underneath it.

- [ ] Add one implementation note that the public CLI is a composition layer,
      not a second debugging engine.
      Decision target:
      `behavior`, `story`, and `trace` should mostly stabilize invocation and
      output shape around existing primitives instead of replacing them.
      Why: the docs should teach reuse and ownership boundaries so future work
      does not drift into duplicate tooling.

- [ ] Add one docs note that `cli.txt` is the canonical public command-surface
      spec, while this file is the implementation/proof backlog.
      Why: keeping the same command tree in two places is itself a duplication
      risk.

- [ ] Add one explicit rename task list for the misleading helper names.
      Initial targets:
      `storyToDoc(...)` -> `describeStory(...)`
      `storyToTest(...)` -> `checkStory(...)`
      `analyzeTrace(...)` -> `contextualizeTrace(...)`
      `createLocalInspectionProof(...)` -> `createTraceProof(...)`
      Update the CLI plan, reference docs, examples, and tests together so we do
      not leave mixed old/new names in the user-facing story.

## Phase 6. Verification And Proof

- [x] Add focused CLI tests for each public command family.
      Expected proof surfaces:
      `packages/flow-state/src/*cli*.test.ts`

- [ ] Add one end-to-end receipt or eval script that exercises the final command
      tree from declared facts through reproducible execution to runtime
      evidence.
      Why: we need one concrete proof that the pieces form a coherent workflow.

- [ ] Keep docs and status pages honest about what is public, what is narrow,
      and what is still helper-only or app-owned.
      Why: this area is especially easy to oversell if helper scripts and public
      commands drift together.
