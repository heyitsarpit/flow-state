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
- Treat the CLI as an installed package surface for external clients, not as
  repo-internal-only tooling.
- Treat shipped CLI entrypoints, loaders, and tests as first-class package
  code. They should live, build, typecheck, and verify like the rest of the
  package's public surface rather than as ad hoc script glue.
- The published package remains the single `flow-state` package.
- Public library import routes remain:
  `flow-state`,
  `flow-state/react`,
  `flow-state/testing`,
  `flow-state/server`,
  and `flow-state/inspect`.
- The installed `flow-state` command should ship from the same
  `packages/flow-state/package.json` via `bin`. The CLI is part of the package
  contract, but it is not a separate package and not a public import route.
- The durable CLI should be implemented in TypeScript with Effect and
  `@effect/cli`, not finalized as JavaScript `.mjs` script-folder glue.
- Relocate durable CLI sources out of `packages/flow-state/scripts` into
  `packages/flow-state/src/cli/**` with the installed binary entrypoint rooted
  at `src/cli/index.ts` and built output rooted at `dist/cli/index.mjs`.
- Give the durable CLI a dedicated package-owned test surface under
  `packages/flow-state/src/cli-test/**`.
- Keep `packages/flow-state/scripts/**` only for repo-local build, proof, and
  maintenance helpers that are explicitly not part of the installed CLI.
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

These commands should ship from the installed `flow-state` package via its
`bin`, not from a separate package and not from repo-local script entrypoints.

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

- [x] Lock the single-package CLI distribution contract.
      Decision target:
      the installed `flow-state` binary should ship from the single published
      `flow-state` package via `package.json#bin`. There is no separate
      `flow-state/cli` import route and no separate CLI package.
      Why: the actual repo contract is one package with library subpaths plus
      one installed binary, so the CLI plan must match that reality exactly.

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

- [x] Lock the package-first ownership model for the CLI.
      Decision target:
      `flow-state ...` is a client-installed package surface, not an internal
      repo helper tier. CLI entrypoints, supporting code, and CLI tests should
      be treated as first-class package assets with package-local ownership,
      typing, build, and verification expectations. The durable implementation
      should move into package-owned TypeScript + Effect CLI source files under
      `packages/flow-state/src/cli/**` rather than staying in
      `packages/flow-state/scripts/*.mjs`, and it should ship with a dedicated
      CLI test folder under `packages/flow-state/src/cli-test/**` rather than
      piggybacking on generic script-adjacent tests.
      Current progress:
      the canonical source/build/test paths now point at `src/cli/**`,
      `dist/cli/**`, and `src/cli-test/**`, with `scripts/*.mjs` reduced to
      compatibility wrappers. The gateway loader, story-registry ownership,
      story-read list/describe seam, story-run envelope/render seam,
      behavior-contract read/diff seam, trace-input normalization seam,
      story-path request/render seam, and trace-diff envelope/render seam now
      live in typed package source under `src/cli/gateway.ts`,
      `src/cli/story-read.ts`, `src/cli/story-run.ts`,
      `src/cli/story-registry.ts`, `src/cli/behavior-contract.ts`,
      `src/cli/trace-input.ts`, `src/cli/story-paths.ts`, and
      `src/cli/trace-diff.ts`, with `src/cli/shared.ts` and
      `src/cli/index.ts` now type-hardened under the same package-owned
      `tsc --noEmit` gate. The compatibility wrappers now execute the packaged
      `dist/cli/index.mjs` entrypoint instead of running source `.ts` modules
      directly, the CLI source imports package-local `../inspect.js` and
      `../testing.js` routes instead of repo-local `../../dist/*` paths, and
      the Node host bridge now runs through `ManagedRuntime.make(NodeServices.layer)`
      instead of a type-erasing escape hatch. Dist-build hygiene plus the
      wrapper-driven CLI tests now prove the packaged output contract directly.
      Why: if the CLI is framed as internal script glue, we will keep
      under-investing in the exact surface external users install and depend on.

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

