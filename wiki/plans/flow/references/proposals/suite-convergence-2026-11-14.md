# Suite convergence: how the conformance suite judges (2026-11-14)

**Status: proposed.** Nothing here is decided. It changes no code and no record but this file.

**Bottom line: the holes come one at a time because the suite proves its oracles with mutants but never proves its
own gates.** The 9 review files hold 148 rows. Of these, 106 are holes in the judging machinery, 35 are core mutants
that survive (reach gaps), 5 are production bugs the suite found and 2 are notes. This analysis adds 22 more, each
checked at HEAD (`e2f544ab`). The 128 machinery holes fall into 10 root-cause groups. Only 6 were found by putting
wrong code back and 8 by a gate run. The rest were found by reading or by a sidecar, so whichever slice a review read
is the slice that got fixed.

The rules most clearly missing are these:

- an excuse names the exact item it excuses;
- an excuse is two-sided and judged where it is played;
- a gate declares the set it judges;
- the suite has one catch predicate over structured verdicts;
- an unknown is counted, never made definite.

The next holes are most likely in five places, none of which a review has read:

- the oracles' own report filters (`dsl/compare.ts`, `turn/credits.ts`, `write-lanes/ending-channels.ts`);
- the stated limits, which also reach production;
- the liar gate and the probes;
- production's suite selection;
- the triage and report-truth lists.

What the T52 builder should build now:

- the owed-row redesign, with each excused item named exactly and no counts or text;
- a planted-fault sweep as its class gate, over every owed script and every seed;
- the parts gates' universe check.

Everything else becomes one later suite Task: a suite-mutation gate, one catch predicate, one excuse registry, a
universe ledger for every gate, baselines that no gate writes, and an unknown ledger. Each of these is costed below.

**Read first:** the nine files listed under Sources; `wiki/specs/conformance/Conformance.spec`;
`wiki/tasks/V3/epic.task` ("Testing and the suite", "Reviews"); skill:policy-testing#audit-a-suite.

## 1. What the current architecture lacks, in one view

The suite has three layers, and each is proven to a different degree:

| Layer | What it is | How it is proven today |
| --- | --- | --- |
| Judges | oracles, the Spec model, the compare | falsify, liar, core mutants, `lifecycle-step.test.ts` |
| Excuses | the ten excuse lists (G2 in section 3) | per-list code, each different |
| Gates | parts, held-out, regressions, matrix, pairs, coverage, falsify, liar | hand-written self-tests, if any |

The judges have mutants. Each excuse list grew its own matching rule. The gates have no mutants at all.

Three facts make this a single root cause rather than ten separate ones:

- **No Spec rule covers production's owed reds.** R2 and R22 govern round-14 limits only. `parts/owed.ts`,
  `regressionsOwed` and `productionOwed` have no contract, so their key, their staleness and their scope were each
  decided case by case, and the reviews found each decision in turn: D17 (check and Invariant), then subjects, then
  counts, then the 2e draft.
- **Verdicts are text.** `CaseVerdict.why` carries the seed, step, violation and subject (Spec Q11, I43 open).
  Owed matching (`limits.ts:46`), unowed failures (`parts/play.ts` `unowedFailures`), falsify's judge
  (`runner/falsify.ts:171`), the catch matrix (`runner/matrix.ts:22`) and the builder's new adversary
  (`parts/adversary.ts:317`, uncommitted) all parse it.
- **Nothing measures the gates.** skill:policy-testing#audit-a-suite asks for this: "Keep the mutants with the
  suite and rerun them whenever it changes". `lifecycle-step.test.ts:653-781` does that for the compare half only,
  with 37 source mutants.

## 2. Inventory

Sources (all in this folder):

| Key | File |
| --- | --- |
| C12 | t47-close-review-2026-11-12.md |
| S12 | t47-steps1-2-review-2026-11-12.md |
| C14 | t47-close-review-2026-11-14.md |
| CF | t47-close-fixes-2026-11-14.md |
| S1 | t52-step1-review-2026-11-14.md |
| B | t52-build-review-2026-11-14.md |
| R | t52-recheck-2026-11-14.md |
| R2 | t52-recheck2-2026-11-14.md |
| L | t52-build-log-2026-11-14.md |
| X | this analysis, verified at HEAD |

Column codes:

- **Origin:** P is pre-existing, N is caused by new code, ? means the review does not say.
- **Found:** W is wrong code put back or planted, S is a red shrunk and replayed, B is the blind sidecar, A is
  another sidecar or an adversary, R is reading, G is a gate run.
- **G:** the group in section 3.

Code paths are relative to `packages/flow-state-v3/conformance/`.

### 2.1 Judging-machinery holes

