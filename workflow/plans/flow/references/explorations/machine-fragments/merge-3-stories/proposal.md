# Proposal: Stories for fragments and server calls

Status: proposal, not accepted; merge 3 into [machine-design.md](../machine-design.md), which now holds merges 1
and 2 (section 2.7 and rules 13–25; their records are [merged/outcomes.md](../merged/outcomes.md) and
[merged/server-calls](../merged/server-calls/proposal.md)). No `.plan` file changes until it is accepted. It makes
Stories ([Testing.plan](../../../../Testing.plan)) cover what the design added: traits and subroutines inside a
machine and alone, `.each` copies and their lives, resumable traits, server-call endings, lanes, late routing, keyed
schedules, fixture truth and restore mid-write. Every addition is checked against the accepted playback design
([playback.md](../../playback.md), whose contract is Testing O4 and O9); section 3.11 says how each one appears in
playback, or why it does not. There is no spike yet; the code here is examples only. Model-based exploration
(`model()`, Testing O5) is removed by the design (T1, `D:2043`) and is not used or replaced here. Nothing here is
decided beyond D1–D3: every choice the owner has not confirmed is listed in section 9.

**Revision 1** (2026-10-30), answering [reviews/review-1.md](reviews/review-1.md):

- **Correctness findings fixed.** C-H1 to C-H4, C-M1 to C-M11 and the low and wording findings, each with the
  conservative choice where one was needed. Each choice is a question in section 9. The fixes:
  - lanes on snapshots now amend Machines O8;
  - mailbox entry is "queued", and "admitted" keeps its meaning from rule 14;
  - fixtures are run-scoped with restricted dependencies;
  - the deadline order has a final tiebreak;
  - storage acknowledgement covers Attempts only;
  - a trait alone sits under a harness child state, so it can freeze;
  - `send` behind queued arrivals is defined;
  - `Fixture.stateful` gains controls and takes D3's signature;
  - `LateMayNotLeave` is readable on ending records;
  - keyed schedules read as `[i]`;
  - the missing amendment rows are added.
- **Citations re-pointed.** Every citation now points at the merged design: rules 13–25, section 2.7 and the new line
  numbers. Merge 2's rules are cited by their design numbers. `merged/` files are cited only for what stayed there:
  the spike, its trace and the requirements. The review's 12 wrong citations are corrected, and every `D:`, `T:` and
  `PB:` line was re-checked.
- **Simplicity findings not applied.** S-H1 to S-M5 and the S lows are open questions in section 9, each with the
  reviewer's smaller alternative and a recommendation. Section 9 is grouped into rounds; question numbers are stable.
- **Section 3.11 (playback)** was re-checked against these changes.

Citations. Paths are relative to `workflow/plans/flow/`:

| Short | File |
| --- | --- |
| `T` | `Testing.plan` |
| `Op` | `Operations.plan` |
| `Mc` | `Machines.plan` |
| `Ps` | `Persistence.plan` |
| `In` | `Inspection.plan` |
| `Pk` | `Package.plan` |
| `D` | `references/explorations/machine-fragments/machine-design.md` (merges 1 and 2 merged in) |
| `EA` | `references/explorations/machine-fragments/merged/each.md` |
| `M1` | `references/explorations/machine-fragments/merged/outcomes.md` (record of merge 1) |
| `M2` | `references/explorations/machine-fragments/merged/server-calls/proposal.md` (record of merge 2) |
| `RQ` | `references/explorations/machine-fragments/merged/server-calls/requirements.md` |
| `SS` | `references/explorations/machine-fragments/merged/server-calls/spike/stories.ts` |
| `SF` | `references/explorations/machine-fragments/merged/server-calls/spike/flow.ts` |
| `PB` | `references/explorations/playback.md` (accepted) |

Where the design and a `merged/` record differ, the design wins (`D:3-5`).

## 1. The problem

A Story's assertions read three sources: the **snapshot** (what views see), the **evidence** (what the Runtime
decided) and the **fixture** (what the server holds). The design puts new facts in each source, but Testing.plan
gives no read for most of them, and in two places they contradict it.

- **G1. Fixture truth has no capture form.**
  - The design checks server truth with a predicate:
    `.checkpoint("paid", ({ truth }) => truth.FakeStripe.charges === 1)` (`D:1191`). It lists this as a keyword
    (`D:1935`) and as an amendment to Testing O2 and O3 (C16, `D:2032`).
  - That contradicts Testing O1, "Scenario commands accept no arbitrary callbacks" (`T:17-18`), and O4,
    "checkpoint(name) captures immediately without processing" (`T:75`).
  - Stateful fixtures with server truth already exist (`T:63-64`). The property-test oracle "reads fixture server
    truth directly" (`T:147`). A Story checkpoint has no such read.
  - The requirements ask Stories to "assert server truth" (`RQ:102-103`). Today those assertions are written as
    comments (`RQ:133`).
- **G2. Endings, lanes and late routing are not on the cut.**
  - An ending is routed when its turn is admitted, as current or late (rule 14, `D:499-504`; 2.5 step 1,
    `D:597-600`).
  - A lane per transaction and key holds `pending` and `retryCount` (rule 21, `D:534-546`).
  - Flow's reasons include `StillUnknown` (rule 18, `D:519-521`) and `NotSent { why }` (`D:759`).
  - Testing's cut names only "attempts where applicable" among pending work (`T:84-85`), and defers lanes to
    Operations O6 (`T:90-91`). Operations O6 says "Transactions have outcomes, never lanes" (`Op:162`). The snapshot's
    field list has no lanes, and "Reading an old snapshot never consults live lanes" (`Mc:162-166`). So
    `pay.pending(checkpoint.snapshot, key)` (`D:929`, `D:1014`) is unspecified on a captured snapshot.
  - The spike prints these facts only as trace text (`M2:661`, `M2:667-700`).
  - The trace keeps 4,096 recent events (`In:101`). Only repairs, skips and diagnostics are kept cumulatively on
    a cut (`T:93`).
- **G3. A Story of a whole machine cannot see what its fragments did.** Observation is specified only for a fragment
  tested alone (rule 11, `D:470-473`). Inside a host:
  - Callbacks run as parts of the turn (rules 6–7, `D:403-419`; 2.5 step 3, `D:616-643`). Whether `onLocked` fired,
    for which `.each` key and with which payload, is not readable.
  - An exit taken by a subroutine is not readable. `checkpoint.exit` exists alone only (`D:472`).
  - Lives "appear only in Inspection and Stories" (`EA:231`), but Testing has no read for them. So these rules
    cannot be checked:
    - "a delivery reaches the incarnation it was started or armed under" (`D:451-457`);
    - a late delivery for a removed row is dropped "even if the key was added again" (`D:1831-1832`).
  - A frozen resumable slice "stays present while frozen" (`D:78-79`), so frozen and active look the same.
  - A pending reset runs as its own follow-up turn (`D:377-383`), but a frame's cause is only "the command … or the
    publication sequence" (`T:73-74`).
  - List repairs and dropped raises are "Story-derived" warnings (`D:461-464`, `EA:208-214`), but Testing does not
    name them as evidence kinds (`T:93`).
  - The lockout example asserts `run.calls` per checkpoint (`D:1659-1660`), while rule 11 defines it per run
    (`D:471`).
- **G4. Clock and ordering rules are not exact enough.**
  - The mailbox race (spike P1) needs a stand-in command, `advanceHeld` (`SS:106`, `SF:462`), because the spike's
    `advance` drains every 10 ms (`SF:460`). Testing's `advance` already makes work eligible without draining it
    (`T:50-51`). What it does not say:
    - in which order arrivals are queued when one `advance` passes several deadlines;
    - whether a fixture's wake-up is eligible work.
  - It does not say whether a fixture's sleep is a "pending deadline" for `advanceToNextTimer` (`T:49`).
  - A frozen schedule keeps its `dueAt` and is not delivered (`D:359-361`). `advanceToNextTimer` "stays at now when
    already due" (`T:49`), so an overdue frozen deadline would pin it there forever.
  - Keyed schedules (`D:1163-1177`, rule 23, `D:565-567`) have no snapshot path for a key's `dueAt` (`D:70-76`). The
    equal-deadline order (`Mc:119-120`) has no key tiebreak; `.each` copies use list order (`D:456`).
- **G5. Some endings cannot be produced, and restore mid-write cannot be checked.**
  - `NotSent { why: "Cancelled" }` before invocation on a `reject` or `allow` commit has one window: the storage
    acknowledgement (`D:1205`, `D:1194-1196`). Story storage is "always … a fresh in-memory KeyValueStore", which
    fixtures may only seed (`T:64-67`). The spike invents an actor option, `ackDelayMs` (`SS:292`, `SF:239`,
    `SF:291`).
  - `Restored` endings (`D:1211`) need a reload. Only App Stories have one (`T:166-172`), and nothing says so.
  - Tabs are "independent Runtimes of the Story's setup … Tabs share nothing else" (`T:166-172`). If fixtures are
    acquired per tab, the reopened tab talks to another fake server, and "charged once across a reload" cannot be
    checked.
