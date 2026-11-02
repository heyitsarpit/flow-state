// The thin streams spike's fixture. desk Tickets/feed: `activitySignals` is feed.socket.ts's, as written. DeskFeed is feed.machine.ts
// with the `activity` session only: no `changes` (`listen`), no `catchUp`, and `Healthy` without `bothLive` (rows are not in a
// guard's view here). `Room` is the same session in a trait under `resetOn` and `.resumable()`: T9's cases.
import { Effect, Stream } from "effect";
import type { Api } from "../fake-world.ts";
import type { Fixture } from "../harness.ts";
import { fixtureOf } from "./build.ts";
import {
  deny,
  type Compiled,
  type Fragment,
  type Node,
  type Signal,
  type StreamSpec,
} from "./compiled.ts";

export type Cursor = { readonly epoch: number; readonly seq: number };
export type DeskFrame =
  | { readonly t: "hello"; readonly replayedFrom?: Cursor }
  | { readonly t: "reset"; readonly epoch: number }
  | { readonly t: "ping" }
  | { readonly t: "signal"; readonly signal: Signal } // a wire with a head or a proof of its own: other adapters' `Feed.live`
  | { readonly t: "activity"; readonly entry: { readonly id: string; readonly cursor: unknown } };
const sameCursor = (a: Cursor | undefined, b: Cursor | undefined) =>
  a !== undefined && b !== undefined && a.epoch === b.epoch && a.seq === b.seq;
const hello = (f: Extract<DeskFrame, { t: "hello" }>, from: Cursor | undefined): Signal =>
  f.replayedFrom !== undefined && sameCursor(f.replayedFrom, from)
    ? { _feed: "live", proof: `server replayed from ${f.replayedFrom.epoch}:${f.replayedFrom.seq}` }
    : { _feed: "live" };
const activitySignals =
  (from: Cursor | undefined) =>
  (f: DeskFrame): ReadonlyArray<unknown> => {
    switch (f.t) {
      case "hello":
        return [hello(f, from)];
      case "reset":
        return [{ _feed: "live", restartAt: { epoch: f.epoch, seq: 0 } } satisfies Signal];
      case "ping":
        return [{ _feed: "ping" } satisfies Signal];
      case "signal":
        return [f.signal];
      case "activity":
        return [f.entry];
    }
  };
const activitySpec = (api: Api, D: string, reconnect: boolean): StreamSpec => {
  const f = fixtureOf(D);
  return {
    id: "activity",
    key: (i) => ({ workspaceId: i.workspaceId }),
    position: "cursor",
    fills: "activity",
    reconnect,
    idleMs: 45_000,
    healthyMs: 60_000,
    backoff: (n) => Math.min(30_000, 1000 * 2 ** n),
    subscribe: (input, { from }) =>
      Stream.flatMap(api.socket("activity", input, from) as Stream.Stream<DeskFrame>, (frame) =>
        Stream.fromIterable(activitySignals(from as Cursor | undefined)(frame)),
      ),
    value: f.mapped("activity", "value", "Entry", (entry) => ({ entry })),
    missed: f.mapped("activity", "missed", "MayHaveMissed", () => ({})),
    failure: { event: "FeedEnded" },
  };
};
const upsert = (list: readonly any[], e: any) =>
  list.some((x) => x.id === e.id) ? list.map((x) => (x.id === e.id ? e : x)) : [...list, e];
const inputOf = ({ memory }: any) => ({ workspaceId: memory.workspaceId });

