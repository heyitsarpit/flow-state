# Self-contained audit, 2026-11-14

**Bottom line:** `src/`, `fixtures/` and `bench/` are almost clean. The suite (`conformance/`) breaks the rule in
seven ways, by root cause. Root cause B is a design conflict with the Epic, for the user to decide. The rest are
fixes the orchestrator can rule on. Status: proposed. Read by the orchestrator; findings were spot-checked against
the code at 5f39dd9d.

Method: five read-only Haiku agents at effort high, one angle each (outside reads, boundary imports, temporary
strings, temporary concepts, and a blind "what breaks if everything outside the package is deleted"). The
orchestrator verified each group against the code. The log is at the end.

## A. The suite reads the wiki and the repo at run time

The worst finding: the parsers anchor on prose, so if a proposal is reworded the gates keep running on wrong text.

- `conformance/parts/records.ts`:
  - line 18: `plan-task-coverage-2026-11-11.md`;
  - lines 42 and 112: `replan-2026-11-11.md`;
  - lines 74 and 95: `wiki/tasks/V3/*.task`;
  - line 168: `wiki/specs/core/*.spec`.
- `records.ts:122` and `:145`: `indexOf("| Slice …")` and `indexOf("| Codes ")` return -1 when the wording changes, and
  `slice(-1, …)` then gives wrong text silently.
- `conformance/parts/pairs.test.ts:15`: reads `t47-non-interacting-2026-11-12.md`.
- `conformance/runner/specs.ts:22` and `:54`: `wk show --root <repo>` for the Spec Invariants and Task statuses
  (`runner/args.ts:34` sets `REPOSITORY`).
- `conformance/runner/gates.ts:120`: `git rev-parse` outside the package. When git exits 128, the revision is
  recorded as empty and nothing reports it.
- `conformance/runner/falsify.ts:60` and `:92`: mutant copies symlink the repo-root `node_modules`.

Fix (user Q2, 2026-11-14): recreate the data as typed code in the package; drop the prose parsers and `wk` calls.
The gates file takes its revision as a runner argument, or records it as missing, visibly.

## B. The suite tracks the work plan (decision for the user)

Owner fields, slices and owed rows name Tasks:

- the `owed(...)` rows, 230 of them, in `parts/feature-rows.ts`;
- `owner: "@task.V3.Tn"` in `not-yet.ts`, the three `remainders.ts` files, `compile/construction.cases.ts:429-474`,
  `static-cli/cli.cases.ts:376-418`, `runner/parts-gates.ts:145-159` and `parts/pair-owners.ts`;
- `SLICE_OF` and `currentSlice` (`parts/codes.ts`, `runner/parts-gates.ts:20,104`);
- `coverage-standings.txt`, with 151 Task ids.

This conflicts with the Epic's rule "routed gaps are owed checks" (instructions, Testing), which asks for an owed row
with an owner.

## C. Comments and strings cite records

About 390 lines in 111 files, plus 427 in two generated tables:

- dated file names and log timestamps (for example `parts/frozen.ts:114`, `dsl/lifecycle-rules.ts:68,287,413`);
- Task ids in prose (`not-yet.ts`, `runner/modes.ts`, `suite.ts:167-183`);
- "advisor Q…" in 16 files;
- ruling ids (CQ…), design ids (B4) and review codes (F2, H1, L4, M3);
- the commit `a21e9086` (`parts/frozen.ts:4`).

In `src/` there are 4: `src/core/cells.ts:175` and `src/host/lane-shapes.test.ts:16,111`. Fix: delete them, or
cite the Spec rule.

## D. Real suite parts carry process names

- `prototype` and `round-14`: about 430 uses. T53 deletes these with round-14, so rename only what survives.
- `liar` and `lie`: 82 uses.
- The rest, each under 40 uses: `pilot`, `replan`, `slice`, `lab` (Lab/…), `carried`, `frozen`, `uncitedNew` and
  `NEW-01`, the `P1All` family (`p1*Fixture`), `r15*` and `round13`/`round15b`, `OldRetry`, `OldCancel` and
  `OldRetryable` (`fixtures/stamp.ts`), `limits` (round-14's known failures), `f1.test.ts`, and the catalogue
  codes `S10`, `S16` and `S21` in fixtures' comments.

Kept as the suite's own terms, defined in its README: mutant, falsify, oracle, verdict, gate, held-out, part.

## E. Imports past the seam

- `conformance/adapters/production-static.ts:12` imports `src/contract.ts` (`Ending`).
- `conformance/machines/pay.ts:3` imports `src/machine.ts` (`MachineBody`).

Fix: export these through `src/index.ts`, or the listed seam, or drop them.

## F. The package declares no dependencies

`packages/flow-state-v3/package.json` lists none: `effect` and `vite-plus/test` resolve through the repo root. A
workspace sharing the root `tsconfig.base.json` and `vite.config.ts` is normal, so only the undeclared dependencies
are a finding.

## G. The suite README is stale

`conformance/README.md:8,27,34-35,66,396-404` cites `workflow show` and `workflow/…` paths.

## Sidecar log

- Outside reads: accepted.
- Boundary imports: accepted.
- Temporary strings: accepted. Spec citations are allowed and not counted. "T1" in two cases files is a Conformance
  test id, not a Task id; the orchestrator rechecks it in the fix.
- Temporary concepts: accepted with changes. "prototype" is a real adapter; mutant, gate and held-out are suite terms.
- Blind read: accepted, except item 1 and item 30 (the shared root `node_modules`, the base tsconfig and the root
  vite config are a workspace norm), which are changed to F (undeclared dependencies only).
