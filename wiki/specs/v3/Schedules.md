# Schedules: companion to the Spec

**Bottom line:** a schedule's whole state is one value per scope, `Scheduled`, and one pure function, `decide`, is
the only code that builds it. This file holds what does not fit @spec.Schedules: the walkthrough, the problem
classes, the principle ledger, the fit to today's code, the seams, the answered and open questions, the open holes
and the process notes. The Spec is pre-coding analysis, to be followed as best-guess guidance and revised whenever
building shows it wrong (`wiki/specs/specs.log` records each change).

Code paths are under `packages/flow-state-v3/` (`src/core/` unless they start with `src/`, `tests/` or `fixtures/`).
Every keyword in a code block is marked existing, CHANGED, RENAMED, NEW or user-defined.

## 1. Walkthrough: a toaster with keyed timers

A shared toaster shows toasts. Each toast expires after its own delay, pauses while the pointer is over the list or
while it is hidden behind `maxVisible`, and starts over when its title is updated.

```ts
// existing: definition, machine, schedules, keys, schedule, restartOn, paused, send, E.X.from, Schema
// NEW: `restartOn` in the declaration         decided 2026-11-20: `key` and `pausedBy` in the declaration
// user-defined: Toaster, expire, Hovered, Hidden, SHOWING, Expired, toasts, hovered, maxVisible
const Toaster = definition({
  id: "Toaster",
  states: ["SHOWING"],
  events: { Show: { id: Schema.String, title: Schema.String }, PointerEnter: {}, PointerLeave: {} },
  internalEvents: { Expired: { id: Schema.String } },
  memory: { toasts: Flow.initial(Schema.Array(Toast), []), hovered: Flow.initial(Schema.Boolean, false) },
  schedules: {
    expire: { key: { id: Schema.String }, pausedBy: ["Hovered", "Hidden"], restartOn: Schema.NullOr(Schema.String) },
  },
});

const toaster = machine(Toaster, ({ S, E }) => ({
  default: S.SHOWING,
  states: {
    SHOWING: {
      schedules: {
        expire: {
          keys: ({ memory }) => memory.toasts.map((t) => ({ id: t.id })),
          schedule: ({ key, memory }) => delayOf(memory.toasts, key.id),
          restartOn: ({ key, memory }) => memory.toasts.find((t) => t.id === key.id)?.title ?? null,
          paused: {
            Hovered: ({ memory }) => memory.hovered,
            Hidden: ({ key, memory, context }) => placeOf(memory.toasts, key.id) >= context.maxVisible,
          },
          send: E.Expired.from(({ key }) => ({ id: key.id })),
        },
      },
    },
  },
}));
```

What the core does, in order (times in ms, `maxVisible` is 1):

1. **`Show a` at 0.** A committed turn: the `Turn` occasion. `a` is new, so it reads every check once: its title
   becomes its baseline silently, a new key is a start cause, its first step is 4000, both reasons read false.
   State: `Armed(Due 4000)`. Snapshot: `[{ key: { id: "a" }, dueAt: 4000 }]`.
2. **`Show b` at 1000.** `b` starts with its full 10000. `Hidden` reads true, so the last step of the same decision
   holds it: `Armed(Held 10000)`, shown as `{ left: 10000, pausedBy: ["Hidden"] }`.
3. **`PointerEnter` at 2000.** `a` reads `["Hovered"]` and is held with `left: 2000`.
4. **`a`'s title is updated at 2500.** `restartOn` reads a value that differs from `a`'s baseline: a start cause.
   `a` gets a new run from step one, held with the full 4000.
5. **The page closes at 3000 and opens at 9000.** The record holds each timer as stored. `Wake` decodes them and
   re-reads the keys and reasons silently. Nothing changes: no evidence, no restart.
6. **A toast `c` arrives whose delay function throws.** A start after commit cannot refuse a turn, so `c` is
   `Refused`: a firing is owed and not armed. The snapshot shows one issue for `expire` and `c`, read from that
   state. It goes when `c` arms, is disarmed or leaves.
