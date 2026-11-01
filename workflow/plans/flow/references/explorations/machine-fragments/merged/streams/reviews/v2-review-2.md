# v2 review 2: ten library families, written on paper against proposal-v2 revision 2

Method: judgment only. No code run, nothing installed. Each family is an adapter an app author would write from
proposal-v2 alone, checked against PA1/PA2 (documented behaviour) and Effect 4.0.5 source. Findings are advice.
Facts I could not confirm are marked **[unconfirmed]** with where the gap is.

Effect checks that matter below (all against `node_modules/effect/src`):
- `Socket.makeWebSocket(url | Effect<string>, { highWaterMark })` exists. Browsers have no pause, so past the mark it
  fails with `SocketReadError`; default is unbounded. Every close, code 1000 included, fails the reader with
  `SocketError { reason: SocketCloseError { code } }`; a socket never completes, so `Closed` cannot come from it.
- `Stream.unwrap` removes `Scope` from the stream's requirements, so the 4.1 pattern (acquire inside `unwrap`) is sound.
- `Stream.timeoutOrElse` is checked per pull, so it is an idle deadline, and does not run while Flow is not pulling.
- `Stream.paginate(s, f)` has one state type `S`: the first call gets the seed, later calls get `Option.some(next)`.
- `Stream.fromAsyncIterable` calls `iter.return()` at scope close but only fire-and-forgets it while a `next()` is
  pending (`Channel.ts` ~2005-2012), so "finalizers are awaited" (R-Owner) does not hold for it in the usual case.
- `Stream.callback` defaults to an unbounded buffer, as 2.3 says. `Stream.decodeText()`, `Stream.splitLines`,
  `Stream.fromReadableStream({ evaluate, onError })`, `Effect.callback`, `Effect.timeoutOrElse` all exist and type as used.

## Two cross-cutting points that decide most families

**X1. Who owns the transport.** `Feed.reconnect(connect)` assumes a connection is *per session*, opened and closed by
`connect`. That is true for raw WebSocket, EventSource, `fetch`, and graphql-ws (lazy client, `retryAttempts: 0`). It
is false for Socket.IO, Ably, Supabase/Phoenix, Firestore and the Electric client: one app-wide connection, SDK-owned
reconnect, and a session is a subscription on it. Closing it per session would kill every other session. Q3's recipe
("wrap the SDK in `Feed.reconnect`, turn its own retry off") works only for the first group. For the second group the
only workable shape is `Feed.callback` that emits `Feed.down`/`Feed.live` from SDK status events, optionally inside
`Feed.reconnect` for the terminal case (3.4 passes inner `down`/`live` through, so this is already supported by the
table, but 2.4's wording and 4.6 steer people the other way). Details in H3.

**X2. A first start has nothing to lose, and the design reports it as lost.** See H1.

## Findings (severity first; per-family sections follow)

### High

**H1. Every fact feed that starts without a resume position gets `missed Unproven` on its first connection.**
R-Live: "anything not proven is delivered as `missed`". 3.1 cell (`Opening`, `Feed.live()`) = `deliver(missed
Unproven)`; a plain Stream's first value does the same. Only 4.1 escapes, because history gave it an `after` and the
server echoes it. Everything else hits it: Supabase/Phoenix join (no continuity flag, PA1 s4), Ably (first attach is
always `resumed: false`, PA1 s1), Socket.IO (first connect `recovered: false`), graphql-ws, SSE with no `after`, any
one-shot fetch stream. The type-required `missed` handler then shows "some messages may be missing" on every first
load. The only honest escape is to invent a proof string ("no position, nothing owed"), which is the over-claiming
SR6 exists to prevent and which every app would repeat (open-items 15).
Fix: `Feed.reconnect` knows `from`. On a session's first connection with `from === undefined`, it turns an unproven
`Feed.live()` into a proven one with a fixed basis (`"session start, no resume position"`). A bare `Feed.callback`
session (SDK-owned reconnect) gets the same rule in 3.1: (`Opening`, unproven live) owes `missed` only if the session
was started with a defined position, which Flow can read from the contract's `position`/`from` declaration. `listen`
must keep lowering on the first connection (FC13, 2.8's table), so key that rule on "first connection", not on the
answer being unproven. This is a table change, no new public word.

**H2. `catchUp` has no way to say "the history does not reach back to `from`".** Bounded-retention sources are the
norm: Ably history (2 min unpersisted, 24 h/72 h persisted, rewind cap 1000, PA1 s1), Electric (409 after shape
purge), Firestore change windows, any log with compaction. Their history call succeeds and is silently short. The
author's choices today are: return an honest-looking `none` (a lie, and the proof reads *complete*), or fail (retried
by `pageSched`, then spends reconnect budget, then ends the session; the unrecoverable gap becomes an outage).
Neither reaches `missed Lost`, which is the right answer. Fix: let a catch-up step fail with a Flow-shipped
`Feed.CannotRepair(reason)`; `Feed.reconnect` then ends the catch-up as *abandoned*, flushes the buffer, and emits
the `lost` answer for this connection (`missed Lost`, no drop, no budget spent). One error class, not a new option.

**H3. The headline mappings in the proposal (Ably `resumed`, Socket.IO `recovered`) are unreachable under the
proposal's own SDK recipe.** Both flags exist only while the *same SDK instance* reconnects itself (Ably: same
connection, "resume"; a fresh instance needs a `recoveryKey`; Socket.IO: recovery state lives on the client Socket
across its own reconnects). Q3's recipe disables the SDK's retry and builds a new client per `connect(from)`, which
discards the flag permanently: every reconnect is unproven, then `missed` or a hand-written catch-up. Separately,
2.3 says a proof is honest only if "the server's evidence names *this* `from`". Neither flag names the app's `from`;
they name the SDK's own last-received position. That is still honest (SDK-last-received equals Flow's `last` as long
as `Feed.callback` passes everything it received, and an `Overflow` fails the stream, so no silent skip), but the
2.3 sentence disqualifies it as written. Fix: (1) 2.3/2.4 state two recipes, X1 above, and say which sources take
which; (2) reword the proof rule to "the evidence covers the span since the last value this connection delivered".

