# Compatibility and deletion contract

Status: normative target overlay; not shipped runtime behavior

Implementation status: target only. This vNext contract describes the intended replacement, not shipped
package source, public API, or runtime behavior. It MUST NOT be cited as evidence that vNext is implemented
or promoted. It remains a target until the coordinated migration and proof gate required by `REV-MIG-002`,
`REV-MIG-003`, and `REV-MIG-004` passes, including all accepted closure amendments under the normative
revision specification.

This contract applies the integrated vNext decisions to the former compatibility and deletion surface.
`REV-MIG-001` keeps accepted public decisions closed while behavioral gaps are resolved; `REV-MIG-002`
requires contracts, public types, artifacts, and proofs to move as one replacement; `REV-MIG-003` requires
proofs through the production owners; and this contract owns the transferred exhaustive old-surface
disposition. The contract clauses here are authoritative. Archived revision chapters are provenance only
and do not override or supplement this file.

The corresponding file under `contracts/provenance/` is retained as the current semantic source and
provenance record for this transfer. It supplies the wording and IDs restored here, but is not a competing
active authority.

All inherited entries in the historical behavior register indexed by
[`../revision-spec/README.md`](../revision-spec/README.md) are now closed by accepted revisions. Migration is
still not mechanically complete until the named implementation proofs pass. A future proof failure may reopen
only its disproved guarantee; it is never permission to add a public API, default, exception, alias, or proof
requirement that the revision specification did not accept.

Active clauses contain the transferred `DEL-*`, `RET-*`, and `CUT-*` owners. Legacy IDs remain trace labels in
the disposition and history below; they do not replace the active rules.

## Compatibility policy

### CUT-001 — Environmental boundaries and atomic replacement

- Surface: package routes, ESM/import conditions, core Effect peer identity, supported React peer compatibility,
  public constructors, commands, targets, lifecycle values, view registries, child-machine fields, result fields,
  and operation grammar.
- Rule: retain the boundaries named by `RET-001`; replace the contract at one boundary.
- Accepts: retained package/import/peer boundaries and live hosts or Stories using accepted production owners.
- Rejects: installed packages, active contracts, or runtimes that expose or compose deleted and replacement
  surfaces together; generated or handwritten types exposing both vocabularies. No installed package,
  active contract, or runtime may expose or compose the deleted surface with its replacement.
- Observable guarantee: the package has one accepted public surface at the cutover boundary.
- Proof: `CUT-P04`, `PROOF-017`, packed consumers, runtime owners.
- Trace: `RET-001`, `REV-MIG-001`–`REV-MIG-003`.

### CUT-002 — Replacement is hard deletion

- Surface: every old capability classified `REPLACE`.
- Rule: the old authoring shape disappears while the accepted capability continues.
- Accepts: the accepted replacement only.
- Rejects: aliases, overloads, adapters, compatibility namespaces, parser branches, and deprecated wrappers.
- Observable guarantee: no compatibility path preserves the old shape.
- Proof: `CUT-P01`–`CUT-P03`, `PROOF-017`.
- Trace: `DEL-004`, `DEL-005`, `DEL-007`–`DEL-010`.

### CUT-003 — Removed values fail closed

- Surface: every `DELETE`/`REPLACE` value, type, overload, property, deep import, file registry, example,
  proof, and task reference.
- Rule: remove it from active authority or classify it in the ledger.
- Accepts: negative absence proofs, ledgers, and historical provenance.
- Rejects: deleted exports, declarations, deep imports, authoring shapes, and any deleted shape that reaches
  actor creation, memory mutation, operation acquisition, event publication, external work, or evidence.
- Observable guarantee: runtime exports are absent and declaration consumers reject the deleted surface before
  side effects.
- Proof: `CUT-P01`, `CUT-P02`, `CUT-P03`, `PROOF-001`, `PROOF-017`.
- Trace: `DEL-001`–`DEL-011`.

### CUT-004 — No compatibility behavior for deleted authoring shapes

