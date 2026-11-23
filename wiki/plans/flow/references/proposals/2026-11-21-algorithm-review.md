---
review algorithm-review
status open 2026-11-21
description Finds none of the twelve concept designs Spec-ready as a core algorithm; schedules is closest, four holes remain.
---
# The concept designs as core algorithms, against today's code (2026-11-21)

**Bottom line:** none of the twelve designs is a Spec-ready algorithm yet. The schedule redesign (SI with T118's
rulings) is the closest. It closes all seven red classes of T118's sequence test and the five T57 review findings
it targets. Four algorithm holes stay open, and each loses or invents a firing: the saved `restartOn` baseline has
no codec and no restore rule, re-entry's inherited keys and reasons, a fresh key's first `restartOn` throw, and
`arming`'s three writers outside `decide`. About 63% of the 1,641 schedule lines survive as they are, 32% change and
5% are deleted. The test oracle also encodes a rule the rulings overturned (`tests/turn/schedule-ledger.ts:195`),
so the 365 red rows must be recounted before the build.

Each of the other eleven designs has at least one Spec-blocking hole; section 3 lists the ones they share. Besides
SI, only SC (64 sequences), BC (75 rows) and SR (48 cells) name a bounded exhaustive check, and FR a depth-4
enumeration; none is built. Section 4 is the ordered list for the Fable round (19 problems), and section 5 the
salvage table: about 84% of `src/` survives as is.

Everything here is a finding or a proposal. Nothing is decided. The user's decisions in @proposal.spec-handover
stand, and the 15 answers of @review.spec-cohesion-r2 section 6a are taken as prior art. Traces break two of them:
Q11 (SC-1) and Q14's premise (UH-2).

## Conventions

- Abbreviations as @review.spec-cohesion-r2: TM, FR, SR, RO, DL, BC, TT, ET, SC, UH, TP; SI is
  @proposal.schedule-issues; R2 is @review.spec-cohesion-r2; BCS is @proposal.body-capture-settled.
- `X:n` is line n of design X. Code paths are under `packages/flow-state-v3/src/` unless they start with `tests/`
  (under `packages/flow-state-v3/`) or `tools/`.
- Severity: **blocks Spec** (the Spec cannot state one rule), **blocks build** (the rule is stateable, the
  mechanism is missing), **minor**.
- Line estimates are approximate, from reading, per file: keep / change / delete-or-rewrite.

## 0. Evidence run

- `nub run test -- run tests/turn/schedule tests/restore/schedule-edits tests/home/schedules` (read-only):
  6 files, 11,189 passed, 367 expected fail. That is the 365 inverted sequence rows
  (`tests/turn/schedule-sequences.test.ts:346`) plus B1 (`tests/restore/schedule-edits.test.ts:238`) and B2
  (`tests/turn/schedule-keys-table.test.ts:481`). T118 cites these at `:266` and `:508`; they moved.
- Planted faults today: 449 across 19 files, recounted by grep. None of T118's four plants
  (`schedule-issue-stored`, `reason-read-touches-arming`, `hold-skipped-without-reasons`,
  `restore-drops-refused-marker`) exists, nor SI's two (`refused-start-goes-idle`,
  `restore-keeps-undeclared-reason`).
- `Equal.equals` in the pinned `effect` 4.1.4 is deeply structural for plain objects and arrays
  (`node_modules/effect/src/Equal.ts:186-260`).

## 1. Schedules, in depth

### 1.1 Problems it must solve

From @plan.Machines O5 and O8, SI's goal, T57's close reviews (`git show 3a84b878:wiki/tasks/V3/P4.task`, lines
566-1342; compaction removed them from the live record) and T118's comments. Status is against SI plus T118's
2026-11-20T16:21:40Z rulings.

| Problem                                                                  | Status | Where answered                                  |
| ------------------------------------------------------------------------ | ------ | ----------------------------------------------- |
| Stored issues outlive their condition (root of four reviews)             | solved | SI:24-60, `scheduleIssues` SI:141-150           |
| B1: hold restored with no `paused` never fires                           | solved | SI:131-132 gate gone; SI:179-180; trace SI:252  |
| B2: arming issue replaced by a reason throw, then cleared                | solved | `Arming.Refused` SI:64-67; trace SI:257         |
| Review 3 B2: one key's firing clears another's issue                     | solved | per-timer fields SI:119-120                     |
| Review 2 B2: issue cleared by a check that did not run                   | solved | no `ran`; SI:267-269                            |
| Refused start lost on reload (P2)                                        | partly | marker SI:136, 182; `Occasion.Restore` lacks it |
| Issue kept after its key leaves or its state exits (P1)                  | solved | SI:204, 276-285                                 |
| Shown issue is the latest failure, not the first in order                | solved | order SI:141; T118 ruling (a)                   |
| Send issue kept after a clean re-arm                                     | solved | SI:114 row `firing` cleared by a start          |
| Reload after a `restartOn` throw loses a firing (T118 B1)                | partly | ruling only; SI:136 says "saved: as today"      |
| Fresh key whose first `restartOn` throws (rows `plsk`, `lapk`)           | not    | ruling names the rows, no rule                  |
| `bad`'s committed firing must not clear `good`'s (row `nroa`)            | solved | per-timer fields; the row is not yet written    |
| Re-entry's inherited key set and reasons (T118 (c))                      | not    | no record; see S-2                              |
| Creation-time refused arming (`incarnations.ts:181-187`)                 | partly | ruling moves it to T118; SI:330-333 defers it   |
| `fired()` and restore write the run outside `decide` (T57 trap)          | not    | SI:316-318 declares it out of scope             |
| Lint reach by name and path (`Plan.Held(` at `schedule-decision.ts:162`) | partly | SI:244-246 type guard                           |
| Host series kept after disarm (`host/owners/schedule-steps.ts:53-60`)    | not    | T57 note 16:02:40Z; no owner                    |
| `etk` breaches Codec I7 at step 2, hidden by `it.fails`                  | not    | T118 review; class unnamed                      |
| Gate passes red rows (`it.fails` on any failure)                         | partly | ruling amends acceptance 1; P4.task unchanged   |
| Keyed timers due together: key order unstated in I32                     | not    | T57 Q17 ruling in a comment only                |
| T56's "old timers read as `dueAt`" invents a firing for held ones        | not    | `wiki/tasks/V3/P4.task:373-375`                 |

### 1.2 Fit to today's code, function by function

The five core files hold 1,570 lines and `host/owners/schedule-steps.ts` 71 more. Every row below was read in the
code. Keep / change / delete totals: about 1,030 / 520 / 90.

**`core/schedule-decision.ts` (521): about 200 / 230 / 90.**
- Keep: `Firing`, `Failure`, `Occasion`, `Seen`, `Reads`, `armed` (332-348), `firingOf`, `sameReasons`, `Working`.
- Change: `keyed` (232-264) writes `Scheduled.keys`; `selected` (269-284) and `rebased` (288-303) write
  `selection: Checked`; `started` (307-328) gives `Refused` instead of an idle run; `paused` (382-408) loses the
  gate at 385 and stops writing `run` at 405; `heldOrResumed` (352-378) becomes `timed`; `firingFailures`
  (421-433) writes `Timer.firing`; `decide` (489-521) takes and returns `Scheduled`, and its doc at 487 flips
  "a key that leaves keeps its issues"; `lastReasonsOf` (183) reads `Checked.last`.
