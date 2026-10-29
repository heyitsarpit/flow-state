# Proposal: streams (merge 6)

Status: **proposal, not accepted.** Builds on the merged design (2.7, rules 13–25) and on merge 4 (accepted; rules 26–38).
No `.plan` file changes until the owner accepts it; section 6 lists the amendments for then. There is no spike yet: the
code here is examples only (Effect calls are sketches, not compiled). Rule numbers continue merge 4's and are
provisional until the merges are ordered. Nothing here is decided: every choice is listed in section 9, and
section 10 is empty.

Sources and the short names used for citations (all under `workflow/plans/flow/`):

| Short name | File |
| --- | --- |
| OPS | `Operations.plan` |
| MCH | `Machines.plan` |
| MD | `references/explorations/machine-fragments/machine-design.md` |
| M2 | `references/explorations/machine-fragments/merged/server-calls/proposal.md` |
| REQ | `references/explorations/machine-fragments/merged/server-calls/requirements.md` |
| M3 | `references/explorations/machine-fragments/merge-3-stories/proposal.md` (not accepted) |
| M4 | `references/explorations/machine-fragments/merge-4-entities/proposal.md` (accepted) |
| EDP | `EntityDomains.plan` |
| ED | `references/design/entity-domain.md` |
| PER | `Persistence.plan` |
| RT | `Runtime.plan` |
| TST | `Testing.plan` |
| INS | `Inspection.plan` |
| MT | `references/design/multi-tab.md` |
| SE | `references/design/sync-engine-adapter.md` |
| DD | `references/dispatch-desk/` (reference app) |

"Flow" means Flow's own runtime; nothing in Flow reads an HTTP status, a close code or an author error type
(MD:716-717). "The lane" for a stream is the activity lane of OPS O6; for a write it is the commit value's lane
(rule 21, MD:534-546).

## 1. The problem

Transactions have had three design rounds (merges 1, 2, 4). Streams have one paragraph, OPS O4 (OPS:119-134), written
before any of them. The merged design says nothing about continuing reads except that "reads keep two channels"
(MD:818-819), and defers "writes that stream" "to be designed from their browser sources" (MD:2123). Entity domains
accept a `listen(stream)` entry and say only that "Ordered streams are a precondition" (ED:568-569; EDP:17, EDP:59).

Streams are the part of the library where the browser tells the least and the product depends on it most: a chat that
silently misses messages after a Wi-Fi blip, a ticker that shows a price from five minutes ago as current, an LLM
answer cut in half with no way to say so. The gaps, ranked by what goes wrong when they are left:

| # | Gap | What the current text says | Product case |
| --- | --- | --- | --- |
| G1 | **Event feeds and state feeds are one thing.** Equal values are silent and slow readers skip values, unless `value` is mapped, in which case nothing is skipped. Delivery depends on whether a machine happens to map an event, and equality suppression is wrong for events. A `listen` stream is not exempt from skipping. | OPS:126-130; EDP silent | A notification feed whose second "sync now" is equal to the first and vanishes; a `TicketDeleted` skipped because a newer push replaced it in the lane. Silent data loss. |
| G2 | **No continuity.** A dropped and re-opened session loses whatever the source said meanwhile, and nothing records it. "Reconnect" in EDP means connection restored, not a stream re-opening. | OPS:59-62, EDP:82, ED:574-576 | Chat after a Wi-Fi blip; presence; every `listen` answer after a socket reconnect stays stale with a frontier that says it is fresh. |
| G3 | **No connection status.** A lane is `Running` from open to end. | OPS:166-168 | "Reconnecting…" banner; disabling the composer when offline; a ticker that must look stale. The sync-engine adapter already works around it by putting status inside the value (SE:182-185, SE:420-421). |
| G4 | **Stream outcomes predate the server-call design.** Mappers get values only, `defect` and `interrupt` are separate keys, there is no `Flow.uncertain`, no FIFO position (the P21 list names user sends, call endings, timers, `onContext`), and a duplicate session leaves the lane undefined and the activity waiting for events that never come (the silent decline that D5 rejected). | OPS:70, OPS:122-124, MCH:139-140, MD:2014, MD:2274-2279 | Any machine that reacts to a feed. |
| G5 | **No resume.** Parameters are read at start and kept; there is no way to hand the next session the last thing seen. A terminal session restarts only on state re-entry, and what its lane holds then is unstated. | OPS:120-121, OPS:131-133 | Resume chat after the last `seq`; SSE `Last-Event-ID`; HTTP `Range`. |
| G6 | **Nobody classifies a stream's errors, and nobody owns reconnect.** Flow retries nothing (rule 25) but the text never says what that means for a stream. The browser hides almost everything (section 2). | MD:572-573 | A WebSocket whose token expired: `error`, then close 1006, no status. "Offline" and "signed out" look identical unless the adapter knows the server's own close code. |
| G7 | **Ownership is stated only in a clause.** "Facts from an ended activation are discarded by design"; it is not said what happens to events already mapped and queued, nor how a feed whose events are obligations (notifications) survives leaving a screen. | RT:88-90 | Notification bell; order-status updates after navigating away. |
| G8 | **Backpressure is a build-time question.** "Choose stream buffering integration" is deferred, but sources differ completely: `fetch` bodies have backpressure, WebSockets have none. | OPS:204 | LLM tokens at 100 per second; a ticker at 1,000 per second; a chat burst. |
| G9 | **Writes that stream** (an LLM answer in the POST response; upload progress) are deferred. The transaction has no way to report anything before its ending. | MD:2123, M2:1105, REQ:85 | LLM token generation; upload progress; "stream ack completes the write" (R32). |
| G10 | **Ordering, duplicates and the first-live race for `listen`.** Replay from a cursor duplicates; the entity store orders by version or, unversioned, by arrival; reads started before the stream went live may have missed pushes. | ED:568-569, ED:691-692 | Collaborative edits replayed after resume; a note edited between page load and socket open. |
| G11 | **Persistence and tabs.** A restored session has the last value and no idea how stale it is; a second tab or a handover opens a "fresh generation". | PER:96-98, PER:32-33, MT:334, MT:703-704 | Chat reopened after the laptop slept; a leader tab closing. |
| G12 | **Stories cannot drive a feed.** Pushes and disconnects need fixture controls that merge 3 proposes and has not had accepted; nothing says how to assert the resume cursor or exercise backoff and idle deadlines on the controlled clock. | TST:42-43, TST:63-64, M3:929-932 | Every item above. |
| G13 | **Nothing is checked.** No `flow check` finding exists for stream mappings, and Inspection lists "stream sessions in flight" only. | INS:28-29, INS:86-88 | A `value`-mapped feed with no handler for a missed gap. |

Smaller: two actors with equal keys open two connections (OPS:121-122), which collides with the six-connection
HTTP/1.1 limit for SSE; sharing belongs to a service (section 4.9).

## 2. Where the data comes from

Starting from what the browser actually gives. For a write, the question was "what is now true on the server?" and the
browser could answer only part of it, so the design gave three channels (MD:719-732). For a stream the question is
different: **"have I seen everything the source said since I last looked?"** The browser can answer it for none of
the sources below, except by a protocol the author's adapter implements.

