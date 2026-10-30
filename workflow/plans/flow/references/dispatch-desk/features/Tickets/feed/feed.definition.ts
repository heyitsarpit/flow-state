// DeskFeed: one per workspace. It holds the desk's live connection: pushed ticket changes (a `listen`
// entry that updates Ticket records in place) and the activity log (a fact feed into memory, with the
// resume cursor). Pending merge 6 (M6 2.7; S4, S10): the operations and every memory field the stream
// fills are stream lines.
import { Schema } from "effect";
import { definition, Flow } from "flow-state";
import { ActivityEntry, Cursor } from "../types.js";
import { activity } from "./feed.contracts.js";
import { TicketFeed } from "./feed.domain.js";

// The newest entries kept in memory; the log is a window, not an archive.
export const ACTIVITY_KEPT = 100;

export const DeskFeed = definition({
  id: "DispatchDesk/DeskFeed",
  states: ["LIVE", "RETRY_WAIT", "SIGNED_OUT"], // SIGNED_OUT is terminal: close 4401 maps to SessionExpired (M6 4.1)
  events: { DismissNotice: {} },
  internalEvents: {
    Entry: { entry: ActivityEntry }, // pending merge 6
    // pending merge 6: `initial` is true only for the first registration ever for this memory (S10)
    MayHaveMissed: {
      why: Schema.Literals(["Unproven", "Lost", "Reset"]),
      restartAt: Schema.optional(Cursor),
      initial: Schema.Boolean,
    },
    FeedEnded: {},
    SessionExpired: {},
    Reopen: {},
    Healthy: {},
  },
  memory: {
    workspaceId: Flow.input(Schema.String),
    activity: Flow.initial(Schema.Array(ActivityEntry), []), // oldest first, stored by id
    cursor: Schema.optional(Cursor), // pending merge 6: the resume position, advanced only by a fact's own turn (S4)
    notice: Flow.initial(Schema.String, ""),
    reopenInMs: Flow.initial(Schema.Int, 1000),
  },
  operations: ({ E }) => ({
    // pending merge 6: a `listen` entry maps only `failure` (SR26); the domain consumes the pushes.
    changes: TicketFeed.changes.outcomes({
      failure: {
        SocketDropped: E.FeedEnded,
        SignedOut: E.SessionExpired,
        Closed: E.FeedEnded,
        Overflow: E.FeedEnded,
        Defect: E.FeedEnded,
        Interrupted: E.FeedEnded,
      },
    }),
    // pending merge 6: a fact feed the machine consumes maps `value`, `missed` and `failure` (R-Kind).
    activity: activity.outcomes({
      value: E.Entry.from((entry) => ({ entry })),
      missed: E.MayHaveMissed.from((m) => ({
        why: m.why,
        restartAt: m.restartAt,
        initial: m.initial,
      })),
      failure: {
        SocketDropped: E.FeedEnded,
        SignedOut: E.SessionExpired,
        Closed: E.FeedEnded,
        Overflow: E.FeedEnded,
        Defect: E.FeedEnded,
        Interrupted: E.FeedEnded,
      },
    }),
  }),
});
