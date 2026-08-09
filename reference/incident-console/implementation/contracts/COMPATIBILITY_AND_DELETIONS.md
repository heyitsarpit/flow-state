# Compatibility and deletion contract

Status: normative vNext contract

vNext is a deliberate breaking contract replacement. Compatibility MUST preserve the live
package route names, ESM import conditions, core Effect peer identity, React 18/19 peer range,
and semantic capabilities explicitly retained below. Compatibility MUST NOT preserve an old
name or overload when doing so creates a second ownership model.

The live route map is `packages/flow-state/package.json:33-54`; current runtime exports are
listed in `packages/flow-state/src/index.ts:1-24`, React exports in
`packages/flow-state/src/react-entry.ts:1-7`, testing exports in
`packages/flow-state/src/testing.ts:1-56`, server exports in
`packages/flow-state/src/server.ts:1-9`, and inspect exports in
`packages/flow-state/src/inspect.ts:1-178`.

## Compatibility policy

### CUT-001 — Keep routes, replace contracts atomically

The package MUST keep `.`, `./react`, `./testing`, `./server`, `./inspect`, and
`./package.json`. It MUST keep the `flow-state` CLI binary. The vNext cutover MUST replace
runtime values and declarations on those routes in one version boundary; it MUST NOT expose
parallel `legacy`, `experimental`, `v2`, or compatibility namespace objects.

Phases 1–6 build and test vNext through package-private entry points while the unchanged legacy
routes remain the only public implementation. They MUST NOT translate legacy grammar into vNext or
publish a mixed route set. Phase 7 performs one atomic source/export/declaration/binary switch for
all six routes and deletes the legacy execution owners in that same closeable slice; a checkout may
contain both implementations during development, but no installed package or runtime may expose or
compose both.

### CUT-002 — Retain semantics, not ceremonial wrappers

Implementations MAY reuse private code and semantic tests for exact refs, optimistic overlays,
transaction concurrency, traces, graphs, deterministic time, fixtures, and packed consumers.
They MUST NOT retain a public wrapper whose only purpose is preserving an obsolete spelling,
builder family, or mutable escape hatch.

### CUT-003 — Removed values fail closed

Every deleted runtime value MUST be absent from JavaScript exports and TypeScript declarations.
Every deleted overload or property MUST have an `@ts-expect-error` proof. A deprecated alias
that remains callable does not satisfy deletion.

## Root cutover matrix

| Current surface                                          | vNext decision | Normative replacement                                             |
| -------------------------------------------------------- | -------------- | ----------------------------------------------------------------- |
| `machine(config)`                                        | DELETE         | `definition(...)` plus `machine(definition, callback)`            |
| `machine<Context, Event>()(config)`                      | DELETE         | definition-inferred input, memory, states, and events             |
| machine `id` or `memory` inside behavior config          | DELETE         | inherited unchanged from the definition                           |
| `vocabulary(...)` / `Vocabulary`                         | RENAME         | `definition(...)` / `Definition`                                  |
| machine `context`                                        | DELETE         | actor-local `memory`                                              |
| transition `update`                                      | DELETE         | `updateMemory`                                                    |
| `actions`, `entry`, `exit`                               | DELETE         | transitions, inspectable activities, views, or observers          |
| state `invoke`                                           | DELETE         | `activities`                                                      |
| state `always`                                           | DELETE         | `redirect`                                                        |
| `after` and `flow.after`                                 | DELETE         | named `timers` entries                                            |
| transition `submit`                                      | DELETE         | `activities: [activity.run(transaction, ...)]`                    |
| standalone `ensure/observe/refresh/invalidate/run`       | DELETE         | machine-local `activity` kit                                      |
| canonical-key or predicate resource invalidation         | DELETE         | exact resource refs, nominal tags, or computed target vectors     |
| `createKey`                                              | DELETE         | return `CanonicalKeyInput` directly                               |
| `createTag`                                              | RENAME         | `tag(id)`                                                         |
| resource `key` / custom identity projection              | DELETE         | descriptor ID plus canonical lookup-argument tuple                |
| resource `schema`                                        | DELETE         | application boundary decoder                                      |
| transaction `scope`                                      | DELETE         | actor-local concurrency per exact transaction ref                 |
| stream `pressure`                                        | DELETE         | Effect Stream or application-authored buffering policy            |
| `freshness.staleAfter`                                   | RENAME         | `staleTime`                                                       |
| `freshness.onInvalidate`                                 | DELETE         | observation ownership plus invalidation policy                    |
| `outcomes(...)`                                          | DELETE         | direct contextual `outcomes` literals                             |
| `patch(ref, patch)` activity                             | DELETE         | memory, transaction preview, observation, or internal store patch |
| `selectView`                                             | INTERNALIZE    | actor observer, checkpoint projection, or inspect projection      |
| `store.memory/test`                                      | DELETE         | runtime internal store selection                                  |
| `orchestrators.live/test`                                | DELETE         | runtime and story internal orchestration                          |
| `module(id, inventory, meta?)`                           | DELETE         | `module({ id, machines, views })`                                 |
| generic module inventory/meta                            | DELETE         | inferred graph plus exact root/view ownership                     |
| `app({ modules })` without ID                            | DELETE         | `app({ id, persistenceVersion, modules, dynamicMachines? })`      |
| `app.layer(...)`                                         | DELETE         | `runtime({ app, layer })`                                         |
| `runtime(layer)`                                         | DELETE         | `runtime({ app, layer, boot? })`                                  |
| zero-argument `runtime()`                                | DELETE         | explicit app and closed Layer                                     |
| `runtime.resources.*`                                    | DELETE         | machine activities, views, fixtures, and boot                     |
| `runtime.orchestrators.*`                                | DELETE         | `runtime.actor` and `runtime.createActor`                         |
| public `managedRuntime`                                  | INTERNALIZE    | `ready`, Effect bridges, and `dispose`                            |
| mutable `hydrateBoot`                                    | DELETE         | immutable runtime `boot` input                                    |
| public runtime inspection object                         | DELETE         | `actor.snapshots` and `/inspect` sinks                            |
| exported runtime service types                           | INTERNALIZE    | inferred app requirements and application Layer                   |
| resource and transaction snapshot `.status`              | KEEP           | same readonly literal discriminant                                |
| `isPlaceholderData`, `paused`, `availability: "failure"` | DELETE         | `availability`, `activity`, `freshness`, and TurnRecord issues    |
| standalone snapshot status-alias type exports            | DELETE         | inferred literal domains on snapshot fields                       |