| Source | Start | End | Failure | Reconnect | Missed messages | Backpressure | Known | Unknown |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **WebSocket** | `new WebSocket(url)` returns in CONNECTING; `open`. No custom headers: auth is a cookie, a URL token, a subprotocol or a first message. | `close` event with `code`, `reason`, `wasClean`; or local `close()`. | `error` carries nothing and is followed by `close`. A rejected handshake (401, 403, 5xx) shows as `error` + close 1006 with no status. 1006 is never sent: it means "no close frame arrived" and is also a lost network, a crashed server or a proxy timeout. | None. A new object, a new handshake; the server remembers nothing. | Everything sent while no socket is open, unless the server keeps a log and the client asks for it (a cursor in the URL or a first message). | None on receive: messages fire as events whatever the consumer does. | open; a message arrived; a close code, when a frame came. | Whether quiet means idle or dead (no ping/pong visible; a half-open socket after sleep can look open for minutes); why 1006; what was missed. |
| **Server-Sent Events** (`EventSource`) | `new EventSource(url)`: GET only, no custom headers. | Only `close()` or a fatal response (non-200, wrong content type: `readyState` CLOSED). A server closing the stream makes the browser reconnect. | `error` carries nothing; `readyState` says CONNECTING (will retry) or CLOSED (gave up). No status is exposed. | **Built in**, with the server's `retry:` delay, and `Last-Event-ID` sent automatically from the last `id:` seen. | Replayed if the server honours `Last-Event-ID`; otherwise lost. "History expired" has no protocol form: it is an app event. | None. | `readyState`; last event id. | Why it errored; whether the server replayed. HTTP/1.1 allows about six such connections per origin across tabs. |
| **`fetch` body as `ReadableStream`** (LLM tokens, NDJSON, downloads) | `fetch(url, { signal })` resolves at the **headers**: status and headers are known here. Body read with a reader. | Reader `done`. A truncated response is an error only if the transport noticed (short `Content-Length`, an incomplete chunked body, an HTTP/2 reset); an intermediary closing cleanly looks exactly like completion. So completion needs a terminator in the payload (`[DONE]`, a final frame, a length). | `fetch` rejects (a `TypeError`, no detail) before headers; after them the read rejects. A 4xx or 5xx is a resolved response. | None. Resume only by protocol: HTTP `Range` with `If-Range` for downloads, an app cursor for feeds. LLM generations generally cannot be resumed. | Whatever follows the break. | **Real**: the reader is pulled and the TCP window follows. | status, headers, bytes so far. Download progress is bytes over `Content-Length`, which may be absent or compressed. | Whether a clean end is complete; whether the server keeps generating after an abort (no browser API reports it). |
| **Upload progress** (`XMLHttpRequest.upload`) | `xhr.send(body)`. `fetch` has no upload progress (streaming request bodies exist only in some engines, over HTTP/2). | `load` / `error` / `abort` / `timeout`. | `error` carries nothing; the status exists only if a response came. | None. | n/a | n/a | `loaded` and `total`: bytes handed to the network stack. | Whether the server received them. Progress is an upper bound on what the server has, never evidence. |
| **Polling with a cursor** (`DD` `technicianUpdates`) | repeated GET with the last `cursor` (DD `next/http-api.ts:173-185`). | when the author's loop stops. | each GET is a read; a failed GET fails the loop. | each GET is independent; the cursor is the continuity. | none, if the server honours the cursor. | pull-based. | the cursor. | nothing between polls. |
| **Sync engine** (TanStack DB, Electric) | `subscribeChanges`; the engine owns the transport. | `cleanup()`. | the engine's `status`, which can recover from `error` to `ready` (SE:67, SE:182-185). | the engine's, with its own log offset. | the engine either replays or tells the client to start over (`truncate`, SE:67). | the engine's batching (SE:169-170). | status, offsets. | whether a given push was applied before a given read. |
| **`BroadcastChannel`** (tabs of one origin) | `new BroadcastChannel(name)`. | `close()`. | none. | none. | A tab opened later sees nothing earlier; a frozen or discarded tab misses messages. | none. | a message from another context arrived (never your own). | who is listening; whether anyone received it. |

What every row shares, and what the design has to be built on:

- The browser reports **that** a transport ended, almost never **why**, and never **what was missed**. A stream's
  honest answers to "have I seen everything?" are *yes, continuous* (a protocol proved it: a replay from the cursor,
  an engine offset), *no* (the adapter knows it dropped or the server said "start over") and *don't know* (it
  reconnected and nothing proves otherwise). The remedy for the last two is the same, a read, so Flow collapses them
  into one fact, the **gap**. This is the stream's analogue of `unknown` (MD:719-732): "something may have happened that
  I do not know about", resolved by reading again.
- Only the adapter can classify: it sees the close code, the `readyState`, the headers and the terminator. Flow
  interprets none of them (MD:716-717); the adapter turns them into typed errors, elements or signals (section 4.2).
- Completion, liveness and continuity are **claims the adapter makes**, not things the platform tells. Flow's design
  must not make them for it.

## 3. What carries over from transactions and records

