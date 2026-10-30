# Contracts in the image of Effect RPC: an exploration

**Status: exploration. Nothing here is decided.** Every shape below is proposed. The owner's decisions it builds on
are OD1–OD5 ([operations-in-definition/decisions.md](../operations-in-definition/decisions.md)); requirements come
from `Operations.plan` O1–O7, `EntityDomains.plan` O1 and `Persistence.plan`. The old proposals were not read for
shapes. Installed code (`node_modules/effect`, version 4.0.5) is the reference for every citation; paths are
relative to `node_modules/effect/src/`.

## 0. The question in one paragraph

A Flow contract (`resource`, `transaction`, `stream`) and an Effect `Rpc` describe the same thing: a stable name,
a Schema for what goes in, Schemas for what comes out. They differ in what they are *for*. An `Rpc` describes a
**wire** between an Effect client and an Effect server. A Flow contract describes a **server interaction as the UI
sees it**: which server thing it is about (key), how long an answer stays good, what two clicks do (concurrency),
and what "maybe sent" means. So the real question is which of three layers Flow should borrow from Effect:

| Layer | What it holds | Who owns it today |
| --- | --- | --- |
| **Contract** | id, payload, success, error, stream element | Effect `Rpc` / `HttpApiEndpoint`; Flow re-declares it |
| **Policy** | key, `staleTime`/`gcTime`, `concurrency`, `delivers`, resume field, persistence | Flow only. Effect has none of it (section 1.2) |
| **Implementation** | how a call reaches the server: `fetch`, an SDK, an `RpcClient` | Effect: a Layer (`RpcGroup.toLayer`, `HttpApiBuilder.group`). Flow: a closure on the contract |

Effect's own convention splits contract from implementation: an `Rpc` holds no closure, and handlers arrive later
as a Layer. Flow today fuses them (the `lookup` closure sits in the contract). The designs below are ordered by how
much of Effect's contract they reuse, and differ most in where the implementation lives.

---

## 1. What Effect RPC is in 4.0.5

### 1.1 What it gives

| Piece | What it does | Where |
| --- | --- | --- |
| `Rpc.make(tag, { payload, success, error, defect, stream, primaryKey })` | A description only: tag plus Schemas. `payload` takes a Schema or a fields record (wrapped in `Schema.Struct`). Defaults: payload `Void`, success `Void`, error `Never`, defect `Schema.Defect()`. No closure, no transport. | `rpc/Rpc.ts:941-990` |
| The `Rpc` interface | `_tag`, `payloadSchema`, `successSchema`, `errorSchema`, `defectSchema`, `annotations: Context`, `middlewares`; builders `setPayload`, `setSuccess`, `setError`, `middleware`, `prefix`, `annotate` | `rpc/Rpc.ts:76-170` |
| `stream: true` | Wraps success and error in `RpcSchema.Stream(success, error)` and sets the outer error to `Never`. The client method then returns a `Stream` (or a `Queue` with `asQueue`) | `rpc/Rpc.ts:983-986`, `rpc/RpcSchema.ts:58-90`, `rpc/RpcClient.ts:87-130` |
| `primaryKey` | A **closure** `(payload) => string`. It turns the payload into a `Schema.Class` implementing `PrimaryKey.symbol` | `rpc/Rpc.ts:953-972` |
| Who reads `primaryKey` | Nobody in `rpc/`: `RpcClient` and `RpcServer` never reference it. It is consumed by cluster message storage and persistence (`cluster/MessageStorage.ts:112`, `persistence/Persistable.ts:44`) for deduplication | grep over `rpc/` |
| `Rpc.custom` | A constructor factory that rewrites the success/error/defect Schemas (e.g. a paginated Rpc) | `rpc/Rpc.ts:1042-1130` |
| `Rpc.exitSchema` | One `Schema.Exit` per Rpc for encoding results on the wire | `rpc/Rpc.ts:1154-1195` |
| Handler shape | `(payload, { client, requestId, headers, rpc }) => Effect \| Stream`; `Rpc.fork` and `Rpc.uninterruptible` wrap a result | `rpc/Rpc.ts:220-232`, `rpc/Rpc.ts:1211-1310` |
| `RpcGroup.make(...rpcs)` | A named set; `add`, `merge`, `omit`, `prefix`, `middleware`, and `toLayer({ Tag: handler })` / `toHandlers` / `of` for **server** implementations typed by the Schemas | `rpc/RpcGroup.ts:37-170`, `rpc/RpcGroup.ts:411` |
| `RpcMiddleware` | Server middleware sees `{ client, requestId, rpc, payload, headers }`; a client side (`RpcMiddlewareClient`) wraps `next(request)`, e.g. to add auth headers | `rpc/RpcMiddleware.ts:51-100`, `rpc/RpcMiddleware.ts:347` |
| `RpcClient.make(group)` | One method per tag: `(payload, { headers, context, discard })` returning `Effect<Success, Error \| RpcClientError>`; `withHeaders` and `CurrentHeaders` for ambient headers; `generateRequestId` option | `rpc/RpcClient.ts:643-660`, `rpc/RpcClient.ts:838-860` |
| Protocols | HTTP (`supportsAck: false`), socket with ping, reconnect and `retryPolicy`, worker | `rpc/RpcClient.ts:923-1033`, `rpc/RpcClient.ts:1062-1300`, `rpc/RpcClient.ts:1327` |
| Interruption | Interrupting the calling fiber sends an `Interrupt` message to the server | `rpc/RpcClient.ts:427-431`, `rpc/RpcClient.ts:551-562` |
| Server | `RpcServer.make(group, { concurrency, spanPrefix, disableFatalDefects })`; `concurrency` is one server-wide semaphore (`number \| "unbounded"`) that `Rpc.fork` bypasses | `rpc/RpcServer.ts:101-135`, `rpc/RpcServer.ts:282`, `rpc/RpcServer.ts:375` |
| `RpcTest.makeClient(group)` | An in-memory client wired straight to the group's handlers, with no serialization and real ack/interrupt/middleware paths | `rpc/RpcTest.ts:27-58` |
| `RpcSerialization` | `json`, `ndjson`, `jsonRpc`, `ndJsonRpc` and a schema-driven binary codec (`layerSchemaBinary`); a service, so transport format is a Layer | `rpc/RpcSerialization.ts:62-660` |
| `RpcClientError` | One error class whose `reason` is a union of worker, socket, HTTP client and protocol-defect reasons. It is a `Schema.Error`, so it can be encoded | `rpc/RpcClientError.ts:41-61` |

The neighbours:

- **`Reactivity`** (`reactivity/Reactivity.ts:50-72`): `invalidate(keys)`, `mutation(keys, effect)` (= tap
  invalidate after success, `:120-123`), `query(keys, effect)` and `stream(keys, effect)` re-run on invalidation.
  Keys are an array or a `Record<string, Array>`; each element is hashed (`:425-440`). Matching is exact per hashed
  element: there is no partial-record match.
- **`AtomRpc`** (`reactivity/AtomRpc.ts:45-125`, `:195-300`): `client.query(tag, payload, { reactivityKeys,
  timeToLive, serializationKey })` and `client.mutation(tag)` with `reactivityKeys` **per call**. The cache key is
  `{ tag, payload, headers, … }` through `Atom.family` (`:223-260`, `:290-300`). `timeToLive` is an idle TTL
  (`Atom.setIdleTTL`), not a staleness window. `serializationKey` makes an atom hydratable with
  `AsyncResult.Schema({ success, error })` (`:246-252`). `AtomHttpApi` is the same over `HttpApiClient`
  (`reactivity/AtomHttpApi.ts:84`, `:230-276`).
