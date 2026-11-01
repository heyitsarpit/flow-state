// A11: every sample as an author writes it. Real Effect 4.0.5 and Schema; stand-in Feed and stream; declared vendor stubs. No explicit generics, no `any`.
import { Context, Effect, Layer, Option, Schema, Stream } from "effect"
import { Socket } from "effect/socket"
import { Feed, stream, type Signal } from "./vocab"
export const Cursor = Schema.Struct({ epoch: Schema.Int, seq: Schema.Int }); type Cursor = typeof Cursor.Type
export const Message = Schema.Struct({ id: Schema.String, cursor: Cursor, text: Schema.String }); type Message = typeof Message.Type
class ChatDropped extends Schema.TaggedError<ChatDropped>()("ChatDropped", { code: Schema.Number }) {}
class SignedOut extends Schema.TaggedError<SignedOut>()("SignedOut", {}) {}
type Frame = { t: "hello"; replayedFrom?: Cursor; head: Cursor } | { t: "reset"; start: Cursor } | { t: "ping" } | { t: "msg"; message: Message }
declare const decodeFrame: (t: unknown) => Frame
declare const sameCursor: (a: Cursor | undefined, b: Cursor | undefined) => boolean
declare const show: (c: Cursor | undefined) => string
declare const roomUrl: (r: string, f: Cursor | undefined) => string
declare const fetchPage: (r: string, c: Cursor | undefined, s: AbortSignal) => Effect.Effect<{ messages: Message[]; next: Cursor; complete: boolean; truncated: boolean; oldest: Cursor; head: Cursor }, ChatDropped>

export class ChatSocket extends Context.Service<ChatSocket, {
  readonly room: (roomId: string, from: Cursor | undefined) => Stream.Stream<Message | Signal, ChatDropped | SignedOut>
}>()("app/ChatSocket") {
  static readonly layer = Layer.effect(ChatSocket, Effect.gen(function* () {
    const open = yield* Socket.WebSocketConstructor
    return { room: (roomId, from) => Feed.callback<Message, ChatDropped | SignedOut>((emit) => Effect.gen(function* () {
      const ws = open(roomUrl(roomId, from))
      ws.addEventListener("message", (e) => {
        const f = decodeFrame((e as { data?: unknown }).data)
        if (f.t === "hello") void emit(f.replayedFrom && sameCursor(f.replayedFrom, from) ? Feed.live({ proof: `server replayed from ${show(from)}` }) : Feed.live({ head: f.head }))
        else if (f.t === "reset") void emit(Feed.live({ restartAt: f.start }))
        else if (f.t === "ping") void emit(Feed.ping)
        else void emit(f.message)
      })
      ws.addEventListener("close", (e) => { const code = (e as { code?: number }).code ?? 1006; emit.fail(code === 4401 ? new SignedOut() : new ChatDropped({ code })) })
      yield* Effect.addFinalizer(() => Effect.sync(() => ws.close()))
    })) }
  }))
}
export const chat = stream({
  id: "Chat.messages", input: { roomId: Schema.String }, output: Message, key: ["roomId"], delivers: "every", position: "cursor",
  subscribe: ({ roomId }, { from }) => Effect.map(ChatSocket, (chat) => chat.room(roomId, from)).pipe(Stream.unwrap),
  catchUp: ({ roomId }, { from, next, signal }) => fetchPage(roomId, next ?? from, signal).pipe(Effect.map((p) =>
    p.truncated ? Feed.gone({ reason: `history starts at ${show(p.oldest)}`, items: p.messages, next: p.next })
    : p.complete ? Feed.done({ items: p.messages, proof: "server: complete", through: p.head })
    : Feed.more({ items: p.messages, next: p.next, through: p.next }))),
  reconnect: { while: (e) => e._tag === "ChatDropped" }, idleTime: "45 seconds",
})
// from-now desk log
declare const frames: (w: string, f: Cursor | undefined) => Stream.Stream<Frame, ChatDropped>
declare const eventsPage: (w: string, c: Cursor | undefined, s: AbortSignal) => Effect.Effect<{ messages: Message[]; next: Cursor; complete: boolean; head: Cursor }, ChatDropped>
export const desk = stream({ id: "d", input: { w: Schema.String }, output: Message, key: ["w"], delivers: "every", position: "cursor",
  subscribe: ({ w }, { from }) => frames(w, from).pipe(Stream.map((f) =>
    f.t === "hello" ? (f.replayedFrom && sameCursor(f.replayedFrom, from) ? Feed.live({ proof: "server replayed" }) : Feed.live({ head: f.head }))
    : f.t === "reset" ? Feed.live({ restartAt: f.start })
    : f.t === "ping" ? Feed.ping
    : f.message)),
  catchUp: ({ w }, { from, next, signal }) => from === undefined ? Effect.succeed(Feed.done({ items: [], proof: "nothing before now" }))
    : eventsPage(w, next ?? from, signal).pipe(Effect.map((p) => p.complete ? Feed.done({ items: p.messages, proof: "server: complete", through: p.head }) : Feed.more({ items: p.messages, next: p.next, through: p.next }))),
  reconnect: { while: (e) => e._tag === "ChatDropped" }, idleTime: "45 seconds",
})

