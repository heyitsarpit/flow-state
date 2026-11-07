# Fakes v2: the `Fake` module, finalized from review 1, revised from Stories reviews 1 and 2 and the model

**Status: merged into `machine-design.md` on 2026-11-01, through [stories-amended.md](stories-amended.md); kept as the record behind it.** Where they differ, the design wins. The owner approved the direction (W35) and the proposal as a whole; the spellings below stay marked [fakes-v2] in the design.
Agrees with [stories-amended.md](stories-amended.md) 2.10.4, which has the full text; if they differ, that file wins. "RV1", "RV2" are
[reviews/round-1.md](reviews/round-1.md), [reviews/round-2.md](reviews/round-2.md), and "MDL" is [model/RESULTS.md](model/RESULTS.md); their changes here, and "RV3" [reviews/round-3.md](reviews/round-3.md)'s, are the main session's calls, **[P]**. [fakes.md](fakes.md) stays as prior art; [fakes-review-1.md](fakes-review-1.md) has the evidence.

## 1. The one rule behind it

A fake has three parts, and each answers one question:

- **The result** of any handler: what changed, what is answered, what connections hear.
- **The wire** (W18): whether and when that reaches the client. Handlers never decide it.
- **The binding**: how the app's own transport reaches an endpoint.

Flow never asks the engine to do work that needs a host task (rule 61).

## 2. Spelling

```ts
const Message = Schema.Struct({ room: Schema.String, text: Schema.String, from: Schema.String })  // user-defined
type Truth = { readonly messages: ReadonlyArray<typeof Message.Type> }                            // user-defined

const socket = Fake.stream({                                       // existing: Fake.stream
  request: { room: Schema.String, clientId: Schema.String },       // existing: request
  frame: Schema.fromJsonString(Message),                           // NEW: frame, required; Schema.String for raw
  open: (truth: Truth, req) => ({                                  // existing: open; object result
    frames: truth.messages.filter((m) => m.room === req.room),     // existing: frames
    // or: refuse: 4403                                            // NEW: refuse, replaces accept
    // and, for a finished body: end: true                         // NEW: end, this connection, after its frames
  }),
  // NEW: ping: { every: "10 seconds", frame: pingFrame } [P, v3 section 9]. Optional. frame must be encodable by `frame`: declare a union
  // with a ping frame the adapter reads as Feed.ping; a blank Message would reach the app as a value [final integration L3]
})

export const Chat = Fake.server("Chat", {                          // existing: Fake.server
  truth: { messages: Schema.Array(Message) },                      // existing: truth
  initial: { messages: [] },                                       // existing: initial
  endpoints: {
    socket,
    post: Fake.call({                                              // existing: Fake.call
      request: { room: Schema.String, text: Schema.String, from: Schema.String },
      handle: (truth: Truth, req) => ({                            // W14: an object; pure
        truth: { messages: [...truth.messages, req] },             // omitted means unchanged
        response: { status: 201 },                                 // under Fake.fetch: status, body?, headers?
        send: [socket.frames((c) => c.room === req.room && c.clientId !== req.from, [req])],
        // NEW: send, an ordered list; NEW: socket.frames(where, frames); where reads the connection's request
      }),
    }),
    logout: Fake.call({
      request: { clientId: Schema.String },
      handle: (_truth: Truth, req) => ({
        response: { status: 204 },                                 // no body, as Effect's omitsBody
        send: [socket.close((c) => c.clientId === req.clientId, 4401, "expired")],
        // NEW: socket.close(where, code, reason?)
      }),
    }),
  },
  controls: {
    finish: Fake.control({ room: Schema.String }, (_truth, a) => ({ // existing: Fake.control; same result shape
      send: [socket.end((c) => c.room === a.room)],                 // NEW: socket.end(where), a clean end
    })),
  },
})

// A client half reads a stream as it makes a call. Each run of the Stream is one connection; its scope closes it.
server.socket({ room, clientId })                                  // NEW: Stream of wire frames: encoded, not Type [RV1 L10]
//   failing with Fake.Lost, Fake.Refused { code } or Fake.Closed { code, reason? }   // RENAMED: Fake/Lost -> Fake.Lost

// Bindings: one route table for both
Fake.fetch(Chat, {                                                 // existing: Fake.fetch
  "POST /api/rooms/:room/messages": {                              // NEW: the key, FindMyWay's path syntax
    endpoint: "post",                                              // NEW: endpoint, a name or a function of the context
    input: ({ params, body, headers }) =>                          // NEW: input; context also has query. params is typed from the key [RV1 M8]
      ({ room: params.room, text: body.text, from: headers.get("X-Client") ?? "" }),
  },
  "POST /api/logout": "logout",                                    // short form; input is { ...params, ...query, ...body }
  "POST /graphql": { endpoint: ({ body }) => body.operationName, input: ({ body }) => body.variables },
})
Fake.webSocket(Chat, {                                             // existing: Fake.webSocket
  "GET /api/rooms/:room/socket": { endpoint: "socket", input: ({ params, query }) => ({ room: params.room, clientId: query["client"] }) },
})

// In a Story
Story.machine(Room, { id: "chat/mid-stream", world: [Chat.socket.hold({ after: 2 })] })  // NEW: after
  .world(Chat.socket.hold({ match: { input: { room: "r1" } } }))   // NEW: input in match, reads the logged request
```

