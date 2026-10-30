# Proposal: Stories for fragments, server calls and entity domains

Status: proposal, **revision 3, not accepted; awaits validation.** Merge 3 into [machine-design.md](../machine-design.md),
which holds merges 1 and 2 (section 2.7 and rules 13–25; their records are [merged/outcomes.md](../merged/outcomes.md)
and [merged/server-calls](../merged/server-calls/proposal.md)). It merges together with
[merge 4](../merged/entities.md) (entity domains, rules 26–38, accepted on 2026-10-30, `M4:3-6`), and is
written to be correct with merge 4 merged in. No `.plan` file changes until it is accepted. It makes Stories
([Testing.plan](../../../../Testing.plan)) cover what the design added: traits and subroutines inside a machine and
alone, `.each` copies and their lives, resumable traits, server-call endings, lanes, late routing, keyed schedules,
fixture truth, restore mid-write, and the store's records, predictions and queues around a write. Every addition is
checked against the accepted playback design ([playback.md](../../playback.md), whose contract is Testing O4 and O9);
section 3.11 says how each one appears in playback, or why it does not. There is no spike yet; the code here is
examples only. Model-based exploration (`model()`, Testing O5) is removed by the design (T1, `D:2164`) and is not used
or replaced here. D1–D3 were settled by the owner; every other decision (section 10) was made under the owner's
delegation and awaits the owner's validation.

