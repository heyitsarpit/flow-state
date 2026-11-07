# Design catch-up: change list (phase 0b)

**Status: proposed**, except where an entry says **decided**. Built from [inventory.md](inventory.md). Each entry
names its anchor in `../../explorations/machine-fragments/machine-design.md` (MD), the exact current text, the exact
replacement, its decision entry and its judge:
- **decided**: the user's own decision (FOR-ARPIT accepted 2026-11-07; R14 D1-D7 approved 2026-11-07). Applied.
- **agent**: a refinement that changes no public name, API shape, guarantee, scope or stated preference, ruled by the
  runner as the reviewing agent would; applied and listed in `workflow/roadmaps/v3-production/progress.md`'s
  review queue. New finding and evidence names carry `[P]`, as MD's own proposed names do.
- **user**: a real conflict. **Not applied.** Listed under "User-judged conflicts" with both texts, a recommendation
  and its reversibility, for the user's label round.

An entry is applied only if its current text occurs exactly once in MD at that moment (Python `str.count`); the apply
log at the end says what was applied, adjusted or skipped. Entries apply in order. The blocks below are read by the
apply script: `~~~~current` and `~~~~new` hold the exact text.

New decision ids: OD32-OD46 (after OD31). New plan rows: C128-C146 (after C127).

## Entries

### E01 Rule 8: a refused ending is redelivered once, then kept (OD38; decided, call 10)

~~~~current
whose actor record no longer decodes is adopted by the fresh incarnation (rule 46).
9. **Many copies: `.each`.**
~~~~
~~~~new
whose actor record no longer decodes is adopted by the fresh incarnation (rule 46).

   **A refused delivery is kept, never lost** (decided, OD38). An ending whose turn is refused (`InvalidTurn`) is
   delivered once more, after the mail already queued; the second refusal is final and its issue says so (`cause`
   names what was thrown). What was refused twice stays with what owes it, at that owner's durability, and ends with
   it: a sent write's ending is parked on its lane, on disk if persisted, and **kept** (rule 21) until it is heard, the
   lane is cancelled or released, or a local life ends; a hold stays the lane's head; a decline is kept on the lane of
   the key it asked for and blocks nothing, a newer decline replacing it; a deadline stays on its record until a turn
   commits it, or its activation ends; a read's answer or a stream's failure is **stranded**, named, until that life
   asks again, ends, or a boot. A kept ending gets one try per boot or adoption.
9. **Many copies: `.each`.**
~~~~

### E02 Rule 21: a kept ending blocks its key (OD38; decided, call 10)

~~~~current
queues and marks are the store's (rule 26).
22. **Memory reads:
~~~~
~~~~new
queues and marks are the store's (rule 26). A **kept** ending (rule 8; OD38) blocks its key until it is heard or let
    go: `idle`, keyed or key-less, denies; a commit declines `NotSent { why: "Rejected" }` and its transition runs;
    `cancel` lets it go, and a key-less `cancel` outside an ending lets go every kept ending of the operation it can
    see. Inspection lists it with the lane.
22. **Memory reads:
~~~~

### E03 Rules 16 and 20: a tab without persistence declines (OD34; decided, call 3, Q4 A)

~~~~current
    "Rejected" }`, and the transition runs (rule 51). A retry on an `InFlight` lane
~~~~
~~~~new
    "Rejected" }`, and the transition runs (rule 51). A persisted identity's commit in a Runtime that runs without
    persistence (a second tab, Persistence O7) ends `NotSent { why: "NoPersistence" }` and its transition runs: no
    cross-tab exactly-once is promised, so the honest answer is "not sent" (decided, OD34). A retry on an `InFlight` lane
~~~~

~~~~current
    persisted identity (`Restored`, `StorageRefused`, `Disposed`), or for a domain write
~~~~
~~~~new
    persisted identity (`Restored`, `StorageRefused`, `Disposed`, `NoPersistence`), or for a domain write
~~~~

### E04 Rule 19: money takes a business key; the server's key as contract data (OD33; decided, call 2, Q6 A; D145 agent)

~~~~current
    evidence `NothingToResend`, and trying again is a new commit.
20. **Required handling**
~~~~
~~~~new
    evidence `NothingToResend`, and trying again is a new commit.
    **Money takes a business key** (decided, OD33). A browser may delete the whole origin, holds included, when a kill
    tears its log (Chrome's own recovery, the prototype's round 8 H3), so `attempt.id` alone can let a second key go
    out beside an unsure first. A write that moves money keys the server by a thing the server recognises (the
    intent, the order), as every money example does. The contract states which key the server sees,
    `idempotency: "attempt"` or the input fields it is, so `flow check` can warn on a money-shaped write keyed by the
    Attempt (decided, Q6 A; built with entities). A server may prune a key: a re-send on an old key reads what the
    server holds first; Flow keeps no key age (agent, D145).
20. **Required handling**
~~~~

### E05 Rule 24: a cancel waits for an acknowledgement being written (OD46; agent, D48)

~~~~current
    `NotSent { why: "Cancelled" }` and the next queued commit is promoted; a re-send returns to `Held` and is released.
~~~~
~~~~new
    `NotSent { why: "Cancelled" }` and the next queued commit is promoted; a re-send returns to `Held` and is released.
    While a never-sent Attempt's acknowledgement is being written, a `cancel` or a `latest` replacement waits for
    storage: stored, the never-sent cell runs; refused, it ends `NotSent { StorageRefused }` (agent, OD46; D48), since
    an acknowledged Attempt may restore as unknown.
~~~~

### E06 (rule 25) not applied: see U1.

### E07 Rule 37: a read mapper's throw ends in `Defect` (OD37; decided, call 8)

~~~~current
    or interruption ends on `failure` as `Defect` or `Interrupted`, a lookup cut by a freeze included (rule 52); a tag record must map them (rule 20;
    2.8.10).
~~~~
~~~~new
    or interruption ends on `failure` as `Defect` or `Interrupted`, a lookup cut by a freeze included (rule 52); a tag record must map them (rule 20;
    2.8.10). A read whose mapper throws, or returns something with no shape, ends in `failure` as `Defect`, and the
    store's `UserClosure` issue says why: a machine never hears success for data the store could not take (decided,
    OD37).
~~~~

### E08 Rule 39: services as contract data; key fields required; a key's canonical text (OD39, OD41, OD44; decided, calls 11, 15, 19, roadmap Q2 B)

