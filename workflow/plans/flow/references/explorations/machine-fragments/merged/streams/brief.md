# Streams: requirements brief for a from-scratch design (merge 6)

Status: **brief, written 2026-10-31.** This is the whole input for a designer who designs streams again from scratch
on top of the merged design. It states the problem, the requirements, the known failures and the integration points.
It contains **no solution**: where an earlier draft's mechanism was the only way to describe a failure, the failure is
written as the behaviour a user or an author saw. Earlier drafts exist in the repository; the designer is asked not to
read them, so that their assumptions are not inherited. Nothing here is decided except what sections 3 and 4 cite.

Exercise abstract thinking. Every requirement is meant for every source and every app, not for the walk that found
it. When a requirement and a product case seem to disagree, the requirement wins and the case is the test.

Short names for citations (all under `workflow/plans/flow/`):

| Short name | File |
| --- | --- |
| MD | `references/explorations/machine-fragments/machine-design.md` (merges 1, 2, 4, 5 and operations-in-definition) |
| OD | `references/explorations/machine-fragments/merged/operations/decisions.md` (OD1–OD26) |
| M4 | `references/explorations/machine-fragments/merged/entities.md` (merge 4, merged into MD 2.8 and rules 26–38) |
| M3 | `references/explorations/machine-fragments/merged/stories/` (Stories; **not accepted**) |
| GAPS | `references/explorations/machine-fragments/merged/streams/gaps.md` (findings and the source table; its line citations were not re-verified) |
| R1, R2 | `references/explorations/machine-fragments/merged/streams/reviews/review-1.md`, `review-2.md` |
| AUD | `references/explorations/machine-fragments/audit-multiplicity.md` |
| PB | `references/explorations/playback.md` (accepted; Testing.plan O4 and O9 hold the contract) |
| OPS, MCH, EDP, PER, RT, TST, INS, SSR | `Operations.plan`, `Machines.plan`, `EntityDomains.plan`, `Persistence.plan`, `Runtime.plan`, `Testing.plan`, `Inspection.plan`, `ServerRendering.plan` |
| ED, SE, MT | `references/design/entity-domain.md`, `sync-engine-adapter.md`, `multi-tab.md` |
| DD | `references/dispatch-desk/` (the reference app) |
| EFX | `node_modules/effect/src/` (Effect 4.0.5, the installed package; authoritative over `codebases/effect-v4/`) |

