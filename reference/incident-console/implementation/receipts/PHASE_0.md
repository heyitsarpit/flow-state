# Phase 0 receipt — baseline and contract cutover

Status: complete; Phase 1 promoted to Ready

## Baseline and scope

Phase 0 started from commit `f3619a5494d365a5d1d0d37cf5ae101a22987878` on `main`.
Before the first edit, `git status --short --untracked-files=all`, `git diff --name-status`, and
`git diff --cached --name-status` all exited 0 with no output. There were therefore no
pre-existing tracked or untracked changes in any later-phase scope.

No product runtime, public type, package export, example, test, or build configuration changed.
The final name-status audit contains only this implementation pack. No product semantic owner was
added, replaced, or deleted; the legacy public implementation remains frozen until Phase 7.

## Mechanical inventories and proof cutover

The reviewed Phase 0 artifacts live in [`../phase-0/`](../phase-0/README.md):

- `export-inventory.json` records the six package routes, the binary, 344 package-route exports,
  and 96 package-private CLI-module exports. `export-dispositions.json` gives every one exactly
  one disposition: 87 change and 353 delete rows, with new target names recorded separately.
- `proof-index.json` replaces broad receipt claims with 57 stable central cases and 46 local
  subcases. Every case has one closing phase, contract owner, current evidence disposition, and
  target test; only `PROOF-014.01` and `PROOF-014.02` close in Phase 0.
- `issue-deletion-index.json` records all 20 atomic issue identities, all 24 B1-B12/Q1-Q12
  resolutions, and 22 item-level deletion boundaries. It corrects stale live evidence for I1,
  I14-I18, preserves dotted I5/I10 ownership, and adds `PROOF-010` to I11 cleanup truth.
- `architecture-evidence.json` classifies 19 source-text, filename, line-budget, or documentation
  tests as repository-layout evidence that cannot close behavior.
- `authority-citations.json` confirms that no old root task, contract, phase,
  `DESIGN_DECISIONS.md`, or `IMPLEMENTATION_BLOCKERS.md` is governing authority. It separately
  inventories 14 design-decision and 22 blocker-ledger historical citations for Phase 8.
- `contract-fixtures.ts` freezes closed Effect Schemas for boot, behavior, trace, TurnRecord
  facts, Cause projection, every command result, and all 42 diagnostic codes. The 71 compact
  `.golden` files cover minimal boot/behavior/complete trace/truncated trace, empty Cause reasons,
  each Effect v4 reason member, ordered mixed reasons, duplicate reasons,
  every command success and comparison variant, and one error envelope per diagnostic code.

`validate.ts` rejects missing or duplicate exports, issues, deletion rows, proof families, local
proofs, open result members, noncanonical bytes, excess Schema properties, and incomplete
diagnostic goldens. Its final result was:

```text
Phase 0 contract validated: 344 package exports, 96 CLI module exports, 57 proof cases, 46 local cases, 71 byte goldens.
```

## Authority corrections

The documentation-only corrections made the pack internally executable without changing target
behavior:

- Phases 1-6 now delete duplicate owners only from the package-private vNext tree; every installed
  public route, declaration, legacy engine, facade, and CLI helper remains frozen until the atomic
  Phase 7 cutover. Phase 8 owns residual repository and authority cleanup.
- `WIRE-020A` now points slot identity to `GLO-09`; `CLI-007` now names closed command/data/error
  projections and makes the reviewed Phase 0 Schemas normative instead of retaining `unknown` or
  arbitrary strings.
- The Q5/Q6, cleanup-inventory, and required-test historical line ranges were corrected.

The changed authority files are `contracts/CLI.md`, `COMPATIBILITY_AND_DELETIONS.md`,
`PERSISTENCE_AND_ARTIFACTS.md`, `PROOF_MATRIX.md`, `REACT_AND_HOSTS.md`, `tasks/README.md`, and
the Phase 1, 2, 3, 5, and 6 manifests. Phase 0 added only `phase-0/**` and this receipt. Deleted
files and public symbols: none.

## Command baseline and exits