~~~~current
`lookup`, `subscribe`, and a stream's `catchUp`), which calls services whose Layer is the swap point.
~~~~
~~~~new
`lookup`, `subscribe`, and a stream's `catchUp`), which calls services whose Layer is the swap point. A contract
    lists those services as values beside its function, `services: [ShopApi]`, required on every contract and checked
    against the function's `R`: a list that misses one is a type error. The Runtime's boot is given them as a Layer
    typed by the machines' `R`, and refuses, by machine, operation and service, an operation whose service it lacks,
    so no write is marked unknown for a missing service; Inspection prints the list (decided, OD41; FOR-ARPIT call 15,
    the roadmap's Q2 B).
~~~~

~~~~current
are no derived or nested keys, and no default, domain writes included.
~~~~
~~~~new
are no derived or nested keys, and no default, domain writes included. A key field is required and has no default:
    an optional or defaulted one is a construction error (`KeyFieldOptional` [P]; decided, OD39), since an absent value
    is never a key value. A key is stored in its canonical text, and a value JSON cannot carry gets a stable name, so
    a `bigint` key `1n` restores as `"$1n"` and names the same lane (decided, OD44).
~~~~

### E09 2.7.15: a contract's key is part of its version (OD39; decided, calls 12, Q1 A, Q2 A, round 13's H2)

~~~~current
  Schema, goes to `orphaned` (P19). Changing a contract's key fields is therefore a persistence break, as changing
  an entity's `primaryKey` is.
~~~~
~~~~new
  Schema, goes to `orphaned` (P19).
- **A contract's key is part of its version** (decided, OD39). Each lane is stamped at mint with its key's
  fingerprint: the field names and each key field's encoded JSON Schema, compared structurally, ignoring annotations
  (so a branded `Schema.String` keeps the version, and `Schema.String` to `Schema.Number` under one name does not;
  Q1 A). A release that changes it makes a new version of the operation; reordering key fields changes nothing. A lane
  of another version is an **old-version hold**: never renamed or matched against a new key, and reported at each boot
  (`OldVersionLane` [P], an issue). Until it ends, every commit of that operation for that actor declines
  `NotSent { why: "OldVersion" }` and its transition runs, under every policy, `serialize` included, and a keyed
  `idle` denies. The contract declares its earlier keys, `previous: [{ key: { k: Schema.String } }]`, which gives
  typed members `O.x.previous[i].retry(k)` and `O.x.previous[i].cancel(k)` naming the old lanes by their own keys
  (Q2 A). A key change is a migration: a release that changes a key ships handlers for its old holds.
~~~~

### E10 2.2.2: one default per field, at both doors (OD40; decided, call 13, round 13's H1)

~~~~current
  computed), or absence for an optional key. A field with none is a type error. `Flow.input` and
  `Flow.initial` never go on the same field.
~~~~
~~~~new
  computed), or absence for an optional key. A field with none is a type error. `Flow.input` and
  `Flow.initial` never go on the same field.
- **A field has one default, the same at creation and at restore** (decided, OD40): whichever its Schema states, a
  constructor or a decoding default, or `Flow.initial`'s constant. Two different defaults, or a Schema default beside
  `Flow.initial`, are a construction error (`TwoDefaults` [P]), found from the Schema's structure, never by evaluating
  them. A default is evaluated for each actor at each door, never computed once and shared (round 13's H1). At
  restore, a field the record lacks (a release added it) takes that default, or runs its computed initial over the
  restored fields; an optional key stays absent; an input field with no default refuses the record
  (`RestoreMissingInput` [P]), which then quarantines it.
~~~~

### E11 2.2.2: no singleton input (OD45; decided, R14 D4)

~~~~current
a value-named ref's value, `actorRef(M, ticket)`; a singleton's `ensure(ref, { input })`; a local actor's
~~~~
~~~~new
a value-named ref's value, `actorRef(M, ticket)`; a local actor's
~~~~

~~~~current
A singleton's and a local actor's
  input keep their fields' one default.
~~~~
~~~~new
A local actor's
  input keeps its fields' one default; a singleton has no input (rule 74; R14 D4).
~~~~

### E12 Rule 74 and 2.7.19: the ref form is fixed per machine (OD45; decided, R14 D4)

~~~~current
`useActorByRef(ref, {})`), because the value is the input. **A singleton:** a literal string name (a runtime
    `string` is a type error); its input, if declared, is given at ensure, the first accepted input wins, and a
    different later one reports `InputIgnored`, the only place it remains. A machine with no input is a singleton.
~~~~
~~~~new
`useActorByRef(ref, {})`), because the value is the input. **A singleton:** a literal string name (a runtime
    `string` is a type error). The form is fixed per machine, in the types (decided, OD45; R14 D4): a machine with
    input fields is named only by a value, and a machine with no input only by a literal name, so a singleton takes
    no input and `InputIgnored` no longer exists.
~~~~

~~~~current
to strings (2.2.2). The identity encodes them in field-name order, so a reorder changes nothing.
~~~~
~~~~new
to strings (2.2.2). The identity encodes them with their Schemas, in field-name order, so a reorder changes nothing
      (R14 D4).
~~~~

~~~~current
field's encoded Schema, is a new version.
~~~~
~~~~new
field's encoded Schema (compared structurally, ignoring annotations, as an operation's key is, 2.7.15; OD46), is a new version.
~~~~

~~~~current
    - One machine reached in both forms, or two refs of one identity with different `persist` or `context`, is
      `ConflictingActorRef` at ensure [P].
~~~~
~~~~new
    - Two refs of one identity with different `persist` or `context` are `ConflictingActorRef` at ensure [P]; one
      machine in both forms cannot be written (R14 D4).
~~~~

~~~~current
actorRef(SessionMachine, "coordinator", { persist: true });   // a singleton: a literal name, input at ensure
~~~~
~~~~new
actorRef(SessionMachine, "coordinator", { persist: true });   // a singleton: a literal name, no input (R14 D4)
~~~~

~~~~current
An app Story ensures a value ref with no
  input (`.ensure(Editor42)`) and a singleton with its input.
~~~~
~~~~new
An app Story ensures a value ref with no
  input (`.ensure(Editor42)`) and a singleton by its name; neither takes input (R14 D4).
~~~~

~~~~current
identity, start a singleton without its input, or adopt a lazy entry.
~~~~
~~~~new
identity, or adopt a lazy entry.
~~~~

### E13 2.7.17 and rule 42: an end parks `Interrupted` for each read it stops (OD45; decided, R14 D1; agent, R14R 9)

~~~~current
3. Its schedules are cancelled and its activities, sessions and unkept reads stopped (Runtime O6's cleanup). The end
   is a trace record with the reason `NoUses`, listing the live work it stopped (Diagnostics).
~~~~
~~~~new
3. Its schedules are cancelled and its activities, sessions and unkept reads stopped (Runtime O6's cleanup). Each read
   it stops parks `failure { Interrupted }` for the identity, as a freeze does (rule 52) (decided, OD45; R14 D1). The end
   is a trace record with the reason `NoUses`, listing the live work it stopped (Diagnostics).
~~~~

~~~~current
starting turn; rule 44's deliveries (parked endings, then each held head's `unknown { Restored }`, once per
incarnation); one `onContext` wave
~~~~
~~~~new
starting turn; rule 44's deliveries (parked endings, then each held head's `unknown { Restored }`, once per
incarnation); the `failure { Interrupted }` of each read its end stopped (R14 D1), on every path that brings it back:
an ensure, a subscription, a send, or a wake at `ready` (agent, OD46); one `onContext` wave
~~~~

