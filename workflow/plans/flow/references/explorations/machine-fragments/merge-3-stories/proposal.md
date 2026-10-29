# Proposal: Stories for fragments, server calls and entity domains

Status: proposal, **revision 2, not accepted; awaits validation.** Merge 3 into [machine-design.md](../machine-design.md),
which holds merges 1 and 2 (section 2.7 and rules 13–25; their records are [merged/outcomes.md](../merged/outcomes.md)
and [merged/server-calls](../merged/server-calls/proposal.md)). It merges together with
[merge 4](../merge-4-entities/proposal.md) (entity domains, rules 26–38, accepted on 2026-10-30, `M4:3-5`), and is
written to be correct with merge 4 merged in. No `.plan` file changes until it is accepted. It makes Stories
([Testing.plan](../../../../Testing.plan)) cover what the design added: traits and subroutines inside a machine and
alone, `.each` copies and their lives, resumable traits, server-call endings, lanes, late routing, keyed schedules,
fixture truth, restore mid-write, and the store's records, predictions and queues around a write. Every addition is
checked against the accepted playback design ([playback.md](../../playback.md), whose contract is Testing O4 and O9);
section 3.11 says how each one appears in playback, or why it does not. There is no spike yet; the code here is
examples only. Model-based exploration (`model()`, Testing O5) is removed by the design (T1, `D:2046`) and is not used
or replaced here. D1–D3 were settled by the owner; every other decision (section 10) was made under the owner's
delegation and awaits the owner's validation.

**Revision 2** (2026-10-30), under the owner's delegation:

- **Every open question decided** (section 10). Questions 6–39 are decisions now, each with its choice, why it wins,
  its consequence and what was rejected; 1–5 were D1–D3, and 28 was never assigned. Applied throughout, they change
  revision 1 in these places:
  - a frame has one `cause` again, and collapse never crosses a command (Q31);
  - a refused send is also kept in the cut's evidence (Q13);
  - the cumulative records are one run log that each frame points into (Q30);
  - endings are `ending` entries of that evidence (Q29, Q6), without `owner` or `from` (Q35);
  - `pending` lists work, never lanes: an Attempt with outstanding work is an `operation` entry with a `phase`, and a
    queued ending is an `arrival` (Q29, Q22, Q19, Q34);
  - the `"pendingReset"` cause is gone (Q33);
  - the `.guards()` command is deferred (Q32).
- **Merge 4 added.** Gaps G10–G14, section 3.12 and rule 16 cover record reads at a checkpoint, the moment between
  settlement and admission, server truth against the store, `propertyTest`, and `Overloaded` and record-queue order
  from fixtures. Section 2's table and rules 8–10 follow rules 27–38. Section 6.5 checks rules 13–38 one by one.
  Amendments found: Testing O4's record read still says `pending` (merge 4's tables miss it), merge 4's queue example
  puts another tab's write in this tab's queue, and merge 4's `Entity.queue` row needs one clarification (6.4).
- **One example fixed.** Under rule 9 `advance` admits no turn, so `busyThenPaid` (and the design's own example it
  replaces) needs a `process()` between its two `advance`s for the `Busy` turn to arm the retry (3.5, 3.7, 6.4).
- **Citations re-pointed.** The design's verification fix moved every `D:` line after 977 by three, and section 7
  item 15 to `D:2140-2146`. Merge 4 is cited as `M4` and EntityDomains.plan as `EP`.
- **Section 9** keeps nothing for the owner: every choice was decidable by correctness, then simplicity.

Citations. Paths are relative to `workflow/plans/flow/`:

| Short | File |
| --- | --- |
| `T` | `Testing.plan` |
| `Op` | `Operations.plan` |
| `Mc` | `Machines.plan` |
| `Ps` | `Persistence.plan` |
| `In` | `Inspection.plan` |
| `EP` | `EntityDomains.plan` |
| `Pk` | `Package.plan` |
| `D` | `references/explorations/machine-fragments/machine-design.md` (merges 1 and 2 merged in) |
| `M4` | `references/explorations/machine-fragments/merge-4-entities/proposal.md` (accepted, merging with this one) |
| `EA` | `references/explorations/machine-fragments/merged/each.md` |
| `M1` | `references/explorations/machine-fragments/merged/outcomes.md` (record of merge 1) |
| `M2` | `references/explorations/machine-fragments/merged/server-calls/proposal.md` (record of merge 2) |
| `RQ` | `references/explorations/machine-fragments/merged/server-calls/requirements.md` |
| `SS` | `references/explorations/machine-fragments/merged/server-calls/spike/stories.ts` |
| `SF` | `references/explorations/machine-fragments/merged/server-calls/spike/flow.ts` |
| `PB` | `references/explorations/playback.md` (accepted) |

Where the design and a `merged/` record differ, the design wins (`D:3-5`). Where merge 4 amends the design, the
amended design is meant (`M4:680-704`).

## 1. The problem

A Story's assertions read four sources: the **snapshot** (what views see), the **store** (the records views read),
the **evidence** (what the Runtime decided) and the **fixture** (what the server holds). The design and merge 4 put
new facts in each source, but Testing.plan gives no read for most of them, and in two places they contradict it.

- **G1. Fixture truth has no capture form.**
  - The design checks server truth with a predicate:
    `.checkpoint("paid", ({ truth }) => truth.FakeStripe.charges === 1)` (`D:1192-1194`). It lists this as a keyword
    (`D:1938`) and as an amendment to Testing O2 and O3 (C16, `D:2035`).
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
    `pay.pending(checkpoint.snapshot, key)` (`D:929`, `D:1017`) is unspecified on a captured snapshot.
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
    - a late delivery for a removed row is dropped "even if the key was added again" (`D:1834-1835`).
  - A frozen resumable slice "stays present while frozen" (`D:78-79`), so frozen and active look the same.
  - A pending reset runs as its own follow-up turn (`D:377-383`), but a frame's cause is only "the command … or the
    publication sequence" (`T:73-74`).
  - List repairs and dropped raises are "Story-derived" warnings (`D:461-464`, `EA:208-214`), but Testing does not
    name them as evidence kinds (`T:93`).
  - The lockout example asserts `run.calls` per checkpoint (`D:1662-1663`), while rule 11 defines it per run
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
  - Keyed schedules (`D:1166-1180`, rule 23, `D:565-567`) have no snapshot path for a key's `dueAt` (`D:70-76`). The
    equal-deadline order (`Mc:119-120`) has no key tiebreak; `.each` copies use list order (`D:456`).
- **G5. Some endings cannot be produced, and restore mid-write cannot be checked.**
  - `NotSent { why: "Cancelled" }` before invocation on a `reject` or `allow` commit of a plain operation has one
    window: the storage acknowledgement (`D:1208`, `D:1197-1199`), which only persisted actors wait for (`Ps:124-125`).
    Story storage is "always … a fresh in-memory KeyValueStore", which fixtures may only seed (`T:64-67`). The spike
    invents an actor option, `ackDelayMs` (`SS:292`, `SF:239`, `SF:291`).
  - `Restored` endings (`D:1214`) need a reload. Only App Stories have one (`T:166-172`), and nothing says so.
  - Tabs are "independent Runtimes of the Story's setup … Tabs share nothing else" (`T:166-172`). If fixtures are
    acquired per tab, the reopened tab talks to another fake server, and "charged once across a reload" cannot be
    checked.
- **G6. The fragment Story is under-specified, and misnamed.**
  - `story.machine(fragment)` (`D:470`, `D:2001`) reuses a contract for "one fresh actor" with `input`, `context`,
    `services` and `fixtures` (`T:9-11`). Fragments declare no operations, context or I/O (`D:282`, rule 3,
    `D:398`).
  - A Story id is "unique within its App" (`T:12-13`), and discovery is per App and rejects "incompatible machines"
    (`T:32-34`). A library fragment belongs to no App.
  - A trait Story starts active (`D:1655-1661`). A subroutine Story starts with `.enter({})` (`D:1768`). Neither
    rule is stated.
  - `.leave()` is defined only for subroutines (`D:472-473`). So for a trait alone, "`run.calls` … including
    `whenAbandoned`" (`D:471`) cannot happen, and `.resumable()` cannot be tested alone.
  - Rule 11 lets a fragment Story send host events (`D:471`). Testing allows "Only public events" (`T:25-26`).
  - The harness "fills every port with a recording harness" (`D:470`). It does not say what a harness guard answers
    or what a harness exit does, and offers no way to refuse at a guard.
  - The Confirm example names a checkpoint `end` (`D:1768`), beside the run's own `end` capture (`T:75-76`).
- **G7. Sends to fragment events and keyed copies are not in Testing, and their verdicts are lost.**
  - The design sends `E.invites.key("invite-2").Changed(…)` in a Story (`D:1830-1831`) and has views send
    `E.CANCELLING.Yes()` (`D:1763`). Testing has only `send(event)` and `send(ref, event)` (`T:23-26`).
  - Denied and Unhandled events "publish nothing" (`Mc:79-80`), and consecutive identical frames collapse (`T:71-72`).
    So the frame that would show "a keystroke sent for a row removed a moment earlier is `Unhandled`" (`D:1834`) can
    disappear. The spike reads the verdict with a live `a.check` (`SS:191`).
- **G8. What `send` runs is inconsistent.**
  - The design's Testing amendment says "`send` runs its turn; `process()` drains operation work and due timers"
    (`D:2001`). Testing does not say that `send` runs anything (`T:22-29`, `T:42-52`).
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
    `E.CANCELLING.Yes()` (`D:1830-1831`, `D:1763`). The comparison has to include the instance path and key, and
    that is unstated.
  - **A closed tab has no defined frame.** `tab selects a tab's cut` (`T:108`), and `closeTab` ends a tab abruptly
    (`T:168-169`). Reload Stories (G5) play frames between `closeTab` and `openTab`. What `StoryFrame tab` renders for
    a tab that is absent from the frame is not specified; Testing's gaps are per actor (`T:102-104`).
  - **Advancing time shows no reason.** An `advance` that queues arrivals without running turns (G4) produces a
    frame whose snapshots are unchanged. Only `now` and pending work differ. Testing's pending work does not list
    queued, not-yet-run arrivals, so the mailbox race is invisible in the overlay.

Merge 4 adds five more:

- **G10. Record reads at a checkpoint use merge 4's names nowhere.**
  - Testing already reads the cut's store: `Entity.get(checkpoint, key, shape)`, `Entity.queue(checkpoint, key)` and
    `Domain.entry.get(checkpoint, input)` (`T:85-89`, `EP:135-139`). `Entity.get` returns
    `{ data, pending, uncertain, unconfirmed }` (`T:88`, `EP:130`).
  - Merge 4 renames the record's `pending` to `predicted` (E16, `M4:567-571`, `M4:925`) and amends `EP:130`
    (`M4:726`), but its amendment tables list no Testing row (`M4:680-740`), so `T:88` keeps the old name.
  - Merge 4 makes `uncertain` a mark per record and Attempt (rule 32, `M4:601-603`) and changes what the queue holds
    (rules 29, 31, 35, `M4:589-610`). Testing does not say which of these a Story can see, or how a queue entry
    relates to an ending or to pending work.
  - *Answer:* 3.12 and rule 16 reuse the three existing reads, with merge 4's names; nothing parallel is added.