| Concept | Verdict | Stream form | Why |
| --- | --- | --- | --- |
| **Three channels, `Outcome.*`** (rule 13, MD:719-767) | adapted | A stream is a read, so two channels stay (MD:818-819): `complete`, and `failure` for typed author errors. The third channel's job ("it may have happened") is done by the non-terminal **gap**. Classification still happens where the knowledge is, inside the adapter; plain tagged errors need no wrapper, because a stream's failure is never "unknown". | A session that ends has no server truth to guess; what it lost is the gap's business. |
| **`outcomes` onto author events** (rule 13, D1) | adapted | Same shape: `E.X` or `E.X.from((value, ctx) => …)`, several endings may share an event, `failure` exhaustive by tag. Keys: `value`, `complete`, `failure`, plus `live`, `reconnecting`, `gap`. `gap:` may target only a `Flow.uncertain` event (D3). Mappers gain a context `{ params, previous }`. | OPS:70 "values only" is the one thing that cannot stay. |
| **Defect and interrupt as reasons** (rule 37, M4 E15) | carries over | `failure` also maps Flow's reasons `Defect` and `Interrupted`; the separate `defect` and `interrupt` keys of MCH:139-140 go. | Same decision as for read call values. |
| **The commit value as a handle** (D4) | does not apply | A stream is started by its state, not by an action; the lane in `snapshot.activities` is the readable. A write that streams does gain a member: `.progress` (4.7). | "Starting is static" already holds: activities are declared per state. |
| **Lanes: `pending`, `retryCount`** (rule 21) | adapted | `pending` has no meaning (no Attempt outstanding); its role is the lane's new `connection` field. `retryCount` is not needed: a restart is a new session. | D6: the machine reads the little it can use. |
| **Routing at admission** (rule 14) | adapted | The ending **is** mapped at admission (the lane changes there, rule 21; MD:597-600). It is never routed late: the owner is alive or the event is discarded. | A feed is something you watch, not an obligation you owe (4.6). |
| **Late events** (rule 20, D13) | does not apply to stream events | There are none. What carries over is the *current* half of rule 20: every mapped event that can arrive while the owner is alive is handled totally from every leaf under the owner, checked by `flow check`. The write-that-streams keeps D13 whole: it is a transaction. | D13 exists because a late `WrongCode` is a strike; a feed event after leaving the screen has no such owner. |
| **`NotSent { why }`, D5 declines are endings** | adapted | The only decline of a session is `DuplicateStreamSession`. It becomes an ending: the second activity's lane is `Failure` with the Flow reason `DuplicateSession`, mapped through `failure`. | OPS:122-124 leaves the lane undefined, the silent decline of M2's spike P5 (MD:2279). |
| **`StillUnknown`, rule 18** | adapted | A pending gap is **sticky**: a failed or empty restart never clears it; it is delivered at the next live. Knowledge of uncertainty cannot be lost by an intervening failure. | Same monotonic idea: "unknown stays unknown". |
| **Retry / cancel** (rules 19, 24) | adapted | No Attempt, no idempotency key (a read). Cancel is releasing the activity (leaving the state, `when` false), which maps no outcome (OPS:133, OPS:178-179). Retry is a new session: `when` toggled, or the state re-entered, after a wait (the CALL/WAIT split, MD:1043-1056). | Reads are safe to repeat. |
| **`idle` and `pending` guards** (rule 16) | adapted | The lane is readable in guards: `activities.feed?.connection === "live" \|\| deny("Offline")`. No new member. | `activities` is already a guard input (MCH:132-133). |
| **Keys** (OPS O1) | carries over | `key` is the session's identity; the cursor is **not** in it. | A key that changed per message would restart the session per message. |
| **Rule 22: before for decisions, after for effects** | carries over | `params` and `when` are effect-only reads: **after** (MD:587). Mapper payloads read **before**. `previous` is not memory. | Unchanged. |
| **No Flow timeout, no Flow retry** (rule 25) | carries over | Flow has no idle deadline and no reconnect. The adapter may retry invisibly with Effect (as a transport deadline lives "inside the commit", MD:1040); the machine shows or bounds waiting with states, schedules and `when`. | Same principle, same split. |
| **Rule 8: deliveries are never lost** | adapted | A stream's *facts* may be discarded with their owner, but **no fact is lost silently within an owner's life**: an `every` element is delivered or the loss is a recorded gap (4.4). | The silent loss is G1. |
| **Settlement versus admission** (M4 E4, E13, rule 27) | carries over | Arrival versus admission: a `listen` element's store effects apply when the session pulls it; the lane and mapped event change at admission. Store effects never depend on routing. | Shared truth must not wait for one actor's mailbox. |
| **Records are owned by the domain** (M4 rule 26) | carries over | A feed of entity changes goes to the store through `listen`; machine memory holds workflow (connection handling, what to show), never a copy of a record. | |
| **Record `uncertain` marks** (M4 rule 32) | does not apply | A gap is not per record; it lowers the frontier of every covered answer, as a reconnect does (EDP:82). | A missed push names no record. |
| **Lanes persist with the actor** (M4 rule 38, PER O6) | adapted | The retained `previous` and a one-bit "opened before" persist with the activity binding; `connection` and write `progress` never do. | A restore starts with unproven continuity. |

## 4. Design

### 4.1 A stream says how it delivers

Whether the elements are a **state** (a price, a presence map) or **events** (a chat message, a notification) is a fact
about the data, so it is declared on the stream (locality), and it is required, like `staleTime` and `concurrency`:

```ts
// chat.operations.ts
export const room = stream({
  id: "Chat.room",
  key: (i: { roomId: string }) => ({ roomId: i.roomId }),       // identity only: the cursor is not in it
  delivery: "every",                                            // ← NEW, required: "latest" | "every"
  result: Message,                                              // one element: { seq, id, author, text }
  persist: true,
  subscribe: ({ roomId }, { previous }) => …,                   // ← NEW ctx field: previous (4.5)
})

export const quote = stream({ id: "Quotes.quote", key: (i: { symbol: string }) => i, delivery: "latest", result: Quote, subscribe: … })
```

- **`latest`**: a state. The session holds the newest element; elements not yet admitted are replaced; an element equal
  to the last under `Equal.equals` is silent; a mapped `value` event carries the newest at its admission. A fold of
  events into state (collaborative cursors as one map) is done in the adapter with `Stream.scan`, after which `latest`
  loses nothing by construction.
- **`every`**: events. Elements are admitted one at a time in the source's order. None is skipped and equal neighbours
  are both delivered. The session runs ahead of admission by at most 64 elements (the bound `serialize` already uses,
  OPS:96) and then stops pulling.
- `listen(stream)` over a `latest` stream is a construction error (4.8). A mapped `value` on `every` is a turn per
  element: at 100 tokens per second that is the wrong tool, and `latest` with an accumulating adapter is the right one.

### 4.2 The adapter classifies; three signals travel in-band

An adapter is Effect code, so it can reconnect with Effect's own `Stream.retry` and `Schedule`, exactly as a commit
retries "invisibly, inside one send" (MD:862, MD:1040). Flow runs none of it (rule 49). What the adapter owes Flow is
three **signals**, carried among the elements so they stay ordered with them (a gap must sit exactly between
element 41 and element 42):

```ts
Link.live({ resumed?: boolean })   // the transport is up. `resumed: true`: the source replayed everything after `previous`.
Link.reconnecting()                // the transport was lost; the adapter is retrying itself.
Link.gap()                         // elements may have been lost here (a dropped queue, "history expired", "start over").
```

`subscribe` returns `Stream<A | Link.Signal, E, R>`; the descriptor's element type is `A`. Everything else about the
transport (close codes, `readyState`, status, event ids, the terminator) the adapter reads and turns into tagged errors
(`Dropped { code }`, `Unauthorized`) or these signals. A WebSocket adapter, with the server's hello frame saying
whether it replayed:

```ts
// chat.socket.ts (sketch: the service's Live layer; a Story's fake layer has the same signature)
const messages = (roomId: string, { after }: { after?: number }) =>
  Stream.callback<Message | Link.Signal, Dropped | Unauthorized>((queue) => Effect.gen(function* () {
    const ws = new WebSocket(`${url}/rooms/${roomId}?after=${after ?? ""}`)
    ws.onmessage = (m) => {
      const f = decode(m.data)
      Queue.offerUnsafe(queue, f.t === "hello" ? Link.live({ resumed: f.replayed }) : f.message)
    }
    ws.onclose = (c) => Queue.failCauseUnsafe(queue, Cause.fail(c.code === 4401 ? new Unauthorized() : new Dropped({ code: c.code })))   // the author reads the code; Flow never does
    yield* Effect.addFinalizer(() => Effect.sync(() => ws.close(1000)))
  }), { bufferSize: 1024, strategy: "suspend" })   // a dropping or sliding queue loses elements silently: then the adapter must emit Link.gap()
```

An optional helper in the package puts the reconnect loop and the signal ordering in one tested place (open question 7):

