# T60 close review (2026-11-14)

**Verdict: ISSUES at 196edbff (check-task); two blocking findings, both small; T60 does not close yet.**
Acceptance 1 and 2 hold, each proven by a planted violation I ran. Acceptance 3 is broken for the probes: a
pending probe still holds on a defect alone. Acceptance 4 is broken for the core mutants: the new keyless rule
turned that gate red (60/98 pass before T60, 66/98 with 6 stale triage rows now), and no comment explains it. The
orchestrator's liar ruling is half right. The count of 125 is honest. But the mutant has other real catches, and
the owed route it names does not exist. Everything else is routed below.

**Read first:** @task.V3.T60, code:wiki/plans/flow/references/proposals/t60-requirements-2026-11-14.md,
code:wiki/plans/flow/references/proposals/suite-convergence-2026-11-14.md (G5, M1, M4). Range `3cfbfc08~1..196edbff`;
file:line references are at 196edbff.

## 1. How it was checked

- **Full gates mode,** run at a8f89e1e, which has the same code as 196edbff:
  - pass: suite 124/124 and 78/78, falsify 154/154 (4/4 probes) and 18/18, coverage 0 gaps, parts 77/77, held-out
    132/132, matrix 265/265, model mutation 327/327, bench 10/10, regressions 9/9 and 8/8, class gate 268/268,
    limits 7/7, liar production 13/13;
  - fail: liar round-14 125/126; core mutants 66/98 with 6 stale; pairs 69/74; crash 732/735.
  - The catch-matrix files did not change.
  - The run rewrote `gates.json` and `core-mutants.tsv` in the working tree. Both are left uncommitted for the fix
    round to commit.
- **Before and after:** I exported 8c7a6661 (just before T60), 3cfbfc08 and 7fedf2b3 to scratch copies:
  - pairs is 69/74 at all three, so it predates T60;
  - core mutants passes 60/98 with 0 stale at 8c7a6661.
- **Tests and lint:** `caught.test.ts`, `owed.test.ts` and `gates.test.ts` pass (35 tests). `nub run check` is
  clean.
- **Planted violations:** each ran in a scratch copy, which I have since removed (section 2).

## 2. Acceptance items

- **1, a planted lost ending fails a gate: holds.** Planted: the excuse ignores the Invariant (`parts/play.ts:102`
  deleted). Result: the class gate fails, 94/268.
- **2, a stopped or done-owner excuse fails: holds.** Planted: `att-1006-999` added to an I12 row, which gives
  parts 76/77 ("no longer breaks"); T19 set `done`, which gives parts 53/77 ("not open").
- **3, one caught, used by the liar and the probes: broken.** Planted: `judgeProbe` on a pending probe whose only
  failure is a defect. Result: `Holds` (B1).
- **4, counts kept or explained: broken.** `mutate` at 8c7a6661 passes 60/98; at HEAD it fails 66/98, with no
  explanation (B2).

Coverage of acceptance 1:
- The class gate sweeps `playedScope()` plus the owed regressions, `runner/parts-gates.ts:77-80`: every part and
  the mix at build seeds 1 to 12 and held-out seeds 101 to 112, so every owed script at every seed.
- A plant that never fires cannot pass. `firedAt` stays none, which is a fault (`parts/sweep.ts:103-105`). It reads
  the same `Stepped` step as the engine (`dsl/engine.ts:28-31`).
- A real unexcused break before the late plant also fails the gate, as "never fired".

## 3. Blocking findings

**B1. Pending probes do not use `caught`; a defect holds them (acceptance 3).**
- `runner/falsify.ts:377` counts any `Fail`, and a defect is a `Fail`.
- The builder's reason is that PAY-08's failing expectation declares no cite. That does not hold:
  `caught(Option.none(), v)` already counts an uncited failed expectation (`runner/caught.ts:29`). I ran both
  pending probes (`k.drop-row`, `q1a.unchanged-resets`) on round-14. PAY-08/reloadDuringCharge fails with
  `expectation: {label: "state"}`, and `caught(none)` is true for it.
- Smallest honest fix: the pending branch counts `caught(Option.none(), v)`. PAY-08 needs no cite.
- The red check to land first: a pending probe whose only failure is a defect is `Broken`.

