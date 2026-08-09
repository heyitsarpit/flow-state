# Phase 0 — Baseline and contract cutover

Status: complete

## Objective

Establish a truthful live baseline and make this implementation pack mechanically usable
without changing product behavior.

## Governing contracts

All contracts are read for this phase because it builds the proof index and migration
inventory. It does not implement their target behavior.

## Allowed scope

- package/export inventory scripts and contract-test indexes;
- test naming or metadata needed to associate proofs with contract IDs;
- the proof matrix and phase receipt;
- documentation inside this implementation folder.

Product runtime behavior, public types, examples, and exports are forbidden in Phase 0.

## Tasks

- [x] Record the current `packages/flow-state/package.json` export map and every value/type
      exported by root, React, testing, server, inspect, and CLI.
- [x] Record the current package, packed-consumer, React 18/19, example, browser, and workspace
      command baseline without claiming green checks prove the new contracts.
- [x] Verify the atomic issue ownership table in `tasks/README.md`, including dotted I5/I10
      sub-IDs, against live files and map every
      `CUT-*` removal to an exact deletion phase.
- [x] Split every broad `PROOF-*` row into stable atomic proof-case IDs, assign each case exactly
      one closing phase, and map it to an existing test, required replacement, or missing proof.
- [x] Crosswalk every local `API-P*`, `TYPE-P*`, `SNAP-P*`, `HOST-P*`, and `CUT-P*` obligation to
      its central `PROOF-*` owner and owning phase; no normative proof section may fall through the
      receipt index.
- [x] Identify source-text and filename architecture tests that cannot serve as behavioral
      evidence.
- [x] Record pre-existing worktree changes in every later phase scope.
- [x] Freeze the complete private boot, behavior, trace, Cause-projection, CLI-result, and
      diagnostic-code Schemas plus minimal canonical JSON byte goldens; these are reviewed contract
      fixtures, not product codec implementation.
- [x] Confirm no old root contract or phase file is referenced as governing authority. Inventory
      remaining historical evidence citations separately so Phase 8 can remove them without
      treating them as implementation prerequisites.

## Acceptance

- Every live export has one keep/change/delete disposition.
- Every blocker resolution is represented by at least one contract ID and proof row.
- Every confirmed live issue has exactly one owning phase.
- Every artifact/result member and diagnostic code has one reviewed Schema and byte golden rather
  than an open `unknown` or string bag.
- Baseline commands and exits are recorded truthfully.
- No production or example file changed.
- `PHASE_0.md` receipt exists and promotes Phase 1 only.

## Gates

Run the live package test, package build, packed-consumer check, TypeScript-mode proof,
example tests/builds that currently exist, browser suite if its prerequisites are
available, and the workspace verification command. A pre-existing failure is recorded;
it is not hidden or repaired in this phase.