```ts
Link.retrying(
  (open) => messages(roomId, { after: open.last?.seq ?? previous?.seq }),         // `open.last`: the last element it forwarded
  { schedule: Schedule.exponential("500 millis").pipe(Schedule.jittered),         // jitter from Effect's Random, which Stories seed (TST:37-40)
    while: (e) => e._tag === "Dropped" })                                          // the author's predicate: Unauthorized is not retried and reaches the machine
```

Between attempts it emits `Link.reconnecting()`, and the next attempt's own `Link.live(...)` closes the pair. When the
schedule ends, the stream fails with the last error and the machine decides. No error carries configuration: `while`
is the adapter's, not a property of `Dropped`.

### 4.3 The lane gains `connection`

```ts
// snapshot.activities.feed
{ _tag: "Running", data: Message | undefined, connection: "connecting" | "live" | "reconnecting" }
{ _tag: "Complete" | "Failure" | "Defect" | "Interrupted", data, … }                    // as today (OPS:166-168)
```

`connection` is `"connecting"` from open until the first signal or element, `"live"` after `Link.live` or the first
element, `"reconnecting"` after `Link.reconnecting`. An adapter that emits no signals (the polling loop of DD) shows
connecting, then live, and never reconnecting: zero configuration for simple streams. A change is a lane-only
publication at the signal's admission (MCH:148-150); it runs no handler unless its event is mapped. Guards read it
(`activities` is a guard input, MCH:132-133) and so do views, with the retained `data`, so a stale price can be drawn
as stale:

```ts
const q = useView(actor, (s) => s.activities.quote)                // { _tag: "Running", data, connection }
q?.connection === "reconnecting" ? <Stale price={q.data?.price} /> : <Price price={q?.data?.price} />
```

### 4.4 Continuity and the gap

Each `(actor, activity, key)` keeps a **continuity record**: whether a session of it has ever been open, and the
retained `previous`. A record is **unproven** after any of these:

- a session starts and the record says "opened before" (a restart, a re-entry, a `when` toggle, a restore);
- `Link.reconnecting()` was seen and the next `Link.live()` does not say `resumed: true`;
- `Link.gap()`.

`Link.live({ resumed: true })` proves it. At the first `Link.live` or element after an unproven record, Flow delivers
**one gap**, ordered before that element, and the record becomes proven. A first-ever session has nothing to miss.
Gaps that pile up before the next live are one. A session that fails before going live leaves the record unproven
(sticky, like `StillUnknown`).

The gap does three things:

1. It is mapped by `gap:` to a `Flow.uncertain` event (a type error otherwise), with context `{ params, previous }`
   so the handler can name what to ask for ("messages after `previous.seq`").
2. For a `listen` stream it is a **reconnect** for the entities the entry may change: covered answers lower their
   frontier and answers with subscribers refetch in canonical order, under the repair bounds (EDP:80-84, ED:574-576).
3. It is evidence (4.12).

```ts
// plain feed: the machine decides
gap: E.MissedSome.from((_, { previous }) => ({ after: previous?.seq })),
MissedSome: { target: "self", actions: [history.fetch(historyKey)] },     // history is a resource call value (MD:1155-1164)

// entity feed: nothing to write; the domain repairs the message list (4.8)
```

The default is the safe one: **unless the adapter proves continuity, a restart is a gap.** An adapter that cannot
resume (a plain `fetch` stream) never says `resumed`, and so always yields a gap on restart; one that replays from a
cursor says it and gets none.

### 4.5 Resume: `previous`

`subscribe(params, { signal, previous })`: `previous` is the last element admitted for this key by this activity. It is
retained across `when` toggles, re-entry and (for a persisted stream) reload, like `placeholder`'s `previous`
(OPS:171-173); a changed key clears it. Flow stores no cursor and interprets no element: the adapter derives
`previous.seq`, or `previous.etag`, or a byte offset, and asks the source. The lane at a restart shows `previous` as
`data` with `connection: "connecting"` until the first element, so a view never goes blank because a socket blinked.

This avoids both a key that changes per message and an author-kept `lastSeq` updated by a turn per message.

### 4.6 Ownership: current only, and where obligations live

Stream events have no late route. When the owning activation ends (state left, `when` false, key change, actor
disposal), the session is released, no outcome is mapped (OPS:133, OPS:178-179), and events mapped but not yet admitted
are discarded at admission with evidence, as a dead activation's timers are (MD:1213, RT:88-90). That is right for a
feed one watches. A feed whose events are **obligations** (notifications to show, order-status updates) must not be tied
to a screen; it is declared where it is not left:

```ts
// the root declares it; every state sees its events (MCH:26-27: nodes may declare activities, the root included)
activities: { inbox: O.Notify.inbox.subscribe(({ memory }) => ({ userId: memory.userId }), { outcomes: { value: E.Notification, gap: E.InboxMissed, failure: { … } } }) },
on: { Notification: { target: "self", updateMemory: ({ memory, event }) => ({ unread: [...memory.unread, event] }) }, InboxMissed: { target: "self", actions: [unread.fetch(unreadKey)] } },
```

A write's ending is different: it is an obligation by construction and keeps rules 14 and 20 (4.7).

### 4.7 Writes that stream

Open item 9 (MD:2123). Two real shapes, from two different sources:

**(a) The response is the stream** (an LLM answer in the body of the POST; an upload with `onprogress`). There is no
second endpoint to subscribe to, so the *write* must report before it ends. It stays a transaction: Attempt, three
channels, `StillUnknown`, retry, cancel, lanes and late routing are untouched. It gains one thing, **progress**: what
the call reports while it runs.

```ts
export const ask = transaction({
  id: "Chat.ask",
  input: AskInput,
  concurrency: "reject",
  progress: Schema.Struct({ text: Schema.String }),            // ← NEW, optional: the shape of what it reports while running
  commit: (input, { attempt, signal, progress }) => Effect.gen(function* () {   // ← NEW ctx: progress(p): void, synchronous, validated, latest-only
    const res = yield* Llm.open({ ...input, idempotencyKey: attempt.id }, signal)         // fetch: headers (status) are known here
    if (res.status === 429) return yield* Outcome.failure(new Busy({ retryAfterMs: res.retryAfterMs }))    // nothing was generated
    if (res.status !== 200) return yield* Outcome.failure(new Rejected({ code: res.status }))
    let text = ""
    yield* Stream.runForEach(res.deltas, (d) => Effect.sync(() => { text += d; progress({ text }) }))
    if (!res.sawStop) return yield* Outcome.unknown(new Truncated({ text }))   // a clean EOF without the terminator is not "done"
    return yield* Outcome.success({ text })
  }),
})

// machine
const ask = O.Chat.ask.commit(({ memory }) => ({ prompt: memory.draft }), {
  outcomes: {
    success: E.Answered.from((v) => ({ text: v.text })),
    failure: { Busy: E.Busy.from((r) => ({ retryAfterMs: r.retryAfterMs })), Rejected: E.Refused, NotSent: E.AskSkipped },
    unknown: E.AnswerCut.from((_r, { progress }) => ({ partial: progress?.text ?? "" })),   // ← NEW ctx: the last progress, also after Cancelled
  },
})
useView(actor, (s) => ask.progress(s, { /* key */ })?.text)       // ← NEW read: the text so far, or undefined
```

