# Deletions and cutover

Status: normative accepted revision

This chapter is the complete deletion ledger for the revision overlay. It identifies old contract
surfaces that are removed or replaced, prevents an old name from surviving as an accidental alias, and
defines the absence evidence required before migration is promoted. Historical contract references in
this chapter are provenance only; they do not add rules to this specification.

## REV-MIG-004 — Apply an exhaustive deletion ledger and no-residue cutover

**Change:** Add an explicit, normative disposition for old contract surfaces instead of relying on
silence, broad non-goals, or an old compatibility matrix.

**Provenance (non-normative):** User-approved revision decision recorded during the revision-spec review;
old-clause inventory audited against `implementation/contracts/`.

**Supersedes:** Every conflicting old clause named by a `DEL-*` entry below. The old
`COMPATIBILITY_AND_DELETIONS.md` remains historical evidence until its retained material has been
transferred to this specification.

**Rule:** Every old public or authoring surface affected by this revision MUST have exactly one
disposition in this ledger:

- `DELETE` means the old capability has no replacement and MUST disappear completely.
- `REPLACE` means the old surface MUST disappear completely, while the capability continues under the
  accepted replacement named in the entry.
- `RETAIN` means the old clause remains authoritative and is not changed by this revision.
- `HISTORICAL` means the material MAY remain for provenance in Git history or an explicitly historical
  location, but MUST NOT remain an active contract authority.

`REPLACE` is still a hard deletion of the old surface. It does not permit an alias, overload, adapter,
compatibility namespace, parser branch, or deprecated wrapper that preserves the old authoring shape.
Environmental compatibility such as package routes, module formats, peer identity, and supported React
peer ranges is retained only where a `RETAIN` entry says so; it MUST NOT be used to preserve a deleted
public API name.

An old clause not yet assigned a disposition remains authoritative under the overlay rule. Migration
MUST NOT be promoted until the old contract inventory is complete and every affected clause, symbol,
overload, file-level registry, example, proof, and task reference is either classified here or explicitly
recorded as unchanged. A deleted surface MAY be named in this ledger, the non-normative rejected and
deferred record, historical provenance, and a negative absence proof; it MUST NOT appear as supported
active API or replacement guidance.

### Deletion ledger