- **G6. The fragment Story is under-specified, and misnamed.**
  - `story.machine(fragment)` (`D:470`, `D:1998`) reuses a contract for "one fresh actor" with `input`, `context`,
    `services` and `fixtures` (`T:9-11`). Fragments declare no operations, context or I/O (`D:282`, rule 3,
    `D:398`).
  - A Story id is "unique within its App" (`T:12-13`), and discovery is per App and rejects "incompatible machines"
    (`T:32-34`). A library fragment belongs to no App.
  - A trait Story starts active (`D:1652-1658`). A subroutine Story starts with `.enter({})` (`D:1765`). Neither
    rule is stated.
  - `.leave()` is defined only for subroutines (`D:472-473`). So for a trait alone, "`run.calls` … including
    `whenAbandoned`" (`D:471`) cannot happen, and `.resumable()` cannot be tested alone.
  - Rule 11 lets a fragment Story send host events (`D:471`). Testing allows "Only public events" (`T:25-26`).
  - The harness "fills every port with a recording harness" (`D:470`). It does not say what a harness guard answers
    or what a harness exit does, and offers no way to refuse at a guard.
  - The Confirm example names a checkpoint `end` (`D:1765`), beside the run's own `end` capture (`T:75-76`).
- **G7. Sends to fragment events and keyed copies are not in Testing, and their verdicts are lost.**
  - The design sends `E.invites.key("invite-2").Changed(…)` in a Story (`D:1827-1828`) and has views send
    `E.CANCELLING.Yes()` (`D:1760`). Testing has only `send(event)` and `send(ref, event)` (`T:23-26`).
  - Denied and Unhandled events "publish nothing" (`Mc:80`), and consecutive identical frames collapse (`T:71-72`).
    So the frame that would show "a keystroke sent for a row removed a moment earlier is `Unhandled`" (`D:1831`) can
    disappear. The spike reads the verdict with a live `a.check` (`SS:191`).
- **G8. What `send` runs is inconsistent.**
  - The design's Testing amendment says "`send` runs its turn; `process()` drains operation work and due timers"
    (`D:1998`). Testing does not say that `send` runs anything (`T:22-29`, `T:42-52`).
  - A pending reset runs as a follow-up turn at the head of the mailbox (`D:379-380`, `D:594`). It is unclear
    whether `send` includes it.
  - Nothing says what `send` does when arrivals are already queued, for example after an `advance`.
  - The spike's `send` drains the whole mailbox (`SF:458`).
- **G9. Playback has gaps caused by fragments and server calls.** Playback renders the real app from frames
  (`PB:22-29`, `T:100-109`).
  - **A fragment Story has nothing to render.** `StoryFrame` renders "the application … below its FlowProvider"
    (`T:106-107`). A trait or subroutine Story has no App, no ref and no component. `useActor` returns only "its pure
    pre-attach snapshot" (`T:104`), and letting a Story's actor stand in for a component's actor is an open question
    in playback itself (`PB:195-197`).
  - **Buttons gated by a lane render wrongly.** Eligibility in a frame "uses production checks" (`T:107-108`).
    `pay.idle(key)` is a guard over lanes (`D:928`). If the frame's snapshot carries no lanes (`Mc:162-166`, G2), a
    disabled Pay button renders enabled.
  - **Stepping by command breaks when frames collapse.** The player steps "by frame, command or scene" (`T:213-214`)
    and finds the next command from each frame's cause (`PB:133-134`). A Denied or Unhandled send makes an identical
    frame that collapses (`T:71-72`, `PB:81`). If its cause goes with it, the command disappears from playback (G7).
  - **The next-action highlight meets keyed and subroutine events.** The player "highlights the control whose click
    would send the Story's next event" (`T:222-223`). The event may now be `E.invites.key(k).Changed` or
    `E.CANCELLING.Yes()` (`D:1827-1828`, `D:1760`). The comparison has to include the instance path and key, and
    that is unstated.
  - **A closed tab has no defined frame.** `tab selects a tab's cut` (`T:108`), and `closeTab` ends a tab abruptly
    (`T:168-169`). Reload Stories (G5) play frames between `closeTab` and `openTab`. What `StoryFrame tab` renders for
    a tab that is absent from the frame is not specified; Testing's gaps are per actor (`T:102-104`).
  - **Advancing time shows no reason.** An `advance` that queues arrivals without running turns (G4) produces a
    frame whose snapshots are unchanged. Only `now` and pending work differ. Testing's pending work does not list
    queued, not-yet-run arrivals, so the mailbox race is invisible in the overlay.

The spike's runner reproduces data flow well, but five of its affordances are not Story API and must not leak into
the plans:

- `advanceHeld`;
- the `ackDelayMs` actor option;
- an `advance` that drains;
- live `a.state`, `a.memory` and `a.laneCount` reads (`SS:127`, `SS:325`);
- a conditional send inside a loop (`SS:127`), forbidden by `T:17-18`.

**Two words.** An arrival (a timer firing, a call ending, a send) is **queued** when it enters the actor's FIFO
mailbox (`D:595-596`, P21 `D:2011`). Its turn is **admitted** when 2.5 step 1 takes it from the mailbox (`D:593-600`).
"Admitted" means only that here, as in rule 14 (`D:500`).

## 2. Where the data comes from

| Fact the author checks | Real source | How a Story reads it |
| --- | --- | --- |
| Fragment memory, schedules and `dueAt`, `.each` copies by key | the published snapshot (`D:70-79`) | `checkpoint.snapshot` (`T:82-83`), owner-typed (rule 13) |
| Private fields | the snapshot; outside types omit them (`D:236`, `D:258-259`, `D:1988`) | `checkpoint.snapshot`, typed with them |
| Callbacks told, exits taken, `whenAbandoned` notifications | the Runtime's turn parts (rules 6–7, `D:403-419`; `D:616-643`) | `checkpoint.calls` (3.3) |
| Lives, frozen state, resets, list repairs, dropped deliveries | the Runtime's fragment bookkeeping (`D:451-460`, `EA:208-231`) | `checkpoint.lives` and the cut's cumulative evidence (3.4) |
| A send's verdict | the turn's selection (`Mc:78-81`, `D:613-614`) | the frame cause (3.8) |
| An ending: channel, reason, Attempt, current or late | the classifier (`D:785-804`), rule 18 and admission (rule 14, `D:597-600`) | `checkpoint.endings` (3.6) |
| A lane's `pending` and `retryCount` | the lane (rule 21, `D:534-546`) | `pay.pending(checkpoint.snapshot, key)`, `pay.retryCount(…)` on the snapshot's lanes (3.6) |
| What the server holds | the stateful fixture (`T:63-64`) | `checkpoint.truth` (3.5) |
| Time and deadlines | the Runtime Clock; the controlled clock in Stories (`T:37-40`, `D:846`) | `checkpoint.now`, `checkpoint.pending` (3.7) |
| Acknowledgement of an Attempt | storage (Persistence O6, `Ps:123-128`; `D:1205`) | produced by `Fixture.storage` (3.7) |
| What playback shows | frames recorded once, rendered by `StoryFrame` (`PB:22-29`, `T:209-212`) | the same cut reads; section 3.11 |

Every read is captured at the cut. A read starts no work and cannot resume the Runtime (`T:97`). Playback renders
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

- Rule 10 promises that a fragment with the same contract and summary cannot break its host (`D:465-469`).
- `flow check` checks hosts against summaries.

A minimal test host is an ordinary machine, discovered through `defineConfig({ stories })` (3.10).

`run()` returns a `StoryRun` branded by its kind, `StoryRun<"app" | "machine" | "trait" | "subroutine">`, so tools
that accept only some kinds (playback, 3.11) say so in their types.

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
// locked.snapshot.memory.strikes === 2: a fragment Story's snapshot is the subject's slice

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
const C = Countdown({ length: "30 seconds" }).resumable()
export const frozen = story
  .trait(C, { id: "Cooldown/frozen" })
  .send(C.E.Start())                                      // a hostEvent: armed, dueAt = now + 30 s
  .leave()                                                // ← NEW for traits: frozen, because resumable
  .advance("1 minute").process()                          // nothing fires while frozen
  .checkpoint("away")                                     // away.lives → { life: 1, frozen: true }
  .enter()                                                // ← NEW for traits: resumed
  .process()
  .checkpoint("back")                                     // back.lives → { life: 1, frozen: false };
                                                          // the overdue firing ran once (D:359-361)
