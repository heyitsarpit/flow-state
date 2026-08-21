# Implementation workflow contract

Status: normative implementation contract for the greenfield replacement

The runtime, API, persistence, CLI, host, Story, deletion, and proof semantics live in the sibling
contract files. This file defines how those contracts are implemented, reviewed, tested, and promoted.
It is not a second runtime or API specification.

## Authority and source boundaries

The sibling contract pack is the semantic authority. Archived revisions, proposals, audits, research,
the frozen package, and historical examples are provenance or migration evidence only. They MUST NOT
add API names, defaults, compatibility behavior, proof requirements, or implementation semantics.

The replacement is built in `packages/flow-state-rewrite/`. The existing `packages/flow-state/` tree,
its tests, examples, entrypoints, and implementation records remain frozen reference material until the
late cutover. New code MUST NOT incrementally upgrade the frozen package, import it as a hidden
compatibility layer, or preserve deleted behavior through aliases, overloads, adapters, parser branches,
or deprecated wrappers.

Every implementation slice MUST identify its contract owner, production owner, allowed source boundary,
acceptance behavior, and decisive proof before code is written. Copied legacy code is acceptable only
after its current contract owner, types, failure lanes, cleanup, and tests have been checked.

## Dependency order

Implementation work MUST preserve these dependency edges. The future Beads graph may split a row into
smaller issues, but it MUST NOT combine unrelated semantic owners or reverse an edge.

| Phase | Contract owners | Greenfield boundary | Central proof owners | Depends on |
| --- | --- | --- | --- | --- |
| Static foundation | `GLOSSARY_AND_IDENTITY.md`, `PUBLIC_API.md` API-001–010, `TYPE_SYSTEM.md` TYPE-001–009 | Branded identities, schemas, errors, definitions, operation descriptor types, pure App/module compilation | `PROOF-001`, `PROOF-002`, `TYPE-P01`–`TYPE-P04` | None |
| Runtime ownership | `ARCHITECTURE.md` ARCH-007–020, `SEMANTICS.md` admission/mailbox/lifecycle clauses, `REACT_AND_HOSTS.md` HOST-001–006, `TYPE_SYSTEM.md` TYPE-010–015 | `RuntimeSetup`, `Runtime.ready()`, closed AppPlan, actor admission, leases, mailbox, context graph, scheduling, cleanup | `PROOF-003`, `PROOF-004`, `PROOF-015`, `HOST-P01`–`HOST-P05` | Static foundation |
| Operation kernels | `TYPE_SYSTEM.md` operation inference, `SEMANTICS.md` SEM-011–021 and SEM-029–030, `SNAPSHOTS.md` operation projections | Canonical `K`, resource store, generations, resource/transaction/stream kernels, overlays, cancellation, invalidation, fanout, fencing | `PROOF-005`–`PROOF-007`, `SNAP-P01` | Runtime ownership |
| Persistence and evidence | `PERSISTENCE_AND_ARTIFACTS.md` WIRE-000–023, `SNAPSHOTS.md` capture/hydration, diagnostic clauses | Persistence provider, declaration-owned restoration, private v2 codecs/models, exact trace facts, bounded sinks, artifacts | `PROOF-009`, `PROOF-010`, `PROOF-014`, `CLI-P01` | Runtime ownership and operation kernels |
| Hosts, Stories, and CLI | `TESTING.md` REV-TEST-001–010, `REACT_AND_HOSTS.md`, `CLI.md`, `PUBLIC_API.md` API-011–017 | React attachment, Story builders and `.run()`, Fixtures/Implementations/seeds, gateway, shared CLI executor | `PROOF-008`, `PROOF-010`, `PROOF-012`, `PROOF-014`, `CLI-P01` | Runtime ownership, operation kernels, and required persistence/evidence |
| Cutover and absence | `COMPATIBILITY_AND_DELETIONS.md`, `PROOF_MATRIX.md` PROOF-016–017 | Public entrypoints, examples, packed consumers, browser behavior, deleted-surface absence, final package cutover | `PROOF-016`, `PROOF-017`, `CLI-P02`, `CUT-P01`–`CUT-P06` | All prior phases |

## Issue readiness

A future Beads issue is implementation-ready only when its description contains:

1. exact contract IDs and any trace-only revision IDs;
2. one production source owner under `packages/flow-state-rewrite/` and an explicit allowed-file boundary;
3. the public or internal output it adds, including `A`, `E`, and `R` at Effect boundaries;
4. acceptance behavior for the applicable success, typed failure, defect, interruption, ownership,
   cleanup, and ordering lanes;
5. central `PROOF-*` or local `*-P*` IDs, the exact proof owner to add, and the focused command;
6. dependencies, explicit non-goals, and any deleted-surface absence proof; and
7. the reviewer handback fields and decisive-test budget below.