- [x] Decide whether any public `inventory` surface is still necessary after
      the reduced `behavior` surface is implemented.
      Decision: postpone `flow-state inventory ...` until we can prove it
      answers a distinct job instead of acting as a raw alternate rendering of
      `buildBehaviorContract(...)` inputs. The durable public surface stays
      `behavior`, `story`, and `trace`.
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

- [x] Keep low-level runtime inspection plumbing library-first by default.
      Examples:
      `runtime.inspection.entries()`
      `runtime.inspection.subscribe(...)`
      `attachInspectionSink(...)`
      `createInspectionBufferSink(...)`
      Decision: keep these as library/app/tooling primitives. The public CLI
      surface stays at `trace summarize`, `trace proof`, and `trace diff`
      rather than exposing entry streams or sink wiring as command nouns.
      Why: these are building blocks for apps, tools, and docs, not necessarily
      the right public command vocabulary.

- [x] Keep fine-grained machine-inspection helpers library-first unless a strong
      CLI workflow proves out.
      Examples:
      `graphOf(...)`
      `inspectTransition(...)`
      `inspectMicrosteps(...)`
      `inspectActions(...)`
      `whyNoTransition(...)`
      semantic summary helpers
      Decision: keep these as library helpers. The public CLI exposes the
      workflow-level `story paths ...` surface instead of mirroring raw helper
      names like `graph`, `transition`, `microsteps`, or `actions`.
      Why: promoting every helper one-to-one into CLI would mirror internals
      instead of designing a good interaction surface. The exception is the
      already-documented model-path workflow, which should get a CLI home via
      `story paths ...` rather than via raw `graphOf(...)` verbs.

- [x] Keep testing debug formatters as renderer backends, not as top-level
      public verbs.
      Examples:
      `formatHarnessTracePretty(...)`
      `formatPendingWorkPretty(...)`
      `formatScenarioTranscript(...)`
      `formatTransactionEventsPretty(...)`
      Decision: keep these as backend renderers that can be reused under
      workflow-level surfaces like `story run`, rather than promoting
      `transcript`, `transactions`, or raw formatter names into sibling public
      commands.
      Why: these are valuable output modes after a run, but turning each one
      into its own public command would overfit the CLI to helper names.

- [x] Add a fail-closed reuse check before introducing any new debugging helper
      implementation.
      Review question:
      can this command be assembled by composing an existing inspect/testing/
      runtime primitive plus a stable output contract?
      If yes, reuse it. If no, record the exact missing capability before
      adding new lower-level code.
      Decision: keep a source-based hygiene check on the public CLI composition
      layer so new public debugging commands must route through existing
      inspect/testing/runtime primitives instead of quietly importing bespoke
      script-level helper implementations.
      Why: the main risk in this area is rebuilding existing debugging logic
      under new command names.

- [x] Keep app-specific proof generation separate from generic public commands
      until the generic model is genuinely sharp.
      Decision target: the public CLI may read traces/proofs and run named
      codebase stories, but ad hoc package/example setup scripts can remain
      app-owned where the workflow is still exploratory.
      Decision: keep exploratory proof generators like local feature/audit
      receipt scripts outside the generic public CLI. The public surface reads
      saved artifacts and runs declared stories; demo/audit proof synthesis can
      stay in dedicated scripts until a sharper cross-app proof-generation
      model exists.
      Why: this avoids turning the public CLI into a second app runner with
      baked-in assumptions.

## Phase 4. Add Agent-Grade Output Contracts

- [x] Make every public read command support both human text and structured JSON
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