The weak current root values are visibly exported at
`packages/flow-state/src/index.ts:1-24`. Current mutable runtime resources, orchestrators,
hydration, and ManagedRuntime exposure are defined at
`packages/flow-state/src/core/api/runtime-types.ts:51-67,117-165`.

### CUT-004 — No machine-grammar compatibility parser

The runtime MUST NOT detect old `context`, `invoke`, `always`, `after`, action, or string-target
objects and translate them at runtime. The compiler MUST reject them before app construction.
The withdrawn grammar is recorded at
`reference/incident-console/DESIGN_DECISIONS.md:1930-1968`.

### CUT-005 — No preview-to-authoritative compatibility behavior

Transaction success MUST NOT retain the current behavior of promoting optimistic preview
output into canonical data. Success removes that generation's overlay and invalidates the
base. This semantic correction MUST apply even when a transaction otherwise preserves its
current `params`, `preview`, `commit`, `invalidates`, `routes`, and `concurrency`
shape. The blocker is explicit at
`reference/incident-console/IMPLEMENTATION_BLOCKERS.md:35-59`.

## React cutover matrix

| Current surface                              | vNext decision         | Normative replacement                          |
| -------------------------------------------- | ---------------------- | ---------------------------------------------- |
| `FlowProvider` with explicit runtime         | KEEP, tighten behavior | same prop shape; private readiness adapter     |
| `useActor(machine, options?)`                | DELETE overload        | `useActor(rootMachine)`                        |
| React-owned actor shell                      | DELETE                 | synchronous runtime root handle                |
| hook-authored actor ID/input/snapshot/policy | DELETE                 | runtime creation or immutable boot             |
| broad `useActor` subscription                | DELETE                 | command-only actor handle                      |
| `useView(actor, view, equal?)`               | DELETE comparator      | `useView(view)` or `useView(actor, view)`      |
| `useResource`                                | DELETE                 | machine-bound view projection                  |
| future `useTransaction`                      | FORBID                 | machine-bound view projection                  |
| future `useCan`                              | FORBID                 | `can` inside a reactive view                   |
| Suspense/promise-throwing view behavior      | FORBID                 | explicit machine behavior and error boundaries |

The current shell and layout-effect attachment are at
`packages/flow-state/src/react/use-actor.ts:20-57,86-206`; the comparator is at
`packages/flow-state/src/react/use-view.ts:13-46`; `useResource` is exported at
`packages/flow-state/src/react-entry.ts:5-7`.

### CUT-006 — Public actor send remains synchronous

Migration MUST preserve ordinary React command ergonomics as `actor.send(event): void`.
It MUST NOT expose the story runner's acknowledgment as a Promise-returning send overload.
Stories use a package-private acknowledged dispatch over the same mailbox, so deleting the
old mutable test harness does not create a second actor engine.

