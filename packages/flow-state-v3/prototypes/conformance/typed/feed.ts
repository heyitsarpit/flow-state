// Round 11: `fixtures/feed.compiled.ts`, with the machines in the public API and the `activity` stream in `Compiled`'s shape (D209). DeskFeed is desk's
// feed.machine.ts with the `activity` session only; Rooms is the same session in a trait under `resetOn` and `.resumable()`.
import { Effect, Schema, Stream } from "effect";
import type { Api } from "../fake-world.ts";
import type { Cursor, DeskFrame } from "../fixtures/feed.compiled.ts";
import type { Signal } from "../fixtures/compiled.ts";
import { definition, deny, Flow, fragment, machine, moduleMember, resource } from "./flow.ts";
import { call, fixture } from "./lab.ts";

export type { Cursor, DeskFrame } from "../fixtures/feed.compiled.ts";
const S = Schema;
const U = S.Unknown;
const sameCursor = (a: Cursor | undefined, b: Cursor | undefined) => a !== undefined && b !== undefined && a.epoch === b.epoch && a.seq === b.seq;
const hello = (f: Extract<DeskFrame, { t: "hello" }>, from: Cursor | undefined): Signal =>
  f.replayedFrom !== undefined && sameCursor(f.replayedFrom, from) ? { _feed: "live", proof: `server replayed from ${f.replayedFrom.epoch}:${f.replayedFrom.seq}` } : { _feed: "live" };
// desk Tickets/feed: `activitySignals` is feed.socket.ts's, as written. Where the data comes from: the server's socket frames, made Flow's signals here.
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
const activity = (api: Api, reconnect: boolean, E: { readonly Entry: { readonly from: (f: (v: unknown) => { readonly entry: unknown }) => { readonly tag: string; readonly fromFn: unknown } }; readonly MayHaveMissed: { readonly from: (f: () => Readonly<Record<string, never>>) => { readonly tag: string } }; readonly FeedEnded: { readonly tag: string } }) => ({
  id: "activity",
  key: (i: { readonly workspaceId: unknown }) => ({ workspaceId: i.workspaceId }),
  position: "cursor",
  fills: "activity",
  reconnect,
  idleMs: 45_000,
  healthyMs: 60_000,
  backoff: (n: number) => Math.min(30_000, 1000 * 2 ** n),
  subscribe: (input: unknown, { from }: { readonly from: unknown }) =>
    Stream.flatMap(api.socket("activity", input, from) as Stream.Stream<DeskFrame>, (frame) => Stream.fromIterable(activitySignals(from as Cursor | undefined)(frame))),
  value: E.Entry.from((entry) => ({ entry })),
  missed: E.MayHaveMissed.from(() => ({})),
  failure: E.FeedEnded,
});
type Entry = { readonly id: string };
const upsert = (list: readonly unknown[], e: unknown) =>
  list.some((x) => (x as Entry).id === (e as Entry).id) ? list.map((x) => ((x as Entry).id === (e as Entry).id ? e : x)) : [...list, e];