~~~~current
request. One-off read lanes are not persisted; the one exception is the `Interrupted` ending a freeze parks, which
    persists with the frozen slice (rule 52).
~~~~
~~~~new
request. One-off read lanes are not persisted; the exceptions are the `Interrupted` ending a freeze parks, which
    persists with the frozen slice (rule 52), and the one an actor's end parks for each read it stops (rule 73; R14 D1).
~~~~

### E14 2.7.17: only the latest arming waits (OD45; decided, R14 D2)

~~~~current
schedules do not fire: a deadline that comes due waits.
~~~~
~~~~new
schedules do not fire: a deadline that comes due waits. Only the latest arming waits: re-arming, disarming or exiting
the schedule's state removes a waiting deadline (decided, OD45; R14 D2).
~~~~

### E15 2.7.17: a return mints a new incarnation id (OD45; decided, R14 D3)

~~~~current
A persisted identity whose record is in the Runtime's copy returns as a new incarnation, restored from that
copy (never re-read from storage), when an ensure, a subscription or a send reaches it.
~~~~
~~~~new
A persisted identity whose record is in the Runtime's copy returns as a new incarnation, with a newly minted
incarnation id, restored from that copy (never re-read from storage), when an ensure, a subscription or a send
reaches it (decided, OD45; R14 D3). An ending owned by the previous incarnation is delivered as adopted: current,
from the active leaf (rules 14, 44).
~~~~

### E16 2.7.17: a local remount within its grace reuses the actor (OD45; decided, R14 D5)

~~~~current
sends follow the table below, and an ensure waits and binds the next incarnation (Runtime O3). When a new
~~~~
~~~~new
sends follow the table below, and an ensure waits and binds the next incarnation (Runtime O3). A local actor
remounted within its grace reuses that actor (decided, OD45; R14 D5). When a new
~~~~

~~~~current
one is disposed at once and the new one adopts its lanes, so the remounted screen receives the ending, not an
invisible predecessor.
~~~~
~~~~new
one is disposed at once and the new one starts fresh and adopts its lanes, so the remounted screen receives the
ending, not an invisible predecessor.
~~~~

### E17 Rule 44 and 2.7.13: after `disposeActor`, endings stay on the lane record (OD45; decided, R14 D6)

~~~~current
    with no live actor incarnation is parked raw on its lane record for the identity's saved record, if one exists, and mapped
~~~~
~~~~new
    with no live actor incarnation is parked raw on its lane record for the identity's saved record, if one exists, or,
    after `disposeActor`, on the unbound lane record alone, for a later ensure of the identity (R14 D6), and mapped
~~~~

~~~~current
It is
evidence only when no record of the identity survives (`disposeActor`, `forget`, a non-persisted or local identity).
~~~~
~~~~new
After `disposeActor` the ending stays on its lane record, unbound, and a later ensure of the identity adopts it with
the lane (decided, OD45; R14 D6). It is evidence only when no record of the identity survives at all (`forget`, a
non-persisted or local identity).
~~~~

### E18 2.7.17: an undecodable record reads `quarantined` (OD45; decided, R14 D7)

~~~~current
reload, or a return after an end. An ensure over a record that no longer decodes discards it (`RestoreDiscarded`),
adopts the identity's lanes (rule 46) and creates from input.
~~~~
~~~~new
reload, or a return after an end. An ensure over a record that no longer decodes starts fresh and reports
`RecordUndecodable` (evidence), adopts the identity's lanes (rule 46) and creates from input (decided, OD45; R14 D7).
~~~~

~~~~current
once per revision; lifecycle `active`, since any ensure or send brings that state back); with neither, the
~~~~
~~~~new
once per revision; lifecycle `active`, since any ensure or send brings that state back; a record that does not decode
reads lifecycle `"quarantined"` with its issue, R14 D7); with neither, the
~~~~

### E19 2.5 step 1: each actor's mailbox; actors in rotation (OD36; decided, call 6)

~~~~current
   - Otherwise, take the oldest event from the mailbox. The mailbox is FIFO in admission order: user sends,
     call endings, stream deliveries, timer firings and `onContext` events queue together;
~~~~
~~~~new
   - Otherwise, take the next event. Each actor's mailbox is FIFO in admission order: user sends,
     call endings, stream deliveries, timer firings and `onContext` events queue together. Across actors (decided,
     OD36): follow-ups run first, up to their bound; otherwise one event from the next actor in rotation, oldest first
     within that actor; an actor joins the rotation at its first event and goes to the back after each. Nothing
     orders two actors' turns unless a turn links them, so bulk work on one actor never starves another, and
     entities must not assume a global order;
~~~~

### E20 Section 5, P21 (OD36; decided, call 6)

~~~~current
| P21 | Runtime O4, Machines O7 | The mailbox is FIFO in admission order.
~~~~
~~~~new
| P21 | Runtime O4, Machines O7 | Each actor's mailbox is FIFO in admission order; actors take turns in rotation, and nothing orders two actors' turns unless a turn links them (2.5 step 1; amended by C136, OD36).
~~~~

### E21 2.5 step 1: work runs in slices; a spin is never cut (OD36; decided, call 5, Q5 A)

~~~~current
   - A timer of a dead activation is discarded here (Machines O5).
~~~~
~~~~new
   - **Work runs in slices** (decided, OD36). The driver serves mail for a slice of time, then yields a real task to
     the page; the slice decides when, never what. A spin, a handler that asks again on its own ending, is never
     stopped, slowed or cut: it runs at task rate, hidden tabs included, until a press or a move ends it.
     `TurnStorm` [P] (evidence) names one operation failing with the same input many times in a row, and `flow
     check`'s `AsksForever` [P] a handler whose every path asks again; neither decides anything. A backoff belongs on
     an explicit retry with a delay (Q5 A).
   - A timer of a dead activation is discarded here (Machines O5).
~~~~

### E22 2.7.20 (new): the host's store, the page lifecycle and the lock (OD35; decided, calls 4, 9, FOR-ARPIT section 6; agent, D30, D83, D94, D95, D99, D111, D146)

~~~~current
### 2.8 Server calls and entity domains
~~~~
~~~~new
#### 2.7.20 The host: capture, the page lifecycle and the lock

