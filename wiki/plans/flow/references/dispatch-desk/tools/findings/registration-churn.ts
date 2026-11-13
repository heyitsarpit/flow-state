// Deliberately wrong. Excluded from the app (app/app.ts lists no machine from here) and
// from every Story glob (flow.config.ts), so it never runs; `flow check` reads it as data and must report the line
// below, which findings.test.ts asserts.
// flow check: diagnostic RegistrationChurn  Findings/wrong-churn (session): more than three starts per drop over ten starts: the adapter re-registers without dropping.
import { Schema, Stream } from "effect";
import { Feed, stream } from "flow-state";

// WRONG at runtime: an adapter that emits `Feed.live()` before every value, so every value looks
// like a fresh registration and every one lowers the covered answers.
export const wrongChurn = stream({
  id: "Findings/wrong-churn",
  input: { roomId: Schema.String },
  output: Schema.String,
  key: ["roomId"],
  delivers: "every",
  subscribe: () =>
    Stream.make("a", "b", "c").pipe(Stream.flatMap((v) => Stream.make(Feed.live(), v))),
});

export const expected = {
  code: "RegistrationChurn",
  level: "diagnostic",
  at: "Findings/wrong-churn (session)",
} as const;
