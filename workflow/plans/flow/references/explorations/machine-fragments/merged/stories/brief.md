# Stories: requirements brief for a from-scratch design (merge 3)

Status: **brief, written 2026-10-31.** This is the whole input for a designer who designs Stories again from scratch
on top of the merged design. It states the problem, the requirements, the known failures and the integration points.
It contains **no solution**. Where an earlier draft's mechanism was the only way to describe a failure, the failure is
written as what an author, a viewer or a tool saw. The earlier Stories proposal and its reviews exist in the
repository (`merge-3-stories/proposal.md`, `reviews/`). The designer is asked not to read them, so as not to
inherit their assumptions. Nothing here is decided except what section 3 cites.

Follow AGENTS.md, in particular "Design by convergence": this brief gathers every requirement and finding at once so
that one API can answer all of them. Exercise abstract thinking. Every requirement applies to every machine, fragment,
operation, stream and app, not only to the case that found it. When a requirement and a product case seem to
disagree, the requirement wins and the case is the test. Reason about what each concept implies for the rest of the
system (the single graph, the single runtime, static analysis, playback, the CLI) before you adopt it.

Short names for citations (all under `workflow/plans/flow/`; `MF` is `references/explorations/machine-fragments/`):

| Short name | File |
| --- | --- |
| MD | `MF/machine-design.md`: merges 1, 2, 4 and 5, operations in the definition, operations in fragments. The one design |
| OD, F | MD's decision lists "Operations in the definition" (OD1–OD26) and "Operations in fragments" (F1–F10) |
| ODP, FP | `MF/merged/operations/proposal.md`, `MF/merged/fragment-operations/proposal.md` (records behind MD; MD wins) |
| MP | `MF/merged/operations/merge-plan.md` (X21, X33, 2.10, 2.11) |
| DLG | `MF/delegated-decisions.md` |
| OI | `MF/open-items.md` |
| NS | `MF/experiments/new-shapes.md` (ideas #19–#21; brainstorm, nothing decided) |
| AUD | `MF/audit-multiplicity.md` (N1–N3; F9, F11) |
| M4 | `MF/merged/entities.md` (merged as MD 2.8, rules 26–38) |
| M6, M6D, M6B | `MF/merge-6-streams/proposal-v2.md`, `decisions-v2.md` (S1–S7), `brief.md` (SR, FC). Being finished in parallel |
| LM, SM | `MF/merged/operations/lane-model/`, `MF/merge-6-streams/model/` (executable models; design checks, not test suites) |
| RQ | `MF/merged/server-calls/requirements.md` (R1–R38, P1–P23) |
| SPK | `MF/merged/server-calls/spike/` (`stories.ts`, `flow.ts`) |
| PB | `references/explorations/playback.md` (accepted; Testing O4 and O9 hold the contract) |
| TST, MCH, RT, OPS, EDP, PER, INS, CLI, SSR, RCT, LZ, PKG, DIA | `Testing.plan`, `Machines.plan`, `Runtime.plan`, `Operations.plan`, `EntityDomains.plan`, `Persistence.plan`, `Inspection.plan`, `CommandLine.plan`, `ServerRendering.plan`, `React.plan`, `LazyFeatures.plan`, `Package.plan`, `Diagnostics.plan` |
| DD | `references/dispatch-desk/` (the reference app; `features/Tickets/editor/editor.story.ts`, `editor.tabs.story.ts`, `queue/queue.story.ts`, `testing/fixtures.ts`, `app/demo-api.ts`) |
| EFX | `node_modules/effect/` (Effect 4.0.5, installed; authoritative over `codebases/effect-v4/`) |

Plain words used here. **Story**: a scripted, deterministic run over the production Runtime. **Cut**: everything
captured at one moment of a run (TST O4's word). **Frame** and **checkpoint**: PB's words (a checkpoint is a named
frame). **Fake**: whatever stands in for a real server, transport or storage in a Story. **Server truth**: what a fake
server holds. **Client truth**: what a tab's Runtime holds (snapshots, store, lanes). **Evidence**: INS O1's word for
the Runtime's recorded decisions. "Ending", "Attempt", "lane", "settlement", "admission", "incarnation", "subject
path", "unbound", "parked", "releasing" are MD's words with MD's meaning.

## 0. Design goals

These sit beside AGENTS.md's order of priority (correctness first, then readability at a glance, then agent UX);
they do not reorder it. Where a goal and correctness pull apart, the design says so and keeps correctness.

**SG1. Few general concepts.** *Judged by:* the design lists every word an author must learn to write, read or debug
a Story (a constructor, a command, an option, a read, a control, a record kind, an error) and assigns each to a tier:
**common** (a scripted test of one machine), **uncommon** (fragments, entity domains, reloads, tabs, streams, SSR),
**rare** (policy-level cells, property tests, version upgrades). The common-tier count is reported first, and the design states its total. Each
special case the design handles by its own word is listed with the reason a general concept could not cover it.

**SG2. The common case is small.** A short scripted test of one machine: create the actor with input and a fake for
its one service, send two events, let time pass, and check the state, one memory field, one lane row and what the
fake server received. *Judged by:* the line count of that Story and its assertions, against TST's current form
(DD's `editor.story.ts` `saved` is 8 lines plus assertions in `editor.test.tsx`). Nothing beyond the common tier is
needed to write it, and nothing the author does not use appears in its types or errors.

**SG3. One runtime.** *Judged by:* every Story, demo, property test, CLI run, playback recording and Flow's own policy
suite executes on the production Runtime under a controlled clock (RT goal; MD T1; MP X33). No mode, scheduler or
model predicts what the Runtime would do. A Story can never observe a state production cannot reach, and production
can never take a step a Story cannot reproduce.

**SG4. A Story is the demo and the test at once.** *Judged by:* one Story value serves a test runner, `flow story
run`, a presentation and a property-test counterexample, with no second description of the scenario. What a test
asserts can be shown at the frame where it holds; what a demo shows is deterministic and checkable.

**SG5. General, not the walks.** *Judged by:* the design is a few rules that cover section 2; each failure in section 4
and each walk in section 6 is answered by citing those rules. A rule that names one operation kind, one policy, one
transport or one product case is a finding against the design.

**SG6. Agent UX.** *Judged by:* an agent that has the types, `flow story describe` and one failing run's output can
write a new Story, find why one fails and fix it, without reading Flow's source. Every trap in section 4 is either
impossible to write or reported with the fix.

**SG7. Data first.** Every Story read starts from where the fact really comes from (a `fetch` response, a WebSocket
frame, an `AbortController`, a `KeyValueStore` write, the Clock) and follows it through the adapter, the operation,
the lane, the store and the snapshot to the read. Flow is not a network library: a fake replaces a transport or a
server, never Flow's interpretation of it (RQ R36, R38; MD 2.7.1).

## 1. The problem

### 1.1 What Stories are for

Stories are Flow's scripted runs over machines, I/O and entities. The same Story is used:

- as a **test**: a test runner runs it and checks values captured at its checkpoints;
- as a **demo and presentation**: PB records it once and renders the real app from its frames, with captions and an
  overlay that highlights the next control to click;
- as a **bug reproduction**: a failing property test shrinks to a literal Story (TST O6), and a trace from a Story
  run is explained by the CLI (CLI O1, `explain --trace --at`);
- as **design evidence**: MD keeps named walks as Stories (MD 2.7.13 "Walks kept as Stories", rule 58), and several
  `flow check` warnings are derived from Story traces (MD 2.2.1, rule 9's repairs and dropped raises, D16's
  read-after-write lint, rule 51's declines);
- as **coverage**: `flow stories --coverage` lists transitions, exits, callbacks and ending handlers no Story reaches
  (MD T2).

### 1.2 What changed around Stories

TST was written before the merged design. Since then MD added, and Stories must now drive and observe:

- **Fragments** (MD 2.1–2.6, rules 1–12): traits and subroutines placed in hosts, `.each` copies with keys and
  incarnations ("lives"), `.resumable()` freezing and thawing, `resetOn`, `whenAbandoned`, exits, callbacks to the
  host, host events, private fields, list repairs and dropped raises.
- **Operations** (MD 2.7, rules 13–25, 39–47): contracts with `input`, `output` and `key`; three ending channels
  (success, failure, unknown) plus Flow's reasons (`NotSent { why }`, `Cancelled`, `Restored`, `Interrupted`,
  `Defect`, `StillUnknown`, `StorageRefused`) and evidence (`Superseded`, `Released`, `NothingToResend`, `InFlight`);
  current and late routing decided at admission; **write lanes owned by the Runtime** with states `Idle`, `InFlight`,
  `Held` and a waiting part, holds that outlive their actor, parked endings, rebind, restore and Runtime disposal
  (2.7.13); one-off reads and placements; rows on the snapshot (`s.operations`, 2.7.5).
- **Entity domains** (MD 2.8, rules 26–38): the store, predictions joined at start, record queues across actors,
  settlement (store) before admission (lane), `uncertain` and `unconfirmed`, no temporary ids, overflow as an ending.
- **Operations in fragments** (MD 2.9, rules 48–60): lanes record the subject path of the incarnation that created
  them, are adopted by the next incarnation at that path, may be unplaced or releasing, and freeze cuts lookups.
- **Streams** (M6, decided parts S1–S7): sessions per (incarnation, operation, key), in-band `Feed` signals, a row with
  `connection`, `drop`, `value` and `last`, per-session evidence, and Stories that replace the transport.
- **Removed**: model-based exploration (`model()`, TST O5) is cut so that Flow keeps one runtime (MD T1). Its jobs
  (find paths to a state, check every reachable combination) have no replacement except `propertyTest` for domains.
- **Multiplicity** (AUD, MD N1–N3): every handle, row and record says how many exist, which one a reference names,
  and what reads see before creation and after deletion.

### 1.3 What a Story observes

A Story's assertions read facts from several real sources. Each has one writer and one moment (MD 2.7.2, 2.8.1):

| Source | Holds | Written when |
| --- | --- | --- |
| the snapshot | state, memory, context, schedules and `dueAt`, `.each` copies, private fields, lane and session rows | each committed publication: a turn, a settlement, a Runtime step (MD 2.5) |
| the store | records with `predicted`, `uncertain`, `unconfirmed`; record queues; answers | start (prediction), settlement (effects), pushes and reads |
| the Runtime's decisions | endings with route, verdicts and denials, callbacks told, exits taken, lives, resets, repairs, drops, holds, parked endings, session answers | as decided, in one Runtime-global order (INS O1) |
| work not yet done | Attempts waiting or on the wire, queued arrivals, deadlines, open sessions | continuously |
| server truth | what each fake server holds and every request it received | when the fake decides |
| time | the controlled clock | only when the Story moves it |
| the rendered UI | real components rendered from a frame | never executes; PB |

Today TST gives a read for only some of these, and in places contradicts MD (section 4).

### 1.4 Why from scratch

The last draft answered two review rounds by adding a read, a mode or a rule per finding. Review findings show the
pattern: cumulative records in five homes, lane state read twice, `pending` with four meanings, a frame cause that
became a list, then one per command, an `advance` that first ran no turns and then had to. Meanwhile MD changed the
lane, the store, fragments and streams under it. The designer is asked to find the few concepts that make each of
those findings impossible, not to patch them.

## 2. Requirements

Each requirement is testable. "Production" means the Runtime as a host runs it. "Reachable" means reachable through
production paths: sends a view could make, time, fakes behind services, lifecycle commands a host could issue.

### Building and running a Story

- **STR1. Subjects.** A Story can be written over: a whole app setup (with ensure, refs, tabs); one actor of one
  machine; one trait alone; one subroutine alone; and a fragment inside a test host the author writes. Each takes
  exactly the inputs its subject declares, with their types (TST O1; MD rule 11, rule 58, F7). *Test:* a trait with no
  `Flow.input` fields and a subroutine whose input is given at entry each need no unused option.
- **STR2. Inert and static.** Constructing, importing and discovering a Story starts no service, actor, fake or
  assertion. A Story is data that tooling can list and describe without running author code (TST O1; CLI O2). Branches
  replay in fresh Runtimes; extending a Story never changes an earlier prefix.
- **STR3. One execution boundary.** Running a Story is one call that returns everything captured, or a rejection that
  carries everything captured up to the failing boundary (TST O8). Direct and CLI runs agree (CLI O2).
- **STR4. Discovery.** Stories over subjects that belong to no app (a library fragment, a test host) can be
  discovered and run by the CLI. Ids are unique within a stated scope, and the trace of a Story with no app says so
  (TST O1; CLI O6; INS O4's identity fields).
- **STR5. Failure evidence.** The turn limit, invalid time movement, invalid commands for the subject's current state
  (entering what is entered, leaving what is not), cancellation and cleanup failures each stop the run at a named
  command with partial evidence kept (TST O2, O8; DIA).

### Driving machines and fragments

- **STR6. Sends.** A Story can send every event a view or host could send: public events at any instance path, to a
  keyed `.each` copy, to a subroutine, and, for a fragment alone, its host events (MD rules 2, 11; MD 3.3). Internal
  events, exits and events an operation maps can never be sent (MD rule 47; OD23 Q33). *Test:* sending a mapped
  event is a type error, not a runtime surprise.
- **STR7. Verdicts are never lost.** Every send's verdict (allowed, denied with reasons, unhandled) is readable after
  the run, including when the send published nothing (MCH O3: unhandled or denied events publish nothing).
- **STR8. What a command runs is defined and matches production.** After each command it is stated which turns,
  pending-reset turns, settlements, Runtime steps and queued arrivals have run, in the FIFO mailbox order production
  uses (MD 2.5, P21), and which are left for later. A send behind already-queued arrivals behaves as it would in
  production.
- **STR9. Lifecycle.** A Story can ensure, dispose and re-create actors; start another incarnation of the same
  identity in the same Runtime (rebind, MD 2.7.13, OD20); dispose with retain expiry, `disposeActor` and `forget`
  (PER); and address a local actor by its identity (machine, input) (OD20). Context updates follow RT O5 (TST O1).
- **STR10. Fragments alone.** A trait or subroutine alone can be entered and left as a host transition would, so its
  start, freeze, thaw, reset by a new life, `whenAbandoned`, exits and release on leave (rule 60) are testable
  without writing a host (F7; MD rules 1, 58). What the absent host answers (guard verdicts, including a refusal with a
  named code a host would forward) is set by the Story as data. Nothing about the stand-in host appears in what the
  Story reads.
- **STR11. Fragments in a host.** In a whole-machine Story, what each fragment did is readable under its instance
  path and copy key: callbacks told (with payload and life), `whenAbandoned` notifications, exits taken, lives
  created and ended, frozen or active, resets, list repairs, dropped deliveries and dropped raises (MD rules 1, 6–9;
  `MF/merged/each.md`). *Test:* "a delivery reaches the incarnation it was started under" and "a late delivery for a removed row is
  dropped even if the key was added again" are checkable.
- **STR12. A fragment reused on two hosts.** The fragment's own Stories run with no host; each host's Stories see
  the same facts about the fragment at that host's instance path. A fragment's Effect requirements reach every Story
  of every host that places it, so a missing fake is a type error (MD rule 57).

### Time

- **STR13. A controlled clock that behaves like real time.** Moving time by d produces the same turns, in the same
  order, that production would produce if d passed with nothing else happening, including timer chains that re-arm
  through turns (DD's `lockedOut`). Work takes no virtual time (TST O2).
- **STR14. A total, documented order at equal instants.** Every owner of a deadline (actor schedules, keyed schedule
  keys, `.each` copies, Flow's own waits, fake servers' sleeps, adapter heartbeats and backoff) is ordered, so a run
  never depends on registration accidents (MCH O5; MD rule 9, rule 23).
- **STR15. "Next deadline" is well defined.** Moving to the next deadline skips frozen deadlines (MD rule 1: a frozen
  schedule keeps `dueAt` and is never delivered) and says whether fake sleeps count.
- **STR16. Races are reproducible without a Story-only mode.** The mailbox race (an ending settles while a user event
  is already queued; spike P1) and an arrival between settlement and admission are reproducible with commands that
  have production meaning.
- **STR17. A suspended page.** A Story can model a backgrounded tab: timers do not run for d, then fire overdue
  (M6 2.11; M6B FC56).
- **STR18. Time is readable.** At every frame: `now`, every pending deadline with its owner, path, key and whether it
  is frozen, and each keyed schedule's `dueAt` per key, in a shape consistent with how the snapshot reads lists
  (MD rule 23; N1).

### I/O fakes, at the transport level

- **STR19. Replace the transport, never the adapter.** A Story replaces what the adapter calls (`fetch` or XHR, a
  WebSocket constructor, an `EventSource`, an SDK's structural subset, `KeyValueStore`), so the author's
  classification, decoding, mapping, heartbeats and handshakes run (RQ R37, R38; M6B SR34; MD 2.7.1). Fakes are
  Effect Layers and keep their service's contracts (TST O3; FlowState.plan).
- **STR20. Every ending is producible.** A Story can produce, on the operation it targets: success; each failure
  tag; each author `unknown` tag; and each of Flow's reasons where it can occur: `unknown { Cancelled }`,
  `{ Restored }`, `{ Interrupted }`, `{ Defect }`, `{ StorageRefused }`, `StillUnknown`; `NotSent { Cancelled,
  Restored, Rejected, Overloaded, StorageRefused, Disposed }`; the evidence `Superseded`, `Released`,
  `NothingToResend`, `InFlight`; a read's `Defect` and `Interrupted` (RQ R34; MD 2.7.1, rule 20, rule 37). How an
  ending is produced must respect constraint C3 (the X21 question). *Test:* each row of MD 2.7.1 has a Story.
- **STR21. A fake server holds truth.** A fake server keeps its own state and every request it received, with the
  request's idempotency key and Attempt id, readable at every frame as a value, never only as a pass or fail (RQ R34;
  P20; TST O3). *Test:* "charged once" is checkable against a same-Attempt retry, not by a count.
- **STR22. One fake server per run.** Every tab of a run, and every reload, meets the same fake server; closing a tab
  never interrupts the fake's own work. This holds when the app's setup builds its fake per Runtime (DD's
  `DemoServer`).
- **STR23. Every real sequence is one control away.** A Story can make a fake server or transport: answer, hold and
  release, delay, fail, drop a response, duplicate, reorder, push, disconnect, reconnect, refuse, go silent, flood,
  flap, withhold a greeting or replay, restart its log, keep only the last n, and hold, answer or fail a history
  page (M6B SR35; TST O6's fault list). Controls are part of the static plan, so a property test can emit them as
  literals and the CLI can describe them.
- **STR24. Controls have a defined order.** What runs between a control and the next command is stated, as for sends
  (STR8).
- **STR25. Storage.** Story storage is fresh and in memory, can be seeded with encoded records (including records
  written by an earlier version of a definition), cannot bypass validation, and can delay or refuse an Attempt's
  acknowledgement (to reach `NotSent { Cancelled }` in the acknowledgement window and `StorageRefused`) without
  delaying bootstrap restore (TST O3; PER O6; MD 2.7.13 storage refused row).
- **STR26. Determinism of ids.** Attempt ids and other generated ids are seeded per run, tab name and open count,
  never repeat across reloads, are opaque, and can be compared with each other and with what the fake recorded
  (TST O2).
- **STR27. A fake that waits on host time is reported.** An adapter or fake that uses wall-clock time makes a Story
  fail with a diagnosis, not hang (M6B FC38).

### Lanes and rows

- **STR28. Rows at every frame.** Every lane and session row a view reads (`s.operations`, rule 21, rule 42, rule 59)
  is readable at every frame from the snapshot of that frame, exactly as the view reads it, so `check()`, views and
  Stories agree (MCH O8; AUD F9). An old frame never shows a later row.
- **STR29. Lanes beyond the actor.** Unbound, unplaced, releasing and parked lanes, listed by identity (actor
  identity, contract id, key) with their subject path, flags (including a parked lane's under `cancel` and `allow`)
  and parked endings, are readable at every frame (MD rule 44, rule 53, rule 60, OD25; DLG 11).
- **STR30. Every ending as a record.** Each ending delivered, parked, applied with no incarnation, or turned into
  evidence is a record with: operation, contract, verb, key, Attempt (or none), channel, reason, the event it mapped
  to, its route (current or late, from which leaf), the alternatives declined (rule 15's `LateMayNotLeave`), and the
  copy or subject path (MD 2.7.16). Records are in Runtime order and can be selected by operation and Attempt.

### Entities and the store

- **STR31. Records with merge 4's names.** A Story reads a record at any frame as `{ data, predicted, uncertain,
  unconfirmed }` (E16; MD C27), a record queue's members with their Attempt and retry count, and an answer's rows and
  staleness (EDP O2). A deleted record and a never-loaded record read differently while the tombstone lives (AUD F11).
- **STR32. One home for a queue removal.** A write removed from a record queue (`Superseded`, `Cancelled`,
  `Overloaded`, `Released`) is readable once, in one place, with its reason (DLG 3; MP K11; MD C30).
- **STR33. The three moments of a domain write are separate frames.** Start (prediction and queue join, rule 28),
  settlement (store effects and queue release, rule 27) and admission (lane change) are each observable, so "confirmed
  but still saving" (MD 2.8.1) can be shown and asserted.
- **STR34. Server truth and client truth stay apart.** Server truth is per run; client truth is per tab. A fake never
  writes the store; truth reaches the store only through real responses. A Story can compare them without Flow
  deciding which server field means which record field.
- **STR35. Domain boundaries are reachable.** The 64/65 record-queue boundary with no partial join, FIFO order across
  two actors in one Runtime, an unknown holding the queue until its forced repair settles, `uncertain` set and
  cleared (rules 29–32, 35; EDP V5).

### Streams

- **STR36. Drive a session from the transport.** Every `Feed` signal sequence the adapter can emit (S2, S3, S7) is
  reachable through transport fakes; the resume position the server saw is readable (S4; M6B SR35).
- **STR37. Rows and evidence.** At every frame: each session's row (`connection`, `drop`, `value` on state feeds,
  `last { value, at }`, S5 Q6) and its evidence (each start's answer and basis, `missed`, drops, `Overflow`,
  `Discarded`, the reconnect phase, release state) (M6 2.11, 2.12).
- **STR38. An open stream never blocks.** Draining work does not wait for an open stream to end or for blocked
  external input (TST O2).
- **STR39. Streaming writes.** A write's progress and a Stop mid-stream are observable (M6 2.9; MD rule 21's
  `progress`).

### Persistence, reload, tabs, SSR

- **STR40. Reload.** A Story can close a tab abruptly (no final flush) and open it again, so restore, `Restored`
  endings, held lanes, parked endings, lane records captured mid-write and the delivery order before any external
  event (MD 2.7.13) are checkable (TST O7; PER O2–O6).
- **STR41. Upgrades.** A Story can start from saved records an earlier definition wrote, so adoption by key equality
  and `orphaned` after a version change are checkable (MD 2.9.4, P19; rule 58's "upgrade from a host-only lane" walk).
- **STR42. Tabs.** Two tabs are two Runtimes sharing the run's storage and fakes; a second tab runs without
  persistence and evidence says so; evidence from a closed tab stays, naming its tab (TST O7; PER O7; INS O1).
- **STR43. SSR.** A Story can dehydrate and hydrate (TST O7; SSR O3–O6), including a commit in flight at dehydration
  (`DehydrateCommitInFlight`) and a stream row's `last` rebased by age (M6 2.10).
- **STR44. Lazy entries.** Adoption at a chosen step without a module loader (TST O7; LZ O2).

### Checkpoints, assertions and evidence

- **STR45. Every read works on every frame.** Whatever a checkpoint can be asked, any frame can be asked, so a
  "never" assertion can run over every publication (MD 2.8; "never shown twice", rule 33).
- **STR46. Capturing never processes.** A checkpoint captures what is there; whether the cut is quiet is readable
  (TST O4).
- **STR47. Values, not verdicts.** A failed assertion shows the value read and the expected value, the frame and the
  command that produced it, the same in a test runner and through the CLI. A capture never turns into a boolean.
- **STR48. One home per kind of record.** Each kind of cumulative record (endings, verdicts, callbacks and exits,
  lives, resets, repairs, drops, holds, queue removals, session evidence, store repairs and skips, issues,
  diagnostics) has exactly one place to read it, in Runtime order across tabs (INS O1's single sequence).
- **STR49. Records outlive the trace window.** Records a Story reads are kept for the whole run, independent of the
  trace's 4,096-event window, which "cannot prove an absent cause" (INS O4; TST O4).
- **STR50. Bounded size.** Frame storage grows linearly with run length; unchanged data keeps identity across frames
  (PB 4; MCH O8).
- **STR51. Pending work.** At every frame, every unfinished thing is listed with what it waits for: an Attempt
  waiting for acknowledgement, record queues or a capture, or on the wire; a queued arrival with what settlement
  decided; a deadline; an open session. A lane is not listed twice (once as a row, once as work).

### Playback and presentation

- **STR52. Every recorded frame renders correctly.** Lane-gated buttons, `check()` eligibility, stream connection
  states and the "confirmed but still saving" moment render as production would (PB 5; TST O4).
- **STR53. Stepping by command never loses a command.** A command that changed nothing, including a refused send,
  still appears as a step with its cause (PB 6).
- **STR54. The next-action highlight finds keyed and nested controls.** The comparison includes the instance path and
  copy key (PB 6).
- **STR55. Every frame of a multi-tab run is defined,** including one in which a tab is closed.
- **STR56. An apparent stall explains itself.** A frame where work is queued but not yet admitted shows why.
- **STR57. Fragment Stories in playback.** The design says whether a fragment-alone Story can be played, consistent
  with PB's open question 2 (a component's own actor).
- **STR58. Presentations stay typed and callback-free** (PB 6; TST O9).

### CLI, Inspection and static analysis

- **STR59. CLI.** `flow story list`, `describe` (subject, commands, checkpoints, fakes and controls) and `run` work for
  every Story kind; `explain --trace --at <checkpoint>` answers lane, ending, store and session questions from
  recorded evidence only (CLI O1, O2, O4).
- **STR60. Trace artifacts.** Every new record kind has a place in INS O4's closed import schema and follows INS O5's
  redaction.
- **STR61. Coverage.** Coverage (MD T2) also reports which write-lane cells, stream cells, ending handlers (current
  and late) and Flow reasons the Story set reached.
- **STR62. Story-derived warnings keep their input.** The facts `flow check` reads from Story traces (unnamed denial
  codes, repairs, dropped raises, declines from another path, mapper read-after-write) stay in the trace.
- **STR63. Types catch mistakes.** Unknown checkpoint names, wrong instance paths or keys, unsendable events, a fake
  that does not satisfy a requirement, an undeclared control, a read of an operation the actor does not declare, and a
  fragment-alone Story handed to something that needs an app are type errors (TST V1). Private fields are typed in
  Story reads (MD 2.2.2).
- **STR64. Stories do not break static analysis.** No Story construct is invisible to `flow check`, `flow graph` or
  `flow explain`; reading a Story needs no execution.

### Reachability

- **STR65. Every reachable write-lane cell.** Every reachable cell of MD 2.7.13's holding table (33 per holding
  policy), the `cancel`/`allow` table, the `Held (parked)` sub-table, 2.9.3's fragment rows and releasing rows is
  reachable through production paths, and every "cannot occur" cell can be shown not to occur where it is testable.
  The two hydration cells are untestable by construction (MD G6).
- **STR66. Every defined stream cell.** M6 3.1's 55 defined cells, 3.4's 32, 3.3's 18 and 3.5's 6 are reachable the
  same way (SM RESULTS).
- **STR67. The policy suite needs nothing extra.** Flow's own policy suite drives the real Runtime under the TestClock
  (MD 2.7.13; MP X33). Whatever it uses to reach a cell is either a Story or the same executor, never a second path.
  A clean Runtime shutdown with queued work stays out of the app-facing API (OD23 Q41).
- **STR68. Exploration after `model()`.** The design says how an author finds a sequence they did not write (the job
  `model()` did) on the real Runtime, or states the cut (MD T1).

### Property tests and the needs to weigh

- **STR69. Property tests are Stories.** `propertyTest` generates ordinary Stories; every fault it injects is a
  control a hand-written Story can also write; a failure shrinks to a literal Story that runs and plays back
  (TST O6; EDP O4).
- **STR70. Weigh: worlds generated from contracts** (NS #19). An author states invariants ("never charge twice") and
  Flow searches adversarial sequences of endings, drops, reorders and clock jumps. The design says whether its concepts
  allow this later without a second runtime, or why not.
- **STR71. Weigh: record and replay** (NS #20). A real session's events, service answers, transport signals and clock
  become a Story to edit. The design says whether this is in reach, and what identity it needs (stable events, secret
  redaction, rot when the machine changes).
- **STR72. Weigh: one controller for the world** (NS #21). Time, network, server state and storage are controlled
  from one place with one style. The design says whether its fakes and controls have one style across writes, reads,
  streams, storage and time.

## 3. Constraints from the merged design

Fixed unless noted. Spellings in MD's examples that are marked *Story reads: merge 3* are not binding.

- **C1. One runtime.** "One Runtime runs every host, React tree, server request, Story and CLI command" (RT goal).
  Model-based exploration is cut because it is a second execution path (MD T1). The executable lane and stream models
  are design checks, not suites (MD 2.7.13; MP X33). `check()` stays; it runs the same turn algorithm (MD "Changes
  after review").
- **C2. Mapped events come only from endings** (MD rule 47; OD23 Q33; ODP S15). No Story sends one.
- **C3. Open owner question X21** (MP X21, Q2; MD 2.7.2, 2.7.11, C53). TST O3 says fakes "cannot inject operation
  outcomes directly" and MD 2.7.2 says "no ending is injected"; MD 2.7.11 says "every ending can be produced through
  services"; MD rule 47 and 2.7.13 name a Story driver that drives an ending "through the operation", addressing an
  unbound lane by identity, and an error when nothing is on the wire. The designer recommends one answer with reasons;
  the owner decides. Both sides' needs stand: real classification runs (RQ R38), and every ending is reachable (RQ R34).
- **C4. Plans as data.** TST O1: "Scenario commands accept no arbitrary callbacks, conditional branches, live handles or
  raw state overrides." MD 2.7.11's checkpoint predicate and M6 2.11's callback-style controls contradict this and are
  marked as spellings pending this merge. Amending TST O1 is allowed only with the reasons stated.
- **C5. Playback is accepted** (PB; TST O4, O9): record once, then only render; frames are never saved; rendering is
  never a restore or replay; `StoryFrame` renders the app below its `FlowProvider`; clicks are inert; gaps are
  reported; a presentation holds no event callbacks; SSR frames are deferred; PB's open question 2 stays open.
- **C6. Determinism** (TST O2): identical plans, seeds and fake inputs give identical traces; host time and randomness
  never choose order.
- **C7. Lanes** (MD 2.7.13, rule 21): Runtime-owned (OD19); identity (actor identity, contract id, key) (OD20); flags as
  functions of state (OD10); parking (OD21, OD22, OD25); the policy tables; delivery order before any external event;
  rows are snapshot data under `s.operations` (2.7.5; AUD F9); an old snapshot never consults live lanes (MCH O8).
  OD5's principles: a sent Attempt's ending is always delivered; the hold is the default.
- **C8. Settlement and admission** (MD rules 27, 28; E4, E13): store effects publish at settlement, before the ending
  is queued; the lane changes at admission; a Runtime step publishes the rows it changes without a turn (MD 2.5; DLG 6).
- **C9. Routing** (MD rules 14, 15): one owner test at admission; late turns decline alternatives that would leave an
  owning state.
- **C10. Fragments** (F1–F9; MD rules 10, 48–60): nesting hides the level below except summaries' operations
  (rule 57); a fragment's `R` reaches its Stories; F7 fixes fragment Stories with fakes, entering and leaving.
  *Conflict to resolve:* rule 58 spells the fragment Story with the machine Story's constructor; the earlier draft's
  owner decision D1 named the constructor by fragment kind. The designer says which serves the requirements and why.
- **C11. Clean shutdown** (OD23 Q41): a policy-suite test, no Testing API; `closeTab` stays abrupt.
- **C12. Streams decided** (S1–S7): `Feed.live` and `Feed.down` in-band, ordered with values; repair in the adapter,
  `missed` only when nothing could repair; the resume position is an `input` field; the row's fields; `Closed` in
  `failure`; no `persist` on streams; `Feed.CannotRepair`; `emit` returns a promise. Stories replace the transport
  (M6B SR34). M6's Story controls are needs, not spelling.
- **C13. Inspection** (INS O1, O4, O5): one Runtime-global sequence; a Trace keeps 4,096 recent events and never drops
  checkpoints; import validates a closed schema; sensitive values leave the process as digests, raw in process.
- **C14. Persistence** (PER O2–O7): one writer per scope; a second tab runs without persistence; local actors' lanes are
  never persisted (MD 2.7.13 principle 2's exception).
- **C15. Hydration** (MD 2.7.13 SSR row): lanes are never hydrated; a commit in flight at dehydration is evidence.
- **C16. Flow interprets no server semantics** (RQ R36; MD 2.7.1): no standard HTTP status, retry or dedupe meaning in
  Flow; a fake writes its own in Effect.
- **C17. Multiplicity** (MD N1–N3): one reference names one thing, many is a keyed list; a per-call reference names one
  Attempt; existence is explicit (`undefined` before creation, after eviction).
- **C18. Effect conventions**: fakes are Layers; the TestClock drives `Clock`; Schemas decode and encode; follow Effect
  and Schema conventions and check prior art (AGENTS.md).
- **C19. Testing.plan status.** TST is `proposed`. O4 and O9 are PB's accepted contract. Other outcomes are the current
  text and may be amended, each amendment with the sentence it replaces. TST O5 is removed (MD T1).

## 4. Known failure cases

Each is a scenario a design must make impossible, or report clearly. Sources: the two merge-3 reviews (R1 correctness
"C-", R1 simplicity "S-", R2 correctness "C-", R2 writing "W-"), every *Story reads: merge 3* spot in MD, and the
other sources named.

### Endings and server truth

- **STF1. Truth only as a comment.** An author wants "the card was charged once"; Stories offer no read of what the
  fake holds, so the claim is a comment or a callback (RQ P20; MD 2.7.11).
- **STF2. A boolean hides the failure.** A capture that answers true or false fails with no value to look at.
- **STF3. A count passes the wrong case.** "charges === 1" passes when the Runtime re-sent the same Attempt twice and
  the fake deduplicated, and also when a second Attempt replaced the first and the first never arrived (R2 W-H2).
- **STF4. The scripted status means something else.** A fake answers 503; the commit classifies 503 as `unknown`, not
  `Busy`; the Story was written for a retry-after-busy path and passes along the unknown path unnoticed (R2 W-H1).
- **STF5. Unproducible endings.** `NotSent { Cancelled }` before invocation has one window, the acknowledgement, which
  only persisted actors wait for; with a fresh in-memory store that only seeds, a Story cannot open the window. The
  spike invented an actor option for it (MD 2.7.11; SPK).
- **STF6. Delaying acknowledgement delays restore.** A fake storage that delays every write also delays bootstrap
  restore, so opening a tab hangs until the clock moves (R1 C-M3).
- **STF7. Driving an ending that cannot happen.** A Story asks for an ending on a lane with nothing on the wire (MD
  2.7.3). It must not produce an ending production could not.
- **STF8. Injection against classification** (C3). If a Story can name an ending directly, the adapter's
  classification and mapping are skipped; if it cannot, some endings need a fake per reason. Both readings exist in MD
  today (MD 2.7.2, 2.7.11, rule 47; MP X21).
- **STF9. An unbound lane's ending.** After the binding actor is disposed, a Story must drive the lane's ending by
  identity: a shared actor by ref, a local one by machine and input (MD 2.7.13; ODP R8 L6, R9 L6).
- **STF10. A fragment's ending.** An ending of a fragment's operation (`Autosave`'s save) must be driven and read at
  the fragment's subject path, in a host and alone (MD rule 47, rule 58).
- **STF11. `Overloaded` and queue order.** Reaching `NotSent { Overloaded }` and record-queue order needs a fake that
  holds the head's answer plus enough sends; it is not shown that a Story can do it without injection (MD 2.7.11).
- **STF12. Reload mid-write.** "Charged once across a reload" fails or passes depending on whether the write really
  was on the wire at the close, when the fake changes truth, and whether the closed tab's work is interrupted
  (R2 W-H3, C-L2).

### Fakes and scope

- **STF13. Each tab meets another server.** Tabs are independent Runtimes; if fakes are built per tab, the reopened
  tab talks to a fresh fake that never saw the save. DD's `reloaded` does exactly this, because its fake server is a
  setup service (DD `editor.tabs.story.ts`, `demo-api.ts`).
- **STF14. Run-scoped fakes break existing fixtures.** Making fakes per run forbids them from depending on per-tab
  setup services, which every DD fixture does (R1 C-H3; R2 C-H2; TST O3: "Fixtures may depend on setup services").
- **STF15. Partial sharing restarts state.** Sharing only the truth across tabs and rebuilding the rest per tab
  restarts a fake's script position or "dropped first" flag on reload.
- **STF16. A stateful fake has no way to push or disconnect.** Hand-written fakes lack the controls property tests
  and streams need; whether plain Layers are still fakes, and where starting truth comes from, are unclear (R1 C-M7).
- **STF17. Every author invents fake options.** Without a pattern, each author names delay, drop and dedupe
  differently; standard ones would give Flow server semantics (R2 W-M5; C16).
- **STF18. A control's effects have no order.** After a control, it is unclear what ran before the next command
  (R2 C-M3).
- **STF19. A wall-clock adapter hangs the Story** (M6B FC38).

### Time and ordering

- **STF20. Timer chains stop.** If moving time runs no turns, a lockout whose retries re-arm through a turn stops
  after one step; DD's `lockedOut` expects ten minutes to run the chain. Stories then diverge from production
  silently (R2 C-H1).
- **STF21. A race needs a fake command.** The spike needed `advanceHeld` because its `advance` drained every 10 ms;
  TST says moving time makes work eligible without draining it, DD expects it to drain; the readings disagree
  (spike P1; TST O2).
- **STF22. Equal deadlines tie.** A fake's sleep and a Flow schedule at the same instant have no order; keyed
  schedules have no key order (R1 C-M1; MCH O5).
- **STF23. A frozen deadline pins "next".** An overdue frozen deadline makes "move to the next deadline" stay at now
  forever (MD rule 1; TST O2).
- **STF24. Arithmetic instead of reads.** Authors compute times by hand because the next deadline, its owner and a
  key's `dueAt` are not readable; keyed `dueAt` reads clash with how lists are read (R2 W-M2; R1 C-M10).
- **STF25. A send behind queued arrivals.** After time moved and arrivals queued, what a send runs is unspecified; the
  spike drains the whole mailbox (R1 C-M6; MD 2.5).
- **STF26. A pending reset.** A pending reset runs as its own follow-up turn at the head of the mailbox; whether a
  send includes it, and what caused its frame, is unclear (MD rule 1, 2.5).
- **STF27. A timer arrival has no identity.** A queued firing listed as pending work does not say which schedule,
  path or key it came from, and a firing retracted by a freeze stays listed (R2 W-M1, C-L1).

### Lanes, endings and records

- **STF28. A lane on an old snapshot.** A lane row read from a frame captured earlier shows the current lane, or the
  snapshot's field list has no place for it (R1 C-H1; MCH O8).
- **STF29. A lane read needs machine internals.** A Story or view can reach a lane only through something built
  inside the machine body; exporting it breaks locality and select typing; a read by descriptor reads any snapshot
  silently (R2 W-H4; AUD F9).
- **STF30. A wrong key reads idle.** A never-started or evicted lane reads like an idle one, so a wrongly keyed read
  passes (AUD row 4).
- **STF31. `pending` means four things.** The cut's work list, the lane flag, the record's old `pending` (now
  `predicted`, E16) and a phase all use one word; TST still says `pending` for the record (R1 S-M5; MD C27).
- **STF32. The same fact in two places.** Lane state appears as a row and as an entry in pending work, and the two
  once disagreed (R1 S-H1).
- **STF33. Records in five homes.** Endings, repairs, drops, resets and refusals each have their own read (R1 S-H1).
- **STF34. Phases miss states.** A write that is runnable but not invoked, a kept failed or unknown Attempt, and an
  unregistered fake sleep have no phase; the phase word has two vocabularies (R1 C-M5, S-M3; R2 C-M2).
- **STF35. Read lanes and write lanes confused.** A one-off read's lane, a placement's session and rule 21's write
  lane live and end differently; a statement written for one was applied to another (R2 C-M4; MD 2.7.13 lifetime
  table).
- **STF36. "Admitted" means two things:** entering the mailbox and step 1 of the ending's turn (R1 C-H2).
- **STF37. Which ending is which.** Several operations share a lane key, so finding an ending "by key" picks the wrong
  one; authors index by admission order or use literal ids (R1 simplicity; R2 W-M3; MD 2.7.13 key-less addressing).
- **STF38. A key means different things.** An ending's key is a lane key (a record); a copy's key is a string; a lane
  key equals a record key only for some contracts (R1 S-M5; R2 C-M6).
- **STF39. `LateMayNotLeave` has nowhere to be read** (R1 C-M9; MD rule 15).
- **STF40. A magic owner string.** An ending's owner shows as an activation string such as `PAYING#1` (R1 S-M4).
- **STF41. A held unknown nobody reconciles.** A lane held by an unknown, bound or unbound, must be visible to a Story
  as Inspection shows it (MD rule 21; C30; C51).
- **STF42. A parked lane's flags.** Under `cancel` and `allow` a parked unknown's lane is `Held (parked)`; where a
  Story reads `uncertain` for it is unstated (MD OD25; LM N1; OI 19).
- **STF43. Rebind and restore drives.** Disposing the Story's actor and starting another incarnation of the same
  identity, retain expiry, `disposeActor` then ensure, and a restore must each be expressible (MD 2.7.13; OI 19).
- **STF44. Walks the lane model added.** "Every ending of a persisted identity reaches an incarnation of it or a
  fresh start" (including `cancel` and `allow` with Runtime disposal, and an actor record that fails to decode) and
  "an adopted Attempt arrives in a non-initial leaf" must be Stories (MD 2.7.13).

### Entities

- **STF45. Omitted fields look confirmed.** At settlement the fields a response carries are confirmed and omitted ones
  stay predicted until a confirming read; a Story that expects `predicted` false at settlement is wrong (R2 C-M1).
- **STF46. The confirmed-but-saving moment vanishes.** Between settlement and admission the record is confirmed while
  the lane says saving; a per-command frame skips it, so rule 27 cannot be asserted and playback cannot show it
  (MD 2.5, 2.8.1).
- **STF47. "Never shown twice" checked at checkpoints.** A draft and its created record both show for one publication;
  a checkpoint misses it (R2 W-H5; MD rule 33).
- **STF48. Queue removals with no kind.** A superseded, cancelled, overloaded or released queue member has no
  readable place, or two (R2 C-M7; DLG 3; MP K11).
- **STF49. Deleted reads as never loaded** (AUD F11).
- **STF50. Right after an unknown.** What `predicted` and `uncertain` read at settlement of an unknown, and after the
  repair lands, is not shown to authors (R2 W-M4).
- **STF51. Server truth against the store.** Two tabs have two stores and one server; nothing says how a Story
  compares them (MD item 17).
- **STF52. Property-test faults with no Story form.** Each `propertyTest` fault (hold, release, fail, delay,
  reorder, duplicate, lose, push, disconnect, change subscriptions, invalidate, crash and restore, adopt) needs a
  literal Story form, or the shrunk failure cannot be written (R2 C-M5; TST O6).

### Fragments

- **STF53. Callbacks and exits are invisible in a host.** Whether `onLocked` fired, for which copy and with what
  payload, and which exit a subroutine took, are readable only alone (MD rule 11).
- **STF54. Frozen looks active.** A frozen resumable slice stays present while frozen (MD rule 1).
- **STF55. Per-run records read as per-checkpoint.** The lockout example reads callbacks per checkpoint while the rule
  defines them per run; across lives they are cumulative (MD 3.1; R2 W-M7).
- **STF56. A trait alone cannot be left,** so `whenAbandoned` and `.resumable()` cannot be tested alone; a trait
  placed at the stand-in host's root cannot freeze (R1 C-M4; R2 W-M6).
- **STF57. The stand-in host leaks.** Its states, events or names show in reads, causes or denial reasons; a send
  after leaving reads as an unrelated refusal (R2 W-M9).
- **STF58. Two ways to set a stand-in guard,** an option and a command (R1 S-M1).
- **STF59. Callback and exit names collide** in one contract, so a record by name is ambiguous (R1 C-M2).
- **STF60. Two exit shapes.** Exits read alone and exits read in a host have different shapes (R2 W-M8).
- **STF61. A fragment Story's subject belongs to no app,** so discovery, ids and trace identity fail (MD rule 11;
  TST O1).
- **STF62. Rule 58's walks.** Two copies on one lane, the second declined; a freeze during catch-up then thaw with
  `Interrupted` delivered and `resync` looking again; a creating raise meeting an adopted hold; a copy removed during a
  save that gets a 412, re-added, keeping the user's text; an upgrade from a host-only lane; a removed uploading copy,
  reload, nothing parked; two rows of a nested writing trait, one removed; "A, B, A" under `resetOn`; a reload while
  frozen; a reload that loses a pending reset. Each must be a Story with no special support.

### Frames, playback, CLI

- **STF63. A collapsed frame loses its command.** Denied and Unhandled sends publish nothing, identical frames
  collapse, and the command disappears from stepping (PB 6; MCH O3).
- **STF64. Merged causes.** Collapsing frames turns a frame's cause into a list for every consumer (R1 S-H3, C-M8).
- **STF65. A duplicate cause.** A pending-reset cause visible only in publication frames duplicates reset records
  (R1 S-M2).
- **STF66. Quadratic frames.** Each frame copies cumulative records, every truth and every lane; memory grows with the
  square of run length (R1 S-H2).
- **STF67. A disabled button renders enabled.** A frame without lane rows renders a lane-gated Pay button enabled
  (MD 2.7.13 `idle`; PB 5).
- **STF68. The highlight misses a keyed event.** The next event targets a copy or a subroutine and the highlight
  compares tags only (PB 6; MD 3.3).
- **STF69. A closed tab's frame.** A reload Story plays frames between close and open; what a tab view renders for an
  absent tab is undefined.
- **STF70. A stall with no reason.** A publication frame between a settlement and its ending's turn looks stuck.
- **STF71. A fragment Story has nothing to render** (PB open question 2).
- **STF72. A read the Runtime does not emit.** A Story read claims evidence Inspection does not define; Inspection's
  closed import schema has no member for it (R1 C-H4, C-M11).
- **STF73. Ids unique where?** Within an app (TST O1) or across the configuration (R1 C-M11).
- **STF74. Checkpoint before draining.** An author checkpoints right after a send or a control and captures stale
  state silently (R1 simplicity; traps).
- **STF75. A checkpoint named like the run's end** (MD 3.2's `end`; TST O4).
- **STF76. Truncation hides a cause.** A record read from the trace window cannot prove absence (TST O4).

### Streams and exploration

- **STF77. Stories cannot drive a feed:** no push, disconnect, reconnect, resume-position assertion, or backoff on the
  controlled clock (M6B FC16).
- **STF78. A woken page shows an old price as live** until a timer fires; a Story must reproduce suspension (M6B FC56).
- **STF79. No way to find unwritten sequences.** With `model()` gone, an author who used it to find the shortest path
  to a state has only `propertyTest`, which targets domains (MD T1; DD's `exploreEditor`).

## 5. Integration points

| Where | What Stories need from it, or give it |
| --- | --- |
| MD 2.5 (the turn), P21 | the order of turns, pending resets, settlements, Runtime steps; what a command drains |
| MD 2.7.1, 2.7.2 | the ending channels and reasons; the "Server truth in Stories" row (*Story reads*) |
| MD 2.7.3, rule 47 | mapped events; driving endings through the operation (*Story reads*; X21) |
| MD 2.7.5, rules 21, 42, 59 | rows Stories read at a frame |
| MD 2.7.11 | truth, every ending through services, `Overloaded` (*Story reads*) |
| MD 2.7.13, 2.9.3 | the cells to reach; rebind, restore, dispose drives; walks kept as Stories (*Story reads*) |
| MD 2.7.15, PER O2–O7 | lane records, parked endings, captures, acknowledgement, scope, second tab |
| MD 2.7.16 | `ending` evidence fields; `Superseded`, `Released` (*Story reads*) |
| MD 2.8, rules 26–38, EDP O2, O4 | record, queue and answer reads; settlement versus admission (*Story reads*); `propertyTest` |
| MD 2.9, rules 48–60 | subject paths, releasing, freeze and thaw, fragment Stories (rule 58, *Story reads*) |
| MD rules 1, 6–9, 11 | lives, callbacks, exits, repairs, drops; fragment alone |
| MD T1–T3, CLI O1, O2, O5 | `model()` removed; coverage; check, describe, run, explain |
| MD 5 (amendments) C27, C30, C53, C63 | Testing and Inspection rows waiting for this merge |
| MD section 7 items 17, 19 | the Story reads for entity domains and operations |
| M6 2.10–2.12, 3.1–3.6 | transport fakes, session evidence, rows, stream cells |
| INS O1, O4, O5 | evidence kinds, the Trace, redaction |
| MCH O3, O5, O8 | verdicts, schedule order, snapshot field list |
| RT O3, O5, O6, O7 | ensure and identity, context, disposal, isolation |
| RCT O2, O4 | pre-attach snapshots, `useNow`, identity across publications |
| SSR O3–O6, LZ O2 | dehydrate and hydrate; lazy adoption |
| PB; TST O4, O9 | frames, `StoryFrame`, `StoryPlayer`, presentations |
| PKG O1, DIA | `flow-state/testing` exports (`model` removed); `DuplicateFixture`, `StoryTurnLimit`, `InvalidDuration` |
| DD | existing Stories and fixtures to migrate (`editor.story.ts`, `editor.tabs.story.ts`, `queue.story.ts`, `fixtures.ts`, `demo-api.ts`) |
| LM, SM | design checks whose invariants become Stories or policy-suite tests |
| Flow's policy suite | must drive the real Runtime (MP X33) |
| OI 20 | the from-scratch experiment runs after this merge |

## 6. Product cases to walk end to end

Walk each from the real browser API or SDK, through the adapter and Flow, to the view and to what a Story reads and
playback shows. Give each Story in full, with its fakes. The tier of SG1 is given for each.

- **6.1 Checkout with 3-D Secure** (common; ODP 5.1, MD 2.7.3). *As a buyer, I pay once, see "Paying…", retry a
  busy gateway after the server's delay, and am never charged twice across a reload.* Source: `fetch` to a payment
  API with an idempotency key. Walk: success, `Busy` then paid, a dropped response then a same-Attempt retry, a cancel
  in the acknowledgement window, a reload mid-charge, the Pay button disabled while held.
- **6.2 Autosave** (common; ODP 8.2, MD 2.9.6's `Autosave` under `.each`). *As a writer, my edits save 800 ms after I
  stop typing, a newer edit waits behind a save in flight, a conflict keeps my text, and closing a document with an
  unsaved change asks first.* Walk: debounce, edit during save, 412 then "keep mine", force save, `CloseAnyway` then
  unmount, three re-sends offline, a copy removed and re-added mid-save, a reload.
- **6.3 Chat with catch-up** (common live path; M6 4.1). *As a user, I see messages as they arrive, "reconnecting"
  while down, every missed message after, and a notice if some history is gone.* Source: WebSocket through
  `effect/socket`, a paged HTTP history. Walk: drop and replay, flapping, a failed then paged repair, retention
  shorter than the gap, a server log reset, token expiry, a reload mid-repair, a suspended tab.
- **6.4 Kanban board with likes** (uncommon; MD 2.9.6's board and `LikeButton`, MD 2.8.2's domain). *As a team
  member, I like cards on a board; a like is never lost when the card leaves the column; another tab's change shows.*
  Walk: a like that ends unknown on a card removed and re-added; record-queue order across two actors; a 65th queued
  write; "never shown twice" for a created card; two tabs with one server.
- **6.5 Onboarding wizard** (uncommon; ODP 9.6, MD 3.2's `Confirm` subroutine). *As a new user, I move through steps,
  can discard with a confirm dialog, and the final submit never sends an old profile.* Walk: a held profile save while
  submit is guarded on it; the subroutine's exits and `.leave()`; an input-free local machine adopting a previous
  hold.
- **6.6 LLM answer with Stop** (uncommon; M6 4.4). *As a user, I see tokens appear, press Stop and ask again, and a
  cut-off answer shows as incomplete.* Source: `fetch` with a streamed body inside a commit. Walk: progress per token,
  Stop mid-stream (`unknown { Cancelled }`), ask again under `reject`, a terminator missing.
- **6.7 A fragment reused on two hosts** (uncommon; MD 2.9.6: `LikeButton` on the board's `.each` and at an issue
  page's root). *As an author, I test the like button once alone, and each host's Stories still see what it did.*
  Walk: the fragment alone (enter, toggle, unknown, leave with a hold); the same behaviour inside each host at its
  instance path and subject path; a missing fake for its contract as a type error in each host's Story.

## 7. Out of scope

- A sync engine or cross-device ordering (MD 2.7.13 limits): entity domains are client coherence, not sync.
- Saving frames or runs; frames are recomputed by running again (PB 4).
- SSR frames in playback (PB 7).
- Browser presentation (focus, scroll, typing animation) (PB 7).
- Real module loading in Stories (TST O7).
- A Testing API for a clean Runtime shutdown (OD23 Q41).
- Cross-tab coordination beyond what PER O7 defines.
- Executable models as test suites (C1).
- Cursors and outbound live state on streams (M6D S5 Q8; OI 16).
- NS #19–#21 beyond what STR70–STR72 ask the designer to weigh.
