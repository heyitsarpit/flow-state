// Streams beyond the thin spike. Chat is 2.11.2's walk: `every`, `position`, `fills`, `catchUp`, in three source shapes: a pushed socket,
// a pulled source (T4), `Feed.callback`'s bounded queue (T6). Presence is 2.11.12.2's `latest`. A value is { id, cursor }; a frame that
// is already a signal passes through, as an adapter's would.
import { Effect } from "effect";
import type { Api } from "../fake-world.ts";
import type { Fixture } from "../harness.ts";
import { fixtureOf } from "./build.ts";
import type { Compiled, StreamSpec } from "./compiled.ts";

const D = "Lab/Chat";
const f = fixtureOf(D);
const upsert = (list: readonly any[], e: any) =>
  list.some((x) => x.id === e.id) ? list.map((x) => (x.id === e.id ? e : x)) : [...list, e];
export type ChatOpts = {
  source?: "socket" | "pulled" | "callback";
  catchUp?: boolean;
  pages?: boolean;
  reconnect?: boolean;
  bound?: number;
};
const spec = (api: Api, o: ChatOpts): StreamSpec => ({
  id: "messages",
  key: (i) => ({ roomId: i.roomId }),
  position: "cursor",
  fills: "messages",
  reconnect: o.reconnect ?? true,
  idleMs: 45_000,
  healthyMs: 60_000,
  backoff: (n) => Math.min(30_000, 1000 * 2 ** n),
  subscribe: (i, { from }) =>
    o.source === "pulled" || o.source === "callback"
      ? api.pulled("messages", i, from, o.source === "callback" ? (o.bound ?? 4) : undefined)
      : api.socket("messages", i, from),
  value: f.mapped("messages", "value", "Message", (message) => ({ message })),
  missed: f.mapped("messages", "missed", "Missed", (_v) => ({})),
  failure: f.mapped("messages", "failure", "Ended", (v) => ({ why: v.why })),
  failureBy: {
    Banned: f.mapped("messages", "failureBy.Banned", "Banned", () => ({})),
  },
  reconnectWhile: (e) => e?._tag !== "Banned",
  ...(o.bound !== undefined ? { callbackBound: o.bound } : {}),
  ...(o.pages ? { pages: f.mapped("messages", "pages", "Page", (items) => ({ items })) } : {}),
  ...(o.catchUp
    ? {
        catchUp: (i, c) =>
          api.call("history", { ...i, from: c.from, next: c.next }) as Effect.Effect<
            unknown,
            unknown
          >,
        pageRetryWhile: (e) => e?._tag === "PageBusy",
      }
    : {}),
});
export const chatFixture = (o: ChatOpts = {}): Fixture => ({
  id: D,
  make: (api): Compiled => ({
    id: D,
    root: "root",
    default: "OPEN",
    nodes: {
      root: f.node("root", {
        Message: [{}],
        Page: [{}],
        Missed: [{}],
        Ended: [{ patch: ({ event }: any) => ({ ended: event.why }) }],
        Banned: [{ target: "BANNED" }],
        Leave: [{ target: "CLOSED" }],
        Open: [{ target: "OPEN" }],
        Jump: [
          {
            members: (p) => [
              {
                op: "messages",
                verb: "module",
                module: "sessions",
                name: "bookmark",
                value: f.slot(`${p}.actions[0]`, ({ memory, event }: any) => ({
                  input: { roomId: memory.roomId },
                  at: event.at,
                })),
              },
            ],
          },
        ],
        Refetch: [
          {
            patch: () => ({ messages: [] }),
            members: (p) => [
              {
                op: "messages",
                verb: "module",
                module: "sessions",
                name: "refetch",
                value: f.slot(`${p}.actions[0]`, ({ memory }: any) => ({
                  input: { roomId: memory.roomId },
                })),
              },
            ],
          },
        ],
        Mute: [{ patch: () => ({ muted: true }) }],
        Unmute: [{ patch: () => ({ muted: false }) }],
      }),
      OPEN: {
        ...f.node("OPEN", {
          Message: [
            {
              patch: ({ memory, event }: any) => {
                if (event.message.id === "boom") throw new Error("cannot read this");
                return { messages: upsert(memory.messages, event.message) };
              },
            },
          ],
          Page: [
            {
              patch: ({ memory, event }: any) => ({
                messages: event.items.reduce(upsert, memory.messages),
                pagesSeen: memory.pagesSeen + 1,
              }),
            },
          ],
          Missed: [{ patch: ({ memory }: any) => ({ notices: memory.notices + 1 }) }],
        }),
        activities: [
          {
            op: "messages",
            input: f.slot("states.OPEN.activities[0]", ({ memory }: any) => ({
              roomId: memory.roomId,
            })),
            when: f.slot("states.OPEN.activities[0].when", ({ memory }: any) => {
              if (memory.whenThrows) throw new Error("when");
              return memory.muted !== true;
            }),
          },
        ],
      },
      CLOSED: f.node("CLOSED"),
      BANNED: f.node("BANNED"),
    },
    memory: f.memory(() => ({
      roomId: "r1",
      messages: [] as unknown[],
      notices: 0,
      pagesSeen: 0,
      ended: "",
      muted: false,
    })),
    ops: {},
    streams: { messages: spec(api, o) },
    persisted: true,
    uses: ["sessions"],
  }),
});
// `latest`: 2.11.12.2. The newest value, current only while this connection confirmed it.
const P = "Lab/Presence";
const pf = fixtureOf(P);
export const presenceFixture: Fixture = {
  id: P,
  make: (api) => ({
    id: P,
    root: "root",
    default: "ON",
    nodes: {
      root: pf.node("root", {
        Seen: [{ patch: ({ memory, event }: any) => ({ seen: [...memory.seen, event.who] }) }],
        Ended: [{}],
        Off: [{ target: "OFF" }],
      }),
      ON: {
        ...pf.node("ON"),
        activities: [
          { op: "who", input: pf.slot("states.ON.activities[0]", () => ({ room: "r" })) },
        ],
      },
      OFF: pf.node("OFF"),
    },
    memory: pf.memory(() => ({ seen: [] as unknown[] })),
    ops: {},
    streams: {
      who: {
        id: "who",
        delivers: "latest",
        key: (i) => i,
        reconnect: true,
        idleMs: 1_000_000,
        healthyMs: 60_000,
        backoff: () => 1000,
        subscribe: (i, { from }) => api.socket("who", i, from),
        value: pf.mapped("who", "value", "Seen", (who) => ({ who })),
        missed: { event: "Ended" },
        failure: { event: "Ended" },
      },
    },
    persisted: false,
    uses: ["sessions"],
  }),
};
