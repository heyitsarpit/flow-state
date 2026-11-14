# T47 close review (2026-11-14)

**Verdict: PASS at edea68cb (check-task), zero blocking findings; T47 may close.** Every machine gate I re-ran
matches `conformance/gates.json`. The core-mutant score is real: 60/98 kills, each naming an oracle or a cited
Invariant, and `core-mutants.tsv` reproduced byte for byte. The close review's four blocking findings
(2026-11-12) are fixed. Thirteen findings remain. None is red on current code and none loses an ending, so each is
routed below with its owner. Two are small fixes in T47's own range (R1, R2).

**Read first:** code:wiki/plans/flow/references/proposals/t47-close-review-2026-11-12.md,
code:wiki/plans/flow/references/proposals/t47-close-fixes-2026-11-14.md, @task.V3.T47. Range `0c46a414..edea68cb`;
file:line references are at edea68cb.

## 1. How it was checked

- **Gates:** every machine gate ran in a `git clone --shared` scratch copy, one at a time, each bounded. The run was
  at c24218a5, then the gates edea68cb can change ran again at edea68cb.
  - Equal to `gates.json`: suite 123/123 (round-14) and 78/78, falsify 154/154 and 18/18, coverage 75/211 with 0
    gaps, parts 38/38, held-out 84/84, matrix 265/265, pairs 74/74, model mutation 327/327, bench 6/6, regressions
    8/8 on both runtimes, liar 126/126 and 13/13, limits 6/6.
  - Core mutants: 60/98 killed, 34 owed, 4 equivalent, 0 untriaged.
  - Crash: 732/735, as before.
  - Both falsify runs lost no catch, and the catch-matrix files did not change.
- **Tests and lint:** `vitest` over `parts`, `bench`, `limits` and `core-triage` passed (17 files, 111 tests).
  `nub run check` passed with zero errors and zero warnings.
- **Triage:** I read the source line under all 4 equivalents and 9 owed rows (turn.ts:248, serve.ts:277 `||`,
  evidence-of.ts:84, lanes.ts:127, tx.ts:123, record.ts:270, persist.ts:107, incarnations.ts:58,
  lane-moves.ts:303).
- **Sidecars:** seven Haiku sidecars at effort high, read-only, one of them blind (log in section 6).
- **`dsl-mutant-3060-13/`:** my runs did not make it. They ran in the scratch clone, which has no such folder.

## 2. Acceptance (check-task)

| Claim                                                                    | Verdict | Evidence                                          |
| ------------------------------------------------------------------------ | ------- | ------------------------------------------------- |
| Combination gate, dated owners                                           | PASS    | pairs 74/74; owners not re-checked once reached (R6) |
| `part()` modules, JSON scripts, player, model expectations               | PASS    | parts 38/38; JSON round trip in `generate.test.ts` |
| Parts and runtimes declare codes; generator draws declared only          | PASS    | `declarations.test.ts`, `generate.test.ts`        |
| Matrix gate: owed by slice, unreached code fails, 265 rows with kinds    | PASS    | matrix 265/265                                    |
| Pairs from the channel table, waivers, triples, cell pairs               | PASS    | `pairs.test.ts`, `cells.test.ts`                  |
| Pilots: usual and stress, kill model-cell mutants, alone and in the mix  | PASS    | 36 of 327 fields noticed; the field gate is weak (R4) |
| Bench: no oracles, fingerprint gated, cost recorded                      | PASS    | bench 6/6; empty run faults (`bench.test.ts:25`)  |
| Every failure kept as a regression or a limit                            | PASS    | regressions 8/8 and 8/8; 5 owed ids, 2 kept scripts |
| Declared, Enabled, Covered                                               | PASS    | as above                                          |
| Guards: first-contact reds, held-out seeds, Fable read                   | PASS    | held-out 84/84; code:wiki/plans/flow/references/proposals/t47-expectations-sample.md |
| Non-interacting list, one approval                                       | PASS    | the user, 2026-11-12                              |
| Compile static cases on every composite's `Compiled`                     | PASS    | owed to T17 by ruling; owed check is vitest only (R5) |
| Phase-out step 3 (referenceOf, surface, classify, layout, lint)          | PASS    | `reference.test.ts`, `layout.test.ts`, `nub run check` |
| Phase-out checks (no lost catch, rows, derived = hand, static)           | PASS    | no lost catch; coverage 0 gaps                    |

