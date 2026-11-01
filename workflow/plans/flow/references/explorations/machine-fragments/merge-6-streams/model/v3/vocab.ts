// S14 spike. Real Effect 4.0.5, Schema. Stand-in stream, Feed. E inferred from subscribe and catchUp, as commit and lookup do.
import { Effect, Option, Schedule, Schema, Scope, Stream, Duration } from "effect"
import { Socket } from "effect/socket"
export type Emit<A, E> = { (x: A | Signal<any>): Promise<void>; fail(e: E): void; end(): void }
declare const K: unique symbol
export type Signal<P = never> = { readonly [K]: P }
type Page<A, N, P> = { items: ReadonlyArray<A>; next?: N; through?: P }
export declare const Feed: {
  callback<A, E = never, R = never>(f: (emit: Emit<A, E>) => Effect.Effect<unknown, E, R | Scope.Scope>): Stream.Stream<A | Signal, E, Exclude<R, Scope.Scope>>
  live(): Signal; live(o: { proof: string }): Signal; live<P>(o: { head: P | undefined }): Signal<P>; live<P>(o: { restartAt: P }): Signal<P>
  down(r: unknown): Signal; ping: Signal
  more<A, N, P = never>(o: { items: ReadonlyArray<A>; next: N; through?: P }): Page<A, N, P>
  done<A, P = never>(o: { items: ReadonlyArray<A>; proof: string; through?: P }): Page<A, never, P>
  gone<A, N = never, P = never>(o: { reason: string; items?: ReadonlyArray<A>; next?: N; through?: P }): Page<A, N, P>
}

type In<F extends Schema.Struct.Fields> = Schema.Struct.Type<F>
type Reconnect<E> = { while?: (e: E) => boolean; schedule?: Schedule.Schedule<any, E, any, any> }
type Contract<A, E> = { outcomes(m: { value: unknown; failure: { [T in (E & { _tag: string })["_tag"]]: unknown } & { Feed: unknown } }): void; _a?: A }
type Base<F extends Schema.Struct.Fields, S extends Schema.Top, Pk extends keyof S["Type"], E, R, N, E2> = {
  id: string; input: F; output: S; key: ReadonlyArray<keyof F>; delivers: "every"; position: Pk
  subscribe: (i: In<F>, c: { from: S["Type"][Pk] | undefined; signal: AbortSignal }) => Stream.Stream<S["Type"] | Signal<S["Type"][Pk]> | Signal, E, R>
  catchUp?: (i: In<F>, c: { from: S["Type"][Pk] | undefined; next: N | undefined; signal: AbortSignal }) => Effect.Effect<Page<S["Type"], N, S["Type"][Pk]>, E2, R>
}
export declare function stream<F extends Schema.Struct.Fields, S extends Schema.Top, Pk extends keyof S["Type"], E, R, N = S["Type"][Pk], E2 = never>(
  c: Base<F, S, Pk, E, R, N, E2> & { reconnect: Reconnect<NoInfer<E | E2>>; idleTime: Duration.Input }): Contract<S["Type"], E | E2>
export declare function stream<F extends Schema.Struct.Fields, S extends Schema.Top, Pk extends keyof S["Type"], E, R, N = S["Type"][Pk], E2 = never>(
  c: Base<F, S, Pk, E, R, N, E2> & { reconnect?: never; idleTime?: never }): Contract<S["Type"], E | E2>

type Plain<F extends Schema.Struct.Fields, S extends Schema.Top, E, R, D> = { id: string; input: F; output: S; key: ReadonlyArray<keyof F>; delivers: D; position?: never; catchUp?: never
  subscribe: (i: In<F>, c: { signal: AbortSignal }) => Stream.Stream<S["Type"] | Signal, E, R> }
export declare function stream<F extends Schema.Struct.Fields, S extends Schema.Top, E, R>(c: Plain<F, S, E, R, "every" | "latest"> & { reconnect: Reconnect<NoInfer<E>>; idleTime: Duration.Input }): Contract<S["Type"], E>
export declare function stream<F extends Schema.Struct.Fields, S extends Schema.Top, E, R>(c: Plain<F, S, E, R, "every" | "latest"> & { reconnect?: never; idleTime?: never }): Contract<S["Type"], E>

const Cursor = Schema.Struct({ epoch: Schema.Int, seq: Schema.Int }); type Cursor = typeof Cursor.Type
const Message = Schema.Struct({ id: Schema.String, cursor: Cursor }); type Message = typeof Message.Type
class ChatDropped extends Schema.TaggedError<ChatDropped>()("ChatDropped", { code: Schema.Number }) {}
class SignedOut extends Schema.TaggedError<SignedOut>()("SignedOut", {}) {}
class HistoryDown extends Schema.TaggedError<HistoryDown>()("HistoryDown", {}) {}
declare const roomUrl: (r: string, f: Cursor | undefined) => string
declare const fetchPage: (r: string, c: Cursor | undefined, s: AbortSignal) => Effect.Effect<{ messages: Message[]; next: Cursor; complete: boolean; head: Cursor }, HistoryDown>
declare const closeCode: (e: unknown) => number