```

- Options are `{ id, input?, guards? }`. There are no `context`, `services` or `fixtures`, because fragments have no
  I/O (`D:282`). `guards?` is this proposal's addition to D1's option list (rule 2; section 9, question 11).
- **The harness** is a generated machine with two child states under its root, `IN` and `OUT` (section 5). The
  subject is placed in `IN`: a trait on `IN`'s node, a subroutine as the state `IN` itself. Harness names never
  appear in Story reads. A fragment Story's `checkpoint.snapshot` is the subject's slice (`{ memory, schedules }`),
  `undefined` while inactive and present while frozen, exactly as the slice reads in a host (`D:70-79`).
- **Trait Story.** The harness starts in `IN`, so the trait is active from the start.
  - `.leave()` moves the harness to `OUT`, which leaves the trait's node. A resumable trait freezes; any other trait
    ends, and its `whenAbandoned` runs (rule 1, `D:353-365`).
  - `.enter(input?)` moves the harness back to `IN`. A frozen trait resumes; otherwise a new life starts, with
    `input` or, when omitted, the options' `input`.
- **Subroutine Story.** The harness starts in `OUT`, so the slice is `undefined` until `.enter(input)`.
  - An exit or `.leave()` ends the life, and the harness is back in `OUT`.
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
- Records are cumulative up to the cut and retained with it, as repairs are (`T:93`). Trace truncation (`In:101`)
  cannot hide them.
- `turn` is an evidence sequence position, not a copy (`T:73-74`).
- Callbacks and exits share one name list per contract (D2), so `calls.<path>.<port>` is never ambiguous. A
  contract that declares one name as both a callback and an exit is a construction error (rule 15 here).

### 3.4 Lives and fragment evidence: `checkpoint.lives`

```ts
// sign-in: after BackToPassword, TWO_FACTOR was left
run.checkpoints.atPassword.lives.challenges     // ← NEW: copies in key order, as s.memory.challenges
// → [{ key: "c1", life: 2, frozen: false }]
run.checkpoints.atPassword.lives.resendCooldown // → { life: 1, frozen: true }   (resumable, D:334)
run.checkpoints.atPassword.lives.code           // → undefined (inactive: dropped, not frozen)
```

The cut's cumulative evidence (`T:93`) gains these fragment kinds, each with path, key and life:

- `listRepair`: a duplicate key or a key past `max` (`EA:208-210`, `D:448-450`).
- `droppedDelivery`: a raise or timer firing addressed to a dead life (`D:451-457`). Call endings are never dropped:
  rules 14, 17 and 20 govern them until the design's open item 15 is decided (`D:2137-2142`).
- `droppedRaise`: a raise into an absent key in a delivery turn (`EA:213-214`).
- `reset`: with source `"resetOn"` or `"pendingReset"`.

A frame caused by a follow-up reset turn names the cause `"pendingReset"` (`T:73-74`).

### 3.5 Server truth: `Fixture.stateful` and `checkpoint.truth`

```ts
// fixtures/fakeStripe.ts
const StripeTruth = (start: { charges?: number } = {}) => Schema.Struct({
  charges: Schema.Int.pipe(Schema.withConstructorDefault(Effect.succeed(start.charges ?? 0))),  // the starting truth
  keys: Schema.Array(Schema.String).pipe(Schema.withConstructorDefault(Effect.succeed([]))),
})

export const FakeStripe = (o: { script?: ReadonlyArray<ChargeResponse>; dropFirst?: boolean; charges?: number }) =>
  Fixture.stateful({                                                     // ← NEW: D3's { id, truth, layer }
    id: "FakeStripe",                                                    // the key on the cut; a literal
    truth: StripeTruth({ charges: o.charges }),                          // ← NEW: what a cut captures; starts at its defaults
    controls: { disconnect: Schema.Struct({}), reconnect: Schema.Struct({}) },   // ← NEW, optional
    layer: (truth, controls) => Layer.effect(StripeApi, makeFakeStripe(truth, controls, o)),
  })                                                                     // truth: a Ref; controls: a Queue per control

// checkout.story.ts
const stripe = FakeStripe({ script: [{ status: 503, retryAfterMs: 2000 }] })
export const busyThenPaid = story
  .machine(Checkout, { id: "Checkout/busy-then-paid", fixtures: stripe })
  .send(E.Pay()).advance("3 seconds").process()
  .checkpoint("paid")                                                    // a capture, not a predicate
  .control(stripe.disconnect({}))                                        // ← NEW command: data, typed by the control's Schema
  .process()
  .checkpoint("offline")

// the test, outside the plan
expect(run.checkpoints.paid.truth.FakeStripe).toEqual({ charges: 1, keys: ["a1", "a2"] })   // ← NEW read
```

- `truth` is a Schema, so captured truth encodes into exported evidence and redaction applies (`T:95-98`, `In` O5,
  `In:115-127`).
- The starting truth is the truth Schema's constructor default (`truth.make({})`), the mechanism `Flow.initial` uses
  (`D:234`). So the constructor is exactly D3's `{ id, truth, layer }`, plus the optional `controls`.
- Every cut captures every stateful fixture's truth, as it captures `now`.
- **Controls** are the pushes and connection faults a stateful fixture needs (`T:63-64`, `T:143-145`). Each is a named
  Schema. The layer receives one `Queue` per control. `.control(fixture.name(payload))` offers the payload, and the
  fixture's own fiber reacts: the work becomes eligible, and `process()` runs it, as for any send. A control is data,
  not a callback (`T:17-18`). It is a type error unless the fixture is one of the Story's fixtures.
- **Plain Layers stay fixtures** (`T:54-56`). `Fixture.stateful` is needed only for truth on the cut and for
  controls.
- The property-test oracle (`T:133-134`, `T:147-148`) reads the same `truth`, and its generated pushes and
  disconnects (`T:143-145`) use the same controls.

### 3.6 Endings and lanes on the cut

```ts
run.checkpoints.reconciled.endings                         // ← NEW: cumulative, in admission order
// → [
//   { operation: "Stripe.confirm", key: { intentId: "pi_1" }, attempt: { id: "a1", retryCount: 0 },
//     channel: "unknown", reason: { _tag: "NoResponse" }, event: "Unsure", route: "current",
//     owner: { state: "PAYING", activation: 1 }, declined: [], turn: 3 },
//   { …, attempt: { id: "a1", retryCount: 1 }, channel: "unknown", reason: { _tag: "StillUnknown", failure: { _tag: "Busy" } }, … },
//   { …, attempt: undefined, channel: "failure", reason: { _tag: "NotSent", why: "Rejected" }, … },
//   { …, channel: "success", event: "Paid", route: "late", owner: { state: "PAYING", activation: 2 }, from: "root",
//     declined: [{ code: "LateMayNotLeave", context: { state: "PAYING" } }], turn: 19 },
// ]
run.checkpoints.reconciled.pending                         // existing (T:84-85), now with lanes
// → [{ kind: "lane", operation: "Stripe.confirm", key: { intentId: "pi_1" },
//      attempt: { id: "a1", retryCount: 2 }, phase: "invoked", waiting: 0, owner: { state: "PAYING", activation: 3 } }]

pay.pending(run.checkpoints.reconciled.snapshot, { intentId: "pi_1" })      // existing read (D:929) on the snapshot's own lanes
pay.retryCount(run.checkpoints.reconciled.snapshot, { intentId: "pi_1" })   // existing read (D:930)
check(run.checkpoints.reconciled.snapshot, E.Pay())                          // existing pure check (Mc O4)
```

- **Lanes on the snapshot.** A snapshot carries, for each lane that is not evicted, its `pending` and `retryCount`
  as of that publication. It carries nothing else: the current Attempt is not readable from guards or views (rule 21,
  `D:539-540`). These lanes are reachable only through a commit value's reads (`pending`, `retryCount`, `idle`) and
  `check()`. So "Reading an old snapshot never consults live lanes" (`Mc:166`) stays true, and an evicted lane is
  absent and reads as a fresh one (`D:541-542`). This amends Machines O8 (6.4).
- `owner` names the owning activation as `{ state, activation }`. `activation` counts that state's activations in
  the run from 1, so it is deterministic.
- `from` is the surviving ancestor where late routing started (rule 14, `D:502-504`).
- `declined` lists, in order, the denial reasons of the alternatives the ending's own turn passed over (2.5 steps 2
  and 3). So a late turn's `LateMayNotLeave` refusal (rule 15, `D:505-508`; `D:642-643`) is readable on the cut.
- Attempt ids come from the run's seeded source (`T:37-39`), so they are stable across replays.
- **Lane entries in `pending`** are listed exactly when `pay.pending` is true for that lane (rule 21, `D:536-537`).
  A lane that keeps a failed or unknown Attempt with nothing outstanding (`D:542-543`) is not pending work; its
  `retryCount` is read from the snapshot. `phase` is:
  - `"acknowledging"`: started, waiting for the Persistence O6 acknowledgement (`D:1205`);
  - `"invoked"`: the commit is running;
  - `"settled"`: the ending is queued in the mailbox and its turn is not yet admitted (`D:1206`).

  `waiting` counts starts queued behind the current one (`latest`, `serialize`; `D:1137-1138`).
- Every pending entry has a `kind`: `"schedule"`, `"operation"` (resource and stream work, as today), `"lane"`,
  `"arrival"` (3.7) or `"fixture"` (3.7).

### 3.7 Time, deadlines, acknowledgement and tabs

```ts
// P1, the mailbox race, with no extra command
export const lateWrongCode = story
  .machine(SignIn, { id: "SignIn/late-wrong-code", fixtures: FakeAuth({ answerAt: "15005 millis", status: 401 }) })
  .send(E.PasswordAccepted({ challengeId: "c1" })).send(E.code.Changed({ value: "123456" })).send(E.Submit())
  .advance("15020 millis")     // StopWaiting (15.000) then CodeWrong (15.005) are queued; no turn runs yet
  .process()                   // their turns are admitted in that order
  .checkpoint("struck")
