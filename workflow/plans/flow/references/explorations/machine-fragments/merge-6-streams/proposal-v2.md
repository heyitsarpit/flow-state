# Streams, designed from the brief (merge 6, proposal v2)

Status: **proposed, written 2026-10-31.** Nothing in this file is decided except what it cites as decided (K1–K19,
M6-D1–D7, OD*n*). Every new public word is an owner question (section 8). Built only from
[brief.md](brief.md), [../machine-design.md](../machine-design.md) (MD), [../merged/operations/decisions.md](../merged/operations/decisions.md)
(OD), `workflow/plans/flow/*.plan`, installed Effect 4.0.5 (EFX), TanStack Query's `streamedQuery.ts`, and the owner's
prior-art notes [prior-art-1.md](prior-art-1.md) (PA1) and [prior-art-2.md](prior-art-2.md) (PA2). The earlier
proposal, gaps and reviews were not read. Code is not compiled; Effect calls were checked against EFX where cited.

Keyword marks in code: `// NEW:` a word this proposal adds; `// RENAMED:`; `// existing:` in MD or the plans;
`// accepted:` an M6-D word; `// user-defined:` the author's own name; `// Effect:` an Effect 4.0.5 export.

## 1. The answer in short

**One idea.** A stream session is a *connection the adapter narrates* and Flow *keeps honest*. The adapter (author
code, plus two Flow-shipped combinators) is the only thing that sees close codes, greetings, SDK statuses and
positions; it tells Flow three things in-band, in order with the values: **the server is listening now, and what that
proves about the past** (`Feed.live`), **the connection dropped and I am reconnecting** (`Feed.down`), and **this is a
value**. Flow turns that narration into one small state machine per session (section 3.1) with every input defined, a
row the view reads, and three outcome keys the machine maps. Flow compares no positions, reads no transport, retries
nothing and measures no wall time.

**Five general rules carry the whole design** (each walk and failure in sections 4 and 5 is answered by citing them):

| Rule | Statement |
| --- | --- |
| **R-Kind** | The contract says `delivers: "facts"` or `"state"`. Facts are never skipped, coalesced or equality-silenced, one per turn; state coalesces to the newest and is current only while the connection that sent it is live. |
| **R-Live** | A connection is live only once the adapter says so, or once it delivers a value (the conservative reading). Every connection start on a fact feed carries one continuity answer: **proven** (with a basis string), **lost**, or **unproven** (the default). Anything not proven is delivered as `missed` before any later fact. |
| **R-Position** | Positions belong to the source. Inside a session `Feed.reconnect` resumes from the last value it passed; across sessions the resume position is an ordinary `input` field (K2) that the machine fills from its memory, which only fact turns advance. So no position can pass a fact the consumer has not handled or explicitly accepted as missed. |
| **R-Owner** | A session belongs to its placement's activation. Releasing it discards what it has not delivered, with evidence, and a new session for the same (actor, operation, key) opens only after the old one's clean-up finished. Endings of a session are current, never late. |
| **R-Repair** | Repair happens where the knowledge is: in the adapter (a server replay, or `Feed.reconnect`'s `catchUp` read), in the entity domain (`listen` lowers covered answers), or, where nothing can repair, in the machine's explicit acceptance of `missed`. Flow never runs a repair the author did not declare. |

**Concepts per tier** (words an author writes; read-only tooling words are counted apart in section 7):

| Tier | New words | Accepted (M6-D) or existing words reused |
| --- | --- | --- |
| **Common** (11) | `Feed.reconnect`, its options `from`, `position`; `Feed.live` and its `proof`; outcome key `missed`; row fields `drop`, `value`, `last` (`{ value, at }`); Flow reason `Closed`; connection literals `Connecting` / `Live` / `Ended` (counted as one) | `delivers` (M6-D4), `connection` (M6-D4), `key`, `input`, `output`, `subscribe`, `subscribe.each`, `outcomes`, `value`, `failure`, `Effect.retry`'s `while` and `schedule` |
| **Uncommon** (5) | `Feed.down`, `Feed.callback` (with `emit`), its `bufferSize`, `catchUp`, Flow reason `Overflow` | the write row's `progress` (M6-D5); the commit context's `progress(p)` reuses the word |
| **Rare** (4) | `Feed.live({ lost, restartAt })`, `missed`'s `why` literals, `resetAfter` | `{ target: "self" }` as the explicit acceptance |

**Why this set.** Every source in the brief's 1.2 differs in transport and agrees on three facts: the server starts
listening, the connection drops, a value arrives. Ably's channel `attached` with `resumed` (PA1 section 1), Socket.IO's
`socket.recovered` (PA2 section 2), Electric's `up-to-date` and `must-refetch` (PA1 section 2) and Phoenix's join reply
(PA1 section 4) are each one of `Feed.live`'s three answers; EventSource's and graphql-ws's absence of any such signal
is the default (unproven). So one signal with three answers covers every source the brief names and the five it does
not (DG3), and Flow needs no per-SDK concept. Everything the common tier would otherwise write identically (backoff,
budget reset, resume-from-last, overflow, continuity ordering) is in the two combinators and the session table, so the
chat machine has no algorithm (DG2), and a common-tier author who writes nothing about continuity gets the
conservative answer (`missed`, unproven) as a type-required handler (DG5).

**What is cut** (section 8 asks about each): outbound ephemeral state (cursors) as a Flow concept (workaround in 4.8);
machine-driven repair with a "resolve" member (repair is the adapter's or the domain's); a Flow-owned resume position;
the stream contract's `persist` option; a Flow-level flap budget for SDKs that reconnect themselves; one shared
session per Runtime (M6-D6 stays open).

## 2. The design

### 2.1 Before and after, the whole shape

Before (the plans today: OPS O1, O4, O6; MCH O6):

```ts
// chat.operations.ts (before)
export const messages = stream({                    // existing: stream
  id: "Chat.messages",
  key: ({ roomId }) => ({ roomId }),                // existing: key(params), replaced by OD4's field list
  subscribe: (params, { signal }) => openRoom(params.roomId),   // existing: subscribe; user-defined: openRoom
  result: Message,                                  // existing: result, RENAMED output by OD12
  persist: false,                                   // existing: persist (dropped below)
})
// machine (before): an activity record; whether facts can be skipped depends on mapping `value` (OPS O4)
activities: { messages: O.messages.subscribe(({ memory }) => ({ roomId: memory.roomId }), { outcomes: { value: E.Message } }) },
// row (before): { _tag: "Running" | "Complete" | "Failure" | "Defect" | "Interrupted", data }
```

After:

```ts
// chat.contracts.ts (after)
import { Feed, stream } from "@flow-state/core"     // NEW: Feed (module); existing: stream
export const Chat = {
  messages: stream({
    id: "Chat.messages",
    input: { roomId: Schema.String, after: Schema.optional(Cursor) },   // existing: input; user-defined: after, Cursor (the resume position, outside key, K2)
    output: Message,                                // existing: output
    key: ["roomId"],                                // existing: key (one session per room)
    delivers: "facts",                              // accepted: delivers (M6-D4)
    subscribe: ({ roomId, after }) =>               // existing: subscribe
      Feed.reconnect((from) => ChatSocket.room(roomId, from), {   // NEW: Feed.reconnect; user-defined: ChatSocket.room
        from: after,                                // NEW: from (where the first connection resumes)
        position: (m) => m.cursor,                  // NEW: position (how a value names its place)
        while: (e) => e._tag === "ChatDropped",     // Effect.retry's word: which errors are transient (SR15)
        schedule: Schedule.exponential("500 millis").pipe(Schedule.jittered, Schedule.upTo({ times: 8 })),   // Effect: the budget
      }),
  }),
}
```

```ts
// chat.definition.ts (after, excerpt)
operations: ({ E }) => ({
  messages: Chat.messages.outcomes({                // existing: outcomes
    value: E.Message.from((message) => ({ message })),            // existing: value
    missed: E.MayHaveMissed.from((m) => ({ why: m.why })),        // NEW: missed (required on a fact feed that maps value)
    failure: { SignedOut: E.SignedOut, ChatDropped: E.FeedEnded, Closed: E.FeedEnded, Defect: E.FeedEnded, Interrupted: E.FeedEnded },   // existing: failure; NEW: Closed
  }),
}),
// chat.machine.ts (after, excerpt)
LIVE: { activities: [O.messages.subscribe(({ memory }) => ({ roomId: memory.roomId, after: memory.cursor }))] },   // existing: activities, subscribe
// view (after)
const row = useView(chat, (s) => s.operations.messages)          // existing: s.operations
row?.connection === "Live"                                       // accepted: connection; NEW: "Live" on every row (FC50)
```

Added: `delivers`'s meaning (accepted word), `Feed.reconnect`, `from`, `position`, `missed`, `Closed`, the row's
`connection` on every phase, `drop`, `last`, `value`. Dropped: `persist` on streams, OPS O6's stream tags (`Running`,
`Complete`, …), OPS O4's "equal values are silent" for facts, "with value mapped … one value event waiting"
(replaced by R-Kind), and `DuplicateStreamSession`.

### 2.2 The contract

`stream({ id, input, output, key, delivers, subscribe })` (K1, K2). `delivers` is required: a stream's meaning is a
property of the data (1.2), so it sits on the contract next to `output` (locality), never on a consumer (SR1, FC3).
`subscribe(input, { signal })` returns `Stream<A | Feed.Signal<D, P>, E, R>` (M6-D2): a plain `Stream<A>` is valid and
gets the conservative meanings of section 3.1. `input` holds the key fields and, outside `key`, any resume position
(K2, OD12); a session reads its `input` **once, at start** (IP8): changing a non-key field never restarts a session,
and the next session starts from the field's then-current value. Streams stay exempt from `KeyOmitsInput` (MD
2.7.16); a non-key field that should restart a session belongs in `key` (stated).

### 2.3 The adapter vocabulary

All four are in a `Feed` module (NEW), adapter-side, used inside `subscribe` or the services it calls. None of them is
a Flow runtime concept beyond the three signals; the combinators are ordinary Stream code Flow ships so every app of a
kind does not write it again (DG2).

```ts
Feed.live()                                         // NEW: the server now delivers every later value; continuity unproven (the default)
Feed.live({ proof: "server replayed from after" })  // NEW: proof — nothing missed since this connection's `from`; the basis is recorded (SR6)
Feed.live({ lost: "server: start over" })           // NEW (rare): lost — something was missed
Feed.live({ lost: "log reset", restartAt: { epoch: 9, seq: 0 } })   // NEW (rare): restartAt — a new position space (SR11)
Feed.down(reason)                                   // NEW (uncommon): the connection dropped; the adapter reconnects; reason is typed author data (SR15)
```

`proof` is a **required string**, so an adapter cannot claim continuity without writing down why, and the basis is in
Inspection, Stories and `flow explain` (SR6, FC65). A proof means: *every value after `from`, in source order, follows
this signal* — the replayed or caught-up values come **after** it, as a replaying server sends them. That one reading
makes server replay (Ably `resumed: true`, Socket.IO `recovered`, an Electric `offset`) and an in-adapter catch-up read
the same thing to Flow.

**`Feed.reconnect(connect, options)`** (M6-D3, extended). One connection is `connect(from)`, a Stream that fails when
the connection is lost. The combinator:

- passes values and signals through, remembering `position(value)` of the last value passed (`undefined` keeps the
  previous one) and `restartAt` of a `lost` signal;
- on a failure `while` accepts, on `Feed.Overflow`, or on a connection that **completes** (`Feed.Closed`; a clean end
  is not final, SR16, FC29, FC37), emits `Feed.down(error)`, waits by `schedule` on Effect's `Clock`, and connects
  again from the remembered position;
- on any other failure, or when `schedule` is exhausted, fails the session with that error;
- restores the schedule to its first step only after a connection has been live for `resetAfter` (default
  `"1 minute"`), never on its first value (`Stream.retry`'s reset, EFX `Stream.ts:10489`, is FC41; Phoenix resets its
  rejoin timer on join `ok`, PA1 section 4, which has the same flaw against a greet-and-drop server);
- with `catchUp: (from) => Stream<A, E>`, on a connection whose answer is unproven or lost (not a reset) and `from`
  is defined: emits `Feed.live({ proof: "catch-up from <from>" })`, then the catch-up's values, while it buffers the
  connection's own values (bounded, 1,024; past it, `Overflow`); then emits the buffered values, dropping those whose
  position equals one the catch-up returned, until the first that does not. The catch-up starts only after the
  connection's live signal (FC51), is scoped to the connection (FC43), and its failure is the connection's failure
  (FC23, FC45). This is Ably's documented pattern, "subscribe first, then request history" with `untilAttach` (PA1
  section 1). `catchUp` must end only when the server says the range is complete (a stated contract; FC42).