The mapping holds. Every acceptance item, Approach item and gap comment maps to one of Q1 to Q30, and the close
review's findings each landed as a check that fails on a planted violation. I spot-checked `bench.test.ts:25`,
`play.test.ts:306-356`, `static.test.ts:108` and `core-triage.test.ts:27`.

## 3. Blocking findings

None. The stopping rule needs a check that is red on current code. Every gate and test is green and matches its
record, and no finding below loses, doubles, makes up or misplaces an ending.

## 4. Routed findings, with owners

1. **R1. `turn.ts:248` triage text contradicts T6 as edea68cb reworded it** (T47 builder, small).
   `core-mutants-triage.ts:291-296` still says "Turn T6 refuses a zero-length schedule... needs a ruling". T6 now
   allows 0 ms (`Turn.spec`, T6). The row stays owed, but for a reason the text does not give: no case schedules
   0 ms, and the mutant refuses it. Its owner is T18, a lane-policy Task; T9 or T17 fits a Turn rule better.
2. **R2. `gates.json` labels edea68cb's verdicts with c24218a5** (T47 builder, small). Suite round-14 123/123 and
   limits 6/6 include the new TURN-01 case, which c24218a5 lacks. My run at edea68cb gives the same numbers. Only
   the revision label is wrong.
3. **R3. `incarnations.ts:298` is not equivalent** (owner T9, owed row). Its own reason admits the exception: a
   backlog past the drain's 10,000-turn slice. In that case the mutant counts another actor's queued mail as busy
   and delays a free incarnation's grace, against Actors R8 ("free of uses and work in flight"). The same turn storm
   makes serve.ts:277 `||` owed to T9 (triage `:266-272`), so this row should be owed beside it. The other three
   equivalents hold: answers.ts:36 (reads drop with their incarnation, incarnations.ts:242, :262), step.ts:76
   (ensure with no use is a no-op, incarnations.ts:199-220) and serve.ts:277 `<=` (no rule fixes the slice).
4. **R4. The T39 field gate cannot fail on a table cell** (owner T52; first fix the Spec, Spec contradictions
   rule).
   - `fieldMutant` returns a mutant for every cell path (`parts/model-mutation.ts:165-170`), so `fieldGate` (`:265`)
     passes even if no pilot notices anything.
   - Conformance I61 asks more: every field changed by a mutation "that changes some part's expected trace". Only 36
     of 327 fields meet that, so the gate built to T39's text would be red under I61.
   - Decide which rule stands, delete the losing text, and log it.
5. **R5. Production's owed static rows run only under vitest** (owner T17). The close review's finding 10 is not
   closed. `runner/main.ts:109` (`surfaceless`) and `--only` with hand ids leave every CMP case out of
   `suite production`, so `static.test.ts:89-93` is the only check that fails once T17 fixes one. When T17 builds
   the surface, it moves them into a machine gate.
6. **R6. Owed rows are never checked to match anything** (owner T52; a missed requirement). This was found only by
   the blind sidecar.
   - `partFaults` (`parts/play.ts:137-145`), `productionRegressions` (`runner/parts-gates.ts`) and `triageFaults`
     (`core-mutants-triage.ts:311-322`) look rows up per run. A row naming a script or mutant that no longer runs
     stays silently.
   - This already happened once: the seed 2 and 109 rows of 2026-11-12 named scripts the new profile stopped drawing
     (close fixes, section 1).
   - Pair owners have the same gap: an owner whose pair is now reached raises no fault (`parts/pairs.ts:131-137`).
7. **R7. Triage rows accept any status but `killed`** (owner T52). Under `core-mutants-triage.ts:315-321`, a triaged
   mutant that now gives ERROR or TIME passes. So does an empty sample: the gate prints `pass 0/0`
   (`runner/mutate.ts:109-174`). Neither happens today, since the TSV has 60 killed, 23 SURVIVED and 15 NO-ORACLE.
