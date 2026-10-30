# Proposal: streams (merge 6)

Status: **accepted by the owner on 2026-10-30, with the decisions in section 10; not yet reviewed, and merges after
merges 3, 4 and 5.** Designed from the sources in [gaps.md](gaps.md), not from any earlier stream
draft. Builds on the merged design (machine-design.md, rules 1–25) and on the accepted entity proposal (merge 4, rules
26–38). Nothing here edits a `.plan` file; section 6 lists the amendments for when the owner accepts them. All syntax
is a working draft; `// ← NEW` marks what this proposal adds.

**Revision (multiplicity audit, 2026-10-31).** [audit-multiplicity.md](../audit-multiplicity.md) changed four things here, each marked with these
words: a streaming write's progress is read from the snapshot's lane row and exists only where a lane has one
addressable Attempt (rule 48, M6-D5); the upload walk is `reject` per upload (7.5); two sessions of one `listen` entry
are stated and warned (rule 49, M6-D6); a keyed activity's sessions meet rule 47 (M6-D7).

Short names for citations (all under `workflow/plans/flow/`):

| Short name | File |
| --- | --- |
| GAPS | `references/explorations/machine-fragments/merge-6-streams/gaps.md` |
| OPS | `Operations.plan` |
| MCH | `Machines.plan` |
| MD | `references/explorations/machine-fragments/machine-design.md` |
| M3 | `references/explorations/machine-fragments/merge-3-stories/proposal.md` (being revised, not accepted) |
| M4 | `references/explorations/machine-fragments/merge-4-entities/proposal.md` (accepted) |
| EDP | `EntityDomains.plan` |
| ED | `references/design/entity-domain.md` |
| PER | `Persistence.plan` |
| RT | `Runtime.plan` |
| TST | `Testing.plan` |
| INS | `Inspection.plan` |
| MT | `references/design/multi-tab.md` |
| SE | `references/design/sync-engine-adapter.md` |
| DD | `references/dispatch-desk/` |

"Flow" means Flow's own runtime: nothing in Flow reads an HTTP status, a close code or an author error type
(MD:775-776). "The adapter" is the author's `subscribe` (or `commit`) and the Effect services it calls.

## 1. The problem

Streams have had no design round. Operations O4 (OPS:119-134) and the stream half of O6 (OPS:166-169) predate the
server-call design, and GAPS lists thirteen gaps. In short:

- **What a value means depends on the machine** (G1). Mapping `value` changes delivery from "may skip, equal values
  silent" to "every value, pulled after each turn" (OPS:126-130). A notification feed loses its second equal "sync
  now"; whether a `listen` push can be skipped is unspecified.
- **Nothing says what was missed or how a feed resumes** (G2, G5). A re-opened session loses what the source said
  meanwhile, and nothing records it. Parameters are fixed at start (OPS:120-121); a terminal session restarts only on
  re-entry and its lane then is unstated (OPS:131-133). "Reconnect" in EntityDomains means the browser's connection
  restored (EDP:82, OPS:59-62), not a stream re-opening, so a `listen` answer can stay stale with a fresh frontier.
- **No connection status** (G3): a lane is `Running` from open to end (OPS:166-168). The sync-engine adapter already
  puts status inside the value to work around it (SE:182-185, SE:420-421).
- **Endings predate merge 2** (G4): mappers get values only (OPS:70), `defect` and `interrupt` are separate keys
  (MCH:139-140), deliveries have no place in the FIFO list (P21, MD:2130), and a duplicate session leaves the lane
  undefined with the activity waiting (OPS:122-124), the silent decline D5 rejected (MD:2396-2401).
- **Nobody owns classification or reconnect** (G6). Rule 25 says Flow retries nothing (MD:609-610), but not what that
  means for a stream; the browser hides almost every reason (GAPS, "The sources").
- **Ownership is one clause** (G7): "facts from an ended activation are discarded by design" (RT:88-90).
- **Backpressure is deferred** (G8, OPS:204), yet `fetch` bodies have it and WebSockets do not.
- **Writes that stream** (G9) are deferred (MD:2242): a transaction reports nothing before its ending.
- **`listen` ordering, duplicates and the first-live race** (G10, ED:568-569, ED:691-692).
- **Persistence and tabs** (G11): a restored lane has no idea how stale it is; a handover opens "a fresh generation"
  (PER:96-98, PER:32-33, MT:334).
- **Stories cannot drive a feed** (G12) without merge 3's fixture controls (M3:422-427, M3:450-457).
- **Nothing is checked** (G13, INS:28-29, INS:86-88).

### 1.1 Where gaps.md is wrong or imprecise

Each citation was re-read. All but these hold:

- **G12's M3 citation** (M3:938-941) points at the end of M3's "Added" table. Fixture controls are M3:422-427 and
  M3:450-457, decided as Q24 (M3:1275-1279).
- **G3's SE:67** for "status can recover from `error` to `ready`" is SE:66; SE:67 is the `truncate` event.
- **G1's "a `listen` stream is not exempt from skipping"** overstates the text: OPS:126-127 defers domain listeners to
  EDP O1, which says nothing about delivery. It is unspecified, not stated.
- **G4's "there is no `Flow.uncertain`"** is not a gap. A stream is a read, and reads keep two channels because a
  read changes nothing (MD:877-878, C5 MD:2140, rule 37 M4:622-623). Streams need an honest answer about *what was
  missed*, not an unknown channel (section 4.1.4).
- **G8 is half answered already.** With `value` mapped, OPS:127-128 pulls the adapter's Stream only after each turn,
  which is backpressure into the adapter. The gap is upstream of that (push sources) and the unmapped case.
- **DD's polling citation** (`next/http-api.ts:173-185`) covers only half of `technicianUpdates`; the two polling
  adapters are `next/http-api.ts:151-194`. GAPS misses two facts there: both turn every failure into a defect
  (`Effect.orDie`, `next/http-api.ts:160`, `:164`, `:182`, `:186`), so one dropped poll is a terminal `Defect` lane
  and an issue; and every new session starts at cursor `"0"` (`next/http-api.ts:150`), replaying everything.

## 2. Where the data comes from

The browser gives every source the same shape: **a session that delivers a sequence of messages over one or more
transport connections, each of which may break.** What differs is who reconnects, whether anything proves continuity,
and whether reading pushes back. For each source, what Flow must model and what belongs to the adapter:

| Source | Flow models | The adapter (an Effect service and the `subscribe` that calls it) owns |
| --- | --- | --- |
| **WebSocket** | the session's life (owned by an activity); delivery into the actor; the connection status the adapter reports; the continuity claim at each open; the session's ending | `new WebSocket`, auth (cookie, URL token, first message), heartbeats and the half-open check, reading close codes into its own errors (`SignedOut` from 4401, `Dropped { code }` from 1006), reconnecting with its own backoff, the resume message, a bounded receive buffer and reporting its overflow |
| **SSE** | the same | `EventSource`; its built-in reconnect is the adapter's reconnect: `readyState` CONNECTING is "down", a later message is "open"; whether the server honoured `Last-Event-ID` (an app event says so) |
| **`fetch` body** (feed) | the same; pull-based reading keeps the TCP window honest | the terminator (`[DONE]`, a final frame, a length) that tells completion from a clean cut; the status and headers |
| **`fetch` body** (a write: LLM answer) | the transaction's Attempt and its three endings (2.7.1); **progress** before the ending (4.1.8) | the same terminator; that a cut answer is `unknown` |
| **Upload progress** (XHR) | progress before the ending; the ending | `xhr.upload.onprogress` into progress; `load`/`error`/`abort` into `Outcome` |
| **Polling with a cursor** | the same as a WebSocket | the loop, the cursor, the delay; that a failed GET is "down", not a defect |
| **Sync engine** | the same; its recoverable `error` is "down" | everything else: the engine owns log replay, offline catch-up and completeness (SE) |
| **`BroadcastChannel`** | the same | nothing more: no failure, no reconnect |

What follows from the table:

- **Reconnecting is the adapter's, inside one session.** SSE reconnects by itself, sync engines recover from `error`,
  and only the adapter sees close codes. So a Flow session spans transport connections, and the adapter *reports*
  each drop and each re-open. This is merge 2's split for sends: a retry inside one send is the adapter's
  (`Effect.retry` in the commit, MD:921; a transport deadline inside the commit, MD:1116); a retry that needs a
  decision is the machine's states and schedules (2.7.6). For streams, a session that ends with a failure is the
  machine's decision.
- **Continuity is a claim only the adapter can make, and its honest default is "unproven".** GAPS's three answers
  (continuous, broken, don't know) map to: the adapter proved it (`resumed`), the adapter knows it lost something
  (`gap`), and every other open.
- **The meaning of a value is the source's.** A chat message is a fact that must be delivered; a price is the current
  state, and only the newest matters. That is a property of the data, so it is declared on the descriptor, not chosen
  by whichever machine maps it.

## 3. What carries over

Each server-call and entity concept, judged from the design text.

### 3.1 From server calls (MD 2.7, rules 13–25)

| Concept | Verdict | How or why |
| --- | --- | --- |
| Three channels: success, failure, unknown (2.7.1) | **adapted** for sessions; **as is** for writes that stream | A session is a read: it ends `complete` or `failure`, as reads do (MD:877-878, C5). A streaming write keeps all three channels. The question "what did I miss?" gets its own three answers (4.1.4), which describe the data, not the server's state |
| `Outcome` in the commit (2.7.1) | **adapted** | `Session` is the subscribe function's vocabulary: plain elements are values (as a plain `return` is success), and `Session.open / down / resumed / gap` are signals (4.1.2) |
| The classifier outside the fiber (MD:844-863) | **as is** | A session's `Exit` and whole `Cause` are classified the same way, with a read's two channels: author error → failure; die → `Defect` and an issue; outside interruption → `Interrupted`; Flow's release → nothing |
| Flow's reasons (MD:814-826) | **adapted** | `Defect` and `Interrupted` arrive on `failure` (rule 37); `DuplicateSession` joins them (rule 47). `NotSent`, `Cancelled`, `Restored`, `StillUnknown` belong to Attempts and do not apply. A new reason, `Unproven`, is Flow's gap reason (4.1.4) |
| `outcomes` mapping onto author events (rule 13, D1) | **as is** | `value`, `gap`, `complete`, `failure` map onto declared events; a failure or gap mapping is one event or an exhaustive tag record |
| Mappers receive `(value, context)` (C6) | **adapted** | `(value, { params, key })`; the session has no Attempt |
| `Flow.uncertain` (rule 13, D3) | **not carried** | No unknown channel on a read. A gap's reason (`Unproven` or the adapter's) is information in the payload |
| The commit value as handle: `retry`, `cancel`, `idle`, `pending`, `retryCount` (D4) | **not carried** for sessions; **extended** for streaming writes | A session is declarative: it starts with its activity, stops when released or `when` is false, re-opens only by starting the activity again. Its lane is read like any activity lane. A streaming write's lane row gains one field, `progress` (4.1.8; Revision (multiplicity audit, 2026-10-31): lanes are the snapshot's `calls` rows, the design's D18) |
| The lane per actor, transaction and key (rule 21) | **adapted** | Streams already have activity lanes (OPS O6). `Running` gains `connection` (4.1.5) |
| Owner, current or late, decided at admission (rule 14) | **adapted** | The owner is the activity's activation. A delivery is mapped at admission (as an ending is); if its session was released, it is discarded, never routed late (rule 44): a session owes nothing after release, and the next session's continuity says what it missed |
| Late turns (rule 15) | **not carried** | No late stream deliveries |
| Declines are endings (rule 16, D5) | **adapted** | A duplicate session is a failure ending (`DuplicateSession`), never silence (rule 47) |
| Every start ends once (rule 17) | **adapted** | A session ends at most once; a planned release ends it without an ending (OPS:133, kept) |
| The Attempt's ending, `StillUnknown` (rule 18) | **not carried** | No Attempt |
| The key is the Attempt's id (rule 19) | **adapted** | The idempotency key's counterpart is the resume position: the author puts it on the wire through `params` (rule 45). Flow keeps no cursor |
| Required handling (rule 20) | **adapted** | `value` and `gap` are required for an `every` stream; `Defect` and `Interrupted` in a tag record (rule 37); `DuplicateSession` where it can occur. Current only |
| Memory reads: before for decisions, after for effects (rule 22) | **as is** | Activity `params` and `when` read after. So a handler that writes `lastSeq` and re-enters the state opens the next session from it |
| Schedules and keyed schedules (rule 23, 2.7.10) | **as is** | Backoff after a terminal failure, give-up budgets and "stale after a quiet minute" are schedules |
| Cancel (rule 24) | **not carried** for sessions; **as is** for streaming writes | A session is released, not cancelled. Stopping a generation is `gen.cancel(key)`: `unknown(Cancelled)` |
| No Flow timeout, no Flow retry (rule 25) | **as is, extended** | Flow never re-opens a session (rule 43). The adapter may reconnect inside one, and reports it |
| Mailbox FIFO with endings, timers, `onContext` (P21) | **as is, extended** | Stream deliveries queue in the same FIFO (rule 46) |
| Concurrency modes (2.7.8) | **not carried** for sessions; **as is** for streaming writes | One session per activity; a second one is `DuplicateSession` |
| Attempt durability (Persistence O6, C17) | **not carried** for sessions; **as is** for streaming writes | Progress is never persisted (rule 48) |
| The cache table (MD:865-876) | **not carried** | A stream never writes resource data (OPS:126, kept); `listen` writes records under section 4.2 |
| `orphaned` (P19) | **not carried** | Nothing to finish across a version change |