- `progress` is **not an ending and not evidence.** Upload `loaded` is an upper bound on what the server holds; tokens
  seen prove the server started, not that it finished. The ending is decided only by the commit's return (rule 18).
- It is a **lane read** (`ask.progress(g | s, key)`), beside `pending` and `retryCount`, for the same reason they are
  there: it is data the machine cannot derive, so it comes from the source. It is latest-only, coalesced like a
  `latest` stream, runs no handler, and is cleared when the ending is admitted. The ending's mapper sees the last
  value (`progress` in its context), so a Stop button keeps the partial answer: `Cancelled` has no text, the lane had.
- It is never persisted or hydrated; a restored invoked send is `unknown (Restored)` and the partial is gone (PER O6,
  C17); the server's record is the truth.
- A mid-stream drop is `Outcome.unknown`, with the partial text as information on the reason. The machine reconciles as
  in 2.7.6 and 2.7.9: read the conversation, or `ask.retry(key)` if the server dedups by `attempt.id`.
- Cancel keeps rule 24 and its honest limit: aborting the `fetch` closes the connection; the server may keep generating
  (billing), and no browser API says when it stops (MD:844-845, MD:1130-1133).

**(b) The server can name the job** (a create call that returns an id; background generation; an export). No new
concept: a transaction creates it, then a stream subscribes **by id**, with the cursor in `previous`:

```ts
const start = O.Reports.create.commit(…)                                                   // returns { jobId }; ordinary write
activities: { progress: O.Reports.status.subscribe(({ memory }) => ({ jobId: memory.jobId }), { when: ({ memory }) => memory.jobId !== null, outcomes: { complete: E.ReportReady, failure: { … } } }) }
```

(b) is the better design whenever the server offers it, because it can be resumed; (a) exists for the common case where
it does not.

**A stream that is also a write** (WebSocket chat: send over the socket, the ack comes back as an element) needs
nothing new either (R32 asks for it, REQ:85; M2:995 rates it a recipe). The socket is one Effect **service**; the
stream and the transaction are two descriptors over it, and the commit waits for the element carrying its `attempt.id`.
A drop before the ack is `Outcome.unknown`, by the existing rules:

```ts
commit: (m, { attempt }) => Chat.send({ ...m, clientId: attempt.id }).pipe(                 // resolves when the ack element for clientId arrives
  Effect.catchTag("Dropped", (e) => Outcome.unknown(e)))
```

### 4.8 `listen` and the entity store

- `listen(stream)` requires `delivery: "every"` (App construction error `InvalidConfiguration`, as EDP:20 already
  does for other misdeclarations). Skipping a delete is exactly the failure the entity layer cannot repair.
- A gap is a reconnect for the entry's entities (4.4). So is the **first live** of a `listen` session for answers whose
  request started before it: a push between the request and the socket opening is in neither (G10). The cost is one
  refetch per page load for answers that loaded first; an adapter that carries a server position proves continuity
  with `Link.live({ resumed: true })` and avoids it (open question 6).
- Arrival and admission (rule 45): the element's store effects apply when the session pulls it, never waiting for the
  actor's mailbox; the lane and any mapped `value` event follow at admission.
- Order, duplicates and out-of-order replay are the adapter's: it delivers in order and drops replayed ids (a `Ref` of
  the last `seq` in the stream). With versions, duplicates are harmless (EDP:63-70); unversioned, arrival order
  is the order (ED:691-692), so a replay older than the newest push would regress a record. `flow check` already
  warns on `listen` over an unversioned entity (EDP:124); the Story in 7 shows a duplicate replay.

```ts
// chat.domain.ts
events: listen(room).as([Message], (m) => Message.save(m)),            // delivery: "every" required; a gap repairs the open message list
// machine: only workflow
activities: { feed: O.Chat.Messages.room.subscribe(({ memory }) => ({ roomId: memory.roomId }), { outcomes: { failure: { Unauthorized: E.SignedOut, Dropped: E.FeedDown, Defect: E.FeedDown, Interrupted: E.FeedDown } } }) }
```

### 4.9 One connection, many sessions

Sessions are per actor and independent (OPS:121-122). To avoid a socket per widget, the connection is an Effect service
that owns the single socket and reference-counts topics; each `subscribe` is a topic stream over it; a drop emits
`Link.reconnecting()` to all of them at once, and the first message after the reconnect emits `Link.live`. Flow adds
nothing; this is where the SSE six-connection limit and a per-Runtime socket are solved. A global "you are offline"
banner is just a `latest` stream of the service's status at the root. `DuplicateStreamSession` stays per actor and now
ends (4.10).

### 4.10 Endings

- `complete`: the adapter's stream ended and it meant it. Completion must be proven by the adapter (a terminator), not
  guessed from a clean EOF (section 2); an adapter that cannot tell fails with a typed `Truncated`.
- `failure`: exhaustive over the stream's error tags, plus Flow's reasons `Defect` (a throw or die, also an actor
  issue), `Interrupted` (interrupted by something other than Flow) and `DuplicateSession`. `DuplicateSession` is
  optional in the type and required by `flow check` only where two activities of the stream can be active together.
- A session ends at most once; the lane keeps `data`; a later session of the same key starts with it (4.5).
- A released session ends nothing.

### 4.11 How the machine uses it: reconnect as waiting

The adapter reconnects invisibly. When it gives up, or the author wants the user to see and bound the waiting, the
machine uses what exists: a mapped `failure` event, a schedule, and `when`. No state split is needed, and the draft
and every other child state stay where they are:

```ts
ROOM: {
  activities: {
    feed: O.Chat.room.subscribe(({ memory }) => ({ roomId: memory.roomId }), {
      when: ({ memory }) => memory.feedOn,                                      // false releases only this activity (MCH:131-136)
      outcomes: {
        value: E.Message, gap: E.MissedSome.from((_, { previous }) => ({ after: previous?.seq })),
        live: E.Online, reconnecting: E.Offline,
        failure: { Dropped: E.FeedDown, Unauthorized: E.SignedOut, Defect: E.FeedDown, Interrupted: E.FeedDown },
      },
    }),
  },
  schedules: { retryFeed: { armOn: [E.FeedDown], schedule: ({ memory }) => Duration.millis(Math.min(30_000, 1000 * 2 ** memory.feedTries)), send: E.FeedRetry } },
  on: {
    FeedDown:  { target: "self", updateMemory: ({ memory }) => ({ feedOn: false, feedTries: memory.feedTries + 1 }) },     // the ended session is released; the lane keeps data
    FeedRetry: [{ target: "self", guard: ({ memory }) => memory.feedTries <= 6 || deny("GaveUp"), updateMemory: () => ({ feedOn: true }) }, { target: S.OFFLINE }],
    Online:    { target: "self", updateMemory: () => ({ feedTries: 0 }) },
    Offline:   { target: "self" },
    SignedOut: S.SIGNED_OUT,
    Message:   { target: "self", updateMemory: ({ memory, event }) => ({ log: append(memory.log, event) }) },
    MissedSome: { target: "self", actions: [history.fetch(historyKey)] },
  },
}
```