An issue MUST NOT cite a proposal, retired phase receipt, frozen implementation, or historical audit as
semantic authority. A source scan, focused typecheck, or lint result MUST NOT close a behavior proof that
the named contract requires through a production owner.

The contract pack intentionally uses inferred shapes where a public helper type would add a second
authority. Implementers MUST preserve the named operations, inference boundaries, and behavior already
specified there and MUST NOT invent a public alias, carrier field, target constructor, inspection route,
or error member to fill a schematic or inferred section. If implementation cannot proceed without such a
choice, the issue is blocked until the owning contract is amended; the choice MUST NOT be hidden in code,
tests, or a retired document.

## Single-owner rewrite guardrails

- Live hosts, Stories, tests, SSR, and the CLI MUST use one production runtime implementation and one
  runtime-assembly boundary. A Story or test MUST NOT create a second transition engine, actor engine,
  mailbox, scheduler, store, operation kernel, snapshot model, cleanup system, or evidence model.
- `AppPlan` is the closed-world admission boundary. Running code MUST NOT dynamically register machines,
  descriptors, providers, or operation families, and descriptor or actor resolution MUST NOT use a
  process-global registry.
- Runtime, actor, operation, persistence, artifact, and evidence ownership MUST remain in the production
  owners named by the contracts. React, Story builders, CLI handlers, fixtures, and models are adapters or
  inputs; they MUST NOT reproduce those state or lifetime systems.
- Pure model discovery MUST remain pure and MUST NOT construct a Runtime, run Effects, replay events, or
  use a runtime-backed harness.
- Synchronous snapshot reads MUST remain synchronous and MUST NOT interpret Effects or create a second
  read-time runtime.
- Story external behavior MUST be supplied through complete typed Implementations and Fixtures. Story
  commands MUST NOT intercept pending occurrences, inject results, or introduce a `simulate` or control
  registry surface.
- Artifact and CLI paths MUST consume the one package-private v2 evidence model and codec owner. They
  MUST NOT fabricate machines, preserve deleted fields, or create parallel result and diagnostic families.
- Configuration, app identity, provider graphs, clocks, seeds, fixtures, and persistence inputs MUST be
  fixed before Runtime construction; post-materialization mutation is forbidden.

## Reviewer gate

The reviewer is an active quality gate. For every slice, the reviewer MUST:

1. read the diff, named contract clauses, trace-only provenance, and proof obligations;
2. run the focused checks and `nub run lint`, fixing every lint, formatting, and unambiguous mechanical
   defect in the changed slice without weakening the gate;
3. review behavior through the production owner, including applicable success, typed failure, defect,
   interruption, ownership, cleanup, ordering, and boundary behavior;
4. check for duplicate authorities, hidden compatibility paths, casts, uncontrolled async work, partial
   updates, bespoke Effect clones, and tests that prove only implementation details; and
5. return substantive semantic findings to the implementer with exact files, contract IDs, behavior, and
   acceptance conditions.

The reviewer owns lint, formatting, and obvious mechanical fixes. The implementer owns substantive
semantic changes. A slice cannot advance with an unresolved lint issue or an unclassified contract or
proof gap.

The handback MUST record:

```text
Contract IDs:
Changed files:
Focused checks:
Lint: nub run lint — pass/fail
Behavior reviewed:
Fixed findings:
Blocking findings:
Remaining advisory findings:
```

## Test gate

Every new test MUST state:

1. the contract or proof ID;
2. the unique invariant or failure it protects;
3. the production owner through which it executes; and
4. why an existing test does not already prove it.

The default budget is one to three decisive tests per slice. Exceeding that budget requires distinct
contract lanes, race interleavings, public type cases, or required boundary vectors.

Tests MUST prioritize ownership, ordering, atomicity, cleanup, failure lanes, interruption, hostile
inputs, exact public typing, and deleted behavior. They MUST use the production runtime for runtime
proofs, `TestClock` or the Flow testing time boundary instead of sleeps, and bounded `Deferred`, `Queue`,
or `PubSub` controls for asynchronous work. Fixtures MUST remain minimal and immutable.

Source-text checks and typechecking do not replace runtime proofs for behavior, races, cleanup, or
artifacts. Tests MUST NOT replace the runtime, actor engine, store, scheduler, cleanup path, or evidence
owner when the contract requires production-path proof.

## Completion and cutover

A slice is ready for its dependent work only when the reviewer has no blocking findings, the required
focused checks pass, and its decisive proof is recorded against the named production owner. The greenfield
replacement is complete only after its public behavior, types, failure lanes, cleanup, persistence,
artifacts, CLI, React hosts, Stories, examples, packed consumers, browser behavior, and deletion proofs
pass through the final workspace gates.

A green focused test, typecheck, lint run, or source scan alone does not authorize package cutover.
