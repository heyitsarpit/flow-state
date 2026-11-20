# The turn's parts walk and the turn record (proposed, 2026-11-20)

**Bottom line:** `runTurn` stays pure and returns one value, `Turn`: the parts the walk selected, in walk order, with
everything each part decided. `serve.ts#turn` is the only code that applies a `Turn`, in one fixed order, and it
writes the `Turn` once as the `Turned` record. Emits, the rule judge, the trace and schedules all read that one
record; nothing keeps a second copy. Everything here is proposed; nothing is decided until the user accepts it.

Written in 25 minutes. What was not done is listed in section 8 under "Not verified".

## 1. What exists

- **`src/core/turn.ts#runTurn`.** What it does: routes an event leaf to root, first alternative whose guards pass.
  Holds: yes. Wrong or missing: one part only.
- **`turn.ts#accept`.** What it does: patch on the before memory, actions and armings on the after memory, one `Part`.
  Holds: yes. Wrong or missing: no walk.
- **`turn.ts#TurnResult.Accepted`.** What it does: `part`, `handler`, `move`, `memory`, `actions`, `arm`, `disarm`.
  Holds: yes. Wrong or missing: flat: no list of parts.
- **`src/core/compiled.ts#Alternative`.** What it does: `at`, `target`, `guards`, `update`, `actions`. Holds: yes.
  Wrong or missing: no `raise`, `notify`, `emit`, exit.
- **`src/core/serve.ts#turn` (203-365).** What it does: applies an accepted turn: commit, members, `Turned`, lanes,
  schedules, publish, wave, sends. Holds: yes. Wrong or missing: the order is in code only, not a table.
- **`serve.ts` 325-336.** What it does: `Act.Turned { actor, event, from, to, parts: [part], members }`. Holds: yes.
  Wrong or missing: no payload, no context, no emits.
- **`src/core/incarnations.ts#publish` (64).** What it does: `Act.Published { actor, state, memory }`. Holds: yes.
  Wrong or missing: does not say why it published.
- **`src/host/driver.ts` 358.** What it does: sinks one step's whole evidence batch, in order, after `world =
  out.world`. Holds: yes. Wrong or missing: consumers must pair records themselves.

What holds and is kept unchanged: source selection, the implicit "self", the late-turn rule, the two memory views, the
refusal of a whole turn, the applier's order (it becomes table 3.2 as it is), the loop guard, one publication per
accepted turn.

What is missing: the walk (@plan.Machines.O3 "select the parts"), a list of parts in the result, emits, and a record
a host consumer can read a whole turn from.

## 2. State inventory

### 2.1 State this concept owns

- **the walk.** Where: local to one `runTurn` call, `src/core/parts.ts`. Values: `Walking`, `Refused`. Inputs that
  change it in one step: a part visited; a part's failure (table 3.3).
- **the turn's state changer.** Where: inside the walk. Values: none, one part's target. Inputs that change it in one
  step: a part with a target (table 3.3).
- **the turn's written keys.** Where: inside the walk, per scope. Values: a set of memory field names. Inputs that
  change it in one step: a part's patch (table 3.3).
- **the turn record `Turn`.** Where: a value: `runTurn`'s result, then the `Turned` record. Values: built once, never
  changed. Inputs that change it in one step: none after `runTurn` returns.

Nothing here is stored in `World`. The walk lives for one call; the `Turn` is a value of the accepted turn, then an
evidence record, then nothing. The incarnation, lanes, schedules, instances and issues are neighbours' state, written
only through the applier's calls in table 3.2.

Derived, never stored: a turn's emits (`parts` flat-mapped), its actions (the same), the evidence `parts` list, the
before memory (the previous publication), whether the turn moved (`move`).

### 2.2 Seams

- **typed machine (T113).** Crosses: `Alternative` gains `raises`, `notifies`, `emits`, `exit` as compiled data.
  Direction: I read.
- **fragments (T109).** Crosses: `Address`, `Scope`, `reach(instances, address, name)`: a raise's or notify's target
  level. Direction: I call.
- **fragments (T109).** Crosses: the walk's facts (parts, patches by scope); `settle(…, Turn)` returns `Settled` and
  leaving parts. Direction: I offer, they return.
- **boundary channels (T77).** Crosses: `PartRun.emits: ReadonlyArray<Emit>`; no `Act.Emitted`. Direction: they read.
- **static rules (T106).** Crosses: `turnsOf(batch)`: each `Turn` with its `Published`. Direction: they read.
- **schedules (T57, T118).** Crosses: one `schedules.turned` call per turn with `exits`, `arms`, `disarms`, `fired`.
  Direction: I call.
- **reads and operations.** Crosses: `Trigger.Ending`: the row is heard before `runTurn`; members apply in walk order.
  Direction: both ways.
- **inspection, CLI.** Crosses: `Evidence.Turn` grows; `explain` and `trace` print parts with their cause. Direction:
  they print.

## 3. The design

### 3.1 The turn record

```ts
// src/core/turn.ts
// NEW: Cause, PartRun, Turn     existing: Part, Move, Resolved, Arming, Values     from fragments: Address, Emit
export type Cause = Data.TaggedEnum<{
  Source: {};                       // the alternative the event selected
  Raise: { from: number };          // a raise written on parts[from]
  Notify: { from: number };         // a notify or filling reached from parts[from]
  Exit: { from: number };           // the exit of the fragment parts[from] ran in, filled by its host
  Abandoned: { address: Address };  // whenAbandoned of an instance this turn ends
}>;