### 3.2 From entity domains (M4 rules 26–38, EDP, ED)

The owner's scope note applies: the domain is client-side coherence, not a sync engine. `listen` keeps the store
coherent and honest; log replay, offline catch-up and completeness belong to a sync engine behind SE.

| Concept | Verdict | How or why |
| --- | --- | --- |
| One split: domain owns shared data, machine owns workflow (rule 26) | **as is** | The domain applies pushes and repairs after gaps; a machine needs no handler for a `listen`'s gaps |
| Settlement for the store, admission for the lane (rule 27) | **adapted** | A push changes the store when it arrives (its "settlement"), before any machine turn; a machine that maps the same session's `value` sees it later, at admission |
| A start publishes with its turn (rule 28) | **as is, by analogy** | A session that starts in a turn shows `Running` with `connection: "Opening"` in that turn's publication |
| Actor first, then the record queue (rule 29) | **not carried** | A push is not a write: it never joins a record queue. Predictions replay over the pushed base (ED:507-510) |
| The store follows the Attempt's ending (rule 30), retry (rule 31) | **not carried** | No Attempt |
| What clears `uncertain` (rule 32) | **as is, extended** | A push is an observation, like a read: it clears no mark (rule 49) |
| No temporary ids (rule 33) | **as is** | A pushed new record enters lists only through repair (EDP:118-119) |
| Lane key of a domain write (rule 34) | **not carried** | |
| Overflow is an ending (rule 35) | **adapted** | The adapter's buffer overflow is a gap, a known loss, never a silent drop (rule 41) |
| Callback reads (rule 36) | **not carried** | |
| Reads carry confirmed data; `Defect`/`Interrupted` mapped (rule 37) | **as is** | A session's failures (rule 42) |
| Lanes and predicted keys persist together (rule 38) | **not carried** | Deliveries are not persisted at all (rule 48) |
| Positions and frontiers (ED 5.3) | **adapted** | An unproven open, or a gap, lowers the frontier of covered answers (rule 49); "reconnect" in EDP:82 gains this meaning |
| Versions, contests, tombstones (EDP:63-71, ED:598-601, ED:688-692) | **as is** | They already make out-of-order and duplicated pushes safe with versions, and self-heal without (section 4.2) |

## 4. Design

Three layers, each in its own section. Section 4.4 shows what each owns and what crosses between them.

### 4.1 The stream operation (Operations O1, O4, O6, O7)

#### 4.1.1 The descriptor

```ts
// chat.operations.ts (outside the machine)
export const messages = stream({
  id: "chat/messages",
  key: (p: { roomId: string; after: number }) => ({ roomId: p.roomId }),   // the feed; `after` only says where a session starts ← NEW meaning
  delivers: "every",                                                          // ← NEW, required: "every" | "latest"
  result: Message,                                                            // as today (OPS:18)
  subscribe: (p, { signal }) => Session.reconnect({                           // ← NEW: the adapter's vocabulary (4.1.2, 4.1.3)
    connect: (from) => ChatSocket.use((s) => s.messages({ roomId: p.roomId, after: from ?? p.after })),
    position: (m) => m.seq,                                                   // adapter-local: where the next connection resumes
    schedule: Schedule.exponential("500 millis").pipe(Schedule.both(Schedule.recurs(8))),   // the author's backoff, on the Runtime Clock
    while: (e) => e._tag === "Dropped",                                       // transient: reconnect; any other error ends the session
  }),
})

export const quote = stream({
  id: "market/quote",
  key: (p: { symbol: string }) => p,
  delivers: "latest",                                                         // ← NEW: each value replaces the last; skipping is correct
  subscribe: (p) => Session.reconnect({ connect: () => Quotes.use((q) => q.ticks(p.symbol)), position: () => undefined, schedule: backoff, while: isDrop }),
})
```

**`delivers`** is required, like `concurrency` (OPS:26): a standard upfront contract stating what the data is.

| | `"every"` | `"latest"` |
| --- | --- | --- |
| A value is | a fact: a message, a notification, a delta | the current state: a price, a presence set, a job's progress |
| Flow may coalesce or skip | never | yes: only the newest matters |
| Equal values | delivered (two equal "sync now" are two facts) | silent under `Equal.equals` |
| Reading the adapter's Stream | pulled one element at a time, by its consumer (rule 46) | drained continuously into the lane |
| In a machine | `value` and `gap` must be mapped | `value` optional; no `gap` (the next value is the truth) |
| In `listen` | required | a type error (section 4.2) |

**The key names the feed; parameters outside it say where a session starts.** OPS:41-43 asks authors to put every
parameter that affects the result in the key. For a stream the key is the session's identity (OPS:120-121), so a
resume position must stay *outside* it: changing `after` on every message would re-open the session on every message.
A new session reads the current parameters; a running one keeps its originals (OPS:120-121, kept). This is an
amendment to O1 (6.4).

#### 4.1.2 The adapter's vocabulary: `Session`

`subscribe` returns `Stream<A | Session.Signal<D, G>, E, R>`. Plain elements are values. Signals are wrapper values
built with `Session.*`, as `Outcome.failure` and `Outcome.unknown` build classified errors (MD:806-812); Flow peels
them off, and `A`, `D` (down reasons), `G` (gap reasons) and `E` are inferred with nothing declared elsewhere.

```ts
Session.open()          // a transport connection is open; continuity unproven        ← NEW
Session.resumed()       // open, and nothing since the last position is missing:        ← NEW
                        //   the server replayed from the cursor, or the connection starts with a full snapshot
Session.gap(reason)     // something was lost: "history expired", a buffer overflow       ← NEW
Session.down(reason)    // the connection dropped; the adapter is trying again            ← NEW
// a plain element: a value. The first value of a session with no signal before it counts as Session.open().
// values may also arrive while Down (a cache serving data, 7.7.4); after a down, only open, resumed or gap re-open.
// failing the Stream ends the session (failure); completing it ends the session (complete).
```

- Each signal is a **claim by the adapter**, with the adapter's own reason as information (a `Dropped { code }`, a
  `HistoryExpired { oldest }`). Flow reads no close code, `readyState` or status; it reads which signal came.
- `resumed` and `gap` describe the connection they follow; `resumed` must come before that connection's first value.
  `gap` may also come mid-connection (an overflow).
- Nothing is configuration: a server close that should reconnect is a `Dropped` error the adapter's `while` accepts,
  not an option.

#### 4.1.3 `Session.reconnect`: reconnecting inside one session

`Session.reconnect({ connect, position, schedule, while })` is an Effect combinator the adapter places in its own
`subscribe`. It runs `connect(from)`, passes its elements through, and remembers `position(value)` of the last value.
When the connection fails with an error `while` accepts, it emits `Session.down(error)`, sleeps by `schedule` on the
Runtime Clock, and connects again with the last position. Any other error, or an exhausted `schedule`, ends the
session with that error. It mirrors `Effect.retry({ schedule, while })`, and is ordinary adapter code: Flow's runtime
never re-opens a session (rule 43). The position never leaves the adapter; across sessions, the machine's memory holds
it (4.3.2). Because only a session's first value implies an open (rule 40), the combinator reports each re-open: it
emits `Session.open()` before a reconnected connection's first element, unless that connection starts with its own
signal. That is the "reports each re-open" of section 2, spelled out; the combinator is otherwise unchanged (7.7).

A source that reconnects by itself (SSE, a sync engine) reports the same signals without the combinator: CONNECTING
or `error` is `down`, the next message or `ready` is `open`.

**A receive buffer that drops must say so.** A WebSocket pushes whatever the consumer does (GAPS, "Backpressure"),
so the adapter buffers messages from `onmessage` in a bounded queue. On overflow it drops the buffer and emits
`Session.gap(new Overflow())`. Flow cannot see a silent drop, so rule 41 makes it the adapter's obligation. A `fetch`
body needs no buffer: it is pulled, and the TCP window follows.

#### 4.1.4 Continuity: the three answers

At every open of a transport connection, the session's continuity is decided by the adapter's claim:

| The adapter said | Answer | Flow's delivery (an `every` stream) |
| --- | --- | --- |
| `Session.resumed()` | continuous | nothing |
| `Session.gap(reason)` | something was lost | a gap with the adapter's `reason` |
| `Session.open()`, or the session's first value with no signal | unproven | a gap with Flow's reason `Unproven { why: "Opened" \| "Reconnected" }` |

The gap is delivered **before any value of that connection**, in the session's sequence. It is delivered on the
**first** open too (`why: "Opened"`): a machine that read history before the socket opened may have missed what was
said in between (the first-live race, G10), and only a proof closes that window. On a `latest` stream there are no gap
deliveries: its next value is the whole truth.

Continuity is judged per connection, against the position the connection started from: the session's previous
connection, or, for a new session, the position in its parameters. Flow does not judge across sessions on its own.
The machine's memory holds the position, and the adapter proves or disproves resumption from it (4.3.2).

#### 4.1.5 The lane

```ts
s.activities.feed
// Running     { data, connection: "Opening" | "Open" | "Down", down?: D }   ← NEW fields; `down` is the last down reason while Down
// Complete    { data }
// Failure     { data, error }       Defect { data, cause }    Interrupted { data, cause }   (as OPS:166-169)
```

- `connection` starts `"Opening"`, becomes `"Open"` at `open`, `resumed`, `gap` or the session's first value, and
  `"Down"` at `down`. A value that arrives while `"Down"` updates `data` and leaves `connection` as it is (7.7.4).
  It is the adapter's report, not Flow's measurement: whether quiet means idle or dead is the adapter's heartbeat
  (GAPS, WebSocket "Unknown").
- `data` is the latest value, as today. A `latest` stream's lane updates coalesce to at most one publication per
  Runtime publication; lane-only changes run no handlers (MCH:148-150, kept).