- **`Atom.refreshOnWindowFocus`** (`reactivity/Atom.ts:2838`) refreshes unconditionally on focus, with no staleness test.
- **`HttpApiEndpoint`** (`http-api/HttpApiEndpoint.ts:1048-1135`): `HttpApiEndpoint.post(id, path, { params, query,
  headers, payload, success, error })`. Here **`params` means path parameters** and `payload` means the body. Errors
  map to statuses (`http-api/HttpApiSchema.ts:131-158`); bodies can be JSON, form-urlencoded, multipart or SSE
  (`HttpApiSchema.ts:91`, `:389`). `HttpApiClient.make(api, { baseUrl })` derives a typed REST client from the same
  description (`http-api/HttpApiClient.ts:525-560`, `endpoint` at `:644`).
- **Abort.** `Effect.tryPromise((signal) => …)` hands the callback an `AbortSignal` that fires when the fiber is
  interrupted (`Effect.ts:1513`, `:1586`). In Effect, interruption *is* the abort signal.

### 1.2 What it lacks for Flow

| Flow requirement | Effect RPC 4.0.5 |
| --- | --- |
| Shared cache per key, `staleTime`, `gcTime` | None in `rpc/`. AtomRpc gives an atom per `(tag, payload, headers)` with idle TTL; no staleness, no "one running plus one trailing" rule |
| Key as a list of payload fields (OD4) | `primaryKey` is an opaque closure to a string, unused by client and server. Not statically readable, not a Schema, cannot be partially matched |
| Invalidation by partial key | `Reactivity` hashes whole elements; keys are chosen per call, not declared on the contract |
| Refetch on focus/reconnect only when stale | `refreshOnWindowFocus` is unconditional; nothing for reconnect |
| No automatic retry | Client calls do not retry, but the socket protocol retries **connections** (`RpcClient.ts:1198-1213`) |
| `unknown` ("maybe sent") | No such channel. A socket failure fails **every** in-flight request with `RpcClientError` (`RpcClient.ts:775-780`), and `send` fails with the **same** error when the socket is already down (`RpcClient.ts:1218-1222`). Not sent and maybe sent are indistinguishable |
| `attempt.id` for idempotency | None. `RequestId` is per client connection (`generateRequestId`, `RpcClient.ts:648`); a re-send gets a new one. Idempotency can travel only in `headers` or the payload |
| Client concurrency `reject/latest/cancel/allow/serialize` per key | None. The server's semaphore is global and per server |
| Stream signals `open/resumed/gap/down`, `delivers` | None. A dropped socket fails the stream with `RpcClientError`; reconnect re-dials the socket but does not resume the stream; no continuity claim |
| Resume parameter outside the key | Nothing special: the payload is the only input a server sees |
| Entity predictions | None |
| Calling REST, Stripe, Supabase, raw WebSocket | An `Rpc` is callable only through `RpcClient` + a `Protocol` speaking Effect's RPC messages. It cannot describe Stripe's wire. `HttpApi` can describe REST, but describing a third-party API in full is the app's choice, not something Flow may require |

**Finding.** Effect RPC solves the *contract* layer well and the *implementation* layer for one transport. It
offers nothing at the *policy* layer, and its error model is too coarse for writes: Flow must treat
`RpcClientError` after invocation as `unknown`, which is the only safe reading.

### 1.3 Outside prior art (brief)

- **tRPC v11**: procedures `.input().query/mutation/subscription`; cache keys derived from path plus input
  (`queryOptions`). SSE subscriptions resume through `lastEventId` **in the input**, with `tracked(id, data)`
  elements: prior art for a resume field inside the payload but outside the cache key.
- **oRPC**: contract-first. `oc.input().output().errors()` is pure data; `implement(contract)` supplies handlers
  later; the same contract feeds an RPC handler and an OpenAPI/REST handler. Prior art for design C and for "one
  description, two wires".
- **TanStack Query**: `queryOptions({ queryKey, queryFn, staleTime })` co-locates key, closure and policy (design B's
  shape); keys are opaque arrays matched by prefix. `mutationOptions` has `scope.id` to serialize writes.
- **TanStack DB**: collections hold `getKey` and `onInsert/onUpdate/onDelete` handlers, so the write
  implementation sits on the data description. Optimistic by default, which Flow's domains reject (C1).

---

## 2. The examples and what stays fixed

Three apps, three data sources:

| App | Source | Contracts |
| --- | --- | --- |
| Checkout | Stripe REST through `fetch` (publishable key plus `client_secret`); stripe.js SDK for 3-D Secure | `confirm` (write), `authenticate` (3-D Secure write), `intent` (one-off read) |
| Chat room | An Effect RPC server over WebSocket | `messages` (stream, resumable), `send` (write per message) |
| Kanban | Supabase JS SDK | `boardCards` (domain read), `moveCard` (domain write with prediction) |

**The machine side is the same in every design.** OD2/OD3 fix it: `operations: { x: Contract.outcomes(...) }` in
the definition and `O.x.commit/lookup/subscribe` in the machine. Only the domain callbacks' parameter names change.
The definition and machine syntax below is illustrative; the lines that matter are `operations` and `O.x`.

### 2.1 Shared code (user-defined, same in every design)

```ts
// checkout/stripe.ts — the data source: Stripe's REST API through fetch, and stripe.js.
// (Design C moves the four Schema classes into stripe.schemas.ts so contracts import no SDK code.)
import { Context, Effect, Schema } from "effect";
import { Outcome } from "flow-state";                     // existing: Outcome.unknown = "maybe sent"
import type { Stripe } from "@stripe/stripe-js";

export class PaymentIntent extends Schema.Class<PaymentIntent>("PaymentIntent")({ // user-defined
  id: Schema.String,
  status: Schema.Literals(["requires_action", "processing", "succeeded", "requires_payment_method"]),
}) {}
export class CardDeclined extends Schema.TaggedError<CardDeclined>()("CardDeclined", { message: Schema.String }) {}
export class AuthFailed extends Schema.TaggedError<AuthFailed>()("AuthFailed", { message: Schema.String }) {}
export class StripeJs extends Context.Service<StripeJs, Stripe>()("StripeJs") {} // user-defined: the SDK

const API = "https://api.stripe.com/v1";
const auth = { Authorization: `Bearer ${import.meta.env.VITE_STRIPE_PK}` };

// A write: the request may have left once fetch was called, so transport trouble is unknown, not failure.
export const stripePost = (path: string, form: Record<string, string>, idempotencyKey: string) =>
  Effect.gen(function* () {
    const res = yield* Effect.tryPromise({
      try: (signal) => fetch(`${API}${path}`, {                     // signal: interrupting the fiber aborts
        method: "POST",
        signal,
        headers: { ...auth, "Idempotency-Key": idempotencyKey },    // Stripe deduplicates on this
        body: new URLSearchParams(form),
      }),
      catch: () => Outcome.unknown(),
    });
    const body = yield* Effect.tryPromise({ try: () => res.json(), catch: () => Outcome.unknown() });
    if (res.status === 402) return yield* new CardDeclined({ message: body.error.message });
    if (res.status >= 500) return yield* Outcome.unknown();        // Stripe may have applied it
    return yield* Schema.decodeUnknownEffect(PaymentIntent)(body).pipe(Effect.orDie);
  });

// A read: no unknown channel; transport trouble is a defect here, a typed error if the app declares one.
export const stripeGet = (path: string) =>
  Effect.tryPromise((signal) => fetch(`${API}${path}`, { headers: auth, signal }).then((r) => r.json())).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(PaymentIntent)),
    Effect.orDie,
  );

// 3-D Secure: stripe.js opens the bank's challenge; once opened, abandoning it is "maybe authenticated".
export const handleNextAction = (clientSecret: string) =>
  StripeJs.use((stripe) =>
    Effect.tryPromise({ try: () => stripe.handleNextAction({ clientSecret }), catch: () => Outcome.unknown() }),
  ).pipe(
    Effect.flatMap((r) =>
      r.error ? Effect.fail(new AuthFailed({ message: r.error.message ?? "" }))
              : Schema.decodeUnknownEffect(PaymentIntent)(r.paymentIntent).pipe(Effect.orDie),
    ),
  );
```

