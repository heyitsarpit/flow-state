# Phase 1 receipt — definitions, identity, types, and AppPlan

Status: implementation receipt complete; reopened by independent review before Phase 2

## Post-receipt review addendum

An independent hostile review after this receipt reproduced four Phase 1 defects and one hygiene
gap. They are recorded as `SP-B026`–`SP-B029` and `SP-N004` in `../SCRATCHPAD.md`; the Phase 1
manifest is reopened and Phase 2 is waiting. The command evidence below remains the historical
implementation closeout, but its claims that `PROOF-005.01` and all Phase 1 acceptance conditions
were closed are superseded until the corrections, regression tests, full Phase 1 gates, and an
independent thermo-nuclear review pass.

## Baseline and scope

Phase 1 started from clean commit `28c88c4aca26ee70b9048c867201aedd7826bf28` on `main`.
Before the first edit, `git status --short --untracked-files=all`, the unstaged diff, and the
cached diff all exited 0 with no output. There were no pre-existing changes to preserve.

The implementation is additive and package-private under `packages/flow-state/src/vnext/**`.
The installed root, React, testing, server, inspect, and CLI routes retain their exact legacy
exports and owners; their source entrypoints and the package export map have no Phase 1 diff.
No example, app, runtime executor, actor engine, resource store, transaction interpreter, React
host, story runner, inspection owner, or CLI execution owner changed. No Phase 2 work began.

## Authority reconciliation

Independent audits found contract and Phase 0 index defects that made literal Phase 1 closure
ambiguous. The governing files were reconciled before the affected implementation choices:

- `GLO-08` now rejects one shared root owned by different modules while deduplicating repeated
  presentation by the same module, matching `ARCH-002` and `API-012`.
- Phase 1 owns only the AppPlan admission half of dynamic actors; Phase 2 owns actor creation and
  runtime rejection. `TYPE-P04` measures Phase 1 AppPlan carriers, with story and fixture carriers
  deferred to their Phase 6 owner. `CUT-005` remains assigned to its later preview/public cutovers.
- The Phase 1 manifest now governs `PROOF-005`; normative `APP-001`–`APP-003` headings replace
  invented validator aliases, and the proof index uses the real `GLO-01`, `GLO-05`, and `GLO-09`
  identifiers and the correct definition API owners.
- Stale current-test paths were corrected, the planned root-export inventory was aligned to
  `PUBLIC_API.md`, and `validate.ts` now rejects unknown contract IDs and missing current proof
  owners.

The scratchpad has no open items after those corrections.

## Implemented private owners

The private vNext tree now owns inert definitions and exact derived state/event/input/memory
types; the single flat machine grammar; machine-independent resource, transaction, stream, child,
tag, view, module, and app descriptors; bounded canonical values and exact immutable refs; and a
pure closed-world `AppPlan` compiler. Construction copies and freezes authored grammar/options
without invoking callbacks, so later mutation cannot change a compiled plan or invalidate its
fingerprint.

`AppPlan` records roots separately from dynamic admission, complete static reachability and
requirements, exact activity/timer slots, durable descriptor resolution, creation authority, and
stable identity. It uses no global registry and invokes no lookup, commit, stream, guard,
selector, route, tag, memory, or service callback during compilation.

The private declaration proof emits strict isolated declarations into a temporary one-export
package, compiles positive and hostile negative aggregate consumers under `isolatedModules`,
rejects deep imports, and rejects emitted `any`. Its public-facing shape includes:

```ts
export { app, child, definition, machine, module, resource, stream, tag, transaction, view };
export type { App, Definition, EventOf, InputOf, Machine, MemoryOf, RequirementsOf, StateOf };
```

## Proof closure

Phase 1 closes central atomic cases `PROOF-001.01`, `PROOF-002.01`, `PROOF-002.02`,
`PROOF-002.03`, and `PROOF-005.01`, plus local cases `API-P02.01`, `TYPE-P01.01`,
`TYPE-P02.01`, `TYPE-P03.01`, `TYPE-P04.01`, and `CUT-P03.01`. It closes confirmed issues
`I8`, `I9`, and `I16`, and deletion rows `CUT-004.grammar` and `CUT-P03.private`. Later atomic
subcases keep their broad `PROOF-*` families open; this receipt does not claim those later owners.

The five focused proof files contain 21 passing tests. They cover exact type propagation and
requirements, callable event construction, omitted-memory identity, flat grammar rejection,
purity counters, dynamic-only reachability, immutable nested authoring input, hostile canonical
values and bounds, exact tag/ref identity, foreign-app isolation, exact activity/timer slots, and
the complete collision matrix:

| Presented identity                                    | Result                                    |
| ----------------------------------------------------- | ----------------------------------------- |
| Distinct modules with one module ID                   | Reject                                    |
| One root object owned by different modules            | Reject                                    |
| One root repeated by the same module                  | Deduplicate                               |
| Distinct machines with one machine ID                 | Reject                                    |
| Distinct same-kind descriptors with one descriptor ID | Reject                                    |
| Resource and transaction with one descriptor ID       | Reject                                    |
| The same descriptor object presented repeatedly       | Deduplicate                               |
| Distinct views with one view ID                       | Reject                                    |
| A view outside its module roots                       | Reject as foreign identity                |
| The same dynamic machine presented repeatedly         | Deduplicate                               |
| Distinct dynamic machines with one machine ID         | Reject                                    |
| An object compiled only by another app                | Unresolved locally; no cross-app registry |

## Phase 7 public-root inventory

