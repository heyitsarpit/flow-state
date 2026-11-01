// TRIAL (proposal-v3.md): DeskFeed. One per workspace: pushed ticket changes (a `listen` entry) and the activity log.
import { Schema } from "effect";
import { definition, Flow } from "flow-state";
import { ActivityEntry } from "@desk/features/Tickets/types.js";
import { activity } from "./feed.contracts.js";
import { TicketFeed } from "./feed.domain.js";

// The newest entries kept in memory; the log is a window, not an archive.
export const ACTIVITY_KEPT = 100;

export const DeskFeed = definition({
  id: "DispatchDesk/DeskFeed",
  states: ["LIVE", "RETRY_WAIT", "SIGNED_OUT"],
  events: { DismissNotice: {} },
  internalEvents: {
    Entry: { entry: ActivityEntry },
    MayHaveMissed: {}, // CUT: why, restartAt, initial
    FeedEnded: {},
    SessionExpired: {},
    Reopen: {},
    Healthy: {}, // Q5's recipe: the delay's reset is the machine's
  },
  memory: {
    workspaceId: Flow.input(Schema.String),
    activity: Flow.initial(Schema.Array(ActivityEntry), []), // oldest first, stored by id
    // CUT: cursor
    notice: Flow.initial(Schema.String, ""),
    reopenInMs: Flow.initial(Schema.Int, 1000), // Q5: escalating re-open stays a machine recipe
  },
  operations: ({ E }) => ({
    changes: TicketFeed.changes.outcomes({
      failure: { SignedOut: E.SessionExpired, SocketDropped: E.FeedEnded, Feed: E.FeedEnded }, // exhaustive over E; SocketDropped is unreached under the default
    }),
    activity: activity.outcomes({
      value: E.Entry.from((entry) => ({ entry })),
      missed: E.MayHaveMissed,
      fills: "activity", // NEW: fills. A field of this memory, an array: a wrong name does not compile
      failure: { SignedOut: E.SessionExpired, SocketDropped: E.FeedEnded, Feed: E.FeedEnded },
    }),
  }),
});
