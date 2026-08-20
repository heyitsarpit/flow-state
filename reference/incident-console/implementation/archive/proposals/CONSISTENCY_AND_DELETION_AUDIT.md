# Consistency and deletion audit

Status: proposal-only. This file does not change the contracts, source, OpenSpec, or Beads.

Current resolution overlay: the older “User choices still required” section is historical and must be
reconciled against the archived [MIGRATION_RECONCILIATION.md](./MIGRATION_RECONCILIATION.md). Genuine unresolved decisions are collected in
the archived [GRILL_REQUIRED_DECISIONS.md](./GRILL_REQUIRED_DECISIONS.md); accepted vocabulary and deletion direction
must not be re-opened here.

## Authority and verdict

The sole normative authority used here is `reference/incident-console/implementation/contracts/`.
The frozen package under `packages/flow-state/` is evidence of the current implementation only. Earlier
proposal documents, phase receipts, and worktree changes are not semantic authority.

The proposed direction is coherent only after separating three roles:

1. `app(...)` is the only application compiler. It creates the inert, closed `AppPlan` and complete `App.M`.
2. `behavior(...)` is an inert, package-branded gateway wrapper around one compiled app and registered Story
   metadata. It is not a second compiler, runtime, registry, or app identity.
3. `story.app(...)`, `story.machine(...)`, and `story.actor(...)` are the public Story-plan constructors;
   `*.story.ts` is only a source-file convention for explicitly imported plans.

The frozen implementation currently has all of the relevant legacy seams: module-derived app identity,
zero-argument runtime construction, structural gateway validation, Scenario execution, v1 artifacts,
machine-id Story targeting, and deleted public exports. It is useful evidence of migration scope, not a
compatible foundation to preserve through aliases.

## Confirmed consistency findings

### 1. App entry point versus behavior gateway — high severity

The contracts require `flow.app({ id, persistenceVersion, modules })` to synchronously compile one immutable,
closed-world `AppPlan`; compilation creates no actor and does not scan callbacks or expand at runtime
(`contracts/ARCHITECTURE.md:9-31`). `App.M` is the complete machine-admission catalogue, and module IDs are
tooling identity only (`contracts/ARCHITECTURE.md:45-72`). The artifact fingerprint is computed from the
compiled plan and explicitly excludes Story metadata (`contracts/PERSISTENCE_AND_ARTIFACTS.md:375-398`).

The CLI contract separately requires a named, package-branded `BehaviorGateway` produced by `behavior({
stories })`; discovery consumes its already compiled app and external-ID record and does not maintain a second
compiler or registry (`contracts/CLI.md:69-105`). Therefore the gateway may assemble references to an existing
AppPlan, but an “app entry point” that lets `behavior` compile modules, discover machines by scanning callbacks,
or derive identity from Story files contradicts the closed compiler and fingerprint rules.

Frozen evidence: `app` accepts only `{ modules }` and delegates directly to `createAppDefinition`
(`packages/flow-state/src/core/api/flow-core.ts:247-261`); app identity is derived from sorted module IDs
(`packages/flow-state/src/descriptors/app.ts:26-35`); and the current gateway is a structural `{ app, stories? }`
shape rather than the required package-branded value (`packages/flow-state/src/core/inspection/behavior-contract.ts:13-37`,
`packages/flow-state/src/cli/gateway.ts:102-141`).

### 2. `*.story.ts` discovery — high severity

The normative CLI requires `--gateway` for every gateway-loading command, resolves that file only relative to
the selected project root, forbids ancestor search and implicit gateway filenames, and permits only the three
Story commands to load gateway source (`contracts/CLI.md:48-57`, `contracts/CLI.md:69-99`). `behavior build`,
`behavior check`, `story list`, and `story describe` must remain inert; only `story run` executes the shared
Story executor (`contracts/CLI.md:101-119`).

A CLI glob over `**/*.story.ts` would create a second discovery/registration protocol, would make file paths
part of behavior identity unless explicitly excluded, and would violate the explicit gateway boundary. The
minimal design is: each `*.story.ts` exports an inert Story plan; the explicit gateway imports the selected
plans and passes them to `behavior`; the CLI loads only that gateway. A build-time manifest generator may later
expand a glob into explicit imports, but that is an unresolved host-tool choice, not Flow runtime behavior.