- Surface: deleted authoring shapes and implementation support kept only for them.
- Rule: the runtime does not translate a deleted shape into an accepted one.
- Accepts: a deleted name in a ledger, historical provenance, or negative absence proof.
- Rejects: supported API or replacement guidance, active glossary definitions, positive examples, aliases,
  adapters, registries, translators, parser branches, and implementation files kept solely for compatibility.
- Observable guarantee: deleted terminology has no positive active path.
- Proof: `CUT-P03`, `CUT-P05`, `CUT-P06`, `PROOF-017`.
- Trace: `REV-MIG-004`, `DEL-011`.

### CUT-005 — Authoritative writes remain explicit

- Surface: operation results, transaction/stream writes, generation fencing, completion ordering, overlays,
  equal values, state projections, and invalidation/clear.
- Rule: operation results never become canonical resource data implicitly.
- Accepts: explicit `setData` mappings on accepted transaction and stream surfaces; generation fencing under
  `REV-OPS-010`; `SEM-016`/`SEM-018` ordering and `API-006`/`SEM-011C` projections and invalidation.
- Rejects: implicit canonical writes or unaccepted completion mappings.
- Observable guarantee: every authoritative write is explicit and generation-safe.
- Proof: `PROOF-005`–`PROOF-007`.
- Trace: `REV-OPS-010`, `SEM-016`, `SEM-018`, `API-006`, `SEM-011C`.

### CUT-006 — Public actor commands stay synchronous

- Surface: public mailbox boundary and Story acknowledgment.
- Rule: `actor.send(event): void` remains public; Story acknowledgment is package-private over the same
  production mailbox.
- Accepts: synchronous public send and private stabilization acknowledgment.
- Rejects: Promise-returning public send overloads and a second actor engine.
- Observable guarantee: live hosts and Stories use one production mailbox boundary.
- Proof: `PROOF-003`, `PROOF-011`, `PROOF-017`.
- Trace: `RET-002`, `REV-TEST-006`.

### CUT-007 — Stories use accepted constructors and evidence

- Surface: Story construction, commands, targets, checkpoints, and end evidence.
- Rule: use `story.app(runtimeSetup, options?)`, `story.machine(machine, options?)`, and
  `story.actor(machine, options?)`, with closed options and target rules from `REV-TEST-001`–`REV-TEST-005`.
- Accepts: `process`, `advance`, `advanceTo`, `advanceToNextTimer`, `checkpoint.actor(...)`, and `run.end`
  under `REV-TEST-006`–`REV-TEST-008`.
- Rejects: deleted Story names, aliases, parallel harnesses, and result-injection commands.
- Observable guarantee: Story commands and evidence are the accepted production-owned surface.
- Proof: `PROOF-001`, `PROOF-008`–`PROOF-011`, `PROOF-017`.
- Trace: `DEL-009`, `REV-TEST-001`–`REV-TEST-010`.

### CUT-007A — Artifacts and CLI follow the accepted Story surface

- Surface: server, persistence, artifact, inspect, and CLI representations.
- Rule: update them for app Stories, exact actor evidence lookup, `run.end`, module tooling ownership,
  compound states, context requirements, lifecycle records, and accepted operation identities.
- Accepts: retained persistence codecs, artifact bounds, inspection sinks, and CLI formatting only where they
  do not preserve deleted surfaces; exact representation and parity under `REV-MIG-005`.
- Rejects: invented commands, schemas, migration algorithms, or old Story/artifact identities.
- Observable guarantee: artifacts and CLI describe the accepted app/actor/evidence model.
- Proof: `PROOF-014`, `CLI-P01`, `CLI-P02`, `PROOF-017`.
- Trace: `DEL-010`, `REV-MIG-005`, `WIRE-020B`.

### CUT-008 — Artifact migration does not guess

- Surface: persistence and artifact schemas.
- Rule: move schemas with the accepted replacement and use exact `WIRE-020B` behavior.
- Accepts: accepted bounds, ordering, codecs, and exact v2 representation.
- Rejects: deleted root, child, final-node, replay, mutable-harness, or old Story fields as supported shapes;
  a second migration algorithm; revived legacy shapes.
- Observable guarantee: unsupported or deleted artifact shapes fail closed at the exact wire boundary.
- Proof: `PROOF-010`, `PROOF-014`, `PROOF-017`, `CLI-P01`, `CLI-P02`.
- Trace: `REV-MIG-005`, `DEL-010`, `WIRE-020B`.