| ID        | Disposition  | Old surface and contract inventory                                                                                                                                                                                                                                                                                                                                                                                          | Accepted replacement or boundary                                                                                                                                                                                                                                                                                                               |
| --------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEL-001` | `DELETE`     | Registered Flow views: `flow.view`, exported `View`, view IDs, `module.views`, registered view lookup, `useView(view)`, and view-bound `can` APIs. Old inventory: `PUBLIC_API.md` `API-010`–`API-012`, `GLOSSARY_AND_IDENTITY.md` `GLO-07`–`GLO-14`, `TYPE_SYSTEM.md` `TYPE-013`, and the old view-hook portions of `REACT_AND_HOSTS.md`.                                                                                   | `REV-HOST-006` retains only passive `useView(actor, selector)` projections.                                                                                                                                                                                                                                                                    |
| `DEL-002` | `DELETE`     | Child-machine model: `child(...)`, child descriptors, child inputs, child actor IDs, child lifecycle and completion, child snapshots, child addressing, child persistence, child Story commands, and child model surfaces. Old inventory: `PUBLIC_API.md` `API-008`, `TYPE_SYSTEM.md` `TYPE-007`, `SEMANTICS.md` child completion clauses, `SNAPSHOTS.md` `SNAP-008`, and child portions of `ARCHITECTURE.md`.              | `REV-MACH-001` and `REV-MACH-002` express hierarchy through recursive substates inside one actor.                                                                                                                                                                                                                                              |
| `DEL-003` | `DELETE`     | Automatic roots and dynamic actor categories: `dynamicMachines`, `RootActor`, `DynamicActor`, automatic-root identity, `runtime.actor(machine)`, ID-bearing local creation, and dynamic root persistence categories. Old inventory: `ARCHITECTURE.md` `ARCH-001`–`ARCH-003`, `GLOSSARY_AND_IDENTITY.md` root/dynamic entries, `REACT_AND_HOSTS.md` root host clauses, and `TYPE_SYSTEM.md` `TYPE-009`–`TYPE-010`.           | `REV-COMP-006`–`REV-COMP-008` retain named module machine records and closed `App.M`; `REV-COMP-011`–`REV-COMP-015` define explicit actor identity and ownership.                                                                                                                                                                              |
| `DEL-004` | `REPLACE`    | Old actor ownership and lifecycle: the complete `active                                                                                                                                                                                                                                                                                                                                                                     | disposed`model, disposal on ordinary actor handles,`DynamicActor.dispose()`, automatic root ownership, and category-specific actor identity. Old inventory: `GLOSSARY_AND_IDENTITY.md`lifecycle entries,`REACT_AND_HOSTS.md`disposal clauses,`SEMANTICS.md` `SEM-024`–`SEM-024A`, `TYPE_SYSTEM.md` `TYPE-012`, and `PUBLIC_API.md` `API-012A`. | `REV-COMP-013` and `REV-HOST-003` replace it with owner leases and `prepared | active | suspended | disposed`. |
| `DEL-005` | `REPLACE`    | Old machine grammar: root `initial`, flat-only configuration, final-node kind, `onDone`, final output, completion-driven mailbox shutdown, Boolean reentry, and contradictory recursive-handler semantics. The old prohibition on transition `actions` is removed, not retained. Old inventory: `PUBLIC_API.md` `API-004`, `TYPE_SYSTEM.md` state grammar, `SEMANTICS.md` `SEM-002`, and related proof rows.                | `REV-MACH-002`–`REV-MACH-011` and `REV-OPS-006` define recursive states, `default`, exact reentry, ordinary terminal-looking leaves, and transition actions.                                                                                                                                                                                   |
| `DEL-006` | `DELETE`     | Generic operation registries and refs: the general `activity` kit, `activity.ensure/observe/refresh/run/stream/invalidate`, public `ref`, `byKey`, `byLane`, bound entries, generic `resources.get`, generic `transactions.get`, and public operation enumeration. Old inventory: `PUBLIC_API.md` `API-005`–`API-009`, `TYPE_SYSTEM.md` `TYPE-005`–`TYPE-008`, and operation portions of `SEMANTICS.md`.                    | `REV-OPS-001`, `REV-OPS-002`, and `REV-OPS-005` retain named `O` families, `P`/`K`, `key(...)`, `getState(...)`, and `getData(...)`.                                                                                                                                                                                                           |
| `DEL-007` | `REPLACE`    | Old shared selector equality and custom comparator paths: recursive structural-sharing guarantees, comparator overloads, and selector-specific equality hooks. Operation parameter tuples are not included in this deletion.                                                                                                                                                                                                | `REV-COMP-002`, the shared selector semantics in `01-composition-and-app-plans.md`, and `REV-HOST-006` define one scalar/non-record and named-record `Object.is` contract.                                                                                                                                                                     |
| `DEL-008` | `REPLACE`    | Old React runtime ownership: React-created actor shells, shell swapping, root-only `useActor` lookup, `useResource`, broad actor subscriptions, per-actor React Context, binding components, and view-object hooks. Old inventory: `REACT_AND_HOSTS.md` `HOST-001`–`HOST-012` and the React matrix in the old compatibility contract.                                                                                       | `REV-HOST-001`–`REV-HOST-005` retain `FlowProvider`, `useActor`, `useActorByRef`, and the production actor lifecycle without a React-owned runtime.                                                                                                                                                                                            |
| `DEL-009` | `REPLACE`    | Old Story and scenario surfaces: callable `story({ ... })`, `.with(...)`, bare-app Stories, live runtime inputs, `perform`, `deliver`, `receive`, `flush`, `settle`, `setTime`, `run.final`, replay helpers, mutable harnesses, and old scenario runners. Old inventory: `PUBLIC_API.md` `API-013`–`API-016`, `TYPE_SYSTEM.md` `TYPE-014`–`TYPE-017`, `TESTING.md` `TEST-001`–`TEST-018`, and `PROOF_MATRIX.md` Story rows. | `REV-TEST-001`–`REV-TEST-010` define the three constructors, `simulate`, `process`, `advanceTo`, `checkpoint.actor`, and `run.end`.                                                                                                                                                                                                            |
| `DEL-010` | `REPLACE`    | Conflicting server, persistence, artifact, inspect, and CLI surfaces: mutable v1 boot/hydration, fabricated root/child/final snapshot fields, replay-oriented inspection records, duplicate formatters, arbitrary scenario-runner commands, and old Story artifact schemas.                                                                                                                                                 | Retain persistence codecs, artifact bounds, inspection sinks, CLI formatting, and proof discipline only where they do not preserve a deleted surface; update their schemas to the accepted app, actor, compound-state, lifecycle, and operation identities.                                                                                    |
| `DEL-011` | `HISTORICAL` | The old `implementation/contracts/` pack, obsolete compatibility matrix, and phase/task documents that continue to prescribe deleted surfaces.                                                                                                                                                                                                                                                                              | After retained material and provenance are transferred, these documents MUST be removed from active authority or explicitly marked historical. Git history remains the archive.                                                                                                                                                                |

### Retained dispositions

These are explicit `RETAIN` dispositions, not permissions inferred from the absence of a deletion row:

| ID        | Disposition | Retained boundary                                                                                                                                                                                                                                               |
| --------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RET-001` | `RETAIN`    | Package routes, ESM/import conditions, Effect peer identity, and supported React peer compatibility.                                                                                                                                                            |
| `RET-002` | `RETAIN`    | Synchronous `actor.send(event): void`, the production mailbox boundary, runtime-scoped stores, generation fencing, Cause classification, and cleanup ordering, except for fields that specifically encode deleted roots, children, final nodes, or Story forms. |
| `RET-003` | `RETAIN`    | Resource and transaction status discriminants.                                                                                                                                                                                                                  |
| `RET-004` | `RETAIN`    | Canonical operation `key(...)`, `getState(...)`, `getData(...)`, transition `actions`, and the accepted `O`/`P`/`K` identity model.                                                                                                                             |
| `RET-005` | `RETAIN`    | `FlowProvider`, revised `useActor`, `useActorByRef`, and passive selector observation.                                                                                                                                                                          |

