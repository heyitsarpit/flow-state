# T52 requirements: Pay and Cells generated, hand traces thinned (2026-11-14)

**Bottom line:** 34 requirements (Q1 to Q34), each written as a check that is red at the commit that adds it,
each naming the wrong build that must keep it red. Every acceptance item, Approach item, gap and comment of
@task.V3.T52, and every item routed to it, maps to one of them (table at the end). Four read-only Haiku sidecars
gathered them (Specs and Plans, code and prior art, open findings, adversary); their items are logged at the end.
Decisions marked "agent" are the building lead's, each with why and how to reverse it; scope stays as recorded.

**Read first:** @task.V3.T52, @spec.Conformance R15, R19, I46, I61, T39,
code:wiki/plans/flow/references/proposals/conformance-phase-out-2026-11-11.md (step 4, V1 to V4),
code:wiki/plans/flow/references/proposals/t47-close-review-2026-11-14.md (R4, R6, R7, R11).

## Settled facts (verified by the lead at 73227314)

- `referenceOf` (`conformance/parts/reference.ts`) already derives rows, handler tables, schedules, operations and
  folds from `Compiled`; `parts/reference.test.ts` compares only machine, states, five operation fields, handler
  targets, state and idle guards, `updates`, and rows. Schedules, `persist`, `releasesOnLeave` (hard-coded `[]`),
  `opaque`, `index`, event names and `classify` are not compared, and `referenceOf` carries no `classify`.
- Pay and Cells share the machine id `Checkout/Pay`; a case listing both gets Cells' table for it, and an app mix
  over every part would hold both (Compile I14: machine ids are injective in an App).
- `machines/pay.ts:3` imports `src/machine.ts` (`MachineBody`), which the `fixtures/` layout check refuses.
- The 14 `STEP_MUTANTS` (`dsl/lifecycle-step.test.ts`) edit model code (`lifecycle-owed.ts`, `compare.ts`), not a
  field of `rules`; cell mutation (`parts/model-mutation.ts`) cannot reach them. Mutants 5 to 8 need a non-empty
  `releasesOnLeave`, which no real machine has.
- The pilots notice 36 of 327 model fields; `fieldGate` passes on any field that has a mutant.
- `lifecycle.test.ts` requires every other outcome of every cell, deadline and promotion rule to be killed by a
  trace; a trace can go only where its kills are made elsewhere.
- T45 is done (its search: `generated.ts`, exhaustive and seeded runs over hand fixtures); liar round-14 is
  126/126 with 9 fixture gaps left out (`suite.ts` `fixtureGaps`, cap 9), each still naming T47 as owner.

## Decisions (agent)

- **D1 Pay on round-14.** Pay's and Cells' parts run on production and the model only (R22, I48); the frozen
  hand cases keep running on round-14, judged by the derived reference. Why: the Task text ("every runtime,
  round-14 included") and I48 both hold under this reading. Reverse: run the hand cases with the golden on
  round-14.
- **D2 One owed list.** One `Owes` row type (subject: an Invariant or a Plan feature id; `clause`: `all` or the
  owed text; `task`; `why`) replaces `NotYet`, `Remainder` and `Feature.owed` in one list; a feature row's slice
  is derived from its Task. Why: the orchestrator's A3 ruling (T52 comment, 2026-11-12) post-dates the Task text
  "become matrix rows"; changed after Fable's read (keeping `Feature.owed` would reverse A3). Reverse: restore
  `not-yet.ts`, the remainders and `Feature.owed`.
- **D3 Step mutants.** The 14 hand step mutants stay as a list until each is shown killed; each is judged by the
  search (generated scripts replayed through the mutated model) first, then by a kept example, and the killer is
  recorded. A kept example of `lifecycle-step.test.ts` counts as a kept trace: it is a hand model trace of one
  step. Mutants 5 to 8 need a non-empty `releasesOnLeave`, which no real machine has, so they die only by kept
  examples. Why: no cell of `rules` holds them, so "gives way to cell mutation" cannot mean a one-to-one cell.
  Reverse: judge by examples only.
- **D4 Trace thinning.** A trace is deleted when every model mutant it kills is killed by a kept trace or by the
  search; a kept trace either kills a mutant nothing else kills or names the ruling it documents. Why: it keeps
  `lifecycle.test.ts`'s kills (no lost catch at the model). R15's "apart from those that record a ruling" loses
  those catches, so R15 is edited, with a spec-log line, in the step that thins the traces (Spec-contradiction
  rule: the reading that loses no ending). Reverse: restore the traces from git and R15's sentence.
- **D5 Strict field gate.** A model field the search does not notice fails the gate unless an owed row names it
  with an open Task (routed-gap rule); a noticed field with an owed row, an owed row naming no field and an owed
  row whose Task is not open fail too. Each unnoticed field is owed, by group, to the open Task whose scope adds
  the part or production feature that reaches its cell: the lane-policy rows to @task.V3.T18, write-ahead and
  storage-refusal rows to @task.V3.T19, restore and boot rows to @task.V3.T20, the ledger's lives (Kept, Maybe,
  Parked, Delivering) to @task.V3.T54, and Runtime disposal rows to @task.V3.T55; the step lists every group. A
  Task cannot close while a row names it (Q34). Why: I61 and T39 as edited 2026-11-14; deleting 291 fields (R19's
  alternative) would cut the model's tables. I61 is not edited. Reverse: `fieldGate` as at 73227314.
