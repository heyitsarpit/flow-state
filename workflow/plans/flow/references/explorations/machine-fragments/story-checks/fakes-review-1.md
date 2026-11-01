# Fakes proposal: review 1

**Status: advice to the main session. Nothing here is decided.** Reviews [fakes.md](fakes.md) against `machine-design.md`
2.10.2, 2.10.4, 2.10.9, 2.10.17, rules 61-66, the desk and Checkout fakes, and installed Effect 4.0.5.

## Verdict

The direction is right: object results, a stream read and a route table are all worth having. The spellings are not ready.

- Five High problems: one is a real engine fact that also breaks merged `Fake.fetch`, and four are holes in the wire rules.
- `send` and `close` have no target, so the Chat example in the proposal leaks across rooms.
- There is no clean end of stream, so the Assistant fake's body never finishes.
- Reuse from Effect: `FindMyWay`, `Queue` with `Stream.fromQueue`, the `HttpClientError`-style error classes, and `Schema` codecs. Do not use `HttpRouter`.

## What I ran, and what I did not

All scripts are in `/private/tmp/claude-501/-Users-arpit--claude-spares-spare-Sy75Xy/b97bafc6-720f-455d-b91c-5aa81d337285/scratchpad/fx/`.

**Method.** Each probe starts `setTimeout(0)`, `MessageChannel` and (where it exists) `setImmediate` canaries, then awaits the operation. "Microtask-only" means no canary fired first. The canary is valid: `crypto.subtle.digest` and a yielding handler on the default scheduler both trip it on all engines that ran them.

| Probe | Bun 1.4.2 | Node 24.21 | Chromium 152 |
| --- | --- | --- | --- |
| `Request(string).text()` / `.json()` | microtask | microtask | **host task** |
| `Request(FormData).formData()` | microtask | **host task** | **host task** |
| `Response(string).text()` / `.json()` / `.arrayBuffer()` | microtask | microtask | **host task** |
| `Blob.arrayBuffer()` | microtask | microtask | **host task** |
| `ReadableStream` reader, `Response(stream).body` reader | microtask | microtask | microtask |
| `Response(stream).text()` | microtask | microtask | **host task** |
| Effect `HttpClient` `.json` over a fake `Fetch`, plain `Response` (e7) | microtask | not run | **host task** |
| The same, a `Response` subclass overriding body reads (e7) | microtask | not run | microtask |
| Effect `HttpClient` streamed body read (e7) | microtask | microtask (e4) | microtask |
| `HttpRouter.toWebHandler`, POST reading its body, sync scheduler in context (e7) | microtask | not run | **host task** |
| `HttpRouter.toWebHandler`, GET with no body (e7) | microtask | microtask | microtask |
| `toWebHandler`, a handler that yields, default scheduler (e2b) | **host task** | **host task** | not run |
| The same, `MixedScheduler("sync")` passed as request context (e2b) | microtask | microtask | not run |
| `new Response("null", { status: 204 })` | allowed | **throws** | **throws** |

Other results:

- **e4 (Bun, Node), sync scheduler.** `Stream.fromQueue` with `Queue.end` and `Queue.fail` is microtask-only, as is a reader parked behind a `Latch`.
- **e4, socket.** `Socket.makeWebSocket` over a fake `WebSocketLike` is microtask-only, including connecting then open. Closes 1000, 1006 and 4401 all arrive as `SocketCloseError` with that code.
- **e4, what `Fetch` receives.** `fetch` gets `(URL, init)`, never a `Request`. `init.body` is a plain string, and `init.headers` holds random `b3` and `traceparent` values.
- **e5 (Bun and Node; not run in Chromium).** The real `route` shape reorders requests: POST invoked first, GET second, arrival order GET then POST.
- **e2 (`FindMyWay` alone).** It handles every URL shape below and decodes params. `"/parts::release"` matches `/parts:release`. A single colon in `"/parts:release"` silently parses as a param named `release` and also matches `/partsZ`.
- **Type spikes.** `t/spikeA.ts`: `(truth, req)` written inside a standalone `Fake.call` in a `Fake.server` literal inferred `truth` as `unknown` in my mock. `t/spikeB.ts`: the recommended spelling compiles, and its two `@ts-expect-error` lines both fire. These are mocks of the signatures, not proof about every possible signature.

**Not run.**

- Firefox and Safari.
- Any Flow code: the rewrite has no `Fake` yet, so nothing ran through a real settle, gate or TestClock.
- The executable lane model.
- `HttpApi`: I only read about it.
- Node `process.nextTick` is not a host task, and whether a settle's "queue empty" check sees it is untested.

## Effect fit