const D = "DispatchDesk/DeskFeed";
const feed = fixtureOf(D);
const feedMake =
  (reconnect: boolean) =>
  (api: Api): Compiled => ({
    id: D,
    root: "root",
    default: "LIVE",
    nodes: {
      root: {
        ...feed.node("root", {
          DismissNotice: [{ patch: () => ({ notice: "" }) }],
          SessionExpired: [{ target: "SIGNED_OUT" }],
          // O.activity.bookmark and O.activity.refetch, from any state (T3: "with no session placed, T3 only").
          Jump: [
            {
              members: (p) => [
                {
                  op: "activity",
                  verb: "module",
                  module: "sessions",
                  name: "bookmark",
                  value: feed.slot(`${p}.actions[0]`, ({ memory, event }: any) => ({
                    input: inputOf({ memory }),
                    at: event.at,
                  })),
                },
              ],
            },
          ],
          // A bookmark member in a turn that is then refused: F3, the member goes with it.
          JumpThenThrow: [
            {
              members: (p) => [
                {
                  op: "activity",
                  verb: "module",
                  module: "sessions",
                  name: "bookmark",
                  value: feed.slot(`${p}.actions[0]`, ({ memory, event }: any) => ({
                    input: inputOf({ memory }),
                    at: event.at,
                  })),
                },
                {
                  op: "activity",
                  verb: "module",
                  module: "sessions",
                  name: "bookmark",
                  value: feed.slot(`${p}.actions[1]`, () => {
                    throw new Error("a later member");
                  }),
                },
              ],
            },
          ],
          Refetch: [
            {
              patch: () => ({ activity: [] }),
              members: (p) => [
                {
                  op: "activity",
                  verb: "module",
                  module: "sessions",
                  name: "refetch",
                  value: feed.slot(`${p}.actions[0]`, ({ memory }: any) => ({
                    input: inputOf({ memory }),
                  })),
                },
              ],
            },
          ],
          Clear: [{ patch: () => ({ activity: [] }) }],
          // 2.11.8: clear and leave in one turn reads as a wipe.
          ClearAndLeave: [{ target: "SIGNED_OUT", patch: () => ({ activity: [] }) }],
          // Review H4: a machine with both a stream and a read.
          Peek: [
            {
              members: (p) => [
                {
                  op: "peek",
                  verb: "lookup",
                  input: feed.slot(`${p}.actions[0]`, () => ({})),
                },
              ],
            },
          ],
          Peeked: [{}],
          SignOut: [{ target: "SIGNED_OUT" }],
          BreakInput: [{ patch: () => ({ inputThrows: true }) }],
          Open: [{ target: "LIVE" }],
          Entry: [{}],
          MayHaveMissed: [{}],
          FeedEnded: [{ patch: () => ({ endedElsewhere: true }) }],
        }),
      },
      LIVE: {
        ...feed.node(
          "LIVE",
          {
            Entry: [
              {
                guards: [({ event }: any) => event.entry.id !== "denied" || deny("NotThisOne")],
                patch: ({ memory, event }: any) => {
                  if (event.entry.id === "boom")
                    throw new Error("a value this handler cannot read");
                  return { activity: upsert(memory.activity, event.entry) };
                },
              },
            ],
            MayHaveMissed: [
              {
                patch: ({ memory }: any) => ({
                  notice: "Some activity may be missing",
                  notices: memory.notices + 1,
                }),
              },
            ],
            Healthy: [{ patch: () => ({ reopenInMs: 1000 }) }],
            FeedEnded: [
              {
                target: "RETRY_WAIT",
                patch: ({ memory }: any) => ({
                  reopenInMs: Math.min(30_000, memory.reopenInMs * 2),
                }),
              },
            ],
          },
          [
            {
              id: "healthy",
              send: "Healthy",
              schedule: { ms: 60_000 },
              armOn: ["entry"],
              disarmOn: [],
            },
          ],
        ),
        activities: [
          {
            op: "activity",
            input: feed.slot("states.LIVE.activities[0]", ({ memory }: any) => {
              if (memory.inputThrows) throw new Error("input read after start"); // review M4: rule 68 reads it once
              return inputOf({ memory });
            }),
          },
        ],
      } as Node,
      RETRY_WAIT: feed.node("RETRY_WAIT", { Reopen: [{ target: "LIVE" }] }, [
        {
          id: "reopen",
          send: "Reopen",
          schedule: feed.slot(
            "states.RETRY_WAIT.schedules.reopen",
            ({ memory }: any) => memory.reopenInMs,
          ),
          armOn: ["entry"],
          disarmOn: [],
        },
      ]),
      SIGNED_OUT: feed.node("SIGNED_OUT"),
    },
    memory: feed.memory((i: any) => ({
      workspaceId: i?.workspaceId ?? "w1",
      activity: [] as unknown[],
      notice: "",
      notices: 0,
      reopenInMs: 1000,
      endedElsewhere: false,
    })),
    ops: {
      peek: {
        id: "peek",
        contract: "desk/peek",
        kind: "read",
        key: feed.key("peek", () => ({})),
        concurrency: "reject",
        commit: () => api.call("peek", {}) as Effect.Effect<unknown, unknown>,
        outcomes: {
          success: { event: "Peeked" },
          failure: { NoResponse: { event: "Peeked" }, Defect: { event: "Peeked" }, Interrupted: { event: "Peeked" } },
        },
      },
    },
    streams: { activity: activitySpec(api, D, reconnect) },
    persisted: true,
    uses: ["sessions"],
  });
export const deskFeedFixture: Fixture = { id: D, make: feedMake(true) };
export const deskFeedNoReconnect: Fixture = { id: D, make: feedMake(false) };

// ── The same session in a trait: `resetOn` the room, `.resumable()` on its tab.
const R = "Desk/Rooms";
const rooms = fixtureOf(R);
const roomT = fixtureOf("Room");
const Room: Fragment = {
  id: "Room",
  root: "root",
  default: "root",
  nodes: {
    root: {
      ...roomT.node("root", {
        Entry: [
          {
            patch: ({ memory, event }: any) => ({ activity: upsert(memory.activity, event.entry) }),
          },
        ],
        MayHaveMissed: [{ patch: ({ memory }: any) => ({ notices: memory.notices + 1 }) }],
        FeedEnded: [{}],
      }),
      activities: [{ op: "activity", input: roomT.slot("activities[0]", inputOf) }],
    },
  },
  memory: {
    initial: roomT.slot("memory.initial", (i: any) => ({
      workspaceId: i.workspaceId,
      activity: [] as unknown[],
      notices: 0,
    })),
  },
};
export const roomsFixture: Fixture = {
  id: R,
  make: (api) => ({
    id: R,
    root: "root",
    default: "TAB",
    fragments: { Room },
    nodes: {
      root: rooms.node("root", {
        ShowRoom: [{ patch: ({ event }: any) => ({ roomId: event.roomId }) }],
        Away: [{ target: "AWAY" }],
        Back: [{ target: "TAB" }],
      }),
      TAB: {
        ...rooms.node("TAB"),
        placements: [
          {
            name: "room",
            fragment: "Room",
            resumable: true,
            input: rooms.slot("states.TAB.traits.room.input", ({ memory }: any) => ({
              workspaceId: memory.roomId,
            })),
            resetOn: rooms.slot(
              "states.TAB.traits.room.resetOn",
              ({ memory }: any) => memory.roomId,
            ),
          },
        ],
      },
      AWAY: rooms.node("AWAY"),
    },
    memory: rooms.memory(() => ({ roomId: "w1" })),
    ops: {},
    streams: { activity: activitySpec(api, R, true) },
    persisted: true,
    uses: ["sessions"],
  }),
};