**`Feed.callback(register, { bufferSize? })`** bridges a callback SDK or a raw browser API. `register(emit)` is a
scoped Effect; its finalizers run at release (and are awaited, R-Owner). `emit(valueOrSignal)` is synchronous;
`emit.fail(error)` and `emit.end()` finish the stream after what is queued. Values queue up to `bufferSize` (default
1,024); one more fails the stream with `Feed.Overflow`, a transient drop `Feed.reconnect` always retries (SR18: a
pushed source loses only with a reported loss at the point of loss). Signals never queue behind the bound and are
never evicted: consecutive signals with no value between them coalesce (section 3.3), so a flapping SDK costs O(1).
`emit` after release does nothing and counts evidence. `Stream.callback`'s default buffer is unbounded (EFX
`Stream.ts:699-729`); the docs use `Feed.callback` instead (FC34; a stated limit, since `flow check` reads no closure).

### 2.4 What Flow owns, and what it does not

| Flow owns (one per session, visible in Inspection) | The adapter owns |
| --- | --- |
| the session table (3.1): `connection`, `drop`, the continuity answer of each connection start, implicit live | transport, auth, close codes, greetings, SDK statuses, heartbeats (`Stream.timeoutOrElse` before decoding, so pings count) |
| delivery pacing (3.2): facts one per turn, state coalesced, `missed` before newer facts | classification into typed errors (`while`) and reasons (`Feed.down`) |
| the row, its `last.at` from the Runtime `Clock` at the moment of the last confirmation | positions, resume and catch-up (`Feed.reconnect`), with `from` from `input` |
| release, release-before-restart, discard with evidence | the budget (`schedule`, `resetAfter`) |
| `listen`'s effects on answers (2.8) | for SDKs that reconnect themselves: their own budget (stated, section 8 Q3) |

**Rule 25 holds** (SR13): Flow never re-opens a session. The adapter reconnects inside one; a session that ended
re-opens only when its placement starts again, which the machine decides (FC73 shows the shape). A two-second drop is
a `Feed.down` and a `Feed.live`, with no machine transition (FC4 as SR13 tests it).

### 2.5 The session and its lifecycle

A **session** is one run of `subscribe` for one placement and one key: (actor incarnation, operation, key). It is
owned by the **placement's activation** (R-Owner), not by the Runtime, unlike a write lane (OD19). The reason: a write
lane holds an obligation (a request that may have landed); a session holds only interest, and everything a later
session needs (the resume position, the messages) is already in the machine's persisted memory. So disposal, leaving
the state, or a key leaving `subscribe.each` releases the session; nothing is adopted or parked.