| Id | Source | Part hit | What | G | Origin | Found |
| --- | --- | --- | --- | --- | --- | --- |
| H1 | C12:43 | runner/mutate.ts | core 98/98: an unloadable copy's Fails counted as kills | G5 | P | G |
| H2 | C12:60 | regressions | GEN-20, -21, -173 fail to pass, unrecorded; signatures in no gate | G7 | N | G |
| H3 | C12:71 | model-mutation.test | T39 and Q16 compare cellsOf with itself | G4 | N | R,B |
| H4 | C12:78 | generate.test | held-out seeds played by no test or gate | G3 | N | R |
| H5 | C12:82 | gates.json | verdicts labelled with a revision that did not produce them | G7 | N | G,A |
| H6 | C12:86 | construction.cases | Q22 owed reason wrong; CMP fail on missing checks | G1 | ? | R,A |
| H7 | C12:92 | parts/static.test | owed static check passes on any throw | G1 | ? | A |
| H8 | C12:98 | limits.ts | substring verdict match hides a second failure | G1 | ? | R |
| H9 | C12:102 | parts/play.ts reach | reach credited to every part handling a denied event | G6 | N | B |
| H10 | C12:107 | parts/records.ts | `current: 0`, `static: {}` hard-coded; can never fail | G4 | N | R,B |
| H11 | C12:113 | runner/main.ts | production static cases run in no machine gate | G3 | N | R,B |
| H12 | C12:115 | parts/generate.ts | stress thinner than catalogue; `skipped` never read | G9 | N | B,A |
| H13 | C12:124 | bench/gate.ts | empty fingerprint on both sides passed | G4 | N | R |
| H14 | C12:126 | parts/play.ts | world seed fixed at 1; doc claims a second seed | G3 | N | B |
| H15 | C12:128 | play.test | owed row checked in vitest only | G2 | N | R |
| H16 | C12:125 | Spec T36 | waiver wording contradicts I57 | G8 | ? | R |
| H17 | C12:130 | matrix.test | asserts >= 80 where 123 exist | G4 | ? | B |
| H18 | C12:28 | parts/generate.ts | second-actor ensure not gated by `ma` | G9 | N | R |
| H19 | S12:43 | features.ts | 47 matrix rows owed to the wrong owner | G2 | N | R,B |
| H20 | S12:57 | features.ts | `owed()` sets `codes: []`; built-but-owed never fires | G4 | N | R,A |
| H21 | S12:65 | step-1 tests | six checks pass over `parts = []` | G4 | N | R,G |
| H22 | S12:78 | gates.test | Q19 passes only with a kept regression | G4 | N | R |
| H23 | S12:82 | gates.test | Q26, Q27 are greps; a comment passes | G4 | N | R |
| H24 | S12:88 | pairs.ts | slice rule removable with 16 tests green | G4 | N | W |
| H25 | S12:97 | adapters/prototype.ts | round-14 under-declares `ea`, `hs` | G8 | ? | R,B |
| H26 | S12:103 | frozen.ts | 102 ids vs 99; RULINGS accepts `constructor` | G8 | N | R |
| H27 | S12:101 | pairs.test | pair count self-computed | G4 | N | R |
| H28 | S12:21 | play.test | F1 mapped loosely; no dropped-write mutant | G4 | N | R |
| H29 | S12:26 | play.test | reach bound passes reach copied from claims | G6 | N | R |
| H30 | S12:32 | requirements | "False pass" maps to no requirement | G8 | ? | R |
| H31 | S12:34 | features.ts | `built()` and `owed()` hard-code `cases: []` | G6 | N | R,B |
| H32 | S12:154 | reference.test | Q3 omits events, memory, input, key | G3 | N | A |
| H33 | S12:37 | channels.ts | R18 does not cite 5B | G8 | N | R |
| H34 | C14:65 | gates.json | edea68cb's verdicts labelled c24218a5 | G7 | N | R |
| H35 | C14:74 | model-mutation.ts:265 | field gate passes every cell; I61 met by 36/327 | G4 | N | B,R |
| H36 | C14:85 | owed rows, pair owners | rows never matched to anything that runs | G2 | N | B |
| H37 | C14:93 | core-mutants-triage | triage accepts any status; 0/0 passes | G5 | N | B,A |
| H38 | C14:100 | runner/specs.ts | a broken wiki link makes coverage BAD | G7 | N | G |
| H39 | C14:105 | turn/anchor.ts | leaf unknown after a whole grace; flag never cleared | G10 | N | A |
| H40 | C14:110 | limits.ts | owed matched by label text; run stops at first failure | G1 | N | B |
| H41 | C14:136 | features.ts | hand-case reach credited from cites | G6 | N | B |
| H42 | B:101 | runner/mutate.ts:77 | core kill does not check the expected Invariant | G5 | ? | A,R |
| H46 | CF:22 | turn/anchor.ts | selection oracle false reds (pay-12, cells-11) | G10 | ? | S |
| H47 | CF:26 | regressions | part regressions on production only | G3 | ? | R |
| H48 | CF:37 | cites | rule cited R6 where the text is R9 | G8 | N | A |
| H49 | CF:38 | case runner | `returned` skipped with no initial state | G3 | ? | A |
| H50 | CF:40 | held-out gate | owed held-out ids only in held-out gate | G2 | ? | A |
| H51 | CF:42 | parts | non-owed kept scripts skip skipped-answer rule | G2 | ? | A |
| H52 | CF:99 | actor-lives traces | `parked` misses a Kept row | G10 | ? | A |
| H53 | CF:102 | WriteLanes I10 | member order needs a Spec ruling | G10 | ? | A |
| H54 | CF:104 | not-yet.ts | I21, I22 moved to a T52 row; no check | G2 | ? | A |
| H92 | S1:16 | fixture.ts:145 | Pay and Cells share a machine id; wrong table judges | G1 | N | B |
| H93 | S1:27 | lifecycle-rules, frozen | retired cases relabellable; compound cites missed | G8 | N | R,B |
| H94 | S1:40 | lifecycle.test:186 | Q24 red and trace stale (Kept) | G10 | N | R |
| H95 | S1:44 | golden.test | golden content not pinned | G7 | N | B |
| H96 | S1:53 | fixtures | guarded-site count owed by no Q | G2 | ? | R |
| H97 | S1:56 | cites | claimed 26 and 20 cites; there are 23 and 16 | G8 | ? | R |
| H98 | S1:59 | coverage.test | A3 tests the predicate, not the wiring | G4 | N | R |
| H99 | S1:62 | gates.json liar | nine fixture gaps have no owner | G2 | ? | R |
| H100 | S1:65 | D5 field gate | no red for owed field rows; 291 owners unnamed | G2 | N | R |
| H101 | S1:71 | lifecycle-rules.ts:324 | Table B cells disagree with Spec prose | G10 | ? | R |
| H102 | S1:82 | step mutants 5-8 | die only as kept examples | G9 | N | B |
| H103 | S1:121 | parts tests | `parts.length === 3` in ten places | G4 | N | R |
| H104 | S1:123 | Q23, TURN-01 | green by adding a cite string | G8 | N | A |
| H105 | S1:126 | Q28, liar | Q28 evidence-only; liar keeps own baseline | G7 | N | R |
| H106 | S1:128 | golden | golden is not a case under R6, R7, R14 | G4 | N | B |
| H107 | S1:130 | citations.test:27 | an empty walk passes | G4 | ? | R |
| H108 | S1:132 | reference.test | Q3 plants its own classify; no prod mutant | G4 | N | R,B |
| H109 | S1:100 | R15, D4 | ruling traces unlogged; unique-catch traces uncovered | G8 | N | R |
| H110 | B:138 | parts/reference.ts:57 | only the first idle/retryable guard kept | G6 | N | B |
| H111 | B:140 | fixtures/pay | classify runs for two errors only | G6 | N | B |
| H112 | B:65 | derived-folds, schedules | unknown key Some(null), unknown delay 0 | G6 | N | W,S |
| H113 | L:190 | source-files.ts | golden walk flake on a shared tree | G7 | N | G |
| H114 | L:184 | model-mutation | failing pilot dropped; gate red | G3 | N | G |
| H115 | B:76 | parts/play.ts | owed row excuses any I15; run stops at first | G1 | N | B |
| H116 | R:47 | engine, owed.ts | D17 key excused unrelated Attempt in 32/52 runs | G1 | N | B,A |
| H117 | R2:46 | play.test:92 | owed seeds 7-12 judged by text only | G3 | N | W |
| H118 | R2:53 | lifecycle-model.ts:375 | lane subject excuses every Attempt-less I15 | G1 | N | B,A |
| H119 | L:216 | owed.ts (2e draft) | a lane plant spends the listing | G1 | N | W |
| H121 | R2:62 | play.ts:177, run.ts:170 | unowed failures by text; first seed only | G8 | ? | B |
| H122 | R2:43 | owed lists | known-failure list only; no expectation reads them | G2 | N | R |
| H123 | R2:29 | citations.test | guard misses `eq<T>` and helper labels | G8 | N | B |
| H124 | R2:75 | case.ts:114 | `snapshot`, `row` skip the unbooted guard | G3 | N | B |
| H125 | B:111 | runner/mutate.ts:113 | core control passed over zero cases | G4 | ? | W |
| H126 | B:113 | dsl/actor.ts:68 | actorView did not check its fixture is booted | G3 | N | W |
| H127 | R:94 | play.test | undecided-guard count missing | G6 | N | R |
| H128 | R:97 | turn/schedules.ts:183 | unknown delay never overdue | G6 | N | R |
| H129 | L:100 | PayNotSent guard | never decided on a delivered ending | G6 | N | G |
| H130 | R:99 | fixtures/folds.ts:71 | missing label wrapped as Some({n:null}) | G6 | N | B |
| H131 | B:125 | derived-folds.ts:35 | UNKNOWN sentinel can collide with JSON | G6 | N | R |
| H132 | L:126 | derived-folds probes | later-probe keys, constants, throws missed | G6 | ? | A |
| H133 | L:128 | fold labels | labels from the server value, not the ending | G6 | ? | A |
| H134 | L:146 | fold keys | unknown commit key takes key-less lane | G6 | ? | A |
| H135 | R:72 | source-files.ts:18 | Result.try swallows every error | G7 | N | B |
| H136 | R:101 | derived-folds.ts:255 | unknown update field keeps old value | G6 | ? | R |
| H137 | B:114 | parts/generate.ts:128 | faults hit the first answer only; Die never drawn | G9 | ? | R |
| H138 | B:39 | D12 | no Pay run beside other pilots in a mix | G9 | N | B |
| H139 | B:69 | parts/belief.ts:118 | belief frees a lane on any cancel | G9 | ? | R |
| H141 | L:108 | namesNoAttempt | subject kind read from a space | G1 | N | A |
| H142 | L:154 | sole failure | a pipe separator in text breaks the split | G8 | N | A |
| H143 | L:158 | cite tables | unowedFailures never matches case rows | G8 | ? | A |
| H144 | R:36 | guards.test | seven unfolded hand guards unlisted | G2 | N | R |
| H145 | R:153 | coverage.test | Q34 predicate only | G4 | N | B |
| H146 | L:235 | runner/matrix.ts | lost-catch ignores a renamed Invariant | G8 | ? | R |
| H147 | L:206 | refusal cells | 118 refusal cells unread by part runs | G9 | N | R |
| H148 | B:54 | routed S1 items | pending flips, Q19, LOST import | G2 | N | R |
| N1 | X | turn/credits.ts:21-27, :43 | any ending-less Issue turns off Turn R2 for all actors | G1 | ? | B |
| N2 | X | ending-channels.ts:288 | unknown Cancelled excused by operation for the boot | G1 | ? | B |
| N3 | X | ending-channels.ts:373 | Restored allowed on any Ensured step | G1 | ? | B |
| N4 | X | limits.ts:103; compare.ts:153 | a stated limit sits in shared compare, so reaches production | G1 | ? | B |
| N5 | X | production.ts:215; ending-channels.ts:163-179 | production failure tag never judged | G6 | ? | B |
| N6 | X | compare.ts:163, 195, 267, 407-418 | unowed reports of four kinds not applied, not refused | G6 | ? | B |
| N7 | X | compare.ts:326-334 | no suite answer: the report's channel is the End | G6 | ? | B |
| N8 | X | parts/play.ts `heldBy` | a row holds if any one subject breaks | G2 | N | A |
| N9 | X | parts/play.ts `judged` | owed scripts skip the skipped-answers check | G2 | ? | A |
| N10 | X | core-triage.test.ts:38 | triage owner never checked; equivalence untested | G2 | ? | A |
| N11 | X | suite.ts:139-205; modes.ts:122 | report truth, fixture gaps never re-run; cap counts names | G2 | ? | A,B |
| N12 | X | runner/gates.ts:38-41 | production suite drops cases by fixture, uncounted | G3 | ? | B,A |
| N13 | X | runner/main.ts:95-110 | GEN seeded and exhaustive runs in no gate | G3 | ? | B |
| N14 | X | parts-gates.ts:208-215 | regressions production drops 2 files silently | G3 | ? | A |
| N15 | X | model-mutation.ts:204-232 | pilots at seed 1; failing pilots dropped silently | G3 | ? | A |
| N16 | X | falsify.ts:407-456 | liar red is any Fail or Timeout | G5 | ? | B,A |
| N17 | X | falsify.ts:371-384 | a pending probe holds on any non-pass | G5 | ? | B,A |
| N18 | X | modes.ts:260-284 | `kills` compares counts; counts `red case` (in no gate) | G5 | ? | B |
| N19 | X | matrix.ts:49-63; modes.ts:413 | matrix written before compare; `--record` saves "pass" | G7 | ? | B |
| N20 | X | credits.ts:166; idle-guard.ts:41; disposal.ts:300 | unknown key matches any call, uncounted | G6 | ? | X |
| N21 | X | falsify.ts:129 vs gates.ts:50 | first `VERDICTS` line vs last; stdout can spoof | G8 | ? | B |
| N22 | X | parts/adversary.ts:317 | new code matches `why.includes(invariant)` | G8 | N | X |