| Module | What it gives | Under rule 61 | Advice |
| --- | --- | --- | --- |
| `http/FindMyWay.ts:90` (`make`, `on`, `find`) | a synchronous route tree with decoded `params` and parsed `searchParams` | synchronous, proven | **Reuse** for the route table, and follow its path syntax. Note the `::` escape |
| `HttpRouter.toWebHandler`, `HttpEffect.toWebHandlerWith` (`HttpEffect.ts:336`) | a whole `Request` to `Response` server | host task on any body read in Chromium; needs the scheduler passed in; forks a new root fiber | **Ignore.** Besides the host task: an abort interrupts the handler (`HttpEffect.ts`, `onAbort`), but 2.10.17.2 says the handler "continues, `gone`"; an unknown route is a silent 404; the gate and `via` have no place in it |
| `HttpServerRequest` `.json`, `.multipart` (`:577`, `:631`) | body parsing | calls `source.text()`: host task in Chromium | **Ignore** |
| `HttpServerResponse.omitsBody` (`:1346`) | 204, 205 and 304 carry no body | pure | **Follow** the rule; it answers M3 |
| `HttpApi` (`http-api/HttpApiEndpoint.ts`) | schema-typed routes | not run | **Ignore for now.** Prior art for later: an app with an `HttpApi` could derive its route table. W17 keeps `Fake` narrow |
| `FetchHttpClient.Fetch` (`:32`), `HttpClient` | the seam `Fake.fetch` already provides | seam is fine; the body read is H1 | **Keep.** Read `init.body` directly and never build a `Request` from it |
| `Socket.WebSocketConstructor` (`:864`), `fromWebSocket` (`:948`) | the socket seam | proven microtask-only over strings | **Keep.** `openTimeout` is 10 s on the Clock, so `hold({ at: "open" })` correctly becomes a deadline. A `Blob` frame goes through `arrayBuffer()`, so a fake sends strings or `ArrayBuffer` only |
| `Queue` plus `Stream.fromQueue` (`Stream.ts:1185`, `Queue.ts:1073, 1323`) | a connection's frames, `Queue.fail` for close, `Queue.end` for clean end | proven | **Reuse** for `server.socket(input)`. Each run of the Stream is one connection, closed by its scope, so a retry naturally reconnects |
| `PubSub` | fan-out to subscribers | not run | **Ignore.** Each connection has its own gate, order and `nth`; fan-out is a loop |
| `Latch`, `Deferred` | gates | `Latch` proven | **Reuse as parts**: `Deferred` per held item, since `nth` needs per-item release |
| `Ref`, `SynchronizedRef` | atomic truth | not run | **Use** for one atomic commit of truth and frames, with pure handlers (M6) |
| `TestClock` wake tracker (`testing/TestClock.ts:397-443`) | counts woken tasks | the design's existing basis | No change |
| `Schema.fromJsonString`, `Schema.Codec` | typed wire frames | synchronous | **Reuse** for `frame` (M2). The desk already decodes this way |
| `encoding/Sse.ts:449`, `encoding/Ndjson.ts:80` | wire encoders | channels; not run | **Follow** in docs for SSE and NDJSON frames. Flow adds nothing |
| Errors: `HttpClientError` (`:102`), `SocketCloseError` (`Socket.ts:457`) | PascalCase tags, importable classes | n/a | **Follow** (M4). No Effect 4 error tag I found has a slash. `Fake/Lost` is the odd one out |
| `Schema.instanceOf` | a `File` or `Blob` field | synchronous | **Ignore in `request`.** Logs hold inputs and digests; map a file to `{ name, size }`, as `putFile` does |

## High

### H1. Every `Fake.fetch` body read is a host task in Chromium, so the Story fails with `HostTimeWait`

This is a problem in merged 2.10.4, not only in this proposal. The route table inherits it.

**Failing scenario.** Checkout's `app/demo.tsx:38` runs `m.counterexample.run()` in the browser. `StripeFake` uses `Fake.fetch`, and the real adapter calls `response.json()` (`adapters/shop-api.ts:132`).

1. In Chromium that promise needs a host task (e7).
2. Rule 61 says "a fiber waiting on the host is always `HostTimeWait`".
3. So the same Story passes on Bun and fails in the browser. `await request.json()` in all five `route` functions fails the same way.

`formData()` is worse: it also differs between Bun and Node. Results must not depend on the engine ("Direct and CLI runs agree", 2.10.1).

**Fix: Flow never asks the engine to read a body it already holds.**

- *Request side:* `FetchHttpClient` passes `(URL, init)`, so `init.body` is at hand. A string, `Uint8Array`, `URLSearchParams` or `FormData` reads synchronously. A `ReadableStream` is read with a reader. A `Blob` or `File` exposes `name`, `size` and `type`, and its bytes stay unread.
- *Response side:* `Fake.fetch` returns a `Response` subclass overriding `text`, `json` and `arrayBuffer` with resolved promises; proven in Chromium. A streamed body stays a real `ReadableStream`; proven.

**Hack flag.** The subclass is a deliberate shim. It must keep `bodyUsed` honest and reject a second read, or it hides a real adapter bug. An adapter that calls `fetch(new Request(…))` with a body still hits `HostTimeWait` in a browser. That failure is honest, and the docs should say so.

**Say in 2.10.4:** the function form's `Request` gets the same overrides, so `await request.json()` stays legal.

### H2. `send` and `close` reach every connection: the Chat example leaks across rooms

`send: { socket: [frame] }` names an endpoint only. The proposal's own Chat has `request: { room }`, and a post to `r1` reaches `r2`.

Real fakes already target:

- `desk.socket.fake.ts:28`: `to: { socket: { workspaceId } }`
- `presence.fake.ts:70`: `to: on(channel)`

The proposal drops the word that makes them correct.

**Fix.** Target by the connection's own request. That is all a server can see, since `via` is never seen by it (2.10.4). A predicate covers "the sender's connection excepted" (a `clientId` in the request), which a partial match cannot. See the recommended spelling.

### H3. No clean end of a stream

The read is described as "failing with `Fake/Lost` or `Fake/Closed { code }`", and nothing ends. `open` returns frames, and table 2.10.17.3 stays `Open`.

**Failing scenario.** `assistant.fake.ts` is a `fetch` body. It must end after `done`, and its `truncate` control exists for a body that "ends early and cleanly" (FC80). As specified, the write's stream never finishes: `assistant/answered` stays mid-stream with no error, and settling cannot notice, because it "never waits for an open stream". Same for any SSE that the server finishes and any NDJSON body.

There is a matching overload in that file. `accept: false, code: status` puts an HTTP status in the same `code` as a socket close, and `error.code >= 500` then reads `Closed { 4401 }` or a crash's `1011` as a `ServerError`.

**Fix.**

- `end` is a delivery item. A client half's Stream ends, `Fake.fetch`'s body finishes, and `Fake.webSocket` closes with 1000. Effect's socket reports 1000 as `SocketCloseError` (e4), so the real adapter behaves as in production.
- Refusal becomes its own failure, matching the log's existing phases `refused { code }` and `closed { code }`: `FakeRefused { code }` and `FakeClosed { code }`.
- Under `Fake.fetch`, a refusal's `code` is the status.