// struck.endings[0].route === "late"; struck.lives.challenges → [{ key: "c1", life: 1, frozen: false }]

// cancel before invocation, and a reload mid-write
export const cancelEarly = story.app(setup, {
  id: "Upload/cancel-before-send",
  fixtures: [FakeUploads({ tombstones: true }),
             Fixture.storage({ acknowledge: "50 millis" })],   // ← NEW: Attempt acknowledgements wait on the controlled clock
})
  .ensure(uploadRef).send(uploadRef, E.Pick())
  .advance("20 millis").send(uploadRef, E.Cancel()).process()
  .checkpoint("cancelled")     // endings: NotSent { why: "Cancelled" }; truth.FakeUploads.files is empty

export const reloadMidCharge = story.app(setup, { id: "Checkout/reload", fixtures: FakeStripe({}) })
  .ensure(checkoutRef).send(checkoutRef, E.Pay())
  .advance("200 millis").closeTab("main").openTab("main")   // the same fake server: fixtures are run-scoped
  .process()
  .checkpoint("restored")      // endings: unknown, reason Restored, routed after readiness (D:1211)
```

- Every controlled-clock sleep in the run is a pending deadline:
  - Flow schedules: named, keyed and `.each`, with `kind: "schedule"`;
  - Flow's own waits, such as a storage acknowledgement, with `kind: "operation"`;
  - fixture sleeps, with `kind: "fixture"` and owner `fixture:<id>`.
- A frozen schedule is listed with `frozen: true`.
- A queued arrival whose turn has not been admitted is listed with `kind: "arrival"`, `phase: "queued"` and its
  mailbox `position`, in mailbox order. A queued call ending is not listed twice: it is its lane's entry with
  `phase: "settled"`, which carries the same `position`.
- A keyed schedule reads like `.each` copies (`D:75`): `s.schedules.<name>` is the list of armed keys in the order of
  the `keys` result, each `{ key, dueAt }`. So a key's deadline is `s.schedules.unlock[i].dueAt` (← NEW).
- `Fixture.storage({ acknowledge })` delays only Attempt acknowledgements (Persistence O6, `Ps:123-128`), each send
  included (P15, `D:2035`). Bootstrap restore, captures and other writes complete without waiting, so `openTab`
  readies without moving the clock.

### 3.8 Sends and verdicts

```ts
story.machine(Signup, { id: "Signup/invites" })
  .send(E.AddInvite())
  .send(E.invites.key("invite-2").Changed({ value: "grace@example.com" }))   // a copy's public event
  .send(E.RemoveInvite({ key: "invite-2" }))
  .send(E.invites.key("invite-2").Changed({ value: "x" }))                   // Unhandled: the row is gone
  .checkpoint("removed")
// run.frames[i].causes → [{ command: "send", event, verdict: "Unhandled" }]   // ← NEW: a list, kept through collapse
```

- `send` queues its event behind any arrivals already queued (FIFO, `D:595-596`). It runs every turn up to and
  including its own, in mailbox order, each followed by any pending-reset turn its commit queues (`D:379-380`).
  Then it stops. Operation work those turns start is drained by `process()` (`T:42-44`).
- The frame's cause carries the send's own verdict. The turns that ran ahead of it are part of the same frame, or
  get their own frames under `frames: "publication"` (`T:70-71`).

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

`.guards()` is not a raw state override, which `T:17-18` forbids. It writes no state, memory or schedule of the
subject. It replaces the harness's port fillings, which in a host are the host's policy outside the fragment
(rule 4, `D:399-401`). It runs no turn and publishes nothing, as Testing's equal-value `setContext` is silent
(`T:26-29`); the next turn's guard reads the new verdict.

### 3.10 Discovery

```ts
export default defineConfig({
  apps: [{ app, stories: appStories }],
  stories: [lockoutStories, confirmStories, testHostStories],   // ← NEW: Stories that belong to no App
})
```

### 3.11 Playback

The accepted playback design constrains this proposal in three ways:

- recording is the only execution (`PB:22-29`, `T:211-212`);
- a frame is a cut (`T:69`);
- the overlay's Inspect shows "the frame's cause, gaps and the run's evidence for it, or evidence unavailable beyond
  the trace's retained window" (`T:215-216`).

So every addition here is data on the cut, or a field of a frame's causes. None of them needs playback to run
anything.

```tsx
// a machine Story with fragments: plays like any other; nothing new to write
<StoryPlayer run={await lateWrongCode.run()}><SignInPage /></StoryPlayer>

