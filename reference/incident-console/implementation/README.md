# Flow State vNext implementation contract

Status: normative implementation authority

This folder is the complete contract and execution pack for the Flow State redesign
described by the Incident Console work. An implementation agent must use this folder,
the live source and tests under `packages/flow-state`, and the live examples. It must not
consult or preserve old root-level contracts, roadmaps, phase manifests, or historical
reference applications as design authority.

## Inputs and authority

The normative contracts and phase plan were derived from exactly three sources:

1. the live code, tests, package exports, packed-consumer proofs, and examples;
2. `../DESIGN_DECISIONS.md`, which records the agreed product direction;
3. `../IMPLEMENTATION_BLOCKERS.md`, which records defects and the resolved design questions
   found by the package-wide audit.

Authority inside this folder is ordered as follows:

1. files under `contracts/` define required public and runtime behavior;
2. the active file under `tasks/` defines the current implementation slice;
3. receipts prove what an implementation phase actually changed and verified.

`DESIGN_DECISIONS.md` remains rationale. `IMPLEMENTATION_BLOCKERS.md` remains the audit
source. Neither overrides a contract in this folder. Live code that conflicts with a
contract is migration work, not a reason to reinterpret the contract.

This implementation folder is the sole normative authority from Phase 0 onward. Citations to
root contracts, old phases, `DESIGN_DECISIONS.md`, or `IMPLEMENTATION_BLOCKERS.md` are historical
evidence only and never create a prerequisite to follow their superseded API or task language.

Phase 0 is ready. Phase 1 starts only after the Phase 0 receipt proves the live export, proof,
issue, and deletion-owner inventory. There are no open scratch decisions; authority cleanup and
host-recipe proof remain explicit Phase 8 execution obligations.

## Contract map

- [Implementation scratchpad](./SCRATCHPAD.md)
- [Glossary and identity](./contracts/GLOSSARY_AND_IDENTITY.md)
- [Public API](./contracts/PUBLIC_API.md)
- [Type system](./contracts/TYPE_SYSTEM.md)
- [Runtime semantics](./contracts/SEMANTICS.md)
- [Actor and primitive snapshots](./contracts/SNAPSHOTS.md)
- [Architecture](./contracts/ARCHITECTURE.md)
- [Persistence and artifacts](./contracts/PERSISTENCE_AND_ARTIFACTS.md)
- [React and hosts](./contracts/REACT_AND_HOSTS.md)
- [Testing](./contracts/TESTING.md)
- [Command-line interface](./contracts/CLI.md)
- [Compatibility and deletion](./contracts/COMPATIBILITY_AND_DELETIONS.md)
- [Proof matrix](./contracts/PROOF_MATRIX.md)

Research and target examples that explain the contracts without overriding them:

- [Pre-coding audit and resolved decisions](./PRE_CODING_AUDIT.md)
- [Required one-line tests](./REQUIRED_TESTS.md)
- [User workflow coverage](./USER_WORKFLOW_COVERAGE.md)
- [Quick target examples](./QUICK_EXAMPLES.md)

## Contract language

Every normative rule has a stable prefix:

- `GLO-*` definitions and identity;
- `API-*` public calls and exports;
- `TYPE-*` inference and declaration behavior;
- `SEM-*` runtime semantics;
- `SNAP-*` actor and primitive read semantics;
- `ARCH-*` ownership and dependency direction;
- `WIRE-*` persistence and artifacts;
- `HOST-*` React, server, and host behavior;
- `TEST-*` stories, fixtures, controls, and models;
- `CLI-*` command grammar, gateway, artifacts, process I/O, and exit behavior;
- `CUT-*` compatibility, removal, and migration;
- `PROOF-*` executable evidence.

`MUST` and `MUST NOT` are release requirements. `SHOULD` permits deviation only when a
phase receipt identifies the rule, explains the reason, and updates the contract before
product code depends on the deviation. Examples illustrate a rule; they do not create an
unnamed overload or exception.

Phase manifests reference contract IDs instead of restating their semantics. If two
contracts appear to conflict, implementation stops and the contracts are reconciled
before code changes continue.

## Execution model

Only one phase is active at a time. An implementation agent:

1. reads this manifest, the active phase, and only the contracts named by that phase;
2. inspects the live implementation and tests in the allowed scope;
3. adds or updates executable proofs before claiming the semantic slice complete;
4. implements the smallest coherent owner that satisfies the referenced rules;
5. deletes a replaced private owner in its owning phase, while legacy public owners recorded for
   the atomic cutover are deleted together in Phase 7;
6. runs every focused and broad gate named by the phase;
7. writes the required receipt with exact commands, exits, evidence, deletions, and
   remaining failures;
8. advances the next phase only when every exit criterion is true.

Before and after each phase, the agent MUST review `SCRATCHPAD.md`. New findings are recorded
there immediately, but a scratchpad entry changes implementation semantics only after the
affected normative contracts, proof rows, and phase tasks are updated.

Passing source-text checks, snapshots of filenames, or typechecking alone never proves a
runtime rule. A green broad suite does not excuse a missing hostile race, interruption,
identity, cleanup, or artifact proof named by the phase.

## Phase map

| Phase | Scope                                                                   | Depends on |
| ----- | ----------------------------------------------------------------------- | ---------- |
| 0     | Baseline, contract indexing, and cutover inventory                      | none       |
| 1     | Definitions, exact types, refs, and pure `AppPlan`                      | 0          |
| 2     | Runtime shell, boot codec, actor mailbox, atomic snapshots, turn hub    | 1          |
| 3     | Resource kernel, freshness, lookup generations, leases, and GC          | 2          |
| 4     | Transactions, activities, children, and closed runtime dehydration      | 3          |
| 5     | Views, MachineObserver, React, SSR, and request hosts                   | 4          |
| 6     | Stories, fixtures, controls, checkpoints, model discovery               | 5          |
| 7     | Persistence, artifacts, inspection, behavior, and CLI                   | 6          |
| 8     | Example consolidation, residual deletion, packed proof, and final gates | 7          |

The phase manifests are indexed in [tasks/README.md](./tasks/README.md).

## Global stop conditions

Implementation stops rather than guessing when:

- a public call requires an overload absent from `PUBLIC_API.md`;
- a type proof requires erasing `A`, `E`, `R`, input, memory, event, ref, or selected value;
- two owners can publish the same canonical fact;
- code needs a process-global registry, React-owned runtime work, model-time Effect
  execution, mutable hydration, or direct primitive-state mutation;
- an old generation can remove or publish over a newer generation;
- a cleanup failure would be swallowed or would prevent later finalizers from running;
- a phase cannot delete the owner it claims to replace;
- a required proof can pass only through wall-clock timing, source-text matching, or an
  implementation-specific private hook.

Changing a contract is allowed, but it is a design action: update the contract, blocker
resolution, proof matrix, and affected phase before adapting implementation code.