| Layer                    | Exact command                                                                                                                                                                                                                                                                                                                                                     | Exit and evidence                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Phase 0 fixtures         | `node --import ./node_modules/.pnpm/tsx@4.22.4/node_modules/tsx/dist/loader.mjs reference/incident-console/implementation/phase-0/validate.ts`                                                                                                                                                                                                                    | 0; 344 package exports, 96 CLI exports, 57 central cases, 46 local cases, 71 goldens                                    |
| Fixture types            | `node node_modules/.pnpm/typescript@6.0.3/node_modules/typescript/lib/tsc.js --ignoreConfig --noEmit --module NodeNext --moduleResolution NodeNext --target ES2022 --allowImportingTsExtensions --skipLibCheck --types node reference/incident-console/implementation/phase-0/contract-fixtures.ts reference/incident-console/implementation/phase-0/validate.ts` | 0                                                                                                                       |
| Package tests            | `pnpm --filter flow-state test`                                                                                                                                                                                                                                                                                                                                   | 0; 113 files, 1,019 tests                                                                                               |
| Package build            | `pnpm --filter flow-state build`                                                                                                                                                                                                                                                                                                                                  | 0                                                                                                                       |
| Packed consumers         | `pnpm --filter flow-state check:packed-consumers`                                                                                                                                                                                                                                                                                                                 | 0; fresh tarball, root/testing/server/inspect/CLI plus React 18/19 consumers                                            |
| TypeScript modes         | `pnpm --filter flow-state check:typescript-mode-proofs`                                                                                                                                                                                                                                                                                                           | 0; strict, isolated modules, isolated declarations, multi-entry, React 18, React 19                                     |
| Basic example            | `pnpm --filter @flow-state/basic-cached-posts test` / `build`                                                                                                                                                                                                                                                                                                     | 0 / 0; 2 files, 6 tests                                                                                                 |
| Optimistic example       | `pnpm --filter @flow-state/optimistic-transactions test` / `build`                                                                                                                                                                                                                                                                                                | 0 / 0; 2 files, 8 tests                                                                                                 |
| Bounded-feed example     | `pnpm --filter @flow-state/bounded-infinite-feed test` / `build`                                                                                                                                                                                                                                                                                                  | 0 / 0; 2 files, 6 tests                                                                                                 |
| Server-hydration example | `pnpm --filter @flow-state/server-prefetch-hydration test` / `build`                                                                                                                                                                                                                                                                                              | 0 / 0; 2 files, 6 tests; behavior diff passed                                                                           |
| Offline example          | `pnpm --filter @flow-state/offline-recovery test` / `build`                                                                                                                                                                                                                                                                                                       | 0 / 0; 4 files, 12 tests; CLI evidence passed                                                                           |
| Incident Console example | `pnpm --filter @flow-state/incident-console test` / `build`                                                                                                                                                                                                                                                                                                       | 0 / 0; 5 files, 29 tests                                                                                                |
| Browser                  | `pnpm test:browser`                                                                                                                                                                                                                                                                                                                                               | 0; 9 passed, 1 declared skip                                                                                            |
| Workspace                | `pnpm verify`                                                                                                                                                                                                                                                                                                                                                     | 0; format/lint/types, 130 files and 1,086 tests, library, packed/types, all examples, CLI acceptance, browser, and docs |

The first sandboxed Incident Console build exited 1 because Turbopack was denied permission to
create a helper process that binds a local port. The identical command exited 0 with that sandbox
restriction removed. The first workspace verify exited 1 at formatting because `.json` goldens
were intentionally compact; moving the unchanged canonical bytes to `.golden`, formatting ordinary
sources, and rerunning produced the final exit 0 above.

## Closeout

The scratchpad still has no open items. All Phase 0 tasks, acceptance conditions, and live gates
pass, and the final diff contains no production or example path. Phase 1 is Ready; no Phase 1
implementation has begun.

## Post-closeout contract correction

The pre-Phase-2 Effect v4 audit replaced the impossible recursive Cause artifact model with the
installed v4 flat ordered-reasons model, preserving duplicate reasons. It also added one central
request-helper case and one local runtime-bridge type case. The Phase 0 validator was rerun after
the schema, seven Cause goldens, embedded CLI goldens, proof index, and authority citations were
updated; its current result is the 57/46/71 count recorded above. This addendum changes contract
evidence only and does not imply that the later Phase 1 review corrections are complete.