The same shape as 2.7.6's CALL/WAIT split, with `when` instead of a state because an activity can be toggled without
leaving. A `Retry now` button sends `FeedRetry`. Jitter lives in the adapter, so open item 12 (a randomness source in a
turn, MD:2130) is not needed for reconnect. A fragment cannot own the activity (fragments run no operations, rule 3,
MD:398; a fragment body has no `activities`, MD:688), so a reusable `Backoff` trait would provide only the counter and
the schedule and the host would wire `when`; that is a library question, not a Flow one.

### 4.12 Stories, static analysis and Inspection

**Stories.** Code runs unchanged against a fake transport, because the adapter takes the transport as a service and
Stories replace whole service functions (TST:53-56). A feed fixture is a `Fixture.stateful` whose truth records what
the server saw and whose controls (M3:929-932, M3:342-343; not accepted) are `push`, `drop`, `close`:

```ts
const feed = FakeChatFeed({ history: [msg(1), msg(2)] })
export const dropAndResume = story.machine(ChatRoom, { id: "ChatRoom/drop-and-resume", fixtures: feed })
  .send(E.Join({ roomId: "r1" })).process()
  .control(feed.push({ seq: 3 })).process()
  .control(feed.drop({ code: 1006 })).process()
  .checkpoint("offline")                                    // lane: connection "reconnecting", data seq 3
  .advance("1 second").process()                            // the adapter's backoff, on the controlled clock
  .checkpoint("back")
// run.checkpoints.back.truth.FakeChatFeed.subscriptions.at(-1)  → { roomId: "r1", after: 3 }
// run.checkpoints.back.endings / events: no MissedSome (the fixture replayed and said so); with replay turned off: exactly one
```

`process()` already "waits neither for an open stream to end nor for blocked external input" (TST:42-43); idle and
heartbeat deadlines are the adapter's, on the same controlled clock, so `advance` exercises them. Property tests
(TST:143-145) generate drops, replays with duplicates, denied resumes and slow consumers from the same controls.