7. **`PointerLeave`, and `a` expires.** Its firing sends `Expired { id: "a" }`. The turn removes `a` from memory, so
   `keys` no longer lists it: its timer goes with everything it held. `b` reads `Hidden` false and resumes.

Every step is one row of the tables in the Spec's `algorithm`, and nothing is written outside `decide`.

## 2. Required properties, in user terms

Stated before any table, from @plan.Machines.O5 and @plan.Machines.O8. Each Invariant of the Spec traces to one.

| Id  | Property                                                                                  | Spec               |
| --- | ----------------------------------------------------------------------------------------- | ------------------ |
| P1  | Nothing owed is lost silently: a firing that is owed is armed, or an issue shows          | @spec.Schedules.R1 |
| P2  | Nothing is made up: a timer fires only when a start armed it and nothing since stopped it | @spec.Schedules.R2 |
| P3  | A reload is invisible: it changes nothing a quiet moment would change                     | @spec.Schedules.R3 |
| P4  | A broken callback breaks only itself                                                      | @spec.Schedules.R4 |
| P5  | An issue is a standing condition: it shows while its check's last outcome is a failure    | @spec.Schedules.R5 |
| P6  | Held time does not count; time asleep does                                                | @spec.Schedules.R6 |
| P7  | Every change is compared once                                                             | @spec.Schedules.R7 |
| P8  | Timers are independent: one timer's failure, firing or key never changes another's        | @spec.Schedules.R8 |

## 3. Problem classes

A family is **removed** when a type or a signature cannot express a member, and **handled** when one table, one
Schema, one function or one brand with a lint rule settles every member.

| Family                                                     | Members                                                                                                                        | Result                                                                                                                                                                        |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 A fact a later decision reads does not survive a reload | baseline; refused marker; creation refusal lost on reload; restored hold with no reasons; `etk`; the older Task's `dueAt` rule | Handled at one point: one Schema is the source of both the record and `Tracked`'s type. The two live fields (arming id, cursor) are its only additions; I6 and I11 check them |
| F2 A cell of occasion by state was never filled            | re-entry; first `restartOn` throw; lane baseline; disarm against restart; restart while held                                   | Handled at one point: the six tables, total, with the impossible cell named                                                                                                   |
| F3 Several writers of one field                            | `fired`, `runOf`, creation; `paused` writing the run; `trackedOf` minting; host series                                         | Handled at one point (a brand and a lint rule): `Tracked` and `Scheduled` carry a brand whose constructor only `schedule-decision.ts` holds; the others pass data in          |
| F4 The rule differs by scope                               | freeze and thaw; scoped arms; props; the Plan against the turn walk on denied endings                                          | Handled at one point: the lifecycle table. `decide` sees no scope                                                                                                             |
| F5 A removed timer's state is rebuilt                      | re-entry inheriting reasons (`lastReasonsOf`); a key that leaves keeps its issues                                              | Removed: the owner's map is keyed by the scope's activation id, minted on entry, so an ended activation's state cannot be looked up                                           |
| F6 One fact, two sources                                   | equality; baseline codec; reason cut; key order; `pausedBy` as `string`; `key` as `ScheduleKey`; `unknown`                     | Handled at one point: the compiled schedule's codecs, built once from the declaration                                                                                         |
| F7 The oracle shares the code's mistakes                   | the ledger encodes an overturned rule; a 375-line second model; `it.fails` passes on any failure; the 365 rows                 | Handled at one point: properties apart from any model, two of them metamorphic; expected rows are table lookups                                                               |

Debt, handled one by one: a computed Effect Schedule is planned again from the memory at wake; the retry rule costs
the input gate its skip for a schedule that holds a `Refused` timer.

## 4. Principle ledger