// a fragment Story: its frames exist, but it has no app to render
<StoryPlayer run={await locks.run()} />          // type error: StoryPlayer takes StoryRun<"app" | "machine">
definePresentation(locks, { scenes: [] })         // type error, for the same reason
run.frames                                        // still readable: Inspect data, agent text frames (PB:186-187)
```

| Addition | How it appears in playback |
| --- | --- |
| **Send verdicts** (rule 4) | Part of the frame's causes, so Inspect shows "send E.Submit: Denied [StillChecking]". A collapsed frame keeps every cause in order (`causes`), so stepping by command (`T:213-214`) still visits every send, including Denied and Unhandled ones. The next-action highlight (`T:222-223`) compares the clicked event with the next command by tag, instance path and key: a click on row `invite-3` does not match a command for `invite-2`. |
| **A send behind queued arrivals** (rule 4) | The turns that ran ahead of the send are inside the send's frame (default) or get their own frames (`frames: "publication"`). Stepping by command still lands on the send. |
| **`"pendingReset"` cause** (3.4) | With `frames: "publication"` (`T:70-71`), the follow-up reset turn is its own frame, so the one-snapshot lag is visible while stepping. With the default per-command frames, the reset is inside the send's frame, because `send` runs it (rule 4). |
| **Lanes on the snapshot** (rule 8) | Required by playback: `StoryFrame` eligibility uses production `check()` (`T:107-108`), and `pay.idle(key)` reads lanes. The frame's snapshot carries its own `pending` and `retryCount` (Machines O8 amendment), so buttons render disabled while a write is in flight, and no live lane is read. Inspect lists lane entries under pending work while they are pending. |
| **`checkpoint.endings`** (3.6) | Inspect shows the endings admitted up to the frame, current or late, with `declined` (so a `LateMayNotLeave` refusal is visible). These are cut records, not trace events, so they stay available beyond the trace window. "Evidence unavailable" (`T:215-216`) still applies to the trace view only. |
| **`checkpoint.calls`, `checkpoint.lives`** (3.3, 3.4) | Inspect shows them for the frame. They are retained with the cut, so they never show "evidence unavailable". The rendered UI shows only what views read; lives never appear in view types (rule 6). |
| **`checkpoint.truth`** (3.5) | Inspect shows each fixture's truth at the frame, raw (`PB:170-173`): render only non-sensitive fixture data when sharing. Truth is per run, not per tab, so it is shown once for the frame, not under `tabs.<name>`. |
| **Fixture controls** (3.5) | A `.control` command makes one frame whose cause is the command. It has no UI control, so the next-action highlight skips it, as it skips `advance`. |
| **Clock rules** (rule 9) | An `advance` command makes one frame, and its cause is the command. That frame shows the new `now` and, in pending work, each queued arrival not yet admitted (`kind: "arrival"`, and lane entries in phase `"settled"`), in mailbox order. That is how the overlay shows a mailbox race. The following `process()` makes one frame (default) or one per publication. Frames inside one `process()` share `now`, which playback's `minDwell` already handles (`PB:159-161`). Scrubbing is a lookup (`T:211-212`), so the clock is never moved while watching. |
| **Run-scoped fixtures and tabs** (rule 11) | `StoryFrame tab` selects a tab's cut (`T:108`). Between `closeTab` and `openTab`, the frame has no cut for that tab: `StoryFrame` renders nothing for it and records a frame-level tab gap, `TabClosed`. It is not an actor gap (`T:102-104`). After `openTab`, the restored tab renders as any tab does. The fixture's truth is the same before and after, because it belongs to the run. |
| **Fragment Stories** (3.2) | Not playable (above). Playback's own open question (`PB:195-197`) would let a focused Story's actor stand in for a component's actor. This proposal does not extend that to fragments: rendering a fragment would need a component bound to a harness slice, and that is a new rule. |
| **Harness commands** (`.enter`, `.leave`, `.guards`) | Only fragment Stories have them, and those are not playable. |

## 4. Rules

1. **Kinds.** There are four Story constructors: `story.app`, `story.machine`, `story.trait` and `story.subroutine`.
   - `story.trait` accepts only a trait and `story.subroutine` only a subroutine. Anything else is a type error.
   - Fragment Stories take `{ id, input?, guards? }`. `input` is required exactly when the trait declares
     `Flow.input` fields. A subroutine's input goes to `.enter(input)`.
   - `run()` returns `StoryRun<Kind>`, branded by the constructor's kind.
2. **Harness.** In a fragment Story, every port of the subject is filled by the harness. Children the subject places
   are filled by its own body, as in production.
   - A guard port answers its current verdict. The default is `true`. A verdict is `true` or a `Flow.Denial`, never a
     function. `.guards({ … })` replaces verdicts for later turns; it runs no turn.
   - A callback port records (rule 5) and does nothing else.
   - An exit port records, then ends the life.
3. **Lifetime alone.**
   - The harness root has two child states, `IN` and `OUT`. The subject is placed in `IN`. A fragment Story's
     snapshot is the subject's slice.
   - A trait Story starts in `IN`; a subroutine Story starts in `OUT`.
   - `.leave()` moves to `OUT`, and `.enter(input?)` moves to `IN`. Freezing, resuming, ending and new lives follow
     design rule 1 (`D:353-390`) exactly as in a host. A subroutine's `.leave()` abandons it as a host transition
     would.
   - `.leave()` in `OUT`, or `.enter` in `IN`, rejects with `InvalidStoryCommand` when that command is reached.
     Later commands do not run, and evidence up to it survives, as with `StoryTurnLimit` (`T:44-46`).
4. **Sends.**
   - `send` accepts public events at any instance path, including keyed copies and subroutine events.
   - A fragment Story's `send` also accepts its subject's `hostEvents`.
   - Internal events and exits are never sendable (rule 2, `D:396-397`; `D:1957`).
   - `send` queues its event behind arrivals already queued. It runs every turn up to and including its own, each
     followed by the pending-reset turn its commit queues (`D:379-380`, `D:669-670`). Nothing else runs until
     `process()`.
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
   - The fragment evidence kinds of 3.4 are cumulative per cut. `droppedDelivery` never covers a call ending.
7. **Fixture truth.**
   - A `Fixture.stateful` declares `id`, a `truth` Schema whose constructor default is the starting truth, an
     optional `controls` record of Schemas, and a `layer` built from the truth `Ref` and one `Queue` per control.
   - Every cut captures each declared truth by `id`. Duplicate ids reject before acquisition, as duplicate Tags do
     (`T:57-58`).
   - `.control(fixture.name(payload))` offers a control's payload. It is a type error for a fixture the Story does
     not declare.
   - Checkpoints take no predicate. Plain Layers remain valid fixtures.
8. **Endings and lanes.**
   - Every ending admitted is recorded on the cut, cumulatively and in admission order, with:
     - operation, key, Attempt (or `undefined`), channel and reason;
     - the mapped event;
     - `route`, `owner` (`{ state, activation }`) and `from`;
     - `declined`, the denial reasons of the alternatives its turn passed over.
   - A lane is a `pending` entry exactly while `pay.pending` is true for it. Its phase is `"acknowledging"`,
     `"invoked"` or `"settled"` (ending queued, turn not yet admitted).
   - A snapshot carries, per lane not evicted, only `pending` and `retryCount`, reachable only through commit-value
     reads and `check()`. Reading a snapshot never consults live lanes.
9. **Clock.**
   - Every controlled-clock sleep is a pending deadline.
   - `advance`, `advanceTo` and `advanceToNextTimer` move time through deadlines in order. At each deadline the
     woken work runs until idle, fixtures included, and its arrivals are queued in that order. No turn is admitted.
   - Equal deadlines are ordered by:
     - actor admission order, then outermost state, then declaration order (`Mc:119-120`);
     - then `.each` list order (`D:456`);
     - then key-list order for keyed schedules;
     - then, for anything still tied, owner kind (actor schedules, then Flow's own waits, then fixture sleeps), then
       the order in which the sleeps began.
   - A frozen deadline is listed with `frozen: true`, is never due, and is skipped by `advanceToNextTimer`.
   - A queued arrival whose turn has not been admitted is listed in `pending` with `kind: "arrival"`,
     `phase: "queued"` and its mailbox `position`. A queued call ending is listed only as its lane entry, in phase
     `"settled"`, with its `position`.
   - A keyed schedule's snapshot entry is a list in `keys` order, each `{ key, dueAt }`.
10. **Storage.**
    - `Fixture.storage({ acknowledge?, seed? })` provides the fresh in-memory KeyValueStore. `seed` is Testing's
      existing storage-fixture seeding (`T:66-67`) in constructor form.
    - Only Attempt acknowledgements (Persistence O6) wait `acknowledge` on the controlled clock. Restore and other
      writes do not.
    - It can neither bypass validation nor open external storage (`T:64-67`).
11. **Scope.**
    - Fixtures are acquired once per run, before any tab's Runtime, and shared by every tab.
    - A fixture may depend only on other fixtures and on run-level services (the controlled Clock, the seeded random
      source, the run's Scope). It may still shadow setup services. A fixture that requires a per-tab setup service
      is a type error, and rejects before acquisition for untyped callers.
    - Other setup services are acquired per tab's Runtime.
    - `Restored` endings are produced only by App Stories, through `closeTab` and `openTab`.
12. **Discovery.**
    - `defineConfig({ apps, stories })` discovers App-free Stories.
    - Ids are unique across the whole configuration.
    - A machine in `stories` needs only its own services. Fixtures provide them.
    - The trace of an App-free Story has no App identity: `appId` and `appFingerprint` are `null`.
13. **Snapshot types.** A checkpoint's snapshot is typed with `Flow.private` fields.
14. **Playback.**
    - `StoryPlayer` and `definePresentation` accept `StoryRun<"app" | "machine">` and their Stories only. A fragment
      Story is a type error there.
    - A frame has `causes`, a list. Collapsed frames keep every cause, in order.
    - The next-action comparison matches the event's tag, instance path and key. `advance` and `.control` commands
      have no control to highlight.
    - `StoryFrame tab` for a tab absent from the frame renders nothing and records the frame-level gap `TabClosed`.
    - Inspect shows the frame's cut records (`calls`, `lives`, `endings`, `truth`, `pending`) beside the trace view.
15. **Port names.** A contract's callback and exit names are unique (D2). Declaring one name as both is a type error
    where the contract's types can show it, and a `flow check` construction error otherwise (`D:474-479`).

## 5. How it is implemented

On the one production Runtime. Nothing predicts and nothing runs twice.

- **Fragment Stories** wrap the subject in a generated harness machine. Its root has two child states, `IN` and
  `OUT`. A trait is placed on `IN`'s node with `Flow.state({ traits })` (`D:333-336`); a subroutine is the state `IN`.
  `.enter` and `.leave` send harness events that move between them, so leaving `IN` freezes or ends a trait exactly
  as leaving a host node does. The harness fills ports with verdict lookups and recorders. The Runtime, turn
  algorithm and evidence are the production ones, and harness states and events are hidden from snapshot paths,
  calls, lives and causes.
- **Calls, lives, endings and fragment evidence** need **new Inspection O4 event kinds**: the kinds Inspection lists
  today (`In:85-90`) have none of them. The design's Inspection O1 row (`D:1999`) makes fragments, copies and
  incarnations appear in `inspect`, not in the trace. The Runtime emits the new kinds. The Story collector folds them
  into per-cut cumulative records as it does repairs today (`T:93`), so the trace window does not bound them.
- **Lanes on snapshots** are published with the turn: each publication copies the `pending` and `retryCount` of every
  lane not evicted. Unchanged lanes keep identity (`Mc:166-167`, `PB:79-81`).
- **Truth capture** reads each stateful fixture's `Ref` with `Ref.get` at the cut, encodes it with its Schema, and
  stores the value. **Controls** are one `Queue` per declared control, created with the fixture.
- **The clock** is Effect's TestClock, with an ordered wake list in front of it that applies rule 9's tiebreaks.
  `advance` steps deadline by deadline. After each step it yields until no fiber in the run is runnable, and only
  queues arrivals in mailboxes. `process()` admits and runs queued turns.
- **Playback** needs no new execution. The new records are fields of frames, which `StoryFrame` and the overlay
  already receive. The collapse step merges causes instead of dropping them.
- **Run-scoped fixtures** are built in the run's scope, before any tab's Runtime, from run-level services only (rule
  11). Each tab's setup is provided with the fixture Layer's output.

## 6. Changes

### 6.1 Added

| Added | Kind | Meaning |
| --- | --- | --- |
| `story.trait(T, { id, input?, guards? })` | Story constructor | a trait alone (3.2) |
| `story.subroutine(S, { id, guards? })` | Story constructor | a subroutine alone (3.2) |
| `StoryRun<Kind>` | type brand | the run's Story kind, for tools that accept only some (rule 1) |
| `.enter(input?)` / `.leave()` on trait Stories | commands | move the harness between `IN` and `OUT` (rule 3) |
| `guards` option, `.guards({ … })` command | harness verdicts | `true \| Flow.Denial` per guard port (rule 2) |
| `checkpoint.calls.<path>.<port>` | cut evidence | callbacks, `whenAbandoned` notifications and exits (rule 5) |
| `checkpoint.lives.<path>` | cut evidence | `{ life, frozen, key? }` (rule 6) |
| `listRepair`, `droppedDelivery`, `droppedRaise`, `reset` | cumulative evidence kinds | 3.4 |
| `"pendingReset"` | frame cause | 3.4 |
| `checkpoint.endings`, with `owner: { state, activation }`, `from`, `declined` | cut evidence | every admitted ending (rule 8) |
| Lanes on snapshots: `pending`, `retryCount` per lane | snapshot member | read only through commit-value reads and `check()` (rule 8) |
| `kind` on every `pending` entry; `kind: "lane"` with `phase`, `waiting` | pending entry | rule 8 |
| `kind: "arrival"`, `phase: "queued"`, `position` | pending entry | a queued arrival not yet admitted (rule 9) |
| `frozen`, `kind: "fixture"` with owner `fixture:<id>` | pending entry fields | rule 9 |
| `s.schedules.<name>[i]`, each `{ key, dueAt }` | snapshot path | a keyed schedule's deadlines (rule 9) |
| `Fixture.stateful({ id, truth, controls?, layer })` | fixture constructor | rule 7 |
| `.control(fixture.name(payload))` | command | offers a fixture control's payload (rule 7) |
| `checkpoint.truth.<id>` | cut read | captured truth |
| `Fixture.storage({ acknowledge?, seed? })` | fixture constructor | rule 10 |
| `defineConfig({ stories })` | configuration | rule 12 |
| `causes`, each with `verdict` for a send | frame field | rules 4 and 14 |
| `TabClosed` | frame-level gap | rule 14 |
| `InvalidStoryCommand` | rejection code | an `.enter` or `.leave` that does not fit the harness state, at the command (rule 3) |
| New Inspection O4 event kinds | trace | calls, lives, fragment evidence, endings with route (section 5) |

### 6.2 Changed

| Changed | Before | Now |
| --- | --- | --- |
| Testing a fragment alone | `story.machine(fragment, { id })` (`D:470`, `D:1998`) | `story.trait` / `story.subroutine` |
| Recorded notifications | `run.calls.<callback>` per run (`D:471`) | `checkpoint.calls`, per cut, in every Story kind |
| Checking server truth | `.checkpoint(name, ({ truth }) => …)` (`D:1191`, C16 `D:2032`) | `.checkpoint(name)` and `checkpoint.truth` |
| What `send` runs | unstated (`T:22-29`); "runs its turn" (`D:1998`); the whole mailbox (`SF:458`) | the queued turns ahead of it, its own turn, and their pending-reset follow-ups (rule 4) |
| Transaction lanes | "Transactions have outcomes, never lanes" (`Op:162`) | lanes per rule 21, readable on snapshots and listed in `pending` while pending |
| The snapshot | state, memory, context, issues, lifecycle, activities (`Mc:162-166`) | the same, plus each lane's `pending` and `retryCount` |
| Frame cause | one cause per frame; identical frames collapse (`T:71-74`) | `causes`, a list; collapse keeps every cause in order |
| Fixture scope and dependencies | per run, unstated across tabs; may depend on setup services (`T:57`, `T:63`, `T:166-172`) | per run, shared by tabs; may depend only on fixtures and run-level services |
| Story storage | fresh in-memory store, seeding only (`T:64-67`) | the same store, with optional clock-driven Attempt acknowledgement |
| Story id scope | unique within its App (`T:12-13`) | unique across the configuration |
| Keyed schedule reads | unspecified (`D:70-76`, `D:1163-1177`) | `s.schedules.<name>[i]`, `{ key, dueAt }`, in `keys` order |

### 6.3 Removed

| Removed | Was | Why |
| --- | --- | --- |
| `story.machine` for fragments | `D:470`, `D:1998` | a fragment is not an actor; options and discovery do not fit (G6) |
| `run.calls` | `D:471` | replaced by `checkpoint.calls`, which also works in a host |
| The checkpoint predicate | `D:1191`, `D:1935`, C16 `D:2032` | a callback in a plan (`T:17-18`) |
| `ackDelayMs`, `advanceHeld` | spike only (`SF:239`, `SF:462`) | replaced by `Fixture.storage` and rule 9 |

### 6.4 Amendments by target document

The design's `merged/` records are not amended: the design wins over them (`D:3-5`), so every server-call amendment
targets the design.

| Target | Amendment |
| --- | --- |
| **Testing O1** (`T:8-35`) | four constructors (rule 1); fragment Story options; rules 2–4; `send` at instance paths, keyed copies and subroutine events; host-event sends in fragment Stories only; the send rule of rule 4; "Both Story kinds" (`T:22`) becomes "Every Story kind"; `.control` (rule 7); `defineConfig({ stories })` (rule 12); "unique within its App" (`T:12-13`) becomes "unique across the configuration"; `StoryRun<Kind>` |
| **Testing O2** (`T:36-52`) | rule 9: every controlled-clock sleep is a deadline; arrivals queued without admitting turns; equal-deadline tiebreaks, including the final one; frozen deadlines |
| **Testing O3** (`T:53-67`) | `Fixture.stateful` with Schema truth and controls (rule 7); plain Layers stay; `Fixture.storage` (rule 10); fixtures run-scoped and shared by tabs (rule 11); "Fixtures may depend on setup services" (`T:57`) becomes "Fixtures may depend on other fixtures and run-level services, and may shadow setup services" |
| **Testing O4** (`T:68-99`) | `checkpoint.calls`, `checkpoint.lives`, `checkpoint.truth`, `checkpoint.endings`; `kind` on every pending entry, lane entries, queued arrivals and `frozen`; the fragment evidence kinds; `"pendingReset"`, `causes` and `verdict`; collapse keeps causes; owner-typed snapshots (rule 13) |
| **Testing O4, StoryFrame** (`T:100-109`) | eligibility reads lanes on the frame's snapshot; `tab` for a tab absent from the frame renders nothing, with the frame-level gap `TabClosed` beside the actor gaps (`T:102-104`) |
| **Testing O6** (`T:129-160`) | the oracle reads `Fixture.stateful` truth, the same concept as `checkpoint.truth`; generated pushes and disconnects use its controls (`T:143-145`) |
| **Testing O7** (`T:166-172`) | "Tabs share nothing else" gains "except the run's fixtures"; `Restored` endings are App-Story-only |
| **Testing O9** (`T:208-223`) | `StoryPlayer` and `definePresentation` take `StoryRun<"app" \| "machine">` only; stepping by command uses the causes kept through collapse; the next-action highlight matches instance path and key and skips `advance` and `.control`; Inspect shows the frame's cut records, which never show "evidence unavailable" |
| **playback.md** (`PB:97-108`, `PB:131-136`) | explanatory text follows the Testing O4 and O9 rows (the plan wins, `PB:3-4`) |
| **Machines O8** (`Mc:162-166`) | the snapshot gains, per lane not evicted, `pending` and `retryCount` as of its publication, reachable only through commit-value reads and `check()`; "Reading an old snapshot never consults live lanes" stays. This extends the design's Machines O8 row (`D:1996`) |
| **Machines O1**, **CommandLine O5** | a contract's callback and exit names are unique: a type error where types show it, otherwise a `flow check` construction error (D2, rule 15) |
| **Operations O6** (`Op:162`) | "Transactions have outcomes, never lanes" is replaced by rule 21's lanes (`D:534-546`), readable on snapshots (Machines O8 above) |
| **Inspection O4** (`In:79-114`) | new event kinds (`In:85-90` has none): fragment calls, lives, list repairs, dropped deliveries and raises, resets, and endings with route, owner, from and declined reasons; Story cuts retain them beyond the trace window. The Trace's checkpoints (`In:97-99`) and its closed import schema (`In:105-106`) gain the new checkpoint members (`calls`, `lives`, `endings`, `truth`, the new `pending` fields) and `causes`; `appId` and `appFingerprint` are `null` for App-free Stories (rule 12) |
| **Inspection O5** (`In:115-127`) | redaction covers captured truth by its Schema, and endings' keys, inputs and reasons as keys and errors already are |
| **Package** (`Pk:19-20`) | `flow-state/testing` exports `Fixture`; `StoryRun` is branded by kind |
| **machine-design rule 11** (`D:470-473`) | rewritten as rules 1–5 here: `story.trait`, `story.subroutine`, harness defaults and verdicts, `.enter`/`.leave` for both kinds, `checkpoint.calls`, `checkpoint.exit` |
| **machine-design 2.1** (`D:70-76`) | add `s.schedules.<name>[i]`, each `{ key, dueAt }`, for keyed schedules (also 2.7.10, `D:1163-1177`) |
| **machine-design 2.2** (`D:81-151`) | add D2's rule: callback and exit names are unique within a contract |
| **machine-design 2.7.11** (`D:1186-1196`) | the predicate Story becomes 3.5's capture; "a checkpoint reads it" becomes "every cut captures it" |
| **machine-design 3.1, 3.2 examples** (`D:1650-1660`, `D:1764-1766`) | `story.trait` / `story.subroutine`; `calls` read per checkpoint; the Confirm checkpoint renamed from `end` |
| **machine-design 3.6 keywords** (`D:1934`, `D:1935`) | `story.machine(fragment)` with `run.calls` becomes `story.trait` / `story.subroutine` with `checkpoint.calls`; `.checkpoint(name, ({ truth }) => …)` becomes `Fixture.stateful` and `checkpoint.truth` |
| **machine-design section 5, Testing O1 row** (`D:1998`) | replaced by the Testing O1 row above |
| **machine-design section 5, C16** (`D:2032`) | replaced by the Testing O2, O3 and O4 rows above; "every ending can be produced through services" stays |
| **machine-design section 5, server calls** (`D:2013-2037`) | gains the Machines O8 and Operations O6 rows above |

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
| G8 what `send` runs | 3.8, rule 4 |
| G9 playback | 3.11, rule 14 |
| Harness guards, callbacks and exits | 3.9, rule 2 |
| Private fields in Story reads | 2, rule 13 |
| Callback and exit names unambiguous in `calls` | 3.3, rule 15 |
| `success`, `failure` by tag, `unknown` by author reason | the fixture answers; the author's commit classifies (`D:734-753`); read in 3.6 |
| `unknown(Defect)` and its actor issue | the fixture dies; the issue is on the cut (`T:79`); read in 3.6 |
| `unknown(Interrupted)` | the fixture interrupts itself; its interruptor is not Flow's (`D:762`, `D:798-799`); read in 3.6 |
| `unknown(Cancelled)` | a cancel while the fixture's sleep is pending (rule 24, `D:568-571`); 3.6, 3.7 |
| `NotSent(Cancelled)` | a queued start under `serialize`/`latest`, or a cancel during acknowledgement (3.7, rule 10) |
| `NotSent(Superseded)`, `NotSent(Rejected)`, `NotSent(NothingToResend)` | sends (`D:759`); read in 3.6 |
| `NotSent(Restored)`, `unknown(Restored)` | `Fixture.storage` and tabs (3.7, rules 10–11) |
| `StillUnknown { failure }` | a stateful fixture that drops and then fails; read in 3.6 |
| `pending`, `retryCount`, `idle` agreeing with `check()` | 3.6, rule 8 |
| `LateMayNotLeave` | `declined` on the ending record (3.6) |
| Pushes and disconnects from a fake server | `Fixture.stateful` controls (3.5) |
| Mailbox race (spike P1) | 3.7, rule 9 |
| Keyed schedules | 3.7, rule 9 |
| `.each` copies, lives, repairs, drops | 3.3, 3.4, 3.8 |
| Resumable traits: freeze, overdue firing | 3.2, 3.4, rule 9 |
| `whenAbandoned` alone and in a host | 3.2, 3.3 |
| Restore mid-write, charged once | 3.5, 3.7 |
| Merge 1's `Timeout` | the design has no Flow timeout (`D:766-767`, rule 25); a schedule plus `cancel` is covered above |
| `orphaned` across a version change | not covered: saved-state Stories are left out (`D:2083-2084`) |

## 8. Alternatives considered

- **Keep `story.machine` for fragments.** Rejected:
  - three of its five options do not apply;
  - discovery checks machines;
  - `.enter` and `checkpoint.exit` would be conditional members of an actor Story.
- **`story.fragment(F)`.** Rejected: "fragment" would become a new public word (it is not an export or keyword,
  `D:1934`, `D:1986`), and the trait/subroutine differences would hide behind conditional types.
- **`story.alone` / `story.harness`.** Rejected: they name the method, not the subject.
- **A host with one fragment stubbed.** Rejected: rule 10 and `flow check` already cover swapping a fragment, so it
  would add a concept and prove nothing new.
- **A checkpoint predicate over truth** (`D:1191`). Rejected:
  - it is a callback in a plan (`T:17-18`);
  - it makes a capture into an assertion (`T:75`);
  - a boolean hides the value when it fails.
- **Reading truth only at `end`.** Rejected: races need truth mid-story, before and after a reload.
- **Calls and endings read from the trace.** Rejected: the window is 4,096 events (`In:101`), and "Truncation …
  cannot prove an absent cause" (`T:94`).
- **A `.hold()` / `.release()` fixture command.** Rejected for now: it would be a second scheduling channel beside
  the clock (`T:37-40`). Time-scripted fixtures reproduce every spike race. Controls (3.5) are messages to a fixture,
  not a scheduler.
- **An `advanceHeld` command.** Rejected: rule 9 gives Testing's existing `advance` that meaning.
- **An `ackDelayMs` actor option.** Rejected: storage behaviour belongs to the storage fixture (locality).
- **A closure guard in the harness.** Rejected: `T:17-18`.
- **A "deny every guard" switch.** Rejected: it cannot name the code a host forwards.
- **Harness callbacks with handlers.** Rejected: that is writing a host. Write a test machine instead.
- **A `.reset()` command for trait Stories.** Rejected for now: `resetOn` is a host filling (`D:290`), tested with
  `story.machine`.
- **Fixtures per tab.** Rejected: a reload would meet a different server.
- **Sharing only the truth `Ref` across tabs, building the rest of each fixture per tab.** Rejected for now: a fake
  server's other state (a script's position, a dropped-first flag) would restart on reload, so the reopened tab
  would meet a server that forgot its own script. Section 9, question 9.
- **Playing fragment Stories through a generated component**, for example a harness view that prints the slice.
  Rejected: playback shows the real app UI (`PB:8-10`), and a generated UI is not the app.
- **Showing cut records only within the trace window**, as Inspect's trace view does. Rejected: the records are
  retained with the cut precisely so they never go missing.
- **The full lane on the snapshot** (the current Attempt, the starter, the phase). Rejected: rule 21 keeps the
  current Attempt out of guards and views (`D:539-540`); the reads need only `pending` and `retryCount`.

## 9. Open questions

Each is unconfirmed by the owner. The recommendation is the design above unless the question says otherwise.
Numbers are stable across revisions. Questions 21 onward are new in revision 1: the choices made while fixing
correctness findings (21–28), then the review's simplicity findings (29–39). The rounds order them for answering,
most foundational first. A later round may depend on an earlier one, never the reverse.

1. *Answered: D1.*
2. *Answered: D1.*
3. *Answered: D2.*
4. *Answered: D2.*
5. *Answered: D3.*

### Round 1: what a frame holds

31. **S-H3: one cause per frame.** Before: collapse merges causes, so `cause` becomes `causes`, a list, for every
    consumer (C-M8). Reviewer's alternative: never collapse across a command boundary, so every command keeps its
    own frame with a singular `cause` and `verdict`; only publications inside one command collapse. *Recommend the
    reviewer's alternative.* Frames per command are what playback steps by anyway, and the cost is a few more
    identical frames. **Also resolves C-M8's cause list:** `causes` and its change row go away.
13. **Send verdicts in frame causes**, kept through collapse? *Recommend yes,* in whichever form question 31 picks.
30. **S-H2: frame weight.** Before: every cut carries cumulative calls, endings, evidence, a lives tree, every
    fixture's truth and lanes; copied per frame this is quadratic in run length. Reviewer's alternative: one
    append-only run log with a per-frame length; truth captured only when it changed; only `pending` and
    `retryCount` on snapshots. *Recommend yes,* as a stated rule. Testing already says a frame "refers to evidence by
    sequence position rather than copying it" (`T:73-74`), so this applies that rule to the new records. The
    slim-lanes part is already taken by question 21.

### Round 2: where cumulative records live

29. **S-H1: cumulative records in five homes.** Before: `endings` is its own read, while repairs, dropped deliveries,
    dropped raises and resets are evidence kinds, and lane state is read twice (`pay.pending(snapshot)` and `pending`
    entries). Reviewer's alternative: put endings in the cumulative evidence list as an `ending` kind, and drop lane
    entries from `pending`, so lanes are read only from the snapshot. *Recommend yes to both.* `calls` and `lives`
    stay checkpoint members (D2). **Also resolves C-M5 and part of C-H2:** with no lane entries, `pending` cannot
    disagree with `pay.pending`, and a queued ending is simply a queued arrival (questions 22 and 19 simplify).
6. **Endings on the cut**: the record of rule 8, with `owner` as `{ state, activation }` (the review's low on
   `STATE#n`) and `declined` holding `LateMayNotLeave` (C-M9)? *Recommend yes,* as its own read or as an evidence
   kind per question 29.