Phase 1 publishes none of these names. The exact planned Phase 7 root value exports remain
`app`, `can`, `child`, `decodeRuntimeBoot`, `definition`, `FlowBootDecodeError`,
`FlowDehydrateError`, `FlowDisposeError`, `machine`, `module`, `resource`, `runtime`, `stream`,
`tag`, `transaction`, and `view`.

The planned root type exports remain `Definition`, `StateToken`, `EventToken`, `StateOf`,
`EventOf`, `Machine`, `MemoryOf`, `InputOf`, `RequirementsOf`, `Resource`, `ResourceRef`,
`ResourceSnapshot`, `Transaction`, `TransactionRef`, `TransactionSnapshot`, `View`, `SelectedOf`,
`Module`, `App`, `Runtime`, `RootActor`, `DynamicActor`, `ActorSnapshot`, `FlowIssue`,
`CanonicalKeyInput`, `Tag`, `InvalidationTarget`, and `RuntimeBootPayload`.

## Private deletion inventory

The vNext owners contain no `vocabulary`/`Vocabulary`, nested machine `define`, machine-owned
memory configuration, legacy machine overloads, standalone activity constructors, `createKey`,
`createTag`, standalone `outcomes`, `after`, `patch`, `selectView`, resource key/equality
projection, transaction `scope`, stream `pressure`, module inventory/meta, derived app ID,
app-owned Layer assembly, or process-global resource registry. The lower-case vNext `tag`
descriptor and binding-owned outcome map remain part of the accepted grammar. Corresponding
legacy public owners stay frozen until the atomic Phase 7 cutover.

## Changed files

Private implementation and proof files were added under `packages/flow-state/src/vnext/**`, with
`packages/flow-state/scripts/check-vnext-declarations.mjs`,
`packages/flow-state/scripts/check-vnext-type-performance.mjs`, and
`packages/flow-state/proof/vnext/type-performance-baseline.json`. `packages/flow-state/package.json`
only adds and wires the two private build gates; its export map is unchanged.

Authority/accounting changes are limited to `contracts/GLOSSARY_AND_IDENTITY.md`,
`contracts/PROOF_MATRIX.md`, `contracts/TYPE_SYSTEM.md`, `phase-0/export-dispositions.json`,
`phase-0/proof-index.json`, `phase-0/validate.ts`, the Phase 1 and Phase 2 manifests, the task
index, and this receipt. Deleted files and public symbols: none.

## Commands and exits

| Layer                | Exact command                                                                                                                                                                                                                                                                               | Exit and evidence                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Formatting           | `pnpm fmt`                                                                                                                                                                                                                                                                                  | 0; 640 files formatted after receipt creation                                                                                                           |
| Phase 0 validator    | `node --import ./node_modules/.pnpm/tsx@4.22.4/node_modules/tsx/dist/loader.mjs reference/incident-console/implementation/phase-0/validate.ts`                                                                                                                                              | 0; 344 package exports, 96 CLI exports, 56 central cases, 45 local cases, 71 byte goldens                                                               |
| Focused Phase 1      | `pnpm exec vp test packages/flow-state/src/vnext/definition-types.test.ts packages/flow-state/src/vnext/app-plan.test.ts packages/flow-state/src/vnext/app-plan-identity.test.ts packages/flow-state/src/vnext/machine-grammar.test.ts packages/flow-state/src/vnext/canonical-ref.test.ts` | 0; 5 files, 21 tests                                                                                                                                    |
| Source types         | `pnpm --filter flow-state check:cli-source-types`                                                                                                                                                                                                                                           | 0                                                                                                                                                       |
| Private declarations | `pnpm --filter flow-state check:vnext-declarations`                                                                                                                                                                                                                                         | 0; 8 packed files, positive/negative aggregate consumer, zero `any` declarations                                                                        |
| Type performance     | `pnpm --filter flow-state check:vnext-type-performance`                                                                                                                                                                                                                                     | 0; 25 roots/173,245 instantiations/221,208K/0.77s, 50 roots/328,380 instantiations/261,910K/0.93s, 1.895x instantiation growth                          |
| Package tests        | `pnpm --filter flow-state test`                                                                                                                                                                                                                                                             | 0; 118 files, 1,039 tests                                                                                                                               |
| Package build        | `pnpm --filter flow-state build`                                                                                                                                                                                                                                                            | 0                                                                                                                                                       |
| TypeScript modes     | `pnpm --filter flow-state check:typescript-mode-proofs`                                                                                                                                                                                                                                     | 0                                                                                                                                                       |
| Packed consumers     | `pnpm --filter flow-state check:packed-consumers`                                                                                                                                                                                                                                           | 0; fresh legacy-route tarball consumers passed                                                                                                          |
| Workspace            | `pnpm verify`                                                                                                                                                                                                                                                                               | 0; check green, 135 files and 1,107 tests, library and all six examples built, CLI acceptance passed, browser 9 passed with 1 declared skip, docs built |

The first closeout `pnpm verify` attempt exited 1 at lint/type-aware fixture cleanup and those
findings were fixed. A later sandboxed run reached all library gates but exited 1 when Turbopack
was denied permission to bind its CSS helper port; the identical unrestricted command produced
the final exit 0 above. No Phase 1 test is skipped.

## Closeout

All Phase 1 tasks, acceptance conditions, deletion obligations, atomic proof cases, and gates
pass. Independent contract, Phase 0 accounting, live-scope, type-surface, immutability, and
identity audits found no remaining reproduced Phase 1 blocker. Runtime actor creation and
rejection, executable stores and transactions, and all later broad-proof subcases remain with
their assigned phases. Phase 2 is Ready; it has not begun.