### Medium

**M1. `Overflow` is missing from the `failure` record.** 2.7 lists "adapter tags plus `Closed`, `Defect`,
`Interrupted`". `Overflow` reaches `failure` when `Feed.callback` is used without `Feed.reconnect` (the X1 shape) and
when the reconnect budget is exhausted on an `Overflow`. Add it to the exhaustive list, or fold it into `Closed`.

**M2. `Feed.callback` cannot back-pressure a callback that awaits.** ElectricSQL's `stream.subscribe(cb)` awaits the
callback's promise [shape of the API unconfirmed; PA1 does not cover the client]. A bulk initial sync delivers
thousands of rows in one batch; `emit` is synchronous, so the first 1,024 pass and the rest overflow, the session
drops, resumes from the last passed position, and burns one schedule step per 1,024 rows. Fix: let `emit` return a
`Promise<void>` that resolves when the queue has room, or make Electric a state feed (below).

**M3. `catchUp` has one cursor type.** Paged histories use an opaque page token distinct from the message position
(Ably `PaginatedResult`, Firestore `startAfter(snapshot)`). `Stream.paginate`'s `S` forces the position and the page
token to be one type, so the author wraps both in a union or closes over a mutable pager. Fix: `catchUp:
(from: P) => Stream<A, E>` that ends when the server says complete is simpler to write, but loses explicit `none`
(Q15's reason). The alternative that keeps it: `catchUp: { start: (from) => S, step: (s) => Effect<[values,
Option<S>]> }`. Owner's call; flag it before the type is frozen.

**M4. Liveness is the app's job and is not in-band for most SDKs.** The 45 s `Stream.timeoutOrElse` of 4.1 works
only because the server sends app-level ping frames the adapter sees. graphql-ws defaults `keepAlive: 0` and "no
automatic action if the server never pongs" (PA2 s3); its pongs are not items in `iterate`, so an idle deadline on the
stream would kill healthy quiet subscriptions. Phoenix needs the *client* to send heartbeats (`heartbeatIntervalMs`
exists, PA1 s4); Effect's socket sends none. Electric's `up-to-date` is the only heartbeat and only on live long-poll
timeout (~20 s default [unconfirmed beyond PA1 s2]). Every adapter hand-writes "liveness source + deadline + `down`".
Absorb candidate for open-items 15: `Feed.callback` gets `emit.alive()` (resets an idle deadline, no value), and
`Feed.reconnect` takes `idle: Duration`. Question whether it earns two words; the alternative is a documented recipe.

**M5. Writes over the live connection have no route.** Socket.IO `emit` with ack, Phoenix `push`, Ably `publish`,
graphql-ws mutations go through the same SDK object the session owns inside a `Stream`. A transaction's `commit`
cannot reach it. The proposal avoids the question (chat posts over HTTP; 4.8's cursor workaround passes `send` out of
`connect`). Under X1 the SDK client should be an app-level service, sessions only subscribe, and commits use the
service; that is a recipe, but it must be written down, because the offline behaviour differs: Ably and Socket.IO
queue publishes while disconnected, so a commit can "succeed" locally and land later (an `unknown` ending, not a
success). Each app repeats this.

**M6. Release can exceed the 5 s bound.** Supabase `removeChannel` is async and waits on a leave push; Phoenix's
default push timeout is 10 s (PA1 s4). Whether `removeChannel` honours it is **[unconfirmed]**. If so, 4.6's finalizer
can outlive RT O6's bound, producing `ReleaseOverdue` and the very overlap R-Owner prevents. Recipe: race the
finalizer against 3 s inside the adapter. Also `fromAsyncIterable`'s non-awaited `return()` (Effect note above).

**M7. Finite one-shot fact streams have no success ending.** A fetch NDJSON/SSE body of facts (not tokens as progress)
ends with `Closed`, mapped through `failure`. `done` is a failure. Fine if intended (FC37), but the author must
encode a terminator frame as a typed `Finished` error to tell it from truncation, and the first value is also an
unproven start (H1). Say so in 4.4's text, or give finite streams a `Done` ending.

**M8. Electric facts + `listen` cannot express `must-refetch`.** A reset means "discard every row of this shape".
`missed Reset` with `restartAt: "-1"` restarts the position, but `upsert`/entity patches cannot delete rows removed
during the gap. State feed (materialised rows) has no such problem.

### Low

- L1. Close-code and error classification (`4401` terminal, others transient) is hand-written in every WS, SSE and
  graphql-ws adapter. A shared `Feed.classify` helper is wiring-absorption, not a concept.
- L2. 4.5's XHR has no stall deadline, no `onabort`/`ontimeout`, and ignores `lengthComputable`. A half-open upload
  waits forever on "Waiting for the server…". 4.4 has the deadline; 4.5 should too.
- L3. EventSource `onerror` carries no status (PA2 s5): a 401 and a network blip are the same `SseDropped`, so
  `SignedOut` cannot be told apart. And EventSource cannot set headers (cookie auth only).
- L4. Plain-Stream quiet-registration (graphql-ws, quiet SSE) stays `Connecting` indefinitely; a guard on `Live`
  denies. 4.7 states the cost (FC66) and I agree it is honest.

---

## Family by family

Legend per family: (a) piece, (b) `Feed.live` claim and honesty, (c) mapping of drop / quiet reconnect / reset /
overflow, (d) `catchUp` or resume, (e) view row, (f) hacks and repeated wiring.

### 1. Raw WebSocket via `effect/socket`

```ts
// existing in 4.1; deltas only. NEW words: Feed.live, Feed.reconnect. user-defined: roomUrl, decodeFrame, Auth
Socket.makeWebSocket(Effect.map(Auth, (a) => roomUrl(roomId, from, a.token)), { highWaterMark: 1_048_576 })
//   Effect: url may be an Effect<string>, so a fresh token is fetched on every reconnect (no Flow wiring)
```

- (a) `Feed.reconnect` over a plain Stream (no `Feed.callback`). The socket is per session. Cleanest fit.
- (b) Honest. Claim only on the server's `hello` echoing this `from`; 10 s registration deadline stops pings holding
  the row in `Connecting`. A `hello` with no echo is `Feed.live()`. Proof names `from`, as 2.3 requires.
- (c) Drop and clean close are both `SocketCloseError` (Effect never completes a socket), mapped to `ChatDropped` →
  `Feed.down`. Quiet reconnect: `hello` alone. Reset frame: `Feed.live({ lost, restartAt })`, resumes at once.
  Overflow: `highWaterMark` fails with `SocketReadError`, mapped to `ChatDropped`; `Feed.Overflow` never arises here.
  4401 is terminal, so `failure`.
- (d) `from` + `position` + optional `catchUp`. All apply.
- (e) `Connecting` + `drop.why`, then `Live`. `Ended` only for 4401 or exhausted budget.
- (f) First-start `missed` if no `after` (H1). Hand-written each time: registration deadline, idle deadline, close
  classifier, client heartbeat if the server wants one (M4, L1). No server-initiated back-pressure signal exists, so
  `highWaterMark` plus drop is the only bound; honest because the resume then replays from `last`.

### 2. SSE / EventSource

```ts
// as 4.7, plus the quiet-stream escape (adapter code, no Flow word)
Feed.reconnect((from) => Feed.callback((emit) => Effect.gen(function* () {
  const es = new EventSource(url(userId, from))
  let decided = false
  const decide = (proof: boolean) => { if (!decided) { decided = true; emit(proof ? Feed.live({ proof: `ids contiguous after ${from}` }) : Feed.live()) } }
  es.onmessage = (m) => { const n = toNote(m); decide(from !== undefined && n.id === from + 1); emit(n) }   // user-defined: toNote
  es.onerror = () => emit.fail(new SseDropped())
  yield* Effect.addFinalizer(() => Effect.sync(() => es.close()))
}), { bufferSize: 1_024 }), { from: after, position: (n) => n.id, while: (e) => e._tag === "SseDropped", schedule })
```

- (a) `Feed.reconnect` over `Feed.callback`.
- (b) Honest only for dense integer ids. `onopen` could claim "registered" but would force `missed` before the proof can
  be known (3.1 does not retract a delivered `missed` on a later proof), so holding for the first id is right.
  Spec detail: `Last-Event-ID` is a string and resets on an empty `id` (PA2 s5); `Number(m.lastEventId)` is the app's
  assumption.
- (c) Drop = `onerror` → `Feed.down`. Spec: a non-200 or wrong content type closes with no retry and no detail, so a
  401 is indistinguishable from a blip (L3); budget exhaustion is the only stop. Quiet reconnect stays `Connecting`
  until the first id (L4/FC66). Reset: none exists in the protocol; a server that restarts ids needs an in-band event
  the adapter turns into `lost`+`restartAt`. Overflow: `bufferSize`, then `Overflow` drop; resume from `last` is safe.
- (d) `from` yes (query string, because EventSource will not take a different `Last-Event-ID`, FC35). `catchUp` only if
  the server has a read endpoint; PA2 notes the spec defines no replay.
- (e) `Connecting` for a quiet stream until traffic; this is the visible cost.
- (f) For any authenticated SSE (bearer headers, POST bodies, 401 detection) the app must not use `EventSource` at all
  but a `fetch` body with an SSE line parser, which is the LLM family's adapter. That recipe needs writing down. First
  start `missed` if no `after` (H1) is worst here.

### 3. `fetch` body streams (LLM tokens)

```ts
// as 4.4: the commit reads res.body; Feed is not involved. Real LLM bodies are SSE, not NDJSON:
Stream.fromReadableStream({ evaluate: () => res.body!, onError: () => new NoResponse() }).pipe(   // Effect: fromReadableStream
  Stream.decodeText(), Stream.splitLines,                                                         // Effect
  Stream.timeoutOrElse({ duration: "20 seconds", orElse: () => Stream.fail(new Stalled()) }),
  Stream.filter((l) => l.startsWith("data: ")),                                                    // SSE framing, user-defined: toToken
  Stream.runForEach((l) => Effect.sync(() => { const t = toToken(l.slice(6)); text += t.text; progress({ text }) })))
