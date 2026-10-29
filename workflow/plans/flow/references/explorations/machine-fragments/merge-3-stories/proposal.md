# Proposal: Stories for fragments and server calls

Status: proposal, not accepted; merge 3 into [machine-design.md](../machine-design.md), after
[merge-1-outcomes.md](../merge-1-outcomes.md) and [merge-2-server-calls](../merge-2-server-calls/proposal.md). No
`.plan` file changes until it is accepted. It makes Stories ([Testing.plan](../../../../Testing.plan)) cover what the
design and the two merges added: traits and subroutines inside a machine and alone, `.each` copies and their lives,
resumable traits, server-call endings, lanes, late routing, keyed schedules, fixture truth and restore mid-write.
Every addition is checked against the accepted playback design ([playback.md](../../playback.md), whose contract is
Testing O4 and O9); section 3.11 says how each one appears in playback, or why it does not. There is no spike yet; the
code here is examples only. Model-based exploration (`model()`, Testing O5) and the
design's T1 additions are removed by the owner and are not used or replaced here. Nothing here is decided: every
choice the owner has not confirmed is listed in section 9.

Citations. Paths are relative to `workflow/plans/flow/`:

| Short | File |
| --- | --- |
| `T` | `Testing.plan` |
| `Op` | `Operations.plan` |
| `Mc` | `Machines.plan` |
| `Rt` | `Runtime.plan` |
| `In` | `Inspection.plan` |
| `Pk` | `Package.plan` |
| `D` | `references/explorations/machine-fragments/machine-design.md` |
| `EA` | `references/explorations/machine-fragments/merged/each.md` |
| `M1` | `references/explorations/machine-fragments/merge-1-outcomes.md` |
| `M2` | `references/explorations/machine-fragments/merge-2-server-calls/proposal.md` |
| `RQ` | `references/explorations/machine-fragments/merge-2-server-calls/requirements.md` |
| `SS` | `references/explorations/machine-fragments/merge-2-server-calls/spike/stories.ts` |
| `SF` | `references/explorations/machine-fragments/merge-2-server-calls/spike/flow.ts` |
| `PB` | `references/explorations/playback.md` (accepted) |

## 1. The problem

A Story's assertions read three sources: the **snapshot** (what views see), the **evidence** (what the Runtime
decided) and the **fixture** (what the server holds). The design and merges 1 and 2 put new facts in each source,
but Testing.plan gives no read for most of them, and in two places they contradict it.

- **G1. Fixture truth has no capture form.**
  - Merge 2 checks server truth with a predicate:
    `.checkpoint("paid", ({ truth }) => truth.FakeStripe.charges === 1)` (`M2:380`). It lists this as added Testing
    API (`M2:525`) and as an amendment to Testing O2 and O3 (`M2:603`).
  - That contradicts Testing O1, "Scenario commands accept no arbitrary callbacks" (`T:17-18`), and O4,
    "checkpoint(name) captures immediately without processing" (`T:75`).
  - Stateful fixtures with server truth already exist (`T:63-64`). The property-test oracle "reads fixture server
    truth directly" (`T:147`). A Story checkpoint has no such read.
  - The requirements ask Stories to "assert server truth" (`RQ:102-103`). Today those assertions are written as
    comments (`RQ:133`).
- **G2. Endings, lanes and late routing are not on the cut.**
  - Merge 2 routes an ending when its turn is admitted, as current or late (`M2:395-400`).
  - It keeps a lane per transaction and key, with `pending` and `retryCount` (`M2:430-442`).
  - It adds `StillUnknown` (`M2:415-417`) and `NotSent { why }` (`M2:45`).
  - Testing's cut names only "attempts where applicable" among pending work (`T:84-85`), and defers lanes to
    Operations O6 (`T:89-90`). Operations O6 says "Transactions have outcomes, never lanes" (`Op:162`). So
    `pay.pending(checkpoint.snapshot, key)` (`M2:145`, `M2:228`) is unspecified on a captured snapshot.
  - The spike prints these facts only as trace text (`M2:665`, `M2:690`).
  - The trace keeps 4,096 recent events (`In:101`). Only repairs, skips and diagnostics are kept cumulatively on
    a cut (`T:91`).
- **G3. A Story of a whole machine cannot see what its fragments did.** Observation is specified only for a fragment
  tested alone (rule 11, `D:468-471`). Inside a host:
  - Callbacks run as parts of the turn (`D:350-353`). Whether `onLocked` fired, for which `.each` key and with which
    payload, is not readable.
  - An exit taken by a subroutine is not readable. `checkpoint.exit` exists alone only (`D:470`).
  - Lives "appear only in Inspection and Stories" (`EA:231`), but Testing has no read for them. So these rules
    cannot be checked:
    - "a delivery reaches the incarnation it was started or armed under" (`D:450-455`);
    - a late delivery for a removed row is dropped "even if the key was added again" (`D:1159-1160`).
  - A frozen resumable slice "stays present" (`D:76`), so frozen and active look the same.
  - A pending reset runs as its own follow-up turn (`D:369-376`), but a frame's cause is only "the command … or the
    publication sequence" (`T:73-74`).
  - List repairs and dropped raises are "Story-derived" warnings (`D:460-461`, `EA:208-214`), but Testing does not
    name them as evidence kinds (`T:91`).
  - The lockout example asserts `run.calls` per checkpoint (`D:1018-1019`), while rule 11 defines it per run
    (`D:469`).
- **G4. Clock and ordering rules are not exact enough.**
  - The mailbox race (spike P1) needs a stand-in command, `advanceHeld` (`SS:106`, `SF:462`), because the spike's
    `advance` drains every 10 ms (`SF:460`). Testing's `advance` already makes work eligible without draining it
    (`T:49-51`). What it does not say:
    - in which order arrivals are admitted when one `advance` passes several deadlines;
    - whether a fixture's wake-up is eligible work.
  - It does not say whether a fixture's sleep is a "pending deadline" for `advanceToNextTimer` (`T:48-49`).
  - A frozen schedule keeps its `dueAt` and is not delivered (`D:352-355`). `advanceToNextTimer` "stays at now when
    already due" (`T:49`), so an overdue frozen deadline would pin it there forever.
  - Keyed schedules (`M2:352-366`, `M2:461-463`) have no snapshot path for a key's `dueAt` (`D:67-75`). The
    equal-deadline order (`Mc:119-120`) has no key tiebreak; `.each` copies use list order (`D:455`).