What a browser host must do for 2.7.13's write-ahead to hold (decided, OD35, except where marked agent). It is the
host adapter's contract (Persistence O3, O6, O7), proved by the prototype's edge on Chrome and, once, on Safari.

- **Capture interval.** Plain memory coalesces for 5 s, flushed at once on `visibilitychange` to hidden and on
  `pagehide` (decided 2026-11-02, FOR-ARPIT call 4). A batch that touches a lane or a send is written at once, with
  everything dirty, so a lane never outruns its actor; a first send's capture and acknowledgement are one batch with
  the turn that committed it (rule 44; OD32). A hidden page writes at once, backoff apart.
- **The store's contract** (agent). Batches are atomic and commit in issue order; per key a later write wins, whatever
  order the answers come in; one plain write per key is out at a time; an awaited write waits for any plain batch of
  its actor still out, and carries what that batch owed. A batch answers "landed" only if every request in it
  succeeded.
- **Silent storage** (agent). A write the disk has not answered is pending, never "not sent": no ending is invented
  for it, and evidence `StorageSilent` [P] names it after 10 s. A refusal is the only `NotSent { StorageRefused }`.
- **The lock and the back-forward cache** (decided, FOR-ARPIT call 9). The page holds the persistence lock while it is
  the live page, not for its life. On `pagehide` with `persisted`, after its own flush, the host releases the lock
  and leaves no batch open; on `pageshow` with `persisted` it reloads, which is a new boot.
- **A frozen page runs nothing** (agent). No task, deadline, backoff or capture runs until a thaw; a discard is a kill
  with no `pagehide`.
- **Ids never repeat across boots** (agent). A record names the boot that wrote it, and restore's id floor is the
  largest it reads, so an id on disk is never minted again.
- **Safari's four requirements** (FOR-ARPIT section 6). A batch says "landed" only if every request succeeded, since
  Safari fires `oncomplete` after an `InvalidStateError`; no batch is left open into the back-forward cache, since one
  blocked the next owner's reads in 12 of 12 runs; the lock is lost while the page is cached, so a return must
  reload; a tab close loses the last batch (0 of 6), so on Safari the loss window is the 5 s interval.
- **Stated limits.** Quota and disk durability are unmeasured; a real phone runs them (production phase 8). A wipe of
  the origin after a torn log removes holds too; only a business key prevents a second charge (rule 19).

### 2.8 Server calls and entity domains
~~~~

### E23 2.6.1 (new): what a machine compiles to (OD41; decided, call 14; agent, D206, D215, D216, D223)

~~~~current
### 2.7 Server calls
~~~~
~~~~new
#### 2.6.1 What a machine compiles to

`machine(definition, body)` is the compile (decided, OD41; FOR-ARPIT call 14). Its output, `Compiled`, is plain data
plus **Slots**, each closure named by its place in the definition (`operations.pay.failure.CardDeclined`), and it is
what the Runtime boots, in the same process: there is no runtime codec for `Compiled`. Tools read its data view,
whose closures are names. Records are stored as JSON strings. The rest is agent-judged (OD46):
- `Compiled` carries every event with its payload Schemas, the `Flow.uncertain` events, each memory field (its Schema,
  its one source, `private`), each operation's key fields, input fields and services, and each fragment's kind, events
  and ports. So `flow check`, `flow graph`, `Story.fragment`'s stand-in host and the admission door read data, never
  bodies.
- An operation's key is made from its key fields alone; a key field outside the input, or a missing `events` table, is
  refused when the Runtime is created.
- Every closure is a Slot, and a function in `Compiled` that is not one is refused, so every value a closure returns
  passes one gate.

### 2.7 Server calls
~~~~

### E24 2.10: the prototype's Story API is prior art (OD42; decided, call 16, Q8 A)

~~~~current
### 2.10 Stories

~~~~
~~~~new
### 2.10 Stories

**The prototype's Story API** (round 13, D224: a fixture as the subject, `story.E`, `options.fakes`, `Fake.call`'s
`route`, a synchronous `run()`, a request's `aborted` phase) is prior art: production builds this section as designed,
with fixture Layers and an async `run()` (decided, OD42; FOR-ARPIT Q8 A).

~~~~

### E25 2.10.14: `flow trace`, `flow graph` and output for people (OD43; decided, calls 17, 18, FOR-ARPIT section 6)

~~~~current
- A Story is data: `flow check` and `flow graph` read its steps without running a Runtime (STR64).
~~~~
~~~~new
- A Story is data: `flow check` and `flow graph` read its steps without running a Runtime (STR64).
- **`flow trace <story> [--at <checkpoint>]`** (decided, OD43; FOR-ARPIT call 17) runs the Story once and prints its
  timeline: each step in its data form, then the Runtime's evidence in that step (turns with the alternative each part
  took, endings, mints, lane cells), the wire's phase changes, and checkpoints with `seq`; `--at` stops there. It
  replaces round 7's `flow trace summarize <file>`; `flow explain --trace --at` stays the point form, and a trace file,
  `diff` and `--actor` come with Inspection O4's export.
- **`flow graph <machine>`** (decided, OD43; FOR-ARPIT call 18) prints one edge per alternative, named by its place in
  the source, so an edge and the Runtime's `turn` record share one name. Each edge says what decides it (a state
  token, an `idle` or `retryable` lane fact, a port, a closure) and is marked `late`, `shadowed`, `unreached` or
  `unsourced` when the data says it cannot be taken. Fillings, schedule triggers and `whenAbandoned` callbacks are
  edges: a filling runs from the host's leaf under the placing node, a `whenAbandoned` callback in the turn that ends
  its life (a resumable one's also when its frozen life ends). What data cannot say (follow-up closures, module
  blocks) is listed as `unseen`. Every transition the Runtime takes is an edge, and every edge can be taken or is
  marked, so the graph is a conformance check.
