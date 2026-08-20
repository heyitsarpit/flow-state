# Compatibility and deletion contract

Status: normative target overlay; not shipped runtime behavior

Implementation status: target only. This vNext contract describes the intended replacement, not shipped
package source, public API, or runtime behavior. It MUST NOT be cited as evidence that vNext is implemented
or promoted. It remains a target until the coordinated migration and proof gate required by `REV-MIG-002`,
`REV-MIG-003`, and `REV-MIG-004` passes, including all accepted closure amendments under the normative
revision specification.

This contract applies the integrated vNext decisions to the former compatibility and deletion surface.
`REV-MIG-001` keeps accepted public decisions closed while behavioral gaps are resolved;
`REV-MIG-002` requires contracts, public types, artifacts, and proofs to move as one replacement;
`REV-MIG-003` requires proofs through the production owners; and this contract owns the transferred
exhaustive old-surface disposition. The contract clauses here are authoritative. Archived revision
chapters are provenance only and do not override or supplement this file.

All inherited entries in [`../revision-spec/UNRESOLVED_BEHAVIOR.md`](../revision-spec/UNRESOLVED_BEHAVIOR.md)
are now closed by accepted revisions. Migration is still not mechanically complete until the named
implementation proofs pass. A future proof failure may reopen only its disproved guarantee; it is never
permission to add a public API, default, exception, alias, or proof requirement that the revision
specification did not accept.

Active clauses in this file contain the transferred `DEL-*` and `RET-*` owners and the compatibility-specific
`CUT-*` rules. Legacy contract and revision IDs are retained as trace labels in the historical mappings below;
they do not displace the active clauses in this file.

## Compatibility policy

### CUT-001 — Retain environmental boundaries and replace contracts atomically

The package MUST retain the package routes, ESM/import conditions, core Effect peer identity, and supported
React peer compatibility named by `RET-001`. The replacement MUST occur at one contract boundary. Generated
and handwritten public types MUST NOT expose both old and accepted constructors, commands, targets,
lifecycle values, view registries, child-machine fields, result fields, or operation grammar.

No installed package, active contract, or runtime may expose or compose the deleted surface with its
replacement. Live hosts and Stories MUST use the production runtime owners required by the accepted revisions.

### CUT-002 — A replacement is a hard deletion of the old surface

`REPLACE` means that the old capability disappears completely while the accepted replacement continues the
capability. Migration MUST NOT preserve an old authoring shape through an alias, overload, adapter,
compatibility namespace, parser branch, or deprecated wrapper.

### CUT-003 — Removed values fail closed

Every `DELETE` or `REPLACE` value, type, overload, property, deep import, file-level registry, example,
proof, and task reference MUST be removed from active authority or classified by the deletion ledger. Runtime
export proofs MUST show deleted values and namespaces absent; declaration proofs MUST reject deleted types,
overloads, properties, deep imports, and authoring shapes. A deleted authoring shape MUST be rejected before
it can create an actor, mutate memory, acquire an operation, publish an event, start external work, or write
evidence.

### CUT-004 — No compatibility behavior for deleted authoring shapes

The runtime MUST NOT translate a deleted authoring shape into an accepted one. A deleted surface may appear
in a ledger, historical provenance, or negative absence proof, but MUST NOT appear as supported API,
replacement guidance, an active glossary definition, or a positive example. No compatibility alias, adapter,
registry, translator, parser branch, or implementation file may remain solely to preserve a deleted surface.

### CUT-005 — Authoritative writes remain explicit

Operation results MUST NOT become canonical resource data implicitly. Accepted transaction and stream
surfaces may declare explicit `setData` mappings, and every successful authoritative write MUST apply the
generation-fencing rule in `REV-OPS-010`. Completion-side ordering, overlays, equal-value behavior, and
related conflicts follow `SEMANTICS.md` `SEM-016` and `SEM-018`; exact state projections and
invalidation/clear behavior follow `PUBLIC_API.md` `API-006` and `SEMANTICS.md` `SEM-011C`.

### CUT-006 — Public actor commands remain synchronous

The retained public mailbox boundary is `actor.send(event): void`. Story commands may use a package-private
acknowledgment over that same production mailbox, but the acknowledgment MUST NOT become a public Promise-
returning send overload or a second actor engine.

### CUT-007 — Stories use the accepted constructors and evidence

The accepted Story surface is `story.app(runtimeSetup, options?)`, `story.machine(machine, options?)`, and
`story.actor(machine, options?)`, with the closed option objects and target rules in `REV-TEST-001` through
`REV-TEST-005`. The accepted Story command and evidence boundary is `process`, `advance`,
`advanceTo`, `advanceToNextTimer`, `checkpoint.actor(...)`, and `run.end` as defined by
`REV-TEST-006` through `REV-TEST-008`. Deleted Story names MUST NOT remain as aliases or parallel harnesses.

