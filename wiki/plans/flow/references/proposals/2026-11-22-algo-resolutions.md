---
proposal algo-resolutions
status proposed 2026-11-22
---
# Resolutions for the six algorithm designs: blockers, contradictions, questions, Tasks (2026-11-22)

**Bottom line:** every Spec blocker of @review.final-review now has replacement text below, except three that
need a run or a spike and are named as open holes (the turn model's missing invariants, the two type spikes, and
one more records model run). Each cross-design contradiction has one answer and one owner. The 29 correctness
calls and the 11 duplicate groups are answered by this record; the 26 user calls, and six more this record
raises, carry a recommendation with before and after and stay proposed. Three resolutions follow a user decision
the designs had drifted from (an invariant's inputs, the word "broken", a bare `expectBroken`). The fixture walk
finds one real gap no design covered, the retry guards, which is designed here; streams, server rendering, Story
frames and redaction are deferred to the Tasks that already own them, each with a design step first. Fourteen
Tasks are new (T119 to T132). Nothing here is decided by the user: every item is proposed until the user accepts
it.

Short names, as the review uses them: S = @proposal.algo-schedules, T = @proposal.algo-turn,
R = @proposal.algo-records, O = @proposal.algo-operations, Y = @proposal.algo-types, H = @proposal.algo-host.
`S:292` is a line of that file. "Replace" gives the exact text a Spec writer copies in place of the cited text.

## 1. Resolutions, by design and section

### 1.1 Schedules (S)

**S1. Question 8's answer A carried into every table** (mechanical; five places).

- **S 6.3, the start causes (S:292-294).** Replace the paragraph with: "The first row that matches wins. A start
  cause is any of: `Turn.started` is `Given`; table Selection said restart; the timer is new and its schedule is
  keyed or arms on entry; the arming is `Refused` (on any occasion its scope hears: a refused start is tried
  again every time, question 8)."
- **S 8, I6 (S:490).** Replace with: "A reload equals a quiet occasion: under the same build, `wake(encode(s))`
  equals `decide(s, Lanes)` with no input changed and no evidence, but for arming ids. As a sequence property:
  replacing a reload by a lane move that changes nothing changes no later view. Needs no model."
- **S 11, the input gate (S:666-670).** Keep "`pass` keeps the identities ... from its last run." Replace the two
  sentences after it ("When all are the same ... is skipped." and "The delay reads `now`, but ... never skips.")
  with: "When all are the same, the occasion carries nothing for the schedule (no disarm, start or firing), it is
  not a `Wake`, and no timer of the schedule is `Refused`, the schedule is skipped. The delay reads `now`, and it
  runs only at a start, a retried `Refused` start included, which the gate never skips."
- **The expected-result row (S:570).** Replace the result cell with: "`bad` is `Refused` after the first step,
  arms at the second step (question 8) and fires; the reload changes nothing".
- **The planted-fault row (S:594).** `refused-not-retried-at-wake` is replaced by two rows: "`refused-not-retried`
  | `Refused` is not a start cause | the row `bad` out of range / `bad` appears / reload; I6" and
  "`gate-skips-refused` | the input gate skips a schedule that holds a `Refused` timer | the same row, gated
  against ungated". The count of plants at S:583 goes up by one.

**S2 (minor).** S 3 and S:492: the `Decided` brand is "handled at one point (a brand and a lint rule)", not
"removed". T:118's "Removed" for the `Applied` brand takes the same wording.

**S saved names (X5).** The saved timer is R's `TimerShape`, and the saved per-schedule value is R's `Shape` for
`Position.schedules`. The names `SavedTimer` and `SavedScheduled` are replaced at every use: S:212, S:376-377,
S:385, S:441, S:770. S keeps the decode table (6.5): what each saved field means at `wake`. R owns every saved
Schema name.

**S alarms (X1).** S:772, replace with: "**Offers** the `Schedule` alarm kind: the applier is the only writer of
`Schedule` alarms, and it writes them through AT's `tx.alarms`. The due order of 6.8 orders `Schedule` alarms
that share a deadline." S:664-665's "the due index" is AT's heap; the order across kinds is AT's (1.2).

**S hidden page (X2).** S 6.7's row "freeze, the last use released, the page hidden" (S:407): delete ", the page
hidden" (proposed, the user's call: section 2, C2).

**S types.** `Reads<Key, Why>` is renamed `ScheduleReads<Key, Why>` at every use (S:212, S:214, S:229, S:615);
`Reads` is Y's callback-input type. S's `Schedule<Key, Why>` and `Scheduled<Key, Why>` lose their parameters in
stored state (the core holds `KeyText` and `Values`, as R:247 already writes `Scheduled`); the typed face is
`TimersOf<D>` through `project` (Y 5.2, 5.6). RT6 is withdrawn: `output` stays `unknown` (Y 5.5; two typed shapes
failed to compile).

### 1.2 Turn (T)

**X3. Arms of a scope that ended in its own turn.**

- **T 7, row 7 (T:766).** Replace the line with: "`after = acc.memory`; resolve each part's actions and sends on
  `after`; resolve a part's scope's arms and disarms on `after` only when no instance on that scope's address
  ended in this turn (no `End` for it or for a host of it in `acc.steps`; an ended scope hears nothing, 6.12)
  // row 7". A state left and entered again is a new activation and is not an `End` step, so its entry arms are
  resolved as before.
- **T 8, I10 (T:823).** Append: "; no schedule callback of a scope runs after that scope's `End` in the same
  turn".
- **T 9, the sequence alphabet.** Add the atom "a part of instance `k` enters a state with a computed `after`
  while its own event's patch removes key `k`"; expected: the turn is accepted, `k` ends, its delay is never
  called.

**X1. Alarms.**

- **T 4.1, the alarms row (T:152).** Replace with: "alarms | one heap of `Alarm`, a tagged union: `Schedule {
  scope, arming }`, `Grace { actor }`, `Bound { disposal }`, `Silent { ticket }`, `Collect { entry }`, `Release
  { call }`; at most one per owner fact | `tx.alarms.set` and `tx.alarms.clear`, called by the owner of each
  fact in the transition that writes the fact: AS's applier (row C5), the grace view, the disposal and ticket
  rows, AO's entry table (6.2) | `tick`, the host's one wake | no: views".
- **T 7, `tick` (T:797-800).** Replace with:

  ```text
  tick(tx):                                          // step.ts; replaces `fired`
    due = alarms.takeDue(env.now)                    // by (at, kind in the order below, the kind's own order)
    for alarm in due: Alarm.$match(alarm, {          // total by type: a new kind does not compile until handled
      Bound: as today;  Silent: as today;
      Release:  entries.releaseDue(call)             // AO 6.2; writes no state, marks the call's holders touched
      Collect:  entries.collectDue(entry)            // AO 6.2
      Grace:    apply(End Grace)
      Schedule: enqueue Mail.Firing })               // among themselves in AS's due order (AS 6.8)
  step(tx, input): ...; entries.stepEnds(); command(Wake { at: alarms.next() })   // the last two rows of a step
  ```
- **T 8, I12 (T:825).** Replace with: "Alarms match: the heap holds exactly one alarm per live owner fact and no
  other: `Schedule` per `Armed(Due)` run of an awake scope (AS I9), `Grace` per free actor, `Bound` per disposal
  in progress, `Silent` per awaited ticket, `Collect` per entry that is Idle, unheld and has `gcTime > 0`,
  `Release` per call in `releasing`."
- The `Wake` command moves from `tick`'s last line to the step's last row, after `stepEnds`, because `stepEnds`
  may set a `Collect` alarm. T:315's "in due order" reads "in the order of `takeDue`"; T:1162's offer stands.
- The kind order at one instant (`Bound`, `Silent`, `Release`, `Collect`, `Grace`, `Schedule`) is proposed: no
  trace found depends on it, since a free actor has no awake scope and an entry's alarms touch no turn.

**X4. A throwing read (T H3).** T 5 (T:329-331), replace the bullet with: "`reconcile` fails only when
`resetOn`, an input filler or a list read throws: the slot that threw. In a turn that is row W7. Under `Begin`
the family rule holds: the slot keeps what the record gave it, its field is `Failed(f)`, its issue's source is
AO's `StoredSource.Slot`, and the next occasion that reads the slot reads it again." T's H3 closes: the source
name is `StoredSource.Slot` (O:846).

**X6. Emit timing.** T 6.10 (T:658-663), replace the last two bullets with: "`src/host/emits.ts` owns the
listener sets. The host's `publish` calls it once per publishing slice, after the snapshot listeners, with the
turns of every step since the last publication, in turn order (AH 6.1, 6.3). Each call sits in its own
`Result.try` (BC PD6, BC-3); the inspector sink at `driver.ts:358` gets the same guard. Emits are in the `Turn`
before the turn's sends are served; listeners run at the publication that shows the turn, never before it."
T:153's reader cell becomes "the host's publication (AH 6.1 step 5)". T:180's cells become "the world at the
publication that shows the turn" and "once per emit, per listener, at that publication".

**X2. Hidden page.** T 6.12 (T:722), replace the last sentence with: "A hydration reaches the core as a `Begin`
from a record. A hidden page does not reach the core in v1: the host's edge reads `hidden()` for its capture
only (AH 6.4)." T:1180's "a hidden page and a hydration as a use change and a `Begin`" becomes "a hydration as a
`Begin` from a record; a hidden page is not a core input (AH 6.4)". Proposed; section 2, C2.

**X8. Freeze and calls.** T 6.5's `Freeze` cell (T:500), replace "its calls are interrupted" with: "its
life-held calls are interrupted, and each of its waiting lookups is owed one `Interrupted` row; a read's request
belongs to its entry and runs on while any hold remains, a frozen slot's hold included (AO 6.6)".

**X5. Saved keys.** T 14 (T:1167-1169), replace "Lane and owed record keys gain the subject." with "Lanes and
rows in the `work` record carry their subject (AR 4.4, Q2)."

**B1. Context after `Wake`.** T 6.7 (T:594-596): keep the text; add "AS question 4's answered rule and this one
give the same views; AS 6.7's 'differs' test is the specification, the unconditional pass is its
implementation." No overturn: T's own note says the results are equal.

**T1. The model.** Not resolvable on paper. The Spec may be written; the invariants no model checked (I5, I7, I9,
I12, I13, I15 to I17) become the first failing checks of the turn-parts Task (@task.V3.T119), as a package
sequence test, not a scratchpad model. Open hole 1.

**W3, sites or moves.** W3 (T:346) stays as written and gains: "A second site with a target refuses the turn
even when both sites name the same state: a turn's move has one owner (I6)." The model's 312 cases are refused
on purpose; two sites that agree today disagree after an edit, and exit and entry would have two sources.

**T2 (minor).** T 6.5, after the trigger table (T:516), add: "A raise into a frozen plain slot refuses the turn
(W9) while a public event to the same target is `Unhandled`: a raise is part of its sender's turn and a turn is
whole (I15); a public event is its own turn and changes nothing either way."

### 1.3 Records (R)

**R1. A memory field that does not read** (the user's call; question U1 in section 3.3). Recommended: the table
row stands (R:415, `ResetRecord`), and the ledger row (R:794) is replaced with: "A throw changes only its own
check | traded once: detection is per leaf (`decodeBy`), and a `slots`, `baselines` or `graph` leaf that does
not read is dropped alone; a `memory` field that does not read resets its position (the actor restarts from the
definition's initial state and memory), because a position with one field put back to its initial is a state the
machine never reached (P2: nothing invented). The work side is untouched (I11)."

**R2. `persist` turned off.** The record is kept unread, not discarded: a discard would drop an owed unknown on
the work side (P1), and `Discard` is the cache side's fate only (R:262, R:310). It is `admit`'s row, since stage 1
reads no definition.

- **R 4.4, `Fate` (R:259).** `Kept`'s `why` gains `"NotPersisted"`.
- **R 7, `admit` (R:600).** Replace the first line of the loop body with: "`m = app.machine(owner.machine)`
  undeclared -> `Kept(Orphan)`; lazy, not loaded -> `dormant[owner] = g`; `m.persist` is false ->
  `Kept(NotPersisted)` for every key of the group".
- **R 7, `encodeStore` (R:616).** Replace with: "for key in marked, fate not Kept, not Dormant, and its machine
  has `persist: true`:". I12 then holds by this gate.
- **R 6.3.** Add the row: "`Kept(NotPersisted)` | the machine is declared with `persist: false` and a key of an
  earlier build exists | nothing is read or written; the actor starts fresh in memory; reported
  `RecordNotPersisted` once per machine with a count". The code is one more `CATALOG` row (class Failure, issue
  false, report true).
- **R 2, P8 (R:83).** Reads: "no key is read or written for a `persist: false` machine; a key an earlier build
  left is kept and reported".

**R3 (minor).** R 6.2, add: "A test pins the pair (`FORMAT`, the hash of the `Shape` Schemas); changing one
without the other fails it, so a shape change cannot ship without a format step."

**R ledger.** Add rows: "Store facts, derive views | traded once: a format 5 `Held` head with no row is told
`Restored` once more after the upgrade (Q9), because format 5 saved no fact that says it was told" and "Cheap
operations | traded: a capture rewrites the whole `work` text, O(b) in its bytes (Q2); the bench decides".

**R H13.** The P2 failures were a model bug (review section 2); the hole narrows to "timers, instances, cache
records and steps 1 to 4 are in no model", which blocks build for @task.V3.T92, not the Spec. Open hole 3.

### 1.4 Operations (O)

**O1. The retry guards** (`O.x.idle`, `O.x.retryable`; designed here, proposed). They exist in the code
(`src/tokens.ts:127-136`, `src/core/turn.ts:186-195`) and keep their public shape. Add to O 6.5:

"**Guards read one view.** `lanes.viewOf` (`core/lanes.ts:355`) stays the only reader of a lane for a guard, a
member (`retry`, `cancel`) and `O.x.get`. Its lane is found by the part's subject (AT `subjectOf`), the
operation and the key's canonical text, so a guard in a fragment reads its own copy's lane. The view is derived
from the lane's head (AR 4.4, `HeadShape`) and stored nowhere:

| Lane head (`HeadShape.hold`)             | `LaneView`            | `idle`                | `retryable({ times })`                                        |
| ---------------------------------------- | --------------------- | --------------------- | ------------------------------------------------------------- |
| no lane                                  | `Idle`                | passes                | declines, `NothingToResend`                                   |
| `"Out"` (every phase but `Held`)         | `InFlight`            | declines, `InFlight`  | declines, `InFlight`                                          |
| `"Held"` (its one unknown, heard or not) | `Held { retryCount }` | declines, `Uncertain` | passes when `retryCount < times`; else declines, `RetryLimit` |

`retryCount` is the head's saved count (`HeadShape.retryCount`); each resend adds one (`lane-moves.ts:280`), so
it survives a reload. `retryable` has a keyed form and a keyless form (`tokens.ts:128-135`); both read the same
view. A guard reads the lanes as they were before the turn: `runTurn` writes nothing, and a turn's own actions
land in row C3. A key callback that throws is row W7 (`GuardDefect`, the guard's slot)." Planted faults:
`guard-reads-other-subject` (the lookup ignores the subject), `retryable-ignores-count`. Fixture check:
`home/machines/room.ts:93`, `shop/machines/cart.ts:142`, `transfers/machines/transfers.ts:59`,
`command-palette/machines/palette.ts:168`, `services/shop/machines/pay.ts:281` (keyless).

**O alarms (X1).** O 5 (O:250), replace the line with "`collectDue(entry): void; releaseDue(call): void  // the
handlers `tick` calls for `Alarm.Collect` and `Alarm.Release`"; O:251's `stepEnds` is marked "called by the last
row of the core's `step`". Every alarm the design sets or clears names its kind:

- set: O:316 and O:386 read "`tx.alarms.set(Alarm.Release { call }, now + bound)`"; O:334, O:336 and O:609 read
  "`tx.alarms.set(Alarm.Collect { entry }, now + gcTime)`";
- clear: O:289, O:386 and O:618 read "`tx.alarms.clear(Alarm.Release { call })`"; the "First hold arrives" cell
  reads "`tx.alarms.clear(Alarm.Collect { entry })`".

**O publish and `stepEnds` (H11).** O 13 (O:857), replace the last bullet with: "nothing: `stepEnds` is the last
row of the core's `step`, and `releaseDue` marks each incarnation that holds the call's key as touched, so the
host's `publish` (AH 6.1) derives `ReleaseOverdue` with no host code." O's H11 closes for the alarm; the public
event a view sends for `refetch` stays open (hole 6).

**O2 (minor).** O 6.5 (O:451), replace the sentence with: "For a read, `Cause.TimeoutError` stays in the
contract's `E`, so the `failure` mapping must name the tag `TimeoutError` by the ordinary exhaustive check;
`ENDINGS.failure` is unchanged."

**O3 (minor).** O:715-716 takes the wording of O:536-537: every reason `besideOf` finds beside an interrupt goes
into one cleanup, the first one. The model confirms that reading.

