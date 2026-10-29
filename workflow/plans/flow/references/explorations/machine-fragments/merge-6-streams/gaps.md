# Streams: gaps and sources (input for merge 6)

Status: findings only, extracted on 2026-10-30 from a first draft written by a Sonnet agent. The draft's design
(carry-over table, syntax, rules, open questions) was deliberately **not** kept, so the proposal can be designed from
scratch without inheriting its assumptions. Line citations were checked by that agent, not re-verified here: verify
each before relying on it.

Citation short names (all under `workflow/plans/flow/`):

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

## The gaps

Ranked by what goes wrong when they are left.

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
HTTP/1.1 limit for SSE.

## The sources

What the browser gives for each kind of stream.

| Source | Start | End | Failure | Reconnect | Missed messages | Backpressure | Known | Unknown |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Source | Start | End | Failure | Reconnect | Missed messages | Backpressure | Known | Unknown |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **WebSocket** | `new WebSocket(url)` returns in CONNECTING; `open`. No custom headers: auth is a cookie, a URL token, a subprotocol or a first message. | `close` event with `code`, `reason`, `wasClean`; or local `close()`. | `error` carries nothing and is followed by `close`. A rejected handshake (401, 403, 5xx) shows as `error` + close 1006 with no status. 1006 is never sent: it means "no close frame arrived" and is also a lost network, a crashed server or a proxy timeout. | None. A new object, a new handshake; the server remembers nothing. | Everything sent while no socket is open, unless the server keeps a log and the client asks for it (a cursor in the URL or a first message). | None on receive: messages fire as events whatever the consumer does. | open; a message arrived; a close code, when a frame came. | Whether quiet means idle or dead (no ping/pong visible; a half-open socket after sleep can look open for minutes); why 1006; what was missed. |
| **Server-Sent Events** (`EventSource`) | `new EventSource(url)`: GET only, no custom headers. | Only `close()` or a fatal response (non-200, wrong content type: `readyState` CLOSED). A server closing the stream makes the browser reconnect. | `error` carries nothing; `readyState` says CONNECTING (will retry) or CLOSED (gave up). No status is exposed. | **Built in**, with the server's `retry:` delay, and `Last-Event-ID` sent automatically from the last `id:` seen. | Replayed if the server honours `Last-Event-ID`; otherwise lost. "History expired" has no protocol form: it is an app event. | None. | `readyState`; last event id. | Why it errored; whether the server replayed. HTTP/1.1 allows about six such connections per origin across tabs. |
| **`fetch` body as `ReadableStream`** (LLM tokens, NDJSON, downloads) | `fetch(url, { signal })` resolves at the **headers**: status and headers are known here. Body read with a reader. | Reader `done`. A truncated response is an error only if the transport noticed (short `Content-Length`, an incomplete chunked body, an HTTP/2 reset); an intermediary closing cleanly looks exactly like completion. So completion needs a terminator in the payload (`[DONE]`, a final frame, a length). | `fetch` rejects (a `TypeError`, no detail) before headers; after them the read rejects. A 4xx or 5xx is a resolved response. | None. Resume only by protocol: HTTP `Range` with `If-Range` for downloads, an app cursor for feeds. LLM generations generally cannot be resumed. | Whatever follows the break. | **Real**: the reader is pulled and the TCP window follows. | status, headers, bytes so far. Download progress is bytes over `Content-Length`, which may be absent or compressed. | Whether a clean end is complete; whether the server keeps generating after an abort (no browser API reports it). |
| **Upload progress** (`XMLHttpRequest.upload`) | `xhr.send(body)`. `fetch` has no upload progress (streaming request bodies exist only in some engines, over HTTP/2). | `load` / `error` / `abort` / `timeout`. | `error` carries nothing; the status exists only if a response came. | None. | n/a | n/a | `loaded` and `total`: bytes handed to the network stack. | Whether the server received them. Progress is an upper bound on what the server has, never evidence. |
| **Polling with a cursor** (`DD` `technicianUpdates`) | repeated GET with the last `cursor` (DD `next/http-api.ts:173-185`). | when the author's loop stops. | each GET is a read; a failed GET fails the loop. | each GET is independent; the cursor is the continuity. | none, if the server honours the cursor. | pull-based. | the cursor. | nothing between polls. |
| **Sync engine** (TanStack DB, Electric) | `subscribeChanges`; the engine owns the transport. | `cleanup()`. | the engine's `status`, which can recover from `error` to `ready` (SE:67, SE:182-185). | the engine's, with its own log offset. | the engine either replays or tells the client to start over (`truncate`, SE:67). | the engine's batching (SE:169-170). | status, offsets. | whether a given push was applied before a given read. |
| **`BroadcastChannel`** (tabs of one origin) | `new BroadcastChannel(name)`. | `close()`. | none. | none. | A tab opened later sees nothing earlier; a frozen or discarded tab misses messages. | none. | a message from another context arrived (never your own). | who is listening; whether anyone received it. |

What every source shares (observations, not design decisions):

- The browser reports **that** a transport ended, almost never **why**, and never **what was missed**. Honest answers
  to "have I seen everything the source said since I last looked?" are: yes, continuous (a protocol proved it: a replay
  from a cursor, an engine offset); no (the adapter knows it dropped, or the server said "start over"); and don't know
  (it reconnected and nothing proves otherwise).
- Only the adapter can classify: it sees the close code, the `readyState`, the headers and the terminator. Flow
  interprets none of them (MD:716-717).
- Completion, liveness and continuity are claims the adapter can make; the platform does not report them.