```ts
// chat/chat.rpc.ts — the data source: the chat server's Effect RPC group (lives in a shared package)
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

export class Message extends Schema.Class<Message>("Message")({                 // user-defined
  roomId: Schema.String, seq: Schema.Number, localId: Schema.String, text: Schema.String,
}) {}
export const ChatEvent = Schema.Union([                                          // user-defined
  Schema.TaggedStruct("Hello", { resumed: Schema.Boolean }),                     // the server's continuity claim
  Schema.TaggedStruct("Posted", { message: Message }),
]);
export class RoomClosed extends Schema.TaggedError<RoomClosed>()("RoomClosed", {}) {}

export const Messages = Rpc.make("Chat/messages", {                              // existing: Rpc.make
  payload: { roomId: Schema.String, after: Schema.optional(Schema.Number) },     // existing: payload
  success: ChatEvent,                                                            // existing: success
  stream: true,                                                                  // existing: stream
});
export const Send = Rpc.make("Chat/send", {
  payload: { roomId: Schema.String, localId: Schema.String, text: Schema.String },
  success: Message,
  error: RoomClosed,                                                             // existing: error
});
export const ChatRpcs = RpcGroup.make(Messages, Send);                           // existing: RpcGroup.make
```

```ts
// board/supabase.ts — the data source: the Supabase SDK
import { Context, Schema } from "effect";
import type { SupabaseClient } from "@supabase/supabase-js";

export class CardRow extends Schema.Class<CardRow>("CardRow")({                  // user-defined
  boardId: Schema.String, cardId: Schema.String, column: Schema.String,
  position: Schema.Number, title: Schema.String, revision: Schema.Number,
}) {}
export const CardPage = Schema.Struct({ cards: Schema.Array(CardRow) });         // user-defined
export class StaleCard extends Schema.TaggedError<StaleCard>()("StaleCard", {}) {}
export class Supabase extends Context.Service<Supabase, SupabaseClient>()("Supabase") {}
```

### 2.2 Before: the plan's shapes today (O1 plus OD4)

```ts
// checkout/checkout.operations.ts — BEFORE
import { Schema } from "effect";
import { resource, transaction } from "flow-state";
import { handleNextAction, PaymentIntent, stripeGet, stripePost } from "./stripe";

export const confirm = transaction({
  id: "Checkout/confirm",
  key: ["intentId"],                                                             // OD4
  input: Schema.Struct({ intentId: Schema.String, clientSecret: Schema.String, paymentMethod: Schema.String }),
  commit: (input, { signal, attempt }) =>                                        // signal unused: tryPromise has one
    stripePost(`/payment_intents/${input.intentId}/confirm`,
      { client_secret: input.clientSecret, payment_method: input.paymentMethod }, attempt.id),
  concurrency: "reject",
});
export const authenticate = transaction({
  id: "Checkout/authenticate",
  key: ["clientSecret"],
  input: Schema.Struct({ clientSecret: Schema.String }),
  commit: (input) => handleNextAction(input.clientSecret),
  concurrency: "reject",
});
export const intent = resource({
  id: "Checkout/intent",
  key: ["intentId"],
  lookup: (params: { intentId: string; clientSecret: string }) =>                // typed by hand: no Schema
    stripeGet(`/payment_intents/${params.intentId}?client_secret=${params.clientSecret}`),
  result: PaymentIntent,
  staleTime: "0 seconds",
  gcTime: "1 minute",
});
// Errors (CardDeclined, AuthFailed) are known only from the closures' types: no Schema, nothing to inspect.
```

```ts
// chat/chat.operations.ts — BEFORE
import { Context, Effect, Schema, Stream } from "effect";
import { RpcClient, type RpcGroup } from "effect/rpc";
import { Outcome, stream, transaction } from "flow-state";
import { ChatEvent, ChatRpcs, Message } from "./chat.rpc";

export class ChatClient extends Context.Service<ChatClient, RpcClient.RpcClient<RpcGroup.Rpcs<typeof ChatRpcs>>>()(
  "ChatClient",
) {}
export const messages = stream({
  id: "Chat/messages",
  key: ["roomId"],
  subscribe: (params: { roomId: string; after?: number }) =>                     // typed by hand again
    Stream.unwrap(ChatClient.use((c) => Effect.succeed(c["Chat/messages"](params)))),
  result: ChatEvent,
  persist: false,
});
export const send = transaction({
  id: "Chat/send",
  key: ["roomId", "localId"],                                                    // one lane per message
  input: Schema.Struct({ roomId: Schema.String, localId: Schema.String, text: Schema.String }),
  commit: (input, { attempt }) =>
    ChatClient.use((c) => c["Chat/send"](input, { headers: { "idempotency-key": attempt.id } })).pipe(
      Effect.catchTag("RpcClientError", () => Outcome.unknown()),
    ),
  concurrency: "reject",
});
// The Rpc already had these Schemas; every one is written twice.
```

```ts
// board/board.operations.ts and board.domain.ts — BEFORE
import { Effect, Schema } from "effect";
import { asc, domain, entity, eq, read, resource, transaction, write } from "flow-state";
import { CardPage, CardRow, StaleCard, Supabase } from "./supabase";

export const boardCards = resource({
  id: "Board/cards",
  key: ["boardId"],
  lookup: (params: { boardId: string }) =>
    Supabase.use((sb) => Effect.promise(() => sb.from("cards").select("*").eq("boardId", params.boardId)))
      .pipe(Effect.flatMap(({ data }) => Schema.decodeUnknownEffect(CardPage)({ cards: data }).pipe(Effect.orDie))),
  result: CardPage,
  staleTime: "30 seconds",
  gcTime: "5 minutes",
  persist: true,
});
export const moveCard = transaction({
  id: "Board/move-card",                                                         // key: entity primary key (OD4)
  input: Schema.Struct({ cardId: Schema.String, column: Schema.String, position: Schema.Number, revision: Schema.Number }),
  commit: (input, { attempt }) =>
    Supabase.use((sb) => Effect.promise(() =>
      sb.from("cards")
        .update({ column: input.column, position: input.position, revision: input.revision + 1, lastAttempt: attempt.id })
        .eq("cardId", input.cardId).eq("revision", input.revision).select().maybeSingle(),
    )).pipe(Effect.flatMap(({ data }) => (data ? Schema.decodeUnknownEffect(CardRow)(data).pipe(Effect.orDie)
                                               : Effect.fail(new StaleCard())))),
  concurrency: "serialize",
});

export const Card = entity({ id: "Board/Card", fields: CardRow.fields, primaryKey: ["cardId"], version: "revision" });
export const BoardDomain = domain("board", {
  cards: read(boardCards)
    .list(Card, ({ result }) => result.cards)
    .where(({ input, record }) => eq(record.boardId, input.boardId))
    .orderBy(({ record }) => [asc(record.position), asc(record.cardId)]),
  move: write(moveCard)
    .one(Card)
    .predicts(({ input }) => Card.patch({ cardId: input.cardId }, { column: input.column, position: input.position })),
});
```