## Testing cutover matrix

| Current surface                          | vNext decision | Normative replacement                                   |
| ---------------------------------------- | -------------- | ------------------------------------------------------- |
| `test`                                   | DELETE         | `story({ app, machine })`                               |
| `flowTest`                               | DELETE         | `story({ app, machine })`                               |
| `runFlowScenario`                        | DELETE         | `story.run()`                                           |
| `runFlowScenarioWithDiagnostics`         | DELETE         | `story.run()` / thrown `FlowStoryExecutionError`        |
| `scenarioToReport`                       | DELETE         | immutable story run evidence and inspect renderers      |
| `createScenarioEvidence`                 | DELETE         | checkpoints, final evidence, or error evidence          |
| `createControlledStream`                 | DELETE         | `control.stream` installed by a fixture                 |
| mutable controlled Effect/stream state   | DELETE         | inert ordinal control commands                          |
| `formatHarnessTracePretty`               | DELETE         | `/inspect` trace formatter                              |
| `formatPendingWorkPretty`                | DELETE         | structured checkpoint `pendingWork`                     |
| `formatScenarioTranscript`               | DELETE         | story run evidence renderer                             |
| `formatTransactionEventsPretty`          | DELETE         | TurnRecord/trace projection                             |
| live harness `state/context/getSnapshot` | DELETE         | named checkpoint snapshots and `final`                  |
| harness `runtime/actor`                  | DELETE         | package-private runner ownership                        |
| `until*`, `advanceUntilIdle`             | DELETE         | controls, `flush`, `settle`, and explicit time commands |
| test-only transaction retry/reset        | DELETE         | typed production machine events                         |
| test `provide`, raw Layer, raw seeds     | DELETE         | `fixture` definitions only                              |
| model `replay`                           | DELETE         | `path.story.run()`                                      |
| model `replayFlushed`                    | DELETE         | `path.story.flush().run()`                              |
| model `resolveSyncSuccessRoutes`         | DELETE         | explicit candidate events and live `path.story` proof   |
| custom test clock option                 | DELETE         | one Effect `TestClock` per story run                    |

The current testing route exports the superseded families at
`packages/flow-state/src/testing.ts:1-56`. The consolidated removal boundary is settled at
`reference/incident-console/DESIGN_DECISIONS.md:1198-1358,1484-1506`.

### CUT-007 — Story results do not retain scenario status unions

A completed plan MUST return captured product evidence regardless of domain outcome. Broken
plan execution MUST throw `FlowStoryExecutionError`. vNext MUST NOT preserve returned
`success`, `domain-failure`, `defect`, `interruption`, `blocked`, or `internal-error` status
unions, because the host test runner owns pass/fail semantics. The settled result boundary is
`reference/incident-console/DESIGN_DECISIONS.md:1513-1579`.

`FlowStoryExecutionError` is the sole named testing runtime class. Named `StoryRun`, scenario,
result, path, command, evidence, pending-work, cleanup, model-diagnostic, and general diagnostic
aliases MUST NOT replace the deleted surface; their structural shapes remain inferred from
the public constructors and methods.

### CUT-007A — CLI model exploration is deleted

Model candidates are application-owned typed values supplied directly to a programmatic model
traversal call. Registered stories are linear examples, not an event-domain or payload registry,
so the CLI MUST NOT expose `story paths`, path checking, `--event`, or another mechanism that
derives or fabricates candidates from a behavior gateway. Delete the path request normalizer,
list/check envelopes, renderers, command wiring, and CLI-only model adapter as one helper family.

## Server cutover matrix

| Current surface                                  | vNext decision | Normative replacement                                |
| ------------------------------------------------ | -------------- | ---------------------------------------------------- |
| `withRequestRuntime(layer, handler)`             | REPLACE        | `withRequestRuntime({ app, layer, boot? }, handler)` |
| v1 boot types                                    | DELETE         | root `RuntimeBootPayload<App>`                       |
| server-side mutable resource seeding             | DELETE         | fixture-only test seeds or root-machine preload      |
| direct service preload plus fabricated snapshots | DELETE         | typed root events plus actor observation             |

The current raw-Layer helper is `packages/flow-state/src/runtime/request-runtime.ts:6-20`, and
the current server route exports v1 boot types at `packages/flow-state/src/server.ts:1-9`.

## Inspect and CLI cutover matrix

