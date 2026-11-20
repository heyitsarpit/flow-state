---
proposal schedule-issues
status proposed 2026-11-20
---
# Schedule issues: stop storing them

**Verdict: redesign of one seam, not of schedules.** A schedule issue stops being a stored thing. Each timer keeps
the last outcome of each of its own checks, and the issues are read from the timers. `decide`, the occasions, the
one-pass order and the 3,500-row table stay. `issuesAfter`, the `ran` bookkeeping and the schedule half of
`Incarnation.issues` go.

Everything here is **proposed**. Nothing is decided until the user accepts it. Asks are in section 8.

Sources: @task.V3.T57 (four close reviews, latest at commit `108d00cf`),
`code:packages/flow-state-v3/src/core/schedule-decision.ts`, @spec.Turn.R14 to R17, R19, R25, R27,
@spec.WriteAhead.R4, @plan.Machines.O5, O8.

## 1. The freedom

A schedule issue reports a condition that lasts: this timer is unarmed, this check's value is stale, this firing's
send was lost. The condition lives in no state. What is stored instead is a residue of the event that began it, in
a list beside the timers (`Incarnation.issues`), one slot per schedule and key. Every later occasion must then
work out, from that occasion alone, whether each old residue still stands: `issuesAfter` rebuilds the list from
the old issues, the failures now and the slots that ran now (`schedule-decision.ts:440-466`). So the code can do
two things correct code never needs: **forget a condition that still holds** (an unrelated check's failure takes
the one slot, then clears it: B2), and **keep or drop a stored fact without re-deriving it from its cause** (a
`Held` run stored beside `pausedBy`, kept in step only by a pass the definition can switch off: B1).

Four rounds did not remove it because each one improved the reconstruction rule by one dimension and kept the
reconstruction: clear only slots that ran (review 2), key the slot (review 3), one writer (fix round 4). One
writer per occasion is not one owner over time: the owner of a lasting condition has to be state that lasts.
The tables test one occasion, and this class only exists across occasions, so they could not see it.

Structural cause, in policy-convergence's terms: *one rule implemented twice* (the condition and its report can
disagree) on top of *several writers to one state* (several conditions share one slot).

## 2. The design

### State: one record per timer, holding its checks' last outcomes

Before (`world.ts`, existing):

```ts
type Tracked = {
  name: string;
  key: Option.Option<TimerKey>;
  baseline: Option.Option<unknown>;      // restartOn's last selection
  pausedBy: ReadonlyArray<string>;       // the reasons last read true
  run: Option.Option<Run>;               // none: idle, for any cause
};
type Incarnation = { schedules: ReadonlyMap<string, Tracked>; issues: ReadonlyArray<Issue> /* all sources */ };
```

After (proposed):

```ts
// NEW: Checked. A check's last outcome: read clean, or failed keeping the value it last read clean.
type Checked<A> = Data.TaggedEnum<{
  Read: { value: A };
  Failed: { failure: Failure; last: A };   // existing: Failure = { code, slot }
}>;

// NEW: Arming. Why a timer has or lacks a run. `Refused` is the state today's code cannot hold.
type Arming = Data.TaggedEnum<{
  Idle: {};                      // never armed, ended after its last step, or disarmed
  Refused: { failure: Failure }; // a start after commit whose delay failed: a firing is owed and not armed
  Armed: { run: Run };           // existing: Run, Timing
}>;

// RENAMED: Tracked -> Timer. Every field is the last outcome of one check of this timer.
type Timer = {
  name: string;
  key: Option.Option<TimerKey>;
  selection: Checked<Option.Option<unknown>>;   // RENAMED from baseline; restartOn
  reasons: Checked<ReadonlyArray<string>>;      // RENAMED from pausedBy; a schedule with no `paused` is Read([])
  arming: Arming;                               // replaces run
  firing: Option.Option<Failure>;               // NEW: the last firing's failure (mapper threw, send refused,
                                                // next step past the limit)
};

// NEW: Scheduled. One schedule's state: its keys check's last failure, and its timers.
type Scheduled = { keys: Option.Option<Failure>; timers: ReadonlyArray<Timer> };

type Incarnation = {
  schedules: ReadonlyMap<string, Scheduled>;    // keyed by schedule name
  issues: ReadonlyArray<StoredIssue>;           // NEW type: Issue whose source is never Schedule
};
```

### Owner and transitions

`decide` stays the owner, with a smaller job: it returns `Scheduled` and the failures raised this occasion.
It no longer takes or returns issues.