### 2.3 The machine side (identical in every design)

```ts
// checkout/checkout.definition.ts and checkout.machine.ts — unchanged by this exploration
export const Checkout = definition("Checkout", {
  states: ["READY", "CONFIRMING", "AUTHENTICATING", "CHECKING", "PAID", "DECLINED"],
  events: { Pay: { paymentMethod: Schema.String } },
  internalEvents: {
    Confirmed: { intent: PaymentIntent },
    Declined: { message: Schema.String },
    Unsure: Flow.uncertain({}),
    Checked: { intent: PaymentIntent },
  },
  memory: { intentId: Flow.initial(Schema.String, ""), clientSecret: Flow.initial(Schema.String, "") },
  operations: {                                                                  // existing: OD3
    confirm: confirm.outcomes({ success: "Confirmed", failure: { CardDeclined: "Declined" }, unknown: "Unsure" }),
    authenticate: authenticate.outcomes({ success: "Confirmed", failure: { AuthFailed: "Declined" }, unknown: "Unsure" }),
    intent: intent.outcomes({ success: "Checked" }),
  },
});
export const CheckoutMachine = machine(Checkout, ({ S, O }) => ({
  default: S.READY,
  on: {
    Pay: { target: S.CONFIRMING, run: O.confirm.commit(({ memory, event }) => ({     // existing: OD2 commit
      intentId: memory.intentId, clientSecret: memory.clientSecret, paymentMethod: event.paymentMethod })) },
    Confirmed: [
      { guard: ({ event }) => event.intent.status === "requires_action", target: S.AUTHENTICATING,
        run: O.authenticate.commit(({ memory }) => ({ clientSecret: memory.clientSecret })) },
      { target: S.PAID },
    ],
    Unsure: { target: S.CHECKING, run: O.intent.lookup(({ memory }) => ({             // existing: OD2 lookup
      intentId: memory.intentId, clientSecret: memory.clientSecret })) },
    Checked: [{ guard: ({ event }) => event.intent.status === "succeeded", target: S.PAID }, { target: S.READY }],
    Declined: { target: S.DECLINED },
  },
}));
```

```ts
// chat: the room subscribes while open; each send is its own lane (OD4 key ["roomId", "localId"])
export const Room = definition("Room", {
  states: ["OPEN"],
  events: { Post: { localId: Schema.String, text: Schema.String } },
  internalEvents: { Arrived: { event: ChatEvent }, Missed: {}, Sent: { message: Message }, SendUnsure: Flow.uncertain({}) },
  memory: { roomId: Flow.initial(Schema.String, "") },
  operations: {
    messages: messages.outcomes({ value: "Arrived", gap: "Missed" }),
    send: send.outcomes({ success: "Sent", failure: { RoomClosed: "SendUnsure" }, unknown: "SendUnsure" }),
  },
});
export const RoomMachine = machine(Room, ({ S, O }) => ({
  default: S.OPEN,
  activities: { feed: O.messages.subscribe(({ memory }) => ({ roomId: memory.roomId })) },  // existing: subscribe
  on: { Post: { run: O.send.commit(({ memory, event }) => ({ roomId: memory.roomId, ...event })) } },
}));
```

```ts
// board: a card is dragged; the domain predicts the move everywhere the card shows
export const Board = definition("Board", {
  states: ["VIEWING"],
  events: { Drop: { cardId: Schema.String, column: Schema.String, position: Schema.Number, revision: Schema.Number } },
  internalEvents: { Moved: {}, Stale: {}, MoveUnsure: Flow.uncertain({}) },
  memory: { boardId: Flow.initial(Schema.String, "") },
  operations: {
    cards: BoardDomain.cards.outcomes({}),
    move: BoardDomain.move.outcomes({ success: "Moved", failure: { StaleCard: "Stale" }, unknown: "MoveUnsure" }),
  },
});
export const BoardMachine = machine(Board, ({ S, O }) => ({
  default: S.VIEWING,
  activities: { cards: O.cards.subscribe(({ memory }) => ({ boardId: memory.boardId })) },
  on: { Drop: { run: O.move.commit(({ event }) => event) } },
}));
```

---

## 3. Design A: Flow policy on Effect `Rpc` values

**Idea.** Every contract *is* an `Rpc`. Flow's constructors take an `Rpc` plus policy. Implementations go through
Effect's machinery: `RpcClient` when an RPC server exists, an in-process "server" when it does not.

```ts
// checkout/checkout.rpc.ts — Stripe has no RPC server, but the contract is still written as Rpcs
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { AuthFailed, CardDeclined, PaymentIntent } from "./stripe";

export const Confirm = Rpc.make("Checkout/confirm", {                           // existing: Rpc.make
  payload: { intentId: Schema.String, clientSecret: Schema.String, paymentMethod: Schema.String },
  success: PaymentIntent,
  error: CardDeclined,
});
export const Authenticate = Rpc.make("Checkout/authenticate", {
  payload: { clientSecret: Schema.String }, success: PaymentIntent, error: AuthFailed,
});
export const Intent = Rpc.make("Checkout/intent", {
  payload: { intentId: Schema.String, clientSecret: Schema.String }, success: PaymentIntent,
});
export const CheckoutRpcs = RpcGroup.make(Confirm, Authenticate, Intent);

// checkout/checkout.operations.ts — Flow policy, read by flow check
import { resource, transaction } from "flow-state";
export const confirm = transaction(Confirm, { key: ["intentId"], concurrency: "reject" }); // renamed: transaction({ id, … }) → transaction(rpc, policy)
export const authenticate = transaction(Authenticate, { key: ["clientSecret"], concurrency: "reject" });
export const intent = resource(Intent, { key: ["intentId"], staleTime: "0 seconds", gcTime: "1 minute" });

// checkout/checkout.live.ts — "served" in-process: the Rpc machinery is never on a wire
import { FlowRpc } from "flow-state/rpc";                                       // NEW: FlowRpc
export const CheckoutLive = FlowRpc.local(CheckoutRpcs, {                        // NEW: FlowRpc.local
  "Checkout/confirm": (payload, { attempt }) =>                                  // existing: attempt
    stripePost(`/payment_intents/${payload.intentId}/confirm`,
      { client_secret: payload.clientSecret, payment_method: payload.paymentMethod }, attempt.id),
  "Checkout/authenticate": (payload) => handleNextAction(payload.clientSecret),
  "Checkout/intent": (payload) =>
    stripeGet(`/payment_intents/${payload.intentId}?client_secret=${payload.clientSecret}`),
});
```

