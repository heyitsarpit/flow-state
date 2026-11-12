# T47 close review (2026-11-12)

**Verdict: FAIL.** The core-mutant score of 98/98 is not real. Three kept regressions stopped failing after suite
edits, and no record says why. The model-mutation gate the Spec asks for (Conformance T39) does not exist. The
"Guards" acceptance item lacks its Fable read and a repeatable held-out run. The rest holds: parts, player, the
matrix and pair gates, the bench and the declarations work, and the steps 1-2 findings are fixed.

**Read first:** @task.V3.T47, code:workflow/plans/flow/references/proposals/t47-steps1-2-review-2026-11-12.md,
range `4eae37fc..0c46a414`. File:line references are at 0c46a414.

**How it was checked:** targeted runs only. These ran in scratch copies, all since deleted:

- `vitest run conformance/parts bench`: 83/83 green;
- two core mutants on a copy of the package;
- `regressions` on production and round-14 at 0c46a414, and on production at 4eae37fc and c27dd707;
- a load of the 7d11f03b package copy;
- one probe of `productionSurface`.

Two Haiku sidecars ran, one blind and one adversary. Their log is at the end.

## 1. Acceptance

| Item                                                                           | Result                                                                                                                                  |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Combination gate, dated owners (R18)                                           | pass: 74 pairs, 7 owned; see finding 9 on `current`                                                                                     |
| `part()` modules, JSON scripts, player, model expectations                     | pass                                                                                                                                    |
| Parts and runtimes declare codes                                               | pass                                                                                                                                    |
| Generator draws only declared operations                                       | pass (nit: `ensure` of a second actor is not gated by `ma`, `parts/generate.ts:248-266`)                                                |
| Matrix gate: owed by slice, unreached declared code fails, 265 rows with kinds | pass; static rows can never build (finding 9)                                                                                           |
| Pairs from the channel table, waivers, triples and cell pairs                  | pass                                                                                                                                    |
| Pilots: usual and stress, kill table-cell mutants, alone and in the mix        | partial: 36 of 315 cells noticed, no T39 gate (finding 3), stress is thin (finding 11)                                                  |
| Bench replays without oracles, fingerprint gated, cost recorded                | pass (finding 12)                                                                                                                       |
| Every failure kept as a regression or a limit                                  | **fail** (finding 2)                                                                                                                    |
| Declared, Enabled, Covered                                                     | pass                                                                                                                                    |
| Guards                                                                         | **fail** (finding 4)                                                                                                                    |
| Non-interacting list, one approval                                             | pass (the user, 2026-11-12)                                                                                                             |
| Compile static cases on every composite's `Compiled`                           | owed to T17 by ruling; the stated reason is wrong (Q22)                                                                                 |
| Phase-out step 3                                                               | pass: `referenceOf`, `productionSurface`, `classify` per fixture, the layout. The lint was not re-run.                                  |
| Phase-out checks                                                               | partial: derived reference equals hand rows (`parts/reference.test.ts:64-70`); static cases owed; the catch-matrix check was not re-run |

## 2. Findings, most severe first

1. **Core mutants: 98/98 is an artefact** (blocking). `gates.json` records it at 7d11f03b. A package copy at that
   revision cannot load:
   - `parts/features.ts:22` reads `workflow/...plan-task-coverage-2026-11-11.md` at import, which fails with
     ENOENT, reproduced;
   - `copyPackage` did not copy `fixtures/` until 0c46a414.

   When the whole run gives no verdict, `casesIn` falls back to one child per case. Each of those comes back as
   `Fail` with no oracle (`runner/falsify.ts:225-232`), and `runCoreMutants` counts any `red` or `time` row as a
   kill (`runner/mutate.ts:111-115`). The committed `core-mutants.tsv` (0c46a414) marks two former survivors
   `killed`, yet both pass 78/78 on the current tree, run by the falsify JSON path:
   - `src/core/disposal.ts:34` (`||` to `&&`);
   - `src/core/evidence-of.ts:84` (`===` to `!==`).

   The kill rule is unchanged from T51, and so is the denominator (98 candidates, `--limit 100`). Fix:
   - re-run at a revision whose copies load;
   - count only a named oracle red as a kill, as `judge()` does, never `red case` or `time`;
   - record the reason column.
