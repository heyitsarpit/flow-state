---
review review-algo-schedules
status open 2026-11-21
---
# Review: the schedules algorithm design, cluster 1 (2026-11-21)

**Verdict: ISSUES.** @proposal.algo-schedules is sound in shape: one value per scope, one pure `decide`, the arming
id in `Firing`, and the six tables survive a blind derivation (20 rows, no table ambiguity found). It is not yet
Spec-ready. Four findings block the Spec: a restored series that cannot resume is restarted silently, not
`Refused`; the reload invariant I6 fails on the design's own retry rule; thaw swallows a selection change; and
user callbacks read `now`, which the inventory, the input gate and I6 ignore. Three more block the build: I1 is
red on correct code, two planted faults cannot be caught, and section 11 keeps functions that read removed fields.
Each fix is local; no family needs a redesign. The brief should change in seven places (section 3).

Conventions: AS is @proposal.algo-schedules, AR is @proposal.algorithm-round, SI is @proposal.schedule-issues,
CS is @review.case-studies, FR, TP and SR as AS defines them. `AS:n` is a line of AS. Code paths are under
`packages/flow-state-v3/src/core/` unless they start with `src/` or `tests/`. Every finding was re-traced by the
reviewer against the tables and the code; sidecar origin is in section 4.

## 1. Required properties, derived from the problems

Derived before reading AS section 7, from AR section 1.1, SI and CS 1.6:

- **P1** a firing owed is armed, or an issue shows for it. **P2** no firing is made up.
- **P3** a reload changes nothing a later view shows, beyond what any silent occasion would change.
- **P4** a throw changes only its own check. **P5** an issue is a failed last outcome; it clears when the check
  next reads clean or its timer goes.
- **P6** held time does not count; time counts while asleep (@plan.Machines.O5).
- **P7** every change a timer's reads see is compared once, whichever occasion first hears it.

## 2. Findings

### 2.1 Blocks Spec

**S1. A restored series that cannot resume is restarted silently and loses its overdue firing.**
AS:416 decodes `Armed` with a throwing `reads.resume` to `Refused(f)`; AS:333 makes `Wake` with `Refused` a start
cause, so row A2 runs in the same decision.

- Trace: a computed series reads a memory field. `Armed(Due 5000)` at attempt 2; the page closes; it opens at
  9000 and `resume` throws.
- Expected (P1, P5; AS:1031 and AS:1174 claim "`Refused` instead of silently single"): either the 5000 firing
  fires and the series ends with an issue, or `Refused` shows.
- Actual: decode gives `Refused`; A2 reads the first step clean and arms `Due(9000 + first)`; F1 clears `firing`.
  No issue ever shows, the overdue firing is lost, and a `Held` run's `left` is dropped (AS:341). If the first
  step is `Complete`, the timer goes `Idle` with no issue: owed, unarmed, unreported.
- Cell at fault: 5.7 row "`Armed`, `reads.resume` throws" with 5.3's start cause "`Wake` and `Refused`".
- Fix: a resume failure keeps the saved timing with a cursor whose next step is `Over`, so the due firing fires
  and F2 reports the series' end; or the decode's `Refused` is not a start cause in the same `Wake`.

**S2. I6 fails on the design's own rows.** I6 claims "inserting a reload anywhere changes no later view" and that
selection and firing are the identity "for any reads" (AS:611-613). Three rows contradict it:

- Trace, existing alphabet (`tests/turn/schedule-ledger.ts:72-73`): `bad appears out of range` / `bad appears` /
  `reload`. Without the reload `bad` stays `Refused` with its issue (no start cause: not new, no restart). With it,
  AS:333 retries and arms `bad`. The two runs differ, so 8.3's two-run I6 check is red on a correct build.
- `selection` is not the identity for any reads: a timer whose saved selection is `Unselected` (its `restartOn`
  threw since birth) reads at `Wake` (AS:308), so its issue clears at the reload.
- `firing` is not the identity either: a `Refused` timer with a failed `firing` arms at `Wake`, and F1 clears it.
- Cells: 5.3's start cause list; 5.2's `compares`; I6's wording. AS:110-111 names "retried only at a wake" as
  debt; this is where the debt bites.
- Fix (recommended): retry `Refused` on every occasion, as `Unselected` is read on every occasion (S-6). `Refused`
  then behaves like any failed check, the debt goes, and I6 restates as "a reload equals a silent occasion that
  changes no input". Cost: a refused timer's delay runs once per occasion, only while refused. This needs the
  user, since SI's rule is accepted: add it to the questions.