Frozen evidence shows the opposite direction: the loader has a default `src/app/behavior.ts` path
(`packages/flow-state/src/cli/gateway.ts:143-151`), searches ancestor `node_modules` roots and merges them
(`packages/flow-state/src/cli/gateway.ts:153-215`), and accepts structural descriptors rather than the
package identity brand (`packages/flow-state/src/cli/gateway.ts:102-141`, `203-258`).

### 3. AppPlan identity, module ownership, and Story identity — high severity

The app ID is explicit and collision-free; machine `id` is durable machine/artifact identity; `App.M` property
names and module order do not qualify identity (`contracts/ARCHITECTURE.md:33-43`). Each machine has exactly one
module tooling owner, duplicate machine values and duplicate durable IDs are compile failures
(`contracts/ARCHITECTURE.md:22-27`, `contracts/PERSISTENCE_AND_ARTIFACTS.md:384-398`). App-plan fingerprints are
private and deterministic, not a public identity API (`contracts/PERSISTENCE_AND_ARTIFACTS.md:384-398`).

The Story artifact identity is separate: behavior artifacts contain app/machine metadata and Story summaries,
while actor recipes are run-local and are not artifact Story kinds (`contracts/PERSISTENCE_AND_ARTIFACTS.md:375-382`,
`contracts/PERSISTENCE_AND_ARTIFACTS.md:473-500`). A filename, source path, module order, Story title, or Story
metadata must not enter the AppPlan fingerprint.

Frozen evidence currently violates the boundary by deriving app ID from module IDs and by storing broad inventory
categories in the app/module descriptors (`packages/flow-state/src/descriptors/app.ts:26-75`,
`packages/flow-state/src/core/api/app-descriptor-types.ts:54-106`). The current Story registry keys entries by
machine ID and globally rejects duplicate Story IDs (`packages/flow-state/src/cli/story-registry.ts:12-27`,
`75-121`), but the normative pack does not settle the public Story-ID namespace. That choice must be made before
implementation rather than inferred from the frozen registry.

### 4. RuntimeFactory, runtime construction, and Story plans — high severity

`RuntimeFactory` discovery is synchronous and inert: it may retain app identity, Clock, external capabilities,
boot input, and initial actor claims, but may not acquire a Layer, create/register actors, start work, or expose
handles (`contracts/ARCHITECTURE.md:137-156`; `contracts/PERSISTENCE_AND_ARTIFACTS.md:85-99`). Actual runtime
construction is `flow.runtime({ app, layer?, boot? })`, with one Flow runtime and one ManagedRuntime
(`contracts/ARCHITECTURE.md:105-112`, `contracts/ARCHITECTURE.md:184-188`).

`story.app` accepts that typed RuntimeFactory, not a bare app or an already-created runtime; every run uses
production bootstrap, exact factory ensures, graph sealing, activation, and cleanup
(`contracts/PUBLIC_API.md:581-606`; `contracts/TESTING.md:128-146`). Story plans are immutable and inert until
`run()` (`contracts/PUBLIC_API.md:604-606`; `contracts/TESTING.md:153-161`).

Frozen evidence has the incompatible zero-argument/Layer-only runtime surface
(`packages/flow-state/src/core/api/flow-core.ts:731-733`; `packages/flow-state/src/runtime/contract-runtime.ts:551-590`),
publishes `ManagedRuntime` and mutable hydration on the public runtime type
(`packages/flow-state/src/core/api/runtime-types.ts:140-156`), and runs data-shaped `FlowStory` values through
`runFlowScenarioWithDiagnostics` and test harnesses (`packages/flow-state/src/core/api/story-types.ts:22-57`,
`packages/flow-state/src/testing/flow-stories.ts:224-318`). This is a hard replacement, not a wrapper opportunity.

### 5. Public exports — high severity

The target route list is exact: root builders/types, React hooks, testing `behavior/control/fixture/model/story`,
server request runtime, and inspect projections (`contracts/PUBLIC_API.md:16-86`). Internal `AppPlan`, runtime
owners, TurnRecords, registered views, child-machine types, receipts, and testing/inspect artifact types must not
be public (`contracts/PUBLIC_API.md:91-113`; `contracts/ARCHITECTURE.md:426-431`).