### H4. An async route breaks "requests reach the endpoint in invocation order"

2.10.2 and 2.10.17.2 promise invocation order. A route's `await request.json()` takes more microtasks than a GET that skips the body. e5 shows POST invoked first and arriving second.

**Failing scenario.** A Story saves (POST), then reads (GET) in one turn. The log and the handler see them reversed, so the GET returns pre-save truth. The Story passes and the production order was never tested. A later change that adds one `await` to a route flips it again.

**Fix.** The binding takes the arrival number and `via` synchronously at the `fetch` call, and delivers to the gate in that number's order, even if a route is async. With H1's synchronous `body`, the table form never waits. Apply the same rule to the plain function form.

### H5. Frames, an answer and a `close` have no defined order

2.10.17 says it is "complete enough to rebuild the executable model", but `send` has no row. These cases need an answer:

| Case | Proposed rule |
| --- | --- |
| A handler's frames against its answer | Commit truth; deliver frames, **settling after them**; then the answer goes to its gate. Without the settle, the order at the mailbox depends on how long the adapter's pipeline is, so one more `Stream.mapEffect` could flip it. This matches 2.10.3's "settling after each". Frames-first is also the harder race (an echo while the write is pending). The reverse order is one `Chat.socket.hold()` away |
| Under `hold()` on the request | The handler has not run, so nothing is sent |
| Under `hold({ at: "response" })` | Frames are delivered now; the answer waits |
| Under `drop({ at: "response" })`, or `release({ drop: true })` | Truth and frames stand; only the answer is lost. Realistic: the push says paid while the client sees `NoResponse` |
| `orphan` (`gone` client) | Frames still go, so a reopened tab hears them. This is what makes "charged once across a reload" visible on a socket |
| `duplicate` | The copy's answer is discarded and its frames are not. The fake's dedupe must omit them, as a real server does |
| The handler dies | No truth, no frames: atomic |
| Frames to `Opening`, `None` or `Closed` | Nothing, as the table says. `open` replays from truth |

**Also wrong in the merged table: a close under `hold`.** 2.10.17.3 says that in `Silent`, a server close goes to `Closed { code }` at once and "queued frames lost". But `hold` means "frames stop reaching the client (silence, half-open)".

**Failing scenario.** `Desk.socket.hold()`, then `expireToken`. The client learns of 4401 instantly, so the adapter's 45 second idle deadline (`desk.socket.fake.ts:111`) is never exercised, and the half-open case the word exists for is lost.

**Fix.** A server close or `end` is the last queued item: delivered at `release`, lost under `release({ drop: true })` (which becomes close 1006). A network `drop()` stays immediate, since it is the network and not the server.

## Medium

### M1. Effects exist only on some handlers

The proposal shows `send` on a call and `close` on a control. Real cases need every combination:

- *Close from a call:* `POST /logout` closes that user's sockets.
- *Close or send from `open`:* a second login kicks the first; a joining member is announced to the others.
- *Send from `message`:* chat, which 2.10.9 declares and the proposal does not reshape.
- *Send from a control:* all six `presence.fake.ts` controls.

**Fix.** One result shape everywhere (see the recommended spelling).

**Bare controls.** The proposal changes `Fake.control`'s result to an object, but most of the 33 controls in these fakes return bare truth. If both stay legal, a truth with a field named `truth` or `close` is ambiguous. W14 settled `handle` only, so this needs a question. I recommend one shape, with `truth` optional when unchanged, which removes about 20 `truth,` lines from read endpoints. A forgotten `truth` is merely "no change".

### M2. Frames should be Schema-typed

Frames are opaque strings today, and the desk and presence fakes each wrote a `text()` helper. Typed frames cost one declaration and give:

- a wrong frame is a type error (`spikeB.ts`);
- a client half still receives bytes, so the real `decodeFrame` runs;
- digests and redaction work per C80.

`request` is already a Schema, so this is the same upfront contract. `frame` should be required, with `Schema.String` for raw. To reach 2.10.5's malformed body and `Defect`, the endpoint declares a union such as `Schema.Union([Schema.fromJsonString(F), Schema.String])`. I did not test how that union encodes.

**Frames need a record too.** Rule 64 says every cumulative fact is one record, but `request` and `control` do not cover a frame.

**Failing scenario.** "The flood sent 100 frames, the hold kept 40, one was lost at the close." The Story can see the client's result and the held count at a cut, nothing else, and Playback and `flow explain` cannot caption it.

**Fix.** A `frame` record `{ endpoint, connection: n, phase: "delivered" | "held" | "lost", digest }`, redacted like `input`, as a fifteenth kind. Say so in the Inspection O4 list.

### M3. The response under `Fake.fetch` is unspecified

The proposal writes `{ ok: true, status: 201 }`, 2.10.4 writes `{ ok, status, retryAfterMs }`, and the desk writes `{ status, body }`. A binding must make a `Response` from one of them.

**Failing scenarios.**

- `desk.visit.fake.ts:40` answers `{ status: 204, body: null }`. A naive `new Response("null", { status: 204 })` throws on Node and Chromium and works on Bun.
- There is no place for a header. The adapter of any real API reads `ETag`, `Retry-After`, `Location` or `Content-Type: text/event-stream`. The desk works around it by moving the etag into the body.