**B2. The core-mutant gate is red, and the count change is unexplained (acceptance 4).**
- `coreOutcome` now uses keyless `caught`, which counts any failed expectation (`runner/caught.ts:29`). The old rule
  counted only oracles or cites.
- Six NO-ORACLE rows became kills, each by an uncited expectation: `answers.ts:36` (x2), `:46`, `:62`, `:70` and
  `lane-moves.ts:359`. Their triage rows are now stale, so the gate fails.
- The rule has to be decided once. I measured both choices in a scratch copy:
  - **any failed expectation (today's rule):** liar round-14 125/126, core 66/98, and 6 triage rows to drop;
  - **only a cited expectation (G5's wording):** core 60/98 passes, but liar round-14 falls to 80/126, because
    45 mutants are red only by uncited expectations.
- Recommendation: keep today's rule. A failed expectation derived from the Spec is a real catch. The six Invariants
  stay tracked in coverage's owed list. Then:
  - drop the 6 triage rows in `core-mutants-triage.ts`, with the reason;
  - log the keyless rule in the T60 comment, and fix Q7's wording;
  - commit a fresh `core-mutants.tsv` and `gates.json`.

## 4. The liar ruling (`turn.root-first`)

- **The count of 125 is honest.** Under the liar, PAY-04's only failure is `defect: NoHeldRequest`, which `caught`
  rightly refuses.
- **"No other real catch" is false.** I ran the mutant under the liar against every round-14 case (104 verdicts,
  45 not passing):
  - PAY-07/late-may-not-leave fails by `attempt-identity` WriteLanes I6, a structured violation;
  - 15 more cases fail by expectations, such as PAY-16/schedule-reads-after-memory;
  - the rest are defects.
  The liar gate plays only the mutant's own `cases: ["PAY-04"]` (`turn/selection.mutants.ts:184`).
- **The owed route does not exist.** The exact-subject items (`OwedItem`) excuse only part-script violations. The
  liar gate's only excuse is `fixtureGaps`, which is capped at 9 of 9 (correctly not raised). An owed row for T17
  would leave the gate red with nothing holding it.
- Fix in the same round (non-blocking, since the count is explained): add PAY-07/late-may-not-leave to the
  mutant's cases. Liar round-14 then returns to 126/126 with no cap change. PAY-04 still catches by
  `selection` Turn I2 in plain mode, so falsify keeps it.

## 5. Routed findings (non-blocking)

Owed rows for a later suite Task, per the user's rule of 2026-11-14. Owner: @task.V3.T52, the paused suite cut,
unless the orchestrator names another.

- **R1. The class gate judges by the excused flag, not by the gate.** It reads `run.violations`
  (`parts/sweep.ts:107-114`) and never calls `partFaults` (`judgedWith` is used only by tests).
  - Planted: with `...stopped` removed from `parts/play.ts:271`, the class gate stays 268/268, and `judgedWith`
    passes a planted lost ending on PART-pay-usual-1.
  - Fix: judge each plant with `judgedWith`.
- **R2. `Item` dropped `fact`.** The Approach item reads "step and fact", and the design's item is
  `Item { lane, step, fact }`. The code's is `{ subject, step }`.
  - Effect: two breaks of one check on one subject at one step share one excuse. Only one Item row exists today.
  - The deviation is not logged. The fix round should log it.
- **R3. No plant on a cut with no `Stepped` head (step 0).** Only boot facts reach such a cut, and no row names
  step 0. The early plant fires on step 1 and the late plant on the end-of-case reload step. Low risk.
- **R4. 45 liar round-14 mutants rest only on uncited expectations.** Measured in B2. Expectations should declare
  their cites, so that the cited reading of G5 becomes possible.
- **R5. `kills` reads catch-matrix labels by regex (`runner/modes.ts:251, 285`) and compares counts.**
  `gen >= hand`, `:275` (N18). The labels come from `caught`, so this is no false catch today.
- **R6. Owed production reds hold on one Invariant.** `limits.ts:41-43` holds a row on its cite, while the case is
  kept out of the production suite (`runner/gates.ts:38-41`), so its other failures go unjudged. This is M5's
  registry, cut to revisit.
- **R7. Pairs production fails 69/74:** five owners whose pair is now reached. It predates T60 (red at 8c7a6661).
  The orchestrator routes it.

Closed with no row:
- Owner-check wiring works: planted T19 `done` fails the parts gate. The class gate does not involve owners, by
  design.
- An Invariant-blind excuse is caught at gate level (94/268). There is no same-check, other-Invariant plant in a
  single-row script, but the gate does not need one.
- Crash 732/735 is unchanged since T47.

## 6. Standing angles

- **Effect re-creation:** none worth a change. `parts/adversary.ts:194` dedupes through a `Map`.
- **Throws:** none added under `src/`. `Option.getOrThrow` at `parts/sweep.ts:41, 49, 60` makes an unknown script
  id a crash, not a fault line. That is a defect, and it is acceptable.
- **Record edits:** both T60 comments and the status change carry `Edit (agent: …)` lines. The proposal files and
  log notes need none under the Records rule.
  - Minor: the step-1 comment says N9 was "routed to revisit", but `revisit.md` has no N9 entry. The pending check
    in `parts/pending.test.ts` is the owed check.
- **Outside reads and temporary strings:**
  - `runner/caught.test.ts:131` passes `"/tmp"`. Use `"scratch"`, as `gates.test.ts` does.
  - Test titles name `M4` and `N9`, which are proposal labels.
  - `taskStatuses` reads `wiki/tasks`. That read is older and held in @task.V3.T59.
- **Shell edits:** the builder's failed `sed -i` and its `git checkout --` of its own uncommitted edits are logged
  in the T52 build log. The tree showed no damage.

## 7. What only the blind sidecar found

- **Keyless `caught` counts an uncited `eq` (its items 6 and 7).** No requirement covered this. It is the root of
  B2 and R4. The fix round lands a check that pins the decided keyless rule.
- **Owed production reds hold on one Invariant (its item 11).** Routed as R6.

## 8. Sidecar log

Four Haiku sidecars ran at effort high, read-only:
- (A) blind: Conformance.spec, the convergence design and the code;
- (B) the caught call sites;
- (C) the class-gate sweep;
- (D) the standing angles.

I re-checked each finding against the code or a run.

| Sidecar and item | Finding | Logged | Why |
| ---------------- | ------- | ------ | --- |
| A1 | an owed Attempt excuses its check at any step | rejected | by design (Q1, M5): an Attempt names all its breaks |
| A2 | the class gate never runs `partFaults` | accepted | R1; planted and confirmed |
| A3 | plants are thin; Item skips are silent | changed | a skip loses a plant, never passes one; folded into R3 |
| A4 | the parts gate covers six seeds | rejected | the class gate plays seeds 1 to 12; an early break fails |
| A5 | undecided judgments never gate | rejected | out of range (T52 2b, pending for T17) |
| A6, A7 | an uncited `eq` is a catch; the liar counts any red | accepted | B2 and R4; measured |
| A8 | `kills` compares counts | accepted | R5 |
| A9 | pending probes hold on defects | accepted | B1; planted and confirmed |
| A10 | falsify takes the first VERDICTS line | rejected | a mutant is the suite's own edit; no adversary prints lines |
| A11 | owed production reds hold on one Invariant | accepted | R6 |
| B | `judgeProbe` uses no `caught` | accepted | B1 |
| B | `kills` regex; `failing` reads `why` | changed | `failing` only signs regressions; `kills` is R5 |
| B | the `why` lint misses `modes.ts:300` | rejected | display and signature only, no catch decision |
| C1 | a plant that never fires cannot pass | accepted | section 2 |
| C2 | the sweep reads violations, not `partFaults` | accepted | R1 |
| C3 | the class gate covers every owed script | accepted | section 2 |
| C4 | an Invariant-blind excuse survives one-row scripts | changed | true per script; the gate fails, 94/268 |
| C5 | the step numbering is implicit | accepted | R3 |
| D1 | Effect re-creation | rejected | `adversary.ts` Map dedupe is not worth a change |
| D2 | `getOrThrow` in the sweep | accepted | section 6, minor |
| D3 | wiki changes without labels | rejected | proposal and log files need none; the status change is labelled |
| D4 | `"/tmp"`; M4 and N9 in test titles | accepted | section 6, minor |
| D6 | `OWED_SUBJECTS` pasted from a run | rejected | change detectors every gate checks, not expected results |