8. **R8. `lane-moves.ts:303` names production as the wrong side, but only as triage text** (owner T54). The routed
   gap rule wants a pending case or an owed row. The core-mutant row owes a missing check. It does not owe the
   production bug (a Held head's `inFlight` stays true after StillUnknown, WriteAhead T18). T54 adds the pending
   case when it rewrites the lane record.
9. **R9. The coverage gate depends on the whole `wiki/` passing `wk` validation** (owner T59). `runner/specs.ts:22`
   asks `wk show` for each Spec, and that call fails on any unresolved code link anywhere in `wiki/`. In my clone,
   which has no gitignored `codebases/effect-v4`, `wiki/tasks/V3/P7.task:70` made coverage and falsify round-14
   read `BAD coverage: the Spec Turn could not be read`. This read came in at fb982276 (T47), and T59 already holds
   `runner/specs.ts`.
10. **R10. The selection oracle stays loose after a return** (owner T9).
    - `turn/anchor.ts:155-156` sets an unknown leaf after a whole free grace, though with no work in flight R8 and R9
      fix it as the initial leaf.
    - `mayHaveEnded` is never cleared (`:109`, `:133`), so every later adopting delivery routes `either` (`:250`).
    - This is no wider than at 0c46a414, since 5950a0ed undid 8976113f's reset. T9 pins both when it owns lifetime.
11. **R11. Owed matching rests on label text** (owner T52).
    - `verdictOfLimit` (`limits.ts:38-41`, edea68cb) matches a `case` row by the expectation label's prefix
      `Turn I14:`.
    - TURN-01's `cites` lack Turn I14 (`turn/refusal.scenarios.ts:33`), so coverage does not count the case.
    - A run stops at its first failing expectation, so the later checks of an owed case go unjudged while it fails.
      That is R9 of Conformance, unchanged from before.
    - The widening loosens no existing row: only TURN-01 has `check: "case"`.
12. **R12. Record edits** (T47 builder). 26812bfb changes T47's status to review with no labelled line. c24218a5's
    T52 comment says it replaces the routed comment, but that comment is still at `P4.task:1191`, so the fact is
    written twice.
13. **R13. Small items** (noted, no owner needed).
    - `sr` is credited for any actor fact since the last landing (`parts/play.ts:307-312`), not only writes. This is
      close to right, since a drive or ensure of a persisted actor dirties its record.
    - `lateCodes` (`parts/features.ts:130-146`) has no caller.
    - `not-yet.ts:3` hand-rolls `Array.range`.
    - Doc comments sit on non-exported `generate.ts:123`, `reference.test.ts:58` and `static.test.ts:30`.

The standing angles found nothing else. No throw was added in `src/`, and the core gained no Effect runtime, timer
or banned API. Every expected result in the range cites a Spec rule or a ruling, and none is copied from round-14.
The `wiki/` reads and `wk` calls in `parts/records.ts`, `runner/specs.ts` and `pairs.test.ts` are held in
@task.V3.T59. I found no file in the range written by shell.

## 5. Found only by the blind sidecar (missed requirements)

- Owed rows, triage rows and pair owners must each match a run, mutant or unreached pair (R6).
- A gate over zero mutants or zero kept scripts must not pass (R7).
- Hand-case reach is credited from `cites`, not from execution (`parts/features.ts:84-124`; Conformance I54). Q12
  chose this by design, so it is noted for T52's generated cases.

## 6. Sidecar log

Seven Haiku sidecars, at effort high and read-only: blind, triage, routed gaps, standing angles, adversary,
record edits, and the edea68cb harness change. I re-checked each item I use.

| Sidecar | Item                                                        | Result                                                          |
| ------- | ----------------------------------------------------------- | --------------------------------------------------------------- |
| blind   | 1 field gate cannot fail                                    | accepted, R4 (read `model-mutation.ts:165-170, 265`)            |
| blind   | 2 owed rows go inert                                        | accepted, R6 (read `play.ts:137-145`)                           |
| blind   | 3, 5 triage statuses; zero mutants pass                     | accepted, R7 (read `core-mutants-triage.ts:315-321`)            |
| blind   | 4 kills use oracle `any`                                    | rejected: `coreOutcome` (`mutate.ts:75`) kills only on an oracle or cite, as the brief allows |
| blind   | 6 held-out ids owed                                         | rejected: owing a production bug found by a held-out run is not tuning against it |
| blind   | 7 scripts not JSON in gates                                 | rejected: Q8 checks the round trip in `generate.test.ts`        |
| blind   | 8 hand reach from cites                                     | changed to a note (section 5)                                   |
| blind   | 9, 16 over-credit; bench observer                           | changed: `sr` low (R13); bench counts work, which R23 allows    |
| blind   | 10 pair owners                                              | accepted into R6                                                |
| blind   | 11 command codes over-claim (`du`)                          | rejected: declared codes only filter the generator, and reach comes from facts |
| blind   | 12 `lateCodes`                                              | accepted as a note (R13)                                        |
| blind   | 13, 14 free-text rulings; substring limits                  | changed: R11                                                    |
| blind   | 15 I15 fallback                                             | rejected: `killedBy` ignores it; noted in the close review      |
| blind   | 17, 18 regressions 0/0; static vitest only                  | accepted into R7 and R5                                         |
| blind   | 19, 20, 21 stale comment; TSV in tree; seed counts          | noted: the TSV is a committed record; the slice tables supersede the catalogue's seeds |
| triage  | 1, 4 answers.ts:36 and step.ts:76 equivalent                | accepted (lines read)                                           |
| triage  | 2 incarnations.ts:298 not equivalent                        | accepted, R3                                                    |
| triage  | 3, 6 serve.ts:277 cites                                     | rejected: WriteAhead R10 names the backlog served "in a later step" |
| triage  | 5 turn.ts:248 text                                          | accepted, R1                                                    |
| triage  | 9 owners for Turn rules                                     | accepted into R1 for turn.ts:248; the rest noted                |
| triage  | 10 gate logic                                               | accepted into R6 and R7; the matching by line and text is sound |
| routed  | 1-3, 7, 8 owed rows turn red on fix                         | confirmed by reading `limits.ts`, `play.ts:50-61`, `not-yet.ts` |
| routed  | 4 static owed vitest only                                   | accepted, R5                                                    |
| routed  | 5 pending trace one boolean                                 | noted: the trace stays owed on any mismatch, which is safe      |
| routed  | 6 WriteLanes I10 remainder never gates                      | noted: an owed row is allowed while the Spec's ruling is missing |
| routed  | 9, 10 lane-moves.ts:303, turn.ts:248                        | accepted, R8 and R1                                             |
| routed  | 11, 12 pair owners; `lateCodes`                             | accepted into R6 and R13                                        |
| angles  | 1-3 `wiki/` reads, `wk` spawn                               | held in T59; R9 adds the failure I reproduced                   |
| angles  | 4 HashSet of plain objects by reference                     | rejected: Effect 4.0.5 `HashSet.has` matches equal objects in any field order (probe) |
| angles  | 5-9 `Array.range`, doc comments, strings                    | noted (R13)                                                     |
| angles  | 10, 11 throws, banned APIs                                  | confirmed: none added                                           |
| adver.  | 1 selection oracle loose, `mayHaveEnded`                    | accepted, R10 (read `anchor.ts:109-156, 250`)                   |
| adver.  | 2 fb982276 model cells                                      | changed: each cites its rule; the boot listing (Actors R20) is owed to T54 via Actors I40 in `not-yet.ts:90` |
| adver.  | 3 owed held-out ids, substring, first-failure stop          | changed: R11                                                    |
| adver.  | 5 kill not tied to the cell's Invariant                     | noted under R4                                                  |
| adver.  | 7 derived slice loosened by an unparseable Task             | noted: a missing `wiki/` throws, and T59 removes the reads      |
| adver.  | 8 triage ignores status                                     | accepted, R7                                                    |
| records | 7, 9 status label; duplicate T52 comment                    | accepted, R12                                                   |
| records | 5, 6, 10 rewraps; vague labels                              | noted: wording unchanged                                        |
| harness | 1-3 `verdictOfLimit` anchored to `case` rows only           | confirmed: no existing row loosened                             |
| harness | 2, 4 masking; cites lack I14; T17 owner                     | accepted into R11; T17 owner kept, by the ruling                |
| harness | 5 anchor untested; `gates.json` revision                    | accepted into R11 and R2                                        |

## 7. What the builder's checks missed

The owed-row rule asks a row to fail when its gap closes. No rule or check asks a row to match something that still
runs. The cause is a rule gap (R6, R7). The triage reasons were argued from a single file at a time, so the
turn-storm case that makes serve.ts:277 owed was not carried to incarnations.ts:298. The cause is context (R3).
edea68cb's T6 rewording did not sweep the records that quote T6. The cause is gathering (R1, R2).