- **G5. Some endings cannot be produced, and restore mid-write cannot be checked.**
  - `NotSent { why: "Cancelled" }` before invocation on a `reject` or `allow` commit has one window: the storage
    acknowledgement (`M2:477-478`). Story storage is "always … a fresh in-memory KeyValueStore", which fixtures may
    only seed (`T:64-66`). The spike invents an actor option, `ackDelayMs` (`SS:292`, `SF:291`).
  - `Restored` endings (`M2:484`) need a reload. Only App Stories have one (`T:165-172`), and nothing says so.
  - Tabs are "independent Runtimes of the Story's setup … Tabs share nothing else" (`T:166-172`). If fixtures are
    acquired per tab, the reopened tab talks to another fake server, and "charged once across a reload" cannot be
    checked.
- **G6. The fragment Story is under-specified, and misnamed.**
  - `story.machine(fragment)` (`D:468`, `D:1324`) reuses a contract for "one fresh actor" with `input`, `context`,
    `services` and `fixtures` (`T:9-11`). Fragments declare no operations, context or I/O (`D:279`).
  - A Story id is "unique within its App" (`T:12-13`), and discovery is per App and rejects "incompatible machines"
    (`T:32-34`). A library fragment belongs to no App.
  - A trait Story starts active (`D:1012-1017`). A subroutine Story starts with `.enter({})` (`D:1093`). Neither
    rule is stated.
  - `.leave()` is defined only for subroutines (`D:470-471`). So for a trait alone, "`run.calls` … including
    `whenAbandoned`" (`D:469`) cannot happen, and `.resumable()` cannot be tested alone.
  - Rule 11 lets a fragment Story send host events (`D:469`). Testing allows "Only public events" (`T:25-26`).
  - The harness "fills every port with a recording harness" (`D:468`). It does not say what a harness guard answers
    or what a harness exit does, and offers no way to refuse at a guard.
  - The Confirm example names a checkpoint `end` (`D:1093-1094`), beside the run's own `end` capture (`T:75-76`).
- **G7. Sends to fragment events and keyed copies are not in Testing, and their verdicts are lost.**
  - The design sends `E.invites.key("invite-2").Changed(…)` in a Story (`D:1155-1156`) and has views send
    `E.CANCELLING.Yes()` (`D:1088`). Testing has only `send(event)` and `send(ref, event)` (`T:24-26`).
  - Denied and Unhandled events "publish nothing" (`Mc:80`), and consecutive identical frames collapse (`T:72`). So
    the frame that would show "a keystroke sent for a row removed a moment earlier is `Unhandled`" (`D:1159`) can
    disappear. The spike reads the verdict with a live `a.check` (`SS:191`).
- **G8. What `send` runs is inconsistent.**
  - The design's Testing amendment says "`send` runs its turn; `process()` drains operation work and due timers"
    (`D:1324`). Testing does not say that `send` runs anything (`T:21-29`, `T:42-51`).
  - A pending reset runs as a follow-up turn at the head of the mailbox (`D:372-374`). It is unclear whether `send`
    includes it.
  - The spike's `send` drains the whole mailbox (`SF:458`).

- **G9. Playback has gaps caused by fragments, merge 1 and merge 2.** Playback renders the real app from frames
  (`PB:24-28`, `T:100-108`).
  - **A fragment Story has nothing to render.** `StoryFrame` renders "the application … below its FlowProvider"
    (`T:106-107`). A trait or subroutine Story has no App, no ref and no component. `useActor` returns only "its pure
    pre-attach snapshot" (`T:104`), and letting a Story's actor stand in for a component's actor is an open question
    in playback itself (`PB:195-196`).
  - **Buttons gated by a lane render wrongly.** Eligibility in a frame "uses production checks" (`T:107-108`). Merge
    2's `pay.idle(key)` is a guard over lanes (`M2:144`). If the frame's snapshot carries no lanes (`Op:162`, G2), a
    disabled Pay button renders enabled.
  - **Stepping by command breaks when frames collapse.** The player steps "by frame, command or scene" (`T:214`) and
    finds the next command from each frame's cause (`PB:133-134`). A Denied or Unhandled send makes an identical frame
    that collapses (`T:72`, `PB:81`). If its cause goes with it, the command disappears from playback (G7).
  - **The next-action highlight meets keyed and subroutine events.** The player "highlights the control whose click
    would send the Story's next event" (`T:221-222`). The event may now be `E.invites.key(k).Changed` or
    `E.CANCELLING.Yes()` (`D:1155-1156`, `D:1088`). The comparison has to include the instance path and key, and that
    is unstated.
  - **A closed tab has no defined frame.** `tab selects a tab's cut` (`T:108`), and `closeTab` ends a tab abruptly
    (`T:168-169`). Merge 2's reload Stories (G5) play frames between `closeTab` and `openTab`. What `StoryFrame tab`
    renders for a tab that is absent from the frame is not specified.
  - **Advancing time shows no reason.** An `advance` that admits arrivals without running turns (G4) produces a frame
    whose snapshots are unchanged. Only `now` and pending work differ. Testing's pending work does not list admitted,
    not-yet-run arrivals, so the mailbox race is invisible in the overlay.

The spike's runner reproduces data flow well, but five of its affordances are not Story API and must not leak into
the plans:

- `advanceHeld`;
- the `ackDelayMs` actor option;
- an `advance` that drains;
- live `a.state`, `a.memory` and `a.laneCount` reads (`SS:325`);
- a conditional send inside a loop (`SS:127`), forbidden by `T:17`.

## 2. Where the data comes from

| Fact the author checks | Real source | How a Story reads it |
| --- | --- | --- |
| Fragment memory, schedules and `dueAt`, `.each` copies by key | the published snapshot (`D:67-76`) | `checkpoint.snapshot` (`T:82-83`), owner-typed (3.9) |
| Private fields | the snapshot; outside types omit them (`D:233`, `D:1314`) | `checkpoint.snapshot`, typed with them |
| Callbacks told, exits taken, `whenAbandoned` notifications | the Runtime's turn parts (`D:350-376`) | `checkpoint.calls` (3.3) |
| Lives, frozen state, resets, list repairs, dropped deliveries | the Runtime's fragment bookkeeping (`D:450-458`, `EA:208-231`) | `checkpoint.lives` and the cut's cumulative evidence (3.4) |
| A send's verdict | the turn's selection (`Mc:78-81`) | the frame cause (3.8) |
| An ending: channel, reason, Attempt, current or late | the classifier (`M1:214-227`) and admission (`M2:395-400`) | `checkpoint.endings` (3.6) |
| A lane's `pending`, `retryCount`, phase | the lane (`M2:430-442`) | `pay.pending(checkpoint.snapshot, key)`; `checkpoint.pending` (3.6) |
| What the server holds | the stateful fixture (`T:63-64`) | `checkpoint.truth` (3.5) |
| Time and deadlines | the Runtime Clock; the controlled clock in Stories (`T:37-40`, `M2:56`) | `checkpoint.now`, `checkpoint.pending` (3.7) |
| Acknowledgement of an Attempt | storage (Persistence O6; `M2:478`) | produced by `Fixture.storage` (3.7) |