| Principle                                      | Held or traded                                                                                                                                                                                              |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Classes, not instances                         | Held: seven families; two members are named debt                                                                                                                                                            |
| One owner per state, one writer per field      | Held: `decide`, by the `Decided` brand; the outside writers are inputs                                                                                                                                      |
| Store facts, derive views                      | Held: issues, alarms, cursors, `adds`, overdue. Traded: `Held` and `Due` are stored though `reasons` gives the tag, because `left` and `dueAt` are facts; `Stepping.output` is stored to keep a firing O(1) |
| Explicit states                                | Held: `Arming`, `Checked`, `Outcome`, `Selection`, `Cursor`, `Scheduled`; no `Option` in state                                                                                                              |
| One decision per subject per occasion          | Held: the firing's step and its send's outcome are one decision                                                                                                                                             |
| Total tables                                   | Held: six tables; the one impossible cell is named; a model closed over them (Level 0)                                                                                                                      |
| Survives a reload                              | Held: the saved form, I6. Traded: a computed series is planned again at wake                                                                                                                                |
| Same rule at every scope                       | Held: `decide` is scope-blind                                                                                                                                                                               |
| One equality and one codec per fact            | Held for keys, reasons and selections, given the declared `restartOn` Schema                                                                                                                                |
| A throw changes only its own check             | Held for the three checks (I10). Traded, kept from today: a turn's own arm with a bad delay refuses the turn; a next step that throws ends the series                                                       |
| General                                        | Held: the fixture table below                                                                                                                                                                               |
| Simple                                         | Held: five occasions, six fields. `exited`, `adds`, `Plan`, `ran` and the Creation path go                                                                                                                  |
| Effect at the edges                            | Held: the host steps with `Schedule.toStep`; the core holds data                                                                                                                                            |
| Types derive from their source; full inference | Held in this module's code: generic in key and reasons, `Tracked` from its Schema. The public half is RT1 to RT7, each with an owner. Traded until the single point of erasure: the container erases        |
| Cheap operations over the graph                | Held: four compile-time indexes, three run-time ones, no scan of the world                                                                                                                                  |

**Checked against the fixture apps** (`fixtures/*/machines`):

| Fixture                                                                                          | What it needs                                                                                                                        | Rows that give it                                                                                                                              |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `home/machines/room.ts` `poll`                                                                   | keyed; a series computed from memory; `restartOn` on the sensor kind; reasons reading context and lanes                              | Keys; A2 with `reads.first`; Selection; `Context` and `Lanes`. Its `restartOn` selects what its delay reads, so the wake's replan agrees       |
| `room.ts` `check`, `boost`, `reconnect`                                                          | `armOn: [Flow.entry]` beside `restartOn`, `disarmOn` and a pause; a bounded and an exponential series; `armOn` by event              | a new timer with `onEntry`; `Given`; A1; A3 `Again`, `Done`                                                                                    |
| `player.ts` `tick`; `stepper.ts` `repeat`, `settle`; `subscription.ts` `renew`; `pay.ts` `check` | a schedule whose own send, or a repeated event, arms it again                                                                        | `Turn` with `fired` and `Given`: A2 wins over A3                                                                                               |
| `house.ts`, `booking.ts`, `sleep-timer.ts`, `sign-in.ts`, `sync.ts`                              | a delay computed from memory and `now`; two deadlines from one field; a 7-day delay across reloads                                   | the delay keeps `now`; the saved `Due` keeps `dueAt`; due order by declaration                                                                 |
| catalog: `Toast` under `Toaster` by `.each` (kanban)                                             | one unkeyed timer per copy; pushed out of view waits with its time, never shown never starts; a fresh duration when a result arrives | an instance is a scope; a new run under a holding reason keeps its full delay; a restart reads the delay again                                 |
| catalog: typing timers per user (chat); the autosave debounce in a resumable section (editor)    | restart one key on its own event; idle until a change, idle again after firing; a clock that runs while collapsed                    | Selection per key (`armOn` on a keyed schedule stays refused); `Idle` is not sticky; asleep is not a timer state                               |
| catalog: `RateLimit` pauses `Repo`'s schedules (sync)                                            | a trait's state holds its host's timers                                                                                              | a reason reads its own scope's inputs; the trait must put the fact where the host reads it (memory by a raise, or context): `Changes`' channel |