const peek = resource({ id: "desk/peek", input: {}, key: [], commit: () => call<unknown, "NoResponse">("peek")({}) });
const deskFeed = (reconnect: boolean) => (api: Api) => {
  const d = definition({
    id: "DispatchDesk/DeskFeed",
    states: { LIVE: {}, RETRY_WAIT: {}, SIGNED_OUT: {} },
    events: { DismissNotice: {}, SessionExpired: {}, Jump: { at: U }, JumpThenThrow: { at: U }, Refetch: {}, Clear: {}, ClearAndLeave: {}, Peek: {}, SignOut: {}, BreakInput: {}, Open: {} },
    internalEvents: { Peeked: {}, Entry: { entry: U }, MayHaveMissed: {}, FeedEnded: {}, Healthy: {}, Reopen: {} },
    memory: {
      workspaceId: Flow.input(U.pipe(S.withDecodingDefaultKey(Effect.succeed("w1")))),
      activity: Flow.initial(S.Array(U), []),
      notice: Flow.initial(U, ""),
      notices: Flow.initial(S.Number, 0),
      reopenInMs: Flow.initial(S.Number, 1000),
      endedElsewhere: Flow.initial(S.Boolean, false),
      inputThrows: Flow.absent(S.Boolean),
    },
    uses: ["sessions"],
    operations: ({ E }) => ({ peek: peek.outcomes({ success: E.Peeked, failure: { NoResponse: E.Peeked, Defect: E.Peeked, Interrupted: E.Peeked } }) }),
    streams: ({ E }) => ({ activity: activity(api, reconnect, E as never) }),
  });
  return machine(d, ({ S: St, E, O }) => {
    const inputOf = ({ memory }: { readonly memory: { readonly workspaceId: unknown } }) => ({ workspaceId: memory.workspaceId });
    return {
      default: St.LIVE,
      on: {
        DismissNotice: { updateMemory: () => ({ notice: "" }) },
        SessionExpired: St.SIGNED_OUT,
        // O.activity.bookmark and O.activity.refetch, from any state (T3: "with no session placed, T3 only").
        Jump: { actions: [moduleMember<{ readonly workspaceId: unknown }, { readonly at: unknown }>("activity", "sessions", "bookmark", ({ memory, event }) => ({ input: inputOf({ memory }), at: event.at }))] },
        // A bookmark member in a turn that is then refused: F3, the member goes with it.
        JumpThenThrow: {
          actions: [
            moduleMember<{ readonly workspaceId: unknown }, { readonly at: unknown }>("activity", "sessions", "bookmark", ({ memory, event }) => ({ input: inputOf({ memory }), at: event.at })),
            moduleMember("activity", "sessions", "bookmark", () => {
              throw new Error("a later member");
            }),
          ],
        },
        Refetch: { updateMemory: () => ({ activity: [] }), actions: [moduleMember<{ readonly workspaceId: unknown }>("activity", "sessions", "refetch", ({ memory }) => ({ input: inputOf({ memory }) }))] },
        Clear: { updateMemory: () => ({ activity: [] }) },
        // 2.11.8: clear and leave in one turn reads as a wipe.
        ClearAndLeave: { target: St.SIGNED_OUT, updateMemory: () => ({ activity: [] }) },
        // Review H4: a machine with both a stream and a read.
        Peek: { actions: [O.peek.lookup(() => ({}))] },
        Peeked: {},
        SignOut: St.SIGNED_OUT,
        BreakInput: { updateMemory: () => ({ inputThrows: true }) },
        Open: St.LIVE,
        Entry: {},
        MayHaveMissed: {},
        FeedEnded: { updateMemory: () => ({ endedElsewhere: true }) },
      },
      states: {
        LIVE: {
          schedules: { healthy: { schedule: "60 seconds", send: E.Healthy } },
          on: {
            Entry: {
              guard: [({ event }) => (event.entry as Entry).id !== "denied" || deny("NotThisOne")],
              updateMemory: ({ memory, event }) => {
                if ((event.entry as Entry).id === "boom") throw new Error("a value this handler cannot read");
                return { activity: upsert(memory.activity, event.entry) };
              },
            },
            MayHaveMissed: { updateMemory: ({ memory }) => ({ notice: "Some activity may be missing", notices: memory.notices + 1 }) },
            Healthy: { updateMemory: () => ({ reopenInMs: 1000 }) },
            FeedEnded: { target: St.RETRY_WAIT, updateMemory: ({ memory }) => ({ reopenInMs: Math.min(30_000, memory.reopenInMs * 2) }) },
          },
          activities: [
            {
              op: "activity",
              input: ({ memory }) => {
                if (memory.inputThrows) throw new Error("input read after start"); // review M4: rule 68 reads it once
                return inputOf({ memory });
              },
            },
          ],
        },
        RETRY_WAIT: {
          schedules: { reopen: { schedule: ({ memory }: { readonly memory: { readonly reopenInMs: number } }) => memory.reopenInMs, send: E.Reopen } },
          on: { Reopen: St.LIVE },
        },
      },
    };
  });
};
export const deskFeedFixture = fixture(deskFeed(true));
export const deskFeedNoReconnect = fixture(deskFeed(false));

// ── The same session in a trait: `resetOn` the room, `.resumable()` on its tab.
const Room = fragment(
  {
    id: "Room",
    hostEvents: { Entry: { entry: U }, MayHaveMissed: {}, FeedEnded: {} },
    memory: { workspaceId: Flow.input(U), activity: Flow.initial(S.Array(U), []), notices: Flow.initial(S.Number, 0) },
  },
  () => ({
    on: {
      Entry: { updateMemory: ({ memory, event }) => ({ activity: upsert(memory.activity, event.entry) }) },
      MayHaveMissed: { updateMemory: ({ memory }) => ({ notices: memory.notices + 1 }) },
      FeedEnded: {},
    },
    activities: [{ op: "activity", input: ({ memory }) => ({ workspaceId: memory.workspaceId }) }],
  }),
);
const rooms = (api: Api) =>
  machine(
    definition({
      id: "Desk/Rooms",
      states: { TAB: {}, AWAY: {} },
      events: { ShowRoom: { roomId: U }, Away: {}, Back: {} },
      internalEvents: { Entry: { entry: U }, MayHaveMissed: {}, FeedEnded: {} },
      memory: { roomId: Flow.initial(U, "w1") },
      uses: ["sessions"],
      places: { room: Room },
      operations: () => ({}),
      streams: ({ E }) => ({ activity: activity(api, true, E as never) }),
    }),
    ({ S: St }) => ({
      default: St.TAB,
      on: { ShowRoom: { updateMemory: ({ event }) => ({ roomId: event.roomId }) }, Away: St.AWAY, Back: St.TAB },
      states: { TAB: { traits: { room: { resumable: true, input: ({ memory }) => ({ workspaceId: memory.roomId }), resetOn: ({ memory }) => memory.roomId } } } },
    }),
  );
export const roomsFixture = fixture(rooms);