```

- (a) A plain Stream inside a `transaction` commit; no `Feed.*`. Correct: a generation is a request with a result.
- (b) No `Feed.live` claim; none needed. Truncation honesty comes from the terminator (`done`, `message_stop`, `[DONE]`),
  and 4.4 returns `unknown { Truncated }` without it. Honest.
- (c) Drop, stall, truncation, server 5xx are all `unknown` (the model may have generated); Stop is
  `unknown { Cancelled }`. No `missed`, no reconnect: resuming a generation re-bills it unless the provider supports
  it (OpenAI Responses background `starting_after` **[unconfirmed, from memory]**). Overflow: pulled body, so
  back-pressure is native, no bound needed.
- (d) None. If a provider supports resume it is a `stream` + `Feed.reconnect` with `from` = sequence number, which the
  design handles unchanged; worth one line in 4.4.
- (e) The write row: `pending`, `progress.text`, then the ending.
- (f) Fits cleanly. Wiring every app repeats: SSE line framing (dedicated parser needed for `event:`/`data:` multi-line
  and error events mid-stream), terminator detection, `Idempotency-Key`. The case that does not fit is tokens that must
  *drive the machine* (streamed tool calls): `progress` is latest-wins view data, not a machine event. That case wants
  a finite fact stream (M7, H1, `Closed` as the ending). Say that in 4.4.

### 4. XHR upload progress

- (a) `Effect.callback` inside a `transaction` commit; no `Feed.*`.
- (b) No claim. (c) `onerror`, status ≠ 201 → `unknown { UploadLost }`; 413 → `failure`. No `missed`. Overflow: n/a
  (progress is a synchronous setter, latest wins, no queue).
- (d) None; an upload resume (tus, S3 multipart) is a different protocol and an idempotency-key retry.
- (e) `row.progress` plus "Waiting for the server…" when `sent == total`.
- (f) Fits. Gaps are L2 (no stall deadline, `onabort`, `ontimeout`, `lengthComputable`), and the abort path: the
  listener is on the commit `signal`, so if the signal aborts without the fiber being interrupted the callback
  never resumes. Fix in the sample: also `resume(Outcome.unknown(new UploadLost({ status: -1 })))` in `onabort`.

### 5. Socket.IO

```ts
// SDK-owned reconnect (X1 recipe 2), so recovery works. user-defined: SioDropped, SioRejected, io, toMsg
Feed.reconnect(() => Feed.callback((emit) => Effect.gen(function* () {
  const s = io(url, { reconnectionAttempts: 8 })                                // NOT reconnection:false
  s.on("connect", () => emit(s.recovered ? Feed.live({ proof: "socket.io recovered" }) : Feed.live()))
  s.on("disconnect", (reason) => reason === "io server disconnect" ? emit.fail(new SioRejected({ reason })) : emit(Feed.down({ reason })))
  s.io.on("reconnect_failed", () => emit.fail(new SioDropped({ why: "gave up" })))
  s.on("connect_error", (e) => { if (e.data?.fatal) emit.fail(new SioRejected({ reason: e.message })) })
  s.on("chat", (m) => emit(toMsg(m)))
  yield* Effect.addFinalizer(() => Effect.sync(() => s.disconnect()))
}), { bufferSize: 1_024 }), { position: (m) => m.id, while: (e) => e._tag === "SioDropped", schedule })
```

- (a) `Feed.callback`, inside `Feed.reconnect` only for terminal failure. With recipe 1 (new client per connection)
  `recovered` is always false: H3.
- (b) `recovered === true` means the server replayed events missed since the socket's last received packet, after
  `connect`; matches "replayed values come after the signal". It is honest only because the same Socket survives and
  `Feed.callback` passes every received event. Not honest, and not even attemptable, for the first connect (H1) or a
  client that never received an event ("server must send at least one event so the client has an offset", PA2 s2).
  Adapters that do not check `recovered` (just `Feed.live()`) are correct but conservative.
- (c) `transport close`/`ping timeout` → `Feed.down`, SDK retries on its own backoff (defaults 1 s to 5 s,
  randomised, attempts Infinity, reset after success **[unconfirmed]**); set a finite `reconnectionAttempts` or the
  budget never ends. Quiet reconnect: `connect` fires, `recovered` true or false. Reset: the library defines no reset
  event, only `recovered: false` (PA2 s2), so server restarts are unproven starts. Overflow: `bufferSize` →
  `Feed.Overflow` fails the stream; the wrapping `Feed.reconnect` makes a new client (unproven, correct).
- (d) `from` is unusable: Socket.IO exposes no public offset (PA2 s2). `catchUp` applies only if the app has its own
  history endpoint, entered via `Feed.live()` as in 4.1.
- (e) `Connecting` with `drop.reason`, `Live`.
- (f) Recipe 2 must be written. Repeated wiring: disconnect-reason classification (`io server disconnect` and
  `io client disconnect` never auto-reconnect), `connect_error` auth classification, one shared socket vs one per
  session (shared is normal; M5). Adapter needs the Manager's `reconnect_failed` hook, which is on `socket.io`, not the
  socket (PA2 s2).

### 6. graphql-ws

```ts
// as 4.7, with the two missing pieces. user-defined: client built with retryAttempts: 0, keepAlive: 10_000, connectionAckWaitTimeout: 5_000
Feed.reconnect((from) => Stream.fromAsyncIterable(client.iterate({ query, variables: { boardId, after: from } }), classify).pipe(  // user-defined: classify
  Stream.map((r) => r.data!.boardEvents)), { from: after, position: (e) => e.cursor, while: (e) => e._tag === "GqlDropped", schedule })