**Fix.** For a call bound by `Fake.fetch`, `response` is `{ status, body?, headers? }`. An object body becomes JSON, and a string stays as is. 204, 205 and 304 carry no body (Effect's `omitsBody`). Client-half fakes may keep any shape, since Flow reads nothing there.

### M4. Error names

`Fake/Lost` is a string you cannot import and is unlike every Effect tag. It has few uses: 3 in the desk, 1 in Checkout, and a few in the design.

**Fix.** Importable classes, `Fake.Lost`, `Fake.Refused { code }`, `Fake.Closed { code, reason? }`, with tags `FakeLost`, `FakeRefused`, `FakeClosed`. Effect's own socket wraps with `SocketError { reason }`. Here a wrapper adds nothing, since each client half maps each one directly.

**Also say which is which.** Table 2.10.17.3 says `drop()` gives `Closed { 1006 }`, while 2.10.4 says the wire's loss is `Fake/Lost`. Proposed: a network loss is `FakeLost` on a client half and close 1006 under `Fake.webSocket`. A crashed `open` is `FakeClosed { 1011 }`. A server close is `FakeClosed { code }`.

### M5. The route table does not fit the desk yet

Checked against all five routes and the socket route.

| Problem | Where | Fix |
| --- | --- | --- |
| `input` gets `{ params, headers, body }` and no query | `page`, `team`, `after`, `q`, `status`, the socket's `epoch` and `seq` | Add `query` (from `FindMyWay`'s `searchParams`) |
| One path, many endpoints, chosen by body | roster `"to" in body`, GraphQL's `operationName` | Let `endpoint` be a function of the same context, as well as a name |
| A `:` in a path | `parts:release`, `customers:merge`, `invites:batch`, `roster:reindex` | Spell `::` in docs and examples. A single colon silently makes a param (e2). Reject a key whose single-colon param is not preceded by `/`, so the mistake is loud |
| Default `input` is unsaid, and W16's short form `"POST /confirm": "confirm"` differs from the proposal's `{ endpoint }` | | Keep both. With no `input`, it is `{ ...params, ...query, ...body }`, checked by `request` |
| A body read is unsaid | desk's `PUT` skips it, `formData` engine-dependent | `body`: parsed JSON if `application/json`, the `FormData` or `URLSearchParams` as given, a string or a `Blob` otherwise. A `Blob`'s bytes are never read |
| No route, or invalid `input` | the current `undefined` return has no stated behaviour | An `issue` naming the fake, and 404 or 400. Silent 404 would be read by an adapter as `TicketNotFound`, and a URL typo would look like a passing not-found Story |
| `Fake.webSocket` | shown only for `Fake.fetch` | Same table. `desk.socket.fake.ts:147` fits it |
| A stream endpoint under `Fake.fetch` (SSE, NDJSON) | open item 33 | State it: open maps to a 200 streamed body, `refuse` to a status, `end` to body done, a close to a body error. Add `headers` on the stream declaration for `text/event-stream` |

**What the log records.** Only `input`, as mapped, with `via`; never the `Request`. That is right, and it should be written down, because:

- `init.headers` carries random `b3` and `traceparent` values (e4), so logging headers would break determinism.
- An `Authorization` copied into `input` becomes a digest when it leaves the process (C80). That is the same rule as any input.

**Body consumption.** Under the table, Flow reads the body once and hands it over. In the function form the author reads it, once, through H1's overrides. A `held` request has a logged `input` although "unseen by the server": the log is Flow's, not the server's, so that stays consistent.

### M6. A handler's Effect form has a lost update, and `send` makes it worse

2.10.4 allows "an Effect of it for latency". The handler receives `truth`, sleeps, then returns `{ truth }`.

**Failing scenario.** During the 2 second sleep, a control changes truth. The answer overwrites it, and the frames describe the stale state. 2.10.4's other answer, "atomic updates through the server's truth `Ref`", gives two ways to write truth in one handler.

No handler or `open` in the desk or Checkout returns an Effect. Only design example 2.10.18.1 uses latency (line 4548).

**Fix.** Make handlers pure and add `latency` as data: `Fake.call({ latency: "2 seconds", handle })`. The `Server` state sleeps, then the pure handler runs and commits atomically. A pure handler that throws is the crashed server. This also lets a property test read latency, and it deletes a sentence.

### M7. `hold({ after })` is underspecified

Worth keeping: five `assistant.story.ts` Stories need it, it is a true transport fact (a stalled body), and the alternative is about ten lines per fake plus per-connection progress in truth. Needs these rules:

| Question | Proposed rule |
| --- | --- |
| Counted over what | Per connection. From its first frame if the rule was set before open (the greeting counts); from the rule's setting if set on an open connection. `assistant/regenerated` needs per connection, since the second Attempt must also stream |
| `times` | Counts connections, at open, as a request takes its rule at arrival: `hold({ after: 2, times: 1 })` covers one |
| `release` | As `hold()`: flows, and ends the rule. On a connection still counting: stays `Open`, rule ended |
| Rule order | 2.10.17.3 has no such rule; 2.10.17.2's "one rule per request" does not say what a frame takes. Proposed: a connection takes its `open` rule at arrival, and takes a frames rule at open or when the rule is set. `hold` rules apply per connection; `duplicate`'s counts per frame. Any `drop()` closes regardless |
| A `duplicate`d frame | Counts as two deliveries |
| `after` with `at: "open"`, `at: "response"`, on a call, or on the server handle | Type error. `after: 0` is `hold()`; a negative is `InvalidDuration`-style `StoryInvalidCommand` |
| Close or `end` while counting | Passes in order, as a frame (H5) |

Table 2.10.17.3 needs a row or a sub-state, so its counts (12 rows, 60 cells) change.

Token-by-token (`release({ take: n })`) is a tempting generalization. No Story needs it. Put it in `revisit.md`.

### M8. `server.socket(input)` cannot write

The read is a Stream only. Failing cases: a chat client half or an SDK that sends typing frames or a `graphql-ws` subscribe. 2.10.17.3 has the `message` row, reachable only through `Fake.webSocket`.

**Fix (smallest).** Keep the Stream for the common read and document that duplex goes through `Fake.webSocket` with Effect's `Socket`. Add a duplex client half only when a case needs one that cannot use a socket.