Lifecycle (SR33's table; every cell filled):

| Edge | Adapter | Flow session | Row | Machine | `listen` answers | Persistence |
| --- | --- | --- | --- | --- | --- | --- |
| placement starts (entry, key added) | `subscribe(input)` runs once the previous session for (actor, op, key) is Released | `Connecting`, no drop | `{ connection: "Connecting", drop: undefined }` (restored `last` if any) | nothing | covered answers stale (`feedDown`) | nothing |
| `Feed.live(proof)` | — | `Live`, answer proven | `Live` | nothing | staleness this session's drop caused withdrawn | nothing |
| `Feed.live()` / `lost` / first value | — | `Live`, answer unproven or lost | `Live` | facts: `missed` before the next fact | read-before-now answers lowered (refetch subscribed, else stale) | nothing |
| value | — | facts: one per turn; state: newest slot | `last` (and `value` for state) | `value` (state: if not equal to the last heard) | push applied | memory (the machine's handler) |
| `Feed.down(r)` / retryable failure | waits by schedule, reconnects from last position | `Connecting`, drop r | `Connecting`, `drop: r`; state `value` becomes `undefined`, `last.at` = now | nothing | covered answers stale (`feedDown`) | nothing |
| terminal failure, exhausted budget, completion | — | `Ended` | `{ connection: "Ended", failure }` | `failure` (after pending deliveries) | stale (`feedEnded`) until a read started later | nothing |
| leaving the state, key leaves `each`, actor disposal | scope closed: finalizers run, awaited | `Releasing`, then `Released` | `undefined` from the releasing turn | undelivered deliveries discarded, evidence `Discarded { Released }` | stale (`feedEnded`) | nothing |
| new incarnation (rebind, ensure) | new session | new table | as placement starts | nothing adopted | as placement starts | — |
| Runtime disposal | finalizers within RT O6's bound; providers close after consumers | `Released` | — | — | — | final capture holds memory and state rows' `last` |
| restore (reload) | new session from restored memory's `input` | new table | `Connecting`, restored `last` (state feeds) | no replay; the state baseline restored (2.9) | restored answers stale (EDP) | read |
| handover (leader tab closes) | as restore in the new leader | as restore | as restore | as restore | as restore | read |
| page wake (backgrounded tab) | the adapter's idle deadline is overdue and fires on wake: a drop | `Connecting` within one event-loop tick after wake | dimmed | nothing | stale | nothing |
| SSR (server) | sessions may run; released at capture | — | state `last` transferred | — | as EDP | — |

**Release before restart** (SR17, FC33). A new session for the same (actor, operation, key) starts only after the
previous session's scope has closed, within Runtime O6's 5-second bound; past the bound the old session is abandoned
with an issue (`ReleaseOverdue`) and the new one starts. While it waits, the new placement's row reads `Connecting`.
`Feed.callback`'s `emit` after release reaches nothing.

**Multiplicity** (SR39, AUD N1–N3). `subscribe.each` gives one session per distinct key (K4). Equal keys in two actors
are two sessions. Two operations on one stream contract and key in one actor are two sessions, each delivering every
value to its own consumer; `flow check` warns `DuplicateSession`. SSE's six connections per origin across tabs is a
stated limit (section 8 Q9 asks about one shared session per Runtime).

### 2.6 The row the view reads

```ts
type FeedRow<A, D, E> =                               // s.operations.x, or O.x.get(s, k) under each; undefined while not placed (K5, N3)
  | { key; connection: "Connecting"; drop: D | undefined; last: Last<A> | undefined; value: undefined }   // NEW: drop, last; state feeds only: value
  | { key; connection: "Live";       drop: undefined;     last: Last<A> | undefined; value: A | undefined }
  | { key; connection: "Ended";      failure: E | Feed.Closed | Defect | Interrupted; drop: undefined; last: Last<A> | undefined; value: undefined }
type Last<A> = { value: A; at: number }               // NEW: at = Runtime Clock ms of the last moment Flow knew it was current
```

- `connection` exists on every phase, so `row?.connection === "Live"` type-checks for a row that is undefined,
  connecting or ended (SR22, FC50). `drop` tells "Connecting…" (`undefined`) from "Reconnecting: offline"; `failure`
  says why it ended (FC9: `SignedOut` is a different branch from `ChatDropped`).
- **State feeds only** have `value`: the value confirmed by the **current** connection, or `undefined`. After a drop
  it is `undefined` until the new connection sends a value; an equal value confirms (SR20, FC20, FC53). `last` is the
  last confirmed value with `at`; while live `at` is its arrival, and on leaving `Live` `at` becomes that moment. The
  stale value is reachable only through the word `last`, so `show(row.value)` cannot show a stale price, and showing
  one is a visible `row.last.value` in the code (SR20). FC50's `live ? row.data : row.lastValue` cannot be written:
  there is no `data`.
- **Fact feeds** have no `value` (a type error to read it): a fact is not "current". `last` is the last fact taken,
  for a view that shows "last activity".
- Rows publish once per Runtime publication, so 1,000 ticks a second publish at most once per publication (SR3).

### 2.7 The machine: outcomes, gaps and recovery

Outcome keys per kind (IP2; mapper context `(value, { input, key })`, K8):

| Kind | `value` | `missed` | `failure` |
| --- | --- | --- | --- |
| `delivers: "facts"` | each fact, once, in order | **required when `value` is mapped**: `Feed.Missed { why: "Unproven" \| "Lost" \| "Reset"; restartAt? }` | **required when anything is mapped**: exhaustive over the adapter's error tags plus Flow's `Closed`, `Defect`, `Interrupted` (rule 37's pattern) |
| `delivers: "state"` | a confirmed value not equal to the last one heard | does not exist (type error) | as above |
| `listen` entry | the domain's | the domain's | **required**: a bare `listen` operation is a type error (SR26) |

A bare stream maps nothing; its data is its row (K3). The requirements are types first and `flow check` rows second
(2.11).

**How a machine handles gaps.** It does not compute them. On a fact feed every connection start whose answer is not
proven arrives as `missed`, admitted **before** any fact that connection delivers (R-Live, SR5). The smallest correct
handling is one line that tells the user, which is the explicit acceptance SR10 allows:

```ts
MayHaveMissed: { target: "self", updateMemory: () => ({ notice: "Some messages may be missing." }) },   // user-defined: MayHaveMissed, notice
```

An app that has a way to repair puts it in the adapter (`catchUp`), where it is ordered with the live values and
survives a reload; then `missed` arrives only for what cannot be repaired. Why not a repair state in the machine with
a "resolve" member: it would need Flow to tie a read to a loss (a loss id in user code, which AGENTS.md's "don't leak internal wiring" rules out),
to persist the debt, and to re-run the read after a reload (one-off reads are not persisted, K18; FC45). In the
adapter all three are structural: the read starts after registration, is scoped to the connection, and the resume
position never passes what was delivered. Section 8 Q4 asks the owner.

**The resume position across sessions** is the machine's memory, written by the fact's own turn:

```ts
Message: { target: "self", updateMemory: ({ memory, event }) => ({ messages: upsert(memory.messages, event.message), cursor: event.message.cursor }) },   // user-defined: upsert, cursor
```

Facts are admitted one per turn and the next is not taken before the turn commits (SR4), and `missed` precedes later
facts, so `memory.cursor` is always a position at or before which the consumer holds every fact it has not accepted
as missed (SR9). A persisted actor's capture holds exactly that, so a reload resumes from the last *handled* fact, and
facts received but not handled are re-requested (FC10). Delivery is **at least once** across sessions: a resume
replays from the position, so a consumer stores facts by the source's identity (`upsert` by id, or an entity domain,
where versions decide, SR12, FC14). That is the standard contract of every replaying source (Ably, Socket.IO,
Electric) and the reason Flow needs no position comparison, which makes sparse positions (timestamps, ULIDs) work
unchanged (FC44). Stated limit: two facts that share an identity are one fact to the consumer.

**Server resets** (rare, SR11). The adapter says `Feed.live({ lost, restartAt })`; `Feed.reconnect` resumes in the new
space at once (a quiet reconnect after a reset asks from `restartAt`, FC46), and the machine's handler stores
`restartAt` for the next session: `cursor: event.restartAt ?? memory.cursor`. Positions in two spaces are kept apart by
their own identity (`{ epoch, seq }`), so old seq 1 and new seq 1 are both kept (FC24).

**Machine-level reconnect** after an ended session is a state and a schedule (rule 25, FC73), with its delay in memory
so a reload keeps the deadline (a Duration keeps its `dueAt` on restore; a multi-step Schedule would restart, MCH O5,
FC77):

```ts
RETRY_WAIT: { schedules: { reopen: { schedule: ({ memory }) => Duration.millis(memory.reopenInMs), send: E.Reopen } }, on: { Reopen: S.LIVE } },   // existing: schedules; user-defined: reopenInMs, Reopen
```

### 2.8 `listen` and entity records

`listen(stream).as([Entities], mapping)` accepts only `delivers: "facts"` (a type error otherwise, SR26). Pushes are
applied in order at arrival, each in a store publication, never through a turn and never in a write's record queue
(rule 29), and they clear no `uncertain` mark (rule 32); versions and contests decide duplicates and reorders (EDP O1,
SR24). The domain consumes `value` and `missed`; the machine maps `failure`. The session's connection drives the
covered answers (every active answer holding a listed entity; stated: conservative):

| Session event | Covered answers |
| --- | --- |
| placement starts, `Feed.down`, `Connecting` | stale, cause `feedDown` |
| `Feed.live({ proof })` | the `feedDown` staleness this session caused is withdrawn |
| `Feed.live()`, `lost`, or a first value (unproven) | every answer whose read started before this moment is lowered: subscribed ones refetch, the rest stay stale (cause `feedGap`); this includes the first connection, so answers read before the channel first became live count (FC13) |
| `Ended`, `Released` | stale, cause `feedEnded`, until a read started after it refreshes them |

This is EDP O1's "Reconnect … refetch covered answers" made a stream event, not the browser's network (IP17, FC5). Two
sessions of one entry on one key in one Runtime follow M6-D6: both apply, either's unproven start lowers, `flow check`
warns `DuplicateListen` (SR27, FC76).

### 2.9 Streaming writes

A streaming write is a transaction (M6-D1). The commit context gains `progress(p)`: a **synchronous** setter, callable
from any callback (`xhr.upload.onprogress`, an SDK's `onToken`), that replaces the Attempt's progress (latest wins;
the author accumulates, e.g. the text so far). It acts only on its own Attempt: after that Attempt is superseded,
released or ended, a call is evidence and changes nothing (SR29, FC30). The row's `progress` is the addressable
Attempt's (M6-D5, rule N2); each ending's mapper reads its own Attempt's last progress (`ctx.progress`, rule 13).
Progress publishes as a Runtime step, coalesced to one publication, and costs no turn (SR29). It is never persisted or
transferred: after a reload it is absent, and the held Attempt arrives as `unknown { Restored }` (OD20; SR30, FC70).

A stall is `Effect.timeoutOrElse(... Outcome.unknown(new Stalled()))` inside the commit (MD 2.7.6); a body that ends
without its terminator returns `Outcome.unknown(new Truncated())` (SR16, FC80); Stop is `O.ask.cancel`, whose
`unknown { Cancelled }` holds the lane under `reject` until its handler releases it, after which a new Ask is
admitted (OD5, OD7; FC39, FC70).

### 2.10 Persistence, reload and SSR

| | Fact feed | State feed |
| --- | --- | --- |
| Saved with a persisted actor | nothing of Flow's: the machine's memory (messages, cursor) is the record | `last` and the baseline "last value heard by the machine"; sensitive or unencodable `output` is omitted (PER O2) |
| Equality baseline after restore | **none** (SR2, FC25) | restored, so an equal confirmed value is not delivered again |
| Row after restore | `Connecting`, `last` absent | `Connecting`, `value: undefined`, `last` restored with its `at` (FC15) |
| Queued deliveries, buffers, the adapter budget | not saved; a reload starts a new session with a fresh budget (SR14, stated) | same |

Second tabs open their own sessions (`SecondTabNoPersistence` unchanged); a leader handover is a restore in the new
leader, so it neither shows a stale value as current nor loses the resume position (FC75, SR31).

**SSR** (SR32). Streams never delay settling (SSR O2). At capture, server sessions are released; a state row transfers
`last` and the heard baseline; a fact row transfers nothing (the memory transfers as memory). On the client the row
starts `Connecting` with the transferred `last`, so a server-rendered price shows as last known, never as current, until
the client's own session confirms it (FC78); the baseline stops a duplicate `value` delivery. Sensitive values are
omitted (SSR O3). "Existing stream lanes win" and "latest stream values and counts" are replaced by this table.

### 2.11 Stories and transport fakes

**Needs** (SR34, SR35; M3's spelling is not accepted, so this states needs and a proposed spelling). A Story replaces
the transport, never the adapter: `Socket.WebSocketConstructor` (EFX `socket/Socket.ts:864-875`), an `EventSource`,
`fetch` or `XMLHttpRequest` service, or an SDK's structural subset as a Layer. All adapter time is Effect's `Clock`, so
the TestClock drives heartbeats, backoff, `resetAfter` and commit deadlines (FC38's wall-clock adapter hangs a Story:
stated, docs).

| Control (proposed spelling on a fake socket server `fake`) | Real sequence |
| --- | --- |
| `fake.accept()`, `fake.refuse(code)` | handshake succeeds; 401/1006 |
| `fake.send(frame)`, `fake.flood(n, frame)` | frames; a burst past `highWaterMark` or `bufferSize` |
| `fake.silence(d)` | quiet or half-open: no frames, no close (FC81) |
| `fake.drop(code)`, `fake.flap(n, { upFor })` | a close with a code; accept-then-drop n times (FC41) |
| `fake.withhold("hello")` | a server that never greets or acks (FC51, FC66) |
| `fake.resetLog(epoch)` | a log restart (FC24, FC46) |
| `fake.reorder(i, j)` | reordered frames (SR12) |
| `fake.hold(read)`, `fake.answer(read, page)`, `fake.fail(read, e)` | a catch-up read held, answered with a partial page, failed (FC42, FC45) |
| `story.suspend(d)` | a backgrounded tab: timers do not run for d, then fire overdue (FC56) |
| `truth.fake.resumedFrom` | the position the server saw (SR35) |
| `checkpoint.evidence("feed")` | per session: answers with `proof` basis, `missed`, drops, `Overflow`, `Discarded` |

`process()` does not wait for an open stream (TST O2); Playback frames carry each row's `connection` and `last.at`
(PB); playback starts no session (IP24). Property tests gain the faults push, drop, reconnect (proven and unproven),
unsubscribe and overflow (EDP O4, IP18).

### 2.12 `flow check`, `flow explain`, Inspection

`flow check` (SR36; read from contract data, outcome tokens and placements, never closures):

| Finding | Level | When |
| --- | --- | --- |
| `FeedUnhandled` (NEW) | error | a fact feed maps `value` without `missed`, or maps anything without `failure`; a `listen` operation without `failure` (types first) |
| `ListenNeedsFacts` (NEW) | error | `listen` over `delivers: "state"` (types first) |
| rule 20 rows | error | `value`, `missed`, `failure` events not handled from every leaf under the placing state; none can be late (R-Owner), so no ancestor handler is required |
| `DuplicateSession` (NEW meaning; MD placeholder) | warning | two operations on one stream contract placed at once in one actor with possibly equal keys |
| `DuplicateListen` (M6-D6) | warning | two `listen` sessions on one entry and key in one Runtime |
| `VerbMismatch`, `DuplicatePlacement`, `KeyRequired` | existing | unchanged; streams stay exempt from `KeyOmitsInput` |

`flow explain` (SR37): `LIVE subscribes messages (Chat.messages, facts, one session per room)`;
`WATCHING subscribes quotes (Market.quote, state, one session per symbol)`.

Inspection (SR37, IP25), per live session: actor, operation, key, `connection`, the last drop's reason, the last
connection start's answer with its `proof` basis and time, `missed` reports (count, last), the bound (`Feed.callback`'s
`bufferSize` and queue depth, `Feed.reconnect`'s schedule step; "unknown" for a plain Stream), release state. Flags:
**`UnprovenValues`** (a session delivered values on a connection that never said `Feed.live`: FC64), **`RegistrationChurn`**
(more `Feed.live` than drops by a factor of 3 over 10 starts: FC62), **`ReleaseOverdue`**. Stream values are redacted
as other values are.

## 3. State machines as tables

Written for an executable model. Notation: `deliver(x)` queues x in the actor's FIFO mailbox outside the 1,024 cap
(SR19); `pull` takes the next element of the adapter Stream; "now" is the Runtime Clock. Every cell is filled; "—"
means the input cannot occur in that state, with the reason in the footnote.

### 3.1 The session (Flow's runtime, one per (actor incarnation, operation, key))

States: `Connecting { drop?, started }` (no live connection; `started` = this connection already counted a start),
`Live`, `Ended { failure }`, `Releasing`, `Released`. Inputs are the elements and exits of the adapter Stream plus
Flow's own release.

| Input ↓ / State → | `Connecting` | `Live` | `Ended` | `Releasing` | `Released` |
| --- | --- | --- | --- | --- | --- |
| **`Feed.live({ proof })`** | → `Live`; record answer proven + basis | stays `Live`; record (a repeated proof is a no-op answer) | —¹ | discard, evidence | —² |
| **`Feed.live()`** | → `Live`; facts: `deliver(missed Unproven)` | an unseen reconnect (FC47): facts: `deliver(missed Unproven)`; state: confirmation reset (`value` undefined) | —¹ | discard, evidence | —² |
| **`Feed.live({ lost })`** | → `Live`; facts: `deliver(missed Lost)` | as left column, stays `Live` | —¹ | discard, evidence | —² |
| **`Feed.live({ lost, restartAt })`** | → `Live`; facts: `deliver(missed Reset { restartAt })` | as left column | —¹ | discard, evidence | —² |
| **value v** | implicit `Feed.live()` first (that row), then as `Live`; evidence `UnprovenValues` if this connection followed a drop | facts: `deliver(value v)`, `last` = v; state: `value` = `last` = v, slot = v if mapped and not equal to heard | —¹ | discard, evidence | —² |
| **`Feed.down(r)`** | stays; `drop` = r (latest wins) | → `Connecting { drop: r }`; state: `value` undefined, `last.at` = now | —¹ | discard, evidence | —² |
| **stream fails e** (incl. exhausted budget) | → `Ended { e }`; `deliver(failure e)` after pending deliveries | same | —¹ | discard, evidence | —² |
| **stream completes** | → `Ended { Closed }`; `deliver(failure Closed)` | same | —¹ | discard, evidence | —² |
| **defect / outside interrupt** | → `Ended { Defect \| Interrupted }`; deliver; defect is also an issue | same | —¹ | discard, evidence | —² |
| **release** (state left, key gone, disposal) | → `Releasing`; interrupt the fiber; undelivered mailbox items discarded at admission (`Discarded { Released }`) | same | → `Releasing` (nothing running; finalizers done) | stays | — ² |
| **scope closed** | —³ | —³ | —³ | → `Released`; a waiting successor may start | — |
| **release bound (5 s) passed** | —³ | —³ | —³ | → `Released`; issue `ReleaseOverdue` | — |

¹ the Stream has exited; Flow pulls nothing after `Ended`. ² a released session has no fiber. ³ only after release.
That is 12 inputs × 5 states = 60 cells; 27 are "cannot occur"; 33 are defined, and none ignores an input without
evidence (SR8).

Conservative meanings, stated once (SR8, FC31, FC55, FC64): a value before any live signal is an unproven start; a
value after a drop with no new live signal is an unproven start; a second unproven live signal while live is an unseen
reconnect; repeated drops keep the latest reason; a drop without values is only a status. A misbehaving adapter
therefore costs extra `missed` (and extra `listen` refetches), never a silent loss, never a stale value as current.

### 3.2 Delivery (the pump)

**Facts.** `inFlight ∈ { none, missed, value, failure }`. Flow pulls only when `inFlight = none` and the session is
not releasing. A pulled signal is applied to 3.1 at once and pulls again; a pulled value whose start is unproven
queues `missed` first and holds the value as `next`. When the delivered item's turn commits (or is `Denied` or
`Unhandled`: counted as delivered, as an ending is, OD20 F8), `inFlight` = `next` or none. At most one stream item per
session is in the mailbox (SR19).

**State.** Flow pulls eagerly. `slot` holds the newest unheard value; `queued ∈ { no, yes }`. A value sets `slot` and,
if `queued = no`, `deliver(value)` and `queued = yes`. At admission: if the session is not `Live`, or the connection
that set `slot` is not the current one, the delivery is discarded (`Discarded { NotLive }`, SR21, FC54); otherwise the
event carries `slot`'s value, `heard` = it, `slot` cleared, `queued = no`. A `failure` delivery follows any queued value.

| Pump input | Facts: `inFlight = none` | Facts: `inFlight ≠ none` | State: `queued = no` | State: `queued = yes` |
| --- | --- | --- | --- | --- |
| element available | pull it | do not pull | pull | pull (slot replaced) |
| delivered turn committed | —⁴ | `inFlight` = `next` or none | —⁴ | —⁵ |
| admission | —⁴ | the event's turn runs | —⁴ | the rule above |
| release | nothing in flight | the queued item is discarded at admission | nothing | discarded at admission |

⁴ nothing is queued. ⁵ state admission clears `queued` itself.

### 3.3 `Feed.callback`'s queue

Contents: a sequence of values and **signal groups** (consecutive signals with no value between). Bound: `bufferSize`
values; at most one signal group between two values, so memory is O(`bufferSize`) for any sequence (SR18, FC49).

| Input | Queue has room | Queue full (values = `bufferSize`) | After `fail`/`end` or release |
| --- | --- | --- | --- |
| `emit(value)` | append | fail the stream with `Feed.Overflow` after the queued items; drop further emits (evidence) | no-op, evidence |
| `emit(signal)` | merge into the tail group: `down` keeps the latest reason; the group's live answer is the weakest of its members (`lost`/reset > unproven > proof; the latest `restartAt`) | same merge (signals never count against the bound) | no-op, evidence |
| `emit.fail(e)` / `emit.end()` | finish after the queue drains | same | no-op |
| pull | take the head | take the head | drain, then exit |
| release | run finalizers, awaited | same | — |

A merged group emits at most `Feed.down(latest)` then one `Feed.live(weakest)`, preserving "a drop happened" and never
upgrading an answer (FC26: a status is never evicted by values).

### 3.4 `Feed.reconnect` (adapter side, Flow-shipped)

State: `Connecting { n, from }`, `Live { since }`, `CatchingUp { pageSet, buffer }`, `Waiting { n }`, `Done`.
`last` = position of the last value passed (initially `options.from`).

| Input ↓ / State → | `Connecting` | `Live` | `CatchingUp` | `Waiting` | `Done` |
| --- | --- | --- | --- | --- | --- |
| inner `Feed.live({ proof })` | pass; → `Live { now }` | pass (Flow: repeat) | buffer it as a value-free mark | —⁶ | —⁷ |
| inner `Feed.live()` or `lost` (no `restartAt`), `catchUp` set, `last` defined | emit `live({ proof: "catch-up from last" })`; start `catchUp(last)`; → `CatchingUp` | same | buffer | —⁶ | —⁷ |
| inner `Feed.live()` / `lost`, no `catchUp` or `last` undefined | pass; → `Live { now }` | pass | buffer | —⁶ | —⁷ |
| inner `Feed.live({ lost, restartAt })` | `last` = restartAt; pass; → `Live { now }` | same | abandon catch-up; pass; → `Live` | —⁶ | —⁷ |
| inner value v | pass; `last` = position(v) ?? last; (Flow: implicit live) → `Live { now }` | pass; update `last` | buffer (past 1,024: fail `Overflow`) | —⁶ | —⁷ |
| catch-up value v | —⁸ | —⁸ | emit; `last` = position(v) ?? last; add position to `pageSet` | —⁸ | —⁷ |
| catch-up ends | —⁸ | —⁸ | emit buffered values, dropping those with a position in `pageSet` until the first that is not; → `Live { now }` | —⁸ | —⁷ |
| inner or catch-up fails e, `while(e)` or `Overflow`; inner completes (`Closed`) | emit `down(e)`; step schedule: delay → `Waiting { n+1 }`; exhausted → fail e, `Done` | same; if live ≥ `resetAfter` the schedule was reset first | same | —⁶ | —⁷ |
| inner fails e, not `while(e)` | fail e; `Done` | same | same | —⁶ | —⁷ |
| live for `resetAfter` | — | reset the schedule to step one | — | — | — |
| delay elapsed | — | — | — | `connect(last)`; → `Connecting { n, last }` | — |
| release | interrupt, finalizers | same | same, the read interrupted | cancel the sleep | — |

⁶ nothing is connected while waiting. ⁷ the stream has ended. ⁸ no catch-up is running.

### 3.5 Invariants for the executable model

| # | Invariant | Requirement |
| --- | --- | --- |
| I1 | On a fact feed, for every connection start not proven, its `missed` is admitted before any value that connection delivers | SR5 |
| I2 | Every (state, input) cell of 3.1–3.4 is defined; no input is dropped without evidence | SR8 |
| I3 | Facts delivered = facts pulled while not releasing; no equality or coalescing on facts, before or after a restore | SR2 |
| I4 | `connect(from)`'s `from` is the position of the last value passed downstream, a `restartAt`, or `options.from`; a catch-up never advances `last` past a value it did not emit | SR9 |
| I5 | The machine's resume field, if written only in fact turns, never names a position after a fact not yet admitted or a `missed` not yet admitted | SR9 |
| I6 | Every `missed` and `failure` queued for a non-released session is admitted exactly once | SR10 (liveness), K17 |
| I7 | Per session: ≤ 1 stream item in the mailbox (facts) or ≤ 1 value delivery + 1 ending (state); `Feed.callback` ≤ `bufferSize` values + one signal group per gap | SR18, SR19 |
| I8 | `row.value` defined ⇒ `connection = Live` and the value came from the current connection | SR20 |
| I9 | A state `value` event is admitted only when `Live` on the connection that produced it | SR21 |
| I10 | At most one non-`Released` session per (actor, operation, key) has a running scope | SR17 |
| I11 | No item from a `Releasing` or `Released` session is admitted | SR33 |
| I12 | Connections opened without an intervening `resetAfter`-long live period ≤ schedule length + 1 | SR14 |
| I13 | A catch-up emits every catch-up value, then every buffered value not in `pageSet`, in order, each once | SR12 |
| I14 | `row.progress` changes only through the addressable Attempt's setter | SR29 |
| I15 | A covered answer reads fresh only if every session covering it is `Live`, and no unproven start happened after its read started | SR25 |

Mutants (each must be killed): fact before `missed` (FC4, FC55); schedule reset on first value (FC41); value-before-live
read as proven (FC64); a status evicted on overflow (FC26); state delivery admitted after a drop (FC20, FC54); equality
on facts (FC1, FC25); catch-up started before live (FC51); restart before scope closed (FC33); `last` = the highest
position seen across catch-up and buffer (FC22); `row.value` kept across a drop (FC20); `listen` staleness withdrawn on
an unproven start (FC19, FC47); progress written by a superseded Attempt (FC30).

## 4. Product cases, end to end

Each case starts at the browser API or SDK. Marks as in the header; a word marked once per case is not marked again.
Service bodies that are pure decoding (`decodeFrame`) are named, not shown.

### 4.1 Chat with catch-up (common live path; uncommon repair)

**Source.** A WebSocket through `effect/socket`. The server greets `{ t: "hello", replayedFrom }` after it registered
the room and replayed from `after`, or `{ t: "reset", epoch }` when it cannot; it pings every 20 s; close 4401 means
the token expired. A paged HTTP history read; a post transaction.

```ts
// chat.contracts.ts
export const Cursor = Schema.Struct({ epoch: Schema.Int, seq: Schema.Int })                  // user-defined
export class ChatDropped extends Schema.TaggedError<ChatDropped>()("ChatDropped", { why: Schema.String }) {}   // user-defined: transient
export class SignedOut extends Schema.TaggedError<SignedOut>()("SignedOut", {}) {}            // user-defined: terminal

export class ChatSocket extends Context.Service<ChatSocket, {                                  // Effect: Context.Service; user-defined: ChatSocket
  readonly room: (roomId: string, from: Cursor | undefined) => Stream.Stream<Message | Feed.Signal<never, Cursor>, ChatDropped | SignedOut>
}>()("app/ChatSocket") {}

export const ChatSocketLive = Layer.succeed(ChatSocket)({                                      // the Layer is the swap point (OD11)
  room: (roomId, from) => Stream.unwrap(Effect.gen(function* () {
    const socket = yield* Socket.makeWebSocket(roomUrl(roomId, from), { highWaterMark: 1_048_576 })   // Effect: bounded browser buffer (SR18, FC49); user-defined: roomUrl puts after=epoch:seq in the query
    return Stream.fromChannel(Socket.toChannelString(socket)).pipe(
      Stream.timeoutOrElse({ duration: "45 seconds", orElse: () => Stream.fail(new ChatDropped({ why: "Silent" })) }),   // Effect: idle deadline on every frame, pings included (FC81, FC37)
      Stream.mapEffect(decodeFrame),                                                           // user-defined: text → ServerFrame
      Stream.flatMap((f) => Stream.fromIterable(
        f.t === "hello" ? [Feed.live({ proof: `server replayed from ${f.replayedFrom ?? "now"}` })]   // NEW: Feed.live, proof (SR6)
        : f.t === "reset" ? [Feed.live({ lost: "server log reset", restartAt: { epoch: f.epoch, seq: 0 } })]   // NEW: lost, restartAt (rare)
        : f.t === "msg" ? [f.message] : [])),                                                  // pings decode to nothing
      Stream.mapError((e) => e._tag === "SocketError" && e.reason._tag === "SocketCloseError" && e.reason.code === 4401
        ? new SignedOut() : new ChatDropped({ why: e._tag })))                                 // classification is the adapter's (SR15, FC9)
  })).pipe(Stream.provide(Socket.layerWebSocketConstructorGlobal)),
})

export const Chat = {
  messages: stream({                                                                          // existing: stream
    id: "Chat.messages",
    input: { roomId: Schema.String, after: Schema.optional(Cursor) },                         // existing: input; after outside key (K2)
    output: Message,
    key: ["roomId"],
    delivers: "facts",                                                                        // accepted: delivers
    subscribe: ({ roomId, after }) => Stream.unwrap(Effect.map(ChatSocket.asEffect(), (chat) =>
      Feed.reconnect((from) => chat.room(roomId, from), {                                     // NEW: Feed.reconnect
        from: after,                                                                          // NEW: from
        position: (m) => m.cursor,                                                            // NEW: position
        while: (e) => e._tag === "ChatDropped",                                               // Effect.retry's while
        schedule: Schedule.exponential("500 millis").pipe(Schedule.jittered, Schedule.upTo({ times: 8 })),   // Effect: budget, restored after resetAfter (default 1 minute)
        catchUp: (from) => Chat.historyPages(roomId, from),                                   // NEW (uncommon): catchUp; user-defined: historyPages ends only at the head
      }))),
  }),
  history: resource({ id: "Chat.history", input: { roomId: Schema.String }, output: HistoryPage, key: ["roomId"], staleTime: "0 millis", gcTime: "1 minute", lookup: lastPage }),   // existing: resource
  post: transaction({ id: "Chat.post", input: { roomId: Schema.String, clientId: Schema.String, text: Schema.String }, output: Message, key: ["clientId"], concurrency: "reject", commit: postMessage }),   // existing: transaction
}
```

```ts
// chat.definition.ts
memory: { roomId: Schema.String, messages: Schema.Array(Message), cursor: Schema.optional(Cursor), notice: Schema.optional(Schema.String), reopenInMs: Schema.Int },
events: { Send: { text: Schema.String } },
internalEvents: {
  Loaded: { messages: Schema.Array(Message) }, LoadFailed: {},
  Message: { message: Message },
  MayHaveMissed: { why: Schema.Literals(["Unproven", "Lost", "Reset"]), restartAt: Schema.optional(Cursor) },
  FeedEnded: {}, SignedOut: {}, Reopen: {},
  Posted: { clientId: Schema.String }, PostFailed: { clientId: Schema.String }, PostUnsure: Flow.uncertain({ clientId: Schema.String }),
},
operations: ({ E }) => ({
  history: Chat.history.outcomes({ success: E.Loaded.from((p) => ({ messages: p.messages })), failure: { HistoryFailed: E.LoadFailed, Defect: E.LoadFailed, Interrupted: E.LoadFailed } }),
  messages: Chat.messages.outcomes({
    value: E.Message.from((message) => ({ message })),                                        // existing: value
    missed: E.MayHaveMissed.from((m) => ({ why: m.why, restartAt: m.restartAt })),           // NEW: missed (type-required here)
    failure: { SignedOut: E.SignedOut, ChatDropped: E.FeedEnded, Closed: E.FeedEnded, Defect: E.FeedEnded, Interrupted: E.FeedEnded },   // NEW: Closed
  }),
  post: Chat.post.outcomes({
    success: E.Posted.from((_m, { key }) => key), failure: { NotSent: E.PostFailed.from((_r, { key }) => key) },
    unknown: E.PostUnsure.from((_r, { key }) => key),
  }),
}),
```

```ts
// chat.machine.ts
const upsert = (list: ReadonlyArray<Message>, m: Message) =>                                  // user-defined: at-least-once, stored by the source's id (SR12)
  list.some((x) => x.id === m.id) ? list.map((x) => (x.id === m.id ? m : x)) : [...list, m]
const live = ({ operations }) => operations.messages?.connection === "Live" || deny("Offline")   // accepted: connection; one test for every phase (SR22)
on: {
  SignedOut: S.SIGNED_OUT,
  Posted: { target: "self" }, PostFailed: { target: "self" },
  PostUnsure: [{ target: "self", guard: [O.post.retryable({ times: 3 })], actions: [O.post.retry] }, { target: "self", actions: [O.post.cancel] }],   // existing: retry the same id
},
states: {
  LOADING: {
    entry: [O.history.lookup(({ memory }) => ({ roomId: memory.roomId }))],
    on: {
      Loaded: { target: S.LIVE, updateMemory: ({ event }) => ({ messages: event.messages, cursor: event.messages.at(-1)?.cursor }) },   // the socket resumes after the page: no first-live race (FC13)
      LoadFailed: { target: S.RETRY_WAIT, updateMemory: ({ memory }) => ({ reopenInMs: Math.min(30_000, memory.reopenInMs * 2) }) },
    },
  },
  LIVE: {
    activities: [O.messages.subscribe(({ memory }) => ({ roomId: memory.roomId, after: memory.cursor }))],   // existing: subscribe; after read at session start
    on: {
      Message: { target: "self", updateMemory: ({ memory, event }) => ({ messages: upsert(memory.messages, event.message), cursor: event.message.cursor, reopenInMs: 1000 }) },
      MayHaveMissed: { target: "self", updateMemory: ({ memory, event }) => ({ notice: "Some messages could not be recovered.", cursor: event.restartAt ?? memory.cursor }) },   // explicit acceptance (SR10)
      FeedEnded: { target: S.RETRY_WAIT, updateMemory: ({ memory }) => ({ reopenInMs: Math.min(30_000, memory.reopenInMs * 2) }) },
      Send: { target: "self", guard: [live], actions: [O.post.commit(({ memory, event }) => ({ roomId: memory.roomId, clientId: crypto.randomUUID(), text: event.text }))] },
    },
  },
  RETRY_WAIT: { schedules: { reopen: { schedule: ({ memory }) => Duration.millis(memory.reopenInMs), send: E.Reopen } }, on: { Reopen: S.LIVE } },   // machine-level re-open (FC73, FC77)
  SIGNED_OUT: {},
},
```

```tsx
// ChatBanner.tsx
const row = useView(chat, (s) => s.operations.messages)
const banner =
  row === undefined ? null
  : row.connection === "Ended" ? "Disconnected. Retrying soon."
  : row.connection === "Connecting" ? (row.drop ? "Reconnecting…" : "Connecting…")       // NEW: drop
  : null
```

**Walk.**

1. *First load.* LOADING reads the last page; `Loaded` writes `cursor`; LIVE places the session with `after`. The server
   greets `hello` → `Feed.live({ proof })` → `Live`, no `missed`; replayed messages follow, one turn each (SR4).
2. *Drop and replay.* `fake.drop(1006)` → `SocketCloseError 1006` → `ChatDropped` → `Feed.down` → row `Connecting`,
   `drop` set, banner "Reconnecting…", composer denied `Offline`. 500 ms later `connect(last)`; `hello` proves; the two
   messages sent meanwhile arrive in order (FC4). No machine transition (SR13).
3. *Quiet reconnect.* Same, no new messages: `hello` alone makes it `Live` (SR7, FC19).
4. *Flapping.* `fake.flap(20, { upFor: "1 second" })`: no connection is live for `resetAfter`, so the schedule is not
   restored; after 8 drops the session fails `ChatDropped` → `FeedEnded` → RETRY_WAIT (FC41, FC73); a reload meanwhile
   keeps `reopenInMs` and its deadline (FC77).
5. *Loss with a failed repair.* The server cannot replay (`reset` is not this; it answers `hello` without
   `replayedFrom`, so the adapter sends `Feed.live()`): `Feed.reconnect` starts `catchUp(last)` after the live signal
   (FC51) and buffers live messages; `fake.fail(read, 503)` fails the connection, which is retried; no buffered message
   was emitted, so `last` stays before the hole (FC22, FC23). `fake.answer(read, page1)`, then `page2` with no next:
   the catch-up ends only at the head (FC42); buffered messages already in the pages are dropped by position equality.
6. *Reload mid-repair.* The tab reloads during step 5's read. Restored memory has `cursor` = the last message handled;
   LIVE opens a new session from it; the same catch-up runs again (FC45, SR31). Nothing waits in a "catching up" state.
7. *Server reset.* `fake.resetLog(9)` → `reset` → `Feed.live({ lost, restartAt })` → `missed Reset`; the handler shows
   the notice and stores `restartAt`; `Feed.reconnect` already resumes from `{ 9, 0 }`, so a quiet reconnect asks from
   the new space (FC46, SR11). Old `{8, 1}` and new `{9, 1}` have different ids and are both kept (FC24).
8. *Token expiry.* `fake.drop(4401)` → `SignedOut`, not in `while` → session `Ended` → `SIGNED_OUT` (FC9, SR15).

**Story** (proposed spelling):

```ts
const chatStory = story.machine(ChatRoom, { id: "Chat/replay-then-reset", input: { roomId: "r1" }, fixtures: [FakeChatServer({ history: seed })] })   // user-defined: FakeChatServer replaces WebSocketConstructor and the history service
  .process()
  .checkpoint("live", ({ snapshot, evidence }) => snapshot.operations.messages?.connection === "Live" && evidence.feed.at(-1)?.proof === "server replayed from 8:41")
  .do(({ fake }) => fake.drop(1006)).advance("500 millis").process()
  .checkpoint("resumed", ({ truth }) => truth.FakeChatServer.resumedFrom === "8:41")
  .do(({ fake }) => fake.resetLog(9)).do(({ fake }) => fake.drop(1006)).advance("1 second").process()
  .checkpoint("reset", ({ snapshot, evidence }) => snapshot.memory.cursor?.epoch === 9 && evidence.feed.some((e) => e.missed === "Reset"))
```

### 4.2 Presence (common)

**Source.** A WebSocket; on join the server sends `presence_state` (everyone), then `presence_diff` with `joins` and
`leaves` (Phoenix Presence's shape, PA1 section 4). Each connection's state is folded from its own `presence_state`,
so a reconnect is correct again even if nobody joined or left.

```ts
// presence.contracts.ts
export const Members = Schema.Record(Schema.String, Member)                                    // user-defined
export const Presence = {
  room: stream({
    id: "Presence.room", input: { roomId: Schema.String }, output: Members, key: ["roomId"],
    delivers: "state",                                                                        // accepted: delivers
    subscribe: ({ roomId }) => Stream.unwrap(Effect.map(PresenceSocket.asEffect(), (ps) =>
      Feed.reconnect(() => ps.frames(roomId).pipe(                                            // user-defined: PresenceSocket.frames (decoded frames, ChatDropped on close)
        Stream.scan(undefined as Members | undefined, (acc, f) => f.t === "presence_state" ? f.members : applyDiff(acc ?? {}, f)),   // Effect: Stream.scan; user-defined: applyDiff
        Stream.filter((m): m is Members => m !== undefined)), {                               // the first full state is the first value: implicit live
        while: (e) => e._tag === "ChatDropped",
        schedule: Schedule.exponential("1 second").pipe(Schedule.upTo({ times: 10 })),
      }))),
  }),
}
// presence.definition.ts
operations: ({ E }) => ({ presence: Presence.room }),                                         // bare: data is in the row (K3)
// room.machine.ts
ROOM: { activities: [O.presence.subscribe(({ memory }) => ({ roomId: memory.roomId }))] },
```

```tsx
// Members.tsx
const row = useView(room, (s) => s.operations.presence)
const members = row?.value ?? row?.last?.value ?? {}                                           // NEW: value (current), last (dimmed)
return <ul style={{ opacity: row?.value ? 1 : 0.5 }}>{Object.values(members).map((m) => <li key={m.id}>{m.name}</li>)}</ul>
```

Walk: join → `presence_state` → `value` set; drop → `value` undefined, `last` dimmed; rejoin with nobody changed →
`presence_state` → confirmed, undimmed (SR20, FC53 does not occur because the server re-sends state on join). The bare
operation needs no handlers; an ended session shows `Ended` and the room's machine may re-enter ROOM.

### 4.3 Stock ticker and a quiet feed (common; quiet staleness uncommon)

**Source.** One WebSocket per app (the service multiplexes symbols, so 50 sessions are not 50 sockets; service code,
not Flow's), up to 1,000 ticks a second, each `{ symbol, price, asOf }` with the server's time; the server pings every
10 s.

```ts
// market.contracts.ts
export const Market = {
  quote: stream({
    id: "Market.quote", input: { symbol: Schema.String }, output: Quote, key: ["symbol"],
    delivers: "state",
    subscribe: ({ symbol }) => Stream.unwrap(Effect.map(MarketFeed.asEffect(), (mf) =>
      Feed.reconnect(() => mf.quotes(symbol), {                                               // user-defined: MarketFeed.quotes (shared socket, per-symbol subscribe, 25 s idle deadline)
        while: (e) => e._tag === "MarketDropped",
        schedule: Schedule.exponential("500 millis").pipe(Schedule.jittered, Schedule.upTo({ times: 12 })),
      }))),
  }),
}
// watch.definition.ts
events: { SetAlert: { symbol: Schema.String, above: Schema.Number } },
internalEvents: { Quoted: { symbol: Schema.String, price: Schema.Number }, QuoteEnded: { symbol: Schema.String } },
operations: ({ E }) => ({
  quotes: Market.quote.outcomes({
    value: E.Quoted.from((q, { key }) => ({ symbol: key.symbol, price: q.price })),           // only confirmed, current values (SR21)
    failure: { MarketDropped: E.QuoteEnded.from((_e, { key }) => key), Closed: E.QuoteEnded.from((_e, { key }) => key), Defect: E.QuoteEnded.from((_e, { key }) => key), Interrupted: E.QuoteEnded.from((_e, { key }) => key) },
  }),
}),
// watch.machine.ts
WATCHING: {
  activities: [O.quotes.subscribe.each(({ memory }) => memory.watchlist.map((symbol) => ({ symbol })))],   // existing: subscribe.each
  on: {
    SetAlert: { target: "self", updateMemory: ({ memory, event }) => ({ alerts: { ...memory.alerts, [event.symbol]: event.above } }) },
    Quoted: [
      { target: "self", guard: ({ memory, event }) => event.price > (memory.alerts[event.symbol] ?? Infinity) || deny("BelowAlert"),
        updateMemory: ({ memory, event }) => ({ fired: [...memory.fired, event.symbol], alerts: omit(memory.alerts, event.symbol) }) },
      { target: "self" },
    ],
    QuoteEnded: { target: "self", updateMemory: ({ memory, event }) => ({ watchlist: memory.watchlist.filter((s) => s !== event.symbol), ended: [...memory.ended, event.symbol] }) },   // the key leaves; re-adding it re-opens
  },
},
```

```tsx
// Quote.tsx
const row = useView(watch, (s) => Watch.O.quotes.get(s, { symbol }))                          // existing: get; undefined if not placed
const now = useNow("1 second")                                                               // existing (PB)
const live = row?.value                                                                      // current only
const quiet = live && now - live.asOf > 60_000                                               // quiet-feed recipe: the source's own timestamp (SR23)
return live ? <Price value={live.price} note={quiet ? "no trades for a minute" : undefined} />
  : row?.last ? <Price value={row.last.value.price} dim note={`as of ${ago(now - row.last.at)}`} />
  : <Price pending />
```

Walk: 1,000 ticks/s → Flow pulls eagerly, one waiting `Quoted` per symbol, one row publication per publication
(SR3, SR19); a full mailbox of user sends coexists (outside the cap). A flat market sends no new price but the
connection stays `Live` and pings keep the deadline open: the price shows current (FC40); a dead connection misses the
25 s deadline → drop → dimmed with its age (FC81). Reconnect on a quiet symbol: `value` undefined until the server's
first quote on the new connection; an equal price confirms it and is not delivered to the machine again (SR20, FC20).
The alert never fires on a dimmed or cached price, since only confirmed values become `Quoted` and a queued `Quoted`
from before a drop is discarded at admission (SR21). Page wake after 10 minutes: the overdue deadline fires at once,
so the price dims within one tick (FC56).

### 4.4 LLM tokens with Stop (uncommon)

**Source.** `fetch` with a streamed NDJSON body: `{ t: "token", text }` lines, then `{ t: "done", usage }`. (An SDK's
async iterator enters the same way through `Stream.fromAsyncIterable`.)

```ts
// assistant.contracts.ts
export const Assistant = {
  ask: transaction({
    id: "Assistant.ask", input: { threadId: Schema.String, prompt: Schema.String }, output: Answer, key: ["threadId"],
    progress: { text: Schema.String },                                                       // existing (OD18)
    concurrency: "reject",                                                                   // one addressable Attempt (M6-D5)
    commit: (input, { attempt, signal, progress }) => Effect.gen(function* () {              // NEW: progress(p), the commit context's setter
      const res = yield* Effect.tryPromise({
        try: () => fetch("/api/ask", { method: "POST", body: JSON.stringify(input), headers: { "Idempotency-Key": attempt.id }, signal }),
        catch: () => Outcome.unknown(new NoResponse()) })
      if (!res.ok) return yield* (res.status >= 500 ? Outcome.unknown(new ServerError({ status: res.status })) : Outcome.failure(new Refused({ status: res.status })))
      let text = ""
      let done: Usage | undefined
      yield* Stream.fromReadableStream({ evaluate: () => res.body!, onError: () => new NoResponse() }).pipe(   // Effect: fromReadableStream (pulled: back-pressure)
        Stream.decodeText(), Stream.splitLines,
        Stream.timeoutOrElse({ duration: "20 seconds", orElse: () => Stream.fail(new Stalled()) }),   // a stall fails, never completes (FC37)
        Stream.runForEach((line) => Effect.sync(() => {
          const f = JSON.parse(line)
          if (f.t === "token") { text += f.text; progress({ text }) }                        // latest wins; no turn per token (SR29)
          if (f.t === "done") done = f.usage
        })),
        Effect.catch((e) => Outcome.unknown(e)))                                              // a cut-off answer may have been generated
      if (done === undefined) return yield* Outcome.unknown(new Truncated())                 // no terminator: not complete (FC80)
      return { text, usage: done }
    }),
  }),
}
// assistant.definition.ts
operations: ({ E }) => ({
  ask: Assistant.ask.outcomes({
    success: E.Answered.from((a) => ({ text: a.text })),
    failure: { Refused: E.AskFailed, NotSent: E.AskFailed },
    unknown: { Cancelled: E.Stopped.from((_r, { progress }) => ({ partial: progress?.text ?? "" })),   // existing: ctx.progress, this Attempt's
      NoResponse: E.Cut.from((_r, { progress }) => ({ partial: progress?.text ?? "" })), Stalled: E.Cut.from((_r, { progress }) => ({ partial: progress?.text ?? "" })),
      Truncated: E.Cut.from((_r, { progress }) => ({ partial: progress?.text ?? "" })), ServerError: E.Cut.from(() => ({ partial: "" })),
      Restored: E.Cut.from(() => ({ partial: "" })), Interrupted: E.Cut.from(() => ({ partial: "" })), Defect: E.Cut.from(() => ({ partial: "" })), StillUnknown: E.Cut.from(() => ({ partial: "" })) },
  }),
}),
// assistant.machine.ts
IDLE:    { on: { Ask: { target: S.ASKING, guard: [O.ask.idle], actions: [O.ask.commit(({ memory, event }) => ({ threadId: memory.threadId, prompt: event.prompt }))] } } },
ASKING:  { on: { Stop: { target: "self", actions: [O.ask.cancel] }, Answered: { target: S.IDLE, updateMemory: ({ event }) => ({ last: event.text, incomplete: false }) } } },
on: {
  Stopped: { target: S.IDLE, updateMemory: ({ event }) => ({ last: event.partial, incomplete: true }), actions: [O.ask.cancel] },   // release the hold: the next Ask is admitted (FC39, FC70)
  Cut:     { target: S.IDLE, updateMemory: ({ event }) => ({ last: event.partial, incomplete: true }), actions: [O.ask.cancel] },     // shown as incomplete, never a success (SR30)
  AskFailed: { target: S.IDLE },
},
// view
const text = useView(chat, (s) => s.operations.ask.progress?.text ?? s.memory.last)          // existing: the row's progress
```

Walk: tokens at 100/s update `progress` without turns; Stop interrupts the fetch (the signal aborts it), the ending is
`unknown { Cancelled }` with that Attempt's last text, held under `reject` until `Stopped` releases it; Ask again
starts a new Attempt with empty progress (FC30). A cut or a stalled body ends `Cut` with the partial text. A reload
while asking: progress is gone, `unknown { Restored }` arrives, and the answer shows as incomplete with no partial
text; Stop then a retry may be charged twice by a server that kept generating (FC70, stated: no browser API reports it).

### 4.5 Upload progress (uncommon)

```ts
// uploads.contracts.ts
export const Uploads = {
  put: transaction({
    id: "Uploads.put", input: { ref: Schema.String, file: Schema.instanceOf(File) }, output: Stored, key: ["ref"],   // one lane per upload (FC71)
    progress: { sent: Schema.Number, total: Schema.Number },
    concurrency: "reject",
    commit: ({ ref, file }, { attempt, signal, progress }) => Effect.callback<Stored, Outcome.Unknown<UploadLost> | Outcome.Failure<TooLarge>>((resume) => {   // Effect: Effect.callback
      const xhr = new XMLHttpRequest()
      xhr.upload.onprogress = (e) => progress({ sent: e.loaded, total: e.total })            // plain callback, no runtime wiring (FC58)
      xhr.onload = () => resume(xhr.status === 201 ? Effect.succeed(JSON.parse(xhr.responseText)) : xhr.status === 413 ? Outcome.failure(new TooLarge()) : Outcome.unknown(new UploadLost({ status: xhr.status })))
      xhr.onerror = () => resume(Outcome.unknown(new UploadLost({ status: 0 })))
      signal.addEventListener("abort", () => xhr.abort())
      xhr.open("PUT", `/uploads/${ref}`); xhr.setRequestHeader("Idempotency-Key", attempt.id); xhr.send(file)
    }),
  }),
}
// view: "sent" is an upper bound on what the server has (FC79)
const row = useView(up, (s) => Up.O.put.get(s, { ref }))
const label = !row.pending ? undefined : row.progress && row.progress.sent < row.progress.total ? `Sending ${pct(row.progress)}` : "Waiting for the server…"
```

The machine is MD 2.7.7's uploads machine unchanged (`Cancel` → `O.put.cancel`; `UploadUnsure` → clean-up by
`attempt.id`). Concurrent uploads are concurrent keys, each `reject`, each with its own `progress` (M6-D5).

### 4.6 `listen` feeding entities (common)

**Source.** Supabase Realtime `postgres_changes` on `tickets`. The SDK reports channel statuses `SUBSCRIBED`,
`CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED`; `removeChannel` is async; there is no replay. The adapter lets
`Feed.reconnect` own rejoining (so the budget and release-before-restart apply) instead of the SDK's silent rejoin
(FC47).

```ts
// tickets.contracts.ts
export const Tickets = {
  changes: stream({
    id: "Tickets.changes", input: { queueId: Schema.String }, output: TicketChange, key: ["queueId"],
    delivers: "facts",
    subscribe: ({ queueId }) => Stream.unwrap(Effect.map(Supabase.asEffect(), (sb) =>
      Feed.reconnect(() => Feed.callback((emit) => Effect.gen(function* () {                 // NEW: Feed.callback (uncommon)
        const ch = sb.channel(`queue:${queueId}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "tickets", filter: `queue_id=eq.${queueId}` }, (p) => emit(toChange(p)))   // user-defined: toChange
          .subscribe((status) => {
            if (status === "SUBSCRIBED") emit(Feed.live())                                    // registered; no replay, so unproven
            else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") emit.fail(new ChannelDown({ status }))
            else if (status === "CLOSED") emit.fail(new ChannelDown({ status }))
          })
        const off = sb.auth.onAuthStateChange((e) => { if (e === "SIGNED_OUT") emit.fail(new SignedOut()) })
        yield* Effect.addFinalizer(() => Effect.promise(async () => { off.data.subscription.unsubscribe(); await sb.removeChannel(ch) }))   // awaited before a new session (SR17, FC33)
      }), { bufferSize: 2_048 }), {                                                            // NEW: bufferSize
        while: (e) => e._tag === "ChannelDown",
        schedule: Schedule.exponential("1 second").pipe(Schedule.jittered, Schedule.upTo({ times: 8 })),
      }))),
  }),
}
// tickets.domain.ts (EDP O1)
changes: listen(Tickets.changes).as([Ticket], (c) => c.kind === "delete" ? Ticket.delete({ id: c.id }, { version: c.version }) : Ticket.patch({ id: c.id }, c.fields)),
// queue.definition.ts
operations: ({ E }) => ({
  changes: TicketsDomain.changes.outcomes({ failure: { ChannelDown: E.PushEnded, SignedOut: E.SignedOut, Closed: E.PushEnded, Defect: E.PushEnded, Interrupted: E.PushEnded } }),   // required (SR26)
}),
// queue.machine.ts
QUEUE: {
  activities: [O.changes.subscribe(({ memory }) => ({ queueId: memory.queueId }))],
  on: { PushEnded: S.QUEUE_RETRY },                                                            // pushes cannot stop silently
},
QUEUE_RETRY: { schedules: { again: { schedule: "5 seconds", send: E.Reopen } }, on: { Reopen: S.QUEUE } },
```

Walk: a change before `SUBSCRIBED` is an unproven start (implicit live), then `SUBSCRIBED` is a second unproven start:
covered answers are lowered twice, and the domain's "one repair in flight and one trailing" makes that at most two
reads (FC55, FC68 cost). A drop: answers stale; the rejoin's `SUBSCRIBED` is unproven, so subscribed lists refetch and a
ticket deleted meanwhile leaves the list, quiet or not (SR25, FC5, FC19). Opening settings releases the session: the
list is stale (`feedEnded`) and refetches on return, once (FC48, FC69 cost). Leaving and re-entering fast waits for
`removeChannel` (FC33). Sign-out is a terminal failure, not a reconnect.

### 4.7 Three SDKs, and two more sources (uncommon)

**Supabase**: 4.6.

**Firestore `onSnapshot`** (a state feed: one document). With `includeMetadataChanges: true`, a snapshot served from
the local cache is reported as "not connected", and the server's confirmation of equal data is still a value (from
memory: `snapshot.metadata.fromCache`; PA2 section 1 could not confirm the field on the page it read, and confirms
that a first snapshot may come from the cache).

```ts
export const Docs = {
  doc: stream({
    id: "Docs.doc", input: { docId: Schema.String }, output: Doc, key: ["docId"], delivers: "state",
    subscribe: ({ docId }) => Stream.unwrap(Effect.map(Firestore.asEffect(), (fs) =>
      Feed.reconnect(() => Feed.callback((emit) => Effect.gen(function* () {
        const off = onSnapshot(doc(fs, "docs", docId), { includeMetadataChanges: true },
          (snap) => snap.metadata.fromCache ? emit(Feed.down(new ServedFromCache())) : emit(toDoc(snap)),   // NEW: Feed.down; a cache is not current (FC54, FC67)
          (err) => emit.fail(err.code === "permission-denied" ? new NoAccess() : new ListenError({ code: err.code })))   // a listener error is terminal for the SDK (PA2 section 1)
        yield* Effect.addFinalizer(() => Effect.sync(off))
      })), { while: (e) => e._tag === "ListenError", schedule: Schedule.exponential("2 seconds").pipe(Schedule.upTo({ times: 6 })) }))),
  }),
}
```

Repeated server snapshots are values, not registrations, so they never look like reconnects (FC62).

**graphql-ws.** The protocol acknowledges the connection, never a subscription (PA2 section 3), so the honest path is
the first `next` (implicit live): a quiet subscription stays `Connecting`, and a guard on `Live` would deny (FC66,
cost). A server that sends a first `next` of `{ __typename: "Subscribed", replayedFrom }` after registering turns it
into a proof. The client's own retry is turned off so `Feed.reconnect` owns budget and resume:

```ts
subscribe: ({ boardId, after }) => Stream.unwrap(Effect.map(Gql.asEffect(), (gql) =>
  Feed.reconnect((from) => Stream.fromAsyncIterable(gql.client.iterate({ query: BoardEvents, variables: { boardId, after: from } }), (e) => new GqlDropped({ cause: e })).pipe(   // user-defined: client built with retryAttempts: 0
    Stream.map((r) => r.data!.boardEvents),
    Stream.map((ev) => ev.__typename === "Subscribed" ? Feed.live({ proof: `server replayed from ${ev.replayedFrom}` }) : ev)),
  { from: after, position: (ev) => ev.cursor, while: (e) => e._tag === "GqlDropped", schedule: Schedule.exponential("1 second").pipe(Schedule.upTo({ times: 5 })) }))),