- **G11. The moment between settlement and admission is unspecified for Stories.**
  - The store applies an ending at settlement, in one publication, before the ending is queued; the lane changes
    at admission (rule 27, `M4:582-585`; `M4:352-356`). Between them "`row.predicted` is already false and `saving`
    still true" (`M4:93-94`).
  - A start's prediction publishes with its turn (rule 28, `M4:586-588`).
  - Testing's commands say only that `advance` makes work eligible and `process()` applies it (`T:50-51`). Which
    command runs settlement, and whether a cut can land between settlement and admission, is not said. Without it a
    Story cannot check rule 27, and playback cannot show the real "confirmed, still saving" moment.
  - *Answer:* rule 9 runs settlement as non-turn work, so a cut after `advance` (or any publication frame) lands
    between the two; 3.12.
- **G12. Server truth and client truth are not told apart.**
  - A stateful fixture holds server truth (`T:63-64`), and the store holds the client's records (`EP:62-70`). Tabs
    are separate Runtimes (`T:166-167`), so each tab has its own store, while this proposal makes fixtures
    run-scoped (rule 11).
  - Nothing says how a Story compares the two, or whether a fixture may reach the store.
  - *Answer:* 3.12: truth is per run and read with `checkpoint.truth`; records are per tab and read with
    `Entity.get`; truth reaches the store only through real responses.
- **G13. `propertyTest` and the checkpoint reads are not connected.**
  - `propertyTest(domains, options)` generates ordinary static Stories (`T:130`, `EP:160-161`). Its fixture is "a
    stateful fixture whose server truth is the oracle" (`T:134`), its faults "hold, release, … change server truth
    and push; disconnect and reconnect" (`T:143-145`), and a failure "emit[s] a static Story with literal inputs,
    controls and seed" (`T:159-160`). It checks properties at every publication (`T:150`, `EP:164-169`).
  - What "controls" are in a static Story, how a generated hold is written, and which reads the properties use, are
    not said.
  - *Answer:* 3.12 and rule 16: the oracle is `Fixture.stateful`'s truth, every generated fault is one of its
    controls, and the property checks use the same cut reads as Stories.
- **G14. `NotSent { why: "Overloaded" }` and record-queue order may need injection.**
  - Overflow of an actor queue or a record queue ends `NotSent { why: "Overloaded" }` (rule 35, `M4:609-610`), at 64
    waiting writes per record (`EP:179-182`). Record queues are FIFO across actors (`EP:112-116`), and an unknown
    holds the queue until its forced repair settles (rule 30, `M4:594-597`).
  - Fixtures "cannot inject operation outcomes directly" (`T:55-56`). Whether a Story can reach these states with
    fixtures and sends alone is not shown. EP V5 asks for "the 64/65 queue boundary with no partial joins"
    (`EP:208-210`).
  - *Answer:* 3.12: yes. A fixture that holds the head's answer (a control) plus enough sends fills a queue, and two
    actors in one Runtime order it.

The spike's runner reproduces data flow well, but five of its affordances are not Story API and must not leak into
the plans:

- `advanceHeld`;
- the `ackDelayMs` actor option;
- an `advance` that drains;
- live `a.state`, `a.memory` and `a.laneCount` reads (`SS:127`, `SS:325`);
- a conditional send inside a loop (`SS:127`), forbidden by `T:17-18`.

**Three words.**

- An arrival (a timer firing, a call ending, a send) is **queued** when it enters the actor's FIFO mailbox
  (`D:595-596`, P21 `D:2014`).
- A send is **settled** when Flow classifies it, applies rule 18, applies the Attempt's ending to the store and
  releases record queues, in one publication, and then queues the ending (rule 27, `M4:582-585`).
- An ending's turn is **admitted** when 2.5 step 1 takes it from the mailbox: there it is mapped through `outcomes`,
  its owner is tested and the lane is updated (rules 14 and 21, `D:499-504`; `M4:356`). "Admitted" means only that
  here, as in rule 14 (`D:500`).

## 2. Where the data comes from

| Fact the author checks | Real source | How a Story reads it |
| --- | --- | --- |
| Fragment memory, schedules and `dueAt`, `.each` copies by key | the published snapshot (`D:70-79`) | `checkpoint.snapshot` (`T:82-83`), owner-typed (rule 13) |
| Private fields | the snapshot; outside types omit them (`D:236`, `D:258-259`, `D:1991`) | `checkpoint.snapshot`, typed with them |
| Callbacks told, exits taken, `whenAbandoned` notifications | the Runtime's turn parts (rules 6–7, `D:403-419`; `D:616-643`) | `checkpoint.calls` (3.3) |
| Lives, frozen state | the Runtime's fragment bookkeeping (`D:451-460`, `EA:231`) | `checkpoint.lives` (3.4) |
| Resets, list repairs, dropped deliveries and raises | the same bookkeeping (`D:377-384`, `D:448-457`, `EA:208-214`) | the cut's evidence, `checkpoint.evidence` (3.4) |
| A send's verdict | the turn's selection (`Mc:78-81`, `D:613-614`) | the frame's `cause`; a refusal also in `checkpoint.evidence` (3.8) |
| An ending: channel and reason | the classifier (`D:785-804`) and rule 18, at settlement (rule 27, `M4:582-585`) | while queued, its `arrival` entry in `checkpoint.pending` (3.7); once admitted, its `ending` entry in `checkpoint.evidence` (3.6) |
| An ending: event, route, declined alternatives | admission (rule 14, `D:597-600`; rule 15, `D:505-508`) | its `ending` entry in `checkpoint.evidence` (3.6) |
| A lane's `pending` and `retryCount` | the lane (rule 21, `D:534-546`) | `pay.pending(checkpoint.snapshot, key)`, `pay.retryCount(…)` on the snapshot's lanes (3.6) |
| An Attempt's outstanding work | the commit's fiber, the actor queue, the record queues, the acknowledgement (`D:1205-1209`, `EP:112-116`) | its `operation` entry in `checkpoint.pending`, with `phase` (3.6) |
| A record's data, `predicted`, `uncertain`, `unconfirmed` | the store revision of the cut (`T:78`, `EP:62-70`, `M4:71-81`) | `Entity.get(checkpoint, key, shape)` (`T:86-89`, 3.12) |
| A record queue | the store (`EP:112-116`, rule 29) | `Entity.queue(checkpoint, key)` (`T:87`, 3.12) |
| An answer's rows and staleness | the store (`EP:129-131`) | `Domain.entry.get(checkpoint, input)` (`T:86`) |
| What the server holds | the stateful fixture (`T:63-64`) | `checkpoint.truth` (3.5) |
| Time and deadlines | the Runtime Clock; the controlled clock in Stories (`T:37-40`, `D:846`) | `checkpoint.now`, `checkpoint.pending` (3.7) |
| Acknowledgement of an Attempt | storage, for persisted actors (Persistence O6, `Ps:123-128`; `D:1208`; rule 38, `M4:616-617`) | produced by `Fixture.storage` (3.7) |
| What playback shows | frames recorded once, rendered by `StoryFrame` (`PB:22-29`, `T:209-212`) | the same cut reads; section 3.11 |

Every read is captured at the cut. A read starts no work and cannot resume the Runtime (`T:97`, `EP:138-139`).
Playback renders these same cuts and never re-executes (`T:211-212`), so anything readable on a cut can be shown in
the overlay without new execution.

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
  I/O (`D:282`). `guards?` is this proposal's addition to D1's option list (rule 2, Q11).
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
- `checkpoint.exit` exists only on subroutine Stories. It is the subroutine-alone shorthand for the last `by: "exit"`
  record under `checkpoint.calls` (Q39): the exit that ended the current or last life, or `undefined` while it runs or
  after `.leave()`.

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
  cannot hide them. They are a typed view of the run log (rule 14), not a copy per frame.
- `turn` is an evidence sequence position, not a copy (`T:73-74`).
- Callbacks and exits share one name list per contract (D2), so `calls.<path>.<port>` is never ambiguous. A
  contract that declares one name as both a callback and an exit is a construction error (rule 15 here).

### 3.4 Lives and fragment evidence

```ts
// sign-in: after BackToPassword, TWO_FACTOR was left
run.checkpoints.atPassword.lives.challenges     // ← NEW: copies in key order, as s.memory.challenges
// → [{ key: "c1", life: 2, frozen: false }]
run.checkpoints.atPassword.lives.resendCooldown // → { life: 1, frozen: true }   (resumable, D:334)
run.checkpoints.atPassword.lives.code           // → undefined (inactive: dropped, not frozen)

run.checkpoints.atPassword.evidence             // ← NEW name for the cut's cumulative evidence (T:93)
// → [{ kind: "reset", seq: 41, path: ["code"], source: "resetOn" }, …]
```

The cut's cumulative evidence (`T:93`, `EP:141-142`), read as `checkpoint.evidence`, is one list in evidence order.
Every entry has `kind` and `seq`, its evidence sequence position (`In:80-81`). It gains these fragment kinds, each with
path, key and life:

- `listRepair`: a duplicate key or a key past `max` (`EA:208-210`, `D:448-450`).
- `droppedDelivery`: a raise or timer firing addressed to a dead life (`D:451-457`). Call endings are never dropped:
  rules 8, 14, 17 and 20 govern them until the design's open item 15 is decided (`D:2140-2146`).
- `droppedRaise`: a raise into an absent key in a delivery turn (`EA:213-214`).
- `reset`: with source `"resetOn"` or `"pendingReset"`. A follow-up reset turn (`D:377-383`) is therefore named by
  the `reset` entry at its sequence position; a frame has no separate cause for it (Q33).

It also holds `ending` entries (3.6) and `refused` entries (3.8).

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
    controls: {                                                          // ← NEW, optional
      disconnect: Schema.Struct({}), reconnect: Schema.Struct({}),
      hold: Schema.Struct({}), release: Schema.Struct({}),               // hold answers until released (Q16)
    },
    layer: (truth, controls) => Layer.effect(StripeApi, makeFakeStripe(truth, controls, o)),
  })                                                                     // truth: a Ref; controls: a Queue per control

// checkout.story.ts
const stripe = FakeStripe({ script: [{ status: 503, retryAfterMs: 2000 }] })
export const busyThenPaid = story
  .machine(Checkout, { id: "Checkout/busy-then-paid", fixtures: stripe })
  .send(E.Pay()).advance("1 second").process()                          // Busy is admitted; WAITING arms its retry
  .advance("3 seconds").process()                                        // the retry is a new write; the fake charges
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
  (`D:234`). So the constructor is exactly D3's `{ id, truth, layer }`, plus the optional `controls` (Q23).
- Every cut captures every stateful fixture's truth, as it captures `now`. A cut whose encoded truth equals the
  previous cut's shares that value by identity (Q30).
- **Controls** are the pushes, connection faults, holds and releases a stateful fixture needs (`T:63-64`,
  `T:143-145`). Each is a named Schema. The layer receives one `Queue` per control. `.control(fixture.name(payload))`
  offers the payload, and the fixture's own fiber reacts: the work becomes eligible, and `process()` (or `advance`,
  rule 9) runs it, as for any send. A control is data, not a callback (`T:17-18`), and not a scheduler: a held
  answer is the fixture's own state, released by a message (Q16). It is a type error unless the fixture is one of the
  Story's fixtures.
- **Plain Layers stay fixtures** (`T:54-56`). `Fixture.stateful` is needed only for truth on the cut and for
  controls.
- The property-test oracle (`T:133-134`, `T:147-148`) reads the same `truth`, and its generated faults (`T:143-145`)
  are the same controls (3.12, G13).

### 3.6 Endings, lanes and in-flight work on the cut

