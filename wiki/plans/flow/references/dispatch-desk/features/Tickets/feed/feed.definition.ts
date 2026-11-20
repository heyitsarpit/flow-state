// DeskFeed. One per workspace: pushed ticket changes (a `listen` entry) and the activity log.
import { Schema } from "effect";
import { definition, Flow } from "flow-state";
import { ActivityEntry } from "../types.js";
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
    MayHaveMissed: {},
    FeedEnded: {},
    SessionExpired: {},
    Reopen: {},
    Healthy: {}, // MD 2.11.10's recipe: the delay's reset is the machine's
  },
  memory: {
    workspaceId: Flow.input(Schema.String),
    activity: Flow.initial(Schema.Array(ActivityEntry), []), // oldest first, stored by id

    notice: Flow.initial(Schema.String, ""),
    reopenInMs: Flow.initial(Schema.Int, 1000), // MD 2.11.10: escalating re-open stays a machine recipe
  },
  operations: ({ E }) => ({
    changes: TicketFeed.changes.outcomes({
      failure: { SignedOut: E.SessionExpired, SocketDropped: E.FeedEnded, Feed: E.FeedEnded }, // exhaustive over E; SocketDropped is unreached under the default
    }),
    activity: activity.outcomes({
      value: E.Entry.from((entry) => ({ entry })),
      missed: E.MayHaveMissed,
      fills: "activity",
      failure: { SignedOut: E.SessionExpired, SocketDropped: E.FeedEnded, Feed: E.FeedEnded },
    }),
  }),
});
