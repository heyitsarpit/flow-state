// TRIAL (proposal-v3.md, final): LIVE places both feeds. A drop is not a transition; the machine hears `missed` and `FeedEnded`.
// The escalating re-open is Q5's recipe, which the old machine already was; only the cursor and `initial` lines go.
import { Duration } from "effect";
import { deny, machine } from "flow-state";
import { ACTIVITY_KEPT, DeskFeed } from "./feed.definition.js";
import type { ActivityEntry } from "@desk/features/Tickets/types.js";

// At-least-once across sessions, so entries are stored by the source's id.
const upsert = (list: ReadonlyArray<ActivityEntry>, entry: ActivityEntry) =>
  (list.some((x) => x.id === entry.id)
    ? list.map((x) => (x.id === entry.id ? entry : x))
    : [...list, entry]
  ).slice(-ACTIVITY_KEPT);

const BACKOFF_MAX_MS = 30_000;

export const DeskFeedMachine = machine(DeskFeed, ({ S, E, O }) => {
  const slower = ({ memory }: { memory: { reopenInMs: number } }) => ({
    reopenInMs: Math.min(BACKOFF_MAX_MS, memory.reopenInMs * 2),
  });

  const bothLive = ({
    operations,
  }: {
    operations: Record<string, { connection: string } | undefined>;
  }) =>
    (operations["changes"]?.connection === "Live" &&
      operations["activity"]?.connection === "Live") ||
    deny("NotLive");

  return {
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
        schedules: { healthy: { schedule: "1 minute", send: E.Healthy } },
        on: {
          Entry: {
            target: "self",
            updateMemory: ({ memory, event }) => ({
              activity: upsert(memory.activity, event.entry), // CUT: the cursor line
            }),
          },
          MayHaveMissed: {
            target: "self",
            updateMemory: () => ({ notice: "Some activity may be missing" }), // CUT: the guard, the cursor line
          },
          Healthy: {
            target: "self",
            guard: [bothLive],
            updateMemory: () => ({ reopenInMs: 1000 }), // reset only after a registered minute, never on a value
          },
          FeedEnded: { target: S.RETRY_WAIT, updateMemory: slower },
        },
      },
      RETRY_WAIT: {
        // The delay is in memory, so a reload keeps the deadline.
        schedules: {
          reopen: { schedule: ({ memory }) => Duration.millis(memory.reopenInMs), send: E.Reopen },
        },
        on: { Reopen: S.LIVE },
      },
      SIGNED_OUT: {},
    },
  };
});
