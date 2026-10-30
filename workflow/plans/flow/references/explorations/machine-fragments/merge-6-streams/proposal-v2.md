# Streams, designed from the brief (merge 6, proposal v2, revision 3)

Status: **revision 3, written 2026-10-31.** The owner chose this design (S1) and decided S1–S6
([decisions-v2.md](decisions-v2.md)): in-band signals (S2), repair in the adapter (S3), the resume position in machine
memory (S4), revision 1's remaining questions (S5) and revision 2's Q15–Q18 (S6), all option A. Those are marked
**decided (S*n*)**; everything else is proposed. Revision 3 answers [reviews/v2-review-1.md](reviews/v2-review-1.md)
(RV1), [reviews/v2-review-2.md](reviews/v2-review-2.md) (RV2) and the executable model
[model/RESULTS.md](model/RESULTS.md) (MDL) by root cause (section 9). It adds **one** public word, `Feed.CannotRepair`,
an owner question (Q19). Built from [brief.md](brief.md), [../machine-design.md](../machine-design.md) (MD),
[../merged/operations/decisions.md](../merged/operations/decisions.md) (OD), `workflow/plans/flow/*.plan`, Effect 4.0.5
(EFX), the owner's prior-art notes [prior-art-1.md](prior-art-1.md) (PA1) and [prior-art-2.md](prior-art-2.md) (PA2),
and [comparison.md](comparison.md) (CMP). Code is not compiled as a whole; Effect calls follow the forms CMP
type-checked (`Effect.map(Service, …)`, `Socket.readerString`, `Stream.fromEffectRepeat`, `Stream.paginate`,
`Schedule.upTo`); `Equal.equals` is structural for plain objects in 4.0.5 (EFX `Equal.ts:2-4`).

Keyword marks in code: `// NEW:` a word this proposal adds; `// existing:` in MD or the plans; `// accepted:` an M6-D
word; `// decided:` an S*n* word; `// user-defined:` the author's own name; `// Effect:` an Effect 4.0.5 export.

## 1. The answer in short

**One idea.** A stream session is a *connection the adapter narrates* and Flow *keeps honest*. The adapter (author
code plus two Flow-shipped combinators) is the only thing that sees close codes, greetings, SDK statuses and
positions; it tells Flow, in-band and in order with the values (S2): **the server is listening now, and what that
proves about the past** (`Feed.live`), **the connection dropped** (`Feed.down`), and **this is a value**. Flow turns
that into one table per session (3.1), a row the view reads, and three outcome keys. Flow compares no positions, reads
no transport, retries nothing and measures no wall time.

**Two facts per connection, never one.** Revision 2 let one bit, `Live`, mean both "the server registered me" and "I
hold everything since my position". Revision 3 keeps them apart: `connection` is registration (the composer, the
row), and each connection start carries an **answer** about the past, which can be *pending* while a repair runs and
becomes *proven* or *lost* only when it is earned (RV1 RC2, MDL F11). Most of revision 3 follows from that split.

**Six general rules** (each walk and failure in sections 4–5 is answered by citing them):