| What playback shows | frames recorded once, rendered by `StoryFrame` (`PB:24-28`, `T:209-212`) | the same cut reads; section 3.11 |

Every read is captured at the cut. A read starts no work and cannot resume the Runtime (`T:94`). Playback renders
these same cuts and never re-executes (`T:211-212`), so anything readable on a cut can be shown in the overlay
without new execution.

## 3. Public design

### 3.1 Three kinds of Story

| Kind | Subject | Real | Replaced |
| --- | --- | --- | --- |
| `story.app(setup)` | the App | all wiring | services, by fixtures |
| `story.machine(machine)` | one actor, **fragments embedded** | the machine, every fragment, every filling | services, by fixtures |
| `story.trait(T)`, `story.subroutine(S)` | one fragment, **alone** | the fragment and the children its own body fills | the host: the fragment's own ports are a harness |

"In its host, replacing nothing" is `story.machine(Host)`. "Alone, with a harness" is `story.trait` or
`story.subroutine`. There is no form that stubs one fragment inside a host:

- Rule 10 promises that a fragment with the same contract and summary cannot break its host (`D:463-467`).
- `flow check` checks hosts against summaries.

A minimal test host is an ordinary machine, discovered through `defineConfig({ stories })` (3.10).

### 3.2 A fragment alone

```ts
// lockout.story.ts: a trait alone is active from the start
const L = Lockout({ limit: 2, length: "1 minute" })
export const locks = story
  .trait(L, { id: "Lockout/locks-then-clears" })          // ← NEW: replaces story.machine(fragment)
  .send(L.E.Strike()).send(L.E.Strike())                  // events and hostEvents; internalEvents are type errors
  .checkpoint("locked")
  .advance("1 minute").process()
  .checkpoint("cleared")
// locked.calls.onLocked has one record; cleared.calls.onUnlocked has one record (3.3)

// field.story.ts: a trait's Flow.input fields are supplied up front, as the host's input: filling would
const F = Field(Schema.String, { validate: sixDigits })
export const typed = story.trait(F, { id: "Field/typed", input: { value: "" } })   // ← NEW
  .send(F.E.Changed({ value: "12" }))
  .checkpoint("short")                                    // short.snapshot.memory.error.code === "CodeFormat"

// confirm.story.ts: a subroutine alone starts outside
export const yes = story
  .subroutine(Confirm, { id: "Confirm/yes" })             // ← NEW
  .enter({})                                              // its Input record (kept)
  .send(Confirm.E.Yes())
  .checkpoint("answered")                                 // answered.exit → { exit: "Confirmed", payload: {} } (kept)

// cooldown.story.ts: leaving and returning, for a trait
export const frozen = story
  .trait(Countdown({ length: "30 seconds" }).resumable(), { id: "Cooldown/frozen" })
  .send(E.Start())                                        // armed: dueAt = now + 30 s
  .leave()                                                // ← NEW for traits: frozen, because resumable
  .advance("1 minute").process()                          // nothing fires while frozen
  .checkpoint("away")                                     // away.lives → { life: 1, frozen: true }
  .enter()                                                // ← NEW for traits: resumed
  .process()
  .checkpoint("back")                                     // the overdue firing ran once (D:352-354)
```

- Options are `{ id, input?, guards? }`. There are no `context`, `services` or `fixtures`, because fragments have no
  I/O (`D:279`).
- **Trait Story.** The trait is placed at the harness root and is active from the start.
  - `.leave()` leaves that root. A resumable trait freezes; any other trait ends, and its `whenAbandoned` runs.
  - `.enter(input?)` enters the root again. A frozen trait resumes; otherwise a new life starts.
- **Subroutine Story.** The slice is `undefined` until `.enter(input)`.
  - An exit or `.leave()` ends the life.
  - Until the next `.enter`, sends are `Unhandled`.
- `checkpoint.exit` exists only on subroutine Stories. It is the exit that ended the current or last life, or
  `undefined` while it runs or after `.leave()`.

### 3.3 What a fragment told: `checkpoint.calls`

```ts
// alone (subject: Lockout)
run.checkpoints.locked.calls.onLocked          // ← NEW place; was run.calls.onLocked
// → [{ payload: {}, life: 1, turn: 2, by: "transition" }]
run.checkpoints.locked.calls.timer.onDone      // a nested child's callback, filled by Lockout's own body
// → []

// in a host (subject: SignInMachine): the same read, by instance path
run.checkpoints.thirdStrike.calls.challenges.onLocked         // ← NEW
// → [{ key: "c1", life: 1, payload: {}, turn: 7, by: "transition" }]
run.checkpoints.signedOut.calls.ADDRESS.onDraft
// → [{ life: 2, payload: { address }, turn: 11, by: "whenAbandoned" }]
run.checkpoints.kept.calls.CANCELLING.Declined                // exits are recorded at the subroutine's path
// → [{ life: 1, payload: {}, turn: 4, by: "exit" }]
```

- One record per callback notification, `whenAbandoned` notification or exit taken, in every Story kind.
- Records are cumulative up to the cut and retained with it, as repairs are (`T:91`). Trace truncation (`In:101`)
  cannot hide them.
- `turn` is an evidence sequence position, not a copy (`T:74`).

### 3.4 Lives and fragment evidence: `checkpoint.lives`

```ts
run.checkpoints.reAdded.lives.challenges        // ← NEW: copies in key order, as s.memory.challenges
// → [{ key: "c1", life: 2, frozen: false }]
run.checkpoints.back.lives.resendCooldown       // → { life: 1, frozen: true }
run.checkpoints.back.lives.code                 // → undefined (inactive: dropped, not frozen)
```

The cut's cumulative evidence (`T:91`) gains these fragment kinds, each with path, key and life:

- `listRepair`: a duplicate key or a key past `max` (`EA:208-210`).
- `droppedDelivery`: a delivery to a dead life (`D:450-455`).
- `droppedRaise`: a raise into an absent key in a delivery turn (`EA:213-214`).
- `reset`: with source `"resetOn"` or `"pendingReset"`.

A frame caused by a follow-up reset turn names the cause `"pendingReset"` (`T:73-74`).

### 3.5 Server truth: `Fixture.stateful` and `checkpoint.truth`