```ts
const endings = run.checkpoints.reconciled.evidence.filter((e) => e.kind === "ending")   // ← NEW kind
// → [
//   { kind: "ending", seq: 31, operation: "Stripe.confirm", key: { intentId: "pi_1" }, attempt: { id: "a1", retryCount: 0 },
//     channel: "unknown", reason: { _tag: "NoResponse" }, event: "Unsure", route: "current", declined: [] },
//   { …, attempt: { id: "a1", retryCount: 1 }, channel: "unknown", reason: { _tag: "StillUnknown", failure: { _tag: "Busy" } }, … },
//   { …, attempt: undefined, channel: "failure", reason: { _tag: "NotSent", why: "Rejected" }, … },
//   { …, channel: "success", event: "Paid", route: "late",
//     declined: [{ code: "LateMayNotLeave", context: { state: "PAYING" } }] },
// ]
run.checkpoints.reconciled.pending                         // existing (T:84-85), now with an Attempt's phase
// → [{ kind: "operation", operation: "Stripe.confirm", key: { intentId: "pi_1" },
//      attempt: { id: "a1", retryCount: 2 }, phase: "invoked" }]          // ← NEW fields: attempt, phase

pay.pending(run.checkpoints.reconciled.snapshot, { intentId: "pi_1" })      // existing read (D:929) on the snapshot's own lanes
pay.retryCount(run.checkpoints.reconciled.snapshot, { intentId: "pi_1" })   // existing read (D:930)
check(run.checkpoints.reconciled.snapshot, E.Pay())                          // existing pure check (Mc O4)
```

- **`ending` entries.** Every ending admitted is appended to the cut's evidence when its turn is admitted, in
  admission order, with:
  - `operation`, `key` (the lane key; for a domain write that predicts one record, the record's key, rule 34,
    `M4:606-608`), `attempt` (`undefined` for a declined start, a `NothingToResend` and a resource call value's
    ending), `channel` and `reason` (classified at settlement, after rule 18; rule 27);
  - `event`, the mapped event, and `route`, `"current"` or `"late"` (rule 14);
  - `declined`, in order, the denial reasons of the alternatives the ending's own turn passed over (2.5 steps 2
    and 3), so a late turn's `LateMayNotLeave` refusal (rule 15, `D:505-508`; `D:642-643`) is readable on the cut.

  It covers commit values and resource call values (`read.fetch`, `D:1158-1164`), whose `Defect` and `Interrupted`
  endings arrive on `failure` (rule 37, `M4:614-615`). The entry is written once, at admission, because earlier
  evidence never changes (`T:95`); before admission, the same ending is an `arrival` in `pending` (3.7).
- **What is left out.** The owner activation and the ancestor a late route started from are not recorded (Q35):
  `route`, the resulting snapshot and the turn's trace event show where a late ending went.
- **Lanes on the snapshot.** A snapshot carries, for each lane that is not evicted, its `pending` and `retryCount`
  as of that publication. It carries nothing else: the current Attempt is not readable from guards or views (rule 21,
  `D:539-540`), and the lane holds no store state (`M4:691`). These lanes are reachable only through a commit value's
  reads (`pending`, `retryCount`, `idle`) and `check()`. So "Reading an old snapshot never consults live lanes"
  (`Mc:166`) stays true, and an evicted lane is absent and reads as a fresh one (`D:541-542`). This amends Machines O8
  (6.4).
- **`pending` lists work, never lanes** (Q29). An Attempt is an `operation` entry exactly while it has work
  outstanding before settlement, with `attempt` and `phase`:
  - `"waiting"`: started, not yet heading every queue it joined: the actor's `serialize` or `latest` queue
    (`D:1140-1141`) or a record queue (rule 29, `M4:589-593`);
  - `"acknowledging"`: heading them, waiting for the Persistence O6 acknowledgement (`D:1208`, rule 38);
  - `"invoked"`: the commit is running.

  From settlement until admission the same Attempt is its ending's `arrival` entry (3.7). So the span of
  `pay.pending` (start until the ending's turn is admitted, rule 21) is covered by exactly one entry at each moment,
  and `pending` can never disagree with the lane. A lane that keeps a failed or unknown Attempt with nothing
  outstanding (`D:542-543`) has no entry; its `retryCount` is read from the snapshot. Resource and stream work is
  listed as today (`T:84-85`), with `kind: "operation"` and no `attempt`.
- Every pending entry has a `kind`: `"schedule"`, `"operation"`, `"arrival"` (3.7) or `"fixture"` (3.7).
- Attempt ids come from the run's seeded source (`T:37-39`), so they are stable across replays.

### 3.7 Time, deadlines, acknowledgement and tabs

```ts
// P1, the mailbox race, with no extra command
export const lateWrongCode = story
  .machine(SignIn, { id: "SignIn/late-wrong-code", fixtures: FakeAuth({ answerAt: "15005 millis", status: 401 }) })
  .send(E.PasswordAccepted({ challengeId: "c1" })).send(E.code.Changed({ value: "123456" })).send(E.Submit())
  .advance("15020 millis")     // StopWaiting (15.000) then CodeWrong (15.005) are queued; no turn runs yet
  .checkpoint("raced")         // raced.pending: two arrivals, positions 0 and 1   ← NEW entries
  .process()                   // their turns are admitted in that order
  .checkpoint("struck")
// the struck ending entry has route "late"; struck.lives.challenges → [{ key: "c1", life: 1, frozen: false }]

// cancel before invocation, and a reload mid-write
export const cancelEarly = story.app(setup, {
  id: "Upload/cancel-before-send",                 // uploads is a persisted actor (Ps:124)
  fixtures: [FakeUploads({ tombstones: true }),
             Fixture.storage({ acknowledge: "50 millis" })],   // ← NEW: Attempt acknowledgements wait on the controlled clock
})
  .ensure(uploadRef).send(uploadRef, E.Pick())
  .advance("20 millis").send(uploadRef, E.Cancel()).process()
  .checkpoint("cancelled")     // ending: NotSent { why: "Cancelled" }; truth.FakeUploads.files is empty

export const reloadMidCharge = story.app(setup, { id: "Checkout/reload", fixtures: FakeStripe({}) })
  .ensure(checkoutRef).send(checkoutRef, E.Pay())
  .advance("200 millis").closeTab("main").openTab("main")   // the same fake server: fixtures are run-scoped
  .process()
  .checkpoint("restored")      // ending: unknown, reason Restored, routed after readiness (D:1214)
```

- Every controlled-clock sleep in the run is a pending deadline:
  - Flow schedules: named, keyed and `.each`, with `kind: "schedule"`;
  - Flow's own waits: a delayed acknowledgement is the `dueAt` of its Attempt's `operation` entry in phase
    `"acknowledging"`;
  - fixture sleeps, with `kind: "fixture"` and owner `fixture:<id>`.
- A frozen schedule is listed with `frozen: true`.
- A queued arrival whose turn has not been admitted is listed with `kind: "arrival"` and its mailbox `position`, in
  mailbox order. It has no `phase`: `kind: "arrival"` already says it is queued (Q34). A queued call ending also
  carries `operation`, `key`, `attempt`, `channel` and `reason`, all known at settlement (rule 27).
- **`advance` runs non-turn work and admits no turn.** It first runs the non-turn work already runnable, then moves
  time deadline by deadline; at each deadline the woken work runs until no fiber in the run is runnable. Non-turn
  work is everything except turns: invocations, fixture fibers, acknowledgements, and **settlement**, which
  classifies the send, publishes the store's revision, releases record queues (so the next queued write may be
  invoked) and queues the ending (rule 27). Arrivals are only queued. So a cut after `advance` can land between a
  write's settlement and its admission (3.12). It also means a reaction to an ending (a retry schedule armed by its
  turn) needs a `process()` before the next `advance` can fire it, as `busyThenPaid` shows (3.5); the design's own
  example (`D:1192-1193`) advances once and is amended with it (6.4).
- A keyed schedule reads like `.each` copies (`D:75`): `s.schedules.<name>` is the list of armed keys in the order of
  the `keys` result, each `{ key, dueAt }`. So a key's deadline is `s.schedules.unlock[i].dueAt` (← NEW).
- `Fixture.storage({ acknowledge })` delays only the capture that acknowledges an Attempt (Persistence O6,
  `Ps:123-128`), each send included (P15, `D:2038`). That capture also holds the lane and the Attempt's predicted keys
  (rule 38, `M4:616-617`). Only persisted actors acknowledge (`Ps:124`). Bootstrap restore and every other capture or
  write complete without waiting, so `openTab` readies without moving the clock.
- `NotSent { why: "Cancelled" }` has three windows a Story can reach: a start waiting in an actor queue
  (`D:1141`), a predicting write waiting in a record queue (rule 29; no repair, `M4:423`), and a persisted actor's
  delayed acknowledgement.

### 3.8 Sends and verdicts

```ts
story.machine(Signup, { id: "Signup/invites" })
  .send(E.AddInvite())
  .send(E.invites.key("invite-2").Changed({ value: "grace@example.com" }))   // a copy's public event
  .send(E.RemoveInvite({ key: "invite-2" }))
  .send(E.invites.key("invite-2").Changed({ value: "x" }))                   // Unhandled: the row is gone
  .checkpoint("removed")
// run.frames[4].cause → { command: "send", event, verdict: "Unhandled" }   // ← NEW field: verdict; its own frame
// removed.evidence → [ …, { kind: "refused", seq: 9, event: "invites.Changed", key: "invite-2",
//                           verdict: "Unhandled" } ]                       // ← NEW kind
```

- `send` queues its event behind any arrivals already queued (FIFO, `D:595-596`). It runs every turn up to and
  including its own, in mailbox order, each followed by any pending-reset turn its commit queues (`D:379-380`).
  Then it stops. Operation work those turns start is drained by `process()` (`T:42-44`), or run by `advance`
  (rule 9).
- A domain write's prediction and queue join publish in its starting turn (rule 28, `M4:586-588`), so they are in
  the send's frame.
- The frame's `cause` carries the send's own verdict: `"Allowed"`, `{ Denied: reasons }` or `"Unhandled"`. The turns
  that ran ahead of it are part of the same frame, or get their own frames under `frames: "publication"`
  (`T:70-71`).
- Every command has its own frame (rule 14), so a refused send, which publishes nothing (`Mc:79-80`), still has one.
- A Denied or Unhandled send also appends a `refused` entry to the cut's evidence, with its event, instance path,
  key and verdict, so `frames: "named"` cannot hide a refusal (Q13). Mc already observes denials "in evidence
  without a revision" (`Mc:80`); only keeping them on the cut is new.

### 3.9 Harness defaults and a refusing guard

```ts
const F = Field(Schema.String)
export const locked = story
  .trait(F, { id: "Field/locked", input: { value: "" },
              guards: { canEdit: deny("LockedOut") } })   // ← NEW option: a verdict, true | Flow.Denial
  .send(F.E.Changed({ value: "1" }))                      // verdict { Denied: [{ code: "LockedOut" }] }
  .checkpoint("refused")
```

A guard verdict is fixed for the Story's run. A verdict that changes mid-life is host policy: test it in a minimal
test host with `story.machine` (3.1), where the host's own memory decides the verdict (rule 4, `D:399-401`). A
`.guards()` command is deferred until a Story needs it (Q32).

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