**Rows not counted as holes in the judging machinery.**

Production bugs the suite found, to be fixed in the runtime and not in the suite: H43, H44, H45 and H55 (the retry
count, forget-then-refused, the unbound restore and the lane record) and H56 (the Held head's `inFlight`). H120 and
H140 are notes: a test that leans on a live bug, and cells-stress-3, cause unknown.

The core-mutant survivors H57 to H91 (CF:53-90) are 35 rows. Each names an owner and a Spec rule, and most are
caught by "none". They are reach gaps, not judging holes, and section 3 counts them as group G9.

### 2.2 How they were found

| Found by | Machinery holes |
| --- | --- |
| Wrong code put back or planted (W) | 6 |
| Red shrunk (S) | 2, plus the 5 production bugs |
| Blind sidecar (B) | 48 |
| Another sidecar or adversary (A) | 34 |
| Reading (R) | 51 |
| Gate run (G) | 8 |
| This lead's own reading (X) | 2 |

A row can count under more than one method. Only 14 of the 128 had a W or G method. Five of the six W rows (H24,
H112, H117, H125, H126) were plants by a reviewer who already suspected the hole. The sixth, H119, was found by the 2e
draft class gate with no reviewer involved. It is the one mechanical find so far, and the model for M1.

## 3. Root causes and the rule each lacks

Each group states, in one sentence, what was assumed and is false, then the general rule.

**G1. Excuse identity: an excuse matched a coarser key than the fault.**
Rows: H6, H7, H8, H40, H92, H115, H116, H118, H119, H141, N1, N2, N3, N4.
What was assumed: "a known failure is recognisable by its kind". The keys used were text, kind, count, operation,
lane, a runtime report and a shared machine id.
The rule: *every excuse names the exact item it excuses.* For an Attempt, that is its id. For an item with no
Attempt, it is the suite-minted item, meaning the step and the item's own fact. For a case, it is the case id, the
check and the Invariant. An excuse never matches by text, prefix, count, operation or a runtime report. A sweep must
prove that one fresh fault on any other item fails. Keys must be unique per runtime and per mix: no two fixtures in a
mix may share a machine id.

**G2. Excuse lifecycle: an excuse was checked one-sided, or somewhere other than where it is played.**
Rows: H15, H19, H36, H50, H51, H54, H96, H99, H100, H122, H144, H148, N8, N9, N10, N11.
What was assumed: "a row that still fails somewhere is still right".
The rule: *every excuse is two-sided and lives where its subject runs.* It fails when unneeded, and the test is per
item, not per row. It fails when its owner is closed, and it fails when no machine gate plays its scope. An excused
run still meets every other gate rule, such as skipped answers. Every excuse list (owed, regressions, production,
limits, triage, report truth, fixture gaps, not-yet, pair owners, D5 fields) obeys the same three rules.

**G3. Universe: a gate judged a smaller set than its rule names, silently.**
Rows: H4, H11, H14, H32, H47, H49, H114, H117, H124, H126, N12, N13, N14, N15.
What was assumed: "a gate's input list is its rule's universe". The lists actually used were seeds 1 to 6 out of 12,
production fixtures only, no statics, no GEN runs, model-mutation pilots at seed 1, and the first failing run only.
The rule: *every gate declares its universe as data.* It reports judged plus dropped, with a typed reason for each
drop, and that must equal the universe its rule names. A gate over zero items, or with an unexplained drop, fails.

**G4. Checks that cannot fail.**
Rows: H3, H10, H13, H17, H20, H21, H22, H23, H24, H27, H28, H35, H98, H103, H106, H107, H108, H125, H145.
What was assumed: "a check that is green and plausible is a check". The failures were a self-comparison, a
hard-coded zero, a greater-or-equal bound, a grep, an empty walk, a plant of its own copy, and a count equal to
today's count.
The rule: *every judging function and gate is killed by a planted wrong input, through the real function on real
data, and the plant is kept as a mutant that is re-run whenever the suite changes* (skill:policy-testing, "Make every
check able to fail").

**G5. The catch predicate: "caught" has several definitions, and some are loose.**
Rows: H1, H37, H42, N16, N17, N18.
At HEAD there are at least five:

- falsify uses oracle plus an Invariant substring;
- `mutate` uses any oracle or cite;
- liar uses any Fail or Timeout;
- probes use any non-pass;
- `kills` uses `^(caught|red)`.

The rule: *there is one catch predicate*, (check, Invariant) found among a run's structured violations (R6). Every
gate that counts a kill uses it: falsify, liar, probes, core mutants, kills, the limits and owed holds. A Timeout or a
defect is never a catch.

**G6. Unknowns, claims and unjudged reports: what the suite did not know was turned into a definite value, a credit
or a silent skip.**
Rows: H9, H29, H31, H41, H110, H111, H112, H127, H128, H129, H130, H131, H132, H133, H134, H136, N5, N6, N7, N20.
What was assumed: "unknown can default". The defaults were `null`, `0`, a sentinel, the old value, a wildcard key,
the runtime's channel, a skipped report kind, and credit taken from a cite or a claim.
The rule: *an unknown is a typed value, never coerced.* On the model side it widens to "any allowed". Each place
where it widens is counted in one ledger, and the gate requires zero or an owner. 2b's `Undecided` does this for
guards and delays only. A report the compare cannot apply is refused or counted, never dropped. Credit and reach come
from executed facts only.

**G7. Baselines and records: a gate writes, or trusts, the record it compares against.**
Rows: H2, H5, H34, H38, H95, H105, H113, H135, N19.
The rule: *a baseline is read-only to the gate that reads it.* Updating it is a separate, logged command that refuses
a "pass" signature. Every record carries the revision it was produced at, and a gate refuses a stale one. Reads fail
closed only on the expected error.

**G8. Text as data: cites, verdicts and labels were matched as strings.**
Rows: H16, H25, H26, H30, H33, H48, H93, H97, H104, H109, H121, H123, H142, H143, H146, N21, N22.
The rule: *cites are typed references resolved at load, and verdict items are Schema fields* (Spec I43, Q11). No
judging code reads `why`. A lint bans `.why.includes`, `.split(" | ")` and label regexes under `runner/`, `parts/` and
`limits.ts`. H25, H26 and H30 are declaration or record mismatches of the same kind, data checked by eye.

**G9. Reach: the generator and the fixtures never make the move.**
Rows: H12, H18, H102, H137, H138, H139, H147, and the 35 survivors H57 to H91.
This is not a judging hole, but it is found by the same machinery, because a mutant survives on "none".
The rule: *every Spec table cell and every core mutant is reached by a generated run, or is owed.* The adversary (2d)
and the stress profile own this.

**G10. The model or an oracle disagrees with the Spec.**
Rows: H39, H46, H52, H53, H94, H101.
These were found by shrinking reds. They are false reds, not false passes, and they are caught today when a red is
replayed and its wrong side named. Keep that process as it is. A second model family reading a sample (T45) is the
existing guard.

Rows H120 and H140 are notes, not holes. Every row in section 2.1 sits in exactly one group.

## 4. What is still missing at HEAD

Each status below is Enforced, Partly or Nowhere. "Unreviewed" lists the parts of the suite with the same shape
that no review has read, which is where the next holes are most likely.

**G1, exact excuse identity: Partly.**

- Part owed rows are keyed by subject (`parts/play.ts` `excuse`, HEAD), but the kind is read from a space
  (`dsl/lifecycle-model.ts:382`). Lane subjects are counted, not identified (2e found that a plant spends a listing).
- `regressionsOwed` holds GEN-pay-search-25 by text: `runner/parts-gates.ts:235-242` calls `limits.ts:42-50`
  (`why.includes`).
- `productionOwed` holds a case if its first failing expectation cites the Invariant (`limits.ts:42-45`).
- Unreviewed:
  - N1 `turn/credits.ts:21-27`: a runtime `Issue` with no ending switches off Turn R2 for every live actor in the
    step. This is an excuse taken from a report, against "Excuse only what the harness observed".
  - N2 `write-lanes/ending-channels.ts:288`: `cancels.has(operation)` excuses an unknown `Cancelled` on any Attempt
    of the operation for the whole boot.
  - N3 `ending-channels.ts:373`: `booted` is any `Ensured`.
  - N4 `limits.ts:103-124`: the unowed-Incarnated limit lives in `dsl/compare.ts:153-164`, which every runtime uses.
    So production has a stated limit, against R2 and I35, and its mutant is required to survive
    (`runner/modes.ts:446-460`).

**G2, two-sided excuses: Partly.**

- Ghost rows fail (`parts/play.ts` `partFaults`), triage flags stale rows (`core-mutants-triage.ts:313-336`), and
  not-yet rows are two-sided with a `wk` owner (`coverage.ts:339-344`, `runner/specs.ts:53-62`).
- Missing:
  - `heldBy` passes when any one subject breaks (N8). In `parts/owed.ts:34-39`, three of four listed Attempts could
    stop failing unseen.
  - Owed scripts return before the skipped-answers rule (N9).
  - A triage row's `owner` and `rule` are never checked against an open Task or a real Invariant
    (`runner/core-triage.test.ts:38-42` checks only the shape of `rule`) (N10).
  - `reportTruth`, `fixtureGaps` and `FIXTURE_GAP_CAP` are never re-run, and the cap counts names, not greens
    (`suite.ts:139-205`, `runner/modes.ts:122-132`) (N11).
  - `ownsRows("review")` is still true (`coverage.ts:35`); `coverage.test.ts:10` is Q34's intended red.
- Unreviewed: `turn/remainders.ts` holds free-text `owed` with a Partial standing that nothing compares with the cases
  (`coverage.ts:310-321`).

**G3, declared universes: Nowhere as a rule.** Each gate filters on its own terms:

- `gateScripts` uses seeds 1 to 6 (`parts/records.ts:194`). The owed scripts at seeds 7 to 12 are judged only by a
  vitest (`parts/play.test.ts`, 2c), not by a machine gate.
- The production suite drops scenarios whose fixtures production lacks, with no count printed
  (`runner/gates.ts:38-41`, N12).
- No gate runs production statics (`runner/main.ts:109-110`, H11; owner T17).
- No gate runs the GEN seeded and exhaustive runs; `suite round-14` has no `--generated` (`runner/main.ts:95-106`,
  `runner/gates.ts:80-117`, N13). R22 says round-14 hosts them.
- Two serialize regressions are dropped from the production replay with no line printed
  (`runner/parts-gates.ts:208-215`, N14).
- Model-mutation pilots run at seed 1 and silently drop failing pilots (`parts/model-mutation.ts:204-232`, N15).
- Falsify judges only the author's chosen cases at seeds 1 and 2 (`runner/run.ts:13`), and only the first failing run
  is kept (`runner/run.ts:161-177`, Spec Q5, Q11).

**G4, killable gates: Partly.** Self-tests exist for owed, triage, limits, matrix, pairs and the compare
(`parts/owed.test.ts`, `limits.test.ts`, `dsl/lifecycle-step.test.ts:653-781`). Missing:

- No test reaches `judgeProbe`, `liarOne`, `redLine`, `kills`, `shrink`, `regressions`, `statedVerdict`,
  `coverageOf`'s gap classes, `reportOnly` or the production falsify verdict.
- `fieldGate` still ignores `noticed` (HEAD `parts/model-mutation.ts:265-277`). The builder's working tree is
  changing it.
- `model-mutation.test.ts:39` hard-codes the field count.

**G5, one catch predicate: Nowhere.** There are five definitions (group G5 in section 3):

- `runner/falsify.ts:158-204`;
- `runner/mutate.ts:66-93`;
- `runner/falsify.ts:407-456`;
- `runner/falsify.ts:371-384`;
- `runner/modes.ts:284`.

`mutate` sets `expects: "Turn I2"` and never reads it (`runner/mutate.ts:145-148`).

**G6, counted unknowns: Partly.** D16 makes keys and delays `Option`, and 2b counts undecided guards and delays.
Missing:

- Wildcard matches on an unknown key are not counted (`turn/credits.ts:166`, `write-lanes/idle-guard.ts:41`,
  `actors/disposal.ts:300`; N20, H134).
- Unknown update fields keep their old value (`parts/derived-folds.ts:255`).
- Unreviewed:
  - `dsl/compare.ts` drops several reports without applying or refusing them (N6): a repeat or live-actor
    `Incarnated` (:163), `Finished` on a non-live actor (:195), `Evidence` other than Released and Superseded
    (:407-409), and `Issue` codes other than two (:411-418). Spec R19 says a report "matches an owed or allowed item
    or is refused".
  - Where the suite has no answer, the report's own channel becomes the `End` move (:326-334, N7). That branch is
    consistency-only and its doc does not say so (R4, I7).
  - Production's `Ended.failure` is always none (`adapters/production.ts:215`), and `failureKept` and `reasonRight`
    accept anything on none (`ending-channels.ts:163-179`, N5). That is Q8 on production, which R2 forbids.

**G7, read-only baselines: Nowhere.**

- `writeMatrix` writes before it returns `lost` (`runner/matrix.ts:49-63`).
- `kills` reads `catch-sweep.prototype.tsv`, which `falsify --sweep` rewrites.
- `regressions --record` saves `by: "pass"` (`runner/modes.ts:413-417`).
- `gates.json` keeps old revisions per verdict and is at `9f2a84ef`, not HEAD.
- The golden's SHA moves by editing a constant, with no ruling required (`parts/golden.test.ts:51`).

**G8, typed cites and verdicts: Partly.** D18 moved runtime cites to `c.expect`, and `Mismatch` carries `cites`.

- Still text:
  - falsify's judge (`runner/falsify.ts:171`);
  - the matrix (`runner/matrix.ts:22`);
  - limits (`limits.ts:46`);
  - `unowedFailures`;
  - the builder's new `parts/adversary.ts:317` (uncommitted), so the class is recurring in new code.
- Spoofable: `runner/falsify.ts:129` takes the first `VERDICTS` line, while `runner/gates.ts:50` takes the last
  (N21).
- The `citations.test.ts` guard misses `eq<T>` and labels built in helpers (H123).

**G9 and G10.** These are owned by the adversary (2d), T18, T19 and T54, and are not repeated here.

## 5. Mechanical hole finding

Each proposal below gives what it is, what partly exists, what it costs, and what it would have caught among the
128. Costs are for the parallel 4 this machine allows.

**M1. A planted-fault sweep (the class gate).**

- **What it is:** for every played script, at every seed (build 1 to 12, held-out 101 to 112, kept regressions), and
  for every check that has an owed row or could produce one, a wrapper oracle adds one synthetic violation. It plants
  three kinds:
  - a fresh item, meaning an Attempt or step no row names;
  - an owed item past its exact identity, meaning the same Attempt under another check, or a different item on the
    same lane;
  - a plant at a random step before and after the real owed break.
- **What must happen:** the gate function that judges the script (`partFaults`, the regressions replay) must fail
  for every plant. A plant that passes is a hole.
- **What partly exists:** the 2e draft class gate (L, resume 2e) and re-check 2's hand plants (R2 section 2).
- **Cost:** about 200 lines in `parts/`. About 160 scripts times 3 plants, each one production replay of about
  0.1 to 0.5 s, comes to 1 to 4 minutes. It is cheap enough to be a machine gate.
- **Would have caught:** H8, H40, H115, H116, H117, H118, H119, H121, H141, N8 and N14 (11), each without a reviewer.
  It would also catch any later key regression.
- **Gotcha (from 2e):** the plant must not be able to "spend" an excuse. So M1 requires G1's exact identity: with a
  lane listing keyed by count, M1 is red by design.

**M2. Mutation of the suite's own judging code (the gate mutants).**

- **What it is:** generalise `runner/mutate.ts` and the `lifecycle-step.test.ts` source mutants to the judging
  modules:
  - `parts/play.ts` (excuse, `partFaults`, `heldBy`, `judged`);
  - `parts/owed.ts`;
  - `runner/parts-gates.ts`;
  - `runner/modes.ts` (liar, limits, regressions, kills, crash);
  - `runner/falsify.ts` (`judge`, `judgeProbe`, `liarOne`);
  - `core-mutants-triage.ts`, `coverage.ts`, `limits.ts`;
  - `parts/model-mutation.ts` `fieldGate`, `parts/pairs.ts`, `parts/features.ts`, `runner/matrix.ts`.
- **The operators:** the six existing ones plus `some`/`every`, `filter` to identity, `return []`, `includes` to
  `true`, `>`/`>=`, `?? 0`, deleting one `||` arm, and a constant limit or bound.
- **The kill:** each mutant runs the judging self-tests plus the gate over a frozen set of recorded runs, built
  from M1's plants and a null runtime. It is killed by a named self-test or a gate fault. A survivor is a hole, and
  needs a fix or a triage row (the same `triageFaults` machinery).
- **What partly exists:** core mutants (`src/core` only) and the 37 compare and owed source mutants.
- **Cost:** about 150 lines, reusing `coreMutants` and `controlFaults`. Roughly 15 files and 400 to 600 candidate
  lines take 1 to 2 hours. Run it when the judging modules change and at each suite Task's close, not at every
  checkpoint.
- **Would have caught:** H1, H3, H10, H13, H17, H20, H21, H22, H24, H27, H35, H37, H42, H98, H107, H125, H145, N8,
  N9, N16, N17 and N18. That is 22 rows, nearly all of G4 and G5.

**M3. The universe ledger (inventory by type).**

- **What it is:** every gate returns `Universe { rule, all, judged, dropped: [{ id, reason }] }`. Here `all` comes
  from the rule's own generator: every seed's scripts, every scenario, every static, every regression file, every
  model field. `reason` is a closed union, such as `NotBooted(fixture)` or `OwedTo(task)`.
- **Its check:** a type and a unit test require `judged ∪ dropped = all`, judged greater than zero, every drop
  printed, and every excuse's scope inside some machine gate's `judged`.
- **Per-check input inventory (the Epic's "input inventory"):** each oracle declares `reads: ObservationTag[]`. A
  lint checks the tags against the code, and a test requires a liar or lie mutant for each read tag.
  `dsl/dataflow.test.ts:46-78` lies on 3 of 15 kinds today.
- **Cost:** about 250 lines plus one field per oracle; seconds at run time.
- **Would have caught:** H4, H11, H14, H32, H47, H49, H114, H117, H124, N12, N13, N14 and N15. That is 13 rows,
  all of G3.

**M4. Structured verdicts and one catch predicate.**

- **What it is:**
  - `CaseVerdict.Fail` carries `violations: [{ check, invariant, subject, step, seed }]` and `mismatches: [{ label,
    cites, step }]` (Spec I43; closes Q11's fields);
  - one `catches(key, verdict)` used by every gate in G5 and by every excuse hold;
  - a lint bans reading `why` under `runner/`, `parts/` and `limits.ts`;
  - the runner keeps every failing run.
- **Cost:** medium: a Schema change, about 10 call sites, and the human form re-derived from the fields. It replaces
  code rather than adding it.
- **Would have caught:** H1, H8, H37, H40, H42, H104, H121, H142, H143, H146, N16, N17, N18, N21 and N22 (15), by
  making them impossible to write.

**M5. One excuse registry.**

- **What it is:** `Excuse { scope, key, check?, invariant?, item, owner, why }`, where `scope` is one of
  `Script | Case | Mutant | Invariant | Pair | Field | Limit`. It holds every list in G2, and one `excuseFaults`
  checks for each excuse:
  - the item was used;
  - the owner is open (`wk`);
  - the scope is judged (from M3);
  - a `Limit` is prototype-only (R2, I35).
- **The Spec change it needs (proposed):** a Requirement for production's owed reds, the twin of R22. Each row names
  a script or case, a check, an Invariant, an exact item and an open owner. A run verifies every row, and every
  break that is not excused fails.
- **What partly exists:** `triageFaults`, the not-yet staleness check, pair-owner staleness, the planned "one `Owes`
  list" (L resume 5, Q8 and Q17), and the D5 owners.
- **Cost:** medium to large, but it deletes per-list code in seven places.
- **Would have caught:** H15, H19, H36, H50, H51, H54, H96, H99, H100, H144, N4, N8, N9, N10 and N11 (15).

**M6. Metamorphic and report-kind sweeps.**

- (a) **Report-kind sweep:** forge every Observation tag in every model phase that a recorded run reaches. The
  expected verdict is the table's (refused or allowed). A forge whose verdict does not change, with no table cell
  allowing it, is a silent branch.
  - This extends the adversary (2d) from its refusal cells to every tag, including `Incarnated`, `Finished`, every
    `Evidence` kind and every `Issue` code.
  - Cost: small on top of 2d.
  - Would have caught N1, N2, N3, N6 and N7, and H139 in part.
- (b) **Rename relation:** rename every actor id, machine id and Attempt prefix consistently in a script and its
  fixtures. The verdict multiset must be equal modulo the rename.
  - Cost: medium (a rename over scripts and fixtures).
  - Would have caught H92, the only collision so far. Worth it later, not now.
- (c) **Seed relation:** each M1 plant must be caught at every seed. This comes free with M1.
- (d) **Order and split:** Spec T17. Already planned, and no hole in the inventory needs it.

**M7. Baselines no gate writes.**

- **What it is:** a gate mode never writes a file it reads. `--record` is a separate command, and it refuses a pass
  signature and a shrinking baseline. Every record carries `revision`, and a gate refuses a mismatch.
- **Cost:** small. It is enforced by a test that runs each gate on a read-only copy.
- **Would have caught:** H2, H5, H34, H95, H105 and N19 (6).

**M8. The unknown ledger.**

- **What it is:** widen 2b's `Undecided` to keys, update fields, labels and compare branches with no suite answer
  (N7). The gate requires the count per place to be zero or owned.
- **Cost:** small to medium.
- **Would have caught:** H112, H128, H130, H131, H133, H134, H136 and N20 (8). H112 would have been caught as a
  count, before any red.

**What already exists, and its limits.**

| Machinery | Limit |
| --- | --- |
| falsify | author's cases, seeds 1 and 2; substring catch; production lacks the every-check line |
| liar | any red counts; report truth and fixture gaps never re-run |
| core mutants | `src/core` only, six operators; kill not tied to the expected check |
| held-out seeds | parts only; only `partFaults`; matrix, pairs and model mutation never see them |
| compare source mutants | `lifecycle-step.test.ts` only |
| dataflow lies | 3 of 15 kinds |
| the adversary (2d, in progress) | refusal cells only |
| 2b `Undecided` | guards and delays only |

**What each class minimally needs:**

| Group | Minimum mechanical check |
| --- | --- |
| G1 | M1 plus exact identity |
| G2 | M5's `excuseFaults` (M1 covers part rows) |
| G3 | M3 |
| G4 and G5 | M2 plus M4 |
| G6 | M8 plus M6a |
| G7 | M7 |
| G8 | M4's lint |
| G9 | the adversary plus core mutants |
| G10 | the existing replay-and-name-the-wrong-side, and the T45 second reader |

**Worth the cost?**

- Worth it: M1, M3, M4 and M7. Each is cheap and closes a whole class by construction.
- Worth it, but not per checkpoint: M2, which is the only check that measures the gates themselves; M5, because it
  deletes more code than it adds.
- Small on top of 2d: M6a.
- Deferred until a second collision shows up: M6b.
- Machinery for round-14's limits, fixture gaps and prototype probes should get no new investment, because it retires
  in T53. Fix only verdict-breaking parts.

## 6. Recommendation: one design for the judging machinery

**The design (proposed).** Judging becomes four pieces, and each gate is built from them:

1. **A verdict made of facts (M4).** Every run yields typed violations and mismatches with check, Invariant, item,
   step and seed. `why` is presentation only.
2. **One catch predicate (M4).** `catches(key, verdict)` is the only way any code asks whether a check failed. It is
   used by falsify, liar, probes, core mutants, kills, holds and excuses.
3. **One excuse registry (M5).** Every exception the suite grants is an `Excuse` naming its exact item and an open
   owner. `excuseFaults` makes it two-sided. A stated limit is prototype-only, and production's owed reds get their
   own Spec Requirement.
4. **A declared universe per gate (M3).** Each gate reports judged plus dropped equal to all, and every excuse's
   scope lies inside a machine gate's judged set.

Two checks prove these pieces: M1, a planted-fault sweep on every checkpoint, and M2, gate mutants at each change to
the judging code and at Task close. Two smaller rules come with them: M7 (read-only baselines) and M8 (the unknown
ledger, which takes M6a's report-kind sweep through the adversary).

Against section 3:

- G1 is closed by pieces 1 and 3 together with M1;
- G2 by pieces 3 and 4;
- G3 by piece 4;
- G4 by M2;
- G5 by piece 2;
- G6 by M8 and M6a;
- G7 by M7;
- G8 by pieces 1 and 2 and their lint.

**What it means for the rest of the system:**

- **T53:** round-14's limits and liar exclusions shrink to the registry's `Limit` scope and retire with it.
- **T59:** wiki reads stay out of the registry. Owners are resolved through `wk` as they are today until T59 moves
  them into the package.
- **The bench:** unchanged.
- **The Spec:**
  - add one Requirement for production's owed reds, with its Invariants and tests;
  - mark I43 and Q11 closed once M4 lands;
  - add an Invariant: "every gate's judged plus dropped equals its rule's universe";
  - add a T-row for M1 and one for M2.
  - The Spec edits go through the Spec-contradiction rule and the spec log.

**What the T52 builder should build now.** This is scope for T52 step 2's held item 2e, in this order:

1. **Owed rows with exact items.** `OwedItem = Attempt { id } | Item { lane, step, fact }`. There are no counts and
   no space-split. The suite mints the item for an Attempt-less break from its step and fact, so the 2e "spent
   listing" problem disappears.
   - `heldBy` requires every item to break, which fixes N8.
   - Owed scripts still meet the skipped-answers rule, which fixes N9.
   - `regressionsOwed` and `productionOwed` move into the same list. GEN-pay-search-25 plays through the part
     player (the 2e draft), and `Played.threw` replaces text matching, which removes `limits.ts:46` from the owed
     path.
2. **M1 as the class gate,** over `playedScope` plus the kept regressions. It must be red on the current code (the
   lane plant is the red first) and green after item 1.
3. **M3 for the parts, held-out and regressions gates only.** Every owed script is played by a machine gate: the
   parts gate plays every owed script at every seed. Dropped regressions are printed with a reason.
4. **Tell the adversary's owner (2d)** that `parts/adversary.ts:317` repeats the text match. It should use the
   kept-violation fields that item 1 already needs.

**What becomes a later suite Task** (proposed: "The suite's judging machinery converges", after T52 and before T53's
audit). Under the stopping rule, each item lands now as an owed row or pending check:

- M4, the structured verdict and one catch predicate, which also fixes the liar, probe, kills and mutate predicates;
- M5, the whole registry, with the new Spec Requirement and with N4 (limits out of the shared compare, or
  prototype-only);
- M2, the gate-mutation gate;
- M3 for every other gate (production statics with T17, the GEN runs, the production fixture filter, model-mutation
  seeds);
- M7 and M8;
- M6a as part of the adversary's close;
- the oracle findings N1, N2, N3, N5, N6 and N7, each as a pending check first.

## Sidecar log

Four Haiku sidecars (effort high, read-only):

- inventory from the review files;
- existing mechanical checks;
- a blind sidecar given only Conformance.spec and the suite code;
- excuse and tolerance sites.

The lead re-read each cited line at HEAD, using `git show HEAD:` for the four files the builder has edited.

| Sidecar | Finding | Result |
| --- | --- | --- |
| inventory | 148 rows H1-H148 | accepted; five rows spot-checked (H1, H35, H92, H115, H117) against their files |
| inventory | D7-D11 not in scope | accepted: defined in the requirements file, not needed here |
| mechanical | falsify: author's cases, seeds 1-2, substring judge | accepted (`falsify.ts:158-204`, `run.ts:13`) |
| mechanical | liar red = any Fail/Timeout | accepted (`falsify.ts:407-456`) as N16 |
| mechanical | liar NoVerdict printed GREEN | changed: fails the gate (`falsify.ts:460-461`); a label only |
| mechanical | `coverage.test.ts:10` is a bug | rejected: Q34's intended red (L, build review item 2) |
| mechanical | core triage owner unread | accepted (`core-triage.test.ts:38-42`) as N10 |
| mechanical | `satisfies Record<string,…>` keys unchecked | accepted as G8 data-by-eye; not listed separately |
| blind | 1 compare drops unowed reports | accepted (`compare.ts:163, 195, 267, 407-418`) as N6 |
| blind | 2 report supplies the End | changed: only where the suite has no answer; consistency-only, undocumented (N7) |
| blind | 3 production failure none | accepted (`production.ts:215`) as N5 |
| blind | 4 cancel by operation; boot by Ensured | accepted (`ending-channels.ts:288, 373`) as N2, N3 |
| blind | 5 stated limits admit contradicting values | changed: the fault is scope; it reaches production (N4) |
| blind | 6 production drops cases by fixture | accepted (`gates.ts:38-41`) as N12 |
| blind | 7 no gate runs production statics | accepted; already H11 (owner T17) |
| blind | 8 GEN seeded runs in no gate | accepted (`main.ts:95-106`) as N13 |
| blind | 9 liar exclusions by name | accepted as N11 |
| blind | 10 owed Invariants counted as covered | rejected: coverage prints owed apart (R12 met in output) |
| blind | 11 production falsify has no every-check line | accepted; listed under section 5's table |
| blind | 12 owed subjects from recorded output (R5) | rejected as R5: a known-failure list, not an expected value |
| blind | 13 part runs have no time bound | changed: `overdue` is Turn I12; the wall bound is unverified, noted |
| blind | 14 field gate ignores noticed | accepted; already H35 |
| blind | 15 kills by count | accepted, low: `kills` is in no gate (N18) |
| blind | 16 core kill rule loose | accepted; already H42 |
| blind | 17 baselines rewritten | accepted (`matrix.ts:49-63`) as N19 |
| blind | 18 regression recorded as pass | accepted (`modes.ts:413-417`) in N19 |
| blind | 19 probes count any red | accepted (`falsify.ts:371-384`) as N17 |
| blind | 20 null counts defects | accepted; already Spec Q2 |
| blind | 21 first vs last VERDICTS line | accepted, low, as N21 |
| excuse | Attempt subjects unlimited | rejected: D17 decided the Attempt is the key |
| excuse | `heldBy` any subject | accepted as N8 |
| excuse | owed scripts skip answers check | accepted as N9 |
| excuse | serialize regressions dropped | accepted as N14; round-14's regressions gate still replays them |
| excuse | `refusedTurn` disables R2 by an Issue | accepted (`credits.ts:21-27`) as N1 |
| excuse | unknown-key wildcards | accepted (`credits.ts:166` and two more) as N20 |
| excuse | slices hard-coded, `indexOf` table markers | noted: wiki parsing, T59's scope |
| excuse | `remainders` free text | accepted; section 4, G2 unreviewed |