```ts
// chat/chat.operations.ts — the Rpcs come from the server's package unchanged
import { Layer } from "effect";
import { RpcClient, RpcSerialization } from "effect/rpc";
import { Socket } from "effect/socket";
import { stream, transaction } from "flow-state";
import { FlowRpc, Signal } from "flow-state/rpc";                               // NEW: Signal (vocabulary is merge 6's)
import { ChatRpcs, Messages, Send } from "./chat.rpc";

export const messages = stream(Messages, {                                       // renamed: stream(rpc, policy)
  key: ["roomId"],
  resume: "after",                                                               // NEW: payload field Flow refills on reconnect
  delivers: "every",                                                             // existing (merge 6)
  signals: (e) => (e._tag === "Hello" ? (e.resumed ? Signal.resumed() : Signal.gap()) : undefined), // NEW
});
export const send = transaction(Send, { key: ["roomId", "localId"], concurrency: "reject" });

// Every contract built from ChatRpcs is implemented by one RpcClient. attempt.id travels as a header;
// RpcClientError on a write becomes unknown; on the stream it becomes down, then Flow resubscribes with `after`.
export const ChatLive = FlowRpc.layer(ChatRpcs).pipe(                            // NEW: FlowRpc.layer
  Layer.provide(RpcClient.layerProtocolSocket({ retryTransientErrors: true })),  // existing
  Layer.provide(Socket.layerWebSocket("wss://chat.example.com/rpc")),            // existing
  Layer.provide(RpcSerialization.layerNdjson),                                   // existing
);
```

```ts
// board/board.rpc.ts, board.operations.ts, board.live.ts
import { Effect, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { asc, domain, entity, eq, read, resource, transaction, write } from "flow-state";
import { FlowRpc } from "flow-state/rpc";
import { CardPage, CardRow, StaleCard, Supabase } from "./supabase";

export const BoardCards = Rpc.make("Board/cards", { payload: { boardId: Schema.String }, success: CardPage });
export const MoveCard = Rpc.make("Board/move-card", {
  payload: { cardId: Schema.String, column: Schema.String, position: Schema.Number, revision: Schema.Number },
  success: CardRow,
  error: StaleCard,
});
export const BoardRpcs = RpcGroup.make(BoardCards, MoveCard);

export const boardCards = resource(BoardCards, { key: ["boardId"], staleTime: "30 seconds", gcTime: "5 minutes", persist: true });
export const moveCard = transaction(MoveCard, { concurrency: "serialize" });     // key: entity primary key (OD4)

export const BoardLive = FlowRpc.local(BoardRpcs, {
  "Board/cards": ({ boardId }) =>
    Supabase.use((sb) => Effect.promise(() => sb.from("cards").select("*").eq("boardId", boardId)))
      .pipe(Effect.flatMap(({ data }) => Schema.decodeUnknownEffect(CardPage)({ cards: data }).pipe(Effect.orDie))),
  "Board/move-card": (payload, { attempt }) =>
    Supabase.use((sb) => Effect.promise(() =>
      sb.from("cards")
        .update({ column: payload.column, position: payload.position, revision: payload.revision + 1, lastAttempt: attempt.id })
        .eq("cardId", payload.cardId).eq("revision", payload.revision).select().maybeSingle(),
    )).pipe(Effect.flatMap(({ data }) => (data ? Schema.decodeUnknownEffect(CardRow)(data).pipe(Effect.orDie)
                                               : Effect.fail(new StaleCard())))),
});

export const Card = entity({ id: "Board/Card", fields: CardRow.fields, primaryKey: ["cardId"], version: "revision" });
export const BoardDomain = domain("board", {
  cards: read(boardCards)
    .list(Card, ({ success }) => success.cards)                                  // renamed: result → success
    .where(({ payload, record }) => eq(record.boardId, payload.boardId))         // renamed: input → payload
    .orderBy(({ record }) => [asc(record.position), asc(record.cardId)]),
  move: write(moveCard)
    .one(Card)
    .predicts(({ payload }) => Card.patch({ cardId: payload.cardId }, { column: payload.column, position: payload.position })),
});
```

**Added:** `transaction(rpc, policy)`, `resource(rpc, policy)`, `stream(rpc, policy)`; `FlowRpc.layer`,
`FlowRpc.local`; `resume`; `signals`; `Signal`. **Dropped:** `id` (the Rpc tag), `input`, `result`, `lookup`,
`commit` and `subscribe` closures on the contract, `signal` in the handler context. **Renamed:** `input`/`result` →
`payload`/`success` in domain callbacks.

**Flags.** `FlowRpc.local` is RPC in name only: its handler signature is Flow's `(payload, { attempt })`, not
`Rpc.Handler`'s `{ client, requestId, headers }` (`Rpc.ts:220-232`), because the Rpc handler has no attempt. Routing
Stripe through `RpcTest.makeClient` to get a "real" Rpc handler would fake a server and smuggle `attempt.id` through
headers. Two thirds of these examples use the Rpc layer only as a Schema carrier.

---

## 4. Design B: standalone and shaped like `Rpc.make`, handler inline

**Idea.** Keep Flow's own constructors and today's inline closure, but take `Rpc.make`'s form: the id as the first
argument, a fields record for what goes in, `success` and `error` Schemas declared upfront, and the handler typed
from them. The handler is any Effect.

```ts
// checkout/checkout.operations.ts — AFTER (B)
import { Schema } from "effect";
import { resource, transaction } from "flow-state";
import { AuthFailed, CardDeclined, handleNextAction, PaymentIntent, stripeGet, stripePost } from "./stripe";

export const confirm = transaction("Checkout/confirm", {                         // renamed: id → first argument
  params: { intentId: Schema.String, clientSecret: Schema.String, paymentMethod: Schema.String }, // renamed: input → params
  success: PaymentIntent,                                                        // renamed: result → success (now on writes too)
  error: CardDeclined,                                                           // NEW
  key: ["intentId"],
  concurrency: "reject",
  commit: (params, { attempt }) =>                                               // existing; signal dropped
    stripePost(`/payment_intents/${params.intentId}/confirm`,
      { client_secret: params.clientSecret, payment_method: params.paymentMethod }, attempt.id),
});
export const authenticate = transaction("Checkout/authenticate", {
  params: { clientSecret: Schema.String },
  success: PaymentIntent,
  error: AuthFailed,
  key: ["clientSecret"],
  concurrency: "reject",
  commit: (params) => handleNextAction(params.clientSecret),
});
export const intent = resource("Checkout/intent", {
  params: { intentId: Schema.String, clientSecret: Schema.String },              // NEW on reads: the key now decodes
  success: PaymentIntent,
  key: ["intentId"],
  staleTime: "0 seconds",
  gcTime: "1 minute",
  lookup: (params) => stripeGet(`/payment_intents/${params.intentId}?client_secret=${params.clientSecret}`),
});
```