2. **Kept regressions turned green with no record** (blocking: acceptance 9, the Phase's false pass "a case
   edited to pass", and the user's read of each changed expected result).
   - On production with `src/` unchanged, GEN-pay-search-20, 21 and seeded-173 fail at 4eae37fc (`disposal`
     Actors I29 or I32) and pass from c27dd707, step 3's suite fixes.
   - At 0c46a414, `regressions` on round-14 gives 4/8 "fail as saved": 20, 21 and 173 now pass there too, and 55
     was retired by T51. On production it gives 1/8.
   - No record names 20, 21 or 173. The I49/T32 signature check runs in no gate. The new
     `regressions production` gate checks only pass-or-owed (`runner/parts-gates.ts:128-166`), so it reads 6/6.

   Fix: say which step-3 edit flipped each one, cite its rule, re-save the signatures or record them as fixed
   bugs, and put the signature check in a gate.
3. **T39 is not built** (blocking, since T39 is T47's test).
   - No gate fails "a model field no mutation reaches" (Spec T39).
   - `parts/model-mutation.test.ts:28-35` compares `cellsOf` with itself.
   - `:38-43` asserts only `noticed.length > 0`.
   - The kill's Invariant is written by the mutant itself: the row's commonest refusal, falling back to
     WriteLanes I15 (`parts/model-mutation.ts:48-58`), so the `invariant` column checks nothing.
   - `cellMutants` runs in no `writeGates` entry.
4. **Guards are half done** (blocking: acceptance "Guards").
   - No record shows a Fable read of model expectations. The three Fable consults are about architecture.
   - Held-out seeds are never played by any test or gate: `parts/generate.test.ts:102-106` checks only that they
     are disjoint, and the step-3 comment records one manual run.
5. **Stale gate records.** `gates.json` labels the part gates and core mutants at 7d11f03b. Commit 0c46a414
   then changed their inputs: owners and text in `runner/parts-gates.ts`, lazy reads in `parts/records.ts`, and
   the static surface in `runner/args.ts:58-62`. The comment at `runner/args.ts:56-57` still says production has
   no static surface.
6. **Q22's reason is wrong for five of the 11 cases.** Every case calls `s1(...)`, whose `label` is `Computed`
   and `who` is `Input` (`compile/construction.cases.ts:44, 51`). So "all 11 fail on S1" is literally true.
   Production can build S1 without those two fields, so most of these cases could run there. On that source:
   - CMP-11's two expectations pass (`DuplicateMachine`);
   - CMP-03, 04, 05 and 10 fail on production's own missing checks: it builds TwoDefaults, ImpureDefault,
     UnknownNotUncertain and a `self` state, admits them, and has none of these codes in `src/`.

   T17's owed note names `Flow.input`, the computed initial and ImpureDefault, but not TwoDefaults (Compile I5),
   UnknownNotUncertain (I11) or ReservedStateName (I13). The owed check passes on any throw
   (`parts/static.test.ts:27-38`), so a partial T17 fix would not show. Fix:
   - name the three checks on T17;
   - check each owed case's failing expectation, not just a throw.
7. **GEN-pay-search-25: the records disagree, and the owner is probably wrong.** `limits.ts:26` says
   "production passes the same script", but production fails it at both ends of the range. It fails by
   delivered-once WriteLanes I15 and also by disposal Actors I29. `verdictOfLimit` matches by substring, so the
   extra failure goes unseen.
8. **Reach is over-credited.** It feeds the matrix and the app-mix pairs.
   - `gd` goes to every part that handles the denied event (`parts/play.ts:208-209`).
   - `sr` goes to every ensured persisted part (`:229-232`).
   - `reloaded` is never cleared at `Stepped`, so every later `Incarnated` reaches `rl` (`:254-260`).
   - Failing runs count too (`runner/parts-gates.ts:68-72`).
9. **`current: 0` and `static: {}` are hard-coded** (`parts/records.ts:211, 218`, `runner/parts-gates.ts:97`).
   Both are right today, at slice R with every static case owed. Later they break:
   - an owner of a past slice can never fail (`parts/pairs.ts:83-84`);
   - static rows can never build, so they fail when T17 or T21 closes.

   Derive both from the records before slice 1 closes.
10. **Production static cases run in no gate** (`runner/main.ts:102-103`; vitest only).
    `parts/gates.test.ts:16-27` checks the gate names by grepping the source.
11. **Stress is thinner than catalogue section 5.**
    - The usual profile has 28 moves and stress 40 (`parts/generate.ts:39`); the catalogue asks for 40-150 and
      100-300.
    - Stress draws only `Lost` answers, refusals, reloads and timers (`:141-201`). It has no LostButLanded,
      FailButLanded, Never, slow, reordered or late answers, though `un` and `lr` are declared.
    - The parts gate never reads `skipped` (`runner/parts-gates.ts:46-60`).

    Not blocking, since the slice tables supersede the catalogue. Owe the missing faults or widen the profile.
12. **Small items.**
    - The bench gate has no `turns > 0` guard (`bench/gate.ts:20-23`): an empty fingerprint on both sides passes.
    - Spec T36 still says "a waiver without a later slice" must fail, which is behind I57's new owner wording.
    - The world seed is fixed at 1 rather than derived from the script seed (`parts/play.ts:92`), and the doc at
      `:65` claims a second seed and a replay that the gate never runs.
    - The owed row for seed 109 (`parts/play.ts:44`) is checked only in `parts/play.test.ts:45-66`, never in the
      gate.
    - `parts/matrix.test.ts:64` asserts `>= 80` slice entries, against the replan's 123.

## 3. Rulings asked

- **Q22:** partly true. The ruling stands; record the five cases' real reasons on T17 (finding 6).
- **Core mutants:** not real. The denominator and the kill rule did not change; mutant copies that could not load
  were each counted as killed (finding 1).
- **Spec revisions (R18, I57, I58): sound.**
  - R18's source now names 5B, whose rule is part of the non-interacting list the user approved.
  - I57 catches up with R18's 2026-11-11 owner rule rather than weakening it. In code, though, "a slice not yet
    past" is nominal while `current` stays 0 (finding 9).
  - I58 only adds a report.
  - T36's text needs the same update.
- **GEN-pay-search-25:** the lead's reading is right in substance. Table A's Held row stays when the restore is
  owed and refuses with I15 when it is not (`dsl/lifecycle-rules.ts:126`). Production failing both I15 and the
  I29 restore obligation fits a report judged before the reload's move creates `AwaitRestore`: no runtime could
  pass that, and WriteLanes I15 itself allows `unknown { Restored }` once per incarnation after a reload. Not
  traced step by step. If the model is at fault, the fix is the suite's (T45/T47 side). Owing it to production's
  T54 sends it to the wrong Task, and `limits.ts:26` must be corrected.

## 4. Steps 1-2 review findings

| Finding                        | Fixed?                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| 1. 47 owners                   | yes (886c671b, 50 rows, checked against the replan's slices)                                     |
| 2. Built-but-owed on real data | yes: `matrixGate` runs over `FEATURES` with codes per row; static rows still stubbed (finding 9) |
| 3. Six vacuous checks          | yes, guards added; per the b98a7b58 comment, shown red                                           |
| 4. Q19                         | yes                                                                                              |
| 5. Q16, Q26, Q27 proxies       | Q16 now reads the real tables, but its test is still a tautology (finding 3); Q27 still greps    |
| 6. Combination-gate edges      | yes: slice rule, triples per composite                                                           |
| 7. Small items                 | yes: `ea`, `hs`, 99 frozen                                                                       |
| Missed: hand mapping           | yes (121/122 cases)                                                                              |

Re-checks were limited to the test run, not every planted mutant.

## 5. Missed requirements (found only by the blind sidecar)

- Spec T39's field gate (finding 3).
- Reach attributed to the part that ran (finding 8).
- Profile breadth (finding 11).
- The world seed derived from the script seed (finding 12).

## 6. Sidecar log

Blind sidecar (Haiku, effort high):

| #      | Item                                             | Result                                                                                   |
| ------ | ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| 1      | Static and app rows never build                  | accepted (finding 9)                                                                     |
| 2      | `current` hard-coded                             | accepted (finding 9)                                                                     |
| 3      | Any non-done status is open                      | changed to a nit: no cancelled status is in use                                          |
| 4      | `rj` and `lk` credited on any request            | changed to low: production writes are all `reject`, so the reach is weak, not false      |
| 5-7    | `rl`, `gd` and `sr` over-credited                | accepted (finding 8)                                                                     |
| 8      | Reach from self-reports                          | rejected: reports are facts the oracles accept, and the liar gate is T45's               |
| 9      | Reach counts failing runs                        | accepted (finding 8)                                                                     |
| 10     | Two world seeds                                  | changed: R8 lets one script seed fix the world seed; derivation and doc nit (finding 12) |
| 11     | `fingerprintOf` uncalled                         | rejected: `bench/gate.ts:21` calls it                                                    |
| 12     | T30 equal step counts                            | accepted as low: the fingerprint compares turns, not step counts                         |
| 13     | T29, T37, T38, T40-T43                           | rejected: those are T45's tests                                                          |
| 14     | Owed lists apart from `limits.ts`                | rejected for this review: not checked against R22                                        |
| 15, 16 | Catch-all quiet rule, approval                   | rejected: the user approved the rules on 2026-11-12                                      |
| 17, 18 | Waiver path, 69 pairs with no owner              | rejected: I57's owner wording; only declared pairs count                                 |
| 19, 22 | `>= 80`, LANE-11                                 | accepted as nits                                                                         |
| 20, 21 | Per-row reach, later-slice claims                | accepted as low                                                                          |
| 23     | Mapping proposed                                 | noted: awaits the user's read                                                            |
| 24-26  | Model-mutation tautology, field gate, self-label | accepted (finding 3)                                                                     |
| 27     | Pilot seed filter                                | rejected: harmless                                                                       |
| 28     | Profile breadth                                  | accepted, verified against catalogue lines 1064-1100 (finding 11)                        |
| 29     | `ma` and `du` gating                             | changed to a nit                                                                         |
| 30, 31 | Gate grep, play allowances                       | accepted as low                                                                          |
| 32     | F1 one step                                      | not verified                                                                             |
| 33     | Reference projection                             | low                                                                                      |
| 34     | `cites`                                          | rejected, as in the steps 1-2 review                                                     |
| 35     | `effect` in fixtures                             | rejected: a dependency, not repo code                                                    |

Adversary sidecar (Haiku, effort high):

| #   | Item                            | Result                                                                                                                                                     |
| --- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Static cases in no gate         | accepted (finding 10)                                                                                                                                      |
| 2   | Owed static passes on any throw | accepted, and the probe widened it (finding 6)                                                                                                             |
| 3   | Core kill rule                  | accepted, with the mechanism and survivors reproduced (finding 1)                                                                                          |
| 4   | Self-labelled kills             | accepted (finding 3)                                                                                                                                       |
| 5   | Owner not checked, seed 109     | accepted as low (finding 12)                                                                                                                               |
| 6   | `current: 0`                    | accepted (finding 9)                                                                                                                                       |
| 7   | Reach credits                   | accepted (finding 8)                                                                                                                                       |
| 8   | Denominators                    | changed: the two serialize scripts are rightly excluded, since production has no Lab machine, so 6/6 is the right count; `pick` is rejected, as all 98 run |
| 9   | Bench                           | empty-work guard accepted (finding 12); exit code rejected: the verdict line is printed                                                                    |
| 10  | Matrix `static: {}`             | accepted (finding 9)                                                                                                                                       |
| 11  | `skipped` unjudged              | accepted (finding 11)                                                                                                                                      |
| 12  | `.length > 0` mutants           | accepted as low                                                                                                                                            |
| 13  | Stale gate records              | accepted, confirmed by the failed copy load (finding 5)                                                                                                    |