- **Output for people** (OD43; FOR-ARPIT section 6): source locations (`pay.machine.ts:42`), not Slot paths; a trace
  that reads like the Story, not evidence sequence numbers; a graph grouped by state. The user accepts the outputs in
  production (the roadmap's phase 5).
~~~~

### E26 Rules 12 and 13: construction-error names (OD46; agent, D120, D124, D138, D139, D220)

~~~~current
      - a `resetOn` returning anything but a string, `null` or `undefined` on a placement that owns a mapped write (rule 48).
~~~~
~~~~new
      - a `resetOn` returning anything but a string, `null` or `undefined` on a placement that owns a mapped write (rule 48);
      - a state named `self` or `__proto__` (`ReservedStateName` [P]), and an `unknown:` target that is not a
        `Flow.uncertain` event or `Flow.ignore` (`UnknownNotUncertain` [P]) (agent, OD46).
    - **Values with no form.** A `Symbol`, function, `Map` or `Set` where a value must be carried is
      `UnencodableValue` [P]; `flow check` names each input field whose decoded form cannot be carried
      (`InputFieldForm` [P], a warning) (agent, OD46).
~~~~

### E27 (folded into E08.)

### E30 First-send click loss: a never-acknowledged head is never on disk (OD32; decided, call 1, Q3 A)

~~~~current
    (and, on a reload, `NotSent { Restored }` for never-acknowledged work); an `InFlight` lane's ending when it lands.
~~~~
~~~~new
    (and, on a reload, `NotSent { Restored }` for each queued commit `W`, never sent; a head is on disk only once its
    first send's batch landed, so it restores as unknown, OD32); an `InFlight` lane's ending when it lands.
~~~~

~~~~current
the Runtime cannot know whether invocation began before the crash (G1), so `retry` may be its first send, which the idempotency key makes safe; one never acknowledged ends `NotSent { Restored }`; each `W` entry ends
~~~~
~~~~new
the Runtime cannot know whether invocation began before the crash (G1), so `retry` may be its first send, which the idempotency key makes safe; a first send's capture and acknowledgement are one batch with the turn that committed it, so a kill before that batch lands restores the state before that turn, with no lane and no ending (decided, OD32; FOR-ARPIT call 1); each `W` entry ends
~~~~

~~~~current
and waiting to be invoked; an unknown, a retry and a restore never promote (R7 M1). In particular, a restore that
ends a never-acknowledged head `NotSent { Restored }` promotes nothing: its `W` entries end the same way, so the lane
becomes `Idle` (G5).
~~~~
~~~~new
and waiting to be invoked; an unknown, a retry and a restore never promote (R7 M1). A never-acknowledged head is
never on disk (OD32), so G5's restore of one cannot occur; a restore's `W` entries end `NotSent { Restored }` and
promote nothing.
~~~~

~~~~current
outcome was parked, G3), or its `NotSent { Restored }` if it was never acknowledged (reload only), then, on a
   reload only, each `W` entry's `NotSent { Restored }` (C2; R10 L2);
~~~~
~~~~new
outcome was parked, G3), then, on a reload only, each `W` entry's `NotSent { Restored }` (C2; R10 L2); a head never
   acknowledged is not on disk (OD32);
~~~~

~~~~current
never acknowledged: `NotSent { Restored }`, delivered (R9 L4)
~~~~
~~~~new
never acknowledged: cannot occur, since its first send's batch never landed (OD32)
~~~~

~~~~current
| `NotSent { Restored }` | `reload` with the acknowledgement held (not stored: aborted with the tab, 2.10.4); each queued `W` entry of the restored lane |
~~~~
~~~~new
| `NotSent { Restored }` | each queued `W` entry of the restored lane; a `reload` with a first send's acknowledgement held (aborted with the tab, 2.10.4) restores the state before its turn, with no ending (OD32) |
~~~~

~~~~current
acknowledgement held, so aborted (`NotSent { Restored }`); with a `W` entry queued
~~~~
~~~~new
acknowledgement held, so aborted (the state before the click comes back, with no ending; OD32); with a `W` entry queued
~~~~

### E34 2.7.17: every incarnation a reload or a return restores is new (OD46; agent, R14R 2)

~~~~current
then the event that restored it, if a send. Each schedule follows Machines O5.
~~~~
~~~~new
then the event that restored it, if a send. Each schedule follows Machines O5. A reload is a new incarnation too, for
an actor restored live at `ready` and for a record kept at `ready` when it is reached: each mints new ids for the actor
and for every fragment incarnation the record restores, and the owner test reads the restored activations through the
record (2.7.13) (agent, OD46).
~~~~

### E35 2.7.17: what `ready` creates (OD46; agent, R14R 3)

~~~~current
A hydrated actor activates at its `Hydrate` commit under `Hydrate`'s hold.
~~~~
~~~~new
A hydrated actor activates at its `Hydrate` commit under `Hydrate`'s hold. `ready` creates nothing: a parked ending
whose identity has no actor record (after `disposeActor`, R14 D6) stays on its lane record until an ensure; a record
kept at `ready` whose lane is `Held` is not woken, and evidence and Inspection name it, so the hold is visible before
its next use (agent, OD46).
~~~~

### E36 2.7.17's state table: an undecodable record (OD46; agent, R14R 6, following R14 D7)

