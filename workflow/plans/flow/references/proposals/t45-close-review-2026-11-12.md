# Review: T45 close, 2f77e7ab to 178df54c and df2b9cfb to d8cf11e3 (2026-11-12)

Verdict: **not done; one finding blocks and two items are the user's.** B1 and B2 are fixed in substance: an end
owes a write only for a record the model marks dirty, and the data-flow test compares the whole `Model`, finding and
closing two real leaks. Acceptance item 8 is not met: the README still holds round-14 limits as prose, one of which
loosens a check and one of which bakes round-14's behaviour into case expectations. Keeping Table A's refusing
cells and moving item 7's eight search kills to T21 and T25 both change a plan or acceptance the user accepted. The
core-mutants explanation (85/85 to 62/85) holds. Nothing here changes a guarantee or Flow's public API.

**Reviewed:** `git diff 2f77e7ab 178df54c` and `git diff df2b9cfb^ d8cf11e3`, against the last review
(`t45-steps4-6-review-2026-11-12.md`), @task.V3.T45's acceptance and comments, the orchestrator notes at 6e0d1fcc,
36e55d53 and 7b15241b in `workflow/tasks/V3/log.task`, @spec.Actors R8, I10, I12, I37, @spec.WriteAhead R5, R10 and
Dirty, and `skill:policy-testing#audit-a-suite`. Paths are under `packages/flow-state-v3/conformance/` at d8cf11e3.
Nothing was run but read-only `git`, `grep` and `workflow show`; the fresh lead's uncommitted edits were not read.

## Blocking

### K1. The README still states round-14 limits as prose (acceptance 8, phase-out step 2)

The evidence comment (T45, 23:52:22) says "not-yet.ts and the README keep no prose round-14 limits". `not-yet.ts`
is clean, but `README.md` keeps three:

- `:233-238`: round-14 does not report the failure inside `unknown StillUnknown`, so the tag check runs only when
  a runtime reports it. That is a check loosened for round-14, stated in prose.
- `:244-246`: round-14 has no idle row, so cases expect `None` where Reads R14 owes the idle row. Those are
  expected results taken from round-14.
- `:124`: round-14 cannot take a seed (the adapter mints `att-<seed>-n`).

**Fix:** make each one a `limits.ts` row (a case round-14 fails by its Invariant once the check is strict), a
stated limit with a mutant, or a report-truth entry, as Conformance R22 says; otherwise give it an owner in
`not-yet.ts`. Then item 8 can be met.

## The user's call

- **Table A's refusing cells stay** (d8cf11e3; the coordinator's decision). Phase-out step 1, which the user
  accepted on 2026-11-11, says to delete them. Deleting them makes 8 mutants red by another check (the lead's
  experiment). Keeping them as the compare's named refusals is sound and is my recommendation. But it changes
  an accepted plan, so the plan's text should be amended once the user agrees.
- **Item 7's eight old search kills move to T21 and T25** (7b15241b). The acceptance still says "the old suite's
  search kills are reproduced". The reason holds: they belong to the Reads and Sessions areas, which have no
  fixtures here. Recommendation: amend item 7 to "the persistence ones", with the move recorded.
- **Carried from B1: R8's "encoded in that step" read as "written".** The orchestrator ruled this with no
  Spec change (log 22:32:05, 23:26:14), so production's deferred write counts as a T51 bug. WriteAhead R10 lets
  a dirty capture wait up to 5 s, and R8's text says *encoded*. If the user reads R8 the other way, production is
  correct and ACT-02 and ACT-03 over-ask. The reverse is logged; the last review recommended amending R8 to
  "written".

## Should fix