35. **S-M4: `owner` and `from`.** Reviewer's alternative: keep `route`; defer `owner` and `from`. Revision 1 already
    replaced the `"PAYING#1"` string with a record. *Recommend the reviewer's alternative:* `route` plus the
    resulting snapshot shows where a late ending went. Add `owner` and `from` when a Story needs them.

### Round 3: lanes

21. **Lanes on snapshots (C-H1).** Choice made: a snapshot carries only each lane's `pending` and `retryCount`,
    reachable only through commit-value reads and `check()`; this amends Machines O8. Alternative: carry the whole
    lane, which rule 21 forbids for views. *Recommend the choice made.*
22. **Lane entries in `pending` (C-H2, C-M5).** Choice made: listed exactly while `pay.pending` is true, with phases
    `acknowledging`, `invoked` and `settled`; a queued ending is its lane entry in phase `settled`. *Recommend yes,
    unless question 29 drops lane entries.*
36. **S-M5: names.**
    - `endings[].key` is a transaction key (a record), while `calls` and `lives` keys are copy keys (strings).
    - `pending` now has four meanings.
    - `by: "exit"` sits next to `checkpoint.exit`.
    - `Fixture.stateful` names a kind, while `Fixture.storage` names a subject.

    *Recommend keeping the names.* The design itself uses `key` for both meanings (`D:842`, `D:437-441`), `kind` now
    tells `pending` entries apart, and D3 fixes `Fixture.stateful`. Revisit with the design's naming question
    (`D:2107-2108`).