- **A new session starts with the old data.** When an activity starts a new session with the same key as its previous
  one (re-entry, restore, handover), the lane starts `Running`, `connection: "Opening"`, with the previous session's
  `data` (G5). This extends the retention placeholders already use (OPS:172-173). The data is not re-mapped
  (OPS:74-75); `connection` says it is not live.
- No `receivedAt`: when staleness matters, the server's timestamp in the value is the source (alternative A13).

#### 4.1.6 Endings and classification

A session ends once, as a read: `complete` (the Stream completed), or `failure` with the author's error, Flow's
`Defect` (a die, plus an issue) or `Interrupted` (an outside interruption), classified from the whole `Cause` outside
the session's fiber (MD:844-863). A planned release (state exit, key change, `when` false, disposal) ends it with no
ending (OPS:133, OPS:178-179, kept). There is no unknown channel.

**Classification is the adapter's.** A token expiry shows as `error` then close 1006 with no status (GAPS, G6). The
adapter decides what it knows: a server that sends close 4401 lets it fail `SignedOut`; one that cannot, lets it
probe (an authenticated read) before reconnecting; anything else is `Dropped` and goes through `while`. "Offline" and
"signed out" look different only if the adapter makes them so; Flow interprets neither.

**Every failure reaches its owner.** DD's `Effect.orDie` (section 1.1) would make one dropped poll a `Defect`. With
`Session.reconnect`, a dropped poll is `down`, and only a give-up is a failure.

#### 4.1.7 Delivery to a consumer

A session has exactly one consumer: a machine activity (4.3) or, for a `listen` entry, the store and the activity
that started it (4.2). Flow pulls the adapter's Stream:

- **`every`:** one element at a time. The next element is pulled only after the consumer has handled the previous one
  (a machine: the turn of its delivery; the store: its application). Values, gaps and the ending stay in the adapter's
  order. This is OPS:127-128's rule, now independent of whether `value` is mapped.
- **`latest`:** continuously; the newest element replaces the lane's data. A machine gets at most one delivery
  waiting, whose payload is read at admission (4.3.3).

#### 4.1.8 Writes that stream: progress

An LLM answer in a POST body and an upload are **writes**: they may cost money or create data, they can be cut off,
and the client cannot know whether the server finished. So they are transactions with an Attempt and three endings
(2.7.1), plus one thing: **progress before the ending.**

```ts
export const generate = transaction({
  id: "assistant/generate",
  input: Schema.Struct({ conversationId: Schema.String, prompt: Schema.String }),
  key: (i) => ({ conversationId: i.conversationId }),
  progress: Schema.Struct({ text: Schema.String }),                           // ← NEW: what the commit may report before it ends
  concurrency: "reject",
  commit: (input, { attempt, signal, progress }) => Effect.gen(function* () {  // ← NEW: progress(value) in the context
    const api = yield* Assistant
    const res = yield* api.generate(input, { clientMessageId: attempt.id, signal }).pipe(
      Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)))              // the POST may have reached the server
    if (res.status === 429) return yield* Outcome.failure(new Busy({ retryAfterMs: res.retryAfterMs }))
    if (res.status !== 200) return yield* Outcome.failure(new Refused({ status: res.status }))
    let text = ""
    let done: Done | undefined
    yield* res.frames.pipe(                                                    // a pulled body: the TCP window follows the reader
      Stream.timeout("30 seconds"),                                            // a stall deadline the UI never sees (MD:1116)
      Stream.runForEach((f) => {
        if (f._tag === "Done") { done = f; return Effect.void }
        text += f.token
        return progress({ text })                                              // latest-wins: never blocks the reader
      }),
      Effect.catch((e) => Outcome.unknown(new BodyBroken({ cause: e }))))     // an error after the headers: it may have finished
    if (done === undefined) return yield* Outcome.unknown(new CutOff({}))     // a clean end without the terminator
    return { messageId: done.messageId, text }                                 // the ending carries the whole answer
  }),
})
```

- `progress` declares a Schema; the commit's context gains `progress(value): Effect<void>`, which replaces the
  Attempt's current progress and never waits.
- Progress is **latest**-delivered: the ending carries the whole result, so skipping progress loses nothing. Tokens
  are therefore reported as the text so far, not one by one.