// 1. subscribe, catchUp, reconnect: while infers E, and is a refinement
export const chat = stream({
  id: "c", input: { roomId: Schema.String }, output: Message, key: ["roomId"], delivers: "every", position: "cursor",
  subscribe: ({ roomId }, { from }) => Feed.callback<Message, ChatDropped | SignedOut, Socket.WebSocketConstructor>((emit) => Effect.gen(function* () {
    const open = yield* Socket.WebSocketConstructor
    const ws = open(roomUrl(roomId, from))
    ws.addEventListener("close", (e) => { const code = closeCode(e); emit.fail(code === 4401 ? new SignedOut() : new ChatDropped({ code })) })
    yield* Effect.addFinalizer(() => Effect.sync(() => ws.close()))
  })),
  catchUp: ({ roomId }, { from, next, signal }) => fetchPage(roomId, next ?? from, signal).pipe(Effect.map((p) => p.complete ? Feed.done({ items: p.messages, proof: "server", through: p.head }) : Feed.more({ items: p.messages, next: p.next, through: p.next }))),
  reconnect: { while: (e) => e._tag !== "SignedOut" },
  idleTime: "45 seconds",
})
// failure is exhaustive over subscribe's and catchUp's errors, as on a transaction
chat.outcomes({ value: 1, failure: { ChatDropped: 1, SignedOut: 1, HistoryDown: 1, Feed: 1 } })
// @ts-expect-error SignedOut cannot be forgotten
chat.outcomes({ value: 1, failure: { ChatDropped: 1, HistoryDown: 1, Feed: 1 } })
class Banned extends Schema.TaggedError<Banned>()("Banned", {}) {}
declare const bannedToo: Contract<Message, ChatDropped | Banned>
// @ts-expect-error A9: a new error is a compile error at the map
bannedToo.outcomes({ value: 1, failure: { ChatDropped: 1, Feed: 1 } })

// 2. a written schedule keeps every tag, as Effect.retry's Return does
export const budget = stream({
  id: "b", input: { roomId: Schema.String }, output: Message, key: ["roomId"], delivers: "every", position: "cursor",
  subscribe: () => Feed.callback<Message, ChatDropped | SignedOut>(() => Effect.void),
  reconnect: { while: (e) => e._tag === "ChatDropped", schedule: Schedule.spaced("1 second") }, idleTime: "Infinity",
})
budget.outcomes({ value: 1, failure: { ChatDropped: 1, SignedOut: 1, Feed: 1 } })

// 3. a boolean predicate, not a refinement: every tag stays, harmless
const isDropped = (e: ChatDropped | SignedOut): boolean => e._tag === "ChatDropped"
export const opaque = stream({
  id: "o", input: { roomId: Schema.String }, output: Message, key: ["roomId"], delivers: "every", position: "cursor",
  subscribe: () => Feed.callback<Message, ChatDropped | SignedOut>(() => Effect.void),
  reconnect: { while: isDropped }, idleTime: "45 seconds",
})
opaque.outcomes({ value: 1, failure: { ChatDropped: 1, SignedOut: 1, Feed: 1 } })

// 4. plain Stream: E inferred with no generic at all
declare const frames: (r: string) => Stream.Stream<Message, ChatDropped>
export const plain = stream({
  id: "p", input: { roomId: Schema.String }, output: Message, key: ["roomId"], delivers: "every", position: "cursor",
  subscribe: ({ roomId }) => frames(roomId),
  reconnect: { while: (e) => e._tag === "ChatDropped" }, idleTime: "45 seconds",
})
plain.outcomes({ value: 1, failure: { ChatDropped: 1, Feed: 1 } })

// 5. reconnect BEFORE subscribe: what happens?
export const early = stream({
  id: "e", input: { roomId: Schema.String }, output: Message, key: ["roomId"], delivers: "every", position: "cursor",
  // @ts-expect-error reconnect before subscribe: e is unknown. Loud, and the docs' one rule: subscribe first
  reconnect: { while: (e) => e._tag === "ChatDropped" }, idleTime: "45 seconds",
  subscribe: ({ roomId }) => frames(roomId),
})
// 6. callback with no generic: emit.fail cannot be inferred
export const noGeneric = stream({
  // @ts-expect-error overload reports here
  id: "n", input: { roomId: Schema.String }, output: Message, key: ["roomId"], delivers: "every", position: "cursor",
  // @ts-expect-error callback with no <E>: emit.fail takes never. Loud
  subscribe: () => Feed.callback((emit) => Effect.sync(() => emit.fail(new ChatDropped({ code: 1 })))),
})
// 7. no reconnect: idleTime rejected
// @ts-expect-error overload reports here
stream({ id: "x", input: { r: Schema.String }, output: Message, key: ["r"], delivers: "every", position: "cursor", subscribe: () => Stream.empty,
  // @ts-expect-error idleTime without reconnect
  idleTime: "1 seconds" })
// 8. reconnect without idleTime rejected
// @ts-expect-error
stream({ id: "y", input: { r: Schema.String }, output: Message, key: ["r"], delivers: "every", position: "cursor", subscribe: () => frames("a"), reconnect: { while: () => true } })
// 9. reconnect between subscribe and catchUp: does e see catchUp's errors?
export const middle = stream({
  // @ts-expect-error overload reports here
  id: "m", input: { roomId: Schema.String }, output: Message, key: ["roomId"], delivers: "every", position: "cursor",
  subscribe: ({ roomId }) => frames(roomId),
  // @ts-expect-error reconnect before catchUp: e misses catchUp's errors. Loud. Order: subscribe, catchUp, reconnect
  reconnect: { while: (e) => e._tag === "ChatDropped" }, idleTime: "45 seconds",
  // @ts-expect-error overload reports here
  catchUp: (_i, { from, signal }) => fetchPage("r", from, signal).pipe(Effect.map((p) => Feed.done({ items: p.messages, proof: "x", through: p.head }))),
})
void Option