**Added:** `frame`, `refuse`, `end` on `open`, `send` as a list, `.frames`, `.close`, `.end`, `Fake.Refused`, `Fake.Closed`, the stream read, the route table (`endpoint`, `input`,
`params`, `query`, `body`, `headers`), `after`, `match: { input }`, the `delivery` record (RENAMED from `frame`, RV1 L2). Raised: `StoryFakeError`, `NoConnection`. **Registry:** `Stripe` is an Effect that gets or builds the server from a run-scoped registry the executor provides, so it is not in a Layer's `R` (RV1 M9). A server has no parameters; seeds are `initial` or a `world` control.

`socket`, `Chat.socket` and `server.socket` are one name on three values: the definition, the Story target and the client
read. A standalone `Fake.call` or `Fake.control` that reads `truth` annotates it (`Truth`), since it infers as `unknown`;
`Fake.server` constrains `endpoints` by its truth Schema, so another server's `Truth` is rejected. `input`'s result is typed loosely, since `request` decodes it (RV1 M8).

**Added from `merged/streams/proposal-v3.md` section 9 [P]:** `ping: { every, frame }` on `Fake.stream`: each open connection gets `frame` every `every`, on the run's Clock, running no handler. It ranks first at an equal instant, so a tie with a client's `idleTime` keeps a registered connection alive; a ping does not register, so `open` still sends the greeting [final integration L3]. A ping does not count toward `hold({ after })` and takes no `duplicate`. A hold stops pings, and none queues; the next is `every` after frames flow again. While a tab is suspended, pings coalesce to one at wake, after its overdue deadlines. Each is a `delivery` record with `ping: true`. `Fake.webSocket`'s `addEventListener("close")` gives a `code`.

Awake, a fast ping against a long `advance` hits `StoryTurnLimit { Advance }`: write `suspended`, or a slower `ping` [v3 item 3]. NDJSON has no codec: `frame` is `Schema.String`, and `end: true` must be written [v3 item 13]. To check in the type spike: inline frames in `open` may widen `t`, possibly a stand-in artifact [v3 item 14].