**O ledger.** Add rows: "Cheap operations | traded: invalidate by partial key is O(entries of the contract) and
`issuesOf` reads every row per publish; a prefix index and the memo land with a bench row" and "Every Cause kept
| traded: `Cause.combine` drops equal causes (O:553); the diagnostic keeps one of each".

**O types.** O:221: the mapper context cites Y's one definition, `MapperContext<I, K>` (Y:288), with `K` the
picked key record, `Pick<I, Key[number]>`. O:275: `intake` returns `NonEmptyReadonlyArray<Finding>`. O:842: RT5
is not O's (section 2, C5a).

### 1.5 Types (Y)

**Y1. Unproven assignability.** Y 3: the cast families of `machine.ts:125,172`, `compile-body.ts:196` and
`compile-schedules.ts:241` read "handled at one point until the `AnyBody` spike (H2) passes", and question 1 A
reads "holds only for the findings H8's walk shows leave every token in place; a definition finding that cannot
hand out tokens keeps raising at `definition()`, as a wrong-kind argument does". Both spikes become the first
acceptance rows of @task.V3.T113 and @task.V3.T22. Open hole 2.

**H2. One input for an invariant's `check`: the user's decided list.** @proposal.rules ("What a rule reads")
decided it: what a guard reads, `state`, `memory`, `props`, `operations` and `schedules`; only a turns rule also
reads `context`. Both designs depart from it without a question, so both change. Y 4 (Y:138), replace the row
with: "an invariant's `check` | `{ state, memory, props, operations, schedules }` of one publication | the
event, the clock, `context`". H 4.2 (H:157), replace the cell with the same list, taken from
`project(incarnation)`. Y's walkthrough (Y:58, `check: ({ memory }) => memory.slots.length <= 4`) already fits.
Not adopted: H's `{ snapshot }`, which would hand an invariant `context`. The need behind it is met by the list:
an invariant over operations or timers ("never `PAID` with `pay` pending") reads `operations` and `schedules`.

**Y2 (minor).** Y 12, replace the caching row with: "Cache only when measured | traded for the round's 'cheap
operations' principle, for compile-time indexes only: built once by `indexOf`, never written at run time,
checked by `indexDrift`. A run-time cache (AS's input gate, 10.2's reuse) lands only with a bench row." The
"same rule at every scope" row reads "open: fragments and instances are H3". Y states that its 38 casts count
production files only, and recounts `chainOf` (the grep finds 28 uses in `src`, 8 in `tree.ts`).

**Y Q8.** Y:376 keeps "granted" and Y Q8 closes with R Q8 (section 3.2, B5).

**Y derive rows.** Section 5 lists the rows 5a gains.

### 1.6 Host (H)

**H1. The edge: one field and three changed cells.** These are changes of behaviour, not rewording. The model
was re-run with them on the design's own field layout (`final-models/c5b/t3.fixed.js`): 35,900 sequences per
variant, no stuck ticket, no stranded mark, no hidden livelock; each fix reverted alone brings its failure back;
the two encodings the first run had to choose between now give the same results.