Frozen root exports still include `child`, `view`, `selectView`, `observe`, `ensure`, `run`, `patch`, and other
legacy builders (`packages/flow-state/src/index.ts:1-24`), plus child/view/receipt/test-harness types
(`packages/flow-state/src/index.ts:42-115`). The testing route exports Scenario runners, reports, evidence,
and Scenario type families (`packages/flow-state/src/testing.ts:1-56`), while inspect exports local-proof,
`captureTrace`, `storyToDoc`, `flowStories`, and broad legacy artifact types
(`packages/flow-state/src/inspect.ts:1-37`, `39-165`). None may survive as compatibility names.

### 6. Story plans and exact targets — high severity

App Story `send` and `simulate` target one exact Story actor recipe or app-owned stable `ActorRef`; a machine
family is never a target. Machine Stories alone use target-free commands and selected focused context
(`contracts/PUBLIC_API.md:608-656`; `contracts/TESTING.md:210-280`). Recipes are frozen, inert, and materialized
through production `runtime.createActor` with reverse dependency cleanup
(`contracts/TESTING.md:163-208`).

The frozen registry binds a Story to one machine ID, and the CLI executes the old Scenario runner with the machine
family (`packages/flow-state/src/cli/story-registry.ts:12-27`, `88-121`; `packages/flow-state/src/cli/index.ts:600-612`).
That loses exact actor identity and cannot represent app-level orchestration. A `*.story.ts` catalog must register
only app/machine Story plans; `story.actor(...)` recipes remain embedded run-local construction inputs, not
discoverable artifact Story kinds (`contracts/PERSISTENCE_AND_ARTIFACTS.md:375-382`).

### 7. CLI command grammar and result ownership — high severity

The target leaf set is exactly ten commands: `behavior build|render|diff|check`, `story list|describe|run`, and
`trace summarize|proof|diff` (`contracts/CLI.md:27-57`). It requires explicit artifact operands/options, `--gateway`
on gateway commands, `--trace-output` for Story traces, one immutable private result, exact v2 envelopes, and one
process-level exit-status owner (`contracts/CLI.md:142-170`, `contracts/CLI.md:174-253`).

The frozen CLI has no `behavior check`, allows a default output path, uses `--input`, and exposes live-build diff
flags (`packages/flow-state/src/cli/index.ts:302-335`, `411-508`). It adds `story paths`, `--check`,
`--pending-work`, `--save-trace`, and pretty/compact result modes (`packages/flow-state/src/cli/index.ts:576-655`,
`851-947`), and mutates `process.exitCode` in a leaf handler (`packages/flow-state/src/cli/index.ts:636-653`).
These are deleted or transformed surfaces, not flags to carry forward.

### 8. Artifact envelopes, AppPlan fingerprint, and trace identity — high severity

The single internal codec/model is owned by the persistence contract and shared by Story and CLI
(`contracts/PERSISTENCE_AND_ARTIFACTS.md:228-239`). Behavior artifacts are exact v2 declarations containing
`appId`, `persistenceVersion`, private `appPlanFingerprint`, normalized requirements, module ownership, recursive
machines, and app/machine Story metadata (`contracts/PERSISTENCE_AND_ARTIFACTS.md:343-398`). Trace artifacts are
exact v2 Story-run envelopes with ordered TurnRecord/LifecycleRecord projections, truncation evidence, checkpoints,
`run.end`, failure evidence, and cleanup truth; `final`, `children`, v1, and Scenario shapes reject
(`contracts/PERSISTENCE_AND_ARTIFACTS.md:400-418`, `861-1005`; `contracts/CLI.md:123-140`).

Frozen behavior is `flow-state/behavior-contract.v1` with old resources/transactions/views/stories fields
(`packages/flow-state/src/core/inspection/behavior-contract.ts:13-37`), and frozen trace is
`flow-state/trace-artifact.v1` containing an ad hoc snapshot, `children`, and `receipts`
(`packages/flow-state/src/core/inspection/trace-artifact.ts:18-53`, `162-176`). The importer fabricates a machine
from the serialized snapshot instead of resolving through the receiving AppPlan. That path must be deleted, not
made tolerant of v2 by adding a compatibility branch.

### 9. Inspection ownership and evidence — high severity

