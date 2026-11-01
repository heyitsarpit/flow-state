// TRIAL (proposal-v3.md): LIVE places both feeds. A drop is not a transition; the machine hears `missed` and `FeedEnded`.
import { machine } from "flow-state";
import { ACTIVITY_KEPT, DeskFeed } from "./feed.definition.js";
import type { ActivityEntry } from "@desk/features/Tickets/types.js";

// At-least-once across sessions, so entries are stored by the source's id.
const upsert = (list: ReadonlyArray<ActivityEntry>, entry: ActivityEntry) =>
  (list.some((x) => x.id === entry.id)
    ? list.map((x) => (x.id === entry.id ? entry : x))
    : [...list, entry]
  ).slice(-ACTIVITY_KEPT);

export const DeskFeedMachine = machine(DeskFeed, ({ S, E, O }) => ({
  default: S.LIVE,
  on: {
    SessionExpired: S.SIGNED_OUT,
    DismissNotice: { target: "self", updateMemory: () => ({ notice: "" }) },
  },
  states: {
    LIVE: {
      activities: [
        O.changes.subscribe(({ memory }) => ({ workspaceId: memory.workspaceId })),
        O.activity.subscribe(({ memory }) => ({ workspaceId: memory.workspaceId })), // CUT: `after: memory.cursor`
      ],
      // CUT: schedules.healthy
      on: {
        Entry: {
          target: "self",
          updateMemory: ({ memory, event }) => ({ activity: upsert(memory.activity, event.entry) }),
        }, // CUT: cursor line
        MayHaveMissed: {
          target: "self",
          updateMemory: () => ({ notice: "Some activity may be missing" }),
        }, // CUT: the guard, the cursor line
        FeedEnded: S.RETRY_WAIT, // CUT: `slower`
      },
    },
    // GUESS: a session ends only on `Flapping` or a defect now, so a fixed wait replaces the growing one (RESULTS: escalation and
    // the persisted deadline are gone). C3's recipe in the spec is a `Retry` event instead of an automatic reopen.
    RETRY_WAIT: {
      schedules: { reopen: { schedule: "30 seconds", send: E.Reopen } },
      on: { Reopen: S.LIVE },
    },
    SIGNED_OUT: {},
  },
}));
