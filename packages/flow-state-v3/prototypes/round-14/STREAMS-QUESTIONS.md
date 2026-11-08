# Streams: questions for the user

Status: **answered**. Q1 B (the user's) and Q2 A (the runner's), both built in streams round 2 (STATUS.md, "Phase 1: streams round 2"); Q1's
helper gained one proposed addition there, `emit.fail(e, key)`. The text below is the question as asked.

Status when asked: **proposed**. Nothing here is decided or built. These are the questions phase 1's streams round 1 left for you: each needs a new public word
or changes how app code is written. Each has the problem, where the data comes from, a complete before/after, the options and a recommendation.
Reply `Q1 A`.

Keyword marks: **NEW**, **existing**, **user-defined**.

## Q1. One socket, many keys: who fans the socket's signals out to each key's session?

**Problem.** 2.11.12.3's ticker has one app-wide WebSocket for every symbol. Flow runs one session per symbol (`subscribe.each`, rule 41), and each
session has its own `idleTime`, backoff and flap count. So the socket's pings must reach every symbol's session, its drop must fail every one, and
each symbol's `subscribed` frame must reach only that symbol. Otherwise a quiet symbol goes `Silent` at 25 s. The design leaves this routing to the
app's service. Case P1-S shows the runtime is correct once the frames are routed: pings keep a quiet symbol `Live`, a half-open socket makes every
symbol `Silent`, and a drop gives every symbol its own reconnect. But every app with a multiplexed socket (Phoenix channels, graphql-ws, Pusher, a
market feed) writes the same route table, reference count and fan-out. That's the repeated wiring.

**Where the data comes from.** A browser `WebSocket`. Its frames are `{ t: "ping" }` every 10 s, `{ t: "subscribed", symbol }` after a subscribe
frame, and `{ t: "quote", quote: { symbol, price, asOf } }`. A close means the socket dropped.

The contract, definition and machine are the same in both versions (2.11.12.3, unchanged):

```ts
export const Market = { quote: stream({                                   // existing: stream
  id: "Market.quote", input: { symbol: Schema.String }, output: Quote, key: ["symbol"],   // user-defined: Quote
  delivers: "latest",                                                     // existing
  subscribe: ({ symbol }) => Stream.unwrap(Effect.map(MarketFeed, (mf) => mf.frames(symbol))),   // user-defined: MarketFeed, below
  reconnect: { while: (e) => e._tag === "MarketDropped" }, idleTime: "25 seconds",   // existing; user-defined: MarketDropped
}) }
// machine, existing: subscribe.each
WATCHING: { activities: [O.quotes.subscribe.each(({ memory }) => memory.watchlist.map((symbol) => ({ symbol })))] },
```

```ts
// BEFORE: market.feed.ts, user-defined: all of it
export class MarketFeed extends Context.Service<MarketFeed, {
  readonly frames: (symbol: string) => Stream.Stream<Quote | Feed.Signal, MarketDropped>
}>()("app/MarketFeed") {
  static readonly layer = Layer.effect(MarketFeed, Effect.gen(function* () {
    const open = yield* Socket.WebSocketConstructor                       // existing: the seam Stories replace
    const routes = new Map<string, Set<Feed.Emit<Quote, MarketDropped>>>()   // symbol -> the sessions listening to it
    let ws: WebSocket | undefined
    const pending: string[] = []                                          // subscribes sent before the socket opened
    const every = (f: (emit: Feed.Emit<Quote, MarketDropped>) => void) => routes.forEach((set) => set.forEach(f))
    const connect = () => {
      const socket = open("wss://market.example/v1")
      ws = socket
      socket.addEventListener("open", () => { for (const s of pending.splice(0)) socket.send(JSON.stringify({ op: "subscribe", symbol: s })) })
      socket.addEventListener("message", (e) => {
        const f = JSON.parse(String(e.data)) as { t: "ping" } | { t: "subscribed"; symbol: string } | { t: "quote"; quote: Quote }
        if (f.t === "ping") every((emit) => emit(Feed.ping))              // existing: Feed.ping. Every symbol's session
        else if (f.t === "subscribed") routes.get(f.symbol)?.forEach((emit) => emit(Feed.live()))   // existing: Feed.live. One symbol's
        else routes.get(f.quote.symbol)?.forEach((emit) => emit(f.quote))
      })
      socket.addEventListener("close", () => { ws = undefined; every((emit) => emit.fail(new MarketDropped())) })
    }
    const send = (symbol: string, op: "subscribe" | "unsubscribe") =>
      ws?.readyState === WebSocket.OPEN ? ws.send(JSON.stringify({ op, symbol })) : op === "subscribe" ? pending.push(symbol) : undefined
    return {
      frames: (symbol) => Feed.callback<Quote, MarketDropped>((emit) => Effect.gen(function* () {   // existing: Feed.callback
        if (ws === undefined) connect()
        const set = routes.get(symbol) ?? new Set()
        set.add(emit)
        routes.set(symbol, set)
        if (set.size === 1) send(symbol, "subscribe")
        yield* Effect.addFinalizer(() => Effect.sync(() => {
          set.delete(emit)
          if (set.size === 0) { routes.delete(symbol); send(symbol, "unsubscribe") }
          if (routes.size === 0) { ws?.close(); ws = undefined }
        }))
      })),
    }
  }))
}
```