```ts
// fixtures/fakeStripe.ts
export const FakeStripe = (o: { script?: ReadonlyArray<ChargeResponse>; dropFirst?: boolean }) =>
  Fixture.stateful({                                                     // ← NEW
    id: "FakeStripe",                                                    // the key on the cut; a literal
    truth: Schema.Struct({ charges: Schema.Int, keys: Schema.Array(Schema.String) }),   // ← NEW: what a cut captures
    initial: { charges: 0, keys: [] },
    layer: (truth) => Layer.effect(StripeApi, makeFakeStripe(truth, o)), // truth is a Ref the fake server updates
  })

// checkout.story.ts
export const busyThenPaid = story
  .machine(Checkout, { id: "Checkout/busy-then-paid", fixtures: FakeStripe({ script: [{ status: 503, retryAfterMs: 2000 }] }) })
  .send(E.Pay()).advance("3 seconds").process()
  .checkpoint("paid")                                                    // a capture, not a predicate

// the test, outside the plan
expect(run.checkpoints.paid.truth.FakeStripe).toEqual({ charges: 1, keys: ["a1", "a2"] })   // ← NEW read
```

- `truth` is a Schema, so captured truth encodes into exported evidence and redaction applies (`T:95-96`, `In`
  O5).
- Every cut captures every stateful fixture's truth, as it captures `now`.
- The property-test oracle (`T:133-135`, `T:147-148`) reads the same `truth`.

### 3.6 Endings and lanes on the cut

```ts
run.checkpoints.reconciled.endings                         // ← NEW: cumulative, in admission order
// → [
//   { operation: "Stripe.confirm", key: { intentId: "pi_1" }, attempt: { id: "a1", retryCount: 0 },
//     channel: "unknown", reason: { _tag: "NoResponse" }, event: "Unsure", route: "current", owner: "PAYING#1", turn: 3 },
//   { …, attempt: { id: "a1", retryCount: 1 }, channel: "unknown", reason: { _tag: "StillUnknown", failure: { _tag: "Busy" } }, … },
//   { …, attempt: undefined, channel: "failure", reason: { _tag: "NotSent", why: "Rejected" }, … },
//   { …, channel: "success", event: "Paid", route: "late", owner: "PAYING#2", from: "root", turn: 19 },
// ]
run.checkpoints.reconciled.pending                         // existing (T:84-85), now with lanes
// → [{ kind: "lane", operation: "Stripe.confirm", key: { intentId: "pi_1" },
//      attempt: { id: "a1", retryCount: 2 }, phase: "invoked", waiting: 0, owner: "PAYING#3" }]   // ← NEW entry kind

pay.pending(run.checkpoints.reconciled.snapshot, { intentId: "pi_1" })   // existing read (M2:145) on a captured snapshot
check(run.checkpoints.reconciled.snapshot, E.Pay())                       // existing pure check (Mc O4)
```

- `owner` names the owning activation, as `STATE#n`.
- `from` is the surviving ancestor where late routing started (`M2:398-400`).
- A late turn's `LateMayNotLeave` refusal (`M2:401-403`) appears among that turn's denial reasons.
- Attempt ids come from the run's seeded source (`T:37-39`), so they are stable across replays.

### 3.7 Time, deadlines, acknowledgement and tabs

```ts
// P1, the mailbox race, with no extra command
export const lateWrongCode = story
  .machine(SignIn, { id: "SignIn/late-wrong-code", fixtures: FakeAuth({ answerAt: "15005 millis", status: 401 }) })
  .send(E.PasswordAccepted({ challengeId: "c1" })).send(E.code.Changed({ value: "123456" })).send(E.Submit())
  .advance("15020 millis")     // StopWaiting (15.000) then CodeWrong (15.005) are admitted; no turn runs yet
  .process()
  .checkpoint("struck")
// struck.endings[0].route === "late"; struck.lives.challenges → [{ key: "c1", life: 1, frozen: false }]

// cancel before invocation, and a reload mid-write
export const cancelEarly = story.app(setup, {
  id: "Upload/cancel-before-send",
  fixtures: [FakeUploads({ tombstones: true }),
             Fixture.storage({ acknowledge: "50 millis" })],   // ← NEW: acknowledgements wait on the controlled clock
})
  .ensure(uploadRef).send(uploadRef, E.Pick())
  .advance("20 millis").send(uploadRef, E.Cancel()).process()
  .checkpoint("cancelled")     // endings: NotSent { why: "Cancelled" }; truth.FakeUploads.files is empty

export const reloadMidCharge = story.app(setup, { id: "Checkout/reload", fixtures: FakeStripe({}) })
  .ensure(checkoutRef).send(checkoutRef, E.Pay())
  .advance("200 millis").closeTab("main").openTab("main")   // the same fake server: fixtures are run-scoped
  .process()
  .checkpoint("restored")      // endings: unknown, reason Restored, routed after readiness (M2:484)
```

- Every controlled-clock sleep in the run is a pending deadline:
  - Flow schedules: named, keyed and `.each`;
  - Flow's own waits;
  - fixture sleeps, listed with owner `fixture:<id>`.
- A frozen schedule is listed with `frozen: true`.
- A keyed schedule's deadline reads at `s.schedules.<name>[key].dueAt` (← NEW path).

### 3.8 Sends and verdicts

```ts
story.machine(Signup, { id: "Signup/invites" })
  .send(E.AddInvite())
  .send(E.invites.key("invite-2").Changed({ value: "grace@example.com" }))   // a copy's public event
  .send(E.RemoveInvite({ key: "invite-2" }))
  .send(E.invites.key("invite-2").Changed({ value: "x" }))                   // Unhandled: the row is gone
  .checkpoint("removed")
// run.frames[i].cause → { command: "send", event, verdict: "Unhandled" }    // ← NEW field; kept through collapse
```

### 3.9 Harness defaults and a refusing guard

```ts
const F = Field(Schema.String)
export const locked = story
  .trait(F, { id: "Field/locked", input: { value: "" },
              guards: { canEdit: deny("LockedOut") } })   // ← NEW option: a verdict, true | Flow.Denial
  .send(F.E.Changed({ value: "1" }))                      // verdict { Denied: [{ code: "LockedOut" }] }
  .guards({ canEdit: true })                              // ← NEW command: later turns read the new verdict
  .send(F.E.Changed({ value: "1" }))                      // Allowed
  .checkpoint("edited")
```

### 3.10 Discovery

```ts
export default defineConfig({
  apps: [{ app, stories: appStories }],
  stories: [lockoutStories, confirmStories, testHostStories],   // ← NEW: Stories that belong to no App
})
```

### 3.11 Playback

The accepted playback design constrains this proposal in three ways:

- recording is the only execution (`PB:24-28`, `T:211-212`);
- a frame is a cut (`T:70`);
- the overlay's Inspect shows "the frame's cause, gaps and the run's evidence for it, or evidence unavailable beyond
  the trace's retained window" (`T:215-216`).

So every addition here is data on the cut, or a field of a frame's cause. None of them needs playback to run
anything.