export type PartRun = {
  readonly part: Part;                        // existing: { at, node, target }
  readonly address: Address;                  // [] for the root
  readonly cause: Cause;
  readonly event: { readonly tag: string; readonly payload: Values };   // the event this part answered
  readonly patch: Option.Option<Values>;      // the fields it writes, in its scope
  readonly emits: ReadonlyArray<Emit>;        // written order
  readonly actions: ReadonlyArray<Resolved>;  // written order, selects run on the after memory
};

export type Turn = {
  readonly context: Values;                   // the context every guard of this turn saw
  readonly now: number;
  readonly parts: ReadonlyArray<PartRun>;     // walk order; parts[0] is the source
  readonly move: Option.Option<Move>;         // the one state changer's move
  readonly memory: Values;                    // the after memory
  readonly arm: ReadonlyArray<Arming>;
  readonly disarm: ReadonlyArray<string>;
};

// before
Accepted: { part; handler; move; memory; actions; arm; disarm }
// after
Accepted: { turn: Turn }
```

The source's event and payload are `turn.parts[0].event`; they are not repeated on `Turn`. `handler` is
`parts[0].part.node`. A turn with one part allocates one `PartRun` more than today; the bench decides whether that is
acceptable (section 6).

The evidence record carries the same value, once:

```ts
// src/core/evidence-of.ts
// before
Turned: { actor; event; from; to; parts: ReadonlyArray<Part>; members }
// after        NEW: turn        dropped: event, parts (both derived from turn)
Turned: { actor; from; to; turn: Turn; members }

// src/core/incarnations.ts      NEW: why
Published: { actor; state; memory; why: "Turn" | "Other" | "Begin" | "End" }
```

`why` is a fact of the publication, set by `publish`'s caller. An accepted turn publishes with `why: "Turn"` exactly
once, after its `Turned` (table 3.2, row 12), so the pairing below needs no id:

```ts
// NEW: src/core/turns-of.ts, pure. The only code that pairs a Turned with its Published.
export type TurnView = { readonly actor: ActorId; readonly turn: Turn; readonly after: Published };
export const turnsOf: (batch: ReadonlyArray<Act>) => ReadonlyArray<TurnView>;
```

The public `Evidence.Turn` and the public `emit` evidence that @plan.Machines.O1 asks for ("each emit is recorded
as `emit` evidence") are projections of `Turned` in `evidence-of.ts`: one public record per emit, derived, in walk
order, placed after the turn's `Published`. The Plan's sentence holds; only the core's internal `Act` has no
`Emitted`.

### 3.2 The occasion order within one turn

**Owner of the pure rows: `walk` in `src/core/parts.ts`, called by `runTurn`. Owner of the applied rows:
`serve.ts#turn`.** Nothing else runs any row. Rows 8 to 16 are today's code order, unchanged.