| Current surface                                     | vNext decision | Normative replacement                      |
| --------------------------------------------------- | -------------- | ------------------------------------------ |
| graph, transition, action, and microstep inspection | KEEP, rebuild  | pure AppPlan/machine projections           |
| behavior build/slice/diff/render                    | KEEP, rebuild  | registered behavior gateway                |
| trace analyze/diff/summarize/artifacts              | KEEP, rebuild  | committed TurnRecords and v2 codecs        |
| inspection sinks                                    | KEEP, rebuild  | post-publication TurnRecord stream         |
| `captureTrace(snapshot)`                            | DELETE         | TurnRecord capture through a sink/artifact |
| `createLocalInspectionProof`                        | DELETE         | trace proof projection                     |
| `flowStories`                                       | DELETE         | `behavior({ stories })`                    |
| `storyToDoc`                                        | DELETE         | behavior contract renderer                 |
| `format*Pretty` duplicates                          | DELETE         | one formatter with format options          |
| parallel mutable trace and inspection histories     | DELETE         | one committed TurnRecord source            |
| exported TurnRecord/receipt/result type hierarchies | DELETE         | inferred `/inspect` value projections      |
| arbitrary CLI `--event` JSON                        | DELETE         | typed programmatic model candidates        |
| CLI `story paths` and path-check/list helper family | DELETE         | typed programmatic model traversal         |
| CLI `behavior`, story list/describe/run, and trace  | KEEP           | registered behavior and v2 artifacts       |

The current inspect route contains the parallel helpers at
`packages/flow-state/src/inspect.ts:1-37`, while the current CLI parses arbitrary event JSON
and accepts it in path commands at `packages/flow-state/src/cli/index.ts:200-214,851-909`.

### CUT-008 — Artifact v1 is rejected, not guessed

Boot, trace, and behavior artifacts MUST move together to v2. Import MUST reject v1 with a
structured version diagnostic. Flow MUST NOT guess a v1 payload into v2 or claim that its
private envelope decoder validates opaque domain memory or event payloads. Application code
owns explicit migration before v2 construction. This follows
`reference/incident-console/DESIGN_DECISIONS.md:1838-1851`.

## Required deletion proofs

### CUT-P01 — Runtime export absence

JavaScript export tests MUST prove absence of `after`, `createKey`, `createTag`, `outcomes`,
`patch`, `selectView`, `store`, `orchestrators`, `test`, `flowTest`, scenario executors,
controlled mutable helpers, `useResource`, `captureTrace`, `flowStories`, `storyToDoc`, and all
duplicate pretty formatters.

### CUT-P02 — Declaration absence

Packed declaration tests MUST prove that deleted values, types, overloads, object properties,
and deep imports fail with `@ts-expect-error`. Runtime absence alone is insufficient.

### CUT-P03 — No compatibility behavior

Behavioral tests MUST prove that old machine grammar is rejected, `send` does not expose an
acknowledgment, preview success does not become canonical data, mutable hydration is absent,
React mounts do not create actors or resource leases, stories cannot read a live harness,
models cannot execute Effects, and the CLI cannot fabricate payload events.

### CUT-P04 — Retained compatibility

Packed consumers MUST continue to prove ESM-only `types` and `import` conditions, exact Effect
peer identity, optional React for core-only installs, React 18 and React 19 compatibility,
private deep-import rejection, and executable root/testing/server/inspect/CLI routes. The live
runner currently enforces these package facts at
`packages/flow-state/scripts/check-packed-consumers.mjs:250-270,293-417`.

### CUT-P05 — Repository cleanup

After replacement proofs pass, implementation files dedicated only to deleted public
builders, actor shells, mutable resource hooks, parallel harnesses, replay wrappers, global
registries, and duplicate formatters MUST be removed. Source-text tests that assert obsolete
file names or token strings MUST be replaced by public type, lifecycle, race, isolation, and
artifact round-trip proofs. The cleanup inventory is recorded at
`reference/incident-console/IMPLEMENTATION_BLOCKERS.md:719-753`.

### CUT-P06 — One repository authority survives

The vNext cutover MUST remove the old root task system and competing contract corpus after their
still-live proof obligations have migrated. Root `TASK.md` becomes a short pointer to
`reference/incident-console/implementation/tasks/README.md`; the old `tasks/**` phases, goals,
receipts, and ledgers are then deleted. `IMPLEMENTATION_BLOCKERS.md` is deleted after all remaining
citations are replaced by stable contract or proof IDs.

The exact keep/migrate/delete inventory is maintained in the Phase 8 manifest. Deletion MUST preserve the
proofs for package routes, Effect peer identity, React 18/19, exact inference, request/runtime
isolation, bounded owners, hostile canonical/wire inputs, lifecycle cleanup, transaction/stream
oracles, packed CLI execution, and the documentation framework if still selected. Git history,
not stale working-tree documents, is the archive.