```

**SSE** (dense ids, no greeting, no read endpoint). `EventSource` resends `Last-Event-ID` itself and cannot be given
another (FC35), so the adapter closes it on the first error and lets `Feed.reconnect` re-open with `?after=` in the URL:

```ts
subscribe: ({ userId, after }) => Feed.reconnect((from) => Feed.callback((emit) => Effect.gen(function* () {
  const es = new EventSource(`/notes/stream?user=${userId}${from ? `&after=${from}` : ""}`)
  es.onopen = () => emit(Feed.live())                                                         // no greeting: unproven, every time (FC74, cost: the server's fix)
  es.onmessage = (m) => emit({ ...JSON.parse(m.data), id: m.lastEventId })
  es.onerror = () => emit.fail(new SseDropped())                                              // errors carry no detail
  yield* Effect.addFinalizer(() => Effect.sync(() => es.close()))
})), { from: after, position: (n) => n.id, while: (e) => e._tag === "SseDropped", schedule: Schedule.exponential("1 second").pipe(Schedule.upTo({ times: 8 })) }),
```

The machine maps `missed` to a "some notes may be missing" notice; nothing can resolve it but acceptance (FC52).

**Polling with a cursor** (DD's `technicianUpdates`). Each connection is a loop of GETs from the cursor; a failed GET is
a typed drop, not a defect, and the resume position survives (FC72):

```ts
subscribe: ({ ticketId, after }) => Feed.reconnect((from) => Stream.paginate(from ?? "0", (cursor) =>   // Effect: Stream.paginate
  Effect.gen(function* () {
    const batch = yield* TicketApi.progress(ticketId, cursor).pipe(Effect.mapError(() => new PollFailed()))
    yield* Effect.sleep("1 second")
    return [batch.events.map((e, i) => ({ ...e, cursor: i === batch.events.length - 1 ? batch.cursor : undefined })), Option.some(batch.cursor)] as const
  })).pipe(Stream.flatMap(Stream.fromIterable), Stream.prepend([Feed.live({ proof: "poll returns every event after its cursor" })])),
  { from: after, position: (e) => e.cursor, while: (e) => e._tag === "PollFailed", schedule: Schedule.spaced("5 seconds").pipe(Schedule.upTo({ times: 12 })) }),
