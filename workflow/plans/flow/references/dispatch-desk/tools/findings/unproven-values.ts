// Deliberately wrong. Excluded from the app (app/app.ts lists no machine from here) and
// from every Story glob (flow.config.ts), so it never runs; `flow check` reads it as data and must report the line
// below, which findings.test.ts asserts.
// flow check: diagnostic UnprovenValues  Findings/wrong-unproven (session): values arrived on a connection that never said `Feed.live` (M6 2.12). pending merge 6
import { Schema, Stream } from "effect";
import { stream } from "flow-state";

// pending merge 6. WRONG at runtime, reported as a diagnostic record: a plain stream of values with a signal-aware
// contract that never announces registration, so nothing it delivers can be called current.
export const wrongUnproven = stream({
  id: "Findings/wrong-unproven",
  input: { roomId: Schema.String },
  output: Schema.String,
  key: ["roomId"],
  delivers: "facts",
  subscribe: () => Stream.make("a", "b", "c"), // no Feed.live, no Feed.reconnect
});

export const expected = {
  code: "UnprovenValues",
  level: "diagnostic",
  at: "Findings/wrong-unproven (session)",
} as const;
