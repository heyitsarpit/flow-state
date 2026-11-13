// Deliberately wrong. Excluded from the app (app/app.ts lists no machine from here) and
// from every Story glob (flow.config.ts), so it never runs; `flow check` reads it as data and must report the line
// below, which findings.test.ts asserts.
// flow check: warning KeyOmitsInput  Findings/wrong-key: input field `locale` changes the output but is not in `key` (rule 39)
import { Effect, Schema } from "effect";
import { resource } from "flow-state";

// WRONG: `locale` changes the answer (translated labels) but two locales share one cache entry.
export const wrongKey = resource({
  id: "Findings/wrong-key",
  input: { workspaceId: Schema.String, locale: Schema.String },
  output: Schema.Array(Schema.String),
  key: ["workspaceId"],
  lookup: ({ locale }) => Effect.succeed([locale === "fr" ? "Ouvert" : "Open"]),
  staleTime: "1 minute",
  gcTime: "5 minutes",
});

export const expected = {
  code: "KeyOmitsInput",
  level: "warning",
  at: "Findings/wrong-key",
} as const;