Not expressible, by design: a reason, `keys` or `restartOn` that depends on the clock alone (a "quiet hours" pause).
It needs its own schedule that writes memory. No fixture or catalog row asks for one.

## 5. Fit to today's code

One table for every site this design touches: writers, loops, casts and callers. "L" marks a loop with its cost, "C"
a cast or `unknown`. Kept as they are: `Failure`, `Seen`, `sameReasons`, `firingOf`, `reasonsOf`, `firstStep`,
`inRange`, `operationsOf`, `firings.ts` `firing` and `recheckLanes`, and the one-pass order. Estimated totals: of the
1,641 lines in the five core files and the host stepper, about 780 kept, 560 changed, 300 deleted, 220 new; changes
outside are uncounted. Coders use this to know which code is redundant or to be superseded.

| Site                                                                                                | Today                                                                                  | After                                                                |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| code:packages/flow-state-v3/src/core/schedule-decision.ts#Occasion, `Firing`                        | `exited`, `armed`, `adds`, `over`                                                      | change: Spec `model`, OccasionTypes                                  |
| `Plan`, `PlannedRun`, `PlannedTrack`, `plannedOf`, `plannedTrack` in the same file                  | a run with no id until applied                                                         | delete: `env.mint`                                                   |
| `Reads` and its selection in the same file                                                          | C: `unknown`                                                                           | change: `ScheduleReads`                                              |
| `isScheduleSource` to `issuesAfter`, `ran`, `Pass.ran`                                              | stored issues rebuilt each occasion                                                    | delete                                                               |
| `checked`                                                                                           | calls `ran`                                                                            | change: records the failure only                                     |
| code:packages/flow-state-v3/src/core/schedule-decision.ts#lastReasonsOf                             | reads the timers of an ended activation                                                | delete                                                               |
| `keyed`; `selected`, `rebased`; `started`, `armed`; `firingFailures`                                | four passes                                                                            | change: tables Keys, Selection, Arming, Firing                       |
| `paused`                                                                                            | gate at its top; writes the run; L: `indexOf`, `slice` per timer                       | change: table Reasons                                                |
| code:packages/flow-state-v3/src/core/schedule-decision.ts#heldOrResumed; `decide`                   | reached only through `paused`                                                          | change: `timed`, last and total; new signature                       |
| code:packages/flow-state-v3/src/core/schedules.ts#readOf, `contextOf`                               | L: a context record per read, O(T*C); `now` to every callback                          | change: per-callback inputs, built once per pass                     |
| `stepper`; `schedule-plan.ts` `seriesId`                                                            | C: a series id built from text                                                         | change: keyed by arming id                                           |
| `unchanged`; `disarmRun`, `runningTimer`, `runningTo`; `trackedOf`; `applied`                       | mints in `trackedOf`; C: `getOrThrow`                                                  | delete; `reconcile` replaces them                                    |
| `keyOf`, `keysOf`                                                                                   | C: a key checked by shape                                                              | change: the key Schema                                               |
| `reported`                                                                                          | `withIssuesOf`                                                                         | change: evidence and trace only                                      |
| code:packages/flow-state-v3/src/core/schedules.ts#pass                                              | no fast path; L: timers filtered by name and issues by source per schedule, O(S*(T+I)) | change: fast path, map by activation and name                        |
| `namesIn`, `turned` (callers in `serve.ts`, `incarnations.ts`)                                      | L: `includes`, `find` per schedule                                                     | change: the walk hands names by map; no `exits`                      |
| `firingSettled`, `rechecked`, `restored`                                                            | entry points                                                                           | keep; `restored` calls `wake`                                        |
| `stopAll` (caller `retire` in `incarnations.ts`)                                                    | disarms each run                                                                       | renamed `ended`: drops the entry, releases its armings               |
| `metadataOf`                                                                                        | reads `tracked.name`, `tracked.key`, `run.output`                                      | change: the schedule's name, the entry's key, the cursor's output    |
| `next`; `fired`                                                                                     | writes the next run before the turn; L: copies the timer map per firing                | `next` returns `Next`; `fired` deleted; row A3 applies it once       |
| `firingRun`; `scheduleNamed`                                                                        | reads `tracked.run`, `Timing.Running`; L: `find` per firing                            | change: `Armed`, `Due`, by arming id; `byName`                       |
| `schedule-plan.ts` `declaredOn`; `tree.ts`                                                          | L: the chain rebuilt per pass, O(d^2)                                                  | change: `schedulesAt`                                                |
| code:packages/flow-state-v3/src/core/schedule-plan.ts#savedTimersOf; `seriesId`; `persist.ts`       | L: every state scanned per idle timer, O(T*(N + S_all))                                | delete; the Schema of the saved form                                 |
| `Due`, `byDue` in `schedule-plan.ts`                                                                | L: `findIndex` in the comparator                                                       | change: typed on the new run; reads `rank`                           |
| `runningOf`, `waitingIn`                                                                            | the dangling host id test                                                              | change: the overdue rule                                             |
| `dueOf`, `dueIn`; `step.ts`                                                                         | L: every host timer copied, filtered, sorted per firing                                | delete; the alarm heap                                               |
| code:packages/flow-state-v3/src/core/schedule-restore.ts#trackedOf; `seriesOf`, `outputOf`, `runOf` | invents `armedAt`, `attempt`; baseline none; C: swallowed throws                       | delete: the Schema and `reads.resume`                                |
| `restore` in `schedule-restore.ts`                                                                  | builds the map, then `restored`                                                        | change: `wake` per declared schedule                                 |
| code:packages/flow-state-v3/src/core/firings.ts#fire                                                | writes before the turn                                                                 | change: `next` as data                                               |
| creation in `incarnations.ts`                                                                       | `armingsOf`, then a Creation issue nothing clears                                      | change: `turned` with no arms; row A2 decides                        |
| `armingsOf`, `disarmedBy` in `turn.ts`                                                              | L: two chain walks per turn                                                            | keep for a turn's own arms; read `armedBy`, `disarmedBy`             |
| `Timing`, `Run`, `Tracked`, `withIssuesOf` in `world.ts`                                            | C: baseline `unknown`                                                                  | change: Spec `model`; `StoredSource` pinned; the name `Tracked` kept |
| `vocabulary.ts` `SavedTimer`; `record-format.ts`; `actor-record.ts`                                 | C: key as `Record<string, unknown>`                                                    | change: the saved form and the format step                           |
| `Schedule`, `ScheduleInput` in `compiled.ts`                                                        | C: `restartOn` gives `unknown`; a key as `Values`                                      | change: the codecs; the callback inputs                              |
| `src/host/snapshot.ts` timers and issues                                                            | L: list spread per keyed timer, O(k^2)                                                 | change: one pass over the ordered map; `issuesOf`                    |
| code:packages/flow-state-v3/src/host/owners/schedule-steps.ts                                       | entries kept after a disarm                                                            | change: by arming id; a first step keeps nothing; release            |
| `src/machine.ts` `AnyBody`; `src/handles.ts` `erase`; `src/compile-schedules.ts`; `src/tokens.ts`   | C: the body cast, unchecked `erase`, hand-written types                                | RT1 to RT4 of the Spec's `realization`                               |