```ts
// chat/chat.operations.ts — AFTER (B): the Rpc's Schemas are reused by reference
import { Context, Effect, Layer, Stream } from "effect";
import { RpcClient, RpcSerialization, type RpcGroup } from "effect/rpc";
import { Socket } from "effect/socket";
import { Outcome, Signal, stream, transaction } from "flow-state";
import { ChatRpcs, Messages, Send } from "./chat.rpc";

export class ChatClient extends Context.Service<ChatClient, RpcClient.RpcClient<RpcGroup.Rpcs<typeof ChatRpcs>>>()(
  "ChatClient",
) {}
export const messages = stream("Chat/messages", {
  params: Messages.payloadSchema,                                                // existing: payloadSchema
  success: Messages.successSchema,                                               // stream element via RpcSchema.Stream
  key: ["roomId"],
  resume: "after",                                                               // NEW
  delivers: "every",
  subscribe: (params) =>
    Stream.unwrap(ChatClient.use((c) => Effect.succeed(c["Chat/messages"](params)))).pipe(
      Stream.map((e) => (e._tag === "Hello" ? (e.resumed ? Signal.resumed() : Signal.gap()) : e)),
      Stream.catchTag("RpcClientError", () => Stream.make(Signal.down())),       // the author writes this
    ),
});
export const send = transaction("Chat/send", {
  params: Send.payloadSchema,
  success: Send.successSchema,
  error: Send.errorSchema,
  key: ["roomId", "localId"],
  concurrency: "reject",
  commit: (params, { attempt }) =>
    ChatClient.use((c) => c["Chat/send"](params, { headers: { "idempotency-key": attempt.id } })).pipe(
      Effect.catchTag("RpcClientError", () => Outcome.unknown()),                // the author must remember this
    ),
});
export const ChatLive = Layer.effect(ChatClient)(RpcClient.make(ChatRpcs)).pipe(
  Layer.provide(RpcClient.layerProtocolSocket({ retryTransientErrors: true })),
  Layer.provide(Socket.layerWebSocket("wss://chat.example.com/rpc")),
  Layer.provide(RpcSerialization.layerNdjson),
);
```

```ts
// board/board.operations.ts and board.domain.ts — AFTER (B)
import { Effect, Schema } from "effect";
import { asc, domain, entity, eq, read, resource, transaction, write } from "flow-state";
import { CardPage, CardRow, StaleCard, Supabase } from "./supabase";

export const boardCards = resource("Board/cards", {
  params: { boardId: Schema.String },
  success: CardPage,
  key: ["boardId"],
  staleTime: "30 seconds",
  gcTime: "5 minutes",
  persist: true,
  lookup: ({ boardId }) =>
    Supabase.use((sb) => Effect.promise(() => sb.from("cards").select("*").eq("boardId", boardId)))
      .pipe(Effect.flatMap(({ data }) => Schema.decodeUnknownEffect(CardPage)({ cards: data }).pipe(Effect.orDie))),
});
export const moveCard = transaction("Board/move-card", {
  params: { cardId: Schema.String, column: Schema.String, position: Schema.Number, revision: Schema.Number },
  success: CardRow,
  error: StaleCard,
  concurrency: "serialize",                                                      // key: entity primary key (OD4)
  commit: (params, { attempt }) =>
    Supabase.use((sb) => Effect.promise(() =>
      sb.from("cards")
        .update({ column: params.column, position: params.position, revision: params.revision + 1, lastAttempt: attempt.id })
        .eq("cardId", params.cardId).eq("revision", params.revision).select().maybeSingle(),
    )).pipe(Effect.flatMap(({ data }) => (data ? Schema.decodeUnknownEffect(CardRow)(data).pipe(Effect.orDie)
                                               : Effect.fail(new StaleCard())))),
});

export const Card = entity({ id: "Board/Card", fields: CardRow.fields, primaryKey: ["cardId"], version: "revision" });
export const BoardDomain = domain("board", {
  cards: read(boardCards)
    .list(Card, ({ success }) => success.cards)                                  // renamed: result → success
    .where(({ params, record }) => eq(record.boardId, params.boardId))           // renamed: input → params
    .orderBy(({ record }) => [asc(record.position), asc(record.cardId)]),
  move: write(moveCard)
    .one(Card)
    .predicts(({ params }) => Card.patch({ cardId: params.cardId }, { column: params.column, position: params.position })),
});
```

**Added:** `error` on all kinds; `params` and `success` required on all kinds; `resume`; `Signal` values in the
stream. **Dropped:** `id` as a field, `input`, `result`, `signal`. **Renamed:** `input` → `params`, `result` →
`success`.

**Flags.** Nothing faked. But the RPC case repeats `payloadSchema/successSchema/errorSchema` and makes the author
hand-write the two `RpcClientError` mappings that decide correctness (`unknown` on writes, `down` on streams).
Forgetting the write one turns "maybe charged" into an ordinary failure.

---

## 5. Design C: a pure-data contract, implemented by a Layer

**Idea.** Follow Effect's own split. A contract is data, like an `Rpc` (`Rpc.ts:941`) or an `HttpApiEndpoint`: id,
`payload`, `success`, `error` and Flow's policy, **with no closure**. The implementation is a Layer, like
`RpcGroup.toLayer` (`RpcGroup.ts:97`) or `HttpApiBuilder.group`: `contract.toLayer(handler)`, where the handler is any
Effect. An `Rpc` can stand in for the id and Schemas, and `FlowRpc.layer` derives implementations from an
`RpcClient` with the correct error mappings built in. A contract with no implementation in the Runtime's layer is a
**type error** (`Flow.Implementation<"Checkout/confirm">` missing from the requirements), not a runtime surprise.

```ts
// checkout/checkout.contracts.ts — AFTER (C): pure data, imports no SDK
import { Schema } from "effect";
import { resource, transaction } from "flow-state";
import { AuthFailed, CardDeclined, PaymentIntent } from "./stripe.schemas";

export const confirm = transaction("Checkout/confirm", {                         // renamed: id → first argument
  payload: { intentId: Schema.String, clientSecret: Schema.String, paymentMethod: Schema.String }, // renamed: input → payload
  success: PaymentIntent,                                                        // renamed: result → success
  error: CardDeclined,                                                           // NEW
  key: ["intentId"],
  concurrency: "reject",
});                                                                              // dropped: commit closure
export const authenticate = transaction("Checkout/authenticate", {
  payload: { clientSecret: Schema.String },
  success: PaymentIntent,
  error: AuthFailed,
  key: ["clientSecret"],
  concurrency: "reject",
});
export const intent = resource("Checkout/intent", {
  payload: { intentId: Schema.String, clientSecret: Schema.String },
  success: PaymentIntent,
  key: ["intentId"],
  staleTime: "0 seconds",
  gcTime: "1 minute",
});                                                                              // dropped: lookup closure

// checkout/checkout.live.ts — how each contract reaches Stripe
import { Layer } from "effect";
import { handleNextAction, stripeGet, stripePost } from "./stripe";
export const CheckoutLive = Layer.mergeAll(
  confirm.toLayer((payload, { attempt }) =>                                      // NEW: toLayer; existing: attempt
    stripePost(`/payment_intents/${payload.intentId}/confirm`,
      { client_secret: payload.clientSecret, payment_method: payload.paymentMethod }, attempt.id)),
  authenticate.toLayer((payload) => handleNextAction(payload.clientSecret)),
  intent.toLayer((payload) => stripeGet(`/payment_intents/${payload.intentId}?client_secret=${payload.clientSecret}`)),
);
```