## Deletion and retention ownership

Every affected old public or authoring surface has exactly one disposition:

- `DELETE`: no replacement; disappear completely.
- `REPLACE`: disappear completely; capability continues under the accepted replacement.
- `RETAIN`: old clause remains authoritative and is unchanged here.
- `HISTORICAL`: may remain only in Git history or an explicitly historical location, never as active authority.

`REPLACE` is hard deletion. It permits no alias, overload, adapter, compatibility namespace, parser branch, or
deprecated wrapper. Environmental compatibility is retained only by an explicit `RETAIN` row. An unassigned
old clause remains authoritative under the overlay rule; migration cannot be promoted until every affected
clause, symbol, overload, registry, example, proof, and task reference is classified or recorded unchanged.

Deleted names may occur only in this ledger, the non-normative rejected/deferred record, historical provenance,
or a negative absence proof—not as supported API, replacement guidance, active glossary definition, or positive
example. The ledger does not remove a `RETAIN` row. Reference examples must rewrite deleted consumers; selector
files may be redistributed and unused host examples removed or promoted, but folder layout is not a public
deletion rule.

### Disposition table

This is the deletion ledger. Every document path and clause label in the inventory column is a historical
pre-revision reference. Reused labels in current contracts MUST NOT be resolved as the source of an active
rule; the accepted replacement column and current revision IDs are trace labels for the active replacement
clauses in this contract.

| ID | Disposition | Old surface and inventory | Accepted replacement or boundary |
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

### Retained boundary table

| ID | Disposition | Retained boundary |
| --- | --- | --- |
| `RET-001` | `RETAIN` | Package routes, ESM/import conditions, Effect peer identity, supported React peer compatibility. |
| `RET-002` | `RETAIN` | Synchronous `actor.send(event): void`, production mailbox, runtime-scoped stores, generation fencing, Cause classification, cleanup ordering, except fields encoding deleted roots, children, final nodes, or Story forms. |
| `RET-003` | `RETAIN` | Resource and transaction status discriminants. |
| `RET-004` | `RETAIN` | Canonical `key(...)`, `getState(...)`, `getData(...)`, transition `actions`, and accepted `O`/`P`/`K` identity. |
| `RET-005` | `RETAIN` | `FlowProvider`, revised `useActor`, `useActorByRef`, and passive selector observation. |

## No-residue requirements

For every `DELETE` or `REPLACE` entry, migration MUST prove all of the following:

1. Active contracts, glossaries, examples, Stories, fixtures, tests, and task files use only accepted or
   explicitly retained surfaces.
2. Runtime export proofs show the deleted value or namespace absent.
3. Declaration proofs reject deleted types, overloads, properties, deep imports, and authoring shapes.
4. Deleted authoring shapes fail before actor creation, memory mutation, operation acquisition, event
   publication, external work, or evidence.
5. No alias, adapter, registry, translator, parser branch, or implementation file remains solely for deletion
   compatibility.
6. Live examples and Stories exercise replacements through production owners; source scans may support but
   cannot replace runtime or declaration absence proofs.

The old contract name may occur in a negative absence proof only when testing unavailability. It may not occur
in a positive example, supported overload, active glossary definition, compatibility recommendation, or
replacement recipe. The deletion ledger MUST NOT be interpreted to remove a `RETAIN` row. A retained boundary
remains authoritative unless a later accepted revision gives it a new disposition. The reference examples MUST
remove or rewrite consumers of deleted surfaces; selector files may be redistributed and an unused host example
may be removed or promoted into a tested host, but folder layout itself is not a public deletion rule.

## Required cutover proofs

### CUT-P01 — Runtime export absence

- Surface: every `DELETE` and `REPLACE` surface in `DEL-001`–`DEL-010`.
- Rule: runtime exports and namespaces are absent while retained boundaries remain available through accepted
  owners.
- Accepts: runtime export inspection through package entrypoints and retained owners.
- Rejects: deleted exports or namespaces, including deep imports and file-level registries.
- Observable guarantee: all deleted runtime surfaces are unavailable.
- Proof: runtime export tests covering every ledger row; see `PROOF-017`.
- Trace: `DEL-001`–`DEL-010`, `RET-001`–`RET-005`.