// presence, a latest fold
const Members = Schema.Record(Schema.String, Schema.String); type Members = typeof Members.Type
type PFrame = { t: "ping" } | { t: "presence_state"; members: Members } | { t: "presence_diff"; joins: Members; leaves: string[] }
declare const pframes: (r: string) => Stream.Stream<PFrame, ChatDropped>
declare const applyDiff: (a: Members, f: PFrame) => Members
export const presence = stream({ id: "p", input: { roomId: Schema.String }, output: Members, key: ["roomId"], delivers: "latest",
  subscribe: ({ roomId }) => pframes(roomId).pipe(
    Stream.mapAccum((): Members | undefined => undefined, (acc, f) =>
      f.t === "ping" ? [acc, [Feed.ping]] as const
      : f.t === "presence_state" ? [f.members, [f.members]] as const
      : acc === undefined ? [acc, []] as const
      : [applyDiff(acc, f), [applyDiff(acc, f)]] as const)),
  reconnect: { while: (e) => e._tag === "ChatDropped" }, idleTime: "45 seconds",
})

// polling
const Ev = Schema.Struct({ id: Schema.String, cursor: Schema.String }); type Ev = typeof Ev.Type
class PollFailed extends Schema.TaggedError<PollFailed>()("PollFailed", {}) {}
declare const progress: (t: string, c: string) => Effect.Effect<{ events: Ev[]; cursor: string }, PollFailed>
export const poll = stream({ id: "q", input: { t: Schema.String }, output: Ev, key: ["t"], delivers: "every", position: "cursor",
  subscribe: ({ t }, { from }) => Stream.paginate({ cursor: from ?? "0", first: true }, ({ cursor, first }) => progress(t, cursor).pipe(
    Effect.map((b) => [
      [...(first ? [Feed.live({ head: b.cursor })] : []), ...(b.events.length ? b.events : [Feed.ping])],
      Option.some({ cursor: b.cursor, first: false }),
    ] as const), Effect.delay("1 second"))),
  reconnect: { while: (e) => e._tag === "PollFailed" }, idleTime: "30 seconds",
})

// streaming fetch
class BodyDropped extends Schema.TaggedError<BodyDropped>()("BodyDropped", {}) {}
const Row = Schema.Struct({ seq: Schema.Number }); type Row = typeof Row.Type
declare const decodeRow: (l: string) => Row
export const body = stream({ id: "f", input: { feedId: Schema.String }, output: Row, key: ["feedId"], delivers: "every", position: "seq",
  subscribe: ({ feedId }, { from, signal }) => Stream.unwrap(Effect.gen(function* () {
    const res = yield* Effect.tryPromise({ try: () => fetch(`/f/${feedId}?after=${from}`, { signal }), catch: () => new BodyDropped() })
    if (res.status === 401) return yield* new SignedOut()
    if (!res.ok) return yield* new BodyDropped()
    const hello = res.headers.get("x-replayed-from") === String(from) ? Feed.live({ proof: "server replayed" }) : Feed.live()
    return Stream.fromReadableStream({ evaluate: () => res.body!, onError: () => new BodyDropped() }).pipe(Stream.decodeText(), Stream.splitLines,
      Stream.map((l) => l === "" ? Feed.ping : decodeRow(l)), Stream.prepend([hello]))
  })),
  reconnect: { while: (e) => e._tag === "BodyDropped" }, idleTime: "30 seconds",
})

// callback SDKs with declared vendor stubs
declare const sio: { socket(r: string): { recovered: boolean; on(e: "connect", f: () => void): void; on(e: "disconnect", f: (why: string) => void): void; on(e: "chat", f: (m: Message) => void): void; disconnect(): void; io: { on(e: "reconnect_failed", f: () => void): void } } }
class Rejected extends Schema.TaggedError<Rejected>()("Rejected", { why: Schema.String }) {}
class SioDropped extends Schema.TaggedError<SioDropped>()("SioDropped", {}) {}
export const socketio = stream({ id: "s", input: { room: Schema.String }, output: Message, key: ["room"], delivers: "every",
  subscribe: ({ room }) => Feed.callback<Message, Rejected | SioDropped>((emit) => Effect.gen(function* () {
    const s = sio.socket(room)
    s.on("connect", () => void emit(s.recovered ? Feed.live({ proof: "socket.io recovered" }) : Feed.live()))
    s.on("disconnect", (why) => why === "io server disconnect" ? emit.fail(new Rejected({ why })) : void emit(Feed.down({ why })))
    s.io.on("reconnect_failed", () => emit.fail(new SioDropped()))
    s.on("chat", (m) => void emit(m))
    yield* Effect.addFinalizer(() => Effect.sync(() => s.disconnect()))
  })) })