- **H 4.3, `Out` (H:194-195).** Replace with: "`Out: { readonly flying: NonEmptyReadonlyArray<Carried>;
  readonly waiting: Option.Option<Waiting>; readonly at: Option.Option<number>; readonly hiddenRetried: boolean
  }`  // NEW `hiddenRetried`: the flag has a home while a batch flies". `Waiting`, `Marked` and `Backoff` stay.
- **H 6.4, cell (head landed, Out).** Replace with: "head's tickets true; `hiddenRetried` false; others flying:
  Out with the rest; none flying: `waiting` none: Quiet; a ticket waits, or `at` passed, or hidden: issue; else
  Marked{at, waiting}".
- **H 6.4, cell (head refused, Out).** Replace with: "head's tickets false; its marks join `again`, and `at`
  becomes `min(at, now + C)` (`now + C` when none); others flying: Out; none flying: a ticket waits: issue,
  `hiddenRetried` unchanged; else hidden and not `hiddenRetried`: issue with `hiddenRetried` true; else
  Backoff{now + C, waiting, hiddenRetried}".
- **H 6.4, cell (accept Now, Out).** Replace with: "waits; issued when the last flying batch lands".
- **H 6.4, the bullet "Hidden skips the backoff once", and H 8, I10.** Both read: "a refused batch, or a mark
  arriving in `Backoff`, is re-issued at once at most one time per run of refusals while hidden: a hidden
  re-issue sets `hiddenRetried`, `Backoff` and the next `Out` carry it, and a landed head clears it".
- **H 8, a new invariant.** "In `Out`, a waiting batch with no ticket has an `at`." The model checks it (all six
  variants pass); a ticket needs no time, since it goes when the last flying batch lands.
- **H 12.** The "Total tables" row reads "held after the 6.4 change above". The "Explicit states" row reads
  "traded: `Out.waiting` and `Out.at` stay `Option`s under the invariant above. A tagged `Waiting` (ticketed or
  timed) was tried in this pass and left two cases without a home: a `Later` accept onto a ticketed batch, and a
  dead time inside `Backoff`."

**H3 (minor).** H 7, replace `hideDrain` with:

  ```text
  hideDrain():                                     -- the hide row, inside the listener call; forks nothing
    while world.mail.size > 0 and life admits Serve: step(Serve)   -- the synchronous step and `perform`
    edge.hidden()                                  -- its capture finds the world quiet (6.1)
  ```
  `run()` alone owns `running`; `input` gains no option, and H:867's "`Serve` gains a no-yield form" is dropped.

**H4 (minor).** H 7 (H:675), replace `final` with: "`final(q: Quiescent, p)`: `publish(q, { ...p, all: true })`;
life = Final; ...". The signatures at H:180 and H:269 take `q: Quiescent` too. The caller at H:644 matches
`quiescent(world, now)`: when it is some `q`, it calls `final(q, pending)`; when it is none, `finalFromMemo`.

**H emits and seams.** H:864 keeps "once per publishing slice" (section 2, C4). H:870 stands (C6). H:882 stands
(C5b). H's hole O10 closes by C5d's owner for the mutation generator.

**H Expects.** H 6.6 gains: "An Expect matches every break of its rule that fits its `step`, `actor` and
`where`. The Story passes only when each Expect matches at least one break and each break of an expected rule is
matched by at least one Expect. A bare rule keeps the decided meaning: it breaks at least once." This keeps
@proposal.rules ("The switch on a Story") and answers the model's two questions: a rule that breaks twice passes
a bare Expect, and two Expects may match the same break. The review's "a match consumes one" is not adopted: it
would fail the decided bare form on a rule that breaks twice. Not re-run in the model.

**H ledger.** H 12 gains the row: "Effect at the edges | traded: the driver's inbox and the edge's one wake are
synchronous structures beside Effect's `Queue` and `Schedule`, because a slice runs to its end without yielding
(6.1)".

**H words.** H 4.3 (H:208-224): `Breach` becomes `Broken` and `breaches` becomes `broken`, the decided words
(@proposal.rules, "Words").

**H1's family.** The three cells are one family, "a waiting batch with no way out"; its one point is the
invariant above, and the cells are what it forces. The round's rule against fixing instances is met by checking
the invariant over every cell in the model, not by the three edits.

## 2. Contradictions: one answer, one owner

| #   | Seam                        | Answer                                                                                                                                                                            | Owner                                                                                          |
| --- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| C1  | Alarms                      | One heap, a closed tagged union of six kinds, dispatched by a total match in `tick`; each fact's owner sets and clears its own kind through `tx.alarms`                           | T (`core/alarms.ts`, `tick`); S, O and the grace, disposal and ticket rows are writers         |
| C2  | Hidden page                 | Not a use change in v1: timers keep their deadlines, a throttled wake fires each overdue timer once, and the edge's drain and capture cover a freeze (proposed; question U2)      | H (the edge reads `hidden()`); the core has no hidden input                                    |
| C3  | A throwing user read        | One family rule, below                                                                                                                                                            | each reader's own table; the issue source is O's `StoredSource.Slot` or `IssueSource`          |
| C4  | Emit timing                 | Once per publishing slice, after the snapshot listeners, in turn order; an emit never arrives before the snapshot that explains it                                                | H (`publish` step 5); T puts emits in the `Turn`                                               |
| C5a | RT5                         | A `derive.ts` row: `EvidenceOf<D>` carries the declared schedule name, key and reasons                                                                                            | Y; O supplies the value `IssueSource.Schedule`                                                 |
| C5b | `issuesOf` and its memo     | `issuesOf` is O's concatenation; `scheduleIssues` is S's part, with S's memo keyed by its map's identity, inside the core; the host keeps no issue memo                           | O (the function); S (its part and memo)                                                        |
| C5c | `compiledOf`                | Y owns the function; a Runtime start and a Story's `run()` are its only callers                                                                                                   | Y (function); H (the two call sites)                                                           |
| C5d | Mutation generators         | R exports its 9.2 alphabet as data with the oracle; the world word `Fake.storage.mutate(kind)` applies one mutation before an open; O's read generator moves to `tests/generated` | R (alphabet); @task.V3.T112 (the applier and the sweep); the operations Tasks (read generator) |
| C6  | `stepEnds`, release publish | `stepEnds` is the last row of the core's `step`; `releaseDue` marks holders touched and the host publishes as for any step                                                        | O (the functions); T (`step` calls them)                                                       |
| C7  | Saved names                 | `TimerShape` is the one name of a saved timer; lanes and rows carry their subject inside the `work` record                                                                        | R                                                                                              |
| C8  | Freeze and calls            | Life-held calls are interrupted and waiting lookups are owed `Interrupted`; an entry's request runs on while a hold remains                                                       | T (the holder table); O (entries)                                                              |
| C9  | Two tables of reasons       | `CATALOG` (O) names run-time codes; `CHECKS` (Y) names the reasons of findings. `CATALOG.InvalidConfiguration.reasons` is `keyof typeof CHECKS`, derived, never copied            | O (`CATALOG`, `Code`); Y (`CHECKS`, `Reason`)                                                  |

**C3, the family rule** (one text for S, T, O and R; S's I10 is its statement for schedules):

"A user read that throws changes only its own check. (1) Its field is `Failed(f)`, and an issue names its slot.
(2) Every decision that needed the value is made as if the read had returned its last clean value; a subject
with no clean value yet uses the neutral one (no key, no reason, no baseline, the slot as the record gave it).
(3) The next occasion reads again, and the first clean read after a failure is compared with the last clean
value, or becomes a silent baseline where there was none. (4) Inside a turn, a callback the turn must run to
compute its own result (a guard, a mapper, a patch, a payload, a `resetOn` or list read on the turn's memory) is
the turn's check: the turn is `Refused` and nothing else changes; what it was owed is kept (an ending's row is
tried once more and then Kept with its issue, AO question 18 A)."

Members: `keys`, reasons and `restartOn` (S, whose I10 already says this); `resetOn`, input fillers and list
reads under `Begin` (T); a placement's `select` and an ending's mapper (O); a Schema decode per leaf (R, with
R1's one stated trade). Not members, each with its own row in S: a first delay that throws refuses the start, a
next delay that throws ends the series, and a `resume` that throws is `Broken(f)` and fires once at its saved
deadline (S 6.5).

## 3. Questions

### 3.1 Correctness calls (29): answered by this record

Each keeps the review's verdict; the two that failed are fixed by 1.6's H1.

| Design | Questions                 | Answer                                                                                          |
| ------ | ------------------------- | ----------------------------------------------------------------------------------------------- |
| T      | Q1, Q2, Q5                | A; the model holds (I11, I6, I8)                                                                |
| T      | Q3, Q6, Q7, Q9, Q11, Q12  | A. Q7's `Wake` is what makes C1 one heap; Q9 follows from props running no handler              |
| R      | Q5                        | A; the model holds with `Place.Row{after}`                                                      |
| R      | Q4, Q7, Q11, Q12          | A                                                                                               |
| O      | Q3, Q15                   | A; "behind" is derived, so a written value never loses to a late answer                         |
| O      | Q5, Q7, Q8, Q12, Q13, Q19 | A. Q13's three cells are accepted into T 6.6; Q19: a step is the boundary                       |
| H      | Q1, Q10                   | A; the model holds                                                                              |
| H      | Q7, Q11                   | A, with 1.6's cells: the flag lives in `Out`, a waiting ticket issues when the last batch lands |
| H      | Q4, Q5, Q13               | A                                                                                               |

### 3.2 Duplicates and conflicts (11 groups): answered by this record

| Group | Questions              | Answer                                                                                                                                                                                                                                                       |
| ----- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B1    | T Q13, S Q4 (answered) | S's rule stands; T's unconditional pass implements it (1.2)                                                                                                                                                                                                  |
| B2    | T Q8, S Q5 (answered)  | T Q8 A as a scoped extension. S 6.3 gains: "an instance's start is a creation: its bad delay is `Refused` with an issue and refuses no turn"                                                                                                                 |
| B3    | T Q4, S Q1 (answered)  | One rule: a value used as a key is encoded by its declared Schema, then made canonical text (`selectionCodec`). T Q4's "string or number" limit is dropped; the slot's declaration names `resetOn`'s Schema, as a schedule's declaration names `restartOn`'s |
| B4    | S Q3, O Q18, T H3      | The family rule (C3)                                                                                                                                                                                                                                         |
| B5    | R Q8, Y Q8             | A, once: `Compiled.saved` and the schedule codecs exist                                                                                                                                                                                                      |
| B6    | R Q3, O Q14            | A, once, in R 6.6; O cites it                                                                                                                                                                                                                                |
| B7    | Y Q5, H Q2             | They fit only if U3 is A; one user question (3.3, U3)                                                                                                                                                                                                        |
| B8    | H Q3, T 6.10           | H Q3 A (C4)                                                                                                                                                                                                                                                  |
| B9    | R Q2, T's key request  | R Q2 A (C7)                                                                                                                                                                                                                                                  |
| B10   | Y Q9                   | Closed by S Q1's answered example: a key is a field record                                                                                                                                                                                                   |
| B11   | hidden page            | H's rule (C2); the user's call, U2                                                                                                                                                                                                                           |

B3 adds one declared field in user code, so it is also shown to the user as U4.

### 3.3 The user's calls (26, and six raised by this record): proposed

Nothing below is decided. `Q1 A` accepts a recommendation.

**Raised here**

- **U1 (R1). A memory field that does not read.** Recommend A.
  - A: the position resets (state, memory, timers, instances); the work side stays.
  - B: only that field goes back to its declared initial.
  - C: the record is kept unread and the actor does not start until a build reads it.

  ```ts
  // record: { state: "PAID", memory: { orderId: "o-1", total: "12.00" } }; this build declares total: Schema.Number
  // A: starts fresh at IDLE, reported RecordReset           B: PAID with total 0: a state Pay never reached
  ```
- **U2 (X2, B11). A hidden page.** Recommend A.
  - A: not a use change in v1. A toast's 5 s timer in a background tab keeps its deadline and fires once, late if
    the browser throttles.
  - B: a use change. Hiding clears the alarms; showing fires each overdue timer once.

  ```ts
  // schedules: { autosave: { schedule: "30 seconds", send: E.Save } }, the tab hidden for 5 minutes
  // A: Save fires about every 30 s while hidden (as the browser allows)     B: no Save while hidden, one at show
  ```
- **U3 (B7; Y Q5 with H Q2). A machine's rules have no `enabled`; the run rules are one list in one module.**
  Recommend A. This overturns a decision, openly: @proposal.rules ("Inline, opted into outside tests") gives each
  rule an `enabled` flag read at module load. Trace: `enabled: import.meta.env.DEV` under the plain CLI, where
  `import.meta.env` is undefined: the body throws and the machine is refused. Rules stay inline in `machine()`.
  The run rules stay named once (TT D1); the list moves out of `flow.config.ts` into a module the config imports,
  because the config already imports every Story.

  ```ts
  // today:  tests/rules/rules.ts exports the rule list and imports the test runner; flow.config.ts has no rules
  //         Story.app(setup, { id, fixtures, world })                                    // existing
  // SC 3.4: rule({ enabled: import.meta.env.DEV, ... })           // proposed earlier; throws under the plain CLI
  // after:  runtimeSetup({ app, rules: "judge" })                  // NEW option: "judge" | "off"
  //         export const rules = [...]                             // tests/rules/list.ts, no test-runner import
  //         Story.app(setup, { id, fixtures, world, rules })       // NEW field; the config imports the same value
  ```
- **U4 (B3). A slot's declaration names `resetOn`'s Schema.** Recommend A. `resetOn` is not built yet; the
  "before" is the form @proposal.algo-turn question 4 proposes.

  ```ts
  // T Q4:  resetOn: ({ memory }) => memory.openedAt.getTime()      // only a string or a number is allowed
  // after: declared, beside the slot: resetOn: Schema.DateFromString      // NEW, as a schedule's restartOn is
  //        in the body:               resetOn: ({ memory }) => memory.openedAt      // typed by the declaration
  ```

- **U5 (C4, X6). Emit listeners run at the publication.** Recommend A. No user decision covers emits;
  @review.spec-cohesion-r2 question 14 covers snapshot notifies only.

  ```ts
  // actor.onEmit(Uploads.emits.Done, () => render(actor.getSnapshot()))
  // A: the snapshot already shows the upload done       B (per step): it may still show the previous publication
  ```
- **U6 (R2). A record of a machine now declared `persist: false`.** Recommend A.

  ```ts
  // definition({ id: "cart", persist: false })           // an earlier build saved cart records
  // A: Kept(NotPersisted): left unread, reported once    B: removed at boot, and what the record owed is lost
  ```

**Types (Y)**

- **Y Q1. Construction returns a value** (overturns SC 3.2). Recommend A, limited by H8's walk (1.5).

  ```ts
  // today: const M = machine(Def, body)   // throws FlowError at import; nothing after it in the module is evaluated
  // after: const M = machine(Def, body)   // NEW: M.construction is Built | Refused | Blocked;
  //        a Runtime start or a Story raises one FlowError holding every finding
  ```
  @review.spec-cohesion-r2 question 11 A (a construction error exits 1 with its findings) needs this.
- **Y Q2. `Machine<D, R>` defaults `R` to `never`.** Recommend A. Today's `Machine<D>` has no `rules`.
  @review.spec-cohesion-r2 question 3 A says an annotated machine "defaults its names"; this picks what the
  default is.

  ```ts
  // A: const M: Machine<typeof Def> = machine(Def, body); M.rules.Typo   // a type error
  // B: the same line: M.rules.Typo is RuleToken | undefined
  ```
- **Y Q3. The body gives the machine's type only its rule names** (corrects a decided snippet). Recommend A.

  ```ts
  // R2 Q1's snippet: machine<D, const B>(definition: D, body: B & Exact<B, MachineBody<D>>)
  // after (Y 5.3):   machine<D, const B extends MachineBody<D> = MachineBody<D>>(
  //                    definition: D, body: ExactBodyOf<NoInfer<D>, B>): Machine<D, RuleNames<B>>
  //                  ExactBodyOf<D, B> = [D] extends [AnyDefinition] ? (tokens) => B & Exact<...> : never   // required
  ```
- **Y Q4. Every declared pause reason has a callback in every placement.** Recommend A.

  ```ts
  // definition: schedules: { dismiss: { pausedBy: ["Hovered", "Hidden"] } }
  // before: paused: { Hovered: ... }                    // compiles; Hidden can never hold here
  // after:  the same line is a type error: `Hidden` is missing
  ```
- **Y Q6. Terminals are proved by `flow check` only.** Recommend A. It keeps the decided "proved, not judged by
  runs" and renames the decided `RuleBroken` for a terminal's edge to a `TerminalLeft` finding (@proposal.rules).

  ```ts
  // before: a run rule also reports RuleBroken for a left terminal
  // after:  `flow check` prints TerminalLeft; no run-time rule names a terminal
  ```
- **Y Q7. Source locations come from the CLI adapter** (a Task boundary: @task.V3.T22). Recommend A; H7 unspiked.

  ```ts
  // today: Finding { path }
  // after: Finding { path, location: Option<{ file, export, line }> }   // NEW: location, filled by the CLI only
  ```
- **Y Q10. A schedule's `send` mapper takes the firing's metadata.** Recommend A.

  ```ts
  // before: send: E.Polled.from(({ key, firedAt }) => ({ id: key["id"] ?? "", at: firedAt }))
  // after:  send: E.Polled.from(({ key, firedAt }) => ({ id: key.id, at: firedAt }))   // key typed by the declaration
  ```
- **Y Q11. The metadata's `output` stays `unknown`.** Recommend A.

  ```ts
  // after: send: E.Fired.from(({ output }) => ...)       // output: unknown; decode it with a Schema if read
  ```

**Operations (O)**

- **O Q1. A read's key names every input field.** Recommend A.

  ```ts
  // before: resource({ input: { account, currency }, key: ["account"] })   // compiles; answers cross
  // after:  the same line is a type error: `key` omits `currency`
  ```
- **O Q2. No `Trigger` cue** (departs @plan.Operations.O2). Recommend A.

  ```ts
  // today: resource({ id, input, key, services, staleTime, gcTime, lookup })   // no refetch trigger exists
  // Plan:  focus regained and connection restored refetch, built in             // proposed earlier
  // after: schedules: { refresh: { schedule: "1 minute", send: E.Refresh } }
  //        on: { Refresh: { actions: [O.x.refetch()] } }
  ```
- **O Q4. A life's end and a disposal owe waiters nothing** (departs RO R11). Recommend A.

  ```ts
  // before: dispose(actor) queues an Interrupted row per waiting lookup, closed at once as evidence
  // after:  dispose(actor) releases the slots; no row. A freeze still parks one Interrupted row per lookup
  ```
- **O Q6. `failureOf` gives one `FlowError` per crossing.** Recommend A.

  ```ts
  // before: a defect plus a cleanup failure is a Die holding the error
  // after:  FlowError { code, cause: the defect }, and one CleanupFailed diagnostic per cleanup
  ```
- **O Q9. A write's timeout is unknown and a type error.** Accept, with O2's sentence for reads.

  ```ts
  // allowed today: commit: (i) => api.pay(i).pipe(Effect.timeout("30 seconds"))    // no fixture writes this
  // after:  that line is a type error; the fixtures' form stays (transfers/operations/writes.ts:17-20):
  //         Effect.timeoutOrElse({ duration: "30 seconds", orElse: () => Outcome.unknown(...) })
  ```
- **O Q10. ET PD1 and PD4.** Accept as proposed; PD1's rename is one step of R's format plan.
- **O Q11. A made value's internals sit under a second registered symbol.** Confirm.

  ```ts
  // decided (cohesion-r2 Q4 B): Symbol.for("flow-state/Made") on a shared prototype, plus the owner compare
  // after: the same brand; NEW: value[Symbol.for("flow-state/Internals")] holds the internals, off the public
  //        face, in place of a WeakMap beside the brand, so a second loaded copy of Flow reads them too
  ```
- **O Q16. A persisted write declares its `output` and error Schemas.** Recommend A.

  ```ts
  // today: transaction({ id, input, key, concurrency, services, commit })   // an unsaveable ending reloads as unknown
  // after: transaction({ id, input, key, concurrency, services, commit, output, error })   // NEW: output, error;
  //        required when the machine persists
  ```
- **O Q17. A delayed retry is a machine schedule.** Already decided (@review.spec-cohesion-r2 question 9 A);
  listed only because RO 3.5's example must go. The fixtures already write it this way.

  ```ts
  // RO 3.5 (dropped): commit: (i) => api.pay(i).pipe(Effect.retry(Schedule.exponential("1 second")))
  // today and after (home/machines/room.ts:90-95, :131): a schedule sends an event, and its handler is
  //   RetrySave: { guard: [O.setTarget.retryable(byRoom, { times: 2 })], actions: [O.setTarget.retry(byRoom)] }
  ```

**Records (R)**

- **R Q1. Forged but valid records are out of scope.** Recommend A, with the caveat written into P2.
- **R Q6. An orphan record is kept** (departs DL PD5). Recommend A. R2's `Kept(NotPersisted)` follows the same
  rule: a record this build does not read is left as it is.

  ```ts
  // a build that no longer declares `Cart`: before: its records are discarded      after: Kept(Orphan), reported
  ```
- **R Q9. One format step, 5 to 6.** Recommend A, with the ledger row of 1.3.
- **R Q10. SR D2 to D4.** Adopt as SR proposed.

**Host (H)**

- **H Q6. `propertyTest` runs every seed.** Recommend A.

  ```ts
  // before: rejects at seed 3; seeds 4 to 50 never run    after: runs 50, rejects once, listing every failed seed
  ```
- **H Q8. The verdict is a record of four facts.** Recommend A.

  ```ts
  // SC's switch table: the first matching outcome, "Unfinished"      // what broke is hidden
  // after:  verdict: { broken, unfinished, inconclusive, expected }
  ```
- **H Q9. UH PD4 and PD5 stand.** Accept.
- **H Q12. An `expectBroken` entry may narrow to a step, an actor or a predicate.** Recommend A. It extends the
  decided `.rules({ expectBroken, off })` (@proposal.rules); a bare rule keeps its decided meaning (1.6).

  ```ts
  // decided (not built): story.rules({ expectBroken: [Pay.rules.NoLostWrite] })              // breaks at least once
  // after, also allowed: story.rules({ expectBroken: [{ rule: Pay.rules.NoLostWrite, step: 3 }] })   // NEW: step?,
  //                      actor?, where?
  ```

**Turn (T)**

- **T Q10. `Published` carries the incarnation; `why` has three values.** Recommend A.

  ```ts
  // TP 3.1: Published { actor, state, memory, why }        // why: "Begin" | "Turn" | "Other" | "End"
  // after:  Published { actor, incarnation, why }          // why: "Begin" | "Turn" | "Other"; an end is Finished
  ```

## 4. The developer's walk

Twelve apps and the two shared services were walked (three sidecars, each finding re-checked against the cited
file). "Hand type" means an annotation that copies a shape; a derived type named by the author is not one.

| App               | Uses                                                                                        | Under the designs                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `home`            | `Flow.keyed`, pause reasons that read a lane, `retryable`, a computed series, context slots | Keyed schedules become declared (Y 5.2); `key.id` is typed (Y Q10), so `key["id"] ?? ""` goes; guards by O1               |
| `number-input`    | entry-armed schedules, `deny`, ordered alternatives                                         | Written with no change; helper functions hoisted out of the body annotate `{ memory: Memory }` by hand (A1)               |
| `shop` and `pay`  | history, cross-actor sends, `retryable`, `idle`, `onContext`, a body shared with `cells`    | Guards by O1; `payBody` (`services/shop/machines/pay.ts:170`) hand-types `Parameters<typeof machine<typeof Pay>>[1]` (A2) |
| `cells`           | one definition re-declared under `Pay.id`, the body spread                                  | Works; the copy of `states`, `events` and `memory` is the app's choice. Needs A2                                          |
| `transfers`       | timeout as unknown, `retryable`, date-typed memory, context `when`                          | Written with no change; `(e: Declined)` mapper annotations go (Y 5.4, compiled)                                           |
| `sign-in`         | `Flow.private`, resources, string durations, state read as context                          | Written with no change; `Flow.private` is saved in clear (O Q12 A)                                                        |
| `sync`, `lanes`   | four concurrency policies, a paged key, `send` between actors                               | The lane policy table is not in any design: it is copied from code (hole 5)                                               |
| `player`, `sync`  | a machine that refers to itself (`household.ts:26`, `mirror.ts:54`), dynamic schedules      | The `Machine<typeof X>` annotation stays and costs the rule tokens (Y Q2); a stated limit, not a workaround               |
| `session`         | context bindings in `app`, recursive Schemas, `select`                                      | Written with no change; recursive Schemas name their type (an Effect limit)                                               |
| `command-palette` | `retryable`, `idle`, `concurrency: "reject"`                                                | Guards by O1                                                                                                              |
| `wizard`          | a deadline read from memory and `now`                                                       | Written with no change, no annotation                                                                                     |

Gaps in the designs that an app meets:

- **A1. Hoisted callbacks.** Every app hoists helpers out of the body and types their argument by hand
  (`number-input/machines/stepper.ts`, `shop/machines/cart.ts`, `home/machines/room.ts`, `sync/machines/mirror.ts:38`).
  Fix: Y's `Reads<D, Scope, View>` (already a `derive.ts` type) and `E.X.Type` are exported as the author-facing
  names, and STYLE's example uses them; a copied shape is a lint finding.
- **A2. A shared body.** `payBody` needs the body's token type. Fix: export the existing `BodyTokens<D>`; the
  return type is inferred.
- **A3. Decline reasons.** `deny("AtBound")` is T's "declines" with a `why`; its union per event is Y's H6, not
  yet a row. Row G3 in section 5.
- **A4. The retry guards.** Designed in 1.4 (O1).
- **A5. Lane policies.** `latest`, `serialize`, `cancel` and `reject` have no table in O or R. They are stable
  code; the endings Task writes its Spec from `core/lanes.ts`, not from a design (hole 5).
- **A6. Story helpers.** Story code names library types by reaching into signatures
  (`shop/stories/structure.ts:110`, `Parameters<typeof Flow.context>[1]["reads"]`) and annotates each step closure
  (`number-input/stories/usual.ts:80-99`). Fix: export the option types by name with the test tooling
  (@task.V3.T97); not designed here (hole 7).

Features the review lists as uncovered:

| Feature                                                  | Fate                                                                                                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| The retry guards `retryable` and `idle`                  | Designed here (1.4); built by @task.V3.T121                                                                                                      |
| Streams and bookmarks                                    | Deferred to @task.V3.T25, which runs skill:to-design first. No fixture uses a stream yet; `releasing` and `bookmarks` are shaped for it          |
| Server rendering, hydrate's merge                        | Deferred to @task.V3.T115 and @task.V3.T116, design first; R's H4 and O's H5 are its content. No fixture renders on a server                     |
| Story frames and playback                                | Deferred to @task.V3.T108 (with @task.V3.T29), design first; H's `StoryRun` is its input                                                         |
| Redaction and digests                                    | Deferred to @task.V3.T49, design first; `project` with `Flow.private` dropped is the mechanism it reuses                                         |
| The reach flags `cancelsAcknowledging`, `retainsUnknown` | Fixture manifest facts (`fixtures/manifest.ts:13-14`) the generated sweep reads; added to @task.V3.T97's H 6.10 work, not designed here (hole 7) |
| Context propagation (@plan.Runtime O5)                   | Not checked (hole 8)                                                                                                                             |

## 5. Cohesion

**Functional.** One turn (`runTurn`, T). One applier of an incarnation (`apply`, T); `entries.apply` (O) writes
only the entry table and S's applier only `Scheduled`, each called from one row of `apply` or `tick`. One judge
per question: `admit` gives a record's fate (R), `issuesOf` gives issues (O, with S's part), `verdictOf` gives a
Story's verdict (H), `compiledOf` gives findings (Y). One publication (`publish`, H); T's row C6 records
`Published` evidence, which is the input of `publish`, not a second notify.

| Gap                                                                   | Fix                                                                                                                                                                                                          |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Three designs set alarms                                              | C1                                                                                                                                                                                                           |
| The host and the core both claimed `stepEnds` and the release publish | C6                                                                                                                                                                                                           |
| Emits at step end and at publication                                  | C4                                                                                                                                                                                                           |
| `judge` names three functions                                         | O's `owners.ts#judge` is today's code and keeps the name; H's rule judge is local to `host/testing`; R's composition loses the name and is written `admit(app, source)(structure(stored))` at its call sites |
| R's boot "writes" (`saveOwed`, `saveLane`, R:906) against I10         | I10 stands: `install` marks keys and `encodeStore` is the one writer; the fit table row reads "deleted"                                                                                                      |
| Turn's cluster-5 duties have no Offers in H or Y                      | Rows G5 to G8 below; `onEmit`, `setProps` and the fragment event address are @task.V3.T111's and @task.V3.T127's                                                                                             |