```ts
// Before (existing)
decide(schedule, before: ReadonlyArray<Tracked>, issues: ReadonlyArray<Issue>, occasion, reads, now)
  : { tracks; issues; raised; seen }

// After (proposed)
decide(schedule, before: Scheduled, occasion, reads, now)
  : { after: Scheduled; raised: ReadonlyArray<Failure & { key }>; seen }
```

Each field changes only when its own check runs, or its timer goes:

| Field       | Written by                                  | Goes to                                                                 |
| ----------- | ------------------------------------------- | ----------------------------------------------------------------------- |
| `keys`      | every occasion's `keys` read                | none on a clean read; the failure on a throw (timers kept)              |
| `selection` | `restartOn`, when the occasion runs it      | `Read`, or `Failed` keeping the last baseline                           |
| `reasons`   | every occasion, every timer, armed or idle  | `Read`, or `Failed` keeping the last reasons (R19)                      |
| `arming`    | a start (entry, `armOn`, new key, restart)  | `Armed`, or `Refused` when its delay fails after commit                 |
| `arming`    | `disarmOn`; a firing's last step            | `Idle`                                                                  |
| `firing`    | a firing of this timer                      | its failure; none when the firing commits clean                         |
| `firing`    | a start that arms                           | none (today's rule: the next clean arming clears a step past the limit) |
| whole timer | exit, its key leaving, its schedule dropped | removed, with everything it held                                        |

Nothing else writes a field. In particular a pause reason cannot touch `arming`, and one key cannot touch another:
they are different fields of different records.

Held or due is not decided by the reasons step any more. One total step runs last, for every armed timer, on every
occasion, and never looks at the definition:

```ts
// NEW: timed. The only place a run becomes Held or Due.
const timed = (run: PlannedRun, reasons: Checked<ReadonlyArray<string>>, now: number) =>
  heldOrResumed(run, Checked.$match(reasons, { Read: (r) => r.value, Failed: (f) => f.last }), now);
```

`reads.reasons` answers `Result.succeed([])` for a schedule that declares no `paused`, so "no reasons declared"
and "every reason false" are the same value and take the same path. The `if (slots.length > 0)` gate is deleted.

### Stored versus derived

- **Stored:** the `Scheduled` map. Saved: as today, plus one marker on an idle saved timer, `refused: true`
  (see restore, below).
- **Derived:** every schedule issue.

```ts
// NEW: the only constructor of IssueSource.Schedule. Check order is today's: firing, restartOn, arming, reasons.
export const scheduleIssues = (schedule: Schedule, state: Scheduled): ReadonlyArray<Issue> => [
  ...Option.toArray(state.keys).map(issueAt(schedule, Option.none())),
  ...state.timers.flatMap((t) =>
    Arr.take(1)([                                   // one per source, the first in check order (Turn R19)
      ...Option.toArray(t.firing),
      ...failureOf(t.selection),
      ...(Arming.$is("Refused")(t.arming) ? [t.arming.failure] : []),
      ...failureOf(t.reasons),
    ]).map(issueAt(schedule, t.key)),
  ),
];

// NEW: what the snapshot, inspection and Stories read. Replaces reading `incarnation.issues` directly.
export const issuesOf = (machines, incarnation) => [...incarnation.issues, ...scheduleIssuesOf(machines, incarnation)];
```

`raised` is unchanged: each failure is still recorded once in the trace when it happens (`tx.refuse`). The trace
is the log of events; the issue is the standing condition. That split is the design.

### Why the class is unwritable

There is no clearing step to get wrong. A failure can leave the view only when its own field is assigned again,
which only a later run of the same check does, or when its timer is removed. Hiding is possible (one issue shows
per source) but a hidden failure is still in state and shows again when the one above it goes. The honest limit:
`decide` can still assign one field wrongly in one occasion (write `Idle` where `Refused` belongs). That is a
one-occasion mistake, which the existing table is built to catch.

### Restore and definition edits

Restore decodes the saved timers against the current definition, then runs the same `decide`:

| Edit                                     | After restore                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| schedule removed or renamed              | its timers are dropped (today's rule); their issues go with them                     |
| schedule added                           | starts if its state's entry arms it (today's rule)                                   |
| keying changed, or key no longer encodes | timer dropped (today's rule, `schedule-restore.ts` `trackedOf`)                      |
| key no longer listed by `keys`           | timer removed by the keys read                                                       |
| reason removed or renamed                | saved `pausedBy` cut to declared names, then read fresh; `timed` resumes a free hold |
| every reason removed (B1)                | reasons read `[]`; `timed` resumes from `left`                                       |
| reason added                             | read fresh; holds silently if true                                                   |
| saved `refused: true`                    | the start is tried again, silently: `Armed` from step one, or `Refused` again        |

The last row is why only a marker is saved, not the failure: a refused start is owed work, so restore redoes it
and the failure is re-read from the current build. A firing's failure is a report of a past event and is not
saved, like every other source's issue today.

## 3. Turn R25

The pending option, "an arming issue stays while its timer stays unarmed", is **right in effect and unnecessary as
a rule**. Under this design it is not a sentence to enforce; it is what `Arming.Refused` is. Adding it as a fourth
clause to today's R25 would be the fifth patch to the reconstruction.

Proposed R25 (replaces the schedule sentences; the first two sentences stay):

> A later success or release clears its own source's issue, never another source's. A new incarnation inherits no
> issue. A schedule's issues are not stored. Each timer (its schedule and key) keeps the last outcome of each of
> its checks: `restartOn`, its pause reasons, its arming, and its last firing; the schedule keeps its `keys`
> check's. An issue is a failed last outcome, so it changes only when that same check runs again and goes when its
> timer goes (exit, its key leaving, its schedule dropped). A start refused after commit leaves the timer refused,
> with its issue, until a start succeeds or `disarmOn` stops it. One issue shows per source, the first in check
> order; the others show when it goes.

This changes one existing clause: **"a key that leaves keeps its issues" becomes "loses them"** (P1 below).

## 4. The test and the guard

### The test: short sequences against a ledger of owed firings

The table stays for one occasion. Sequences get a second, small test that needs no second implementation of
`decide`: after **every** step it checks invariants, each taken from one Spec rule, against a ledger the test
keeps itself.

- **Fixture:** one keyed schedule, keys `good` and `bad`, one pause reason A, a `restartOn`, `armOn: [Go]`,
  `disarmOn: [Stop]`; `bad`'s delay is invalid when a flag is set. Run through public Stories and the snapshot.
- **Atoms** (an occasion and the world it reads): occasion in {write, Go, Stop, re-entry, lane change, context
  change, `good` fires and commits, `good` fires and is refused, restore under the same build, restore under an
  edited build}; world in keys {both, `good` only, throws} x A per key {false, true, throws} x `bad`'s delay
  {valid, invalid} x selection {same, changed, throws} x build {with `paused`, without}.
- **Enumeration:** every sequence of 3 atoms, exhaustively; depth 4 over a cut alphabet (one value per dimension
  changed per step); a seeded walk of 12 steps on top, behind `FLOW_STRESS`.
- **Ledger** (five lines, written from the Spec, never from the code): a firing is *owed* for a key after a start
  (key appears, Go, restart, entry: R14, R16) and stops being owed after its last step fires, `disarmOn`, exit or
  the key leaving (R14, R15, R27).
- **Invariants after each step:**
  1. R14: owed implies the timer is armed or its source shows an issue. *(B2, review 3 B2)*
  2. R14: not owed implies not armed. *(disarm with restart, review 1)*
  3. R17, R27: armed and held implies a reason is true now, or unreadable and last true; armed and due implies
     none is. *(B1, review 2 B1, review 3 B1)*
  4. R25: a check that fails now shows an issue on its source; a source with nothing failing and nothing refused
     shows none. *(never cleared, review 1; cleared unrun, review 2 B2)*
  5. R15: at the end, running the clock out fires exactly the owed, unheld timers, once each.

Every miss so far is a sequence of at most 3 atoms (section 5), so depth 3 exhaustive would have caught each.
Acceptance for the build: the test is written first and is red for B1 and B2 on today's code.

A scratch model of this design with the ledger (outside the repository, reduced: no `restartOn`) ran 63 million
depth-3 sequences over 504 atoms with no invariant failing, and traces B1, B2 and review 3's B2 as in section 5.

### The guard

1. **Type:** `Incarnation.issues` is `ReadonlyArray<StoredIssue>`, whose source excludes `Schedule`. `withIssue`
   and its siblings take `StoredIssue`. A stored schedule issue no longer compiles.
2. **Lint** (`timers-decided`, extended): `IssueSource.Schedule(` only inside `scheduleIssues`; `Plan.Held(` and
   `Timing.Held(` only inside `timed` and the restore decoder; reading `incarnation.issues` outside `issuesOf`
   in `src/host/` is an error. The rule's existing `.issues` half for schedules is deleted with `withIssuesOf`.
3. **Planted faults,** each caught by the sequence test: `refused-start-goes-idle`, `hold-skipped-without-reasons`,
   `reason-read-touches-arming`, `restore-keeps-undeclared-reason`.

## 5. Traces

**B1 (review 4): held timer restored under a build with no pause reasons.**
Hold by A: `reasons: Read([A])`, `arming: Armed(Held { left: 60000 })`. Save. Restore under the build without
`paused`: the decoder cuts `pausedBy` to declared names, `[]`; `reads.reasons` gives `[]`; `reasons: Read([])`;
`timed` runs unconditionally and resumes: `Due { dueAt: now + 60000 }`. Tick fires. Invariant 3 fails today.

**B2 (review 4): arming issue replaced, then cleared.**
`bad` appears with delay 2^31: `arming: Refused(InvalidTurn at schedule slot)`; issue shows. A throws for `bad`:
`reasons: Failed(A, last [])`; `arming` untouched; the source shows the arming issue (first in check order), A's
failure is in the trace. A reads clean: `reasons: Read([])`; `arming` still `Refused`; issue still shows. It goes
only when `bad` arms, is disarmed, or leaves.

**Review 3 B2: `good`'s firing cleared `bad`'s arming issue.**
`good` fires and commits: `good.firing` none, `good.arming: Idle`. `bad` is another record; nothing in `good`'s
firing can reach `bad.arming`. Issue stays.

**Review 2 B2: a check's issue cleared when the check did not run.**
`restartOn` throws: `selection: Failed`. Break at 2 min, then the 5 min firing: neither occasion runs `restartOn`
for a baselined timer, so `selection` is not assigned and stays `Failed`. There is no `ran` set to consult.

**Review 3 B1 (for the hold half): idle timer forgets its reasons.** A true while idle: `reasons: Read([A])` on an
`Idle` timer. Go with A throwing: `reasons: Failed(last [A])`, `arming: Armed`; `timed` holds it by `last`.

## 6. Proposed decisions (each with two traces)

**P1. A timer that goes takes its issues with it** (changes R25's "a key that leaves keeps its issues").
- Trace A (today): `bad` refused; data changes and `keys` lists only `good`. The snapshot shows an issue naming
  a key the application no longer has. Nothing clears it but `bad` returning clean or the incarnation ending.
  The same happens for a schedule whose state exited: `pass` drops its timers and leaves its issues.
- Trace B: `bad`'s timer and issue go together. The refusal stays in the trace. If `bad` returns it is a new
  timer: it arms, or is refused and reported again. No firing is owed to a key that left (R27: nothing fires
  later), so B loses no ending and no live report.
- Recommended: **B**. Keeping A needs tombstone records for gone keys, which grow without bound.
- Also covers, found by the adversary: a firing past the limit in a turn that also exits or disarms. The failure
  is in the trace; no standing issue, because no timer stands.

**P2. Restore tries a refused start again; the record marks it** (adds `refused: true` to an idle saved timer,
WriteAhead R4; record format 5 to 6, old records read as not refused).
- Trace A (no marker): `bad` refused, reload. The saved timer is idle, so restore does not start it, and issues
  are not saved: `bad` is unarmed with no report. This is B2's ending, reached by a reload.
- Trace B: restore sees the marker and runs the start. Same build: `Refused` again, issue shows. A build that
  fixed the delay: armed from step one.
- Recommended: **B**.

**P3. One issue per source stays; the rest wait behind it** (no change to Turn R19 or the snapshot shape).
- Alternative: show every standing failure of a source. More truthful at a glance, but changes the public shape
  and Stories that count issues. Recommended: keep one; revisit only if a real case needs it.

## 7. Cost, risk, fit

**Changes** (source, about 350 to 500 lines touched, net smaller):
- `world.ts`: `Tracked` becomes `Timer`, `Scheduled` and `StoredIssue` added, `withIssuesOf` removed.
- `schedule-decision.ts`: `issuesAfter`, `checkSlotsOf`, `ran`, `issueKeyOf`, `isScheduleSource` deleted (about
  90 lines); `paused` loses its gate; `timed` and `scheduleIssues` added.
- `schedules.ts`: `reported` stops writing issues; `applied` maps `Arming` to host timers; map keyed by name.
- `schedule-restore.ts`, `vocabulary.ts`, `persist.ts`: decode against the definition; the `refused` marker; the
  format step.
- `src/host/snapshot.ts`, `inspect.ts`: read `issuesOf`.
- Tests: the sequence test and four plants (new); the table's issue column re-derived for rows with two failures
  on one source; rules checker and record oracle read the new shape; about nine plants re-pointed.

**Drops:** the stored schedule issue list; "a key that leaves keeps its issues"; issues surviving for an exited
state's schedules (they were never cleared).

**Risk:**
- The firing's next step is still written by `fired` outside `decide` (`firings.ts`). Its outcome reaches `decide`
  as `Firing.over`, as today. Not widened, not closed, by this proposal.
- `Refused` lasts until something starts the timer again. No retry is added (I38 keeps lane changes to keys and
  reasons). A refused key stays reported, not repaired; that is the Spec today.
- The scratch model is reduced. The first real evidence is the sequence test, red on today's code.
- Record format step: one more upgrade to prove with a plant.

**Fit:** it needs **its own Task** (proposed), not a fifth fix round inside T57. Reason: the Epic's whole-Task rule
puts every writer of one state in one Task with its restore and types; this state (schedule failures over time)
now includes the record format and the snapshot's read path, and T57 has reached its failure limit. T57 stays
open and closes through it: B1 and B2 land as the new Task's first red checks.

**Same freedom elsewhere** (found by a sidecar; a follow-up, not part of this build):
- `IssueSource.Operation` is keyed by the operation's name only (`serve.ts:46`) and cleared by any accepted ending
  of that name (`serve.ts:270-282`). If lanes are per key, key B's success clears key A's failure: review 3's B2,
  for operations. Source shape verified; the sequence was not run.
- `Creation` issues are appended and never cleared (`incarnations.ts:181-187`); a refused creation arming is the
  same condition as `Arming.Refused` and would be derived by this design if creation started timers through it.
- `Context` and `OnContext` clear by the same check that raised them, one slot per check: sound as they are.

## 8. What needs the user

1. Accept or reject the redesign (stored issues to derived) and the R25 text in section 3.
2. P1: a key that leaves, or a state that exits, drops its schedule issues. Recommended yes.
3. P2: the `refused` marker in the record and the retry at restore (format 5 to 6). Recommended yes.
4. A new Task for the build, with T57 closing through it. Recommended yes.
5. Whether the Operation and Creation findings get their own Task now or go to `revisit.md`.

## 9. Sidecar log

Five Haiku sidecars, effort high, read-only. Each finding was checked against the code or record before use.

| Sidecar          | Finding                                                       | Result                    | Why                                                 |
| ---------------- | ------------------------------------------------------------- | ------------------------- | --------------------------------------------------- |
| Review catalogue | all past misses, by review, with sequences                    | accepted                  | matches the T57 record lines I read                 |
| Review catalogue | the user's Q1 options are in no record                        | accepted                  | only review 4's Trace B states it                   |
| Spec rules       | R25, R14, R19, I38 text; B1 and B2 undecided by the Specs     | accepted                  | re-read `Turn.spec:265-273`                         |
| Spec rules       | WriteAhead R4: the record holds issues                        | accepted, a contradiction | the code saves none; see P2                         |
| Spec rules       | "a clean pause read could re-arm" (reading C)                 | rejected                  | adds a retry I38 forbids                            |
| Writers map      | one `decide` call; undeclared schedules keep issues           | accepted                  | read `schedules.ts:265-354`                         |
| Writers map      | B1: `heldOrResumed` only reachable inside the gate            | accepted                  | `schedule-decision.ts:383-410`                      |
| Writers map      | lint guard blind spots (destructuring, exempt files)          | accepted                  | basis for the type guard                            |
| Adversary        | over-limit firing with exit or disarm leaves no issue         | changed                   | a consequence of P1, stated there                   |
| Adversary        | refused send with the key leaving loses the issue             | changed                   | same, P1                                            |
| Adversary        | keyed-to-unkeyed edit keeps the first key's timer             | rejected                  | `trackedOf` drops such a timer                      |
| Adversary        | a `Refused` timer never re-arms after a build fixes its delay | accepted                  | became P2's retry at restore                        |
| Adversary        | the firing's failure must come first in check order           | accepted                  | order in `scheduleIssues`                           |
| Siblings         | Operation source keyed by name, cleared by any ending         | accepted as a lead        | sequence not run                                    |
| Siblings         | Creation issues never cleared                                 | accepted as a lead        | read `incarnations.ts:181-187`                      |
| Siblings         | Event issue outlives its state                                | changed to a note         | by design: cleared by that tag's next accepted turn |