- **D6 Folds.** Derived folds replace hand folds without a pointwise comparison; V1 (no lost catch on both
  runtimes) judges them. Why: folds are functions; the derived ones run the machine's own closures (F3), and
  the hand `clientSecret` fold is wrong (the contract maps a missing secret to `""`, `pay.contracts.ts`
  `confirmed`). Reverse: compare folds over a label grid.
- **D7 One machine id per App.** Cells keeps Pay's id, since round-14 boots both as `Checkout/Pay`; an app mix
  holds at most one part per machine id (Cells stays out of the mix), and `referenceFor`, `handlersFor` and
  `rowsFor` refuse two fixtures with one machine id as a defect. Why: Compile I14; a second id would break the
  frozen Cells cases on round-14. Reverse: give Cells its own id and its own round-14 fixture.
- **D8 The golden is a vitest check.** It compares two suite-owned values and runs no implementation, so it is not
  a static case under R14 (no null, no mutant); its content is pinned by a hash (Q32). Reverse: make it a
  static case with a null surface and a mutant.
- **D9 The nine liar fixture gaps.** They are round-14 mutants whose fixtures' `No`, `Unsure` and `NotSent`
  handlers change nothing a world read sees; parts run on production only (R22), so no part of T52 reaches them.
  They move to @task.V3.T53, which retires round-14 only once each Invariant they prove is proved on production
  (R22). Why: T47 is done, and T52's parts cannot reach a round-14 mutant. Reverse: name T52 and add a hand
  fixture whose handlers change the leaf.
- **D10 Liar's own baseline.** Liar as a mode of one mutation gate with no baseline of its own (consult B9) goes
  to @task.V3.T53 with round-14's liar run; production's liar is already falsify's mode. Reverse: build it here.
- **D12 The app mix stays the pilots'.** `mixed` holds sync, transfers and sign-in; Pay joins the mix later as
  its own new mix, whose first-contact reds need triage. Why: the mix id names its parts, so adding Pay renames
  every kept mix script and owed row. Reverse: add Pay to `mixed`.
- **D13 Cells aborts while the charge is unsure.** The generator's belief frees a lane on any cancel, so a
  cancel of a call on the wire (which leaves the head Held) made Cells' scripts answer requests that never
  opened; aborting in `UNSURE` cancels a Held head, which the belief gets right (WriteLanes R14 cancel cell).
  Why: a generator limit, not a judge's. Reverse: offer `AbortPay` in `PAYING` once the belief models a
  cancelled call on the wire.