**Types.** Rows 5a's `derive.ts` gains (proposed), so that every public type another design names has a source:

| Row | Public type                                                                                              | Derives from                                 | Needed by         |
| --- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ----------------- |
| G1  | `Reads<D, Scope, View>`: no new row, exported                                                            | R1 to R9 (Y:161-164)                         | every fixture     |
| G2  | `BodyTokens<D>`: existing, exported                                                                      | R1, R2, R4, R8                               | `pay`, `cells`    |
| G3  | the decline reasons of an event (new)                                                                    | the `deny` literals in the body, through `B` | T, `number-input` |
| G4  | `MapperContext<I, K>`: no new row; Y:288 is the one definition, `K` the picked key record                | the contract's `input` and `key` tuple       | O:221             |
| G5  | `PropsOf<D>` (new alias)                                                                                 | `D["props"]`                                 | T (`setProps`)    |
| G6  | `EventOf<D>` (new: H:258 uses it, no design defines it), with a fragment event's address `{ slot, key }` | R2 and the fragment declarations             | H, T H5           |
| G7  | the public `Published<D>` and `Turn<D>` faces                                                            | `EvidenceOf<D>` (R10), fields by H 4.3       | H, T H6           |
| G8  | `ScheduleReads<Key, Why>`, a schedule issue's source                                                     | R6 (name, key, reasons)                      | S RT5             |

