# Story/CLI migration proposal

Status: proposal-only audit. This file does not amend the contract pack and is
not an implementation task list. The normative authority used for this audit is
`reference/incident-console/implementation/contracts/`; current source and
tests are evidence only.

Current resolution overlay: use `RuntimeSetup`, explicit `behavior({ stories })` record IDs, App and Machine
Stories, explicit gateway imports, and `--overwrite`. References to `RuntimeFactory`, `control`, or the old
`--force` grammar are historical and must be rewritten during reconciliation.

## Recommendation

`*.story.ts` files are feasible as the authoring layout for Story plans, but
they cannot replace the contract-required CLI gateway by convention alone.

Keep one explicit, named, branded `BehaviorGateway` entrypoint for CLI source
loading. Make that entrypoint thin: it should compose the app identity and the
explicitly registered Story plans imported from `*.story.ts` modules. Remove
the old descriptor array, structural validator, local Story registry, Scenario
runner, expectation reporting, and path-exploration command.

Do not add filesystem globbing, ancestor discovery, implicit gateway filenames,
filename-derived Story IDs, or a second Story registry. Those choices would
change the contract's source boundary or create new identity/discovery
semantics.

If the desired outcome is to remove `BehaviorGateway` completely, that is a
contract change, not a migration detail. It conflicts with `CLI-003`, the
required `--gateway` grammar in `CLI.md`, and the named branded export required
for compiled behavior and Story commands.

## Contract-required behavior

### App identity

- The app has one explicit stable app ID. It is supplied by the app definition;
  it is not derived from a module name, Story filename, export name, module
  order, or machine ID. See `PUBLIC_API.md` (`API-001` through `API-003`),
  `ARCHITECTURE.md` (`ARCH-001` through `ARCH-005`), and
  `GLOSSARY_AND_IDENTITY.md` (`GLO-07`).
- `persistenceVersion` and the compiled app-plan fingerprint remain app-level
  identity/artifact data. A Story does not create a second app or runtime.
  See `PERSISTENCE_AND_ARTIFACTS.md` (`PERSIST-001` through `PERSIST-006`).
- `story.app(runtimeFactory, ...)` must use the same typed RuntimeFactory shape
  as the live host. The Story runner creates the production runtime through
  that factory; it must not construct a bare app, a test runtime, or an
  unrelated scheduler. See `TESTING.md` (`TEST-001` through `TEST-007`) and
  `ARCHITECTURE.md` (`ARCH-010` through `ARCH-020`).

### Story identity

- CLI-visible Story summaries and trace artifacts require a stable `storyId`.
  `title`, `description`, and `tags` are metadata and are not discovery
  identity. See `PERSISTENCE_AND_ARTIFACTS.md` (`PERSIST-011` through
  `PERSIST-014`) and `GLOSSARY_AND_IDENTITY.md` (`GLO-06`, `GLO-15`).
- Actor recipe identity is run-local and object-based. It must not be confused
  with Story identity or actor incarnation identity. See
  `GLOSSARY_AND_IDENTITY.md` (`GLO-06`, `GLO-L3`) and `TESTING.md`
  (`TEST-020` through `TEST-025`).
- A Story plan is inert and immutable until `.run()`. Metadata registration
  must not acquire a Layer, create an actor, start a mailbox, or allocate a
  runtime. See `TESTING.md` (`TEST-008` through `TEST-019`) and
  `ARCHITECTURE.md` (`ARCH-006` through `ARCH-009`).

### Discovery and loading

- CLI source commands receive an explicit `--project-root` and required
  `--gateway`. The root defaults only to the canonical current directory; the
  gateway is relative to that root and must remain inside it after symlink
  resolution. There is no ancestor search, implicit default gateway, or
  dependency-tree merge. See `CLI.md` (`CLI-001` through `CLI-004`).
- The loaded module must expose the named branded `BehaviorGateway` produced by
  the contract's behavior composition API. Structural lookalikes and mixed
  Flow/Effect instances are rejected before compiled registry use. Trusted
  local TypeScript is allowed, but it is not sandboxed. See `CLI.md`
  (`CLI-005` through `CLI-012`).
- Discovery is inert. `behavior build`, `behavior check`, `story list`, and
  `story describe` must not acquire runtime resources, create actors, start
  schedulers, load fixtures, or execute Story commands. See `CLI.md`
  (`CLI-013` through `CLI-017`).
- There is one package-private compiled Story/app record shared by behavior
  artifacts and Story commands. The CLI must not build a second Story registry,
  validator, runtime, matcher, history store, or artifact decoder. See `CLI.md`
  (`CLI-003`, `CLI-018` through `CLI-020`), `ARCHITECTURE.md` (`ARCH-032`),
  and `COMPATIBILITY_AND_DELETIONS.md` (`CUT-007A`, `CUT-P03`).

### `story list` and `story describe`

- Both commands read the registered Story records without running them. They
  report the contract's Story metadata and identity, not old `start`, `seed`,
  `events`, `expectedState`, matcher, or pending-work fields.