**Static analysis (`flow check`).** Errors: `gap:` on a non-`Flow.uncertain` event (a type error); `listen` over a
`latest` stream; a `value:`-mapped `every` stream with no `gap:` (the machine consumes elements as events, so missing
some must be a decision; `{ target: "self" }` is the explicit ignore); a mapped stream event with no total handler under
the owner (rule 20's current half); `failure.DuplicateSession` unmapped where two activities of one stream can be active
together. Warning: two activities of one stream that can be active together with keys that may be equal (the runtime error becomes visible before it happens). Info: a `latest` stream with a mapped `gap` (usually unnecessary). Obligation feeds (4.6) get no check: a handler cannot be told to be an obligation.

**Inspection.** The model lists each stream's `delivery` and each activity's outcome edges, now including `live`,
`reconnecting` and `gap`. The runtime view of a session adds `delivery`, `connection`, elements admitted and (for
`latest`) skipped, restarts, gaps delivered, a pending-gap bit, opened-at and last-element-at on the Runtime Clock.
Evidence gains stream events `open`, `link` (connecting, live, reconnecting), `gap` (cause: `signal`, `reconnect`,
`restart`, `restore`, `first-live`), `end` (complete or failure with its tag), `release` and `discard` (count, with the
event names). Redaction already covers stream values (INS:121).

## 5. Rules

Rules 13–38 still apply. These are added to 2.4 as rules 39–50; each names where it comes from.

39. **Delivery is declared by the stream.** `stream({ delivery })` is required: `"latest"` or `"every"`. `latest`
    replaces unadmitted elements and is silent for equal ones. `every` admits every element once, in the source's order,
    suppresses none, and runs ahead of admission by at most 64. `listen` over `latest` is a construction error.
40. **The source's signals are in-band and Flow reads no code.** `subscribe` may carry `Link.live({ resumed? })`,
    `Link.reconnecting()` and `Link.gap()` among its elements, applied in order. The adapter classifies close codes,
    `readyState`, statuses and ids into signals, elements and tagged errors; Flow interprets none. An author error with a
    Flow reason's tag (`Defect`, `Interrupted`, `DuplicateSession`) is a type error (as rule 13).
41. **Connection.** The lane's `connection` is `connecting`, `live` or `reconnecting`. It changes at the signal's
    admission, lane-only unless `live:` or `reconnecting:` is mapped. Without signals it goes connecting, then live at
    the first element.
42. **Continuity.** A continuity record per actor, activity and key is unproven after a restart, re-entry, `when`
    toggle or restore of a record that was opened before, after a `Link.reconnecting` followed by a `Link.live` that does
    not say `resumed`, and after `Link.gap`. `Link.live({ resumed: true })` proves it. At the first live or element after
    unproven, Flow delivers one gap, ordered before that element. A session that fails before going live changes
    nothing. A changed key starts a fresh record.
43. **A gap is uncertain, and its remedy is a read.** `gap:` maps to a `Flow.uncertain` event with `{ params,
    previous }`. For `listen` Flow treats a gap, and the first live for answers requested before it, as a reconnect of the
    entry's entities (EDP:82). `flow check` requires `gap:` on a `value`-mapped `every` stream.
44. **Pressure goes to the source and never turns into silent loss.** Flow never drops an `every` element: when its
    run-ahead is full it stops pulling. A source that cannot be paused bounds itself and says `Link.gap()` where it
    dropped. `latest` replaces by definition and records how many it skipped.
45. **Arrival and admission** (M4 rule 27 for streams). An element arrives when the session pulls it; its `listen` store
    effects apply then. Its lane change and mapped event happen at its admission, mapped there (rule 13), in the one FIFO
    (P21). For `every` the lane never runs ahead of the machine's memory.
46. **Current only.** Stream events are never late. A released session maps no outcome; its mapped but unadmitted events
    are discarded at admission with evidence. A feed of obligations is declared on a state that is not left, usually the
    root.
47. **Endings.** A session ends at most once as `complete` or `failure`; `failure` is exhaustive over the stream's tags
    plus `Defect`, `Interrupted` and `DuplicateSession`. A duplicate session is an ending, not an undefined lane (D5).
    The lane retains `data`; a later session of the same key starts with it; a changed key clears it.
48. **Resume is handed back.** `subscribe(params, { signal, previous })` receives the last element admitted for the key,
    retained across restarts and, for a persisted stream, reload. Flow keeps no cursor and reads no element.
49. **No Flow reconnect and no Flow idle timeout** (rule 25 for streams). An adapter may retry transport failures and
    enforce idle deadlines with Effect on the Runtime Clock. Visible waiting and giving up are states, schedules and
    `when` of the machine.
50. **A write may report progress.** A transaction may declare `progress` (a Schema). The commit calls the synchronous
    `progress(p)`; the value is the lane's latest, readable as `x.progress(g | s, key)`, coalesced and handler-free. It is
    never an ending or evidence; the ending's mapper receives the last value as `progress`; it is cleared when the
    ending is admitted; it is never persisted or hydrated.

## 6. Changes

### 6.1 Added

- `delivery` on `stream`; `previous` in the `subscribe` context; `Link.live`, `Link.reconnecting`, `Link.gap`
  (and optionally `Link.retrying`).
- Lane field `connection`; outcome keys `live`, `reconnecting`, `gap`; mapper context `{ params, previous }`; Flow reasons
  `DuplicateSession` (stream failure).
- Transaction `progress`, commit context `progress`, lane read `x.progress(g | s, key)`, mapper context `progress`.
- Rules 39–50; `flow check` findings (4.12); Inspection fields and events; the feed fixture recipe.

### 6.2 Changed

- Stream value delivery stops depending on whether `value` is mapped (OPS:126-130).
- Subscription `defect` and `interrupt` outcome keys become `failure` reasons (MCH:139-140).
- A duplicate session ends instead of leaving an undefined lane (OPS:122-124).
- Persisted streams carry a continuity record; a restore starts unproven (PER:96-98).

### 6.3 Removed

- "at most one value event waiting per session" (OPS:127-128), replaced by rule 39's run-ahead of 64 for `every` and
  one for `latest`.
- Subscription `defect:` and `interrupt:` outcome keys.

### 6.4 Amendments by target

The `.plan` files change only when this proposal is accepted.

**`Operations.plan`**

| Where | Amendment |
| --- | --- |
| O1 (OPS:10-11, OPS:14-18) | `stream({ id, key?, delivery, subscribe, result?, persist? })`; `subscribe(params, { signal, previous })` returns a Stream of elements and `Link` signals; `transaction` gains optional `progress` (a Schema); `commit(params, { signal, attempt, basedOn, progress })` |
| O3 (OPS:79-118) | `progress` per rule 50; mapper context gains `progress`; the Attempt does not carry it |
| O4 (OPS:119-134) | replaced by rules 39–48: delivery, signals, continuity, arrival and admission, current only, endings, `previous`; duplicate session is an ending; "at most one value event waiting" goes |
| O6 (OPS:160-169) | Stream lane: `Running` carries `connection`; `data` is retained across restarts of the same key; a transaction has a `progress` read; "Transactions have outcomes, never lanes" gains "and a lane read" |
| O7 (OPS:177-187) | a released session discards its unadmitted events with evidence; a cancelled write clears its progress |
| V9 (OPS:197) | Stories also prove delivery modes, gaps, resume, connection and discard |
| Q1 (OPS:204) | "stream buffering integration" is answered by rule 44: Flow keeps no buffer beyond the run-ahead |

**`Machines.plan`**

| Where | Amendment |
| --- | --- |
| O6 (MCH:139-150) | subscriptions declare `value`, `complete`, `failure` (tags plus `Defect`, `Interrupted`, `DuplicateSession`), `live`, `reconnecting`, `gap`; `gap:` targets only a `Flow.uncertain` event; mappers receive `(value, { params, previous })` |
| O6 (MCH:131-136) | `when` toggling restarts a session; `previous` survives it |
| O5 | the P21 list (user sends, call endings, timer firings, `onContext`) adds stream-mapped events |

**`machine-design.md`**

| Where | Amendment |
| --- | --- |
| 2.4 | add rules 39–50 |
| 2.7.1 (MD:818-819) | "Reads (`lookup`, `subscribe`) keep two channels" gains "a stream's third fact is the non-terminal gap, section 2.8" |
| 2.8 (new) | Streams: sections 2, 4.1–4.11 of this proposal in the 2.7 style (a data-source table like 2.7.2, the signals, the lane, the machine) |
| Section 7 | item 9 closed (4.7); item 12 (jitter) not needed for reconnect (4.11) |
| 5 (C rows) | C19 stream delivery and signals; C20 continuity, gap and `listen`; C21 progress; C22 `flow check` and Inspection |

**`EntityDomains.plan`**

| Where | Amendment |
| --- | --- |
| O1 (EDP:59) | `listen(stream)` requires `delivery: "every"`; a gap, and the first live for answers requested before it, is a reconnect for the entry's entities; order and duplicate replay are the adapter's |
| O1 (EDP:82) | "Reconnect, restore and invalidate" gains "a stream gap" |
| O1 (EDP:124) | the unversioned-`listen` warning also names replay |
| `entity-domain.md` ED:568-569, ED:574-576 | "Ordered streams are a precondition" gains the adapter's duty to dedupe replay and the gap rule; ED:739-740 gains the feed fixture |

**`Persistence.plan`**

| Where | Amendment |
| --- | --- |
| O2 (PER:32-33, PER:36-38) | the activity binding persists the continuity record and, with `persist`, `previous`; `connection` and write `progress` never persist |
| O4 (PER:96-98) | a running stream starts a fresh session whose continuity is unproven; the first live without `resumed` delivers a gap, after saved outcomes drain |

**`Testing.plan`**

| Where | Amendment |
| --- | --- |
| O3 (TST:53-66) | the feed fixture recipe: truth records subscriptions and cursors; controls `push`, `drop`, `close`; the real adapter runs against a fake transport service |
| O4 | checkpoints expose the lane's `connection` and retained `data`, and gap evidence |
| O6 (TST:143-145) | generated faults add drop mid-stream, replay with duplicates, denied resume, slow consumer |

**`Inspection.plan`**

| Where | Amendment |
| --- | --- |
| O1 (INS:28-29) | session fields of 4.12 |
| O4 (INS:86-88) | stream event kinds `open`, `link`, `gap`, `end`, `release`, `discard` |

**`multi-tab.md` and `sync-engine-adapter.md`** (design notes). MT:334: a handover's fresh session is an unproven
restore, so it yields a gap unless the adapter resumes. MT:703-704 (Q8) stands. SE:420-421 (Q2): engine streams keep
the `Running` lane and use `connection` for the engine's link and `Link.gap` for `truncate`; the engine's own `status`
and `loadingSubset` stay in the value.

**`CommandLine.plan`** O5: the findings of 4.12.

## 7. Product cases covered

| Case | How it is written |
| --- | --- |
| **Chat feed** | `room` stream, `delivery: "every"`, adapter resumes from `previous.seq` and says `resumed` from the hello frame; as an entity feed through `listen` (4.8) a gap repairs the list, as a plain feed the machine maps `gap:` and refetches history (4.4, 4.11). Sends are a transaction over the same socket service (4.7). |
| **Live presence** | `latest` stream of a map of who is online, folded in the adapter; no `gap:` needed (the next value replaces it); the view reads `connection` to grey out the list when `reconnecting`. |
| **Notifications** | `every` stream declared on the root (4.6) with `value` and `gap`; handlers append to an `unread` list and refetch the unread count on a gap; leaving a screen cannot lose one. |
| **LLM token generation** | (a) a transaction with `progress` (4.7): the view reads the text so far, Stop is `ask.cancel(key)` and keeps the partial in `unknown`, a drop is `unknown (Truncated)`; or (b) create-then-subscribe by id with a cursor when the server supports it. |
| **Upload progress** | a transaction whose commit calls `progress({ sent, total })` from `xhr.upload.onprogress`; the view reads `put.progress(s, { fileId })`; the ending alone decides success. |
| **Collaborative cursors** | `latest` stream; the adapter `Stream.scan`s frames into one `{ userId: cursor }` map, so nothing is lost; my own cursor is a write with `concurrency: "latest"` (rapid moves coalesce, MD:1135-1153). |
| **Stock ticker** | `latest`, no outcomes, lane only; the view draws `data` with a stale style when `connection !== "live"`; one shared socket for all tickers (4.9). |
| **Tickets (Dispatch Desk)** | `ticketEvents` becomes `delivery: "every"` and keeps `listen(...).as([Ticket], …)`; `technicianUpdates` becomes `delivery: "latest"` (DD `ticket.operations.ts:65-76`; `editor.machine.ts:104`). |
| **Logout in all tabs** | a `BroadcastChannel` stream, `delivery: "every"`, no failure and no reconnect: a session start has no history, so the first action is to read the current truth (resource) and then listen. |
| **Sync-engine live query** | `Running` lane with `connection` from the engine's status events; `truncate` becomes `Link.gap()` (SE:67). |

## 8. Alternatives considered

- **Status and gap as author data in the element type** (what SE:182-185 does). Rejected: under `latest` the status
  element can be replaced by the next data element, so a gap vanishes; the entity layer cannot see it; every consumer
  re-implements the union.
- **Delivery inferred from whether `value` is mapped** (today). Rejected: it hides intent, suppresses equal events, and
  lets a machine change what a domain receives.
- **Flow-owned reconnect** (`reconnect: { schedule }` on the descriptor). Rejected: it is configuration, and Flow would
  have to classify which errors are retryable, which is the author's (MD:716-717, rule 25).
- **A gap as a terminal ending that restarts the session.** Rejected: it discards the session's state, makes every blip
  a failure, and puts a retry loop into every machine.
- **A late route for stream events.** Rejected: a feed is watched, not owed; obligations live on a state that is not
  left (4.6).
- **A `restart` action on the subscription value** (a handle like `.retry`). Deferred: `when` plus a schedule (4.11)
  covers it; add it only if three real machines repeat the toggle (open question 8).
- **Progress as a separate stream keyed by the Attempt.** Rejected for shape (a): the source is inside the commit; kept
  as shape (b) when the server offers a job id.
- **Progress mapped to events.** Rejected for now: the view reads it; a state change on "all bytes sent" can use a guard
  on the read when it is needed (open question 9).
- **Cross-actor shared sessions in Flow** (`share: true`). Rejected: sharing is a service concern (4.9), and
  `DuplicateStreamSession` stays a per-actor guard.
- **`updatedAt` on the lane.** Rejected: server timestamps in the data say it better, and a clock in views breaks purity.

## 9. Open questions

Each gives the before, the after and a recommendation. Grouped in rounds of about three; none is decided.

### Round 1: delivery and signals

1. **`delivery` required or defaulted.** *Before:* none; behaviour depends on `value`. *After:* required, `"latest" |
   "every"`. *Recommendation:* required, like `staleTime` and `concurrency`: a default would be the silent choice G1 is
   about.
2. **The vocabulary: `Link.live / reconnecting / gap`.** *Before:* none. *After:* three in-band signals. *Recommendation:*
   keep three; do not add `connecting` (it is the initial state) and do not give `reconnecting` a payload (a reason
   string is the adapter's, shown from its own data).
3. **Gap by default or by declaration.** *Before:* none. *After:* unproven unless `resumed: true`. *Recommendation:* by
   default, correctness first; the cost is a refetch on a restart for adapters that cannot resume, which is correct for
   them.
4. **Run-ahead of 64 for `every`.** *Before:* "one value event waiting". *After:* 64. *Recommendation:* 64, the existing
   `serialize` bound; the point is that shared `listen` truth does not wait for a busy mailbox.

### Round 2: domains and endings

5. **`listen` over `latest` an error.** *Recommendation:* yes, at App construction.
6. **The first-live race for `listen`.** *Before:* undefined (G10). *After:* answers requested before the first live are
   treated as covered by a reconnect. *Recommendation:* yes for `listen`, not for plain streams; the cost is one refetch
   per page load, avoided by `resumed: true` against a server position. Measure on Dispatch Desk before changing it.
7. **Ship `Link.retrying`.** *Recommendation:* yes: the order "signal, wait, reopen, `live`" is easy to get wrong, and
   one tested helper runs in Stories on the controlled clock. It is a function, not a machine concept.
8. **A `restart` action.** *Recommendation:* no for now (4.11); revisit after three machines.
9. **Progress mapping and its read.** *Before:* none. *After:* a lane read and a mapper context, no `progress:` outcome.
   *Recommendation:* as proposed; add `progress:` only when a transition on progress appears in a real machine.

### Round 3: scope

10. **Defect and interrupt as `failure` reasons for subscriptions.** *Recommendation:* yes, as rule 37 did for reads;
    otherwise the same machine would map one read's defect in `failure` and another's in `defect`.
11. **Duplicate session as an ending.** *Recommendation:* yes (D5); required by `flow check` only where two activities
    can be active together.
12. **Obligation feeds** (notifications). *Recommendation:* guidance only (declare on the root); a check cannot know a
    handler is an obligation.
13. **Host signals to adapters** (online, visibility, bfcache). A sleeping tab and an `online` event should end a backoff
    at once. *Recommendation:* the adapter reads them from a platform service (a fake in Stories); wiring follows
    Operations Q1 ("host-signal wiring", OPS:203).
14. **Multi-tab.** Leader-held streams (MT:703-704) save sockets and the SSE connection limit for persisted actors; local
    actors in every tab still open their own. *Recommendation:* as MT Q8, later; a service-level socket (4.9) is the
    interim answer.
15. **A packaged feed fixture** (`Fixture.feed`) versus a recipe. *Recommendation:* recipe first; package it once two
    feeds in Dispatch Desk need the same controls. Depends on merge 3 accepting controls.
16. **The 64 and the persisted `previous`** for large elements: should a persisted `latest` be able to store only a
    cursor projection? *Recommendation:* no; `result` is the element Schema, and an adapter that wants less emits less.

## 10. Decisions

None yet.

## New keywords

| Keyword | Meaning |
| --- | --- |
| `delivery` | the stream's declaration: `"latest"` (a state) or `"every"` (events) |
| `Link` | the adapter's vocabulary for a stream's source: `Link.live`, `Link.reconnecting`, `Link.gap`, optionally `Link.retrying` |
| `Link.live({ resumed? })` | the transport is up; `resumed` proves continuity |
| `Link.reconnecting()` | the transport was lost; the adapter is retrying |
| `Link.gap()` | elements may have been lost at this point |
| gap | the delivered fact "the stream may have missed something"; maps through `gap:` to a `Flow.uncertain` event |
| `previous` | the last element admitted for the key, handed to `subscribe` and to stream mappers |
| `connection` | the lane field: `connecting`, `live` or `reconnecting` |
| `live:`, `reconnecting:`, `gap:` | subscription outcome keys |
| `DuplicateSession` | the Flow failure reason of a second session for one descriptor and key in an actor |
| `progress` | a transaction's declared report-while-running Schema, its commit-context function, its lane read and its mapper-context field |
| continuity record | per actor, activity and key: opened before, and `previous` |