### Round 4: time and the mailbox

7. **The clock rules** (rule 9): all sleeps as deadlines, arrivals queued without admitting turns, tiebreaks, frozen
   deadlines skipped? Revision 1 adds a final tiebreak for anything Mc's order leaves tied, such as a fixture sleep
   at the same instant as a schedule (C-M1): owner kind, then the order the sleeps began. *Recommend yes.*
38. **S-L: tiebreak levels.** Reviewer: document the tiebreak and add no more levels. This conflicts with question 7's
    final level, which C-M1 needs for a total order. *Recommend keeping the final level* (correctness first) and
    adding no others.
14. **What `send` runs** (C-M6): the queued turns ahead of it, its own turn, and their pending-reset follow-ups, then
    stop? Alternative: `send` refuses (`InvalidStoryCommand`) while arrivals are queued, forcing a `process()` first.
    *Recommend the FIFO rule,* for every Story kind, because it is what production does with a user event.

### Round 5: queue and reset visibility

19. **Queued arrivals in `pending`** (`kind: "arrival"`, `phase: "queued"`, `position`), so an `advance` frame shows
    the mailbox race? Revision 1 names this "queued" and keeps "admitted" for rule 14 (C-H2). *Recommend yes.*
    Without it the mailbox race is invisible in the overlay.