### No-residue requirements

For every `DELETE` or `REPLACE` entry, migration MUST satisfy all of the following:

1. Active contract documents, glossaries, examples, stories, fixtures, tests, and task files use only the
   accepted replacement or an explicitly retained surface.
2. Runtime export proofs show that the deleted value or namespace is absent.
3. Declaration proofs reject deleted types, overloads, properties, deep imports, and authoring shapes.
4. A deleted authoring shape is rejected before it can create an actor, mutate memory, acquire an
   operation, publish an event, start external work, or write evidence.
5. No compatibility alias, adapter, registry, translator, parser branch, or implementation file remains
   solely to preserve the deleted surface.
6. Live examples and Stories exercise the replacement through the production owners. A source-text scan
   MAY support the audit, but it MUST NOT replace runtime or declaration absence proofs.

The old contract name MAY occur in a negative absence proof only when the proof is testing that the name
is unavailable. It MUST NOT occur in a positive example, supported overload, active glossary definition,
compatibility recommendation, or replacement recipe.

The deletion ledger MUST NOT be interpreted to remove a `RETAIN` row. A retained boundary remains
authoritative unless a later accepted revision gives it a new disposition.

The reference examples MUST remove or rewrite consumers of deleted surfaces. A selector file may be
redistributed by feature, and an unused host example may be removed or promoted into a tested host, but
folder layout itself is not a public deletion rule.

**Proof obligations:** The migration proof MUST include a complete old-contract disposition audit, runtime
export absence tests, declaration negative tests, pre-side-effect authoring rejection, active-document and
example scans, and production-owner replacement proofs. `REV-MIG-003` remains the cross-cutting proof
boundary; this clause adds the deletion-specific absence evidence and does not authorize a second runtime,
actor, Story, operation, or selector implementation.