### CUT-007A — Artifacts and CLI follow the accepted Story surface

The conflicting server, persistence, artifact, inspect, and CLI surfaces classified by `DEL-010` MUST be
updated to represent app Stories, exact actor evidence lookup, `run.end`, module tooling ownership,
compound states, context requirements, lifecycle records, and accepted operation identities. Retained
persistence codecs, artifact bounds, inspection sinks, and CLI formatting may remain only where they do not
preserve a deleted surface. Exact representation and parity follow `REV-MIG-005`; this clause
does not invent a command, schema, or migration algorithm.

### CUT-008 — Artifact migration does not guess deleted or unsupported shapes

Artifact and persistence schemas MUST move with the accepted contract replacement. They MUST NOT preserve
deleted root, child, final-node, replay, mutable-harness, or old Story fields as supported shapes. The
revision specification does not authorize a second artifact-version migration algorithm, so implementations
MUST use the exact WIRE-020B artifact behavior rather than guessing or reviving a legacy shape.

## Deletion and retention ownership

Every old public or authoring surface affected by this contract MUST have exactly one disposition in this
ledger:

- `DELETE` means the old capability has no replacement and MUST disappear completely.
- `REPLACE` means the old surface MUST disappear completely, while the capability continues under the
  accepted replacement named in the entry.
- `RETAIN` means the old clause remains authoritative and is not changed by this contract.
- `HISTORICAL` means the material MAY remain for provenance in Git history or an explicitly historical
  location, but MUST NOT remain an active contract authority.

`REPLACE` is still a hard deletion of the old surface. It does not permit an alias, overload, adapter,
compatibility namespace, parser branch, or deprecated wrapper that preserves the old authoring shape.
Environmental compatibility such as package routes, module formats, peer identity, and supported React
peer ranges is retained only where a `RETAIN` entry says so; it MUST NOT be used to preserve a deleted
public API name.

An old clause not yet assigned a disposition remains authoritative under the overlay rule. Migration MUST
NOT be promoted until the old contract inventory is complete and every affected clause, symbol, overload,
file-level registry, example, proof, and task reference is either classified here or explicitly recorded as
unchanged. A deleted surface MAY be named in this ledger, the non-normative rejected and deferred record,
historical provenance, and a negative absence proof; it MUST NOT appear as supported active API or
replacement guidance.

### Deletion ledger

Every document path and clause label in the inventory column is a historical pre-revision reference. Reused
labels in current contracts MUST NOT be resolved as the source of an active rule; the accepted replacement
column and current revision IDs are trace labels for the active replacement clauses in this contract.