34. **S-M3: defer `phase: "queued"`.** Reviewer: it serves only the overlay and gives `phase` two vocabularies.
    *Recommend keeping the entry and dropping its `phase`.* `kind: "arrival"` already says it is queued, which
    removes the second vocabulary and keeps the race visible.
33. **S-M2: drop the `"pendingReset"` cause.** Reviewer: it is visible only with `frames: "publication"` and
    duplicates the `reset` evidence with source `"pendingReset"`. *Recommend yes:* a publication frame's cause is its
    sequence (`T:73-74`), and the `reset` evidence at that position names it.

### Round 6: fixtures

9. **Run-scoped fixtures shared by tabs (C-H3).** Choice made: fixtures may depend only on other fixtures and on
   run-level services, and may still shadow setup services; this amends `T:57`. Alternative: share only the truth
   `Ref` and build the rest of each fixture per tab, which keeps `T:57` but restarts a fake server's script on reload
   (section 8). *Recommend the choice made.*
23. **The starting truth (C-M7, S-L).** Choice made: it is the truth Schema's constructor default, so the constructor
    is exactly D3's `{ id, truth, layer }`. Alternative: an `initial` member, clearer to read, but it adds a member to
    D3's signature, so D3 would need amending. *Recommend the choice made.*
24. **Fixture controls (C-M7).** Choice made: an optional `controls` record of Schemas, one `Queue` per control in
    the layer, and a `.control(fixture.name(payload))` command; property tests use the same controls. Alternative:
    controls only for property tests, with Stories scripting pushes by time. *Recommend the choice made:* pushes and
    disconnects at a chosen step are what Stories of subscriptions need, and a data command is not a callback.

### Round 7: storage and tabs

8. **`Fixture.storage({ acknowledge })`**, delaying only Attempt acknowledgements (C-M3)? *Recommend yes.*
37. **S-L: `seed` duplicates existing seeding.** Reviewer: `Fixture.storage({ seed })` may duplicate Testing's
    storage-fixture seeding (`T:66-67`). Revision 1 states that `seed` is that seeding in constructor form.
    *Recommend keeping it there,* so storage has one constructor. Merge it into the existing form if the owner
    prefers no constructor.
18. **A closed tab in a frame**: render nothing and record the frame-level gap `TabClosed`? This fills a case
    playback leaves unspecified (`T:108`) and does not override it. *Recommend yes.*

### Round 8: the fragment harness

10. **Harness defaults**: guards pass, callbacks record, exits record and end the life, with the subject under a
    harness child state so a trait can freeze (C-M4), and the Story's snapshot as the subject's slice? *Recommend
    yes.*
11. **The data-only refusing guard**: the `guards` option and the `.guards()` command, `true | Flow.Denial`, added to
    D1's option list; `.guards()` is not a raw state override (3.9)? *Recommend yes.*
32. **S-M1: two ways to set a harness guard.** Reviewer's alternative: keep the option, defer the command. *Recommend
    the reviewer's alternative:* a second Story per verdict covers a verdict that changes, and the command can be
    added when a Story needs a change mid-run.

### Round 9: the fragment Story surface

39. **S-L: say `checkpoint.exit` is the subroutine-alone shorthand** for the last exit recorded under
    `checkpoint.calls`. *Recommend yes,* as one sentence in rule 5; D1 keeps it subroutine-only.
27. **Unique callback and exit names (D2's consequence, C-M2).** Choice made: a type error where the contract's types
    show it, otherwise a `flow check` construction error. *Recommend yes.*
17. **Fragment Stories in playback.** Should they stay unplayable (rule 14), or should playback's own open question
    (`PB:195-197`, a focused Story's actor standing in for a component's actor) be extended to fragments? *Recommend
    unplayable for now.* Revisit when playback settles its question 2.

### Round 10: discovery and reads

12. **`defineConfig({ stories })`** for App-free Stories? *Recommend yes.*
26. **Story ids across the configuration (C-M11).** Choice made: ids are unique across the whole configuration, and
    an App-free Story's trace has `appId` and `appFingerprint` `null`. Alternative: ids unique per App and per
    `stories` entry, with the App as part of identity. *Recommend the choice made:* one id names one Story in CLI
    output and traces.
25. **The keyed schedule path (C-M10).** Choice made: `s.schedules.<name>[i]`, each `{ key, dueAt }`, in `keys` order,
    like `.each` copies (`D:75`). Alternative: a record by key, `s.schedules.<name>[key]`, which reads more directly
    but breaks the design's one convention for keyed lists. *Recommend the choice made.*

### Round 11: confirming what is left out

15. **A `.reset()` command for trait Stories**? *Recommend no* (section 8).
16. **A fixture hold-and-release command**? *Recommend no for now* (section 8).
20. **Wider coverage of `.each` membership.** Which transitions add or remove keys is Story-checked (`D:461-463`). If
    more is wanted, any exploration would have to run on the real Runtime. *Recommend nothing now.*

Old-to-new map: questions 1–20 keep their numbers. Questions 21–39 are new; each records the finding it answers.

## 10. Decisions

Settled by the owner. Each records the choice, why it wins, what it commits the design to, and what was rejected.
The text is kept as decided. Its citations predate the merge: `M2:380` is now `D:1191`, and `T:17` is `T:17-18`.

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
- `StoryRun<Kind>`
- `.enter()` and `.leave()` on trait Stories
- `guards` (Story option) and `.guards({ … })` (command)
- `checkpoint.calls`, with `by: "transition" | "whenAbandoned" | "exit"`
- `checkpoint.lives`, with `life` and `frozen`
- `listRepair`, `droppedDelivery`, `droppedRaise`, `reset` (evidence kinds)
- `"pendingReset"` (frame cause)
- `causes` (frame field), with `verdict` for a send
- `checkpoint.endings`, with `channel`, `reason`, `attempt`, `route: "current" | "late"`, `owner: { state, activation }`, `from`, `declined`
- lanes on snapshots (`pending`, `retryCount`, read through commit values)
- `kind: "schedule" | "operation" | "lane" | "arrival" | "fixture"` (pending entry)
- `phase: "acknowledging" | "invoked" | "settled"`, `waiting` (lane pending entry)
- `phase: "queued"`, `position` (pending entry for a queued arrival)
- `frozen` and owner `fixture:<id>` (pending entry)
- `TabClosed` (frame-level StoryFrame gap)
- `s.schedules.<name>[i]`, with `key` and `dueAt`
- `Fixture`, `Fixture.stateful({ id, truth, controls?, layer })`, `Fixture.storage({ acknowledge?, seed? })`
- `.control(fixture.name(payload))` (command)
- `checkpoint.truth`
- `defineConfig({ stories })`
- `InvalidStoryCommand`