So every addition here is data on the cut, or a field of a frame's cause. None of them needs playback to run
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
| **Send verdicts** (rule 4) | The frame's one `cause`, so Inspect shows "send E.Submit: Denied [StillChecking]". Collapse never crosses a command and every command has a frame (rule 14), so stepping by command (`T:213-214`) visits every send, Denied and Unhandled ones included. The next-action highlight (`T:222-223`) compares the clicked event with the next command by tag, instance path and key: a click on row `invite-3` does not match a command for `invite-2`. |
| **A send behind queued arrivals** (rule 4) | The turns that ran ahead of the send are inside the send's frame (default) or get their own frames (`frames: "publication"`). Stepping by command still lands on the send. |
| **Pending resets** (3.4) | With `frames: "publication"` (`T:70-71`), the follow-up reset turn is its own frame, caused by its publication sequence; the `reset` entry at that position names it, so the one-snapshot lag is visible while stepping. With the default per-command frames, the reset is inside the send's frame, because `send` runs it (rule 4). |
| **Lanes on the snapshot** (rule 8) | Required by playback: `StoryFrame` eligibility uses production `check()` (`T:107-108`), and `pay.idle(key)` reads lanes. The frame's snapshot carries its own `pending` and `retryCount` (Machines O8 amendment), so buttons render disabled while a write is in flight, and no live lane is read. Inspect lists each Attempt with outstanding work under pending, by `phase`. |
| **`ending` and `refused` evidence** (3.6, 3.8) | Inspect shows the cut's evidence up to the frame, so the endings admitted so far, current or late, with `declined` (a `LateMayNotLeave` refusal is visible), and refused sends. These are cut records, not trace events, so they stay available beyond the trace window. "Evidence unavailable" (`T:215-216`) still applies to the trace view only. |
| **`checkpoint.calls`, `checkpoint.lives`** (3.3, 3.4) | Inspect shows them for the frame. They are retained with the cut, so they never show "evidence unavailable". The rendered UI shows only what views read; lives never appear in view types (rule 6). |
| **`checkpoint.truth`** (3.5) | Inspect shows each fixture's truth at the frame, raw (`PB:170-173`): render only non-sensitive fixture data when sharing. Truth is per run, not per tab, so it is shown once for the frame, not under `tabs.<name>`. |
| **Fixture controls** (3.5) | A `.control` command makes one frame whose cause is the command. It has no UI control, so the next-action highlight skips it, as it skips `advance`. |
| **Clock rules** (rule 9) | An `advance` command makes one frame, and its cause is the command. That frame shows the new `now` and, in pending work, each queued arrival not yet admitted (`kind: "arrival"`, queued endings with their channel), in mailbox order. That is how the overlay shows a mailbox race. Settlement has already published, so the frame also shows the store's confirmed records (3.12). The following `process()` makes one frame (default) or one per publication. Frames inside one `process()` share `now`, which playback's `minDwell` already handles (`PB:159-161`). Scrubbing is a lookup (`T:211-212`), so the clock is never moved while watching. |
| **Records around a write** (3.12, rule 16) | `StoryFrame` renders records from the frame's store revision (`T:78`), as views read them. The frame after a domain write's start shows the prediction and "Saving…" together (rule 28). A frame between settlement and admission shows confirmed data with "Saving…" still on: a real moment (`M4:93-94`), not a rendering glitch. `predicted`, `uncertain` and `unconfirmed` styles render from the frame; nothing is re-read live. |
| **Run-scoped fixtures and tabs** (rule 11) | `StoryFrame tab` selects a tab's cut (`T:108`). Between `closeTab` and `openTab`, the frame has no cut for that tab: `StoryFrame` renders nothing for it and records a frame-level tab gap, `TabClosed`. It is not an actor gap (`T:102-104`). After `openTab`, the restored tab renders as any tab does. The fixture's truth is the same before and after, because it belongs to the run. |
| **Frame weight** (rule 14) | A frame holds a position into the run log, not a copy of cumulative records; unchanged snapshots, lives and truth keep identity (`PB:79-81`). A long Story does not grow quadratically. |
| **Fragment Stories** (3.2) | Not playable (above). Playback's own open question (`PB:195-197`) would let a focused Story's actor stand in for a component's actor. This proposal does not extend that to fragments: rendering a fragment would need a component bound to a harness slice, and that is a new rule. |
| **Harness commands** (`.enter`, `.leave`) | Only fragment Stories have them, and those are not playable. |

### 3.12 Entity domains (merge 4)

```ts
// issues.story.ts: one like on merge 4's list (M4:106-297), seen at each moment
const server = FakeIssues({ answerAfter: "300 millis" })   // a Fixture.stateful; truth: { issues, requests }
export const liked = story
  .machine(ListMachine, { id: "Issues/like", input: { projectId: "p1" }, fixtures: server })
  .process()                                               // the list loads
  .send(E.Toggle({ id: "i1", liked: true }))               // rule 28: the prediction publishes with this turn
  .checkpoint("predicted")
  .advance("300 millis")                                   // the fake answers; settlement: the store confirms, the ending is queued
  .checkpoint("settled")
  .process()                                               // admission: Settled's turn; the lane is free
  .checkpoint("handled")

// the test
const row = (cp) => Entity.get(cp, { id: "i1" }, Issue.pick("liked", "likes"))   // existing read (T:86-89), merge 4's names
row(run.checkpoints.predicted).predicted                         // → true
like.pending(run.checkpoints.predicted.snapshot, { id: "i1" })   // → true
row(run.checkpoints.settled).predicted                           // → false: the server answered
like.pending(run.checkpoints.settled.snapshot, { id: "i1" })     // → true: this actor has not handled it (M4:93-94)
run.checkpoints.settled.pending
// → [{ kind: "arrival", position: 0, operation: "issues/set-like", key: { id: "i1" },
//      attempt: { id: "a1", retryCount: 0 }, channel: "success", reason: … }]
like.pending(run.checkpoints.handled.snapshot, { id: "i1" })     // → false
run.checkpoints.handled.truth.FakeIssues.issues.i1.liked         // → true: server truth, not the store
```

```ts
// two actors in one Runtime write issue i1; the fake holds the first answer until released
export const queued = story.app(setup, { id: "Issues/queue", fixtures: server })
  .ensure(editorRef).ensure(listRef).process()
  .control(server.hold({}))                                       // a control (3.5)
  .send(editorRef, E.Rename({ id: "i1", title: "New" }))          // R heads i1's queue and is invoked
  .send(listRef, E.Toggle({ id: "i1", liked: true }))             // A joins behind R (rule 29)
  .process()
  .checkpoint("queued")
  .control(server.release({})).process()
  .checkpoint("drained")
// Entity.queue(run.checkpoints.queued, { id: "i1" })        → R's Attempt, then A's   (existing read, T:87, EP:138)
// run.checkpoints.queued.pending: R in phase "invoked", A in phase "waiting"
```

- **Reads.** A Story reads the store only through the existing checkpoint reads (`T:85-91`, `EP:135-139`):
  - `Entity.get(checkpoint, key, shape)` returns `undefined` for an absent record, otherwise
    `{ data, predicted, uncertain, unconfirmed }`, merge 4's names (`M4:567-571`), with field meanings from
    EntityDomains O2. `uncertain` is true while any mark on the record remains (rule 32, `M4:601-603`). Which
    Attempt holds a mark is not a view fact; a Story checks rule 32 by its effect, as a view would: two unknowns,
    one retry succeeds, the record still reads `uncertain`.
  - `Entity.queue(checkpoint, key)` returns the record queue's members at the cut, in order, each with its Attempt
    id, so a queue member joins its `pending` entry and its `ending` entry by id. A removed write (`Superseded`,
    `Cancelled`) is no longer a member; its removal is read from its `ending` entry and the store's queue evidence
    (6.4, the `Entity.queue` row). An `Overloaded` start never joined (rule 35).
  - `Domain.entry.get(checkpoint, input)` returns the answer's rows; a draft (rule 33) is memory, read from the
    snapshot.
- **Moments.** The three moments of a domain write are three cuts:
  - the starting turn's frame: prediction and queue join, and the lane `pending` (rule 28);
  - after settlement, before admission: the store's effect per rule 30, queues released, the ending an `arrival`,
    the lane still `pending` (rule 27). `advance` reaches this cut whenever the fixture sleeps (rule 9); under
    `frames: "publication"`, settlement's store publication is its own frame in any command;
  - after admission: the `ending` entry, and the lane updated.
- **Server truth and client truth** (G12). `checkpoint.truth` is the server's, per run and shared by tabs (rule 11).
  The store is the client's, one per tab's Runtime: `Entity.get(checkpoint.tabs.other, key, shape)` reads another
  tab (`T:169-170`). Truth reaches a store only through real responses and pushes; a fixture cannot write the store,
  and no read compares them for the author. A Story asserts both sides when it means "the client shows what the
  server holds".
- **`propertyTest`** (G13). Its fixture is a `Fixture.stateful`; that truth is the oracle (`T:134`, `EP:163-164`).
  Every generated fault that is the fixture's (hold, release, change truth and push, disconnect, reconnect,
  `T:143-145`) is one of its controls, so a shrunk failure is a static Story of literal sends, `advance`s and
  `.control` commands (`T:159-160`, `EP:170`). Its checks at every publication (`T:150`, `EP:164-169`) read the same
  cuts as `frames: "publication"`, through the same reads. Fixture sleeps are pending deadlines (rule 9), so an
  oracle fixture that sleeps with nothing to deliver keeps a run from quietness, which `propertyTest` reports as
  Inconclusive (`T:142-143`), never as a pass.
- **Producing `Overloaded` and queue order** (G14). Both come from fixtures and sends alone:
  - a fixture that holds the head's answer keeps the head invoked; sends of a write under `allow` (or one per actor)
    then fill the record queue, and the start past its bound (64 waiting writes, `EP:179-182`) ends
    `NotSent { why: "Overloaded" }` with no prediction and no join (rule 35). The Story is built at construction, for
    example with `Array.from` over sends, which is plain code producing a static plan (`T:16-17`);
  - two actors in one Runtime writing one record give FIFO order across actors (`EP:112-116`); a dropped answer
    (unknown) with a slow repair read shows the queue held until the forced repair settles (rule 30).

  Tabs do not share a queue: each tab is its own Runtime with its own store (`T:166-167`).

## 4. Rules

1. **Kinds.** There are four Story constructors: `story.app`, `story.machine`, `story.trait` and `story.subroutine`.
   - `story.trait` accepts only a trait and `story.subroutine` only a subroutine. Anything else is a type error.
   - Fragment Stories take `{ id, input?, guards? }`. `input` is required exactly when the trait declares
     `Flow.input` fields. A subroutine's input goes to `.enter(input)`.
   - `run()` returns `StoryRun<Kind>`, branded by the constructor's kind.
2. **Harness.** In a fragment Story, every port of the subject is filled by the harness. Children the subject places
   are filled by its own body, as in production.
   - A guard port answers its verdict from the `guards` option, fixed for the run. The default is `true`. A verdict
     is `true` or a `Flow.Denial`, never a function.
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
   - Internal events and exits are never sendable (rule 2, `D:396-397`; `D:1960`).
   - `send` queues its event behind arrivals already queued. It runs every turn up to and including its own, each
     followed by the pending-reset turn its commit queues (`D:379-380`, `D:669-670`). Nothing else runs until
     `process()` or `advance`.
   - A send's verdict (`"Allowed"`, `{ Denied: reasons }` or `"Unhandled"`) is part of its frame's `cause`. A Denied
     or Unhandled send also appends a `refused` entry to the cut's evidence.
5. **Calls.**
   - Every callback notification, `whenAbandoned` notification and exit is recorded as
     `{ payload, life, key?, turn, by }` under `checkpoint.calls.<instance path>.<port>`.
   - Records are cumulative per cut and retained with it.
   - Alone, the path starts at the subject; in a host, at the actor's root.
   - On a subroutine Story, `checkpoint.exit` is the last `by: "exit"` record of the current or last life, or
     `undefined` while it runs or after `.leave()`.
6. **Lives.**
   - `checkpoint.lives` mirrors the snapshot's slice tree. Each entry is `{ life, frozen }`, plus `key` for copies.
     It is present exactly when the snapshot's slice is.
   - Life numbers are deterministic and appear in no snapshot or view type.
   - The fragment evidence kinds of 3.4 are entries of the cut's evidence. `droppedDelivery` never covers a call
     ending.
