// Deliberately wrong. Excluded from the app (app/app.ts lists no machine from here) and
// from every Story glob (flow.config.ts), so it never runs; `flow check` reads it as data and must report the line
// below, which findings.test.ts asserts.
// flow check: error FeedUnhandled  WrongFeed.activity: a fact feed maps `value` and `failure` but not `missed` (M6 2.7, S7 Q22). pending merge 6
import { Schema } from "effect";
import { definition } from "flow-state";
import { activity } from "../../features/Tickets/feed/feed.contracts.js";
import { ActivityEntry } from "../../features/Tickets/types.js";

// pending merge 6. WRONG: a gap would be silent. Map `missed`, even as the one-line acceptance.
export const WrongFeed = definition({
  id: "Findings/WrongFeed",
  states: ["LIVE"],
  events: {},
  internalEvents: { Entry: { entry: ActivityEntry }, Ended: {} },
  memory: { workspaceId: Schema.optionalKey(Schema.String) },
  operations: ({ E }) => ({
    activity: activity.outcomes({
      value: E.Entry.from((entry) => ({ entry })),
      failure: {
        SocketDropped: E.Ended,
        SignedOut: E.Ended,
        Closed: E.Ended,
        Overflow: E.Ended,
        Defect: E.Ended,
        Interrupted: E.Ended,
      },
    }),
  }),
});

export const expected = {
  code: "FeedUnhandled",
  level: "error",
  at: "WrongFeed.activity",
} as const;