- **D14 Derived folds know what they do not know.** An update that reads a value the suite does not know runs
  once per probe; a field whose value differs between probes is set unknown, and any guard or key that reads an
  unknown field computes nothing. A write's key comes from the select of the alternative the suite judged ran
  (`Folds.keys` takes its place), else from every select when all agree. Why: two first-contact reds of Pay
  (a timer's commit keyed `null`; a guard read from a field an update never set) were the suite's. Reverse:
  revert `parts/derived-folds.ts`.
- **D15 Two golden readers.** The golden is read by `parts/golden.test.ts` (derived equals hand) and
  `fixtures/rows.test.ts` (hand equals round-14's compiled Pay), the two halves of V3. Reverse: merge the two.
- **D11 Retired `cancelAll` (orchestrator ruling, 2026-11-14).** LANE-03, 04, 05 and 10 stay frozen, on round-14
  only, out of production's counts, and cite WriteLanes R15 and I21 as retired, by name; the model's CancelAll
  column and its `wl(21)` refusals cite them the same way. T53 deletes them with round-14. No catch is lost and
  nothing claims a live rule. Reverse: delete them now (a V1 exception for the user).

- **D16 Unknown keys and delays are `None`.** See the build log. Reverse: revert 69bdeb98.
- **D17 An owed row holds over the run's sole failures.** A part script owes one row per (check, Invariant) it
  fails by; the run is judged to its end and fails only by rows it owes. Why: build review item 5 (resume 3).
  Limit: a second break of an owed pair on another Attempt is excused. Reverse: revert the commit after 69bdeb98.

## Requirements

Each: rule; source; check (red today); the wrong build that keeps it red.

- **Q1 Pay and Cells are parts.** `fixtures/pay/` holds Pay and Cells as parts: the machine, a user model for
  every leaf, a server model for every operation and `classify` beside it; `fixtures/index.ts` lists them.
  Source: acceptance 1, Approach 1-2, R15. Check: `parts/reference.test.ts` "every leaf has a user model" and
  "every write has a classify" over `pay` and `cells`. Wrong build: a part with no `UNSURE` user action.
- **Q2 Generated runs.** `PART-pay-*` and `PART-cells-*` usual and stress scripts play on production under the
  model and oracles, are kept in the parts gate, and are refused on round-14. Source: acceptance 1, R22, I48.
  Check: `parts/play.test.ts` over Pay's and Cells' scripts. Wrong build: scripts that skip every answer.
- **Q3 One classify.** Pay's contracts commit with the server model's `classify`, so the part declares it once.
  Source: Approach 2, R15 ("declares `classify` beside its server model"). Check: Q4's classify comparison plus a
  planted change to the server model's `classify` turning a PAY case red on production. Wrong build: a part
  `classify` that the commit never runs.
- **Q4 Derived equals hand (V3).** `partFixture(pay)` and `partFixture(cells)` equal the hand rows on: rows
  (sorted, deep), every handler alternative (target, when, idle, updates, opaque, index), schedules (id, send,
  delay, armOn, entry), `persist`, `initial`, states, event names, every operation field (concurrency, success,
  failure, unknown, keyFields, releasesOnLeave) and `classify` over every tag in the union of the server model's,
  the failure map's, the hand `classify`'s and the lost tags, each with `mayHaveApplied` true and false. Source:
  acceptance 2 and 4 (V3). Check: `parts/golden.test.ts`. Wrong build: a schedule delay changed on one side; a
  comparison keyed by one side's names. Cases reality cannot show: a tag no server answers (the union covers it).
- **Q5 V3 before deletion.** Q4 is green in a commit before any hand fixture, trace or `not-yet.ts` is deleted.
  Source: acceptance 2. Check: commit order (evidence in the step comment).
- **Q6 One frozen golden.** Pay's and Cells' hand rows and handler tables live in one golden module read only by
  Q4's test; no scenario, oracle, runner or adapter imports it. Source: acceptance 1, Approach 4. Check: an import
  walk in `parts/golden.test.ts`. Wrong build: a scenario still typed by the hand `Pay`. `PRODUCTION_ONLY` moves
  with the golden.
- **Q7 Derived for every runtime.** Every hand case and every hand-fixture generated run (`GEN-pay-*`,
  `GEN-cells-*`) names Pay and Cells by their parts' fixtures, on round-14 and production; `PART-pay-*` runs on
  production only (D1). Source: Approach 3, D1. Check: the import walk of Q6 plus `scenarioOf` resolving
  `pay` to `partFixture(pay)`. Wrong build: `generated.ts` keeping `[Pay, Cells]` from the hand module.
- **Q8 Fixture registry.** `fixture.ts` resolves every fixture the suite boots by name from one registry (parts
  and hand labs); adapters and players read it, and an unknown name fails. Source: Approach 5. Check:
  `parts/registry.test.ts`. Wrong build: a second list of fixture names in an adapter.
- **Q9 Actor view typed by the definition.** `Case.actor(part, id)` types events, payloads and memory from the
  part's definition Schemas: a wrong payload field is a type error. Source: Approach 6. Check: `@ts-expect-error`
  lines under `nub run check`. Wrong build: a view typed `Record<string, unknown>`.
- **Q10 Layout.** `fixtures/pay/` imports only `src/index.ts`, `effect` and `fixtures/`. Source: R15 layout.
  Check: `parts/layout.test.ts` (existing walk) over the new files. Wrong build: `import type { MachineBody }`.
- **Q11 Compile static cases on Pay's and Cells' `Compiled` (V4).** Source: acceptance 4. Check:
  `parts/static.test.ts` over every part, Pay and Cells included. Wrong build: Pay left out of `parts`.
- **Q12 No lost catch (V1).** Falsify on round-14 and production lose no catch in the catch matrices. Source:
  acceptance 4. Check: `falsify` with `writeMatrix`'s lost-catch failure, baseline from 73227314. Wrong build: a
  derived fold that loses a selection kill.
- **Q13 Same coverage and matrix rows (V2).** The coverage standings and matrix rows equal those at 73227314,
  apart from rows a recorded step changes. Source: acceptance 4. Check: diff of `coverage-standings.txt` and the
  matrix listing against 73227314. Wrong build: an owed row widened to hide a dropped check.
- **Q14 Step mutants still killed (D3).** Each hand step mutant is killed by the search or by a kept example; the
  killer is recorded. Source: acceptance 3, Approach 8. Check: `dsl/lifecycle-step.test.ts`, the killer per
  mutant. Wrong build: an example deleted that alone kills a release mutant.
- **Q15 Traces thinned (D4).** A trace whose kills the search or kept traces make is deleted; each kept trace
  kills a mutant nothing else kills, or names its ruling. Source: acceptance 3, Approach 7. Check: a redundancy
  gate in `dsl/lifecycle.test.ts`. Wrong build: a duplicated trace kept with no ruling.
- **Q16 Model kills kept.** Every model mutant `lifecycle.test.ts` lists is killed by a kept trace or the search.
  Source: acceptance 3, D4. Check: `lifecycle.test.ts` kill tests over traces plus search. Wrong build: a trace
  deleted whose unique kill no search run reproduces.
- **Q17 One owed list (D2).** `not-yet.ts` and the remainder lists are one `Owes` list; the coverage gate keeps
  its rules (stale, unchecked, twice, unowned). Source: acceptance 3, Approach 9, A3 comment. Check:
  `coverage.test.ts` with planted rows: a whole-Invariant row on a checked Invariant is stale; a clause row on an
  unchecked one fails. Wrong build: a row type that loses `clause`.
- **Q18 Pay's hand cases thinned.** A Pay hand case is deleted only when every mutant it catches is caught by a
  generated run or a kept case and it holds no case-only row; frozen cases leave the frozen set with it. Source:
  Approach 10, phase-out step 6. Check: the catch sweep against the kept set. Wrong build: a case deleted whose
  catch is unique.
- **Q19 Case-only files stay.** The five scenario files with case-only rows keep their cases. Source: gap.
  Check: `parts/frozen.test.ts` lists the case ids of the five files (schedules, lane-keys, payment-retry, parts,
  refusal) and fails when one is missing from `scenarios`. Wrong build: a schedules case deleted.
- **Q20 Strict field gate (R4, D5).** Source: I61, T39, close review R4. Check: `fieldGate` fails an unnoticed
  field with no owed row, a noticed field with one, an owed row naming no field and an owed row whose Task is
  not open; every group of D5 names its open Task. Wrong build: `fieldGate(modelMutants([]))` passing; 291 rows
  owed to one vague Task.
- **Q21 Owed rows match something (R6).** A part owed row, a production regression row, a core-mutant triage row
  or a pair owner that names no run, mutant or unreached interacting pair is a fault, and zero runs fail. Source:
  close review R6. Check: `parts/pending.test.ts` items moved to required. Wrong build: a ghost row passing.
- **Q22 Triage statuses (R7).** A triaged mutant that errors or times out is a fault; every triage row appears in
  the results; a mutate run over zero mutants fails. Source: close review R7. Check: `core-triage` tests. Wrong
  build: `pass 0/0`.
- **Q23 Owed cases by id (R11).** An owed `case` row is held only when the verdict's id is the row's case and its
  structured cites, set from the failing expectation's own declared cites (never parsed from its label), name the
  row's Invariant; TURN-01's case cites Turn I14 and its failing expectation declares it. Source: close review
  R11. Check: `parts/owed.test.ts`; the expectation-cites half goes red in its own step (an expectation API
  change). Wrong build: another case's verdict holding the row; a label prefix holding it.
- **Q24 Owed-row restore (Fable, widened).** A boot owes no restore to a Held head whose Attempt has any owed row
  (Kept, Refused, Owed outside disposal, Delivering, Parked): its next incarnation is delivered that row, never
  also unknown { Restored }. Source: Restore I6, R3; ruling 2; Fable's widening. Check: pending traces for a Kept
  and a Refused row move to the traces and hold. Wrong build: a fix that exempts Kept only.
- **Q25 Member order in one turn (Fable, widened).** One turn listing cancel then commit on a Held, Recapturing or
  Resending lane: the cancel releases the head at once (evidence Released) and promotes, so the commit meets Idle
  and mints; retry then cancel releases the re-send. Source: ruling 2; WriteLanes I10, T17, T20, the cancel cell.
  Check: traces per head phase; Table B's `Held·Cancel` and `Resending·Cancel` cells change from `AwaitRelease`.
  If production disagrees afterwards, the red goes to production's owner. Cases reality cannot show: production
  writes `reject` only.
- **Q26 Maybe life exact (Fable).** A row's fate in the step whose batch landed is the exact fate, not a bound;
  WriteAhead I21 and I22 leave the owed list. Source: WriteAhead I21, I22; ruling 2. Check: traces for a lost
  and a doubled delivery refused.
- **Q27a Conformance text.** Conformance Q13 cites no Reads I18; Q14 counts Codec 7 (and the other static
  counts); ending-delivery's I8 message reads the new I8; every citation of WriteLanes R10 (23) and R4 (16) is
  re-read against the new text and corrected where it claims the old rule. Source: T52 comment 2026-11-12.
  Check: Spec text and a re-check table in the review file; no code check, since the Specs are outside the
  package.
- **Q27b Retired `cancelAll` (D11).** A retired rule is cited only in its retired form ("Retired WriteLanes R15",
  alone, never inside a list of cites), in source text and in every runtime-built cite (the `wl(21)` refusals and
  the CancelAll column);
  the four frozen LANE cases run on round-14 only and are absent from production's cases. Source: orchestrator
  ruling 2026-11-14. Check: `citations.test.ts` over files and the model's runtime cites, with a non-empty walk.
  Wrong build: deleting the cites; a bare "WriteLanes I21" built at runtime.
- **Q28 Round-14 and liar.** Round-14 stays until T53 (D10 routes liar's own baseline there). Source: B9
  comment. Check: evidence at the step, no code change.
- **Q29 Gates over nothing.** The model-mutation, parts and production-regression gates fail over zero scripts.
  Source: adversary items 11, 24. Check: planted empty inputs.
- **Q30 Gates and lint.** `nub run check` zero; falsify on round-14 and production; matrix; coverage. Source:
  Task gates.
- **Q31 One machine id per App (D7).** No App, mix or case holds two fixtures with one machine id: `mixOf` over
  the parts holds distinct ids, and `referenceFor`, `handlersFor` and `rowsFor` refuse a duplicate. Source:
  Compile I14; step-1 review B1. Check: `parts/reference.test.ts`. Wrong build: Cells in the mix judging Pay's
  actor with its table.
- **Q32 The golden's content is pinned (D8).** The golden module is a byte copy of the hand `fixtures/pay.ts` at
  73227314, pinned by its SHA-256, and imports no `src/` and no `parts/reference.ts`; it changes only with a
  logged ruling. Source: acceptance 1, the Task's false pass; step-1 review B4. Check: `parts/golden.test.ts`.
  Wrong build: a golden rebuilt from `partFixture(pay)`; a hand edit copying a compiler bug.
- **Q33 Unfolded guarded sites.** The hand fixtures that stay (the lab fixtures) list every `guarded(` place with
  no fold, each owed to the slice Task that converts its lab (phase-out step 5), and the list cannot grow. Source:
  T47 requirements Q5 and c4 (F3's hand half). Check: a test that computes the unfolded places and compares them
  with the owed list. Wrong build: a new opaque hand guard.
- **Q34 A Task cannot close while owed rows name it.** The coverage, field and matrix gates fail on a row whose
  Task is not open (done or in review), and the gate prints each Task's rows and the README guarantee map from
  the one list. Source: consult A3; step-1 review M3. Check: `coverage.test.ts` with a planted done owner.
  Wrong build: a row kept for a closed Task.

## Mapping

| Task item                                                   | Requirement   |
| ----------------------------------------------------------- | ------------- |
| Acceptance 1 (generated parts; one frozen golden)           | Q1, Q2, Q6, Q31, Q32 |
| Acceptance 2 (derived equals hand before deletion)          | Q4, Q5        |
| Acceptance 3 (not-yet and traces gone; step mutants killed) | Q14-Q17       |
| Acceptance 4 (V1 to V4)                                     | Q4, Q11-Q13   |
| Approach: move, models, classify                            | Q1, Q3, Q10   |
| Approach: referenceOf for every runtime                     | Q7            |
| Approach: frozen golden                                     | Q6            |
| Approach: registry; actor view                              | Q8, Q9        |
| Approach: traces; step mutants                              | Q14, Q15, Q16 |
| Approach: not-yet rows                                      | Q17           |
| Approach: Pay's hand cases thin                             | Q18           |
| Gap: five case-only files                                   | Q19           |
| Comment 2026-11-12 (Owes, liar mode, round-14)              | Q17, Q28, Q34, D10 |
| Comment 2026-11-12 (Conformance contradictions)             | Q27a, Q27b    |
| Comment 2026-11-14 (Fable items; R4, R6, R7, R11)           | Q20-Q26       |
| Routed from T47: guarded sites; liar fixture gaps           | Q33, D9       |
| Gates                                                       | Q29, Q30      |

## Step-1 review fixes (2026-11-14)

code:wiki/plans/flow/references/proposals/t52-step1-review-2026-11-14.md: B1 is Q31 and D7; B2 is Q27a, Q27b and
D11 (the orchestrator's ruling replaces the scope stop); B3 widened Q24; B4 is Q32 and D8; M1 is Q33; M2 is in
Q27a; M3 is Q34; M4 is D9; M5 widened D5 and Q20; Q25 widened to Recapturing and Resending; D4 now edits R15;
Q7, Q19 and Q23 reworded. Routed items are done in their steps: each `pending.test.ts` check is deleted in the
commit that turns its `owed.test.ts` opposite green; the ten `parts.length === 3` checks change with Q1;
`golden.test.ts` imports `LOST` from `fixtures/part.ts`.

## Sidecar log

| Sidecar   | Item                                                         | Result                                                     |
| --------- | ------------------------------------------------------------ | ---------------------------------------------------------- |
| specs     | 1-12 layout, models, classify, V1-V4, traces, I61            | accepted into Q1-Q20                                       |
| specs     | 13-15 three Fable items                                      | accepted, Q24-Q26                                          |
| specs     | C1 Pay on round-14                                           | changed: settled by D1 from the Task text                  |
| specs     | C2 golden versus I46                                         | accepted: the golden sits outside `fixtures/` (Q6)         |
| specs     | C3 step mutants versus cell mutation                         | accepted, D3                                               |
| specs     | C4 Pay case thinning now or T23                              | accepted as Q18: the Task's Approach names it              |
| specs     | C5 rulings on old traces                                     | changed: D4 lets a kept trace stand on a unique kill       |
| specs     | C6 owed store                                                | accepted, D2                                               |
| specs     | C7 T45 dependency                                            | rejected: T45 is done                                      |
| specs     | C8 field versus cell                                         | noted: one mutant per cell, so field and cell coincide     |
| specs     | C9 derived reference versus R5                               | rejected: R15 and replan question 6 settle it; Q4 guards   |
| specs     | Q13, Q14, I21, R15, I8 still true at HEAD                    | accepted, Q27                                              |
| code      | 1 importers of the hand Pay                                  | accepted, Q6, Q7                                           |
| code      | 2 fields not compared                                        | accepted, Q4                                               |
| code      | 3 shared machine id; name-only link                          | accepted, Q8                                               |
| code      | 4 step mutants are code edits                                | accepted, D3                                               |
| code      | 5 traces feed every kill test                                | accepted, Q16                                              |
| code      | 6 owed stores and gates                                      | accepted, Q17                                              |
| code      | 7 `MachineBody` import                                       | accepted, Q10                                              |
| findings  | 1-7 contradictions                                           | accepted, Q27                                              |
| findings  | 8-10 Fable items                                             | accepted, Q24-Q26                                          |
| findings  | 11-14 R4, R6, R7, R11                                        | accepted, Q20-Q23                                          |
| findings  | 15 reach from cites                                          | noted: Pay's generated runs give reach from execution      |
| findings  | 16 duplicate Fable comment                                   | noted: the T47 builder's record                            |
| findings  | 19 five-file owner                                           | accepted as Q19: they stay                                 |
| findings  | 20 Owes, liar, round-14                                      | accepted, Q17, Q28                                         |
| findings  | 21 nine liar greens                                          | rejected: liar round-14 is 126/126                         |
| findings  | 22 later slices need generated Pay                           | accepted into Q1                                           |
| adversary | 1, 2, 4 fields not compared; golden editable                 | accepted, Q4, Q6                                           |
| adversary | 3 `HashSet` of plain objects                                 | changed: Q4 compares sorted rows deeply                    |
| adversary | 5, 6 frozen ids; hidden part keys                            | noted: the part type refuses extra keys at type check      |
| adversary | 7, 10, 11 field gate                                         | accepted, Q20, Q29                                         |
| adversary | 8, 9 walker and read logging                                 | noted: the walk counts every cell `cellsOf` lists          |
| adversary | 12, 14, 15, 16, 20, 22 owed rows                             | accepted, Q21-Q23                                          |
| adversary | 13 a code dropped from `implemented`                         | noted: R16 lets an adapter declare less                    |
| adversary | 17, 18 triage owners, kinds                                  | accepted into Q21                                          |
| adversary | 19 core kill by any Invariant                                | noted: the close review accepted `coreOutcome`             |
| adversary | 21 substring match                                           | accepted, Q23                                              |
| adversary | 23-26 pins, empty gates, `--record pass`                     | accepted into Q29; 26 noted                                |
| adversary | 27, 28 baselines from disk                                   | accepted into Q12, Q13: the baseline is 73227314           |
| adversary | 29-31 step killers; hand lists; pending count                | accepted into Q14, Q16                                     |

## Fable's read (step 1)

**Verdict (Fable, 2026-11-14):** 6 of 11 agent-ruled items agree, D2 disagrees, 4 are unclear; every sampled row,
handler alternative, schedule and operation field of the hand Pay matches `machines/pay.ts`; one hand fold is
wrong. Fable read the Specs and the code and ran nothing.

| Item                     | Fable                                  | Lead's decision                                                     |
| ------------------------ | -------------------------------------- | ------------------------------------------------------------------- |
| D1, D3                   | agrees                                 | accepted                                                            |
| D2                       | disagrees: A3 replaces `Feature.owed`  | accepted: D2 changed                                                |
| D4                       | unclear: R15 keeps ruling traces only  | changed: a kept trace names its ruling or the catch only it makes   |
| D5                       | unclear: I61 has no owed exception     | kept: owed rows hold gaps against Spec text, as in the coverage gate |
| D6                       | unclear; a hand fold is wrong          | kept: the hand `clientSecret` fold stores `null` where the contract |
|                          |                                        | gives `""`, so the derived folds are the right side                 |
| Q24                      | agrees, too narrow                     | changed: any owed row of the head's Attempt, not only Kept          |
| Q25                      | agrees: the model is wrong             | accepted: the cancel cell releases and promotes in the turn         |
| Q26                      | agrees, two conditions                 | accepted: the issuing step's batch; once per restored world         |
| Classify grid            | agrees; three gaps                     | accepted: LostButLanded, Never and Die added; both sides' tags      |
| Hand rows, table, timers | 15 rows, all alternatives, 3 of 3      | accepted                                                            |
