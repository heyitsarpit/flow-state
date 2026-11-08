// Phase 1, streams. `Lab/Room`: an `every` feed whose input has a key field and a non-key field (rule 68, S11). `Lab/Ticker`: 2.11.12.3,
// `latest` under `subscribe.each` over one app-wide browser WebSocket through `Feed.multiplex` (STREAMS-QUESTIONS Q1 B), persisted; one hub per
// page load, as a browser's module state is. `Lab/Price`: a plain `latest` feed for T5's `down` rows. `Lab/Mirror`: two operations on one contract
// and key, with no `backoff` (2.11.10's default). `Lab/Notes`: 2.11.12.8's EventSource recipe, over a browser-shaped `EventSource` the fake plays.
import { Effect, Schema } from "effect";
import type { Api } from "../fake-world.ts";
import { feedCallback } from "../fixtures/compiled.ts";
import { feedMultiplex } from "../fixtures/multiplex.ts";
import { definition, Flow, machine } from "../compile/index.ts";
import { fixture } from "./lab.ts";

const S = Schema;
const U = S.Unknown;
type Msg = { readonly id: string };
const upsert = (list: readonly unknown[], e: unknown) =>
  list.some((x) => (x as Msg).id === (e as Msg).id) ? list.map((x) => ((x as Msg).id === (e as Msg).id ? e : x)) : [...list, e];

const room = (api: Api) =>
  machine(
    definition({
      id: "Lab/Room",
      persist: true,
      states: ["OPEN", "CLOSED"],
      events: { Retarget: { roomId: U }, Switch: { roomId: U }, SetLang: { lang: U }, Break: {}, Off: {}, Leave: {}, Open: {} },
      internalEvents: { Message: { message: U }, Missed: {}, Ended: { why: U } },
      memory: {
        roomId: Flow.initial(U, "r1"),
        lang: Flow.initial(U, "en"),
        messages: Flow.initial(S.Array(U), []),
        notices: Flow.initial(S.Number, 0),
        ended: Flow.initial(U, ""),
        broken: Flow.initial(S.Boolean, false),
        off: Flow.initial(S.Boolean, false),
      },
      uses: ["sessions"],
      operations: () => ({}),
      streams: ({ E }) => ({
        messages: {
          id: "messages",
          key: (i: { readonly roomId: unknown }) => ({ roomId: i.roomId }),
          position: "cursor",
          fills: "messages",
          reconnect: true,
          idleMs: 45_000,
          healthyMs: 60_000,
          backoff: () => 1000,
          subscribe: (i: unknown, { from }: { readonly from: unknown }) => api.socket("messages", i, from),
          value: E.Message.from((m, { input }) => ({ message: { ...(m as object), lang: (input as { readonly lang: unknown }).lang } })),
          missed: E.Missed.from(() => ({})),
          failure: E.Ended.from((v) => ({ why: (v as { readonly why?: unknown }).why })),
          reconnectWhile: () => true,
        },
      }),
    }),
    ({ S: St }) => ({
      default: St.OPEN,
      on: {
        Retarget: { updateMemory: ({ event }) => ({ roomId: event.roomId }) },
        Switch: { updateMemory: ({ event }) => ({ roomId: event.roomId, messages: [] }) },
        SetLang: { updateMemory: ({ event }) => ({ lang: event.lang }) },
        Break: { updateMemory: () => ({ broken: true }) },
        Off: { updateMemory: () => ({ off: true }) },
        Leave: St.CLOSED,
        Open: St.OPEN,
        Message: {},
        Missed: {},
        Ended: { updateMemory: ({ event }) => ({ ended: event.why }) },
      },
      states: {
        OPEN: {
          on: {
            Message: { updateMemory: ({ memory, event }) => ({ messages: upsert(memory.messages, event.message) }) },
            Missed: { updateMemory: ({ memory }) => ({ notices: memory.notices + 1 }) },
          },
          activities: [
            {
              op: "messages",
              input: ({ memory }) => {
                if (memory.broken) throw new Error("select");
                return memory.off ? undefined : { roomId: memory.roomId, lang: memory.lang };
              },
            },
          ],
        },
      },
    }),
  );
export const roomFixture = fixture(room);

// 2.11.12.3's protocol over one browser WebSocket, as STREAMS-QUESTIONS Q1's AFTER: the app parses frames and routes them; the hub does the rest.
type Quote = { readonly symbol: string; readonly price: number };
type Frame =
  | { readonly t: "ping" }
  | { readonly t: "subscribed"; readonly symbol: string }
  | { readonly t: "quote"; readonly quote: Quote }
  | { readonly t: "error"; readonly symbol: string; readonly code: string };