**S3. Thaw swallows a selection change.** 5.9 maps thaw to `Wake` (AS:470), and `Wake` does not compare a timer
that has a baseline (AS:323). Question 4's case for A rests on "the context wave the restored consumer is owed"
(AS:1144-1146); that wave is restore's, and AS names none for thaw.

- Trace: an idle sign-out in a resumable trait reads activity from context. Baseline 5, `Due 10000`. The trait
  freezes at 5000; activity moves to 7 at 6000; the trait thaws at 9000; no turn follows.
- Expected (P7): the change restarts the timer at the thaw.
- Actual: no occasion compares; the timer fires at 10000 and signs the user out after real activity.
- Fix: 5.9 states one rule for every silent occasion: after `Wake`, the owner raises `Context` when a slot the
  scope reads differs from what the scope last heard. Restore's owed wave is then one case of it. The call site is
  cluster 2's; the rule is this cluster's.

**S4. User callbacks read the clock, and the design does not say so.** `ScheduleInput` carries `now`
(`schedules.ts:84-91`, `compiled.ts` `ScheduleInput.now`), so `keys`, `restartOn`, each reason and the delay may
depend on time alone. AS 3.1, 4.3 and 10.3 list memory, context and lanes as the only inputs.

- Trace (the gate of 10.3): `paused: { Quiet: ({ now }) => hourOf(now) >= 22 }`. A lane moves at 22:05 with
  memory, context and lanes unchanged in identity, so the gate skips the schedule and the hold never lands.
- I6 and I7 premise "the same reads"; a reload at another `now` gives other reads. Level 0 runs on abstract time,
  so it cannot see this, and its "gated equals ungated" check (AS:651) cannot fail on it.
- Fix: add a row per callback input to the inventory. Either drop `now` from `ScheduleInput` (a public API change:
  a question) or put the clock among the gate's inputs and state I6 and I7 modulo time-reading callbacks.

### 2.2 Blocks build

**B1. I1 is red on correct code.** AS's I1 accepts only `Armed`, `Refused` or a failed `keys` (AS:602-604). SI's
I1 was "armed or its source shows an issue" (SI:226).

- Trace: a series whose next step throws: F2 gives `Idle` with `firing` failed (AS:343, 364). If `Over` is not a
  "last step" the timer is owed and I1 breaks; AS does not say which.
- Trace: keying changed, or a saved key the key Schema no longer reads (AS:405-406): an armed timer is dropped
  with no issue. I1's list of ends (AS:603) has no "dropped by a definition edit".
- Fix: I1 = armed, or an issue shows for the timer or its schedule; list a definition-edit drop as an end.

**B2. Two checks cannot fail, and Level 0 overclaims.**