```tsx
// a machine Story with fragments: plays like any other; nothing new to write
<StoryPlayer run={await lateWrongCode.run()}><SignInPage /></StoryPlayer>

// a fragment Story: its frames exist, but it has no app to render
<StoryPlayer run={await locks.run()} />          // type error: StoryPlayer takes App and machine Story runs only
definePresentation(locks, { scenes: [] })         // type error, for the same reason
run.frames                                        // still readable: Inspect data, agent text frames (PB:186-187)
```

| Addition | How it appears in playback |
| --- | --- |
| **Send verdicts** (rule 4) | Part of the frame's cause, so Inspect shows "send E.Submit: Denied [StillChecking]". A collapsed frame keeps every cause in order, so stepping by command (`T:214`) still visits every send, including Denied and Unhandled ones. The next-action highlight (`T:221-222`) compares the clicked event with the next command by tag, instance path and key: a click on row `invite-3` does not match a command for `invite-2`. |
| **`"pendingReset"` cause** (3.4) | With `frames: "publication"` (`T:71`), the follow-up reset turn is its own frame, so the one-snapshot lag is visible while stepping. With the default per-command frames, the reset is inside the send's frame, because `send` runs it (rule 4). |
| **Lanes on the snapshot** (rule 8) | Required by playback: `StoryFrame` eligibility uses production `check()` (`T:107-108`), and `pay.idle(key)` reads lanes, so buttons render disabled while a write is in flight. Inspect lists lane entries under pending work. |
| **`checkpoint.endings`** (3.6) | Inspect shows the endings admitted up to the frame, current or late. These are cut records, not trace events, so they stay available beyond the trace window. "Evidence unavailable" (`T:215-216`) still applies to the trace view only. |
| **`checkpoint.calls`, `checkpoint.lives`** (3.3, 3.4) | Inspect shows them for the frame. They are retained with the cut, so they never show "evidence unavailable". The rendered UI shows only what views read; lives never appear in view types (rule 6). |
| **`checkpoint.truth`** (3.5) | Inspect shows each fixture's truth at the frame, raw (`PB:170-172`): render only non-sensitive fixture data when sharing. Truth is per run, not per tab, so it is shown once for the frame, not under `tabs.<name>`. |
| **Clock rules** (rule 9) | An `advance` command makes one frame, and its cause is the command. That frame shows the new `now` and, in pending work, each admitted arrival not yet run (`phase: "queued"`), in admission order. That is how the overlay shows a mailbox race. The following `process()` makes one frame (default) or one per publication. Frames inside one `process()` share `now`, which playback's `minDwell` already handles (`PB:160-161`). Scrubbing is a lookup (`T:211-212`), so the clock is never moved while watching. |
| **Run-scoped fixtures and tabs** (rule 11) | `StoryFrame tab` selects a tab's cut (`T:108`). Between `closeTab` and `openTab`, the frame has no cut for that tab: `StoryFrame` renders nothing for it and records a gap named `TabClosed`. After `openTab`, the restored tab renders as any tab does. The fixture's truth is the same before and after, because it belongs to the run. |
| **Fragment Stories** (3.2) | Not playable (above). Playback's own open question (`PB:195-196`) would let a focused Story's actor stand in for a component's actor. This proposal does not extend that to fragments: rendering a fragment would need a component bound to a harness slice, and that is a new rule. |
| **Harness commands** (`.enter`, `.leave`, `.guards`) | Only fragment Stories have them, and those are not playable. |

## 4. Rules

1. **Kinds.** There are four Story constructors: `story.app`, `story.machine`, `story.trait` and `story.subroutine`.
   - `story.trait` accepts only a trait and `story.subroutine` only a subroutine. Anything else is a type error.
   - Fragment Stories take `{ id, input?, guards? }`. `input` is required exactly when the trait declares
     `Flow.input` fields. A subroutine's input goes to `.enter(input)`.
2. **Harness.** In a fragment Story, every port of the subject is filled by the harness. Children the subject places
   are filled by its own body, as in production.
   - A guard port answers its current verdict. The default is `true`. A verdict is `true` or a `Flow.Denial`, never a
     function.
   - A callback port records (rule 5) and does nothing else.
   - An exit port records, then ends the life.
3. **Lifetime alone.**
   - A trait Story starts active at the harness root.
   - `.leave()` leaves the root, and `.enter(input?)` enters it again. Freezing, resuming, ending and new lives follow
     design rule 1 (`D:346-377`) exactly as in a host.
   - A subroutine Story starts outside. `.enter(input)` starts a new life, and `.leave()` abandons it as a host
     transition would.
   - `.leave()` with nothing active, or `.enter` while active, rejects before execution with `InvalidStoryCommand`.
4. **Sends.**
   - `send` accepts public events at any instance path, including keyed copies and subroutine events.
   - A fragment Story's `send` also accepts its subject's `hostEvents`.
   - Internal events and exits are never sendable (`D:1284`).
   - `send` runs the turn it admits, plus the pending-reset follow-up turn that turn's commit queues (`D:372-374`).
     Nothing else runs until `process()`.
   - A send's verdict (`"Allowed"`, `{ Denied: reasons }` or `"Unhandled"`) is part of its frame cause.
5. **Calls.**
   - Every callback notification, `whenAbandoned` notification and exit is recorded as
     `{ payload, life, key?, turn, by }` under `checkpoint.calls.<instance path>.<port>`.
   - Records are cumulative per cut and retained with it.
   - Alone, the path starts at the subject; in a host, at the actor's root.
6. **Lives.**
   - `checkpoint.lives` mirrors the snapshot's slice tree. Each entry is `{ life, frozen }`, plus `key` for copies.
     It is present exactly when the snapshot's slice is.
   - Life numbers are deterministic and appear in no snapshot or view type.
   - The fragment evidence kinds of 3.4 are cumulative per cut.
7. **Fixture truth.**
   - A `Fixture.stateful` declares `id`, a `truth` Schema, `initial` truth and a `layer` built from the truth `Ref`.
   - Every cut captures each declared truth by `id`. Duplicate ids reject before acquisition, as duplicate Tags do
     (`T:57-60`).
   - Checkpoints take no predicate.
8. **Endings and lanes.**
   - Every ending admitted is recorded on the cut, cumulatively and in admission order, with:
     - operation, key, Attempt (or `undefined`), channel and reason;
     - the mapped event;
     - `route`, owner and `from`.
   - Every lane with an outstanding or current Attempt is a `pending` entry with phase `"acknowledging"`,
     `"invoked"` or `"settled"` (settled, ending not yet admitted).
   - A captured snapshot carries lanes, so commit-value reads and `check()` work on it.
9. **Clock.**
   - Every controlled-clock sleep is a pending deadline.
   - `advance`, `advanceTo` and `advanceToNextTimer` move time through deadlines in order. At each deadline the
     woken work runs until idle, fixtures included, and its arrivals are admitted in that order. No turn runs.
   - Equal deadlines enqueue in this order:
     - actor admission order, then outermost state, then declaration order (`Mc:119-120`);
     - then `.each` list order (`D:455`);
     - then key-list order for keyed schedules.
   - A frozen deadline is listed with `frozen: true`, is never due, and is skipped by `advanceToNextTimer`.
   - An admitted arrival whose turn has not run is listed in `pending` with `phase: "queued"`, in admission order.
