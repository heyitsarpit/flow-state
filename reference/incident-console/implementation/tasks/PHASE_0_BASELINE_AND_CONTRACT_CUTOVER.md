# Phase 0 — Baseline and contract cutover

Status: ready

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

- [ ] Record the current `packages/flow-state/package.json` export map and every value/type
      exported by root, React, testing, server, inspect, and CLI.
- [ ] Record the current package, packed-consumer, React 18/19, example, browser, and workspace
      command baseline without claiming green checks prove the new contracts.
- [ ] Verify the `I1`–`I18` ownership table in `tasks/README.md` against live files and map every
      `CUT-*` removal to an exact deletion phase.
- [ ] Map every `PROOF-*` row to an existing test, a required replacement, or a missing proof.
- [ ] Identify source-text and filename architecture tests that cannot serve as behavioral
      evidence.
- [ ] Record pre-existing worktree changes in every later phase scope.
- [ ] Confirm no old root contract or phase file is referenced by this implementation pack.

## Acceptance

- Every live export has one keep/change/delete disposition.
- Every blocker resolution is represented by at least one contract ID and proof row.
- Every confirmed live issue has exactly one owning phase.
- Baseline commands and exits are recorded truthfully.
- No production or example file changed.
- `PHASE_0.md` receipt exists and promotes Phase 1 only.

## Gates

Run the live package test, package build, packed-consumer check, TypeScript-mode proof,
example tests/builds that currently exist, browser suite if its prerequisites are
available, and the workspace verification command. A pre-existing failure is recorded;
it is not hidden or repaired in this phase.
