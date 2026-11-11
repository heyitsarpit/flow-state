// Deliberately wrong. Excluded from the app (app/app.ts lists no machine from here) and
// from every Story glob (flow.config.ts), so it never runs; `flow check` reads it as data and must report the line
// below, which findings.test.ts asserts.
// flow check: error FeedUnhandled  WrongFeed.activity: an `every` feed maps `value` and `failure` but not `missed`.
import { Schema } from "effect";
import { definition } from "flow-state";
import { activity } from "../../features/Tickets/feed/feed.contracts.js";
import { ActivityEntry } from "../../features/Tickets/types.js";

// WRONG: a gap would be silent. Map `missed`, even as the one-line acceptance.
export const WrongFeed = definition({
  id: "Findings/WrongFeed",
  states: ["LIVE"],
  events: {},
  internalEvents: { Entry: { entry: ActivityEntry }, Ended: {} },
  memory: { workspaceId: Schema.optionalKey(Schema.String) },
  operations: ({ E }) => ({
    // @ts-expect-error `missed` and `fills` are required on an `every` stream: a type error first, a `flow check` error for untyped code.
    activity: activity.outcomes({
      value: E.Entry.from((entry) => ({ entry })),
      failure: {
        SocketDropped: E.Ended,
        SignedOut: E.Ended,
        Feed: E.Ended,
      },
    }),
  }),
});

export const expected = {
  code: "FeedUnhandled",
  level: "error",
  at: "WrongFeed.activity",
} as const;