- They must use the exact `CliCommand`/`CliResult` data model and the text/JSON
  output rules in `CLI.md` (`CLI-021` through `CLI-026`) and
  `PERSISTENCE_AND_ARTIFACTS.md` (`WIRE-020A`, `WIRE-020B`).
- Unknown IDs, duplicate IDs, missing app ownership, invalid brands, and
  invalid gateway containment fail as CLI errors before any Story execution.

### `story run`

- `story run` invokes the same package-private executor as direct
  `Story.run()`. It is not allowed to call the old `runFlowScenario*` path or a
  CLI-only runner. See `CLI.md` (`CLI-027` through `CLI-032`) and
  `ARCHITECTURE.md` (`ARCH-020`, `ARCH-032`).
- The executor uses the production runtime, exact actor refs or inert actor
  recipes, normal operation completion, the read barrier, and the production
  cleanup path. See `TESTING.md` (`TEST-026` through `TEST-048`).
- Successful output contains the exact actor checkpoints and `run.end`; it
  does not claim that `run.end` means actor completion. Failed or interrupted
  execution retains partial records, checkpoints, failure information, and
  cleanup status, and does not manufacture a successful `run.end`. See
  `TESTING.md` (`TEST-049` through `TEST-060`) and
  `PERSISTENCE_AND_ARTIFACTS.md` (`WIRE-021` through `WIRE-023`).
- Without trace output, there is no history sink. With trace output, the run
  installs exactly one bounded `createInspectionBufferSink()` using its default
  capacity of 256. The trace path is preflighted before runtime execution and
  written atomically. See `CLI.md` (`CLI-033` through `CLI-041`) and
  `PUBLIC_API.md` (`API-016`).
- CLI formatting, file writes, signal registration, and exit status belong to
  the CLI host. Runtime semantics, cleanup, evidence, and failure projection
  belong to the shared Story executor. See `CLI.md` (`CLI-042` through
  `CLI-052`).

### Signals and cleanup

- The process owner installs the signal handlers. The first `SIGINT` or
  `SIGTERM` interrupts the active Story, preserves the partial evidence,
  awaits normal cleanup, atomically writes the partial trace when requested,
  emits the interruption `CliError`, and returns the contract exit status
  (`130` or `143`). See `CLI.md` (`CLI-053` through `CLI-060`) and
  `PERSISTENCE_AND_ARTIFACTS.md` (`WIRE-022`, `WIRE-023`).
- Cleanup is awaited on success, failure, and cancellation. A successful run
  implies completed cleanup; a failed run retains cleanup evidence. The CLI
  must not set `process.exitCode` from a command handler or let process
  shutdown race the Story cleanup. See `TESTING.md` (`TEST-049` through
  `TEST-060`) and `CLI.md` (`CLI-061` through `CLI-066`).

### Direct programmatic execution

- Public consumers run the immutable Story plan directly with `.run()` and
  inspect checkpoints, `run.end`, failure, and cleanup through the testing
  API. The CLI is a host over that same executor, not a competing API. See
  `PUBLIC_API.md` (`API-006` through `API-015`), `TESTING.md` (`TEST-049`
  through `TEST-060`), and `ARCHITECTURE.md` (`ARCH-020`).
- Host test runners own assertions, retries, naming, and pass/fail policy.
  Story evidence must not contain old expectation-check or Scenario status
  machinery. See `TESTING.md` (`TEST-061` through `TEST-066`).

## Required contract decisions and unknowns

These points must be settled before implementation because the current
contract names the semantics but does not provide enough public shape to infer
them safely.

1. **Stable Story ID assignment.** The constructors shown in `TESTING.md` and
   the maintained Story example do not establish whether the stable ID lives
   on the Story plan or is assigned by the behavior composition record. The
   recommended decision is an explicit immutable ID-to-Story registration in
   the gateway, never filename/export/title derivation. The contract must also
   define how direct `.run()` obtains the `storyId` required by a trace artifact.

2. **Exact `behavior({ stories })` shape and brand.** `CLI-003` requires a
   package-private brand produced by `behavior({ stories })`, but the public
   record shape, Story registration shape, and compiled access boundary are
   not defined in the inspected contracts. This cannot be reconstructed from
   the frozen structural `FlowBehaviorGateway` without inventing an API.

3. **CLI admission of Story kinds.** The artifact model permits `app` and
   `machine` Story summaries, while `story.actor` is a recipe and has no
   runtime factory. The contract must state whether CLI discovery/list/describe
   includes focused machine Stories, and whether `story run` may execute them.
   Recommendation: make CLI-discoverable entries app Stories with explicit app
   identity; keep focused machine and actor recipes programmatic unless the
   contract explicitly defines their CLI app association.

4. **RuntimeFactory and direct trace identity.** The contract requires the
   live-host RuntimeFactory shape and shared direct/CLI execution, but its
   callable public type and direct trace-export identity path are not specified
   in the inspected material. Do not infer these from the old test harness.

5. **`--force` grammar inconsistency.** `CLI.md` includes `--force` in the
   `behavior build` grammar while its option rule restricts `--force` to
   `story run --trace-output`. This must be reconciled before CLI flag proofs
   are accepted.