Inspection derives from committed TurnRecords and immutable LifecycleRecords after publication; it must not keep a
second mutable history or fabricate a trace from arbitrary snapshots (`contracts/PUBLIC_API.md:724-741`). The
bounded buffer has explicit capacity/truncation semantics and attaches once to one runtime
(`contracts/PERSISTENCE_AND_ARTIFACTS.md:294-328`). Runtime observation is not persistence; export is explicit
(`contracts/PERSISTENCE_AND_ARTIFACTS.md:330-335`).

The frozen inspect route exposes parallel trace/local-proof/story-document hierarchies
(`packages/flow-state/src/inspect.ts:1-37`, `98-165`), and the frozen trace importer manufactures an imported
machine (`packages/flow-state/src/core/inspection/trace-artifact.ts:57-83`). The replacement must have one private
decoded v2 model, one bounded sink, and projection-only public inspect values. No Story runner, CLI, or artifact
decoder may create another evidence model (`contracts/CLI.md:101-119`; `contracts/ARCHITECTURE.md:529-547`).

### 10. Package identity — high severity

The gateway loader must resolve `flow-state`, its routes, and `effect` to the same real package instances used by
the executing CLI and reject package-identity mismatch before registry access
(`contracts/CLI.md:77-99`). The gateway export must carry the package-private brand; structural lookalikes,
mixed-app registrations, and path escapes fail closed (`contracts/CLI.md:89-95`).

The frozen loader bundles `flow-state` and `effect` as externals and merges both project and ancestor module roots
(`packages/flow-state/src/cli/gateway.ts:203-228`), but its validator only checks structural app/module/story
fields (`packages/flow-state/src/cli/gateway.ts:102-141`). It therefore cannot prove that a Story plan, AppPlan,
brand, and CLI share one package identity. The identity check belongs before compiled-registry access and must not
be replaced by `instanceof` or structural equivalence.

## Recommended minimal topology

```text
authoring modules and machines
        |
        v
flow.app({ id, persistenceVersion, modules })
        |  one immutable closed AppPlan / App.M
        +--------------------+
        |                    |
        v                    v
story.app(...)       behavior({ app, stories })  [brand + inert registry]
        |                    |
        v                    v
shared production     explicit --gateway load
runtime + Story.run    behavior/Story metadata + CLI
```

Recommended authoring shape:

```ts
// app.ts
export const IncidentApp = app({
  id: "incident-console",
  persistenceVersion: "1",
  modules: [incidentModule],
});

// editor.story.ts — inert plan only
export const editorStory = story.machine(editorMachine, { input, fixtures });

// behavior.ts — explicit gateway; exact option shape is a user decision below
export const BehaviorGateway = behavior({
  app: IncidentApp,
  stories: [editorStory],
});
```

The `app` field above is recommended because mixed-app registration must fail before discovery, but the normative
pack names the branded `behavior({ stories })` construction without fixing the complete option type. Do not
implement this line until the choice is approved or the public contract is amended.

Rules that are fixed by the contracts:

- `behavior` remains on `flow-state/testing`; it does not become a root app namespace or export `AppPlan`.
- `BehaviorGateway` is one package-branded value containing one already compiled app and registered Story
  metadata; discovery and build are inert.
- `*.story.ts` files export plans or recipes only. The gateway explicitly imports app/machine Story plans.
- `story.app` owns executable app Stories; machine Stories are focused one-actor proofs; actor recipes are not
  artifact Story kinds.
- CLI artifact-only commands never execute gateway code; `story run` uses the same private executor as `.run()`.
- behavior and trace artifacts use the one private WIRE-020B codec/model; stories are excluded from the AppPlan
  fingerprint preimage.
- all package identity checks happen before accessing the compiled registry; no ancestor dependency fallback is
  allowed.

## User choices still required

These are semantic/API decisions not fixed by the contract pack. They must be answered before implementation tasks
are created.

1. **Gateway constructor shape.** Approve the recommended `behavior({ app, stories })`, or choose the exact
   contract-compatible way for `behavior({ stories })` to bind one AppPlan. Do not allow a bare app, live runtime,
   callback registry, or implicit app inference.
2. **Story-file discovery policy.** Recommended: explicit imports from one gateway. If automatic `*.story.ts`
   discovery is required, decide whether it is a build-time manifest generator outside Flow, then define root,
   include/exclude rules, deterministic order, duplicate IDs, side-effect policy, and failure behavior. CLI globbing
   and implicit gateway search are not available under the current CLI contract.