// classify: CloseEvent 4401/4403 → GqlRejected (terminal); GraphQLError[] (the `error` message) → GqlRejected; other CloseEvent → GqlDropped
```

- (a) `Feed.reconnect` over a plain Stream (`Stream.fromAsyncIterable` is real and exists; its non-awaited `return()` sends
  `complete` best-effort).
- (b) No per-subscription ack in the protocol, only `connection_ack` (PA2 s3). So no honest claim exists on the wire;
  4.7 chooses "first `next` is the registration" (implicit live, `missed Unproven` before it, FC66). Claiming
  `Feed.live()` on the socket's `connected` hook would be dishonest (the subscription is not yet registered; events
  between ack and registration are lost). The server-side `Subscribed` first `next` is the only honest proof and
  needs a schema change; fine for own servers, unavailable for Hasura/Apollo-hosted ones.
- (c) Drop: the `iterate` rejects with a `CloseEvent` (retryable) or an `error` message (terminal subscription error, not
  a drop). 4.7's sample maps every error to `GqlDropped`, so a 4401/4403 or a validation error is retried until budget
  exhaustion (L1). Quiet reconnect: no signal, stays `Connecting` (L4). Reset: none in protocol. Overflow: pulled
  iterator, native back-pressure.
- (d) `from` is a query variable; the protocol has no resume so the server schema must offer one. `catchUp` applies.
- (e) `Connecting` until the first `next`, which is wrong-looking for a quiet board.
- (f) Needs: classifier (L1), `keepAlive` + a pong watcher outside the item stream (M4; PA2: `keepAlive` default 0,
  `connectionAckWaitTimeout` default 0 so a hung handshake never errors), and the first-start `missed` (H1). Lazy client
  multiplexes all sessions onto one socket, so a socket loss drops N sessions at once, each burning its own budget.

### 7. Supabase Realtime / Phoenix Channels

```ts
// 4.6 as written, plus two hardening lines. user-defined: Supabase, ChannelDown
yield* Effect.addFinalizer(() => Effect.promise(() => sb.removeChannel(ch)).pipe(Effect.timeout("3 seconds"), Effect.ignore))   // M6
// state feed variant: presence. Effect: Feed.callback; Supabase: channel.on("presence", { event: "sync" })
ch.on("presence", { event: "sync" }, () => emit(ch.presenceState())).subscribe((st) => st === "SUBSCRIBED" && emit(Feed.live()))
```

- (a) `Feed.callback` inside `Feed.reconnect`. The one app-wide socket belongs to the SDK (X1), but a *channel* is per
  session, and rejoin can be owned by `Feed.reconnect` as 4.6 does (remove channel on error, re-create).
- (b) `SUBSCRIBED` = join `ok` = the server registered the subscription. Phoenix has no continuity flag (PA1 s3), so
  `Feed.live()` is the only honest claim, plus `missed Unproven` on every connect including the first (H1). For
  `postgres_changes` that is the correct answer: no replay exists, `listen` refetches. For presence the state is
  re-sent in full after join, so it is a state feed and unproven is free.
- (c) `CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED` → `emit.fail(ChannelDown)` → `Feed.down` → rejoin by schedule. Quiet reconnect:
  `SUBSCRIBED` alone, unproven → covered answers lowered (the whole point of `listen`). Reset: none documented. Overflow:
  `bufferSize` 2,048 → drop → refetch.
- (d) Neither. No replay, so `catchUp` is a history read the app must own (a REST call), if it wants repair.
- (e) `Connecting`/`Live`; sign-out `Ended`. Presence row dimmed with `last` while down.
- (f) M6 (release timing), M5 (sending messages or `track` through the same client), and the outbound-presence gap: every
  presence UI also *publishes* its own status ("typing", "away"), which has no route into a running session
  (inputs are read once; 4.8 is out of scope). I would call this common, not rare. Phoenix channels share one `Socket`
  (X1), so closing it per session is wrong.

### 8. Ably

```ts
// SDK-owned reconnect (recipe 2). user-defined: ably (one Realtime client service), AblyDown, toMsg
Feed.reconnect(() => Feed.callback((emit) => Effect.gen(function* () {
  const ch = ably.channels.get(name)
  ably.connection.on(["disconnected", "suspended"], (c) => emit(Feed.down({ state: c.current })))
  ch.on("attached", (c) => emit(c.resumed ? Feed.live({ proof: "ably resumed" }) : Feed.live()))
  ch.on("update", (c) => { if (!c.resumed) emit(Feed.live()) })           // continuity lost while attached
  ch.on("failed", (c) => emit.fail(new AblyDown({ reason: c.reason?.message })))
  yield* Effect.promise(() => ch.subscribe((m) => emit(toMsg(m))))
  yield* Effect.addFinalizer(() => Effect.promise(() => ch.detach()))
}), { bufferSize: 2_048 }), { position: (m) => m.serial, catchUp, while: (e) => e._tag === "AblyDown", schedule })   // serial field: PA1 says "last message serial", name unconfirmed
```

- (a) `Feed.callback` (+ optional `Feed.reconnect` for the repair and the terminal case).
- (b) Channel `attached` + `resumed: true` is documented as no messages lost; replay follows. Honest as a proof only
  while the SDK instance and channel stay attached (H3). Not available: **connection-level** continuity flag
  **[unconfirmed, PA1 s1]**. Consequence I can't resolve from the docs: a transparent resume produces `connected`
  with the channel staying `attached`, so no `attached` event may fire at all; then there is no event to hang
  `Feed.live({ proof })` on after a drop, and the row stays `Connecting` after a quiet reconnect, or the adapter must
  claim at `connected` before it can know. Needs a doc read of whether channels emit anything on a clean resume.
  The first attach is always `resumed: false` (H1).
- (c) Drop: connection `disconnected` (retries every 15 s up to 2 min) then `suspended` (every 30 s): fixed, not
  exponential (PA1 s1), so Flow's budget does not apply and Ably's SDK is the clock. Loss: `attached`/`update` with
  `resumed:false`. Overflow: bounded queue, then unproven restart.
- (d) `from`: `recoveryKey` across a reload is the SDK's, not a Flow field. A catch-up is `history` with `untilAttach`,
  which PA1 says is backwards-only (newest first); `catchUp` must emit oldest first, so the step buffers to the
  position `last`, reverses, and returns one page, which defeats paging (M3). Retention (2 min / 24–72 h) makes
  completeness unknowable (H2).
- (e) Mirrors the connection: `Connecting` with `drop.state`, `Live`. Presence: members must re-enter after recovery
  (PA1 s1): outbound state again.
- (f) Needs H2, H3 and the connection-flag read before this is honest. Publishing: Ably queues publishes while
  disconnected (M5). Works as a plain stream of "latest" with `Feed.live()` only, but that discards Ably's main value.

### 9. ElectricSQL

```ts
// state feed over the Shape (materialised rows). user-defined: ShapeStream, Shape from @electric-sql/client, ElectricDown, toRows
Feed.reconnect(() => Feed.callback((emit) => Effect.gen(function* () {
  const ctl = new AbortController()
  const stream = new ShapeStream({ url, params: { table: "tickets", where }, signal: ctl.signal })
  const shape = new Shape(stream)
  stream.subscribe((msgs) => { if (msgs.some((m) => m.headers?.control === "up-to-date")) emit(Feed.live({ proof: "up-to-date" })) }, (e) => emit.fail(new ElectricDown({ e })))
  shape.subscribe(({ rows }) => emit(rows))                      // only after the first up-to-date, so never a partial sync
  yield* Effect.addFinalizer(() => Effect.sync(() => ctl.abort()))
}), { bufferSize: 8 }), { while: (e) => e._tag === "ElectricDown", schedule })
```

- (a) `Feed.callback` for the client's own subscribe API. State feed (`delivers: "state"`) of the whole row set, not a fact
  feed per change.
- (b) `up-to-date` = "the client has all the data the server was aware of when fulfilling the request" (PA1 s2). As a
  state proof it re-confirms the session's own `last` after a drop: honest, and the single best fit in the proposal for
  the state-proof rule (Q17). It repeats every live timeout (~20 s) as a harmless repeat proof in `Live` (3.1) and doubles
  as the only heartbeat (M4). Before the first `up-to-date` nothing is emitted as a value, so no partial initial sync
  is shown as current.
- (c) The client reconnects, handles 409 and `must-refetch` itself and re-syncs (PA1 s2, s4). Flow sees only a new
  materialised row set: a reset is invisible and correct for state (the new full set replaces `last`). No separate
  `missed`/`lost`. Drop: the client exposes no connection state (PA1 s2); detect offline by a deadline on `up-to-date`
  (adapter timer, M4). Without it the row stays `Live` while offline and shows stale data as current, which breaks
  R-Live in practice. Overflow: `bufferSize` irrelevant for state (latest wins), but a hand-written fact feed over its
  messages overflows on bulk sync (M2).
- (d) Resume is the client's own `offset` + `handle`, persisted by the SDK if configured; exposing it to Flow as `input`
  works only for a fact feed. Not needed for state.
- (e) `Connecting`, `value` after first `up-to-date`, dimmed `last` when the deadline fires.
- (f) As a fact feed feeding `listen` it breaks on `must-refetch` (M8) and on bulk sync (M2); `listen` also lacks an
  "authoritative snapshot replaces covered set" operation. Note the owner's memory file: entity domains are client
  coherence, not a sync engine; Electric is a sync engine, so the state-feed shape (rows in the view) is the intended
  fit. Unconfirmed: message `offset` field names, whether `up-to-date` fires on SSE keep-alive.

### 10. Firestore `onSnapshot`

```ts
// state feed; 4.7 as written is right. Corrections:
//   permission-denied is terminal. A `Feed.down(new ServedFromCache())` before the first server snapshot is fine.
//   Wrap collection queries as state of the whole QuerySnapshot (docs array), not docChanges() facts.
```

- (a) `Feed.callback` inside `Feed.reconnect` (the listener error is terminal for the SDK, so a fresh `onSnapshot` is
  the retry; PA2 s1). X1 recipe 2: the SDK owns the network.
- (b) A server snapshot (`fromCache: false`) is both the registration and a current value, so `Feed.live()` then the
  value is honest; an equal-data snapshot confirms (state rule). `fromCache` itself is **[unconfirmed in PA2]** but a
  documented `SnapshotMetadata` field; it only signals "from cache or not", not offline vs online precisely, so
  `Feed.down(ServedFromCache)` fits.
- (c) Offline: with `includeMetadataChanges: true` a metadata-only snapshot with `fromCache: true` fires → `Feed.down`;
  later values are `last`-only (3.1). Quiet reconnect: a server snapshot of equal data confirms. Reset: n/a (state).
  Overflow: state coalesces; no concern.
- (d) None needed.
- (e) `Connecting` + `drop` (`ServedFromCache`) with `last` dimmed and aged; then `Live` + `value`.
- (f) A local write fires the listener immediately with `hasPendingWrites` (PA2 s1) and, online, `fromCache: false`. The
  row would call an optimistic local echo "current". That is probably what the app wants, but it is the one place
  `value` is not server-confirmed; say so in 4.7. Cache-first initial snapshot makes the row start `Connecting` with
  dimmed `last`, which is the nicest rendering of any family.

---

## Summary

**Work cleanly (adapter is idiomatic, claim honest):** raw WebSocket (once H1 is fixed), fetch LLM tokens and XHR upload
(writes, not feeds; no claims), Firestore doc (state feed), Electric as a materialised state feed.

**Need a written recipe, no design change:** SSE (dense ids only; fetch-based for auth/headers), graphql-ws (classifier,
keepAlive, first-`next` registration), Supabase/Phoenix (`removeChannel` race, outbound presence, shared socket),
Socket.IO and Ably (the SDK-owned-reconnect recipe; X1/H3), LLM facts that drive the machine (finite stream).

**Break a rule as written:**
1. H1: first start of a fact feed with no resume position is reported as lost data (every family but 4.1).
2. H2: `catchUp` cannot report an unrepairable gap (Ably, Electric as facts, any bounded history).
3. H3: the Q3 recipe discards the continuity flags the proposal cites as `Feed.live`'s proof (Ably, Socket.IO), and 2.3's
   "names this `from`" test excludes them.
4. M1: `Overflow` is missing from the `failure` record.

**Concrete fixes, in order of effect:**
1. In `Feed.reconnect`, a session's first connection with `from === undefined` becomes a proven start with a fixed basis;
   in 3.1 the (`Opening`, unproven) cell owes `missed` only if a position was supplied; `listen` keeps its first-connection
   lowering. No new word.
2. `Feed.CannotRepair(reason)` as the one error a `catchUp` step can fail with to mean "history does not reach back";
   `Feed.reconnect` converts it to `lost` for that connection without a drop. One class, no new option.
3. Document two SDK recipes (X1): per-session transport → `Feed.reconnect` owns the budget; app-wide transport → `Feed.callback`
   emits SDK status as `down`/`live`, `Feed.reconnect` wraps only for repair and terminal failure. Reword the proof test in 2.3.
4. Add `Overflow` to the `failure` list in 2.7; decide `emit` back-pressure (M2) and the single `catchUp` cursor type (M3)
   before either is frozen.
5. For open-items 15, absorb the repeated adapter wiring: close-code classification, registration and idle deadlines
   (`emit.alive()`, `idle`), and a 3 s finalizer bound. Each is optional; the cost is two or three small words, so the
   owner should weigh them against a documented recipe.

**Unconfirmed facts that gate parts of this review:** Ably connection-level continuity flag and whether a clean resume
emits any channel event (PA1 s1); Socket.IO backoff reset (PA2 s2); Supabase `removeChannel` latency; Electric client
message offsets and `up-to-date` cadence (PA1 s2); Firestore `fromCache` (PA2 s1); provider-side generation resume
(`starting_after`, from memory only).