const marketFeed = (api: Api) =>
  Effect.runSync(
    feedMultiplex<string, Quote, { readonly _tag: string }>({
      connect: (emit) =>
        Effect.gen(function* () {
          const ws = api.webSocket("market", "wss://market.example/v1");
          ws.addEventListener("message", (e: { readonly data: string }) => {
            const f = JSON.parse(e.data) as Frame;
            if (f.t === "ping") emit.all({ _feed: "ping" });
            else if (f.t === "subscribed") emit.to(f.symbol, { _feed: "live" });
            else if (f.t === "error") emit.fail({ _tag: f.code }, f.symbol);
            else emit.to(f.quote.symbol, f.quote);
          });
          ws.addEventListener("close", () => emit.fail({ _tag: "MarketDropped" }));
          yield* Effect.addFinalizer(() => Effect.sync(() => ws.close()));
          yield* Effect.callback<void>((resume) => {
            if (ws.readyState === 1) resume(Effect.void);
            else ws.addEventListener("open", () => resume(Effect.void));
          });
          return {
            add: (symbol) => Effect.sync(() => ws.send(JSON.stringify({ op: "subscribe", symbol }))),
            remove: (symbol) => Effect.sync(() => ws.send(JSON.stringify({ op: "unsubscribe", symbol }))),
          };
        }),
    }),
  );
const ticker = (api: Api) => {
  let page: { readonly n: number; readonly hub: ReturnType<typeof marketFeed> } | undefined;
  const hubOf = () => {
    if (page?.n !== api.page()) page = { n: api.page(), hub: marketFeed(api) };
    return page.hub;
  };
  return machine(
    definition({
      id: "Lab/Ticker",
      persist: true,
      states: ["WATCHING"],
      events: { Watch: { symbol: U }, Unwatch: { symbol: U }, RetryQuote: { symbol: U } },
      internalEvents: { Quoted: { symbol: U, price: U }, QuoteEnded: { symbol: U } },
      memory: {
        watchlist: Flow.initial(S.Array(U), ["A", "B", "A"]),
        ended: Flow.initial(S.Array(U), []),
        quotes: Flow.initial(S.Array(U), []),
      },
      uses: ["sessions"],
      operations: () => ({}),
      streams: ({ E }) => ({
        quote: {
          id: "quote",
          delivers: "latest",
          key: (i: { readonly symbol: unknown }) => ({ symbol: i.symbol }),
          reconnect: true,
          idleMs: 25_000,
          healthyMs: 60_000,
          subscribe: (i: { readonly symbol: string }) => hubOf().stream(i.symbol),
          value: E.Quoted.from((q, { key }) => ({ symbol: (key as { readonly symbol: unknown }).symbol, price: (q as { readonly price: unknown }).price })),
          missed: E.QuoteEnded.from((_m, { key }) => ({ symbol: (key as { readonly symbol: unknown }).symbol })),
          failure: E.QuoteEnded.from((_e, { key }) => ({ symbol: (key as { readonly symbol: unknown }).symbol })),
          reconnectWhile: (e: { readonly _tag?: string } | undefined) => e?._tag === "MarketDropped",
        },
      }),
    }),
    ({ S: St }) => ({
      default: St.WATCHING,
      on: {
        Watch: { updateMemory: ({ memory, event }) => ({ watchlist: [...memory.watchlist, event.symbol] }) },
        Unwatch: { updateMemory: ({ memory, event }) => ({ watchlist: memory.watchlist.filter((s) => s !== event.symbol) }) },
        RetryQuote: { updateMemory: ({ memory, event }) => ({ ended: memory.ended.filter((s) => s !== event.symbol) }) },
        Quoted: { updateMemory: ({ memory, event }) => ({ quotes: [...memory.quotes, `${String(event.symbol)}:${String(event.price)}`] }) },
        QuoteEnded: { updateMemory: ({ memory, event }) => ({ ended: [...memory.ended, event.symbol] }) },
      },
      states: {
        WATCHING: {
          activities: [
            {
              op: "quote",
              each: true,
              input: ({ memory }) => memory.watchlist.filter((s) => !memory.ended.includes(s)).map((symbol) => ({ symbol })),
            },
          ],
        },
      },
    }),
  );
};
export const tickerFixture = fixture(ticker);

// T5's rows a multiplexed protocol never says (`down`, a proof): one `latest` feed over a plain socket.
const price = (api: Api) =>
  machine(
    definition({
      id: "Lab/Price",
      persist: true,
      states: ["WATCHING"],
      events: {},
      internalEvents: { Priced: { price: U }, PriceEnded: {} },
      memory: { prices: Flow.initial(S.Array(U), []) },
      uses: ["sessions"],
      operations: () => ({}),
      streams: ({ E }) => ({
        price: {
          id: "price",
          delivers: "latest",
          key: (i: { readonly symbol: unknown }) => ({ symbol: i.symbol }),
          reconnect: true,
          idleMs: 25_000,
          healthyMs: 60_000,
          backoff: () => 1000,
          subscribe: (i: unknown) => api.socket("price", i, undefined),
          value: E.Priced.from((q) => ({ price: (q as { readonly price: unknown }).price })),
          missed: E.PriceEnded.from(() => ({})),
          failure: E.PriceEnded.from(() => ({})),
        },
      }),
    }),
    ({ S: St }) => ({
      default: St.WATCHING,
      on: {
        Priced: { updateMemory: ({ memory, event }) => ({ prices: [...memory.prices, event.price] }) },
        PriceEnded: {},
      },
      states: { WATCHING: { activities: [{ op: "price", input: () => ({ symbol: "A" }) }] } },
    }),
  );