- [x] Decide stable output shapes for:
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
      Decision:
      `behavior render --format json` for the default contract section is the
      raw `FlowBehaviorContract` shape with no extra wrapper.
      `behavior render --section coverage --format json` is the
      `FlowCliBehaviorCoverageEnvelope` wrapper.
      `story list --format json` is `FlowCliStoryListEnvelope`.
      `story describe --format json` is `FlowCliStoryDescribeEnvelope`.
      `story run --format json` is `FlowCliStoryRunEnvelope`, with the
      expectation delta staying nested under optional `check` rather than
      becoming a second top-level payload.
      `story paths --format json` is either
      `FlowCliStoryPathListEnvelope` or `FlowCliStoryPathCheckEnvelope`
      depending on `--check`.
      `trace summarize --format json` is `FlowCliTraceSummaryEnvelope`.
      `trace summarize --contextualize --format json` is
      `FlowCliTraceContextualizedSummaryEnvelope`.
      `trace proof --format json` is `FlowCliTraceProofEnvelope`.
      Proof:
      these shapes are now owned and exported from the CLI composition modules
      under `packages/flow-state/src/cli/**`, asserted in
      `src/package-hygiene.test.ts`, and exercised through the installed-wrapper
      CLI tests in `src/cli-test/flow-state-cli.test.ts`.
      Why: the interaction surface is only real once its outputs are durable
      enough to script against.

- [x] Decide which outputs come directly from `runFlowStory(...)` versus which
      are follow-on renderings over the returned trace.
      Decision:
      `story run` owns the direct scenario execution envelope.
      Its JSON payload is `FlowCliStoryRunEnvelope`, built from declared story
      metadata, the `runFlowStory(...)` outcome, compact receipt/issue/outcome
      summaries over `outcome.trace.report`, and optional `checkStory(...)`
      deltas nested under `check`.
      `story describe` does not render run outcomes or trace summaries; it owns
      the declared descriptor surface only.
      `story paths ...` does not render run outcomes or runtime trace facts; it
      owns model/graph path discovery and exact-sequence validation only.
      `trace summarize`, `trace summarize --contextualize`, and `trace proof`
      are follow-on renderings over normalized trace/proof inputs only. They do
      not repeat story metadata, story checks, or path-discovery payloads.
      Proof:
      the wrapper-driven CLI tests now assert the absence of cross-family fields
      on the JSON envelopes in `src/cli-test/flow-state-cli.test.ts`, and
      `src/package-hygiene.test.ts` now checks that `story-read.ts`,
      `story-run.ts`, and `story-paths.ts` do not quietly absorb each other's
      runtime/trace responsibilities.
      Why: this is the highest-risk duplication point in the current design.

- [x] Add a stuck-run diagnostic surface under `story run`.
      Decision:
      `story run --pending-work` augments the same `FlowCliStoryRunEnvelope`
      with an optional `pendingWork` snapshot.
      JSON mode emits the raw `FlowTestPendingWork` structure for scripting;
      pretty mode appends the existing `formatPendingWorkPretty(...)` renderer;
      compact mode adds a one-line pending-work summary.
      The execution path reuses `runFlowStoryWithDiagnostics(...)`, which keeps
      the existing `runFlowStory(...)` outcome unchanged while letting the CLI
      capture post-run pending work when the underlying harness exposes it.
      Rehydrated or pre-run blocked flows keep their existing blocked result and
      simply omit `pendingWork` when no harness diagnostic exists.
      Proof:
      `src/cli-test/flow-state-cli.test.ts` now covers `story run --help`,
      pretty `--pending-work`, and JSON `--pending-work` against the
      `assistant-running` story, while `src/flow-story-run.test.ts` and
      `src/public-api-types.test.ts` prove that the original `runFlowStory(...)`
      contract still holds and the testing-route diagnostic helper is typed.
      Why: the docs already teach pending work as the first stop when a scenario
      will not progress, so the CLI should not force agents down into library
      calls for that question.