- **S1. "Surely dirty" counts a turn that may not change the record.** `changes: m.updates || m.to !== from`
  (`turn/selection.ts:174`) feeds `changed` (`dsl/expect.ts:278-291`). But `updates` means the turn "may publish
  new memory" (`fixtures/handlers.ts:16`), and WriteAhead's Dirty means "committed value differs from its last
  landed value". So a no-op `updateMemory` after a landed capture marks the record dirty and owes a write, which
  a correct runtime may skip. This is latent: production does not write at the end anyway, and round-14 always
  writes. Fix: count `updates` as sure only when the folded fields before and after differ (the anchor holds both).
- **S2. Dirty records are tracked per actor but cleared per batch.** Any `Wrote` clears every live actor's
  `dirty` (`dsl/expect.ts:301-307`), and any write in the step discharges every dirty end
  (`dsl/expect.ts:431`). So one actor's write covers another's owed end. `Wrote` carries no keys
  (`dsl/facts.ts:61`), and the key encoding is the runtime's (`world/storage.ts:76-77`). Fix: make it a stated
  limit in `limits.ts` with a mutant (an end that writes only another actor's record), or key batches by
  actor if the Port can report it.
- **S3. Owed reds have no expiry.** `productionOwed` (`runner/gates.ts:13-37`) matches exact ids and applies only to
  production, both fine. But nothing checks that ACT-02 and ACT-03 are still red on production, or that T51 is
  open. Once T51 lands they stay out of every production gate without anyone noticing, and the default
  `suite` (`runner/main.ts:94`) drops them without a note. Fix: a gate line that plays each owed case on
  production and expects it red by its Invariant, as `limits` does for round-14.
- **S4. The core-mutants gate has no control.** `runCoreMutants` (`runner/mutate.ts:58-113`) counts any red case
  as a kill. At 0d1c5e87 the unedited production was red on ACT-02 and ACT-03 (suite 76/78), so all 85 read as
  killed. The explanation holds: survivors at a91e8146 (43cc6cc2) and 848a85f4 (df2b9cfb) are the same 23
  lines. Fix: run the unedited cases first and refuse a verdict when the control is red, as `kills` and
  `liar` do.
- **S5. `gates --gate` relabels stale verdicts.** Kept verdicts are written under the current HEAD
  (`runner/gates.ts:128-137`), so `gates.json`'s single `revision` can overstate how fresh a verdict is. Fix: one
  revision per gate entry.
- **S6. Endings in attaching or sending steps route `either`, wider than the reason given.** `routeOf(...,
  adopting)` (`turn/anchor.ts`, 4a6bc945; called at `turn/selection.ts:74-77`) widens routing for any actor in a
  step that attaches a use or sends. The reason it gives is that an ended actor may return (Actors R9), but the
  code does not check that the actor ended or could have. There is no limits row and no mutant. Fix: narrow
  it to an actor not Live in the anchor, or one incarnated in the step.
- **S7. The data-flow test's planted half still plants nothing in the expect code.**
  `dsl/dataflow.test.ts:196-226` tests `leakAt` on hand-built arrays. The main assertion's power shows only in
  the commit's two closed leaks. And `anchorView` (`:78-90`) drops the anchor's `answers`, `owning`, `disposing`
  and `requests`, and each actor's `driven`, `saved`, `pending` and `removed`, with no reason given. Fix: one
  in-place edit of an expect module (as `STEP_MUTANTS` does) that reads `Ended.channel`, with the main test
  seen red; compare the whole anchor or name each left-out field.
- **S8. Stated limits.** `limit.mint-key-lies` now runs on GEN-pay-seeded-3074 but is `Caught` there
  (`limits.ts:91-105`), so it shows the ordinary check, not the limit's reach. The `Caught` path accepts the
  named check with any Invariant and ignores the mutant's `expects` (`runner/modes.ts:419-423`). The keys row's
  `admits` (`limits.ts:87-90`) still leaves out keyed retries, with no retry mutant (`turn/credits.ts:166`).
  `limit.from-lies` was dropped as unreached, yet the `to` fallback stays (`turn/selection.ts:140, 163`).
  Either refuse there or keep a row.
- **S9. Schedules from one point, in part.** A computed delay is now due at the step's end plus the delay
  (`turn/schedules.ts:156`). A firing in the same `Advanced` step is therefore always "too soon"
  (`:113-117`), while fixed delays still count from the step's start (`:153`). This is latent: Pay arms
  `retry` only on an answer step. Fix: take the arm time from the firing's due, or say so in the Gotchas.
- **S10. Report truth now mixes two kinds.** The 9 older liar greens joined `reportTruth` (`suite.ts:157-177`),
  which feeds `reportOnly` (`:190`) and leaves them out of the liar gate (`runner/modes.ts:46`).
  `liar-prototype.txt` is now empty. That follows 36e55d53, and falsify still catches all 154, so nothing is
  hidden from falsify. But `reportTruth`'s doc ("no world read can see") fits a report-only act, while these
  are fixture gaps, and the phase-out cap of 9 can no longer be read off any gate. Fix: a separate
  `fixtureGaps` set the liar gate counts against the cap. The reasons are real; "moves state" should read
  "changes the leaf or memory", since Keyed's `No` and `Unsure` go to `W` from `W` (`fixtures/keyed.ts:31-32`).

## Minor

- `verdictOfLimit` still matches the Invariant by substring over the joined `why` (`limits.ts:49`): `Actors I1`
  matches `Actors I14` (carried).
- 4602671c deleted the `twice` assertion ("two keys name no one lane") from `dsl/lifecycle-step.test.ts` with no
  reason; restore it, or say why it no longer holds.
- `dsl/compare.ts:323` writes Pay's `"NoResponse"` into the model when an answered ending has no fixed reason.
  Name it, or keep the reason as `Option`.
- ACT-03 is out of production's gates too, so production's I10 early-end check waits on T51 (it needs the dirty
  record to make the early write a world fact).
- `gates.json` at 0d1c5e87 read crash production 698/1523; at 43cc6cc2 and df2b9cfb it reads 690/723. Removing two
  short cases does not explain 800 points, and no record does.

## Acceptance (completion check)

| Item                              | Status     | Evidence                                                    |
| --------------------------------- | ---------- | ----------------------------------------------------------- |
| 1 generated kills at least hand's | met        | `kills`, with a control: 40 of 41 vs 40 (4602671c)          |
| 2 search finds a conflict or none | met        | three round-14 limits rows (I14, I15, I38)                  |
| 3 falsify 147/147 first           | met        | 56ef0856 (earlier review)                                   |
| 4 T10 rows by generated runs      | met        | 4a6bc945; S6 for the routing it widened                     |
| 5 no observation, lint-enforced   | met        | `dsl/boundary.test.ts`; whole-Model data-flow compare; S7   |
| 6 limits rows gated               | met        | limits 7/7; S8 for the stated-limit half                    |
| 7 runner, slow child, old kills   | partly met | s13 in LANE-06; eight moved to T21/T25 (the user's call)    |
| 8 phase-out 0 to 2                | not met    | K1; Table A kept (the user's call); `claimed` now `at`      |
| 9 four validations                | met        | V1 sweep, V2 standings (no feature matrix yet), V3 rows, V4 |

The `claimed` to `alternativeAt` change is sound: the flag always equalled `at` being set (`fixtures/reference.ts`),
`chosenRow` and `retriesOwed` take `at` from selection's own match (`turn/selection.ts:141, 171`), and
`rows.test.ts` derives `at` from `Compiled` with the `states.<node>.` prefix.

## Checks against the brief

- **B1 fixed?** The false red is gone: only `dirtyEnds` owe a write (`dsl/expect.ts:245, 431`), and `usedWrite`
  is tied to the boot's capture interval (`captured`, `:396-403, 450`). "Surely dirty" comes from the model's own
  predicted turns per live actor (`changed`), not from reports. Two gaps remain: S1 (over-counts) and S2 (cleared
  per batch).
- **B2 fixed?** The whole `Model` is compared (`dsl/dataflow.test.ts:139-142`). Stopping before the refusing step
  (`:102`) is sound, since a refused run is already red. The planted half is S7.
- **Planted leak fails for the right reason?** No: it can fail only if `leakAt` breaks (S7).
- **ACT-02 and ACT-03 left out: narrow, listed, owned?** Yes: exact ids, production only, owner T51, and the why
  holds for both (ACT-03's `Start` dirties the record, `fixtures/pay-steps.ts:52`). It has no expiry (S3).
- **`limits.ts` rows.** The three round-14 rows are narrow and gated. Of the four stated limits, one survives on
  a case that reaches its path and three are caught; see S8.
- **Report-truth reasons.** Each of the 9 has a specific reason and the owner T47; see S10.
- **Report-to-obligation paths.** The commit closed two (an answered success's reason, a cancel lane's replaced
  head). `compare.ts:319` still takes the report's channel when nothing is answered or replaced. Only the
  data-flow sample covers that path (S7).
- **Tautologies.** The planted data-flow test (S7).
- **Cases edited to pass.** None. The `twice` deletion (minor) is a test removed with no reason given.
- **Expected results from a runtime or round-14.** The README's idle-row expectations (K1).

## Sidecars

Two Haiku sidecars (effort high): (1) B1, B2 and the should-fixes; (2) the gate exclusions, `limits.ts` and
report truth. Each finding was re-read in the code.

| Sidecar finding                                      | Outcome                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| 1.1 B1 not keyed per actor                           | accepted, S2 (Wrote has no keys: a stated limit)                   |
| 1.2 B1 checks more than the Spec                     | changed: the orchestrator's logged ruling; the user's call         |
| 1.3a `written` clears every actor                    | accepted, S2                                                       |
| 1.3b dirty set at step start, cleared by later Wrote | rejected: Wrote follows the step's reports (`facts.ts:42`)         |
| 1.4 `updates` counted as sure                        | accepted, S1 (against WriteAhead's Dirty)                          |
| 1.5 `leakAt` stops one step early                    | rejected: a refused run is red, so no false green                  |
| 1.6 planted test does not test the main assertion    | accepted, S7                                                       |
| 1.7 `anchorView` partial                             | accepted, S7                                                       |
| 1.8 `onNone` takes the report's channel              | changed: covered by the sample only; folded into S7                |
| 1.9 `twice` assertion removed                        | accepted (minor)                                                   |
| 1.10 `"NoResponse"` literal                          | accepted (minor)                                                   |
| 1.11 schedules same-step too soon                    | accepted, S9 (latent)                                              |
| 1.12 keyed retry not in the row                      | accepted, S8                                                       |
| 1.13 mint-key-lies Caught; from-lies dropped         | accepted, S8                                                       |
| 1.14 seven hand-picked cases; captureMs 0            | rejected: a stated sample; `captureMs` is the same in both runs    |
| 2.1 liar gate passes by exclusion                    | changed: 36e55d53's decision, falsify still catches them; S10      |
| 2.2 the reason is false for Keyed                    | changed: a self-move to W; wording, in S10                         |
| 2.3 `productionOwed` reaches four consumers          | changed: all production-only and as documented; the real gap is S3 |
| 2.4 no expiry; ACT-03's why unevidenced              | accepted the expiry (S3); rejected ACT-03 (`Start` dirties it)     |
| 2.5 `--gate` relabels stale verdicts                 | accepted, S5                                                       |
| 2.6 `Caught` ignores the Invariant                   | accepted, S8                                                       |
| 2.7 Survives row on one case                         | rejected: PAY-01 sends, so it reaches the admitted path            |
| 2.8 8 rows to 7                                      | rejected: logged in T45's comments                                 |
| 2.9 never-ends on ACT-02; capture 5000 for seeds     | rejected: ACT-02 runs on round-14; the control drops red seeds     |
