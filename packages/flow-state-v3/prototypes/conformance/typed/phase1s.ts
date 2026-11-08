// Phase 1, streams. `Lab/Room`: an `every` feed whose input has a key field and a non-key field (rule 68, S11). `Lab/Ticker`: 2.11.12.3,
// `latest` under `subscribe.each` over one app-wide socket the scenario fans out (the app's own service, as the design puts it), persisted.
// `Lab/Notes`: 2.11.12.8's EventSource recipe, written over a browser-shaped `EventSource` the fake world plays.
import { Schema } from "effect";
import type { Api } from "../fake-world.ts";
import { feedCallback } from "../fixtures/compiled.ts";
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
      events: { Retarget: { roomId: U }, SetLang: { lang: U }, Break: {}, Leave: {}, Open: {} },
      internalEvents: { Message: { message: U }, Missed: {}, Ended: { why: U } },
      memory: {
        roomId: Flow.initial(U, "r1"),
        lang: Flow.initial(U, "en"),
        messages: Flow.initial(S.Array(U), []),
        notices: Flow.initial(S.Number, 0),
        ended: Flow.initial(U, ""),
        broken: Flow.initial(S.Boolean, false),
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
        SetLang: { updateMemory: ({ event }) => ({ lang: event.lang }) },
        Break: { updateMemory: () => ({ broken: true }) },
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
                return { roomId: memory.roomId, lang: memory.lang };
              },
            },
          ],
        },
      },
    }),
  );
export const roomFixture = fixture(room);

const ticker = (api: Api) =>
  machine(
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
          backoff: () => 1000,
          subscribe: (i: unknown) => api.socket("quote", i, undefined),
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
export const tickerFixture = fixture(ticker);

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