10. **Storage.**
    - `Fixture.storage({ acknowledge?, seed? })` provides the fresh in-memory KeyValueStore. Its acknowledgements
      wait on the controlled clock.
    - It can neither bypass validation nor open external storage (`T:64-66`).
11. **Scope.**
    - Fixtures are acquired once per run and shared by every tab. Other setup services are acquired per tab's
      Runtime.
    - `Restored` endings are produced only by App Stories, through `closeTab` and `openTab`.
12. **Discovery.**
    - `defineConfig({ apps, stories })` discovers App-free Stories.
    - Ids are unique across the whole configuration.
    - A machine in `stories` needs only its own services. Fixtures provide them.
13. **Snapshot types.** A checkpoint's snapshot is typed with `Flow.private` fields.
14. **Playback.**
    - `StoryPlayer` and `definePresentation` accept App and machine Stories only. A fragment Story is a type error
      there.
    - Collapsed frames keep every cause.
    - The next-action comparison matches the event's tag, instance path and key.
    - `StoryFrame tab` for a tab absent from the frame renders nothing and records the gap `TabClosed`.
    - Inspect shows the frame's cut records (`calls`, `lives`, `endings`, `truth`, `pending`) beside the trace view.

## 5. How it is implemented

On the one production Runtime. Nothing predicts and nothing runs twice.

- **Fragment Stories** wrap the subject in a generated harness machine. Its root places the trait, or holds the
  subroutine as a child state entered by a harness event that `.enter` sends and left by one that `.leave` sends.
  The harness fills ports with verdict lookups and recorders. The Runtime, turn algorithm and evidence are the
  production ones, and the harness machine is hidden from snapshot paths.