## API conflicts found in frozen evidence

- `packages/flow-state/src/core/api/story-types.ts` defines the old
  `FlowStory` shape with `start`, `seed`, `events`, `expectedState`, and
  `expectedFacts`; the contract requires immutable command plans and removes
  those fields.
- `packages/flow-state/src/testing/flow-stories.ts` and
  `packages/flow-state/src/testing.ts` expose `runFlowScenario*`, a separate
  test harness, flush/pending-work behavior, and expectation-based outcomes.
  These conflict with the shared production Story executor and host-owned
  assertions.
- `packages/flow-state/src/cli/gateway.ts` accepts an optional gateway,
  defaults to `src/app/behavior.ts`, searches ancestor `node_modules`, bundles
  dependencies broadly, and structurally validates a plain object. This
  conflicts with the explicit gateway, project containment, manifest, and
  branded gateway rules in `CLI.md`.
- `packages/flow-state/src/cli/story-registry.ts` builds a second registry and
  revalidates machine and Story ownership. The contract requires one compiled
  package-private record.
- `packages/flow-state/src/cli/story-read.ts` and `story-run.ts` emit old
  Story-document/Scenario envelopes, expected-state data, PASS/FAIL/BLOCKED
  status, pending work, and final-state output. These are not the required
  `CliResult` projections.
- `packages/flow-state/src/cli/index.ts` uses `--check`, `--pending-work`, and
  `--save-trace`, calls `runFlowScenarioWithDiagnostics`, writes traces directly,
  mutates `process.exitCode` inside `story run`, and exposes `story paths`.
  The exact contract grammar instead uses `--trace-output`, has no assertion
  flag or path command, and centralizes exit ownership.
- No `SIGINT`/`SIGTERM` handling was found in the inspected CLI source. Signal
  behavior therefore remains an implementation gap, not an existing guarantee.
- The current checkout has no maintained `examples/` directory, although old
  CLI tests refer to `basicCachedPosts`. Those references are not live consumer
  evidence and must not be used to preserve the old API.

## Bounded migration plan

### 1. Resolve the five contract decisions first

Record decisions for Story IDs, gateway brand/registration shape, CLI Story
kinds, RuntimeFactory/direct trace identity, and the `--force` grammar. If the
decision removes the named gateway, amend the contract first; otherwise keep
the gateway boundary described above.

### 2. Replace the testing surface at its owner

Implement the contract's `behavior`, `control`, `fixture`, `model`, and `story`
surface with closed option objects and inert immutable plans. Make `.run()` use
the production runtime factory and package-private executor. Add direct-run
proofs for command acknowledgements, exact actor lookup, simulation boundary,
checkpoints, `run.end`, failure, interruption, and cleanup.

### 3. Make the gateway a thin compiled composition boundary

Rewrite the loader to enforce canonical root/gateway containment, exact
manifest/dependency rules, the named brand, and scoped temporary-bundle
cleanup. Have the branded gateway expose one compiled app/Story record to
behavior artifact generation and CLI commands. Import `*.story.ts` files
explicitly from that boundary; do not implement a second filesystem discovery
protocol.

### 4. Rewrite the three Story commands over the shared executor

Implement `story list`, `story describe`, and `story run` against the branded
record and private `CliResult` model. Keep CLI ownership limited to arguments,
formatting, trace-file preflight/atomic commit, signals, and exit status. Remove
old assertion, pending-work, Scenario, and final-state output.

### 5. Delete redundant machinery after consumer proofs

Delete the old `FlowScenario*` exports and runner, old `FlowStory` descriptor
types/docs, `cli/story-registry.ts`, `cli/story-paths.ts`, and the old Story
read/run envelopes. Remove obsolete `flowStories`, `storyToDoc`, and
expectation/coverage exports from public routes unless a live contract-required
consumer proves they are still needed. Preserve production runtime, machine,
operation, inspection-record, and bounded-sink code that is shared by the new
executor.

### 6. Run the narrow proof set, then stop

Required proof groups are: gateway containment/brand rejection and inertness;
list/describe no-runtime acquisition; direct/CLI Story parity; one-sink versus
zero-history behavior; exact checkpoints and `run.end`; partial trace and real
signal cleanup; atomic trace commit; exact exit codes; public type negative
proofs; and absence of deleted Scenario/path APIs. Then run the repository's
smallest applicable type, test, build, and CLI gates. Do not claim full
verification from a focused Story test.

## Retain versus replace

Retain the CLI process entrypoint as the single host for command parsing,
formatting, file writes, signal handling, and exit status. Retain production
runtime, AppPlan, operation, inspection, bounded-sink, and artifact projection
owners.

Replace the current gateway loader, behavior-contract builder, Story read/run
formatters, and public testing exports at their owning boundaries. Delete the
second registry and all Scenario/path/expectation machinery once its consumers
are migrated and the deletion proofs pass.

No source, contract, OpenSpec, Beads, generated output, or unrelated worktree
file is changed by this proposal.