- `wake-rebases` (AS:746) is caught "by I6". In the 8.2 alphabet every atom that changes the selection's input is a
  turn or a context wave, which compares first, and a reload changes no read. So a re-read at `Wake` always reads
  the saved value and the fault is invisible. It needs an atom "reload where the selection's input differs"
  (question 4's trace), which is outside I6's premise; that Story is the real check.
- 8.4's last row needs "reload under a fixed build"; 8.2 has no such atom. `bad appears` after `bad appears out of
  range` reaches the same cell with existing atoms.
- Level 0 decides one schedule with `before` given, so owner faults (`reentry-inherits-reasons`, which needs the
  owner to pass an ended scope's state) cannot occur there. AS:640 claims Level 0 catches F5; only Stories can.
- 5.2's last row (a disarming turn whose selection changed) is a T57 cell AS:1026 says must not reopen, and no
  Story atom reaches it: every atom changes one thing. Add `Stop` with a changed selection.

**B3. Section 11 keeps code that reads what the design removes.** Each is mechanical, but a builder reading
"keep" is misled:

- `metadataOf` (`schedules.ts:437-446`) reads `tracked.name`, `tracked.key` and `run.output`; the new `Tracked`
  has no name or key and `output` lives in `Cursor.Stepping`.
- `firingRun` (`schedules.ts:506-518`) reads `tracked.run` as an `Option` and `Timing.Running`.
- `stepper` (`schedules.ts:93-101`) builds its id with `seriesId`, which 11 deletes; the cache key becomes the
  arming id, which changes `compiled.ts:149-150`'s request.
- `byDue` is typed on `Due`, which 11 deletes; `dueOf` (`schedule-plan.ts:222-234`) matches `Running.timer` and is
  not listed; `checked` (`schedule-decision.ts:217`) calls the deleted `ran`.
- `stopAll` is deleted, but `retire` calls it (`incarnations.ts:295`); name who releases on actor end.
  `turned` is also called from `serve.ts:341`, absent from 11.
- The 1,641-line total is the five files plus `schedule-steps.ts`; the "outside the five" changes are uncounted.

### 2.3 Minor

- **"Removed" claims, three are gathered.** F1: `SavedTimer` (5.8) is a hand-written shape beside `Tracked`, so a
  new field can be forgotten and only I6 or I11 notices. Removed would be one Schema for `Tracked` whose encoded
  side is the record. F3: one writer is held by a lint rule (I8), not a type; an opaque constructor exported only
  from `schedule-decision.ts` would remove it. F5: "the owner never passes an ended scope's state" is a
  precondition; keying the scope's map by the activation id minted on entry would make the old state unreachable.
  F4 is removed from `decide` and gathered in 5.9, which is honest "handled at one point".
- **Definition edits make up firings.** A key Schema edit drops the saved timer, `keys` lists an equal key, and a
  new keyed timer is a start cause (AS:406, 332): a key idle after `Stop` re-arms at the reload. Keyed to unkeyed
  does the same. State it as the rule, or make "new at `Wake`" a start cause only for a schedule absent from the
  record.
- **Seams the neighbours contest, not raised as questions.** TP PD4 (scoped `armOn`, TP:380) is open, and AS:480
  treats it as settled. S-7 is resolved against SR:201 ("that timer dropped") with no question. Props are
  root-wide (FR:89), so a props change is a `Context`-like occasion for every instance scope, not one scope's
  `Turn`. TP:190 lists arms before `restartOn`, while a restart is an arming input (AS:331); TP's note needs the
  design's order. FR:113 types the map as `Tracked`, AS as `Scheduled`; FR's `Mail.Firing` gains an instance
  (FR:85) that AS's `Firing` lacks.
- **I10 is ill-posed at two cells.** A first read has no previous value to read, and a throwing next step gives
  `Idle` (F2), changing the arming. Name the next-step trade in the ledger beside the turn's own arm.
- **I12 should define "held" by the state, not by the reasons' truth:** reasons are only seen on occasions, so a
  reason true while asleep cannot hold time (no table error; a wording one).
- 9.4's count is 11 removed, 1 narrowed, 6 kept, not 12 and 6.

### 2.4 Checked and held

The six tables are total over the five occasions; the blind derivation and the adversary found no empty cell. A
firing named by arming id cannot reach a new, restarted or removed run. Same-turn disarm, restart, firing and new
key agree with T57's rulings. Context restarting a timer a same-turn disarm idled through a throw is information
loss, not a breach (I10 holds per decision). The six fit spot-checks of 4.2 and the loop sites of 10.4 match the
code within three lines; `compile-schedules.ts:80-88` does refuse `armOn` on a keyed schedule. RT1 to RT7 are
well posed; RT1 should say it depends on question 1.

### 2.5 The seven questions

- Q1 A holds. Its codec is handed to cluster 4 (AS:1079), yet section 14's recommended order needs it first:
  state that cluster 1's build defines the selection codec as Schema encode plus canonical text, and cluster 4
  adopts it.
- Q2 A, Q3 A, Q5 A and Q6 hold.
- Q4 A holds only with S3's rule. Its cost line should show the trace: an unsaved provider booting at another value
  resets an idle sign-out on every reload, so a user who reloads often is never signed out.
- Q7 A holds; SR must name `wake`'s replan, since SR:156 says a step reads no definition.
- Missing: the `Refused` retry policy (S2); `now` in callbacks (S4); what a definition edit that drops or adds a
  timer owes (B1, minor 2); TP PD4 and S-7 as above.

## 3. Brief changes for clusters 2 to 5

1. **Contract before tables.** Add to the deliverable: the required properties in user terms, derived from the
   problems and Plans before any table (as section 1 here), each invariant traced to one. AS's invariants were
   derived from its own rules, so I1 and I6 encoded the rules' gaps.
2. **Attack the invariants with the design's own rows.** Add a sidecar angle: an adversary that tries to break
   each invariant using only the design's tables. S1 and S2 were findable this way. Better: a Sonnet builds an
   executable model of the tables in the scratchpad, never production, and runs the invariants exhaustively over
   the alphabet before review. The blind derivations checked precision, which AS had; they cannot check truth.
3. **Inventory every input of every user callback** (memory, context, props, lanes, clock), with which occasions
   see a change in it. S4 and S3 are both misses of this row.
4. **One rule for silent occasions.** Each occasion that does not compare (restore, thaw, hydration) names the
   changes it swallows and the occasion that compares them later.
5. **"Removed" needs a type or signature.** A lint, a precondition or one file is "handled at one point"; the
   problem-class table must name the type that excludes the member.
6. **Fit to code by dependency.** For each kept function, check it against the new types; list callers outside
   the area of each deleted one. Put code cites in one fit table instead of three (AS 9.4, 10.4 and 11 overlap).
7. **Reconcile seams and departures.** Each lead lists every place it departs from a concept proposal in its area
   (not only user decisions) as a question, and answers each earlier cluster's seam list item by item.
8. **Size.** AS is 1,265 lines; sections 9, 10, 11 and 17 are 450 of them, much restating code cites. Ask for at
   most about 700 lines, a terse sidecar log (one line per finding), and the walkthrough kept: it was the fastest
   way in. Give sidecars the scratchpad path explicitly, since AS:1190 reports a stray scratch file twice.

## 4. Sidecar log

Four Haiku sidecars at effort high, read-only: (a) adversary on 5.1 to 5.6, (b) blind derivation of 20 rows,
(c) fit to code, (d) seams and questions. None wrote a file.

- (a) I6 false: `Refused` retried at `Wake`: **changed**, re-traced on existing atoms; added selection, firing.
- (a) throwing `resume` loses the overdue firing: **changed**, re-traced; the point is that `Refused` never shows: S1.
- (a) Timing at `Wake` moves time if reasons changed: **changed**, reasons are seen only on occasions; I12 wording.
- (a) `Context` restarts a disarmed timer, via a throw: **rejected**, I10 holds per decision; change time unknown.
- (a) a first reason that throws lets the timer fire: **rejected**, the stated trade of question 2.
- (a) `Over` with a refusal drops the refusal: **rejected**, AS:369 keeps one failure; both are in the trace.
- (a) definition edits end owed firings silently: **accepted**, AS:405-406 against I1's ends: B1.
- (a) a selection change while frozen is never compared: **accepted**, AS:323, 470: S3, with the general rule.
- (b) 20 rows; 14 equal the ledger on `good`: **accepted**, spot-checked 8, 11, 15; row 11's misread gave S2.
- (b) tie order, refusal across restart, failure code: **rejected**, AS:495, 363, 534 answer each.
- (b) creation lists `bad` too: **rejected**, the ledger starts with `good` (`schedule-ledger.ts:38`).
- (b) per-firing refusal not expressible: **rejected**, the sidecar's assumption; `refuse` is one world flag.
- (b) disarm plus change in one turn has no atom: **accepted**, B2's last item.
- (c) derived `adds` contradicts 5.7 row 2: **rejected**, the start cause needs keyed or entry-armed (AS:332).
- (c) kept code reads removed fields; two callers missing: **accepted**, read `schedules.ts:93-101,430-446`: B3.
- (c) totals cover five files plus `schedule-steps.ts`: **accepted**, 1,570 + 71: B3.
- (c) 9.4 count; `schedules.ts:51` type: **changed**, count kept as minor; the cite is trivial.
- (c) fault finders copy snapshot and `byDue` text: **accepted**, a build note for B3.
- (d) TP:190 order contradicts the field order: **changed**, TP lists inputs, not an order: minor wording.
- (d) FR has no freeze row; FR:324 frozen is `Held`: **changed**, AS:1173 lists FR:324; FR's table is cluster 2's.
- (d) props reach every instance (FR:89): **accepted**, minor seam.
- (d) TP PD4 open but adopted; S-7 against SR:201: **accepted**, read TP:380, SR:201: missing questions.
- (d) creation, context, lanes have no TP call site: **changed**, cluster 2's call sites; folded into brief change 7.
- (d) format 6 against AS's format 5: **rejected**, `record-format.ts:10` is 5; SR's 6 is planned.
- (d) X-5 codec handed to a later cluster: **accepted**, the Q1 note in 2.5.
- (d) due order and due index have two owners: **rejected**, AS decides the order; cluster 2 builds the index.

Reviewer's own, not from a sidecar: S4 (`now` in `ScheduleInput`), B1's `Over` trace, B2's `wake-rebases`, the
Level 0 overclaim, and the three gathered families.