declare const onSnapshot: (id: string, next: (s: { fromCache: boolean; data: Members }) => void, err: (e: { code: string }) => void) => () => void
class NoAccess extends Schema.TaggedError<NoAccess>()("NoAccess", {}) {}
class ListenError extends Schema.TaggedError<ListenError>()("ListenError", { code: Schema.String }) {}
export const firestore = stream({ id: "fs", input: { docId: Schema.String }, output: Members, key: ["docId"], delivers: "latest",
  subscribe: ({ docId }) => Feed.callback<Members, NoAccess | ListenError>((emit) => Effect.gen(function* () {
    let cached = false
    const off = onSnapshot(docId, (snap) => {
      if (snap.fromCache) { cached = true; void emit(Feed.down("served from cache")) } else if (cached) { cached = false; void emit(Feed.live()) }
      void emit(snap.data)
    }, (err) => emit.fail(err.code === "permission-denied" ? new NoAccess() : new ListenError({ code: err.code })))
    yield* Effect.addFinalizer(() => Effect.sync(off))
  })) })
// newest-first: annotate catchUp's context to name a richer next
type Walk = { page: string; head: Cursor }
declare const hist: (n: string, from: Cursor | undefined, page: string | undefined, s: AbortSignal) => Effect.Effect<{ items: Message[]; hasNext: boolean; next: string; reachedRetention: boolean; firstSerial: Cursor | undefined }, ChatDropped>
export const ably = stream({ id: "a", input: { name: Schema.String }, output: Message, key: ["name"], delivers: "every", position: "cursor",
  subscribe: () => Stream.empty,
  catchUp: ({ name }, { from, next, signal }: { from: Cursor | undefined; next: Walk | undefined; signal: AbortSignal }) => hist(name, from, next?.page, signal).pipe(Effect.map((p) => {
    const head = next?.head ?? p.firstSerial
    const items = [...p.items].reverse()
    return p.reachedRetention ? Feed.gone({ reason: "past retention", items, through: head })
      : p.hasNext && head ? Feed.more({ items, next: { page: p.next, head } })
      : Feed.done({ items, proof: "walked back to from", through: head })
  })) })

// limit-style endpoint: done only with overlap, else gone
declare const latest50: (r: string, s: AbortSignal) => Effect.Effect<{ messages: Message[]; head: Cursor }, ChatDropped>
export const limit = stream({ id: "l", input: { roomId: Schema.String }, output: Message, key: ["roomId"], delivers: "every", position: "cursor",
  subscribe: () => Stream.empty,
  catchUp: ({ roomId }, { from, signal }) => latest50(roomId, signal).pipe(Effect.map((p) =>
    from === undefined ? Feed.done({ items: p.messages, proof: "first load: newest 50", through: p.head })
    : p.messages.some((m) => sameCursor(m.cursor, from)) ? Feed.done({ items: p.messages, proof: "page overlaps the bookmark", through: p.head })
    : Feed.gone({ reason: "more than 50 since the bookmark", items: p.messages, through: p.head }))),
  reconnect: { while: (e) => e._tag === "ChatDropped" }, idleTime: "45 seconds",
})
// @ts-expect-error done needs its proof
Feed.done({ items: [1], through: 1 })
// fills: checked where memory is known
type Emptiable = ReadonlyArray<unknown> | string | number | boolean | undefined | { readonly [k: string]: unknown } & { readonly __record?: never }
type FillsField<M> = { [K in keyof M]: M[K] extends ReadonlyArray<unknown> | number ? K : M[K] extends Record<string, infer _V> ? (string extends keyof M[K] ? K : never) : never }[keyof M]
declare function definition<F extends Schema.Struct.Fields>(d: { memory: F; operations: Record<string, { fills: FillsField<Schema.Struct.Type<F>> | false }> }): void
const Mem = { roomId: Schema.String, messages: Schema.Array(Message), room: Schema.Struct({ a: Schema.Number }), byRoom: Schema.Record(Schema.String, Schema.Array(Message)) }
definition({ memory: Mem, operations: { a: { fills: "messages" }, b: { fills: "byRoom" }, c: { fills: false } } })
// @ts-expect-error a misspelling does not compile
definition({ memory: Mem, operations: { a: { fills: "mesages" } } })
// @ts-expect-error a closed struct has no emptiness
definition({ memory: Mem, operations: { a: { fills: "room" } } })

// @ts-expect-error a string field is not fillable
definition({ memory: Mem, operations: { a: { fills: "roomId" } } })