- The machine reads it as a lane field beside `pending` and `retryCount` (D6). **Revision (multiplicity audit, 2026-10-31) (M6-D5).** It is the
  lane row's `progress` in `s.calls` (`s.calls.Assistant.generate.find((l) => l.key.conversationId === id)?.progress`):
  the addressable Attempt's last progress, or `undefined`, cleared when the ending's turn is admitted. It exists only
  where the lane has one addressable Attempt, under `reject`, `latest` and `cancel` (the design's rule N2); under
  `allow` and `serialize` declaring `progress` is a type error, so several concurrent uploads key each upload.
- Every ending mapper's context gains `progress`, the last value reported (`undefined` if none): a stopped or cut-off
  answer keeps its partial text without the author's error having to carry it.
- Upload progress is the same with `{ loaded, total }`: bytes handed to the network stack, an upper bound on what the
  server has (GAPS, "Upload progress"). A drop at 100 % is still `unknown`, and clean-up is keyed by the Attempt
  (MD:1194-1211).
- "A stream ack completes the write" (REQ R32) needs nothing new: the commit awaits the ack from a service (an engine's
  `awaitTxId`, SE:73) before it returns, so the ending is the ack's.

### 4.2 The entity wrapper: `listen(stream).as(...)` (EntityDomains O1, ED)

The domain is client-side coherence, not a sync engine. `listen` needs four things to keep the store coherent and
honest: apply every push, in order; never let a push pretend to prove what it cannot; lower what may be stale after
a gap; and leave completeness to a sync engine.

```ts
export const ticketEvents = stream({
  id: "DispatchDesk/ticket-events",
  key: ({ workspaceId }: { workspaceId: string }) => ({ workspaceId }),
  delivers: "every",                                                           // ← NEW: required for listen; "latest" is a type error
  subscribe: (input) => Session.reconnect({ connect: () => TicketApi.use((api) => api.events(input)), position: () => undefined, schedule: backoff, while: isDrop }),
})

events: listen(ticketEvents).as([Ticket], (event) =>                          // unchanged (DD ticket.domain.ts:81-88)
  event._tag === "TicketSaved" ? Ticket.save(event.ticket)
    : Ticket.delete({ workspaceId: event.workspaceId, ticketId: event.ticketId }, { version: event.revision })),

// in a machine, unchanged (DD queue.machine.ts:66): the activity owns the session; the store consumes it
feed: O.Tickets.events.subscribe(workspace),
```

- **Every push, in order.** A `listen` stream is `every`; the store applies each element as it arrives, before any
  machine turn (rule 27's settlement side), and pulls the next after applying it. Deltas still consolidate per turn and
  causes never drop (ED 5.4). This settles G1 for `listen`.
- **Pushes are observations.** A push is positioned at arrival (ED:594-595), never joins a record queue, and clears no
  `uncertain` mark: like a read, it cannot prove an uncertain write will not still land (rule 32, ED:656-658).
  Predictions replay over the pushed base (ED:507-510), and a settled write repairs from both bases (ED:541-544), so a
  push during an in-flight write is not lost.
- **A gap lowers frontiers.** A gap delivery, including `Unproven`, is a **reconnect** cause for the entities the entry
  changes: every covered answer whose request started before that open has its frontier lowered; subscribed ones
  refetch in canonical order under `repairSlots`, the rest are marked stale (EDP:82, ED:574-576, EDP:177-178). This
  gives EDP:82's "Reconnect" a definition: the browser's connection restored (OPS:59) **or** a `listen` connection
  opened without proof. `Session.resumed()` lowers nothing.
- **The first open counts** (G10). An answer whose request started before the listen's first open may have been read
  by the server before the push subscription began, so the `Unproven { why: "Opened" }` gap lowers it too. Requests
  started after the open are safe. The cost is one extra read of the answers loaded before the socket opened, at page
  load; it is the honest price of a push channel that proves nothing. A source that can prove continuity from the read
  (a log offset shared by reads and pushes) is a sync engine, and plugs in through SE.
- **Duplicates and replays.** A save is a whole-field value and a delete is idempotent, so a duplicate push is
  harmless. With versions, an older replayed push loses (EDP:65-66). Without versions, pushes order by arrival, so a
  replayed older push can briefly overwrite a newer read; the read that lands later with a different value contests
  the field and refetches it (EDP:66-69), so it self-heals, and `flow check` already warns on `listen` over an
  unversioned entity (EDP:123-124).
- **Not designed here, by the scope note:** replaying a server log into the store, offline catch-up, guaranteed
  completeness, conflict resolution against a log. A source that needs them is a sync engine behind SE. SE's own
  status workaround (SE:182-185) becomes `down` and `open` signals, which closes SE's open question 2 (SE:420-421).
- A machine may still map the same session's `value` (a toast "Ticket deleted by Ana"); it sees the push after the
  store applied it, at admission (rule 27). It need not map `gap`: the store handles it.

### 4.3 Streams inside machines (Machines O6, machine-design.md)

#### 4.3.1 Starting, owning, reading

Unchanged in shape: a stream runs as an activity of the state that declares it (MCH:131-137), owned by that state's
activation. What changes is the mapping and what the machine can read:

```ts
LIVE: {
  activities: {
    feed: O.Chat.messages.subscribe(({ memory }) => ({ roomId: memory.roomId, after: memory.lastSeq }), {   // params read after memory (rule 22)
      outcomes: {
        value: E.Message.from((m) => ({ message: m })),                       // required for an `every` stream
        gap: E.Missed.from((r) => ({ reason: r._tag })),                      // ← NEW, required for an `every` stream: one event or a tag record
        failure: { SignedOut: E.SignedOut, Dropped: E.FeedLost, Defect: E.FeedLost, Interrupted: E.FeedLost },   // rule 37
      },
    }),
  },
  on: {
    Send: { target: "self", guard: ({ activities }) => activities.feed?.connection === "Open" || deny("Offline"), actions: [post] },   // ← NEW read
    // …
  },
},
```

- `outcomes` keys for a stream: `value`, `gap`, `complete`, `failure`. `defect` and `interrupt` go (as C2 did for
  commits); `Defect` and `Interrupted` are failure reasons (rule 37).
- Handlers stay top-level `on` handlers of the definition's events. Nothing is nested under the stream.
- Guards and views read `activities.<name>.connection` (guards receive `activities`, MCH O4); a view's "Reconnecting…"
  banner and a disabled composer agree through `check()`.

#### 4.3.2 Resume through memory

Flow keeps no cursor. The machine keeps the position it has **handled**, in memory, and passes it in `params`:

- Within a session the adapter tracks its own position (`Session.reconnect`'s `position`), which may be ahead of
  memory; that is safe, because a live session's pulled elements are always delivered.
- A new session (re-entry, restore, handover) reads `params` from the after memory (rule 22), so it starts from the
  last position a handler committed. A delivery queued but not handled when the old session was released is
  discarded (rule 44) and comes again from the new session, or the new session reports a gap.
- Dedup is the machine's: a handler ignores a message it already holds, by id.

#### 4.3.3 Deliveries in the turn

- **Queued and mapped like endings.** A delivery (value, gap, ending) is queued in the actor's FIFO mailbox with user
  sends, call endings, timer firings and `onContext` events (P21), and mapped through `outcomes` at admission (2.5
  step 1), routed from the active leaf.
- **Released means discarded.** At admission, a delivery whose session was released (its activation ended, its key
  changed, its `when` turned false) is discarded with evidence, as a dead activation's timer is (MD:659, MCH:118).
- **`every`:** one delivery waiting per session; the next element is pulled after its turn commits.
- **`latest`:** at most one delivery waiting per session. Its payload is the lane's data **at admission**, so a
  ticker at 1,000 updates a second costs at most one turn per admission. If that data equals the last mapped value,
  admission discards it: no turn, no publication.

#### 4.3.4 Reconnect after a terminal failure: a state and a schedule

A failure that needs a decision (the adapter gave up, the user was signed out) ends the session, and the machine
decides, with merge 2's CALL/WAIT split (2.7.6):

```ts
FeedLost: [
  { target: S.LOST, guard: ({ memory }) => memory.feedTries < 5 || deny("GaveUp"), updateMemory: ({ memory }) => ({ feedTries: memory.feedTries + 1 }) },
  { target: S.OFFLINE },
],
LOST: {
  schedules: { retry: { schedule: ({ memory }) => Duration.seconds(2 ** memory.feedTries), send: E.RetryFeed } },
  on: { RetryFeed: S.LIVE },                                                  // entering LIVE opens a new session from memory.lastSeq
},
```

A machine that wants to keep showing the lane's data while it waits stays in the owning state and re-enters it:
`RetryFeed: { target: S.LIVE }` from LIVE itself re-enters it (MCH:62), and the new session starts with the old data
(4.1.5).

#### 4.3.5 Schedules around a stream

| Need | Form |
| --- | --- |
| "Live" badge, disabled composer | the lane's `connection`, in a guard or view |
| The transport is half-open | the adapter's heartbeat: no pong, so `down` and reconnect |
| "No message for a minute" (an app-level quiet) | a schedule with `armOn: [Flow.entry, E.Message]` |
| Backoff after a terminal failure, a give-up budget | a schedule and memory (4.3.4) |
| A stalled generation | inside the commit (`Stream.timeout`), or a schedule that runs `gen.cancel(key)` |
| Per-user expiry from presence deltas | a keyed schedule (2.7.10); usually the server's job |

### 4.4 The layers: who owns what, and what crosses

| Layer | Owns | Rules |
| --- | --- | --- |
| **The adapter** (author code and services) | transports, auth, heartbeats, close codes into errors, reconnect loops and backoff, resume messages, buffers and their overflow, terminators | — (Flow's contract with it is 4.1.2) |
| **Operations: the stream** | the descriptor and `delivers`; the `Session` vocabulary; the session's life, lane and `connection`; continuity decided per connection; endings and their classification; pulling (`every`) or draining (`latest`); progress of streaming writes | 39–43, 48 |
| **Entity domains: `listen`** | applying each push to the store, in order; pushes as observations; gaps as reconnect causes that lower frontiers | 49 |
| **Machines** | owning a session through an activity; mapping deliveries onto events at admission; discarding released sessions' deliveries; resume through memory; reconnect decisions as states and schedules; checks | 44–47, 50, 51 |

What crosses each boundary:

| From → to | What crosses | Never crosses |
| --- | --- | --- |
| adapter → operation | elements (values) and `Session` signals, in order; the Stream's `Exit` | close codes, `readyState`, HTTP status (unless the adapter put them in its own reasons) |
| operation → entity layer | each value of an `every` session, in order; each gap (with its reason) | lane coalescing; connection changes |
| operation → machine | the lane (`data`, `connection`, tags) for guards and views; deliveries (value, gap, ending) for the mailbox | the adapter's position; progress events (progress is a lane read) |
| machine → operation | `params` (including a resume position) when a session starts; release by leaving, key change or `when` | anything mid-session: a running session keeps its parameters |
| entity layer → machine | records and answers (`Entity.get`, answer lanes with `stale` causes) | the push itself, unless the machine also maps `value` |

## 5. Rules

Provisional, numbered after merge 4's 38.

39. **`delivers` is declared.** A stream descriptor declares `delivers: "every" | "latest"`. An `every` value is a
    fact: Flow never coalesces, skips or equality-suppresses it. A `latest` value is the current state: Flow may
    coalesce it, and equal values are silent under `Equal.equals`.
40. **The `Session` vocabulary.** `subscribe` returns a Stream of values and `Session` signals (`open`, `resumed`,
    `gap(reason)`, `down(reason)`). Flow reads only which signal came; reasons are the adapter's information. The first
    value of a session with no signal before it is an `open`. After a `down`, only `open`, `resumed` or `gap` re-open;
    a value while down changes the data, not the connection.
41. **Continuity at every open.** On an `every` stream, each open that is not `resumed` delivers a gap before any of
    that connection's values: the adapter's reason after `gap`, Flow's `Unproven { why: "Opened" | "Reconnected" }`
    after `open`. The first open counts. An adapter that drops data (a buffer overflow) must emit `gap`. `latest`
    streams deliver no gaps.
42. **A session ends as a read.** `complete`, or `failure` with the author's error, `Defect` (with an issue) or
    `Interrupted`, classified from the whole `Cause` outside the session's fiber. A planned release delivers nothing.
    There is no unknown channel.
43. **Flow never re-opens a session** (extends rule 25). The adapter may reconnect inside one session, reporting `down`
    and the next open. A session that ended re-opens only when its activity starts again (re-entry, key change, `when`
    turning true, restore).
44. **A session belongs to its activity's activation.** Its deliveries are mapped at admission; a delivery whose session
    was released is discarded at admission with evidence, never routed late. Rule 8's "deliveries are never lost"
    covers a live session's deliveries.
45. **Resume through parameters.** A stream's key names the feed; parameters outside it (a resume position) are read
    when a session starts, from the after memory (rule 22), and kept while it runs. Flow keeps no cursor and dedups
    nothing.
46. **Delivery order and pace.** Deliveries join the actor's FIFO mailbox (P21). An `every` session has one delivery
    waiting; its next element is pulled after that delivery's turn commits, so values, gaps and the ending keep the
    adapter's order. A `latest` session has at most one waiting, whose payload is the lane's data at admission;
    admission discards it if that equals the last mapped value.
47. **Duplicate sessions end, never wait.** A second same-actor session for the same descriptor and key does not open:
    the second activity's lane is `Failure` with Flow's reason `DuplicateSession`, delivered on `failure`. `flow check`
    warns when two activities of one machine on one descriptor can be active at once, and then requires
    `DuplicateSession` mapped. **Revision (multiplicity audit, 2026-10-31) (M6-D7).** The same holds inside one keyed activity (the design's
    2.7.10): two keys whose params project one descriptor key give the later key's lane `DuplicateSession`; `flow
    check` requires it mapped on a keyed activity whose descriptor key is not the activity key itself.
48. **Progress of a streaming write.** A transaction may declare a `progress` Schema; its commit's context has
    `progress(value)`, latest-wins and non-blocking. **Revision (multiplicity audit, 2026-10-31) (M6-D5).** The lane row's `progress` in `s.calls`
    reads the addressable Attempt's last progress, so `progress` may be declared only with `reject`, `latest` or
    `cancel` (the design's rule N2); it is cleared when the ending's turn is admitted; every ending mapper's context
    carries the last `progress` of its own Attempt. Progress is never persisted and never an ending; the ending carries
    the whole result.
49. **`listen` keeps the store coherent, not complete.** A `listen` entry requires an `every` stream. Each push is
    applied at arrival, in order, before the next is pulled. Pushes never join record queues and clear no `uncertain`
    mark. A gap (including `Unproven`) is a reconnect cause: covered answers whose request started before that open have
    their frontier lowered (subscribed ones refetch, the rest go stale). `resumed` lowers nothing. Log replay, offline
    catch-up and completeness belong to a sync engine (SE). **Revision (multiplicity audit, 2026-10-31) (M6-D6).** Each live session of a `listen`
    entry is its own source: two actors in one Runtime that subscribe one entry on one key hold two sessions, every
    push of either is applied (idempotently), and either session's gap lowers the frontiers it covers. `flow check`
    warns (`DuplicateListen`) when two actors' activities can hold such sessions at once; one actor owns the session
    and the others read the store.
50. **Required mappings** (extends rules 20 and 37). An activity on a non-`listen` `every` stream must map `value` and
    `gap` (type errors). `failure` maps every author tag plus `Defect` and `Interrupted`; `DuplicateSession` where rule
    47 says it can occur. Each delivery is handled totally in every state under the activity's owner.
51. **What survives reload and handover.** A persisted stream's latest data survives with its persisted actor
    (PER:32-33); the restored lane is `Running`, `connection: "Opening"`, with that data, until the fresh session
    opens. Queued deliveries and progress are not persisted: the new session's continuity covers them (rule 41), and
    resume comes from persisted memory (rule 45). A handover restores the same way (MT:334).

## 6. Changes

### 6.1 Added

| Added | Kind | Meaning |
| --- | --- | --- |
| `delivers: "every" \| "latest"` | descriptor option, required | rule 39 |
| `Session.open`, `.resumed`, `.gap`, `.down`, `Session.Signal` | adapter vocabulary | rule 40 |
| `Session.reconnect({ connect, position, schedule, while })` | adapter combinator | 4.1.3 (open question Q1) |
| `connection`, `down` on a `Running` stream lane | lane fields | 4.1.5 |
| `outcomes.gap` | stream mapping | rules 41, 50 |
| `Unproven { why }`, `DuplicateSession` | Flow reasons | rules 41, 47 |
| `progress` Schema, `progress(value)`, the lane row's `progress` in `s.calls`, mapper `progress` | streaming writes | rule 48 (Revision (multiplicity audit, 2026-10-31): was `x.progress(g \| s, key)`) |
| `DuplicateListen` | `flow check` warning | rule 49 (Revision (multiplicity audit, 2026-10-31)) |
| `session` and `delivery` evidence | Inspection | 6.4 |

### 6.2 Changed

| Changed | Before | Now |
| --- | --- | --- |
| Delivery semantics | chosen by whether `value` is mapped (OPS:126-130) | chosen by `delivers` (rule 39) |
| Stream outcomes | `value`, `complete`, `failure`, `defect`, `interrupt`; values only (MCH:139-140, OPS:70) | `value`, `gap`, `complete`, `failure` with `Defect`/`Interrupted`; mappers `(value, { params, key })` |
| Duplicate session | lane undefined, activity waits (OPS:122-124) | `Failure` with `DuplicateSession` (rule 47) |
| Lane of a re-opened session | unstated (OPS:131-133) | starts with the previous data, `connection: "Opening"` (4.1.5) |
| "Reconnect" in EntityDomains | the browser's connection restored (EDP:82) | that, or a `listen` connection opened without proof (rule 49) |
| Deliveries after release | "facts from an ended activation are discarded" (RT:88-90) | discarded at admission with evidence; the next session's continuity says what it missed (rule 44) |
| A key's parameters | "include every parameter affecting the result" (OPS:41-42) | for a stream, the key names the feed; a resume position stays outside it (rule 45) |

### 6.3 Removed

| Removed | Was | Why |
| --- | --- | --- |
| `defect` and `interrupt` stream outcome keys | MCH:139-140 | rule 42, as C2 did for commits |
| "Without value mapped, lane updates may coalesce …; slow readers may skip" | OPS:129-130 | rule 39 |
| "Stream buffering integration" as a build-time choice | OPS:204 | rules 41, 46: pace is Flow's, buffers are the adapter's; only the mechanics stay deferred |

### 6.4 Amendments by target

The `.plan` files change only when this proposal is accepted (D14).

**`Operations.plan`**

| Where | Amendment |
| --- | --- |
| O1 (OPS:11-17) | `stream({ id, key?, delivers, subscribe, result?, persist? })`; `subscribe(params, { signal })` returns a Stream of values and `Session` signals |
| O1 (OPS:41-43) | add: "A stream's key names its feed; a parameter that only says where a session starts (a resume position) stays outside it" |
| O3 (OPS:79-84) | a transaction may declare `progress`; the commit's context gains `progress(value)` (rule 48) |
| O4 (OPS:120-124) | duplicate sessions per rule 47 |
| O4 (OPS:126-130) | replace with rules 39, 41 and 46 (operation side: pulling, draining, continuity) |
| O4 (OPS:130-134) | endings per rule 42; re-opening per rule 43; a new session's starting lane per 4.1.5 |
| O6 (OPS:166-169) | `Running` carries `connection` and `down`; progress reads for transactions (rule 48) |
| O7 (OPS:178-179) | a planned release ends a session with no delivery; adapter-reported interruption is `Interrupted` on `failure` |
| Q1 (OPS:204) | "Choose stream buffering integration" becomes "Choose the pulling and draining mechanics of rule 46" |

**`Machines.plan`**

| Where | Amendment |
| --- | --- |
| O1 (MCH:39-40) | unchanged; noted: a stream's resume parameter may read memory or an earlier activity's lane |
| O6 (MCH:139-145) | stream outcomes per 6.2; required mappings per rule 50; "value fires only for a changed confirmed value" holds for resources and `latest` streams, not `every` |
| O6 (new sentences) | deliveries are mapped at admission and discarded when their session was released (rule 44); pace per rule 46 |
| O4 | guards read `activities.<name>.connection` (already `activities`; noted) |

**`machine-design.md`**

| Where | Amendment |
| --- | --- |
| 2.4 | add rules 39–51 |
| Rule 8 (MD:431-440) | "call endings, current and late" gains "and a live stream session's deliveries (rule 44)" |
| Rule 20 (MD:544-550) | stream mappings per rule 50 |
| Rule 25 (MD:609-610) | add "Flow never re-opens a stream session (rule 43)" |
| 2.5 step 1 (MD:651-661) | the FIFO list gains stream deliveries; a released session's delivery is discarded here (rule 44); a `latest` delivery reads the lane here |
| 2.7.2 (MD:888-907) | rows for a session's signals, its lane's `connection`, and progress |
| 2.7.6 (MD:1111-1117) | rows from 4.3.5 |
| P21 (MD:2130) | "User sends, call endings, stream deliveries, timer firings and `onContext` events queue together" |
| Section 7 item 9 (MD:2242) | closed by 4.1.8 |

**`EntityDomains.plan` and `entity-domain.md`**

| Where | Amendment |
| --- | --- |
| EDP O1 (EDP:59-60) | `listen(stream)` requires `delivers: "every"` |
| EDP O1 (EDP:82) | "Reconnect" defined per rule 49 |
| EDP O1 (new sentence) | rule 49's push rules: applied at arrival in order, no record queue, no `uncertain` clearing |
| EDP C1 (EDP:189-192) | add "no log replay or completeness from `listen`: a sync engine's (SE)" |
| ED 5.2 causes (ED:537-540) | "a reconnect" records which: browser connection or `listen` open |
| ED 5.3 (ED:568-576) | the ordered-stream precondition is rule 46's order; reconnects include rule 49's unproven opens |
| ED 5.5 (ED:594-595) | unchanged; noted: a replayed unversioned push self-heals by contest (4.2) |

**`Persistence.plan`**

| Where | Amendment |
| --- | --- |
| O2 (PER:32-33) | unchanged |
| O2 (PER:35-38) | queued stream deliveries and progress are not "pending outcomes" (rule 51) |
| O4 (PER:96-99) | the restored lane is `Running`, `connection: "Opening"`, with the retained data; resume per rule 45 |

**`Testing.plan`** (depends on merge 3; see 7.0)

| Where | Amendment |
| --- | --- |
| O2 (TST:42-44) | unchanged ("waits neither for an open stream to end"); add: adapter sleeps inside a session (`Session.reconnect`'s backoff) are pending deadlines, `kind: "operation"`, owner the session |
| O3 (TST:63-64) | pushes, drops and history loss are a stateful fixture's controls (merge 3 Q24) |

**`Inspection.plan`**

| Where | Amendment |
| --- | --- |
| O1 (INS:28-29) | "stream sessions in flight" gains, per session: `delivers`, `connection`, deliveries waiting, gaps so far |
| O4 (INS:86-88) | stream evidence: `session` (open, resumed, gap, down, end, with reasons) and `delivery` (queued, admitted, discarded with why) |
| CommandLine O5 | errors: rule 50's missing mappings (where not already type errors); `listen` over a `latest` stream. Warnings: rule 47's co-active activities on one descriptor; (Revision (multiplicity audit, 2026-10-31)) rule 49's `DuplicateListen`; an `every` activity under a state that history can re-enter without a resume parameter (deliveries discarded on leave, no position kept) |

**Outside the targets:** SE 4.2 (SE:182-185) loses its status-in-value workaround: the TanStack binding emits `down`
on `error` and `open` on `ready`, and SE open question 2 (SE:420-421) closes. DD's polling adapters (section 1.1) would
use `Session.reconnect` and take the cursor as a parameter.

## 7. The product-case walks

### 7.0 Story dependencies

The Stories use merge 3's `Fixture.stateful({ id, truth, controls, layer })`, `.control(fixture.name(payload))`,
`checkpoint.truth`, and its `advance` rule that runs non-turn work and admits no turn (M3:422-427, M3:450-457,
M3:556-563). Merge 3 is being revised: if those change, the Stories change spelling, not design. One addition is
needed there: an adapter's own sleep inside a session is a pending deadline, beside the kinds M3:547-551 lists.

### 7.1 Chat feed, Wi-Fi drop and resume

**The adapter.** `ChatSocket.messages({ roomId, after })` opens a WebSocket, sends `{ resume: after }`, and maps the
server's reply: `{ type: "resumed" }` → `Session.resumed()`; `{ type: "reset" }` → `Session.gap(new HistoryExpired())`.
Messages go through a bounded queue (overflow → `Session.gap(new Overflow())`). Close 4401 fails `SignedOut`; any
other close fails `Dropped { code }`; a missed pong closes and fails `Dropped`. The descriptor is 4.1.1's `messages`.

**The machine.**

```ts
export const Room = definition({
  id: "Chat/Room",
  states: ["LIVE", "LOST", "SIGNED_OUT", "OFFLINE"],
  events: { Send: { text: Schema.String } },
  internalEvents: {
    Message: { message: Message },
    Missed: { reason: Schema.String },
    CaughtUp: { messages: Schema.Array(Message) }, CatchUpFailed: {},
    SignedOut: {}, FeedLost: {}, RetryFeed: {},
  },
  memory: {
    roomId: Flow.input(Schema.String),
    messages: Flow.initial(Schema.Array(Message), []),
    lastSeq: Flow.initial(Schema.Number, 0),                                   // the handled position (4.3.2)
    feedTries: Flow.initial(Schema.Int, 0),
  },
  operations: { Chat },
})

export const RoomMachine = machine(Room, ({ S, E, O }) => {
  const catchUp = O.Chat.since.lookup(({ memory }) => ({ roomId: memory.roomId, after: memory.lastSeq }), {
    outcomes: { success: E.CaughtUp.from((v) => ({ messages: v.messages })), failure: { Defect: E.CatchUpFailed, Interrupted: E.CatchUpFailed } },
  })
  return {
    default: S.LIVE,
    on: {
      CaughtUp: { target: "self", updateMemory: ({ memory, event }) => mergeBySeq(memory, event.messages) },   // also late, after LIVE was left
      CatchUpFailed: { target: "self" },
    },
    states: {
      LIVE: {
        activities: { feed: /* 4.3.1 */ },
        on: {
          Message: [
            { target: "self", guard: ({ memory, event }) => !hasSeq(memory, event.message.seq) || deny("Seen"),
              updateMemory: ({ memory, event }) => mergeBySeq(memory, [event.message]) },   // sets lastSeq = max seq held
            { target: "self" },                                                // a replayed duplicate (rule 50: total)
          ],
          Missed: { target: "self", actions: [catchUp.fetch(({ memory }) => ({ roomId: memory.roomId, after: memory.lastSeq }))] },
          SignedOut: S.SIGNED_OUT,
          FeedLost: [/* 4.3.4 */],
          Send: { /* 4.3.1 */ },
        },
      },
      LOST: { /* 4.3.4 */ },
      SIGNED_OUT: {}, OFFLINE: {},
    },
  }
})
```

**The walk.** LIVE opens a session with `after: 0`. The server replays history and says `resumed`: no gap, 40
`Message` turns, `lastSeq` 40. Wi-Fi drops: the socket closes 1006, the adapter fails `Dropped`, `Session.reconnect`
emits `down`; the lane is `Down` and `Send` is denied `Offline`. A message 41 is posted meanwhile. After 500 ms the
adapter reconnects with `after: 40`; the server replays 41 and says `resumed`; one `Message` turn. If the server had
restarted and lost its log, it says `reset`: `Missed` arrives before any new value, `catchUp` reads since 40, and
`CaughtUp` merges by seq.

**The Story.**

```ts
const chat = FakeChat({ history: 40 })   // Fixture.stateful: truth { messages, connects }, controls { post, drop, loseLog }
export const wifiDrop = story
  .machine(RoomMachine, { id: "Chat/wifi-drop", input: { roomId: "r1" }, fixtures: chat })
  .process()                                         // opens, resumed, 40 messages
  .control(chat.drop({})).process()                  // Dropped → down
  .checkpoint("down")
  .control(chat.post({ text: "while away" }))        // seq 41: server truth only
  .advance("500 millis").process()                   // backoff sleep (a pending deadline), reconnect, replay 41
  .checkpoint("back")
// down.snapshot.activities.feed.connection → "Down"; check(down.snapshot, E.Send({ text: "x" })) → Denied Offline
// back.truth.FakeChat.connects → [{ after: 0 }, { after: 40 }]        the resume cursor, asserted on the server side
// back.snapshot.memory.lastSeq → 41; back.evidence has no gap delivery
```

**What this walk changed.** (1) A first draft decided continuity per session and reported a gap on every new session;
with a cursorless server, a `Missed` handler that re-entered LIVE re-opened, reported a gap, and looped. Continuity is
now judged per connection against the position the connection started from (4.1.4), and the recipe reads in place.
(2) The same draft had no gap at the first open; a cursorless server then loses what was said between the history read
and the socket opening, so the first open counts (rule 41). (3) Dedup by `seq > lastSeq` drops message 42 when a live
43 lands before the catch-up's 42; dedup is by id (`hasSeq`, `mergeBySeq`).

### 7.2 Live presence

**The adapter folds deltas.** The server sends a full `presence_state` on each connection, then `presence_diff`s. The
adapter folds them with `Stream.scan` into a set, resetting at each connection, and emits the set: a `latest` stream.

```ts
export const presence = stream({ id: "chat/presence", key: (p: { roomId: string }) => p, delivers: "latest", subscribe: (p) => Session.reconnect({ connect: () => PresenceSocket.use((s) => s.members(p.roomId)), position: () => undefined, schedule: backoff, while: isDrop }) })
ROOM: { activities: { here: O.Chat.presence.subscribe(({ memory }) => ({ roomId: memory.roomId })) } }   // no outcomes: views read the lane
```

```tsx
const here = useView(room, (s) => s.activities.here)
<Avatars members={here?.data ?? []} dimmed={here?.connection !== "Open"} />   // while Down, presence is unknown: say so
```

**The walk.** Joins and leaves coalesce into lane publications; no turns run. On a drop the lane is `Down` with the
last set and the view dims it. On reconnect the full state replaces the set. No gap is delivered: the next value is the
truth.

**The Story.** `FakePresence` controls `{ join, leave, drop }`: `.control(p.join({ user: "ana" })).process()`, then
`checkpoint("joined")` reads `snapshot.activities.here.data`; `.control(p.drop({})).process()` reads `connection:
"Down"` with the set retained.

**What this walk changed.** As deltas mapped to machine events, presence would be an `every` stream whose gaps must
refetch the whole set; folding in the adapter makes it `latest` and removes that workflow. The design now recommends
folding deltas into state in the adapter whenever the source sends a full state on connect.

### 7.3 Stock ticker

```ts
WATCHING: {
  activities: { price: O.Market.quote.subscribe(({ memory }) => ({ symbol: memory.symbol }), { outcomes: { value: E.Price.from((q) => ({ last: q.last })) } }) },
  on: {
    Price: [
      { target: "self", guard: ({ memory, event }) => event.last >= memory.alertAt || deny("Below"), updateMemory: () => ({ alerted: true }) },
      { target: "self" },
    ],
  },
},
```

**The walk.** At 1,000 ticks a second, the adapter's Stream is drained into the lane; publications coalesce; at most
one `Price` waits in the mailbox and reads the newest quote at admission, so the machine runs about one turn per
admission. A crossing that goes and returns between two admissions is not seen: correct for a state feed, and an
alert that must never be missed is a server-side event feed. A quiet market repeats equal quotes, which are silent;
liveness is the adapter's heartbeat, so a dead socket shows as `Down`, not as a flat price. After the laptop sleeps, a
persisted ticker restores `Running`, `Opening`, with the old quote (rule 51), and the view shows it as not live. A
quote's own timestamp says how old it is.

**The Story.** `FakeQuotes` controls `{ tick, drop }`: three `tick`s then one `process()` give one `Price` turn with
the third quote; `.control(q.drop({}))` then `advance` past the backoff shows `Down`, then `Open`.

**What this walk changed.** A first draft armed a "stale" schedule on each `Price`; equality suppression made a flat
market look stale. Liveness moved to the adapter's heartbeat (4.3.5), and a `receivedAt` lane field was dropped in
favour of the source's timestamp.

### 7.4 LLM tokens from a `fetch` body, and a cut-off answer

The transaction is 4.1.8's `generate`.

```ts
const gen = O.Assistant.generate.commit(({ memory }) => ({ conversationId: memory.conversationId, prompt: memory.draft }), {
  outcomes: {
    success: E.Answered.from((v) => ({ messageId: v.messageId, text: v.text })),
    failure: { Busy: E.TryLater, Refused: E.TryLater, NotSent: E.TryLater },
    unknown: E.AnswerUnsure.from((r, { progress, attempt }) => ({          // ← NEW: progress in the context
      partial: progress?.text ?? "", stopped: r._tag === "Cancelled", clientMessageId: attempt.id })),
  },
})
const conv = ({ memory }) => ({ conversationId: memory.conversationId })
ASKING:   { on: { Stop: { target: "self", actions: [gen.cancel(conv)] }, Answered: S.IDLE, TryLater: S.IDLE,
                  AnswerUnsure: [{ target: S.IDLE, guard: ({ event }) => event.stopped || deny("NotStopped"), updateMemory: keepPartial }, { target: S.CHECKING, updateMemory: keepPartial }] } },
CHECKING: { on: { /* a read of the conversation by clientMessageId: the stored full answer, or "cut off" */ } },
```

```tsx
const text = useView(chat, (s) => s.calls.Assistant.generate.find((l) => l.key.conversationId === conversationId)?.progress?.text)   // ← NEW read: the answer so far (Revision (multiplicity audit, 2026-10-31): a lane row field)
```

**The walk.** `Ask` starts the write; the commit reads the body as it arrives and reports the text so far; the view
re-renders per publication, never per token, and no turn runs per token. `[DONE]` ends it `success` with the whole
text. A proxy closing the body cleanly without `[DONE]` ends it `unknown(CutOff)`: the server may have stored a full
answer, so CHECKING reads the conversation by the client message id the commit put on the wire. Stop cancels:
`unknown(Cancelled)` with the partial text from `progress`; the server may keep generating, and no browser API says.

**The Story.** `FakeAssistant({ tokens: ["Hel", "lo"], every: "100 millis", cut: true })`: `.send(E.Ask())
.advance("100 millis").checkpoint("first")` reads `first.snapshot.calls.Assistant.generate[0]?.progress?.text` → `"Hel"`;
`.advance("100 millis").process()` ends without `[DONE]`: the `ending` entry is `channel: "unknown"`, reason `CutOff`,
and the snapshot is in CHECKING with `partial: "Hello"`.

**What this walk changed.** Stop left nothing to show: Flow's `Cancelled` carries no author data and the lane's
progress is cleared at admission. Every ending mapper's context gained `progress` (rule 48).

### 7.5 Upload progress

```ts
export const upload = transaction({
  id: "uploads/put", key: (i) => ({ ref: i.ref }), concurrency: "reject",   // Revision (multiplicity audit, 2026-10-31): was "allow"; one lane per upload is one call (rule 48)
  progress: Schema.Struct({ loaded: Schema.Number, total: Schema.NullOr(Schema.Number) }),   // ← NEW
  commit: (input, { attempt, signal, progress }) => Uploader.use((u) => u.put(input, { idempotencyKey: attempt.id, signal })).pipe(
    Stream.runForEach((e) => e._tag === "Progress" ? progress({ loaded: e.loaded, total: e.total }) : Effect.void),   // the XHR service turns onprogress into a Stream
    Effect.flatMap(() => /* the final response */ …)),
})
```

The machine is 2.7.7's `put` (MD:1197-1206) unchanged, plus a view read
`s.calls.Uploads.upload.find((l) => l.key.ref === ref)?.progress` (Revision (multiplicity audit, 2026-10-31)). Under `allow`, picking one file twice
would put two Attempts on one lane and the bar would show whichever started last; keyed per upload and `reject`, each
upload's row is its own, and a second pick of the same `ref` while one is sending is `Rejected`. **The walk.**
Progress rises; the XHR fires `error` at 100 %: `unknown(NoResponse)`, because bytes handed to the stack prove nothing,
and the clean-up is keyed by the Attempt, as today. **The Story.** `FakeUploader({ chunks: 4, every: "250 millis" })`
with control `drop`: `advance("500 millis")` reads `{ loaded: 50, total: 100 }`; `.control(u.drop({})).process()`
gives the `UploadUnsure` ending and CLEANING.

**What this walk changed.** A synchronous `progress` callable from DOM callbacks was considered; it would run outside
Effect. `progress` stays an Effect, and the service turns the XHR's callbacks into a Stream, as Effect services
already do.

### 7.6 `listen` feeding entity records, with a reconnect

The domain and activity are 4.2's. **The walk.** The queue loads the ticket list (request started at t0). The socket
opens at t1 with `open`: `Unproven { why: "Opened" }`, a reconnect cause; the list's request started before t1, so it
refetches once (`repair` evidence, cause "reconnect: listen"). Another dispatcher saves t3: the push changes the base,
and the ordered list repairs by its rules. The socket drops (`down`); meanwhile t2 is deleted on the server. The
adapter reconnects: `open` again, `Reconnected`; the list and every subscribed answer covering `Ticket` refetch, and t2
leaves. A rename of t1 whose send ended unknown before the drop keeps t1 `uncertain` through every push (rule 49); the
forced repair still runs (rule 30).

**The Story.**

```ts
const server = FakeTickets({ tickets: ["t1", "t2", "t3"] })   // controls { externalSave, externalDelete, drop }
export const listenReconnect = story
  .machine(QueueMachine, { id: "Queue/listen-reconnect", input: { workspaceId: "w1" }, fixtures: server })
  .process()                                                       // list loads; the listen opens; one refetch
  .control(server.drop({})).process()
  .control(server.externalDelete({ ticketId: "t2" }))              // truth only: the socket is down
  .advance("500 millis").process()                                 // reconnect, Unproven, the list refetches
  .checkpoint("healed")
// Domain.entry.get(healed, { workspaceId: "w1" }).data → t1, t3; healed.truth.FakeTickets.tickets → t1, t3
```

**What this walk changed.** (1) A first draft lowered frontiers only on re-opens; a ticket edited between the list's
read and the socket's open stayed stale, so the first open counts (G10). (2) A draft recipe had the listen subscribe
from a cursor in the list's response to skip that refetch; that is log replay into the store, which the scope note
puts behind a sync engine, so it went, and its cost is stated instead (4.2).

### 7.7 Third-party SDKs

The walks above use Effect-native services. These four wrap real SDKs against the same contract. Each follows one
pattern:

- **The service owns the SDK.** An Effect service (`Context.Service`) wraps the SDK and exposes an Effect `Stream` of
  the author's own parts and tagged errors. The SDK's types, status codes and close reasons stop at the service: the
  operation, Flow and the machine never see them. The service is where the author reads the SDK's errors.
- **Cancellation is Effect interruption.** An abort signal is the commit's `signal` (aborted when Flow interrupts
  the commit, MD:904), or an `unsubscribe`/`removeChannel` in an `Effect.acquireRelease` finalizer that runs when
  the session's scope closes.
- **A Story replaces the service, not the SDK.** A fixture is a Layer for the same service (TST:54-56), so no Story
  fakes an SDK object.
- **Two sources are writes, two are streams.** An LLM completion is a POST that costs money and can be cut off, so
  OpenAI and the Vercel AI SDK are transactions with `progress` (4.1.8). Supabase realtime and Firestore are streams.

**Verified against Effect 4.0.5** (`node_modules/effect/src`):
- `Stream.fromAsyncIterable(iterable, onError)` (Stream.ts:1334). Its finalizer calls the iterator's `return()` when
  the stream is interrupted (Channel.ts:1995-2012).
- `Stream.callback(f, { bufferSize, strategy })` (Stream.ts:725). `f` may use `Scope`, and its buffer defaults to
  unbounded. `Queue.offerUnsafe` returns `false` when a `"dropping"` queue is full (Queue.ts:801-818).
  `Queue.failCauseUnsafe` (Queue.ts:1262) is used with `Cause.fail` (Cause.ts:500).
- `Stream.unwrap` removes `Scope`, so resources acquired in it live as long as the stream (Stream.ts:1704-1706).
- `Effect.acquireRelease` (Effect.ts:13366) and `Effect.tryPromise` (Effect.ts:1441).
- `Effect.catchTag` (Effect.ts:4639), `Stream.runForEach` (Stream.ts:20351), `Stream.flatMap` (Stream.ts:2853) and
  `Stream.fail` (Stream.ts:844).
- `Stream.merge` (Stream.ts:4120) and `Stream.fromQueue` (Stream.ts:1185).
- `Layer.succeed(Service, impl)` (Layer.ts:1036-1058) and `class X extends Context.Service<X, Shape>()("id")`
  (Context.ts:180-209).

**SDK details from memory, not verified.** No SDK is installed in this repository, so these are unchecked; check them
against the SDK versions when the reference app adopts one:
- **OpenAI:** chunk shape `choices[0].delta.content` / `finish_reason`; the error classes `RateLimitError`,
  `APIError.status`, `APIConnectionError`; `create(…, { signal })`; the stream's `return()` aborting the request.
- **Vercel AI SDK:** `streamText` returning synchronously; `fullStream` part names (`text-delta` with `text` in v5,
  `textDelta` in v4; `finish`; `error`); errors arriving as parts instead of throwing; `APICallError.statusCode`.
- **Supabase:** the `subscribe` status strings (`SUBSCRIBED`, `CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED`); realtime-js
  rejoining channels by itself after a socket drop; `payload.eventType`, `.new` and `.old`.
- **Firestore:** the `onSnapshot(query, options, next, error)` overload; `includeMetadataChanges`;
  `metadata.fromCache`; `error.code`.

#### 7.7.1 The OpenAI Node SDK (a write)

```ts
// llm.service.ts: the SDK stops here
export type LlmPart = { readonly _tag: "Text"; readonly text: string } | { readonly _tag: "Finished"; readonly reason: string }
export class LlmBusy extends Data.TaggedError("LlmBusy")<{ readonly retryAfterMs?: number }> {}
export class LlmRefused extends Data.TaggedError("LlmRefused")<{ readonly status: number }> {}       // the server answered no
export class LlmNoResponse extends Data.TaggedError("LlmNoResponse")<{}> {}                          // no response: it may have reached the server
export class LlmBodyBroken extends Data.TaggedError("LlmBodyBroken")<{}> {}                          // the body broke after the headers
export type LlmError = LlmBusy | LlmRefused | LlmNoResponse | LlmBodyBroken

export class Llm extends Context.Service<Llm, {
  readonly complete: (req: { readonly prompt: string }, signal: AbortSignal) => Stream.Stream<LlmPart, LlmError>
}>()("app/Llm") {}

const classify = (e: unknown, phase: "request" | "body"): LlmError =>      // the author reads the SDK; Flow reads none of it
  e instanceof OpenAI.RateLimitError ? new LlmBusy({ retryAfterMs: retryAfterMs(e.headers) })
  : e instanceof OpenAI.APIError && e.status !== undefined ? new LlmRefused({ status: e.status })
  : phase === "request" ? new LlmNoResponse({}) : new LlmBodyBroken({})

export const OpenAiLlm = (client: OpenAI) => Layer.succeed(Llm, {
  complete: (req, signal) => Stream.unwrap(
    Effect.tryPromise({
      try: () => client.chat.completions.create(
        { model: "gpt-4o-mini", messages: [{ role: "user", content: req.prompt }], stream: true },
        { signal }),                                                        // the commit's signal: Flow's cancel aborts the request
      catch: (e) => classify(e, "request"),
    }).pipe(Effect.map((chunks) =>
      Stream.fromAsyncIterable(chunks, (e) => classify(e, "body")).pipe(  // interruption calls return(): the SDK aborts
        Stream.flatMap((chunk) => Stream.fromIterable(toParts(chunk))))))),   // content → Text; finish_reason → Finished
})

// assistant.operations.ts: the commit sees only LlmPart and LlmError
export const ask = transaction({
  id: "assistant/ask",
  input: Schema.Struct({ conversationId: Schema.String, prompt: Schema.String }),
  key: (i) => ({ conversationId: i.conversationId }),
  progress: Schema.Struct({ text: Schema.String }),
  concurrency: "reject",
  commit: (input, { signal, progress }) => Effect.gen(function* () {
    let text = ""
    let finished: string | undefined
    yield* Llm.use((llm) => Stream.runForEach(llm.complete({ prompt: input.prompt }, signal), (p) => {
      if (p._tag === "Finished") { finished = p.reason; return Effect.void }
      text += p.text
      return progress({ text })
    })).pipe(
      Effect.catchTag("LlmNoResponse", (e) => Outcome.unknown(e)),
      Effect.catchTag("LlmBodyBroken", (e) => Outcome.unknown(e)))          // LlmBusy, LlmRefused stay failures (MD:811-812)
    if (finished === undefined) return yield* Outcome.unknown(new CutOff({}))   // a clean end with no finish_reason
    return { text, truncated: finished === "length" }                        // "length" is an answer, cut by max_tokens: information
  }),
})
```

- **Session signals:** none. A write has no connection; the Attempt's lane is its status (`pending`, `progress`).
- **Idempotency:** chat completions take no idempotency key (from memory), so `attempt.id` has nowhere to go and a
  `retry` after `unknown` could pay twice. The machine of 7.4 shows the partial text and offers a new question. It
  does not `retry`. The author decides this because only the author knows the API (rule 19).
- **Fixture:**

```ts
export const FakeLlm = (o: { tokens: ReadonlyArray<string>; every: Duration.Input; finish?: string }) =>
  Layer.succeed(Llm, {
    complete: () => Stream.fromIterable([
      ...o.tokens.map((text) => ({ _tag: "Text" as const, text })),
      ...(o.finish === undefined ? [] : [{ _tag: "Finished" as const, reason: o.finish }]),   // omit finish: a cut-off
    ]).pipe(Stream.flatMap((p) => Stream.fromEffect(Effect.as(Effect.sleep(o.every), p)))),   // controlled-clock sleeps
  })
// story: .send(E.Ask()).advance("100 millis") → snapshot.calls.Assistant.generate[0]?.progress?.text === "Hel"; finish omitted → ending unknown CutOff
```

#### 7.7.2 The Vercel AI SDK (a write, the same service)

```ts
export const VercelLlm = (model: LanguageModel) => Layer.succeed(Llm, {
  complete: (req, signal) => Stream.unwrap(Effect.sync(() => {
    let answered = false                                                   // whether any part arrived: the request reached a server
    const result = streamText({ model, prompt: req.prompt, abortSignal: signal })   // the commit's signal
    return Stream.fromAsyncIterable(result.fullStream, (e) => classifyAi(e, answered)).pipe(
      Stream.flatMap((part) => {
        answered = true
        switch (part.type) {
          case "text-delta": return Stream.succeed({ _tag: "Text" as const, text: part.text })
          case "finish": return Stream.succeed({ _tag: "Finished" as const, reason: part.finishReason })
          case "error": return Stream.fail(classifyAi(part.error, answered))   // errors arrive as parts, not throws
          default: return Stream.empty
        }
      }))
  })),
})
const classifyAi = (e: unknown, answered: boolean): LlmError =>
  APICallError.isInstance(e) && e.statusCode === 429 ? new LlmBusy({})
  : APICallError.isInstance(e) && e.statusCode !== undefined ? new LlmRefused({ status: e.statusCode })
  : answered ? new LlmBodyBroken({}) : new LlmNoResponse({})
```

- **The same `Llm` service, so `ask` and its machine do not change.** Changing the SDK means changing the Layer.
- **`fullStream`, not `textStream`.** `textStream` yields text only. A clean end then looks the same as a cut, and
  the commit cannot tell a complete answer from a truncated one (GAPS, "fetch body", "Unknown"). `fullStream`'s
  `finish` part is the terminator.
- **Fixture:** `FakeLlm` (7.7.1), unchanged.

#### 7.7.3 Supabase realtime (a stream feeding entity records)

```ts
export type TicketChange = { readonly _tag: "Saved"; readonly row: TicketRow } | { readonly _tag: "Deleted"; readonly key: { readonly id: string } }
export class RealtimeDown extends Data.TaggedError("RealtimeDown")<{ readonly status: string; readonly message?: string }> {}   // a down reason
export class Overflow extends Data.TaggedError("Overflow")<{}> {}                                                             // a gap reason
export class RealtimeClosed extends Data.TaggedError("RealtimeClosed")<{}> {}                                                 // ends the session
export class SignedOut extends Data.TaggedError("SignedOut")<{}> {}

export class TicketFeed extends Context.Service<TicketFeed, {
  readonly changes: (workspaceId: string) => Stream.Stream<TicketChange | Session.Signal<RealtimeDown, Overflow>, RealtimeClosed | SignedOut>
}>()("app/TicketFeed") {}

export const SupabaseTicketFeed = (supabase: SupabaseClient) => Layer.succeed(TicketFeed, {
  changes: (workspaceId) => Stream.callback<TicketChange | Session.Signal<RealtimeDown, Overflow>, RealtimeClosed | SignedOut>((queue) => {
    let lost = false
    const offer = (item: TicketChange | Session.Signal<RealtimeDown, Overflow>) => {   // rule 41: a dropped push becomes a gap, in order
      if (lost) lost = !Queue.offerUnsafe(queue, Session.gap(new Overflow()))
      if (!lost) lost = !Queue.offerUnsafe(queue, item)
    }
    const fail = (e: RealtimeClosed | SignedOut) => Queue.failCauseUnsafe(queue, Cause.fail(e))
    return Effect.all([
      Effect.acquireRelease(                                               // the channel lives exactly as long as the session
        Effect.sync(() => supabase
          .channel(`tickets:${workspaceId}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "tickets", filter: `workspace_id=eq.${workspaceId}` },
            (p) => offer(p.eventType === "DELETE" ? { _tag: "Deleted", key: { id: p.old.id } } : { _tag: "Saved", row: p.new }))
          .subscribe((status, err) => {                                    // the SDK's own status: the Session signals
            if (status === "SUBSCRIBED") offer(Session.open())             // no replay: every (re)join is unproven (rule 41)
            else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") offer(Session.down(new RealtimeDown({ status, message: err?.message })))
            else if (status === "CLOSED") fail(new RealtimeClosed({}))     // after release the queue is already done: a no-op
          })),
        (channel) => Effect.promise(() => supabase.removeChannel(channel))),
      Effect.acquireRelease(                                               // "signed out" comes from another SDK API, read by the author
        Effect.sync(() => supabase.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT") fail(new SignedOut({})) })),
        ({ data }) => Effect.sync(() => data.subscription.unsubscribe())),
    ])
  }, { bufferSize: 1024, strategy: "dropping" }),                        // dropping, so offerUnsafe reports the loss (Queue.ts:801-818)
})

// tickets.operations.ts and the domain
export const ticketChanges = stream({
  id: "tickets/changes",
  key: (p: { workspaceId: string }) => p,
  delivers: "every",
  subscribe: (p) => Stream.unwrap(TicketFeed.useSync((f) => f.changes(p.workspaceId))),   // no Session.reconnect: the SDK rejoins by itself
})
changes: listen(ticketChanges).as([Ticket], (c) => c._tag === "Saved" ? Ticket.save(c.row) : Ticket.delete(c.key)),
```

- **Signals come from the SDK's status callback.** realtime-js rejoins after a socket drop (from memory), so this is
  4.1.3's "a source that reconnects by itself": `CHANNEL_ERROR`/`TIMED_OUT` is `down`, and the next `SUBSCRIBED` is
  an `open`. `postgres_changes` replays nothing, so every rejoin is `Unproven`, and the store lowers the covered
  answers (rule 49). Applying pushes and refetching after a rejoin is all the store does. Catching up on missed rows
  from a log would be a sync engine's job (SE).
- **Classification:** whether a `CHANNEL_ERROR` was caused by the network or by row-level security is not in the
  status. The author keeps it as `down` and takes "signed out" from the auth client instead. Flow reads neither.
- **Versions:** a row with no version column makes this `listen` over an unversioned entity, which `flow check` warns
  about (EDP:123-124). A `version` column fixes that.
- **Fixture:**

```ts
export const FakeTicketFeed = Fixture.stateful({                           // merge 3's constructor (7.0)
  id: "FakeTicketFeed",
  truth: TicketTruth,
  controls: { change: TicketChangeSchema, drop: Schema.Struct({}), rejoin: Schema.Struct({}) },
  layer: (truth, controls) => Layer.succeed(TicketFeed, {
    changes: () => Stream.succeed(Session.open()).pipe(Stream.concat(Stream.merge(
      Stream.fromQueue(controls.change).pipe(Stream.tap((c) => applyToTruth(truth, c))),   // truth first, then the push (TST:63-64)
      Stream.merge(
        Stream.fromQueue(controls.drop).pipe(Stream.map(() => Session.down(new RealtimeDown({ status: "CHANNEL_ERROR" })))),
        Stream.fromQueue(controls.rejoin).pipe(Stream.map(() => Session.open())))))),
  }),
})
// story: .control(feed.drop({})).control(feed.rejoin({})).process() → the list refetches (repair cause "reconnect: listen")
```

#### 7.7.4 Firebase `onSnapshot` (a `latest` stream)

```ts
export class FromCache extends Data.TaggedError("FromCache")<{}> {}        // a down reason: the SDK serves its local cache
export class MembersDenied extends Data.TaggedError("MembersDenied")<{}> {}
export class MembersFailed extends Data.TaggedError("MembersFailed")<{ readonly code: string }> {}

export class Rooms extends Context.Service<Rooms, {
  readonly members: (roomId: string) => Stream.Stream<ReadonlyArray<Member> | Session.Signal<FromCache, never>, MembersDenied | MembersFailed>
}>()("app/Rooms") {}

export const FirestoreRooms = (db: Firestore) => Layer.succeed(Rooms, {
  members: (roomId) => Stream.callback<ReadonlyArray<Member> | Session.Signal<FromCache, never>, MembersDenied | MembersFailed>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => onSnapshot(
        collection(db, "rooms", roomId, "members"),
        { includeMetadataChanges: true },                                  // a snapshot also when fromCache flips
        (snap) => {
          Queue.offerUnsafe(queue, snap.metadata.fromCache ? Session.down(new FromCache()) : Session.open())
          Queue.offerUnsafe(queue, snap.docs.map((d) => toMember(d.data())))
        },
        (error) => Queue.failCauseUnsafe(queue, Cause.fail(        // the listener stops after an error: the session ends
          error.code === "permission-denied" ? new MembersDenied() : new MembersFailed({ code: error.code }))))),
      (unsubscribe) => Effect.sync(unsubscribe)),                          // interruption runs the SDK's unsubscribe
    { bufferSize: 2, strategy: "sliding" }),                               // latest: older states may go; signal and value travel in pairs
})

export const roomMembers = stream({
  id: "rooms/members",
  key: (p: { roomId: string }) => p,
  delivers: "latest",                                                      // a query snapshot is the whole state
  subscribe: (p) => Stream.unwrap(Rooms.useSync((r) => r.members(p.roomId))),
})
```

- **Signals come from snapshot metadata.** Firestore has no connection callback, but each snapshot says whether it
  came from the local cache. A cached snapshot is `down` plus a value, and a server-confirmed one is `open` plus a
  value. The view shows the cached members, dimmed (7.2).
- **This case changed the contract.** Before, a value implied an open. A cache serving data while offline then showed
  `"Open"`. Now only a session's first value implies an open, and a value while `"Down"` changes the data but not
  the connection (rule 40, 4.1.5).
- **Not a `listen`.** Firestore's offline cache, pending writes and completeness are a sync engine's. Feeding them
  into the store as records belongs behind SE, not in `listen` (4.2).
- **Fixture:** a plain Layer: `members: () => Stream.make(Session.down(new FromCache()), cached, Session.open(), fresh)`.
  A Story checks `connection` and `data` after `process()`.

#### 7.7.5 What the SDKs confirm

- **`Session.reconnect` stays as designed** (4.1.3; open question Q1). Supabase and Firestore reconnect by
  themselves and report signals without it. OpenAI and the Vercel AI SDK are writes. The only text added to 4.1.3
  spells out that the combinator emits the re-open it already had to report. The owner reviews the combinator
  separately.
- **No SDK type crosses the service.** Each service maps the SDK's classes, statuses, close events and metadata into
  the author's tagged errors and `Session` signals (MD:775-776).
- **Cancellation is always Effect interruption.** It reaches the SDK either as the commit's `signal` or as a
  finalizer: the iterator's `return()`, `removeChannel` or `unsubscribe`.
- **One contract change:** values while down (7.7.4).

## 8. Alternatives considered

- **A1. Flow re-opens sessions** (a `retry` policy on the descriptor). Rejected: rule 25, configuration on a
  descriptor, and SSE reconnects regardless.
- **A2. A session is one connection, and every reconnect is the machine's** (CALL/WAIT for every drop). Rejected: the
  lane vanishes while waiting (OPS:160-162), SSE's built-in reconnect cannot be expressed, and every feed needs two
  states for a Wi-Fi blip. Kept for decisions (4.3.4).
- **A3. Status inside the value** (SE's workaround). Rejected: the store cannot act on it, `flow check` cannot see it,
  and each adapter spells it differently.
- **A4. Delivery chosen by the mapping** (today, OPS:126-130). Rejected: G1.
- **A5. Delivery chosen per activity.** Rejected: what a value is belongs to the data, so it sits on the descriptor
  (locality).
- **A6. A Flow-held cursor** (`position` on the descriptor; Flow dedups and passes it to the next session). Rejected:
  Flow would compare author positions (string order is collation, ED avoids it), the cursor would be a second truth
  beside memory, and advancing it at handling is exactly what a memory write already does.
- **A7. Late routing for stream deliveries after release.** Rejected: a session owes nothing after release, every feed
  would need late handlers (rule 20), and memory plus continuity already make nothing silently lost.
- **A8. Gaps only on re-opens.** Rejected by the chat and `listen` walks (first-live race).
- **A9. Gaps on the unknown channel with `Flow.uncertain`.** Rejected: reads have no unknown; the reason says whether
  the loss is known.
- **A10. A streaming write as a stream plus a transaction.** Rejected: two owners for one write, no Attempt on the
  stream, and a cut-off could not be `unknown`.
- **A11. Progress as `every` deliveries** (an event per token). Rejected: a turn per token at 100 a second, and the
  ending already carries the whole result.
- **A12. Connection changes as mapped events.** Rejected for now: guards and views read the lane, the adapter's give-up
  is a failure the machine maps, and no walk needed a turn on `down`.
- **A13. A `receivedAt` lane field.** Rejected: the ticker walk; the server's timestamp is the source.
- **A14. Persisting queued deliveries.** Rejected: they belong to a session that a reload ends; resume and continuity
  cover them.
- **A15. Sharing one session between two activities of one actor.** Rejected: each activity maps its own outcomes, so
  one value would become two events; two connections are the author's to choose explicitly (different keys), and one
  shared socket is the adapter's multiplexing (also the answer to SSE's six-connection limit, GAPS "Smaller").

## 9. Open questions

Only choices between equally correct options. All four are decided in section 10 (M6-D3, M6-D4).

- **Q1. Ship `Session.reconnect` in version 1?** Flow derives continuity from the signals either way, so correctness
  does not depend on it; without it, every adapter writes the down/backoff/reconnect loop by hand. *Recommendation:
  ship it, as the one spelling of the honest loop.*
- **Q2. Progress as a read only, or also a mapped event** (`outcomes.progress`, latest-coalesced, current only)? Every
  walk was served by the read and the mapper's `progress`; a mapped event would let a schedule `armOn` progress.
  *Recommendation: read only; add the mapping when a case needs it.*
- **Q3. `every` delivery granularity:** one value per turn (today's rule) or every buffered value in one turn (the
  mapper receives an array). Both keep every value; the second costs fewer turns on a burst. *Recommendation: one per
  turn; an adapter that needs batches emits arrays.*
- **Q4. Names:** `delivers: "every" | "latest"` against `values: "events" | "states"`; `connection` against `link`.
  *Recommendation: `delivers` and `connection`.*

## 10. Decisions

Settled by the owner on 2026-10-30: the proposal is accepted with its recommendations, and these decisions.

- **M6-D1 `stream()` carries server-pushed data;** a write reports on itself through `progress`. Data the server pushes
  independently of any write (chat, presence, prices, `listen`) goes through `stream()`. A streaming write (an LLM
  answer, an upload) stays a transaction with its Attempt and endings, and its commit reports `progress(value)` from what
  the request already knows (XHR upload events, the text accumulated from the body); Flow counts nothing. Rejected:
  routing all incremental data through `stream()`, because upload progress has no server stream and progress belongs to
  one write's lifetime and ending.
- **M6-D2 The contract stays "`subscribe` returns an Effect `Stream`".** Any third-party SDK reaches it through
  `Stream.fromAsyncIterable`, `Stream.fromReadableStream` or `Stream.callback`, inside an Effect service the author
  writes; 7.7 shows OpenAI, the Vercel AI SDK, Supabase realtime and Firestore. The one change those cases forced (only a
  session's first value implies `open`; a value while `Down` updates data, not `connection`) is kept. Rejected:
  accepting non-Effect shapes in `subscribe` directly (the owner is content with Effect wrappers).
- **M6-D3 `Session.reconnect` ships as designed (Q1),** marked for the owner's later review.
- **M6-D4 Q2–Q4 take their recommendations:** progress is a read and the ending mapper's `progress`, not a mapped event;
  `every` delivers one value per turn; the names are `delivers` and `connection`. *Superseded in part by M6-D5
  (2026-10-31): the read's spelling and where it exists.*
- **M6-D5 (Revision (multiplicity audit, 2026-10-31); supersedes M6-D4's `x.progress(g | s, key)`).** Progress is still a read and the mapper's
  `progress`, not a mapped event. The read is the lane row's `progress` in `s.calls` (the design's D18), and it exists
  only under `reject`, `latest` and `cancel`, where a lane has one addressable Attempt (the design's rule N2, D20);
  declaring `progress` on an `allow` or `serialize` transaction is a type error. Reason: the upload walk was `allow`,
  so two uploads of one `ref` shared a lane and the bar showed the newer one's progress
  ([audit-multiplicity.md](../audit-multiplicity.md) F1). Consequence: 7.5's upload is `reject` per upload.
- **M6-D6 (Revision (multiplicity audit, 2026-10-31); new).** Two sessions of one `listen` entry on one key in one Runtime are two sources: both apply,
  either's gap lowers frontiers, and `flow check` warns `DuplicateListen` (rule 49). Reason: Operations O4 gives each
  actor its own session, and 4.1.7's "one consumer" did not say what two sessions feeding one store do (audit F10).
  Open for the owner: sharing one `listen` session per Runtime, as resources share requests.
- **M6-D7 (Revision (multiplicity audit, 2026-10-31); new).** A keyed activity (the design's 2.7.10) holds one session per key; two keys projecting one
  descriptor key are `DuplicateSession` for the later key (rule 47). Reason: per-row live data (a watchlist) needs one
  session per row, and rule 47 must say what a collision within one activity does (audit F8).

## New keywords

| Keyword | Meaning |
| --- | --- |
| `delivers: "every" \| "latest"` | what a stream's values are: facts delivered one by one, or the current state (rule 39) |
| `Session` | the subscribe function's vocabulary: `open`, `resumed`, `gap(reason)`, `down(reason)` (rule 40) |
| `Session.reconnect` | the adapter combinator that reconnects inside one session and reports it (4.1.3) |
| connection | a `Running` stream lane's `"Opening" \| "Open" \| "Down"`, as the adapter reports it (4.1.5) |
| gap | a delivery saying the session may have missed values: the adapter's reason or `Unproven` (rule 41) |
| `Unproven { why }` | Flow's gap reason for an open the adapter did not prove continuous: `"Opened"` or `"Reconnected"` |
| `DuplicateSession` | Flow's failure reason for a second same-actor session on one descriptor and key (rule 47) |
| progress | what a streaming write reports before its ending; the lane row's `progress` in `s.calls` (rule 48; Revision (multiplicity audit, 2026-10-31)) |
| `DuplicateListen` | a `flow check` warning: two actors can hold sessions of one `listen` entry on one key (rule 49; Revision (multiplicity audit, 2026-10-31)) |
| resume parameter | a stream parameter outside its key that says where a new session starts (rule 45) |