- **Calls, lives, endings and fragment evidence** are evidence events the Runtime already emits for Inspection
  (`In` O4, and `D:1325`'s amendment). The Story collector folds them into per-cut cumulative records as it does
  repairs today (`T:91`), so the trace window does not bound them.
- **Truth capture** reads each stateful fixture's `Ref` with `Ref.get` at the cut, encodes it with its Schema, and
  stores the value.
- **The clock** is Effect's TestClock. `advance` steps it deadline by deadline. After each step it yields until no
  fiber in the run is runnable, and only admits arrivals to mailboxes. `process()` runs admitted turns.
- **Playback** needs no new execution. The new records are fields of frames, which `StoryFrame` and the overlay
  already receive. The collapse step merges causes instead of dropping them.
- **Run-scoped fixtures** are built in the run's scope, before any tab's Runtime. Each tab's setup is provided with
  the fixture Layer's output.

## 6. Changes

### 6.1 Added

| Added | Kind | Meaning |
| --- | --- | --- |
| `story.trait(T, { id, input?, guards? })` | Story constructor | a trait alone (3.2) |
| `story.subroutine(S, { id, guards? })` | Story constructor | a subroutine alone (3.2) |
| `.enter(input?)` / `.leave()` on trait Stories | commands | enter or leave the harness root (rule 3) |
| `guards` option, `.guards({ … })` command | harness verdicts | `true \| Flow.Denial` per guard port (rule 2) |
| `checkpoint.calls.<path>.<port>` | cut evidence | callbacks, `whenAbandoned` notifications and exits (rule 5) |
| `checkpoint.lives.<path>` | cut evidence | `{ life, frozen, key? }` (rule 6) |
| `listRepair`, `droppedDelivery`, `droppedRaise`, `reset` | cumulative evidence kinds | 3.4 |
| `"pendingReset"` | frame cause | 3.4 |
| `checkpoint.endings` | cut evidence | every admitted ending (rule 8) |
| `kind: "lane"`, `phase`, `waiting` in `checkpoint.pending` | pending entry | rule 8 |
| `frozen`, owner `fixture:<id>` in `checkpoint.pending` | pending entry fields | rule 9 |
| `s.schedules.<name>[key].dueAt` | snapshot path | a keyed schedule's deadline |
| `Fixture.stateful({ id, truth, initial, layer })` | fixture constructor | rule 7 |
| `checkpoint.truth.<id>` | cut read | captured truth |
| `Fixture.storage({ acknowledge?, seed? })` | fixture constructor | rule 10 |
| `defineConfig({ stories })` | configuration | rule 12 |
| `verdict` in a send's frame cause | frame cause field | rule 4 |
| `InvalidStoryCommand` | rejection code | an `.enter` or `.leave` that does not fit the life (rule 3) |

### 6.2 Changed

| Changed | Before | Now |
| --- | --- | --- |
| Testing a fragment alone | `story.machine(fragment, { id })` (`D:468`) | `story.trait` / `story.subroutine` |
| Recorded notifications | `run.calls.<callback>` per run (`D:469`) | `checkpoint.calls`, per cut, in every Story kind |
| Checking server truth | `.checkpoint(name, ({ truth }) => …)` (`M2:380`) | `.checkpoint(name)` and `checkpoint.truth` |
| What `send` runs | unstated (`T`); "runs its turn" (`D:1324`); the whole mailbox (`SF:458`) | its turn plus a pending-reset follow-up (rule 4) |
| Transaction lanes | "Transactions have outcomes, never lanes" (`Op:162`) | lanes per merge 2, carried on snapshots and listed in `pending` |
| Frame collapse | identical frames collapse (`T:72`) | collapse keeps every cause in order |
| Fixture scope | per run, unstated across tabs (`T:63`, `T:166-172`) | per run, shared by tabs |
| Story storage | fresh in-memory store, seeding only (`T:64-66`) | the same store, with optional clock-driven acknowledgement |

### 6.3 Removed

| Removed | Was | Why |
| --- | --- | --- |
| `story.machine` for fragments | `D:468`, `D:1324` | a fragment is not an actor; options and discovery do not fit (G6) |
| `run.calls` | `D:469` | replaced by `checkpoint.calls`, which also works in a host |
| The checkpoint predicate | `M2:380`, `M2:525` | a callback in a plan (`T:17`) |
| `ackDelayMs`, `advanceHeld` | spike only (`SF:239`, `SF:462`) | replaced by `Fixture.storage` and rule 9 |

### 6.4 Amendments by target document

| Target | Amendment |
| --- | --- |
| **Testing O1** (`T:9-35`) | four constructors (rule 1); fragment Story options; rules 2–4; `send` at instance paths, keyed copies and subroutine events; host-event sends in fragment Stories only; the send rule of rule 4; "Both Story kinds" (`T:21`) becomes "Every Story kind"; `defineConfig({ stories })` (rule 12) |
| **Testing O2** (`T:37-52`) | rule 9: every controlled-clock sleep is a deadline; ordered admission without turns; equal-deadline tiebreaks; frozen deadlines |
| **Testing O3** (`T:54-67`) | `Fixture.stateful` with Schema truth (rule 7); `Fixture.storage` (rule 10); fixtures run-scoped and shared by tabs (rule 11) |
| **Testing O4** (`T:69-99`) | `checkpoint.calls`, `checkpoint.lives`, `checkpoint.truth`, `checkpoint.endings`; lane entries and `frozen` in `pending`; the fragment evidence kinds; `"pendingReset"` and `verdict` in causes; collapse keeps causes; owner-typed snapshots (rule 13) |
| **Testing O4, StoryFrame** (`T:100-108`) | eligibility reads lanes on the frame's snapshot; `tab` for a tab absent from the frame renders nothing with gap `TabClosed`; `pending` gains `phase: "queued"` |
| **Testing O9** (`T:208-222`) | `StoryPlayer` and `definePresentation` take App and machine Stories only; stepping by command uses the causes kept through collapse; the next-action highlight matches instance path and key; Inspect shows the frame's cut records, which never show "evidence unavailable" |
| **playback.md** (`PB:97-108`, `PB:131-136`) | explanatory text follows the Testing O4 and O9 rows (the plan wins, `PB:3-4`) |
| **Testing O6** (`T:133-148`) | the oracle reads `Fixture.stateful` truth, the same concept as `checkpoint.truth` |
| **Testing O7** (`T:165-172`) | "Tabs share nothing else" gains "except the run's fixtures"; `Restored` endings are App-Story-only |
| **Operations O6** (`Op:162`) | "Transactions have outcomes, never lanes" is replaced by merge 2's transaction lanes (`M2:430-442`), readable on snapshots |
| **Inspection O4** (`In:79-104`) | evidence kinds for fragment calls, lives, list repairs, dropped deliveries and raises, resets and endings with route; Story cuts retain them beyond the trace window |
| **Package** (`Pk:19`) | `flow-state/testing` exports `Fixture` |
| **machine-design rule 11** (`D:468-471`) | rewritten as rules 1–5 here: `story.trait`, `story.subroutine`, harness defaults and verdicts, `.enter`/`.leave` for both kinds, `checkpoint.calls`, `checkpoint.exit` |
| **machine-design section 5, Testing O1 row** (`D:1324`) | replaced by the Testing O1 row above; its `model()` clause is dropped |
| **machine-design examples** (`D:1010-1019`, `D:1092-1094`) | `story.trait` / `story.subroutine`; `calls` read per checkpoint; the Confirm checkpoint renamed from `end` |
| **machine-design 2.1** (`D:67-75`) | add `s.schedules.<name>[key]` for keyed schedules |
| **merge 2, 3.15** (`M2:375-384`) | replaced by 3.5 and 3.7 here |
| **merge 2, 6.1 and 6.5** (`M2:525`, `M2:603`) | the "checkpoint reading fixture truth" rows point here; 6.5 gains the Operations O6 row above |

## 7. Coverage

| Gap or capability | Answered by |
| --- | --- |
| G1 fixture truth | 3.5, rule 7 |
| G2 endings, lanes, late routing | 3.6, rule 8 |
| G3 fragments inside a host | 3.3, 3.4, rules 5–6 |
| G4 clock and ordering | 3.7, rule 9 |
| G5 unproducible endings, restore mid-write | 3.7, rules 10–11 |
| G6 fragment Story contract | 3.1, 3.2, 3.9, 3.10, rules 1–3, 12 |
| G7 instance-path sends and verdicts | 3.8, rule 4 |
| G8 what `send` runs | rule 4 |
| G9 playback | 3.11, rule 14 |
| `success`, `failure` by tag, `unknown` by author reason | the fixture answers; the author's commit classifies (`M1:41-58`); read in 3.6 |
| `unknown(Defect)` and its actor issue | the fixture dies; the issue is on the cut (`T:78`); read in 3.6 |
| `unknown(Interrupted)` | the fixture interrupts itself; its interruptor is not Flow's (`M1:224-226`); read in 3.6 |
| `unknown(Cancelled)` | a cancel while the fixture's sleep is pending; 3.6, 3.7 |
| `NotSent(Cancelled)` | a queued start under `serialize`/`latest`, or a cancel during acknowledgement (3.7, rule 10) |
| `NotSent(Superseded)`, `NotSent(Rejected)`, `NotSent(NothingToResend)` | sends (`M2:45`); read in 3.6 |
| `NotSent(Restored)`, `unknown(Restored)` | `Fixture.storage` and tabs (3.7, rules 10–11) |
| `StillUnknown { failure }` | a stateful fixture that drops and then fails; read in 3.6 |
| `pending`, `retryCount`, `idle` agreeing with `check()` | 3.6, rule 8 |
| `LateMayNotLeave` | 3.6 |
| Mailbox race (spike P1) | 3.7, rule 9 |
| Keyed schedules | 3.7, rule 9 |
| `.each` copies, lives, repairs, drops | 3.3, 3.4, 3.8 |
| Resumable traits: freeze, overdue firing | 3.2, 3.4, rule 9 |
| `whenAbandoned` alone and in a host | 3.2, 3.3 |
| Restore mid-write, charged once | 3.5, 3.7 |
| Merge 1's `Timeout` | removed by merge 2 (`M2:556`); a schedule plus `cancel` is covered above |
| `orphaned` across a version change | not covered: saved-state Stories are left out (`D:1429-1430`) |

## 8. Alternatives considered

- **Keep `story.machine` for fragments.** Rejected:
  - three of its five options do not apply;
  - discovery checks machines;
  - `.enter` and `checkpoint.exit` would be conditional members of an actor Story.
- **`story.fragment(F)`.** Rejected: "fragment" would become a new public word (it is not an export, `D:1312`), and
  the trait/subroutine differences would hide behind conditional types.
- **`story.alone` / `story.harness`.** Rejected: they name the method, not the subject.
- **A host with one fragment stubbed.** Rejected: rule 10 and `flow check` already cover swapping a fragment, so it
  would add a concept and prove nothing new.
- **A checkpoint predicate over truth** (`M2:380`). Rejected:
  - it is a callback in a plan (`T:17`);
  - it makes a capture into an assertion (`T:75`);
  - a boolean hides the value when it fails.
- **Reading truth only at `end`.** Rejected: races need truth mid-story, before and after a reload.
- **Calls and endings read from the trace.** Rejected: the window is 4,096 events (`In:101`), and "Truncation …
  cannot prove an absent cause" (`T:92-93`).
- **A `.hold()` / `.release()` fixture command.** Rejected for now: it would be a second scheduling channel beside
  the clock (`T:37-40`). Time-scripted fixtures reproduce every spike race.
- **An `advanceHeld` command.** Rejected: rule 9 gives Testing's existing `advance` that meaning.
- **An `ackDelayMs` actor option.** Rejected: storage behaviour belongs to the storage fixture (locality).
- **A closure guard in the harness.** Rejected: `T:17`.
- **A "deny every guard" switch.** Rejected: it cannot name the code a host forwards.
- **Harness callbacks with handlers.** Rejected: that is writing a host. Write a test machine instead.
- **A `.reset()` command for trait Stories.** Rejected for now: `resetOn` is a host filling (`D:118`), tested with
  `story.machine`.
- **Fixtures per tab.** Rejected: a reload would meet a different server.
- **Playing fragment Stories through a generated component**, for example a harness view that prints the slice.
  Rejected: playback shows the real app UI (`PB:9-11`), and a generated UI is not the app.
- **Showing cut records only within the trace window**, as Inspect's trace view does. Rejected: the records are
  retained with the cut precisely so they never go missing.

## 9. Open questions

Each is unconfirmed by the owner; the recommendation is the design above.

1. *Answered: D1.*
2. *Answered: D1.*
3. *Answered: D2.*
4. *Answered: D2.*
5. *Answered: D3.*
6. **Endings and lanes on the cut** (`checkpoint.endings`, lane entries in `pending`, lanes on snapshots replacing
   `Op:162`)? *Recommend yes.*
7. **The clock rules** (rule 9): all sleeps as deadlines, ordered admission without turns, tiebreaks, frozen
   deadlines skipped? *Recommend yes.*
8. **`Fixture.storage({ acknowledge })`**? *Recommend yes.*
9. **Run-scoped fixtures shared by tabs**? *Recommend yes.*
10. **Harness defaults**: guards pass, callbacks record, exits record and end the life? *Recommend yes.*
11. **The data-only refusing guard**: the `guards` option and the `.guards()` command, `true | Flow.Denial`?
    *Recommend yes.*
12. **`defineConfig({ stories })`** for App-free Stories? *Recommend yes.*
13. **Send verdicts in frame causes**, kept through collapse? *Recommend yes.*
14. **What `send` runs**: its turn plus a pending-reset follow-up only? *Recommend yes, for every Story kind.*
15. **A `.reset()` command for trait Stories**? *Recommend no* (section 8).
16. **A fixture hold-and-release command**? *Recommend no for now* (section 8).
17. **Fragment Stories in playback.** Should they stay unplayable (rule 14), or should playback's own open question
    (`PB:195-196`, a focused Story's actor standing in for a component's actor) be extended to fragments? *Recommend
    unplayable for now.* Revisit when playback settles its question 2.
18. **A closed tab in a frame**: render nothing and record the gap `TabClosed`? This fills a case playback leaves
    unspecified (`T:108`) and does not override it. *Recommend yes.*
19. **`phase: "queued"` in `pending`**, so an `advance` frame shows admitted arrivals? *Recommend yes.* Without it the
    mailbox race is invisible in the overlay.
20. **Wider coverage of `.each` membership.** Which transitions add or remove keys is Story-checked (`D:460`). If
    more is wanted, any exploration would have to run on the real Runtime. *Recommend nothing now.*

## 10. Decisions

Settled by the owner. Each records the choice, why it wins, what it commits the design to, and what was rejected.

- **D1 Fragment Stories are named by kind, and both kinds enter and leave.** `story.trait(T, { id, input? })` starts
  active; `story.subroutine(S, { id })` starts outside and `.enter(input)` begins it. `.enter` and `.leave` work on
  both: on a trait, `.leave` freezes a resumable trait or ends it with `whenAbandoned`, and `.enter` resumes or
  starts a new life. `checkpoint.exit` stays subroutine-only. Why: `story.machine` named something that is not a
  machine, the constructor names already exist, and without `.leave` on traits a trait's `whenAbandoned` and
  `.resumable()` could be tested only in a host. Consequence: Testing O1 lists two more Story kinds (section 6.4).
  Rejected: one `story.fragment` with the kind hidden in conditional types, keeping `story.machine` for fragments,
  and `.enter` / `.leave` on subroutines only.
- **D2 Every checkpoint carries `calls` and `lives`, alone and in a host.** `checkpoint.calls.<path>.<port>` records
  callbacks, `whenAbandoned` notifications and exits (told apart by `by`), with key, life, payload and turn;
  `checkpoint.lives.<path>` records each copy's key, life and whether it is frozen. They replace `run.calls`, are
  cumulative per cut and are retained with it. Why: whether a fragment notified, exited or was re-created must be
  checkable in the real machine, not only with a harness. Consequence: callback and exit names must be unique
  within a contract (a rule machine-design does not state yet; add it with this merge), and lives appear in Stories
  and Inspection only, never in snapshot or view types. Rejected: these reads only for fragments tested alone,
  with host tests asserting on host memory.
- **D3 Fixtures declare their truth, and every checkpoint captures it.** `Fixture.stateful({ id, truth: Schema,
  layer })`; `run.checkpoints.<name>.truth.<fixture>` is captured at every cut, and the property-test oracle reads
  the same truth. Why: a Story stays a plan with no callbacks (`T:17`), and server truth such as "charged once"
  becomes a typed, exportable value instead of a comment. Consequence: merge 2's checkpoint predicate
  (`M2:380`) is replaced (section 6.4). Rejected: keeping the predicate and loosening Testing's no-callbacks rule
  for checkpoints.

## New keywords

- `story.trait`
- `story.subroutine`
- `.enter()` and `.leave()` on trait Stories
- `guards` (Story option) and `.guards({ … })` (command)
- `checkpoint.calls`, with `by: "transition" | "whenAbandoned" | "exit"`
- `checkpoint.lives`, with `life` and `frozen`
- `listRepair`, `droppedDelivery`, `droppedRaise`, `reset` (evidence kinds)
- `"pendingReset"` (frame cause)
- `checkpoint.endings`, with `channel`, `reason`, `attempt`, `route: "current" | "late"`, `owner`, `from`
- `kind: "lane"`, `phase: "acknowledging" | "invoked" | "settled"`, `waiting` (pending entry)
- `frozen` and owner `fixture:<id>` (pending entry)
- `phase: "queued"` (pending entry for an admitted arrival)
- `TabClosed` (StoryFrame gap)
- `s.schedules.<name>[key].dueAt`
- `Fixture`, `Fixture.stateful({ id, truth, initial, layer })`, `Fixture.storage({ acknowledge?, seed? })`
- `checkpoint.truth`
- `defineConfig({ stories })`
- `verdict` (frame cause field)
- `InvalidStoryCommand`