### M9. `pushes` was dropped on a thin argument

The "shared helper" works, but its failures are silent.

**Failing scenario.** `desk.visit.fake.ts:38` does `const [next] = step(…)` and returns its own 204. With object results, an author who writes `{ truth: next.truth, response: 204 }` drops `next.send`. The socket never hears about it. The server still has the change, and only a Story that checks the socket would notice. The desk has about 25 `withDesk` sites and many `step` calls across five files.

Real servers work the way `pushes` does: an append to a log feeds subscribers. Gap 36's own note says "Declaring it once beats wiring each handler".

**My advice.** Keep it out for now, as approved, but keep the desk's conversion as the test. If the helper is not obviously fine across all 55 desk calls, reopen it. Check also that `pushes` would remove the import cycle between `desk.fake.ts` and `desk.socket.fake.ts`.

### M10. `match` cannot name one connection's request

`hold` on one channel, not another, is not reachable. `Collab.channel.hold({ match })` takes an address, but the SDK's own fiber has only `via.tab` (2.10.4). So "channel A went silent, B did not" fails for presence, which is exactly a real SDK case.

**Fix.** Add `input: { name: "ticket:north:T-42" }` as a kind field of `match`, as `purpose` is. It reads the logged request. This extends `match`, not the address itself (rule 65).

### M11. No server reaction to a disconnect

**Failing scenario.** Presence over two tabs: `closeTab("b")`. A real service removes the member and tells the others. Here truth keeps the member until the Story adds `Collab.leave`, and that step can be forgotten or generated wrongly by a property test.

**Fix.** Optional `closed: (truth, request, { code }) => result` on `Fake.stream`. Worth it only if presence needs it, so a question rather than an addition. Note 2.10.9 already rejects keeping a `connections` field by hand.

## Low

- **L1. `accept`.** `accept: true` carries nothing. Prefer `{ frames }` to accept and `{ refuse: 4403 }` to refuse, so a refusal cannot also carry frames.
- **L2. `close` reason.** Real close events carry one, and Effect's `SocketCloseError` has `closeReason`. Allow `socket.close(where, 4401, "expired")`.
- **L3. Typing.** `Fake.call` standalone inside a literal gave `truth: unknown` in my mock (`spikeA.ts`). The desk's split files already annotate. Run the type spike before fixing the spelling; `endpoints: (f) => …` (`spikeB.ts`) infers it. Note this changes how split files spread endpoints.
- **L4. `describe` and property tests.** These stay intact. A control is still its name and Schema args; `hold({ after })` is data; `send` and the route table live in fake code, as rule 63 allows. Nothing prints what a control will send; the `frame` record shows it after the run. No change needed.
- **L5. Host in the table.** Keys ignore the origin, so an adapter calling the wrong host passes. Accept it, and note it.
- **L6. Name clash.** 2.10.4's prose has `Chat.post` as a control and the proposal has `post` as an endpoint. On one handle, a control and an endpoint with one name must be a construction error.

## Real cases

| Case | With the proposal as written | After the fixes |
| --- | --- | --- |
| SSE with `Last-Event-ID` | Fails. No clean end (H3), no headers or stream binding (M3, M5). Reading the first frames works in Chromium | Works. `Sse` encodes in the `frame` codec. An `EventSource` itself still needs a client half |
| Chat socket | Fails. Rooms leak (H2), `message` has no effects (M1), the client half cannot write (M8) | Works through `Fake.webSocket` |
| Presence over an SDK | Partly. Channels leak (H2), one channel cannot go silent (M10), a disconnect does not reach truth (M11). The stream read itself works | Works |
| GraphQL over one URL | Queries: table fails (M5), plain function works, but its body read is H1 and H4 | Queries work with `endpoint` as a function |
| GraphQL subscriptions over one socket | Fails | **Still fails on targeting**: a subscription is made by a client frame after open, so it is not in the connection's request. Use a client half with one logical connection per subscription, as `CollabFake` does per channel. Say so in the docs. Do not add per-connection state |
| File upload | Function form skips the body. Multipart read is engine-dependent (H1) | Works: `FormData` is read synchronously, bytes never. Progress stays in the client half, as `AttachmentsOverDesk` does, since an XHR is not `fetch` |
| Idempotent payment | The route and key work. In a browser, H1 fails it. `send` under `duplicate` and `drop({ at: "response" })` is unspecified (H5). | Works; those orders are all reachable by data |

## Hacks and faked features

- **The `Response` subclass in H1** is a real shim: necessary, and it needs `bodyUsed` kept honest. No other option meets rule 61 in a browser.
- **The Assistant fake reads `Fake/Closed` with `code >= 500`** as an HTTP status. That is a faked distinction, and it misclassifies a socket code (H3).
- **The desk moves its etag into the body** (`desk.details.fake.ts`) because there are no response headers. So the real `If-Match` path via a header is not what the fake tests (M3).
- **`desk.visit.fake.ts:70` skips the body on `PUT`** to avoid reading an image. Reasonable, but it is why a table needs a stated body rule (M5).
- I found no feature here that is claimed and not really modelled, other than these.

## Recommended spelling

A complete example. Every word is marked. `send` becomes an ordered list of values made by the stream itself: order is explicit, a close is in order with frames, types come from the value, and no sibling-key lookup is needed. It works across files, as the desk's split needs. `spikeB.ts` checks the shape, using `endpoints: (f) => …`; the standalone form below assumes annotated `Truth`, as the desk's split files already do.