**Revision (multiplicity audit, 2026-10-31).** [audit-multiplicity.md](../audit-multiplicity.md) settles Q40: lanes are plain snapshot data,
`s.calls`, beside `s.activities` (the design's rule 21 and decision D18), so a Story and a view read them from the
snapshot and no commit value is exported; `Definition.O` goes and rule 17 says so. Record-queue members are named per send
(rule 16). Changed passages carry this heading's words.

**Revision 3** (2026-10-30), answering two validation reviews of revision 2 ([reviews/review-2.md](reviews/review-2.md)):

- **Q7 reversed: `advance` behaves like real time** (C-H1). Revision 2's "`advance` admits no turn" broke every timer
  chain that re-arms through a turn, including dispatch-desk's `lockedOut` (`DD-ES:99-106`, `DD-EM:202-207`). Now
  `advance` runs each instant's work, turns included, in deadline order (rule 9). The moment between settlement and
  admission is read from `frames: "publication"` frames (G11, 3.12), and every read that takes a checkpoint takes
  any frame (rule 14).
- **Q9 made workable** (C-H2). Fixtures stay run-scoped and depend only on fixtures and run-level services, but a
  fake server that a setup builds per tab is now provided to Stories as a stateful fixture, so tabs share one server
  (rule 11). The dispatch-desk changes are listed (6.6).
- **New decision Q40, and the one owner question.** A Story and a view reach a commit value's lane reads through a
  commit value exported from module scope with `Definition.O` (3.14); section 9 asks the owner to confirm it.
  *(Revision (multiplicity audit, 2026-10-31): superseded by the snapshot's `calls`; see Q40.)*
- **Correctness mediums and lows fixed** (C-M1–C-M7, C-L1–C-L5). `predicted` stays true for omitted fields; a
  `runnable` phase is added; `.control` runs its reaction to idle; the Operations O6 amendment is reworded; the
  `propertyTest` claim is mapped fault by fault; `ending.key` equals the record key only under rule 34; queue
  removals are read from `ending` entries; and the five lows.
- **Writing findings applied** (W-H1–W-H5, W-M1–W-M9, the traps). `busyThenPaid` uses 429; truth records each
  request with its key, and assertions compare Attempt ids; reload mid-write is specified; a section of traps
  (3.13) says how each one is designed out or found.
- **Errata outside this file**, as the coordinator allowed: `D:1308` scripts 429; merge 4's queue example says
  "another actor's" (`M4:391`) and its settlement comment keeps omitted fields predicted (`M4:375`).
- **Citations.** `M2:661` is `M2:660`; `T:106-107` is `T:107`. Dispatch-desk files are cited as `DD-*`.

**Revision 2** (2026-10-30) decided questions 6–39 under the owner's delegation, added merge 4's gaps G10–G14,
section 3.12, rule 16 and the rule-by-rule check (6.5), and re-pointed the design's citations after its verification
fix. Its "one example fixed" note is withdrawn: under revision 3's rule 9 `busyThenPaid` needs no extra `process()`.

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
| `M4` | `references/explorations/machine-fragments/merged/entities.md` (accepted, merging with this one) |
| `EA` | `references/explorations/machine-fragments/merged/each.md` |
| `M1` | `references/explorations/machine-fragments/merged/outcomes.md` (record of merge 1) |
| `M2` | `references/explorations/machine-fragments/merged/server-calls/proposal.md` (record of merge 2) |
| `RQ` | `references/explorations/machine-fragments/merged/server-calls/requirements.md` |
| `SS` | `references/explorations/machine-fragments/merged/server-calls/spike/stories.ts` |
| `SF` | `references/explorations/machine-fragments/merged/server-calls/spike/flow.ts` |
| `PB` | `references/explorations/playback.md` (accepted) |
| `DD-ES` | `references/dispatch-desk/features/Tickets/editor/editor.story.ts` |
| `DD-EM` | `references/dispatch-desk/features/Tickets/editor/editor.machine.ts` |
| `DD-ET` | `references/dispatch-desk/features/Tickets/editor/editor.tabs.story.ts` |
| `DD-QS` | `references/dispatch-desk/features/Tickets/queue/queue.story.ts` |
| `DD-FX` | `references/dispatch-desk/testing/fixtures.ts` |
| `DD-API` | `references/dispatch-desk/app/demo-api.ts` |

Where the design and a `merged/` record differ, the design wins (`D:3-5`). Where merge 4 amends the design, the
amended design is meant (`M4:688-712`).

## 1. The problem

A Story's assertions read four sources: the **snapshot** (what views see), the **store** (the records views read),
the **evidence** (what the Runtime decided) and the **fixture** (what the server holds). The design and merge 4 put
new facts in each source, but Testing.plan gives no read for most of them, and in two places they contradict it.

- **G1. Fixture truth has no capture form.**
  - The design checks server truth with a predicate:
    `.checkpoint("paid", ({ truth }) => truth.FakeStripe.charges === 1)` (`D:1308-1310`). It lists this as a keyword
    (`D:2054`) and as an amendment to Testing O2 and O3 (C16, `D:2151`).
  - That contradicts Testing O1, "Scenario commands accept no arbitrary callbacks" (`T:17-18`), and O4,
    "checkpoint(name) captures immediately without processing" (`T:75`).
  - Stateful fixtures with server truth already exist (`T:63-64`). The property-test oracle "reads fixture server
    truth directly" (`T:147`). A Story checkpoint has no such read.
  - The requirements ask Stories to "assert server truth" (`RQ:102-103`). Today those assertions are written as
    comments (`RQ:133`).
- **G2. Endings, lanes and late routing are not on the cut.**
  - An ending is routed when its turn is admitted, as current or late (rule 14, `D:515-520`; 2.5 step 1,
    `D:655-658`).
  - A lane per transaction and key holds `pending` and `retryCount` (rule 21, `D:551-563`).
  - Flow's reasons include `StillUnknown` (rule 18, `D:536-538`) and `NotSent { why }` (`D:818`).
  - Testing's cut names only "attempts where applicable" among pending work (`T:84-85`), and defers lanes to
    Operations O6 (`T:90-91`). Operations O6 says "Transactions have outcomes, never lanes" (`Op:162`). The snapshot's
    field list has no lanes, and "Reading an old snapshot never consults live lanes" (`Mc:162-166`). So
    `pay.pending(checkpoint.snapshot, key)` (`D:992`, `D:1088`) is unspecified on a captured snapshot.
  - The spike prints these facts only as trace text (`M2:660`, `M2:667-700`).
  - The trace keeps 4,096 recent events (`In:101`). Only repairs, skips and diagnostics are kept cumulatively on
    a cut (`T:93`).
- **G3. A Story of a whole machine cannot see what its fragments did.** Observation is specified only for a fragment
  tested alone (rule 11, `D:486-489`). Inside a host:
  - Callbacks run as parts of the turn (rules 6–7, `D:414-430`; 2.5 step 3, `D:674-701`). Whether `onLocked` fired,
    for which `.each` key and with which payload, is not readable.
  - An exit taken by a subroutine is not readable. `checkpoint.exit` exists alone only (`D:488`).
  - Lives "appear only in Inspection and Stories" (`EA:231`), but Testing has no read for them. So these rules
    cannot be checked:
    - "a delivery reaches the incarnation it was started or armed under" (`D:467-473`);
    - a late delivery for a removed row is dropped "even if the key was added again" (`D:1950-1951`).
  - A frozen resumable slice "stays present while frozen" (`D:86-87`), so frozen and active look the same.
  - A pending reset runs as its own follow-up turn (`D:388-394`), but a frame's cause is only "the command … or the
    publication sequence" (`T:73-74`).
  - List repairs and dropped raises are "Story-derived" warnings (`D:477-480`, `EA:208-214`), but Testing does not
    name them as evidence kinds (`T:93`).
  - The lockout example asserts `run.calls` per checkpoint (`D:1778-1779`), while rule 11 defines it per run
    (`D:487`).
- **G4. Clock and ordering rules are not exact enough.**
  - The mailbox race (spike P1) needs a stand-in command, `advanceHeld` (`SS:106`, `SF:462`), because the spike's
    `advance` drains every 10 ms (`SF:460`). Testing says `advance` makes work eligible without draining it
    (`T:50-51`), while dispatch-desk's `lockedOut` expects one `advance("10 minutes")` to run a chain of retries
    that re-arm through turns (`DD-ES:96-106`, `DD-EM:202-207`). The two readings disagree. Testing also does not say:
    - in which order work runs when one `advance` passes several deadlines;
    - whether a fixture's wake-up is eligible work.
  - It does not say whether a fixture's sleep is a "pending deadline" for `advanceToNextTimer` (`T:49`).
  - A frozen schedule keeps its `dueAt` and is not delivered (`D:370-372`). `advanceToNextTimer` "stays at now when
    already due" (`T:49`), so an overdue frozen deadline would pin it there forever.
  - Keyed schedules (`D:1262-1276`, rule 23, `D:597-599`) have no snapshot path for a key's `dueAt` (`D:75-81`). The
    equal-deadline order (`Mc:119-120`) has no key tiebreak; `.each` copies use list order (`D:472`).
- **G5. Some endings cannot be produced, and restore mid-write cannot be checked.**
  - `NotSent { why: "Cancelled" }` before invocation on a `reject` or `allow` commit of a plain operation has one
    window: the storage acknowledgement (`D:1324`, `D:1313-1315`), which only persisted actors wait for (`Ps:124-125`).
    Story storage is "always … a fresh in-memory KeyValueStore", which fixtures may only seed (`T:64-67`). The spike
    invents an actor option, `ackDelayMs` (`SS:292`, `SF:239`, `SF:291`).
  - `Restored` endings (`D:1330`) need a reload. Only App Stories have one (`T:166-172`), and nothing says so.
  - Tabs are "independent Runtimes of the Story's setup … Tabs share nothing else" (`T:166-172`). If fixtures are
    acquired per tab, the reopened tab talks to another fake server, and "charged once across a reload" cannot be
    checked. Dispatch-desk shows it: its fake server is a setup service (`DD-API:64-74`, `DD-API:208-212`), so
    `reloaded` (`DD-ET:36-48`) reopens against a fresh server that never saw the save.
- **G6. The fragment Story is under-specified, and misnamed.**
  - `story.machine(fragment)` (`D:486`, `D:2117`) reuses a contract for "one fresh actor" with `input`, `context`,
    `services` and `fixtures` (`T:9-11`). Fragments declare no operations, context or I/O (`D:292`, rule 3,
    `D:409`).
  - A Story id is "unique within its App" (`T:12-13`), and discovery is per App and rejects "incompatible machines"
    (`T:32-34`). A library fragment belongs to no App.
  - A trait Story starts active (`D:1771-1777`). A subroutine Story starts with `.enter({})` (`D:1884`). Neither
    rule is stated.
  - `.leave()` is defined only for subroutines (`D:488-489`). So for a trait alone, "`run.calls` … including
    `whenAbandoned`" (`D:487`) cannot happen, and `.resumable()` cannot be tested alone.
  - Rule 11 lets a fragment Story send host events (`D:487`). Testing allows "Only public events" (`T:25-26`).
  - The harness "fills every port with a recording harness" (`D:486`). It does not say what a harness guard answers
    or what a harness exit does, and offers no way to refuse at a guard.
  - The Confirm example names a checkpoint `end` (`D:1884`), beside the run's own `end` capture (`T:75-76`).
- **G7. Sends to fragment events and keyed copies are not in Testing, and their verdicts are lost.**
  - The design sends `E.invites.key("invite-2").Changed(…)` in a Story (`D:1946-1947`) and has views send
    `E.CANCELLING.Yes()` (`D:1879`). Testing has only `send(event)` and `send(ref, event)` (`T:23-26`).
  - Denied and Unhandled events "publish nothing" (`Mc:79-80`), and consecutive identical frames collapse (`T:71-72`).
    So the frame that would show "a keystroke sent for a row removed a moment earlier is `Unhandled`" (`D:1950`) can
    disappear. The spike reads the verdict with a live `a.check` (`SS:191`).
- **G8. What `send` runs is inconsistent.**
  - The design's Testing amendment says "`send` runs its turn; `process()` drains operation work and due timers"
    (`D:2117`). Testing does not say that `send` runs anything (`T:22-29`, `T:42-52`).
  - A pending reset runs as a follow-up turn at the head of the mailbox (`D:390-391`, `D:652`). It is unclear
    whether `send` includes it.
  - Nothing says what `send` does when arrivals are already queued.
  - The spike's `send` drains the whole mailbox (`SF:458`).
- **G9. Playback has gaps caused by fragments and server calls.** Playback renders the real app from frames
  (`PB:22-29`, `T:100-109`).
  - **A fragment Story has nothing to render.** `StoryFrame` renders "the application … below its FlowProvider"
    (`T:107`). A trait or subroutine Story has no App, no ref and no component. `useActor` returns only "its pure
    pre-attach snapshot" (`T:104`), and letting a Story's actor stand in for a component's actor is an open question
    in playback itself (`PB:195-197`).
  - **Buttons gated by a lane render wrongly.** Eligibility in a frame "uses production checks" (`T:107-108`).
    `pay.idle(key)` is a guard over lanes (`D:991`). If the frame's snapshot carries no lanes (`Mc:162-166`, G2), a
    disabled Pay button renders enabled.
  - **Stepping by command breaks when frames collapse.** The player steps "by frame, command or scene" (`T:213-214`)
    and finds the next command from each frame's cause (`PB:133-134`). A Denied or Unhandled send makes an identical
    frame that collapses (`T:71-72`, `PB:81`). If its cause goes with it, the command disappears from playback (G7).
  - **The next-action highlight meets keyed and subroutine events.** The player "highlights the control whose click
    would send the Story's next event" (`T:222-223`). The event may now be `E.invites.key(k).Changed` or
    `E.CANCELLING.Yes()` (`D:1946-1947`, `D:1879`). The comparison has to include the instance path and key, and
    that is unstated.
  - **A closed tab has no defined frame.** `tab selects a tab's cut` (`T:108`), and `closeTab` ends a tab abruptly
    (`T:168-169`). Reload Stories (G5) play frames between `closeTab` and `openTab`. What `StoryFrame tab` renders for
    a tab that is absent from the frame is not specified; Testing's gaps are per actor (`T:102-104`).
  - **Queued work shows no reason.** Testing's pending work does not list queued, not-yet-admitted arrivals, so a
    publication frame between a settlement and its ending's turn looks like a stall in the overlay.

Merge 4 adds five more:

- **G10. Record reads at a checkpoint use merge 4's names nowhere.**
  - Testing already reads the cut's store: `Entity.get(checkpoint, key, shape)`, `Entity.queue(checkpoint, key)` and
    `Domain.entry.get(checkpoint, input)` (`T:85-89`, `EP:135-139`). `Entity.get` returns
    `{ data, pending, uncertain, unconfirmed }` (`T:88`, `EP:130`).
  - Merge 4 renames the record's `pending` to `predicted` (E16, `M4:570-574`, `M4:934`) and amends `EP:130`
    (`M4:734`), but its amendment tables list no Testing row (`M4:688-748`), so `T:88` keeps the old name.
  - Merge 4 makes `uncertain` a mark per record and Attempt (rule 32, `M4:608-610`) and changes what the queue holds
    (rules 29, 31, 35, `M4:592-618`). Testing does not say which of these a Story can see, or how a queue entry
    relates to an ending or to pending work.
  - *Answer:* 3.12 and rule 16 reuse the three existing reads, with merge 4's names; nothing parallel is added.
- **G11. The moment between settlement and admission is unspecified for Stories.**
  - The store applies an ending at settlement, in one publication, before the ending is queued; the lane changes
    at admission (rule 27, `M4:585-588`; `M4:355-359`). Between them the record can already be confirmed while the
    lane still says "Saving…" (`M4:94-95`).
  - A start's prediction publishes with its turn (rule 28, `M4:589-591`).
  - Testing does not say which frames exist between settlement and admission, or whether a Story can read a frame
    as it reads a checkpoint. Without both, a Story cannot check rule 27 or assert that a hazard never shows, and
    playback cannot show the real "confirmed, still saving" moment.
  - *Answer:* settlement's store publication is its own frame under `frames: "publication"` (rule 14), every
    checkpoint read takes any frame, and "never" assertions run over those frames (3.12, 3.13).
- **G12. Server truth and client truth are not told apart.**
  - A stateful fixture holds server truth (`T:63-64`), and the store holds the client's records (`EP:62-70`). Tabs
    are separate Runtimes (`T:166-167`), so each tab has its own store, while this proposal makes fixtures
    run-scoped (rule 11).
  - Nothing says how a Story compares the two, or whether a fixture may reach the store.
  - *Answer:* 3.12: truth is per run and read with `checkpoint.truth`; records are per tab and read with
    `Entity.get`; truth reaches the store only through real responses.
- **G13. `propertyTest` and the checkpoint reads are not connected.**
  - `propertyTest(domains, options)` generates ordinary static Stories (`T:130`, `EP:160-161`). Its fixture is "a
    stateful fixture whose server truth is the oracle" (`T:134`), its faults "hold, release, fail, delay, reorder,
    duplicate or lose responses; change server truth and push; disconnect and reconnect; change subscriptions;
    invalidate; crash and restore; or adopt a supplied domain" (`T:143-146`), and a failure "emit[s] a static Story
    with literal inputs, controls and seed" (`T:159-160`). It checks properties at every publication (`T:150`,
    `EP:164-169`).
  - What "controls" are in a static Story, how each fault is written, and which reads the properties use, are not
    said.
  - *Answer:* 3.12's fault table: every fault the fake server makes is one of `Fixture.stateful`'s controls; the
    others map to existing commands or stay with Testing's own deferred encoding (`T:243`); the checks use the
    same reads as Stories.
- **G14. `NotSent { why: "Overloaded" }` and record-queue order may need injection.**
  - Overflow of an actor queue or a record queue ends `NotSent { why: "Overloaded" }` (rule 35, `M4:617-618`), at 64
    waiting writes per record (`EP:179-182`). Record queues are FIFO across actors (`EP:112-116`), and an unknown
    holds the queue until its forced repair settles (rule 30, `M4:597-600`).
  - Fixtures "cannot inject operation outcomes directly" (`T:55-56`). Whether a Story can reach these states with
    fixtures and sends alone is not shown. EP V5 asks for "the 64/65 queue boundary with no partial joins"
    (`EP:208-210`).
  - *Answer:* 3.12: yes. A fixture that holds the head's answer (a control) plus enough sends fills a queue, and two
    actors in one Runtime order it.

The spike's runner reproduces data flow well, but five of its affordances are not Story API and must not leak into
the plans:

- `advanceHeld`;
- the `ackDelayMs` actor option;
- an `advance` that drains in fixed 10 ms steps rather than deadline by deadline;
- live `a.state`, `a.memory` and `a.laneCount` reads (`SS:127`, `SS:325`);
- a conditional send inside a loop (`SS:127`), forbidden by `T:17-18`.

**Three words.**

- An arrival (a timer firing, a call ending, a send) is **queued** when it enters the actor's FIFO mailbox
  (`D:653-654`, P21 `D:2130`).
- A send is **settled** when Flow classifies it, applies rule 18, applies the Attempt's ending to the store and
  releases record queues, in one publication, and then queues the ending (rule 27, `M4:585-588`).
- An ending's turn is **admitted** when 2.5 step 1 takes it from the mailbox: there it is mapped through `outcomes`,
  its owner is tested and the lane is updated (rules 14 and 21, `D:515-520`; `M4:359`). "Admitted" means only that
  here, as in rule 14 (`D:516`).

## 2. Where the data comes from

| Fact the author checks | Real source | How a Story reads it |
| --- | --- | --- |
| Fragment memory, schedules and `dueAt`, `.each` copies by key | the published snapshot (`D:75-87`) | `checkpoint.snapshot` (`T:82-83`), owner-typed (rule 13) |
| Private fields | the snapshot; outside types omit them (`D:246`, `D:268-269`, `D:2107`) | `checkpoint.snapshot`, typed with them |
| Callbacks told, exits taken, `whenAbandoned` notifications | the Runtime's turn parts (rules 6–7, `D:414-430`; `D:674-701`) | `checkpoint.calls` (3.3) |
| Lives, frozen state | the Runtime's fragment bookkeeping (`D:467-476`, `EA:231`) | `checkpoint.lives` (3.4) |
| Resets, list repairs, dropped deliveries and raises | the same bookkeeping (`D:388-395`, `D:464-473`, `EA:208-214`) | the cut's evidence, `checkpoint.evidence` (3.4) |
| A send's verdict | the turn's selection (`Mc:78-81`, `D:671-672`) | the frame's `cause`; a refusal also in `checkpoint.evidence` (3.8) |
| An ending: channel and reason | the classifier (`D:844-863`) and rule 18, at settlement (rule 27, `M4:585-588`) | while queued, its `arrival` entry in `checkpoint.pending` (3.7); once admitted, its `ending` entry in `checkpoint.evidence` (3.6) |
| An ending: event, route, declined alternatives | admission (rule 14, `D:655-658`; rule 15, `D:521-524`) | its `ending` entry in `checkpoint.evidence` (3.6) |
| A lane's `pending` and `retryCount` (or `outstanding`) | the lane (rule 21) | the snapshot's lane rows, `checkpoint.snapshot.calls.<operation path>` (Revision (multiplicity audit, 2026-10-31); 3.6, 3.14) |
| An Attempt's outstanding work | the commit's fiber, the actor queue, the record queues, the acknowledgement (`D:1321-1325`, `EP:112-116`) | its `operation` entry in `checkpoint.pending`, with `phase` (3.6) |
| A record's data, `predicted`, `uncertain`, `unconfirmed` | the store revision of the cut (`T:78`, `EP:62-70`, `M4:72-82`) | `Entity.get(checkpoint, key, shape)` (`T:86-89`, 3.12) |
| A record queue | the store (`EP:112-116`, rule 29) | `Entity.queue(checkpoint, key)` (`T:87`, 3.12) |
| An answer's rows and staleness | the store (`EP:129-131`) | `Domain.entry.get(checkpoint, input)` (`T:86`) |
| What the server holds, and each request it received | the stateful fixture (`T:63-64`) | `checkpoint.truth` (3.5) |
| Time and deadlines | the Runtime Clock; the controlled clock in Stories (`T:37-40`, `D:906`) | `checkpoint.now`, `checkpoint.pending` (3.7) |
| Acknowledgement of an Attempt | storage, for persisted actors (Persistence O6, `Ps:123-128`; `D:1324`; rule 38, `M4:624-625`) | produced by `Fixture.storage` (3.7) |
| What playback shows | frames recorded once, rendered by `StoryFrame` (`PB:22-29`, `T:209-212`) | the same cut reads; section 3.11 |

Every read is captured at the cut, and every read that takes a checkpoint takes any frame, since a checkpoint is a
named frame (`T:75`). A read starts no work and cannot resume the Runtime (`T:97`, `EP:138-139`). Playback renders
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

- Rule 10 promises that a fragment with the same contract and summary cannot break its host (`D:481-485`).
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
  .advance("1 minute")                                    // the unlock fires at its instant and its turn runs (rule 9)
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
  .checkpoint("answered")
// answered.exit → { exit: "Confirmed", payload: {}, life: 1, turn: 2, by: "exit" }   // ← NEW shape: a calls record
// answered.calls.Confirmed → [the same record]                                         // alone, paths start at the subject

// cooldown.story.ts: leaving and returning, for a trait
const C = Countdown({ length: "30 seconds" }).resumable()
export const frozen = story
  .trait(C, { id: "Cooldown/frozen" })
  .send(C.E.Start())                                      // a hostEvent: armed, dueAt = now + 30 s
  .leave()                                                // ← NEW for traits: frozen, because resumable
  .advance("1 minute")                                    // nothing fires while frozen
  .checkpoint("away")                                     // away.lives → { life: 1, frozen: true }
  .enter()                                                // ← NEW for traits: resumed
  .process()
  .checkpoint("back")                                     // back.lives → { life: 1, frozen: false };
                                                          // the overdue firing ran once (D:370-372)

// draft.story.ts: a non-resumable trait left and entered again; its lives are kept apart
const P = Pager()                                         // whenAbandoned: [callbacks.onIdle] (D:116)
export const left = story
  .trait(P, { id: "Pager/left", input: { page: 1 } })
  .leave()                                                // ← NEW for traits: ended; whenAbandoned runs
  .enter({ page: 3 })                                     // a new life
  .leave()
  .checkpoint("twice")
// twice.calls.onIdle → [{ life: 1, by: "whenAbandoned", … }, { life: 2, by: "whenAbandoned", … }]
// twice.calls.onIdle.filter((c) => c.life === 2)        // calls are cumulative across lives: filter by life
```

- Options are `{ id, input?, guards? }`. There are no `context`, `services` or `fixtures`, because fragments have no
  I/O (`D:292`). `guards?` is this proposal's addition to D1's option list (rule 2, Q11).
- **The harness** is a generated machine with two child states under its root, `IN` and `OUT` (section 5). The
  subject is placed in `IN`: a trait on `IN`'s node, a subroutine as the state `IN` itself. Harness names never
  appear in Story reads, frame causes or denial reasons. A fragment Story's `checkpoint.snapshot` is the subject's
  slice (`{ memory, schedules }`), `undefined` while inactive and present while frozen, exactly as the slice reads in
  a host (`D:75-87`).
- **Trait Story.** The harness starts in `IN`, so the trait is active from the start.
  - `.leave()` moves the harness to `OUT`, which leaves the trait's node. A resumable trait freezes; any other trait
    ends, and its `whenAbandoned` runs (rule 1, `D:364-376`).
  - `.enter(input?)` moves the harness back to `IN`. A frozen trait resumes; otherwise a new life starts, with
    `input` or, when omitted, the options' `input`.
- **Subroutine Story.** The harness starts in `OUT`, so the slice is `undefined` until `.enter(input)`.
  - An exit or `.leave()` ends the life, and the harness is back in `OUT`.
  - Until the next `.enter`, sends are `Unhandled`.
- **Refusals alone** read as in a host. A harness guard's denial shows the verdict's own reasons
  (`{ Denied: [{ code: "LockedOut" }] }`, 3.9); a send to a subroutine in `OUT` is `"Unhandled"`. No harness state or
  event appears in either.
- `checkpoint.exit` exists only on subroutine Stories. It is the subroutine-alone shorthand for the last `by: "exit"`
  record under `checkpoint.calls`, with that exit's name added as `exit` (Q39): the exit that ended the current or
  last life, or `undefined` while it runs or after `.leave()`. In a host, the same record is at
  `calls.<subroutine path>.<exit>`; alone, at `calls.<exit>`.

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
- Records are cumulative up to the cut, across lives, and retained with it, as repairs are (`T:93`). A Story that
  means one life filters by `life` (and by `key` for copies). Trace truncation (`In:101`) cannot hide them. They are
  a typed view of the run log (rule 14), not a copy per frame.
- `turn` is an evidence sequence position, not a copy (`T:73-74`).
- Callbacks and exits share one name list per contract (D2), so `calls.<path>.<port>` is never ambiguous. A
  contract that declares one name as both a callback and an exit is a construction error (rule 15 here).

### 3.4 Lives and fragment evidence

```ts
// sign-in: after BackToPassword, TWO_FACTOR was left
run.checkpoints.atPassword.lives.challenges     // ← NEW: copies in key order, as s.memory.challenges
// → [{ key: "c1", life: 2, frozen: false }]
run.checkpoints.atPassword.lives.resendCooldown // → { life: 1, frozen: true }   (resumable, D:344)
run.checkpoints.atPassword.lives.code           // → undefined (inactive: dropped, not frozen)

run.checkpoints.atPassword.evidence             // ← NEW name for the cut's cumulative evidence (T:93)
// → [{ kind: "reset", seq: 41, tab: "main", path: ["code"], source: "resetOn" }, …]
```

The cut's cumulative evidence (`T:93`, `EP:141-142`), read as `checkpoint.evidence`, is one list per run in evidence
order. Every entry has `kind`, `seq`, its evidence sequence position (`In:80-81`), and `tab`, the tab it came from;
entries from a tab that was closed stay (rule 14). It gains these fragment kinds, each with path, key and life:

- `listRepair`: a duplicate key or a key past `max` (`EA:208-210`, `D:464-466`).
- `droppedDelivery`: a raise or timer firing addressed to a dead life (`D:467-473`). Call endings are never dropped:
  rules 8, 14, 17 and 20 govern them, as the design's rule 9 now says (Revision (multiplicity audit, 2026-10-31): item 15 closed, D21); an `ending` entry for an Attempt started in a copy also carries `copy: { path, key }`, the placement and copy key read from the Attempt (its `key` stays the lane key).
- `droppedRaise`: a raise into an absent key in a delivery turn (`EA:213-214`).
- `reset`: with source `"resetOn"` or `"pendingReset"`. A follow-up reset turn (`D:388-394`) is therefore named by
  the `reset` entry at its sequence position; a frame has no separate cause for it (Q33).

It also holds `ending` entries (3.6) and `refused` entries (3.8).

### 3.5 Server truth: `Fixture.stateful` and `checkpoint.truth`

```ts
// fixtures/fakeStripe.ts
const Request = Schema.Struct({ key: Schema.String, status: Schema.Int })              // one per request received
const StripeTruth = (start: { charges?: number } = {}) => Schema.Struct({
  charges: Schema.Int.pipe(Schema.withConstructorDefault(Effect.succeed(start.charges ?? 0))),  // the starting truth
  requests: Schema.Array(Request).pipe(Schema.withConstructorDefault(Effect.succeed([]))),     // ← convention: every request, with its key
})

export const FakeStripe = (o: {
  script?: ReadonlyArray<ChargeResponse>      // answers for the first requests, in order
  answerAfter?: Duration.Input                // server time before a charge applies and answers; default "100 millis"
  dropFirst?: boolean                         // the first answer is lost on the way back: the client sees NoResponse
  charges?: number
}) =>
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
const stripe = FakeStripe({ script: [{ status: 429, retryAfterMs: 2000 }] })   // 429 is Busy (D:925); 503 would be unknown (D:926)
export const busyThenPaid = story
  .machine(Checkout, { id: "Checkout/busy-then-paid", fixtures: stripe })
  .send(E.Pay())
  .advance("3 seconds")                                                  // Busy, WAITING's 2 s retry, a new write, its charge
  .checkpoint("paid")                                                    // a capture, not a predicate
  .control(stripe.disconnect({}))                                        // ← NEW command: data, typed by the control's Schema
  .checkpoint("offline")

// the test, outside the plan: compare Attempt ids, not counts alone
const paid = run.checkpoints.paid
const [busy, charged] = paid.evidence.filter((e) => e.kind === "ending" && e.operation === "Stripe.confirm")
expect(busy.reason._tag).toBe("Busy")
expect(charged.attempt.id).not.toBe(busy.attempt.id)        // a definite failure is tried again as a new write (rule 19)
expect(paid.truth.FakeStripe).toEqual({                     // ← NEW read
  charges: 1,
  requests: [{ key: busy.attempt.id, status: 429 }, { key: charged.attempt.id, status: 200 }],
})
```

- `truth` is a Schema, so captured truth encodes into exported evidence and redaction applies (`T:95-98`, `In` O5,
  `In:115-127`).
- The starting truth is the truth Schema's constructor default (`truth.make({})`), the mechanism `Flow.initial` uses
  (`D:244`). So the constructor is exactly D3's `{ id, truth, layer }`, plus the optional `controls` (Q23).
- Every cut captures every stateful fixture's truth, as it captures `now`. A cut whose encoded truth equals the
  previous cut's shares that value by identity (Q30).
- **Request truth, by convention.** A count alone cannot tell a deduplicated retry of the same Attempt from a new
  write: "charges: 1" holds for both. A stateful fake server should record every request it receives with the
  idempotency key it carried, and the Story compares those keys with the `attempt.id`s of its `ending` entries
  (above). Flow cannot do this for the author: it reads no request or status (`D:775-776`), so the fake server's
  shape is the author's.
- **When truth changes.** A fake server decides, as a real one does, when a request changes its truth: on arrival,
  on answer, or after its own processing time (`answerAfter` above). Its server-side work runs in the fixture's own
  scope, which is the run's (rule 11), so a closed tab interrupts the client's call but not work the server already
  began. Work that has not reached the server is never applied: a fake whose delay sits before the call
  (`Effect.delay` around the client call, `DD-FX:19-21`) models a request still on the wire.
- **Controls** are the pushes, connection faults, holds, releases and scripted response faults a stateful fixture
  needs (`T:63-64`, `T:143-146`). Each is a named Schema. The layer receives one `Queue` per control.
  `.control(fixture.name(payload))` offers the payload and runs the fixture's reaction, and any other non-turn work,
  until no fiber in the run is runnable, before the next command starts (rule 7). Arrivals it causes, such as a push's
  value event, are queued and run at the next `send`, `process()` or `advance`. A control is data, not a callback
  (`T:17-18`), and not a scheduler: a held answer is the fixture's own state, released by a message (Q16). It is a
  type error unless the fixture is one of the Story's fixtures.
- **No standard controls.** Delays, drops and deduplication are the fake server's behaviour, written in plain Effect
  as options or controls of that fixture (`answerAfter`, `dropFirst` above). Flow does not ship them: it knows no
  server semantics (`D:775-776`).
- **Plain Layers stay fixtures** (`T:54-56`). `Fixture.stateful` is needed only for truth on the cut and for
  controls.
- The property-test oracle (`T:133-134`, `T:147-148`) reads the same `truth`, and its fake-server faults are the same
  controls (3.12, G13).

### 3.6 Endings, lanes and in-flight work on the cut

```ts
const endings = run.checkpoints.reconciled.evidence
  .filter((e) => e.kind === "ending" && e.operation === "Stripe.confirm")   // ← NEW kind; filter by operation too
// → [
//   { kind: "ending", seq: 31, tab: "main", operation: "Stripe.confirm", key: { intentId: "pi_1" },
//     attempt: { id: "a1", retryCount: 0 }, channel: "unknown", reason: { _tag: "NoResponse" }, event: "Unsure",
//     route: "current", declined: [] },
//   { …, attempt: { id: "a1", retryCount: 1 }, channel: "unknown", reason: { _tag: "StillUnknown", failure: { _tag: "Busy" } }, … },
//   { …, attempt: undefined, channel: "failure", reason: { _tag: "NotSent", why: "Rejected" }, … },
//   { …, channel: "success", event: "Paid", route: "late",
//     declined: [{ code: "LateMayNotLeave", context: { state: "PAYING" } }] },
// ]
run.checkpoints.reconciled.pending                         // existing (T:84-85), now with an Attempt's phase
// → [{ kind: "operation", operation: "Stripe.confirm", key: { intentId: "pi_1" },
//      attempt: { id: "a1", retryCount: 2 }, phase: "invoked" }]          // ← NEW fields: attempt, phase

run.checkpoints.reconciled.snapshot.calls.Stripe.confirm                    // Revision (multiplicity audit, 2026-10-31): lane rows (design rule 21, D18)
// → [{ key: { intentId: "pi_1" }, pending: true, retryCount: 2 }]               reject: one addressable Attempt
check(run.checkpoints.reconciled.snapshot, E.Pay())                          // existing pure check (Mc O4)
```

Attempt ids such as `"a1"` above are illustrative. Real ids are opaque values from the run's seeded source, per tab
name and open count (`T:37-39`), so they are stable across replays and never repeat across reloads; a restored
Attempt keeps the id it was acknowledged with. Assertions compare ids with each other and with fixture truth, never
with a literal.

- **`ending` entries.** Every ending admitted is appended to the cut's evidence when its turn is admitted, in
  admission order, with:
  - `operation`, `key`, `attempt` (`undefined` for a declined start, a `NothingToResend` and a resource call value's
    ending), `channel` and `reason` (classified at settlement, after rule 18; rule 27);
  - `event`, the mapped event, and `route`, `"current"` or `"late"` (rule 14);
  - `declined`, in order, the denial reasons of the alternatives the ending's own turn passed over (2.5 steps 2
    and 3), so a late turn's `LateMayNotLeave` refusal (rule 15, `D:521-524`; `D:700-701`) is readable on the cut.

  `key` is the lane key (rule 21). It is the record's key only when merge 4's rule 34 applies: a domain write that
  predicts exactly one record and declares no `key` (`M4:614-616`). Several commit values, and several operations,
  can share one key, so a Story selects entries by `operation` and, where it matters, by `attempt.id`, never by key
  alone.

  It covers commit values and resource call values (`read.fetch`, `D:1251-1257`), whose `Defect` and `Interrupted`
  endings arrive on `failure` (rule 37, `M4:622-623`). The entry is written once, at admission, because earlier
  evidence never changes (`T:95`); before admission, the same ending is an `arrival` in `pending` (3.7).
- **Reasons.** `reason` is the value the mapper received: an author error, or one of Flow's reasons (`D:816-823`),
  for example `{ _tag: "Restored" }` on `unknown` after a reload mid-call, and
  `{ _tag: "NotSent", why: "Restored" }` on `failure` for an Attempt never acknowledged.
- **What is left out.** The owner activation and the ancestor a late route started from are not recorded (Q35):
  `route`, the resulting snapshot and the turn's trace event show where a late ending went.
- **Lanes on the snapshot.** **Revision (multiplicity audit, 2026-10-31).** A snapshot carries, under `calls`, one row per lane that exists, as of
  that publication: `{ key, pending, retryCount }` under `reject`, `latest` and `cancel`, `{ key, outstanding }` under
  `allow` and `serialize` (the design's rule 21). It carries nothing else: no Attempt, input or last ending (rule 21,
  D6), and no store state (`M4:699`). The rows are plain data, read by views, guards, `check()` and Stories alike, so
  "Reading an old snapshot never consults live lanes" (`Mc:166`) stays true. An evicted lane, and one never started,
  has no row (the design's D19). This amends Machines O8 (6.4).
- **`pending` lists work, never lanes** (Q29). It is computed from Flow's own state at the cut: armed schedules,
  Attempts with work outstanding, queued arrivals, resource and stream work, plus fixture sleeps that have begun. An
  Attempt is an `operation` entry from its start until settlement, with `attempt` and `phase`:
  - `"waiting"`: not yet heading every queue it joined: the actor's `serialize` or `latest` queue
    (`D:1218-1219`) or a record queue (rule 29, `M4:592-596`);
  - `"acknowledging"`: heading them, waiting for the Persistence O6 acknowledgement (`D:1324`, rule 38);
  - `"runnable"`: nothing blocks it, and its invocation has not run yet, as at a cut right after the `send` that
    started it (rule 4);
  - `"invoked"`: the commit is running.

  From settlement until admission the same Attempt is its ending's `arrival` entry (3.7). So the span of
  a lane row's `pending` (start until the ending's turn is admitted, rule 21) is covered by exactly one entry per
  Attempt at each moment, and `checkpoint.pending` can never disagree with the lane. A lane that keeps a failed or unknown Attempt with nothing
  outstanding (`D:559-560`) has no entry; its `retryCount` is read from the snapshot. Resource and stream work is
  listed as today (`T:84-85`), with `kind: "operation"` and no `attempt`. A fixture's sleep is listed once its fiber
  has begun it; before that, the work that will start it is listed by its Flow owner (a `runnable` Attempt).
- Every pending entry has a `kind`: `"schedule"`, `"operation"`, `"arrival"` (3.7) or `"fixture"` (3.7).

### 3.7 Time, deadlines, acknowledgement and tabs

```ts
// P1, the mailbox race: the clock runs like real time, so order decides
export const lateWrongCode = story
  .machine(SignIn, { id: "SignIn/late-wrong-code", fixtures: FakeAuth({ answerAt: "15005 millis", status: 401 }) })
  .send(E.PasswordAccepted({ challengeId: "c1" })).send(E.code.Changed({ value: "123456" })).send(E.Submit())
  .advance("15020 millis")     // 15.000: StopWaiting's turn leaves VERIFYING; 15.005: CodeWrong arrives late
  .checkpoint("struck")
// the CodeWrong ending entry has route "late"; struck.lives.challenges → [{ key: "c1", life: 1, frozen: false }]
// with run({ frames: "publication" }) the two turns are two frames, in that order

// cancel before invocation
export const cancelEarly = story.app(setup, {
  id: "Upload/cancel-before-send",                 // uploads is a persisted actor (Ps:124)
  fixtures: [FakeUploads({ tombstones: true }),
             Fixture.storage({ acknowledge: "50 millis" })],   // ← NEW: Attempt acknowledgements wait on the controlled clock
})
  .ensure(uploadRef).send(uploadRef, E.Pick())
  .advance("20 millis")                            // still acknowledging: phase "acknowledging", dueAt 50 ms
  .send(uploadRef, E.Cancel()).process()
  .checkpoint("cancelled")     // ending: NotSent { why: "Cancelled" }; truth.FakeUploads.files is empty

// a reload while the charge is really in flight
const slowStripe = FakeStripe({ answerAfter: "1 second" })
export const reloadMidCharge = story.app(setup, { id: "Checkout/reload", fixtures: slowStripe })   // checkout persists
  .ensure(checkoutRef).send(checkoutRef, E.Pay())
  .advance("200 millis")                           // acknowledged and invoked; the fake applies the charge at 1 s
  .closeTab("main")                                // the client's call is interrupted; the fake keeps going (rule 11)
  .openTab("main")
  .advance("5 seconds")                            // restore, the Restored ending, the machine's reconcile retry
  .checkpoint("restored")
// restored.evidence holds the first tab's entries too (tab "main", before the close), then the reopened tab's:
// an ending with channel "unknown", reason { _tag: "Restored" }, routed after readiness (D:1330), then the retry's
// success with the same attempt.id; truth.FakeStripe.requests holds that id twice, and charges is 1
```

- **`advance` runs like real time** (rule 9, Q7). It takes, in deadline order, every pending deadline at or before
  its target. At each one it moves the clock there and runs everything due at that instant as `process()` does,
  turns included, until no work is eligible, before it takes the next. It then moves the clock to the target and
  runs that instant too. Work takes no virtual time. So a chain of timers that re-arm through turns (a backoff,
  `DD-EM:202-207`) runs in one `advance`, as in production, and an `advance` followed by `process()` is never stale.
- **`advanceTo(t)`** is `advance` to that instant. **`advanceToNextTimer()`** moves to the earliest pending Flow
  schedule deadline (named, keyed or `.each`, not frozen), running every earlier deadline (fixture sleeps,
  acknowledgements) on the way as `advance` does; it does nothing when no schedule is armed, and stays at now when
  one is already due (`T:49`). A fixture's sleep is a deadline, but not a timer it stops at.
- Every controlled-clock sleep in the run is a pending deadline:
  - Flow schedules: named, keyed and `.each`, with `kind: "schedule"`;
  - Flow's own waits: a delayed acknowledgement is the `dueAt` of its Attempt's `operation` entry in phase
    `"acknowledging"`;
  - fixture sleeps, with `kind: "fixture"` and owner `fixture:<id>`.
- A frozen schedule is listed with `frozen: true`. A firing that was queued when its resumable trait froze is
  retracted (`D:372`): its arrival leaves `pending`, and it fires on return.
- **Queued arrivals.** An arrival whose turn has not been admitted is listed with `kind: "arrival"`, its mailbox
  `position`, its `event` tag and `from`: `"send"`, `"schedule"` (with the schedule's `path` and `key`), `"ending"` or
  `"context"`. A queued ending also carries `operation`, `key`, `attempt`, `channel` and `reason`, all known at
  settlement (rule 27). It has no `phase`: `kind: "arrival"` already says it is queued (Q34). Arrivals are seen at a
  cut right after `send` (the declined start's `NotSent`, queued behind its own turn) and in publication frames
  (a settlement before its ending's turn).
- A keyed schedule reads like `.each` copies (`D:80`): `s.schedules.<name>` is the list of armed keys in the order of
  the `keys` result, each `{ key, dueAt }`. So a key's deadline is `s.schedules.unlock[i].dueAt` (← NEW).
- `Fixture.storage({ acknowledge })` delays only the capture that acknowledges an Attempt (Persistence O6,
  `Ps:123-128`), each send included (P15, `D:2156`). That capture also holds the lane and the Attempt's predicted keys
  (rule 38, `M4:624-625`). Only persisted actors acknowledge (`Ps:124`). Bootstrap restore and every other capture or
  write complete without waiting, so `openTab` readies without moving the clock.
- `NotSent { why: "Cancelled" }` has three windows a Story can reach: a start waiting in an actor queue
  (`D:1219`), a predicting write waiting in a record queue (rule 29; no repair, `M4:426`), and a persisted actor's
  delayed acknowledgement.
- **Exact times.** A Story that scripts a fixture's timing knows its instants. A Story that only needs "the next
  thing" uses `advanceToNextTimer()`, or reads the deadline from `checkpoint.pending` (`dueAt`) and the snapshot's
  `s.schedules`, rather than repeating the machine's arithmetic.

### 3.8 Sends and verdicts

```ts
story.machine(Signup, { id: "Signup/invites" })
  .send(E.AddInvite())
  .send(E.invites.key("invite-2").Changed({ value: "grace@example.com" }))   // a copy's public event
  .send(E.RemoveInvite({ key: "invite-2" }))
  .send(E.invites.key("invite-2").Changed({ value: "x" }))                   // Unhandled: the row is gone
  .checkpoint("removed")
// run.frames[4].cause → { command: "send", event, verdict: "Unhandled" }   // ← NEW field: verdict; its own frame
// removed.evidence → [ …, { kind: "refused", seq: 9, tab: "main", event: "invites.Changed", key: "invite-2",
//                           verdict: "Unhandled" } ]                       // ← NEW kind
```

- `send` queues its event behind any arrivals already queued (FIFO, `D:653-654`). It runs every turn up to and
  including its own, in mailbox order, each followed by any pending-reset turn its commit queues (`D:390-391`).
  Then it stops. Operation work those turns start is listed as `runnable` and run by the next `process()`,
  `advance` or `.control` (rules 7, 9).
- A domain write's prediction and queue join publish in its starting turn (rule 28, `M4:589-591`), so they are in
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
test host with `story.machine` (3.1), where the host's own memory decides the verdict (rule 4, `D:410-412`). A
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
| **Pending resets** (3.4) | With `frames: "publication"` (`T:70-71`), the follow-up reset turn is its own frame, caused by its publication; the `reset` entry at that position names it, so the one-snapshot lag is visible while stepping. With the default per-command frames, the reset is inside the send's frame, because `send` runs it (rule 4). |
| **Lanes on the snapshot** (rule 8) | Required by playback: `StoryFrame` eligibility uses production `check()` (`T:107-108`), and `pay.idle(key)` reads lanes. The frame's snapshot carries its own `pending` and `retryCount` (Machines O8 amendment), so buttons render disabled while a write is in flight, and no live lane is read. Inspect lists each Attempt with outstanding work under pending, by `phase`. |
| **`ending` and `refused` evidence** (3.6, 3.8) | Inspect shows the cut's evidence up to the frame, so the endings admitted so far, current or late, with `declined` (a `LateMayNotLeave` refusal is visible), and refused sends. These are cut records, not trace events, so they stay available beyond the trace window. "Evidence unavailable" (`T:215-216`) still applies to the trace view only. |
| **`checkpoint.calls`, `checkpoint.lives`** (3.3, 3.4) | Inspect shows them for the frame. They are retained with the cut, so they never show "evidence unavailable". The rendered UI shows only what views read; lives never appear in view types (rule 6). |
| **`checkpoint.truth`** (3.5) | Inspect shows each fixture's truth at the frame, raw (`PB:170-173`): render only non-sensitive fixture data when sharing. Truth is per run, not per tab, so it is shown once for the frame, not under `tabs.<name>`. |
| **Fixture controls** (3.5) | A `.control` command makes one frame whose cause is the command. It has no UI control, so the next-action highlight skips it, as it skips `advance`. |
| **Clock rules** (rule 9) | An `advance` makes one frame by default, after every instant it passed has run; under `frames: "publication"` each turn and settlement inside it is its own frame, in order, each with its own `now`. That is how the overlay shows a mailbox race and a backoff chain. Scrubbing is a lookup (`T:211-212`), so the clock is never moved while watching; `minDwell` gives frames that share `now` screen time (`PB:159-161`). |
| **Records around a write** (3.12, rule 16) | `StoryFrame` renders records from the frame's store revision (`T:78`), as views read them. The frame after a domain write's start shows the prediction and "Saving…" together (rule 28). Under `frames: "publication"`, the settlement frame shows the confirmed fields with "Saving…" still on: a real moment (`M4:94-95`), not a rendering glitch. `predicted`, `uncertain` and `unconfirmed` styles render from the frame; nothing is re-read live. |
| **Run-scoped fixtures and tabs** (rule 11) | `StoryFrame tab` selects a tab's cut (`T:108`). Between `closeTab` and `openTab`, the frame has no cut for that tab: `StoryFrame` renders nothing for it and records a frame-level tab gap, `TabClosed`. It is not an actor gap (`T:102-104`). After `openTab`, the restored tab renders as any tab does. The fixture's truth is the same before and after, because it belongs to the run. |
| **Frame weight** (rule 14) | A frame holds a position into the run log, not a copy of cumulative records; unchanged snapshots, lives and truth keep identity (`PB:79-81`). A long Story does not grow quadratically. |
| **Fragment Stories** (3.2) | Not playable (above). Playback's own open question (`PB:195-197`) would let a focused Story's actor stand in for a component's actor. This proposal does not extend that to fragments: rendering a fragment would need a component bound to a harness slice, and that is a new rule. |
| **Harness commands** (`.enter`, `.leave`) | Only fragment Stories have them, and those are not playable. |

### 3.12 Entity domains (merge 4)

```ts
// issues.story.ts: one like on merge 4's list (M4:107-300), seen at each publication
const server = FakeIssues({ writeAnswerAfter: "300 millis" })   // a Fixture.stateful; reads answer at once
export const liked = story
  .machine(ListMachine, { id: "Issues/like", input: { projectId: "p1" }, fixtures: server })
  .process()                                               // the list loads
  .send(E.Toggle({ id: "i1", liked: true }))               // rule 28: the prediction publishes with this turn
  .advance("300 millis")                                   // the fake answers; settlement, then Settled's turn
  .checkpoint("handled")

// the test: frames are cuts, so the checkpoint reads take them (rule 14)
const run = await liked.run({ frames: "publication" })
const moments = run.frames.map((f) => ({
  liked: Entity.get(f, { id: "i1" }, Issue.pick("liked")),  // existing read (T:86-89), merge 4's names
  saving: f.snapshot.calls.Issues.setLike.find((l) => l.key.id === "i1")?.pending ?? false,   // Revision (multiplicity audit, 2026-10-31): lane rows (3.14)
}))
// …, { liked: { data: { liked: true }, predicted: true,  … }, saving: true }    the Toggle turn (rule 28)
//    { liked: { data: { liked: true }, predicted: false, … }, saving: true }    settlement: the response carries `liked`
//    { liked: { data: { liked: true }, predicted: false, … }, saving: false }   Settled's turn: the lane is free
run.checkpoints.handled.truth.FakeIssues.issues.i1.liked   // → true: server truth, not the store
```

```ts
// two actors in one Runtime write issue i1; the fake holds the first answer until released
export const queued = story.app(setup, { id: "Issues/queue", fixtures: server })
  .ensure(editorRef).ensure(listRef).process()
  .control(server.hold({}))                                       // a control (3.5)
  .send(editorRef, E.Rename({ id: "i1", title: "New" }))          // R heads i1's queue
  .send(listRef, E.Toggle({ id: "i1", liked: true }))             // A joins behind R (rule 29)
  .process()                                                      // R is invoked and held
  .checkpoint("queued")
  .control(server.release({})).process()
  .checkpoint("drained")
// Entity.queue(run.checkpoints.queued, { id: "i1" })        → R's Attempt, then A's   (existing read, T:87, EP:138)
// run.checkpoints.queued.pending: R in phase "invoked", A in phase "waiting"
```

- **Reads.** A Story reads the store only through the existing checkpoint reads (`T:85-91`, `EP:135-139`), at a
  checkpoint or any frame:
  - `Entity.get(cut, key, shape)` returns `undefined` for an absent record, otherwise
    `{ data, predicted, uncertain, unconfirmed }`, merge 4's names (`M4:570-574`), with field meanings from
    EntityDomains O2. (Revision (multiplicity audit, 2026-10-31): what it returns for a tombstoned record, `undefined` per EntityDomains O2 or the
    typed `Deleted` of O1, is open for the owner; [audit-multiplicity.md](../audit-multiplicity.md) F11 recommends
    `Deleted` while the tombstone lives.) `uncertain` is true while any mark on the record remains (rule 32, `M4:608-610`). Which
    Attempt holds a mark is not a view fact; a Story checks rule 32 by its effect, as a view would: two unknowns,
    one retry succeeds, the record still reads `uncertain`.
  - `Entity.queue(cut, key)` returns the record queue's members at the cut, in order, each with its Attempt as
    `{ id, retryCount }` (Revision (multiplicity audit, 2026-10-31)): a member is one send, because a retry joins the tail while its own first send
    can still hold the queue for its forced repair (rules 30, 31), so one id can be two members. A member joins its
    `pending` entry and its `ending` entry by id and `retryCount`. A removed write (`Superseded`,
    `Cancelled`) is no longer a member; its removal is read from its `ending` entry, whose reason is
    `{ _tag: "NotSent", why }`. An `Overloaded` start never joined (rule 35).
  - `Domain.entry.get(cut, input)` returns the answer's rows; a draft (rule 33) is memory, read from the snapshot.
- **Moments.** The three moments of a domain write are three publications, so three frames under
  `frames: "publication"`:
  - the starting turn: prediction and queue join, and the lane `pending` (rule 28);
  - settlement: the store's effect per rule 30 and the queue released, the ending an `arrival`, the lane still
    `pending` (rule 27). After a success, the fields the response carries are confirmed (`predicted` false); fields
    it omits stay `predicted` until a confirming read lands (`EP:92-100`), which may be a later frame of the same
    instant or a later instant;
  - the ending's turn: the `ending` entry, and the lane updated.

  After an unknown, the settlement frame shows the predictions kept and `uncertain` true; the frame where the forced
  repair lands shows server state, still `uncertain` (rule 30, `M4:479-484`). With the default per-command frames,
  an `advance` that passes these moments ends after all of them, so a Story that must see one uses
  `frames: "publication"`.
- **Server truth and client truth** (G12). `checkpoint.truth` is the server's, per run and shared by tabs (rule 11).
  The store is the client's, one per tab's Runtime: `Entity.get(checkpoint.tabs.other, key, shape)` reads another
  tab (`T:169-170`). Truth reaches a store only through real responses and pushes; a fixture cannot write the store,
  and no read compares them for the author. A Story asserts both sides when it means "the client shows what the
  server holds".
- **`propertyTest`** (G13). Its fixture is a `Fixture.stateful`, and that truth is the oracle (`T:134`,
  `EP:163-164`). Its checks at every publication (`T:150`, `EP:164-169`) read the same frames as
  `frames: "publication"`, through the same reads. Each generated fault (`T:143-146`) becomes a Story command when a
  failure shrinks to a static Story (`T:159-160`, `EP:170`):

  | Fault | In the emitted Story |
  | --- | --- |
  | hold, release, fail, delay, reorder, duplicate or lose responses | the fake server's controls (3.5) |
  | change server truth and push; disconnect and reconnect | the fake server's controls |
  | crash and restore | `closeTab` and `openTab` (`T:166-169`) |
  | adopt a supplied domain | lazy `ensure` at the step (`T:186-188`) |
  | change subscriptions; invalidate | not fixed here: probe subscriptions are `propertyTest`'s own (`T:131`), and their literal encoding is Testing's deferred "Property control identifiers and literal encoding" (`T:243`) |

  Fixture sleeps are pending deadlines (rule 9), so an oracle fixture that sleeps with nothing to deliver keeps a run
  from quietness, which `propertyTest` reports as Inconclusive (`T:142-143`), never as a pass.
- **Producing `Overloaded` and queue order** (G14). Both come from fixtures and sends alone:
  - a fixture that holds the head's answer keeps the head invoked; sends of a write under `allow` (or one per actor)
    then fill the record queue, and the start past its bound (64 waiting writes, `EP:179-182`) ends
    `NotSent { why: "Overloaded" }` with no prediction and no join (rule 35). The Story is built at construction, for
    example with `Array.from` over sends, which is plain code producing a static plan (`T:16-17`);
  - two actors in one Runtime writing one record give FIFO order across actors (`EP:112-116`); a dropped answer
    (unknown) with a slow repair read shows the queue held until the forced repair settles (rule 30).

  Tabs do not share a queue: each tab is its own Runtime with its own store (`T:166-167`).

### 3.13 Traps, and how each is closed

| Trap | Closed by |
| --- | --- |
| A checkpoint right after `send` or `.control`, before `process()` | Designed out where it was silent: `pending` lists the work still outstanding (`runnable` Attempts, queued arrivals), so the cut says it is not quiet. A checkpoint captures without processing by design (`T:75`). |
| A checkpoint after `advance` that misses a reaction | Designed out: `advance` runs every instant's turns (rule 9). |
| `checkpoint.pending` confused with a record's `predicted` or a lane's `pending` | Three different reads in three places: `checkpoint.pending` is the cut's work list; `predicted` is a field of `Entity.get`'s result; `snapshot.calls.<operation>[i].pending` is the lane. Merge 4's E16 removed the fourth (`M4:570-574`). |
| Server truth checked by a count | Documented: compare `attempt.id`s from `ending` entries with the keys the fake recorded (3.5). |
| `.find` on endings by key | Documented: several operations and commit values share a lane key; select by `operation`, then by `attempt.id` (3.6). |
| A hazard visible only between publications | Documented: "it never shows" is asserted over `run({ frames: "publication" }).frames` with the frame reads (rule 14); a checkpoint or a per-command frame can miss it. |
| Literal Attempt ids | Documented: ids are opaque; compare them with each other (3.6). |
| `calls` read as one life's | Documented: they are cumulative across lives; filter by `life` (3.3). |

```ts
// "a created issue never shows twice": over every publication, not at checkpoints
const run = await created.run({ frames: "publication" })
for (const f of run.frames) {
  const rows = Issues.list.get(f, { projectId: "p1" })?.data?.issues ?? []        // Domain.entry.get on a frame
  const drafts = shownDrafts(f.snapshot.memory.creating, rows)                       // the view's own filter
  expect(drafts.filter((d) => rows.some((r) => r.id === d.id))).toEqual([])
}
```

### 3.14 Reaching a lane from a Story

**Revision (multiplicity audit, 2026-10-31); Q40 settled.** A Story and a view read lanes where every other fact about the actor lives: on the
snapshot. `s.calls.<operation path>` holds one row per lane that exists, beside `s.activities` (the design's rule 21,
decision D18). No commit value leaves the machine body, so a commit value's select stays typed where it is listed
(`D:1040-1043`).

```ts
// list.story.test.ts and the view read the same rows; nothing is exported from list.machine.ts
run.checkpoints.handled.snapshot.calls.Issues.setLike
// → [{ key: { id: "i1" }, pending: false, retryCount: 0 }]       or [] once the lane is evicted
useView(list, (s) => s.calls.Issues.setLike.find((l) => l.key.id === id)?.pending ?? false)
```

- A read of an actor that does not declare the operation is a type error: `calls` is typed by the snapshot's own
  definition (option B's silent wrong-actor read cannot be written).
- A lane that was never started, or was evicted, has no row (the design's D19), so a wrongly keyed read finds nothing
  instead of a lane that looks idle.
- `check()` on a frame reads that frame's rows (`T:107-108`), so `StoryFrame` eligibility and the view agree.
- Under `allow` and `serialize` a row is `{ key, outstanding }`: no `retryCount`, because no one Attempt is the
  lane's (the design's rule N2). A Story that needs one call's status keys the call per call.

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
   - Harness states and events never appear in reads, causes or denial reasons.
3. **Lifetime alone.**
   - The harness root has two child states, `IN` and `OUT`. The subject is placed in `IN`. A fragment Story's
     snapshot is the subject's slice.
   - A trait Story starts in `IN`; a subroutine Story starts in `OUT`.
   - `.leave()` moves to `OUT`, and `.enter(input?)` moves to `IN`. Freezing, resuming, ending and new lives follow
     design rule 1 (`D:364-401`) exactly as in a host. A subroutine's `.leave()` abandons it as a host transition
     would.
   - `.leave()` in `OUT`, or `.enter` in `IN`, rejects with `InvalidStoryCommand` when that command is reached.
     Later commands do not run, and evidence up to it survives, as with `StoryTurnLimit` (`T:44-46`).
4. **Sends.**
   - `send` accepts public events at any instance path, including keyed copies and subroutine events.
   - A fragment Story's `send` also accepts its subject's `hostEvents`.
   - Internal events and exits are never sendable (rule 2, `D:407-408`; `D:2076`).
   - `send` queues its event behind arrivals already queued. It runs every turn up to and including its own, each
     followed by the pending-reset turn its commit queues (`D:390-391`, `D:727-728`). Nothing else runs until
     `process()`, `advance` or `.control`.
   - A send's verdict (`"Allowed"`, `{ Denied: reasons }` or `"Unhandled"`) is part of its frame's `cause`. A Denied
     or Unhandled send also appends a `refused` entry to the cut's evidence.
5. **Calls.**
   - Every callback notification, `whenAbandoned` notification and exit is recorded as
     `{ payload, life, key?, turn, by }` under `checkpoint.calls.<instance path>.<port>`.
   - Records are cumulative per cut, across lives, and retained with it.
   - Alone, the path starts at the subject; in a host, at the actor's root.
   - On a subroutine Story, `checkpoint.exit` is the last `by: "exit"` record of the current or last life, with
     `exit` set to the exit's name, or `undefined` while it runs or after `.leave()`.
6. **Lives.**
   - `checkpoint.lives` mirrors the snapshot's slice tree. Each entry is `{ life, frozen }`, plus `key` for copies.
     It is present exactly when the snapshot's slice is.
   - Life numbers are deterministic and appear in no snapshot or view type.
   - The fragment evidence kinds of 3.4 are entries of the cut's evidence. `droppedDelivery` never covers a call
     ending.
7. **Fixture truth and controls.**
   - A `Fixture.stateful` declares `id`, a `truth` Schema whose constructor default is the starting truth, an
     optional `controls` record of Schemas, and a `layer` built from the truth `Ref` and one `Queue` per control.
   - Every cut captures each declared truth by `id`. Duplicate ids reject before acquisition, as duplicate Tags do
     (`T:57-58`).
   - `.control(fixture.name(payload))` offers a control's payload, then runs non-turn work until no fiber in the run
     is runnable, before the next command. Arrivals it causes are queued; no turn runs. It is a type error for a
     fixture the Story does not declare.
   - Checkpoints take no predicate. Plain Layers remain valid fixtures.
8. **Endings, lanes and work.**
   - Every ending admitted, of a commit value or a resource call value, appends one `ending` entry to the cut's
     evidence, in admission order, with `operation`, `key` (the lane key), `attempt` (or `undefined`), `channel`,
     `reason`, `event`, `route` and `declined`, and (Revision (multiplicity audit, 2026-10-31)) `copy: { path, key }`
     for an Attempt started in a `.each` copy. Channel and reason are the Attempt's ending decided at settlement
     (rule 27).
   - `checkpoint.pending` is computed from Flow's state at the cut. It lists an Attempt as an `operation` entry, with
     `attempt` and `phase` (`"waiting"`, `"acknowledging"`, `"runnable"` or `"invoked"`), from its start until
     settlement, and its ending as an `arrival` from settlement until admission. A lane is never a pending entry.
   - (Revision (multiplicity audit, 2026-10-31)) A snapshot carries, under `calls`, one row per lane that exists: `{ key, pending, retryCount }`, or
     `{ key, outstanding }` under `allow` and `serialize` (the design's rule 21). It is plain data, read by views,
     guards, `check()` and Stories. Reading a snapshot never consults live lanes.
9. **Clock.**
   - Every controlled-clock sleep is a pending deadline.
   - `advance(d)` and `advanceTo(t)` take every pending deadline up to the target in deadline order; at each one
     they move the clock there and run everything due at that instant as `process()` does, turns included, before
     taking the next; then they move to the target and run that instant. Work takes no virtual time. The turn limit
     (`T:45`) counts per command.
   - `advanceToNextTimer()` does the same up to the earliest Flow schedule deadline that is not frozen; it stays at
     now when one is already due, and does nothing when none is armed.
   - Equal deadlines are ordered by:
     - actor admission order, then outermost state, then declaration order (`Mc:119-120`);
     - then `.each` list order (`D:472`);
     - then key-list order for keyed schedules;
     - then, for anything still tied, owner kind (actor schedules, then Flow's own waits, then fixture sleeps), then
       the order in which the sleeps began.
   - A frozen deadline is listed with `frozen: true` and is never due.
   - A queued arrival whose turn has not been admitted is listed in `pending` with `kind: "arrival"`, its mailbox
     `position`, `event` and `from`; a queued ending also carries `operation`, `key`, `attempt`, `channel` and
     `reason`. A retracted firing leaves `pending`.
   - A keyed schedule's snapshot entry is a list in `keys` order, each `{ key, dueAt }`.
10. **Storage.**
    - `Fixture.storage({ acknowledge?, seed? })` is the storage fixture: it provides the fresh in-memory
      KeyValueStore, and `seed` is Testing's storage-fixture seeding (`T:66-67`), its only form.
    - Only the capture that acknowledges an Attempt (Persistence O6; rule 38) waits `acknowledge` on the controlled
      clock, and only persisted actors make one. Restore and other writes do not wait.
    - It can neither bypass validation nor open external storage (`T:64-67`).
11. **Scope.**
    - Fixtures are acquired once per run, before any tab's Runtime, in the run's scope, and shared by every tab.
      Work a fixture forks runs in that scope, so closing a tab never interrupts the fake server.
    - A fixture may depend only on other fixtures of the Story and on run-level services (the controlled Clock, the
      seeded random source, the run's Scope). It may shadow setup services. A fixture that requires a setup service
      is a type error, and rejects before acquisition for untyped callers.
    - A fake server that a setup builds as one of its services is provided to Stories as a stateful fixture that
      shadows it, and the API built on it, so every tab of a run meets one server.
    - Other setup services, and each tab's store, are per tab's Runtime.
    - `Restored` endings are produced only by App Stories, through `closeTab` and `openTab`.
12. **Discovery.**
    - `defineConfig({ apps, stories })` discovers App-free Stories.
    - Ids are unique across the whole configuration.
    - A machine in `stories` needs only its own services. Fixtures provide them.
    - The trace of an App-free Story has no App identity: `appId` and `appFingerprint` are `null`.
13. **Snapshot types.** A checkpoint's snapshot is typed with `Flow.private` fields.
14. **Frames and playback.**
    - Every read that takes a checkpoint takes any frame: `snapshot`, `actor(ref)`, `tabs.<name>`, `calls`, `lives`,
      `evidence`, `truth`, `pending`, `now`, and `Entity.get`, `Entity.queue`, `Domain.entry.get` and
      `descriptor.get` over it.
    - A frame has one `cause`: its command, with the event and verdict for a send, and under `frames: "publication"`
      also its publication: a turn (with its event) or a settlement (with its operation and Attempt).
    - Consecutive identical frames collapse only within one command. Under the default and `"publication"` modes
      every command records at least one frame, a command that publishes nothing included.
    - A cut's cumulative records (`evidence`, `calls`) are the run log's prefix up to the cut: a frame holds its
      position, never a copy. The run log is per run: a closed tab's entries stay, each naming its `tab`. Unchanged
      snapshots, lives and encoded truth keep identity across frames.
    - `StoryPlayer` and `definePresentation` accept `StoryRun<"app" | "machine">` and their Stories only. A fragment
      Story is a type error there.
    - The next-action comparison matches the event's tag, instance path and key. `advance` and `.control` commands
      have no control to highlight.
    - `StoryFrame tab` for a tab absent from the frame renders nothing and records the frame-level gap `TabClosed`.
    - Inspect shows the frame's cut records (`calls`, `lives`, `evidence`, `truth`, `pending`) beside the trace view.
15. **Port names.** A contract's callback and exit names are unique (D2). Declaring one name as both is a type error
    where the contract's types can show it, and a `flow check` construction error otherwise (`D:490-495`).
16. **Entity domains.**
    - A Story reads records, queues and answers only through `Entity.get`, `Entity.queue` and `Domain.entry.get` at a
      checkpoint or frame. `Entity.get` returns `{ data, predicted, uncertain, unconfirmed }`. `Entity.queue` lists
      the members at the cut, each one send, with its Attempt's `{ id, retryCount }` (Revision (multiplicity audit, 2026-10-31)); a removal is read
      from the write's `ending` entry.
    - A domain write's start, settlement and admission are separate publications: the starting turn holds its
      prediction and queue join (rule 28); settlement publishes the store's effect, with the fields the response
      carries confirmed and omitted ones still predicted, before its ending's turn (rule 27). Each is a frame under
      `frames: "publication"`.
    - Server truth is the fixture's, per run; client truth is each tab's store. A fixture never writes the store.
    - `propertyTest`'s fixture is a `Fixture.stateful`; every fault its fake server makes is one of its controls, and
      its checks use the same reads over the same frames.
17. **Lanes are read from the snapshot** (Revision (multiplicity audit, 2026-10-31); Q40). A Story reads a lane as `checkpoint.snapshot.calls.<operation
    path>`, as a view reads `s.calls`; commit values are not exported and definitions expose no `O`.

## 5. How it is implemented

On the one production Runtime. Nothing predicts and nothing runs twice.

- **Fragment Stories** wrap the subject in a generated harness machine. Its root has two child states, `IN` and
  `OUT`. A trait is placed on `IN`'s node with `Flow.state({ traits })` (`D:343-346`); a subroutine is the state `IN`.
  `.enter` and `.leave` send harness events that move between them, so leaving `IN` freezes or ends a trait exactly
  as leaving a host node does. The harness fills ports with fixed verdicts and recorders. The Runtime, turn
  algorithm and evidence are the production ones, and harness states and events are hidden from snapshot paths,
  calls, lives, frame causes and denial reasons.
- **Calls, lives, endings with route and declined reasons, and fragment evidence** need **new Inspection O4 event
  kinds or fields**: the kinds Inspection lists today (`In:85-90`) have none of them. Refused sends are already send
  and admission evidence (`Mc:80`, `In:86`). The design's Inspection O1 row (`D:2118`) makes fragments, copies and
  incarnations appear in `inspect`, not in the trace. The Runtime emits the new kinds.
- **The run log.** The Story collector appends every cumulative record (calls, the evidence kinds of 3.4, `ending`,
  `refused`, repairs, skips and diagnostics), from every tab, to one append-only log per run in evidence order. Each
  frame stores its length. `checkpoint.evidence` and `checkpoint.calls` are typed views of that prefix, so the trace
  window does not bound them and frames do not copy them (`T:73-74`).
- **Lanes on snapshots** are published with the turn: each publication copies the `pending` and `retryCount` of every
  lane not evicted. Unchanged lanes keep identity (`Mc:166-167`, `PB:79-81`).
- **Truth capture** reads each stateful fixture's `Ref` with `Ref.get` at the cut, encodes it with its Schema, and
  keeps the previous value's identity when the encoding is equal. **Controls** are one `Queue` per declared control,
  created with the fixture; `.control` offers, then yields until no fiber in the run is runnable.
- **The clock** is Effect's TestClock, with an ordered wake list in front of it that applies rule 9's tiebreaks.
  `advance` steps deadline by deadline; at each step it sets the clock and runs the same drain loop as `process()`
  (fibers until none is runnable, then admit and run queued turns, then fibers again, until nothing is eligible).
  Settlement runs in merge 4's watcher fiber (`M4:638-641`) inside that drain, publishing the store revision before
  queuing the ending.
- **Store reads** read the cut's one store revision (`T:78`); they run no adapter and touch no live state
  (`EP:138-139`). `check()` never predicts (`M4:629-630`), so a frame's eligibility is pure.
- **Playback** needs no new execution. The new records are fields of frames, which `StoryFrame` and the overlay
  already receive. Collapse compares frames only within one command.
- **Run-scoped fixtures** are built in the run's scope, before any tab's Runtime, from run-level services and other
  fixtures only (rule 11). Each tab's setup is provided with the fixture Layer's output, which shadows the setup's
  own services of the same Tags.
- **Lane rows** (Revision (multiplicity audit, 2026-10-31)) are the snapshot's `calls`, published with each turn (above); nothing else is
  exposed.

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
| `checkpoint.evidence` | cut read | the name of the cut's cumulative evidence (`T:93`), entries with `kind`, `seq` and `tab` (3.4) |
| `listRepair`, `droppedDelivery`, `droppedRaise`, `reset` | evidence kinds | 3.4 |
| `ending` | evidence kind | every admitted ending, with `route` and `declined` (rule 8) |
| `refused` | evidence kind | a Denied or Unhandled send (rule 4) |
| Lanes on snapshots: `s.calls.<operation path>`, rows `{ key, pending, retryCount }` or `{ key, outstanding }` | snapshot member | plain data, read by views, guards, `check()` and Stories (rule 8; Revision (multiplicity audit, 2026-10-31)) |
| `kind` on every `pending` entry; `attempt` and `phase` on an Attempt's `operation` entry | pending entry | rule 8 |
| `kind: "arrival"`, `position`, `event`, `from`; a queued ending's `operation`, `key`, `attempt`, `channel`, `reason` | pending entry | a queued arrival not yet admitted (rule 9) |
| `frozen`, `kind: "fixture"` with owner `fixture:<id>` | pending entry fields | rule 9 |
| `s.schedules.<name>[i]`, each `{ key, dueAt }` | snapshot path | a keyed schedule's deadlines (rule 9) |
| `Fixture.stateful({ id, truth, controls?, layer })` | fixture constructor | rule 7 |
| `.control(fixture.name(payload))` | command | offers a fixture control's payload and runs its reaction to idle (rule 7) |
| `checkpoint.truth.<id>` | cut read | captured truth |
| `Fixture.storage({ acknowledge?, seed? })` | fixture constructor | rule 10 |
| `defineConfig({ stories })` | configuration | rule 12 |
| `verdict` on a send's `cause`; a publication frame's turn or settlement | frame fields | rules 4 and 14 |
| Frame reads | reads | every checkpoint read takes any frame (rule 14) |
| `TabClosed` | frame-level gap | rule 14 |
| `InvalidStoryCommand` | rejection code | an `.enter` or `.leave` that does not fit the harness state, at the command (rule 3) |
| New Inspection O4 event kinds or fields | trace | calls, lives, fragment evidence, endings with route and declined (section 5) |

### 6.2 Changed

| Changed | Before | Now |
| --- | --- | --- |
| Testing a fragment alone | `story.machine(fragment, { id })` (`D:486`, `D:2117`) | `story.trait` / `story.subroutine` |
| Recorded notifications | `run.calls.<callback>` per run (`D:487`) | `checkpoint.calls`, per cut, in every Story kind |
| Checking server truth | `.checkpoint(name, ({ truth }) => …)` (`D:1310`, C16 `D:2151`) | `.checkpoint(name)` and `checkpoint.truth` |
| What `send` runs | unstated (`T:22-29`); "runs its turn" (`D:2117`); the whole mailbox (`SF:458`) | the queued turns ahead of it, its own turn, and their pending-reset follow-ups (rule 4) |
| What `advance` runs | "make work eligible without draining it" (`T:50-51`) | each instant's work, turns included, in deadline order, as real time would (rule 9) |
| What `advanceToNextTimer` targets | "the earliest pending deadline" (`T:49`) | the earliest Flow schedule deadline, running earlier deadlines on the way (rule 9) |
| Transaction lanes | "Transactions have outcomes, never lanes" (`Op:162`) | lanes per rule 21, plain data on snapshots as `calls` (Revision (multiplicity audit, 2026-10-31)) |
| Pending work | "owners, operations or schedules, attempts where applicable, and deadlines" (`T:84-85`) | each entry with a `kind`; an Attempt's `phase`; queued arrivals; fixture sleeps; frozen schedules |
| The snapshot | state, memory, context, issues, lifecycle, activities (`Mc:162-166`) | the same, plus each lane's `pending` and `retryCount` |
| Frame collapse | "Consecutive identical frames collapse into one" (`T:71-72`) | only within one command; every command keeps a frame (rule 14) |
| Frame reads | checkpoint reads on checkpoints (`T:82-91`) | the same reads on any frame |
| Cumulative evidence | repairs, skips and diagnostics (`T:93`) | one run log, also holding calls, fragment kinds, `ending` and `refused`, from every tab |
| The record read | `{ data, pending, uncertain, unconfirmed }` (`T:88`) | `{ data, predicted, uncertain, unconfirmed }` (merge 4's E16, `M4:570-574`) |
| Fixture scope and dependencies | per run, unstated across tabs; may depend on setup services (`T:57`, `T:63`, `T:166-172`) | per run, shared by tabs; may depend only on fixtures and run-level services; a setup's fake server becomes a fixture |
| Story storage | fresh in-memory store, seeding only (`T:64-67`) | the same store, with optional clock-driven Attempt acknowledgement |
| Story id scope | unique within its App (`T:12-13`) | unique across the configuration |
| Keyed schedule reads | unspecified (`D:75-81`, `D:1262-1276`) | `s.schedules.<name>[i]`, `{ key, dueAt }`, in `keys` order |

### 6.3 Removed

| Removed | Was | Why |
| --- | --- | --- |
| `story.machine` for fragments | `D:486`, `D:2117` | a fragment is not an actor; options and discovery do not fit (G6) |
| `run.calls` | `D:487` | replaced by `checkpoint.calls`, which also works in a host |
| The checkpoint predicate | `D:1310`, `D:2054`, C16 `D:2151` | a callback in a plan (`T:17-18`) |
| `ackDelayMs`, `advanceHeld` | spike only (`SF:239`, `SF:462`) | replaced by `Fixture.storage` and rule 9 |

Earlier revisions' additions withdrawn by section 10: `causes` (Q31), the `"pendingReset"` cause (Q33),
`checkpoint.endings` (Q29), `owner` and `from` (Q35), lane entries in `pending` with `phase: "settled"` and `waiting`
(Q29, Q22), `phase: "queued"` on arrivals (Q34), the `.guards()` command (Q32), and revision 2's "`advance` admits no
turn" (Q7).

### 6.4 Amendments by target document

The design's `merged/` records are not amended: the design wins over them (`D:3-5`), so every server-call amendment
targets the design. Merge 4 is accepted but not yet merged; the row marked **merge 4** corrects its text, to be applied
when both merge. Three errata were applied directly on 2026-10-30, outside this table: `D:1308` scripts 429;
`M4:391` says "another actor's rename"; `M4:375` keeps omitted fields predicted.

| Target | Amendment |
| --- | --- |
| **Testing O1** (`T:8-35`) | four constructors (rule 1); fragment Story options; rules 2–4; `send` at instance paths, keyed copies and subroutine events; host-event sends in fragment Stories only; the send rule of rule 4; "Both Story kinds" (`T:22`) becomes "Every Story kind"; `.control` (rule 7); `defineConfig({ stories })` (rule 12); "unique within its App" (`T:12-13`) becomes "unique across the configuration"; `StoryRun<Kind>` |
| **Testing O2** (`T:36-52`) | "These commands make work eligible without draining it; process() applies the due work" (`T:50-51`) becomes "advance and advanceTo run, deadline by deadline, everything due at each instant as process() does, turns included; work takes no virtual time"; `advanceToNextTimer` targets the earliest Flow schedule deadline that is not frozen (`T:49`); every controlled-clock sleep is a deadline; equal-deadline tiebreaks, including the final one; the turn limit counts per command (`T:45`) |
| **Testing O3** (`T:53-67`) | "Fixtures may depend on setup services and shadow those services" (`T:57`) becomes "Fixtures are run-scoped and shared by every tab. A fixture may depend on other fixtures and run-level services (the controlled Clock, the seeded random source, the run's Scope) and may shadow setup services; a fixture that requires a setup service is a type error. A fake server that a setup builds is provided to Stories as a stateful fixture"; "Every run has fresh scoped providers and server truth" (`T:63`) gains "server truth is one per run, across tabs"; `Fixture.stateful` with Schema truth and controls (rule 7); plain Layers stay; `Fixture.storage` is the storage fixture (rule 10); "Stateful fixtures … update that truth before emitting pushes" (`T:63-64`) gains "pushes and faults are controls" |
| **Testing O4** (`T:68-99`) | `checkpoint.calls`, `checkpoint.lives`, `checkpoint.truth`; `checkpoint.evidence` names the cumulative list (`T:93`), which gains the fragment kinds, `ending` and `refused`, is per run across tabs, and is one run log a frame points into (`T:73-74` applied); every checkpoint read takes any frame; `kind` on every pending entry, `attempt` and `phase` on an Attempt's entry, queued arrivals and `frozen`; collapse only within a command, and every command keeps a frame (`T:71-72`); `verdict` on a send's cause, and a publication frame's turn or settlement; owner-typed snapshots (rule 13) |
| **Testing O4, record read** (`T:88`) | `{ data, pending, uncertain, unconfirmed }` becomes `{ data, predicted, uncertain, unconfirmed }`. Merge 4 renames the field (E16) and amends `EP:130` (`M4:734`) but lists no Testing row (`M4:688-748`); this row closes that. `Entity.queue` members carry their Attempt id (rule 16) |
| **Testing O4, StoryFrame** (`T:100-109`) | eligibility reads lanes on the frame's snapshot; `tab` for a tab absent from the frame renders nothing, with the frame-level gap `TabClosed` beside the actor gaps (`T:102-104`) |
| **Testing O6** (`T:129-160`) | the fixture is a `Fixture.stateful`, whose truth is the oracle, the same concept as `checkpoint.truth`; the fake server's faults (hold, release, fail, delay, reorder, duplicate, lose, truth change and push, disconnect, reconnect, `T:143-145`) are its controls, crash and restore are `closeTab`/`openTab`, adoption is lazy `ensure`; subscription and invalidate faults stay under `T:243`; publication checks use the frame reads of rule 14 |
| **Testing O7** (`T:166-172`) | "Tabs share nothing else" gains "except the run's fixtures"; `Restored` endings are App-Story-only; each tab has its own store, so record queues are per tab; closing a tab keeps its evidence |
| **Testing O9** (`T:208-223`) | `StoryPlayer` and `definePresentation` take `StoryRun<"app" \| "machine">` only; stepping by command uses the per-command frames of rule 14; the next-action highlight matches instance path and key and skips `advance` and `.control`; Inspect shows the frame's cut records, which never show "evidence unavailable" |
| **playback.md** (`PB:58`, `PB:79-82`, `PB:97-108`, `PB:131-136`) | explanatory text follows the Testing O4 and O9 rows (the plan wins, `PB:3-4`): collapse within a command, frames pointing into the run log |
| **EntityDomains O2** (`EP:134-146`) | the cut's reads are rule 16's, on checkpoints and frames: `Entity.get` with merge 4's names; `Entity.queue` members with their Attempt ids; the cumulative evidence of `EP:141-142` is the same `checkpoint.evidence` |
| **EntityDomains O4** (`EP:159-170`) | the fault mapping of the Testing O6 row |
| **merge 4, 6.4 EntityDomains O2 row** (`M4:736`) | "`Entity.queue` states include removals with their `NotSent` reason" becomes "`Entity.queue` lists the members at the cut; a removed write (`Superseded`, `Cancelled`) is read from its `ending` entry, reason `NotSent`; an `Overloaded` start never joins". A read of a cut cannot hold departed members without becoming cumulative, which `EP:138` does not make it |
| **Machines O8** (`Mc:162-166`) | (Revision (multiplicity audit, 2026-10-31)) the snapshot gains `calls`, one row per lane that exists as of its publication (the design's rule 21 and its Machines O8 row); "Reading an old snapshot never consults live lanes" stays. This extends the design's Machines O8 row (`D:2115`) and agrees with merge 4's "the lane does not hold store state" (`M4:699`) |
| **Machines O1**, **CommandLine O5** | a contract's callback and exit names are unique: a type error where types show it, otherwise a `flow check` construction error (D2, rule 15) |
| **Operations O6** (`Op:159-162`) | (Revision (multiplicity audit, 2026-10-31)) "Transactions have outcomes, never lanes" becomes "A transaction's lanes (rule 21) are on the snapshot as `calls.<operation path>`, one row per lane that exists, beside the activity lanes". Activity lanes (`snapshot.activities`, `Mc:164`) are unchanged; this agrees with the design's C8 row |
| **Inspection O4** (`In:79-114`) | new event kinds or fields (`In:85-90` has none): fragment calls, lives, list repairs, dropped deliveries and raises, resets, and endings with route and declined reasons; Story cuts retain them beyond the trace window. The Trace's checkpoints (`In:97-99`) and its closed import schema (`In:105-106`) gain the new checkpoint members (`calls`, `lives`, `evidence` with its new kinds and `tab`, `truth`, the new `pending` fields) and `verdict` on a cause; `appId` and `appFingerprint` are `null` for App-free Stories (rule 12) |
| **Inspection O5** (`In:115-127`) | redaction covers captured truth by its Schema, and ending and pending entries' keys, inputs and reasons as keys and errors already are |
| **Package** (`Pk:19-20`) | `flow-state/testing` exports `Fixture`; `StoryRun` is branded by kind |
| **machine-design rule 11** (`D:486-489`) | rewritten as rules 1–5 here: `story.trait`, `story.subroutine`, harness defaults and verdicts, `.enter`/`.leave` for both kinds, `checkpoint.calls`, `checkpoint.exit` |
| **machine-design 2.1** (`D:75-81`) | add `s.schedules.<name>[i]`, each `{ key, dueAt }`, for keyed schedules (also 2.7.10, `D:1262-1276`) |
| **machine-design 2.2** (`D:91-161`) | add D2's rule: callback and exit names are unique within a contract |
| **machine-design 2.7.11** (`D:1305-1315`) | the predicate Story becomes 3.5's capture, with the Attempt-id assertions; "a checkpoint reads it" becomes "every cut captures it"; "`NotSent` by a cancel during the Attempt's storage acknowledgement or by `latest`" gains "or by a cancel while the write waits in an actor or record queue; `Overloaded` by sends behind a held answer" |
| **machine-design 3.1, 3.2 examples** (`D:1769-1779`, `D:1883-1885`) | `story.trait` / `story.subroutine`; `calls` read per checkpoint; the Confirm checkpoint renamed from `end` |
| **machine-design 3.6 keywords** (`D:2053`, `D:2054`) | `story.machine(fragment)` with `run.calls` becomes `story.trait` / `story.subroutine` with `checkpoint.calls`; `.checkpoint(name, ({ truth }) => …)` becomes `Fixture.stateful` and `checkpoint.truth` |
| **machine-design section 5, Testing O1 row** (`D:2117`) | replaced by the Testing O1 and O2 rows above |
| **machine-design section 5, C16** (`D:2151`) | replaced by the Testing O2, O3 and O4 rows above; "every ending can be produced through services" stays |
| **machine-design section 5, server calls** (`D:2132-2158`) | gains the Machines O8 and Operations O6 rows above |

### 6.5 Rule-by-rule check

Each design rule this proposal touches, with merge 4's rules as amended in. "Agrees" means no text changes.

| Rule | What Stories do with it | Result |
| --- | --- | --- |
| 1 lifetime, `.resumable()` | `.leave` / `.enter` on traits; `lives.frozen`; frozen deadlines never due; retracted firings leave `pending` | agrees |
| 9 `.each` | `calls`/`lives` by key; `listRepair`, `droppedDelivery`, `droppedRaise`; list-order ties | agrees; item 15 closed by the design's D21 (Revision (multiplicity audit, 2026-10-31)): call endings are never `droppedDelivery` |
| 11 tested alone | replaced by rules 1–5 | amendment (6.4) |
| 13 endings map to events | `ending.event` | agrees |
| 14 owner, current, late | `ending.route`, at admission; the mailbox race decided by order under real-time `advance` | agrees |
| 15 late turns | `ending.declined` holds `LateMayNotLeave` | agrees |
| 16 declines are endings | a declined start's `NotSent` is an `arrival` after the send's turn, then an `ending` | agrees |
| 17 every start ends once | each start has exactly one `ending` entry; a Story can count them | agrees |
| 18 the Attempt's ending | channel and reason are after rule 18, decided at settlement (merge 4) | agrees |
| 19 the key is the Attempt's id | seeded opaque ids (`T:37-39`); fixture truth records the ids it saw; Stories compare them | agrees |
| 20 required handling | Story coverage (T2, `D:2165`) | agrees |
| 21 the lane | on snapshots, as `calls` rows (Revision (multiplicity audit, 2026-10-31)); never a `pending` entry | amendment: Machines O8, Operations O6 |
| 22 memory reads | no Story read | agrees |
| 23 keyed schedules | `s.schedules.<name>[i]` | amendment: design 2.1 |
| 24 cancel | three `NotSent Cancelled` windows (3.7); `unknown(Cancelled)` by a cancel while the fixture sleeps | agrees |
| 25 no Flow timeout | a schedule plus `cancel`; timer chains run in one `advance` | agrees |
| 26 one split | records read with `Entity.get`, workflow from the snapshot | agrees |
| 27 settlement, admission | settlement is its own publication frame (3.12) | amendment: Testing O4 (publication causes) |
| 28 a start publishes with its turn | the send's frame holds the prediction and the lane | agrees |
| 29 actor, then record queue | `phase: "waiting"`; `Entity.queue` order | agrees; merge 4 example fixed by erratum |
| 30 the store follows the Attempt's ending | after `StillUnknown` or unknown, `Entity.get` reads `uncertain`; kept predictions until the repair lands | agrees |
| 31 a retry is the same request | the ending's `attempt.id` and `retryCount`; fixture truth records each request with its key | agrees |
| 32 what clears `uncertain` | the record-level boolean, checked by effect | agrees |
| 33 no temporary ids | drafts in the snapshot, rows from `Domain.entry.get`, checked over publication frames | agrees |
| 34 lane keys | `ending.key` is the record's key only under this rule | agrees |
| 35 overflow is an ending | produced by a held head and sends (3.12) | agrees |
| 36 callback reads | no Story read | agrees |
| 37 reads carry confirmed data | read call-value endings are `ending` entries, `attempt` undefined | agrees |
| 38 one capture | `Fixture.storage({ acknowledge })` delays that capture | agrees |

### 6.6 Reference app changes (dispatch-desk)

Rule 11 makes the dispatch-desk fixtures invalid as written: they read `DemoServer` (`DD-FX:12-16`, `DD-FX:38-51`),
a setup service built per Runtime (`DD-API:64-74`, `DD-API:76-78`, `DD-API:208-212`). Rule 9 leaves every Story
working. When this proposal is accepted:

- **`DemoServer` becomes a stateful fixture.** `app/demo-api.ts` exports its builder (today the unexported
  `DemoServerLive`, `DD-API:77`). `testing/fixtures.ts` adds `DemoServerFixture = Fixture.stateful({ id: "DemoServer",
  truth, layer })`, whose truth is the tickets and the idempotency results it holds (`DD-API:81-84`), and whose layer
  provides both `DemoServer` and `TicketApi`, shadowing `DemoTicketApi` (`DD-API:208-212`). `overriding`,
  `SlowSave`, `SlowAssign`, `LockedSave`, `UnavailableQueue`, `RenamedElsewhere` and `countingTicketApi` keep their
  code and now resolve `DemoServer` from that fixture. The header comment (`DD-FX:1-3`) says so, and
  `countingTicketApi`'s counts are per run, not per service build (`DD-FX:55-56`).
- **The `desk()` helpers** put `DemoServerFixture` first in `fixtures` (`DD-ES:20-27`, `DD-QS:14-19`,
  `DD-ET:9-15`). Focused Stories keep `services: DemoTicketApi` (`DD-ES:110-117`): one Runtime, no tabs.
- **Tab Stories.** `secondTabIndependent` (`DD-ET:17-33`) now meets one server in both tabs, as production tabs do;
  its assertions about tab b's save are unchanged. `reloaded` (`DD-ET:36-48`) now reopens against the same server, so
  the restored unknown save is checked against a server that may have applied it. `SlowSave` delays before the call
  (`DD-FX:19-21`), so a save interrupted by `closeTab` never reached the server.
- **Every clock command, checked against rule 9:**

  | Story | Command | Result |
  | --- | --- | --- |
  | `saved` (`DD-ES:30-37`) | `advance("2 seconds").process()` | the save settles at 2 s and `Saved` runs; unchanged |
  | `autosaved` (`DD-ES:40-51`) | three `advance("1 second")` | the debounce fires at 3 s, inside the third `advance`; the checkpoints read as commented |
  | `editedWhileSaving` (`DD-ES:55-68`) | three `advance("2 seconds")` | settle at 2 s, autosave at 4 s, saved at 6 s; unchanged |
  | `lockedOut` (`DD-ES:96-106`) | `advanceToNextTimer()`, then `advance("10 minutes")` | the first retry at 5 s; then retries at 15, 35, 75 and 155 s and the giving-up tick at 315 s, each re-armed by its turn (`DD-EM:202-207`). This is what revision 2 broke |
  | `degraded` (`DD-QS:47-51`) | `advanceToNextTimer()` | the first backoff poll; unchanged |
  | `assigned` (`DD-QS:56-67`) | `advance("2 seconds")` | settles; unchanged |
  | `renamedElsewhere` (`DD-QS:71-74`) | `advance("3 seconds")` | the push at 3 s; unchanged |
  | `secondTabIndependent` (`DD-ET:32`) | `advance("2 seconds")` | tab b's save settles; unchanged |

  The `.process()` after each `advance` becomes redundant and harmless.

## 7. Coverage

| Gap or capability | Answered by |
| --- | --- |
| G1 fixture truth | 3.5, rule 7 |
| G2 endings, lanes, late routing | 3.6, rule 8 |
| G3 fragments inside a host | 3.3, 3.4, rules 5–6 |
| G4 clock and ordering | 3.7, rule 9 |
| G5 unproducible endings, restore mid-write | 3.5, 3.7, rules 10–11, 6.6 |
| G6 fragment Story contract | 3.1, 3.2, 3.9, 3.10, rules 1–3, 12 |
| G7 instance-path sends and verdicts | 3.8, rule 4 |
| G8 what `send` runs | 3.8, rule 4 |
| G9 playback | 3.11, rule 14 |
| G10 record reads | 3.12, rule 16; the Testing O4 record-read amendment |
| G11 settlement and admission | 3.12, rules 14 and 16 |
| G12 server truth and client truth | 3.12, rules 11 and 16 |
| G13 `propertyTest` | 3.5, 3.12, rule 16; the Testing O6 and EntityDomains O4 amendments |
| G14 `Overloaded` and queue order from fixtures | 3.12 |
| Lane reads from a Story or view | 3.14, rule 17 (the snapshot's `calls`) |
| Harness guards, callbacks and exits | 3.2, 3.9, rule 2 |
| Private fields in Story reads | 2, rule 13 |
| Callback and exit names unambiguous in `calls` | 3.3, rule 15 |
| `success`, `failure` by tag, `unknown` by author reason | the fixture answers; the author's commit classifies (`D:793-812`); read in 3.6 |
| `unknown(Defect)` and its actor issue | the fixture dies; the issue is on the cut (`T:79`); read in 3.6 |
| `unknown(Interrupted)` | the fixture interrupts itself; its interruptor is not Flow's (`D:821`, `D:857-858`); read in 3.6 |
| `unknown(Cancelled)` | a cancel while the fixture's sleep is pending (rule 24, `D:603-606`); 3.6, 3.7 |
| `NotSent(Cancelled)` | a queued start in an actor queue or a record queue, or a cancel during acknowledgement (3.7, rule 10) |
| `NotSent(Superseded)`, `NotSent(Rejected)`, `NotSent(NothingToResend)` | sends (`D:818`); read in 3.6 |
| `NotSent(Overloaded)` | a held head and sends past the bound (3.12, rule 35) |
| `NotSent(Restored)`, `unknown(Restored)` | `Fixture.storage` and tabs (3.7, rules 10–11); restored predicted keys read `uncertain` (rule 38, `M4:643-644`) |
| `StillUnknown { failure }` | a stateful fixture that drops and then fails; read in 3.6, and the record stays `uncertain` (rule 30) |
| A read's `Defect` and `Interrupted` | a fixture that dies or interrupts a lookup; an `ending` entry with `attempt` undefined (rule 37) |
| `pending`, `retryCount`, `idle` agreeing with `check()` | 3.6, rule 8 |
| `LateMayNotLeave` | `declined` on the `ending` entry (3.6) |
| Pushes, disconnects, holds and response faults from a fake server | `Fixture.stateful` controls (3.5) |
| Mailbox race (spike P1) | 3.7, rule 9 |
| Timer chains that re-arm through turns | 3.7, rule 9, 6.6 |
| Keyed schedules | 3.7, rule 9 |
| `.each` copies, lives, repairs, drops | 3.3, 3.4, 3.8 |
| Resumable traits: freeze, overdue firing, retracted firings | 3.2, 3.4, 3.7, rule 9 |
| `whenAbandoned` alone and in a host, across lives | 3.2, 3.3 |
| Restore mid-write, charged once | 3.5, 3.7 |
| Same-Attempt retry against a new write | Attempt ids in `ending` entries against request keys in truth (3.5) |
| Prediction at start, confirmation at settlement, lane at admission | 3.12 (rules 27, 28), over publication frames |
| Record-queue order, a `latest` waiting start, a superseded removal | 3.12 (rule 29); `Entity.queue`, `pending` phases, `ending` entries |
| A retry joins the queue and sends the same request | `Entity.queue` and fixture truth (rule 31) |
| `uncertain` set and cleared | `Entity.get` (rule 32) |
| `unconfirmed` fields and their confirming read | `Entity.get`, `Domain.entry.get` (`EP:92-100`) |
| Drafts instead of temporary ids, never shown twice | the snapshot and `Domain.entry.get` over publication frames (rule 33, 3.13) |
| Merge 1's `Timeout` | the design has no Flow timeout (`D:825-826`, rule 25); a schedule plus `cancel` is covered above |
| `orphaned` across a version change | not covered: saved-state Stories are left out (`D:2204-2205`) |

## 8. Alternatives considered

- **Keep `story.machine` for fragments.** Rejected:
  - three of its five options do not apply;
  - discovery checks machines;
  - `.enter` and `checkpoint.exit` would be conditional members of an actor Story.
- **`story.fragment(F)`.** Rejected: "fragment" would become a new public word (it is not an export or keyword,
  `D:2053`, `D:2105`), and the trait/subroutine differences would hide behind conditional types.
- **`story.alone` / `story.harness`.** Rejected: they name the method, not the subject.
- **A host with one fragment stubbed.** Rejected: rule 10 and `flow check` already cover swapping a fragment, so it
  would add a concept and prove nothing new.
- **A checkpoint predicate over truth** (`D:1310`). Rejected:
  - it is a callback in a plan (`T:17-18`);
  - it makes a capture into an assertion (`T:75`);
  - a boolean hides the value when it fails.
- **Reading truth only at `end`.** Rejected: races need truth mid-story, before and after a reload.
- **Calls and endings read from the trace.** Rejected: the window is 4,096 events (`In:101`), and "Truncation …
  cannot prove an absent cause" (`T:94`).
- **An `advance` that admits no turn** (revision 2). Rejected for Q7: any timer chain that re-arms through a turn
  stops after one step, so Stories diverge silently from production (`DD-ES:96-106`). Rewriting `lockedOut` would fix
  one Story and leave the trap.
- **A "held main thread" command** that queues arrivals without turns. Rejected: under rule 14 the outcome depends
  only on mailbox order, which real-time `advance` already reproduces; the command would add a mode no production
  ordering needs.
- **A `.hold()` / `.release()` Story command.** Rejected: a second scheduling channel beside the clock (`T:37-40`).
  A fixture that needs holds declares them as controls (3.5).
- **An `advanceHeld` command.** Rejected: see the two items above.
- **An `ackDelayMs` actor option.** Rejected: storage behaviour belongs to the storage fixture (locality).
- **A closure guard in the harness.** Rejected: `T:17-18`.
- **A "deny every guard" switch.** Rejected: it cannot name the code a host forwards.
- **A `.guards()` command.** Deferred (Q32): a test host covers a verdict that changes mid-life.
- **Harness callbacks with handlers.** Rejected: that is writing a host. Write a test machine instead.
- **A `.reset()` command for trait Stories.** Rejected: `resetOn` is a host filling (`D:300`), tested with
  `story.machine`.
- **Fixtures per tab.** Rejected: a reload would meet a different server.
- **Marking setup services run-scoped** (`story.app(setup, { runScoped: [DemoServer] })`). Rejected for Q9: a second
  scope concept beside fixtures, which already shadow setup services and are already run-scoped.
- **Fixtures that depend on setup services, built per tab.** Rejected: the fake server would restart on reload.
- **Sharing only the truth `Ref` across tabs, building the rest of each fixture per tab.** Rejected: a fake server's
  other state (a script's position, a dropped-first flag) would restart on reload.
- **Standard delay, drop and dedup controls on `Fixture.stateful`.** Rejected: Flow knows no server semantics
  (`D:775-776`); each fake server writes its own in plain Effect.
- **Playing fragment Stories through a generated component**, for example a harness view that prints the slice.
  Rejected: playback shows the real app UI (`PB:8-10`), and a generated UI is not the app.
- **Showing cut records only within the trace window**, as Inspect's trace view does. Rejected: the records are
  retained with the cut precisely so they never go missing.
- **The full lane on the snapshot** (the current Attempt, the starter, the phase). Rejected: rule 21 keeps the
  current Attempt out of guards and views (`D:556-557`); the reads need only `pending` and `retryCount`.
- **A lane read by transaction and key** (`Lanes.pending(snapshot, confirm, key)`). Not chosen for Q40: it brings
  back the descriptor-level read C7 removed (`D:2142`) under another name, and reads any snapshot silently.
- **Commit values exported from module scope with `Definition.O`** (revision 3's Q40). Rejected (Revision (multiplicity audit, 2026-10-31)): it moves
  commit values out of the machine, where their selects are typed and their outcomes are local, and makes view modules
  import machine internals.
- **`Machine.lanes.x.pending(s, key)`.** Rejected (Revision (multiplicity audit, 2026-10-31)): correct, but a namespace and a call where snapshot
  data suffices.
- **A list of causes per frame** (revision 1). Rejected for Q31: one frame per command needs no list.
- **Verdicts only in frames.** Rejected for Q13: `frames: "named"` would hide a refusal.
- **A `checkpoint.endings` read beside the evidence.** Rejected for Q29: two homes for ordered records; one
  `filter` by kind reads as plainly.
- **Lane entries in `pending`** (revision 1). Rejected for Q29: they repeat the lane and once disagreed with it.
- **An ending entry at settlement, filled in at admission.** Rejected: earlier evidence never changes (`T:95`); the
  queued `arrival` already carries what settlement decided.
- **A `queueRemoval` evidence kind.** Rejected: the removed write's `ending` entry already says it, with its reason.
- **A per-Attempt `uncertain` read in Stories.** Rejected: no view reads marks; the record's boolean is what rule 32
  changes observably, and the marks are Inspection's `uncertain` events (`In:88`).
- **A Story read that compares truth and records.** Rejected: it would decide for the author which server field
  means which record field; the author asserts both.
- **`owner` and `from` on endings** (revision 1). Deferred for Q35: no Story needs them yet.

## 9. Open questions

**Revision (multiplicity audit, 2026-10-31).** Q40 is settled by the audit (below, and the design's decision D18); it stays here for the owner's
confirmation with the other audit decisions ([audit-multiplicity.md](../audit-multiplicity.md) section 5).

**Q40. How do a Story and a view reach a commit value's lane reads?**

- *Before:* the design reads lanes through a commit value (`pay.pending(s, key)`, `D:992`; `like.pending(s, { id })`,
  `M4:90`), but every example builds commit values inside the machine body, where no other module can reach them
  (`M4:205`, `DD-EM:63`).
- *Option A (decided provisionally, recommended):* a definition exposes `O` beside `E`; commit values are built
  and exported at module scope (3.14, rule 17). It reuses the existing members, keeps one way to read a lane, and
  matches `Definition.E`. Cost: authors move shared commit values out of the body.
- *Option B:* a read by transaction and key, `Lanes.pending(snapshot, transaction, key)`, so no commit value needs
  exporting. Cost: a second way to read a lane, close to the descriptor-level `pending` that C7 removed (`D:2142`).
- *Option (2), chosen (Revision (multiplicity audit, 2026-10-31)):* lanes are plain snapshot data, `s.calls.<operation path>`, beside `s.activities`.
  A wrong-actor read is a type error and a missing lane is absent; commit values stay in the body. Reviews found A
  breaks locality and select typing, B allows silent wrong-actor and never-started reads, and
  `Machine.lanes.x.pending(s, key)` (C) is correct but verbose.

Two items outside this proposal bound it, and are not reopened here:

- the design's item 15, closed by D21 (Revision (multiplicity audit, 2026-10-31)): call endings to `.each` copies are never
  `droppedDelivery` (3.4);
- playback's open question 2 (`PB:195-197`): fragment Stories stay unplayable until it is settled (Q17).

## 10. Decisions

D1–D3 were settled by the owner. The text is kept as decided. Its citations predate the merge: `M2:380` is now
`D:1310`, and `T:17` is `T:17-18`.

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
They keep revision 1's question numbers and rounds; questions 1–5 are D1–D3, and number 28 was never assigned. Q7
and Q9 were revised in revision 3 after review 2; Q40 is new in revision 3.

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
- **Q30 One run log; frames point into it.** Choice: every cumulative record, from every tab, is appended to one run
  log, a frame holds its length, and unchanged snapshots, lives and encoded truth keep identity; lanes on snapshots
  stay slim (Q21). Why: the reads are the same, the cost is linear, and Testing already says a frame refers to
  evidence by position (`T:73-74`). Consequence: `checkpoint.evidence` and `checkpoint.calls` are typed views of the
  prefix, and a closed tab's records stay (rule 14, section 5). Rejected: copying cumulative records per frame
  (quadratic, S-H2).

**Round 2: where cumulative records live**

- **Q29 Endings are evidence; `pending` lists work, never lanes.** Choice: an admitted ending is an `ending` entry in
  `checkpoint.evidence`; `pending`, computed from Flow's state, lists an Attempt as an `operation` entry with `phase`
  until settlement and its ending as an `arrival` until admission; lanes are read only from the snapshot. Why: one
  ordered home for what the Runtime decided; `pending` cannot disagree with a lane row's `pending`, because at each moment of
  rule 21's span exactly one entry exists. Readability holds: the test filters by `kind` and `operation`.
  Consequence: `checkpoint.endings`, `phase: "settled"` and `waiting` go; phases are `"waiting"`,
  `"acknowledging"`, `"runnable"` (added in revision 3, C-M2) and `"invoked"`. Rejected: a separate `endings` read;
  lane entries (revision 1).
- **Q6 The ending record.** Choice: `operation`, `key`, `attempt`, `channel`, `reason`, `event`, `route`, `declined`,
  `seq` and `tab`, for commit values and resource call values, written once at admission; `key` is the lane key.
  Why: correctness: every ending, read endings (rule 37) and `LateMayNotLeave` refusals included, stays readable
  beyond the trace window; written at admission because earlier evidence never changes (`T:95`), while the queued
  `arrival` shows settlement's verdict. Consequence: channel and reason are after rule 18, decided at settlement
  (merge 4 rule 27); a removed queue member is read from its ending (C-M7). Rejected: endings in the trace only; an
  entry at settlement completed later.
- **Q35 Keep `route`; defer `owner` and `from`.** Choice: no owner activation, no route origin. Why: `route`, the
  resulting snapshot and the turn's trace event show where a late ending went, and an activation counter would be a
  number no other read uses. Consequence: `{ state, activation }` goes. Rejected: revision 1's `owner` and `from`.

**Round 3: lanes**

- **Q21 Lanes on snapshots, `pending` and `retryCount` only.** Choice: as revision 1. Why: correctness: `check()` on a
  frame (`T:107-108`) and on an old snapshot (`Mc:166`) must read lanes as published, and rule 21 forbids more
  (`D:556-557`). Consequence: amends Machines O8 and Operations O6 (reworded in revision 3, C-M4); agrees with merge
  4's "the lane does not hold store state" (`M4:699`). Rejected: the whole lane. **Revision (multiplicity audit, 2026-10-31):** the rows are public
  plain data, `s.calls`, and are `{ key, outstanding }` under `allow` and `serialize` (the design's rules 21 and N2).
- **Q22 No lane entries in `pending`.** Choice: decided by Q29; an Attempt's work and its queued ending are listed
  instead. Why: lane state already lives on the snapshot. Consequence: none beyond Q29. Rejected: revision 1's lane
  entries with phases `acknowledging`, `invoked`, `settled`.
- **Q36 Keep the names.** Choice: no renames here. Why: merge 4's E16 already renames the record's `pending` to
  `predicted` (`M4:570-574`), leaving the lane read (rule 21) and the cut's pending work (`T:84`), which are read in
  different places (3.13); `ending.key` is the lane key, which is the record key under rule 34; `by: "exit"` and
  `checkpoint.exit` are one record (Q39); D3 fixes `Fixture.stateful`. Consequence: the Testing O4 record-read
  amendment (6.4). Rejected: renaming further before the design's naming question (`D:2229-2230`).

**Round 4: time and the mailbox**

- **Q7 The clock runs like real time** (revised in revision 3). Choice: `advance` and `advanceTo` take every deadline
  up to the target in order and, at each instant, run everything due there as `process()` does, turns included,
  before moving on; `advanceToNextTimer` does the same up to the earliest Flow schedule deadline; every sleep is a
  deadline; the tiebreaks; frozen deadlines never due. Why: it is the only reading that cannot silently diverge from
  production on a timer chain: revision 2's "admits no turn" stopped every chain that re-arms through a turn after one
  step, including `lockedOut` (`DD-ES:96-106`, `DD-EM:202-207`), and rewriting that Story would leave the trap for the
  next one. The mailbox race stays faithful, because rule 14 decides at admission and the outcome depends only on
  mailbox order, which deadline order reproduces. The moment between settlement and admission stays visible as
  publication frames (G11). Consequence: amends `T:49-51`; every dispatch-desk clock command is checked (6.6);
  `.process()` after `advance` becomes redundant. Rejected: "`advance` admits no turn" (revision 2); a held-thread
  command; `advanceHeld`.
- **Q38 Keep the final tiebreak.** Choice: owner kind, then the order sleeps began, and no further levels. Why:
  correctness: without it a fixture sleep and a schedule at one instant have no order (C-M1). Consequence: rule 9.
  Rejected: documenting Mc's order alone.
- **Q14 `send` is FIFO.** Choice: `send` runs the queued turns ahead of it, its own, and their pending-reset turns,
  then stops, in every Story kind. Why: it is what production does with a user event behind queued arrivals.
  Consequence: rule 4; work its turns start is `runnable` until the next command runs it. Rejected: refusing `send`
  while arrivals are queued.

**Round 5: queue and reset visibility**

- **Q19 Queued arrivals in `pending`.** Choice: yes, with `event` and `from`; a queued ending also carries its
  operation, key, Attempt, channel and reason. Why: correctness: without them a declined start's queued `NotSent`
  and a settled-but-unhandled ending are invisible. Consequence: rule 9. Rejected: leaving queued arrivals out.
- **Q34 No `phase` on arrivals.** Choice: `kind: "arrival"`, `position`, `event` and `from`. Why: the kind already
  says it is queued, and `phase` keeps one vocabulary, an Attempt's. Consequence: `phase: "queued"` goes. Rejected:
  deferring the entry.
- **Q33 No `"pendingReset"` cause.** Choice: dropped. Why: a publication frame's cause is its publication
  (`T:73-74`), and the `reset` entry with source `"pendingReset"` at that position names it. Consequence: 3.4, 3.11.
  Rejected: keeping a cause that repeats the evidence.

**Round 6: fixtures**

- **Q9 One fake server per run** (revised in revision 3). Choice: fixtures are acquired once per run in the run's
  scope and shared by tabs; a fixture depends only on other fixtures and run-level services and may shadow setup
  services; a fake server that a setup builds as a service is provided to Stories as a stateful fixture shadowing it
  and the API on it. Why: correctness: a reload must meet the same server, with its idempotency results and script
  position, or "charged once across a reload" cannot be checked, and the dispatch-desk `reloaded` Story checks
  nothing today (`DD-ET:36-48`, `DD-API:208-212`). Moving the server into a fixture uses the two concepts that already
  exist (stateful fixtures as fake servers, `T:63-64`, and shadowing, `T:57`) instead of a new scope marker. It keeps
  dispatch-desk's fixture code, which only needs `DemoServer` to come from a fixture. Consequence: amends `T:57` and
  `T:63` explicitly; the dispatch-desk changes of 6.6. Rejected: fixtures depending on per-tab setup services;
  run-scoped setup services marked per Story; sharing only the truth `Ref`.
- **Q23 The starting truth is the Schema's constructor default.** Choice: as revision 1. Why: it keeps D3's signature
  and reuses `Flow.initial`'s mechanism (`D:244`). Consequence: none to D3. Rejected: an `initial` member.
- **Q24 Fixture controls.** Choice: an optional `controls` record of Schemas, one `Queue` each, and
  `.control(fixture.name(payload))`, which runs its reaction to idle before the next command (C-M3); holds, releases
  and scripted response faults are controls too. Why: Stories of subscriptions need pushes and disconnects at a
  chosen step, and `propertyTest`'s emitted Stories need its fake-server faults as literal commands (`T:143-145`,
  `T:159-160`); a data command is not a callback. Consequence: Testing O3 and O6 amendments. Rejected: controls for
  property tests only; standard controls built into Flow.

**Round 7: storage and tabs**

- **Q8 `Fixture.storage({ acknowledge })`.** Choice: it delays only the capture that acknowledges an Attempt, which
  persisted actors make (`Ps:124`) and which also holds the lane and predicted keys (rule 38). Why: correctness: it
  opens the one pre-invocation window a `reject` or `allow` plain write has, without hanging `openTab` (C-M3 of
  review 1). Consequence: rule 10. Rejected: an actor option.
- **Q37 One storage fixture.** Choice: `Fixture.storage` is the storage fixture of `T:66-67`, and `seed` is its only
  seeding form. Why: one concept, not a second way to seed. Consequence: Testing O3 names the constructor. Rejected:
  a separate seeding form.
- **Q18 A closed tab in a frame.** Choice: render nothing and record the frame-level gap `TabClosed`; the tab's
  evidence stays in the run log. Why: it fills a case `T:108` leaves open, without inventing a cut. Consequence: rule
  14. Rejected: rendering the last cut.

**Round 8: the fragment harness**

- **Q10 Harness defaults.** Choice: guards pass, callbacks record, exits record and end the life; the subject sits
  under a harness child state; the Story's snapshot is the subject's slice; harness names never appear in reads,
  causes or denials. Why: correctness: a trait on the root could never be left, so never freeze (C-M4 of review 1).
  Consequence: rules 2–3. Rejected: placing the trait at the root.
- **Q11 A data-only refusing guard.** Choice: the `guards` option, `true | Flow.Denial`, added to D1's option list.
  Why: a fragment's refusal path must be testable alone, without a callback (`T:17-18`). Consequence: rule 2.
  Rejected: closure guards; a deny-all switch.
- **Q32 No `.guards()` command.** Choice: deferred; the verdict is fixed per run. Why: a verdict that changes mid-life
  is host policy, testable in a minimal test host with `story.machine`, so nothing becomes untestable; one way is
  simpler. Consequence: 3.9. Rejected: a second way to set a verdict now.

**Round 9: the fragment Story surface**

- **Q39 `checkpoint.exit` is the shorthand.** Choice: rule 5 says it is the last `by: "exit"` record of the current or
  last life, with the exit's name as `exit`, so it has the same shape as the `calls` record (W-M8). Why: one fact,
  one definition, one shape. Consequence: rule 5. Rejected: a separate `{ exit, payload }` shape.
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
  Why: the design's one convention for keyed lists (`D:80`). Consequence: amends design 2.1. Rejected: a record by
  key.
- **Q40 Lanes are snapshot data** (Revision (multiplicity audit, 2026-10-31); revision 3's provisional choice, commit values at module scope with
  `Definition.O`, is withdrawn). Choice: a Story and a view read `snapshot.calls.<operation path>` (3.14, rule 17).
  Why: a Story must reach lane reads (W-H4), and so must a view (`M4:90`); a wrong-actor read is a type error, an absent
  lane is absent, and commit values keep their typed selects in the machine body. Consequence: no `Definition.O`, no
  Machines O1 amendment; the Machines O8 and Operations O6 rows say `calls`. Rejected: exporting commit values (A),
  a read by transaction and key (B), `Machine.lanes` (C). Awaits the owner with the design's D18.

**Round 11: confirming what is left out**

- **Q15 No `.reset()` command.** Choice: no. Why: `resetOn` is a host filling (`D:300`); `story.machine` tests it.
  Consequence: none. Rejected: a harness reset.
- **Q16 No Story hold-and-release command.** Choice: no; a fixture that holds answers declares `hold` and `release`
  controls (Q24). Why: holding is the fake server's state, not a second scheduler beside the clock (`T:37-40`).
  Consequence: 3.5. Rejected: `.hold()` / `.release()` commands.
- **Q20 No wider `.each` exploration now.** Choice: nothing added. Why: which transitions add or remove keys is
  Story-checked (`D:477-479`), and `propertyTest` stays the one generator on the real Runtime (T1, `D:2164`).
  Consequence: none. Rejected: a membership explorer.

## New keywords

- `story.trait`
- `story.subroutine`
- `StoryRun<Kind>`
- `.enter()` and `.leave()` on trait Stories
- `guards` (Story option)
- `checkpoint.calls`, with `by: "transition" | "whenAbandoned" | "exit"`
- `checkpoint.lives`, with `life` and `frozen`
- `checkpoint.evidence`, entries with `kind`, `seq` and `tab`
- `listRepair`, `droppedDelivery`, `droppedRaise`, `reset`, `ending`, `refused` (evidence kinds)
- `ending` fields: `operation`, `key`, `attempt`, `channel`, `reason`, `event`, `route: "current" | "late"`, `declined`
- `verdict` on a send's frame `cause`; a publication frame's turn or settlement
- frame reads: every checkpoint read on any frame
- lanes on snapshots: `calls.<operation path>`, rows `{ key, pending, retryCount }` or `{ key, outstanding }` (Revision (multiplicity audit, 2026-10-31); replaces "read through commit values" and `Definition.O`)
- `kind: "schedule" | "operation" | "arrival" | "fixture"` (pending entry)
- `attempt` and `phase: "waiting" | "acknowledging" | "runnable" | "invoked"` (an Attempt's pending entry)
- `position`, `event`, `from: "send" | "schedule" | "ending" | "context"` (pending entry for a queued arrival)
- `frozen` and owner `fixture:<id>` (pending entry)
- `TabClosed` (frame-level StoryFrame gap)
- `s.schedules.<name>[i]`, with `key` and `dueAt`
- `Fixture`, `Fixture.stateful({ id, truth, controls?, layer })`, `Fixture.storage({ acknowledge?, seed? })`
- `.control(fixture.name(payload))` (command)
- `checkpoint.truth`
- `defineConfig({ stories })`
- `InvalidStoryCommand`
- From merge 4, read in Stories: `predicted` in `Entity.get`'s result (replaces `pending` there)