**What this must not reopen.** The existing sequence tables prove single-occasion timing: disarm against restart,
restart while held, the full delay under a hold, a throwing reason keeping its last value, the turn refused by a bad
delay. Tables Selection, Arming, Reasons and Timing restate those rules. The changes of behaviour, listed once: no
inherited reasons at a same-turn re-entry; creation's bad delay is `Refused` instead of a Creation issue; a restore
keeps the selection, the firing failure and a refused start, and no longer re-reads `restartOn` for a timer that
has a baseline; a restored series whose delay throws shows an issue instead of ending silently; `restartOn`, reasons
and `keys` no longer receive `now` at run time.

## 6. Seams with other Specs

- `Changes`: activation ids, the schedule row of the turn, the firing mail and `fired`, the `Context` after a
  `Wake`, freeze, the scope order and the loop guard on zero delays. Its unconditional pass after a `Wake` and this
  Spec's 'differs' test give the same views; the test is the specification. A scope that ended in its own turn
  resolves no arms (that Spec's rule).
- `Records`: the saved form's names (`TimerShape`, `Shape`) belong to it; the decode table here says what each saved
  field means at `wake`; one format step for every schedule field at once; it reads no definition, `wake` does.
- `Operations`: `IssueSource.Schedule`; `issuesOf` is its concatenation, `scheduleIssues` this Spec's part with its
  memo inside the core; the family rule for a throwing read is shared text (the Spec's `rules`, ThrowingRead).
- `Types`: the declaration, `TimersOf<D>` through `project`, the evidence rows, the one typed erasure and
  `Compiled`'s indexes.
- `Host`: the alarm heap (`Schedule` alarms written only by this Spec's applier), the host stepper by arming id, a
  hidden page (the edge reads `hidden()` for its capture only), the reporter for broken ids of inverted rows.

**Declared schedules before or after the build.** Three orders were weighed; the user took the third.

| Order                                                                          | Cost                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| This module first, on the body-declared API                                    | The baseline has no declared codec, so it is saved under a stopgap (canonical JSON only). The declared-schedules work then changes the key codec, the reason cut's source and the baseline codec: a second format step, and the sequence fixture is rewritten twice. The two known failures are fixed soonest |
| Declared schedules first, whole                                                | One build on final shapes with one format step. It waits for the type derivation, which is not designed; the two failures stay red longer                                                                                                                                                                     |
| The declaration's runtime half first, then this module, then the types (taken) | The declaration object, its construction checks and the codecs in `Compiled` land first (about 70 lines plus the typed erasure). The build then has one format step. The public types follow and change no runtime                                                                                            |

## 7. Questions

Answered (all by the user, 2026-11-21; the Spec carries each as a tag in the Requirement it shapes).

| Question                                        | Answer                                                                                                     | Where in the Spec |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------- |
| Where the `restartOn` selection gets its codec  | A: the declaration names its Schema beside `key` and `pausedBy`                                            | R16               |
| What a re-entered state's new timer inherits    | A: nothing; its reasons start at `[]`                                                                      | R11               |
| A new timer whose first `restartOn` read throws | A: the first clean read is the baseline, silently                                                          | R2                |
| What a wake does to a saved baseline            | A: nothing; `Context` after the wake compares                                                              | R3                |
| A start whose first step fails                  | A: keep both rules                                                                                         | R11               |
| The build order                                 | the third row                                                                                              | composition       |
| A computed Effect Schedule after a reload       | A: a stated limit; replanned from the memory at wake                                                       | R11               |
| When a refused start is tried again             | A: on every occasion (changes the older rule: at a wake only)                                              | R1                |
| Departures from the concept designs             | as designed: undeclared saved reason dropped; a frozen scope's clock runs; edited keying starts keys again | R6, R14           |

Each answer's traces, for the record:

- **Selection codec.** Trace C (keep `unknown`): `restartOn: () => memory.dueDate` (a `Date`) saved comes back a
  string, unequal to the next read: the timer restarts after every reload, or cannot encode and the whole actor record
  is withheld. Trace A: the schedule declares `restartOn: Schema.Date`; the text round-trips; a reload changes nothing.
- **Re-entry.** B would inherit the key's last reasons from an ended activation: the same steps hold the new timer by
  a reason read in an activation that no longer exists, and a re-entry one turn later does not, so two paths to the
  same state differ.
- **First read throws.** B (count it as a change): selection throws / `bad` appears / Stop / selection reads again with
  the same value; `bad` re-arms after `Stop` though nothing changed: a made-up firing.
- **Wake and baseline.** B (re-read and take a clean value silently): an idle sign-out reads an activity counter from
  context; the counter moves from 5 to 7 while the page is closed; the wake takes 7 silently and the timer keeps its
  old deadline. A restarts it once. Cost of A: a provider that is not saved and boots at another value restarts the
  timers that select it on every reload.
- **First step fails.** B (every start decided after commit, no turn refused by a schedule) would remove the arming
  first-step half and `Turn.started.first` and flip rows the sequence tables prove.
- **Computed series.** The one fixture that computes a series selects the same field in `restartOn`, so a change
  restarts it and the replan agrees; the limit bites only a series that reads what its `restartOn` does not select.
- **Refused start.** B (retry at a wake or a later start cause): `bad` appears out of range / `bad` appears (valid
  now) leaves `bad` refused with its issue though nothing is wrong; a reload then arms it, so the reload is visible and
  I6 needs an exception.
- **Departures.** A removed reason must not drop a held toast timer, which would never expire. A frozen scope's clock
  runs (`Changes` may hold it instead: a session timeout in a frozen trait never comes due under that rule). A
  definition edit that makes a saved key unreadable starts its keys again from step one; the alternative leaves an
  armed key unarmed with no issue.

Open or proposed (in the Spec's `open` section): the input gate (proposed), the hidden page (proposed, the user's
call), the Plan's `Flow.keyed` wording (the user's edit), scoped `armOn` (closed by `Changes`), the two Level 0
atoms, and the computed-series debt. Proposed and the integrator's to accept, not questions: saving whole failures;
the name `Tracked`; the input gate; the arming id in `Firing`; the activation id as the map's key; `Cursor.Broken`;
`now` no longer passed to `restartOn`, the reasons and `keys`.

## 8. Open holes

1. The Level 0 closure was run on a scratch model of the tables outside the repository. It held I1 to I5, I7, I10
   and I13 and found seven of eight seeded faults; it did not exercise a next step past the limit or a throwing
   `resume`. The model that guards this Spec belongs in the package's tests before code (the Spec's T1).
2. The types half (RT1 to RT4 and the cast deletions) waits for the two type spikes in `Types`, which need a compile
   against the package; until then the families are handled at one point and the casts stand.
3. The fit table cites sites by name; its line numbers and the 1,641-line total were taken when the design was
   written and were not recounted.
4. The `Context` pass after a `Wake` and a thaw is specified here and implemented in `Changes`; the two have not
   been compared by a model.
5. The alarm kind order at one instant is `Changes`' (its Q9) and was not run in a model.

## 9. Process notes

- The algorithm was designed during the build, as "calls", with no state inventory. Rules lived in comments and
  contradicted each other (a re-entry was "rejected" in one Task and "the ruling" in the next). There was no table to
  amend.
- Alphabets came from the last bug, the oracle was a second model nobody amended with the rule, and convergence
  gathered code within an hour of its review, by the same lead.
- Types had no owner in the design: `pausedBy` and `key` moved through three Tasks in one day.
- The first invariants were derived from the first rules, so I1 and I6 encoded the rules' gaps, and two blind
  derivations agreed with rows that were wrong. The properties come first now. An executable model of the tables,
  run before any review, closed them in seconds: the cheapest check there is.
- Answered questions must be carried into every table: a grep for the question across the design caught five places
  that still said the other answer.

How to build the module:

1. The declaration's runtime half, then the tables of the Spec as data with the Level 0 closure over a stub of the
   new `decide`: the first failing check. The scratch model is prior art, not its code.
2. The amended Story oracle and the recount on today's code (T5). Review here, before production code: a blind
   derivation, an adversary, and the properties against the tables' own rows.
3. The types with the `StoredSource` and `Decided` pins, then `decide` whole in one change.
4. The owner (`pass`, `reconcile`, the firing with `next` as data, creation), then the Schema, `wake` and the format
   step, with I6 as its first failing check. Then the deletions, the plants, the indexes and the bench.
5. One review of the code against the tables. A second failure of one class after that goes to a fresh agent with the
   problem and the findings, not this draft.

Tasks that build it: @task.V3.T120 (the declaration's runtime half), @task.V3.T118 (this module), @task.V3.T113 (the
typed machine), @task.V3.T119 (turn parts), @task.V3.T92 (records).