| # | Occasion | Memory read | Owner |
| --- | --- | --- | --- |
| 0 | Admit: pending reset first; an ending is heard | pre-turn | `serve`, the ledger |
| 1 | Select the source | before | `runTurn` |
| 2 | The source's patch | before | `walk` |
| 3 | `resetOn` | before-walk | fragments, through `walk` |
| 4 | Walk the parts depth first | before | `walk` |
| 5 | Final `.each` lists; `whenAbandoned` parts appended | the walk's facts | `settle`, through `walk` |
| 6 | Validate; build the after memory | the walk | `walk` |
| 7 | Resolve actions, sends, armings, disarms | after | `walk` |
| | **`runTurn` returns here** | | |
| 8 | Loop guard | none | `serve` |
| 9 | Commit the incarnation; clear the source's issue | the `Turn` | `serve` |
| 10 | Members in walk order; `Turned`; flush lanes | the `Turn` | `serve`, the lanes owner |
| 11 | Schedules, once | after, lanes with members | `schedules.turned` |
| 12 | Re-check resets and lists; publish once | after | `serve` |
| 13 | Context wave | the publication | `incarnations.context` |
| 14 | Sends delivered in walk order | the `Turn` | `serve` |
| 15 | Step ends; emit listeners and the judge run | `turnsOf(batch)` | the host |
| 16 | Commands: releases, then starts | commands | the driver |

Row notes:

- Row 0: a pending reset from the last commit runs first as its own turn. An ending is heard (`Act.Heard`), its lane
  cell applied and its lateness tested against the pre-turn activations, before `runTurn`.
- Row 1: leaf to root, the first alternative whose guards pass, else the implicit "self". `Denied`, `Unhandled` and
  `Refused` end at the bold line: none of rows 8 to 16 run for them.