| Rule | Statement |
| --- | --- |
| **R-Kind** | `delivers: "facts"` or `"state"` on the contract (M6-D4). Facts are never skipped, coalesced or equality-silenced, one per turn, and a fact feed must be consumed by a machine mapping `value` and `missed`, or by `listen`; there is no view-only fact feed (RV1 H3). State coalesces to the newest and is current only while the connection that sent it, or a proof on it, says so. |
| **R-Live** | A connection is registered only when the adapter says so (`Feed.live`), or, for M6-D2's plain Stream, at its first value. After a `Feed.down`, a value with no new `Feed.live` is never current: state updates only `last`, a fact arrives after a `missed`. |
| **R-Answer** | Every connection start answers "have I seen everything since this connection's position?": **proven** (a basis string; the evidence must cover the span since the last value this session's stream delivered), **fresh** (Flow's: a session's first connection with no position; nothing was owed), **pending** (Flow's: a repair is running), **lost**, **reset**, or **unproven** (the default). On a fact feed, every answer except proven, fresh and pending is delivered as `missed` before any later fact; a pending answer settles as proven or lost. |
| **R-Position** | **Decided (S4).** Positions belong to the source. Inside a session `Feed.reconnect` resumes from the last value it emitted; across sessions the resume position is an ordinary `input` field (K2) the machine fills from its memory, which only fact turns advance. No position can pass a fact the consumer has neither handled nor accepted as missed. |
| **R-Repair** | **Decided (S3).** Repair happens where the knowledge is: in the adapter (a server replay, or `Feed.reconnect`'s `catchUp`), in the entity domain (`listen` lowers covered answers), or, where nothing can repair, in the machine's explicit acceptance of `missed`. A repair that cannot reach back says so (`Feed.CannotRepair`, Q19) and becomes `missed Lost`, never an outage and never a silent "complete". |
| **R-Owner** | A session belongs to its placement's activation. Releasing it discards what it has not delivered, with evidence, and a new session for the same (actor, operation, key) opens only after the old one's clean-up finished. Session endings are current, never late. |

**Concepts per tier** (words an author writes; tooling words in section 7):

| Tier | New words | Accepted, decided or existing words reused |
| --- | --- | --- |
| **Common** (11) | `Feed.reconnect`, `from`, `position`; `Feed.live`, `proof`; outcome key `missed`; Flow reason `Closed`; row `drop`, `value`, `last { value, at }`; the `connection` literals | `delivers`, `connection` (M6-D4), `key`, `input`, `output`, `subscribe(.each)`, `outcomes`, `value`, `failure`, `while`, `schedule` |
| **Uncommon** (6) | `Feed.down`, `Feed.callback` (`emit`), `bufferSize`, `catchUp`, Flow reason `Overflow`, **`Feed.CannotRepair`** (Q19) | the write row's `progress` (M6-D5); the commit context's `progress(p)` (S5) |
| **Rare** (4) | `lost`, `restartAt`, `missed`'s `why` literals, `resetAfter` | `{ target: "self" }` as the explicit acceptance |

Twenty-one in all, eleven common. Revision 3 adds `Feed.CannotRepair` and nothing else; `fresh` and `pending` are
Flow's own answers, emitted only by `Feed.reconnect`, never written by an author.

**Why this set.** Every source in the brief's 1.2 agrees on three facts: the server starts listening, the connection
drops, a value arrives. Ably's channel `attached` with `resumed` (PA1 s1), Socket.IO's `socket.recovered` (PA2 s2),
Electric's `up-to-date` and `must-refetch` (PA1 s2) and Phoenix's join reply (PA1 s4) are each one of `Feed.live`'s
answers; EventSource's and graphql-ws's absence of any such signal is the default (unproven). Each SDK reaches Flow by
one of two documented transport recipes (2.4) and needs no Flow concept of its own (DG3). What every app of a kind
would otherwise write identically (backoff, budget reset, resume-from-last, overflow, catch-up ordering and dedupe,
the first connection's "nothing owed") is in the combinators and the session table (DG2); an author who writes
nothing about continuity gets the conservative answer as a type-required handler (DG5).

**What is cut** (decided, S3–S5): outbound live state (cursors) as a Flow concept (4.8; open-items 16); machine-driven
repair (S3); a Flow-owned resume position (S4); `persist` on stream contracts (Q10); a Flow flap budget for SDKs that
reconnect themselves (Q3); one shared session per Runtime (Q9; open-items 17). Revision 3 also cuts the view-only fact
feed (R-Kind; Q22).

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
      Stream.unwrap(Effect.map(ChatSocket, (chat) => Feed.reconnect((from) => chat.room(roomId, from), {   // NEW: Feed.reconnect; user-defined: ChatSocket.room
        from: after,                                // NEW: from (where the first connection resumes)
        position: (m) => m.cursor,                  // NEW: position (how a value names its place)
        while: (e) => e._tag === "ChatDropped",     // Effect.retry's word: which errors are transient (SR15)
        schedule: Schedule.exponential("500 millis").pipe(Schedule.jittered, Schedule.upTo({ times: 8 })),   // Effect: the budget
      }))),
  }),
}
```

```ts
// chat.definition.ts (after, excerpt)
operations: ({ E }) => ({
  messages: Chat.messages.outcomes({                // existing: outcomes
    value: E.Message.from((message) => ({ message })),            // existing: value
    missed: E.MayHaveMissed.from((m) => ({ why: m.why })),        // NEW: missed (required on a fact feed that maps value)
    failure: { SignedOut: E.SignedOut, ChatDropped: E.FeedEnded, Closed: E.FeedEnded, Overflow: E.FeedEnded, Defect: E.FeedEnded, Interrupted: E.FeedEnded },   // existing: failure; NEW: Closed, Overflow
  }),
}),
// chat.machine.ts (after, excerpt)
LIVE: { activities: [O.messages.subscribe(({ memory }) => ({ roomId: memory.roomId, after: memory.cursor }))] },   // existing: activities, subscribe
// view (after)
const row = useView(chat, (s) => s.operations.messages)          // existing: s.operations
row?.connection === "Live"                                       // accepted: connection; NEW: "Live" on every row (FC50)
```

Added: `delivers`'s meaning (accepted word), `Feed.reconnect`, `from`, `position`, `missed`, `Closed`, the row's
`connection` on every phase, `drop`, `last`, `value` (and, uncommon, `Feed.CannotRepair`). Dropped: `persist` on streams, OPS O6's stream tags (`Running`,
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

All in a `Feed` module (NEW), adapter-side, used inside `subscribe` or the services it calls. The signals are the only
runtime concept; the combinators are ordinary Stream code Flow ships so every app of a kind does not write it again
(DG2).

```ts
Feed.live()                                         // NEW: registered; continuity unproven (the default)
Feed.live({ proof: "server replayed from 8:41" })   // NEW: proof — nothing missed; the basis is recorded (SR6)
Feed.live({ lost: "server: start over" })           // NEW (rare): lost — something was missed
Feed.live({ lost: "log reset", restartAt: { epoch: 9, seq: 0 } })   // NEW (rare): restartAt — a new position space (SR11)
Feed.down(reason)                                   // NEW (uncommon): the connection dropped; reason is typed author data (SR15)
```

**What a proof means** (decided words, S5; meanings proposed). `proof` is a required string, so continuity cannot be
claimed without writing down why; the basis is in Inspection, Stories and `flow explain` (SR6, FC65).

- **Facts:** *the evidence covers the span since the last value this session's stream delivered, and, until this
  connection ends, the values that follow are every value after it, in source order* (RV2 H3). For a new connection
  that span starts at the connection's `from` (4.1 compares the server's echo of `from`; a `hello` that replayed
  nothing is `Feed.live()`). For an SDK that resumes its own connection in place (Ably `resumed`, Socket.IO
  `recovered`) it starts at the SDK's last received message, which is the last value the session's stream delivered as
  long as `Feed.callback` passes everything it received, which its bound guarantees (an overflow fails the stream).
- **State:** *the value this session last confirmed is still the server's current value* (an ETag or version the
  adapter resumed with, Electric's `up-to-date`). It re-confirms `last` as `value` after a drop, and the re-confirmed
  value is offered to the machine if it differs from what the machine heard (3.2's reconcile rule; RV1 H2). It never
  re-confirms a `last` this session did not confirm itself (decided, S6 Q17).

**Contiguity recipe** (adapter code, no Flow word). A source with dense integer positions and no greeting proves
itself: hold the decision until the connection's first value, and emit `Feed.live({ proof: "ids contiguous after
<from>" })` if its position is `from + 1`, else `Feed.live()` (4.7's SSE). Sparse positions cannot use it (FC44); they
stay unproven without a greeting (FC74's cost).

**`Feed.reconnect(connect, options)`** (M6-D3, extended; decided S5 Q12, S6). One connection is `connect(from)`, a
Stream that fails when the connection is lost. Section 3.4 is normative; in words:

- it passes values and signals through and remembers `last`, the `position` of the last value it emitted
  (`undefined` keeps the previous one) or the `restartAt` of a reset;
- **it announces every connection**: before the first value of a connection on which the inner stream sent no
  signal, it emits the implicit live itself, so Flow's table can read a value after `Feed.down` with no new live as
  "not current" (MDL F7, CMP carry-over 1);
- **a session's first connection with no position is `fresh`** (RV2 H1): when `last` is undefined and nothing has
  been emitted in this session, an unproven start is answered `fresh` (Flow's answer, not an author word), so no
  `missed` reaches the machine. `listen` still lowers covered answers on it (FC13, 2.8). A plain Stream without
  `Feed.reconnect` stays conservative: Flow cannot see its `from`;
- on a failure `while` accepts, on `Feed.Overflow`, or on a connection that completes (`Feed.Closed`), it emits
  `Feed.down(error)`, waits by `schedule` on Effect's `Clock`, and connects again from `last`; any other failure, or
  an exhausted `schedule`, fails the session with that error;
- it restores `schedule` to its first step only when the connection that just ended was registered for at least
  `resetAfter` (default `"1 minute"`); the timer starts at that connection's live signal and is cleared at every
  `connect` and every drop (MDL F8, RV1 M3);
- with **`catchUp`**, on an unproven or lost start (the inner stream's, or the implicit one) with `last` defined, it
  repairs before anything newer reaches Flow (decided S3, S6):
  - it tells Flow the start is **pending** (registered, repair running); the row reads `Live` (S6 Q16), while the
    answer, `listen` freshness and Inspection's evidence wait for the repair to finish (RV1 M1);
  - it calls `catchUp(cursor)`, the step function of Effect's `Stream.paginate` (S6 Q15): the first call receives
    `last`, later calls the page token it returned. Each page's values are emitted in order; the connection's own
    values are buffered (at most `bufferSize`, default 1,024; past it, `Overflow`);
  - **only `Option.none()`, returned from the server's own completeness field, completes it** (FC42). A short page
    or an empty page with a `next` reads on; two empty pages in a row are a page failure (RV1 M5);
  - a page failure `while` accepts is retried by a fresh copy of `schedule` **with the socket open** (S6 Q18, FC23);
    an exhausted copy fails the connection;
  - **`Feed.CannotRepair({ reason, continueAt? })`** (NEW, Q19) failed by a step means "the history does not reach
    back": the start settles **lost**, so `missed Lost` reaches the machine before the next value; paging continues
    from `continueAt` if given (the oldest history the server still has), then the buffer follows. No drop, no budget
    spent (RV2 H2: Ably's 2-minute window, Electric's purged shape, any compacted log);
  - on completion the start settles **proven** (basis `catch-up from <last>`); the buffer is emitted dropping values
    whose position equals one a page returned (`Equal.equals`; `undefined` equals nothing), and the same filter runs
    on the connection's next values until the first that no page returned (MDL F6, RV1 M4). Memory: the buffer and a
    ring of the last `bufferSize` page positions, bounded whatever the gap;
  - if the connection drops, fails or re-registers silently during the repair, the buffer is **discarded, never
    emitted** (nothing after the hole reaches Flow, so `last` stays before it; RV1 H1), and the start is *abandoned*;
    the next connection repairs again from `last` (FC45);
  - preconditions, stated in its doc comment: `catchUp` reads a **change log**, including deletes (a state read cannot
    carry tombstones; `listen` feeds leave repair to the domain), and its snapshot must not lag the live path (a read
    replica behind the socket's primary leaves a hole the client cannot see; RV1 M5).
- its phase (`Connecting n`, `Live`, `CatchingUp { from, pages, pageTries }`, `Waiting n`) reaches Inspection and
  Playback through Flow's own channel (SR38). No author word.

```ts
// before (revision 2): a bounded history could only lie (none) or fail (an outage)
catchUp: (cursor) => fetchPage(roomId, cursor).pipe(Effect.map((p) => [p.messages, p.complete ? Option.none() : Option.some(p.next)] as const))
// after: the server says the history starts later than `from`
catchUp: (cursor) => fetchPage(roomId, cursor).pipe(Effect.flatMap((p) =>
  p.truncated                                                                                // the server's word: its history no longer reaches the cursor
    ? Effect.fail(new Feed.CannotRepair({ reason: `history starts at ${show(p.oldest)}`, continueAt: p.oldest }))   // NEW: Feed.CannotRepair
    : Effect.succeed([p.messages, p.complete ? Option.none() : Option.some(p.next)] as const)))
```

**`Feed.callback(register, { bufferSize? })`** bridges a callback SDK or a raw browser API. `register(emit)` is a
scoped Effect whose finalizers run at release and are awaited (R-Owner). `emit(valueOrSignal)` is synchronous and
returns a `Promise<void>` that resolves once the queue has room, so an SDK that awaits its callback (Electric's
`subscribe`) never reaches the bound (RV2 M2, Q20); `emit.fail(error)` and `emit.end()` finish the stream after what
is queued. Past `bufferSize` (default 1,024, S5 Q13) the stream fails with `Feed.Overflow`, a transient drop
`Feed.reconnect` always retries (S5 Q12). Signals never count against the bound and are never evicted: a run of
signals with no value between them merges into at most `down`, `live`, `down` (3.3), so a flapping SDK costs O(1).
`emit` after release does nothing. `Stream.callback`'s default buffer is unbounded (EFX `Stream.ts:699-729`); the docs
use `Feed.callback` (FC34, a stated limit: `flow check` reads no closure).

### 2.4 Two transport recipes, and what Flow owns

Who owns the transport decides the recipe (RV2 X1, H3). Both are documentation; neither adds a word.

| Recipe | Sources | Shape | Budget and resume |
| --- | --- | --- | --- |
| **P: per-session transport** | raw WebSocket, EventSource, `fetch` bodies, polling, graphql-ws (lazy client, `retryAttempts: 0`), a Supabase channel | `Feed.reconnect((from) => connect(from), …)`; `connect` opens and closes the transport; the SDK's own retry is off | `Feed.reconnect` owns both: `schedule`, `resetAfter`, `from` |
| **S: SDK-owned, app-wide transport** | Ably, Socket.IO, Phoenix sockets, Firestore, the Electric client | an app-level SDK client service; each session is a `Feed.callback` subscription on it, emitting the SDK's status as `Feed.down` and `Feed.live` (with `proof` from `resumed` / `recovered`); wrapped in `Feed.reconnect` only for terminal failures and `catchUp` | the SDK owns reconnect and its backoff (decided, Q3); a finite SDK retry setting is the budget; closing the client per session would kill the other sessions |

In recipe S, writes over the same connection (Socket.IO `emit` with ack, Phoenix `push`, Ably `publish`) are
transaction commits on the shared client service; an SDK that queues a publish while disconnected has not delivered
it, so the commit returns `Outcome.unknown` until the server's ack (RV2 M5).

| Flow owns (one per session, visible in Inspection) | The adapter owns |
| --- | --- |
| the session table (3.1): `connection`, `drop`, each start's answer, the implicit live of a plain Stream | transport, auth, close codes, greetings, SDK statuses, heartbeats (`Stream.timeoutOrElse` before decoding, so pings count) |
| delivery pacing (3.2): facts one per turn, state reconciled to what the machine heard, `missed` before newer facts | classification into typed errors (`while`) and reasons (`Feed.down`) |
| the row, `last.at` from the Runtime's wall `Clock` | positions, resume and catch-up (`Feed.reconnect`), with `from` from `input` |
| release, release-before-restart, discard with evidence | the budget (`schedule`, `resetAfter`), or the SDK's (recipe S) |
| `listen`'s effects on answers (2.8, 3.6); the combinators' phases in Inspection | finalizer time limits (race a slow `removeChannel` against 3 s, RV2 M6) |

**Rule 25 holds** (SR13): Flow never re-opens a session. A two-second drop is a `Feed.down` and a `Feed.live`, with no
machine transition (FC4 as SR13 tests it); a session that ended re-opens only when its placement starts again.

**Sync engines** (IP29, SE). An engine's own status maps onto the signals, never into values: its "up to date"
marker is a `proof` (state) or a registration (facts); `truncate` / `must-refetch` is `Feed.live({ lost, restartAt })`
for a fact feed, or simply the next full value for a state feed of materialised rows, which is the recommended shape
(RV2 M8: `listen` has no "replace the covered set" operation, and entity domains are client coherence, not a sync
engine).

### 2.5 The session and its lifecycle

A **session** is one run of `subscribe` for (actor incarnation, operation, key), owned by the **placement's
activation** (R-Owner), not by the Runtime as a write lane is (OD19): a write lane holds an obligation, a session holds
only interest, and what a later session needs (the resume position, the messages) is already in the machine's
persisted memory. Leaving the state, a key leaving `subscribe.each`, or disposal releases it; nothing is adopted.

Lifecycle (SR33; every cell filled; 3.1 is normative):

| Edge | Adapter | Flow session (3.1) | Row | Machine | `listen` answers (3.6) | Persistence |
| --- | --- | --- | --- | --- | --- | --- |
| placement starts | `subscribe(input)` once the predecessor is `Released` | `Opening` | `Connecting`, `drop: undefined`, restored `last` (state) | nothing | stale `feedDown` | nothing |
| `Feed.live({ proof })` | — | `Live`, answer proven | `Live` | nothing | `feedDown` withdrawn if this start covers the drop | nothing |
| first connection, no position | `Feed.reconnect` answers `fresh` | `Live`, answer fresh | `Live` | nothing | lowered (FC13) | nothing |
| unproven or lost start | — | `Live`, answer unproven, lost or reset | `Live` | facts: `missed` before the next fact | lowered | nothing |
| repair running | pages, retried with the socket open | `Live`, answer pending | `Live` | caught-up facts, one per turn | stays stale | memory |
| repair settles | `catchUp` completes, or `Feed.CannotRepair` | answer proven, or lost | `Live` | lost: `missed Lost` before the next fact | proven: withdrawn; lost: lowered | memory |
| value | — | facts: one per turn; state: reconciled | `last` (and state `value`) | `value` | push applied | memory (the handler) |
| `Feed.down(r)` | waits by schedule, reconnects from `last` | `Dropped`, `drop = r` | `Connecting`, `drop: r`; state `value: undefined`, `last.at` = the drop moment | nothing | stale `feedDown` | nothing |
| value after `down`, no new live | — | stays `Dropped` | state: `last` replaced, `at` stays the drop moment (RV1 M6); facts: `last` | state: nothing; facts: `missed` once, then the fact | lowered | memory (facts) |
| terminal failure, budget gone, completion | — | `Ended` | `{ connection: "Ended", failure }` | `failure`, after the item in flight | stale `feedEnded` | nothing |
| leaving, key gone, disposal | finalizers awaited (bound 5 s) | `Releasing` → `Released` | `undefined` | undelivered items discarded, `Discarded { Released }` | stale `feedEnded` | nothing |
| restore, handover | new session from restored `input` | new table | `Connecting`, restored `last` (state) | no replay; state baseline restored | stale (EDP) | read |
| page wake | the idle deadline, run on `setTimeout`, fires at most one deadline after wake (RV1 M8) | `Dropped` | dimmed | nothing | stale | nothing |
| SSR (server) | sessions may run; released at capture | — | state `last` transferred as an age | — | as EDP | — |

**Release before restart** (SR17, FC33). A successor for the same (actor, operation, key) starts only after the
predecessor's scope closed, within Runtime O6's 5-second bound; past it the old session is abandoned with
`ReleaseOverdue` and the successor starts (the SDK may still hold the topic for a moment: stated, RV1 L6; the recipe
bounds slow finalizers at 3 s). While it waits, the successor's row reads `Connecting`. `Stream.fromAsyncIterable`
does not await `iter.return()` while a `next()` is pending (EFX `Channel.ts`, RV2): stated limit for that source.

**Multiplicity** (SR39, AUD N1–N3). `subscribe.each` gives one session per distinct key (K4). Equal keys in two actors
are two sessions. Two operations on one stream contract and key in one actor are two sessions, each delivering every
value to its own consumer; `flow check` warns `DuplicateSession` only when both placements can be active together by
their state tokens and `when` arrays (RV1 L7). One placement in two states that can be active together is
`DuplicatePlacement` (K4). SSE's six connections per origin is a stated limit (decided Q9; open-items 17).

### 2.6 The row the view reads

```ts
type FactRow<A, D, E> =                               // delivers: "facts"; no `value` field at all
  | { key; connection: "Connecting"; drop: D | undefined; last: Last<A> | undefined }
  | { key; connection: "Live"; drop: undefined; last: Last<A> | undefined }
  | { key; connection: "Ended"; failure: E | Feed.Closed | Feed.Overflow | Defect | Interrupted; drop: undefined; last: Last<A> | undefined }
type StateRow<A, D, E> =                              // delivers: "state"
  | { key; connection: "Connecting"; drop: D | undefined; last: Last<A> | undefined; value: undefined }
  | { key; connection: "Live"; drop: undefined; last: Last<A> | undefined; value: A | undefined }
  | { key; connection: "Ended"; failure: E | Feed.Closed | Feed.Overflow | Defect | Interrupted; drop: undefined; last: Last<A> | undefined; value: undefined }
type Last<A> = { value: A; at: number }               // decided (S5 Q6): at = epoch ms on the Runtime's wall Clock
```

- `connection` exists on every phase, so `row?.connection === "Live"` type-checks for an undefined, connecting or
  ended row (SR22, FC50). `drop` tells "Connecting…" from "Reconnecting: offline"; `failure` says why it ended (FC9).
- **`value`** (state only): the value confirmed by the current connection, or re-confirmed by a proof of this
  session's `last`; otherwise `undefined`. An equal value confirms (SR20, FC20, FC53). A value after `Feed.down` with
  no new live (an SDK's cache) updates `last` only: dimmed, aged, never current, never a machine event (FC54).
- **`last.at`** is the last moment Flow knew the value was current: its arrival while live; the drop moment when the
  connection leaves `Live`; still the drop moment when a cached value replaces `last` after a drop (RV1 M6). It is
  epoch ms on the Runtime's wall `Clock` (`Clock.currentTimeMillis`; the TestClock in Stories). Across a reload or SSR,
  Flow transfers the **age at capture** and rebases it on the receiving clock (`at = now − age`), so server-to-browser
  skew cannot show a negative or shifted age (RV1 M14).
- Rows publish once per Runtime publication (SR3).

### 2.7 The machine: outcomes, gaps and recovery

Outcome keys per kind (IP2; mapper context `(value, { input, key })`, K8):

| Kind | `value` | `missed` | `failure` |
| --- | --- | --- | --- |
| `delivers: "facts"`, machine | **required**: each fact, once, in order | **required**: `Feed.Missed { why: "Unproven" \| "Lost" \| "Reset"; restartAt? }` | **required**: exhaustive over the adapter's error tags plus Flow's `Closed`, `Overflow`, `Defect`, `Interrupted` (rule 37's pattern; RV2 M1) |
| `delivers: "state"` | a reconciled value that differs from the last one heard (optional) | does not exist (type error) | **required when anything is mapped** |
| `listen` entry | the domain's | the domain's | **required** (SR26) |

A fact feed's operation must map `value`, `missed` and `failure`, or be a `listen` entry: a bare or partly mapped fact
feed is a type error, and `flow check` reports it as `FeedUnhandled` (RV1 H3, Q22). A view that wants to show facts
reads the machine's memory, which received every one. A state feed may stay bare (its data is its row, K3).

**How a machine handles gaps.** It does not compute them. Every fact-feed start answered unproven, lost or reset,
every catch-up that settles lost, and every value after a drop with no new live, arrives as `missed`, admitted before
any later fact (R-Answer, SR5). A first connection with no position is `fresh` under `Feed.reconnect` and sends
nothing (RV2 H1). The smallest correct handling is one line, the explicit acceptance SR10 allows:

```ts
MayHaveMissed: { target: "self", updateMemory: () => ({ notice: "Some messages may be missing." }) },   // user-defined: MayHaveMissed, notice
```

Repair lives in the adapter (decided, S3): `catchUp` is ordered with the live values, scoped to the connection and
repeated after a reload, so `missed` arrives only for what nothing could repair.

**The resume position across sessions** is the machine's memory, written by the fact's own turn (decided, S4):

```ts
Message: { target: "self", updateMemory: ({ memory, event }) => ({ messages: upsert(memory.messages, event.message), cursor: event.message.cursor }) },   // user-defined: upsert, cursor
```

Facts are admitted one per turn and `missed` precedes later facts, so `memory.cursor` is always at or before every fact
the consumer holds or has not accepted as missed (SR9); a reload resumes from the last *handled* fact and re-requests
the rest (FC10, where the server replays). Delivery is **at least once** across sessions, so a consumer stores facts by
the source's identity (`upsert` by id, or an entity domain, where versions decide; SR12, FC14). Stated limits: two facts
with one identity are one fact; a fact with **no** identity (two equal "sync now" pushes with no id) survives a replay
only if the source gives it a position to use as its identity (RV1 L5). A `listen` feed cannot keep a cross-session
position (its pushes never reach a turn), so every new `listen` session starts fresh and lowers once (FC69's cost
applies even to a perfect server; RV1 M12).

**Server resets** (rare, SR11). `Feed.live({ lost, restartAt })`: `Feed.reconnect` resumes in the new space at once
(FC46), and the handler stores it for the next session: `cursor: event.restartAt ?? memory.cursor`. Positions of two
spaces stay apart by their own identity (`{ epoch, seq }`), so old seq 1 and new seq 1 are both kept (FC24).

**Machine-level re-open** after an ended session is a state and a schedule (rule 25, FC73), with the delay in memory
so a reload keeps the deadline (FC77). Its backoff resets only after the session has been live for a while, never on
a fact, or a flapping server that replays one message per cycle resets it each time (RV1 M9):

```ts
LIVE: { schedules: { healthy: { schedule: "1 minute", send: E.Healthy } },                // existing: schedules; user-defined: Healthy
        on: { Healthy: { target: "self", guard: [live], updateMemory: () => ({ reopenInMs: 1000 }) } } },   // reset only after a minute registered
RETRY_WAIT: { schedules: { reopen: { schedule: ({ memory }) => Duration.millis(memory.reopenInMs), send: E.Reopen } }, on: { Reopen: S.LIVE } },
```

### 2.8 `listen` and entity records

`listen(stream).as([Entities], mapping)` accepts only `delivers: "facts"` (a type error otherwise, SR26). Pushes are
applied in order at arrival, each in a store publication, never through a turn and never in a write's record queue
(rule 29); they clear no `uncertain` mark (rule 32); versions and contests decide duplicates and reorders (EDP O1,
SR24). The domain consumes `value` and `missed`; the machine maps `failure`. The session's answers drive the covered
answers (every active answer holding a listed entity: conservative); 3.6 is normative:

| Session event | Covered answers |
| --- | --- |
| placement starts, `Feed.down`, a pending repair | stale, cause `feedDown` |
| a start answered **proven** (a server proof, or a settled catch-up) | the `feedDown` staleness this session caused since the drop is withdrawn |
| a start answered **fresh**, unproven, lost or reset; a repair settled lost | every answer whose read started before this moment is lowered: subscribed ones refetch, the rest stay stale (cause `feedGap`); the first connection counts (FC13) |
| `Ended`, `Released` | stale, cause `feedEnded`, until a read started after it refreshes them |

This is EDP O1's "Reconnect … refetch covered answers" as a stream event (IP17, FC5). Hydrated answers are read before
the client's first start, so each covered list refetches once after hydration (RV1 L1, a stated cost beside FC69).
Two sessions of one entry on one key follow M6-D6 (both apply, either's start lowers, `DuplicateListen`; SR27, FC76).

### 2.9 Streaming writes

A streaming write is a transaction (M6-D1). The commit context gains `progress(p)` (decided, S5 Q11): a synchronous
setter, callable from any callback (`xhr.upload.onprogress`, an SDK's `onToken`), that replaces its Attempt's progress
(latest wins; the author accumulates, e.g. the text so far). It acts only on its own Attempt while that Attempt is the
lane's addressable one and unended; otherwise a call is evidence and changes nothing (SR29, FC30; 3.5 is normative).
The row's `progress` is the addressable Attempt's (M6-D5, rule N2); each ending's mapper reads its own Attempt's last
progress (`ctx.progress`, rule 13). Progress publishes as a Runtime step, coalesced to one publication, and costs no
turn. `p` is typed by the contract's `progress` Schema and is not decoded at runtime, since it never crosses a boundary:
it is never persisted or transferred, so after a reload it is absent and the held Attempt arrives as
`unknown { Restored }` (OD20; SR30, FC70).

A stall is `Effect.timeoutOrElse(... Outcome.unknown(new Stalled()))` inside the commit (MD 2.7.6); a body that ends
without its terminator returns `Outcome.unknown(new Truncated())` (SR16, FC80); Stop is `O.ask.cancel`, whose
`unknown { Cancelled }` holds the lane under `reject` until its handler releases it (OD5, OD7; FC39, FC70). Streamed
tokens are view data (`progress`); output that must **drive the machine** (streamed tool calls) is a fact stream of its
own, with a terminator frame the adapter turns into a typed error, since a stream's clean end is `Closed` (RV2 M7).

### 2.10 Persistence, reload and SSR

| | Fact feed | State feed |
| --- | --- | --- |
| Saved with a persisted actor | nothing of Flow's: the machine's memory (messages, cursor) is the record | `last` with its **age**, and `heard` (the machine's baseline); sensitive or unencodable `output` is omitted (PER O2) |
| Equality baseline after restore | **none** (SR2, FC25) | `heard` restored, so an equal confirmed value is not delivered again |
| Row after restore | `Connecting`, `last` absent | `Connecting`, `value: undefined`, `last` rebased from its age (FC15) |
| Queued deliveries, buffers, the adapter budget | not saved; a reload starts a new session with a fresh budget (SR14, stated) | same |

A `last` is captured with the publication it belongs to, so a crashed tab restores an older `last`; it is dimmed and
aged, so this is safe (RV1 IP21). Second tabs open their own sessions (`SecondTabNoPersistence` unchanged); a leader
handover is a restore in the new leader (FC75, SR31).

**SSR** (SR32). Streams never delay settling (SSR O2). At capture, server sessions are released; a state row transfers
`last` as an age and `heard`; a fact row transfers nothing (memory transfers as memory). On the client the row starts
`Connecting` with the rebased `last`, so a server-rendered price shows as last known until the client's own session
confirms it (FC78); `heard` stops a duplicate delivery. A proof on the client cannot re-confirm a transferred `last`
(S6 Q17). Sensitive values are omitted (SSR O3). A server session's pushes may or may not land before capture: the
HTML can differ between renders, which is why only `last` (dimmed) transfers (RV1 IP22).

### 2.11 Stories and transport fakes

**Needs** (SR34, SR35; M3 is not accepted, so this states needs and a proposed spelling). A Story replaces the
transport, never the adapter: `Socket.WebSocketConstructor` (EFX `socket/Socket.ts:864-875`; the app provides the
global one at its layer, so a Story can replace it), an `EventSource`, `fetch` or `XMLHttpRequest` service, or an
SDK's structural subset as a Layer. All adapter time is Effect's `Clock`, so the TestClock drives heartbeats, backoff,
`resetAfter`, page retries and commit deadlines (FC38's wall-clock adapter hangs a Story: stated).

| Control (proposed spelling on a fake server `fake`) | Real sequence |
| --- | --- |
| `fake.accept()`, `fake.refuse(code)` | handshake succeeds; 401/1006 |
| `fake.send(frame)`, `fake.flood(n, frame)` | frames; a burst past `highWaterMark` or `bufferSize` |
| `fake.silence(d)` | quiet or half-open: no frames, no close (FC81) |
| `fake.drop(code)`, `fake.flap(n, { upFor })` | a close with a code; accept-then-drop n times (FC41) |
| `fake.withhold("hello" \| "replay")` | a server that never greets, or greets without replaying (FC51, FC66) |
| `fake.resetLog(epoch)`, `fake.retain(n)` | a log restart (FC24, FC46); a history that keeps only the last n (RV2 H2) |
| `fake.reorder(i, j)` | reordered frames (SR12) |
| `fake.hold("history")`, `fake.answer("history", page, { next })`, `fake.fail("history", e)` | a catch-up page held, answered with or without a next page, failed once or for good (FC23, FC42, FC45) |
| `story.suspend(d)` | a backgrounded tab: timers do not run for d, then fire overdue (FC56) |
| `truth.fake.resumedFrom` | the position the server saw (SR35) |
| `checkpoint.evidence("feed")` | per session: each start's answer and basis (`pending`, `proven`, `fresh`, `lost`, …), `missed`, drops, `Overflow`, `Discarded`, the reconnect phase |

`process()` does not wait for an open stream (TST O2); Playback frames carry each row's `connection`, `last.at` and the
reconnect phase (PB); playback starts no session (IP24). Property tests gain the faults push, drop, reconnect (proven,
fresh, unproven), repair pending and settled, unsubscribe and overflow, with the domain audited after each push (EDP
O4, IP18).

### 2.12 `flow check`, `flow explain`, Inspection

`flow check` (SR36; from contract data, outcome tokens and placements, never closures; names decided, S5 Q14):

| Finding | Level | When |
| --- | --- | --- |
| `FeedUnhandled` | error | a fact feed's operation that is not a `listen` entry and does not map all of `value`, `missed`, `failure`; a `listen` operation without `failure`; a state feed that maps `value` without `failure` (types first) |
| `ListenNeedsFacts` | error | `listen` over `delivers: "state"` (types first) |
| rule 20 rows | error | `value`, `missed`, `failure` events not handled from every leaf under the placing state; none can be late (R-Owner) |
| `DuplicateSession` | warning | two operations on one stream contract that can be placed at once by their state tokens and `when` arrays, with keys that can be equal |
| `DuplicateListen` (M6-D6) | warning | two `listen` sessions on one entry and key in one Runtime |
| `VerbMismatch`, `DuplicatePlacement`, `KeyRequired` | existing | unchanged; streams stay exempt from `KeyOmitsInput` |

`flow explain` (SR37): `LIVE subscribes messages (Chat.messages, facts, one session per room)`;
`WATCHING subscribes quotes (Market.quote, state, one session per symbol)`.

Inspection (SR37, IP25), per session: actor, operation, key, `connection`, the last drop's reason, each start's answer
with its basis and time (`pending`, then `proven` or `lost`, or `abandoned`), `Feed.reconnect`'s phase (3.4), `missed`
reports, the bound (`bufferSize` and depth, the reconnect buffer and schedule step; "unknown" for a plain Stream),
release state. **Retention:** per session, counters plus a ring of the last 256 evidence entries, so a flapping SDK
costs bounded memory (RV1 M13). Flags: `UnprovenValues` (values on a connection that never said `Feed.live`: FC64),
`RegistrationChurn` (more starts than drops by a factor of 3 over 10 starts: FC62), `ReleaseOverdue`. Stream values
are redacted as other values are.

## 3. State machines as tables

Normative, and written so an executable model can be built from this section alone (MDL built revision 2's; section 9
lists what it found). Each table gives its variables, initial values, inputs and one cell per (state, input). "—ⁿ"
means the input cannot occur, for the footnoted reason; a model must check that it never fires. `deliver(x)` appends x
to the session's pump queue (3.2); `emit(x)` passes x downstream; `now` is the Runtime `Clock`. Positions compare with
`Equal.equals`, and `undefined` equals nothing. Evidence kinds are tooling output (2.12).

**Signals.** Public, from any adapter: `proof(b)`, `live()` (unproven), `lost(r)`, `reset(r, restartAt)`, `down(r)`.
Internal, emitted only by `Feed.reconnect` (3.4) and never written by an author: `fresh` (a session's first connection
with no position), `pending(b)` (registered, repair running), `settle(proven)`, `settle(lost r)`. Answer order, weakest
first, used to merge: `reset` < `lost` < `unproven` < `proof` (the latest `restartAt` kept).

**A model's server.** MDL's is sufficient: a log of positions with a head; a connection registers at its live signal;
a proof replays from the requested position; a reset moves the head to a new space; pages return slices of the log
(with `more`, `empty with next`, `last`), or `CannotRepair` when the log no longer reaches the cursor.

### 3.1 The session (Flow's runtime; one per (actor incarnation, operation, key))

**Variables.** `kind ∈ { facts, state }`; `st ∈ { Opening, Dropped, Live, Ended, Releasing, Released }`; `drop`;
`dropAt`; `owed` (facts: a `missed Unproven` was queued since the last drop); `conn` (+1 at every start); `answer ∈ {
none, proven, fresh, pending, unproven, lost, reset, abandoned }`; `startAt`; `last` (none, or `{ value, at, conn, own
}`; `own` = confirmed by this session); `confirmed` (state). **Initial:** `st = Opening`, `drop = none`, `owed =
false`, `conn = 0`, `answer = none`; for state, `last` = the restored or hydrated value with `own = false` and `at`
rebased from its age, `confirmed = false`.

**Procedures.**
- `start(a)`: `conn += 1`; `st = Live`; `drop = none`; `answer = a`; `startAt = now`. Facts: if `a ∈ { unproven, lost,
  reset }` and not (`a = unproven` and `owed`), `deliver(missed a)`; then `owed = false`. State: `confirmed = false`.
  Then `reconcile`.
- `reconcile` (state, after every cell): let `cur` = `last.value` if `st = Live ∧ confirmed`, else none. If `cur` is
  defined and `value` is mapped: if `¬Equal(cur, heard)`, set the 3.2 slot to `cur` at `conn`; else clear the slot.
  (One reconciliation point for every path that makes a value current: a value, a proof, a re-confirm; RV1 H2, MDL F2,
  F3.)
- `end(f)`: `st = Ended { f }`; `deliver(failure f)`; a `pending` answer becomes `abandoned`; state: if `st` was `Live`
  and `last` is defined, `last.at = now`.

| Input ↓ / State → | `Opening` | `Dropped` | `Live` | `Ended` | `Releasing` | `Released` |
| --- | --- | --- | --- | --- | --- | --- |
| **`proof(b)`** | `start(proven)` | `start(proven)`; state: if `last.own`, `confirmed = true`, `last.at = now`; `reconcile` | `answer = proven`; state: if `¬confirmed ∧ last.own`, `confirmed = true`; `reconcile` | —¹ | discard, evidence | —² |
| **`live()`** | `start(unproven)` | `start(unproven)` | an unseen reconnect (FC47): `start(unproven)` | —¹ | discard, evidence | —² |
| **`lost(r)`** | `start(lost)` | `start(lost)` | `start(lost)` | —¹ | discard, evidence | —² |
| **`reset(r, at)`** | `start(reset)` | `start(reset)` | `start(reset)` | —¹ | discard, evidence | —² |
| **`fresh`** (internal) | `start(fresh)` | as `live()`, evidence | as `live()`, evidence | —¹ | discard, evidence | —² |
| **`pending(b)`** (internal) | `start(pending)`; state: as `live()` | `start(pending)`; state: as `live()` | `start(pending)`; state: as `live()` | —¹ | discard, evidence | —² |
| **`settle(proven)`** (internal) | —³ | —³ | if `answer = pending`: `answer = proven`; else evidence | —¹ | discard, evidence | —² |
| **`settle(lost r)`** (internal) | —³ | —³ | if `answer = pending`: `answer = lost`; facts: `deliver(missed Lost)`; else evidence | —¹ | discard, evidence | —² |
| **value v** | the plain-Stream case: `start(unproven)`, then the `Live` cell | **not current**: state: `last = { v, dropAt, conn, own: false }`, nothing delivered (FC54, RV1 M6); facts: unless `owed`, `deliver(missed Unproven)`, `owed = true`; then `deliver(value v)`, `last = v`; evidence `UnprovenValues` | facts: `deliver(value v)`, `last = v`; state: `last = { v, now, conn, own: true }`, `confirmed = true`, `reconcile` | —¹ | discard, evidence | —² |
| **`down(r)`** | `st = Dropped`, `drop = r`, `dropAt = now` | `drop = r` | `st = Dropped`, `drop = r`, `dropAt = now`, `owed = false`; `pending` → `abandoned`; state: `confirmed = false`, `last.at = now` | —¹ | discard, evidence | —² |
| **stream fails e** | `end(e)` | `end(e)` | `end(e)` | —¹ | discard, evidence | —² |
| **stream completes** | `end(Closed)` | `end(Closed)` | `end(Closed)` | —¹ | discard, evidence | —² |
| **defect / outside interrupt** | `end(Defect \| Interrupted)`; a defect is an issue | same | same | —¹ | discard, evidence | —² |
| **release** | `st = Releasing`; interrupt the fiber | same | same | `st = Releasing` | stays | —² |
| **scope closed** | —⁴ | —⁴ | —⁴ | —⁴ | `st = Released` | —² |
| **release bound (5 s) passed** | —⁴ | —⁴ | —⁴ | —⁴ | `st = Released`; issue `ReleaseOverdue` | —² |

¹ the Stream has exited; Flow pulls nothing after `Ended`. ² a released session has no fiber and no inputs.
³ `Feed.reconnect` settles only a start it announced as `pending`, and only while that connection is up (3.4).
⁴ only after release. 16 inputs × 6 states = 96 cells: 41 "cannot occur", 55 defined, none ignoring an input without
evidence (SR8). Row (2.6): `connection` = `Connecting` for `Opening` and `Dropped`, `Live`, `Ended`; `undefined` for
`Releasing` and `Released`; `drop` in `Dropped`; state `value` = `last.value` iff `st = Live ∧ confirmed`.

Conservative meanings, stated once (SR8, FC31, FC55, FC64): a plain Stream's first value is an unproven start; a value
after a drop with no new live is not current (state) or follows a `missed` (facts); a second unproven live while live
is an unseen reconnect; repeated drops keep the latest reason; a drop without values is only a status; one `missed
Unproven` covers a drop's values and the unproven start that follows them (MDL F4: the I1* reading is the intended one).

### 3.2 Delivery (the pump)

**Facts. Variables:** `Q` (Flow-side, ordered: at most a `missed`, a value, a `failure`), `inFlight` (none or one
item in the mailbox). Flow pulls the adapter only when `Q` is empty, `inFlight = none` and `st ∉ { Releasing,
Released }`; a pulled signal is applied to 3.1 and Flow pulls again unless 3.1 queued something.

| Facts input | `inFlight = none` | `inFlight ≠ none` |
| --- | --- | --- |
| 3.1 `deliver(x)` | append to `Q`; move the head of `Q` to the mailbox (`inFlight`) | append to `Q` (a `failure` waits behind the item in flight; MDL F12) |
| the delivered turn ends (committed, `Denied` or `Unhandled`, which count as delivered, OD20 F8) | —⁵ | `inFlight = none`; move the head of `Q`, if any, to the mailbox |
| admission when `st ∈ { Releasing, Released }` | —⁵ | discard, `Discarded { Released }`; clear `Q` |

**State. Variables:** `slot` (none, or a value with `slotConn`), `queued` (a value delivery is in the mailbox),
`heard` (the last value the machine heard; restored or hydrated with the actor), and a separate `Q` for `failure`.
Flow pulls eagerly.

| State input | `queued = no` | `queued = yes` |
| --- | --- | --- |
| `reconcile` sets the slot | `slot = cur`, `slotConn = conn`; `deliver(value)`; `queued = yes` | `slot = cur`, `slotConn = conn` (replaced) |
| `reconcile` clears the slot | nothing | `slot = none` (MDL F2) |
| admission of the value delivery | —⁵ | if `slot` defined `∧ st = Live ∧ slotConn = conn`: the event carries `slot`, `heard = slot`; else discard (`Discarded { NotLive }`; SR21); `slot = none`, `queued = no`; then `reconcile` |
| 3.1 `deliver(failure)` | to the mailbox | to the mailbox, behind the value delivery (which then finds `st = Ended` and is discarded: the last value of a state feed that ends is shown, dimmed, but never heard, since it is no longer current; MDL F1, SR21) |
| release | nothing | discarded at admission |

⁵ nothing is in the mailbox. Bound (SR19): per fact session at most one mailbox item and `|Q| ≤ 3`; per state session
one value delivery and one `failure`.

### 3.3 `Feed.callback`'s queue

**Variables:** `q`, a sequence of values and signal *groups*; a group is `(down₁?, live?, down₂?)`; `closing ∈ { open,
failing e, ending }`; `released`; `waiters` (the promises `emit` returned while full). **Bound:** at most `bufferSize`
values and one group between two values, so memory is O(`bufferSize`) for any sequence (SR18, FC49).

Group merge (MDL F5): appending `down(r)` sets `down₂ = r` if the group has a `live`, else `down₁ = r`. Appending
`live(a)` with a `down₂` present moves it to `down₁` (a drop happened), clears `down₂`, and sets `live` to the weaker of
the group's `live` and `a`; without a `down₂`, `live` = the weaker of the two (or `a`). Pulling a group emits `down₁`,
`live`, `down₂`, each if present. So `[proof, down]` ends dropped, and no merge upgrades an answer or hides a drop.

| Input | Room (`values(q) < bufferSize`) | Full | `closing ≠ open` or `released` |
| --- | --- | --- | --- |
| `emit(value)` | append; return a resolved promise | `closing = failing Overflow`; drop the value (evidence); return a promise that never resolves | no-op, evidence |
| `emit(signal)` | merge into the tail group or start one | same (signals never count against the bound) | no-op, evidence |
| `emit.fail(e)` / `emit.end()` | `closing = failing e` / `ending` | same | no-op |
| pull | take the head (a group emits as above); resolve the oldest waiter if room appeared | same | drain `q`, then fail or end; resolve no waiter |
| release | run finalizers, awaited; `released = true` | same | run finalizers if not yet run (MDL F12) |

`emit` returns a promise only so that an SDK that awaits its callback never emits into a full queue: the promise of the
emit that filled the last slot resolves when a pull makes room (RV2 M2).

### 3.4 `Feed.reconnect` (adapter side, Flow-shipped; its phase reported to Inspection)

**Variables:** `ph ∈ { Connecting, Live, CatchingUp, Waiting, Done }`; `signalled` (this connection's inner stream sent
a signal, or the implicit live was emitted); `emittedAny` (any value emitted in this session); `last` (initially
`options.from`); `n` (the reconnect schedule's state); `liveSince` (none, or the time this connection registered);
`ring` (the last `bufferSize` positions emitted by pages; while non-empty, values that match it are dropped); in
`CatchingUp`: `cursor`, `buf` (≤ `bufferSize` values), `emptyRun`, `pageSched` (a fresh copy of `schedule`), `settled`.
**Initial:** `ph = Connecting`, `connect(last)` opened, `signalled = false`, `emittedAny = false`, `liveSince = none`,
`ring = []`.

**Procedures.**
- `emitValue(v)`: if `ring` is non-empty: if `position(v)` is defined and in `ring`, drop v (evidence) and return; else
  `ring = []`. Emit v; `last = position(v) ?? last`; `emittedAny = true`.
- `register(sig)`, for an inner unproven or lost start without `restartAt`, or the implicit start: `signalled = true`;
  `liveSince = now`. If `catchUp` is set and `last` is defined: `startRepair()`. Else if `sig` is unproven, `last` is
  undefined and `¬emittedAny`: emit `fresh` (RV2 H1). Else emit `sig`. `ph = Live` unless repairing.
- `startRepair()`: emit `pending("catch-up from <last>")`; `ph = CatchingUp`; `cursor = last`; `buf = []`; `ring =
  []`; `emptyRun = 0`; `settled = false`; `pageSched` fresh; request `catchUp(cursor)`.
- `complete()`: if `¬settled`, emit `settle(proven)`; `ph = Live`; `emitValue(v)` for each v of `buf` in order; `buf
  = []` (`ring` stays, filtering the connection's next values until the first that no page returned; MDL F6).
- `abandon()`: interrupt the page read; `buf = []`; `ring = []` (nothing buffered is emitted; RV1 H1).
- `dropConn(e)`: in `CatchingUp`, `abandon()`; emit `down(e)`; if `liveSince` is defined and `now − liveSince ≥
  resetAfter`, reset `n` to step one; `liveSince = none`; step `n`: a delay → `ph = Waiting`; exhausted → fail with
  e, `ph = Done`.

| Input ↓ / Phase → | `Connecting` | `Live` | `CatchingUp` | `Waiting` | `Done` |
| --- | --- | --- | --- | --- | --- |
| **inner `proof(b)`** | emit it; `signalled = true`, `liveSince = now`; `ph = Live` | emit it (a repeat) | evidence (a proof cannot cover a repair already running); stay | —⁶ | —⁷ |
| **inner `live()` or `lost(r)`** | `register(it)` | `register(it)` (an unseen re-registration) | `abandon()`; `startRepair()` again from `last`, without a second `pending` (the start stays pending) | —⁶ | —⁷ |
| **inner `reset(r, at)`** | `last = at`; emit it; `signalled = true`, `liveSince = now`; `ph = Live` | `last = at`; emit it | `abandon()`; `last = at`; emit it (Flow delivers `missed Reset`); `ph = Live` (MDL F9) | —⁶ | —⁷ |
| **inner `down(r)`** | emit it; `signalled = true`; `liveSince = none` | emit it; `ph = Connecting`; `signalled = true`; `liveSince = none` | `abandon()`; emit it; `ph = Connecting`; `liveSince = none` | —⁶ | —⁷ |
| **inner value v** | if `¬signalled`: `register(implicit unproven)`, then as `CatchingUp` if repairing (`buf = [v]`, RV1 M2), else `emitValue(v)`; if `signalled`: `emitValue(v)` | `emitValue(v)` | append to `buf`; past `bufferSize`: `dropConn(Overflow)` | —⁶ | —⁷ |
| **page ok `[values, next]`** | —⁸ | —⁸ | emit each value in order (`last = position(v) ?? last`, `emittedAny = true`, its position appended to `ring`, oldest dropped past `bufferSize`); `emptyRun = values empty ∧ next defined ? emptyRun + 1 : 0`; `pageSched` fresh; if `emptyRun = 2`: as a page failure `while` accepts; else `next = some(c)`: `cursor = c`, request; `next = none`: `complete()` | —⁸ | —⁷ |
| **page fails `CannotRepair(r, continueAt?)`** | —⁸ | —⁸ | emit `settle(lost r)`; `settled = true`; `continueAt` given: `cursor = continueAt`, request; else `complete()` | —⁸ | —⁷ |
| **page fails e, `while(e)`** | —⁸ | —⁸ | step `pageSched`: a delay → wait for "page delay elapsed"; exhausted → `dropConn(e)` (the socket is closed) | —⁸ | —⁷ |
| **page fails e, `¬while(e)`** | —⁸ | —⁸ | `abandon()`; fail with e; `ph = Done` | —⁸ | —⁷ |
| **inner fails e with `while(e)`, `Overflow`, or completes (`Closed`)** | `dropConn(e)` | `dropConn(e)` | `dropConn(e)` | —⁶ | —⁷ |
| **inner fails e, `¬while(e)`** | fail with e; `ph = Done` | same | `abandon()`; same | —⁶ | —⁷ |
| **page delay elapsed** | —⁸ | —⁸ | request `catchUp(cursor)` | —⁸ | —⁷ |
| **reconnect delay elapsed** | —⁹ | —⁹ | —⁹ | `connect(last)`; `ph = Connecting`; `signalled = false`; `liveSince = none` | —⁷ |
| **release** | interrupt; finalizers awaited | same | `abandon()`; same | cancel the sleep | nothing |

⁶ nothing is connected while waiting. ⁷ the stream has ended. ⁸ no catch-up is running. ⁹ no reconnect delay is
pending. 14 inputs × 5 phases = 70 cells: 38 "cannot occur", 32 defined. `resetAfter` (default `"1 minute"`, S5 Q12)
is measured only from this connection's registration, so a greet-and-drop server, or a connection that never
registers, never restores the budget (FC41; MDL F8).

### 3.5 Write progress (for I14; amends MD 2.7.13's lane)

**Variables** per write lane: the Attempts with `ended[a]`; `addr` (the addressable Attempt, by MD 2.7.13); `prog[a]`.
Row `progress = addr ? prog[addr] : undefined`.

| Input | `a = addr ∧ ¬ended[a]` | otherwise |
| --- | --- | --- |
| setter `progress(p)` called by Attempt a's commit | `prog[a] = p`; publish the row as a Runtime step | evidence; nothing changes (FC30) |
| a's ending admitted | the mapper reads `prog[a]`; `ended[a] = true` | the mapper reads `prog[a]` |
| promotion (MD 2.7.13) | `addr` = the promoted Attempt, whose `prog` is undefined | — |
| restore | `prog` is not persisted: every `prog[a]` undefined | same |

### 3.6 `listen` coverage (for I15)

**Variables** per covered answer r: `readStart[r]` (when its current read started), `causes[r]` (a set of `feedDown s`,
`feedGap s`, `feedEnded s`), `subscribed[r]`; r is fresh iff `causes[r]` is empty and its read has landed. Per covering
session s: 3.1's `st`, `answer`, `startAt`.

| Session s event | Effect on every covered r |
| --- | --- |
| placement starts; `down`; `start(pending)` | add `feedDown s` |
| `start(proven)`, or `settle(proven)` | remove `feedDown s` |
| `start(fresh \| unproven \| lost \| reset)`, or `settle(lost)` | remove `feedDown s`; if `readStart[r] < now`: add `feedGap s`, and if `subscribed[r]` start a refetch |
| `end`, release | add `feedEnded s` |
| a read of r starts | `readStart[r] = now` |
| a read of r lands | remove every `feedGap s` and `feedEnded s` whose event happened before `readStart[r]`; a read that started before an affecting event stays stale (EDP O1) |

### 3.7 Invariants for the executable model

Each is checkable from the variables above and the model's server log.

| # | Invariant | Requirement |
| --- | --- | --- |
| I1 | Facts: let E be the latest of a start answered `unproven`, `lost` or `reset`, a `settle(lost)`, or the first value admitted in `Dropped` since a drop. Every value admitted after E is preceded by a `missed` admitted after E (an owed `missed` counts) | SR5 |
| I2 | Every cell of 3.1–3.6 is defined; no input is dropped without evidence; no "cannot occur" cell fires | SR8 |
| I3 | Facts admitted = values pulled while not releasing; no equality, no coalescing, before or after a restore | SR2 |
| I4 | Every `connect(from)` and the first page request of a repair name `last` (the last position emitted, a `restartAt`, or `options.from`) | SR9 |
| I5 | A resume field written only in fact turns never names a position after a value not yet admitted, or after a `missed` not yet admitted | SR9 |
| I6 | Every `missed` and `failure` queued for a session not `Releasing` is admitted exactly once | SR10, K17 |
| I7 | `|Q| ≤ 3` and ≤ 1 mailbox item per fact session; ≤ 2 per state session; `Feed.callback` ≤ `bufferSize` values + one group per gap; `buf`, `ring` ≤ `bufferSize`; evidence ≤ 256 entries | SR18, SR19 |
| I8 | Row `value` defined ⇒ `st = Live ∧ confirmed`, and `last` was set by a value on the current `conn` or re-confirmed by a proof while `last.own` | SR20 |
| I9 | A state `value` event is admitted only when `st = Live` and `slotConn = conn` | SR21 |
| I10 | At most one session per (actor, operation, key) is not `Released`, except for the `ReleaseOverdue` overlap | SR17 |
| I11 | No item of a `Releasing` or `Released` session is admitted | SR33 |
| I12 | Between two connections that stayed registered for `resetAfter`, the number of `connect` calls ≤ the schedule's length + 1 | SR14 |
| I13 | Within a session, no defined position is emitted downstream twice | SR12 |
| I14 | `progress` changes only through 3.5's first cell; each ending's mapper reads its own Attempt's `prog` | SR29 |
| I15 | r fresh ⇒ for every covering s: `st = Live`, `answer ≠ pending`, and every start or `settle(lost)` of s after `readStart[r]` was proven | SR25 |
| I16 | In `Dropped`, a state value never sets row `value`, never sets `own`, and is never delivered | SR21, FC54 |
| I17 | A proof sets `confirmed` only when `last.own` | SR20, FC53, S6 Q17 |
| I18 | `CatchingUp` reaches `Live` only by `next = none`, by `CannotRepair` without `continueAt` (after `settle(lost)`), or by a reset (after `missed Reset`); a buffered value is emitted only by `complete()` | SR10, FC42 |
| I19 | A page failure `while` accepts never closes the connection while `pageSched` has steps left | FC23 |
| I20 | Per connection, at most one start is emitted before its first value, and the implicit one only when `¬signalled` | SR8, FC64 |
| I21 | No page value or buffered value is emitted after its connection dropped or failed | SR10, FC43 |
| I22 | Liveness: if pages eventually succeed or say `CannotRepair`, and the connection stays up, `CatchingUp` reaches `Live` | SR10 |
| I23 | With the model's server log, the fact positions admitted, cut at every admitted `missed`, are contiguous in the log within each cut; a `pending` or proven start never covers a hole | SR5, SR9, FC22, FC51 |
| I24 | State: whenever row `value` is defined, `value` is mapped and it differs from `heard`, a value delivery is queued with `slot = value` | SR21, RV1 H2 |

**Mutants** (each must be killed): a fact before its `missed` (FC4, FC55; I1); the budget reset on the first value
(FC41; I12); `liveSince` not cleared at connect (RV1 M3; I12); a value before live read as proven (FC64; I1); a status
evicted on overflow, or a group emitting `down` before `live` whatever the order (FC26, MDL F5; I1, I8); a state
delivery admitted after a drop (FC20, FC54; I9); a value after `down` making `value` current (FC54; I16); equality on
facts (FC1, FC25; I3); a catch-up started before live (FC51; I23); a catch-up completing on an empty page or a stream end
(FC42; I18); a page failure dropping the socket at once (FC23; I19); a restart before the scope closed (FC33; I10);
`last` = the highest position seen (FC22; I4); a proof re-confirming a restored or cached `last` (FC78; I17); the
buffer emitted on abandonment (RV1 H1; I21, I23); `signalled` not set by the implicit live (MDL F7; I20); dedupe only at
completion (MDL F6; I13); a re-confirm not offered to the machine (RV1 H2; I24); the slot kept when a newer value
equals `heard` (MDL F2; I24); `listen` staleness withdrawn on an unproven or pending start (FC19, FC47; I15); progress
written by a superseded Attempt (FC30; I14); `fresh` emitted on a reconnect (RV2 H1; I1).

**Model scope.** Inputs: 3.1's sixteen, 3.4's fourteen, 3.3's six, page results (`more`, `empty with next`, `last`,
`CannotRepair` with and without `continueAt`, retryable and terminal failures), clock ticks for `resetAfter`, the
reconnect and page delays (schedules of length 2 suffice for I12, I19), 3.5's four and 3.6's six. Sequences up to about
10 inputs cover drop, repair, drop again, and repair settled lost.

## 4. Product cases, end to end

Each case starts at the browser API or SDK. Marks as in the header; a word marked once per case is not marked again.
Service bodies that are pure decoding (`decodeFrame`) are named, not shown.

### 4.1 Chat with catch-up (common live path; uncommon repair)

**Source.** A WebSocket through `effect/socket`. By protocol the server's first frame is its registration: either
`{ t: "hello", replayedFrom? }` (it registered the room and, if it could, replayed from the `after` it echoes) or
`{ t: "reset", epoch }`; it pings every 20 s; close 4401 means the token expired. A paged HTTP history read whose
pages say `complete`, and `truncated` (with `oldest`) when retention no longer reaches `after`; a post transaction.

```ts
// chat.contracts.ts
export const Cursor = Schema.Struct({ epoch: Schema.Int, seq: Schema.Int })                  // user-defined
export class ChatDropped extends Schema.TaggedError<ChatDropped>()("ChatDropped", { why: Schema.String }) {}   // user-defined: transient
export class SignedOut extends Schema.TaggedError<SignedOut>()("SignedOut", {}) {}            // user-defined: terminal
const same = (a?: Cursor, b?: Cursor) => a?.epoch === b?.epoch && a?.seq === b?.seq        // user-defined

export class ChatSocket extends Context.Service<ChatSocket, {                                  // Effect: Context.Service; user-defined: ChatSocket
  readonly room: (roomId: string, from: Cursor | undefined) =>
    Stream.Stream<Message | Feed.Signal<never, Cursor>, ChatDropped | SignedOut, Socket.WebSocketConstructor>
}>()("app/ChatSocket") {}

export const ChatSocketLive = Layer.succeed(ChatSocket)({                                      // needs WebSocketConstructor: the app provides the global one, a Story a fake (SR34)
  room: (roomId, from) => Stream.unwrap(Effect.gen(function* () {
    const socket = yield* Socket.makeWebSocket(roomUrl(roomId, from), { highWaterMark: 1_048_576 })   // Effect: bounded browser buffer (SR18, FC49); user-defined: roomUrl
    const pull = yield* Socket.readerString(socket)                                           // Effect: one pull per batch of frames
    const batch = yield* pull.pipe(Effect.timeoutOrElse({ duration: "10 seconds", orElse: () => Effect.fail(new ChatDropped({ why: "NoHello" })) }))   // a deadline on registration
    const first = yield* decodeFrame(batch[0])                                                // user-defined: text → ServerFrame
    if (first.t !== "hello" && first.t !== "reset") return yield* new ChatDropped({ why: "NoHello" })   // pings cannot hold the row in Connecting
    return Stream.fromIterable(batch).pipe(
      Stream.concat(Stream.fromEffectRepeat(pull).pipe(Stream.flatMap((xs) => Stream.fromIterable(xs)))),
      Stream.timeoutOrElse({ duration: "45 seconds", orElse: () => Stream.fail(new ChatDropped({ why: "Silent" })) }),   // Effect: idle deadline on every frame (FC81, FC37)
      Stream.mapEffect(decodeFrame),
      Stream.flatMap((f) => Stream.fromIterable<Message | Feed.Signal<never, Cursor>>(
        f.t === "hello" ? [f.replayedFrom && same(f.replayedFrom, from)
            ? Feed.live({ proof: `server replayed from ${f.replayedFrom.epoch}:${f.replayedFrom.seq}` })   // NEW: Feed.live, proof — only on the server's echo of this from
            : Feed.live()]                                                                    // registered, nothing proven
        : f.t === "reset" ? [Feed.live({ lost: "server log reset", restartAt: { epoch: f.epoch, seq: 0 } })]   // NEW: lost, restartAt (rare)
        : f.t === "msg" ? [f.message] : [])))                                                // pings decode to nothing
  })).pipe(Stream.mapError((e) => e._tag === "ChatDropped" ? e
    : e.reason._tag === "SocketCloseError" && e.reason.code === 4401 ? new SignedOut() : new ChatDropped({ why: e.reason._tag }))),   // classification is the adapter's (SR15, FC9)
})

export const Chat = {
  messages: stream({                                                                          // existing: stream
    id: "Chat.messages",
    input: { roomId: Schema.String, after: Schema.optional(Cursor) },                         // existing: input; after outside key (K2)
    output: Message,
    key: ["roomId"],
    delivers: "facts",                                                                        // accepted: delivers
    subscribe: ({ roomId, after }) => Stream.unwrap(Effect.map(ChatSocket, (chat) =>         // Effect: a Service is an Effect
      Feed.reconnect((from) => chat.room(roomId, from), {                                     // NEW: Feed.reconnect
        from: after,                                                                          // NEW: from
        position: (m) => m.cursor,                                                            // NEW: position
        while: (e) => e._tag === "ChatDropped",                                               // Effect.retry's while
        schedule: Schedule.exponential("500 millis").pipe(Schedule.jittered, Schedule.upTo({ times: 8 })),   // Effect: budget, restored after resetAfter
        catchUp: (cursor) => fetchPage(roomId, cursor).pipe(                                  // NEW (uncommon): catchUp, Stream.paginate's step; user-defined: fetchPage (GET ?after=)
          Effect.mapError(() => new ChatDropped({ why: "History" })),                         // retried with the socket open (FC23)
          Effect.flatMap((p) => p.truncated                                                    // the server says its history no longer reaches `after`
            ? Effect.fail(new Feed.CannotRepair({ reason: `history starts at ${p.oldest.epoch}:${p.oldest.seq}`, continueAt: p.oldest }))   // NEW (Q19): missed Lost, then the rest
            : Effect.succeed([p.messages, p.complete ? Option.none() : Option.some(p.next)] as const))),   // the server's own completeness, never "a short page" (FC42)
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
  FeedEnded: {}, SignedOut: {}, Reopen: {}, Healthy: {},
  Posted: { clientId: Schema.String }, PostFailed: { clientId: Schema.String }, PostUnsure: Flow.uncertain({ clientId: Schema.String }),
},
operations: ({ E }) => ({
  history: Chat.history.outcomes({ success: E.Loaded.from((p) => ({ messages: p.messages })), failure: { HistoryFailed: E.LoadFailed, Defect: E.LoadFailed, Interrupted: E.LoadFailed } }),
  messages: Chat.messages.outcomes({
    value: E.Message.from((message) => ({ message })),                                        // existing: value
    missed: E.MayHaveMissed.from((m) => ({ why: m.why, restartAt: m.restartAt })),           // NEW: missed (type-required here)
    failure: { SignedOut: E.SignedOut, ChatDropped: E.FeedEnded, Closed: E.FeedEnded, Overflow: E.FeedEnded, Defect: E.FeedEnded, Interrupted: E.FeedEnded },   // NEW: Closed, Overflow (RV2 M1)
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
    schedules: { healthy: { schedule: "1 minute", send: E.Healthy } },                       // the machine's backoff resets only after a healthy minute (RV1 M9)
    on: {
      Healthy: { target: "self", guard: [live], updateMemory: () => ({ reopenInMs: 1000 }) },
      Message: { target: "self", updateMemory: ({ memory, event }) => ({ messages: upsert(memory.messages, event.message), cursor: event.message.cursor }) },
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
   greets `hello` echoing that `after` → `Feed.live({ proof })` → `Live`, no `missed`; replayed messages follow, one
   turn each (SR4). A server that pings but never greets fails the 10-second deadline: a retried `ChatDropped`, never
   a row stuck in `Connecting`.
2. *Drop and replay.* `fake.drop(1006)` → `SocketCloseError 1006` → `ChatDropped` → `Feed.down` → row `Connecting`,
   `drop` set, banner "Reconnecting…", composer denied `Offline`. 500 ms later `connect(last)`; `hello` proves; the two
   messages sent meanwhile arrive in order (FC4). No machine transition (SR13).
3. *Quiet reconnect.* Same, no new messages: `hello` alone makes it `Live` (SR7, FC19).
4. *Flapping.* `fake.flap(20, { upFor: "1 second" })`: no connection is registered for `resetAfter`, so the schedule
   is not restored; after 8 drops the session fails `ChatDropped` → `FeedEnded` → RETRY_WAIT (FC41, FC73). The
   machine's `reopenInMs` doubles each time: a replayed message no longer resets it, only a registered minute does
   (RV1 M9); a reload keeps it and its deadline (FC77).
5. *Repair.* The server cannot replay (`hello` without `replayedFrom`, so the adapter sends `Feed.live()`):
   `Feed.reconnect` tells Flow the start is **pending** (row `Live`, Inspection *pending*, a `listen` list stays
   stale), starts `catchUp(last)` after registration (FC51) and buffers live messages. `fake.fail("history", 503)`
   retries the page **with the socket open** (FC23); `page1` with a `next` is emitted and page 2 requested; a short or
   empty page with a `next` reads on; `page2` with `complete` settles the start **proven** (FC42); buffered messages a
   page returned are dropped by position, and so are the socket's next ones until the first new one (I13). If the
   socket drops mid-repair, the buffer is discarded, never emitted, so `last` stays before the hole and the next
   connection repairs again (FC22, RV1 H1).
6. *Retention.* `fake.retain(100)`: the history no longer reaches `after`. The step fails `Feed.CannotRepair` with
   `continueAt` = the oldest kept message: the start settles **lost**, `MayHaveMissed { Lost }` is admitted, then the
   kept history and the buffer follow. No drop and no budget spent (RV2 H2).
7. *Reload mid-repair.* The tab reloads during step 5's read. Restored memory has `cursor` = the last message handled;
   LIVE opens a new session from it; the same catch-up runs again (FC45, SR31). Nothing waits in a "catching up" state.
8. *Server reset.* `fake.resetLog(9)` → `reset` → `Feed.live({ lost, restartAt })` → `missed Reset`; the handler shows
   the notice and stores `restartAt`; `Feed.reconnect` already resumes from `{ 9, 0 }`, so a quiet reconnect asks from
   the new space (FC46, SR11). Old `{8, 1}` and new `{9, 1}` have different ids and are both kept (FC24).
9. *Token expiry.* `fake.drop(4401)` → `SignedOut`, not in `while` → session `Ended` → `SIGNED_OUT` (FC9, SR15).

**Story** (proposed spelling):

```ts
const chatStory = story.machine(ChatRoom, { id: "Chat/replay-then-reset", input: { roomId: "r1" }, fixtures: [FakeChatServer({ history: seed })] })   // user-defined: FakeChatServer replaces WebSocketConstructor and the history service
  .process()
  .checkpoint("live", ({ snapshot, evidence }) => snapshot.operations.messages?.connection === "Live" && evidence.feed.at(-1)?.proof === "server replayed from 8:41")
  .do(({ fake }) => [fake.withhold("replay"), fake.drop(1006)]).advance("500 millis").process()   // hello without replay: catch-up
  .do(({ fake }) => [fake.fail("history", 503), fake.answer("history", page1, { next: true }), fake.answer("history", page2)]).advance("2 seconds").process()
  .checkpoint("caught-up", ({ evidence }) => evidence.feed.some((e) => e.answer === "proven" && e.basis.startsWith("catch-up")) && evidence.feed.filter((e) => e.drop).length === 1)   // one drop: the 503 kept the socket
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
    subscribe: ({ roomId }) => Stream.unwrap(Effect.map(PresenceSocket, (ps) =>
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
    subscribe: ({ symbol }) => Stream.unwrap(Effect.map(MarketFeed, (mf) =>
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
    failure: { MarketDropped: E.QuoteEnded.from((_e, { key }) => key), Closed: E.QuoteEnded.from((_e, { key }) => key), Overflow: E.QuoteEnded.from((_e, { key }) => key), Defect: E.QuoteEnded.from((_e, { key }) => key), Interrupted: E.QuoteEnded.from((_e, { key }) => key) },
  }),
}),
// watch.machine.ts
WATCHING: {
  activities: [O.quotes.subscribe.each(({ memory }) => memory.watchlist.filter((s) => !memory.ended.includes(s)).map((symbol) => ({ symbol })))],   // existing: subscribe.each
  on: {
    SetAlert: { target: "self", updateMemory: ({ memory, event }) => ({ alerts: { ...memory.alerts, [event.symbol]: event.above } }) },
    Quoted: [
      { target: "self", guard: ({ memory, event }) => event.price > (memory.alerts[event.symbol] ?? Infinity) || deny("BelowAlert"),
        updateMemory: ({ memory, event }) => ({ fired: [...memory.fired, event.symbol], alerts: omit(memory.alerts, event.symbol) }) },
      { target: "self" },
    ],
    QuoteEnded: { target: "self", updateMemory: ({ memory, event }) => ({ ended: [...memory.ended, event.symbol] }) },   // the user's watchlist is kept; the view shows the symbol "ended" (RV1 M10)
    RetryQuote: { target: "self", updateMemory: ({ memory, event }) => ({ ended: memory.ended.filter((s) => s !== event.symbol) }) },   // the key returns: a new session
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
from before a drop is discarded at admission (SR21). Page wake: the 25 s deadline runs on `setTimeout`, which many
browsers do not advance during system sleep, so the price dims at most one deadline after wake; racing the deadline
with `visibilitychange` in the service shortens that (FC56, FC81: met within the deadline; RV1 M8). `subscribe.each`
has no cap of its own: each key is a session (and a `Feed.reconnect`), so the watchlist's own bound is the cap (stated).

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
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) progress({ sent: e.loaded, total: e.total }) }   // plain callback, no runtime wiring (FC58)
      xhr.onload = () => resume(xhr.status === 201 ? Effect.succeed(JSON.parse(xhr.responseText)) : xhr.status === 413 ? Outcome.failure(new TooLarge()) : Outcome.unknown(new UploadLost({ status: xhr.status })))
      xhr.onerror = xhr.ontimeout = () => resume(Outcome.unknown(new UploadLost({ status: 0 })))
      xhr.onabort = () => resume(Outcome.unknown(new UploadLost({ status: -1 })))           // the callback always resumes (RV2 s4)
      signal.addEventListener("abort", () => xhr.abort())
      xhr.open("PUT", `/uploads/${ref}`); xhr.setRequestHeader("Idempotency-Key", attempt.id); xhr.send(file)
    }).pipe(Effect.timeoutOrElse({ duration: "10 minutes", orElse: () => Outcome.unknown(new UploadLost({ status: -2 })) })),   // a half-open upload ends unknown (RV2 L2)
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
    subscribe: ({ queueId }) => Stream.unwrap(Effect.map(Supabase, (sb) =>
      Feed.reconnect(() => Feed.callback((emit) => Effect.gen(function* () {                 // NEW: Feed.callback (uncommon)
        const ch = sb.channel(`queue:${queueId}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "tickets", filter: `queue_id=eq.${queueId}` }, (p) => emit(toChange(p)))   // user-defined: toChange
          .subscribe((status) => {
            if (status === "SUBSCRIBED") emit(Feed.live())                                    // registered; no replay, so unproven
            else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") emit.fail(new ChannelDown({ status }))
            else if (status === "CLOSED") emit.fail(new ChannelDown({ status }))
          })
        const off = sb.auth.onAuthStateChange((e) => { if (e === "SIGNED_OUT") emit.fail(new SignedOut()) })
        yield* Effect.addFinalizer(() => Effect.promise(async () => { off.data.subscription.unsubscribe(); await sb.removeChannel(ch) })
          .pipe(Effect.timeout("3 seconds"), Effect.ignore))                                  // awaited before a new session (SR17, FC33), bounded under RT O6's 5 s (RV2 M6)
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
  changes: TicketsDomain.changes.outcomes({ failure: { ChannelDown: E.PushEnded, SignedOut: E.SignedOut, Closed: E.PushEnded, Overflow: E.PushEnded, Defect: E.PushEnded, Interrupted: E.PushEnded } }),   // required (SR26)
}),
// queue.machine.ts
QUEUE: {
  activities: [O.changes.subscribe(({ memory }) => ({ queueId: memory.queueId }))],
  on: { PushEnded: S.QUEUE_RETRY },                                                            // pushes cannot stop silently
},
QUEUE_RETRY: { schedules: { again: { schedule: "5 seconds", send: E.Reopen } }, on: { Reopen: S.QUEUE } },
```

Recipe P: the channel is per session, the SDK's socket is shared, and `Feed.reconnect` owns rejoining. Walk: the first
connection has no position, so it is `fresh` (no `missed`; covered answers are still lowered, FC13); a change before
`SUBSCRIBED` is the implicit start, then `SUBSCRIBED` is an unproven re-registration: covered answers are lowered twice, and the domain's "one repair in flight and one trailing" makes that at most two
reads (FC55, FC68 cost). A drop: answers stale; the rejoin's `SUBSCRIBED` is unproven, so subscribed lists refetch and a
ticket deleted meanwhile leaves the list, quiet or not (SR25, FC5, FC19). Opening settings releases the session: the
list is stale (`feedEnded`) and refetches on return, once (FC48, FC69 cost). Leaving and re-entering fast waits for
`removeChannel` (FC33). Sign-out is a terminal failure, not a reconnect.

### 4.7 SDKs by recipe, and two more sources (uncommon)

Recipe P or S (2.4) per source; neither needs a Flow concept of its own (DG3).

**Supabase** (recipe P per channel): 4.6.

**Socket.IO** (recipe S). Recovery state lives on the client Socket across its own reconnects, so the SDK's retry stays
on and `recovered` becomes the proof (PA2 s2; RV2 H3). It needs no `from`: the evidence covers the span since the last
event this Socket received, which is the last value the session's stream delivered.

```ts
subscribe: ({ room }) => Stream.unwrap(Effect.map(Sio, (io) =>                               // user-defined: Sio, an app-level client service
  Feed.reconnect(() => Feed.callback((emit) => Effect.gen(function* () {
    const s = io.socket(room)                                                                 // user-defined: one Socket for this room, reconnectionAttempts: 8
    s.on("connect", () => emit(s.recovered ? Feed.live({ proof: "socket.io recovered" }) : Feed.live()))   // decided: proof
    s.on("disconnect", (why) => why === "io server disconnect" ? emit.fail(new Rejected({ why })) : emit(Feed.down({ why })))
    s.io.on("reconnect_failed", () => emit.fail(new SioDropped()))                            // the SDK's budget is the budget (S5 Q3)
    s.on("chat", (m) => emit(toMsg(m)))
    yield* Effect.addFinalizer(() => Effect.sync(() => s.disconnect()))
  })), { while: (e) => e._tag === "SioDropped", schedule: Schedule.spaced("30 seconds").pipe(Schedule.upTo({ times: 3 })) }))),
```

The first `connect` is the session's first connection with no position: `fresh`, not `missed` (RV2 H1).

**Ably** (recipe S). A channel's `attached` with `resumed: true` is the proof; `update` with `resumed: false` while
attached is an unseen loss (PA1 s1). Whether a transparent resume emits any channel event is unconfirmed (RV2 s8): if it
emits none, the row stays `Connecting` after a quiet resume, which fails closed. History is `untilAttach`, newest first
and retained for 2 minutes to 72 hours, so it cannot always reach `from`: that is `Feed.CannotRepair` (Q19).

```ts
Feed.reconnect(() => Feed.callback((emit) => Effect.gen(function* () {
  const ch = ably.channels.get(name)                                                          // user-defined: ably, one Realtime client service
  ably.connection.on(["disconnected", "suspended"], (c) => emit(Feed.down({ state: c.current })))
  ch.on("attached", (c) => emit(c.resumed ? Feed.live({ proof: "ably resumed" }) : Feed.live()))
  ch.on("update", (c) => { if (!c.resumed) emit(Feed.live()) })                              // continuity lost while attached
  ch.on("failed", (c) => emit.fail(new AblyDown({ reason: c.reason?.message })))
  yield* Effect.promise(() => ch.subscribe((m) => emit(toMsg(m))))
  yield* Effect.addFinalizer(() => Effect.promise(() => ch.detach()).pipe(Effect.timeout("3 seconds"), Effect.ignore))
})), { position: (m) => m.serial, catchUp: ablyHistory(ch), while: (e) => e._tag === "AblyDown", schedule })   // user-defined: ablyHistory pages untilAttach and fails Feed.CannotRepair past retention
```

**Firestore `onSnapshot`** (recipe S; a state feed). With `includeMetadataChanges: true`, a cached snapshot is
announced as "not connected" and still forwarded, so the view shows it dimmed with the drop's age (3.1; FC54, FC67);
the next server snapshot, even of equal data, is announced live and confirms. (From memory: `snapshot.metadata.
fromCache`; PA2 s1 confirms that a first snapshot may come from the cache.) A local write fires the listener at once
with `hasPendingWrites`; the row then calls an optimistic local echo current, the one place `value` is not
server-confirmed (stated, RV2 s10). A query is a state feed of the whole snapshot, not `docChanges()` facts.

```ts
export const Docs = {
  doc: stream({
    id: "Docs.doc", input: { docId: Schema.String }, output: Doc, key: ["docId"], delivers: "state",
    subscribe: ({ docId }) => Stream.unwrap(Effect.map(Firestore, (fs) =>
      Feed.reconnect(() => Feed.callback((emit) => Effect.gen(function* () {
        let cached = false
        const off = onSnapshot(doc(fs, "docs", docId), { includeMetadataChanges: true }, (snap) => {
            if (snap.metadata.fromCache) { cached = true; emit(Feed.down(new ServedFromCache())) }   // NEW: Feed.down; the cache that follows is last-known only
            else if (cached) { cached = false; emit(Feed.live()) }                            // the server is back: its snapshot is current again
            emit(toDoc(snap))
          },
          (err) => emit.fail(err.code === "permission-denied" ? new NoAccess() : new ListenError({ code: err.code })))   // a listener error is terminal for the SDK (PA2 s1)
        yield* Effect.addFinalizer(() => Effect.sync(off))
      })), { while: (e) => e._tag === "ListenError", schedule: Schedule.exponential("2 seconds").pipe(Schedule.upTo({ times: 6 })) }))),
  }),
}
```

**Electric** (recipe S; a state feed of materialised rows). `up-to-date` means "all the data the server was aware of"
(PA1 s2): a state proof that re-confirms this session's rows after a drop, and the only heartbeat, so the adapter puts
its idle deadline on it. `must-refetch` is handled by the client and arrives as a new full value. As a fact feed into
`listen` it would need a "replace the covered set" operation `listen` does not have (RV2 M8), so it is not offered.

```ts
Feed.reconnect(() => Feed.callback((emit) => Effect.gen(function* () {
  const ctl = new AbortController()
  const stream = new ShapeStream({ url, params: { table: "tickets", where }, signal: ctl.signal })   // user-defined params
  stream.subscribe((msgs) => { if (msgs.some((m) => m.headers?.control === "up-to-date")) emit(Feed.live({ proof: "electric up-to-date" })) }, (e) => emit.fail(new ElectricDown({ e })))
  new Shape(stream).subscribe(({ rows }) => emit(rows))                                      // emit's promise lets an awaiting SDK wait (Q20)
  yield* Effect.addFinalizer(() => Effect.sync(() => ctl.abort()))
})), { while: (e) => e._tag === "ElectricDown", schedule })
```

**graphql-ws** (recipe P: lazy client, `retryAttempts: 0`, `keepAlive: 10_000`, `connectionAckWaitTimeout: 5_000`). The
protocol acknowledges the connection, never a subscription (PA2 s3), so the honest registration is the first `next`
(implicit live): a quiet subscription stays `Connecting` (FC66, cost). A server whose first `next` is
`{ __typename: "Subscribed", replayedFrom }` turns it into a proof. Close codes are classified: 4401/4403 and GraphQL
errors are terminal, other closes transient (RV2 s6).

```ts
subscribe: ({ boardId, after }) => Stream.unwrap(Effect.map(Gql, (gql) =>
  Feed.reconnect((from) => Stream.fromAsyncIterable(gql.client.iterate({ query: BoardEvents, variables: { boardId, after: from } }), classifyGql).pipe(   // user-defined: classifyGql
    Stream.map((r) => r.data!.boardEvents),
    Stream.map((ev) => ev.__typename === "Subscribed"
      ? (ev.replayedFrom === from ? Feed.live({ proof: `server replayed from ${from}` }) : Feed.live()) : ev)),
  { from: after, position: (ev) => ev.cursor, while: (e) => e._tag === "GqlDropped", schedule: Schedule.exponential("1 second").pipe(Schedule.upTo({ times: 5 })) }))),
```

**SSE** (recipe P; dense ids, no greeting, no read endpoint). `EventSource` resends `Last-Event-ID` itself and cannot
be given another (FC35), so the adapter closes it on the first error and lets `Feed.reconnect` re-open with `?after=`;
the contiguity recipe (2.3) proves continuity from the first id. `EventSource` hides the status, so a 401 looks like a
blip (FC9 for SSE): authenticated SSE uses a `fetch` body with an SSE line parser (4.4's shape) or a `fetch` pre-flight
that classifies (RV1 L4, RV2 L3).

```ts
subscribe: ({ userId, after }) => Feed.reconnect((from) => Feed.callback((emit) => Effect.gen(function* () {
  const es = new EventSource(`/notes/stream?user=${userId}${from !== undefined ? `&after=${from}` : ""}`)
  let decided = false
  es.onmessage = (m) => {
    const note = { ...JSON.parse(m.data), id: Number(m.lastEventId) }                        // the app's assumption: integer ids
    if (!decided) { decided = true; emit(from !== undefined && note.id === from + 1 ? Feed.live({ proof: `ids contiguous after ${from}` }) : Feed.live()) }
    emit(note)
  }
  es.onerror = () => emit.fail(new SseDropped())
  yield* Effect.addFinalizer(() => Effect.sync(() => es.close()))
})), { from: after, position: (n) => n.id, while: (e) => e._tag === "SseDropped", schedule: Schedule.exponential("1 second").pipe(Schedule.upTo({ times: 8 })) }),
```

With `from` undefined the first start is `fresh`. A gap in ids is an unproven start, so the machine's `missed` handler
shows "some notes may be missing"; nothing can resolve it but acceptance (FC52). Costs: a quiet reconnect stays
`Connecting` until the first note (FC66's shape); sparse ids stay unproven every time (FC74).

**Polling with a cursor** (recipe P; DD's `technicianUpdates`). Each connection is a loop of GETs from the cursor; a
failed GET is a typed drop, not a defect, and the resume position survives (FC72):

```ts
subscribe: ({ ticketId, after }) => Stream.unwrap(Effect.map(TicketApi, (api) =>
  Feed.reconnect((from) => Stream.paginate(from ?? "0", (cursor) => api.progress(ticketId, cursor).pipe(   // Effect: Stream.paginate flattens each batch
      Effect.mapError(() => new PollFailed()),
      Effect.map((b) => [b.events.map((e, i) => ({ ...e, cursor: i === b.events.length - 1 ? b.cursor : undefined })), Option.some(b.cursor)] as const),
      Effect.delay("1 second"))).pipe(
    Stream.prepend([Feed.live({ proof: `the poll returns every event after ${from ?? "0"}` })])),   // the server's contract is the basis
  { from: after, position: (e) => e.cursor, while: (e) => e._tag === "PollFailed", schedule: Schedule.spaced("5 seconds").pipe(Schedule.upTo({ times: 12 })) }))),
```

`position` is `undefined` for events inside a batch, so a resume replays the batch's earlier events, which the consumer
stores by id (at least once); `undefined` positions never match a dedupe (3.4). The source is pulled, so it waits at the
bound and loses nothing (SR18).

**Liveness for SDKs** (RV2 M4). An idle deadline needs an in-band heartbeat the adapter can see: a WebSocket ping frame
(4.1), Electric's `up-to-date`, a graphql-ws `keepAlive` pong watched through the client's `on("pong")` hook and
emitted as nothing but a deadline reset (adapter code). Phoenix needs the client to send heartbeats
(`heartbeatIntervalMs`). A deadline that races `visibilitychange` (an adapter recipe) shortens the wake window below the
deadline (RV1 M8).

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
the state feed (`presence_diff` leaves). Decided (Q8): out of scope; a first-class word is open-items 16.

## 5. Traceability

Status: **met**, **cost** (met, with a stated price), **limit** (partly met; the gap is stated), **out** (out of scope,
with the reason).

### 5.1 Requirements

| SR | How | Where | Status |
| --- | --- | --- | --- |
| SR1 | `delivers` on the contract; one pump per kind; a fact feed must be mapped or `listen`ed, so no consumer skips | 2.2, 2.7, 3.2 | met |
| SR2 | facts: no equality, no coalescing, no baseline after restore or hydration | 3.2, 2.10, I3 | met |
| SR3 | state: one slot, one waiting delivery, equality against `heard`, row once per publication | 2.6, 3.2 | met |
| SR4 | one fact per turn, next pulled after commit, FIFO with user sends | 3.2 | met |
| SR5 | every start not proven, fresh or pending, every repair settled lost, and a drop's first value deliver `missed` before later facts | 3.1, I1, I23 | met |
| SR6 | `proof` is a required basis string covering the span since the last delivered value; Flow's own `fresh` and catch-up bases are fixed | 2.3, 2.12 | met |
| SR7 | live only on `Feed.live` (or a plain Stream's first value); quiet but registered stays live; a deadline on registration (4.1); first-value path stated | 3.1, 4.1, 4.7 | cost (FC66) |
| SR8 | 3.1–3.6 list every variable and cell; MDL reached every defined cell | 3, I2 | met |
| SR9 | `last` in session; memory written by fact turns across sessions; abandoned repairs emit nothing | 2.7, 3.4, I4, I5, I21, I23 | met |
| SR10 | a pending start settles proven (completion) or lost (`Feed.CannotRepair`), or is abandoned and repaired again; the handled `missed` is the acceptance | 2.3, 3.4, I18, I21, I22 | met |
| SR11 | `restartAt`; `Feed.reconnect` resumes in the new space; positions keep their epoch | 2.7, 4.1 | met in session; across sessions the handler stores it (rare) |
| SR12 | at least once by identity; a bounded dedupe ring by `Equal.equals`, `undefined` never equal; no position ordering | 2.7, 3.4, I13 | met (identity-less facts need a position, RV1 L5) |
| SR13 | the adapter reconnects inside a session; the machine re-opens an ended one | 2.4, 4.1 | met |
| SR14 | schedule is the budget; restored only after `resetAfter` registered on that connection; a reload starts a fresh budget | 2.3, 3.4, I12 | met |
| SR15 | `while` and typed reasons; `drop` and `failure` on the row | 2.3, 2.6 | met |
| SR16 | completion is `Closed` (a drop inside `Feed.reconnect`, an ending outside); commits use `timeoutOrElse` → unknown | 2.3, 2.9 | met |
| SR17 | release before restart, 5 s bound, finalizers raced at 3 s in the recipes | 2.5, I10 | met (stated overlap past the bound) |
| SR18 | pulled sources wait; `Feed.callback` bound and `emit`'s promise; groups O(1); `buf` and `ring` ≤ `bufferSize`; evidence ring 256 | 2.3, 3.3, 3.4, I7 | met; limit for a hand-written `Stream.callback` (FC34) |
| SR19 | ≤ 1 item per session in the mailbox, outside the cap | 3.2, I7 | met |
| SR20 | `value` only from the current connection or a proof of this session's `last`; a value after `down` is `last` only, aged from the drop | 2.6, 3.1, I8, I16, I17 | met |
| SR21 | `reconcile` offers every current value; admission only when live on its connection; nothing after `down` reaches the machine | 3.1, 3.2, I9, I16, I24 | met |
| SR22 | `connection` on every phase; `drop`, `failure` | 2.6 | met |
| SR23 | adapter idle deadline on Clock; source timestamps for quiet staleness; the wake window is one deadline | 4.3, 4.7 | met within the deadline |
| SR24 | pushes at arrival, no record queue, no `uncertain` clearing | 2.8 | met |
| SR25 | 3.6's coverage table, including the first and the pending start | 2.8, 3.6, I15 | met |
| SR26 | the domain handles `missed`; `failure` required; facts only | 2.7, 2.8 | met |
| SR27 | M6-D6 as accepted | 2.8 | met |
| SR28 | out of scope with a workaround that meets every clause | 4.8 | out |
| SR29 | 3.5: the setter acts only for the addressable unended Attempt; no turn | 2.9, 3.5, I14 | met |
| SR30 | OD5/OD7 Stop; cut or stall unknown; never persisted; XHR without bridging | 2.9, 4.4, 4.5 | met |
| SR31 | per-kind table; second tab; handover | 2.10 | met |
| SR32 | settling ignores streams; state `last` transferred as last known; baseline; facts transfer none | 2.10 | met |
| SR33 | activation-owned; lifecycle table; discard with evidence | 2.5 | met |
| SR34 | fakes replace transports; adapters on Clock | 2.11 | met; limit for wall-clock adapters (FC38) |
| SR35 | the controls table; `resumedFrom`; evidence; playback frames | 2.11, 4.1 | met (spelling pending M3) |
| SR36 | `FeedUnhandled` (incl. unmapped fact feeds), `ListenNeedsFacts`, `DuplicateSession` (overlap only), `DuplicateListen` | 2.12 | met |
| SR37 | explain line; Inspection answers with basis, phase, bounded retention | 2.12 | met |
| SR38 | one runtime; the combinators' phases and answers reach Inspection and Playback | 2.3, 2.12, 3.4 | met |
| SR39 | one session per key; two actors two sessions; two operations two sessions + warning; SSE limit stated | 2.5 | met; limit (FC18) |
| SR40 | the first example is correct by default; FC64 visible as `UnprovenValues`; FC65 needs a basis | 2.3, 2.12 | met (agent trial not run) |

### 5.2 Failure cases

| FC | How the design answers it | Where | Status |
| --- | --- | --- | --- |
| FC1 | no equality on facts | R-Kind, 3.2 | met |
| FC2 | facts never coalesce | 3.2 | met |
| FC3 | the kind is the contract's; a fact feed cannot be unmapped (Q22) | 2.2, 2.7 | met |
| FC4 | `Feed.reconnect` resumes from `last`; replay or `missed` | 3.4, 4.1 | met |
| FC5 | listen lowers answers on an unproven start, a stream event | 2.8 | met |
| FC6 | the row's `connection`, `drop`, `failure` | 2.6 | met |
| FC7 | one session per key; two operations are two defined sessions | 2.5 | met |
| FC8 | resume via `input` + `Feed.reconnect`; row after restart defined | 2.2, 2.5 | met (download `Range` out, brief 8) |
| FC9 | adapter classifies 4401 as terminal | 4.1 | met |
| FC10 | memory advances only in handled fact turns; unhandled facts are re-requested | 2.7 | met where the server replays; a no-replay source gives `missed` |
| FC11 | facts pulled per turn; state coalesced; tokens are write progress; bounded buffers | 3.2, 3.3, 2.9 | met |
| FC12 | `progress` on the write lane | 2.9 | met |
| FC13 | listen: every start, `fresh` included, lowers earlier answers; chat: subscribe after the page's cursor | 2.8, 3.6, 4.1 | met |
| FC14 | identity storage; versions in domains; EDP's unversioned-listen warning | 2.7 | met |
| FC15 | `last.at` as wall-clock epoch ms, transferred as an age | 2.6, 2.10 | met |
| FC16 | Story controls | 2.11 | met |
| FC17 | `flow check` and Inspection | 2.12 | met |
| FC18 | SSE connection limit stated; no shared session (decided, Q9; open-items 17) | 2.5 | limit |
| FC19 | registration signal makes a quiet reconnect live; listen repaired at it | 3.1, 2.8 | met (plain streams: FC66 cost) |
| FC20 | `value` undefined until confirmed | 2.6 | met |
| FC21 | a silent reopen is unproven; a snapshot is not a proof (proof needs a basis) | 3.1, 2.3 | met |
| FC22 | `last` = last emitted; memory = last handled; abandoned repairs emit nothing | 2.7, 3.4, I4, I5, I21 | met |
| FC23 | a failed page is retried with the socket open; only an exhausted page schedule drops it | 3.4, I19 | met |
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
| FC35 | close `EventSource` on error, `?after=` via `Feed.reconnect`; the contiguity recipe proves dense ids | 2.3, 4.7 | met (sparse ids: FC74) |
| FC36 | `resetAfter` | 3.4 | met |
| FC37 | completion is never success; `timeoutOrElse` | 2.3, 4.4 | met |
| FC38 | adapters on Clock; a wall-clock adapter stalls its Story | 2.11 | limit |
| FC39 | Stop releases; Ask admitted | 4.4 | met |
| FC40 | the row shows live regardless of equality; heartbeat; source-time recipe | 4.3 | met |
| FC41 | `resetAfter` from this connection's registration; the machine-level backoff resets after a healthy minute | 3.4, 2.7, 4.1 | met |
| FC42 | only `next = none` completes; two empty pages fail; `CannotRepair` for short histories | 2.3, 3.4, I18 | met (author's contract: none from the server's field) |
| FC43 | a repair is scoped to its connection; abandoned repairs emit nothing | 3.4, I21 | met |
| FC44 | no position ordering; `undefined` never equal | 2.7, 3.4 | met |
| FC45 | repair is in the adapter; a new session repeats it | 4.1 | met |
| FC46 | in-session resume from `restartAt` | 3.4 | met in session; across sessions the handler stores it |
| FC47 | live while live is an unseen reconnect; adapters prefer `Feed.reconnect` | 3.1, 4.6 | met |
| FC48 | released listen is stale | 2.8 | met |
| FC49 | `highWaterMark`; `Feed.callback`; signal groups O(1) | 3.3, 4.1 | met |
| FC50 | `connection` on every row; no `data` | 2.6 | met |
| FC51 | catch-up only after live | 3.4 | met (adapter must say live only on registration) |
| FC52 | acceptance via `missed` | 2.7 | met |
| FC53 | a state proof re-confirms this session's `last` and is reconciled with the machine | 2.3, 3.1, I17, I24 | met in session; after a reload or SSR a cost (S6 Q17) |
| FC54 | a value after `Feed.down` is `last` only, never `own`, aged from the drop | 3.1, 4.7, I16 | met |
| FC55 | a value before live is an unproven start | 3.1 | met |
| FC56 | the idle deadline fires at most one deadline after wake; `visibilitychange` recipe | 4.3, 4.7 | met within the deadline |
| FC57 | out of scope; the workaround clears, re-sends, does not restore, costs no turn | 4.8 | out |
| FC58 | synchronous `progress` | 2.9, 4.5 | met |
| FC59 | controls for greeting, hold, reorder, suspend | 2.11 | met |
| FC60 | no out-of-sync state; a notice in memory | 2.7 | met |
| FC61 | Effect socket closes are classified; `Closed` only from completion | 4.1, 2.3 | met |
| FC62 | snapshots are values; `RegistrationChurn` | 4.7, 2.12 | met |
| FC63 | the chat machine is 29 lines with post and history; the stream forces 6 of them and no algorithm (CMP: 77 lines in all) | 7 | met |
| FC64 | `Feed.reconnect` announces every connection; after `down` a value is `last` only or follows `missed`; `UnprovenValues` | 3.1, 3.4, I20 | met |
| FC65 | `proof` needs a basis covering the span; the samples prove only on the server's echo or the SDK's flag | 2.3, 4.1, 4.7 | met (visible, not prevented) |
| FC66 | first value as registration | 4.7 | cost |
| FC67 | cache is `down` | 4.7 | met |
| FC68 | two lowerings, at most two reads | 4.6 | cost |
| FC69 | one refetch on return | 4.6 | cost |
| FC70 | hold after Stop; reload unknown; possible double charge | 4.4 | cost |
| FC71 | a key per upload, `reject` | 4.5 | met |
| FC72 | typed drop, cursor kept | 4.7 | met |
| FC73 | RETRY_WAIT; each re-open may catch up | 2.7, 4.1 | cost |
| FC74 | dense ids: the contiguity recipe; sparse ids without a greeting: unproven | 4.7 | met (dense); cost (sparse) |
| FC75 | handover is a restore; ages rebased | 2.10 | met |
| FC76 | M6-D6, `DuplicateListen` | 2.8 | met (sharing: open-items 17) |
| FC77 | the delay in memory, a Duration schedule | 2.7 | met by the recipe |
| FC78 | transferred value is `last`, as an age; a client proof cannot re-confirm it | 2.10 | met |
| FC79 | label "Waiting for the server" once sent | 4.5 | met |
| FC80 | no terminator → unknown | 2.9, 4.4 | met |
| FC81 | idle deadline on every frame | 4.1, 4.3 | met within the deadline |

## 6. Amendments (proposed; none applied)

### 6.1 machine-design.md

| Where | Change |
| --- | --- |
| New rules 48–53 (after rule 47) | **48 Stream kinds** (2.2, 2.7's outcome table, 2.6's row); **49 The session** (3.1 normative: R-Live, R-Answer, Flow's `fresh` and `pending`); **50 Delivery** (3.2: facts one per turn, state reconciled and admitted only when live, `missed` first, outside the cap); **51 Ownership and release** (R-Owner, 2.5's table, release before restart); **52 Positions** (R-Position: Flow compares none; `Feed.reconnect`'s `last`; memory across sessions; at least once); **53 `listen` and connections** (3.6) |
| Rule 8 | add: "stream deliveries of a live session; a released session's undelivered items are discarded with evidence (rule 51)" |
| Rule 14 | add: "stream deliveries are always current from the active leaf; a session's owner is its placement's activation, and release discards rather than routing late (rule 51)" |
| Rule 20 | add the stream rows: `value`, `missed`, `failure` handled from every leaf under the placing state; no late handler; `FeedUnhandled` for an unmapped required key |
| Rule 37 | extend to streams: a stream's `failure` record maps `Closed`, `Overflow`, `Defect`, `Interrupted`; a fact feed maps `value`, `missed` and `failure` or is a `listen` entry |
| Rule 47 | stream deliveries count as endings |
| Rule 13 | add `missed`; streams' mapper context unchanged `(value, { input, key })`; the commit context gains `progress(p)` |
| N3 "(merge 6)" | → "(rule 51)" |
| 2.7.3 per-kind table, stream row | outcome keys `value`, `missed`, `failure` (rule 48); row: 2.6's `FeedRow`, per placement, per key under `each`; members: none |
| 2.7.3 "two sessions on one key end `DuplicateSession` (M6 rule 47)" | → "two operations on one stream contract are two sessions; `flow check` warns `DuplicateSession` (rule 51)" |
| 2.7.8/2.7.9 "M6 rule 44" | → "rule 51" |
| 2.7.10 "`DuplicateSession` (merge 6 rule 47)" | → "two selected inputs with one key are one session (rule 41); two operations on one contract are two (rule 51)" |
| 2.7.13 | add 3.5 (progress per Attempt) to the lane's table |
| 2.7.13 lifetime row "M6 rule 44" | → "a placement's session \| its activation \| a released session's undelivered items are discarded with evidence (rule 51)" |
| 2.7.15 "M6 rule 51 restores the data" | → "a state feed restores `last` and its baseline; a fact feed restores nothing; the session re-opens from the restored `input` (2.10's table)" |
| 2.7.16 | add the findings of 2.12 and the explain line |
| 2.8 | add 2.8.14 "`listen` and connections" (3.6 here) |
| Section 3.6 keywords, section 5 | add the words of section 7 |
| Section 7 item 9 ("writes that stream: deferred") | → "designed in merge 6: progress on the write lane (2.9)" |
| Section 6 (deliberately left out) | add: outbound live state (open-items 16), one shared session per Runtime (open-items 17), a `reconnect` member (open-items 18, parked), `fromRpc` streams and `Range` resume (open-items 19) |

### 6.2 Plans

| Plan | Change |
| --- | --- |
| Operations O1 | `stream({ id, input, output, key, delivers, subscribe })`; `persist` removed from streams; `result` → `output` (OD12) |
| Operations O4 | rewritten from rules 48–52; `DuplicateStreamSession`, "equal values are silent", "with value mapped … one value event waiting", "complete … end the session" replaced |
| Operations O6 | stream tags (`Running`, `Complete`, …) → 2.6's row |
| Operations V9, Q1 | V9: Stories prove the invariants I1–I24 by the 2.11 controls; Q1's stream buffering decided by 3.2–3.3 |
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
| Uncommon | `Feed.down`, `Feed.callback` (`emit`, `emit.fail`, `emit.end`), `bufferSize`, `catchUp`, `Overflow`, `Feed.CannotRepair` (Q19) | 6 |
| Rare | `lost`, `restartAt`, `why` (`Unproven`, `Lost`, `Reset`), `resetAfter` | 4 |
| **Total** | | **21** (revision 3 of proposal.md: about 24) |

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

CMP's independent count of the same cases, written from this design and type-checked where Effect allows: chat 77
lines in all (adapter 38, repair 9, Flow side 30), five cases 185. Revision 2 added about 4 lines to the chat adapter
(the `hello` deadline and the echo check) and 3 to Firestore (the `cached` flag); revision 3 adds 3 to the chat's
`catchUp` (`Feed.CannotRepair`) and 2 to its machine (the healthy reset), and removes none of the forced handlers.

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
  silent; a value forwarded after `Feed.down` is shown dimmed, never current; a catch-up that cannot say "complete"
  never completes; omitting `proof`'s basis cannot be written; reading a stale value needs the word `last`; a cached or pre-drop
  state value never reaches the machine. Where correctness forces common-tier code, it is one `missed` handler.

## 8. Decisions and open questions

### 8.1 Decided ([decisions-v2.md](decisions-v2.md))

| # | Decision |
| --- | --- |
| S1 | Continue with this design; revision 3 of proposal.md is prior art, five of its parts carried over (CMP) |
| S2 | In-band signals (`Feed.live`, `Feed.down`), ordered with the values |
| S3 | Repair lives in the adapter (`catchUp`, a server replay); the machine sees `missed` only when nothing could repair |
| S4 | The resume position across sessions is an `input` field the machine fills from memory; Flow stores and compares none |
| S5 | Q2 `missed`; Q3 SDK policies wrapped by recipe; Q6 the row (`connection`, `drop`, `value` on state feeds, `last { value, at }`); Q7 `Closed` in `failure`; Q8 cursors out of scope; Q9 no shared session; Q10 no `persist` on streams; Q11 `progress(p)`; Q12 `resetAfter` default 1 minute, `Closed` and `Overflow` retryable; Q13 `bufferSize` 1,024; Q14 the finding names |
| S6 | Q15 `catchUp` is a page-step function; Q16 the row reads `Live` during a catch-up; Q17 a state proof re-confirms only a `last` this session confirmed; Q18 pages retry with a fresh copy of the reconnect `schedule` |

Deferred to [../open-items.md](../open-items.md): **16** outbound live state on a session (cursors); **17** one shared
session per Runtime; **18** a manual `reconnect` member (parked; this design does not preclude it); **19** `fromRpc`
streams and `Range` resume. Candidates for **15** (wiring every app writes), not proposed here: machine-level re-open
with its healthy-reset (2.7), a per-key re-open for `subscribe.each` (4.3), a built-in `live` guard, a close-code
classifier, `Closed`/`Defect`/`Interrupted` defaults in a stream's `failure` record (RV1 section 7).

### 8.2 Round 5: questions raised by revision 3

**Q19. A repair that cannot reach back** (NEW word: `Feed.CannotRepair`). Bounded histories are the norm (Ably's
retention, Electric's purged shapes, compacted logs); today the author can only lie (`none`, read as complete) or fail
(an outage after the budget). A (recommended): an error class a `catchUp` step fails with; the start settles lost,
`missed Lost` reaches the machine, paging continues from `continueAt`.

```ts
// before: no honest answer
Effect.succeed([p.messages, Option.none()] as const)                                       // a lie: "complete"
// A: one error class (NEW)
Effect.fail(new Feed.CannotRepair({ reason: "history starts at 9:12", continueAt: p.oldest }))
// B: no new word, a lost signal inside the page (a hybrid: signals among page values)
Effect.succeed([[Feed.live({ lost: "history starts at 9:12" }), ...p.messages], Option.some(p.next)] as const)
```

**Q20. `emit`'s return value.** A (recommended): `emit` returns a `Promise<void>` that resolves when the queue has room,
so an SDK that awaits its callback (Electric) is back-pressured; a caller that ignores it still overflows into a
reconnect. B: `emit` returns `void`; awaiting SDKs are documented as state feeds only.

**Q21. The first connection with no position.** A (recommended): under `Feed.reconnect`, a session's first unproven
start with `last` undefined and nothing emitted is answered `fresh` (no `missed`; `listen` still lowers). A plain Stream
stays conservative. B: also for plain Streams, which needs a contract flag (a new word) since Flow cannot see `from`.

**Q22. No view-only fact feed.** A (recommended): a fact feed's operation must map `value`, `missed` and `failure`, or
be a `listen` entry (a type error and `FeedUnhandled`); a view reads facts from memory. B: allow it, with a bounded
recent list and a loss flag on the row (two new words).

```ts
// before (revision 2): allowed; the view sees at most one fact per publication, and nothing reports the rest
notes: Notes.feed,                                                                           // bare fact feed
// A: a type error; map it
notes: Notes.feed.outcomes({ value: E.Note, missed: E.MayHaveMissed, failure: { … } }),
```

**Q23. `catchUp`'s cursor.** A (recommended): one step function whose first call receives `last` (the position) and
later calls the page token it returned (`(cursor: P | C) => Effect<[values, Option<C>]>`), keeping Q15's shape. B:
`catchUp: { start: (from) => C, step: (c) => … }` (RV2 M3).

## 9. Root causes and changes in revision 3

Revision 2's tables were run (MDL) and reviewed twice (RV1, RV2). The findings come from six causes; each is fixed at
its root, and what worked is kept.

| # | Root cause | Findings | Fix |
| --- | --- | --- | --- |
| C1 | **One bit, `Live`, meant registration and completeness.** A catch-up's proof was announced before it was earned, and nothing distinguished "nothing owed" from "unproven". | RV1 M1, RC2, Q16; MDL F11, F13; RV2 H1, X2; RV1 M7 | Two facts per connection (R-Answer): `connection` for registration, an **answer** per start with Flow's own `pending` and `fresh`; `listen` and evidence follow the answer (2.3, 2.8, 3.1, 3.6) |
| C2 | **Repair had no exit for "cannot"** and no clean abandonment. | RV2 H2; RV1 H1, M2, M5; MDL F9, F10 | `Feed.CannotRepair` (Q19); every abandonment discards the buffer; a hello-less first value enters the repair; two empty pages are a failure; a reset settles the repair (3.4) |
| C3 | **The row and the machine had separate paths to "current"** for state feeds. | RV1 H2; MDL F1, F2, F3 | One `reconcile` point after every cell; a value after `down` is never `own`; an ended feed's last value is shown, not heard (3.1, 3.2) |
| C4 | **The tables had unnamed variables and order-blind merges.** | MDL F4–F8, F12, I1, I12, I13, I20; RV1 M3, M4, L3 | Every table lists variables, procedures and every cell; `signalled`, `liveSince`, the dedupe `ring`, the group's `(down, live, down)` form, position equality, missing cells (3.1–3.4) |
| C5 | **Time was undefined across clocks and sleep.** | RV1 M6, M8, M14 | `at` is wall-clock epoch ms, transferred as an age; a cached value keeps the drop's time; the wake window is the deadline (2.6, 2.10, 4.3) |
| C6 | **Who owns the transport was unstated**, and a fact feed could be consumed by nobody. | RV2 X1, H3, M1, M5, M6; RV1 H3, M12, L7 | Two transport recipes and a reworded proof rule (2.3, 2.4); fact feeds must be mapped (Q22); `Overflow` in `failure`; `DuplicateSession` only when placements can overlap |

Also: I14 and I15 now have tables (3.5, 3.6); the samples gained a hello deadline, an echo-checked proof, the healthy
reset of machine-level re-open (RV1 M9), an ended-key set instead of deleting the user's watchlist (RV1 M10), XHR
`onabort`/`ontimeout` and a deadline (RV2 L2), and a bounded `removeChannel` (RV2 M6).

**Not closed, stated:** FC27/57 (out of scope, open-items 16); FC18 (no shared session, open-items 17); FC34 and FC38
(closures are not read: docs and Stories only); FC46 across sessions (the handler stores `restartAt`); FC53 after a
reload or SSR (S6 Q17 keeps a restored `last` unconfirmable; RV1 suggested relaxing it when the position came from
`input`); the Ably transparent-resume event (unconfirmed); `fromAsyncIterable`'s unawaited `return()`; the
`ReleaseOverdue` overlap; costs FC66, FC68–FC70, FC73, FC74 (sparse ids).