~~~~current
| Quarantined (the ref's failure and Cause) | Runtime disposal |
~~~~
~~~~new
| Quarantined (the ref's failure and Cause) | Runtime disposal |
| Undecodable record (reads lifecycle `"quarantined"` with its issue, R14 D7) | an ensure (starts fresh, `RecordUndecodable`); `forget`; Runtime disposal |
~~~~

### E37 (folded into E09 and E12: Schemas compared structurally, ignoring annotations; agent, R14R 7.)

### E40 Header: the revision paragraph

~~~~current
[../../proposals/actor-lifetime/proposal-v6.md](../../proposals/actor-lifetime/proposal-v6.md); earlier versions
beside it are prior art.
~~~~
~~~~new
[../../proposals/actor-lifetime/proposal-v6.md](../../proposals/actor-lifetime/proposal-v6.md); earlier versions
beside it are prior art.

**Revision (design catch-up, phase 0, 2026-11-07).** The prototype's newer decisions are recorded: the accepted
`FOR-ARPIT.md` (calls, Q1-Q8, carry-over), the round-14 corrections R14 D1-R14 D7, and agent-judged refinements
(OD32-OD46, C128-C146). Conflicts the user decides are listed, not applied:
[../../proposals/design-catch-up/change-list.md](../../proposals/design-catch-up/change-list.md). R14 D4 amends rule 74:
a singleton takes no input.
~~~~

### E41 Decision log: OD30 amended note, and OD32-OD46

~~~~current
merge [P]: `ConflictingActorRef` for one machine reached in both forms; the names `IdentityFieldOptional` and
  `OldVersionActor`. (2026-11-07)
~~~~
~~~~new
merge [P]: `ConflictingActorRef` for one machine reached in both forms; the names `IdentityFieldOptional` and
  `OldVersionActor`. (2026-11-07) *Amended by OD45 (R14 D4): the ref form is fixed per machine, so a singleton takes
  no input and one machine in both forms cannot be written; `ConflictingActorRef` covers `persist` and `context`.*
~~~~

~~~~current
`ensure` attaches a use, `dispose` is `disposeActor` (amends the Stories decision W27: `{ how: "now" }` removed), `ActorAbsent` for a
  `detach` with no use held. Amends OD27. (2026-11-07)
~~~~
~~~~new
`ensure` attaches a use, `dispose` is `disposeActor` (amends the Stories decision W27: `{ how: "now" }` removed), `ActorAbsent` for a
  `detach` with no use held. Amends OD27. (2026-11-07)
- **OD32** The user, 2026-11-07, accepting `FOR-ARPIT.md` call 1 and Q3 A (the prototype's D86, D96): a first send's
  capture and acknowledgement are one batch with the turn that committed it, so a kill before it lands brings back
  the state before the click with no ending and no notice; a head on disk restores as unknown; `NotSent { Restored }`
  is only for queued commits (rule 44, 2.7.13). (2026-11-07)
- **OD33** The user, 2026-11-07: call 2 (business keys for money, decided in round 8 after Chrome's wipe on a torn
  log) and Q6 A, the server's key as contract data, `idempotency: "attempt" | fields`, so `flow check` can warn on
  money-shaped writes, built with entities (rule 19). The pruned-key sentence is agent-judged (OD46; D145).
  (2026-11-07)
- **OD34** The user, 2026-11-07: call 3, Q4 A: a persisted identity's commit in a tab without the lock ends
  `NotSent { NoPersistence }` (rules 16, 20). Cross-tab exactly-once is not promised. (2026-11-07)
- **OD35** The user, 2026-11-07: call 4 (5 s capture, flush on hide; decided 2026-11-02), call 9 (the lock released
  on `pagehide` with `persisted`, a return reloads; D148) and FOR-ARPIT section 6's Safari requirements, as 2.7.20.
  Its store-contract, silent-storage, frozen-page and id-floor bullets are agent-judged (OD46). (2026-11-07)
- **OD36** The user, 2026-11-07: calls 5 and 6, Q5 A (D122): mail per actor in rotation, follow-ups first; a spin is
  never stopped, slowed or cut; `TurnStorm` and `AsksForever` name and decide nothing; a backoff waits for an
  explicit retry with a delay (2.5 step 1, P21). (2026-11-07)
- **OD37** The user, 2026-11-07: call 8 (D147): a read mapper's throw or shapeless result ends `Defect` (rule 37).
  (2026-11-07)
- **OD38** The user, 2026-11-07: call 10 (D50, D118, D123): a refused ending is redelivered once, then kept with what
  owes it; a kept write ending blocks its key until heard or let go (rules 8, 21). (2026-11-07)
- **OD39** The user, 2026-11-07: calls 11 and 12, Q1 A, Q2 A (D221, round 13's H2 and M3): key fields required and
  default-free; a contract's key fingerprint (names plus each field's encoded JSON Schema) is part of its version;
  old-version holds decline every commit with `NotSent { OldVersion }`, are reported as `OldVersionLane`, and are
  reached through `previous: [{ key }]`; the `within` narrowing is cut (rule 39, 2.7.15). (2026-11-07)
- **OD40** The user, 2026-11-07: call 13 (D222, D214) and round 13's H1 fix: one default per field at creation and
  restore, `TwoDefaults` from the Schema's structure, evaluated per actor at each door (2.2.2). Whether a default
  may read a clock is open, U12. (2026-11-07)
- **OD41** The user, 2026-11-07: call 14 (D194) and call 15 (D213) with the roadmap's Q2 B: no runtime codec for
  `Compiled`; a required `services` list on every contract, checked against its `R`, refused by name at boot (rule
  39, 2.6.1). The rest of 2.6.1 is agent-judged (OD46). (2026-11-07)
- **OD42** The user, 2026-11-07: call 16, Q8 A: 2.10 is built as designed; the prototype's Story spellings (D224) are
  prior art. (2026-11-07)
- **OD43** The user, 2026-11-07: calls 17 and 18 (D225, D226) and FOR-ARPIT section 6's CLI output: `flow trace
  <story>`, `flow graph` with one edge per alternative, output for people (2.10.14). (2026-11-07)
- **OD44** The user, 2026-11-07: call 19's D119 (a key's canonical text; `1n` restores as `"$1n"`, rule 39). Call 19's
  D228 and call 20's limits L1-L15 are the suite's, not this design's. (2026-11-07)
- **OD45** The user, 2026-11-07, approving the round-14 review's corrections R14 D1-R14 D7: an end parks
  `failure { Interrupted }` per stopped read, delivered after the restored deliveries; only the latest arming waits;
  a return mints a new incarnation id, a previous incarnation's ending delivered as adopted; the ref form fixed per
  machine in the types, `ConflictingActorRef` for `persist` and `context` only, identity encoded with its Schemas; a
  local remount within its grace reuses the actor, one kept only by work is disposed and its lanes adopted by a fresh
  one; after `disposeActor` endings stay on the lane record for a later ensure, with no record at all evidence only;
  an undecodable record reads `quarantined`, and an ensure starts fresh with `RecordUndecodable` (rules 42, 44, 74,
  2.2.2, 2.7.13, 2.7.17, 2.7.19). (2026-11-07)
- **OD46** Agent-judged, the phase 0b builder, 2026-11-07, under the roadmap's judge rule, each listed in
  `workflow/roadmaps/v3-production/progress.md` for the user's read: D48 (rule 24), D145's pruned keys (rule 19),
  2.7.20's agent bullets (D30, D83, D94, D95, D99, D111, D146), 2.6.1's agent bullets (D206, D215, D216, D223), the
  names `ReservedStateName`, `UnknownNotUncertain`, `UnencodableValue`, `InputFieldForm`, `StorageSilent`,
  `TurnStorm`, `AsksForever`, `KeyFieldOptional`, `OldVersionLane`, `TwoDefaults`, `RestoreMissingInput` [P], and
  round 14's final-review items R14R 2, 3, 6, 7, 9 (2.7.15, rule 74, 2.7.17). Reversible by reverting the design
  commit; the user may overrule any of them. (2026-11-07)
~~~~

### E42 Section 5: plan rows C128-C146

~~~~current
and V-MT2's "retain across tabs" with "uses across tabs" |
~~~~
~~~~new
and V-MT2's "retain across tabs" with "uses across tabs" |
| C128 | Persistence O6, Operations O3 | A first send's capture and acknowledgement are one batch with its turn; a kill before it lands restores the state before that turn, with no ending; `NotSent { Restored }` only for queued commits (OD32) | Amends O3's restore sentence and O6's acknowledgement; the sentences are named at the phase 2 merge |
| C129 | Operations O1 | Money writes take a business key; a contract states `idempotency: "attempt" \| fields`; a server may prune keys, so a re-send on an old key reads first (rule 19; OD33) | Adds |
| C130 | Operations O3, O7, Persistence O7 | `NotSent { NoPersistence }`: a persisted identity's commit in a Runtime without persistence (OD34) | Adds to C2's reasons |
| C131 | Persistence O3, O6, O7, a host adapter plan | 2.7.20: 5 s capture with a flush on hide, lane batches at once, the store contract, silent storage pending (`StorageSilent` [P]), the lock and the back-forward cache, a frozen page, ids never repeated, Safari's four requirements (OD35) | Adds |
| C132 | Runtime O4, Diagnostics | Work in slices; a spin is never cut; `TurnStorm` [P] evidence; `flow check`'s `AsksForever` [P] (OD36) | Adds |
| C133 | EntityDomains O1, Operations O6 | A read mapper's throw or shapeless result ends `failure` `Defect`, with `UserClosure` (rule 37; OD37) | Adds |
| C134 | Runtime O4, Operations O3 | A refused ending is redelivered once; refused twice it is kept with its owner; a kept write ending blocks its key; a read's answer is stranded (rules 8, 21; OD38) | Adds |
| C135 | Operations O1, O3, Persistence O5 | Key fields required (`KeyFieldOptional` [P]); a key's fingerprint is part of the operation's version; old-version holds (`OldVersionLane` [P]), `NotSent { OldVersion }`, `previous: [{ key }]` with typed `previous[i].retry/cancel` (rule 39, 2.7.15; OD39) | Replaces 2.7.15's "Changing a contract's key fields is therefore a persistence break"; adds to C2's reasons |
| C136 | Runtime O4 | Each actor's mailbox is FIFO; across actors follow-ups first, then rotation; nothing orders two actors unless a turn links them (2.5 step 1; OD36) | Amends P21 |
| C137 | Machines O1, React O2 | One default per field at creation and restore (`TwoDefaults` [P]), evaluated per actor; restore of a field the record lacks (`RestoreMissingInput` [P]) (2.2.2; OD40) | Adds |
| C138 | Operations O1, Package O1 | `services: [S]` required on every contract, checked against `R`, refused by name at boot; the boot's Layer is typed by the machines' `R` (rule 39; OD41) | Adds |
| C139 | Runtime O1, CommandLine O5 | `machine()` is the compile; `Compiled` is data plus Slots, booted in process; tools read its data view (2.6.1; OD41, OD46) | Adds |
| C140 | Testing O1-O9 | 2.10 stands; the prototype's Story spellings are prior art (OD42) | No change to the Stories rows |
| C141 | CommandLine O2, O5, Inspection O4 | `flow trace <story> [--at]`; `flow graph`, one edge per alternative with its marks; output with source locations, a story-like trace, a graph by state (2.10.14; OD43) | Replaces round 7's `flow trace summarize <file>` |
| C142 | Operations O1, Persistence O2 | A key's canonical text: a value JSON cannot carry gets a stable name (`1n` as `"$1n"`) (rule 39; OD44) | Adds |
| C143 | Runtime O3, React O2, O3 | R14 D1-D7: an end parks `Interrupted` per stopped read; only the latest arming waits; a return mints a new incarnation id; a local remount within its grace reuses the actor; endings after `disposeActor` stay on the lane record; an undecodable record reads `quarantined` and an ensure starts fresh with `RecordUndecodable` (2.7.17, rules 42, 44; OD45) | Amends C104, C105, C108, C124; replaces 2.7.17's `RestoreDiscarded` |
| C144 | Runtime O3, V1, Persistence O2, O4, React O2 | The ref form is fixed per machine in the types: input fields only by value, none only by a literal name; no singleton input, no `InputIgnored`; `ConflictingActorRef` for `persist` and `context` only; identity encoded with its Schemas (rule 74; OD45) | Amends C117, C118, C119, C120 |
| C145 | Machines O1, Diagnostics, CommandLine O5 | `ReservedStateName`, `UnknownNotUncertain`, `UnencodableValue`, `InputFieldForm` [P] (rules 12, 13; OD46) | Adds |
| C146 | Operations O2 | A `cancel` or `latest` replacement of a never-sent Attempt whose acknowledgement is being written waits for storage (rule 24; D48; OD46) | Adds |
~~~~

## User-judged conflicts (not applied; for the label round)

Each: the question, both texts, the recommendation and why, and how reversible it is. "Design" quotes MD; "Prototype"
quotes the decision record.

**U1. Operation timeouts (rule 25; D8).**
- Design (rule 25, and 2.7.17 from OD31): "No Flow timeout and no Flow retry, of a session or a call"; "a transport
  deadline belongs inside the commit (`Effect.timeoutOrElse`, 2.7.6)".
- Prototype (D8): "`timeout` on operations, per send. Write: `unknown { TimedOut }` at the timer, then interrupt. Read:
  `failure { TimedOut }`. Absent means none. Timer starts at invocation." The user said on 2026-11-01 that rule 25 is
  cancelled and an operation-level timeout should come back (memory, prototypes).
- A: the prototype's `timeout` property and the `TimedOut` reasons. B: keep the design: the timeout is the commit's
  Effect (`Effect.timeoutOrElse(..., () => Outcome.unknown(...))`), as OD28's G classifies lost errors with Effect's
  own words.
- **Recommendation: B**, because OD31 and OD28 (2026-11-07) are newer than the 2026-11-01 remark and say the same, and
  a Flow word adds a second way to spell one Effect. Reversible: easy either way before phase 4.

**U2. Key-less members (rule 43; D22).**
- Design: a key-less member names "that ending's Attempt and, once it is resolved or released, the lane's addressable
  one (holding policies only)".
- Prototype (D22): "Key-less members name the ending's own Attempt only (rule 43's second clause cut)."
- **Recommendation: the prototype**: one meaning, proven by the suite since round 1; the second clause reaches an
  Attempt the handler never saw. Reversible: cheap now, a type-level change after phase 4.

**U3. Restore order within a lane (rule 44, 2.7.13; D107).**
- Design: per lane, "the head's `unknown { Restored }` ... then, on a reload only, each `W` entry's
  `NotSent { Restored }`".
- Prototype (D107): "Restore delivers, per lane, `W`'s `NotSent { Restored }` first, then the head's `unknown`", so the
  hold's route is the last one and a queued press's answer cannot run over the prompt the hold needs.
- **Recommendation: the prototype**, for the trace `Go Go ack KILL`. Reversible: cheap; a delivery-order guarantee, so
  the user's.

**U4. A lane whose key no longer decodes, and key-equality adoption (rule 46, 2.7.15, P19; D20, D88).**
- Design: such a lane "goes to `orphaned` (P19)"; "A recorded path the placement cannot produce is adopted by key
  equality only when the placement's last subject part is the contract's single key field".
- Prototype: D88 "A quarantined lane keeps its id and its hold. A commit on it declines `Rejected`. The record stays on
  disk. Cleared by `cancel` on that key; `orphaned` (P19) stays unbuilt"; D20 cuts key-equality migration.
- **Recommendation: the prototype**, with `orphaned` moved to `revisit.md`: a hold is never dropped, and D221's
  versions now cover key changes. Reversible: moderate (orphaned is unbuilt either way).

**U5. `concurrency: "allow"` (rules 21, 29, N2; D19).**
- Design: `allow` throughout (rows, `HeldThisTurn`, rule N2).
- Prototype (D19): "Cut `allow`. 3 corpus uses, written for coverage. `presence` fits `cancel`; a nudge is `reject`
  with its own key." Never built in rounds 1-13.
- **Recommendation: cut `allow` from v1** and keep its text as prior art in `revisit.md`: no real app needs it and
  nothing has proved it. Reversible: moderate (a lane column to add back later). Scope, so the user's.

**U6. Values that cannot be encoded (D89, D100, D108, D114).**
- Design: silent; rule 22 makes a failing select `InvalidTurn`.
- Prototype: encoding never fails a turn. Memory that cannot encode skips the capture batch and keeps the last good
  one, named; a commit whose input or key cannot encode declines `NotSent { Unencodable }` with the value kept for its
  mapper; a lookup ends `Defect`; a guard key denies; a module value is dropped.
- **Recommendation: the prototype**, with `Unencodable` added to Flow's reasons. Reversible: cheap now; a new reason
  name and a guarantee, so the user's.

**U7. A module's defect (D46).**
- Design: silent on modules.
- Prototype: a module defect fails closed (what joined stays unsent; what would join declines
  `NotSent { ModuleDisabled }`); a core bug is fatal to the Runtime until reload; a user closure outside a turn is an
  issue with a stated default; restore is per record.
- **Recommendation: settle in phase 1** with the entity store, the only module; keep "restore is per record" now
  (already true by rule 46). Reversible: cheap.

**U8. Sends before the Runtime is ready (2.10.17.6; D87).**
- Design: "While a restore read is held, the tab has not finished bootstrap: its persisted actors are absent, and a
  send to one is `ActorAbsent`."
- Prototype (D87): "Queue until boot, with O5's bound. Past `bootMs`, or on a failed read: `StorageFailure`, run
  without persistence, flush the queue."
- **Recommendation: the prototype**, as OD31's send table already queues for an ending persisted target.
  Reversible: cheap.

**U9. Creation checks input; it does not decode (2.2.2; D219).**
- Design: "decode the input with the derived `Input` schema".
- Prototype (D219): "Creation checks a present input by its Schema's type side; it does not run a transforming
  decode", since the creator hands an in-process value, not JSON; a `NumberFromString` field given `"3"` is refused.
- **Recommendation: the prototype.** Reversible: cheap.

**U10. Rule 32: what clears `uncertain` (FOR-ARPIT call 7, Q7 A, against OD28 P1).**
- Design (OD28 P1, 2026-11-07): every unretained unknown is `Released`; "a later write's success still clears it,
  rule 32".
- FOR-ARPIT Q7 A (accepted 2026-11-07): "a later success can't clear a mark, and neither can time. After give-up,
  `uncertain` until the next read, then `unconfirmed`, quiet, until proof"; the plan edits listed for the user's yes
  (`round-9/entity-proposal-2.md` section 5).
- Both are the user's, the same day. **Recommendation: Q7 A**, keeping OD28 P1's release (it is what moves a mark from
  `uncertain` to `unconfirmed`), written into rule 32 and 2.8.6 in phase 1 with the entity store. Reversible: cheap
  until the entity store is built.

**U11. Entity-store decisions (rules 29-31, 2.8.5, 2.8.6; D3, D12, D15, D18, D39, D40, D49's record half, D47 to
D76's judge).** **Recommendation: defer to phase 1**, which builds `round-9/entity-proposal-2.md`; the label round
confirms the deferral. D3's price (a person who has not pressed can stall another actor's writes to one record, made
visible as evidence) is a guarantee and comes back to the user there.

**U12. May a memory default read a clock or randomness (2.2.2, OD40)?**
- Design: "Creation is pure ... No clock, no randomness".
- Round 13's H1 fix (accepted): "evaluate the default per call at each entry point", motivated by
  `withConstructorDefault(Effect.sync(() => new Date()))` and `randomUUID()`.
- A: allowed, evaluated per actor (the value is then not replayable). B: only pure defaults; an effectful Schema
  default on a memory field is a construction error, and a time or an id comes from an event or the Runtime's mint.
- **Recommendation: B**: it keeps creation deterministic (AGENTS.md's core rules) and makes H1 impossible rather than
  fixed. Reversible: cheap.

**U13. Runtime disposal past its bound (Runtime O6, 2.7.13's Runtime-disposal row; round 14's final review).**
- Design: on the wire, "Runtime O6 (settles within its bound, else unknown)"; no reason is named, and C2's list has
  none for it.
- **Recommendation:** within the bound, the ending is parked as the row says; past it, `unknown` with reason
  `Disposed`, reusing the word `NotSent` already has. Reversible: cheap; a reason name, so the user's.

**U14. `disposeActor` durability (Persistence O3; round 14's final review).**
- Design: silent; with a 5 s capture interval (OD35) a crash before the capture brings the record back.
- **Recommendation: flush the removal at once**, as a lane batch is (the prototype's D93 did), rather than state a
  limit. Reversible: cheap.

**U15. `persist` per ref, identity per machine and input (rule 74; round 14's final review).**
- Design: `actorRef(machine, nameOrValue, { persist: true })`; two refs of one identity with different `persist` are
  `ConflictingActorRef` at ensure, so which one is seen first decides.
- A: the first ensure wins (order-dependent). B: `persist` becomes a property of the machine (one fact in one place),
  and refs lose it. C: keep per ref and make every ref of a machine agree at the type level.
- **Recommendation: B**, by the locality rule and because persistence is a fact about the identity. Reversible:
  moderate (API shape).

## Apply log

Run 2026-11-07 by `apply.py` (the builder's scratchpad), which reads the `~~~~current` and `~~~~new` blocks above in
order and applies each only when its current text occurs exactly once in MD at that moment.
- Before the run, one entry was adjusted: E42 first anchored on the start of the C127 row, which would have put
  C128-C146 above C127; it now anchors on the row's end.
- Applied: all 52 blocks of E01-E05, E07-E26, E30, E34-E36, E40-E42. Skipped: none. E06 (U1), E27 (in E08) and E37
  (in E09, E12) have no blocks.
- After the run: OD ids unique (OD1-OD46 and OD2a), C rows C1-C146 with no gap or repeat, no broken relative link in
  MD or this folder. `workflow check`: `DUPLICATE_SPEC_ID` (the `.claude/worktrees/` copy, pre-existing) and
  `SPEC_INDEX_STALE` (the index against the worktree's `.spec` paths; these edits touch no `.spec` file), nothing else.