export const priceFixture = fixture(price);

// Rule 70 (S11): two operations on one stream contract and key are two sessions, each with its own bookmark (rule 71: per operation and key).
// Also 2.11.10's default schedule: neither declares `backoff`.
const mirror = (api: Api) => {
  const common = {
    id: "chat",
    key: (i: { readonly roomId: unknown }) => ({ roomId: i.roomId }),
    position: "cursor",
    reconnect: true,
    idleMs: 45_000,
    healthyMs: 60_000,
  } as const;
  return machine(
    definition({
      id: "Lab/Mirror",
      persist: false,
      states: ["OPEN", "CLOSED"],
      events: { Leave: {} },
      internalEvents: { Got: { op: U, m: U }, Gap: { op: U } },
      memory: { main: Flow.initial(S.Array(U), []), copy: Flow.initial(S.Array(U), []) },
      uses: ["sessions"],
      operations: () => ({}),
      streams: ({ E }) => ({
        main: {
          ...common,
          fills: "main",
          subscribe: (i: unknown, { from }: { readonly from: unknown }) => api.socket("main", i, from),
          value: E.Got.from((m) => ({ op: "main", m })),
          missed: E.Gap.from(() => ({ op: "main" })),
          failure: E.Gap.from(() => ({ op: "main" })),
        },
        copy: {
          ...common,
          fills: "copy",
          subscribe: (i: unknown, { from }: { readonly from: unknown }) => api.socket("copy", i, from),
          value: E.Got.from((m) => ({ op: "copy", m })),
          missed: E.Gap.from(() => ({ op: "copy" })),
          failure: E.Gap.from(() => ({ op: "copy" })),
        },
      }),
    }),
    ({ S: St }) => ({
      default: St.OPEN,
      on: { Leave: St.CLOSED, Got: {}, Gap: {} },
      states: {
        OPEN: {
          on: {
            Got: { updateMemory: ({ memory, event }) => (event.op === "main" ? { main: [...memory.main, event.m] } : { copy: [...memory.copy, event.m] }) },
          },
          activities: [
            { op: "main", input: () => ({ roomId: "r1" }) },
            { op: "copy", input: () => ({ roomId: "r1" }) },
          ],
        },
      },
    }),
  );
};
export const mirrorFixture = fixture(mirror);

type Note = { readonly id: number; readonly text: string };
const notes = (api: Api) =>
  machine(
    definition({
      id: "Lab/Notes",
      persist: true,
      states: ["OPEN"],
      events: {},
      internalEvents: { Note: { note: U }, Missed: {}, Ended: { why: U } },
      memory: { userId: Flow.initial(U, "u1"), notes: Flow.initial(S.Array(U), []), notices: Flow.initial(S.Number, 0), ended: Flow.initial(U, "") },
      uses: ["sessions"],
      operations: () => ({}),
      streams: ({ E }) => ({
        notes: {
          id: "notes",
          key: (i: { readonly userId: unknown }) => ({ userId: i.userId }),
          position: "id",
          fills: "notes",
          reconnect: true,
          idleMs: Infinity,
          healthyMs: 60_000,
          backoff: () => 1000,
          subscribe: (i: unknown, { from }: { readonly from: unknown }) =>
            feedCallback({
              start: (emit) => {
                const es = api.eventSource("notes", i, from);
                let decided = false;
                es.onmessage = (m) => {
                  const note: Note = { id: Number(m.lastEventId), text: (JSON.parse(m.data) as { readonly text: string }).text };
                  if (!decided) {
                    decided = true;
                    emit(from !== undefined && note.id === (from as number) + 1 ? { _feed: "live", proof: `ids contiguous after ${String(from)}` } : { _feed: "live" });
                  }
                  emit(note);
                };
                es.onerror = () => emit.fail({ _tag: "SseDropped" });
                return () => es.close();
              },
            }),
          value: E.Note.from((note) => ({ note })),
          missed: E.Missed.from(() => ({})),
          failure: E.Ended.from((v) => ({ why: (v as { readonly _tag?: unknown })._tag })),
          reconnectWhile: (e: { readonly _tag?: string } | undefined) => e?._tag === "SseDropped",
        },
      }),
    }),
    ({ S: St }) => ({
      default: St.OPEN,
      on: {
        Note: { updateMemory: ({ memory, event }) => ({ notes: upsert(memory.notes, event.note) }) },
        Missed: { updateMemory: ({ memory }) => ({ notices: memory.notices + 1 }) },
        Ended: { updateMemory: ({ event }) => ({ ended: event.why }) },
      },
      states: { OPEN: { activities: [{ op: "notes", input: ({ memory }) => ({ userId: memory.userId }) }] } },
    }),
  );
export const notesFixture = fixture(notes);