7. **Fixture truth.**
   - A `Fixture.stateful` declares `id`, a `truth` Schema whose constructor default is the starting truth, an
     optional `controls` record of Schemas, and a `layer` built from the truth `Ref` and one `Queue` per control.
   - Every cut captures each declared truth by `id`. Duplicate ids reject before acquisition, as duplicate Tags do
     (`T:57-58`).
   - `.control(fixture.name(payload))` offers a control's payload. It is a type error for a fixture the Story does
     not declare.
   - Checkpoints take no predicate. Plain Layers remain valid fixtures.
8. **Endings, lanes and work.**
   - Every ending admitted, of a commit value or a resource call value, appends one `ending` entry to the cut's
     evidence, in admission order, with `operation`, `key`, `attempt` (or `undefined`), `channel`, `reason`, `event`,
     `route` and `declined`. Channel and reason are the Attempt's ending decided at settlement (rule 27).
   - `checkpoint.pending` lists an Attempt as an `operation` entry, with `attempt` and `phase` (`"waiting"`,
     `"acknowledging"` or `"invoked"`), from its start until settlement, and its ending as an `arrival` from
     settlement until admission. A lane is never a pending entry.
   - A snapshot carries, per lane not evicted, only `pending` and `retryCount`, reachable only through commit-value
     reads and `check()`. Reading a snapshot never consults live lanes.