### CUT-P02 — Declaration absence

- Surface: packed declarations and public type consumers.
- Rule: reject every deleted value, type, overload, property, deep import, and authoring shape.
- Accepts: accepted public types and retained boundaries.
- Rejects: deleted declarations even when runtime exports are absent.
- Observable guarantee: type-level compatibility cannot preserve a deleted surface.
- Proof: packed declaration negative tests and `PROOF-001`/`PROOF-017`.
- Trace: `DEL-001`–`DEL-010`, especially `DEL-009`.

### CUT-P03 — No compatibility behavior

- Surface: deleted authoring inputs and possible compatibility machinery.
- Rule: fail before side effects and run replacements through production owners.
- Accepts: negative rejection plus accepted replacement behavior.
- Rejects: aliases, adapters, parser branches, second runtimes, actors, Stories, operation engines, or selector
  implementations kept for compatibility.
- Observable guarantee: rejection is side-effect-free and replacement behavior has one owner.
- Proof: behavioral lifecycle/side-effect proofs, `PROOF-003`, `PROOF-004`, `PROOF-017`.
- Trace: `CUT-002`–`CUT-004`, `REV-MIG-003`–`REV-MIG-004`.

### CUT-P04 — Retained compatibility

- Surface: retained package, mailbox, status, operation, action, and host boundaries.
- Rule: preserve `RET-001`–`RET-005` without preserving deleted names.
- Accepts: supported ESM/import, Effect peer, React peer, synchronous mailbox, runtime ownership, status
  discriminants, canonical operation identity/actions, `FlowProvider`, revised actor hooks, passive views.
- Rejects: using environmental compatibility to retain deleted public APIs.
- Observable guarantee: retained consumers continue to work through accepted owners.
- Proof: packed consumers and package/runtime proofs; `PROOF-001`, `PROOF-012`, `PROOF-014`, `PROOF-017`.
- Trace: `RET-001`–`RET-005`.

### CUT-P05 — Repository cleanup

- Surface: implementation files and source-text tests dedicated only to deleted surfaces.
- Rule: after replacement proofs pass, remove them or classify them historical under `DEL-011`.
- Accepts: source scans as audit support and accepted public type, behavior, lifecycle, race, isolation, and
  artifact proofs; tests that only assert obsolete filenames or token strings are replaced by those proofs.
- Rejects: filename/token scans presented as runtime or declaration proof.
- Observable guarantee: no active implementation residue remains solely for deleted behavior.
- Proof: repository audit plus `PROOF-017`; source scans are non-substitutive.
- Trace: `DEL-011`, `CUT-003`, `CUT-004`.

### CUT-P06 — One repository authority survives

- Surface: old contract and task material under `DEL-011`.
- Rule: The old contract and task material covered by `DEL-011` MUST cease to be active authority after
  retained material and provenance have been transferred. Before deletion, every still-live obligation MUST
  be mapped to an accepted contract or proof, and the material MUST then be removed from active authority or
  explicitly marked historical. Git history, not stale working-tree documents, is the archive.
- Accepts: Git history as archive and explicit historical locations.
- Rejects: stale working-tree documents remaining active authority.
- Observable guarantee: one current repository authority remains for each live obligation.
- Proof: complete cross-contract mapping in `PROOF_MATRIX.md` and `PROOF-017` before deletion.
- Trace: `DEL-011`, `REV-MIG-002`–`REV-MIG-004`.

## Historical behavior boundary

This register is not a source of compatibility choices. `BEH-024`–`BEH-031` and `BEH-027` are closed by
accepted operation amendments; `BEH-023`, `BEH-030`, and `BEH-032` are closed by `REV-OPS-017`, `REV-OPS-018`,
and `REV-HOST-008`; `BEH-033` and `BEH-034` are closed by `REV-MIG-005`/`WIRE-020B` and `REV-MIG-006`.
Beads issues and executable proof records still carry the named obligations, but no inherited `BEH-*` entry is
an open compatibility blocker.