```ts
// chat/chat.contracts.ts — AFTER (C): the server's Rpcs supply id and Schemas
import { Layer } from "effect";
import { RpcClient, RpcSerialization } from "effect/rpc";
import { Socket } from "effect/socket";
import { stream, transaction } from "flow-state";
import { FlowRpc, Signal } from "flow-state/rpc";                               // NEW: FlowRpc, Signal
import { Messages, Send } from "./chat.rpc";

export const messages = stream(Messages, {                                       // NEW overload: an Rpc as id + Schemas
  key: ["roomId"],
  resume: "after",                                                               // NEW: optional payload field, outside the key
  delivers: "every",
  signals: (e) => (e._tag === "Hello" ? (e.resumed ? Signal.resumed() : Signal.gap()) : undefined), // NEW
});
export const send = transaction(Send, { key: ["roomId", "localId"], concurrency: "reject" });

// chat/chat.live.ts — one RpcClient implements both. Built in: attempt.id → "idempotency-key" header;
// RpcClientError → unknown on a write (cannot tell not-sent from maybe-sent, RpcClient.ts:775, :1218);
// RpcClientError → down on a stream, then Flow resubscribes with `after` set to its watermark.
export const ChatLive = FlowRpc.layer(messages, send).pipe(                      // NEW: FlowRpc.layer
  Layer.provide(RpcClient.layerProtocolSocket({ retryTransientErrors: true })),
  Layer.provide(Socket.layerWebSocket("wss://chat.example.com/rpc")),
  Layer.provide(RpcSerialization.layerNdjson),
);
```

```ts
// board/board.contracts.ts and board.domain.ts — AFTER (C)
import { Schema } from "effect";
import { asc, domain, entity, eq, read, resource, transaction, write } from "flow-state";
import { CardPage, CardRow, StaleCard } from "./supabase";

export const boardCards = resource("Board/cards", {
  payload: { boardId: Schema.String },
  success: CardPage,
  key: ["boardId"],
  staleTime: "30 seconds",
  gcTime: "5 minutes",
  persist: true,
});
export const moveCard = transaction("Board/move-card", {
  payload: { cardId: Schema.String, column: Schema.String, position: Schema.Number, revision: Schema.Number },
  success: CardRow,
  error: StaleCard,
  concurrency: "serialize",                                                      // key: entity primary key (OD4)
});

export const Card = entity({ id: "Board/Card", fields: CardRow.fields, primaryKey: ["cardId"], version: "revision" });
export const BoardDomain = domain("board", {
  cards: read(boardCards)
    .list(Card, ({ success }) => success.cards)                                  // renamed: result → success
    .where(({ payload, record }) => eq(record.boardId, payload.boardId))         // renamed: input → payload
    .orderBy(({ record }) => [asc(record.position), asc(record.cardId)]),
  move: write(moveCard)
    .one(Card)
    .predicts(({ payload }) => Card.patch({ cardId: payload.cardId }, { column: payload.column, position: payload.position })),
});

// board/board.live.ts — Supabase
import { Effect, Layer, Schema } from "effect";
import { Supabase } from "./supabase";
export const BoardLive = Layer.mergeAll(
  boardCards.toLayer(({ boardId }) =>
    Supabase.use((sb) => Effect.promise(() => sb.from("cards").select("*").eq("boardId", boardId)))
      .pipe(Effect.flatMap(({ data }) => Schema.decodeUnknownEffect(CardPage)({ cards: data }).pipe(Effect.orDie)))),
  moveCard.toLayer((payload, { attempt }) =>
    Supabase.use((sb) => Effect.promise(() =>
      sb.from("cards")
        .update({ column: payload.column, position: payload.position, revision: payload.revision + 1, lastAttempt: attempt.id })
        .eq("cardId", payload.cardId).eq("revision", payload.revision).select().maybeSingle(),
    )).pipe(Effect.flatMap(({ data }) => (data ? Schema.decodeUnknownEffect(CardRow)(data).pipe(Effect.orDie)
                                               : Effect.fail(new StaleCard()))))),
);
```

```ts
// app.ts — the Runtime gets every implementation; a missing one does not type-check (existing: @plan.Runtime.O2)
const live = Layer.mergeAll(CheckoutLive, ChatLive, BoardLive).pipe(
  Layer.provide(Layer.succeed(StripeJs)(await loadStripe(import.meta.env.VITE_STRIPE_PK))),
  Layer.provide(Layer.succeed(Supabase)(createClient(url, anonKey))),
);

// checkout.story.ts — Stories implement the contract, typed by its Schemas; no SDK is loaded
const Declined = confirm.toLayer(() => Effect.fail(new CardDeclined({ message: "Insufficient funds" })));
// chat.story.ts — for an Rpc-backed contract, the real server handlers can run in memory (RpcTest.makeClient)
```

**Added:** `contract.toLayer(handler)`; `transaction/resource/stream(rpc, policy)` overload; `FlowRpc.layer` with
built-in `unknown`/`down` mappings; `error` on all kinds; `payload` and `success` required on all kinds; `resume`;
`signals`; `Signal`. **Dropped:** `id` as a field, `input`, `result`, `lookup`/`commit`/`subscribe` closures on the
contract, `signal` in the handler context. **Renamed:** `input` → `payload`, `result` → `success`.

**Flags.** Nothing faked. Handlers of a read receive `(payload)` only; writes receive `(payload, { attempt, basedOn })`
(`basedOn` existing, EntityDomains O1); streams receive `(payload)` with `resume` already filled in.

### 5.1 Considered and not taken: one description for an RPC server and a REST adapter

oRPC serves one contract over RPC and OpenAPI. Flow could add `Flow.toRpc(contract)` or `Flow.toHttpApi(contract,
path)`. Not proposed: it makes Flow own server wire descriptions, and a server package would then depend on UI
policy (`staleTime`). The direction that keeps "Flow is not a network library" is the reverse: the server owns its
`Rpc` or `HttpApi`, and Flow refers to it. For `HttpApi` servers no Flow adapter is needed: the handler is
`HttpApiClient` called inside `toLayer`, because REST status-to-unknown rules are the app's (a 409 may be final, a 502
is unknown). Only `RpcClient` has one error type whose safe reading is fixed, which is why only RPC gets `FlowRpc`.

---

## 6. What each design gains and loses