```

`position` returns `undefined` for events inside a batch, so a resume replays the batch's earlier events, which the
consumer stores by id (at least once). The polling source is pulled, so it waits at the bound and loses nothing (SR18).

### 4.8 Cursors (rare): out of scope, with the supported workaround

**Declared out of scope** for Flow's machine model (SR28's second branch). Reasons: outbound latest-wins state is not
a server reply and not a write (no Attempt, no ending), and every in-model design (a non-key `input` field streamed to
the adapter; a view-written slot) costs a turn per move or adds a second path from views to the network that `check()`,
Stories and `flow check` cannot see. Cutting it keeps correctness and the single graph.

**Workaround** (all requirements of SR28 met by adapter code): the document's adapter service owns a latest-wins
`SubscriptionRef` (EFX `SubscriptionRef.ts`); the view writes it through the service (no turn); the session that owns
the socket reads it, throttled, and re-sends on each connection; release sends a leave.

```ts
export class LocalCursor extends Context.Service<LocalCursor, SubscriptionRef.SubscriptionRef<Cursor | undefined>>()("app/LocalCursor") {}   // user-defined; in-memory, never persisted (a restored cursor is never re-sent)
// doc.contracts.ts: others' cursors are a state feed; mine rides the same connection
cursors: stream({
  id: "Doc.cursors", input: { docId: Schema.String }, output: Cursors, key: ["docId"], delivers: "state",
  subscribe: ({ docId }) => Stream.unwrap(Effect.gen(function* () {
    const mine = yield* LocalCursor
    const sock = yield* DocSocket
    return Feed.reconnect(() => sock.connect(docId, (send) =>                                  // user-defined: connect gives a send for this connection
      SubscriptionRef.changes(mine).pipe(Stream.throttle({ cost: () => 1, units: 1, duration: "33 millis", strategy: "enforce" }),   // ≤ 30 Hz, latest at connect is re-sent
        Stream.runForEach((c) => send({ t: "cursor", c })))), { while: (e) => e._tag === "DocDropped", schedule: Schedule.exponential("1 second").pipe(Schedule.upTo({ times: 10 })) })
  })),
}),
// a view: pointer moves go to the service, not to the machine
onPointerMove={(e) => runtime.runSync(SubscriptionRef.set(cursorRef, toCursor(e)))}           // user-defined wiring; how a view reaches a service is the app's
```

Ghost cursors disappear because the server drops a member when its connection closes, and others see that through
the state feed (`presence_diff` leaves). Section 8 Q8 asks whether a first-class word is wanted later.

## 5. Traceability

Status: **met**, **cost** (met, with a stated price), **limit** (partly met; the gap is stated), **out** (out of scope,
with the reason).

### 5.1 Requirements

| SR | How | Where | Status |
| --- | --- | --- | --- |
| SR1 | `delivers` on the contract; every consumer reads the same pump | 2.2, 3.2 | met |
| SR2 | facts: no equality, no coalescing, no baseline after restore or hydration | 3.2, 2.10, I3 | met |
| SR3 | state: one slot, one waiting delivery, equality against `heard`, row once per publication | 2.6, 3.2 | met |
| SR4 | one fact per turn, next pulled after commit, FIFO with user sends | 3.2 | met |
| SR5 | `missed` before any later fact of an unproven start | 3.1, I1 | met |
| SR6 | `proof` is a required basis string, recorded in evidence and Inspection | 2.3, 2.12 | met |
| SR7 | live only on `Feed.live` or a value; quiet but registered stays live; first-value path stated | 3.1, 4.7 | cost (FC66) |
| SR8 | 3.1–3.4 fill every cell with a conservative meaning | 3, I2 | met |
| SR9 | in session: `Feed.reconnect`'s `last`; across: memory written by fact turns, after `missed` | 2.7, I4, I5 | met |
| SR10 | resolved by a proof from `from`, a catch-up ending at the head, or the handled `missed` (acceptance) | 2.3, 2.7 | met |
| SR11 | `restartAt`; `Feed.reconnect` resumes in the new space; positions keep their epoch | 2.7, 4.1 | met in session; across sessions the handler stores it (rare) |
| SR12 | at-least-once by the source's identity; catch-up dedup by position equality; no position comparison | 2.7, 3.4, I13 | met (stated limit: shared identity) |
| SR13 | the adapter reconnects inside a session; the machine re-opens an ended one | 2.4, 4.1 | met |
| SR14 | schedule is the budget; restored only after `resetAfter` live; Clock; a reload starts a fresh budget | 2.3, 3.4, I12 | met |
| SR15 | `while` and typed reasons; `drop` and `failure` on the row | 2.3, 2.6 | met |
| SR16 | completion is `Closed` (a drop inside `Feed.reconnect`, an ending outside); commits use `timeoutOrElse` → unknown | 2.3, 2.9 | met |
| SR17 | release before restart, 5 s bound, `ReleaseOverdue` | 2.5, I10 | met |
| SR18 | pulled sources wait; `Feed.callback` bound → `Overflow` drop; signals coalesce; `highWaterMark` | 2.3, 3.3, I7 | met; limit for a hand-written `Stream.callback` (FC34) |
| SR19 | ≤ 1 item per session in the mailbox, outside the cap | 3.2, I7 | met |
| SR20 | `value` only from the current connection; stale only through `last`; equal value confirms | 2.6, I8 | met |
| SR21 | state deliveries admitted only when live on their connection; adapters do not emit caches | 3.2, I9, 4.7 | met |
| SR22 | `connection` on every phase; `drop`, `failure` | 2.6 | met |
| SR23 | adapter idle deadline on Clock; source timestamps for quiet staleness; overdue deadline on wake | 4.3 | met |
| SR24 | pushes at arrival, no record queue, no `uncertain` clearing | 2.8 | met |
| SR25 | the listen table, including the first connection | 2.8, I15 | met |
| SR26 | the domain handles `missed`; `failure` required; facts only | 2.7, 2.8 | met |
| SR27 | M6-D6 as accepted | 2.8 | met |
| SR28 | out of scope with a workaround that meets every clause | 4.8 | out |
| SR29 | Attempt-scoped synchronous setter; row and mapper per Attempt; no turn | 2.9, I14 | met |
| SR30 | OD5/OD7 Stop; cut or stall unknown; never persisted; XHR without bridging | 2.9, 4.4, 4.5 | met |
| SR31 | per-kind table; second tab; handover | 2.10 | met |
| SR32 | settling ignores streams; state `last` transferred as last known; baseline; facts transfer none | 2.10 | met |
| SR33 | activation-owned; lifecycle table; discard with evidence | 2.5 | met |
| SR34 | fakes replace transports; adapters on Clock | 2.11 | met; limit for wall-clock adapters (FC38) |
| SR35 | the controls table; `resumedFrom`; evidence; playback frames | 2.11, 4.1 | met (spelling pending M3) |
| SR36 | `FeedUnhandled`, `ListenNeedsFacts`, `DuplicateSession`, `DuplicateListen`, existing findings | 2.12 | met |
| SR37 | explain line; Inspection fields and flags | 2.12 | met |
| SR38 | one runtime; the combinators are plain Streams whose state is narrated by signals | 2.3, 2.4 | met |
| SR39 | one session per key; two actors two sessions; two operations two sessions + warning; SSE limit stated | 2.5 | met; limit (FC18) |
| SR40 | the first example is correct by default; FC64 visible as `UnprovenValues`; FC65 needs a basis | 2.3, 2.12 | met (agent trial not run) |

### 5.2 Failure cases

| FC | How the design answers it | Where | Status |
| --- | --- | --- | --- |
| FC1 | no equality on facts | R-Kind, 3.2 | met |
| FC2 | facts never coalesce | 3.2 | met |
| FC3 | the kind is the contract's | 2.2 | met |
| FC4 | `Feed.reconnect` resumes from `last`; replay or `missed` | 3.4, 4.1 | met |
| FC5 | listen lowers answers on an unproven start, a stream event | 2.8 | met |
| FC6 | the row's `connection`, `drop`, `failure` | 2.6 | met |
| FC7 | one session per key; two operations are two defined sessions | 2.5 | met |
| FC8 | resume via `input` + `Feed.reconnect`; row after restart defined | 2.2, 2.5 | met (download `Range` out, brief 8) |
| FC9 | adapter classifies 4401 as terminal | 4.1 | met |
| FC10 | memory advances only in handled fact turns; unhandled facts are re-requested | 2.7 | met where the server replays; a no-replay source gives `missed` |
| FC11 | facts pulled per turn; state coalesced; tokens are write progress; bounded buffers | 3.2, 3.3, 2.9 | met |
| FC12 | `progress` on the write lane | 2.9 | met |
| FC13 | listen: first connection counts; chat: subscribe after the page's cursor | 2.8, 4.1 | met |
| FC14 | identity storage; versions in domains; EDP's unversioned-listen warning | 2.7 | met |
| FC15 | `last.at`; restore and handover rows | 2.6, 2.10 | met |
| FC16 | Story controls | 2.11 | met |
| FC17 | `flow check` and Inspection | 2.12 | met |
| FC18 | SSE connection limit stated; Q9 | 2.5 | limit |
| FC19 | registration signal makes a quiet reconnect live; listen repaired at it | 3.1, 2.8 | met (plain streams: FC66 cost) |
| FC20 | `value` undefined until confirmed | 2.6 | met |
| FC21 | a silent reopen is unproven; a snapshot is not a proof (proof needs a basis) | 3.1, 2.3 | met |
| FC22 | `last` = last value passed; memory = last handled | 2.7, I4, I5 | met |
| FC23 | a failed catch-up fails the connection and is retried | 3.4 | met |
| FC24 | `restartAt`; epoch in identity | 2.7 | met |
| FC25 | no fact baseline after restore | 2.10 | met |
| FC26 | `Feed.callback` ships the bound; signals never evicted; fakes run the real adapter | 3.3, 2.11 | met |
| FC27 | out of scope with a workaround | 4.8 | out |
| FC28 | listen: ended or down is stale; `failure` required | 2.8 | met |
| FC29 | completion is `Closed`, retried or an ending | 2.3 | met |
| FC30 | Attempt-scoped setter | 2.9 | met |
| FC31 | 3.1 defines every status sequence | 3.1 | met |
| FC32 | outside the cap, bounded by placements | 3.2 | met |
| FC33 | release before restart | 2.5 | met |
| FC34 | `Feed.callback` default bound; docs | 2.3 | limit (closures are not read) |
| FC35 | close `EventSource` on error; `?after=` via `Feed.reconnect` | 4.7 | met; continuity still unproven without a greeting |
| FC36 | `resetAfter` | 3.4 | met |
| FC37 | completion is never success; `timeoutOrElse` | 2.3, 4.4 | met |
| FC38 | adapters on Clock; a wall-clock adapter stalls its Story | 2.11 | limit |
| FC39 | Stop releases; Ask admitted | 4.4 | met |
| FC40 | the row shows live regardless of equality; heartbeat; source-time recipe | 4.3 | met |
| FC41 | budget restored only after `resetAfter` | 3.4 | met |
| FC42 | `catchUp` ends only at the head | 2.3 | met (author's contract) |
| FC43 | catch-up scoped to its connection | 3.4 | met |
| FC44 | no position comparison | 2.7 | met |
| FC45 | repair is in the adapter; a new session repeats it | 4.1 | met |
| FC46 | in-session resume from `restartAt` | 3.4 | met in session; across sessions the handler stores it |
| FC47 | live while live is an unseen reconnect; adapters prefer `Feed.reconnect` | 3.1, 4.6 | met |
| FC48 | released listen is stale | 2.8 | met |
| FC49 | `highWaterMark`; `Feed.callback`; signal groups O(1) | 3.3, 4.1 | met |
| FC50 | `connection` on every row; no `data` | 2.6 | met |
| FC51 | catch-up only after live | 3.4 | met (adapter must say live only on registration) |
| FC52 | acceptance via `missed` | 2.7 | met |
| FC53 | conservative: dimmed until a value; presence re-sends state | 2.6, 4.2 | cost (a push-on-change server must send state on join) |
| FC54 | cache reported as `Feed.down`; stale deliveries discarded | 4.7, 3.2 | met |
| FC55 | a value before live is an unproven start | 3.1 | met |
| FC56 | overdue deadline fires on wake | 4.3 | met |
| FC57 | out of scope; the workaround clears, re-sends, does not restore, costs no turn | 4.8 | out |
| FC58 | synchronous `progress` | 2.9, 4.5 | met |
| FC59 | controls for greeting, hold, reorder, suspend | 2.11 | met |
| FC60 | no out-of-sync state; a notice in memory | 2.7 | met |
| FC61 | Effect socket closes are classified; `Closed` only from completion | 4.1, 2.3 | met |
| FC62 | snapshots are values; `RegistrationChurn` | 4.7, 2.12 | met |
| FC63 | the chat machine is 29 lines with post and history; the stream forces 6 of them and no algorithm | 7 | met |
| FC64 | conservative meaning + `UnprovenValues` | 3.1, 2.12 | met |
| FC65 | `proof` needs a basis, shown everywhere | 2.3 | met (visible, not prevented) |
| FC66 | first value as registration | 4.7 | cost |
| FC67 | cache is `down` | 4.7 | met |
| FC68 | two lowerings, at most two reads | 4.6 | cost |
| FC69 | one refetch on return | 4.6 | cost |
| FC70 | hold after Stop; reload unknown; possible double charge | 4.4 | cost |
| FC71 | a key per upload, `reject` | 4.5 | met |
| FC72 | typed drop, cursor kept | 4.7 | met |
| FC73 | RETRY_WAIT; each re-open may catch up | 2.7, 4.1 | cost |
| FC74 | unproven every reconnect without a greeting | 4.7 | cost (the server's fix) |
| FC75 | tabs and handover rows | 2.10 | met |
| FC76 | M6-D6, `DuplicateListen` | 2.8 | met (sharing: Q9) |
| FC77 | the delay in memory, a Duration schedule | 2.7 | met by the recipe; a multi-step Schedule still restarts (MCH O5) |
| FC78 | transferred value is `last` | 2.10 | met |
| FC79 | label "Waiting for the server" once sent | 4.5 | met |
| FC80 | no terminator → unknown | 2.9, 4.4 | met |
| FC81 | idle deadline on every frame | 4.1, 4.3 | met |

## 6. Amendments (proposed; none applied)

### 6.1 machine-design.md

| Where | Change |
| --- | --- |
| New rules 48–53 (after rule 47) | **48 Stream kinds** (2.2, 2.7's outcome table, 2.6's row); **49 The session** (3.1 normative, R-Live, implicit live); **50 Delivery** (3.2: facts one per turn, state coalesced and admitted only when live, `missed` first, outside the cap); **51 Ownership and release** (R-Owner, 2.5's table, release before restart); **52 Positions** (R-Position: Flow compares none; `Feed.reconnect`'s `last`; memory across sessions; at least once); **53 `listen` and connections** (2.8's table) |
| Rule 8 | add: "stream deliveries of a live session; a released session's undelivered items are discarded with evidence (rule 51)" |
| Rule 14 | add: "stream deliveries are always current from the active leaf; a session's owner is its placement's activation, and release discards rather than routing late (rule 51)" |
| Rule 20 | add the stream rows: `value`, `missed`, `failure` handled from every leaf under the placing state; no late handler; `FeedUnhandled` for an unmapped required key |
| Rule 37 | extend to streams: a stream's `failure` record maps `Closed`, `Defect`, `Interrupted` |
| Rule 47 | stream deliveries count as endings |
| Rule 13 | add `missed`; streams' mapper context unchanged `(value, { input, key })`; the commit context gains `progress(p)` |
| N3 "(merge 6)" | → "(rule 51)" |
| 2.7.3 per-kind table, stream row | outcome keys `value`, `missed`, `failure` (rule 48); row: 2.6's `FeedRow`, per placement, per key under `each`; members: none |
| 2.7.3 "two sessions on one key end `DuplicateSession` (M6 rule 47)" | → "two operations on one stream contract are two sessions; `flow check` warns `DuplicateSession` (rule 51)" |
| 2.7.8/2.7.9 "M6 rule 44" | → "rule 51" |
| 2.7.10 "`DuplicateSession` (merge 6 rule 47)" | → "two selected inputs with one key are one session (rule 41); two operations on one contract are two (rule 51)" |
| 2.7.13 lifetime row "M6 rule 44" | → "a placement's session \| its activation \| a released session's undelivered items are discarded with evidence (rule 51)" |
| 2.7.15 "M6 rule 51 restores the data" | → "a state feed restores `last` and its baseline; a fact feed restores nothing; the session re-opens from the restored `input` (2.10's table)" |
| 2.7.16 | add the findings of 2.12 and the explain line |
| 2.8 | add 2.8.14 "`listen` and connections" (2.8's table here) |
| Section 3.6 keywords, section 5 | add the words of section 7 |
| Section 7 item 9 ("writes that stream: deferred") | → "designed in merge 6: progress on the write lane (2.9)" |

### 6.2 Plans

| Plan | Change |
| --- | --- |
| Operations O1 | `stream({ id, input, output, key, delivers, subscribe })`; `persist` removed from streams; `result` → `output` (OD12) |
| Operations O4 | rewritten from rules 48–52; `DuplicateStreamSession`, "equal values are silent", "with value mapped … one value event waiting", "complete … end the session" replaced |
| Operations O6 | stream tags (`Running`, `Complete`, …) → 2.6's row |
| Operations V9, Q1 | V9: Stories prove the invariants I1–I15 by the 2.11 controls; Q1's stream buffering decided by 3.2–3.3 |
| Machines O6 | `activities: { name: … }` and `complete`, `failure`, `defect`, `interrupt` → MD's list form and rule 48's keys |
| Runtime O4 | "Stream values coalesce" → rule 50; "Facts from an ended activation are discarded" → rule 51 with evidence |
| Runtime O6 | sessions release within the bound; a successor waits for the scope (rule 51) |
| Persistence O2, O4 | the activity baseline applies to state feeds only; "running streams retain their selected latest value and count" → 2.10's table |
| ServerRendering O2, O3, O5, V3, V5 | "latest stream values and counts" → state `last` and baseline; "existing stream lanes win" removed; client rows start `Connecting`; V3, V5 gain a ticker and a chat feed |
| Testing O2, O3, O6 | fixtures as fake transports with 2.11's controls; adapter time on the controlled clock; property-test faults |
| EntityDomains O1, O4 | the repair paragraph's "Reconnect" means rule 53's stream events; O4 adds stream faults |
| Inspection | per-session fields and flags of 2.12 |
| CommandLine O5 | the findings of 2.12 |

## 7. Concepts and size, against DG1–DG5

**Words an author writes** (new; accepted and existing words are not counted):

| Tier | Words | Count |
| --- | --- | --- |
| Common | `Feed.reconnect`, `from`, `position`, `Feed.live`, `proof`, `missed`, `Closed`, `drop`, `value` (row), `last` (`at`), the `connection` literals | **11** |
| Uncommon | `Feed.down`, `Feed.callback` (`emit`, `emit.fail`, `emit.end`), `bufferSize`, `catchUp`, `Overflow` | 5 |
| Rare | `lost`, `restartAt`, `why` (`Unproven`, `Lost`, `Reset`), `resetAfter` | 4 |
| **Total** | | **20** (the last draft: about 24) |

Read-only tooling words: findings `FeedUnhandled`, `ListenNeedsFacts`, `DuplicateSession`; Inspection flags
`UnprovenValues`, `RegistrationChurn`, `ReleaseOverdue`; evidence `Discarded`; `listen` causes `feedDown`, `feedGap`,
`feedEnded`; Story controls (2.11, spelling pending M3). Words reused with their existing meaning: `delivers`,
`connection`, `progress`, `subscribe(.each)`, `value`, `failure`, `while`, `schedule`.

**Lines per case** (what the stream itself forces; contract, operation, placement, view, forced machine states):

| Case | Tier | Adapter | Contract | Operation | Placement + forced handlers | View | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4.1 chat, live path | common | 22 (socket service) | 13 | 5 | 1 + 4 (`Message`, `MayHaveMissed`, `FeedEnded`, RETRY_WAIT) | 7 | the earlier drafts' 17 (lossy), 110, 65 + 46; no position logic in the machine |
| 4.1 repair | uncommon | +1 (`catchUp`) + the history pager | — | — | 0 | — | repair costs no machine state |
| 4.2 presence | common | 6 (fold) | 10 | 1 (bare) | 1 | 4 | no handlers at all |
| 4.3 ticker | common | service | 9 | 5 | 1 + 1 (`QuoteEnded`) | 8 | quiet recipe +2 view lines |
| 4.6 listen | common contract, uncommon SDK | 22 (Supabase) | 6 | 2 | 1 + 2 | 0 | the domain repairs |
| 4.4 LLM | uncommon | in the commit (~25) | 7 | 9 | 2 handlers (release on Stop/Cut) | 1 | progress costs no state |
| 4.5 upload | uncommon | in the commit (~10) | 6 | MD 2.7.7 | MD 2.7.7 | 3 | |
| 4.7 SDKs | uncommon | 7–12 each | in the adapter | as 4.1 or bare | as 4.1 | — | no new Flow concept per SDK |

**Against the goals.**

- **DG1.** Every walk and failure in sections 4–5 cites R-Kind, R-Live, R-Position, R-Owner or R-Repair and the tables
  of section 3. No rule names a source; the SDK-specific lines are all adapter code.
- **DG2.** Common tier: 11 new words, and the chat's stream-forced code is a contract, one placement and four handlers.
  No position comparison, no copy of a Flow status in memory (the cursor is the source's, not Flow's), no protocol
  every chat writes again: backoff, budget, resume-from-last, catch-up ordering and overflow are in `Feed.reconnect`
  and `Feed.callback`. The one generic helper left in author code is `upsert` by id (at-least-once storage), which an
  entity domain removes.
- **DG3.** Pusher, Ably, Phoenix, MQTT, Electric: each is `Feed.reconnect` (or `Feed.callback`) plus mapping the
  source's own "registered / resumed / must refetch" onto `Feed.live`'s three answers (PA1 comparison table, row 3–4).
  Special mechanisms, with the reason a general concept could not cover them: `catchUp` (the ordering of a read against
  a live connection is not expressible as a signal); `restartAt` (a server reset changes the position space, which only
  the source names).
- **DG4.** Repair, SDK bridges, quiet staleness and streaming writes cost only the piece that needs them (an option, an
  adapter, two handlers). Rare cases (resets, unproven positions, silent SDKs, flapping) are explicit choices:
  `restartAt` in a handler, the cost rows of section 5.
- **DG5.** Omitting `missed` or `failure` is a type error; omitting a `Feed.live` is an unproven start (a notice), never
  silent; omitting `proof`'s basis cannot be written; reading a stale value needs the word `last`; a cached or pre-drop
  state value never reaches the machine. Where correctness forces common-tier code, it is one `missed` handler.

## 8. Open questions (owner rounds)

Answer as `Q1 A`. Only confirmed answers become decisions; everything above stays proposed until then.

### Round 1: the shape

**Q1. How does the adapter tell Flow about the connection?** (NEW: `Feed`, `Feed.live`, `Feed.down`)

```ts
// A (recommended): signals in-band, ordered with the values (M6-D2's Stream stays the contract)
subscribe: () => Stream.make(Feed.live({ proof: "replay" }), m1, m2)
// B: a session handle beside the Stream
subscribe: (input, { session }) => socket.pipe(Stream.tap(() => session.live()))   // NEW: session
```

A keeps "the verdict precedes the facts it covers" true by construction; B needs a second ordering rule between the
handle and the Stream, which is what the brief's FC55 is about.

**Q2. The outcome key for a possible loss.** A `missed` (recommended: reads as what happened to the user); B `gap`
(MD's placeholder); C `interrupted` (collides with Flow's `Interrupted`).

```ts
// before (MD placeholder)            // after (A)
gap: E.Gap                            missed: E.MayHaveMissed.from((m) => ({ why: m.why }))   // NEW: missed
```

**Q3. Who bounds an SDK that reconnects itself?** A (recommended): the SDK's own policy, stated; the docs wrap SDKs in
`Feed.reconnect` (4.6) so Flow's budget applies. B: a Flow-level flap budget on every session, ending it with a new
reason `Flapping` after N short-lived connections. B guarantees SR14 for every adapter at the cost of a second budget
beside `Feed.reconnect`'s schedule and a Flow decision on the adapter's behalf (close to rule 25).

**Q4. Where does repair live?** (NEW: `catchUp`)

```ts
// A (recommended): in the adapter; the machine sees `missed` only when nothing could repair
Feed.reconnect(connect, { from: after, position, while, schedule, catchUp: (from) => historyPages(roomId, from) })
// B: in the machine, with a Flow-held debt and a member to resolve it
MayHaveMissed: { target: S.CATCHING_UP, actions: [O.history.lookup(({ event }) => ({ roomId, from: event.from, to: event.to }))] },
CaughtUp: { target: S.LIVE, actions: [O.messages.resolve(({ event }) => event.loss)] },   // NEW: resolve, loss (internal wiring in user code)
```

B costs a machine state, a member, a loss id in user code, a persisted debt and a rule for re-running the read after a
reload (FC45); A gets ordering, reload and "started after the loss" from the connection's scope.

**Q5. Who owns the resume position across sessions?** A (recommended): the machine's memory fills the `input` field
(K2 as written); Flow compares and stores no position. B: Flow fills a marked field from a per-session record.

```ts
// A                                                          // B
input: { roomId, after: Schema.optional(Cursor) }             input: { roomId, after: Feed.resume(Cursor) }   // NEW: Feed.resume
subscribe(({ memory }) => ({ roomId, after: memory.cursor }))  subscribe(({ memory }) => ({ roomId }))          // Flow supplies after
```

B saves one memory field and one `updateMemory` key, but adds a Flow record to persist, a seeding rule for the first
session (a history page's cursor) and a second source of truth; `listen` would need it too.

### Round 2: words and cuts

**Q6. The row.** Keep M6-D4's `connection` on every row with `Connecting | Live | Ended` (recommended), and add `drop`,
`last { value, at }`, and `value` on state feeds only. Alternatives: `status` for `connection`; `reason` for `drop`;
`data` for `value` (rejected: FC50's `data` invited the lie).

**Q7. A clean end of the adapter's Stream.** A (recommended): Flow's reason `Closed` in the `failure` record (a drop
inside `Feed.reconnect`). B: a separate `complete` outcome key, required like `failure`.

**Q8. Cursors and other outbound ephemeral state.** A (recommended): out of scope, the 4.8 workaround documented. B: a
first-class outbound slot on a session (`O.doc.publish(s, value)` from views, NEW), with its own rules for turns,
Stories and `check()`. Defer B to `revisit.md` with case 4.8.

**Q9. One session per Runtime** for `listen` entries and connection-limited sources (M6-D6's open part, SSE's six per
origin). A (recommended): not now; stated limit; to `revisit.md`. B: design it now as a separate proposal.

**Q10. Drop `persist` from stream contracts.** A (recommended): a state feed's `last` and baseline save with a persisted
actor, nothing to declare; a fact feed saves nothing of Flow's. B: keep `persist` as an opt-in on state feeds.

**Q11. The commit's progress setter.** A (recommended): `progress(p)` in the commit context (reuses the contract's,
row's and mapper's word). B: `report(p)` (NEW), to tell the setter from the value.

### Round 3: defaults and tooling

**Q12. `Feed.reconnect`'s extensions to M6-D3.** `resetAfter` (default `"1 minute"`), `catchUp`, and treating
`Feed.Closed` and `Feed.Overflow` as always retryable. A (recommended): as proposed. B: `resetAfter` required (an
upfront contract, one more common-tier word).

**Q13. `Feed.callback`'s bound.** Default `bufferSize: 1_024` values, overflow as a reconnect (`Overflow`). A
(recommended); B no default (required option).

**Q14. Finding and flag names.** `FeedUnhandled`, `ListenNeedsFacts`, `DuplicateSession` (warning), `UnprovenValues`,
`RegistrationChurn`, `ReleaseOverdue`, evidence `Discarded`. A (recommended): as listed. B: fold `ListenNeedsFacts`
into `FeedUnhandled`.

Candidates for `revisit.md` if the owner agrees: Q8's outbound slot, Q9's shared sessions, a `reconnect` member (parked,
brief section 8; this design does not preclude it: a member would re-open the placement's session from `input`),
`fromRpc` streams, download resume with `Range`.
