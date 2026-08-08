# Implementation scratchpad

Status: non-normative working log

Use this file to capture newly discovered blockers, implementation notes, and proposed
decisions while executing the phase manifests. An entry here does not change a contract or
authorize implementation that conflicts with one.

## Entry rules

- Use `SP-B###` for blockers, `SP-N###` for notes, and `SP-D###` for proposed decisions.
- Give every entry an unchecked task marker, discovery date, owning phase, evidence, affected
  contract or proof IDs, and the next action.
- Mark an entry `[x]` only after recording its outcome. A blocker is resolved only when its
  contract, proof matrix, and affected phase manifest have been updated together.
- If an entry exposes an incorrect contract, stop the affected implementation slice. Promote
  the decision into the normative files before adapting product code.
- Phase receipts must list every scratchpad entry opened, resolved, promoted, rejected, or
  carried forward during that phase.

## New blockers

No entries.

## Implementation notes

No entries.

## Proposed decisions

No entries.

## Entry template

```md
- [ ] `SP-B001` — Short description
  - Discovered: YYYY-MM-DD
  - Owning phase: Phase N
  - Evidence: file, test, command, or observable behavior
  - Affected contracts/proofs: `SEM-000`, `PROOF-000`
  - Next action: concrete investigation or contract change
  - Outcome: pending
```
