# Design catch-up: change list (phase 0b)

**Status: proposed**, except where an entry says **decided**. Built from [inventory.md](inventory.md). Each entry
names its anchor in `../../explorations/machine-fragments/machine-design.md` (MD), the exact current text, the exact
replacement, its decision entry and its judge:
- **decided**: the user's own decision (FOR-ARPIT accepted 2026-11-07; R14 D1-D7 approved 2026-11-07). Applied.
- **agent**: a refinement that changes no public name, API shape, guarantee, scope or stated preference, ruled by the
  runner as the reviewing agent would; applied and listed in `workflow/roadmaps/v3-production/progress.md`'s
  review queue. New finding and evidence names carry `[P]`, as MD's own proposed names do.
- **user**: a real conflict. **Not applied until the user rules.** Listed under "User-judged conflicts" with both texts, a recommendation
  and its reversibility, for the user's label round. Ruled by the user on 2026-11-07 and applied in pass 3.

An entry is applied only if its current text occurs exactly once in MD at that moment (Python `str.count`); the apply
log at the end says what was applied, adjusted or skipped. Entries apply in order. The blocks below are read by the
apply script: `~~~~current` and `~~~~new` hold the exact text.

New decision ids: OD32-OD48 (after OD31; OD47 from pass 2, OD48 from pass 3). New plan rows: C128-C161 (after C127;
C147-C149 from pass 2, C150-C161 from pass 3). Pass 1's entries are E01-E42; pass 2's, after the independent review, are E50-E70 and amend some of them
(E12's version text by E50, E26 by E62, OD45 and OD46 by E66 and E70). Pass 3's, after the user's label round, are E71-E90.

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

## Pass 2 entries (the independent review of pass 1, 2026-11-07)

An independent review upheld pass 1 with sixteen findings; these entries apply them. Same rules: each block applies
only if its current text occurs exactly once in MD at that moment, in order. Pass 2 adds OD47 (the user's own earlier
decisions that pass 1 missed) and plan rows C147-C149, moves D30, D94 and D48's liveness price to U16, R14R 7 to U17,
`UnencodableValue` to U6, and the remaining proposed names to U18.

### E50 Rule 74: what makes a new actor version is open again (finding 1; R14R 7 overturned; U17)

~~~~current
field's encoded Schema (compared structurally, ignoring annotations, as an operation's key is, 2.7.15; OD46), is a new version.
~~~~
~~~~new
field's encoded Schema, is a new version. Whether a type-side change with the same encoding (`Schema.String` to
      `Schema.NumberFromString`, both strings) is one is open: U17, the user's.
~~~~

### E51 2.7.15: the same gap for operation keys, pointed at U17 (finding 1)

~~~~current
  (so a branded `Schema.String` keeps the version, and `Schema.String` to `Schema.Number` under one name does not;
  Q1 A).
~~~~
~~~~new
  (so a branded `Schema.String` keeps the version, and `Schema.String` to `Schema.Number` under one name does not;
  Q1 A; a type-side change with the same encoding, `Schema.String` to `Schema.NumberFromString`, is open, U17).
~~~~

### E52 Rule 24: the stated limit on a cancel's wait (finding 2; D48's safety kept, its price to U16)

~~~~current
    storage: stored, the never-sent cell runs; refused, it ends `NotSent { StorageRefused }` (agent, OD46; D48), since
    an acknowledged Attempt may restore as unknown.