| ID | Disposition | Old surface and contract inventory | Accepted replacement or boundary |
| --- | --- | --- | --- |
| `DEL-001` | `DELETE` | Registered Flow views: `flow.view`, exported `View`, view IDs, `module.views`, registered view lookup, `useView(view)`, and view-bound `can` APIs. Old inventory: `PUBLIC_API.md` `API-010`–`API-012`, `GLOSSARY_AND_IDENTITY.md` `GLO-07`–`GLO-14`, `TYPE_SYSTEM.md` `TYPE-013`, and the old view-hook portions of `REACT_AND_HOSTS.md`. | `REV-HOST-006` retains only passive `useView(actor, selector)` projections. |
| `DEL-002` | `DELETE` | Child-machine model: `child(...)`, child descriptors, child inputs, child actor IDs, child lifecycle and completion, child snapshots, child addressing, child persistence, child Story commands, and child model surfaces. Old inventory: `PUBLIC_API.md` `API-008`, `TYPE_SYSTEM.md` `TYPE-007`, `SEMANTICS.md` child completion clauses, `SNAPSHOTS.md` `SNAP-008`, and child portions of `ARCHITECTURE.md`. | `REV-MACH-001`, `REV-MACH-002`, and `REV-MIG-006` express hierarchy through recursive substates inside one actor and require explicitly owned actors for independent workflows. |
| `DEL-003` | `DELETE` | Automatic roots and dynamic actor categories: `dynamicMachines`, `RootActor`, `DynamicActor`, automatic-root identity, `runtime.actor(machine)`, ID-bearing local creation, and dynamic root persistence categories. Old inventory: `ARCHITECTURE.md` `ARCH-001`–`ARCH-003`, `GLOSSARY_AND_IDENTITY.md` root/dynamic entries, `REACT_AND_HOSTS.md` root host clauses, and `TYPE_SYSTEM.md` `TYPE-009`–`TYPE-010`. | `REV-COMP-006`–`REV-COMP-008` retain named module machine records and closed `App.M`; `REV-COMP-011`–`REV-COMP-015` define explicit actor identity and ownership. |
| `DEL-004` | `REPLACE` | Old actor ownership and lifecycle: the complete `active \| disposed` model, disposal on ordinary actor handles, `DynamicActor.dispose()`, automatic root ownership, and category-specific actor identity. Old inventory: `GLOSSARY_AND_IDENTITY.md` lifecycle entries, `REACT_AND_HOSTS.md` disposal clauses, `SEMANTICS.md` `SEM-024`–`SEM-024A`, `TYPE_SYSTEM.md` `TYPE-012`, and `PUBLIC_API.md` `API-012A`. | `REV-COMP-013` and `REV-HOST-003` replace it with owner leases and `prepared \| active \| suspended \| disposed`. |
| `DEL-005` | `REPLACE` | Old machine grammar: root `initial`, flat-only configuration, final-node kind, `onDone`, final output, completion-driven mailbox shutdown, Boolean reentry, and contradictory recursive-handler semantics. The old prohibition on transition `actions` is removed, not retained. Old inventory: `PUBLIC_API.md` `API-004`, `TYPE_SYSTEM.md` state grammar, `SEMANTICS.md` `SEM-002`, and related proof rows. | `REV-MACH-002`–`REV-MACH-011` and `REV-OPS-006` define recursive states, `default`, exact reentry, ordinary terminal-looking leaves, and transition actions. |
| `DEL-006` | `DELETE` | Generic operation registries and refs: the general `activity` kit, `activity.ensure/observe/refresh/run/stream/invalidate`, public `ref`, `byKey`, `byLane`, bound entries, generic `resources.get`, generic `transactions.get`, and public operation enumeration. Old inventory: `PUBLIC_API.md` `API-005`–`API-009`, `TYPE_SYSTEM.md` `TYPE-005`–`TYPE-008`, and operation portions of `SEMANTICS.md`. | `REV-OPS-001`, `REV-OPS-002`, and `REV-OPS-005` retain named `O` families, `P`/`K`, `key(...)`, `getState(...)`, and `getData(...)`. |
| `DEL-007` | `REPLACE` | Old shared selector equality and custom comparator paths: recursive structural-sharing guarantees, comparator overloads, and selector-specific equality hooks. Operation parameter tuples are not included in this deletion. | `REV-COMP-002`, the shared selector semantics in `./SEMANTICS.md` and `./REACT_AND_HOSTS.md`, and `REV-HOST-006` define one scalar/non-record and named-record `Object.is` contract. |
| `DEL-008` | `REPLACE` | Old React runtime ownership: React-created actor shells, shell swapping, root-only `useActor` lookup, `useResource`, broad actor subscriptions, per-actor React Context, binding components, and view-object hooks. Old inventory: `REACT_AND_HOSTS.md` `HOST-001`–`HOST-012` and the React matrix in the old compatibility contract. | `REV-HOST-001`–`REV-HOST-005` retain `FlowProvider`, `useActor`, `useActorByRef`, and the production actor lifecycle without a React-owned runtime. |
| `DEL-009` | `REPLACE` | Old Story and scenario surfaces: callable `story({ ... })`, `.with(...)`, bare-app Stories, live runtime inputs, `perform`, `deliver`, `receive`, `simulate`, `flush`, `settle`, `setTime`, `run.final`, replay helpers, mutable harnesses, and old scenario runners. Old inventory: `PUBLIC_API.md` `API-013`–`API-016`, `TYPE_SYSTEM.md` `TYPE-014`–`TYPE-017`, `TESTING.md` `TEST-001`–`TEST-018`, and `PROOF_MATRIX.md` Story rows. | `REV-TEST-001`–`REV-TEST-010` define the three constructors, complete service Implementations, `process`, `advanceTo`, `checkpoint.actor`, and `run.end`; no separate `simulate` or result-injection command exists. |
| `DEL-010` | `REPLACE` | Conflicting server, persistence, artifact, inspect, and CLI surfaces: mutable v1 boot/hydration, fabricated root/child/final snapshot fields, replay-oriented inspection records, duplicate formatters, arbitrary scenario-runner commands, and old Story artifact schemas. | Retain persistence codecs, artifact bounds, inspection sinks, CLI formatting, and proof discipline only where they do not preserve a deleted surface; update their schemas to the accepted app, actor, compound-state, lifecycle, and operation identities. |
| `DEL-011` | `HISTORICAL` | The old `implementation/contracts/` pack, obsolete compatibility matrix, and phase/task documents that continue to prescribe deleted surfaces. | After retained material and provenance are transferred, these documents MUST be removed from active authority or explicitly marked historical. Git history remains the archive. |

### Retained dispositions