"Flow" means Flow's own runtime. "The adapter" means the contract's `subscribe` (or a write's `commit`) and the Effect
services it calls: author code. "Fact feed" and "state feed" are this brief's plain words for the two kinds of value
in SR1; the design names them.

## 0. Design goals (owner)

The owner's goals, with the way the design will be judged against each. They sit beside AGENTS.md's order of
priority (correctness first, then readability at a glance, then agent UX); they do not reorder it. Where a goal and
correctness pull apart, the design says so and keeps correctness.

**DG1. General use cases, not the walks.** Section 7's walks are tests, not the specification. *Judged by:* the
design is stated as a few rules that apply to every source in section 1.2; each walk in section 7 and each failure in
section 5 is then answered by citing those rules, never by a rule written for that walk. A rule that names one source,
one SDK or one product case is a finding against the design.

**DG2. An API that is not too complicated.** *Judged by:*

- **Concept count, per tier.** The design lists every word an author must learn (a keyword, an option, an outcome
  key, a row field, a signal, a Story control) and assigns each to a tier below. The common tier's count is the
  number that matters most and is reported first. For reference, the last draft introduced about 24 new public words
  in total; the design states its own total and its common-tier count.
- **Code size per tier**, for the same product cases: contract, operation, placement, view and any machine states
  the stream itself forces. For reference, earlier drafts' chat machine was about 17 lines (and lost messages),
  about 110 lines (correct in more cases, with an algorithm in it) and 65 lines plus a 46-line definition.
- **No algorithm in author code.** An author never compares positions to infer what was missed, never keeps a
  second copy of a status Flow already has, and never writes a protocol that every app of the same kind would write
  identically.

**DG3. A few general concepts that cover many cases.** *Judged by:* adding a source the brief does not list (Pusher,
Ably, Phoenix channels, an MQTT bridge, a sync engine) needs no new Flow concept, only adapter code. Every special
case the design handles by its own mechanism is listed with the reason a general concept could not cover it.

**DG4. The common case is cheap; the rare case pays only where it is rare.**

| Tier | Cases | Expected cost |
| --- | --- | --- |
| **Common** | A state feed shown in a view (a ticker, presence, a job's status); a fact feed whose server replays on resume (chat, notifications), including reconnecting after a Wi-Fi blip; a fact feed feeding entity records (`listen`) | Close to what a resource costs today: the contract, an operation, a placement, a view. Correct liveness and "something may be missing" handling with no extra states, no adapter protocol beyond decoding, and no algorithm |
| **Uncommon** | Repairing a loss with a catch-up read; a streaming write (LLM tokens, upload progress) with Stop; a third-party SDK adapter; a quiet feed whose staleness matters | More code, but only in the piece that needs it (the adapter for an SDK, a machine state for a repair), and each piece is a reusable shape |
| **Rare** | Server log resets and epochs; positions that cannot prove continuity; SDKs that never say when they are listening; flapping servers; outbound ephemeral state | May need explicit author decisions, each stated as such |

A cost that the rare tier needs must not be charged to the common tier. If correctness forces a common-tier author to
handle something (for example, a possible loss on a fact feed), the design says so and shows the smallest correct
handling.

**DG5. Safe by default.** When an author leaves something out, the result is a type error, a `flow check` finding,
or a conservative behaviour (shown as stale, reported as a possible loss). It is never a silent loss and never a stale
value shown as current.

## 1. The problem

### 1.1 Live server data in a Flow app

A Flow app reads server data three ways: a one-off read, a live resource that refetches, and data the server pushes
while a screen is open. The third is a stream. It is where chat messages, presence, prices, notifications, collaborative
edits, LLM tokens and upload progress come from. Flow is not a network library: the data reaches Flow through a
browser API or an SDK that the author's adapter calls, and Flow models only what an app needs to be correct about
that data, not the transport.

The data starts in one of these places:

- **WebSocket** (`new WebSocket(url)`, or Effect's `effect/socket`): messages arrive as events whatever the reader
  does; a close carries a code only if a close frame arrived; nothing reconnects by itself; the server remembers
  nothing about the previous socket.
- **Server-Sent Events** (`EventSource`): GET only, no custom headers; the browser reconnects by itself and sends
  `Last-Event-ID`; errors carry no detail; about six connections per origin across tabs on HTTP/1.1.
- **`fetch` body streaming** (`response.body` as a `ReadableStream`: NDJSON, LLM tokens, downloads): status and headers
  are known when `fetch` resolves; reading is pulled and the TCP window follows; a clean end is not proof of
  completeness (an intermediary may close cleanly), so completeness needs a terminator in the payload.
- **XHR upload progress** (`xhr.upload.onprogress`): bytes handed to the network stack, an upper bound on what the
  server has, never evidence that it has it. `fetch` has no upload progress.
- **SDKs** that own their transport and report through callbacks: Firestore `onSnapshot` (cached and server snapshots,
  `fromCache`), Supabase Realtime (channel status callbacks `SUBSCRIBED`, `CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED`, async
  `removeChannel`), graphql-ws (acknowledges the connection, not each subscription; from memory, not verified),
  Pusher and Ably (connection state machines with their own recovery), Phoenix channels (join replies, rejoin with
  backoff), and sync engines (TanStack DB, Electric: their own log offsets, `truncate`, recoverable `error`).
- **Polling with a cursor** (DD's `technicianUpdates`): repeated GETs that carry the last cursor.
- **`BroadcastChannel`**: other tabs of the origin; no failure, no reconnect, a later tab sees nothing earlier.

GAPS ("The sources") has the full table of start, end, failure, reconnect, missed messages, backpressure, and what
is known and unknown for each.

### 1.2 What every source shares

These are observations about the platform, not design decisions.

- **The browser reports that a transport ended, almost never why, and never what was missed.** A rejected WebSocket
  handshake (401, 403, 5xx) is an `error` and a close 1006, which is also a lost network, a crashed server or a proxy
  timeout. "Offline" and "signed out" look identical unless the adapter knows the server's own close code.
- **The honest answers to "have I seen everything the source said since I last looked?"** are three: yes (a protocol
  proved it: a replay from a cursor, an engine offset), no (the adapter knows it lost something, or the server said
  "start over"), and don't know (it reconnected and nothing proves otherwise).
- **Only the adapter can classify.** It sees close codes, `readyState`, headers, terminators and SDK statuses. Flow
  reads none of them (MD 2.7).
- **"The transport opened" is not "the server will send me the next fact".** Some SDKs say when the server has
  registered the subscription; some never do.
- **Quiet is ambiguous.** A quiet connection may be idle or dead; a half-open socket after a laptop sleeps can look
  open for minutes. Only a heartbeat or the source's own timestamps tell them apart.
- **Backpressure exists only for pulled sources** (`fetch` bodies, polling). WebSockets and SDK callbacks push
  whatever the reader does.
- **What a value means belongs to the data.** A chat message is a fact; two equal "sync now" notifications are two
  facts. A price is the current state; an equal price is no news. That is a property of the source, not of whichever
  machine happens to consume it.

**Platform facts the designer will need (verified against Effect 4.0.5 by earlier reviews; re-check before relying
on them):** Effect's socket module is `@stability unstable`; its sockets fail the reader on every close, clean or
not (EFX `socket/Socket.ts:444-452`); a browser socket buffers frames without limit unless `highWaterMark` is set
(`:930-947`); `WebSocketConstructor` is a replaceable service (`:864-875`). `Stream.retry` resets its schedule as soon
as the first element passes again (`Stream.ts:10489`). `Stream.timeout` ends a stream silently, while
`Stream.timeoutOrElse` can fail it (`Stream.ts:3431-3454`, `:3539`). `Stream.callback`'s buffer is unbounded unless
configured (`Stream.ts:699-729`). `Schedule.both` does not exist; `Schedule.max` does (`Schedule.ts:856`). TanStack
Query's `streamedQuery` keeps a query pending until its first chunk (prior art).

### 1.3 What the plans say today, and why it is not enough

Operations O4 and the stream half of O6 predate the server-call design. Today: whether values can be skipped and
whether equal values are silent depends on whether a machine maps `value` (OPS O4); a dropped session loses what the
source said meanwhile and nothing records it; a lane is `Running` from open to end, with no connection status
(OPS O6); a duplicate session leaves the lane undefined and the activity waiting (OPS O4); nobody owns
classification or reconnect; ownership after leaving a screen is one clause (RT: "Facts from an ended activation are
discarded by design"); buffering is deferred (OPS Q1); writes that stream were deferred (MD section 7 item 9);
`listen` ordering, duplicates and the first-live race are unspecified (ED); a restored lane has no idea how stale it
is (PER O4); Stories cannot drive a feed (TST); nothing is checked (INS). Three design rounds since then found the
failures in section 5.

## 2. Requirements

Each requirement is testable: it names an observable behaviour, a Story or a check. "Must" is a requirement; "should"
is a goal the design may trade against a stated reason.

### Delivery

- **SR1. Two kinds of value, declared by the source.** A stream states whether its values are facts or the current
  state, as part of its contract, independent of any consumer. *Test:* the same stream consumed by a view only, by a
  mapped machine and by `listen` delivers the same values with the same skipping and equality rules.
- **SR2. Facts are never lost by Flow.** On a fact feed Flow never skips, coalesces or equality-suppresses a value,
  including after a restore, a handover or SSR hydration. *Test:* two equal facts in a row produce two deliveries in
  every consumer, before and after a reload.
- **SR3. State may coalesce.** On a state feed a slow consumer may skip intermediate values and sees the newest; a
  value equal to the last one the machine heard is not delivered to the machine again. Equality never delays what
  the view shows about liveness (SR20). *Test:* 1,000 values a second cause at most one waiting delivery and one row
  publication per Runtime publication.
- **SR4. Order and pace.** Facts reach each consumer in the source's order, one delivery per turn (M6-D4), through the
  actor's FIFO mailbox together with every other event. The next fact is not taken before the previous one's turn
  commits. *Test:* a burst of 500 chat messages yields 500 turns in order, interleaved FIFO with user sends.

### Knowing whether anything was missed

- **SR5. Every interruption is answered before anything newer.** On a fact feed, after anything that could have lost
  facts (the first connection, a reconnect, an SDK's silent re-subscription, an overflow, a server reset), the consumer
  learns one of three answers, **nothing missed**, **something missed**, or **unknown**, before any fact that arrived
  after the interruption. The default, when nothing proves otherwise, is "may have missed". *Test:* for every
  sequence of transport events in section 5, no fact newer than an interruption is delivered before its answer.
- **SR6. "Nothing missed" needs evidence, and the evidence is visible.** "Nothing missed" may be reported only on the
  server's word or another proof the adapter can name (a replay from the requested position, contiguity of dense
  positions). A transport opening, a client sending its cursor, or a full snapshot is not such proof for facts. The
  basis of every "nothing missed" verdict is recorded where Stories, Inspection and `flow explain` can show it.
  *Test:* a Story asserts what proved continuity; an adapter that reports "nothing missed" with no basis is visible in
  review.
- **SR7. Live means registered.** A connection counts as live only once the server will deliver every later fact to
  it, and a registered connection that stays quiet still counts as live. A source that never says when it is
  registered has an honest path, stated with its cost. *Test:* a reconnect with no new messages reaches live; a
  graphql-ws-like fake that registers late never loses a fact sent between its connection ack and its registration.
- **SR8. Every adapter sequence has one conservative meaning.** Values before any sign of registration, a value after
  a drop with no sign of re-registration, a second "registered" while live, repeated drops, signals with no values:
  each has exactly one defined meaning in every connection state, chosen so that a misbehaving adapter causes extra
  repair, never silent loss and never stale-as-current. Nothing is ignored. *Test:* an executable model enumerates
  every (state, input) pair; none is undefined or ignored.

### Recovery after a loss

- **SR9. A resume position that never passes a hole.** A stream's resume position is an input outside its key
  (OD12). The position a new session starts from (re-entry, reload, handover, a machine-level reconnect) must be one
  at or before which the consumer holds every fact. A loss must never let it move past what was lost, whatever
  arrives after the loss. *Test:* the property holds in an executable model against every sequence of losses, pages,
  resets and reloads.
- **SR10. Every possible loss has an end.** A reported possible loss is resolved by exactly one of: a repair read that
  started after it and reports itself complete; a new session from a position that then proves continuity; or the
  app's explicit acceptance where no repair exists, shown to the user. A repair that started before the latest loss
  never resolves it; an incomplete page never resolves it. If repairs eventually succeed, the consumer eventually
  leaves "owing" state, including after a reload in the middle of a repair. *Test:* model invariants for "no stale
  resolution" and liveness, plus a reload Story mid-repair.
- **SR11. Server resets and position spaces.** Positions are compared only within the server's own position space
  (an epoch, a log generation). A server that restarts its log is a loss that names where the new log starts, and a
  later quiet reconnect resumes in the new space. *Test:* after a reset the next resume asks from the new space; the
  old space's seq 1 and the new space's seq 1 are both kept.
- **SR12. Duplicates and reordering are survivable without inferring holes.** Replay overlap, a catch-up page that
  overlaps live facts, and reordered frames must leave each fact held once, using only identities and positions the
  source provides. Positions may be dense integers or sparse (timestamps, ULIDs); the design works for both, with the
  limits of sparse positions stated. *Test:* a `reorder` and a replay-overlap Story end with each message once; a
  sparse-id feed is walked.

### Reconnecting

- **SR13. Flow never re-opens a session on its own** (MD rule 25). Reconnecting inside one session is the adapter's
  (M6-D3); a session that ended re-opens only when its placement starts again, which is the machine's decision. A
  transient drop must not force every feed's machine to grow states (a Wi-Fi blip is not a machine decision).
  *Test:* a 2-second drop recovers with no machine transition; a terminal failure reaches the machine.
- **SR14. The reconnect budget measures health over time.** A server that accepts and then drops (a draining load
  balancer, a greet-and-drop) exhausts the budget and ends the session within a bounded number of tries and bounded
  time; a connection that stayed healthy for a stated duration restores the budget. Budget and backoff run on
  Effect's `Clock`. The design states how a reload interacts with the budget. *Test:* a flapping fake ends the session
  after N tries on the TestClock; a fake that stays up resets it.
- **SR15. Classification is the adapter's; reasons reach the app.** Flow reads no close code, status or SDK state. The
  adapter turns them into typed errors and reasons, so "offline, retrying" and "signed out, stop" are different
  things a view and a machine can tell apart. *Test:* a token-expiry close becomes a terminal typed failure; a 1006
  becomes a transient drop.
- **SR16. A stall fails; an unproven end is not a clean end.** A deadline in an adapter or commit fails, never
  completes. A source whose end cannot prove completeness (a `fetch` body without a terminator) does not end as a
  clean completion. A clean server close of a feed is not silently final. *Test:* a stalled body ends as a failure or
  unknown, never as complete; a clean close of a chat socket is visible to the machine.
- **SR17. Release before restart.** A new session for the same placement and key starts only after the previous
  session's clean-up has finished, within the Runtime's disposal bound (RT O6). Callbacks firing after release reach
  nothing. *Test:* a Supabase-like fake whose remove is async never has two channels on one topic.

### Bounds and back-pressure

- **SR18. Every session is bounded, for every sequence.** Memory held for a session is bounded for any sequence of
  values and connection changes, a flapping SDK included. A pulled source waits at the bound and loses nothing. A
  pushed source loses only with a reported loss at the point of loss (fact feeds) or keeps the newest (state feeds).
  Connection status is never evicted by values; repeated status changes cost bounded memory. A transport's own
  buffer is bounded too. *Test:* a flood Story produces one reported loss of a known size; a flap of 10,000 cycles
  holds bounded memory; a browser socket past its limit becomes a drop.
- **SR19. Deliveries are bounded by placements, not by the mailbox.** Stream deliveries never count against the
  mailbox's 1,024-event cap on external sends (RT) and are never dropped, except a released session's (SR33). A
  fast source never causes a turn per value it cannot be read at (100 tokens a second, 1,000 ticks a second).
  *Test:* a ticker at 1,000 per second and a full mailbox of user sends coexist; neither is dropped.

### Freshness the view can trust

- **SR20. Current or last known, never confused.** A state feed's view can tell a value that is current now from one
  that was current when the connection was last live, and knows how long ago that was. Showing a last-known value as
  current is a visible choice in the code, a type error if possible. After a reconnect, a value is current only once
  the new connection has confirmed it; an equal value still confirms it. *Test:* the most natural view expression
  that shows stale data as current does not type-check; a reconnected quiet symbol shows dimmed until confirmed.
- **SR21. The machine never acts on stale state as current.** A value that is not current (from a cache, from before
  a drop) never triggers a machine reaction meant for current values. *Test:* a cached price cannot fire a price
  alert.
- **SR22. Connection status is readable everywhere with one test.** Views and guards read whether a feed is live with
  one expression that type-checks for every phase of the session, terminal phases included, and can show
  "reconnecting", "offline" and "ended" distinctly. *Test:* a composer disabled while not live; a banner per reason.
- **SR23. Quiet versus dead, and a page waking up.** A feed whose silence is normal (a flat market) and one whose
  connection died can be told apart, using the source's own timestamps or a heartbeat, without Flow measuring wall
  time itself. After a backgrounded page wakes, an old value does not show as live for longer than a stated, small
  window. *Test:* a Story suspends the transport for 10 minutes; on wake the row leaves live within the window.

### Entity records fed by streams (`listen`)

- **SR24. The store stays coherent, not complete** (owner scope: entity domains are client coherence, not a sync
  engine). A `listen` entry's pushes are applied in order at arrival, never join a write's record queue (rule 29),
  and clear no `uncertain` mark (rule 32). Versions and contests decide duplicates and reorders (EDP). *Test:*
  EDP O4's property test with push faults passes.
- **SR25. An answer is fresh only while its push channel is live.** An answer covered by a `listen` is stale whenever
  any session covering it is not live, has ended, or was released, and stays stale until a read that started after
  that moment refreshes it. A possible loss lowers covered answers (subscribed ones refetch, the rest go stale);
  proven continuity withdraws the staleness a drop caused. The first-live race counts: answers read before the push
  channel first became live are treated as possibly missing pushes. *Test:* a record deleted while the channel was
  down leaves the list after the rejoin, quiet or not; leaving the screen makes the list stale.
- **SR26. `listen` handles its own losses; the machine handles its endings.** A machine using a `listen` needs no
  handler for possible losses (the domain repairs, rule 26), but must handle the session ending, so pushes cannot stop
  silently. `listen` accepts only fact feeds. *Test:* a type error for a state feed in `listen`; a `flow check`
  error for an unhandled ending.
- **SR27. Several sessions of one `listen` entry** follow M6-D6 or a stated replacement. *Test:* AUD F10's sequence.

### Outbound ephemeral state (cursors, typing, presence "I'm here")

- **SR28. Outbound state has a defined home or a defined absence.** Latest-wins state an app sends over a live
  connection (a cursor at 30 Hz, "typing", a viewport) either has a design that meets all of: it is tied to a live
  session; it is re-sent on each new connection; it is cleared or retracted when the placement ends (no ghost
  cursors); a restored value is not re-sent as if current; its rate is bounded and costs no turn per move; it has no
  Attempt and no ending; or it is declared out of scope with the reason and the supported workaround. The last draft
  deferred it (M6-D17, proposed, not accepted). *Test:* the cursor product case (7.8) walks end to end either way.

### Streaming writes

- **SR29. A write can report before its ending** (M6-D1). Progress belongs to one Attempt: a superseded or released
  Attempt never overwrites or clears a newer Attempt's progress; each ending sees its own Attempt's last progress.
  Progress exists only where a lane has one addressable Attempt (M6-D5). Progress costs no turn per update and is
  never an ending. *Test:* tokens at 100 per second update the row without turns; Stop then Ask shows only the new
  answer's progress.
- **SR30. Stop, cut-off and reload follow the write lane.** Stop on a streaming write follows OD5 and OD7 (the
  interrupted Attempt is retained as unknown and holds the lane until resolved); a cut-off or stalled answer is
  unknown, never a success; progress survives actor disposal with the Runtime-owned lane (OD19) and is never
  persisted, so after a reload it is absent. Callback sources (XHR) reach progress without the author bridging
  callbacks by hand into Effects. *Test:* an LLM Story with Stop, a cut, a stall and a reload; an upload Story from
  XHR callbacks.

### Persistence and reload

- **SR31. What survives a reload is defined per kind.** A fact feed has no equality baseline after restore (SR2). A
  state feed's last value may be restored, shown as last known with its age, never as current. The resume position
  and any unresolved possible loss survive with the actor's persisted record, and repair work resumes after the
  reload. Queued deliveries and buffers are not persisted. Second tabs and leader handover (MT, PER
  `SecondTabNoPersistence`) are walked. *Test:* close and reopen a tab in every phase of the chat case.

### Server rendering

- **SR32. SSR.** Streams never delay settling (SSR O2). A state feed's transferred value displays as
  last known on the client, never as current, until the client's own session confirms it; a fact feed transfers no
  values, only the memory that holds what was handled and the resume position. The client opens its own sessions
  (SSR O5). A transferred value does not cause a duplicate `value` delivery. Sensitive stream values are omitted
  (SSR O3). *Test:* SSR V3 and V5 extended with a ticker and a chat feed.

### Ownership and release

- **SR33. Who owns a session is stated, and release is clean.** The design states whether a session belongs to its
  placement's activation or to the Runtime, and what happens on leaving the state, actor disposal, a new incarnation,
  Runtime disposal and restore, consistent with OD19 and OD20 for writes or with a stated reason why streams differ.
  A delivery from a released session is discarded with evidence, never routed late to another state (contrast rule
  14 for writes). *Test:* a lifecycle table with one row per edge (start, each connection change, ending, release,
  disposal, restore, handover, page wake) and one column per layer, every cell filled.

### Stories and transport fakes

- **SR34. Stories run the real adapter against a fake transport.** A Story replaces the transport (the WebSocket
  constructor, the SDK's structural subset, the `fetch`/XHR service), never the adapter, so classification, decoding,
  bounds, heartbeats and handshakes run in tests. Adapter time comes from Effect's `Clock`, so the TestClock drives
  heartbeats, deadlines, backoff and budgets. *Test:* overflow and token-expiry paths are exercised in a Story.
- **SR35. Every real sequence is one control away.** A fake transport can: accept, deliver frames, go silent, drop
  with a code, flood, restart its log, refuse or hold a catch-up read, withhold the server's greeting or
  acknowledgement, reorder frames, flap, and suspend (a background tab). A Story can assert the resume position the
  server saw, what proved continuity, and the reported losses. `process()` does not wait for an open stream (TST).
  Playback frames show each feed's connection phase (PB). *Test:* the chat Story of 7.1 written with these controls.
  M3 is not accepted: the design depends on its needs, not its spelling.

### Tooling: `flow check`, `flow explain`, Inspection

- **SR36. `flow check` finds the stream mistakes statically.** Missing handling of a fact feed's possible losses or
  endings; a `listen` with an unhandled ending; a state feed in `listen`; duplicate consumption warnings; the existing
  `VerbMismatch`, `DuplicatePlacement` and `KeyRequired`; streams stay exempt from `KeyOmitsInput` (MD 2.7.16). All are
  read from tokens and data, never by running closures.
- **SR37. `flow explain` and Inspection show streams.** `flow explain` prints each placement with its kind, e.g.
  `LIVE subscribes feed (Chat.messages, facts, one session per room)`. Inspection lists each live session with its
  phase, the reason for its last drop, the basis of its last continuity verdict, its reported losses, its bound and
  its release; and flags adapters that deliver facts without ever showing registration, or report registration far
  more often than they drop.

### Static analysis and the single graph

- **SR38. One graph, one runtime, truth as a compilation target.** Streams add no second runtime and no hidden
  per-adapter state machine Inspection cannot see. A placement is a token; the kind of a stream, its required
  handling and its row type are readable from data and types without running code. Stories, CLI inspection and
  playback work unchanged.

### Multiplicity

- **SR39. Many sessions behave like one, many times** (AUD N1–N3). `subscribe.each` gives one session per distinct
  key; equal keys in two actors are two sessions; two operations on one stream contract and key, placed at once, have
  a defined meaning. Connection-limited sources (SSE's six per origin across tabs) are a stated limit or are designed
  for. *Test:* a watchlist of 50 symbols; two screens on one room.

### Agent UX

- **SR40. The likely mistakes fail loudly, and the dangerous one is visible.** An agent writing a feed from the docs'
  first example gets correct liveness and loss handling. The most common mistake found so far (an adapter reporting a
  drop and never reporting re-registration) and the most dangerous (reporting "nothing missed" with no proof) are
  caught by a type, a check, Inspection, or are at least visible in a one-line review. Names follow Effect and Schema
  conventions; error messages name the fix. *Test:* a Sonnet agent writes each section 7 case from the docs alone; its
  mistakes are counted.

## 3. Constraints from the merged design

Decided; the design uses them as they stand.

| # | Constraint | Source |
| --- | --- | --- |
| K1 | **Contracts.** `stream({ id, input, output, key, subscribe })` in `*.contracts.ts`; exactly two schemas, `input` and `output`, flat at the top, each a fields record or a full Schema; an omitted `output` is `Schema.Void`; the function inline, calling services whose Layer is the swap point; no Rpc inside. | MD rule 39; OD11, OD12, OD13, OD14, OD23 Q37 |
| K2 | **`key` is required on streams**, a list of top-level `input` fields, `[]` for one session; it is the session's identity. A stream's resume position is an ordinary `input` field outside the key. | OD4, OD15, OD23 Q38, OD12; MD rule 39 |
| K3 | **Operations on the definition.** Every server interaction is declared once, by name, under `operations: ({ E }) => ({ name: contract.outcomes({ … }) \| contract })`; mappings live only there; a bare operation maps nothing (its data is in its row for views). Streams are exempt from `SharedContract`. The definition exports `O`. | MD rule 40; OD3, OD9 Q4, OD17 Q15, Q16 |
| K4 | **Placement.** `activities: [O.x.subscribe(select, { when? })]` or `O.x.subscribe.each(select)` (one session per distinct key of the selected inputs; two selected inputs with one key are one session). Each select is typed by its transition and reads the after memory (rule 22). A live operation is placed in one state at a time unless `when` tokens make placements exclusive (`DuplicatePlacement`). | MD rule 41, 2.7.10; OD2, OD9 Q22, OD17 Q14 |
| K5 | **Rows.** `s.operations.x` is the placement's lane, `undefined` while not placed; under `each`, a keyed list read with `O.x.get(s, k)`, `undefined` for a key not placed; guards and callbacks read `O.x.get(operations, k)`. Existence is explicit (N3). | MD rule 42, 2.7.5, N3; OD9 Q21, OD23 Q33 |
| K6 | **The verb decides one-off or live**, not which outcome key is mapped. Streams have only `subscribe`. | OD2, OD2a; MD rule 41 |
| K7 | **`VerbMismatch`.** One operation uses one verb, and the verb agrees with the mapping. | MD rule 41, 2.7.3; OD9 Q23 |
| K8 | **Mapper context** for a read or stream is `(value, { input, key })`; `key` is the contract's key record of the session. | MD rule 13; OD12 |
| K9 | **Runtime-owned write lanes.** A write lane is (actor identity, contract id, key), owned by the Runtime; disposing an actor never drops or cancels its sent, held or queued writes; a later incarnation of the same identity adopts its own lanes; lanes are Runtime records, persisted per lane; a held unknown is delivered once as `unknown { Restored }` on rebind or restore. A streaming write's progress lives on this lane (M6-D1 rebase note). | OD19, OD20, OD21, OD22, OD25; MD rules 21, 44, 46 |
| K10 | **The write lane's table.** States `Idle`, `InFlight`, `Held`; only a never-sent commit is replaceable; a sent Attempt's ending is always delivered; `cancel` in `InFlight` retains `unknown { Cancelled }`, holding the lane; key-less members in an ending's own handler; rows `{ pending, uncertain, waiting, retryCount, progress? }`; `progress` keeps its own schema; `UnresolvedHold`. | OD5–OD8, OD10, OD18; MD rules 21, 24, 43, 45, 2.7.13 |
| K11 | **Rule 14 delivery.** An ending is mapped and its owner tested at admission: owner activation alive → current from the active leaf; an ended activation of this incarnation → late, from the nearest live strict ancestor; an adopted lane → current. Routing is never decided at settlement. Whether stream deliveries are current-or-late or discarded on release must be stated against this rule. | MD rule 14, rule 15; OD21 |
| K12 | **Rule 20 required handling.** Every current event that can occur is handled totally from every leaf under its owner; every late event at a strict ancestor; adopted endings over the new-incarnation arrival set; a read's tag record maps `Defect` and `Interrupted` (rule 37); `{ target: "self" }` is the explicit ignore; checked by `flow check`. | MD rule 20, rule 37; OD22 |
| K13 | **Merge 4: the record queue and `listen`.** For a domain operation the domain owns shared data (rule 26); the record queue orders writes per record across actors (rules 29, 30); `uncertain` marks are cleared only by rule 32; reads carry confirmed data (rule 37); no temporary ids (rule 33). `listen(stream).as([Entities], mapping)` may change only those entities (EDP O1). | MD rules 26–38, 2.8; M4; EDP O1 |
| K14 | **No Flow timeout, no Flow retry.** Waiting and trying again are machine states and schedules; classification runs outside the fiber it interrupts. | MD rule 25 |
| K15 | **Schedules.** Function schedules read the after memory; keyed schedules use key records, `restartOn` per key, `armOn` banned there; an overdue schedule fires once; on restore a Duration keeps its deadline and a multi-step Schedule restarts at step one. | MD rule 23; OD17 Q13, OD23 Q29; MCH O5 |
| K16 | **Mapped events come only from endings.** An event an operation maps is never a schedule's `send`, a `raise` or a view's `send`. | MD rule 47; OD23 Q33 |
| K17 | **Deliveries are never lost** (rule 8) and **existence is explicit** (N3). The design states how stream deliveries fit rule 8. | MD rule 8, N1–N3 |
| K18 | **One-off reads**: one lane per operation; a newer lookup releases the older (`Superseded`); only the latest is delivered; not persisted. A catch-up read built on `lookup` inherits these. | MD rule 42; OD9 Q6, Q26 |
| K19 | **The turn, the FIFO mailbox and its cap.** One turn at a time; FIFO; 1,024 pending external events; outcomes and firings are bounded by admitted work and never count against the cap. | MD 2.5; RT O4; P21 |

**Placeholders, not constraints.** MD already mentions merge 6 in several places, citing the earlier draft's rule
numbers. Those citations are placeholders the new design replaces; they do not bind it (see IP27).

## 4. Accepted owner decisions (M6-D1–M6-D7)

Accepted by the owner on 2026-10-30, before the merged design and before the reviews. The designer uses them as
constraints, and may argue to overturn one only with a stated reason (a failure case it causes, or a conflict with
section 3). Section 5 notes the failures that touched each.

- **M6-D1.** `stream()` carries data the server pushes independently of any write (chat, presence, prices, `listen`).
  A streaming write (an LLM answer, an upload) stays a transaction with its Attempt and endings, and its commit
  reports `progress(value)`; Flow counts nothing. Rebased: `progress` keeps its own schema (OD18) and lives on the
  Runtime's write lane (OD19).
- **M6-D2.** The contract stays "`subscribe` returns an Effect `Stream`". Any SDK reaches it through
  `Stream.fromAsyncIterable`, `Stream.fromReadableStream` or `Stream.callback` inside an Effect service the author
  writes. A plain Stream with nothing but values must work: a session's first value means it is open. (The output
  schema is `output`, OD12.)
- **M6-D3.** An adapter-side reconnect combinator ships, marked for the owner's later review: inside one session it
  connects, passes values through, remembers the last value's position, and on an error its predicate accepts it
  reports the drop, waits by the author's schedule on Effect's clock and connects again from the last position; any
  other error, or an exhausted schedule, ends the session. It mirrors `Effect.retry({ schedule, while })`. Flow's
  runtime never re-opens a session. *Failures it met: FC19, FC36, FC41, FC46.*
- **M6-D4.** Progress is read from the write's row and given to each ending mapper, not delivered as an event; a fact
  feed delivers one value per turn; the words are **`delivers`** (the declaration of the two kinds) and
  **`connection`** (the connection status). Superseded in part by M6-D5 (progress's spelling). *`connection` as a
  field met FC50; the designer may rename or reshape it with a reason.*
- **M6-D5.** Progress is the write row's `progress`, and exists only under `reject`, `latest` and `cancel`, where a
  lane has one addressable Attempt; declaring it on `allow` or `serialize` is a type error. Read with
  `O.gen.get(s, k)?.progress` (MD 2.7.5). *See FC71.*
- **M6-D6.** Two sessions of one `listen` entry on one key in one Runtime are two sources: both apply, either's loss
  lowers frontiers, and `flow check` warns `DuplicateListen`. Open for the owner: sharing one `listen` session per
  Runtime. *See FC76.*
- **M6-D7.** One session per key for keyed placements. **Settled differently by the merged design**, which the owner
  accepted later: `subscribe.each` gives one session per distinct key, and two selected inputs with one key are one
  session (K4). M6-D7's "`DuplicateSession` for the later key" clause no longer applies.

## 5. Known failure cases

The test list both designs are judged against. Each is a scenario: setup, steps, what went wrong for the user or the
author. Sources: GAPS (G1–G13), R1, R2 (High, Medium, Low, Authoring), AUD, and the product-case walks. A case marked
*(derived)* follows from the plans and was not seen in a walk. A case marked *(cost)* is not a bug but a price the
design must state.

### From the gaps (the plans as they stand)

- **FC1. An equal fact vanishes** (G1). A notification feed sends "sync now" twice. The second equals the first and
  the machine never hears it.
- **FC2. A slow reader skips a delete** (G1). A feed pushes `TicketDeleted` then `TicketSaved` for another ticket
  while the consumer is busy; the newer push replaces the older in the lane and the delete is never applied.
- **FC3. Mapping changes meaning** (G1). Removing a machine's `value` mapping (to show the feed only in a view)
  silently switches the feed from "every value" to "may skip, equal values silent".
- **FC4. A Wi-Fi blip loses chat messages** (G2). The socket drops for 5 seconds; two messages are sent meanwhile; the
  reconnected feed continues with newer ones and nothing records that two are missing.
- **FC5. A `listen` stays stale with a fresh frontier** (G2). After a socket reconnect, entity answers read as fresh
  although pushes during the drop were lost; the app's "reconnect" refetch fires only on the browser's network
  coming back, not on a stream re-opening.
- **FC6. No connection status** (G3). An app cannot show "Reconnecting…", disable the composer offline, or dim a
  ticker; authors put status inside the values instead (SE's workaround), where the store and `flow check` cannot
  see it.
- **FC7. A duplicate session waits forever** (G4). A second same-actor placement of one stream and key leaves its row
  undefined and its machine waiting for events that never come, with no ending.
- **FC8. No resume** (G5). A chat cannot resume after its last `seq`; SSE cannot resume from its last id; a download
  cannot resume with `Range`. A session that ended restarts only on state re-entry, and what its row shows then is
  unstated.
- **FC9. Signed out looks like offline** (G6). A WebSocket whose token expired gives `error` then close 1006; the app
  keeps reconnecting and showing "offline" instead of asking the user to sign in.
- **FC10. Obligation facts lost on navigation** (G7). A notification feed's facts already received but not yet handled
  are discarded when the user navigates away; the bell never counts them.
- **FC11. No back-pressure** (G8). LLM tokens at 100 a second, a ticker at 1,000 a second and a chat burst all have
  undefined buffering; a WebSocket's browser buffer grows without limit.
- **FC12. A streaming write is silent** (G9). An LLM answer or an upload reports nothing until its ending; the user
  sees a spinner for 40 seconds.
- **FC13. The first-live race** (G10). A note is edited on the server between the page's initial read and the socket
  becoming live; the edit is never shown.
- **FC14. Replay duplicates and unversioned order** (G10). A resume replays edits the client already applied; an
  unversioned entity orders them by arrival and shows an older value.
- **FC15. A restored value has no age** (G11). A chat or ticker reopened after the laptop slept shows its last value
  with no indication of how old it is; a leader tab closing opens a fresh generation with the same problem.
- **FC16. Stories cannot drive a feed** (G12). There is no way to push, disconnect, reconnect, assert the resume
  position, or exercise backoff and idle deadlines on the controlled clock.
- **FC17. Nothing is checked** (G13). A feed whose machine maps values and has no handler for a possible loss passes
  `flow check`; Inspection shows only "stream sessions in flight".
- **FC18. Duplicate connections** (GAPS, smaller). Two actors with equal keys open two connections; with SSE over
  HTTP/1.1 a few tabs exhaust the six connections per origin and other requests stall.

### From review 1 (High)

- **FC19. A quiet reconnect never comes back** (R1 H1). After a drop, the socket reconnects and the server has
  nothing new to send. The feed stays "reconnecting" forever; the `listen` above it is never repaired, and a record
  deleted while down stays on screen.
- **FC20. An old price shows as live** (R1 H2). After a reconnect on a quiet symbol, the ticker shows the previous
  connection's price as live until a new tick, which may never come. Authors render the value without checking
  whether the feed is live, because nothing makes them.
- **FC21. Continuity claimed without proof** (R1 H3). An adapter that re-opens silently produces no loss report; a
  feed that starts each connection with a full snapshot is treated as "nothing missed", and a message deleted in
  between is lost from a fact feed.
- **FC22. Chat resumes past a hole** (R1 H4). After a loss, a live message beyond the hole raises "the highest seq I
  hold", which is also the resume position; the next session resumes from past the hole and nothing reports it.
- **FC23. A failed catch-up is forgotten** (R1 H4). The repair read fails once; the machine returns to its normal
  state and never retries; the missing messages stay missing.
- **FC24. A server reset drops everything** (R1 H4). The server restarts its log below the client's last seq; every
  new message has a lower seq and is discarded as already seen.
- **FC25. Reload silences an equal fact** (R1 H5). After a reload, Persistence suppresses a value equal to the last
  mapped one (PER O2); a repeated message on a fact feed is lost.
- **FC26. Overflow is per adapter and untested** (R1 H6). Each push adapter writes its own overflow handling; a
  sliding buffer evicts the "connection dropped" status along with values, so the app never learns of the drop;
  Story fakes replace the whole adapter, so overflow never runs in a test.
- **FC27. Cursors have no home** (R1 H7). A collaborative editor sends its cursor at 30 Hz; there is neither a
  documented way nor a statement that it is out of scope.

### From review 1 (Medium)

- **FC28. An ended or down `listen` leaves answers fresh** (R1 M). The `listen` session fails or sits down; covered
  answers still read fresh; its failure was not required to be handled, so nobody re-opens it.
- **FC29. A clean server close ends a feed silently** (R1 M). The server closes a feed cleanly (a deploy); the
  session completes, completion is not retried, and the chat stops updating with no visible change.
- **FC30. Stop wipes the next answer's progress** (R1 M). Under `latest`, a superseded Attempt's ending clears the
  progress the newer Attempt is showing.
- **FC31. Status sequences undefined** (R1 M). "Open" reported while already open, the first status of a connection,
  and "first connection" versus "reconnected" have no defined meaning.
- **FC32. Deliveries against the mailbox cap** (R1 M). Stream deliveries counted against the 1,024 cap would make user
  sends fail during a burst, or be dropped; rule 8 is only partly amended for them.
- **FC33. Release and restart race** (R1 M). Leaving and re-entering a state quickly joins a Supabase topic again
  before the async `removeChannel` of the old channel finished; two channels deliver.
- **FC34. An unbounded default buffer** (R1 M). An adapter built on Effect's callback stream with defaults buffers
  without limit.
- **FC35. SSE cannot prove continuity** (R1 M). `EventSource` resends `Last-Event-ID` itself, cannot be given a
  different one, and hides the `retry:` delay; before the first event nothing tells the client whether the server
  replayed.
- **FC36. Budget reset unstated** (R1 M). Whether the reconnect budget resets after a successful connection is
  unstated (the example used a schedule combinator that does not exist).
- **FC37. A stall looks like completion** (R1 M). An idle deadline written with `Stream.timeout` ends the stream
  cleanly; a stalled feed or answer reads as finished.
- **FC38. Wall-clock adapters** (R1 M). An adapter using `Date.now` or `setTimeout` for heartbeats cannot be driven
  by the Story clock.
- **FC39. Retry after Stop unstated** (R1 M). After Stop on an LLM answer under `reject`, whether Ask again is
  admitted is unstated; the Story's reload spelling was guessed.
- **FC40. A flat market looks dead, or a dead feed looks flat** (R1 M). Equal prices are silent, so a healthy flat
  market and a dead connection look the same; there is no recipe for "stale after a quiet minute".

### From review 2 (High)

- **FC41. A flapping server loops forever** (R2 H1). A draining load balancer accepts each connection and drops it
  within a second. Because each accepted connection restores the budget, the client reconnects every 500 ms forever,
  and each cycle costs a catch-up read or a `listen` refetch.
- **FC42. A partial catch-up page declares the chat in sync** (R2 H2). The repair read returns one page of three, or
  an empty page; the machine returns to "in sync" with messages missing between the page and the live ones.
- **FC43. A late page from the old log** (R2 H2). After a server reset, a catch-up started before the reset returns
  late and writes the old log's position back.
- **FC44. Hole detection fails on sparse positions** (R2 H2). With timestamp or ULID positions, a client cannot tell
  from positions whether anything is missing; "never resume past a hole" works only for dense integers.
- **FC45. Reload mid-repair gets stuck** (R2 H2). The tab reloads while a catch-up is running; the read is not
  resumed (one-off reads are not persisted), the new session's server honestly says "nothing missed since your
  position", and the machine waits in "catching up" forever.
- **FC46. Every quiet reconnect after a reset reports a loss again** (R2 H2). After a reset, the reconnect still asks
  from the old log's position because no message has arrived since; every quiet reconnect gaps again.
- **FC47. A silent SDK rejoin loses deletes** (R2 H3). An SDK reconnects internally and reports "subscribed" again
  without reporting a drop first; deletions during the gap are never repaired.
- **FC48. Leaving a screen leaves answers fresh** (R2 H4). The dispatcher opens settings; the queue's `listen` session
  is released; the ticket list still reads fresh with no push channel, and shows a deleted ticket on return.
- **FC49. Bounds on one path only** (R2 H5). Bounds exist for SDK-callback sources but not for WebSockets (the browser
  buffer is unbounded without `highWaterMark`); a flapping SDK's status changes pile up without limit.
- **FC50. The live/stale view code does not compile, or lies** (R2 H6). The connection field existed only on the
  running phase, so `row?.connection === "Live"` failed to type-check against ended sessions; and
  `show(live ? row.data : row.lastValue)` type-checked while rendering a stale value as current.
- **FC51. Registration before it exists** (R2 H7). graphql-ws acknowledges the connection, not the subscription. The
  client treats the acknowledgement as "listening" and starts a catch-up that finishes before the server registered
  the subscription; facts in between are lost and the repair counts as done.
- **FC52. A feed that can never be repaired** (R2 H8). An SSE notifications feed with no read endpoint and no server
  greeting reports a possible loss on every restart, and nothing can ever resolve it.

### From review 2 (Medium, Low, Authoring)

- **FC53. Dimmed forever** (R2 M). A push-on-change state source sends nothing after a reconnect (the value did not
  change); the row never becomes live again; equality suppression also kept a reconnect from becoming live.
- **FC54. A cached value as fresh** (R2 M). An SDK serves a cached snapshot during a drop; delivered as an ordinary
  value, it is shown as fresh and fires a price alert.
- **FC55. Values before the subscription is confirmed** (R2 M). A change arrives before the SDK's "subscribed" status;
  delivered first, it precedes the loss report it should follow.
- **FC56. A woken page shows a 10-minute-old price as live** (R2 M) until some timer fires.
- **FC57. Outbound state lifecycle** (R2 M). Ghost cursors stay after the user leaves; a restored cursor is re-sent as
  current; each move costs a turn at 30 Hz.
- **FC58. Progress from callbacks is awkward** (R2 M). XHR progress callbacks must report through an Effect-returning
  function; authors hand-wire a runtime in the callback.
- **FC59. Stories miss real sequences** (R2 M). A Story cannot withhold a server greeting, hold a catch-up response,
  reorder frames or background the page.
- **FC60. Out-of-sync has no exit** (R2 M). A chat that could not repair stays "out of sync" with no automatic way
  back; messages held during the repair are never pruned.
- **FC61. Clean close is unreachable on Effect sockets** (R2 L). Effect's sockets fail on every close, clean or not, so
  any design branch for "the connection ended cleanly" never runs on the WebSocket path, while it does for push
  sources, and the two behave inconsistently.
- **FC62. Normal snapshots look like reconnects** (R2 L). Firestore delivers repeated server snapshots; an adapter that
  reports "registered" on each one makes every snapshot look like a reconnect.
- **FC63. Correctness bought with size** (R2 Authoring). The chat machine grew from 17 to about 110 lines, much of it
  an algorithm every chat app would repeat.
- **FC64. The most common adapter mistake** (R2 Authoring). An adapter reports a drop and then delivers values without
  ever reporting that it is registered again.
- **FC65. The most dangerous adapter line** (R2 Authoring). An adapter reports "nothing missed" with no evidence
  behind it; every consumer trusts it.

### From the walks and the multiplicity audit

- **FC66. A quiet room disables sending** (walk 7.7.5). With an SDK that never confirms the subscription, the honest
  choice is to count the first value as registration; a quiet chat room then never reads live and a guard on "live"
  denies sends. *(cost)*
- **FC67. A cached first snapshot reads as live** (walk 7.7.3). Firestore's first snapshot comes from cache; unless
  the adapter knows to say so, it is treated as the session's first value and shown as current.
- **FC68. Two catch-ups for one rejoin** (walk 7.7.2). A Supabase change fires before `SUBSCRIBED`; the design's
  conservative reading costs two repair reads. *(cost)*
- **FC69. Leaving and returning costs a read** (walk 7.6). Coming back to the queue refetches the list once, even when
  nothing changed. *(cost)*
- **FC70. Stop holds the next Ask** (walk 7.4). After Stop, the interrupted Attempt holds the lane (OD5); the next Ask
  is refused until the machine releases it. A reload while asking ends the Attempt `unknown { Restored }` with no
  partial text. A Stop then retry may charge twice when the server kept generating (no browser API reports it).
- **FC71. Several uploads, one progress** (walk 7.5, AUD row 10 / F1). Concurrent uploads under `allow` have no single
  Attempt whose progress the row could show; the draft's upload walk used `allow`.
- **FC72. Polling restarts at the beginning** (walk 7.7.6, DD). DD's polling adapters restart at cursor `"0"` and turn
  a failed GET into a defect.
- **FC73. A flapping server ends the session; the machine re-opens it** (walk 7.1 step 5). After the budget, the machine
  needs its own backoff state to re-open; each re-open costs a catch-up. *(cost)*
- **FC74. Repeated "some notes may be missing"** (walk 7.7.4). An SSE feed with sparse ids, no greeting and no read
  endpoint tells the user on every reconnect that something may be missing. *(cost; the server's fix)*
- **FC75. Tabs** (G11, MT). A second tab opens its own sessions; a leader tab closing hands over to a fresh
  generation that must not show stale state as current or lose the resume position.
- **FC76. Two `listen` sessions on one entry** (AUD F10). Two actors place the same `listen` on one key: every push is
  applied twice; one session's possible loss forces refetches although the other was continuous; without versions a
  lagging duplicate repositions a field until a contest refetches it.
- **FC77. Reload restarts the machine's backoff** *(derived, MCH O5)*. A multi-step schedule restarts at step one on
  restore, so a user reloading during a flapping outage resets the machine-level backoff.
- **FC78. A server-rendered price reads as live** *(derived, SSR O3, O5)*. A transferred latest value is displayed on
  the client before the client's session exists, and nothing marks it as not current.
- **FC79. Upload shows 100% before the server has it** (GAPS). XHR progress counts bytes handed to the network stack;
  the bar reaches 100% while the request is still in flight or about to fail.
- **FC80. A truncated body looks complete** (GAPS). An intermediary closes a `fetch` body cleanly mid-answer; without
  a terminator the answer reads as finished.
- **FC81. A half-open socket looks alive** (GAPS). After the laptop sleeps, the socket reports open for minutes while
  nothing arrives.

## 6. Integration points

Every place a streams design plugs into the merged design or the plans, and what each needs from the design.

| # | Where | What the design must supply |
| --- | --- | --- |
| IP1 | The contract (MD rule 39, 2.7.3; OD12, OD14, OD23 Q38) | The stream kind's own options (SR1's declaration, any bound), and how the resume position appears in `input` outside `key` |
| IP2 | `.outcomes` (MD rules 13, 40) | The stream outcome keys, their mapper contexts and which are required per kind (SR26, SR36) |
| IP3 | Verbs and placements (MD rule 41, 2.7.10) | Stream behaviour under `subscribe`, `subscribe.each`, `when`, `DuplicatePlacement`; what two operations on one contract and key mean (SR39) |
| IP4 | Rows (MD rule 42, 2.7.5, N3; OPS O6) | The row type per kind, readable in views, guards (`O.x.get(operations, k)`) and Stories; replaces OPS O6's stream tags (`Running`, …) |
| IP5 | Delivery routing (MD rules 14, 15) | Whether stream deliveries are current/late or discarded on release, and why (SR33) |
| IP6 | Required handling (MD rules 20, 37) | The stream rows of rule 20, including `Defect` and `Interrupted` |
| IP7 | Rule 8 and N3 | How stream deliveries fit "deliveries are never lost" and "existence is explicit" |
| IP8 | Memory reads and the turn (MD rule 22, 2.5) | When a session reads its `input` (start only, or later), and where in the turn a delivery is admitted |
| IP9 | Schedules (MD rule 23; MCH O5) | How heartbeats, quiet-feed staleness, page wake and machine-level backoff relate to schedules, including restore of a multi-step schedule (FC77) |
| IP10 | Rule 25 | The line between adapter reconnect and machine reconnect |
| IP11 | Rule 47 | Whether stream deliveries count as endings for this rule |
| IP12 | The mailbox (RT O4; P21) | Deliveries in FIFO, outside the 1,024 cap; replaces RT's "Stream values coalesce" and "Facts from an ended activation are discarded" |
| IP13 | Runtime disposal (RT O6) | Session release within the 5-second disposal bound; providers closing after consumers |
| IP14 | Write lane (MD 2.7.13, rules 21, 24, 43–46; OD5–OD8, OD18–OD25) | Progress on the lane's rows and endings, per Attempt; its table cells for superseded and cancelled Attempts; persistence (never) |
| IP15 | Session ownership (OD19, OD20; MD rule 44) | Activation or Runtime; adoption and rebinding or their absence (SR33); `runtime.unsettledWrites()` |
| IP16 | Entity domains (MD 2.8, rules 26–38; EDP O1) | `listen(stream).as(...)`: application order, interaction with record queues and `uncertain`, staleness causes, frontiers |
| IP17 | Entity staleness and repair (EDP O1 repair paragraph; ED 5.3) | What a stream interruption does to frontiers; EDP's "Reconnect … refetch covered answers" must mean a stream event, not only the browser's network |
| IP18 | Entity property tests and audit (EDP O4) | Stream faults (push, disconnect, reconnect, unsubscribe) in `propertyTest`; audit after each push |
| IP19 | Operations.plan O1, O4, O6, V9, Q1 | Rewrites of the stream declaration (`result`, `persist`), O4's session rules (`DuplicateStreamSession`), O6's stream tags, V9's Stories, and Q1's deferred buffering |
| IP20 | Machines.plan O6 | The old `activities: { name: … }` syntax and its subscription outcome names (`complete`, `failure`, `defect`, `interrupt`) |
| IP21 | Persistence.plan O2, O4 | The stream `persist` option; the "last mapped value" baseline (must not apply to facts, FC25); "running streams retain their latest value and count"; second-tab behaviour |
| IP22 | ServerRendering.plan O2, O3, O5, V3, V5 | Settling ignores streams; transfer of "latest stream values and counts"; "existing stream lanes win"; new sessions on the client; display as not current |
| IP23 | Testing.plan O2, O3, O6 and M3 | Fixtures as fake transports with controls; controlled clock for adapters; `process()` and open streams; property-test faults; `Story.ending` (MD rule 47) for deliveries; M3's open spelling (`Fixture.stateful`, `.control`, `closeTab`/`openTab`) |
| IP24 | Playback (PB; Testing.plan O4, O9) | Frames carry each feed's phase and last-known age; `useNow` for "as of" text; playback starts no Flow work, so no session runs while watching |
| IP25 | Inspection.plan | Sessions in flight with phase, evidence for continuity verdicts, losses, bounds, release; the `stream` evidence kinds; redaction of sensitive stream values |
| IP26 | `flow check`, `flow explain` (MD 2.7.16) | The stream findings of SR36, the `KeyOmitsInput` exemption, the explain line of SR37 |
| IP27 | Placeholders in MD | Replace these citations of the earlier draft: N3 "(merge 6)"; 2.7.3's per-kind table ("`value`, `gap`, `complete`, `failure` (M6 rule 50)" and "M6 4.1.5's stream lane"); 2.7.3's "two sessions on one key end `DuplicateSession` (M6 rule 47)"; 2.7.8's "M6 rule 44"; 2.7.10's "`DuplicateSession` (merge 6 rule 47)"; 2.7.13's lifetime row "M6 rule 44"; section 7 item 9 ("writes that stream: deferred") |
| IP28 | React (`useView`) and multi-tab (MT) | Row reads in views; tab leadership and handover |
| IP29 | Sync-engine adapter (SE) | How an engine's own status, offsets and `truncate` map onto the design without status inside values |

## 7. Product cases to walk end to end

Each case is walked from the browser API or SDK up to the view, with a Story, under every relevant failure in section
5. The tier of section 0 is given for each.

- **7.1 Chat with catch-up** (common for the live path; uncommon for repair). *As a user in a chat room, I see new
  messages as they arrive, a "reconnecting" state when the network drops, every message I missed after it returns,
  and a clear notice if some history cannot be recovered.* Source: a WebSocket through `effect/socket`, a server that
  replays from `{ epoch, after }` when it can and answers "reset" when it cannot, a paged HTTP history read, a post
  transaction. Walk: first load, a drop and replay, a quiet reconnect, flapping, a loss with a failed repair, a reload
  mid-repair, a server reset.
- **7.2 Presence** (common). *As a member of a room, I see who is here, dimmed while the connection is down, and
  correct again once it is back, even if nobody joined or left.* Source: a WebSocket sending a full presence state on
  join, then diffs.
- **7.3 Stock ticker and a quiet feed** (common; quiet-feed staleness uncommon). *As a trader, I see the current price
  of each symbol on my watchlist, I can tell a flat market from a dead connection, and an alert never fires on an old
  price.* Source: a WebSocket at up to 1,000 ticks a second, each with the server's `asOf`; a watchlist under
  `subscribe.each`.
- **7.4 LLM tokens with Stop** (uncommon). *As a user asking an assistant, I see the answer appear token by token, I
  can press Stop and ask again, and a cut-off answer is shown as incomplete, not finished.* Source: `fetch` with a
  streamed body (or the OpenAI or Vercel AI SDK) inside the commit of a transaction; NDJSON frames ending in a
  terminator.
- **7.5 Upload progress** (uncommon). *As a user uploading a file, I see a progress bar, I can cancel, and a failed or
  unknown upload is reported honestly.* Source: `XMLHttpRequest` with `upload.onprogress`, an idempotency key; one
  upload per lane.
- **7.6 `listen` feeding entities** (common). *As a dispatcher, my ticket list updates when colleagues save or delete
  tickets, never shows a deleted ticket after my connection drops and returns, and is not trusted while I am on
  another page.* Source: Supabase Realtime `postgres_changes` (or any fact feed) mapped with
  `listen(stream).as([Ticket], …)`.
- **7.7 Three SDKs** (uncommon). *As an author, I can wire a vendor SDK into a stream without learning a different
  model per vendor.*
  - **Supabase Realtime**: channel status callbacks, async `removeChannel`, sign-out events; a fact feed.
  - **Firestore `onSnapshot`**: cached and server snapshots, `fromCache`; a state feed.
  - **graphql-ws**: a connection acknowledgement but no per-subscription acknowledgement; a fact feed.
  - Also walked briefly, to test DG3: **SSE** (`EventSource` with dense ids, no greeting, no read endpoint) and
    **polling with a cursor** (DD's `technicianUpdates`).
- **7.8 Cursors** (rare). *As a collaborator in a document, I see others' cursors move smoothly, they disappear when
  someone leaves, and mine is re-sent after my connection returns.* Source: the document's WebSocket (or a
  Liveblocks- or Yjs-awareness-like channel), sending the local cursor latest-wins at up to 30 Hz, receiving others'
  as a state feed.

## 8. Out of scope and parked

- **Flow as a network library.** Transports, auth, heartbeats, close-code mapping and resume handshakes are adapter
  code. Flow ships no WebSocket client, no SSE polyfill and no SDK wrappers.
- **Sync-engine guarantees.** Log replay across sessions, offline catch-up and completeness belong to a sync engine
  behind SE; entity domains stay client coherence (owner scope).
- **A manual reconnect member** (proposal 11.1, owner 2026-10-30): **parked, stays parked.** Today a machine
  reconnects by leaving and re-entering the placing state. Whether a "Reconnect now" control that does not leave the
  state is needed is open; if it is ever added it is named `reconnect`, not `refetch` (a resource word), and a
  reconnect from the position before a loss may double as "resync now". The design must not depend on it and must
  not preclude it.
- **Effect RPC adapters** (`fromRpc`, OD13): later.
- **Operations in fragments** (OD17 Q19): their own exploration.
- **Story API spelling**: M3 is being revised; the design states its needs (SR34, SR35), not M3's syntax.
- **Sharing one session per Runtime** for `listen` or for SSE's connection limit: open for the owner (M6-D6); the
  design may propose it as a separate question.
- **Download resume** (HTTP `Range`) as a Flow feature: adapter code over the resume position, if at all.

## 9. Lessons from operations

The write lane went through many prose revisions in which each review found new holes at the edges (disposal,
reload, cancel during a hold, adoption), because prose let every rule be read two ways. It converged only once it was
stated as an explicit state machine, with states, a table of every member and ending against every state, flags
defined as functions of the state, and an executable model (`merged/operations/lane-model/`) whose invariants and
mutants were run (OD10, OD20, OD25). A streams design should start there: state its connection behaviour and its loss
and recovery behaviour as small state machines given as tables with every cell filled, with invariants for SR5, SR8,
SR9, SR10, SR18 and SR20, and an executable model with mutants for the failures in section 5, before any example is
written.