3. **Story ID namespace.** Decide whether IDs are unique across one gateway/app or are qualified by module. The
   artifact and CLI require stable IDs, but this pack does not authorize deriving them from filenames or module
   order. The selected rule must be reflected in gateway validation and `StoryNotFound` behavior.
4. **RuntimeFactory public signature.** Approve the callable `RuntimeFactory<App>` shape, including how a factory
   declares app identity, Layer, boot, initial stable refs, and cleanup ownership. The factory must remain inert at
   discovery and use `flow.runtime({ app, layer?, boot? })` at run time.
5. **Story catalog membership.** Decide which exported plans are registered: recommended is app and machine Stories
   only, with actor recipes referenced by an app Story remaining run-local. Do not register recipes as independent
   CLI/artifact Stories.
6. **App identity inputs.** Select the durable app ID, persistence version, exact module IDs, and one module owner
   for every machine. File paths, Story IDs, module order, and labels must remain outside machine/runtime identity.
7. **Story target inventory.** For every app Story, choose exact stable `ActorRef` targets and/or recipe objects,
   factory ensures, provider bindings, fixtures, and cleanup ownership. A machine ID cannot substitute for these
   choices.

## Deletion and transformation matrix

| Frozen evidence | Required disposition | Contract owner / proof |
|---|---|---|
| Module-derived app ID and inventory-shaped app/module API (`descriptors/app.ts:26-75`; `app-descriptor-types.ts:54-106`) | Replace with explicit app ID, persistence version, exact modules, closed `App.M`, immutable AppPlan; no compatibility overload | `ARCH-001`–`004`, `PROOF-002`, `PROOF-017` |
| `runtime(layer)` and zero-argument `createRuntime` (`core/api/flow-core.ts:731-733`; `runtime/contract-runtime.ts:551-590`) | Delete; replace with app-bound `runtime({ app, layer?, boot? })` and inert RuntimeFactory discovery | `ARCH-007`–`010`, `TYPE-010`, `PROOF-002`/`004` |
| Public ManagedRuntime, mutable `hydrateBoot`, old boot type (`core/api/runtime-types.ts:140-156`) | Delete from public declarations; retain only package-private production ownership and immutable boot input | `PUBLIC_API.md:91-113`, `HOST-014`, `CUT-P01`/`P02` |
| `child`, `view`, `selectView`, registered views, receipts, child snapshots/types (`src/index.ts:1-24`, `42-115`) | Hard delete; no aliases, adapters, parser branches, or deep imports | `ARCH-024A`, `PUBLIC_API.md:757-762`, `DEL-001`/`002`/`008`, `PROOF-017` |
| Data-shaped `FlowStory` seeds/start/expected fields (`core/api/story-types.ts:22-57`) and Scenario runner (`testing/flow-stories.ts:224-318`) | Replace with immutable `story.app/machine/actor` plans, production run, exact targets, checkpoints, `run.end` | `TESTING.md:19-30`, `153-208`, `210-280`, `CUT-007`, `PROOF-008`–`011` |
| Scenario/report/evidence exports (`src/testing.ts:1-56`) | Delete old names/types and testing runtime; retain only accepted testing constructors, controls, fixtures, model, Story error | `PUBLIC_API.md:49-51`, `TYPE-014`–`017`, `DEL-009`, `PROOF-017` |
| Structural BehaviorGateway and v1 behavior contract (`cli/gateway.ts:102-141`; `behavior-contract.ts:13-37`) | Replace with package-branded gateway over one AppPlan and WIRE-020B behavior artifact; reject mixed app/identity | `CLI-003`/`004`, `WIRE-020A`/`020B`, `CLI-P01`/`P02` |
| `story paths`, arbitrary event JSON, `--check`, `--pending-work`, `--save-trace`, pretty/compact outputs (`cli/index.ts:576-655`, `851-947`) | Delete or transform to the exact ten-leaf grammar; model discovery remains programmatic; use `--trace-output` and v2 result | `CLI-001`, `CLI-004`, `API-017`, `DEL-009`/`010` |
| Per-handler result envelopes and leaf `process.exitCode` mutation (`cli/index.ts:636-653`) | Replace with one private v2 result/error model and one process owner after disposal/drain | `CLI-007`–`010`, `WIRE-020B`, `PROOF-014` |
| v1 trace artifact with fabricated machine, `children`, and `receipts` (`core/inspection/trace-artifact.ts:18-83`, `162-176`) | Delete importer/exporter path; use bounded v2 TurnRecord/LifecycleRecord model resolved by receiving AppPlan | `WIRE-014`–`020B`, `WIRE-021`–`024`, `CUT-008` |
| `captureTrace`, local inspection proof, Story docs, parallel inspect types (`src/inspect.ts:1-37`, `98-165`) | Replace with production-record projections and explicit bounded sink; no second history or artifact decoder | `API-016`, `WIRE-017`–`019`, `PROOF-013`/`014` |
| Ancestor `node_modules` merge and structural gateway acceptance (`cli/gateway.ts:153-228`) | Delete fallback/structural path; enforce same real `flow-state`/`effect` instances and private brand before registry access | `CLI-003`, `CLI-012`, `CUT-P03`/`P04` |