- [x] Decide how command failures should teach the next step.
      Decision:
      user-facing CLI failures should keep the concrete root cause first, then
      append one actionable `Next step:` recovery hint when the command can
      teach a likely repair path without guessing hidden intent.
      For the current CLI surface:
      unknown story ids point back to the exact `story list` command for the
      current gateway context;
      invalid trace/proof JSON points back to generating a saved trace via
      `story run --save-trace`;
      gateway modules that do not export `BehaviorGateway` tell the caller to
      export it or fall back to the default `src/app/behavior.ts`.
      Build-time gateway bundling failures reuse the same gateway recovery hint
      after surfacing the bundler stderr.
      Proof:
      `src/cli-test/flow-state-cli.test.ts` now asserts all three recovery
      paths through the installed wrapper, and the focused CLI proof sweep keeps
      `src/package-hygiene.test.ts`, `src/cli-test/behavior-cli.test.ts`, and
      `src/cli-test/flow-state-cli.test.ts` green against the built package.
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

- [x] Rewrite `HOW_TO_USE_FLOW_STATE.md` only after the durable interaction
      surface is settled.
      Decision:
      `HOW_TO_USE_FLOW_STATE.md` is now a present-tense usage guide for the
      settled public surface instead of a meta note about possible future docs.
      It teaches the current four-job loop:
      declared facts -> path discovery -> reproducible execution -> runtime
      evidence; anchors that loop to the durable `behavior`, `story`, and
      `trace` command families; keeps the concrete behavior-contract loop
      explicit; and preserves the existing scaffold boundary as future, opt-in,
      and non-canonical.
      Proof:
      `src/behavior-guidance-architecture.test.ts` and
      `src/behavior-scaffold-architecture.test.ts` now assert the rewritten
      content, and `pnpm build` in `packages/flow-state` stays green after the
      doc/test updates.
      Decision target: that page should state present-tense decisions, not live
      deliberation or future possibilities.

- [x] Add one docs page that explains the agent workflow by job:
      declared facts -> path discovery -> reproducible execution -> runtime
      evidence.
      Decision:
      the docs now own that workflow as a dedicated guide page at
      `apps/docs/src/pages/guide/agent-workflow.md`.
      It teaches the four jobs in order, maps each one to the settled
      `behavior`, `story`, and `trace` commands, and routes readers onward to
      the owning reference pages instead of collapsing everything into one
      giant guide.
      Proof:
      `src/agent-workflow-docs-architecture.test.ts` asserts the new page and
      its command-family coverage, while `examples.md` now links to
      `/guide/agent-workflow` so the page is discoverable from the example
      entrypoint.
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

- [ ] Add one implementation note that the public CLI is a package-first
      composition layer, not a repo-internal script tier or a second debugging
      engine.
      Decision target:
      `behavior`, `story`, and `trace` should ship as durable package-owned
      commands that mostly stabilize invocation and output shape around
      existing primitives instead of replacing them. The package-owned command
      surface should live in dedicated TypeScript + Effect CLI modules under
      `packages/flow-state/src/cli/**` with a dedicated CLI test folder under
      `packages/flow-state/src/cli-test/**`, while ad hoc repo scripts remain
      separate and explicitly non-canonical.
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
      `packages/flow-state/src/cli-test/*.test.ts`

- [x] Move durable CLI verification into a dedicated CLI test folder.
      Decision target:
      the final package-owned CLI should verify from
      `packages/flow-state/src/cli-test/**` instead of looking like incidental
      `scripts` coverage or scattered generic source tests.
      Why: the installed client surface should have an equally obvious, durable
      verification surface.

- [ ] Add one end-to-end receipt or eval script that exercises the final command
      tree from declared facts through reproducible execution to runtime
      evidence.
      Why: we need one concrete proof that the pieces form a coherent workflow.

- [ ] Keep docs and status pages honest about what is public, what is narrow,
      and what is still helper-only or app-owned.
      Why: this area is especially easy to oversell if helper scripts and public
      commands drift together.