```ts
// AFTER: market.feed.ts. Only the protocol is the app's.
export class MarketFeed extends Context.Service<MarketFeed, {
  readonly frames: (symbol: string) => Stream.Stream<Quote | Feed.Signal, MarketDropped>
}>()("app/MarketFeed") {
  static readonly layer = Layer.effect(MarketFeed, Effect.gen(function* () {
    const open = yield* Socket.WebSocketConstructor
    const hub = yield* Feed.multiplex<string, Quote, MarketDropped>({     // NEW: Feed.multiplex. One connection while any key has a session
      connect: (emit) => Effect.gen(function* () {                       // NEW: connect, given emit with .to, .all, .fail
        const ws = open("wss://market.example/v1")
        const opened = Effect.callback<void>((resume) => ws.addEventListener("open", () => resume(Effect.void)))
        ws.addEventListener("message", (e) => {
          const f = JSON.parse(String(e.data)) as { t: "ping" } | { t: "subscribed"; symbol: string } | { t: "quote"; quote: Quote }
          if (f.t === "ping") emit.all(Feed.ping)                         // NEW: emit.all, every key's session
          else if (f.t === "subscribed") emit.to(f.symbol, Feed.live())   // NEW: emit.to, one key's sessions
          else emit.to(f.quote.symbol, f.quote)
        })
        ws.addEventListener("close", () => emit.fail(new MarketDropped()))   // every key's session fails; the next subscribe reconnects
        yield* Effect.addFinalizer(() => Effect.sync(() => ws.close()))
        yield* opened
        return {
          add: (symbol) => Effect.sync(() => ws.send(JSON.stringify({ op: "subscribe", symbol }))),     // NEW: add, the first session of a key
          remove: (symbol) => Effect.sync(() => ws.send(JSON.stringify({ op: "unsubscribe", symbol }))), // NEW: remove, its last session gone
        }
      }),
    })
    return { frames: (symbol) => hub.stream(symbol) }                     // NEW: hub.stream(key), a Stream per key, bounded as Feed.callback
  }))
}
```

Added: `Feed.multiplex`, its `connect`, `emit.to`, `emit.all`, `add`, `remove`, `hub.stream`. Dropped from app code: the route table, the reference
count, the pending-subscribe queue, the fan-out loops. Machine, definition and contract: unchanged.

- **A.** No word. Keep the routing in the app's service, as 2.11.12.3 does today, and add the BEFORE block to the docs as the recipe.
- **B.** A library helper, `Feed.multiplex`, as AFTER. It's library code beside `Feed.callback`, not a runtime concept: Flow still sees one
  independent session per key, with that key's own liveness and backoff. A socket drop is N failures and N reconnects, and the first one reopens
  the socket.
- **C.** A runtime concept: a contract-level `connection` that Flow owns once per socket, with per-key registrations on it. One idle timer, one
  backoff, one flap count. This is a new idea in the session table (Streams T1 gains a parent), and `flow explain` and Stories must show it.

**Recommendation: B.** It removes the wiring every multiplexed app repeats, and nothing in the runtime, the single graph, Stories or
`flow check` changes. C makes reconnect cheaper (one backoff instead of N), but it costs a second level in T1, and the case shows N independent
sessions are already correct. Cost of B: N jittered reconnects after a drop; the first reopens the socket and the rest join it.

## Q2. A key that changes while the state stays put, with a `fills` field

**Problem.** Rule 68 and Operations O4 are now built. A key field changing while the state stays put releases the old session and opens the new
key's (P1-S). But `fills` (2.11.7) says the field "holds only this feed's items". If a handler changes `roomId` and leaves `messages` alone, the
new key's first registration finds no record for its key and a filled field. That is Streams T2 row 7: one `missed Unproven` notice for a room
the person has never opened. With `catchUp`, it's a read from the start, appended to the other room's messages. Flow can't tell this from a real
gap, because a plain list doesn't say which key's items it holds. The design's own chat (2.11.2) avoids it by re-entering with `messages: []`.

**Where the data comes from.** A chat WebSocket, as 2.11.2: `subscribe({ roomId }, { from })`, frames carrying `cursor`.

```ts
// BEFORE: chat.machine.ts
LIVE: {
  activities: [O.messages.subscribe(({ memory }) => ({ roomId: memory.roomId }))],      // existing: subscribe; the key is roomId
  on: {
    Retarget: { target: "self", updateMemory: ({ event }) => ({ roomId: event.roomId }) },   // user-defined: Retarget. Stays put: r1 released, r2 opened
  },
},
// r2's first registration: no record, `messages` holds r1's items, so T2 row 7 applies: one MayHaveMissed, and r1's items stay on screen
```

```ts
// AFTER: chat.machine.ts
LIVE: {
  activities: [O.messages.subscribe(({ memory }) => ({ roomId: memory.roomId }))],
  on: {
    Retarget: { target: "self", updateMemory: ({ event }) => ({ roomId: event.roomId, messages: [] }) },   // the field holds one key's items
  },
},
// r1: a releasing turn emptied it, so r1 is wiped (re-read on return). r2: first open, no notice. Inspection flags the BEFORE form as FillsOtherKey  // NEW: FillsOtherKey
```

- **A.** A rule and a flag. "A key change empties the field in the same turn" goes in 2.11.7, and Inspection gets `FillsOtherKey`: a registration
  whose key has no entry while the field is filled and another key's entry of the same operation is filled. App code writes `messages: []`.
- **B.** Flow treats a key change as a wipe of the old key and a first open of the new one, whatever the field holds. That's silent when the list
  really does mix keys, which is the case the notice exists for.
- **C.** Require `fills` to be a per-key `Record` (as `FillsNotPerKey` does under `subscribe.each`) wherever a key can change while placed. That's
  nearly every select, so it changes most chat and feed code.

**Recommendation: A.** It is the standard contract 2.11.7 already states, made visible. B guesses, and C costs every app to fix one mistake.