These are explicit `RETAIN` dispositions, not permissions inferred from the absence of a deletion row:

| ID | Disposition | Retained boundary |
| --- | --- | --- |
| `RET-001` | `RETAIN` | Package routes, ESM/import conditions, Effect peer identity, and supported React peer compatibility. |
| `RET-002` | `RETAIN` | Synchronous `actor.send(event): void`, the production mailbox boundary, runtime-scoped stores, generation fencing, Cause classification, and cleanup ordering, except for fields that specifically encode deleted roots, children, final nodes, or Story forms. |
| `RET-003` | `RETAIN` | Resource and transaction status discriminants. |
| `RET-004` | `RETAIN` | Canonical operation `key(...)`, `getState(...)`, `getData(...)`, transition `actions`, and the accepted `O`/`P`/`K` identity model. |
| `RET-005` | `RETAIN` | `FlowProvider`, revised `useActor`, `useActorByRef`, and passive selector observation. |

### No-residue requirements

For every `DELETE` or `REPLACE` entry, migration MUST satisfy all of the following:

1. Active contract documents, glossaries, examples, stories, fixtures, tests, and task files use only the
   accepted replacement or an explicitly retained surface.
2. Runtime export proofs show that the deleted value or namespace is absent.
3. Declaration proofs reject deleted types, overloads, properties, deep imports, and authoring shapes.
4. A deleted authoring shape is rejected before it can create an actor, mutate memory, acquire an operation,
   publish an event, start external work, or write evidence.
5. No compatibility alias, adapter, registry, translator, parser branch, or implementation file remains
   solely to preserve the deleted surface.
6. Live examples and Stories exercise the replacement through the production owners. A source-text scan MAY
   support the audit, but it MUST NOT replace runtime or declaration absence proofs.

The old contract name MAY occur in a negative absence proof only when the proof is testing that the name is
unavailable. It MUST NOT occur in a positive example, supported overload, active glossary definition,
compatibility recommendation, or replacement recipe.

The deletion ledger MUST NOT be interpreted to remove a `RETAIN` row. A retained boundary remains
authoritative unless a later accepted revision gives it a new disposition.

The reference examples MUST remove or rewrite consumers of deleted surfaces. A selector file may be
redistributed by feature, and an unused host example may be removed or promoted into a tested host, but
folder layout itself is not a public deletion rule.

## Required cutover proofs

### CUT-P01 — Runtime export absence

Runtime export tests MUST cover every `DELETE` and `REPLACE` surface in `DEL-001` through `DEL-010` and
prove that retained boundaries remain available through their accepted owners.

### CUT-P02 — Declaration absence

Packed declaration tests MUST reject every deleted value, type, overload, property, deep import, and
authoring shape with negative type proofs. Runtime absence alone is insufficient.

### CUT-P03 — No compatibility behavior

Behavioral proofs MUST show that deleted authoring shapes fail before side effects and that no compatibility
alias, adapter, parser branch, or second runtime, actor, Story, operation, or selector implementation
survives. Replacement behavior MUST run through the accepted production owner.

### CUT-P04 — Retained compatibility

Packed consumers MUST prove the `RET-001` package boundaries, `RET-002` synchronous mailbox and runtime
ownership boundaries, `RET-003` status discriminants, `RET-004` operation identity and action surface, and
`RET-005` host surfaces. These proofs MUST preserve the supported ESM/import, Effect peer, and React peer
compatibility claims without preserving deleted API names.

### CUT-P05 — Repository cleanup

After replacement proofs pass, implementation files dedicated only to deleted surfaces MUST be removed or
classified historical under `DEL-011`. Source-text tests that merely assert obsolete filenames or token
strings MUST be replaced by the accepted public type, behavior, lifecycle, race, isolation, and artifact
proofs; source scans cannot replace runtime or declaration absence proofs.

### CUT-P06 — One repository authority survives

The old contract and task material covered by `DEL-011` MUST cease to be active authority after retained
material and provenance have been transferred. Before deletion, every still-live obligation MUST be mapped to
an accepted contract or proof, and the material MUST then be removed from active authority or explicitly marked
historical. Git history, not stale working-tree documents, is the archive.

## Historical behavior boundaries

The historical behavior register is not a source of compatibility choices. `BEH-024` through `BEH-031` and
`BEH-027` are closed by their accepted operation amendments; `BEH-023`, `BEH-030`, and `BEH-032` are closed
by `REV-OPS-017`, `REV-OPS-018`, and `REV-HOST-008`; and `BEH-033` and `BEH-034` are closed by
`REV-MIG-005`/`WIRE-020B` and `REV-MIG-006`. Beads issues and executable proof records still need to carry
the named obligations, but no inherited `BEH-*` entry remains an open compatibility blocker.
