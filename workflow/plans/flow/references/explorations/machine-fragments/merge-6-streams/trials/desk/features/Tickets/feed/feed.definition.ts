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
    // CUT: Healthy
  },
  memory: {
    workspaceId: Flow.input(Schema.String),
    activity: Flow.initial(Schema.Array(ActivityEntry), []), // oldest first, stored by id
    // CUT: cursor, reopenInMs
    notice: Flow.initial(Schema.String, ""),
  },
  operations: ({ E }) => ({
    changes: TicketFeed.changes.outcomes({
      failure: { SignedOut: E.SessionExpired, Feed: E.FeedEnded }, // was six entries; SocketDropped is retried by the default
    }),
    activity: activity.outcomes({
      value: E.Entry.from((entry) => ({ entry })),
      missed: E.MayHaveMissed,
      fills: "activity", // NEW: fills. The memory field this feed fills
      failure: { SignedOut: E.SessionExpired, Feed: E.FeedEnded },
    }),
  }),
});
