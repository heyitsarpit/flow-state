// Round 11: `fixtures/chat.compiled.ts`, with the machine in the public API and the streams in `Compiled`'s shape (D209). Chat is 2.11.2's walk in three
// source shapes; Presence is 2.11.12.2's `latest`. The streams read through the fake, so each machine is made per world. `ChatOpts` is a box a scenario
// flips, read when each closure runs, as the hand fixture's are.
import { Effect, Schema, Stream } from "effect";
import type { Api } from "../fake-world.ts";
import type { ChatOpts } from "../fixtures/chat.compiled.ts";
import { definition, deny, Flow, machine, moduleMember } from "./flow.ts";
import { fixture } from "./lab.ts";

export type { ChatOpts } from "../fixtures/chat.compiled.ts";
const S = Schema;
const U = S.Unknown;
type Msg = { readonly id: string };
const upsert = (list: readonly unknown[], e: unknown) =>
  list.some((x) => (x as Msg).id === (e as Msg).id) ? list.map((x) => ((x as Msg).id === (e as Msg).id ? e : x)) : [...list, e];

const chat = (o: ChatOpts) => (api: Api) => {
  const d = definition({
    id: "Lab/Chat",
    states: { OPEN: {}, CLOSED: {}, BANNED: {} },
    events: { Leave: {}, Open: {}, Jump: { at: U }, Refetch: {}, Mute: {}, Unmute: {} },
    internalEvents: { Message: { message: U }, Page: { items: S.Array(U) }, Missed: {}, Ended: { why: U }, Banned: {} },
    memory: {
      roomId: Flow.initial(U, "r1"), messages: Flow.initial(S.Array(U), []), notices: Flow.initial(S.Number, 0), pagesSeen: Flow.initial(S.Number, 0),
      ended: Flow.initial(U, ""), muted: Flow.initial(S.Boolean, false), whenThrows: S.optionalKey(S.Boolean),
    },
    uses: ["sessions"],
    operations: () => ({}),
    streams: ({ E }) => ({
      messages: {
        id: "messages",
        key: (i: { readonly roomId: unknown }) => {
          if (o.odd?.key) throw new Error("key");
          if (o.odd?.keyValue) return o.odd.keyValue as never;
          return { roomId: i.roomId };
        },
        position: "cursor",
        fills: "messages",
        reconnect: o.reconnect ?? true,
        idleMs: 45_000,
        healthyMs: 60_000,
        backoff: (n: number) => {
          if (o.odd?.backoff === "throw") throw new Error("backoff");
          if (o.odd?.backoff !== undefined) return o.odd.backoff as number;
          return Math.min(30_000, 1000 * 2 ** n);
        },
        subscribe: (i: unknown, { from }: { readonly from: unknown }) => {
          if (o.odd?.subscribe) throw new Error("subscribe");
          if (o.dies) return Stream.die("a stream died");
          return o.source === "pulled" ? api.pulled("messages", i, from) : o.source === "callback" ? api.feed("messages", i, from, o.bound ?? 4) : api.socket("messages", i, from);
        },
        value: E.Message.from((message) => ({ message })),
        missed: E.Missed.from(() => ({})),
        failure: E.Ended.from((v) => ({ why: (v as { readonly why?: unknown }).why })),
        failureBy: { Banned: E.Banned.from(() => ({})) },
        reconnectWhile: (e: { readonly _tag?: string } | undefined) => {
          if (o.odd?.reconnectWhile) throw new Error("reconnectWhile");
          return e?._tag !== "Banned";
        },
        ...(o.bound !== undefined ? { callbackBound: o.bound } : {}),
        ...(o.pages ? { pages: E.Page.from((items) => ({ items: items as readonly unknown[] })) } : {}),
        ...(o.catchUp
          ? {
              catchUp: (i: object, c: { readonly from: unknown; readonly next?: unknown }) => api.call("history", { ...i, from: c.from, next: c.next }) as Effect.Effect<unknown, unknown>,
              pageRetryWhile: (e: { readonly _tag?: string } | undefined) => {
                if (o.odd?.pageRetryWhile) throw new Error("pageRetryWhile");
                return e?._tag === "PageBusy";
              },
            }
          : {}),
      },
    }),
  });
  return machine(d, ({ S: St }) => ({
    default: St.OPEN,
    on: {
      Message: {},
      Page: {},
      Missed: {},
      Ended: { updateMemory: ({ event }) => ({ ended: event.why }) },
      Banned: St.BANNED,
      Leave: St.CLOSED,
      Open: St.OPEN,
      Jump: { actions: [moduleMember<{ readonly roomId: unknown }, { readonly at: unknown }>("messages", "sessions", "bookmark", ({ memory, event }) => ({ input: { roomId: memory.roomId }, at: event.at }))] },
      Refetch: { updateMemory: () => ({ messages: [] }), actions: [moduleMember<{ readonly roomId: unknown }>("messages", "sessions", "refetch", ({ memory }) => ({ input: { roomId: memory.roomId } }))] },
      Mute: { updateMemory: () => ({ muted: true }) },
      Unmute: { updateMemory: () => ({ muted: false }) },
    },
    states: {
      OPEN: {
        on: {
          Message: {
            guard: [({ event }) => ((event.message as Msg).id === "denied" ? deny("Nope") : true)],
            updateMemory: ({ memory, event }) => {
              if ((event.message as Msg).id === "boom") throw new Error("cannot read this");
              return { messages: upsert(memory.messages, event.message) };
            },
          },
          Page: { updateMemory: ({ memory, event }) => ({ messages: event.items.reduce(upsert, memory.messages), pagesSeen: memory.pagesSeen + 1 }) },
          Missed: { updateMemory: ({ memory }) => ({ notices: memory.notices + 1 }) },
        },
        activities: [
          {
            op: "messages",
            input: ({ memory }) => ({ roomId: memory.roomId }),
            when: ({ memory }) => {
              if (memory.whenThrows) throw new Error("when");
              return memory.muted !== true;
            },
          },
        ],
      },
    },
  }));
};
export const chatFixture = (o: ChatOpts = {}) => fixture(chat(o));

// `latest`: 2.11.12.2. The newest value, current only while this connection confirmed it.
const presence = (api: Api) =>
  machine(
    definition({
      id: "Lab/Presence",
      states: { ON: {}, OFF: {} },
      events: { Off: {} },
      internalEvents: { Seen: { who: U }, Ended: {} },
      memory: { seen: Flow.initial(S.Array(U), []) },
      persisted: false,
      uses: ["sessions"],
      operations: () => ({}),
      streams: ({ E }) => ({
        who: {
          id: "who",
          delivers: "latest",
          key: (i: unknown) => i,
          reconnect: true,
          idleMs: 1_000_000,
          healthyMs: 60_000,
          backoff: () => 1000,
          subscribe: (i: unknown, { from }: { readonly from: unknown }) => api.socket("who", i, from),
          value: E.Seen.from((who) => ({ who })),
          missed: E.Ended,
          failure: E.Ended,
        },
      }),
    }),
    ({ S: St }) => ({
      default: St.ON,
      on: { Seen: { updateMemory: ({ memory, event }) => ({ seen: [...memory.seen, event.who] }) }, Ended: {}, Off: St.OFF },
      states: { ON: { activities: [{ op: "who", input: () => ({ room: "r" }) }] } },
    }),
  );
export const presenceFixture = fixture(presence);