```ts
// chat.fake.ts
import { Effect, Layer, Schema, Stream } from "effect"                 // existing
import { Fake } from "flow-state/testing"                              // existing: Fake

const Message = Schema.Struct({ room: Schema.String, text: Schema.String, from: Schema.String })  // user-defined: Message
type Truth = { readonly messages: ReadonlyArray<typeof Message.Type> } // user-defined: Truth

const socket = Fake.stream({                                           // existing: Fake.stream   // user-defined: socket
  request: { room: Schema.String, clientId: Schema.String },           // existing: request
  frame: Schema.fromJsonString(Message),                               // NEW: frame (the wire form)
  open: (truth: Truth, req) => ({                                      // existing: open; shape changed
    frames: truth.messages.filter((m) => m.room === req.room),         // existing: frames; `truth` omitted, so unchanged
    // or: refuse: 4403                                                // NEW: refuse, replaces accept
  }),
})

export const Chat = Fake.server("Chat", {                              // existing: Fake.server   // user-defined: Chat
  truth: { messages: Schema.Array(Message) },                          // existing: truth
  initial: { messages: [] },                                           // existing: initial
  endpoints: {
    socket,
    post: Fake.call({                                                  // existing: Fake.call   // user-defined: post
      request: { room: Schema.String, text: Schema.String, from: Schema.String },
      handle: (truth: Truth, req) => ({
        truth: { messages: [...truth.messages, req] },                 // existing, W14
        response: { status: 201 },                                     // existing; status, body?, headers? under Fake.fetch
        send: [socket.frames((c) => c.room === req.room && c.clientId !== req.from, [req])],
        // NEW: send (a list), NEW: socket.frames(where, frames), where reads the connection's request
      }),
    }),
    logout: Fake.call({                                                // user-defined: logout
      request: { clientId: Schema.String },
      handle: (_truth: Truth, req) => ({
        response: { status: 204 },                                     // no body, as Effect's omitsBody
        send: [socket.close((c) => c.clientId === req.clientId, 4401)], // NEW: socket.close(where, code, reason?)
      }),
    }),
  },
  controls: {
    expireTokens: Fake.control({}, () => ({ send: [socket.close(() => true, 4401)] })), // existing: controls, Fake.control   // user-defined: expireTokens
    finish: Fake.control({ room: Schema.String }, (_t, a) => ({        // user-defined: finish
      send: [socket.end((c) => c.room === a.room)],                    // NEW: socket.end(where)
    })),
  },
})

// A client half: the Stream is lazy; each run is one connection, its scope closes it.
export const ChatFake = Layer.effect(ChatApi, Effect.map(Chat, (server) => ChatApi.of({ // user-defined: ChatApi, ChatFake
  messages: (room, clientId) => server.socket({ room, clientId }).pipe( // NEW: a Stream of wire frames (strings)
    Stream.catchTags({                                                  // existing
      FakeLost: () => Stream.fail(new Dropped()),                                    // RENAMED: Fake/Lost -> FakeLost   // user-defined: Dropped
      FakeRefused: (e) => Stream.fail(new Refused({ code: e.code })),                // NEW: FakeRefused   // user-defined: Refused
      FakeClosed: (e) => Stream.fail(new Closed({ code: e.code })),                  // RENAMED from the proposal's Fake/Closed   // user-defined: Closed
    }),
  ),
})))

// Routes, the same table for both bindings.
const routes = {                                                        // user-defined: routes
  "POST /api/rooms/:room/messages": {                                   // NEW: the key, FindMyWay's path syntax
    endpoint: "post",                                                   // NEW: endpoint, a name or a function of the context
    input: ({ params, body, query, headers }) =>                        // NEW: input; query is added; body is read synchronously
      ({ room: params.room, text: body.text, from: headers.get("X-Client") ?? "" }),
  },
  "POST /api/logout": "logout",                                         // W16's short form; input = { ...params, ...query, ...body }
  "POST /graphql": { endpoint: ({ body }) => body.operationName, input: ({ body }) => body.variables },
  "POST /api/rooms/:room/messages::purge": "purge",                     // `::` is one literal colon
}
Fake.fetch(Chat, routes)                                                // existing, Layer for FetchHttpClient.Fetch
Fake.webSocket(Chat, { "GET /api/rooms/:room/socket": { endpoint: "socket", input: ({ params, query }) => ({ room: params.room, clientId: query.client }) } }) // existing

// In a Story
Story.machine(Room, { id: "chat/mid-stream", world: [Chat.socket.hold({ after: 2 })] })  // existing: W1, world; NEW: after
```

**Added:** `frame`, `refuse`, `send` (list), `.frames`, `.close`, `.end`, `FakeRefused`, the stream read, the route table with `endpoint`, `input`, `query`, `body`, `headers`; `after`; the `frame` record; `latency` (M6) if accepted.

**Dropped:** `accept`, the tuple shapes, `[truth, frames, accept]`, `{ to, send }`, `Fake/Lost` and `Fake/Closed` as strings, the handler's Effect form (M6), the host-task body reads.

## Worth having?

| Addition | Keep? | Why |
| --- | --- | --- |
| `send`, `close` | Yes, as one list with a target | Every streaming fake needs it |
| Object results | Yes | W14; extend to `open`, `message`, controls |
| Stream read | Yes, read-only | `CollabFake` and `AssistantFake` need it; `Fake.webSocket` stays preferred (gap 33) |
| Route table | Yes | Replaces about 200 lines of `route` across five files, but only with `query` and `endpoint` as a function. H1 and H4 matter more than the table |
| `hold({ after })` | Yes, with M7's rules | Five Stories |
| `frame` Schema | Yes | Replaces helpers and gives digests |
| `closed` handler (M11) | Ask | Only presence so far |
| `release({ take })`, `HttpApi` derivation, duplex client half | Not now | No case yet. `revisit.md` |

## Check of v2

Checked `fakes-v2.md` only. **One High remains (V1).** It is small, and everything else is Medium or Low. The direction of v2 holds, and I found no contradiction with W1-W34 or C1-C5 that needs an owner decision; V11 lists the near misses.

**Run for this check** (scripts in `/private/tmp/claude-501/-Users-arpit--claude-spares-spare-Sy75Xy/b97bafc6-720f-455d-b91c-5aa81d337285/scratchpad/fx/`):