~~~~
~~~~new
    storage: stored, the never-sent cell runs; refused, it ends `NotSent { StorageRefused }` (agent, OD46; D48), since
    an acknowledged Attempt may restore as unknown. Stated limit: nothing bounds that wait, so on a disk that never
    answers the cancel never takes effect; `StorageSilent` [P] names it after 10 s (2.7.20) and decides nothing
    (whether a wait on storage is bounded is U16, the user's).
~~~~

### E53 2.7.20: the awaited write's wait is D94, priced in U16 (finding 2)

~~~~current
  its actor still out, and carries what that batch owed. A batch answers "landed" only if every request in it
~~~~
~~~~new
  its actor still out, and carries what that batch owed (D94; its unbounded wait is U16). A batch answers "landed" only if every request in it
~~~~

### E54 2.7.20: silent storage is D30, priced in U16 (finding 2)

~~~~current
- **Silent storage** (agent). A write the disk has not answered is pending, never "not sent": no ending is invented
~~~~
~~~~new
- **Silent storage** (D30; whether a wait on storage is bounded is U16, the user's). A write the disk has not answered is pending, never "not sent": no ending is invented
~~~~

### E55 2.7.20's stated limits: unbounded waits on storage, and Safari's codec (findings 2, 16)

~~~~current
  the origin after a torn log removes holds too; only a business key prevents a second charge (rule 19).
~~~~
~~~~new
  the origin after a torn log removes holds too; only a business key prevents a second charge (rule 19). Nothing
  bounds a wait on storage (U16): a commit whose acknowledgement the disk never answers stays pending (a shopper can
  sit on "Paying…" with a dead disk), a cancel or `latest` replacement waiting on one never takes effect (rule 24),
  and an awaited write behind a hung plain batch of its actor stalls; `StorageSilent` names each and decides nothing.
  Records stored as JSON strings (2.6.1) were measured on Chrome only; Safari is measured in production (FOR-ARPIT
  call 14).
~~~~

### E56 OD35: the agent bullets no longer include the waits (finding 2)

~~~~current
  Its store-contract, silent-storage, frozen-page and id-floor bullets are agent-judged (OD46). (2026-11-07)
~~~~
~~~~new
  Its store-contract, frozen-page and id-floor bullets are agent-judged (OD46); silent storage (D30) and an awaited
  write's wait (D94) leave waits on storage unbounded, which is U16, the user's. (2026-11-07)
~~~~

### E57 2.5 step 1: `send` runs at once when idle (finding 3; decided, the user's Q3 A of 2026-10-28, D2)

~~~~current
   - A pending reset from the last commit runs first, as its own follow-up turn (rule 1).
~~~~
~~~~new
   - **A `send` runs at once when the Runtime is idle** (decided, the user's Q3 A of 2026-10-28, recorded as the
     prototype's D2 in `convergence-1.md`; OD47): with no turn running and no slice yielded, its turn runs before
     `send` returns; otherwise it queues in its actor's mailbox.
   - A pending reset from the last commit runs first, as its own follow-up turn (rule 1).
~~~~

### E58 2.7.1's reasons table: `Restored`, `NoPersistence`, `OldVersion` (finding 4; OD32, OD34, OD39)

~~~~current
`Restored` (the page reloaded before the Attempt was acknowledged)
~~~~
~~~~new
`Restored` (a queued commit `W`, never sent, when the page reloaded; a head is on disk only once its first send's batch landed, rule 44; OD32)
~~~~

~~~~current
`Disposed` (the Runtime was disposed before invocation) |
~~~~
~~~~new
`Disposed` (the Runtime was disposed before invocation), `NoPersistence` (a persisted identity's commit in a Runtime without persistence, a second tab, rule 16; OD34), `OldVersion` (the operation holds an old-version lane for that actor, 2.7.15; OD39) |
~~~~

### E59 Rule 30: the store's reasons (finding 4)

~~~~current
    repair; `NotSent` (`Rejected`, `Overloaded`, `Cancelled`, `Restored`, `StorageRefused`,
    `Disposed`) and evidence
~~~~
~~~~new
    repair; `NotSent` (`Rejected`, `Overloaded`, `Cancelled`, `Restored`, `StorageRefused`,
    `Disposed`, `NoPersistence`, `OldVersion`) and evidence
~~~~

### E60 Rule 20: a persisted identity's reasons (finding 4)

~~~~current
(`Restored`, `StorageRefused`, `Disposed`, `NoPersistence`)
~~~~
~~~~new
(`Restored`, `StorageRefused`, `Disposed`, `NoPersistence`, `OldVersion`)
~~~~

### E61 2.7.13's restore row (finding 4; OD32)

~~~~current
and, on a reload, `NotSent { Restored }` for never-acknowledged work (rule 44)
~~~~
~~~~new
and, on a reload, `NotSent { Restored }` for each queued commit `W`, never sent (rule 44; OD32)
~~~~

### E62 Rules 12 and 13: `UnencodableValue` waits with U6; names marked (findings 5, 6)

~~~~current
      - a state named `self` or `__proto__` (`ReservedStateName` [P]), and an `unknown:` target that is not a
        `Flow.uncertain` event or `Flow.ignore` (`UnknownNotUncertain` [P]) (agent, OD46).
    - **Values with no form.** A `Symbol`, function, `Map` or `Set` where a value must be carried is
      `UnencodableValue` [P]; `flow check` names each input field whose decoded form cannot be carried
      (`InputFieldForm` [P], a warning) (agent, OD46).
~~~~
~~~~new
      - a state named `self` or `__proto__` (`ReservedStateName` [P]; agent, OD46), and an `unknown:` target that is
        not a `Flow.uncertain` event or `Flow.ignore` (`UnknownNotUncertain`; decided, FOR-ARPIT section 4, OD47).
    - **Input forms** (agent, OD46). `flow check` names each input field whose decoded form cannot be carried
      (`InputFieldForm` [P], a warning). What a value with no form does, and its name, wait for U6.
~~~~

### E63 The names the user already accepted (finding 6; OD47)

~~~~current
(`KeyFieldOptional` [P]; decided, OD39)
~~~~
~~~~new
(`KeyFieldOptional`; decided, call 11, OD39)
~~~~

~~~~current
are a construction error (`TwoDefaults` [P]), found
~~~~
~~~~new
are a construction error (`TwoDefaults`; decided, call 13), found
~~~~

~~~~current
(`OldVersionLane` [P], an issue)
~~~~
~~~~new
(`OldVersionLane`, an issue; decided, Q2 A)
~~~~

~~~~current
     `TurnStorm` [P] (evidence) names one operation failing with the same input many times in a row, and `flow
     check`'s `AsksForever` [P] a handler whose every path asks again; neither decides anything. A backoff belongs on
     an explicit retry with a delay (Q5 A).
~~~~
~~~~new
     `TurnStorm` (evidence) names one operation failing with the same input many times in a row, and `flow
     check`'s `AsksForever` a handler whose every path asks again (both decided with call 5, D122; OD47); neither
     decides anything. A backoff belongs on an explicit retry with a delay (Q5 A). Subscribers hear one notify per
     task: the first slice end in a task notifies, and later ones in that task coalesce into one in the next task
     (agent, OD46; D136).
~~~~

~~~~current
`TurnStorm` [P] evidence; `flow check`'s `AsksForever` [P] (OD36)
~~~~
~~~~new
`TurnStorm` evidence; `flow check`'s `AsksForever` (OD36, OD47)
~~~~

~~~~current
Key fields required (`KeyFieldOptional` [P]); a key's fingerprint is part of the operation's version; old-version holds (`OldVersionLane` [P]),
~~~~
~~~~new
Key fields required (`KeyFieldOptional`); a key's fingerprint is part of the operation's version; old-version holds (`OldVersionLane`),
~~~~

~~~~current
restore (`TwoDefaults` [P]), evaluated per actor
~~~~
~~~~new
restore (`TwoDefaults`), evaluated per actor
~~~~

~~~~current
| `ReservedStateName`, `UnknownNotUncertain`, `UnencodableValue`, `InputFieldForm` [P] (rules 12, 13; OD46) | Adds |
~~~~
~~~~new
| `ReservedStateName` [P], `InputFieldForm` [P] (OD46; names U18), `UnknownNotUncertain` (OD47) (rules 12, 13); `UnencodableValue` waits with U6 | Adds |
~~~~

### E64 Rule 8: a kept ending leaves the machine where it is; a boot forgets a stranded read (findings 7, 16)

~~~~current
   asks again, ends, or a boot. A kept ending gets one try per boot or adoption.
~~~~
~~~~new
   asks again, ends, or a boot. A kept ending gets one try per boot or adoption. The machine stays in the state that
   was waiting for it and shows the kept ending; there is no fallback alternative and no API for it (decided,
   FOR-ARPIT call 19, round 8 call 1, D109; OD47). A boot forgets a stranded read: a machine with a recurring schedule
   asks again (rule 42), and one without stays where it was (convergence-9 withdrew "a reload asks again"; a lint for
   that case is proposed, not built).
~~~~

### E65 Plan rows C128 and C144 (finding 8)

~~~~current
| Amends O3's restore sentence and O6's acknowledgement; the sentences are named at the phase 2 merge |
~~~~
~~~~new
| Replaces Operations O3's "Restored work with no acknowledged Attempt cannot have been invoked and ends interrupt"; amends Persistence O6's "A persisted actor's remote commit cannot invoke its adapter until storage acknowledges its Attempt, including id and encoded input" (the acknowledgement is one batch with the capture of the turn that committed it) |
~~~~

~~~~current
| Amends C117, C118, C119, C120 |
~~~~
~~~~new
| Amends C117, C118, C119, C120, and C122's "an app Story's `ensure(ref)` takes input only for a singleton" (now no `ensure(ref)` takes input) |
~~~~

### E66 OD45 and 2.7.17: two agent calls are not the user's approval (finding 9)

~~~~current
  `failure { Interrupted }` per stopped read, delivered after the restored deliveries; only the latest arming waits;
  a return mints a new incarnation id, a previous incarnation's ending delivered as adopted; the ref form fixed per
~~~~
~~~~new
  `failure { Interrupted }` per stopped read; only the latest arming waits;
  a return mints a new incarnation id; the ref form fixed per
~~~~

~~~~current
from the active leaf (rules 14, 44). It receives, in order: its
~~~~
~~~~new
from the active leaf (rules 14, 44) (agent, OD46: the round-14 builder's call). It receives, in order: its
~~~~

### E67 2.5 step 1: the follow-up bound (finding 10; agent, D13, D35)

~~~~current
     OD36): follow-ups run first, up to their bound; otherwise one event from the next actor in rotation, oldest first
~~~~
~~~~new
     OD36): follow-ups run first, up to 64 for each admitted event, past which the turn that would add one is refused
     `InvalidTurn` naming the chain (agent, OD46; D13, D35); otherwise one event from the next actor in rotation, oldest first
~~~~

### E68 The local remount sentence moves to rule 73's grace (finding 12)

~~~~current
(Runtime O3). A local actor
remounted within its grace reuses that actor (decided, OD45; R14 D5). When a new
~~~~
~~~~new
(Runtime O3). When a new
~~~~

~~~~current
    the same for local actors), it ends;
~~~~
~~~~new
    the same for local actors; a local actor remounted within its grace reuses that actor, decided, OD45; R14 D5), it
    ends;
~~~~

### E69 Plan rows C131, C146 and C147-C149 (findings 2, 3, 10, 13)

~~~~current
silent storage pending (`StorageSilent` [P]),
~~~~
~~~~new
silent storage pending (`StorageSilent` [P]; unbounded, U16),
~~~~

~~~~current
waits for storage (rule 24; D48; OD46) | Adds |
~~~~
~~~~new
waits for storage (rule 24; D48; OD46); the wait is unbounded, a stated limit (U16) | Adds |
| C147 | React O3 | One notify per task: the first slice end in a task notifies subscribers, and later ones in that task coalesce into one in the next task (2.5 step 1; D136; OD46) | Adds |
| C148 | Runtime O4 | A `send` to an idle Runtime runs its turn before `send` returns; during a turn or a yield between slices it queues (2.5 step 1; D2; OD47) | Adds |
| C149 | Runtime O4 | Follow-ups are bounded at 64 per admitted event; past it the turn is refused `InvalidTurn` naming the chain (2.5 step 1; D13, D35; OD46) | Adds |
~~~~

### E70 Header and decision log: OD46 rewritten, OD47 added (findings 2, 5, 6, 7, 9)

~~~~current
(OD32-OD46, C128-C146)
~~~~
~~~~new
(OD32-OD47, C128-C149)
~~~~

~~~~current
- **OD46** Agent-judged, the phase 0b builder, 2026-11-07, under the roadmap's judge rule, each listed in
  `workflow/roadmaps/v3-production/progress.md` for the user's read: D48 (rule 24), D145's pruned keys (rule 19),
  2.7.20's agent bullets (D30, D83, D94, D95, D99, D111, D146), 2.6.1's agent bullets (D206, D215, D216, D223), the
  names `ReservedStateName`, `UnknownNotUncertain`, `UnencodableValue`, `InputFieldForm`, `StorageSilent`,
  `TurnStorm`, `AsksForever`, `KeyFieldOptional`, `OldVersionLane`, `TwoDefaults`, `RestoreMissingInput` [P], and
  round 14's final-review items R14R 2, 3, 6, 7, 9 (2.7.15, rule 74, 2.7.17). Reversible by reverting the design
  commit; the user may overrule any of them. (2026-11-07)
~~~~
~~~~new
- **OD46** Agent-judged, the phase 0b builder, 2026-11-07, under the roadmap's judge rule, each listed in
  `workflow/roadmaps/v3-production/progress.md` for the user's read: D48's safety rule (rule 24; its unbounded wait
  is U16), D145's pruned keys (rule 19), 2.7.20's store-contract, frozen-page and id-floor bullets (D83, D95, D99,
  D111, D146), 2.6.1's agent bullets (D206, D215, D216, D223), the follow-up bound (D13, D35) and one notify per task
  (D136) in 2.5 step 1, the proposed names `ReservedStateName`, `InputFieldForm`, `StorageSilent`,
  `RestoreMissingInput` [P] (their spelling is U18, the user's), round 14's final-review items R14R 2, 3, 6 and 9
  (2.7.17; R14R 9 is "delivered after the restored deliveries"), and the round-14 builder's call that a previous
  incarnation's ending is delivered as adopted (2.7.17). Amended by pass 2 (2026-11-07): D30, D94 and D48's price
  moved to U16, R14R 7 to U17, `UnencodableValue` to U6, and the names the user accepted to OD47. Reversible by
  reverting the design commits; the user may overrule any of them. (2026-11-07)
- **OD47** The user's own earlier decisions, recorded in pass 2 of the design catch-up (2026-11-07): `send` runs at
  once when the Runtime is idle (Q3 A, 2026-10-28; the prototype's D2; 2.5 step 1); a kept ending leaves the machine
  where it is, shown, with no fallback alternative or API (FOR-ARPIT call 19, round 8 call 1; D109; rule 8); and the
  names `KeyFieldOptional` (call 11), `TwoDefaults` (call 13), `OldVersionLane` (Q2 A), `UnknownNotUncertain`
  (FOR-ARPIT section 4) and `TurnStorm` and `AsksForever` (call 5, D122). (2026-11-07)
~~~~

## Pass 3 entries (the label round, 2026-11-07)

The user ruled on every user-judged conflict, U1-U18, in the label round on 2026-11-07 (the Claude Code session):
**all accepted at the recommended option**. These entries write the rulings into MD, with every knock-on place. Same
rules: each block applies only if its current text occurs exactly once in MD at that moment, in order. Pass 3 adds
OD48 (the label round) and plan rows C150-C161. Decision entries before OD48 stay as history, except OD35, OD39, OD40
and OD46, whose open points the rulings close. Calls made in applying them (agent, listed in OD48): a lane whose
operation is gone is kept like a quarantined one until `forget`; a quarantined lane's `cancel` may come from any
subject path; `Unencodable` must be mapped where an input or key Schema admits a value with no form; `persist` is
declared on the definition.

### E71 Header: the label round (OD48, C150-C161)

~~~~current
(OD32-OD47, C128-C149). Conflicts the user decides are listed, not applied:
[../../proposals/design-catch-up/change-list.md](../../proposals/design-catch-up/change-list.md). R14 D4 amends rule 74:
a singleton takes no input.
~~~~
~~~~new
(OD32-OD47, C128-C149). The user ruled on the conflicts U1-U18 in the label round of 2026-11-07, each at its
recommended option (OD48, C150-C161):
[../../proposals/design-catch-up/change-list.md](../../proposals/design-catch-up/change-list.md). R14 D4 amends rule 74:
a singleton takes no input.
~~~~

### E72 Rule 25: no Flow timeout stands (U1 B)

~~~~current
25. **No Flow timeout and no Flow retry, of a session or a call** (amended, S15).
~~~~
~~~~new
25. **No Flow timeout and no Flow retry, of a session or a call** (amended, S15; decided, U1 B, OD48: the user
    overturned their remark of 2026-11-01, "rule 25 is cancelled, timeouts return", so the prototype's `timeout` and
    `TimedOut` (D8) are not taken; a call's deadline is its commit's Effect,
    `Effect.timeoutOrElse(..., () => Outcome.unknown(...))`, 2.7.6).
~~~~

### E73 Rule 43 and 2.7.13: a key-less member names its ending's own Attempt only (U2; D22)

~~~~current
    operation alone maps, naming that ending's Attempt and, once it is resolved or released, the lane's addressable one
    (holding policies only); under `serialize`, only in the head's own ending's handler; in a `NotSent` ending they do
    nothing;
~~~~
~~~~new
    operation alone maps, naming that ending's own Attempt only (decided, U2, OD48; D22 cut the clause "and, once it
    is resolved or released, the lane's addressable one"); once that Attempt is resolved or released, a key-less member
    acts as on an `Idle` lane (2.7.13); under `serialize`, only in the head's own ending's handler; in a `NotSent`
    ending they do nothing;
~~~~

~~~~current
**Key-less members in an ending** (decided, OD8; R5 K9; R6 M1): a key-less `retry`, `retryable` or `cancel` in a
handler of an event its operation alone maps names **that ending's own Attempt; once that Attempt is resolved or
released, it names the lane's addressable one**. So `[O.x.cancel, O.x.cancel]` in an unknown's handler releases the
ending's Attempt (→ promote) and then ends the promoted, not yet invoked commit with `NotSent { Cancelled }`. In a
**success or failure** handler of a keyed operation, the ending's Attempt is already resolved, so a key-less `cancel`
there ends the commit that admission just promoted (R7 L2). In a `NotSent` ending there is no Attempt (rule 16),
so a key-less member does nothing. The "then the lane's addressable one" step applies to the three holding policies
only (R7 M2). On `serialize`, key-less `retry`, `retryable` and `cancel` stand only in a handler of the head's own
ending; per-item stops use a keyed design (decided, OD19: Q35 A; narrows OD8 for one policy).
~~~~
~~~~new
**Key-less members in an ending** (decided, OD8; R5 K9; R6 M1; narrowed by U2, OD48, D22): a key-less `retry`,
`retryable` or `cancel` in a handler of an event its operation alone maps names **that ending's own Attempt only**.
Once that Attempt is resolved or released, a key-less member acts as on an `Idle` lane: `[O.x.cancel, O.x.cancel]` in
an unknown's handler releases the ending's Attempt (→ promote), and the second `cancel` does nothing, with evidence;
the promoted commit is reached only by its key. In a **success or failure** handler of a keyed operation, the
ending's Attempt is already resolved, so a key-less `cancel` there does nothing (R7 L2's reading and R7 M2's step are
cut with the clause). In a `NotSent` ending there is no Attempt (rule 16), so a key-less member does nothing. On
`serialize`, key-less `retry`, `retryable` and `cancel` stand only in a handler of the head's own ending; per-item
stops use a keyed design (decided, OD19: Q35 A; narrows OD8 for one policy).
~~~~

### E74 Rule 44 and 2.7.13: restore delivers `W`'s `NotSent { Restored }` first, then the head's unknown (U3; D107)

~~~~current
    the parked endings in saved order; per lane in creation order and once per incarnation (a reload, or a return after an end, rule 73), a held head's `unknown { Restored }`
    (and, on a reload, `NotSent { Restored }` for each queued commit `W`, never sent; a head is on disk only once its
    first send's batch landed, so it restores as unknown, OD32); an `InFlight` lane's ending when it lands.
~~~~
~~~~new
    the parked endings in saved order; per lane in creation order and once per incarnation (a reload, or a return
    after an end, rule 73), on a reload `NotSent { Restored }` for each queued commit `W` first (never sent; a head is
    on disk only once its first send's batch landed, so it restores as unknown, OD32), then a held head's
    `unknown { Restored }`, so the hold's route is the last one (decided, U3, OD48; D107); an `InFlight` lane's ending
    when it lands.
~~~~

~~~~current
2. per lane, in creation order: the head's `unknown { Restored }` if the lane is `Held` (once; not if that Attempt's
   outcome was parked, G3), then, on a reload only, each `W` entry's `NotSent { Restored }` (C2; R10 L2); a head never
   acknowledged is not on disk (OD32);
~~~~
~~~~new
2. per lane, in creation order: on a reload only, each `W` entry's `NotSent { Restored }` first (C2), then the head's
   `unknown { Restored }` if the lane is `Held` (once; not if that Attempt's outcome was parked, G3), so the hold's
   route is the last one and a queued press's answer cannot run over the prompt the hold needs (decided, U3, OD48;
   D107, the trace `Go Go ack KILL`; reverses R10 L2's order); a head never acknowledged is not on disk (OD32);
~~~~

### E75 Rules 8, 46, 2.5, 2.7.7, 2.7.15, 2.7.19, 2.9.4: a lane that no longer decodes is quarantined; `orphaned` leaves v1 (U4; D20, D88)

~~~~current
A write lane whose operation
   is gone, or whose key no longer decodes, goes to its descriptor's `orphaned` handler, outside any actor (P19); a lane
   whose actor record no longer decodes is adopted by the fresh incarnation (rule 46).
~~~~
~~~~new
A write lane whose operation
   is gone, or whose key no longer decodes, is quarantined: it keeps its hold, is listed, and nothing runs for it
   outside an actor (rule 46; U4, OD48); a lane whose actor record no longer decodes is adopted by the fresh
   incarnation (rule 46).
~~~~

~~~~current
    when the actor record no longer decodes; a lane whose operation is gone, or whose key no longer decodes, goes to
    `orphaned` (P19). A lane record names no instance path; it carries the subject path (strings) and the releasing
    mark (a flag), both decoding without the machine. A recorded path the placement cannot produce is adopted by key
    equality only when the placement's last subject part is the contract's single key field, else goes to `orphaned`
    (rule 51; 2.9.4).
~~~~
~~~~new
    when the actor record no longer decodes. **A lane whose key no longer decodes is quarantined** (decided, U4,
    OD48; D88): it keeps its id (the record's key text) and its hold; a commit of that operation whose key's
    canonical text is that id declines `NotSent { why: "Rejected" }` and its transition runs; the record stays on
    disk; Inspection lists it and each boot reports it; a `cancel` on that key clears it. A lane whose operation is
    gone is kept the same way, listed and reported, until `forget` removes it (agent, OD48). Restore is per record
    (U7). A lane record names no instance path; it carries the subject path (strings) and the releasing mark (a
    flag), both decoding without the machine. A recorded path the placement cannot produce is quarantined the same
    way; key-equality adoption is cut (decided, U4, OD48; D20) (rule 51; 2.9.4). `orphaned` (P19) is not in v1; its
    text is prior art in [revisit.md](../../proposals/revisit.md).
~~~~

~~~~current
   - `whenAbandoned` is never queued, because it is fused. `orphaned` runs on the descriptor, not in an
     actor's mailbox (P19).
~~~~
~~~~new
   - `whenAbandoned` is never queued, because it is fused.
~~~~

~~~~current
  commit: chargeCard,                                 // classifies with Outcome where it reads the response
  orphaned: ({ attempt, retry }) => retry(attempt),   // its operation gone across a version change (P19)
~~~~
~~~~new
  commit: chargeCard,                                 // classifies with Outcome where it reads the response
~~~~

~~~~current
- A write lane whose contract no longer has an operation, or whose key no longer decodes under the contract's key
  Schema, goes to `orphaned` (P19).
~~~~
~~~~new
- A write lane whose contract no longer has an operation, or whose key no longer decodes under the contract's key
  Schema, is quarantined (rule 46; decided, U4, OD48; D88): its hold stays, listed, and nothing re-sends it.
~~~~

~~~~current
Tabs on two releases see two actors. Whether an old-version record's lanes should go to `orphaned` (P19)
  instead of staying unbound is open.
~~~~
~~~~new
Tabs on two releases see two actors. An old-version record's lanes stay unbound and listed; `orphaned`
  (P19) is not in v1 (U4, OD48).
~~~~

~~~~current
It is adopted by key equality only when the placement's last subject part **is the contract's
  single key field**: for `.each`, `by` names that field (FP 4.1: `by: "docId"`, `key: ["docId"]`, so a held save of `d1`
  becomes path `["d1"]`); for `resetOn`, the reset value is that field's value. Otherwise it goes to `orphaned` (P19),
  stated. A subjectless lane adopted by a root trait at the actor's root needs nothing (its path is `[]`).
  Membership of bare strings has no `by`, so it does not pass the test: after FP 4.4's upgrade (a board with bare-string
  `issueIds`), a held like from the host-only form goes to `orphaned`, stated (FP RV3 L3).
~~~~
~~~~new
It is quarantined (rule 46): it keeps its hold, a commit of that operation on its key declines
  `Rejected`, Inspection lists it, and a `cancel` on that key, from any subject path, clears it (agent, OD48).
  Key-equality adoption (the placement's last subject part as the contract's single key field, FP 4.1) is cut
  (decided, U4, OD48; D20): a release that moves a held write ships a handler for its old hold, as a key change does
  (2.7.15). A subjectless lane adopted by a root trait at the actor's root needs nothing (its path is `[]`).
~~~~

~~~~current
- A version that removes the fragment's operation sends the lane to `orphaned` (P19).
~~~~
~~~~new
- A version that removes the fragment's operation leaves the lane quarantined (rule 46).
~~~~

~~~~current
`keys` on keyed schedules (key records); `orphaned`; `.history`
~~~~
~~~~new
`keys` on keyed schedules (key records); `.history`
~~~~

~~~~current
Attempts survive a version change through `orphaned`, at least once (P19).
~~~~
~~~~new
A lane across a version change is adopted, an old-version hold, or quarantined, never dropped (rule 46, 2.7.15; U4).
~~~~

~~~~current
| P19 | Persistence O5 | A write lane whose operation is gone,
~~~~
~~~~new
| P19 | Persistence O5 | **Cut from v1 by C152 (U4, OD48); prior art in `revisit.md`.** Was: A write lane whose operation is gone,
~~~~

~~~~current
  or `Fake.storage.seed(records)` (2.10.10), which matter more now that `orphaned` makes version changes first-class
  (durable R8).
~~~~
~~~~new
  or `Fake.storage.seed(records)` (2.10.10), which matter more now that versions are first-class (old-version holds,
  quarantined lanes; durable R8).
~~~~

~~~~current
16. **`orphaned`'s `retry(attempt)`** (P19, 2.7.7). Merge 2
~~~~
~~~~new
16. ~~**`orphaned`'s `retry(attempt)`**~~ **Closed (U4, OD48):** `orphaned` is not in v1 (rule 46 quarantines such a
    lane; prior art in [revisit.md](../../proposals/revisit.md)). Was (P19, 2.7.7): Merge 2
~~~~

### E76 Rules 21, 29, N2, 2.7.3, 2.7.6, 2.7.8, 2.7.13, 2.7.18, 2.9.3, 2.10: `concurrency: "allow"` is cut from v1 (U5; D19)

~~~~current
`cancel` and `allow` hold it for its own ending's
    turn (`HeldThisTurn`)
~~~~
~~~~new
`cancel` holds it for its own ending's
    turn (`HeldThisTurn`)
~~~~

~~~~current
    `outstanding` under `serialize`; `{ pending, retryCount, progress? }` under `cancel`; `{ pending, outstanding }`
    under `allow`. `pending` is `InFlight`;
~~~~
~~~~new
    `outstanding` under `serialize`; `{ pending, retryCount, progress? }` under `cancel` (`allow` is cut from v1:
    decided, U5, OD48; D19). `pending` is `InFlight`;
~~~~

~~~~current
(`reject`, `latest`, `allow`, `serialize`)
~~~~
~~~~new
(`reject`, `latest`, `serialize`)
~~~~

~~~~current
  `serialize` the head (OD19). Under `allow` they exist only key-less in an ending's own handler, naming that ending's
  Attempt (OD20); elsewhere they are type errors. A call
~~~~
~~~~new
  `serialize` the head (OD19); `allow`, the one policy without an addressable Attempt, is cut from v1 (U5, OD48). A call
~~~~

~~~~current
; under `allow`, `{ pending, outstanding }` (no hold) |
~~~~
~~~~new
 |
~~~~

~~~~current
`cancel` and `allow` do not hold, so there it is not required.
~~~~
~~~~new
`cancel` does not hold, so there it is not required.
~~~~

~~~~current
lane's one Attempt is the one this state reconciles; under `allow` a key-less `retry` exists only in the ending's
own handler, naming that ending's Attempt (rule N2).
~~~~
~~~~new
lane's one Attempt is the one this state reconciles (rule N2).
~~~~

~~~~current
| `cancel` | for its own ending's turn (`HeldThisTurn`) | none: a commit interrupts the Attempt on the wire, whose ending is then evidence | the one minted Attempt, for its own ending's turn | `{ key, pending, retryCount, progress? }` |
| `allow` | per Attempt, for its own ending's turn | none | per Attempt, key-less in its own ending's handler (rule N2) | `{ key, pending, outstanding }` |
~~~~
~~~~new
| `cancel` | for its own ending's turn (`HeldThisTurn`) | none: a commit interrupts the Attempt on the wire, whose ending is then evidence | the one minted Attempt, for its own ending's turn | `{ key, pending, retryCount, progress? }` |
~~~~

~~~~current
`idle` exists in every mode; `retry` and `cancel` as rule N2 says.
~~~~
~~~~new
`idle` exists in every mode; `retry` and `cancel` as rule N2 says. `allow` (every commit independent, nothing held)
is cut from v1 (decided, U5, OD48; D19; prior art in [revisit.md](../../proposals/revisit.md)): a presence ping fits
`cancel`, and a nudge is `reject` with its own key.
~~~~

~~~~current
`W` under `serialize`, every Attempt under `allow` (which has no addressable Attempt) | MD's word (R6 L4), one meaning on both rows |
~~~~
~~~~new
`W` under `serialize` | MD's word (R6 L4) |
~~~~

~~~~current
**The two policies that do not hold** (decided, OD19; R6 M3, R7 M2).
~~~~
~~~~new
**The policy that does not hold** (decided, OD19; R6 M3, R7 M2; `allow` cut, U5, OD48).
~~~~

~~~~current
 `allow` follows this per Attempt | cannot occur |
~~~~
~~~~new
 | cannot occur |
~~~~

~~~~current
Under `cancel` and
`allow`, an `unknown` that lands
~~~~
~~~~new
Under `cancel`, an `unknown` that lands
~~~~

~~~~current
`cancel` and `allow` rows have no `uncertain` field
~~~~
~~~~new
`cancel` rows have no `uncertain` field
~~~~

~~~~current
Under **`allow`** (OD20 F9), a lane is a set of independent Attempts, each following the `cancel` table's rows for
itself, including invoked, storage refused, dispose, rebind and restore; its state is a count (`outstanding`), `pending` is
`outstanding > 0`, and each Attempt has its own `HeldThisTurn` for its own ending's turn. `retry` and `cancel` exist
only key-less in an ending's own handler (N2 stands elsewhere); the "then the lane's addressable one" step does not
apply. Rows: `{ pending, retryCount, progress? }` under `cancel`, `{ pending, outstanding }` under `allow`; no
`uncertain` or `waiting` (R6 L4).
~~~~
~~~~new
Rows under `cancel`: `{ pending, retryCount, progress? }`; no `uncertain` or `waiting` (R6 L4). OD20 F9's `allow`, a
lane of independent Attempts, is cut from v1 (U5, OD48; prior art in [revisit.md](../../proposals/revisit.md)).
~~~~

~~~~current
| `cancel` | no | none | the one minted Attempt, for its own ending's turn | `HeldThisTurn` |
| `allow` | no | none | per Attempt, in its own ending's turn | a count; `HeldThisTurn` per Attempt |
~~~~
~~~~new
| `cancel` | no | none | the one minted Attempt, for its own ending's turn | `HeldThisTurn` |
~~~~

~~~~current
uses `cancel`, `allow` or `serialize`
~~~~
~~~~new
uses `cancel` or `serialize`
~~~~

~~~~current
`cancel` and `allow` with Runtime disposal
~~~~
~~~~new
`cancel` with Runtime disposal
~~~~

~~~~current
photos 4–20); `allow` neither throttles nor holds. A throttle
~~~~
~~~~new
photos 4–20). A throttle
~~~~

~~~~current
under `cancel` and `allow`
  an ignored unknown goes to `Idle` at once.
~~~~
~~~~new
under `cancel`
  an ignored unknown goes to `Idle` at once.
~~~~

~~~~current
**Under `cancel` and `allow`** (FP RV3 L4): a lane in `HeldThisTurn` or `Held (parked)` is released at marking, as
`Held` is; under `allow` the rows apply per Attempt.
~~~~
~~~~new
**Under `cancel`** (FP RV3 L4): a lane in `HeldThisTurn` or `Held (parked)` is released at marking, as
`Held` is.
~~~~

~~~~current
A parked lane under `cancel` or `allow` is listed
~~~~
~~~~new
A parked lane under `cancel` is listed
~~~~

~~~~current
The `cancel`/`allow` table adds
~~~~
~~~~new
The `cancel` table adds
~~~~

~~~~current
Type errors: `retry`, `retryable`, a row's `retryCount` or `progress` under `allow` outside an ending's own handler (rule N2); a key-less
~~~~
~~~~new
Type errors (those under `allow` cut by C153): a key-less
~~~~

### E77 Rules 12, 20, 22, 30, 2.7.1, 2.7.20, 2.8.6: values that cannot be encoded (U6; D89, D100, D108, D114, D139)

~~~~current
    - **Input forms** (agent, OD46). `flow check` names each input field whose decoded form cannot be carried
      (`InputFieldForm` [P], a warning). What a value with no form does, and its name, wait for U6.
~~~~
~~~~new
    - **Values with no form** (decided, U6, OD48; D89, D100, D108, D114, D139). A `Symbol`, function, `Map` or `Set`
      where a value must be carried is `UnencodableValue`. Encoding never fails a turn: memory that cannot encode
      skips that capture batch and keeps the last good one, named `UnencodableValue` (Persistence O5); a commit whose
      input or key cannot encode declines `NotSent { why: "Unencodable" }`, its transition runs, and its mapper
      receives the value the turn asked to send; a lookup whose input or key cannot encode ends `failure` as
      `Defect`; a guard key that cannot encode denies that alternative (`Unencodable`), and a later alternative may
      match; a module value that cannot encode is dropped with `UnencodableValue`, and the module's member does not
      run.
    - **Input forms** (agent, OD46). `flow check` names each input field whose decoded form cannot be carried
      (`InputFieldForm`, a warning; the name accepted, U18).
~~~~

~~~~current
or for a domain write (`Overloaded`, rule 35), or on a placement
~~~~
~~~~new
or for a domain write (`Overloaded`, rule 35), or where its input or key Schema admits a value with no form (`Unencodable`, rule 12; agent, OD48), or on a placement
~~~~

~~~~current
so a failing select or an invalid duration rejects the turn (`InvalidTurn`).
~~~~
~~~~new
so a failing select or an invalid duration rejects the turn (`InvalidTurn`). A value that cannot be encoded is not
    a failing select and never rejects a turn (rule 12's values with no form; U6).
~~~~

~~~~current
    `Disposed`, `NoPersistence`, `OldVersion`) and evidence
~~~~
~~~~new
    `Disposed`, `NoPersistence`, `OldVersion`, `Unencodable`) and evidence
~~~~

~~~~current
`OldVersion` (the operation holds an old-version lane for that actor, 2.7.15; OD39) |
~~~~
~~~~new
`OldVersion` (the operation holds an old-version lane for that actor, 2.7.15; OD39), `Unencodable` (the commit's input or key cannot be encoded; its mapper receives the value, rule 12; U6, OD48) |
~~~~

~~~~current
`NotSent { Cancelled | Rejected | Restored | StorageRefused | Disposed }`
~~~~
~~~~new
`NotSent { Cancelled | Rejected | Restored | StorageRefused | Disposed | NoPersistence | OldVersion | Unencodable }`
~~~~

~~~~current
  the turn that committed it (rule 44; OD32). A hidden page writes at once, backoff apart.
~~~~
~~~~new
  the turn that committed it (rule 44; OD32). A hidden page writes at once, backoff apart. Memory that cannot encode
  skips its batch, keeps the last good one and is named `UnencodableValue` (rule 12; U6).
~~~~

### E78 2.10.17.6 and 2.7.17: sends before the Runtime is ready queue until boot (U8; D87)

~~~~current
While a restore read is held, the tab has not finished bootstrap:
its persisted actors are absent, and a send to one is `ActorAbsent`. Refused, the tab reports `StorageFailure` and runs
without persistence (Persistence O5).
~~~~
~~~~new
While a restore read is held, the tab has not finished bootstrap,
and a send to one of its persisted actors queues until boot, within Persistence O5's bound (decided, U8, OD48; D87).
Refused, or unanswered past the boot bound (10 s, internal), the tab reports `StorageFailure`, runs without
persistence (Persistence O5) and flushes the queue; a late answer is ignored, so unread data is never overwritten.
~~~~

~~~~current
| being disposed by `disposeActor` | dropped, `NoRecord` (Runtime O4) |
~~~~
~~~~new
| persisted, the Runtime still booting (its restore read not answered) | queued until boot, within Persistence O5's bound; past the boot bound or on a failed read, `StorageFailure`, the Runtime runs without persistence and flushes the queue (U8, OD48; 2.10.17.6) |
| being disposed by `disposeActor` | dropped, `NoRecord` (Runtime O4) |
~~~~

### E79 2.2.2: creation checks input by its type side (U9; D219) and defaults are pure (U12 B)

~~~~current
- **Creation is pure and happens once per incarnation:** decode the input with the derived `Input`
  schema, copy the input fields,
~~~~
~~~~new
- **Creation is pure and happens once per incarnation:** check a present input by the derived `Input`
  schema's type side, with no transforming decode (decided, U9, OD48; D219: the creator hands an in-process value,
  not its JSON, so a `NumberFromString` field given `"3"` is refused), copy the input fields,
~~~~

~~~~current
them. A default is evaluated for each actor at each door, never computed once and shared (round 13's H1). At
~~~~
~~~~new
them. A default is evaluated for each actor at each door, never computed once and shared (round 13's H1). **A
  default is pure** (decided, U12 B, OD48): a default that is an Effect to run rather than a plain value
  (`withConstructorDefault(Effect.sync(() => new Date()))`, a `randomUUID()` per call) is a construction error; a time
  or an id comes from an event or the Runtime's mint. At
~~~~

### E80 2.7.1 and 2.7.13: Runtime disposal past its bound ends `unknown { Disposed }` (U13)

~~~~current
| `StorageRefused` | unknown | a re-send's lane-record capture failed before invocation (2.7.13) |
~~~~
~~~~new
| `StorageRefused` | unknown | a re-send's lane-record capture failed before invocation (2.7.13) |
| `Disposed` | unknown | the Runtime was disposed and the call had not settled within Runtime O6's bound (2.7.13; U13, OD48) |
~~~~

~~~~current
On the wire: Runtime O6 (settles within its bound, else unknown);
~~~~
~~~~new
On the wire: Runtime O6: within its bound it settles (saved as below); past the bound it ends `unknown { Disposed }` (decided, U13, OD48);
~~~~

~~~~current
An Attempt on the wire follows Runtime O6 (it settles within the bound, or not).
~~~~
~~~~new
An Attempt on the wire follows Runtime O6: within the bound it settles, and past it it ends `unknown { Disposed }` (U13).
~~~~

~~~~current
`Restored`, `Interrupted`, `Defect`, `StillUnknown`, `StorageRefused`) are optional in the type
~~~~
~~~~new
`Restored`, `Interrupted`, `Defect`, `StillUnknown`, `StorageRefused`, `Disposed`) are optional in the type
~~~~

### E81 2.7.13 and 2.7.20: `disposeActor` flushes its removal; an unbound lane record's end (U14)

~~~~current
`disposeActor` removes the actor's record and keeps its non-`Idle` lanes as unbound lanes; `forget` removes both.
~~~~
~~~~new
`disposeActor` removes the actor's record and keeps its non-`Idle` lanes as unbound lanes; `forget` removes both.
The removal is flushed at once, as a lane batch is (decided, U14, OD48; D93), so a crash cannot bring the record
back. An unbound lane record left by `disposeActor` ends when an ensure of the identity adopts it or `forget` removes
it; until then Inspection lists it as unbound under the identity, and each boot reports it, as `OldVersionLane` does
for an old-version hold.
~~~~

~~~~current
A batch that touches a lane or a send is written at once,
~~~~
~~~~new
A batch that touches a lane or a send, or a `disposeActor` removal (U14), is written at once,
~~~~

### E82 Rule 74, 2.2, 2.7.17, 2.7.19, 2.10.18: `persist` is the machine's, declared in its definition (U15 B)

~~~~current
    - Two refs of one identity with different `persist` or `context` are `ConflictingActorRef` at ensure [P]; one
      machine in both forms cannot be written (R14 D4).
~~~~
~~~~new
    - **Persistence is the machine's** (decided, U15 B, OD48): `definition({ id, persist: true, … })`, beside `id`,
      which names the machine in every saved record; refs carry no `persist`, so every ref of an identity agrees by
      construction. The definition is the place because it holds the machine's declarations (`context` is there too,
      and fragments may declare neither), `machine()` takes no options, and the persisted-value type rule reads the
      definition's memory (Persistence O2). A local actor of a persisted machine is not persisted (Persistence O2).
      Two refs of one identity with different `context` are `ConflictingActorRef` at ensure [P]; one machine in both
      forms cannot be written (R14 D4).