Other type fixes: brands are one list in Y 5.6, the union of Y's and R's (`ActorName`, `ContractName`,
`KeyText`, `AttemptId`, `SubjectAddress`, `ShapeStamp` join); T's `history` and `context.slots` maps key by
`StateName` and `SlotName`; `Broken.rule` and `off` both use `R`; the rule that "`derive.ts` is the only module
that turns a declaration into a public type" reads "`derive.ts`, `contract.ts` and `core/checks.ts`, each for its
own declarations", which is what Y already does.

## 6. Tasks

Task changes were made with `wk`; each carries a comment saying what the user decided and what is proposed. An
existing Task that was split (T21, T24, T77, T72, T98) stays as the close-out of its parts, so every `blocked_by`
that named it still holds; that mechanic is proposed, the splits are the user's. T76 and T78 now wait on root
emits (T127) and no longer on T77.

| Design piece                                                                                                                              | Task                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| O 6.9 doors, `made`, `madeOf` (T98a)                                                                                                      | @task.V3.T131 (new, P4)                                   |
| Y 5.2, the runtime half: the declaration object, its checks, `Compiled.schedules`                                                         | @task.V3.T120 (new, P4: Declared schedules, runtime half) |
| S whole (with 1.1)                                                                                                                        | @task.V3.T118                                             |
| Y 5.1 to 5.8 (of 5.2, the types only), 10's indexes, C6, the rows of section 5, the H2 spike                                              | @task.V3.T113                                             |
| T 4 to 8 and 11, less fragments, emits and props: `apply`, the walk, alarms and `tick`, mail, the actor's end, the index layer (with 1.2) | @task.V3.T119 (new, P4: Turn parts)                       |
| T 6.9 props and `setProps`                                                                                                                | @task.V3.T76                                              |
| R 6.1, 6.2, 6.4 to 6.6: the codec, which owns no state (SR D5)                                                                            | @task.V3.T92                                              |
| O 6.5, 6.7, 6.8, the retry guards, the lane policies' Spec                                                                                | @task.V3.T121 (new: Operation endings)                    |
| O 6.1 to 6.3, 6.6, `Alarm.Collect`                                                                                                        | @task.V3.T122 (new: Entries and read slots)               |
| O 6.4, `Alarm.Release`, `ReleaseOverdue`                                                                                                  | @task.V3.T123 (new: Placements and release)               |
| O 6.10, R's cache rows, O Q16                                                                                                             | @task.V3.T124 (new: Persisted resources)                  |
| T's fragments, instances and `reconcile` (6.3 to 6.5)                                                                                     | @task.V3.T109, then @task.V3.T110                         |
| T 6.10 at the root, H 6.3                                                                                                                 | @task.V3.T127 (new: T77a, root emits)                     |
| T 6.10 for fragments                                                                                                                      | @task.V3.T128 (new: T77b, fragment emits)                 |
| UI primitives: toaster; menu                                                                                                              | @task.V3.T129, @task.V3.T130 (new: T72's halves)          |
| R 6.3 (the fates, quarantine's exits included, SR D5), 6.9, the `persist` row (R2)                                                        | @task.V3.T56                                              |
| H 6.1 to 6.4: the binding whole (UH PD2), publication, the edge with H1's cells                                                           | @task.V3.T111                                             |
| H 6.5, the mutation applier, the fake-server items moved from T97 (TT D4)                                                                 | @task.V3.T112                                             |
| H 6.10, `seam.ts`, the reach flags, Story helper type names                                                                               | @task.V3.T97                                              |
| H 10, the coverage-run items moved from T97 (TT D4)                                                                                       | @task.V3.T117                                             |
| O 6.7's catalog and renderer                                                                                                              | @task.V3.T100                                             |
| Y 5.9, 5.10, 7, the H8 walk                                                                                                               | @task.V3.T22                                              |
| O 6.9 `intake` (T98b)                                                                                                                     | @task.V3.T132 (new, P5)                                   |
| H 6.6 to 6.9                                                                                                                              | @task.V3.T114                                             |
| Y 5.3's rules                                                                                                                             | @task.V3.T106                                             |
| R's entity records (H12); claims in the lane head (R 6.8, H8)                                                                             | @task.V3.T125, @task.V3.T126 (new: T24a, T24b)            |
| R `Dormant`, T's tenth `Change`                                                                                                           | @task.V3.T48                                              |
| R `Source.Hydrate`, O H5                                                                                                                  | @task.V3.T115                                             |
| The real lock, `pageshow`                                                                                                                 | @task.V3.T27                                              |
| Channels and the hydrate overlay (UH PD2), emit delivery in React                                                                         | @task.V3.T30                                              |

**Order (proposed).** P4: T131, T120, T118, T113, T119, T92, T121, T122, T123, T124, T109, T110, T127, T76, T129,
T128, T130, T78, T73, T56, T100, T22, T23. The host track runs beside it once T119 lands: T112, T111, T97, T117.
P5: T132, T114, T106, T25, T125, T48, T115, T126, then the phase's existing order. Types come before the turn
(T113 before T119) so no module is built untyped; the declared-schedule runtime half comes before T118 by the
user's answer to S question 6.

## 7. Open holes

1. **The turn model covers part of the text. Blocks build for @task.V3.T119, not the Spec.** I5, I7, I9, I12,
   I13 and I15 to I17 have no mechanical check; the Task's first step is the package sequence test. Why open: a
   model run does not fit this pass.
2. **Y's two spikes (H2, H8). Blocks build of the cast deletions and of question Y Q1 A.** Until they pass, the
   families are handled at one point. Why open: needs a compile against the package.
3. **Records' model covers no timer, instance, cache record or step 1 to 4. Blocks build for @task.V3.T92.**
4. **The edge keeps two `Option`s as a stated trade (1.6). Minor.** Its lifecycle is still not fully a tagged
   union; the invariant that guards it is model-checked, not typed.
5. **The lane policy table is in no design. Blocks Spec for @task.V3.T121.** It is written from `core/lanes.ts`.
6. **The public event a view sends for `refetch` (O H11, H O9). Blocks build for @task.V3.T122.**
7. **The reach flags have no row in H 6.10, and Story helper types have no exported names (A6). Minor.**
8. **Not checked:** context propagation (@plan.Runtime O5); the review's *(sidecar, unverified)* ledger notes for
   T and O; whether `View` in `Reads<D, Scope, View>` and in `Snapshot<D, View>` is one concept; O 6.2 to 6.4
   against the operations model line by line; the alarm kind order at one instant (1.2); how a
   `Kept(NotPersisted)` or orphan record is ever removed (R names no path); the text around each replacement
   beyond the lines the adversaries read.
9. **Streams, server rendering, Story frames and redaction have no algorithm design.** Each blocks the Spec of its
   own Task only (section 4).
10. **The Expect rule of 1.6 and the alarm kind order of 1.2 were not run in a model. Minor.** Both are stated
    rules with no trace against them; the Expect rule follows the user's decided meaning.
11. **Not checked against the user's decisions:** whether a hydration's `Begin` counts as a turn for a turns rule
    (@proposal.rules, "Reloads"), and the seam "the mint restarting at 0" (@proposal.spec-handover item 5).

## 8. Process notes

- The designs disagreed where one cluster "handed" a seam to a cluster that had already finished. A seam needs
  its owner written in both records in the same round; the Offers and Needs lines exist for this and two designs
  did not use them. `wk lint`'s seam check would have caught RT5 and `Compiled.saved`.
- Answered questions were not carried into tables (S1). A design's answer step should end with a grep for the
  question's number across its own file.
- The model scripts lived in a session scratchpad and one was overwritten. The models that guard a Spec belong
  in the package's tests before the Spec is written.
- Sidecar log. Fixture walks (three): accepted after re-reading the cited lines for the guards, the hoisted
  helpers, `payBody` and the keyed mapper; "no design names `deny`, `Flow.uncertain`, `Fake.server`, the bench
  helpers" rejected as gaps (existing API the designs do not change), except decline reasons (G3). Task survey:
  accepted, checked against `wk show`. Type cohesion: accepted for the `Reads` clash, `MapperContext`, the two
  reason tables, the brands and the missing rows; "`TimerKey` shape" and "`View` overload" left unverified. 
  Functional cohesion: accepted for alarms, hidden page, emits, `stepEnds`; "two appliers" changed to "one
  applier per state", since each writes its own state. Edge model re-run: accepted after reading its diff; its
  new invariant failed on a ticket's own marks, so I narrowed it to "no ticket" and re-ran it myself (passes).
- Adversary log (four sidecars on the first draft). Accepted and fixed: wrong cites (I10, the X4 and X6 ranges,
  T2, O3), leftovers (T:180, T:1180, the saved names and `Reads` uses in S, four alarm sites in O), the gate
  sentence, the X3 scope test for a re-entered state, `resume` not a member of the family rule, R2 as `Kept` and
  not `Discard` (it would have dropped an owed unknown), the lane-head names and `retryCount` in O1, `final`'s
  callers, the Y Q3 signature, `BodyTokens` and `MapperContext` as existing types, the "before" lines that were
  earlier proposals and not today's code, `sync`'s self-reference, T76 ordered before its blocker. Changed: the
  tagged `Waiting` type was withdrawn for the model's own field layout. Rejected: "T:710 contradicts row 7" (an
  instance's entry arms are decided after commit, a part's in row 7), "S:595 contradicts `Broken`" (a planted
  fault states the wrong behaviour on purpose).
- User-decision check (one sidecar, every tagged item in the records this touches). Accepted and fixed: an
  invariant's inputs follow @proposal.rules, not either design; "broken" replaces "breach"; a bare `expectBroken`
  keeps "at least once", so the review's "a match consumes one" was dropped; U3 names the decision it overturns;
  Y Q2, Y Q6, O Q11, O Q17 and H Q12 cite the decided item they touch; the decided Task moves (T97 to T117 and
  T112, T111 and T30, T92 and T56) are in the map and on the Tasks; emit timing and the `persist` row became
  questions U5 and U6. Rejected: "H1 fixes instances" as a breach of the round's rule (the invariant is the one
  point; stated in 1.6).
- Not read in full, for time: the two 5b reviews and the cluster 1 review beyond their verdicts; the Plans.