| Requirement | Before | A: Rpc values | B: inline, Rpc-shaped | C: data plus Layer |
| --- | --- | --- | --- | --- |
| Transport independence | Yes | **Weak.** Non-RPC sources are described as Rpcs and "served" locally | Yes | Yes |
| One word for what goes in | No (`input` vs hand-typed params) | `payload` | `params` (collides with `HttpApiEndpoint`'s path `params`) | `payload` (as `Rpc.make`) |
| Typed params with a Schema everywhere | Writes only | Yes | Yes | Yes |
| Read keys decode on restore | No | Yes: key Schema = payload pick | Yes | Yes |
| Error Schemas upfront | No | Yes | Yes | Yes |
| `attempt.id`, unknown, concurrency | Yes | Yes; RPC mapping built in | Yes; RPC mapping hand-written | Yes; RPC mapping built in |
| Stream signals and resume outside key | Ad hoc | `resume` field, `signals` | `resume` field, author maps `down` | `resume` field, `signals`, `down` built in for RPC |
| Static analysis (`flow check`, `explain`) | Reads options; closures skipped | Reads Rpc ASTs; error tags listed | Same as A, but importing a contract imports its SDK | **Best.** Contract modules have no closures and no SDK imports, so the CLI loads them without Stripe or Supabase initialising |
| Persistence | Key not decodable for reads | Fixed | Fixed | Fixed |
| SSR | One closure for both Runtimes | Server can run the real handlers in-process | One closure; per-Runtime behaviour needs a service indirection the author writes | A server Runtime provides a different implementation (direct DB) for the same contract |
| Stories fake the transport | Fake the services inside closures | `RpcTest.makeClient` for RPC; replace `local` handlers | Fake the services inside closures | `contract.toLayer(fake)` typed by the contract; `RpcTest` for RPC |
| Effect convention fit | Low | Highest reuse, but stretches Rpc to non-RPC | `Rpc.make`'s shape, TanStack's placement | Effect's definition/implementation split (`RpcGroup.toLayer`, `HttpApiBuilder`) |
| Readability at a glance | One place | Three files per feature | **One place** | Two places: what (contract) and how (live) |
| Agent UX | Fine | "Why is Stripe an Rpc?" | Easy to copy; easy to forget the RPC mappings | Missing implementation is a type error; contract files are small and closed |
| Entity domains | `input`, `result` | `payload`, `success` | `params`, `success` | `payload`, `success` |

**System-wide consequences, whichever design:**

1. **Requiring `payload` on reads changes persistence identity.** Persisted keys become `Schema.encode(payload.pick(key))`;
   renaming or retyping a key field changes stored identity. `flow check` can diff key Schemas between builds.
2. **If a key covers every payload field, a restored entry could refetch on its own.** `Persistence.plan` says
   parameters are never reconstructed from a key; that stays, but the restriction now has a cost to weigh.
3. **Error Schemas let static tools check outcome coverage.** `flow check` can list `CardDeclined | AuthFailed`
   from the Schema AST and report an unmapped tag without TypeScript.
4. **`success` on writes feeds domains.** Domain writes install response fields (EntityDomains O1); a declared
   `success` Schema makes that checkable, and hydration of written records type-safe.
5. **Dropping `signal`** removes a second abort source: Flow interrupts the fiber; `Effect.tryPromise` turns that
   into the `AbortSignal` (`Effect.ts:1513`). Flow still tells its own planned release apart from an
   adapter-reported interrupt, because Flow is the interrupter.
6. **Machines and Stories authoring stay put** (OD2/OD3). Docs and the dispatch-desk reference need the renames.

---

## 7. Recommendation (proposed)

**Proposed: design C.** A contract is data shaped like `Rpc.make` (`payload`, `success`, `error`, plus Flow
policy); its implementation is `contract.toLayer(handler)`, where the handler is any Effect; an `Rpc` may supply the
id and Schemas; `FlowRpc.layer` implements Rpc-backed contracts with the two error mappings correctness needs.

Why, by the project's order:

- **Correctness.** Upfront Schemas for all three kinds close the restore gap. A missing implementation is a type
  error. RPC's ambiguous `RpcClientError` is mapped to `unknown`/`down` by Flow, not by memory.
- **Readability.** One constructor per kind, one word (`payload`) shared with `Rpc.make`, `AtomRpc` and Flow, and
  contract files a reader can scan without SDK noise. The cost is that "how" lives in a second file.
- **Agent UX.** Contracts are small and closed; implementation and fakes have one typed seam.
- **Generality.** Stripe (`fetch`), stripe.js, Supabase, raw WebSocket and Effect RPC all go through the same
  `toLayer`. Only RPC gets a helper, because only RPC's error meaning is fixed.

**The main trade-off:** C gives up B's locality (contract and handler in one place) for Effect's split, which buys a
closure-free static surface, per-Runtime implementations (SSR), typed fakes, and a compile-time check that every
contract is implemented. If the owner values one-place reading over those, B is the honest alternative; A is not
recommended because it describes non-RPC sources as RPC.

### Questions

Answer as `Q1 A`. Each lists the options, a before/after where it helps, and a recommendation.

**Round 1: shape**

- **Q1. Which design?** A: Rpc values plus policy. B: Rpc-shaped, handler inline. C: data contract plus
  `toLayer`. **Recommended: C.**
- **Q2. The word for what goes in.** A: `payload`, as `Rpc.make` and `AtomRpc` (`HttpApiEndpoint` also uses it, for
  the body). B: `params`, as `Operations.plan` today; it collides with `HttpApiEndpoint`'s path `params`.
  **Recommended: A.**
  `// before: input: Schema.Struct({ cardId })   // after A: payload: { cardId }   // after B: params: { cardId }`
- **Q3. Where the implementation is attached.** A: `contract.toLayer(handler)`, one Layer per contract, merged
  with `Layer.mergeAll`. B: a group, `Flow.group(confirm, intent).toLayer({ confirm, intent })`, as `RpcGroup.toLayer`.
  **Recommended: A.** A group is a second concept with no policy of its own; per-contract Layers merge with
  standard Effect.

**Round 2: the contract's fields**

- **Q4. Is `success` required on every kind?** A: yes, all three. B: only where data crosses persistence, SSR or a
  domain (today's O1 rule). **Recommended: A.** It is a standard upfront contract and it is the restore and
  hydration fix; `Schema.Unknown` remains an explicit opt-out.
- **Q5. Is `error` a required-upfront Schema?** A: yes, defaulting to `Never` as `Rpc.make` does; a handler error
  outside it is a type error, and the author maps it or lets it die. B: inferred from the handler.
  **Recommended: A.** It is what lets `flow check` list failure tags without types.
- **Q6. The key when omitted.** A: resources and streams default to every payload field except `resume`; writes
  default to the entity primary key in a domain (OD4) and are otherwise required. B: `{}` for all (O1 today).
  C: always required. **Recommended: A.** `{}` silently shares one entry across different payloads, which is wrong
  data; for writes a silent single lane is a concurrency surprise.
- **Q7. Drop `signal` from the handler context.** A: drop; `Effect.tryPromise((signal) => …)` already supplies it.
  B: keep both. **Recommended: A.**

**Round 3: the RPC bridge and streams**

- **Q8. May an `Rpc` stand in for id and Schemas?** A: yes, an overload `transaction(Send, policy)`. B: no; spread
  `payload: Send.payloadSchema` and the rest by hand. C: not at all. **Recommended: A.** It removes the duplicated
  Schemas without inventing a new contract form. Rpc payloads must be Structs so the key can be picked; a non-Struct
  payload is a type error.
- **Q9. `FlowRpc.layer`'s built-in mappings.** A: `attempt.id` as an `idempotency-key` header; `RpcClientError` →
  `unknown` on writes, typed failure on reads, `down` then resubscribe on streams. B: none; the author maps.
  **Recommended: A.** These are the only safe readings of `RpcClient.ts:775-780` and `:1218-1222`. The header name
  needs its own decision (Q11).
- **Q10. The resume parameter.** A: an optional payload field named by `resume`, excluded from the key, refilled by
  Flow from its watermark (tRPC's `lastEventId` is prior art). B: a separate handler argument. **Recommended: A.**
  An RPC or HTTP server sees only the payload, and the field decodes on restore.
- **Q11. The idempotency header for RPC.** A: fixed `idempotency-key`. B: configurable on `FlowRpc.layer`.
  C: carried in the payload by the author. **Recommended: B, defaulting to `idempotency-key`.**

**Deferred, for `revisit.md` if the owner agrees:** `Flow.toRpc` / `Flow.toHttpApi` (section 5.1); reconstructing
parameters from full-coverage keys on restore (section 6, item 2); a `FlowHttpApi` helper if a fixed status-to-unknown
rule ever emerges.