- Delete: `isScheduleSource`, `checkSlotsOf`, `armingSlotsOf`, `sourceKeyOf`, `issueKeyOf`, `ran` (208-214),
  `issuesAfter` (445-470), `plannedOf`, `plannedTrack`, the `Pass.ran` field.

**`core/schedules.ts` (550): about 375 / 170 / 5.**
- Keep: `readsOf`, `keysOf`, `reasonsOf`, `keyOf`, `stepper`, host timer helpers, the occasion entry points
  `turned`, `firingSettled`, `rechecked`, `restored`, and `next` (454-484).
- Change: `trackedOf` (210-261) maps `Arming` to host timers; `reported` (265-279) drops `withIssuesOf` at 278;
  `applied` (283-305), `fired` (489-500) and `firingRun` (506-518) key the map by name, not `trackOf` (298, 496,
  507); `pass` (310-354) passes `Scheduled`.

**`core/schedule-plan.ts` (243): about 200 / 45 / 0.** `savedTimersOf` (150-167) adds `refused` and the baseline;
`Due`, `runningOf` and `dueOf` (222-232) retype and re-key.

**`core/schedule-restore.ts` (148): about 90 / 55 / 3.** `trackedOf` (98-122) stops writing `baseline: none` (115)
and the raw `pausedBy` (116), and cuts to declared names. `restore` (130-148) passes the refused marker into
`Occasion.Restore`.

**`core/firings.ts` (108): about 98 / 10 / 0.** The refused send goes to `Timer.firing`.

**Outside the five:** `core/world.ts` `Tracked` (172-184) becomes `Timer`, `withIssuesOf` (291-301) goes and
`StoredIssue` is added; `core/vocabulary.ts` `SavedTimer` (84-99) gains fields; `core/record-format.ts:10`
`FORMAT` goes to 6; `host/snapshot.ts:184` reads `issuesOf`; `core/incarnations.ts:181-187` stops storing a
Creation issue.

### 1.3 Core algorithm

**State inventory.** One owner, `decide`, unless marked.

| State              | Writers today                                                                 | Writers after SI                  |
| ------------------ | ----------------------------------------------------------------------------- | --------------------------------- |
| `Scheduled.keys`   | an issue in `Incarnation.issues`                                              | `decide` (keys read)              |
| `Timer.selection`  | `rebased`; restore sets none (`schedule-restore.ts:115`)                      | `decide`; restore decoder (saved) |
| `Timer.reasons`    | `paused` (404); restore copies saved (116)                                    | `decide`; restore decoder (cut)   |
| `Timer.arming`     | `started`, `armed`, `paused` (405), `trackedOf` (248), `fired` (496), `runOf` | `decide`, **`fired`, `runOf`**    |
| `Timer.firing`     | an issue                                                                      | `decide` (fired occasion)         |
| saved `SavedTimer` | `savedTimersOf` only                                                          | same, plus `refused`, baseline    |
| host timer         | `trackedOf` via `tx.armTimer`                                                 | same (a view of `arming`)         |
| schedule issues    | `issuesAfter` via `withIssuesOf`                                              | derived: `scheduleIssues` on read |

**Transition table for `arming`**, the state with several writers. A cell is the next value.

| Input (in occasion order)           | Idle          | Refused       | Armed(run)                  |
| ----------------------------------- | ------------- | ------------- | --------------------------- |
| timer created (key appears, entry)  | start         | n/a           | n/a                         |
| `disarmOn` in this turn             | Idle          | Idle          | Idle                        |
| start cause, first step reads       | Armed(step 1) | Armed(step 1) | Armed(step 1), restart      |
| start cause, first step fails       | Refused       | Refused       | Refused (time left dropped) |
| firing commits, next step (`fired`) | n/a           | n/a           | Armed(next) or Idle         |
| restore, saved `refused: true`      | n/a           | start         | n/a                         |
| restore, saved run (`runOf`)        | n/a           | n/a           | Armed(saved timing)         |
| exit, key leaves, schedule dropped  | removed       | removed       | removed                     |

Start causes: a turn's `armOn`, a keyed timer created, a `restartOn` change after a committed turn or context
change, a restore's added schedule, a restore's refused marker. Today the creation path computes refused arms
before `decide` (`incarnations.ts:168-187`); it must feed them in as start causes. The `fired` and `runOf` rows are
the two writers outside `decide` (hole S-4).

**Pseudo-code at Spec level.**

```ts
// existing: decide, Occasion, Reads   NEW: Scheduled, Timer, Checked, Arming, timed
decide(schedule, before: Scheduled, occasion, reads, now) -> { after: Scheduled, raised, seen }
  t0 = occasion.exited ? [] : before.timers                        // P1: exit removes timers
  [keys, t1] = keyed ? reads.keys() fails  -> [some(f), t0]        // re-entry with a throw: S-2
                                 succeeds -> [none, listed.map(k => t0[k] ?? fresh(k))]
                     : [none, [t0[0] ?? fresh(none)]]
  for t in t1 of the fired key: t.firing = occasion.firing.failure  // none when it commits clean
  for t in t1 where restartOnRuns(occasion, t):                     // rule table: S-1, S-3
    r = reads.selection(t.key)
    t.selection = r fails ? Failed(r.failure, valueOrLast(t.selection)) : Read(r.value)
    t.start ||= changed(t, r) && restarts(occasion)
  for t in t1: t.arming = disarmed ? Idle
                         : startCause(t) ? (reads.first(t.key) ok ? Armed(step1) : Refused(f)) : t.arming
                 if a start armed: t.firing = none
  for t in t1: t.reasons = reads.reasons(t.key) fails ? Failed(f, valueOrLast(t.reasons)) : Read(value)
  for t in t1 where Armed: t.arming.run = timed(run, valueOrLast(t.reasons), now, silent = Restore)
  raised = this occasion's failures in check order                  // trace only (tx.refuse)
```

