# Phase 0 mechanical baseline

Status: reviewed Phase 0 contract fixture

This directory contains the machine-readable inventories frozen before vNext product work. It is
documentation and contract-test input only; nothing here is imported by the package, examples, or
browser application.

- `export-inventory.json` records every live package-route and CLI-module export at the baseline
  commit. `export-dispositions.json` gives every name one `keep`, `change`, or `delete` outcome.
- `proof-index.json` splits the central and local proof obligations into stable receipt cases with
  one closing phase, current evidence disposition, and target proof owner.
- `issue-deletion-index.json` fixes one owner for every confirmed issue and every deletion row.
- `authority-citations.json` separates governing implementation-pack files from historical evidence.
- `architecture-evidence.json` names source-text and filename tests that cannot close behavior.
- `contract-fixtures.ts` freezes the private v2 boot, behavior, trace, Cause, CLI-result, and
  diagnostic Schemas. `goldens/` fixes their minimal canonical newline-terminated bytes.
- `validate.ts` checks these files as one closed Phase 0 contract.

The live command results and worktree baseline belong in `../receipts/PHASE_0.md`, because exit
status and pre-existing state are evidence from one checkout rather than durable contract data.