- `t/spikeV2.ts`, `t/spikeV2b.ts`: type spike of section 2's final spelling, in `tsc` strict, against mock signatures. It shows what those signatures can do, not what the real ones will do.
- `e8.ts` on Bun: what Effect's `HttpClient` puts in `init.body`, and a union `frame` codec.

**Not run:** any Flow code, and MSW (it is not installed at the repo root). `respond` is judged by reading rule 61 and the wire table.

### 1. Is each finding closed?

| Finding | State in v2 | Note |
| --- | --- | --- |
| H1 body reads | Closed, one wrong line | V4: the list of body kinds misses what Effect actually sends |
| H2 targets | Closed | `where` reads the connection's request |
| H3 clean end | **Weakened** | V1: `end` cannot be used from `open`, the case that raised it. The `Refused` and `Closed` split is closed |
| H4 arrival order | Closed | |
| H5 order and close under `hold` | Closed in the rules; table rows pending | V6: the held-close state needs a row |
| M1 one result shape | Closed | |
| M2 frame Schema and record | Closed, one part weakened | V10: the malformed-frame route was dropped |
| M3 response under `Fake.fetch` | Closed | Except a library's web `Response`: V2 |
| M4 error names | Closed | |
| M5 route table | Closed | |
| M6 lost update | **Weakened** | V3: v2 never says `handle` runs after `latency` |
| M7 `hold({ after })` | **Weakened** | V5: the rule-order lines were lost, and v2's own example needs them |
| M8 duplex | Closed | Documented, not added |
| M10 `match: { input }` | Closed | V9: its matching rule is unsaid |
| M9, M11 | Deferred, in `revisit.md` | As you intended |

### 2. `respond`

**It holds, with limits.**

- **Rule 61:** yes. Its fiber suspends on the Clock, a gate or a host wait, and the last is `HostTimeWait`. It must run on the run scheduler, and its sleeps need owner rank 1.
- **Wire table:** yes. It is the `Server` state, so `hold`, `drop` and `duplicate` all apply. It must keep running when the client cancels ("continues, `gone`"). v2's "the wire and the log still apply" covers this, but one line should say so.
- **`describe`:** yes. A handler is opaque either way. The only loss is that `latency` cannot be combined with it, so a delay there is an `Effect.sleep` and not data.
- **W12, rule 62:** yes. The answer still goes through the commit's classification.

**What it lacks is V2 and V7 below. There is also a simpler form.**

**Simpler form: drop `respond`, and let `response` be an Effect.** There is then one form of `Fake.call` and no either-or:

```ts
Fake.call({                                       // existing
  request: { q: Schema.String },                  // existing
  latency: "200 millis",                          // NEW in v2, now works with a library too
  handle: (truth: Truth, req) => ({               // existing, pure            // user-defined: Truth
    truth: record(truth, req),                    // existing, commits now     // user-defined: record
    response: askLibrary(req),                    // CHANGED: a response, or an Effect of one   // user-defined: askLibrary
  }),
})
```

| | `respond` | `response` may be an Effect |
| --- | --- | --- |
| New words | one, plus a union of two forms | none |
| Section 3's "one result shape" | an exception | holds |
| Lost update | impossible, no truth | impossible: truth commits synchronously, before the Effect runs, and the Effect cannot write it |
| A library plus truth or `send` | not possible | possible |
| `latency` | excluded | composes |
| Order rule (H5) | no `send` to order | unchanged: commit, frames, settle, then the answer's Effect runs and goes to its gate |
| Crash | no truth to worry about | **New row needed:** the Effect dies after commit, so truth and frames stand and the answer is the binding's failure, plus an `issue`. Realistic, a server that dies after its write. It does narrow section 3's "no truth and no frames" to a `handle` that throws |

I recommend this. The cost is the one new row.

### High

**V1. A body cannot end itself, so H3 is still open for the Assistant.** `end` exists only as `socket.end(where)` in a `send` list.

- **Failing case:** `assistant.fake.ts`. Its `open` returns all the tokens and the body must then end. Written as `open: (t, req) => ({ frames, send: [selfEnd.end(...)] })`, the spike fails: TS7022, `selfEnd` "implicitly has type 'any'", because `open` refers to the value being defined.
- **Also wrong at runtime:** `where` matches by request, so it can end another connection with the same request. And nothing says `send` from `open` reaches a connection that is only now opening.
- **The other route:** a control. Then `assistant/answered` needs a Story step before its body ends, which is not what a server does. The same applies to any finished SSE or NDJSON body.
- **Fix:** an `end` field on `open`'s result, meaning this connection, after its `frames`:

```ts
open: (truth: Truth, req) => ({          // existing
  frames: tokensFor(truth, req),         // existing                                    // user-defined: tokensFor
  end: true,                             // NEW: this connection ends after its frames, queued like any item
})
```

`hold({ after: 2 })` then works as M7 says: two frames, then silence, then the rest and the end at `release`. `socket.end(where)` stays for controls.

### Medium

**V2. Section 5 understates why a library fails in a browser, and `req` is not what it needs.**

- `respond` gets the mapped `req`, but MSW's `getResponse` takes a `Request`. So the author rebuilds one, and a library's read of that is a host task in Chromium. This is not limited to libraries that clone.
- A library returns a real web `Response`. v2's response shape is `{ status, body?, headers? }`, and nothing says who converts it. Reading it to convert is a host task in Chromium. Passing it through means the adapter's own `response.json()` is one (table above, e7).
- So on v2's text, I expect **every** library-backed Story over `Fake.fetch` to be `HostTimeWait` in Chromium, not only some. Inferred from e7, since MSW was not run.
- **Fix:** say this plainly in section 5, and say a web `Response` is accepted and passed through unshimmed. Those Stories are Bun and Node only, and that failure is honest.

