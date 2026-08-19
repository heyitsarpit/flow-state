# Compatibility and deletion contract

Status: normative target overlay; not shipped runtime behavior

Implementation status: target only. This vNext contract describes the intended replacement, not shipped
package source, public API, or runtime behavior. It MUST NOT be cited as evidence that vNext is implemented
or promoted. It remains a target until the coordinated migration and proof gate required by `REV-MIG-002`,
`REV-MIG-003`, and `REV-MIG-004` passes, including all accepted closure amendments under the normative
revision specification.

This contract applies the accepted revision specification to the former compatibility and deletion
surface. `REV-MIG-001` keeps accepted public decisions closed while behavioral gaps are resolved;
`REV-MIG-002` requires contracts, public types, artifacts, and proofs to move as one replacement;
`REV-MIG-003` requires proofs through the production owners; and `REV-MIG-004` owns the exhaustive
old-surface disposition. An accepted rule in the revision specification overrides a conflicting clause here.
An untouched clause remains authoritative.

All inherited entries in [`../revision-spec/UNRESOLVED_BEHAVIOR.md`](../revision-spec/UNRESOLVED_BEHAVIOR.md)
are now closed by accepted revisions. Migration is still not mechanically complete until the named
implementation proofs pass. A future proof failure may reopen only its disproved guarantee; it is never
permission to add a public API, default, exception, alias, or proof requirement that the revision
specification did not accept.

Active clauses in this file point to the current `REV-*`, `BEH-*`, `DEL-*`, and `RET-*` owners in the
normative revision specification. Legacy contract IDs are retained only in the historical/deletion mappings
below; they do not own active semantics.

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
related conflicts follow `REV-OPS-015`; exact state projections and invalidation/clear behavior follow
`REV-OPS-017` and `REV-OPS-018`.

### CUT-006 — Public actor commands remain synchronous

The retained public mailbox boundary is `actor.send(event): void`. Story commands may use a package-private
acknowledgment over that same production mailbox, but the acknowledgment MUST NOT become a public Promise-
returning send overload or a second actor engine.

### CUT-007 — Stories use the accepted constructors and evidence

The accepted Story surface is `story.app(runtimeFactory, options?)`, `story.machine(machine, options?)`, and
`story.actor(machine, options?)`, with the closed option objects and target rules in `REV-TEST-001` through
`REV-TEST-005`. The accepted command and evidence boundary is `simulate`, `process`, `advance`,
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

The accepted revision specification is the sole owner of the exhaustive deletion and retention ledgers.
Use [`accepted/07-deletions-and-cutover.md`](../revision-spec/accepted/07-deletions-and-cutover.md) for
`DEL-*` and `RET-*` dispositions, historical surface mappings, and the associated no-residue proofs.
This compatibility contract owns only the `CUT-*` compatibility rules and the compatibility-specific
cutover proofs below; it does not repeat or redefine the accepted ledger.

## Accepted ledger reference

The retained boundaries and no-residue requirements are owned by `REV-MIG-004` in the accepted revision
specification. See [`accepted/07-deletions-and-cutover.md`](../revision-spec/accepted/07-deletions-and-cutover.md)
for the authoritative `RET-*` ledger and the exhaustive deletion proof obligations. The `CUT-P*` proofs
below cover compatibility behavior at this boundary and do not redefine those requirements.

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
`REV-MIG-005`/`WIRE-020B` and `REV-MIG-006`. Implementation receipts still need to carry the named proof
obligations, but no inherited `BEH-*` entry remains an open compatibility blocker.