- Row 4, within one part: its emits, then its raises in written order (each selects a child alternative by rows 1
  and 2 in the child's scope, then recurses), then its notifies and fillings, then its exit. It writes `parts`, the
  written keys and the state changer.
- Row 5: `whenAbandoned` parts of every instance the turn ends are appended with cause `Abandoned`.
- Row 6: one state changer; disjoint keys per scope; the after memory is new instances' initial memory, then each
  patch in walk order.
- Row 9: state, minted activations, history, memory, and instances per `Settled`.
- Row 10: each write action's lane cell, owned by its own part's activation or instance; the `Turned` record is
  placed before the members' reports.
- Row 11: exits, entries, armings, disarms and the firing; then keys, `restartOn` and `paused`.
- Row 12: the publication carries `why: "Turn"`.
- Row 15: the driver sets its world, then sinks the batch.

Three rules follow from the table and each is a test (section 6):

- Every mapper that makes a payload (raise, notify, emit, exit, `whenAbandoned`) and every guard and patch reads the
  before memory. Only rows 7 and 11 read the after memory. This is @plan.Machines.O3 "two memory views", kept.
- A refusal in rows 1 to 8 applies nothing: no part of a refused turn is recorded, no emit is delivered.
- A part's work is owned from that part (its target's activation when it moves, else its handler's, or its
  instance per fragments' `OwnedBy.Instance`), never from `Turn.move`. Today's one `owner` (`serve.ts` 285-296)
  becomes a function of the part.
- An emit is delivered only at row 15, so a handler's snapshot is at or after the emit's turn, never before it.

### 3.3 The walk's table

**Owner: `walk`.** It keeps one accumulator; these are its only writers. Every row starts from `Walking` except the
last; "refused" means `Refused(InvalidTurn, slot)` unless a code is given.

| Row | A part arrives that | Next |
| --- | --- | --- |
| W1 | has no target | `Walking` |
| W2 | has a target, and no changer is set | `Walking`, changer set |
| W3 | has a target, and a changer is set | refused: one state changer |
| W4 | writes a key its scope already wrote | refused: disjoint memory keys |
| W5 | has the `(address, alternative, cause.from)` of an earlier part | refused: a walk must end |
| W6 | has a guard, mapper or patch that throws | `Refused(GuardDefect or Defect, slot)` |
| W7 | is a raise whose child has no handler or only declines | refused (Plan O3) |
| W8 | is a raise into `.each` whose copy has no handler or declines | `Walking`, copy skipped |
| W9 | anything, once `Refused` | `Refused`, unchanged: the first refusal stands |

An `Address` names one instance, the copy's key included (`[uploads, r1]`), never the slot alone. The cycle row is
the walk's bound. It has a real reason (a raise that reaches itself through a notify would never end) and it never
refuses a fan-out: each `.each` copy has its own address, and a filling reached from two parts differs in `from`.

A raised event selects in the child's scope exactly as the source does, the implicit "self" included, so a child whose
schedule lists the raised event in `armOn` handles it. `armingsOf` and `disarmedBy` then run once per part scope at
row 7, on each part's own event.

### 3.4 A complete small example

Compiled data, fed directly as the prototypes did (the builder types are T113's):

```ts
// existing: at, target, guards, update, actions     NEW: raises, notifies, emits, exit
const cancelAll: Alternative = {
  at: "root:CancelAll:0", target: Option.none(), guards: [], update: Option.none(), actions: [],
  raises: [{ slot: "uploads", event: { slot: "root:CancelAll:0:raise:0", run: () => ({ _tag: "Cancel" }) } }],
  notifies: [], exit: Option.none(),
  emits: [{
    name: "cancelling",
    payload: { slot: "root:CancelAll:0:emit:0", run: ({ memory }) => ({ n: memory.count }) },
  }],
};
// the fragment `upload`, placed with .each at slot "uploads"; user-defined: Cancel, onGone, cancelling
const cancel: Alternative = {
  at: "upload:Cancel:0", target: Option.none(), guards: [], update: Option.none(), actions: [],
  raises: [], notifies: [], emits: [],
  exit: Option.some({
    name: "onGone",
    payload: { slot: "upload:Cancel:0:exit", run: ({ memory }) => ({ id: memory.id }) },
  }),
};
```

With copies `[r2, r1]`, and the host filling `onGone` with a handler that starts a `Lookup` (a filling that patched
one host field would be refused on its second run: disjoint keys), the `Turn` is:

| `parts[i]` | `part.at` | `address` | `cause` | emits | actions |
| --- | --- | --- | --- | --- | --- |
| 0 | `root:CancelAll:0` | `[]` | `Source` | `cancelling` | none |
| 1 | `upload:Cancel:0` | `[uploads, r2]` | `Raise { from: 0 }` | none | none |
| 2 | `root:onGone` | `[]` | `Exit { from: 1 }` | none | `Lookup` |
| 3 | `upload:Cancel:0` | `[uploads, r1]` | `Raise { from: 0 }` | none | none |
| 4 | `root:onGone` | `[]` | `Exit { from: 3 }` | none | `Lookup` |

Parts 2 and 4 are the same alternative at the same address and differ only in `cause.from`, which is why the cycle
row's identity includes it. This example is that row's test.

## 4. Requirements and Invariants

- **R1.** Rule: An accepted turn is one `Turn` whose `parts` are in walk order, the source first. Source: Plan O3. The
  check that fails on a wrong build: table 3.4's turn has exactly those five parts in that order.
- **R2.** Rule: Within a part: emits, raises in written order, notifies, exit. Source: Plan O3; the last prototype's
  `runPart`. The check that fails on a wrong build: swap any two and the parts table differs.
- **R3.** Rule: Guards, patches and payload mappers read the before memory; rows 7 and 11 the after memory. Source:
  Plan O3. The check that fails on a wrong build: a raise payload that reads a field the source patched sees the old
  value.
- **R4.** Rule: A failure in any part refuses the whole turn; nothing of it is recorded or applied. Source: Plan O3;
  `turn.ts#accept`. The check that fails on a wrong build: a throwing child mapper leaves state, memory, lanes and
  evidence as before.
- **R5.** Rule: One state changer; disjoint keys per scope. Source: Plan O3. The check that fails on a wrong build:
  two parts with targets, or two patches of one key, refuse.
- **R6.** Rule: A raise into `.each` skips copies with no handler; any other raise with none refuses. Source: Plan O3;
  Turn.spec R30. The check that fails on a wrong build: rows W7 and W8.
- **R7.** Rule: The applier runs rows 8 to 16 in that order, each once. Source: `serve.ts` 248-360. The check that
  fails on a wrong build: the sequence test of section 6.
- **R8.** Rule: `Turned` is written once per accepted turn and carries the `Turn`. Source: this design. The check that
  fails on a wrong build: a second record holding emits or payload fails the type test.
- **R9.** Rule: Emits are delivered at row 15 in walk order, after the publication. Source: boundary channels R5, R6.
  The check that fails on a wrong build: a listener that reads the snapshot sees the turn's after memory.
- **I1.** Rule: `turnsOf(batch).length` equals the number of `Turned` in the batch; each pairs with one `Published` of
  `why: "Turn"` for its actor, later in the batch, with no other `Turned` of that actor between. Source: this design.
  The check that fails on a wrong build: property test over generated steps.
- **I2.** Rule: A `Published` with `why: "Turn"` always has a `Turned` before it. Source: this design. The check that
  fails on a wrong build: the same property.
- **I3.** Rule: A `Turn`'s `parts` holds no two entries with the same `(address, part.at, cause.from)`. Source: table
  3.3. The check that fails on a wrong build: the property on generated walks.
- **I4.** Rule: Denied, Unhandled and Refused write no `Turned`. Source: `serve.ts` 239-247. The check that fails on a
  wrong build: sequence test.
- **I5.** Rule: The same `Turn` comes from `runTurn` under `check()` and under the runtime. Source: Plan O3. The check
  that fails on a wrong build: one generated input through both.

Table 3.3's rows are R4, R5, R6 and I3. Table 3.2's rows 1 to 7 are R1 to R3; rows 8 to 16 are R7 and R9.

## 5. Development strategy

One Task, **Turn parts**, ahead of T109 (fragments PD5; cohesion build order step 7). It owns the walk and the `Turn`
value and nothing else. It needs no instance tree: its fixtures place one root trait and one `.each` slot as
hand-built compiled data with a stub `reach`, and T109 replaces the stub with `settle`.

Order:

1. **`Turn` with one part.** Change `Accepted` to `{ turn }`, `Turned` to carry it, add `Published.why` and
   `turnsOf`. No behaviour changes; every existing test passes. This unblocks T77a (root emits are `parts[0].emits`)
   and T106c (the judge reads `turnsOf`) before the walk exists.
2. **The walk for raise and notify** into one root trait, with table 3.3.
3. **Exits and fillings.**
4. **`.each` fan-out** with the skip row, and the hook for `whenAbandoned` parts (cause `Abandoned`), fed by a stub.

Risk, highest first: row 5 and row 12 depend on fragments' `settle`, which does not exist, so the hook's shape is a
guess until T109; the per-part allocation on the 0.2 ms turn; `armOn` per part scope (section 8, open 2).

Spike first, in a scratch file: table 3.4's turn through a walk written against the table, measuring the single-part
turn against today's bench number. If the single-part turn slows by more than the bench's noise, `parts` stays a
one-element constant for turns whose alternative has no raises, notifies, emits or exit.

## 6. Testing strategy

- **The sequence test (catches a wrong order).** One Story on a fixture built so every row of table 3.2 leaves a
  distinct mark: a source that patches, emits, raises into a two-copy `.each` whose copies exit into a host filling
  that starts a lookup, moves state, arms a schedule on entry, sends to a second actor, and has a context dependent.
  The expected value is the ordered list of marks, written from table 3.2 without running the code: the evidence
  batch's record kinds in order, then the listener calls, then the commands. Any two rows swapped changes the list.
- **The parts table test.** `runTurn` on table 3.4's input returns exactly the five rows, compared whole. One table
  per rule R2, R5, R6: each row is an input and the expected `Turn` or refusal.
- **Generated walks.** A generator of small compiled trees (depth to 3, up to 3 copies, raises and notifies chosen at
  random) checks I1 to I5 and that the after memory equals the before memory plus the patches folded in walk order.
- **Dimensions earlier reviews missed:** two and three copies in a non-sorted key order; a turn whose source is an
  ancestor's handler, not the leaf's; a late ending as the source; a firing as the source; a part that both moves and
  is raised (the changer is a child, not the source); two actors turning in one step, so `turnsOf` must pair by actor.
- **Planted faults** (`nub run faults`): emits delivered before the publication; raises after notifies; a payload
  mapper given the after memory; the second state changer winning; a refused turn that keeps its first part's emit;
  `turnsOf` pairing with an `Other` publication. Each must fail one named test.
- **Guard:** a type test that no evidence record other than `Turned` has a field of type `Emit` or a turn payload; a
  lint scope rule that only `serve.ts` imports the applier's steps and only `turns-of.ts` reads `Published.why`.
- **Bench:** the single-part turn (must stay at today's figure within noise) and a five-part turn.

## 7. Handoff for the Opus lead

**Task: Turn parts.** Read first: this file's tables 3.2 and 3.3; `src/core/turn.ts`; `src/core/serve.ts` 203-365;
@plan.Machines.O3; spec-fragments 3.3 for `settle`'s inputs. Decided by the user: this Task precedes T109. Proposed
here and to be confirmed: everything else.

Open, settle before code: section 8's open questions 1 and 2.

First commit, requirements as failing checks: the parts table test for table 3.4 (fails: `Accepted` has no `turn`),
the sequence test's expected list from table 3.2 (fails on the missing emit and listener marks), and the I1/I2
property on `turnsOf` (fails: no `why`). Second commit: step 1 of section 5, which turns the property green and
leaves the other two red until the walk lands.

## 8. Proposed decisions, traces, open questions, sidecar log

**PD1. One `Turn` value is the turn's only record; `Act.Emitted` is not added and `Published` gains only `why`.**
Trace A: a number input's `Commit` turn emits `change`: `parts[0].emits` holds it, `Turned` carries it, the host's
emit consumer reads it from `turnsOf` after the world is set; the trace prints an `emit` line derived from the same
record. Trace B: a refused turn: `runTurn` returns `Refused`, no `Turned` is written, no listener runs, the judge
sees one `Published` with `why: "Other"` carrying the issue. Reverse by adding `Act.Emitted` and a payload field on
`Published`; two more writers.

**PD2. Within a part the order is emits, raises, notifies, exit; parts are recorded in pre-order.**
Trace A: `CancelAll` emits `cancelling` and raises `Cancel` into two copies that each emit `cancelled`: listeners
hear `cancelling`, `cancelled(r2)`, `cancelled(r1)`. Trace B: a child's exit fills a host handler that emits
`closed`: it is heard after the child's own emits. Reverse by interleaving emits with raises in written order; only
row 4 changes. The prototype fixed raises, notifies, exit; where emits sit among them is this design's call.

**PD3. A walk that would visit the same `(address, alternative, from)` twice refuses the turn.**
Trace A: a host filling raises back into the copy that exited: refused as `InvalidTurn` naming the raise's slot.
Trace B: a fan-out into fifty copies: fifty addresses, accepted. Reverse by a numeric depth bound.

**PD4. `armOn` and `disarmOn` match each part's own event in that part's scope.**
Trace A: a raised `Cancel` in a copy whose schedule lists it in `disarmOn` disarms that copy's schedule only.
Trace B: the source event `CancelAll` arms nothing in the copies. Reverse by matching only the source's event.

### What each depending design changes

- **fragments.** Its case, traced: raise into `uploads[r1]`, its exit fills `onGone`, r1 ends: parts 0 to 2, then
  `settle` at row 5 appends the `Abandoned` part; an `unsettled` list is row 12. What it must change: its spike
  (section 5, step 1) becomes this Task; `Emitted { address, … }` becomes `PartRun.emits` plus `PartRun.address`; say
  `whenAbandoned` parts run only for instances ended inside a turn (its lines 91-92 against its PD3).
- **boundary channels.** Its case, traced: root `emit` at row 4 of part 0; delivered at row 15. What it must change:
  `emitsOf` in `serve.ts` step 1 becomes row 4 of the walk; drop `Act.Emitted` (its step 3); the host consumer reads
  `turnsOf`; T77a lands after this Task's step 1, not before the Task.
- **static rules.** Its case, traced: judge gets `Turn.parts[0].event`, `Turn.context` and `after` from one
  `TurnView`, in batch order. What it must change: its `Published` host type is built from `turnsOf` and
  `Published.why`; the core's publication record grows `why` only; its spike question is closed except for the full
  snapshot (open 3).
- **schedules.** Its case, traced: a firing is a source like any event; `schedules.turned` runs once at row 11 with
  exits, arms and disarms gathered from every part. What it must change: nothing in `decide`; `arms` and `disarms` now
  come from several scopes (PD4), so the Declared-schedules Task's tests need a raised-event row.
- **reads and operations.** Its case, traced: an ending is heard at row 0, before `runTurn`; a refusal publishes from
  `refusal`, after the hearing. What it must change: its W2 and its lines 132-133 disagree; the code's order is hear,
  turn, publish (`serve.ts` 387, then 428), and row 0 keeps it.
- **cohesion.** Its case, traced: build order step 7. What it must change: T77a and T106c may start after this Task's
  step 1.

### Open questions

1. **Riskiest: the `settle` hook.** Rows 3, 5 and 12 call into fragments' `settle`, which is designed but not built.
   If `whenAbandoned` parts can raise, row 5 re-enters row 4 and the walk is no longer one pass. This design assumes
   they cannot (they patch and notify only). The user or the T109 lead must confirm before step 4.
2. Whether a raised event selects the implicit "self" in a child (PD4 assumes yes).
3. Whether the judge's `Snapshot` needs lane rows that `Published` does not carry. Not designed here.
4. Whether `Evidence.Turn`'s public shape changing (`event` and `parts` derived) is a public API change for the user.

### Needs the user

PD1 and PD2 (PD2 fixes an order users can observe through emits). PD3 and PD4 are implementation calls an agent may
make. The Task itself is already the user's decision.

### Not verified

- The last prototype's order was taken from a sidecar's reading of `prototypes/round-14x/turn.ts` and checked only
  against the Plan's text, not re-read line by line.
- No spike was run; the allocation cost is unmeasured.
- `wk format` and `wk check` were not run on this file.

### Sidecar log

- **dependents.** Finding: boundary places `emitsOf` in `runTurn`'s step while fragments says emits need the walk.
  Result: accepted. Why: read boundary 151-156 and line 72 myself; resolved by row 4.
- **dependents.** Finding: static rules: host builds `Published` (302) against "the core's record may grow" (325).
  Result: accepted. Why: read 302-326 and 484-489; resolved by `why` and `turnsOf`.
- **dependents.** Finding: reads and operations W2 against lines 132-133 on publish and row order. Result: changed.
  Why: did not read those lines; checked the code's order in `serve.ts` 371-428 and cited that instead.
- **dependents.** Finding: fragments 91-92 against PD3 on `whenAbandoned` at actor end. Result: accepted. Why: read
  PD3; an actor's end is no turn, so no parts.
- **dependents.** Finding: schedule occasion names differ between fragments and the schedules design. Result:
  rejected. Why: naming only; no order depends on it.
- **prototype.** Finding: prototype part order: resets, raises, notifies, exit. Result: accepted. Why: matches Plan O3
  lines 327-330, which I read; line numbers unverified.
- **prototype.** Finding: no raise depth cap in the prototype. Result: changed. Why: not verified; the walk gets the
  cycle row regardless.
- **prototype.** Finding: `Alternative` has no raise, notify or exit field. Result: accepted. Why: confirmed in
  `turn.ts`'s use of `Alternative`.
- **prototype.** Finding: Turn.spec states no order of notify against exits. Result: accepted as a gap. Why: R2 states
  it.
- **adversary.** Finding: one `owner` and one `move` cannot own several parts' work. Result: accepted. Why: read
  `serve.ts` 285-296; owner is now per part (3.2).
- **adversary.** Finding: the apply list drops issue clearing and the early `setIncarnation`. Result: rejected. Why:
  both are row 9; my brief to it was shorter than the table.
- **adversary.** Finding: nothing publishes for the actor between `Turned` and its `Published`. Result: accepted. Why:
  grepped `publish(`: the wave (`incarnations.ts` 83) and `firings.ts` 67 publish later, as `Other`.
- **adversary.** Finding: refusals and denied endings publish with no `Turned`. Result: accepted. Why: `serve.ts` 188
  and 234; they are `why: "Other"` (I2).
- **adversary.** Finding: the Plan asks for `emit` evidence; folding emits into `Turned` changes it. Result: changed.
  Why: read `Machines.plan` 218; the public record stays, derived (3.1).
- **adversary.** Finding: the cycle rule refuses a fan-out if the address omits the key. Result: accepted. Why: 3.3
  says the address includes the key.
- **adversary.** Finding: a refused walk could leak earlier parts' emits. Result: rejected. Why: already R4: a `Turn`
  exists only when accepted.