**V3. `latency` must say when the handler runs.** v2 says "data on the Story clock", and nothing else. If `truth` is read at arrival, M6's lost update is back.

- **Fix:** "after `latency`, the handler runs against current truth and commits atomically."
- That also contradicts 2.10.17.5's "fake handlers run in arrival order" once two endpoints have different latencies. Reword it to "in order of when each is due, then arrival".

**V4. The request body list misses Effect's real bodies. My review was wrong here.** I said `init.body` is "a plain string", from a test that used a `Raw` body. `e8.ts` shows `bodyJsonUnsafe`, `bodyText` and `bodyUrlParams` all arrive as `Uint8Array`; only `bodyFormData` arrives as `FormData`.

- v2's "parsed JSON if `application/json`, otherwise the `FormData`, `URLSearchParams` or string as given" leaves text and urlencoded bodies undefined, and has no case for a `ReadableStream` (Effect's `Stream` body).
- **Fix:** decode a `Uint8Array` by content type, synchronously, with `TextDecoder`: JSON parsed, urlencoded to `URLSearchParams`, otherwise a string. Read a `ReadableStream` with a reader, keeping H4's arrival number.

**V5. The frame rule order was lost from M7, and v2's own example hits it.** Section 2 sets `hold({ after: 2 })`, then `hold({ match: { input: { room: "r1" } } })`.

- "A connection takes its frames rule at open or when the rule is set" does not say whether the second rule replaces the first on an open connection still counting. 2.10.17.2's "earliest-set rule" would make the second do nothing, so the example would be a no-op.
- `duplicate` against a counting `hold`, and `drop()` while counting, are also unstated.
- **Fix:** restore the lines, and decide the case: a later `hold` on a matching open connection takes effect at once, since silence only widens. `duplicate` counts per frame, and a `drop()` always closes.

**V6. A close held on the wire needs a state.** The server has closed and the client does not know yet.

- Unstated: a `send` to it (I propose nothing, since the server sees it as closed); what the log's `closed { code }` shows meanwhile (I propose set when the server closes, with the `frame` record showing delivery); whether `release({ nth: k })` counts the close (I propose it does not, and it stays last).
- These belong in the 2.10.17.3 row that v2 promises.

**V7. `respond` needs its types and its memory stated.**

- `Effect<Response, never, never>`. An error channel would let a handler raise `Fake.Lost`, deciding the wire against W18. The spike rejects a failing Effect, but only because my mock says so; v2 does not say. A library error is a defect, so a crashed server. `R` is `never` per 2.10.4's table (a server depends on nothing from a tab).
- A library's closure can remember, against 2.10.4's "everything a fake remembers is server truth". If it is module-level, it leaks across runs and branches, and a property test's shrink can stop reproducing. Fix: build it inside the server's construction, and say so. These apply equally to the simpler form.

**V8. A stream not placed on this server is silently nothing.** `send: [orphanSocket.end(...)]` compiles when `orphanSocket` is not in `endpoints` (spike, `notPlaced`), and the list is a runtime value, so no type can catch it. A desk file that forgets to spread an endpoint then loses pushes silently, the M9 failure again.

- **Fix:** an `issue` naming the fake, at the send, and a construction error if one stream value is placed on two servers.

### Low

**V9.** `match: { input }` needs its rule: listed keys must be equal. C1 removes `expect`'s matching rules, so it cannot borrow them.

**V10.** v2 says "`Schema.String` for raw". That gives up typing for a whole endpoint to reach 2.10.5's malformed frame. `Schema.Union([Schema.fromJsonString(M), Schema.String])` encoded both a typed and a raw frame correctly in `e8.ts`, so document that.

**V11. Near misses with the decisions; none reopens one.**

- W14 says `{ truth, response }`; v2's omitted `truth` loosens it. It is a delegated call, so show it when the owner reads the spellings.
- W17: "that alone would break W17" holds only for its "inside a handler" half. A plain Layer still meets the other half, though outside the wire.
- W15: `respond` is not a binding, so no conflict.
- W1, W13, W18-W21, W24, C1, C3: consistent. `Story.machine` is used, no `expect`, and no `Story.records`.

**V12. Small gaps inside v2.**

- Section 3's `response?` reads as optional, but a call must answer. The spike requires it, and a `handle` with no `response` is rejected.
- `Fake.stream`'s `headers` is missing from the Added list.
- v2 says only `handle` is pure. Say so for `open`, `message` and controls too.
- 3.6's "fourteen record kinds" becomes fifteen.
- `socket`, `Chat.socket` and `server.socket` are three values with one name: definition, Story target, client read. This is acceptable, but the docs should say it.
- Delivering frames and settling before the answer means a request caused by a frame can reach the server before the first answer arrives. That is real and deterministic, and the executor model should cover it.

### The type spike

Section 2's example compiles as written with `Truth` annotated.

| Case | Result |
| --- | --- |
| Wrong connection field in `where`; wrong frame shape | Rejected |
| `handle` with no `response`; `handle` and `respond` together; `latency` with `respond`; `frames` with `refuse` | Rejected |
| `respond` with a failing Effect | Rejected, if `E` is `never` (V7) |
| `respond` returning an extra `send` | **Accepted** (`Effect.succeed` hides the extra field), so it is silently ignored. Goes away with the simpler form |
| A handler with another server's `Truth` | Accepted with a loose `server` signature; rejected once `endpoints` is constrained by `Sch<T>` (`spikeV2b.ts`), and Chat still compiles. Use that constraint |
| A stream not on this server | Accepted (V8) |
| `open` naming its own stream | **Error, TS7022** (V1) |
| Unannotated `truth` in a standalone `Fake.call` or `Fake.control` | `unknown`: spreading or reading it errors. An unused `_truth` is fine, as in v2's `finish`. So most of the 33 controls need the annotation |