The deletion meaning is hard replacement: a deleted value, type, overload, file, proof, example, or parser branch
cannot remain solely for compatibility (`contracts/COMPATIBILITY_AND_DELETIONS.md:40-60`). After replacement proofs,
dedicated old files are removed or classified historical, and one repository authority survives
(`contracts/COMPATIBILITY_AND_DELETIONS.md:140-152`).

## Sequencing plan

1. **Resolve the seven user choices above.** Record the chosen gateway/factory/Story ID/discovery semantics and
   the concrete app/module/target inventory. No code or Beads task may fill these gaps by inference.
2. **Freeze the boundary inventory.** Map every current export, route, deep import, CLI leaf/flag, artifact field,
   inspection type, and Story/Scenario symbol to `KEEP`, `REPLACE`, or `DELETE`. Include declaration and packed
   consumers, examples, docs, tests, and scripts. This is required by `CUT-P01`–`P06`.
3. **Build the private identity and schema spine.** Implement AppPlan/App.M ownership, app/machine/module identity,
   the package brand, one v2 codec/decoded model, fingerprint computation, and package-identity validation. Prove
   inert compilation, duplicate ownership rejection, and receiving-AppPlan resolution before runtime work.
4. **Implement the public routes and Story plans.** Add exact root/testing/React/server/inspect exports, the three
   Story constructors, inert actor recipes, RuntimeFactory discovery, production runtime construction, and one
   shared Story executor. Add compile negatives before broad runtime tests.
5. **Implement gateway/CLI/inspection on the shared owners.** Make gateway loading explicit and inert, add the exact
   ten leaves, v2 behavior/trace projections, bounded sink, atomic artifact writes, result/error ownership, and
   signal/exit behavior. Do not add a glob-based CLI registry.
6. **Run deletion and parity proofs.** Prove old runtime/export/declaration absence, Story/Scenario absence, v1 and
   `final`/`children` rejection, package identity, exact actor evidence, Story/CLI parity, and fresh packed-binary
   behavior. Use the gate order in `contracts/PROOF_MATRIX.md:491-508`; a focused source scan is not closure.

## Blockers before Beads

Beads task creation is blocked until all of these are resolved:

- The gateway constructor and `RuntimeFactory<App>` public shapes are approved, including app binding and cleanup
  ownership.
- The `*.story.ts` policy is decided: explicit gateway imports (recommended) or a separately specified build-time
  manifest with deterministic ordering and duplicate/side-effect rules.
- Story ID scope and catalog membership are fixed, and every app Story has exact actor targets/recipes and factory
  ownership rather than machine-ID targeting.
- The durable app ID, persistence version, module IDs, one-tooling-owner map, and AppPlan fingerprint inputs are
  fixed for the first proving app.
- The complete current-surface deletion matrix is accepted, including old exports, Scenario/test harnesses, CLI
  paths/flags, v1 artifacts, inspection proofs, and package-loader fallback. No compatibility aliases are permitted.
- One package-private WIRE-020B codec/model owner and one package-identity enforcement point are named, with the
  Story runner, CLI, and inspection consumers agreeing to use them.
- The proof owners and fresh packed-binary gate are assigned for `PROOF-001`, `PROOF-002`, `PROOF-004`,
  `PROOF-008`–`PROOF-014`, and `PROOF-017`; no Beads issue should claim cutover from a focused green test.
- The implementation baseline is explicitly selected: the frozen package remains evidence, and no current dirty
  proposal/phase deletion or greenfield file is treated as completed vNext proof without live verification.