9. **Clock.**
   - Every controlled-clock sleep is a pending deadline.
   - `advance`, `advanceTo` and `advanceToNextTimer` first run the non-turn work already runnable, then move time
     through deadlines in order. At each deadline the woken work runs until no fiber is runnable, fixtures and
     settlement included, and its arrivals are queued in that order. No turn is admitted.
   - Equal deadlines are ordered by:
     - actor admission order, then outermost state, then declaration order (`Mc:119-120`);
     - then `.each` list order (`D:456`);
     - then key-list order for keyed schedules;
     - then, for anything still tied, owner kind (actor schedules, then Flow's own waits, then fixture sleeps), then
       the order in which the sleeps began.
   - A frozen deadline is listed with `frozen: true`, is never due, and is skipped by `advanceToNextTimer`.
   - A queued arrival whose turn has not been admitted is listed in `pending` with `kind: "arrival"` and its mailbox
     `position`; a queued ending also carries `operation`, `key`, `attempt`, `channel` and `reason`.
   - A keyed schedule's snapshot entry is a list in `keys` order, each `{ key, dueAt }`.
10. **Storage.**
    - `Fixture.storage({ acknowledge?, seed? })` is the storage fixture: it provides the fresh in-memory
      KeyValueStore, and `seed` is Testing's storage-fixture seeding (`T:66-67`), its only form.
    - Only the capture that acknowledges an Attempt (Persistence O6; rule 38) waits `acknowledge` on the controlled
      clock, and only persisted actors make one. Restore and other writes do not wait.
    - It can neither bypass validation nor open external storage (`T:64-67`).
11. **Scope.**
    - Fixtures are acquired once per run, before any tab's Runtime, and shared by every tab.
    - A fixture may depend only on other fixtures and on run-level services (the controlled Clock, the seeded random
      source, the run's Scope). It may still shadow setup services. A fixture that requires a per-tab setup service
      is a type error, and rejects before acquisition for untyped callers.
    - Other setup services, and each tab's store, are per tab's Runtime.
    - `Restored` endings are produced only by App Stories, through `closeTab` and `openTab`.
12. **Discovery.**
    - `defineConfig({ apps, stories })` discovers App-free Stories.
    - Ids are unique across the whole configuration.
    - A machine in `stories` needs only its own services. Fixtures provide them.
    - The trace of an App-free Story has no App identity: `appId` and `appFingerprint` are `null`.
13. **Snapshot types.** A checkpoint's snapshot is typed with `Flow.private` fields.
14. **Frames and playback.**
    - A frame has one `cause`: its command, with the event and verdict for a send, and under `frames: "publication"`
      also its publication sequence.
    - Consecutive identical frames collapse only within one command. Under the default and `"publication"` modes
      every command records at least one frame, a command that publishes nothing included.
    - A cut's cumulative records (`evidence`, `calls`) are the run log's prefix up to the cut: a frame holds its
      position, never a copy. Unchanged snapshots, lives and encoded truth keep identity across frames.
    - `StoryPlayer` and `definePresentation` accept `StoryRun<"app" | "machine">` and their Stories only. A fragment
      Story is a type error there.
    - The next-action comparison matches the event's tag, instance path and key. `advance` and `.control` commands
      have no control to highlight.
    - `StoryFrame tab` for a tab absent from the frame renders nothing and records the frame-level gap `TabClosed`.
    - Inspect shows the frame's cut records (`calls`, `lives`, `evidence`, `truth`, `pending`) beside the trace view.
15. **Port names.** A contract's callback and exit names are unique (D2). Declaring one name as both is a type error
    where the contract's types can show it, and a `flow check` construction error otherwise (`D:474-479`).
16. **Entity domains.**
    - A Story reads records, queues and answers only through `Entity.get`, `Entity.queue` and `Domain.entry.get` at a
      cut. `Entity.get` returns `{ data, predicted, uncertain, unconfirmed }`. `Entity.queue` lists the members at
      the cut, each with its Attempt id.
    - A domain write's start, settlement and admission are separate cuts: the starting turn's frame holds its
      prediction and queue join (rule 28); settlement's store publication precedes its ending's admission (rule 27),
      and `advance` stops between them.
    - Server truth is the fixture's, per run; client truth is each tab's store. A fixture never writes the store.
    - `propertyTest`'s fixture is a `Fixture.stateful`; every fixture fault it generates is one of its controls, and
      its checks use the same cut reads.

## 5. How it is implemented

On the one production Runtime. Nothing predicts and nothing runs twice.

- **Fragment Stories** wrap the subject in a generated harness machine. Its root has two child states, `IN` and
  `OUT`. A trait is placed on `IN`'s node with `Flow.state({ traits })` (`D:333-336`); a subroutine is the state `IN`.
  `.enter` and `.leave` send harness events that move between them, so leaving `IN` freezes or ends a trait exactly
  as leaving a host node does. The harness fills ports with fixed verdicts and recorders. The Runtime, turn
  algorithm and evidence are the production ones, and harness states and events are hidden from snapshot paths,
  calls, lives and frame causes.
- **Calls, lives, endings with route and declined reasons, and fragment evidence** need **new Inspection O4 event
  kinds or fields**: the kinds Inspection lists today (`In:85-90`) have none of them. Refused sends are already send
  and admission evidence (`Mc:80`, `In:86`). The design's Inspection O1 row (`D:2002`) makes fragments, copies and
  incarnations appear in `inspect`, not in the trace. The Runtime emits the new kinds.
- **The run log.** The Story collector appends every cumulative record (calls, the evidence kinds of 3.4, `ending`,
  `refused`, repairs, skips and diagnostics) to one append-only log in evidence order. Each frame stores its length.
  `checkpoint.evidence` and `checkpoint.calls` are typed views of that prefix, so the trace window does not bound
  them and frames do not copy them (`T:73-74`).
- **Lanes on snapshots** are published with the turn: each publication copies the `pending` and `retryCount` of every
  lane not evicted. Unchanged lanes keep identity (`Mc:166-167`, `PB:79-81`).
- **Truth capture** reads each stateful fixture's `Ref` with `Ref.get` at the cut, encodes it with its Schema, and
  keeps the previous value's identity when the encoding is equal. **Controls** are one `Queue` per declared control,
  created with the fixture.
- **The clock** is Effect's TestClock, with an ordered wake list in front of it that applies rule 9's tiebreaks.
  `advance` first yields until no fiber in the run is runnable, then steps deadline by deadline, yielding again after
  each. Settlement runs in merge 4's watcher fiber (`M4:630-633`), so it runs there too and publishes the store
  revision before queuing the ending. `advance` only queues arrivals in mailboxes; `process()` admits and runs queued
  turns.
- **Store reads** read the cut's one store revision (`T:78`); they run no adapter and touch no live state
  (`EP:138-139`). `check()` never predicts (`M4:621-622`), so a frame's eligibility is pure.
- **Playback** needs no new execution. The new records are fields of frames, which `StoryFrame` and the overlay
  already receive. Collapse compares frames only within one command.
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
| `guards` option | harness verdicts | `true \| Flow.Denial` per guard port, fixed for the run (rule 2) |
| `checkpoint.calls.<path>.<port>` | cut evidence | callbacks, `whenAbandoned` notifications and exits (rule 5) |
| `checkpoint.lives.<path>` | cut evidence | `{ life, frozen, key? }` (rule 6) |
| `checkpoint.evidence` | cut read | the name of the cut's cumulative evidence (`T:93`), entries with `kind` and `seq` (3.4) |
| `listRepair`, `droppedDelivery`, `droppedRaise`, `reset` | evidence kinds | 3.4 |
| `ending` | evidence kind | every admitted ending, with `route` and `declined` (rule 8) |
| `refused` | evidence kind | a Denied or Unhandled send (rule 4) |
| Lanes on snapshots: `pending`, `retryCount` per lane | snapshot member | read only through commit-value reads and `check()` (rule 8) |
| `kind` on every `pending` entry; `attempt` and `phase` on an Attempt's `operation` entry | pending entry | rule 8 |
| `kind: "arrival"`, `position`; a queued ending's `operation`, `key`, `attempt`, `channel`, `reason` | pending entry | a queued arrival not yet admitted (rule 9) |
| `frozen`, `kind: "fixture"` with owner `fixture:<id>` | pending entry fields | rule 9 |
| `s.schedules.<name>[i]`, each `{ key, dueAt }` | snapshot path | a keyed schedule's deadlines (rule 9) |
| `Fixture.stateful({ id, truth, controls?, layer })` | fixture constructor | rule 7 |
| `.control(fixture.name(payload))` | command | offers a fixture control's payload (rule 7) |
| `checkpoint.truth.<id>` | cut read | captured truth |
| `Fixture.storage({ acknowledge?, seed? })` | fixture constructor | rule 10 |
| `defineConfig({ stories })` | configuration | rule 12 |
| `verdict` on a send's `cause` | frame field | rules 4 and 14 |
| `TabClosed` | frame-level gap | rule 14 |
| `InvalidStoryCommand` | rejection code | an `.enter` or `.leave` that does not fit the harness state, at the command (rule 3) |
| New Inspection O4 event kinds or fields | trace | calls, lives, fragment evidence, endings with route and declined (section 5) |

### 6.2 Changed

| Changed | Before | Now |
| --- | --- | --- |
| Testing a fragment alone | `story.machine(fragment, { id })` (`D:470`, `D:2001`) | `story.trait` / `story.subroutine` |
| Recorded notifications | `run.calls.<callback>` per run (`D:471`) | `checkpoint.calls`, per cut, in every Story kind |
| Checking server truth | `.checkpoint(name, ({ truth }) => …)` (`D:1194`, C16 `D:2035`) | `.checkpoint(name)` and `checkpoint.truth` |
| What `send` runs | unstated (`T:22-29`); "runs its turn" (`D:2001`); the whole mailbox (`SF:458`) | the queued turns ahead of it, its own turn, and their pending-reset follow-ups (rule 4) |
| What `advance` runs | "make work eligible without draining it" (`T:50-51`) | runnable non-turn work, settlement included, until idle at each deadline; no turn (rule 9) |
| Transaction lanes | "Transactions have outcomes, never lanes" (`Op:162`) | lanes per rule 21, readable on snapshots |
| Pending work | "owners, operations or schedules, attempts where applicable, and deadlines" (`T:84-85`) | each entry with a `kind`; an Attempt's `phase`; queued arrivals; fixture sleeps; frozen schedules |
| The snapshot | state, memory, context, issues, lifecycle, activities (`Mc:162-166`) | the same, plus each lane's `pending` and `retryCount` |
| Frame collapse | "Consecutive identical frames collapse into one" (`T:71-72`) | only within one command; every command keeps a frame (rule 14) |
| Cumulative evidence | repairs, skips and diagnostics (`T:93`) | one run log, also holding calls, fragment kinds, `ending` and `refused` |
| The record read | `{ data, pending, uncertain, unconfirmed }` (`T:88`) | `{ data, predicted, uncertain, unconfirmed }` (merge 4's E16, `M4:567-571`) |
| Fixture scope and dependencies | per run, unstated across tabs; may depend on setup services (`T:57`, `T:63`, `T:166-172`) | per run, shared by tabs; may depend only on fixtures and run-level services |
| Story storage | fresh in-memory store, seeding only (`T:64-67`) | the same store, with optional clock-driven Attempt acknowledgement |
| Story id scope | unique within its App (`T:12-13`) | unique across the configuration |
| Keyed schedule reads | unspecified (`D:70-76`, `D:1166-1180`) | `s.schedules.<name>[i]`, `{ key, dueAt }`, in `keys` order |

### 6.3 Removed

| Removed | Was | Why |
| --- | --- | --- |
| `story.machine` for fragments | `D:470`, `D:2001` | a fragment is not an actor; options and discovery do not fit (G6) |
| `run.calls` | `D:471` | replaced by `checkpoint.calls`, which also works in a host |
| The checkpoint predicate | `D:1194`, `D:1938`, C16 `D:2035` | a callback in a plan (`T:17-18`) |
| `ackDelayMs`, `advanceHeld` | spike only (`SF:239`, `SF:462`) | replaced by `Fixture.storage` and rule 9 |

Revision 1 additions withdrawn by section 10: `causes` (Q31), the `"pendingReset"` cause (Q33), `checkpoint.endings`
(Q29), `owner` and `from` (Q35), lane entries in `pending` with `phase: "settled"` and `waiting` (Q29, Q22),
`phase: "queued"` on arrivals (Q34), and the `.guards()` command (Q32).

### 6.4 Amendments by target document

The design's `merged/` records are not amended: the design wins over them (`D:3-5`), so every server-call amendment
targets the design. Merge 4 is accepted but not yet merged; the rows marked **merge 4** are corrections to its text,
to be applied when both merge.

| Target | Amendment |
| --- | --- |
| **Testing O1** (`T:8-35`) | four constructors (rule 1); fragment Story options; rules 2–4; `send` at instance paths, keyed copies and subroutine events; host-event sends in fragment Stories only; the send rule of rule 4; "Both Story kinds" (`T:22`) becomes "Every Story kind"; `.control` (rule 7); `defineConfig({ stories })` (rule 12); "unique within its App" (`T:12-13`) becomes "unique across the configuration"; `StoryRun<Kind>` |
| **Testing O2** (`T:36-52`) | rule 9: every controlled-clock sleep is a deadline; `advance` runs non-turn work, settlement included, and queues arrivals without admitting turns ("make work eligible without draining it", `T:50-51`, gains this meaning); equal-deadline tiebreaks, including the final one; frozen deadlines |
| **Testing O3** (`T:53-67`) | `Fixture.stateful` with Schema truth and controls (rule 7); plain Layers stay; `Fixture.storage` is the storage fixture (rule 10); fixtures run-scoped and shared by tabs (rule 11); "Fixtures may depend on setup services" (`T:57`) becomes "Fixtures may depend on other fixtures and run-level services, and may shadow setup services"; "Stateful fixtures … update that truth before emitting pushes" (`T:63-64`) gains "pushes and faults are controls" |
| **Testing O4** (`T:68-99`) | `checkpoint.calls`, `checkpoint.lives`, `checkpoint.truth`; `checkpoint.evidence` names the cumulative list (`T:93`), which gains the fragment kinds, `ending` and `refused`, and is one run log a frame points into (`T:73-74` applied); `kind` on every pending entry, `attempt` and `phase` on an Attempt's entry, queued arrivals and `frozen`; collapse only within a command, and every command keeps a frame (`T:71-72`); `verdict` on a send's cause; owner-typed snapshots (rule 13) |
| **Testing O4, record read** (`T:88`) | `{ data, pending, uncertain, unconfirmed }` becomes `{ data, predicted, uncertain, unconfirmed }`. Merge 4 renames the field (E16) and amends `EP:130` (`M4:726`) but lists no Testing row (`M4:680-740`); this row closes that. `Entity.queue` members carry their Attempt id (rule 16) |
| **Testing O4, StoryFrame** (`T:100-109`) | eligibility reads lanes on the frame's snapshot; `tab` for a tab absent from the frame renders nothing, with the frame-level gap `TabClosed` beside the actor gaps (`T:102-104`) |
| **Testing O6** (`T:129-160`) | the fixture is a `Fixture.stateful`, whose truth is the oracle, the same concept as `checkpoint.truth`; every generated fixture fault (hold, release, truth change and push, disconnect, reconnect, `T:143-145`) is one of its controls, so the emitted Story's "controls" (`T:159-160`) are `.control` commands; publication checks use the cut reads of rule 16 |
| **Testing O7** (`T:166-172`) | "Tabs share nothing else" gains "except the run's fixtures"; `Restored` endings are App-Story-only; each tab has its own store, so record queues are per tab |
| **Testing O9** (`T:208-223`) | `StoryPlayer` and `definePresentation` take `StoryRun<"app" \| "machine">` only; stepping by command uses the per-command frames of rule 14; the next-action highlight matches instance path and key and skips `advance` and `.control`; Inspect shows the frame's cut records, which never show "evidence unavailable" |
| **playback.md** (`PB:58`, `PB:79-82`, `PB:97-108`, `PB:131-136`) | explanatory text follows the Testing O4 and O9 rows (the plan wins, `PB:3-4`): collapse within a command, frames pointing into the run log |
| **EntityDomains O2** (`EP:134-146`) | the cut's reads are rule 16's: `Entity.get` with merge 4's names; `Entity.queue` members with their Attempt ids; the cumulative evidence of `EP:141-142` is the same `checkpoint.evidence` |
| **EntityDomains O4** (`EP:159-170`) | generated pushes, holds and disconnects are the fixture's controls; shrunk Stories are literal `.control` commands (as the Testing O6 row) |
| **merge 4, 6.4 EntityDomains O2 row** (`M4:728`) | "`Entity.queue` states include removals with their `NotSent` reason" becomes "`Entity.queue` lists the members at the cut; a removal (`Superseded`, `Cancelled`) is a queue evidence event with its `NotSent` reason, and the write's `ending` entry; an `Overloaded` start never joins". A read of a cut cannot hold departed members without becoming cumulative, which `EP:138` does not make it |
| **merge 4, 3.4 example** (`M4:388`) | "another tab's rename (R)" becomes "another actor's rename (R)": record queues live in one Runtime's store (`EP:112-116`), and each tab is its own Runtime (`T:166-167`), so another tab's write never joins this tab's queue |
| **Machines O8** (`Mc:162-166`) | the snapshot gains, per lane not evicted, `pending` and `retryCount` as of its publication, reachable only through commit-value reads and `check()`; "Reading an old snapshot never consults live lanes" stays. This extends the design's Machines O8 row (`D:1999`) and agrees with merge 4's "the lane does not hold store state" (`M4:691`) |
| **Machines O1**, **CommandLine O5** | a contract's callback and exit names are unique: a type error where types show it, otherwise a `flow check` construction error (D2, rule 15) |
| **Operations O6** (`Op:162`) | "Transactions have outcomes, never lanes" is replaced by rule 21's lanes (`D:534-546`), readable on snapshots (Machines O8 above) |
| **Inspection O4** (`In:79-114`) | new event kinds or fields (`In:85-90` has none): fragment calls, lives, list repairs, dropped deliveries and raises, resets, and endings with route and declined reasons; Story cuts retain them beyond the trace window. The Trace's checkpoints (`In:97-99`) and its closed import schema (`In:105-106`) gain the new checkpoint members (`calls`, `lives`, `evidence` with its new kinds, `truth`, the new `pending` fields) and `verdict` on a cause; `appId` and `appFingerprint` are `null` for App-free Stories (rule 12) |
| **Inspection O5** (`In:115-127`) | redaction covers captured truth by its Schema, and ending and pending entries' keys, inputs and reasons as keys and errors already are |
| **Package** (`Pk:19-20`) | `flow-state/testing` exports `Fixture`; `StoryRun` is branded by kind |
| **machine-design rule 11** (`D:470-473`) | rewritten as rules 1–5 here: `story.trait`, `story.subroutine`, harness defaults and verdicts, `.enter`/`.leave` for both kinds, `checkpoint.calls`, `checkpoint.exit` |
| **machine-design 2.1** (`D:70-76`) | add `s.schedules.<name>[i]`, each `{ key, dueAt }`, for keyed schedules (also 2.7.10, `D:1166-1180`) |
| **machine-design 2.2** (`D:81-151`) | add D2's rule: callback and exit names are unique within a contract |
| **machine-design 2.7.11** (`D:1189-1199`) | the predicate Story becomes 3.5's capture, with a `process()` after the first `advance` so the `Busy` turn arms its retry (rule 9); "a checkpoint reads it" becomes "every cut captures it"; "`NotSent` by a cancel during the Attempt's storage acknowledgement or by `latest`" gains "or by a cancel while the write waits in an actor or record queue; `Overloaded` by sends behind a held answer" |
| **machine-design 3.1, 3.2 examples** (`D:1653-1663`, `D:1767-1769`) | `story.trait` / `story.subroutine`; `calls` read per checkpoint; the Confirm checkpoint renamed from `end` |
| **machine-design 3.6 keywords** (`D:1937`, `D:1938`) | `story.machine(fragment)` with `run.calls` becomes `story.trait` / `story.subroutine` with `checkpoint.calls`; `.checkpoint(name, ({ truth }) => …)` becomes `Fixture.stateful` and `checkpoint.truth` |
| **machine-design section 5, Testing O1 row** (`D:2001`) | replaced by the Testing O1 and O2 rows above |
| **machine-design section 5, C16** (`D:2035`) | replaced by the Testing O2, O3 and O4 rows above; "every ending can be produced through services" stays |
| **machine-design section 5, server calls** (`D:2016-2040`) | gains the Machines O8 and Operations O6 rows above |

### 6.5 Rule-by-rule check

Each design rule this proposal touches, with merge 4's rules as amended in. "Agrees" means no text changes.

| Rule | What Stories do with it | Result |
| --- | --- | --- |
| 1 lifetime, `.resumable()` | `.leave` / `.enter` on traits; `lives.frozen`; frozen deadlines never due | agrees |
| 9 `.each` | `calls`/`lives` by key; `listRepair`, `droppedDelivery`, `droppedRaise`; list-order ties | agrees; item 15 stays open (`D:2140-2146`) |
| 11 tested alone | replaced by rules 1–5 | amendment (6.4) |
| 13 endings map to events | `ending.event` | agrees |
| 14 owner, current, late | `ending.route`, at admission | agrees |
| 15 late turns | `ending.declined` holds `LateMayNotLeave` | agrees |
| 16 declines are endings | a declined start's `NotSent` is an `arrival` after the send's turn, then an `ending` | agrees |
| 17 every start ends once | each start has exactly one `ending` entry; a Story can count them | agrees |
| 18 the Attempt's ending | channel and reason are after rule 18, decided at settlement (merge 4) | agrees |
| 19 the key is the Attempt's id | seeded ids (`T:37-39`); fixture truth records the ids it saw | agrees |
| 20 required handling | Story coverage (T2, `D:2047`) | agrees |
| 21 the lane | on snapshots only; never a `pending` entry | amendment: Machines O8, Operations O6 |
| 22 memory reads | no Story read | agrees |
| 23 keyed schedules | `s.schedules.<name>[i]` | amendment: design 2.1 |
| 24 cancel | three `NotSent Cancelled` windows (3.7); `unknown(Cancelled)` by a cancel while the fixture sleeps | agrees |
| 25 no Flow timeout | a schedule plus `cancel` | agrees |
| 26 one split | records read with `Entity.get`, workflow from the snapshot | agrees |
| 27 settlement, admission | `advance` runs settlement; the cut between them (3.12) | amendment: Testing O2 |
| 28 a start publishes with its turn | the send's frame holds the prediction and the lane | agrees |
| 29 actor, then record queue | `phase: "waiting"`; `Entity.queue` order | agrees; merge 4 example wording (6.4) |
| 30 the store follows the Attempt's ending | `Entity.get` after `StillUnknown` reads `uncertain` | agrees |
| 31 a retry is the same request | the ending's `attempt.retryCount`; fixture truth records each request | agrees |
| 32 what clears `uncertain` | the record-level boolean, checked by effect | agrees |
| 33 no temporary ids | drafts in the snapshot, rows from `Domain.entry.get` | agrees |
| 34 lane keys | `ending.key` is the record's key | agrees |
| 35 overflow is an ending | produced by a held head and sends (3.12) | agrees |
| 36 callback reads | no Story read | agrees |
| 37 reads carry confirmed data | read call-value endings are `ending` entries, `attempt` undefined | agrees |
| 38 one capture | `Fixture.storage({ acknowledge })` delays that capture | agrees |

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
| G10 record reads | 3.12, rule 16; the Testing O4 record-read amendment |
| G11 settlement and admission | 3.7, 3.12, rules 9 and 16 |
| G12 server truth and client truth | 3.12, rules 11 and 16 |
| G13 `propertyTest` | 3.5, 3.12, rule 16; the Testing O6 and EntityDomains O4 amendments |
| G14 `Overloaded` and queue order from fixtures | 3.12 |
| Harness guards, callbacks and exits | 3.9, rule 2 |
| Private fields in Story reads | 2, rule 13 |
| Callback and exit names unambiguous in `calls` | 3.3, rule 15 |
| `success`, `failure` by tag, `unknown` by author reason | the fixture answers; the author's commit classifies (`D:734-753`); read in 3.6 |
| `unknown(Defect)` and its actor issue | the fixture dies; the issue is on the cut (`T:79`); read in 3.6 |
| `unknown(Interrupted)` | the fixture interrupts itself; its interruptor is not Flow's (`D:762`, `D:798-799`); read in 3.6 |
| `unknown(Cancelled)` | a cancel while the fixture's sleep is pending (rule 24, `D:568-571`); 3.6, 3.7 |
| `NotSent(Cancelled)` | a queued start in an actor queue or a record queue, or a cancel during acknowledgement (3.7, rule 10) |
| `NotSent(Superseded)`, `NotSent(Rejected)`, `NotSent(NothingToResend)` | sends (`D:759`); read in 3.6 |
| `NotSent(Overloaded)` | a held head and sends past the bound (3.12, rule 35) |
| `NotSent(Restored)`, `unknown(Restored)` | `Fixture.storage` and tabs (3.7, rules 10–11); restored predicted keys read `uncertain` (rule 38, `M4:635-636`) |
| `StillUnknown { failure }` | a stateful fixture that drops and then fails; read in 3.6, and the record stays `uncertain` (rule 30) |
| A read's `Defect` and `Interrupted` | a fixture that dies or interrupts a lookup; an `ending` entry with `attempt` undefined (rule 37) |
| `pending`, `retryCount`, `idle` agreeing with `check()` | 3.6, rule 8 |
| `LateMayNotLeave` | `declined` on the `ending` entry (3.6) |
| Pushes, disconnects, holds from a fake server | `Fixture.stateful` controls (3.5) |
| Mailbox race (spike P1) | 3.7, rule 9 |
| Keyed schedules | 3.7, rule 9 |
| `.each` copies, lives, repairs, drops | 3.3, 3.4, 3.8 |
| Resumable traits: freeze, overdue firing | 3.2, 3.4, rule 9 |
| `whenAbandoned` alone and in a host | 3.2, 3.3 |
| Restore mid-write, charged once | 3.5, 3.7 |
| Prediction at start, confirmation at settlement, lane at admission | 3.12 (rules 27, 28) |
| Record-queue order, a `latest` waiting start, a superseded removal | 3.12 (rule 29); `Entity.queue`, `pending` phases, `ending` entries |
| A retry joins the queue and sends the same request | `Entity.queue` and fixture truth (rule 31) |
| `uncertain` set and cleared | `Entity.get` (rule 32) |
| `unconfirmed` fields and their confirming read | `Entity.get`, `Domain.entry.get` (`EP:92-100`) |
| Drafts instead of temporary ids | the snapshot and `Domain.entry.get` (rule 33) |
| Merge 1's `Timeout` | the design has no Flow timeout (`D:766-767`, rule 25); a schedule plus `cancel` is covered above |
| `orphaned` across a version change | not covered: saved-state Stories are left out (`D:2086-2087`) |

## 8. Alternatives considered

- **Keep `story.machine` for fragments.** Rejected:
  - three of its five options do not apply;
  - discovery checks machines;
  - `.enter` and `checkpoint.exit` would be conditional members of an actor Story.
- **`story.fragment(F)`.** Rejected: "fragment" would become a new public word (it is not an export or keyword,
  `D:1937`, `D:1989`), and the trait/subroutine differences would hide behind conditional types.
- **`story.alone` / `story.harness`.** Rejected: they name the method, not the subject.
- **A host with one fragment stubbed.** Rejected: rule 10 and `flow check` already cover swapping a fragment, so it
  would add a concept and prove nothing new.
- **A checkpoint predicate over truth** (`D:1194`). Rejected:
  - it is a callback in a plan (`T:17-18`);
  - it makes a capture into an assertion (`T:75`);
  - a boolean hides the value when it fails.
- **Reading truth only at `end`.** Rejected: races need truth mid-story, before and after a reload.
- **Calls and endings read from the trace.** Rejected: the window is 4,096 events (`In:101`), and "Truncation …
  cannot prove an absent cause" (`T:94`).
- **A `.hold()` / `.release()` Story command.** Rejected: it would be a second scheduling channel beside the clock
  (`T:37-40`). A fixture that needs holds declares them as controls (3.5).
- **An `advanceHeld` command.** Rejected: rule 9 gives Testing's existing `advance` that meaning.
- **An `ackDelayMs` actor option.** Rejected: storage behaviour belongs to the storage fixture (locality).
- **A closure guard in the harness.** Rejected: `T:17-18`.
- **A "deny every guard" switch.** Rejected: it cannot name the code a host forwards.
- **A `.guards()` command.** Deferred (Q32): a test host covers a verdict that changes mid-life.
- **Harness callbacks with handlers.** Rejected: that is writing a host. Write a test machine instead.
- **A `.reset()` command for trait Stories.** Rejected: `resetOn` is a host filling (`D:290`), tested with
  `story.machine`.
- **Fixtures per tab.** Rejected: a reload would meet a different server.
- **Sharing only the truth `Ref` across tabs, building the rest of each fixture per tab.** Rejected: a fake server's
  other state (a script's position, a dropped-first flag) would restart on reload, so the reopened tab would meet a
  server that forgot its own script.
- **Playing fragment Stories through a generated component**, for example a harness view that prints the slice.
  Rejected: playback shows the real app UI (`PB:8-10`), and a generated UI is not the app.
- **Showing cut records only within the trace window**, as Inspect's trace view does. Rejected: the records are
  retained with the cut precisely so they never go missing.
- **The full lane on the snapshot** (the current Attempt, the starter, the phase). Rejected: rule 21 keeps the
  current Attempt out of guards and views (`D:539-540`); the reads need only `pending` and `retryCount`.
- **A list of causes per frame** (revision 1). Rejected for Q31: one frame per command needs no list.
- **Verdicts only in frames.** Rejected for Q13: `frames: "named"` would hide a refusal.
- **A `checkpoint.endings` read beside the evidence.** Rejected for Q29: two homes for ordered records; one
  `filter` by kind reads as plainly.
- **Lane entries in `pending`** (revision 1). Rejected for Q29: they repeat the lane and once disagreed with it.
- **An ending entry at settlement, filled in at admission.** Rejected: earlier evidence never changes (`T:95`); the
  queued `arrival` already carries what settlement decided.
- **A per-Attempt `uncertain` read in Stories.** Rejected: no view reads marks; the record's boolean is what rule 32
  changes observably, and the marks are Inspection's `uncertain` events (`In:88`).
- **A Story read that compares truth and records.** Rejected: it would decide for the author which server field
  means which record field; the author asserts both.
- **`owner` and `from` on endings** (revision 1). Deferred for Q35: no Story needs them yet.

## 9. Open questions

None needs the owner. Every question of revision 1 is decided in section 10, by correctness first and simplicity
second; no two options were equally correct with different product consequences.

Two items outside this proposal bound it, and are not reopened here:

- the design's open item 15 (`D:2140-2146`): until it is decided, call endings to `.each` copies are never
  `droppedDelivery` (3.4);
- playback's open question 2 (`PB:195-197`): fragment Stories stay unplayable until it is settled (Q17).

## 10. Decisions

D1–D3 were settled by the owner. The text is kept as decided. Its citations predate the merge: `M2:380` is now
`D:1194`, and `T:17` is `T:17-18`.

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

Every decision below was **decided under the owner's delegation, 2026-10-30**, and awaits the owner's validation.
They keep revision 1's question numbers and rounds; questions 1–5 are D1–D3, and number 28 was never assigned.

**Round 1: what a frame holds**

- **Q31 One cause per frame; collapse never crosses a command.** Choice: a frame has one `cause`; consecutive
  identical frames collapse only within one command; under the default and `"publication"` modes every command records
  at least one frame, a command that publishes nothing included. Why: as correct as a merged list and simpler, since
  Testing's singular cause (`T:73-74`) stays and playback steps by command anyway. The last clause is needed for
  correctness: under `"publication"`, a refused send publishes nothing (`Mc:79-80`) and would otherwise have no
  frame. Consequence: amends `T:71-72`; `causes` goes. Rejected: merging causes into a list (revision 1, C-M8).
- **Q13 Send verdicts are kept.** Choice: the send's frame `cause` carries its verdict, and a Denied or Unhandled send
  also appends a `refused` entry to the cut's evidence. Why: correctness; with `frames: "named"` only checkpoints are
  recorded, so a verdict kept only in frames would hide a refusal. Allowed sends need no entry: their effects are on
  the cut. Consequence: one new evidence kind; Mc already observes denials as evidence (`Mc:80`). Rejected: verdicts
  in frames only; an entry for every send.
- **Q30 One run log; frames point into it.** Choice: every cumulative record is appended to one run log, a frame holds
  its length, and unchanged snapshots, lives and encoded truth keep identity; lanes on snapshots stay slim (Q21).
  Why: the reads are the same, the cost is linear, and Testing already says a frame refers to evidence by position
  (`T:73-74`). Consequence: `checkpoint.evidence` and `checkpoint.calls` are typed views of the prefix (rule 14,
  section 5). Rejected: copying cumulative records per frame (quadratic, S-H2).

**Round 2: where cumulative records live**

- **Q29 Endings are evidence; `pending` lists work, never lanes.** Choice: an admitted ending is an `ending` entry in
  `checkpoint.evidence`; `pending` lists an Attempt as an `operation` entry with `phase` until settlement and its
  ending as an `arrival` until admission; lanes are read only from the snapshot. Why: one ordered home for what the
  Runtime decided, ordered against resets and repairs; `pending` cannot disagree with `pay.pending`, because at each
  moment of rule 21's span exactly one entry exists. Readability holds: the test filters by `kind`. Consequence:
  `checkpoint.endings`, `phase: "settled"` and `waiting` go; phases are `"waiting"`, `"acknowledging"`,
  `"invoked"`. Rejected: a separate `endings` read; lane entries (revision 1).
- **Q6 The ending record.** Choice: `operation`, `key`, `attempt`, `channel`, `reason`, `event`, `route`, `declined`
  and `seq`, for commit values and resource call values, written once at admission. Why: correctness: every ending,
  read endings (rule 37) and `LateMayNotLeave` refusals included, stays readable beyond the trace window; written at
  admission because earlier evidence never changes (`T:95`), while the queued `arrival` shows settlement's verdict.
  Consequence: channel and reason are after rule 18, decided at settlement (merge 4 rule 27). Rejected: endings in
  the trace only; an entry at settlement completed later.
- **Q35 Keep `route`; defer `owner` and `from`.** Choice: no owner activation, no route origin. Why: `route`, the
  resulting snapshot and the turn's trace event show where a late ending went, and an activation counter would be a
  number no other read uses. Consequence: `{ state, activation }` goes. Rejected: revision 1's `owner` and `from`.

**Round 3: lanes**

- **Q21 Lanes on snapshots, `pending` and `retryCount` only.** Choice: as revision 1. Why: correctness: `check()` on a
  frame (`T:107-108`) and on an old snapshot (`Mc:166`) must read lanes as published, and rule 21 forbids more
  (`D:539-540`). Consequence: amends Machines O8; agrees with merge 4's "the lane does not hold store state"
  (`M4:691`). Rejected: the whole lane.
- **Q22 No lane entries in `pending`.** Choice: decided by Q29; an Attempt's work and its queued ending are listed
  instead. Why: lane state already lives on the snapshot. Consequence: none beyond Q29. Rejected: revision 1's lane
  entries with phases `acknowledging`, `invoked`, `settled`.
- **Q36 Keep the names.** Choice: no renames here. Why: merge 4's E16 already renames the record's `pending` to
  `predicted` (`M4:567-571`), leaving the lane read (rule 21) and the cut's pending work (`T:84`), which are read in
  different places; `ending.key` is the lane key, which for a predicting write is the record key (rule 34), so it now
  matches `Entity.get`'s key; `by: "exit"` and `checkpoint.exit` are one fact (Q39); D3 fixes `Fixture.stateful`.
  Consequence: the Testing O4 record-read amendment (6.4). Rejected: renaming further before the design's naming
  question (`D:2110-2111`).

**Round 4: time and the mailbox**

- **Q7 The clock rules.** Choice: rule 9: every sleep is a deadline; `advance` runs non-turn work, settlement included,
  and admits no turn; the tiebreaks; frozen deadlines skipped. Why: correctness: it makes the mailbox race and the
  moment between settlement and admission (rule 27) reachable without a second command, and totally orders every
  wake-up. Consequence: amends Testing O2. Rejected: `advanceHeld`; an `advance` that drains.
- **Q38 Keep the final tiebreak.** Choice: owner kind, then the order sleeps began, and no further levels. Why:
  correctness: without it a fixture sleep and a schedule at one instant have no order (C-M1). Consequence: rule 9.
  Rejected: documenting Mc's order alone.
- **Q14 `send` is FIFO.** Choice: `send` runs the queued turns ahead of it, its own, and their pending-reset turns,
  then stops, in every Story kind. Why: it is what production does with a user event behind queued arrivals.
  Consequence: rule 4. Rejected: refusing `send` while arrivals are queued.

**Round 5: queue and reset visibility**

- **Q19 Queued arrivals in `pending`.** Choice: yes; a queued ending also carries its operation, key, Attempt, channel
  and reason. Why: correctness: without them the mailbox race and a settled-but-unhandled ending are invisible.
  Consequence: rule 9. Rejected: leaving queued arrivals out.
- **Q34 No `phase` on arrivals.** Choice: `kind: "arrival"` and `position` only. Why: the kind already says it is
  queued, and `phase` keeps one vocabulary, an Attempt's. Consequence: `phase: "queued"` goes. Rejected: deferring
  the entry.
- **Q33 No `"pendingReset"` cause.** Choice: dropped. Why: a publication frame's cause is its sequence (`T:73-74`), and
  the `reset` entry with source `"pendingReset"` at that position names it. Consequence: 3.4, 3.11. Rejected:
  keeping a cause that repeats the evidence.

**Round 6: fixtures**

- **Q9 Run-scoped fixtures shared by tabs.** Choice: fixtures depend only on fixtures and run-level services and may
  shadow setup services. Why: correctness: a reload must meet the same server, script position included.
  Consequence: amends `T:57`. Rejected: sharing only the truth `Ref`.
- **Q23 The starting truth is the Schema's constructor default.** Choice: as revision 1. Why: it keeps D3's signature
  and reuses `Flow.initial`'s mechanism (`D:234`). Consequence: none to D3. Rejected: an `initial` member.
- **Q24 Fixture controls.** Choice: an optional `controls` record of Schemas, one `Queue` each, and
  `.control(fixture.name(payload))`; holds and releases are controls too. Why: Stories of subscriptions need pushes
  and disconnects at a chosen step, and `propertyTest`'s emitted Stories need its generated holds, pushes and
  disconnects as literal commands (`T:143-145`, `T:159-160`); a data command is not a callback. Consequence: Testing
  O3 and O6 amendments. Rejected: controls for property tests only.

**Round 7: storage and tabs**

- **Q8 `Fixture.storage({ acknowledge })`.** Choice: it delays only the capture that acknowledges an Attempt, which
  persisted actors make (`Ps:124`) and which also holds the lane and predicted keys (rule 38). Why: correctness: it
  opens the one pre-invocation window a `reject` or `allow` plain write has, without hanging `openTab` (C-M3).
  Consequence: rule 10. Rejected: an actor option.
- **Q37 One storage fixture.** Choice: `Fixture.storage` is the storage fixture of `T:66-67`, and `seed` is its only
  seeding form. Why: one concept, not a second way to seed. Consequence: Testing O3 names the constructor. Rejected:
  a separate seeding form.
- **Q18 A closed tab in a frame.** Choice: render nothing and record the frame-level gap `TabClosed`. Why: it fills a
  case `T:108` leaves open, without inventing a cut. Consequence: rule 14. Rejected: rendering the last cut.

**Round 8: the fragment harness**

- **Q10 Harness defaults.** Choice: guards pass, callbacks record, exits record and end the life; the subject sits
  under a harness child state; the Story's snapshot is the subject's slice. Why: correctness: a trait on the root
  could never be left, so never freeze (C-M4). Consequence: rules 2–3. Rejected: placing the trait at the root.
- **Q11 A data-only refusing guard.** Choice: the `guards` option, `true | Flow.Denial`, added to D1's option list.
  Why: a fragment's refusal path must be testable alone, without a callback (`T:17-18`). Consequence: rule 2.
  Rejected: closure guards; a deny-all switch.
- **Q32 No `.guards()` command.** Choice: deferred; the verdict is fixed per run. Why: a verdict that changes mid-life
  is host policy, testable in a minimal test host with `story.machine`, so nothing becomes untestable; one way is
  simpler. Consequence: 3.9. Rejected: a second way to set a verdict now.

**Round 9: the fragment Story surface**

- **Q39 `checkpoint.exit` is the shorthand.** Choice: rule 5 says it is the last `by: "exit"` record of the current or
  last life. Why: one fact, one definition. Consequence: rule 5. Rejected: leaving them unrelated.
- **Q27 Unique callback and exit names.** Choice: a type error where types show it, otherwise a `flow check`
  construction error. Why: D2's consequence, enforced where it can be seen. Consequence: rule 15, Machines O1 and
  CommandLine O5. Rejected: a warning.
- **Q17 Fragment Stories are not playable.** Choice: `StoryPlayer` and `definePresentation` reject them. Why:
  playback renders the real app (`PB:8-10`), and a fragment Story has none; extending playback's own open question
  (`PB:195-197`) would be a new rule. Consequence: rule 14. Rejected: a generated harness view.

**Round 10: discovery and reads**

- **Q12 `defineConfig({ stories })`.** Choice: yes. Why: library fragments and test hosts belong to no App.
  Consequence: rule 12. Rejected: a fake App per library.
- **Q26 Ids unique across the configuration.** Choice: as revision 1, with `appId` and `appFingerprint` `null` for
  App-free Stories. Why: one id names one Story in CLI output and traces. Consequence: amends `T:12-13`, Inspection
  O4. Rejected: ids per App and per `stories` entry.
- **Q25 Keyed schedules read by index.** Choice: `s.schedules.<name>[i]`, each `{ key, dueAt }`, in `keys` order.
  Why: the design's one convention for keyed lists (`D:75`). Consequence: amends design 2.1. Rejected: a record by
  key.

**Round 11: confirming what is left out**

- **Q15 No `.reset()` command.** Choice: no. Why: `resetOn` is a host filling (`D:290`); `story.machine` tests it.
  Consequence: none. Rejected: a harness reset.
- **Q16 No Story hold-and-release command.** Choice: no; a fixture that holds answers declares `hold` and `release`
  controls (Q24). Why: holding is the fake server's state, not a second scheduler beside the clock (`T:37-40`).
  Consequence: 3.5. Rejected: `.hold()` / `.release()` commands.
- **Q20 No wider `.each` exploration now.** Choice: nothing added. Why: which transitions add or remove keys is
  Story-checked (`D:461-463`), and `propertyTest` stays the one generator on the real Runtime (T1, `D:2046`).
  Consequence: none. Rejected: a membership explorer.

## New keywords

- `story.trait`
- `story.subroutine`
- `StoryRun<Kind>`
- `.enter()` and `.leave()` on trait Stories
- `guards` (Story option)
- `checkpoint.calls`, with `by: "transition" | "whenAbandoned" | "exit"`
- `checkpoint.lives`, with `life` and `frozen`
- `checkpoint.evidence`, entries with `kind` and `seq`
- `listRepair`, `droppedDelivery`, `droppedRaise`, `reset`, `ending`, `refused` (evidence kinds)
- `ending` fields: `operation`, `key`, `attempt`, `channel`, `reason`, `event`, `route: "current" | "late"`, `declined`
- `verdict` on a send's frame `cause`
- lanes on snapshots (`pending`, `retryCount`, read through commit values)
- `kind: "schedule" | "operation" | "arrival" | "fixture"` (pending entry)
- `attempt` and `phase: "waiting" | "acknowledging" | "invoked"` (an Attempt's pending entry)
- `position` (pending entry for a queued arrival)
- `frozen` and owner `fixture:<id>` (pending entry)
- `TabClosed` (frame-level StoryFrame gap)
- `s.schedules.<name>[i]`, with `key` and `dueAt`
- `Fixture`, `Fixture.stateful({ id, truth, controls?, layer })`, `Fixture.storage({ acknowledge?, seed? })`
- `.control(fixture.name(payload))` (command)
- `checkpoint.truth`
- `defineConfig({ stories })`
- `InvalidStoryCommand`
- From merge 4, read in Stories: `predicted` in `Entity.get`'s result (replaces `pending` there)
