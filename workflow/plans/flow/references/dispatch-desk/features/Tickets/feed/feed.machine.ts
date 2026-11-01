// LIVE places both feeds. A drop is not a transition (rule 25): the adapter reconnects inside the
// session and the connection badge shows it. The machine hears only what nothing could repair
// (`missed`) and the end of a session (`FeedEnded`), which waits in RETRY_WAIT. Pending merge 6
// (M6 2.7): the placements, `MayHaveMissed` and the `Healthy` reset are stream lines.
import { Duration } from "effect";
import { deny, machine } from "flow-state";
import { ACTIVITY_KEPT, DeskFeed } from "./feed.definition.js";
import type { ActivityEntry } from "../types.js";

// At-least-once across sessions (a reload resumes from the last handled entry and the server may
// replay it), so entries are stored by the source's id.
const upsert = (list: ReadonlyArray<ActivityEntry>, entry: ActivityEntry) =>
  (list.some((x) => x.id === entry.id)
    ? list.map((x) => (x.id === entry.id ? entry : x))
    : [...list, entry]
  ).slice(-ACTIVITY_KEPT);

const BACKOFF_MAX_MS = 30_000;

export const DeskFeedMachine = machine(DeskFeed, ({ S, E, O }) => {
  // pending merge 6: backoff grows on each ended session, and resets only after a healthy minute.
  const slower = ({ memory }: { memory: { reopenInMs: number } }) => ({
    reopenInMs: Math.min(BACKOFF_MAX_MS, memory.reopenInMs * 2),
  });

  const bothLive = ({ operations }) =>
    (operations.changes?.connection === "Live" && operations.activity?.connection === "Live") ||
    deny("NotLive"); // pending merge 6: accepted: connection

  return {
    default: S.LIVE,
    on: {
      SessionExpired: S.SIGNED_OUT,
      DismissNotice: { target: "self", updateMemory: () => ({ notice: "" }) },
    },
    states: {
      LIVE: {
        activities: [
          O.changes.subscribe(({ memory }) => ({ workspaceId: memory.workspaceId })), // pending merge 6
          O.activity.subscribe(({ memory }) => ({
            workspaceId: memory.workspaceId,
            after: memory.cursor, // pending merge 6: read once, at session start (IP8): a reload resumes from here
          })),
        ],
        schedules: { healthy: { schedule: "1 minute", send: E.Healthy } }, // pending merge 6
        on: {
          // pending merge 6: the fact's own turn stores the entry and advances the cursor together (S4).
          Entry: {
            target: "self",
            updateMemory: ({ memory, event }) => ({
              activity: upsert(memory.activity, event.entry),
              cursor: event.entry.cursor,
            }),
          },
          // pending merge 6: ignore a `missed` only when nothing was ever owed: the first registration
          // for this memory (`initial`), unproven, and nothing held (S10). A `Lost` or `Reset` never is.
          MayHaveMissed: [
            {
              target: "self",
              guard: ({ memory, event }) =>
                (event.why === "Unproven" && event.initial && memory.activity.length === 0) ||
                deny("HoldsOrRejoined"),
            },
            {
              target: "self",
              updateMemory: ({ memory, event }) => ({
                notice: "Some activity may be missing",
                cursor: event.restartAt ?? memory.cursor, // a log reset moves to the new position space
              }),
            },
          ],
          Healthy: {
            target: "self",
            guard: [bothLive],
            updateMemory: () => ({ reopenInMs: 1000 }), // reset only after a registered minute, never on a fact
          },
          FeedEnded: { target: S.RETRY_WAIT, updateMemory: slower },
        },
      },
      RETRY_WAIT: {
        // The delay is in memory, so a reload keeps the deadline.
        schedules: {
          reopen: {
            schedule: ({ memory }) => Duration.millis(memory.reopenInMs),
            send: E.Reopen,
          },
        },
        on: { Reopen: S.LIVE },
      },
      SIGNED_OUT: {},
    },
  };
});