**Hot path.** `decide` is linear in timers per declared schedule per occasion, as today; deleting `issuesAfter` and
`ran` removes a `Map<string, Set>` per occasion. The new cost is `scheduleIssues` on every snapshot read: linear in
timers, and it allocates. It must be computed once per publication (UH's memo), not per `getSnapshot`. Nothing is
added to a turn that has no schedules.

### 1.4 Correctness measures

**Invariants (SI:225-232).** (1) owed implies armed or the source shows an issue; (2) not owed implies not armed;
(3) armed and held implies a reason true or last true, armed and due implies none; (4) a failing check shows on its
source, a clean source shows none; (5) running the clock out fires exactly the owed, unheld timers once.

**The sequence check exists.** 20 atoms (`tests/turn/schedule-ledger.ts:71-92`), every 3-step sequence, 8,000 rows,
365 red. Gaps:
- **The oracle encodes an overturned rule.** `schedule-ledger.ts:188-195` drops every baseline at restore ("none
  is saved"). The 16:21:40Z ruling saves it. Until the ledger changes, the 365 rows test the old rule, and the
  Blocking 1 trace (`Stop / selection throws / reload / selection changes`) is green for the wrong reason.
- **The oracle is a second implementation, not five lines.** SI:222-224 promises a five-line ledger of owed
  firings. `schedule-ledger.ts` is 375 lines that model arming, reasons and baselines. When both encode one wrong
  rule, the row passes. Proposal: report each red row as an invariant breach (independent of `decide`'s fields)
  or a model mismatch, so a model rule cannot hide an invariant.
- **Alphabet.** It lacks `armOn` (refused for keyed schedules, `compile-schedules.ts:80-86`), lane and context
  changes, a firing of `bad`, a reason rename or key-Schema edit at reload, props changes (BC) and freeze or thaw
  (FR). Depth 4 (`plsk`, `lapk`, `nroa`) and SI's 12-step walk behind `FLOW_STRESS` are not built.
- **Fixture.** One keyed schedule. Unkeyed `armOn` with `restartOn`, multi-step series and two schedules due
  together stay in T57's one-occasion tables.
- SI's "504 atoms, 63 million sequences" (SI:237-238) cannot be re-derived from SI's own inventory.

**Planted faults.** Six named, none built (section 0). Nine existing schedule faults target deleted code:
`check-issue-never-cleared`, `check-issue-cleared-unrun`, `firing-clears-every-key`, `firing-keeps-own-issue`,
`last-issue-wins` (all in `issuesAfter`), `paused-ignored` and `restore-keeps-stale-hold` (the gate at 385),
`throwing-reason-runs-new-run` (`lastReasonsOf`), and `idle-forgets-reasons` (the `pausedBy` text). Each needs a
named new target, as T118's review asked.

**Story of the wrong ending.** B1 and B2 exist, inverted. A Story for the reload-after-throw trace does not.

### 1.5 How it is written down

- **Requirements:** R25 as SI section 3 plus the check order (firing, `restartOn`, arming, reasons) and "a start
  that arms clears the send issue"; P1 in R25 and R27; R17: restore re-reads `keys` and reasons silently, keeps the
  saved baseline, retries a refused start; WriteAhead R4: `refused`, the baseline, no issues; R19: a throwing
  check keeps its last value, and S-2's re-entry rule.
- **Invariants:** SI's five, plus "`arming` changes only in `decide`" once S-4 is closed, and "no saved body holds
  an arming id".
- **Tests:** the sequence test (rows from the amended ledger), B1, B2, the three depth-4 rows, a format-5 guard
  with idle, held and due keyed timers, and the per-occasion tables for timing.

### 1.6 Holes

- **S-1. The saved baseline has no codec and no restore rule. Blocks build.** `restartOn` returns `unknown`
  (`core/compiled.ts:233`). A selection that JSON cannot round-trip either withholds the whole actor record
  (`core/persist.ts:410-437`) or comes back unequal under `Equal.equals` (a `Date` becomes a string) and restarts
  the timer. Restore must also re-read `restartOn`, which the filter at `schedule-decision.ts:274` stops once a
  baseline exists. Trace A (keep the saved value, no re-read): a context slot changed while away; the first turn
  restarts a timer that @plan.Machines O8 says restores silently. Trace B (re-read silently; a throw keeps the
  saved value): `Stop / throws / reload / changes` restarts once, as the ruling wants. Proposal: B, with a codec
  (an encodable selection, refused at the arming turn otherwise) and `sameValue`-or-`Equal` fixed as one rule.
- **S-2. Re-entry's inheritance. Blocks Spec.** Exit empties the timers (`schedule-decision.ts:233-235`), so
  `keys throw / re-entry` arms nothing. Turn R19 says a throwing `keys` keeps "the key set" (`Turn.spec:190-192`);
  `Scheduled` stores only `keys: Option<Failure>`, no set. The ledger gives a fresh timer the reasons its key last
  read before re-entry (`schedule-ledger.ts:175`), which P1 ("removed, with everything it held") and T57's
  rejection (15:14:37Z) forbid and T118's calls allow. Trace A (inherit nothing): A true, re-entry with A throwing,
  the fresh timer reads `Failed(last [])` and fires at 60 s while A may hold: an invented firing. Trace B (inherit
  the previous activation's keys and reasons): a removed timer's state is reconstructed, the freedom SI removes.
- **S-3. A fresh timer's first `restartOn` throw. Blocks Spec.** `selection: Failed { last: none }`, then a clean
  value: silent baseline or change? Today `rebased` treats it as silent (`unset`, 293). T118 names R22's rule as
  the model; I28 says a baseline equals the value after a wave, which does not settle a throw.
- **S-4. Three writers of `arming`. Blocks build.** `fired` (`schedules.ts:489-500`) writes the next step,
  `runOf` (`schedule-restore.ts:65-94`) writes restored timing, and creation decides refusals before `decide`.
  Proposal: `Occasion.Fired` carries the stepped next delay as data, the restore decoder hands `decide` a saved
  timing as input, and creation passes refused arms as start causes. Then the lint can name one function.
- **S-5. `Occasion.Restore` has no `refused` input. Blocks build.** It is `{ adds }`
  (`schedule-decision.ts:41-42`); `armed` starts only `adds && fresh`.
- **S-6. A lane change runs `restartOn` for timers without a baseline (`schedule-decision.ts:274`), against I38.
  Minor** once S-1 lands: only a fresh key's first read is left, and the Spec must say whether a lane change runs
  it.
- **S-7. Undeclared restored reasons.** SI:179 cuts saved `pausedBy` to declared names; SR:201 makes the record
  `Unreadable` or drops the timer. The existing B1 test expects SI's reading. **Blocks Spec** (SR text).
- **S-8. Host series leak** after disarm or restart (`host/owners/schedule-steps.ts:53-60`). **Minor**, no owner.

### 1.7 Declared schedules and dropping `Flow.keyed`

- **Keyed-ness** moves from the wrapper (`compile-body.ts:325-327`, `config.ts:224-236`) to the declaration's
  `key`. `compile-schedules.ts:63-86` already keys on `config.keys`, so the core checks survive.
- **Saved keys** decode against the declared key Schema instead of today's encodability check
  (`schedules.ts:137-147`, `schedule-restore.ts:104-109`). This needs the Schema in `Compiled` (hole TM-2). It also
  gives S-1's codec a home: a declared schedule can declare its selection Schema the same way.
- **Restore cut** of `pausedBy` reads the declaration, not the body's `paused` record, so S-7's rule has one
  source.
- **The map keyed by name** (SI:86) becomes a fixed key set per definition, which types `TimersOf<D>`.
- **Code impact:** small in the schedule core (about 15 lines). In the front end: `flow.ts` -11, `tokens.ts` about
  -45/+15, `config.ts` -12/+25, `compile-body.ts` +5, `compile-schedules.ts` +20. There are 11 `Flow.keyed` calls
  (TM:444 says 14): `fixtures/home/machines/room.ts:147`, `fixtures/home/stories/structure.ts:119`,
  `tests/home/schedules.test.ts:407`, `tests/turn/schedule-table.test.ts:178`,
  `tests/turn/schedule-keys-table.test.ts:67, 533`, `tests/turn/schedule-sequences.test.ts:79, 91`,
  `tests/compile/schedules.test.ts:111`, `tests/types/schedules.test-d.ts:38, 77`.
- **Order risk.** T118 lands first on the body-declared API, and its sequence fixture uses `Flow.keyed`; the
  Declared-schedules Task rewrites it. @plan.Machines O5 still describes `Flow.keyed`, so it needs the user's edit.

### 1.8 Which red classes close

- **Closed by SI plus the rulings:** all seven classes in T118's 16:01:46Z comment, and T57's review-2 B2,
  review-3 B1 and B2, and review-4 B1 and B2.
- **Open:** S-1 (closed in rule, open in mechanism), S-2, S-3, S-4, `etk`, creation refusal (a scope conflict
  between SI:330-333 and the ruling), key-order ties (I32), and T56's `dueAt` reading.
- **Prior art:** none of R2's 15 answers concerns schedules directly. Q6's merge (section 3.3 of R2) is already
  half built: `Audience.Life` and `Audience.Identity` (`core/ledger.ts:23, 322-330`) are the holder table, so FR's
  "End drops parked endings" (FR:57) contradicts running code, not only the consult.

## 2. The other eleven designs

Each section gives problems, fit, the core algorithm, correctness measures, the Spec, and holes. Problems already
settled by R2 are not repeated.

### 2.1 Turn parts (TP)

- **Problems:** @plan.Machines O3: one consistent result per turn, with raises, notifies, emits and exits inside
  parts. It also owns M1-M3. **Partly** solved: no part order for the creation path or refusals.
- **Fit:** `core/turn.ts` (607): `Accepted` (68-77) becomes `{ turn }`; `accept` (429-502) and `runTurn` (586-607),
  about 110 lines, become a walk. Guards, `sendOf`, `resolve` and `levelsOf` stay (about 450 kept). `core/serve.ts`
  (508): the accepted branch (251-365), about 80 lines, changes; `routeOf` and `serve` stay. Nine `Published`
  sites gain `why` (`serve.ts:188, 234, 353, 405`; `incarnations.ts:83, 200`; `firings.ts:67`; `context.ts:335,
  371`).
- **State inventory:** `Turn` (owner `runTurn`), walk accumulator (owner the walk), `Published.why` (owner: each
  publisher today, an implicit state machine over `routeOf`'s five Options at `serve.ts:51-75`).
- **Tables:** TP 3.2 rows 0-16 and walk W1-W9 exist. Missing rows: creation (`incarnations.ts:88-205` runs
  armings, `schedules.turned` and `publish` outside the rows), the firing's pre-turn write (`firings.ts:44`),
  refusal publications (`serve.ts:184-201, 405-418`). Row 16's "releases, then starts" has no code
  (`tx.ts:516` keeps push order).
- **Cost:** one `Turn` and one `PartRun` per turn; a single-part fast path keeps today's about ten allocations.
- **Measures:** one Story marking each row (TP:329-332) and random walks to depth 3. W1-W9 give 81 walks at depth
  2 and 729 at depth 3 over a fixed fragment tree: exhaustive is possible and unnamed. Faults: six named, none
  built.
- **Spec:** R1-R9, I1-I5; the walk table is the Requirement, the row Story its test.
- **TP-1. Row 12 "re-check resets and lists" (TP:169) against FR PD4's follow-up turn (FR:402-405). Blocks
  Spec.** Trace A (same turn): `onGone` for r1 removes r2, row 12 ends r2 and runs its `onGone`, which can remove
  r1's replacement: a loop with no bound. Trace B (follow-up): an event served between the turns sees r2 live; FR
  says "before the next event", which needs a front-queued mail that does not exist (`Mail`, `input.ts:33`).
- **TP-2. `Turn.memory` is one record (TP:107); FR instances own memory (FR:112). Blocks Spec.**
- **TP-3. The creation path is a second applier;** I5 (TP:300-301) covers `runTurn` only. **Blocks Spec.**
- **TP-4. `why` values `Begin` and `End` have no assigner (TP:132-136). Blocks build.**
- **TP-5. Arms and disarms are found by name** (`schedules.ts:381-389`); scoped schedules need a scope in the
  arming and in `Occasion.Turn` (TP PD4, open). **Blocks build.**
- **TP-6. Name collisions:** `Turn` with `Evidence.Turn` (`core/evidence.ts:94`) and `Occasion.Turn`. **Minor.**

### 2.2 Boundary channels (BC)

- **Problems:** @plan.Machines O1 props and emits; @plan.React O2; M1-M4, M12. **Partly:** the schedule occasion
  for a props change is unnamed.
- **Fit:** nothing built (BC:19-20). New: `Incarnation.props`, `Mail.Props`, an `Input` variant, `host/emits.ts`,
  `Actor.onEmit`, `LocalActor.setProps`, one read bag at six sites (`turn.ts:431-436, 460, 480-481, 591-596`,
  `context.ts:289`, `schedules.ts:87`). The props turn reuses the context wave's template (`context.ts:367-375`).
  Keep: nearly all of today's code; change about 60 lines in core and 40 in host.
- **State inventory:** props (owner `serve` on `Mail.Props`), listener sets (owner `host/emits.ts`, per M4).
- **Measures:** a 75-row product (BC:333-335) and a generator; the 75 rows are a real exhaustive check. None built.
  The wrong-ending Story is named (a renamed emit after reload gives nothing).
- **BC-1. PD1 (answered) deletes `propsBaselines`; BC still uses it** (BC:61-62, 221-227, 264, 298). **Blocks
  Spec** (text).
- **BC-2. No schedule occasion for a props turn.** `Occasion` has no `Props` (`schedule-decision.ts:30-50`).
  Trace A (as `Context`): every check runs, and `restartOn` reading props restarts. Trace B (as `Lanes`): keys and
  reasons only, so a `restartOn` over props stays stale until the next turn. **Blocks Spec.**
- **BC-3. A throwing listener wedges the driver.** `options.sink` at `host/driver.ts:358` is outside any
  `Result.try`; a throw skips `running = false` (392). Today's inspection sinks detach on throw
  (`host/runtime.ts:286-291`); PD6 says a listener stays. **Blocks build.**
- **BC-4. `TurnInput` has no props, and no `Input` variant reaches `Mail.Props`. Blocks build.**
- **BC-5. "Table 3.2's matrix" (BC:335) does not exist; `ReportCode` is closed** (`core/evidence.ts:25-30`).
  **Minor.**

### 2.3 Fragments (FR)

- **Problems:** @plan.Machines O1-O3 fragments, R2's Q6 merge and Q7 (`resetOn` on subroutines), CO 4. **Partly:**
  FR's text predates the merge.
- **Fit:** new: `Instance`, `InstanceId` (`mint("inst")`, `core/tx.ts:182-186`), `OwnedBy.Instance`, `ownerLive`
  replacing three stale-owner checks (`firings.ts:82`, `serve.ts:395-398`, `step.ts:112`). Change:
  `incarnations.ts` `start`, `ensure`, `end`, `boot`, `graces` (about 200 of 513); every schedule entry point
  takes a scope (about 70 lines of `schedules.ts`). Keep: the ledger's audiences, which already are the holder
  table.
- **State inventory:** instance status `Live | Frozen` (owner `reconcile`), owed rows by address (owner the
  ledger), `unsettled` (owner `serve`).
- **Measures:** sequences of 1 to 4 over `2n + e + 13` atoms from four starts (FR:336-348). With n = 5 and e = 2:
  15,625 at depth 3 per start. Twelve faults named, none built. Four existing faults on stale-owner checks
  (`owned-ending-routed-current`, `late-routed-as-current`, `late-from-root`, `free-actor-outlives-grace`) need
  re-pointing to `ownerLive`.
- **FR-1. `whenAbandoned` at actor end.** Table 3.3 runs it for any cause but `Exit` (FR:174), and `ActorEnded` is
  a cause; PD3 runs none (FR:397-400). **Blocks Spec.**
- **FR-2. FR:57 "End drops parked endings"** contradicts R2 Q6 and `ledger.suspend` (`core/ledger.ts:322-330`).
  **Blocks Spec** (text; the answer is known).
- **FR-3. Schedule occasions for instances do not exist.** FR:85 names `Entered`, `Left`, `Frozen`, `Thawed`; the
  code has `Turn`, `Context`, `Lanes`, `Fired`, `Restore`. Plan O8 says frozen timers keep `dueAt` or `left` and
  fire once if overdue on thaw, so `decide` needs Freeze and Thaw rows and a per-instance `Scheduled` map, which
  SI's one map by name (SI:86) does not have. **Blocks build.**
- **FR-4. Three flags for one owed follow-up:** `context.owes` (`context.ts:168-172`), at most one `Mail.Context`
  (`context.ts:222-228`), FR's `unsettled`. One owner is needed. **Blocks build.**
- **FR-5. Two orders for appended parts:** "deepest first" (FR:174) and "key order" (FR:190-192). **Minor.**
- **FR-6. `disposal.ts` ends no instance** (FR:28 against `disposal.ts:54-90`). **Blocks build.**

### 2.4 Saved records (SR)

- **Problems:** @plan.Persistence O5; W5 (key parsing), W7 (whole-record owed quarantine), W8, W9; R2 ledger 7, 9,
  10, B1; CO 3 (instances), the T118 fields. **Partly.**
- **Fit:** `core/record.ts` (456): about 250 / 200 / 0 (key parsing moves to one key codec). `core/actor-record.ts`
  (469): about 330 / 140; `stepFour` reads the definition and invents `armedAt` and `attempt`
  (`actor-record.ts:380-394`), against SR:156-158. `core/persist.ts` (499): about 380 / 120.
  `core/codec.ts` (340): keep all. `core/record-format.ts` (49): about 40 / 10.
- **State inventory:** `World.aside` (renamed from `quarantined`, owner the judge), saved bodies (owner capture
  only, SR I2).
- **Measures:** a 48-cell edit matrix (8 reference rows by 6 edits, SR:300-306) plus three sequences. Nine faults
  named, none built. Seven existing restore faults target the quarantine map that becomes `aside`.
- **SR-1. The reference table (SR:195-204) lacks rows** for the baseline, `refused`, schedule keys, the reason cut,
  `graph`, `instances` and bookmarks. **Blocks Spec.**
- **SR-2. `bodyOf(kind, compiled)` cannot decode schedule keys or selections:** `Compiled.Schedule` holds no Schema
  (`core/compiled.ts:222-240`). **Blocks build;** see TM-2.
- **SR-3. `onExcessProperty: "error"` (SR:189) against "dropped (`FieldDropped`)" (SR:198). Blocks Spec.**
- **SR-4. The step to 7 re-keys (SR:159-161); the boot writes nothing (SR:112, I2).** No writer of the old key's
  deletion. **Blocks Spec.**
- **SR-5. A Held lane with unread input** has no type: `Head.input` is `Values` (`core/world.ts:350-352`). Today
  the whole lane is quarantined (`record.ts:314`). **Blocks build.**
- **SR-6. W8 is a capture bug, not a boot bug:** `owedWrite` overwrites a quarantined key (`persist.ts:442-463`).
  **Minor.**
- **SR-7.** `persist.ts:105-107` and `stepFour` (380) disagree on idle markers when one name sits in two states.
  **Minor.**

### 2.5 Data layer (DL)

- **Problems:** entities, streams, hydration, dormant records, bookmarks. Most wait for P5 (R2 6b). **Not**
  solved in code: nothing exists.
- **Fit:** all new; `staleTime` is declared and unread (`contract.ts:298-299`).
- **Measures:** 14 step kinds (DL:388-397), depth unstated: 2,744 at depth 3 per start. Twelve faults named, none
  built.
- **DL-1. `admit`, `classify`, `Dormant` and `World.dormant` are untyped** (DL:75, 233-247). **Blocks Spec.**
- **DL-2. Hydration fires no `onContext` (R-H3); restore's `start` owes a wave** when a saved selection differs
  (`incarnations.ts:156-165`). **Blocks Spec** for T48.
- **DL-3. DL's lane fields `basedOn`, `predicted`, `sent` are not in SR's lane body. Blocks Spec.**
- **DL-4. Positions are not `Option`** (DL:59) against CO 11. **Minor.**
- **DL-5. Streams** (`delivers: "latest"`, reconnect, `Feed.live`) have no design; T25 writes its Spec first.
  **Blocks Spec.**

### 2.6 Reads and operations (RO)

- **Problems:** @plan.Operations O2-O4, @plan.Machines O6, @plan.Runtime O6, @plan.Persistence O4. W1 (operation
  issues keyed by name, cleared by any ending of that name, `serve.ts:46, 276-280`) is SI's class for
  operations. W2 publish order, W3 unchecked lookup input, W5, W7, W8; R2 ledger 15, 19, 20. **Partly.**
- **Fit:** the lane table is untouched (I5): `core/cells.ts` and `core/lane-moves.ts` (843 lines) stay whole.
  Change: `serve.ts` about 45, `ledger.ts` about 25, `answers.ts` about 30, `lanes.ts` about 35, `world.ts` about
  50, `contract.ts` about 45, `host/driver.ts` about 40 (`ownerOf`, 177-186, dies). New: the entry store, about
  300. Reads already owe rows (`answers.ts:34-53`), against RO:55.
- **State inventory:** `Entry` (owner the entry table), `ReadSlot` (owner: no table), `Releasing` (owner the
  release table), `Owed.refusal` (owner the ledger; prose only).
- **Measures:** a generator of 1-3 actors by 1-3 keys by 12 cues, about 108 atoms, no depth. The wrong-ending
  Story is named (R1: two keys, A kept, B accepted, A's issue still shown). Nine faults named, none built;
  `newer-lookup-unsuperseded` targets replaced code.
- **RO-1. Disposal "Owe all Interrupted" (RO:248)** against the ledger: a Life row owed while Disposing closes as
  evidence (`ledger.ts:197-208, 264-266`). Trace A: waiters get `Interrupted` rows that nothing can hear. Trace B:
  evidence only, as today. **Blocks Spec.**
- **RO-2. Settled on Idle is "Impossible"** (RO:244), but `Clear` while Running interrupts a call whose settle can
  still arrive. **Blocks Spec.**
- **RO-3. `Releasing.overdue` is stored and set by a timer** (RO:312-319); M8 derives it. **Blocks Spec.**
- **RO-4. The publish runs inside the ledger's heard callback** (`serve.ts:405-420` inside `tryOne`,
  `ledger.ts:279-313`); RO:136 needs the row written first. **Blocks build.**
- **RO-5. `Position` across boots:** the counter restarts at 0 (`core/world.ts:617`); R2 section 4 says restored
  positions are `Option`. RO does not adopt it. **Blocks Spec.**
- **RO-6. `Trigger` cue undefined, `waiting.after` never assigned, collect timing unnamed** (RO:215-262).
  **Blocks build.**
- **RO-7. Text behind settled answers:** retries (RO:30 against RO:342, Q9), the record mapper (RO:91, 361) against
  `(value, { input, key })`, `InvalidKey` against `InvalidInput`, "keeps `CleanupOverdue`" (RO:323) against M8,
  `issues-of.ts` "NEW" against M7. **Minor.**

### 2.7 Errors and trust (ET)

- **Problems:** @plan.Diagnostics O1-O4; G1-G11; R2 B2, B3, Q4, Q5, M8, M13. **Partly.**
- **Fit:** about 600 lines touched across about 30 files, mostly mechanical: `error.ts` about 90, `entry.ts` about
  100 (registry to `made`), `config.ts:340-349` (`findingsAgainst` returns the decoded value), `host/close.ts` about
  45 (`failureOf`), `core/boundary.ts` `admitted` (528-541) rewritten.
- **Algorithm:** admit is lift then decode the copy. ET defers whether `walkerOf` already reads once (ET:148-149).
  It does not: `admitted` reads `given[n]` again after `walk.is` (`core/boundary.ts:528-541`), so a getter can
  change between check and copy. The answer is the new walk.
- **Measures:** a hostile table (doors by argument by hostile value, ET:275-278) whose size follows from the surface
  walk, and a 12-cell cause matrix. Nine faults named, none built.
- **ET-1. `failureOf`'s table** gives one diagnostic per failed cleanup (ET:214-217); ET section 1 keeps one
  `CleanupFailed` with every cause; code makes a defect body plus a cleanup failure a `Die`
  (`host/close.ts:262-280`). **Blocks Spec.**
- **ET-2. `CATALOG` covers `Code` and `Reason` only;** `IssueCode`, `ReportCode`, `LaneFact`, `Decline` and
  `ReadFailure` stay separate lists, against R2 section 4 ("T100 owns every code"). **Blocks Spec.**
- **ET-3. PD1 renames saved reason text** (`StorageRefused` in owed rows, `record.ts:95-104`): a format step.
  **Blocks build** (section 3, X-1).
- **ET-4. I3 "throw at three sites"** against 11 today (for example `host/driver.ts:396`,
  `host/owners/schedule-steps.ts:27`); the lint `throw-only-listed` does not exist. **Minor.**
- **ET-5. Text behind settled answers:** the `WeakMap` brand (ET:107-109) against Q4, the keep-list against B3, the
  run-promise squash claim (G9; `host/run-promise.ts` keeps the cause). **Minor.**

### 2.8 Static rules (SC)

- **Problems:** @plan.Rules O2-O6, @plan.CommandLine O2-O5, Q2, Q3, Q10, Q11, M5. **Not** built.
- **Fit:** new `core/checks.ts`, `core/graph.ts`, `host/rules.ts`, `testing/verdict.ts`, `cli/result.ts`;
  `host/cli/main.ts` (136) rewritten. Keep the compile pipeline.
- **Algorithm:** a judge per publication with `before` per incarnation, the switch table, a terminal proof over an
  over-approximated edge graph. SC's check table has 7 rows (SC:189-197); "about 90" is a claim about the Plan.
- **Measures:** the best of the eleven: every 3-step sequence over `{Turn, Other, Begin, End}`, 64 sequences
  (SC:501-503). Thirteen faults named, none built.
- **SC-1. Q11 against the loader.** A construction failure throws at import; `load` maps every import failure to
  `ConfigLoadFailed` (`host/cli/discover.ts:48-57`), which exits 2, and the module's other machines are lost.
  Trace A (as today): exit 2, no findings. Trace B (Q11): exit 1 with findings needs a catch per `machine()`
  call, which the import cannot give. **Blocks Spec.**
- **SC-2. A turns rule needs `event`, `payload`, `context`;** `Published` has `{ actor, state, memory }`
  (`core/evidence.ts:157`). It must read TP's `Turn`. **Blocks build** (seam to TP).
- **SC-3. `enabled: import.meta.env.DEV` (SC:255)** in `machine()`, which is core: a host API, undefined under
  the plain CLI. **Blocks Spec.**
- **SC-4. One severity per reason (I12)** against `UnhandledEvent` as a warning (SC:196) and an error
  (`machine.ts:225`), and `DelayOutOfRange` as both a construction refusal and a check row. **Blocks Spec.**
- **SC-5. `Machine<D, Names>`** must still match `infer M extends Machine` (`host/setup.ts:23`). Needs a type spike.
  **Blocks build.**
- **SC-6. Seen counts are stored (SC:64);** "store facts, derive views". **Minor.**

### 2.9 Typed machine (TM)

- **Problems:** @plan.Machines O1, O8 types; declared schedules; no `Flow.keyed`; C6; Q3; the mapper shape.
  **Partly:** TM rests on "never read back" (TM:7-8, 88-91), which Q1 replaced.
- **Fit:** `definition.ts` about 45, `machine.ts` about 40 plus `Parts` moved, `tokens.ts` about -45/+15,
  `derive.ts` new (about 45); tests about 350 lines. No runtime state.
- **Measures:** four planted type patches (TM:384-386), 16 compilations at depth 2. Two existing pins assert the
  opposite of R5 and R6 (`tests/types/schedules.test-d.ts:60, 301`). Exhaustive is not needed beyond the patch set.
- **TM-1. The declaration's shape:** config key, the `Definition` type parameter (`Parts` infers seven,
  `machine.ts:35`), body types mapped over declared names (`StateConfig.schedules` is `Record<string, …>`,
  `tokens.ts:366`). **Blocks build.**
- **TM-2. "Compiled gains nothing" (TM:285)** against "saved records read the declared key Schema" (TM:83, SR:119).
  The core reads only `Compiled`. Trace A (not in `Compiled`): a key whose Schema changed restores and routes to
  the wrong timer. Trace B (in `Compiled.Schedule`): restore drops it with a report. **Blocks Spec.**
- **TM-3. Is a schedule `send` an ending mapper,** so `(value, { input, key })`? Code passes one argument
  (`compile-schedules.ts:157`, `firings.ts:48`). **Blocks Spec.**
- **TM-4. Must every body schedule be declared, and may a declaration lack a body?** The sequence fixture builds two
  arms (`tests/turn/schedule-sequences.test.ts:79-99`). **Blocks Spec.**
- **TM-5. `paused` against `pausedBy`;** BCS's `pipe` leaf mark names no token; `const B` disagrees between R2:281
  and BCS:126. **Minor.**

### 2.10 UI and host (UH)

- **Problems:** @plan.React O2-O3, Q14, M4, M9, M12, PD4, PD5. **Not** built: no React binding in the package.
- **Fit:** `host/driver.ts` about 25, `host/runtime.ts` about 55; new `publication.ts`, `binding.ts`,
  `platform/tab-lock.ts`, `platform/memory.ts`. `platform/indexeddb.ts` stays: the `database` option exists (218)
  and `landed` waits for `complete` (98-107), against UH:26 and UH:252.
- **Measures:** sequences up to length 6 over 9 atoms in real React (UH:371-373): about 600,000 per Strict Mode
  setting, too many; it needs a cut alphabet. One of eight faults exists (`idb-landed-on-complete`).
- **UH-1. `publish` compares after it overwrites.** `snapshotAt(current, actor)` writes the one memo slot before
  `peek(before, key)` reads it (UH:97-106), so every listener is told and R-P5 fails; `peek` and `actorOfKey` are
  undefined. **Blocks build.**
- **UH-2. `Serve` runs in a later task** (`work.fork("serve", …)`, `host/driver.ts:374-379`), so one user action
  can publish twice; PD1's trace A holds only for synchronous sends. Q14's answer rests on trace A, so the Spec
  must drain `Serve` in the same task or accept two notifies per action. **Blocks Spec.**
- **UH-3. Emits stamped with the publish version** (UH:221-230) against M4 (listeners at row 15; `publish` calls
  nothing). **Blocks Spec.**
- **UH-4. `pagehide` "wait its answer" (UH:244)** against the Safari measurements
  (`prototypes/safari/RESULTS.md:9-17`): the answer arrives only on return. An interrupted write also leaves
  `out = true` (`host/edge.ts:200`). **Blocks Spec.**
- **UH-5. Props before attach** need `Input.Ensure` to carry props (`core/step.ts:143`): a core change. **Blocks
  build.**
- **UH-6. A capture changes marks, not snapshots,** and would bump the version. **Minor.**

### 2.11 Test tooling (TT)

- **Problems:** @plan.Testing O6, O8; Q10, Q13, M5, M9. **Partly.**
- **Fit:** `testing/fake.ts` (855) about 250 change; `testing/run.ts` (789) about 120; `testing/seam.ts` (211)
  deleted, with 10 importers (TT:27 says 4); `testing/generate.ts` about 200; every rule body in
  `tests/rules/rules.ts` (strings to `Breach`). `testing/clock.ts:24-34` drains with `splice` and `shift`, so
  settle is quadratic.
- **Measures:** `sequencesOf(words, 3)` over store words, two tabs and two stores (TT:320-321): about 32 atoms,
  32,768 at depth 3. Ten faults named, none built; 34 existing faults edit `testing/` with exact-once `find`
  strings and must be re-pointed inside T97 and T112.
- **TT-1. Rules cannot reach `run()`.** `defineConfig` has `apps` and `stories` only (`testing/config.ts:47-51`),
  and only the CLI loads `flow.config.ts`. **Blocks Spec.**
- **TT-2. Rules return strings** (`tests/rules/rules.ts:35-38`); a `Breach` needs a step and evidence. **Blocks
  build.**
- **TT-3. `propertyTest` returns at the first failing seed** (`testing/generate.ts:1286-1291`); TT:181-183 rejects
  after every run. **Blocks Spec.**
- **TT-4. Sleepers are private** in Effect's `TestClock`; `CleanupLeft` needs `tabClock` to count them. **Blocks
  build.**
- **TT-5. Four in-memory stores** (`fake.ts:558-660`, `fake.ts:798-830`, `seam.ts:73-107`, a test copy), against
  M9's one. **Blocks build.**

## 3. Holes across designs

- **X-1. One saved-format plan. Blocks Spec.** T118 adds the baseline and `refused` (5 to 6); RO adds `input` and
  `refusal` to owed rows; ET PD1 renames saved reason text; SR bumps to 7 with re-keying; FR adds instances. One
  `FORMAT` covers three kinds (`core/record-format.ts:10`), and lane and owed records have no steps. Tests pin
  `"6"` as the newer format (`tests/restore/restore.test.ts:142`).
- **X-2. Schedules per scope.** SI keys one map by name per incarnation; FR keys per instance; TP needs scoped
  arms; BC adds a props occasion. No design owns `Occasion`'s full list. **Blocks build.**
- **X-3. Held writes across a reload.** A Story reload aborts them by default (`testing/story.ts:160-166`); UH's
  `pagehide` flush lands them. **Blocks Spec.**
- **X-4. Multi-tab Stories** have no owner (UH section 5 gives tab steps to T27, TT D4 gives page life to T112);
  the model has one tab (`testing/steps.ts:17`, `testing/run.ts:291`). **Blocks build.**
- **X-5. Two equalities for one fact.** Schedule baselines use `Equal.equals` (`schedule-decision.ts:294`), context
  slots `sameValue` (`core/slots.ts:91`), props `sameValue` (M12), `resetOn` `Equal.equals` (Plan O1). A saved
  value compared after a JSON round trip needs one rule. **Blocks Spec.**
- **X-6. `issuesOf` allocates per read,** but `context.ts:330, 371` compares stored issue lists by identity. That
  stays valid only while it compares `StoredIssue`s; a schedule state change must count as changed through
  `incarnation.schedules`. **Minor.**

## 4. Algorithm problems for the Fable round

In build order. Each names its design, the state it concerns, and why the current text cannot settle it.

1. **Saved `restartOn` baseline** (SI, SR): `Timer.selection`, `SavedTimer`. No codec, no restore rule, and the
   filter at `schedule-decision.ts:274` contradicts the ruling (S-1, X-5).
2. **Re-entry's inheritance** (SI): `Scheduled.keys`, `Timer.reasons`. R19, P1, the ledger and T57 disagree (S-2).
3. **A fresh timer's first `restartOn` throw** (SI): `selection: Failed { last: none }`. No rule, rows unwritten
   (S-3).
4. **One writer of `arming`** (SI): `Timer.arming`. `fired`, `runOf` and creation write it outside `decide` (S-4,
   S-5).
5. **The amended ledger** (SI tests): the oracle at `schedule-ledger.ts:188-195` encodes the overturned rule;
   split invariant breaches from model mismatches (section 1.4).
6. **Schedules per scope and the full occasion list** (SI, FR, TP, BC): `Incarnation.schedules`, `Occasion`.
   Freeze, Thaw, instance start and end, props (X-2, FR-3, BC-2, TP-5).
7. **Post-commit reset: same turn or follow-up, and one owed-follow-up flag** (TP, FR): `unsettled`,
   `context.owes`, `Mail.Context` (TP-1, FR-4).
8. **One applier** (TP): `Turn`, `Published.why`. Creation, the firing's pre-turn write and refusals sit outside
   the rows (TP-3, TP-4).
9. **Instance status with the holder table, actor end included** (FR): instance status, owed rows by address
   (FR-1, FR-2, FR-6).
10. **Entry, slot and release tables complete** (RO): `Entry`, `ReadSlot`, `Releasing`. Settle after clear,
    disposal against the ledger's Life rule, `Trigger`, `waiting.after`, collect, overdue derived (RO-1 to RO-3,
    RO-6).
11. **Row before publish** (RO): owed row, `Published`. The publish sits inside `tryOne` (RO-4).
12. **One saved-format plan** (SR, SI, RO, ET, FR): `FORMAT`, the per-kind steps, steps that read no definition
    (X-1, SR-4, `stepFour`).
13. **The reference table complete** (SR, TM): `Fate`. Reason cut, key decode against `Compiled`, excess against
    dropped (SR-1 to SR-3, S-7, TM-2).
14. **`failureOf`** (ET): a dispose's `Exit`. Diagnostic count, the interrupt row, combine order (ET-1).
15. **Publication** (UH): `Publication`, the memo. Compare before write, `Serve` in a later task, the stop path,
    emit stamping against M4 (UH-1 to UH-3).
16. **Held writes across reload and `pagehide`, and multi-tab Stories** (UH, TT): batch status, page (X-3, X-4,
    UH-4).
17. **Construction failure in the CLI** (SC): `Outcome`. Q11 against the import (SC-1).
18. **Verdict plumbing** (TT, SC): the verdict. Rules into `run()`, `Breach`, all seeds, the turns rule's input
    (TT-1 to TT-3, SC-2).
19. **The declared schedule threaded through types and `Compiled`** (TM): `Definition`, `Compiled.Schedule`
    (TM-1, TM-2, TM-4).

## 5. Salvage by area

Lines are today's `src/` (tests excluded except where named). New code is not counted in keep.

| Area                                                | Lines | Keep  | Change | Delete or rewrite | Main reason                       |
| --------------------------------------------------- | ----- | ----- | ------ | ----------------- | --------------------------------- |
| Schedules (5 core files + host steps)               | 1,641 | 1,030 | 520    | 90                | SI: issues derived; `Scheduled`   |
| Turn (`turn`, `serve`, `step`, `tx`)                | 1,873 | 1,500 | 260    | 110               | TP walk; BC read bag; FR owners   |
| Incarnations, context, life, disposal               | 1,406 | 1,100 | 280    | 25                | FR instances and `reconcile`      |
| Lanes and ledger                                    | 1,742 | 1,610 | 130    | 0                 | RO; lane table unchanged (I5)     |
| Records and persistence                             | 1,926 | 1,450 | 400    | 75                | SR judge, key codec, steps        |
| World, evidence, vocabulary                         | 1,323 | 1,180 | 120    | 25                | `Timer`, `StoredIssue`, `Turned`  |
| Boundary, same, frozen                              | 989   | 900   | 20     | 70                | ET lift replaces `admitted`       |
| Compile and front end                               | 4,385 | 4,050 | 265    | 70                | TM declarations; `Flow.keyed` out |
| Trust surface (`entry`, `error`, contract, handles) | 936   | 650   | 186    | 100               | ET doors, `made`, `CATALOG`       |
| Host (driver, runtime, close, edge, platform)       | 3,904 | 3,650 | 250    | 5                 | UH publication; BC emits; ET      |
| Test tooling (`host/testing/`)                      | 4,894 | 4,080 | 600    | 215               | TT: seam out, one store, verdict  |
| CLI                                                 | 277   | 140   | 0      | 137               | SC: one `Result`, exit table      |

About 84% of `src/` (21,340 of 25,296 lines) survives as is, most of it in the compile front end, lanes and host.
The rewrites are concentrated in the turn walk, the schedule issue seam, records and the test tooling.

## Sidecar log

Eight Haiku sidecars, effort high, read-only, in two waves of four. Four first attempts as `Explore` agents ended
without a report and were re-run as general-purpose agents. Every finding used above was re-read in the code or the
record. The test counts, fault count and `Equal.equals` behaviour were re-run.

- **1. Schedule salvage.**
  - Accepted, after reading the code: the function table, D2 (`paused` writes `run` at 405), D3 (map by
    `trackOf`), D4 (no saved baseline), D5 (no `Refused`), D8 (filter at 274), D11 (exit empties `kept`), the 11
    `Flow.keyed` sites.
  - Changed: D1 is SR's and SI's disagreement as well (S-7). D12's `timed` signature folds into S-4.
  - Rejected: D13 (`inspect.ts` reads no issues) is true but harmless; SI names it only as a reader to switch.
- **2. Ledger of T57 and T118 problems.**
  - Accepted: A9, A12-A17, A21-A24, A30, A31, A35, B3, B4, B8-B11 (each re-read in the record or code).
  - Changed: A15 merged into S-2 with the ledger line I found (`schedule-ledger.ts:175`). A27-A29, A36-A39 and C1-C10
    are real but off this review's algorithms; not used.
  - Rejected: none.
- **3. Turn parts, boundary channels, fragments.**
  - Accepted: items 1-5 of its bottom line, each re-read (TP:165-170, FR:172-176, FR:396-405, BC:59-63, BC:408-418),
    the missing rows, the driver sink at 358, and the three owed-follow-up flags.
  - Changed: its `Published` count of nine sites, kept as stated after a grep.
  - Not used: the `readsOf` name collision (folded into M13 already).
- **4. Saved records, data layer.**
  - Accepted: D1 a, b, d, D2, D5, D6, D8, D9, D10, D12, the reference-table gaps, `stepFour`.
  - Rejected: D1 c (a decoded baseline restarts spuriously because `Equal.equals` compares by reference). Effect
    4.1.4 compares plain objects and arrays structurally. Kept the narrower risk: values JSON cannot round-trip.
  - Changed: "R2 6b misstates CO 5" to imprecise; DL's undeclared records are `Retired` and its lazy ones
    `Unverifiable`, both per CO 5. Not a hole.
- **5. Reads-operations, errors-trust.**
  - Accepted: RO-1 to RO-7, ET-1 to ET-5, the `walkerOf` double read (re-read at `core/boundary.ts:528-541`).
  - Changed: "ET claims `walkerOf` reads once" to "ET defers the question" (ET:148-149); the finding answers it.
- **6. Typed machine, static rules.**
  - Accepted: C1-C9 as settled-text gaps, H1-H5, SC Ask 4 against the loader (re-read `discover.ts:44-58`,
    `main.ts:128-136`), the 11 `Flow.keyed` calls, the two contrary pins.
  - Not used: citation drift in TM line numbers (minor, fixed at Spec time).
- **7. UI host, test tooling.**
  - Accepted: UH-1 (re-read UH:88-106), UH-2, UH-4, `indexeddb.ts` facts, the clock queue (re-read
    `clock.ts:20-36`), TT-1 to TT-5, the 10 seam importers.
  - Not verified, so not used: whether a forked fiber's first step runs inline (UH's `pagehide` timing).
- **8. Correctness measures.**
  - Accepted: the per-design measure inventory, the fault count (recounted: 449), the faults on deleted code, the
    SC and TP alphabets.
  - Changed: its full-alphabet size for SI (3,240 atoms) is SI's whole inventory, not its enumeration; kept only
    the finding that SI's 504-atom figure cannot be derived.