**Dropped:** `accept`, every tuple result, `{ to, send }`, `Fake/Lost` as a string, a handler that is an Effect; `latency`, `response` as an Effect and `headers` on `Fake.stream` (RV1 M1, section 8; main session's cuts); `message` on `Fake.stream` (RV2 section 8).

**Not added:** `pushes` (approved out; the desk's conversion is its test), a `closed` handler, `release({ take })`, a duplex
client half, `HttpApi` derivation ([revisit.md](../../../../proposals/revisit.md)); `headers` on `Fake.stream`, until the first SSE adapter checks a content type; `message`, until the first duplex fake. A stream is server-to-client for now: a client's frame through `Fake.webSocket`'s socket is ignored and logged.

## 3. Rules

**One result shape** for `handle`, `open` and controls: `truth?` and `send?` everywhere, `response` (required) on a
call, `frames?`, `refuse?` and `end?` on `open`. All three are pure. Truth and `send` commit atomically; one that throws is a
crashed server, with no truth and no frames. `handle` always answers synchronously.

**A slow answer is `hold`, `advance`, `release`** (RV1 M1), the form Testing O6 already spells.

**A broken fake is a broken run** (RV1 H4, RV2 M6). It is recorded when it happens, one per crash; the earliest recorded error is primary, and later ones are listed. `run()` finishes, then rejects with `StoryFakeError { fake, endpoint, reason }`, `reason` one of `NoRoute`, `InvalidInput`, `Crashed`, `UnplacedStream`, `InvalidRefusal`. Product `issue`s stay records and never reject. `InvalidInput` is the one edge that rejects on an app's value: a contract check by the fake's author; a Story of the server refusing bad input declares a loose `request` and answers 422. A stream not placed on this server is `UnplacedStream`, at the send. One stream value on
two servers is a construction error.

**How the words combine** (RV1 H5, RV2 M8, M9, L4; MDL G2, G4–G9, G12, G16, N1–N6; RV3 M6). Stories-amended 2.10.4 has the full text.

1. **Arrivals take one rule.** A call or attempt takes the earliest-set arrival rule that covers it, matches it and means something for it, consuming its `times`. An attempt skips a `duplicate`. A handle's hold or drop covers the next arrival, call or attempt.
2. **Frames rules do not compete: every one covering a connection applies.** A connection is silent while any hold covering it has taken effect, on its endpoint or its handle; `release` on one target ends only that target's rules; it returns to `Open` when the last ends. A count is per rule and counts delivered frames, so it is not a hold until reached and pauses while the connection is silent. Each `duplicate` rule doubles one frame per connection, and one frame takes only the earliest armed.
3. **`release` ends its target's rules first, then delivers.** Its own target's frames rules do not apply to what it delivers, even under `{ match }`; another target's do. A held close or end comes last, only when no hold is left. A count reaching `n` during a release's own delivery queues the items past `n` again under that rule, whatever form of `release` delivered them [P, MDL U1].
4. **A `release` must do something.** It is `NothingHeld` when it ends no rule and delivers no item; `release({ match })` is `NothingHeld` when no held item on its target matches. A request marked to hold, still at the server, counts as a held item: `release()` ends the rule for later arrivals and delivers that answer once ready [P, MDL U2].
5. **A rule ends when it has nothing left to do.** A used-up rule is removed unless it still holds an item or silences a connection; then `release` ends it.

One word on a handle is two rules with separate counters. `at` on a handle is a type error. `times` counts arrivals. `drop()` on a stream or handle closes matching open connections at once; with default `times` it stands for the next arrival only when no connection matched: a rule on a handle, `StoryInvalidCommand { NoConnection }` on a stream endpoint, skipped under `propertyTest`. With `times` above 1 or `"always"` it closes and stands. `duplicate` is per connection at frames. `release({ match })` delivers matching held items and leaves the rest and the rule. `release({ nth: k })` is per queue: an endpoint's held list, counting held answers, or each connection; `NothingHeld` only when no queue has k; "first" orders within a kind, and released answers still join the list first. A handle's `release` reaches connection queues in open order, then answers, then requests. A `send` list evaluates every `where` before delivering, so a throw is a crash with nothing delivered. Connections are reached in open order. A rule "fired" if a call or attempt took it, or it applied to an open connection; one that never fired is the `UnusedWireRule` diagnostic, written through `console.warn` at the end of `run()`.

**Order.**

| Case | Rule |
| --- | --- |
| A handler's `send` against its answer | Commit truth; deliver the list in order; the answer joins the run's one FIFO answer list. Each settle ends by delivering the next answer to its gate, then settling again (RV1 M2) |
| A handler's outcome, normal or crashed | One order: a copy → `duplicate`; marked to hold → `HeldAnswer`; marked to drop → `dropped`; `gone` → `orphan`; otherwise answered (MDL G1) |
| `release()` over held answers and held requests | Answers join the list first, in arrival order; requests reach the handler in arrival order, and their answers follow (MDL G3) |
| `hold()` on the request | The handler has not run, so nothing is sent |
| `hold({ at: "response" })` | Frames are delivered now; the answer waits |
| `drop({ at: "response" })`, `release({ drop: true })` | Truth and frames stand; only the answer is lost |
| `orphan` (client gone) | Frames still go, so a reopened tab hears them |
| `duplicate` | The copy's answer is discarded, its frames are not; the fake's dedupe omits them |
| Frames to a connection `Opening`, `None` or `Closed` | Nothing; `open` replays from truth |

**Close under `hold`** (changes merged 2.10.17.3). A server `close` or `end` is the last queued item: delivered at
`release`, lost under `release({ drop: true })`, which becomes close 1006. A network `drop()` stays immediate. While a close
is held, the server sees the connection as closed: a `send` reaches nothing, the log reads `phase: "closed"` with its `code`, the `delivery`
record shows delivery, and `release({ nth })` does not count the close, which stays last. 2.10.17.3 gains this state.

A request caused by a frame can reach the server before the first answer arrives. That is real and deterministic.

**Failures.** A network loss is `Fake.Lost` on a client half and close 1006 under `Fake.webSocket`. A refusal is
`Fake.Refused { code }` on a client half; under `Fake.fetch` its code is the status, and outside 200–599 is `StoryFakeError { InvalidRefusal }`; under `Fake.webSocket` it is an error event, then close 1006, with the code only in the log (RV1 M11). A server close is `Fake.Closed { code, reason? }`.
A crashed `open` is `Fake.Closed { code: 1011 }`. `end` ends the Stream or body, and is close 1000 under `Fake.webSocket`, which Effect's `Socket` reports as `SocketCloseError`, not a stream end.
Tags are `FakeLost`, `FakeRefused`, `FakeClosed`.

**`hold({ after: n })`.** Counted per connection: from its first frame if set before open, otherwise from when it is set.
`times` counts connections. `release` behaves as for `hold()`. A connection takes its frames rule at open or when the rule
is set. A later `hold` on a matching open connection still counting takes effect at once, since silence only widens.
`duplicate`'s count is per frame, and a duplicated frame counts as two. A `drop()` always closes. A `close` or `end` while counting, with no hold yet in effect, passes in order: `end: true` with fewer than n frames is close 1000; once the count is reached, or under a plain `hold()`, it is queued last (MDL G12). `after` with `at`, on a call or
on the server handle is a type error; `after: 0` is `hold()`; a negative is `StoryInvalidCommand`. Table 2.10.17.3 gains a
row, so its counts change.

**Bodies never need a host task** (review H1). In Chromium every `Request` and `Response` body read does.

- *Request:* the binding reads `init.body`, since `FetchHttpClient` passes `(URL, init)`. Effect's JSON, text and urlencoded
  bodies arrive as `Uint8Array`, decoded synchronously by content type: JSON parsed, urlencoded to `URLSearchParams`,
  otherwise a string. `FormData`, `URLSearchParams` and strings are given as they are. A `ReadableStream` is read with a
  reader, keeping the arrival number. A `Blob` or `File` exposes `name`, `size` and `type`; its bytes stay unread.
- *Response:* `Fake.fetch` returns a `Response` subclass with resolved `text`, `json` and `arrayBuffer`. It keeps `bodyUsed`
  honest and rejects a second read. A streamed body stays a real `ReadableStream`. This is a deliberate shim.
- An object body becomes JSON; a string stays as is; a `Uint8Array` or `ArrayBuffer` passes through, and the shim's `formData` and `blob` resolve from it (RV2 L9); 204, 205 and 304 carry no body.
- An adapter that calls `fetch(new Request(…))` with a body gets `HostTimeWait` in a browser. That is honest; the docs say so.

**Arrival order** (review H4). A binding takes the arrival number and `via` synchronously at the `fetch` call, and delivers
to the gate in that order, even from an async route function.

**Routes.** `::` is one literal colon. A key whose single-colon param does not follow `/` is rejected, because
`/parts:release` silently parses as a param. No matching route, or invalid `input`, is a 404 or 400, and the run then rejects with `StoryFakeError`. Keys ignore the origin. The function form stays for unusual cases, and its `Request` has the same body overrides.

**Streams under `Fake.fetch`.** Open is a 200 streamed body, `refuse` a status, `end` body done, a close a body error.

**The log** records the mapped `input` and `via`, never the `Request` or its headers: `init.headers` carries random `b3` and
`traceparent` values. A `delivery` record, `{ endpoint, connection, phase: "delivered" | "held" | "lost", digest, ping? }`, is a new
Inspection O4 kind, redacted like `input`. `phase` on a logged request is always a plain string; a close has `code` and `by: "server" | "network" | "client"`; a network-refused attempt is `lost` (RV1 M11). A rule that never fires is the `UnusedWireRule` diagnostic (RV1 M17).

**`match: { input }`.** Listed keys must be equal to the logged request's.

**Malformed frames.** To reach 2.10.5's `Defect`, declare `Schema.Union([Schema.fromJsonString(M), Schema.String])`. It
encoded a typed and a raw frame correctly in the review's probe.

**Names.** A control and an endpoint with one name on one handle is a construction error, as is a control or endpoint named `hold`, `release`, `drop` or `duplicate` (RV1 L8). `records` takes 21 kinds (stories-amended 2.10.6); the "fifteen" here was an undercount.

## 4. From Effect

| Module | Use |
| --- | --- |
| `FindMyWay` | Reuse for the route table |
| `Queue`, `Stream.fromQueue` | Reuse for a connection: `Queue.fail` for a close, `Queue.end` for an end |
| `Deferred`, `Latch` | Parts of the gate; one `Deferred` per held item, since `nth` needs per-item release |
| `Ref` | One atomic commit of truth and frames |
| `Schema.fromJsonString` | The `frame` codec |
| `FetchHttpClient.Fetch`, `Socket.WebSocketConstructor` | Keep as the seams |
| `HttpServerResponse.omitsBody` | Follow |
| `SocketCloseError`, `HttpClientError` | Follow: PascalCase importable error classes |
| `HttpRouter.toWebHandler` | Do not use: a body read is a host task in Chromium, an abort kills the handler (the wire table says it continues), an unknown route is a silent 404, and the gate and `via` have no place in it |

## 5. A mocking library: a recipe

**[P, W17 as amended; RV1 M1.]** `response` as an Effect is cut, so `handle` is pure and answers synchronously. A synchronous library goes in a pure handler. An async one goes in the client half, an
ordinary Layer, which can still call an endpoint first so the wire words apply:

```ts
const SearchFake = Layer.effect(SearchApi, Effect.gen(function* () {   // existing: a plain Layer  // user-defined: SearchApi
  const server = yield* Search                                         // user-defined: Search, with an endpoint gate
  const library = makeLibrary(handlers)                                // user-defined: built here, never module-level
  const askLibrary = (input: { q: string }) => Effect.promise(() => library.answer(input))
  return SearchApi.of({
    search: (input) => server.gate(input).pipe(                        // hold, drop and duplicate apply to the gate
      Effect.andThen(() => askLibrary(input)),
      Effect.catchTag("FakeLost", () => new NoResponse())),
  })
}))
```

- **Truth only if declared on the server.** What the library remembers is not truth.
- **Memory is per Layer build,** so it cannot leak across runs or a shrink. A client half is built per tab, so a `reload` or second tab starts it afresh.
- **The library must finish in microtasks,** or the operation's fiber is `HostTimeWait`. A real `Response` read needs a host task in Chromium (run, 149 headless), so anything that needs one is Bun and Node only.
- **The wire only sees the gate.**

## 6. Not verified

No Flow code ran: the rewrite has no `Fake`. The engine and Effect results are in the review and stories-amended section 6; Chromium ran, Firefox and Safari were not
run. A mock type spike of the final spelling passed under `tsconfig.base.json`'s flags, including route-key `params` and branching `handle` results; a standalone `Fake.call` still annotates `Truth`. Before merging: convert the desk's fakes as the test, and extend the Stories
executor model with section 3's order, combination and close rows; the model must be re-run, since these rules resolve G1, G2, G5, G8 and G9 differently from what it chose.
