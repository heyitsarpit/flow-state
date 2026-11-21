---
proposal algo-schedules
status proposed 2026-11-21
---
# Schedules and occasions: the core algorithm (2026-11-21)

**Bottom line:** a schedule's whole state is one value per scope, `Scheduled`, and one pure function, `decide`,
is the only code that builds it. Everything that wrote a timer from outside (the firing's next step, the restored
run, the creation-time refusal, the reload's baseline) becomes an input to that function or a row of its tables.
Six tables, one per field, are total over five occasions. The record is the stored state through one Schema.
Scope lifecycle (enter, exit, instance start and end, freeze, thaw, props) maps onto the same five occasions. Of
seven problem families, two are removed by a type and five are handled at one point each (section 3).

Everything here is **proposed**. It keeps @proposal.schedule-issues (accepted by the user 2026-11-21): derived
issues, `Checked`, `Arming.Refused`, P1 and P2. It runs skill:to-design steps 1 to 4 and 6 for cluster 1 of
@proposal.algorithm-round and writes no Spec. It was revised after @review.review-algo-schedules and after an
executable model of its tables (9.1). Nine questions for the user are in section 15.

Conventions: code paths are under `packages/flow-state-v3/` (`src/core/` unless they start with `src/`, `tests/` or
`fixtures/`). SI is @proposal.schedule-issues, AR is @review.algorithm-review, CS is @review.case-studies, TM is
@proposal.spec-typed-machine, FR is @proposal.spec-fragments, TP is @proposal.spec-turn-parts, BC is
@proposal.spec-boundary-channels, SR is @proposal.spec-saved-records. Every keyword in a code block is marked
existing, CHANGED, RENAMED, NEW or user-defined.

## 1. Walkthrough: a toaster with keyed timers

A shared toaster shows toasts. Each toast expires after its own delay, pauses while the pointer is over the list
or while it is hidden behind `maxVisible`, and starts over when its title is updated.

```ts
// existing: definition, machine, schedules, keys, schedule, restartOn, paused, send, E.X.from, Schema
// NEW: `restartOn` in the declaration (question 1)     decided 2026-11-20: `key` and `pausedBy` in the declaration
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
2. **`Show b` at 1000.** `b` starts with its full 10000. `Hidden` reads true, so the last step of the same
   decision holds it: `Armed(Held 10000)`, shown as `{ left: 10000, pausedBy: ["Hidden"] }`.
3. **`PointerEnter` at 2000.** `a` reads `["Hovered"]` and is held with `left: 2000`.
4. **`a`'s title is updated at 2500.** `restartOn` reads a value that differs from `a`'s baseline: a start cause.
   `a` gets a new run from step one, held with the full 4000.
5. **The page closes at 3000 and opens at 9000.** The record holds each timer as stored. `Wake` decodes them and
   re-reads the keys and reasons silently. Nothing changes: no evidence, no restart.
6. **A toast `c` arrives whose delay function throws.** A start after commit cannot refuse a turn, so `c` is
   `Refused`: a firing is owed and not armed. The snapshot shows one issue for `expire` and `c`, read from that
   state. It goes when `c` arms, is disarmed or leaves.
7. **`PointerLeave`, and `a` expires.** Its firing sends `Expired { id: "a" }`. The turn removes `a` from memory,
   so `keys` no longer lists it: its timer goes with everything it held. `b` reads `Hidden` false and resumes.

Every step is one row of the tables in section 6, and nothing is written outside `decide`.

## 2. Required properties, in user terms

Stated before any table, from @plan.Machines.O5 and O8, SI and CS 1.6. Each invariant of section 8 traces to one.

| Id  | Property                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Nothing owed is lost silently: a firing that is owed is armed, or an issue shows for its timer or its schedule                                      |
| P2  | Nothing is made up: a timer fires only when a start armed it and nothing since stopped it                                                           |
| P3  | A reload is invisible: it changes nothing a later view shows beyond what a quiet moment (an occasion that changes no input) would change            |
| P4  | A broken callback breaks only itself: a throw changes its own check and nothing else                                                                |
| P5  | An issue is a standing condition: it shows while its check's last outcome is a failure, and goes when that check next reads clean or its timer goes |
| P6  | Held time does not count; time asleep does (an unused actor, a frozen trait, a closed page)                                                         |
| P7  | Every change is compared once: a change in what a callback reads reaches it on the first occasion that can hear it                                  |
| P8  | Timers are independent: one timer's failure, firing or key never changes another's                                                                  |

## 3. Problem classes

A family is **removed** when a type or a signature cannot express a member, and **handled** when one table, one
Schema or one function settles every member.

| Family                                                     | Members                                                                                                                     | Result                                                                                                                                                                              |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 A fact a later decision reads does not survive a reload | S-1 baseline; S-5 refused marker; creation refusal lost on reload; restored hold with no reasons (B1); `etk`; T56's `dueAt` | Handled at one point: one Schema is the source of both the record and `Tracked`'s type (6.6). The two live fields (arming id, cursor) are its only additions; I6 and I11 check them |
| F2 A cell of occasion by state was never filled            | S-2 re-entry; S-3 first `restartOn` throw; S-6 lane baseline; disarm against restart; restart while held                    | Handled at one point: the six tables of section 6, total, with the impossible cell named                                                                                            |
| F3 Several writers of one field                            | S-4 `fired`, `runOf`, creation; `paused` writing the run; `trackedOf` minting; S-8 host series                              | Removed: `Tracked` and `Scheduled` carry a brand whose constructor only `schedule-decision.ts` holds; the others pass data in (section 5)                                           |
| F4 The rule differs by scope                               | X-2; FR-3 freeze and thaw; TP-5 scoped arms; BC props; the Plan against TP on denied endings                                | Handled at one point: the mapping of 6.7. `decide` sees no scope                                                                                                                    |
| F5 A removed timer's state is rebuilt                      | re-entry inheriting reasons (`schedule-decision.ts:183`, ledger `:175`); a key that leaves keeps its issues                 | Removed: the owner's map is keyed by the scope's activation id, minted on entry, so an ended activation's state cannot be looked up                                                 |
| F6 One fact, two sources                                   | X-5 equality; baseline codec; S-7 reason cut; key order I32; `pausedBy` as `string`; `key` as `ScheduleKey`; `unknown`      | Handled at one point: the compiled schedule's codecs, built once from the declaration (section 10)                                                                                  |
| F7 The oracle shares the code's mistakes                   | the ledger encodes an overturned rule; a 375-line second model; `it.fails` passes on any failure; the 365 rows              | Handled at one point: properties apart from any model, two of them metamorphic; expected rows are table lookups (9.3)                                                               |

Debt, handled one by one: a computed Effect Schedule is planned again from the memory at wake (question 7); a
refused start is retried only at a wake or a later start cause, which costs I6 an exception (question 8).

## 4. Model

### 4.1 State inventory

"Saved" says how each state survives a reload (CS lesson 1.6.3). The type at each reader is in section 10.

| State                          | Values                                                  | Owner and only writer                                 | Readers                                             | Saved                                     |
| ------------------------------ | ------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------- | ----------------------------------------- |
| key set (keyed schedule)       | the timers' keys, in key-text order                     | `decide`, table Keys                                  | every table; snapshot; due order                    | as the timers; re-read at wake            |
| `keys` outcome                 | `Clean`, `Failed`                                       | `decide`, table Keys                                  | `scheduleIssues`                                    | no: re-read at wake                       |
| `selection` (per timer)        | `Read(v)`, `Failed(f, last v)`; `v` may be `Unselected` | `decide`, table Selection                             | table Selection; `scheduleIssues`                   | whole: value and failure                  |
| `reasons` (per timer)          | `Read(list)`, `Failed(f, last list)`                    | `decide`, table Reasons                               | table Timing; snapshot `pausedBy`; `scheduleIssues` | its value; the failure is re-read at wake |
| `arming` (per timer)           | `Idle`, `Refused(f)`, `Armed(run)`                      | `decide`, table Arming                                | table Timing; firing guard; snapshot; issues        | whole, but the two live fields            |
| run timing                     | `Due(dueAt)`, `Held(left)`                              | `decide`: Arming makes it `Due`; only Timing moves it | alarm view; snapshot; due order                     | whole                                     |
| run cursor (live)              | `Once`, `Stepping(series, output)`, `Broken(f)`         | `decide`, table Arming; `wake`                        | the next step; firing metadata; issues              | no: `reads.resume` at wake                |
| arming id (live)               | branded `ArmingId`                                      | `decide`, from the mint                               | firing guard; alarm and cursor views                | no: minted again at wake                  |
| `firing` (per timer)           | `Clean`, `Failed(f)`                                    | `decide`, table Firing                                | `scheduleIssues`                                    | whole                                     |
| host alarm; host series cursor | at most one per live arming                             | the applier; the host stepper (views, 6.8)            | the driver; the due index; the next-step read       | no: views of `Armed` runs                 |
| schedule issues                | derived                                                 | none: `scheduleIssues` reads                          | snapshot, inspection, Stories                       | no: derived                               |

### 4.2 Callback inputs

Every input of every user callback, and the occasion that hears a change in it (P7). Each callback receives
exactly these inputs. Today `readOf` hands one record with `now` and the context to all of them
(`schedules.ts:84-92`), though only the delay's public type has `now` (`src/tokens.ts:241-282`); that leak goes.

| Callback               | Inputs                             | Read on                                                    | A change reaches it by                                                                                        |
| ---------------------- | ---------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `keys`                 | memory, lanes                      | every occasion                                             | `Turn` (memory), `Lanes`; `Wake` re-reads                                                                     |
| each reason            | key, memory, context, props, lanes | every occasion                                             | `Turn`, `Context`, `Lanes`; `Wake` re-reads                                                                   |
| `restartOn`            | key, memory, context, props        | `Turn`, `Context`; every occasion while it has no baseline | `Turn` (memory, props), `Context`; after a `Wake` the owner raises `Context` if context or props differ (6.7) |
| `schedule` (the delay) | key, memory, context, props, now   | a start; `resume` at wake                                  | read once per start; no later change is tracked (@plan.Machines.O5)                                           |
| the send mapper        | the firing's metadata              | a firing                                                   | not applicable                                                                                                |

`keys` and the reasons are level checks: every occasion reads them, so no occasion can skip a change in them.
`restartOn` is the one edge check: it compares with a baseline. `props` is BC's planned input.

### 4.3 Representation types

Target: TypeScript with Effect data types (`Data.TaggedEnum`, `Schema`, `Result`, `Brand`; `Option` for inputs
only). No `Option` stands for a stored state; each lifecycle is a tagged union.

```ts
// existing: ArmingId, ActivationId, Failure, Series, Canonical     CHANGED: Tracked, Run, Timing, TimerKey
// NEW: KeyText, Outcome, Checked, Selection, Cursor, Arming, Scheduled, Live, Decided     parameters: Key, Why
type KeyText = string & Brand.Brand<"flow-state/KeyText">; // canonical text of the encoded key: identity and order
type TimerKey<Key> = { readonly text: KeyText; readonly value: Key }; // CHANGED: text branded, value generic
type Decided = Brand.Brand<"flow-state/Decided">; // its constructor is private to schedule-decision.ts
type Outcome = Data.TaggedEnum<{ Clean: {}; Failed: { failure: Failure } }>;
type Checked<A> = Data.TaggedEnum<{ Read: { value: A }; Failed: { failure: Failure; last: A } }>; // SI
type Selection = Data.TaggedEnum<{ Unselected: {}; Selected: { text: Canonical } }>; // Unselected: no baseline yet
type Timing = Data.TaggedEnum<{ Due: { dueAt: number }; Held: { left: number } }>; // CHANGED: no host timer id
type Stepping = { series: Series; output: unknown };
type Cursor = Data.TaggedEnum<{ Once: {}; Stepping: Stepping; Broken: { failure: Failure } }>;
type Live = { readonly arming: ArmingId; readonly cursor: Cursor }; // not saved; re-derived at wake
type Run = Live & { readonly armedAt: number; readonly attempt: number; readonly timing: Timing }; // CHANGED
type Arming = Data.TaggedEnum<{ Idle: {}; Refused: { failure: Failure }; Armed: { run: Run } }>;
// CHANGED: one timer. Its type is the decoded side of the record's Schema (6.6), with `Live` beside a saved run.
type Tracked<Why extends string> = Decided & {
  readonly selection: Checked<Selection>;
  readonly reasons: Checked<ReadonlyArray<Why>>;
  readonly arming: Arming;
  readonly firing: Outcome;
};
// NEW: one schedule's state in one scope. An unkeyed schedule has exactly one timer and no keys check.
type Scheduled<Key, Why extends string> = Decided & Data.TaggedEnum<{
  Single: { timer: Tracked<Why> };
  Keyed: { keys: Outcome; timers: ReadonlyMap<KeyText, { readonly key: TimerKey<Key> } & Tracked<Why>> };
}>;
// CHANGED: the owner's map. A scope is one activation (a state's, or an instance's), minted on entry.
type Schedules = ReadonlyMap<ActivationId, ReadonlyMap<string, Scheduled<Values, string>>>;
```

- **Unwritable:** an unkeyed schedule with two timers or a `keys` failure; two timers of one key; a timer armed
  and refused, or held with no run; a baseline of unknown type; a stored schedule issue (`Incarnation.issues`
  holds `StoredIssue`, SI); a host timer id inside a timer; a timer built outside `schedule-decision.ts`; the
  state of an ended activation found under the current one.
- **Still writable, guarded by one writer and I3:** a `Held` run whose reasons are empty.
- **Stored though derivable, a stated trade:** `Stepping.output`, which a replay to `attempt` gives back in
  O(attempt). `output` and `Series` stay opaque. `Keyed.timers` iterates in key-text (code-unit) order.

## 5. Operations

An occasion is what one schedule hears. Its payload is data; nothing in it was written to a timer beforehand.
Section 12 lists each writer that became an input.

```ts
// existing: decide, Occasion, Turn, Context, Lanes, Reads, Seen, Schedule
// RENAMED: Fired -> Settled, Restore -> Wake     NEW: wake, Env.mint, Reads.resume, Started, First, Next
// CHANGED: Turn drops `exited`, renames `armed` to `started`; Firing carries `arming` and `next`; no `adds`
decide<Key, Why>(schedule: Schedule<Key, Why>, before: Option<Scheduled<Key, Why>>, occasion: Occasion,
                 env: Env<Key, Why>)
  : { after: Scheduled<Key, Why>; raised: ReadonlyArray<Raised<Key>>; seen: ReadonlyArray<Seen<Key>> }
wake<Key, Why>(schedule: Schedule<Key, Why>, saved: Option<SavedScheduled>, env: Env<Key, Why>) // decode, then Wake
  : { after: Scheduled<Key, Why>; raised: ReadonlyArray<Raised<Key>>; seen: readonly [] }
type Env<Key, Why> = { reads: Reads<Key, Why>; now: number; mint: () => ArmingId };

type Occasion = Data.TaggedEnum<{
  Turn: { disarmed: boolean; started: Started; fired: Option<Firing> }; // a committed turn in its live scope
  Context: {}; // context or props changed outside a turn of this scope
  Lanes: {}; // a lane moved
  Settled: { firing: Firing; refusal: Option<Failure> }; // this schedule's firing, whose send did not commit
  Wake: {}; // restore, thaw, a use returning, hydration: silent
}>;
type Started = Data.TaggedEnum<{ No: {}; Given: { first: First } }>; // the turn's own arm, checked before commit
type First = Data.TaggedEnum<{ Complete: {}; Starts: { ms: number; cursor: Cursor } }>;
type Firing = { readonly arming: ArmingId; readonly next: Next }; // names the arming; the next delay is data
type Next = Data.TaggedEnum<{ Done: {}; Again: { ms: number; output: unknown }; Over: {} }>;

// values are decoded by the schedule's codecs (section 10); each callback gets only its inputs (4.2)
type Reads<Key, Why> = {
  keys: () => Result<ReadonlyArray<TimerKey<Key>>, string>; // decoded by the key Schema, repeats dropped
  selection: (key) => Result<Selection, string>; // encoded by the selection codec
  reasons: (key) => Result<ReadonlyArray<Why>, string>; // declaration order; no `paused`: []
  first: (key) => Result<First, string>;
  resume: (key, armedAt: number, attempt: number) => Result<Cursor, string>; // a saved run's cursor
};
```

- `before` is `none` exactly when the scope's activation has no entry for the schedule: its state just began, or
  the record lacks it. `after` is the only new state; an unchanged timer or schedule is the same object.
- There are no failures: a callback that throws is a value in `Reads` (the slot that threw) and lands in its own
  field. `resume` gives `Once` for a Duration, and for a series that ends before `attempt`.
- `Given` occurs only for an unkeyed schedule: `armOn` on a keyed one is a construction error
  (`src/compile-schedules.ts:80-88`). Its `first` cannot be a failure: a turn's own arm with a bad delay refuses
  the turn before any occasion exists (question 5).
- A firing names an arming, not a key, so a new, restarted or removed timer cannot be taken for the one that fired.

## 6. Rules: the transition tables

One decision handles one schedule on one occasion. For each timer the fields are decided in this order: Keys,
Selection, Arming, Firing, Reasons, Timing. Every table runs on every occasion, `Settled` included. `p` is a
field's value before: `Read(v)` gives `v`, `Failed(f, last)` gives `last`. "This timer's firing" means the
occasion's `Firing.arming` is the arming id this timer had before the decision.

### 6.1 Keys

| `keys` read                   | Timers after                                                            | `keys` outcome |
| ----------------------------- | ----------------------------------------------------------------------- | -------------- |
| lists `L`                     | for each key in `L`: its timer before, else a new one; the rest go      | `Clean`        |
| throws, or a bad key or shape | the timers before, unchanged in membership (none when `before` is none) | `Failed`       |
| unkeyed schedule              | its one timer before, else a new one                                    | not applicable |

A new timer is `{ selection: Read(Unselected), reasons: Read([]), arming: Idle, firing: Clean }`. A timer that
goes takes every field with it (SI's P1); the applier releases its arming. A throwing `keys` keeps the key set,
removed keys included, until it reads again; its issue shows meanwhile.

### 6.2 Selection

`compares` is true when the schedule declares `restartOn` and either `p` is `Unselected` or the occasion is `Turn`
or `Context`. `restarts` is true when the occasion is `Context`, or a `Turn` that does not disarm.

| `compares` | `restartOn` read              | `selection` after   | Start cause        |
| ---------- | ----------------------------- | ------------------- | ------------------ |
| no         | not run                       | unchanged           | none               |
| yes        | throws                        | `Failed(f, last p)` | none               |
| yes        | `v`, `p` is `Unselected`      | `Read(v)`           | none: a first read |
| yes        | `v` same as `p`               | `Read(v)`           | none               |
| yes        | `v` differs, `restarts`       | `Read(v)`           | restart            |
| yes        | `v` differs, a disarming turn | `Read(v)`           | none: silent       |

- **S-3:** a first clean read is never a change, whenever it comes. A throw keeps `Unselected`.
- **S-6:** a timer with no baseline is still being created, so every occasion reads it, a lane change included.
  Reading it later would lose the restart of a selection that changes in the next turn.
- **S-1, and one rule for every occasion that does not compare** (`Lanes`, `Settled`, `Wake`): it leaves the
  baseline alone, so nothing is skipped; the change is still there for the next `Turn` or `Context`. A lane move
  or a settled firing changes no input of `restartOn`. A `Wake` may follow a change made while the scope slept,
  so the owner raises `Context` after it when context or props differ from what the scope last heard (6.7). A
  restore's owed context wave (`context.ts:378-394`) is one case of that rule; a thaw is the other.
- "Same" is one rule: equal canonical texts of the encoded selection (section 10, X-5).

### 6.3 Arming

The first row that matches wins. A start cause is any of: `Turn.started` is `Given`; table Selection said
restart; the timer is new and its schedule is keyed or arms on entry; the occasion is `Wake` and the arming is
`Refused` (SI's P2; question 8 would make it any occasion).

| #   | Condition                                | First step or next step    | `arming` after                                             |
| --- | ---------------------------------------- | -------------------------- | ---------------------------------------------------------- |
| A1  | `Turn.disarmed`                          | not read                   | `Idle`                                                     |
| A2  | a start cause                            | `Starts`                   | `Armed`: new id, `armedAt` now, attempt 0, `Due(now + ms)` |
|     |                                          | `Complete`                 | `Idle`                                                     |
|     |                                          | fails `f`                  | `Refused(f)`; an armed run's time left is dropped          |
| A3  | the occasion carries this timer's firing | `next` is `Again`          | same id, attempt + 1, `Due(now + ms)`                      |
|     |                                          | `next` is `Done` or `Over` | `Idle`                                                     |
| A4  | none of the above                        | not read                   | unchanged                                                  |

- The first step is `Turn.started.first` when the turn gave one, else `reads.first(key)`. A delay is at least 0
  (`inRange`, `schedule-plan.ts:80-83`); the next delay counts from now, the actual firing.
- Impossible cell, named: a firing whose arming id matches no timer of the schedule. The owner drops a firing
  whose arming is not live and due; if one reaches `decide`, no row matches and nothing changes.
- A disarm wins over every start in the same turn, a new key and an entry included (T57's 11:47:53Z ruling), and
  ends a `Refused` arming with its issue (SI). It is an event, not a state: `Idle` after a disarm is the same
  `Idle` as after a last step, and a later start cause arms it (the debounce of @plan.Machines.O5).
- A start wins over the firing's next step: a restart or an `armOn` in the firing's own turn begins at step one.
  A `Broken` cursor's next step is `Over`: the run fires at its deadline once, and row A3 ends it.

### 6.4 Firing, Reasons and Timing

**Firing.** The first row that matches wins. It runs after Arming, so a start that arms settles it. One failure
is kept, the step past the limit before the refusal; both are in the trace. A send that is neither committed nor
refused (an unhandled or denied event) is the machine's answer, not a failure of the schedule.

| #   | The occasion                                        | `firing` after                  |
| --- | --------------------------------------------------- | ------------------------------- |
| F1  | row A2 armed this timer                             | `Clean`                         |
| F2  | carries this timer's firing, `next` is `Over`       | `Failed(InvalidTurn, its slot)` |
| F3  | `Settled` for this timer's firing, with a refusal   | `Failed(the refusal)`           |
| F4  | `Turn.fired` is this timer's firing                 | `Clean`                         |
| F5  | anything else, a `Settled` with no refusal included | unchanged                       |

**Reasons,** for every timer, armed or not. A new timer's `p` is `[]`, so a reason that throws on its first read
does not hold the timer (question 2).

| Reasons read | `reasons` after     |
| ------------ | ------------------- |
| list `r`     | `Read(r)`           |
| throws `f`   | `Failed(f, last p)` |

**Timing,** for every `Armed` timer, last. `v` is the value of `reasons` after table Reasons. This is `timed`.
Table Arming creates a run as `Due`; `timed` is the only place a run moves between `Held` and `Due`, so a new
run under holding reasons keeps its full delay.

| Timing before | `v`       | Timing after                | Evidence (none on `Wake`) |
| ------------- | --------- | --------------------------- | ------------------------- |
| `Due(dueAt)`  | empty     | unchanged                   | none                      |
| `Due(dueAt)`  | not empty | `Held(max(dueAt - now, 0))` | `Paused`                  |
| `Held(left)`  | not empty | unchanged                   | none                      |
| `Held(left)`  | empty     | `Due(now + left)`           | `Resumed`                 |

### 6.5 The decoder: saved state against the current definition

`wake` decodes per entry, then runs `decide` with `Wake`. Nothing is invented by the decode. The last row
replaces T56's "every timer read as `dueAt`" (`wiki/tasks/V3/P4.task:373-375`), wrong for a format with `left`.

| Saved against the definition                                                    | Decode                                                                                   | After `Wake`                                                                                                   |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| schedule not declared in an active scope                                        | entry dropped                                                                            | no timer                                                                                                       |
| schedule declared, no saved entry                                               | `none`                                                                                   | new: a keyed key or an entry arming starts with its full delay; any other stays `Idle`                         |
| keying changed, or a key the declared key Schema does not read                  | that entry or timer dropped                                                              | as no saved timer: a listed key is new and starts, a disarmed one included (question 9)                        |
| a key `keys` no longer lists                                                    | kept                                                                                     | removed by table Keys                                                                                          |
| a saved reason name that is not declared (S-7)                                  | that name dropped                                                                        | reasons read fresh; Timing frees a hold (B1)                                                                   |
| a reason added                                                                  | nothing                                                                                  | read fresh; holds silently if true                                                                             |
| a selection the declared codec does not read, or `restartOn` no longer declared | `Read(Unselected)`                                                                       | the first read is silent                                                                                       |
| `restartOn` edited                                                              | kept                                                                                     | unchanged; the next turn or wave compares                                                                      |
| a saved `firing` failure                                                        | kept                                                                                     | unchanged                                                                                                      |
| `Refused`                                                                       | kept                                                                                     | row A2 tries the start again                                                                                   |
| `Armed`, `reads.resume` gives a cursor                                          | that cursor, a new arming id                                                             | timing by table Timing                                                                                         |
| `Armed`, `reads.resume` throws `f`                                              | cursor `Broken(f)`, timing kept                                                          | the issue shows now; the run fires at its saved deadline, then ends with F2; a later wake reads `resume` again |
| a format 5 timer                                                                | step: `dueAt` to `Due`, `left` to `Held`, neither to `Idle`, no baseline to `Unselected` | as the rows above                                                                                              |

### 6.6 The saved form

One Schema is the source of both sides: its encoded side is the record, and `Tracked`'s type is its decoded side
with `Live` added to a saved run. A field added to a timer is added to the Schema or does not exist.

```ts
// CHANGED: SavedTimer is the Schema of a timer, not a name and six optional fields (`vocabulary.ts:89-98`)
SavedTimer = {
  key?: encoded key,                      // by the declared key Schema
  selection?: canonical text,             // absent: Unselected
  selectionFailed?: { code, slot },       // absent: Read
  reasons?: ReadonlyArray<string>,        // the value of `reasons`; absent: []
  arming: Idle | Refused { code, slot } | Due { armedAt, attempt, dueAt } | Held { armedAt, attempt, left },
  firing?: { code, slot },                // absent: Clean
}
SavedScheduled = { [name]: SavedTimer | ReadonlyArray<SavedTimer> }   // keyed: a list in key-text order
```

Every timer of the scope is saved, idle ones included: an idle timer with a baseline is the debounce a reload
must not forget, so `savedTimersOf`'s filter and its `armsOnEntry` scan go (AR SR-7). What is not saved, and how
each comes back, is 4.1's last column. Activation ids are not saved: the record holds each scope's schedules by
its state path, and `wake` files them under the new activation. `Refused`, `firing` and a failed selection save
their failure, where SI saved a marker. [proposed] The JSON spelling, the format number and the step are cluster 3's.

### 6.7 Scope lifecycle onto occasions (problem 6, X-2)

`decide` is scope-blind. A scope is one activation: a state's, or an instance's. The owner translates scope
events; the occasion list stays five.

| Scope event                                                                                                | Owner does                                                           | Occasion                                         |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------ |
| state entered, creation, instance start, reset's start, a copy appears                                     | a new activation id, so `before` is `none`                           | `Turn`                                           |
| state exited, instance end, reset's end, a copy leaves, actor end                                          | drops the activation's entry, releases its armings                   | none                                             |
| a committed turn of the actor: event, raise, ending, props, a firing's send                                | names what it disarmed and started in each scope                     | `Turn`, for every live scope                     |
| context changed outside a turn; or, after a `Wake`, context or props differ from what the scope last heard | nothing                                                              | `Context`                                        |
| a lane moved, a denied or unhandled ending's admission included                                            | nothing                                                              | `Lanes`                                          |
| a firing whose send did not commit                                                                         | nothing                                                              | `Settled` for its schedule; `Lanes` for the rest |
| freeze, the last use released, the page hidden                                                             | clears the scope's alarms; no timer changes                          | none                                             |
| thaw, restore, a use returning, hydration                                                                  | decodes (restore only); after the decision, overdue timers fire once | `Wake`, then `Context` by the rule above         |

- **Re-entry is exit then entry:** a new activation id, no `exited` flag, nothing to inherit (S-2).
- **Asleep is not a timer state.** A frozen or unused scope keeps `Due(dueAt)`; time counts (@plan.Machines.O5).
  FR:324 holds a frozen timer instead (question 9). **Props are root-wide** (FR:89): a `Turn` for every scope.
- **Lanes are not a row of the turn.** They follow lane movement (`firings.ts:95-105`), so TP's rule that a
  denied turn runs no later row does not conflict with the Plan's lane re-check.
- **Scoped `armOn` and `disarmOn`** are resolved by the walk (TP PD4 is open, TP:380; either answer gives the
  same inputs here). **A firing is one synchronous step** (`firings.ts:37-68`): nothing commits between reading
  `next` and the send's turn, and the arming id in `Firing` makes a break of that visible instead of wrong.

### 6.8 Views: alarms, cursors, issues, due order

- **Alarm:** an awake scope has one alarm per `Armed(Due)` run, identified by its arming id and its `dueAt`, and
  no other. The applier sets the difference after each pass. An arming id present before and absent after is
  released: its alarm and its host cursor go together.
- **Host cursor:** a cache keyed by arming id. A first step is taken on a fresh step function and kept nowhere, so
  a refused turn leaves nothing behind (S-8). A later step replays from `armedAt` on a miss; replayed steps read
  `armedAt` as their time (`src/host/owners/schedule-steps.ts:28-40`).
- **Issues:** `scheduleIssues(schedule, scheduled)`: the `keys` failure, then per timer the first of `firing`,
  `selection`, the arming (`Refused`, or a `Broken` cursor), `reasons` (SI's order).
- **Due order (I32):** deadline, actor admission, scope order (outermost first), declaration order, key text in
  code-unit order. Each firing is its own turn, and a turn may restart, hold or remove a timer whose firing was
  already queued: that firing is dropped by the arming-id guard.
- **Overdue:** `Armed(Due)` with `dueAt <= now`. After a `Wake` the owner fires each once in due order.

## 7. Algorithm

Conceptual pseudo-code. `decide` is the six tables in order. Three things the tables do not say: `mine` (this
timer's firing) is judged before table Arming changes the arming; a start cause is computed once, from table
Selection's result; `raised` lists the failures met in the order firing, keys, `restartOn`, arming, reasons.

```ts
wake(schedule, saved, env):                           // the only reader of SavedScheduled; table 6.5
  before = saved decoded per entry; each Due or Held run gets arming: env.mint() and
           cursor: env.reads.resume(key, armedAt, attempt), or Broken(f) when resume throws
  return decide(schedule, before, Wake, env)          // `seen` is empty: Wake records no evidence

pass(scope, occasionOf):                              // the owner: one per scope per occasion (`schedules.ts`)
  declared = compiled.schedulesAt(scope)              // precomputed per state; no allocation
  mine = schedules.get(scope.activation)              // none for an activation minted on this occasion
  if declared is empty and mine is none: return
  for schedule in declared:
    { after, raised, seen } = decide(schedule, mine?.get(schedule.name), occasionOf(schedule), env)
    record seen as evidence and raised in the trace (tx.refuse); neither is state
  reconcile(scope); the same map is kept when nothing changed

ended(scope) = drop the activation's entry and release its armings        // exit, instance end, actor end
reconcile(scope):                                     // alarms and cursors are views (6.8)
  release each arming id present before and absent after
  awake: set an alarm for each Armed(Due) whose (arming, dueAt) has none; asleep: clear the scope's alarms
sleep(scope) = clear the scope's alarms               // freeze, last use released; no timer changes
woke(scope)  = pass(scope, Wake), reading saved state through `wake` on a restore;
               then pass(scope, Context) if context or props differ from what the scope last heard;
               then enqueue a firing for each overdue Armed(Due) timer, in due order

fire(mail):                                           // `firings.ts`; one synchronous step, no write before the send
  (timer, run) = the live, due arming the mail names, else drop the mail
  next = run.cursor is Once ? Done : run.cursor is Broken ? Over
       : host.step(run.arming, run.cursor.series, run.attempt + 2) as Again, Done, or Over when it throws or
         its delay is out of range
  sent = the send as a turn of the actor, carrying fired = { arming: run.arming, next }   // a throwing mapper
  if not sent.committed:                                                                  // refuses that turn
    pass(scope, schedule => schedule is the fired one ? Settled({ firing, refusal: sent.refused }) : Lanes)
```

A decision returns or throws a defect; a defect leaves the scope as it was, because `pass` installs the new map
last. The mint advances even when a result is discarded; arming ids need only be unique.

## 8. Invariants

Each is a predicate over the representation, traced to a property of section 2. A new timer satisfies I1 to I4.
Each table writes one field and reads only fields decided before it, so I7 and I10 hold by the tables' shape; I3
holds because Timing runs last, for every armed timer, on every occasion.

| Id  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                     | From |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| I1  | Owed implies armed or reported: a timer owed a firing is `Armed`, or an issue shows for it or its schedule. Owed: a start cause occurred and none of these since: its last step (`Done` or `Over`), a disarm, its scope's end, its key leaving, or its saved timer dropped by a definition edit (6.5)                                                                                                         | P1   |
| I2  | Not owed implies not armed                                                                                                                                                                                                                                                                                                                                                                                    | P2   |
| I3  | Held exactly by its reasons: an `Armed` run is `Held` if and only if the value of `reasons` is not empty; when the reasons read clean on this occasion, that value is what they read                                                                                                                                                                                                                          | P6   |
| I4  | A failed check is a failed field: a check that ran and threw has its field `Failed`; one that ran clean has it `Read` or `Clean`. The shown issues are `scheduleIssues` of the state, by construction                                                                                                                                                                                                         | P5   |
| I5  | The clock run out fires each armed timer at most once: one that is still armed, due and unheld when its own firing is served, in the due order of 6.8, and nothing else                                                                                                                                                                                                                                       | P2   |
| I6  | A reload equals a quiet occasion: under the same build, `wake(encode(s))` equals `decide(s, Lanes)` with no input changed and no evidence, but for arming ids, and but for a `Refused` timer, which a wake retries (question 8 removes that exception). As a sequence property: replacing a reload by a lane move that changes nothing changes no later view. Needs no model                                  | P3   |
| I7  | Timers do not touch each other: a timer's state after an occasion is a function of its own state before, the occasion and its own reads                                                                                                                                                                                                                                                                       | P8   |
| I8  | One writer: only `schedule-decision.ts` can construct `Tracked` or `Scheduled` (the `Decided` brand); a cast around it is already a lint error                                                                                                                                                                                                                                                                | P4   |
| I9  | Host views match: alarms equal the `Armed(Due)` runs of awake scopes, by arming id and `dueAt`; host cursors are a subset of live arming ids                                                                                                                                                                                                                                                                  | P2   |
| I10 | A throwing check is a read of its last value. For `keys`, `restartOn` and the reasons: the decision where the check throws equals the decision where it reads its previous value (a new timer's is the neutral one), in every field but that check's own tag. The delay is not such a check: a first step that throws refuses the start, and a next step that throws ends the series (both are today's rules) | P4   |
| I11 | The record is the state: every saved timer decodes to exactly one arming shape; `decode(encode(t))` equals `t` but for `Live`                                                                                                                                                                                                                                                                                 | P3   |
| I12 | Time is conserved: a firing happens at its start plus its delay plus the time its run was `Held`, never earlier; later only while its scope was asleep                                                                                                                                                                                                                                                        | P6   |
| I13 | Every change is compared: after any occasion, a timer's baseline differs from what `restartOn` would read now only if a `Turn` or `Context` for its scope is already owed (6.7's rule), or its read throws                                                                                                                                                                                                    | P7   |

## 9. Checks

### 9.1 Three levels

| Level              | What runs                                                                                                      | Alphabet and size                                                     | Catches                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 0 Pure, complete   | `decide` and `wake`, one schedule, over every reachable state of the two-key fixture, breadth first to closure | the atoms of 9.2 on abstract time; about 50,000 state and world pairs | F2 and the tables' part of F3, for sequences of any length. Not owner faults: `before` is given |
| 1 Stories, depth 3 | every 3-step sequence through public Stories and the snapshot, as `tests/turn/schedule-sequences.test.ts`      | 29 atoms: 24,389 rows, plus the named rows                            | F1, F5, F7, the owner and the seams: snapshot, record, alarms, two schedules                    |
| 2 Stress           | every 4-step sequence, and seeded walks of 12                                                                  | 707,281 rows behind `FLOW_STRESS`                                     | depth                                                                                           |

**Level 0 was run on this design** as a scratch model of the tables, outside the repository (a Sonnet sidecar).
The closure completed in 5 to 12 seconds: 22,464 pairs for a Duration and 52,608 for a two-step series. I1 to
I5, I7, I10 and I13 held at every pair; the pseudo-code and the tables never disagreed; seven of eight seeded
faults were caught, and the eighth needed an atom that is now in 9.2. I6 held only with its `Refused` exception
under the standing retry rule, and with no exception under question 8's A. A next step past the limit and a
throwing `resume` were not exercised.

### 9.2 The alphabet, from the inventory

Every writer, occasion and callback input of section 4 appears. Two instances: two keys of `t`, and a second
schedule `u`. Bold atoms are new: 20 existing plus 9. An edited build stays in force for the rest of its row.
Freeze and thaw share `Wake`'s rows; their atoms join with cluster 2's instances. A build that fixes a delay, a
next step past the limit and a delay that throws at a wake are one-shot Stories, not atoms.

| Inventory item                    | Atoms                                                                                                                 |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Keys                              | `bad` appears; `bad` appears out of range; `bad` leaves; keys throw                                                   |
| Reasons, per key                  | A true, false, throws, for `good` and for `bad`                                                                       |
| Selection                         | selection changes; throws; reads again; **context changes the selection**; **`Stop` with a changed selection**        |
| Firing, `Settled`                 | sends refused; sends accepted                                                                                         |
| Arming A1; exit and entry         | `Stop`; **`Stop` while `bad` appears**; re-entry                                                                      |
| firing, Arming A3                 | a minute passes: fires every due timer, `bad` before `good`                                                           |
| `Wake`, 6.5                       | reload; reload without `paused`; **reload with A renamed**; **reload after the context selection changed while away** |
| `Lanes`                           | **a lane moves and lists `bad`**; **a lane moves and drops `bad`**                                                    |
| `Turn.started`, a second schedule | **`Go`** arms the unkeyed `u` (`armOn`, reason B, two steps); **B true**                                              |

### 9.3 The oracle (problem 5)

Two parts, reported apart, so a wrong model rule cannot hide a broken property. **Properties** I1 to I7, I12 and
I13 are checked on every row from the snapshot, the world the test wrote and a five-line ledger of owed firings;
I6 and I7 compare two runs of the runtime with each other. **Expected views** are looked up in the tables of
section 6 held as data, one row per cell: no second implementation. `tests/turn/schedule-ledger.ts` is amended
before any code:

| Ledger today                                                         | Amendment                                          | Rule     |
| -------------------------------------------------------------------- | -------------------------------------------------- | -------- |
| `:188-195` drops every baseline at restore                           | restore keeps the selection, value and failure     | 6.2, 6.5 |
| `:175` a new timer inherits its key's last reasons across a re-entry | a new timer's reasons start at `[]`                | 6.4, F5  |
| `:148` restore clears `firingFailed` and `selFailed`                 | restore keeps both                                 | 6.6      |
| no context, lane, `Go`, disarm-with-change or edited-reload step     | the nine new atoms                                 | 9.2      |
| 375 lines of model                                                   | replaced by the cell data and the five-line ledger | F7       |

**Recounting the 365 red rows.** The count is an output, not a kept list: (1) amend the oracle and review it by a
blind derivation of 30 rows; (2) run all rows on today's code with a reporter that records, per failing row, the
first broken property or "table only", with no `it.fails`; (3) rows red for "table only" are read by a reviewer
before they count; (4) during the build an inverted row asserts its recorded breach id, and at the close the red
set is empty and the file is deleted (T118's amended acceptance 1).

### 9.4 Named rows and the Story of the wrong ending

Fixture as today: `t` keyed by `good` and `bad`, one minute, reason A per key, `restartOn` reading one number,
`disarmOn: [Stop]`, `bad`'s delay out of range while `far`. Letters are the ledger's.

| Row                                                                            | Ends                                                                                                        | Rule                 |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | -------------------- |
| `plsk` Stop / selection throws / reload / selection changes                    | `good` restarts and fires once: the reload kept the baseline                                                | 6.2, 6.5; S-1        |
| `lapk` selection throws / `bad` appears / Stop / selection changes             | `good` restarts and fires; `bad` takes its first clean read silently and stays idle                         | 6.2 row 3; S-3       |
| `nroa` sends refused / minute / sends accepted / `bad` appears, then the clock | `bad`'s committed firing leaves `good`'s send issue in place                                                | F3, F5; I7           |
| `etk` A `good` true / reload without `paused` / selection changes              | the hold resumes at the reload; the record decodes; one firing                                              | 6.5 row 5, Timing    |
| B2 `bad` out of range / A `bad` throws / A `bad` false                         | the arming issue shows throughout                                                                           | A2, Reasons          |
| A `good` true / A `good` throws / re-entry                                     | a new timer, armed, due, with the reason's issue; fires at 60 s                                             | F5; question 2       |
| `bad` out of range / `bad` appears / reload                                    | `bad` stays `Refused` until the reload, then arms and fires (under question 8 A it arms at the second step) | A2; S-5; question 8  |
| reload after the context selection changed while away                          | the owed wave restarts `good` once                                                                          | 6.2, 6.7; question 4 |
| `u` armed on a series, reload where its delay throws (one-shot)                | `u` keeps its deadline with its issue showing, fires once, then is idle with the firing's issue             | 6.5; I1              |
| created with `u`'s entry delay out of range (one-shot)                         | `Refused` with its issue, not a Creation issue                                                              | A2; S-4              |

**The Story: "the sign-out that never comes back."** An idle sign-out: `restartOn` reads the activity counter, a
playing video disarms it (`Stop`). The activity payload turns unreadable for one event (`restartOn` throws), the
page reloads, and the user is active again. Right ending: the timer restarts and signs the user out after the
idle delay. Wrong ending today: no baseline is saved, the reload's re-read throws, the next value is taken
silently, and the session never signs out, with no issue shown. It is `plsk` on a fixture a reviewer can read.

### 9.5 Planted faults

The nine existing plants on code that goes (AR 1.4) are re-pointed to the rows below: the two `check-issue-*`
plants to table Selection, `firing-clears-every-key` and `firing-keeps-own-issue` to table Firing,
`last-issue-wins` to `scheduleIssues`' order, `paused-ignored` and `restore-keeps-stale-hold` to table Timing,
`throwing-reason-runs-new-run` and `idle-forgets-reasons` to table Reasons.

| Fault                                                             | What it plants                                                                                    | Caught by                                                 |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `selection-dropped-at-wake`                                       | the decoder gives `Unselected` for a saved selection                                              | I6, `plsk`                                                |
| `first-read-restarts`                                             | `Unselected` counts as a change                                                                   | I2, `lapk`                                                |
| `wake-rebases`, `no-wave-after-wake`                              | `Wake` runs `restartOn` for a timer with a baseline; the owner skips the `Context` after a `Wake` | the row "reload after the context selection changed"; I13 |
| `refused-start-goes-idle`                                         | row A2's failure gives `Idle`                                                                     | I1, B2                                                    |
| `refused-not-retried-at-wake`                                     | `Wake` with `Refused` is not a start cause                                                        | the row `bad` out of range / `bad` appears / reload       |
| `broken-resume-restarts`                                          | a throwing `resume` decodes to `Refused`                                                          | the row "`u` armed on a series"                           |
| `hold-skipped-without-reasons`, `restore-keeps-undeclared-reason` | table Timing skipped when no reason is declared; the decoder keeps an undeclared name             | I3, `etk`                                                 |
| `reason-read-touches-arming`                                      | table Reasons writes the arming                                                                   | I10                                                       |
| `reentry-finds-old-state`                                         | the owner looks a re-entered state up by name, not by activation                                  | the re-entry row (Level 1)                                |
| `disarm-loses-to-new-key`                                         | row A2 runs before A1                                                                             | the atom `Stop` while `bad` appears; I2                   |
| `next-step-applied-twice`, `firing-matched-by-key`                | the owner writes the next step too; row A3 matches by key                                         | I5, I12; Level 0                                          |
| `firing-clears-other-key`                                         | table Firing writes every timer of the schedule                                                   | I7, `nroa`                                                |
| `alarm-kept-after-arming-ends`, `alarm-missed-for-next-step`      | the applier skips the release, or compares ids and not `dueAt`                                    | I9, I5                                                    |
| `ties-by-insertion-order`                                         | due order drops the key-text step                                                                 | I5                                                        |
| `schedule-issue-stored`, `timer-built-outside`                    | type pins: a `Schedule` source in `Incarnation.issues`; a `Tracked` literal in another file       | the types                                                 |

## 10. Types

**Today the erased core meets the typed edge in two steps, and neither is typed.** `machine` casts the whole body
to `AnyBody` (`src/machine.ts:170-173`, called at `:325`); then `scheduleOf` (`src/compile-schedules.ts:123`)
wraps each callback with `erase`, whose input type is `never` (`src/handles.ts:27-30`), so it checks nothing. The
public types are re-written by hand on the other side (`src/tokens.ts:223-339`): CS 3.3's first two carriers.

**The design: one point, derived from `D`.** The compiled schedule, `Schedule<Key, Why>`, is built by one generic
function from the declaration and the typed body entry. It holds the three codecs and the callbacks already
decoded. Inward, `Reads<Key, Why>` is built from it: a value that does not fit its codec is that check's
failure. Outward, the snapshot's timers and issues, the evidence and the record are projected by generic
functions over the same `Key` and `Why`. No field is cast. Today the container (`Incarnation`, `Compiled`) is
erased, so the schedule types are instantiated at `Values` and `string`; when it becomes generic in `D`, they
flow with no change.

Each fact has one source, the declaration (CS lesson 3.6.1), and each requirement an owner (lesson 3.6.6). None
designs the type-level means. The Declared-schedules Task is proposed in TM and does not exist yet: creating it
is part of accepting this.

| Id  | Fact and requirement                                                                                                                                                                                                                                                                   | Source                               | Today                                                                                                                                                                           | Owner                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| RT1 | The declaration `schedules: { name: { key?, pausedBy?, restartOn? } }` is the one source of a schedule's name, key type, reason names and selection type (`restartOn` there depends on question 1). The body entry is checked against it exactly, by type and at construction          | `D["schedules"]`                     | names and reasons free in the body: `Record<string, …>` (`src/tokens.ts:275`); selection `unknown` (`src/tokens.ts:274`, `compiled.ts:233`)                                     | Declared-schedules Task; cluster 5 for the body's exactness (C6) |
| RT2 | `key` has one derived type in every callback, the send mapper included, and is `undefined` in an unkeyed one. The two metadata types become one. Turns the pin at `tests/types/schedules.test-d.ts:58`                                                                                 | the declared key Schema              | `ScheduleKey` in the send mapper, keyed or not, so `key.id` compiles and throws (`src/tokens.ts:223,236`); two metadata copies (`src/tokens.ts:228-237`, `compiled.ts:205-215`) | @task.V3.T113                                                    |
| RT3 | `Snapshot<D>["schedules"]` is `TimersOf<D>`, with `pausedBy` the declared reasons. Turns the pin at `tests/types/schedules.test-d.ts:296-301`                                                                                                                                          | the declared names, keys and reasons | `Timers`, hand-written; `pausedBy: ReadonlyArray<string>` (`src/host/snapshot.ts:66,75,81`)                                                                                     | @task.V3.T113                                                    |
| RT4 | One typed point of erasure: the compiled schedule is built from the typed entry and carries the codecs (AR TM-2). The body cast and the unchecked `erase` stop standing before it                                                                                                      | `D` and the body entry               | the two steps above                                                                                                                                                             | cluster 5 (`Compiled`, C6)                                       |
| RT5 | A schedule issue's source, and the evidence `Paused` and `Resumed`, are typed by declared name, key and reasons                                                                                                                                                                        | the declaration                      | text in `path` (`world.ts:246-260`); `string` and `Values` (`evidence.ts:132-139`)                                                                                              | cluster 4                                                        |
| RT6 | The metadata's `output` derives from the body's `schedule` value: a `Schedule<Out>` gives `Out`, a Duration `undefined`. No limit is claimed: no run was made. If a run on the real package fails, `unknown` stays as a stated boundary with the shapes tried listed (CS lesson 3.6.2) | the body's `schedule`                | `unknown` (`src/tokens.ts:235`)                                                                                                                                                 | @task.V3.T113, after C6                                          |
| RT7 | Every type test is two-sided. Wrong-value probes: `pausedBy.includes("Vacaton")`, `key.id` in an unkeyed mapper, `snapshot.schedules.pol`, a `restartOn` result its Schema refuses, `now` in a reason, another definition's event as `send`                                            | each fact above                      | one-sided pins                                                                                                                                                                  | each Task above                                                  |

Kept wide, each with its reason: `Series` and a step's `output` (opaque to the core); memory, context and lane
rows as `Values` (the container's erasure, RT4 and cluster 4); a slot as `string` (cluster 4); the send's payload
as `Values` (decoded at admission); `as Duration.Input` (`fromInput` checks it); the snapshot's one cast
(`src/host/snapshot.ts:245`). Section 12 lists every removed one: 11 removed, 1 narrowed (a key as `Values`).

## 11. Cost

By reading, not measured; the bench decides. No bench covers schedules today, so the build adds
`turn.schedules.none`, `.one`, `.keyed-50` and a firing burst. Sizes: `S` schedules declared in the scope; `k`
timers of one keyed schedule; `T` timers of the scope; `P` pause reasons; `C` context slots; `d` depth of the
leaf; `N` states and `S_all` schedules of the machine; `W` host timers in the world; `D` timers due together;
`I` open issues; `a` a series' attempt. Section 12 marks each loop in today's code.

| Operation                           | After                                                                                                      | Today                                         |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `pass`, scope with no schedule      | O(1), no allocation                                                                                        | O(d·\|leaf\| + T + I): no fast path           |
| `pass`, inputs unchanged (the gate) | O(S)                                                                                                       | as below                                      |
| `pass`, otherwise                   | O(S + the decisions)                                                                                       | O(S·(T + I)) plus the decisions               |
| `decide`                            | unkeyed O(P) callbacks; keyed O(k·P) callbacks and O(k) map work, O(k log k) only when the key set changes | O(k·(P + C)): a context record per read       |
| a turn's arms and disarms           | O(schedules listing the event)                                                                             | O(d·\|leaf\| + S·(armOn + disarmOn)), twice   |
| a firing                            | O(log W) to take the due timers, one decision, one turn                                                    | O(W + D log D · (d·\|leaf\| + S)) per firing  |
| `wake`, one scope                   | O(T) decode plus the decisions; O(a) per stepping timer                                                    | O(T·(C + a)) plus a pass                      |
| encode a scope's timers             | O(T), only when the map's identity changed                                                                 | O(T·(N + S_all)) per record write             |
| snapshot timers and issues          | O(T) per publication, memoized on the map's identity                                                       | O(k²) per keyed schedule per read, plus sorts |

- **Indexes computed once in `Compiled`** (cluster 5 builds them): `schedulesAt` (the schedules of each state),
  `byName`, `rank` (a schedule's place in the due order), `armedBy` and `disarmedBy` (for each event tag, the
  schedules that list it).
- **Kept at run time, each updated by its one writer in the same transition:** `Keyed.timers` as a map by key
  text; the owner's map by activation id; the due index, every alarm ordered by (deadline, admission, rank, key
  text), written only by the applier. It is part of cluster 2's index layer (@review.complexity-sweep F1).
- **The input gate.** `keys`, the reasons and `restartOn` are functions of the inputs of 4.2 and never of the
  clock. `pass` keeps the identities of memory, context, props and lanes from its last run. When all are the
  same, the occasion carries nothing for the schedule (no disarm, start or firing) and it is not a `Wake`, the
  schedule is skipped. The delay reads `now`, but it runs only at a start, which the gate never skips. It is a
  cache, so it lands only when the bench shows the reads matter; Level 0 checks gated against ungated. [proposed]
- **In proportion to what changed:** a scope with no schedule returns at once; an unchanged timer, schedule or
  map is the same object, so the record text and the snapshot memo are reused; when an input did change, the cost
  is O(T·P) callbacks over the scope's live timers, never the machine or the world.

## 12. Fit to today's code

One table for every site this design touches: writers, loops, casts and callers. "L" marks a loop with its cost,
"C" a cast or `unknown`. It amends AR 1.2 and cites @review.code-audit sections 2 (L1, L3) and 4. Kept as they
are: `Failure`, `Seen`, `sameReasons`, `firingOf`, `reasonsOf`, `firstStep`, `inRange`, `operationsOf`,
`firings.ts` `firing` and `recheckLanes`, and the one-pass order. Estimated totals: of the 1,641 lines in the five
core files and the host stepper, about 780 kept, 560 changed, 300 deleted, 220 new; changes outside are uncounted.

| Site                                                                                                             | Today                                                                                   | After                                                                    |
| ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `schedule-decision.ts:30-53` `Occasion`, `:13` `Firing`                                                          | `exited`, `armed`, `adds`, `over`                                                       | change: section 5                                                        |
| `:58-82,153-167` `Plan`, `PlannedRun`, `PlannedTrack`, `plannedOf`, `plannedTrack`                               | a run with no id until applied                                                          | delete: `env.mint`                                                       |
| `:99-104` `Reads`; `:102,291` selection                                                                          | C: `unknown`                                                                            | change: section 5                                                        |
| `:121-152,208-214,445-470` `isScheduleSource` to `issuesAfter`, `ran`, `Pass.ran`                                | stored issues rebuilt each occasion                                                     | delete (code-audit L1)                                                   |
| `:217` `checked`                                                                                                 | calls `ran`                                                                             | change: records the failure only                                         |
| `:183,399` `lastReasonsOf`                                                                                       | reads the timers of an ended activation                                                 | delete                                                                   |
| `:232` `keyed`; `:269,288` `selected`, `rebased`; `:307,332` `started`, `armed`; `:421` `firingFailures`         | four passes                                                                             | change: tables Keys, Selection, Arming, Firing                           |
| `:382-410` `paused`                                                                                              | gate at 385; writes the run at 405; L: `indexOf`, `slice` per timer                     | change: table Reasons                                                    |
| `:352` `heldOrResumed`; `:489` `decide`                                                                          | reached only through `paused`                                                           | change: `timed`, last and total; new signature                           |
| `schedules.ts:80-92` `contextOf`, `readOf`                                                                       | L: a context record per read, O(T·C); `now` to every callback                           | change: per-callback inputs, built once per pass                         |
| `:93-101` `stepper`; `compiled.ts:149-150`                                                                       | C: a series id built from text (`seriesId`)                                             | change: keyed by arming id                                               |
| `:71` `unchanged`; `:103-132` `disarmRun`, `runningTimer`, `runningTo`; `:210-261` `trackedOf`; `:283` `applied` | mints at 238; C: `getOrThrow` at 232                                                    | delete; `reconcile` replaces them                                        |
| `:137-166` `keyOf`, `keysOf`                                                                                     | C: a key checked by shape                                                               | change: the key Schema                                                   |
| `:265` `reported`                                                                                                | `withIssuesOf`                                                                          | change: evidence and trace only                                          |
| `:310-354` `pass`                                                                                                | no fast path; L: timers filtered by name and issues by source per schedule, O(S·(T+I))  | change: fast path, map by activation and name                            |
| `:356-389` `namesIn`, `turned` (callers `serve.ts:341`, `incarnations.ts:189`)                                   | L: `includes`, `find` per schedule                                                      | change: the walk hands names by map; no `exits`                          |
| `:398-426` `firingSettled`, `rechecked`, `restored`                                                              | entry points                                                                            | keep; `restored` calls `wake`                                            |
| `:430` `stopAll` (caller `incarnations.ts:295` `retire`)                                                         | disarms each run                                                                        | renamed `ended`: drops the entry, releases its armings                   |
| `:437-446` `metadataOf`                                                                                          | reads `tracked.name`, `tracked.key`, `run.output`                                       | change: the schedule's name, the entry's key, the cursor's output        |
| `:454-484` `next`; `:489-500` `fired`                                                                            | writes the next run before the turn; L: copies the timer map per firing                 | `next` returns `Next`; `fired` deleted; row A3 applies it once           |
| `:506-518` `firingRun`; `:523` `scheduleNamed`                                                                   | reads `tracked.run`, `Timing.Running`; L: `find` per firing                             | change: `Armed`, `Due`, by arming id; `byName`                           |
| `schedule-plan.ts:44-46` `declaredOn`; `tree.ts:8-12`                                                            | L: the chain rebuilt per pass, O(d²)                                                    | change: `schedulesAt`                                                    |
| `:88` `seriesId`; `:135-167` `savedRun`, `savedTimersOf`; `persist.ts:98-114`                                    | L: every state scanned per idle timer, O(T·(N + S_all))                                 | delete; the Schema of 6.6                                                |
| `:172-196` `Due`, `byDue`                                                                                        | L: `findIndex` in the comparator                                                        | change: typed on the new run; reads `rank`                               |
| `:198-219` `runningOf`, `waitingIn`                                                                              | the dangling host id test at 218                                                        | change: the overdue rule                                                 |
| `:222-244` `dueOf`, `dueIn`; `step.ts:76-100`                                                                    | L: every host timer copied, filtered, sorted per firing                                 | delete; the due index                                                    |
| `schedule-restore.ts:22-122` `seriesOf`, `outputOf`, `runOf`, `trackedOf`                                        | invents `armedAt`, `attempt` (71-72); baseline none (115); C: swallowed throws (27, 48) | delete: the Schema and `reads.resume`                                    |
| `:130` `restore`                                                                                                 | builds the map, then `restored`                                                         | change: `wake` per declared schedule                                     |
| `firings.ts:37-68` `fire`                                                                                        | writes before the turn (44)                                                             | change: `next` as data                                                   |
| `incarnations.ts:164-194` creation                                                                               | `armingsOf`, then a Creation issue nothing clears                                       | change: `turned` with no arms; row A2 decides                            |
| `turn.ts:360-405` `armingsOf`, `disarmedBy`                                                                      | L: two chain walks per turn                                                             | keep for a turn's own arms; read `armedBy`, `disarmedBy`                 |
| `world.ts:140-184,291` `Timing`, `Run`, `Tracked`, `withIssuesOf`                                                | C: baseline `unknown` at 181                                                            | change: 4.3; `StoredIssue` added; the name `Tracked` kept (code-audit 4) |
| `vocabulary.ts:84-99`; `record-format.ts:10`; `actor-record.ts`                                                  | C: key as `Record<string, unknown>`                                                     | change: 6.6 and the step                                                 |
| `compiled.ts:142-240` `Schedule`, `ScheduleInput`                                                                | C: `restartOn` gives `unknown` (233); a key as `Values`                                 | change: the codecs; 4.2's inputs                                         |
| `src/host/snapshot.ts:87-133,184`                                                                                | L: list spread per keyed timer, O(k²)                                                   | change: one pass over the ordered map; `issuesOf`                        |
| `src/host/owners/schedule-steps.ts:53-68`                                                                        | entries kept after a disarm                                                             | change: by arming id; a first step keeps nothing; release                |
| `src/machine.ts:170-173`; `src/handles.ts:27-30`; `src/compile-schedules.ts:111-178`; `src/tokens.ts:223-339`    | C: the body cast, unchecked `erase`, hand-written types                                 | RT1 to RT4                                                               |

**What this must not reopen.** T57's tables prove single-occasion timing: disarm against restart, restart while
held, the full delay under a hold, a throwing reason keeping its last value, the turn refused by a bad delay.
Tables Selection, Arming, Reasons and Timing restate those rules. The changes of behaviour, listed once: no
inherited reasons at a same-turn re-entry; creation's bad delay is `Refused` instead of a Creation issue; a
restore keeps the selection, the firing failure and a refused start, and no longer re-reads `restartOn` for a
timer that has a baseline; a restored series whose delay throws shows an issue instead of ending silently;
`restartOn`, reasons and `keys` no longer receive `now` at run time.

## 13. Principles and fixtures

| Principle (@proposal.algorithm-round section 2) | Held or traded                                                                                                                                                                                              |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Classes, not instances                          | Held: seven families; two members are named debt                                                                                                                                                            |
| One owner per state, one writer per field       | Held: `decide`, by the `Decided` brand; the outside writers are inputs (section 5)                                                                                                                          |
| Store facts, derive views                       | Held: issues, alarms, cursors, `adds`, overdue. Traded: `Held` and `Due` are stored though `reasons` gives the tag, because `left` and `dueAt` are facts; `Stepping.output` is stored to keep a firing O(1) |
| Explicit states                                 | Held: `Arming`, `Checked`, `Outcome`, `Selection`, `Cursor`, `Scheduled`; no `Option` in state                                                                                                              |
| One decision per subject per occasion           | Held: the firing's step and its send's outcome are one decision                                                                                                                                             |
| Total tables                                    | Held: six tables; the one impossible cell is named (6.3); a model closed over them (9.1)                                                                                                                    |
| Survives a reload                               | Held: 6.6, I6. Traded: a computed series is planned again at wake (question 7); the `Refused` retry (question 8)                                                                                            |
| Same rule at every scope                        | Held: `decide` is scope-blind (6.7)                                                                                                                                                                         |
| One equality and one codec per fact             | Held for keys, reasons and selections, given question 1                                                                                                                                                     |
| A throw changes only its own check              | Held for the three checks (I10). Traded, kept from today: a turn's own arm with a bad delay refuses the turn; a next step that throws ends the series                                                       |
| General                                         | Held: the fixture table below                                                                                                                                                                               |
| Simple                                          | Held: five occasions, six fields. `exited`, `adds`, `Plan`, `ran` and the Creation path go                                                                                                                  |
| Effect at the edges                             | Held: the host steps with `Schedule.toStep`; the core holds data                                                                                                                                            |
| Types derive from their source; full inference  | Held in this cluster's code: generic in `Key` and `Why`, `Tracked` from its Schema. The public half is RT1 to RT7, each with an owner. Traded until RT4: the container erases                               |
| Cheap operations over the graph                 | Held: section 11; four compile-time indexes, three run-time ones, no scan of the world                                                                                                                      |

**Checked against the fixture apps** (`fixtures/*/machines`) and the fixtures to come (@convention.fixture-catalog):

| Fixture                                                                                          | What it needs                                                                                                                          | Rows that give it                                                                                                                                     |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `home/room.ts:147-185` `poll`                                                                    | keyed; a series computed from memory; `restartOn` on the sensor kind; reasons reading context and lanes                                | Keys; A2 with `reads.first`; Selection; `Context` and `Lanes`. Its `restartOn` selects what its delay reads, so the wake's replan agrees (question 7) |
| `home/room.ts` `check`, `boost`, `reconnect`                                                     | `armOn: [Flow.entry]` beside `restartOn`, `disarmOn` and a pause; a bounded and an exponential series; `armOn` by event                | a new timer with `onEntry`; `Given`; A1; A3 `Again`, `Done`                                                                                           |
| `player.ts` `tick`; `stepper.ts` `repeat`, `settle`; `subscription.ts` `renew`; `pay.ts` `check` | a schedule whose own send, or a repeated event, arms it again                                                                          | `Turn` with `fired` and `Given`: A2 wins over A3                                                                                                      |
| `house.ts`, `booking.ts`, `sleep-timer.ts`, `sign-in.ts`, `sync.ts`                              | a delay computed from memory and `now`; two deadlines from one field; a 7-day delay across reloads                                     | the delay keeps `now` (4.2); the saved `Due` keeps `dueAt`; due order by declaration                                                                  |
| catalog: `Toast` under `Toaster` by `.each` (kanban)                                             | one unkeyed timer per copy; "pushed out of view waits with its time, never shown never starts"; a fresh duration when a result arrives | an instance is a scope (6.7); a new run under a holding reason keeps its full delay; a restart reads the delay again                                  |
| catalog: typing timers per user (chat); the autosave debounce in a resumable section (editor)    | restart one key on its own event; idle until a change, idle again after firing; a clock that runs while collapsed                      | Selection per key (`armOn` on a keyed schedule stays refused); `Idle` is not sticky (6.3); asleep is not a timer state (question 9)                   |
| catalog: `RateLimit` pauses `Repo`'s schedules (sync)                                            | a trait's state holds its host's timers                                                                                                | a reason reads its own scope's inputs; the trait must put the fact where the host reads it (memory by a raise, or context): cluster 2's channel       |

Not expressible, by design: a reason, `keys` or `restartOn` that depends on the clock alone (a "quiet hours" pause).
It needs its own schedule that writes memory. No fixture or catalog row asks for one.

## 14. Seams and build order

- **Offers** `Scheduled`: one value per schedule per scope, in the owner's map by activation id.
- **Offers** `Occasion`: the closed list of section 5 and the mapping of 6.7.
- **Offers** `SavedScheduled`: the Schema of 6.6 and the decode table of 6.5.
- **Offers** `issuesOf`: `scheduleIssues` and its memo key, the identity of the owner's map.
- **Offers** `alarms`: the applier's set, clear and release, the only writes to the due index.
- **Offers** `selectionCodec`: Schema encode plus canonical text, with equality by that text. This cluster's
  build defines it, since the recommended order needs it first; cluster 4 adopts it for slots, props and
  `resetOn` (X-5).

What each later cluster must provide:

- **Cluster 2 (turn walk, channels, fragments).** An activation id per state entry and per instance. Per scope a
  turn touches: the names it disarmed and started, with their first steps (TP-5). One `pass` per scope in row 11,
  a restart decided before the arming it feeds (TP:190). The firing's send carries `fired` into that row with no
  write before the turn (TP-3); `Mail.Firing` names the scope and the arming id (FR:85). `Lanes` stays outside
  the turn's rows. The call site of 6.7's `Context` after a `Wake`. Freeze clears alarms and changes no timer;
  FR:113's map holds `Scheduled`. A total scope order, the due index, and whether the loop guard bounds an
  endless series of zero delays. Whether instance schedule names are scoped (FR:113) or machine-wide (TM:373).
- **Cluster 3 (records).** One format step for every schedule field at once (X-1); it reads no definition
  (SR:156), while `wake` does. SR's reference table gains the rows of 6.5 (SR-1); the key and selection decode
  use the Schemas in `Compiled` (SR-2); instance schedules are saved inside the instance's body.
- **Cluster 4 (reads, errors).** RT5; a branded slot name; lane rows typed where `keys` and reasons read them.
- **Cluster 5 (host, tooling, types).** RT1 to RT4, RT6 and RT7; the indexes of section 11; the host stepper by
  arming id with a release; the memo for `issuesOf`; a reporter that records breach ids for inverted rows.

**Declared schedules before or after T118** (question 6). @plan.Machines.O5 still describes `Flow.keyed`; under
any order it needs the user's edit.

| Order                                                                         | Cost                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T118 first, on the body-declared API                                          | The baseline has no declared codec, so it is saved under a stopgap (canonical JSON only). The Declared-schedules work then changes the key codec, the reason cut's source and the baseline codec: a second format step, and the sequence fixture is rewritten twice (11 `Flow.keyed` sites, AR 1.7). B1 and B2 are fixed soonest |
| Declared schedules first, whole                                               | T118 builds once on final shapes, with one format step. It waits for the type derivation (C6, `derive.ts`), which is not designed; B1 and B2 stay red longer                                                                                                                                                                     |
| The declaration's runtime half first, then T118, then the types (recommended) | The declaration object, its construction checks and the codecs in `Compiled` land first: about the 70 lines of AR 1.7 plus TM-2. T118 then builds once, with one format step. The public types follow and change no runtime                                                                                                      |

## 15. Questions for the user

Each has two traces where behaviour differs. Recommendation first.

1. **Where the `restartOn` selection gets its codec** [open: 2026-11-21; recommend A]
   - A: the declaration names its Schema, beside `key` and `pausedBy`; the body's `restartOn` must return that
     type, and the baseline is saved as its canonical text.
   - B: no declaration; `restartOn` must return a JSON value. C: keep `unknown` and `Equal.equals`.
   - Trace C: `restartOn: () => memory.dueDate` (a `Date`). Saved, it comes back a string, unequal to the next
     read: the timer restarts after every reload. Or it cannot encode and the whole actor record is withheld
     (`persist.ts:410-432`).
   - Trace A: the schedule declares `restartOn: Schema.Date`; the text round-trips; a reload changes nothing.
     B is lighter, but a `Date`, an `Option` or a branded value needs a hand mapping in every `restartOn`.

   ```ts
   // before (existing, decided): expire: { key: { id: Schema.String }, pausedBy: ["Hovered", "Hidden"] }
   // after  (NEW: restartOn in the declaration; existing: key, pausedBy; user-defined: expire, Hovered, Hidden)
   expire: { key: { id: Schema.String }, pausedBy: ["Hovered", "Hidden"], restartOn: Schema.NullOr(Schema.String) },
   ```

2. **What a re-entered state's new timer inherits** [open: 2026-11-21; recommend A]
   - A: nothing. Its reasons start at `[]`; a reason that throws on its first read does not hold it. Trace: A
     true, A throws, re-entry; the new timer is due and fires at 60 s with the reason's issue showing.
   - B: its key's last reasons from the activation that ended (the ledger, `:175`; today's code for a same-turn
     re-entry only). Trace: the same steps hold the new timer by a reason read in an activation that no longer
     exists; a re-entry one turn later does not, so two paths to the same state differ.
   - C: nothing, and a timer whose reasons never read clean is held until they do. It needs a new snapshot shape
     (`left` with an empty `pausedBy`). A follows SI's P1 and T57's 15:14:37Z ruling.
3. **A new timer whose first `restartOn` read throws** [open: 2026-11-21; recommend A]
   - A: its first clean read is the baseline, silently. Trace, row `lapk`: the selection really changes; `good`
     restarts, `bad` does not. A restart that happened while the selection was unreadable cannot be known.
   - B: it counts as a change and restarts the timer. Trace: selection throws / `bad` appears / Stop / selection
     reads again with the same value; `bad` re-arms after `Stop` though nothing changed: a made-up firing.
4. **What a wake does to a saved baseline** [open: 2026-11-21; recommend A]
   - A: nothing. The saved selection stands; the owner raises `Context` after the wake when context or props
     differ from what the scope last heard, and that occasion compares, as it runs an `onContext` reaction.
   - B: the wake re-reads `restartOn` and takes a clean value silently; a throw keeps the saved value (AR S-1's
     proposal, and the letter of @plan.Machines.O5: "Restored `restartOn` baselines are silent").
   - Trace B: an idle sign-out reads an activity counter from context. The counter moves from 5 to 7 while this
     page is closed, or while its trait is frozen. The wake takes 7 silently; the timer keeps its old deadline
     and signs the user out minutes after real activity.
   - Trace A: the same steps restart the timer once. Cost: a provider that is not saved and boots at another
     value restarts the timers that select it on every reload, so a user who reloads often is never signed out
     by such a timer.
   - A gives a reload and a thaw one rule (6.2) and matches T118's 16:20:43Z wording ("the restore keeps it ...
     the reload is transparent"). B is the Plan's sentence, written when no baseline was saved.
5. **A start whose first step fails** [open: 2026-11-21; recommend A]
   - A: keep both rules. A turn's own arm (entry or `armOn`) with a bad delay refuses the turn; every later start
     (a new key, a restart, creation, a wake) is `Refused` with an issue.
   - B: one rule. Every start is decided after commit and a bad delay is `Refused`; no turn is refused by a
     schedule. B removes `armingsOf`'s first-step half and `Turn.started.first`, and makes creation and a turn
     the same. It changes @plan.Machines.O5 ("rejects the arming turn") and flips rows T57's tables prove.
6. **The build order of section 14** [open: 2026-11-21; recommend the third row]
7. **A computed Effect Schedule after a reload** [open: 2026-11-21; recommend A]
   - A: a stated limit. The series is planned again from the memory at wake and replayed to its saved attempt;
     if that memory differs from the arming turn's, later delays differ. It is today's behaviour
     (`schedule-restore.ts:22-36`). The one fixture that computes a series (`home/room.ts:167-168`) selects the
     same field in `restartOn`, so a change restarts it and the replan agrees; the limit bites only a series
     that reads what its `restartOn` does not select.
   - B: refuse a computed delay that returns an Effect Schedule; only a fixed series or a computed Duration.
     Trace B: `room.ts`'s per-sensor poll interval no longer compiles.
8. **When a refused start is tried again** [open: 2026-11-21; recommend A]
   - A: on every occasion, as a timer with no baseline is read on every occasion. This changes SI's accepted P2.
     Trace: `bad` appears out of range / `bad` appears (its delay is valid now); `bad` arms at the second step,
     and a reload changes nothing: the model's I6 holds with no exception (9.1). Cost: a refused timer's delay
     runs once per occasion while refused, and the input gate cannot skip a schedule that holds one.
   - B: SI's rule as accepted: at a wake, and at a later start cause. Trace: the same steps leave `bad` refused
     with its issue, though nothing is wrong any more. A reload then arms it: the reload is visible, I6 needs
     its exception, and the two-run check for I6 must skip refused timers.
9. **Departures from the concept designs** [open: 2026-11-21; recommend as designed here]
   - S-7: an undeclared saved reason drops that name and keeps the timer; SR:201 makes the record unreadable or
     drops the timer. Trace SR: removing a reason in a release drops a held toast timer, which never expires.
   - A frozen scope's clock runs (@plan.Machines.O5); FR:324 holds it. Trace FR: a session timeout in a frozen
     trait never comes due.
   - A definition edit that makes a saved key unreadable, or changes keying, starts its keys again from step one,
     a disarmed key included. The alternative (start only a schedule the record lacks) leaves an armed key
     unarmed with no issue.
   - Scoped `armOn` (TP PD4, TP:380) is assumed here and open there; this design takes either answer.

Proposed here and the orchestrator's to accept, not questions: saving whole failures (6.6); the name `Tracked`;
the input gate; the arming id in `Firing`; the activation id as the map's key; `Cursor.Broken`; `now` no longer
passed to `restartOn`, the reasons and `keys` (their public types never had it).

## 16. Process notes

What went wrong for schedules, from CS section 1, the Task history and this round:

- **The algorithm was designed during the build, as "calls",** with no state inventory before `986337d3`. Rules
  lived in comments and contradicted each other: re-entry is "rejected" in T57 (15:14:37Z) and "T57's ruling" in
  T118 (16:01:47Z). There was no table to amend.
- **Alphabets came from the last bug,** the oracle was a second model nobody amended with the rule, and
  convergence gathered code within an hour of its review, by the same lead.
- **Types had no owner in the design:** `pausedBy` and `key` moved through three Tasks in one day (CS 3.2).
- **My first invariants were derived from my own rules,** so I1 and I6 encoded the rules' gaps, and two blind
  derivations agreed with rows that were wrong. The properties of section 2 come first now. The executable model
  then closed the tables in seconds: run before any review, it is the cheapest check there is.
- **Read-only sidecars left scratch files** outside the scratchpad, one of them in this round.

How I would build this cluster:

1. The declaration's runtime half (section 14), then the tables of section 6 as data with the Level 0 closure
   over a stub of the new `decide`: the first failing check. The scratch model is prior art, not its code.
2. The amended Story oracle and the recount on today's code (9.3). Review here, before production code: a blind
   derivation, an adversary, and the properties against the tables' own rows.
3. The types of 4.3 with the `StoredIssue` and `Decided` pins, then `decide` whole in one change.
4. The owner (`pass`, `reconcile`, the firing with `next` as data, creation), then the Schema, `wake` and the
   format step, with I6 as its first failing check. Then the deletions, the plants, the indexes and the bench.
5. One Opus review of the code against the tables. A second failure of one class after that goes to a fresh
   agent with the problem and the findings, not this draft.

## 17. Sidecar and review log

Thirteen Haiku sidecars in the first round (eight at effort medium, five at effort high on the draft), the
independent review, then one Sonnet model. Each finding I used was re-read in the code or record.

- **Accepted,** read in the code or record: every writer of `Tracked` and `Run`; the Creation issue nothing
  clears; T57's 15:14:37Z ruling against T118's 16:01:47Z call; the Plan's frozen clock against FR:324; the save
  and read path; no fast path, a context record per read, no schedule bench; the casts by line; the 22 loop
  sites; the wrong ledger line and the table-against-pseudo-code gaps; the two-step erasure and missing owners.
- **Accepted from the adversary:** a firing matched by key; an alarm by id alone; a clean wake read swallowing a
  restart (question 4); I4, I5, I7 and I10 ill-posed. **Changed:** a throwing `resume`, `Refused` first and
  `Broken` after the review.
- **Rejected:** disposal leaving a timer id, and lane re-checks per Open step (not verified, unused); "a context
  change does not re-read keys" (the code does, `incarnations.ts:80`); prior art from memory; allocation counts I
  could not check; "a disarm does not stick", "an unhandled send is lost" and "a `Given` start retried
  otherwise" (each is the Plan's or the type's rule, now stated).
- The blind derivations agreed with mine on all 30 rows, which showed precision and not truth (section 16).

The independent review (@review.review-algo-schedules):

- S1 a restored series that cannot resume restarts silently: **accepted**, re-traced on tables 6.5 and 6.3; the
  cursor is `Broken`, the timing is kept and the issue shows.
- S2 I6 fails on the retry rule: **accepted**, re-traced and confirmed by the model. The fix is the user's:
  question 8, with I6's exception stated until then.
- S3 thaw skips a selection change: **accepted**; one rule for every occasion that does not compare (6.2, 6.7).
- S4 callbacks read `now`: **changed**. Only the delay's public type has it; the run-time leak to the other
  three goes, so the gate and I6 need no time term, and no public type changes.
- B1 I1 too narrow: **accepted**, widened with its ends listed. B2 checks that cannot fail: **accepted**; atoms
  added, faults re-pointed, Level 0's claim cut. B3 the fit section: **accepted**, re-read
  `schedules.ts:93-101,430-446,506-518`; one fit table.
- Removed against gathered: **accepted**. F3 and F5 are removed by a brand and by the activation key; F1 and F4
  are handled at one point.
- Definition edits re-arm a disarmed key: **changed**, stated as the rule and asked (question 9). TP PD4, S-7,
  props root-wide, I10, I12 and the cast count: **accepted**.

The Sonnet model (9.1): every property but I6 holds over the closure: **accepted**. I5 failing when one firing's
turn re-holds another due timer: **changed**; its fixture let an edited build revert, and I5 now says "when its
own firing is served". "This timer's firing" after Arming idled it, and the missing disarm-with-new-key atom:
**accepted**.