~~~~

~~~~current
Fragments may not declare `context`, `onContext`, `send` or persistence.
~~~~
~~~~new
Fragments may not declare `context`, `onContext`, `send` or `persist` (a definition's, rule 74).
~~~~

~~~~current
actorRef(EditorMachine, ticket, { persist: true });   // dropped: retain
~~~~
~~~~new
actorRef(EditorMachine, ticket);                       // dropped: retain; `persist: true` is Editor's definition's (rule 74)
~~~~

~~~~current
actorRef(EditorMachine, ticket, { persist: true });     // new meaning: a value carrying the input fields
useActorByRef(editorRef(ticket), {});                   // `{}` selects ensure (React O2); no input
actorRef(SessionMachine, "coordinator", { persist: true });   // a singleton: a literal name, no input (R14 D4)
~~~~
~~~~new
export const Editor = definition({ id: "Editor", persist: true, /* … */ });   // NEW: persist on the definition (U15)
actorRef(EditorMachine, ticket);                        // new meaning: a value carrying the input fields; no persist
useActorByRef(editorRef(ticket), {});                   // `{}` selects ensure (React O2); no input
actorRef(SessionMachine, "coordinator");   // a singleton: a literal name, no input (R14 D4); Session's definition persists
~~~~

~~~~current
- **Where non-naming data goes.**
~~~~
~~~~new
- **Persistence.** `persist` is a property of the machine, on its definition (rule 74; U15 B), so two refs of one
  identity cannot disagree about it; a ref's options keep only `context`.
- **Where non-naming data goes.**
~~~~

~~~~current
Checkout1 = actorRef(CheckoutMachine, { intentId: "pi_1" }, { persist: true })
~~~~
~~~~new
Checkout1 = actorRef(CheckoutMachine, { intentId: "pi_1" }), whose definition persists
~~~~

~~~~current
a machine with no persisted ref, or a local one, the message says "lost if the screen leaves first: persist the
  ref, commit on close, or lift the actor's use"
~~~~
~~~~new
a machine that does not persist, or a local actor, the message says "lost if the screen leaves first: persist the
  machine, commit on close, or lift the actor's use"
~~~~

### E83 Rule 24 and 2.7.20: storage waits have no bound (U16 A); the U16 marks go

~~~~current
an acknowledged Attempt may restore as unknown. Stated limit: nothing bounds that wait, so on a disk that never
    answers the cancel never takes effect; `StorageSilent` [P] names it after 10 s (2.7.20) and decides nothing
    (whether a wait on storage is bounded is U16, the user's).
~~~~
~~~~new
an acknowledged Attempt may restore as unknown. Stated limit (decided, U16 A, OD48): nothing bounds that wait, so
    on a disk that never answers the cancel never takes effect; `StorageSilent` names it after 10 s (2.7.20) and
    decides nothing.
~~~~

~~~~current
(D94; its unbounded wait is U16)
~~~~
~~~~new
(D94; its wait is unbounded, a stated limit below; U16 A)
~~~~

~~~~current
- **Silent storage** (D30; whether a wait on storage is bounded is U16, the user's). A write the disk has not answered is pending, never "not sent": no ending is invented
  for it, and evidence `StorageSilent` [P] names it after 10 s.
~~~~
~~~~new
- **Silent storage** (D30; decided, U16 A, OD48: storage waits have no bound). A write the disk has not answered is
  pending, never "not sent": no ending is invented for it, and evidence `StorageSilent` names it after 10 s and
  decides nothing.
~~~~

~~~~current
Nothing
  bounds a wait on storage (U16):
~~~~
~~~~new
Nothing
  bounds a wait on storage (decided, U16 A, OD48):
~~~~

~~~~current
silent storage pending (`StorageSilent` [P]; unbounded, U16),
~~~~
~~~~new
silent storage pending (`StorageSilent`; unbounded, a stated limit, U16 A),
~~~~

~~~~current
the wait is unbounded, a stated limit (U16) | Adds |
~~~~
~~~~new
the wait is unbounded, a stated limit (U16 A, OD48) | Adds |
~~~~

~~~~current
  write's wait (D94) leave waits on storage unbounded, which is U16, the user's. (2026-11-07)
~~~~
~~~~new
  write's wait (D94) leave waits on storage unbounded, a stated limit the user accepted (U16 A, OD48). (2026-11-07)
~~~~

### E84 Rule 74 and 2.7.15: a version compares the type side and the encoded side (U17 B; amends Q1 A)

~~~~current
field's encoded Schema, is a new version. Whether a type-side change with the same encoding (`Schema.String` to
      `Schema.NumberFromString`, both strings) is one is open: U17, the user's.
~~~~
~~~~new
field's Schema on its type side or its encoded side (compared structurally, ignoring annotations), is a new
      version: `Schema.String` to `Schema.NumberFromString` is one, though both encode to strings, and a brand or a
      description is not (decided, U17 B, OD48).
~~~~

~~~~current
the field names and each key field's encoded JSON Schema, compared structurally, ignoring annotations
  (so a branded `Schema.String` keeps the version, and `Schema.String` to `Schema.Number` under one name does not;
  Q1 A; a type-side change with the same encoding, `Schema.String` to `Schema.NumberFromString`, is open, U17).
~~~~
~~~~new
the field names and each key field's Schema, its type side and its encoded side, compared structurally,
  ignoring annotations (so a branded or described `Schema.String` keeps the version, and `Schema.String` to
  `Schema.Number`, or to `Schema.NumberFromString`, under one name does not; Q1 A, amended by U17 B, OD48: Q1 A
  compared the encoded side only).
~~~~

~~~~current
  reached through `previous: [{ key }]`; the `within` narrowing is cut (rule 39, 2.7.15). (2026-11-07)
~~~~
~~~~new
  reached through `previous: [{ key }]`; the `within` narrowing is cut (rule 39, 2.7.15). (2026-11-07) *Amended by
  OD48 (U17 B): the fingerprint compares each key field's type side and encoded side, ignoring annotations.*
~~~~

### E85 2.2.2, rules 12, 13 and the plan rows: the proposed names are accepted (U18)

~~~~current
(`RestoreMissingInput` [P]), which then quarantines it.
~~~~
~~~~new
(`RestoreMissingInput`), which then quarantines it.
~~~~

~~~~current
(`ReservedStateName` [P]; agent, OD46)
~~~~
~~~~new
(`ReservedStateName`; agent, OD46; the name accepted, U18)
~~~~

~~~~current
restore of a field the record lacks (`RestoreMissingInput` [P]) (2.2.2; OD40) | Adds |
~~~~
~~~~new
restore of a field the record lacks (`RestoreMissingInput`) (2.2.2; OD40); defaults are pure (C157) | Adds |
~~~~

~~~~current
| `ReservedStateName` [P], `InputFieldForm` [P] (OD46; names U18), `UnknownNotUncertain` (OD47) (rules 12, 13); `UnencodableValue` waits with U6 | Adds |
~~~~
~~~~new
| `ReservedStateName`, `InputFieldForm` (OD46; names accepted, U18, OD48), `UnknownNotUncertain` (OD47), `UnencodableValue` (U6, U18, OD48) (rules 12, 13) | Adds |
~~~~

~~~~current
  `RestoreMissingInput` [P] (their spelling is U18, the user's)
~~~~
~~~~new
  `RestoreMissingInput` (their spelling accepted by the user, U18, OD48)
~~~~

~~~~current
(rule 24; its unbounded wait
  is U16)
~~~~
~~~~new
(rule 24; its unbounded wait
  is a stated limit, U16 A, OD48)
~~~~

~~~~current
and the names the user accepted to OD47. Reversible by
~~~~
~~~~new
and the names the user accepted to OD47; the user ruled every one of them in OD48. Reversible by
~~~~

### E86 Rule 32, 2.8 and 2.8.6: rule 32 follows Q7 A in phase 1 (U10); the entity store waits for phase 1 (U11)

~~~~current
    not collected while it may still be changed by a lost request.
~~~~
~~~~new
    not collected while it may still be changed by a lost request. **Decided, to be written into this rule and 2.8.6
    in phase 1 with the entity store** (U10, OD48; FOR-ARPIT call 7, Q7 A): a later success cannot clear a mark, nor
    can time; after give-up a mark is `uncertain` until the next read, then `unconfirmed`, quiet, until proof; OD28
    P1's release is what moves a mark from `uncertain` to `unconfirmed`. Until phase 1 rewrites them, the sentences
    above that let a later write's success clear a mark are superseded.
~~~~

~~~~current
(EDP:6, EDP:62-64). A test reads the store with `cp.entity`, and its queues and marks in `cp.inspection` (2.10.8).
~~~~
~~~~new
(EDP:6, EDP:62-64). A test reads the store with `cp.entity`, and its queues and marks in `cp.inspection` (2.10.8).

**Deferred to phase 1** (decided, U11, OD48): the prototype's entity-store decisions (D3, D12, D15, D18, D39, D40,
D49's record half, D47 to D76's judge) are settled when phase 1 builds `round-9/entity-proposal-2.md`. D3's price (a
person who has not pressed can stall another actor's writes to one record, made visible as evidence) is a guarantee
and comes back to the user there. A module's defect (D46) is settled there too (U7).
~~~~

~~~~current
#### 2.8.6 Unknown, retry and uncertain (E2, E3, E7, E8)
~~~~
~~~~new
#### 2.8.6 Unknown, retry and uncertain (E2, E3, E7, E8)

**Phase 1** (U10, U11; OD48): what clears `uncertain` is FOR-ARPIT Q7 A (rule 32's last sentences), written here with
the entity store; where this section lets a later write's success clear a mark, it is superseded until then.
~~~~

### E87 Decision log: OD40 closed, OD48 added

~~~~current
restore, `TwoDefaults` from the Schema's structure, evaluated per actor at each door (2.2.2). Whether a default
  may read a clock is open, U12. (2026-11-07)
~~~~
~~~~new
restore, `TwoDefaults` from the Schema's structure, evaluated per actor at each door (2.2.2). A default may not
  read a clock or randomness: an Effect-valued default is a construction error (U12 B, OD48). (2026-11-07)
~~~~

~~~~current
  (FOR-ARPIT section 4) and `TurnStorm` and `AsksForever` (call 5, D122). (2026-11-07)
~~~~
~~~~new
  (FOR-ARPIT section 4) and `TurnStorm` and `AsksForever` (call 5, D122). (2026-11-07)
- **OD48** The user, 2026-11-07, the design catch-up's label round (the Claude Code session): every user-judged
  conflict, U1-U18 in [change-list.md](../../proposals/design-catch-up/change-list.md), accepted at its recommended
  option. **U1 B**: no Flow timeout; a call's deadline is its commit's Effect
  (`Effect.timeoutOrElse(..., () => Outcome.unknown(...))`). The user overturned their remark of 2026-11-01 ("rule 25
  is cancelled, timeouts return"); rule 25 stands and the prototype's D8 is not taken. **U2**: a key-less member names
  only its ending's own Attempt; rule 43's second clause is cut (D22; amends OD8). **U3**: restore delivers, per lane,
  each queued commit's `NotSent { Restored }` first, then the head's `unknown` (D107; rule 44, 2.7.13; reverses R10
  L2's order). **U4**: a lane whose key no longer decodes is quarantined: it keeps its id and its hold, a commit on it
  declines `Rejected`, the record stays, `cancel` on that key clears it (D88); key-equality adoption is cut (D20);
  `orphaned` (P19) moves to `revisit.md` (rules 8, 46, 2.7.15, 2.9.4). **U5**: `concurrency: "allow"` is cut from v1
  everywhere, its text prior art in `revisit.md` (D19; amends OD20 F9; rules 21, 29, N2, 2.7.8, 2.7.13). **U6**:
  encoding never fails a turn; memory that cannot encode skips its capture batch, named `UnencodableValue`; a commit
  whose input or key cannot encode declines `NotSent { Unencodable }`, a new Flow reason, with the value kept for its
  mapper; a lookup ends `Defect`; a guard key denies; a module value is dropped (D89, D100, D108, D114, D139; rule 12).
  **U7**: a module's defect is settled in phase 1 with the entity store; restore is per record now (D46; rule 46).
  **U8**: sends before the Runtime is ready queue until boot, within Persistence O5's bound; past the boot bound or on
  a failed read, `StorageFailure`, the Runtime runs without persistence and flushes the queue (D87; 2.10.17.6,
  2.7.17). **U9**: creation checks a present input by its Schema's type side and runs no transforming decode (D219;
  2.2.2). **U10**: rule 32 follows FOR-ARPIT Q7 A (a later success cannot clear a mark, nor can time; after give-up
  `uncertain` until the next read, then `unconfirmed`, quiet, until proof), keeping OD28 P1's release as what moves a
  mark from `uncertain` to `unconfirmed`; written into rule 32 and 2.8.6 in phase 1 with the entity store. **U11**:
  the entity-store decisions are deferred to phase 1 (2.8). **U12 B**: memory defaults are pure; an Effect-valued
  default is a construction error; a time or an id comes from an event or the Runtime's mint; E10's per-actor
  evaluation stays (2.2.2; closes OD40's open point). **U13**: Runtime disposal past its bound ends the Attempt
  `unknown { Disposed }`; within the bound it settles and is parked (2.7.1, 2.7.13). **U14**: `disposeActor` flushes
  its removal at once; an unbound lane record left after it ends when an ensure of the identity adopts it or `forget`
  removes it, and until then Inspection lists it as unbound under the identity and each boot reports it (2.7.13,
  2.7.20). **U15 B**: `persist` is a property of the machine, declared on its definition (`definition({ id, persist:
  true, … })`), and refs lose it; `ConflictingActorRef` remains for `context` only (rule 74, 2.7.17, 2.7.19). **U16
  A**: storage waits have no bound; `StorageSilent` names a write unanswered after 10 s and decides nothing; the limit
  is stated in rule 24 and 2.7.20. **U17 B**: an actor version and an operation key's fingerprint compare the type
  side and the encoded side, ignoring annotations (a transformation change is a new version; a brand or description
  is not); this amends FOR-ARPIT Q1 A (OD39), which compared the encoded side only (rule 74, 2.7.15). **U18**:
  `ReservedStateName`, `InputFieldForm`, `StorageSilent`, `RestoreMissingInput` and `UnencodableValue` are accepted
  public names. Agent calls made in applying them (the builder of pass 3): a lane whose operation is gone is kept
  like a quarantined lane until `forget`; a quarantined lane's `cancel` may come from any subject path; `Unencodable`
  must be mapped where an input or key Schema admits a value with no form; `persist` sits on the definition. Plan rows
  C150-C161. (2026-11-07)
~~~~

### E88 Plan rows C150-C161

~~~~current
| C149 | Runtime O4 | Follow-ups are bounded at 64 per admitted event; past it the turn is refused `InvalidTurn` naming the chain (2.5 step 1; D13, D35; OD46) | Adds |
~~~~
~~~~new
| C149 | Runtime O4 | Follow-ups are bounded at 64 per admitted event; past it the turn is refused `InvalidTurn` naming the chain (2.5 step 1; D13, D35; OD46) | Adds |
| C150 | Operations O3 | A key-less `retry`, `retryable` or `cancel` in an ending's handler names that ending's own Attempt only; once it is resolved or released, a key-less member acts as on an `Idle` lane (rule 43, 2.7.13; U2, OD48) | Amends C33's lane table (rule 43's "and, once it is resolved or released, the lane's addressable one" is cut); no Operations plan sentence names it |
| C151 | Persistence O4 | On a reload, per lane in creation order, each queued commit's `NotSent { Restored }` first, then a `Held` head's `unknown { Restored }` (rule 44; U3, OD48) | Amends C46's "a `Held` head's `unknown { Restored }` … and, on reload, `W`'s `NotSent { Restored }`" (the order is reversed) |
| C152 | Persistence O5 | A lane whose key no longer decodes, whose operation is gone, or whose recorded path the placement cannot produce is quarantined: it keeps its id and hold, a commit on its key declines `Rejected`, the record stays, Inspection lists it and each boot reports it, and `cancel` on that key (or, with no operation, `forget`) clears it; no key-equality adoption; no `orphaned` (rule 46, 2.7.15, 2.9.4; U4, OD48) | Replaces P19 ("after ready it goes to its descriptor's `orphaned` handler (which may `retry` or invalidate), or else surfaces as an issue") and C62's "adopts by key equality only when its last part is the contract's single key field, else `orphaned`" |
| C153 | Operations O1, O3, CommandLine O5 | `concurrency` is `reject`, `latest`, `cancel` or `serialize`; `allow` is cut from v1 (rules 21, 29, N2; U5, OD48) | Replaces Operations O1's "concurrency is required and is reject, cancel, allow or serialize" and Operations O3's "allow starts every commit independently and delivers every outcome in settlement order"; removes C18's type errors "under `allow` outside an ending's own handler" |
| C154 | Operations O3, Persistence O5, Diagnostics | Encoding never fails a turn: memory skips its capture batch (`UnencodableValue`); a commit whose input or key cannot encode declines `NotSent { Unencodable }` with the value kept for its mapper; a lookup ends `Defect`; a guard key denies `Unencodable`; a module value is dropped (rule 12; U6, OD48) | Replaces Operations O3's "unencodable input rejects admission before work starts"; adds `Unencodable` to C2's reasons and `UnencodableValue` to Persistence O5's "the whole write is skipped with the codec's code" |
| C155 | Runtime O4, Persistence O5 | A send to a persisted actor before boot queues until boot, within O5's bound; past the boot bound or on a failed read, `StorageFailure`, no persistence, the queue flushed, a late answer ignored (2.10.17.6, 2.7.17; U8, OD48) | Adds to Persistence O5's "A storage read failure reports StorageFailure and disables persistence for that Runtime"; replaces 2.10.17.6's `ActorAbsent` for such a send |
| C156 | Machines O1 | Creation checks a present input by its Schema's type side; no transforming decode (2.2.2; U9, OD48) | Adds to Machines O1's input rule; no plan sentence says "decode" |
| C157 | Machines O1, Diagnostics | A memory default is pure: an Effect-valued default is a construction error; a time or an id comes from an event or the Runtime's mint (2.2.2; U12 B, OD48) | Keeps Machines O1's "initial is pure: it reads no clock or randomness"; amends C137 |
| C158 | Runtime O6, Operations O3 | Runtime disposal: a call that settles within the bound is parked; past it the Attempt ends `unknown { Disposed }` (2.7.1, 2.7.13; U13, OD48) | Replaces Runtime O6's "after 5 seconds a commit still in flight becomes unknown with its Attempt" (now `unknown { Disposed }`); adds `Disposed` to C2's unknowns |
| C159 | Runtime O6, Persistence O3, Inspection O1 | `disposeActor` flushes its removal at once; an unbound lane record it leaves ends at an adopting ensure or `forget`, listed as unbound under the identity and reported at each boot until then (2.7.13, 2.7.20; U14, OD48) | Adds to Runtime O6's "runtime.disposeActor(actor) disposes the actor for every user"; amends C45 |
| C160 | Persistence O2, Runtime O3, Machines O1 | `persist` is a property of the machine, on its definition (`definition({ id, persist: true, … })`); refs carry no `persist`; `ConflictingActorRef` for `context` only (rule 74; U15 B, OD48) | Replaces Persistence O2's "actorRef(machine, id, { persist: true }) selects a stable shared actor" (C120's `actorRef(machine, nameOrValue, { persist: true })`) and Runtime O3's "different persist, retain or context" (C104, C144: `persist` and `context`); amends C104, C120, C144 |
| C161 | Runtime O3, Operations O1, Persistence O5 | An actor version and an operation key's fingerprint compare each field's type side and encoded side, ignoring annotations (rule 74, 2.7.15; U17 B, OD48) | Amends C135's fingerprint ("each key field's encoded JSON Schema") and C120's O5 version rule; amends FOR-ARPIT Q1 A |
~~~~

### E89 Rulings with no plan row (no MD block)

U1 keeps the design (no plan sentence names a Flow timeout); U7, U10 and U11 are phase 1's; U16 and U18 amend C131,
C137, C145 and C146 in place (E83, E85). So they add no plan row.

### E90 Earlier plan rows point at the rows that amend them (C2, C33, C46, C62, C104, C120, C135, C144)

Added after the sweep for stale terms; applied by `apply3.py` restricted to E90.

~~~~current
`interrupt` and `defect` stop being outcome keys. Flow has no timeout reason | Replaces the `reject` and "ends it as interrupt" sentences |
~~~~
~~~~new
`interrupt` and `defect` stop being outcome keys. Flow has no timeout reason | Replaces the `reject` and "ends it as interrupt" sentences; amended by C154 (`NotSent { Unencodable }`) and C158 (`unknown { Disposed }`) |
~~~~

~~~~current
| Replaces C8 and Operations O3's disposal sentences; amended by C68 (operations in fragments) |
~~~~
~~~~new
| Replaces C8 and Operations O3's disposal sentences; amended by C68 (operations in fragments) and C150 (key-less members) |
~~~~

~~~~current
| Replaces "restore resumes in the saved leaf and delivers saved outcomes"; amended by C62 (operations in fragments) |
~~~~
~~~~new
| Replaces "restore resumes in the saved leaf and delivers saved outcomes"; amended by C62 (operations in fragments) and C151 (the order within a lane) |
~~~~

~~~~current
(rules 46, 51; P19 gains the case) | Amends C46, C47, P19 |
~~~~
~~~~new
(rules 46, 51; P19 gains the case) | Amends C46, C47, P19; amended by C152 (no key-equality adoption, no `orphaned`) |
~~~~

~~~~current
from "different persist, retain or context" (C117 rewrites the rest) |
~~~~
~~~~new
from "different persist, retain or context" (C117 rewrites the rest); amended by C160 (`persist` on the definition) |
~~~~

~~~~current
ignores fresh input"; adds to O5's version-change paragraph |
~~~~
~~~~new
ignores fresh input"; adds to O5's version-change paragraph; amended by C160 (O2: `persist` on the definition) and C161 (versions) |
~~~~

~~~~current
(now no `ensure(ref)` takes input) |
~~~~
~~~~new
(now no `ensure(ref)` takes input); amended by C160 (`ConflictingActorRef` for `context` only) |
~~~~

~~~~current
| Replaces 2.7.15's "Changing a contract's key fields is therefore a persistence break"; adds to C2's reasons |
~~~~
~~~~new
| Replaces 2.7.15's "Changing a contract's key fields is therefore a persistence break"; adds to C2's reasons; amended by C161 (type and encoded side) |
~~~~

## User-judged conflicts (ruled by the user, 2026-11-07, each at its recommendation; applied in pass 3)

Each: the question, both texts, the recommendation and why, and how reversible it is. The user ruled on all of them in the label round of 2026-11-07, each at its recommendation (OD48); pass 3 (E71-E89) applied them, and each item says where. "Design" quotes MD; "Prototype"
quotes the decision record.

**U1. Operation timeouts (rule 25; D8).** **Ruled: B, 2026-11-07** (E72; OD48).
- Design (rule 25, and 2.7.17 from OD31): "No Flow timeout and no Flow retry, of a session or a call"; "a transport
  deadline belongs inside the commit (`Effect.timeoutOrElse`, 2.7.6)".
- Prototype (D8): "`timeout` on operations, per send. Write: `unknown { TimedOut }` at the timer, then interrupt. Read:
  `failure { TimedOut }`. Absent means none. Timer starts at invocation." The user said on 2026-11-01 that rule 25 is
  cancelled and an operation-level timeout should come back (memory, prototypes).
- A: the prototype's `timeout` property and the `TimedOut` reasons. B: keep the design: the timeout is the commit's
  Effect (`Effect.timeoutOrElse(..., () => Outcome.unknown(...))`), as OD28's G classifies lost errors with Effect's
  own words.
- **Recommendation: B**, because OD31 and OD28 (2026-11-07) are newer than the 2026-11-01 remark and say the same, and
  a Flow word adds a second way to spell one Effect. **Said plainly: this recommendation asks the user to overturn
  their own remark of 2026-11-01 ("rule 25 is cancelled, timeouts return").** Reversible: easy either way before
  phase 4.

**U2. Key-less members (rule 43; D22).** **Ruled: the prototype (D22), 2026-11-07** (E73; OD48).
- Design: a key-less member names "that ending's Attempt and, once it is resolved or released, the lane's addressable
  one (holding policies only)".
- Prototype (D22): "Key-less members name the ending's own Attempt only (rule 43's second clause cut)."
- **Recommendation: the prototype**: one meaning, proven by the suite since round 1; the second clause reaches an
  Attempt the handler never saw. Reversible: cheap now, a type-level change after phase 4.

**U3. Restore order within a lane (rule 44, 2.7.13; D107).** **Ruled: the prototype (D107), 2026-11-07** (E74; OD48).
- Design: per lane, "the head's `unknown { Restored }` ... then, on a reload only, each `W` entry's
  `NotSent { Restored }`".
- Prototype (D107): "Restore delivers, per lane, `W`'s `NotSent { Restored }` first, then the head's `unknown`", so the
  hold's route is the last one and a queued press's answer cannot run over the prompt the hold needs.
- **Recommendation: the prototype**, for the trace `Go Go ack KILL`. Reversible: cheap; a delivery-order guarantee, so
  the user's.

**U4. A lane whose key no longer decodes, and key-equality adoption (rule 46, 2.7.15, P19; D20, D88).** **Ruled: the prototype, `orphaned` to revisit.md, 2026-11-07** (E75; OD48).
- Design: such a lane "goes to `orphaned` (P19)"; "A recorded path the placement cannot produce is adopted by key
  equality only when the placement's last subject part is the contract's single key field".
- Prototype: D88 "A quarantined lane keeps its id and its hold. A commit on it declines `Rejected`. The record stays on
  disk. Cleared by `cancel` on that key; `orphaned` (P19) stays unbuilt"; D20 cuts key-equality migration.
- **Recommendation: the prototype**, with `orphaned` moved to `revisit.md`: a hold is never dropped, and D221's
  versions now cover key changes. Reversible: moderate (orphaned is unbuilt either way).

**U5. `concurrency: "allow"` (rules 21, 29, N2; D19).** **Ruled: cut from v1, text to revisit.md, 2026-11-07** (E76; OD48).
- Design: `allow` throughout (rows, `HeldThisTurn`, rule N2).
- Prototype (D19): "Cut `allow`. 3 corpus uses, written for coverage. `presence` fits `cancel`; a nudge is `reject`
  with its own key." Never built in rounds 1-13.
- **Recommendation: cut `allow` from v1** and keep its text as prior art in `revisit.md`: no real app needs it and
  nothing has proved it. Reversible: moderate (a lane column to add back later). Scope, so the user's.

**U6. Values that cannot be encoded (D89, D100, D108, D114).** **Ruled: the prototype, `Unencodable` and `UnencodableValue`, 2026-11-07** (E77; OD48).
- Design: silent; rule 22 makes a failing select `InvalidTurn`.
- Prototype: encoding never fails a turn. Memory that cannot encode skips the capture batch and keeps the last good
  one, named; a commit whose input or key cannot encode declines `NotSent { Unencodable }` with the value kept for its
  mapper; a lookup ends `Defect`; a guard key denies; a module value is dropped.
- Held back with U6 (pass 2): D139's `UnencodableValue` [P], "a `Symbol` or a value with no form" where a value must be
  carried. Pass 1 applied it as agent-judged (E26); E62 took it out, keeping only the `InputFieldForm` lint.
- **Recommendation: the prototype**, with `Unencodable` added to Flow's reasons and `UnencodableValue` as the issue.
  Reversible: cheap now; a new reason name and a guarantee, so the user's.

**U7. A module's defect (D46).** **Ruled: settle in phase 1; restore per record now, 2026-11-07** (E75, OD48; OD48).
- Design: silent on modules.
- Prototype: a module defect fails closed (what joined stays unsent; what would join declines
  `NotSent { ModuleDisabled }`); a core bug is fatal to the Runtime until reload; a user closure outside a turn is an
  issue with a stated default; restore is per record.
- **Recommendation: settle in phase 1** with the entity store, the only module; keep "restore is per record" now
  (already true by rule 46). Reversible: cheap.

**U8. Sends before the Runtime is ready (2.10.17.6; D87).** **Ruled: the prototype (D87), 2026-11-07** (E78; OD48).
- Design: "While a restore read is held, the tab has not finished bootstrap: its persisted actors are absent, and a
  send to one is `ActorAbsent`."
- Prototype (D87): "Queue until boot, with O5's bound. Past `bootMs`, or on a failed read: `StorageFailure`, run
  without persistence, flush the queue."
- **Recommendation: the prototype**, as OD31's send table already queues for an ending persisted target.
  Reversible: cheap.

**U9. Creation checks input; it does not decode (2.2.2; D219).** **Ruled: the prototype (D219), 2026-11-07** (E79; OD48).
- Design: "decode the input with the derived `Input` schema".
- Prototype (D219): "Creation checks a present input by its Schema's type side; it does not run a transforming
  decode", since the creator hands an in-process value, not JSON; a `NumberFromString` field given `"3"` is refused.
- **Recommendation: the prototype.** Reversible: cheap.

**U10. Rule 32: what clears `uncertain` (FOR-ARPIT call 7, Q7 A, against OD28 P1).** **Ruled: Q7 A, written in phase 1, 2026-11-07** (E86; OD48).
- Design (OD28 P1, 2026-11-07): every unretained unknown is `Released`; "a later write's success still clears it,
  rule 32".
- FOR-ARPIT Q7 A (accepted 2026-11-07): "a later success can't clear a mark, and neither can time. After give-up,
  `uncertain` until the next read, then `unconfirmed`, quiet, until proof"; the plan edits listed for the user's yes
  (`round-9/entity-proposal-2.md` section 5).
- Both are the user's, the same day. **Recommendation: Q7 A**, keeping OD28 P1's release (it is what moves a mark from
  `uncertain` to `unconfirmed`), written into rule 32 and 2.8.6 in phase 1 with the entity store. Reversible: cheap
  until the entity store is built.

**U11. Entity-store decisions (rules 29-31, 2.8.5, 2.8.6; D3, D12, D15, D18, D39, D40, D49's record half, D47 to
D76's judge).** **Ruled: defer to phase 1, 2026-11-07** (E86; OD48). **Recommendation: defer to phase 1**, which builds `round-9/entity-proposal-2.md`; the label round
confirms the deferral. D3's price (a person who has not pressed can stall another actor's writes to one record, made
visible as evidence) is a guarantee and comes back to the user there.

**U12. May a memory default read a clock or randomness (2.2.2, OD40)?** **Ruled: B, 2026-11-07** (E79, E87; OD48).
- Design: "Creation is pure ... No clock, no randomness".
- Round 13's H1 fix (accepted): "evaluate the default per call at each entry point", motivated by
  `withConstructorDefault(Effect.sync(() => new Date()))` and `randomUUID()`.
- A: allowed, evaluated per actor (the value is then not replayable). B: defaults must be pure; an Effect-valued
  default is a construction error, and a time or an id comes from an event or the Runtime's mint.
- **Recommendation: B**: it keeps creation deterministic (AGENTS.md's core rules). E10's sentence stays either way: a
  default is evaluated for each actor at each door, never computed once and shared. Reversible: cheap.

**U13. Runtime disposal past its bound (Runtime O6, 2.7.13's Runtime-disposal row; round 14's final review).** **Ruled: `unknown { Disposed }`, 2026-11-07** (E80; OD48).
- Design: on the wire, "Runtime O6 (settles within its bound, else unknown)"; no reason is named, and C2's list has
  none for it.
- **Recommendation:** within the bound, the ending is parked as the row says; past it, `unknown` with reason
  `Disposed`, reusing the word `NotSent` already has. Reversible: cheap; a reason name, so the user's.

**U14. `disposeActor` durability (Persistence O3; round 14's final review).** **Ruled: flush the removal; the unbound record ends at adoption or `forget`, 2026-11-07** (E81; OD48).
- Design: silent; with a 5 s capture interval (OD35) a crash before the capture brings the record back.
- **Recommendation: flush the removal at once**, as a lane batch is (the prototype's D93 did), rather than state a
  limit. Reversible: cheap.
- Also open (pass 2): after `disposeActor`, an unbound lane record (R14 D6, E17) has no end. When does it end, and what
  names it in evidence and Inspection meanwhile? **Recommendation:** it ends when an ensure of the identity adopts it
  or `forget` removes it; until then Inspection lists it as unbound under the identity, and each boot reports it, as
  `OldVersionLane` does for an old-version hold.

**U16. Is a wait on storage bounded? (rule 24, 2.7.20; D30, D48, D94.)** **Ruled: A, 2026-11-07** (E83; OD48).
- Design before the catch-up: silent; it never bounded storage. Pass 1 applied the prototype's three rules as
  agent-judged; pass 2 keeps their text in MD, marked U16, with a stated limit in rule 24 and 2.7.20, because each
  is a safety rule whose price is liveness on a broken disk, and that price is a guarantee.
- Prototype: D30 "silent means pending": no ending is invented, so a shopper can sit on "Paying…" with a dead disk.
  D48: a cancel or `latest` replacement of a never-sent Attempt waits for its acknowledgement, so on a hung disk the
  cancel never takes effect. D94: an awaited write waits for any plain batch of its actor still out, so a hung plain
  batch stalls an awaited write.
- A: no bound. Each wait lasts until the disk answers; `StorageSilent` [P] names it after 10 s and decides nothing;
  the limit is stated. B: a bound (D14's 10 s, superseded by D30): past it the write counts as refused, the commit ends
  `NotSent { StorageRefused }`, the cancel takes effect and the awaited write goes on. B's price: an acknowledgement
  that lands after the bound restores the head as unknown, so "You haven't been charged" may be false (D30's reason),
  and the cases D48 and D94 fixed (a cancelled Attempt restoring unknown; a completed `pay` coming back held) return.
- **Recommendation: A**, correctness first: every answer B adds is one the UI cannot know. Reversible: cheap now (a
  bound is one host timer); a guarantee, so the user's.

**U17. What makes a new version: the encoded side only, or the type side too? (rule 74, 2.7.15; R14R 7, Q1 A.)**
- Pass 1 (R14R 7, agent-judged, overturned by the review and reverted by E50): an actor version compares each identity
  field's encoded Schema structurally, ignoring annotations, as the accepted Q1 A says for operation keys.
- The gap, for actors: with OD30 Q6 every identity field encodes to a string, so `Schema.String` to
  `Schema.NumberFromString` keeps the encoded Schema and is not a new version, though ref values encode differently:
  a record saved for the value `"007"` is named `"007"`, and the new release's value `7` encodes to `"7"`, another
  identity. The old record is neither adopted nor listed as an old-version record.
- The same gap, for operation keys under Q1 A: `k: Schema.String` to `k: Schema.NumberFromString` keeps the key's
  fingerprint, so an old lane keyed `"007"` counts as current, while the new code keys the same order `"7"`. The old
  hold blocks nothing the new key names, and a second send can go out beside an unsure first (round 13's H2 harm).
- A: the encoded side only, ignoring annotations (Q1 A as accepted; pass 1's reading for actors). B: the type side and
  the encoded side, ignoring annotations, for actor versions and operation keys (amending Q1 A): a transformation
  change is a new version; a brand or a description is not.
- **Recommendation: B, "type and encoded side, ignoring annotations".** **Ruled: B, 2026-11-07** (E84; OD48). Reversible: cheap before phase 4; a
  persistence guarantee, so the user's.

**U18. The proposed public names ([P]), as one batch.** **Ruled: accept the spellings, 2026-11-07** (E85; OD48). `ReservedStateName` (a state named `self` or `__proto__`),
`InputFieldForm` (an input field whose decoded form cannot be carried, a warning), `StorageSilent` (a write the disk
has not answered after 10 s, evidence), `RestoreMissingInput` (a record lacking an input field with no default), and,
with U6, `UnencodableValue`. Pass 1 applied them as agent rulings; they are public finding and evidence names, so the
user's. The names the user already accepted (`KeyFieldOptional`, `TwoDefaults`, `OldVersionLane`,
`UnknownNotUncertain`, `TurnStorm`, `AsksForever`) are recorded as decided in OD47. **Recommendation: accept the
prototype's spellings.** Reversible: cheap until phase 7's docs.

**U15. `persist` per ref, identity per machine and input (rule 74; round 14's final review).** **Ruled: B, `persist` on the definition, 2026-11-07** (E82; OD48).
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

Pass 2, run 2026-11-07 by `apply2.py` (the builder's scratchpad), which reads only the blocks under "Pass 2 entries",
in order, with the same exactly-once rule.
- Applied: all 34 blocks of E50-E70. Skipped: none. No block needed adjusting.
- Judgement calls: D48's rule stays in rule 24 as safety (agent), with its liveness price moved to U16; D30's and D94's
  text stays in 2.7.20, marked U16 rather than agent, since the design never bounded storage and the stated limit
  needs the rule beside it. The review's finding 13 ("one line against React O3") is C147 plus one sentence in 2.5
  step 1. Finding 16's convergence-9 item is recorded in rule 8 (a boot forgets a stranded read), and its unbuilt lint
  is listed for the user in progress.md.

Pass 3, run 2026-11-07 by `apply3.py` (the builder's scratchpad), which reads only the blocks under "Pass 3 entries",
in order, with the same exactly-once rule, after a dry run on a copy of MD.
- Applied: all 90 blocks of E71-E88, then, after the sweep for stale terms, the 8 blocks of E90 (`apply3.py` restricted
  to E90). Skipped: none. E89 has no block.
- Adjusted before the run: the two table-row deletions under E76 (2.7.8's and 2.7.13's `allow` rows) anchor on the
  `cancel` row above them, so that no empty line breaks the table; OD46's two U16 and pass-2 sentences were added to
  E85 so no U mark is left stale.
- Judgement calls (agent, listed in OD48 and progress.md): a lane whose operation is gone is kept like a quarantined
  lane until `forget` (U4 names only the undecodable key); a quarantined path's `cancel` may come from any subject
  path (rule 51 would otherwise decline it); `Unencodable` is required in rule 20 where an input or key Schema admits a
  value with no form; `persist` sits on the definition, since `machine()` takes no options and the definition already
  holds `context` and the persisted memory; 2.8.6's `NotSent` list gains `NoPersistence` and `OldVersion` with
  `Unencodable`, which pass 2 had added to rule 30 only. Decision entries before OD48 stay as history (D5, D19, D20,
  E17, OD8, OD20 F9, OD22, OD25 still say `allow` or `orphaned`); OD35, OD39, OD40 and OD46 point at OD48. The
  2.7.17 and 2.7.19 "before" examples keep `{ persist: true }`, since they show the old API.

## Completion audit fixes (2026-11-08)

The phase 0b completion audit failed the pass on: the `persist` placement recorded as decided (now proposed, for the user, U19); the U12, U13, U16 and U17 headers (fixed); the 2.8.6 reason-list call missing from the records (added to OD48 and progress.md); `Rejected` unmapped for kept endings and quarantined lanes (rules 20, 2.7.1 fixed); `Disposed` missing from rule 13 and 2.7.1's inferred channel (fixed); `Overloaded` in 2.8.6's list and C2's pointers (fixed); round 13's M1, M2, M4, M5 rows (inventory.md). Applied by the runner, not by a builder.

**U19. Where `persist` is spelled (U15 B's placement).** A (proposed): on the definition, `definition({ id, persist: true, … })`, beside `id` and `context`. B: an option of `machine()`. C: at registration, `app({ machines: [{ machine, persist: true }] })`. Recommendation: A, because the definition already holds the machine's declarations and the persisted memory. Reversible: cheap before phase 4. API shape, so the user's.

