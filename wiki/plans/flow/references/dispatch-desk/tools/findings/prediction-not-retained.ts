// Deliberately wrong. Excluded from the app (app/app.ts lists no machine from here) and
// from every Story glob (flow.config.ts), so it never runs; `flow check` reads it as data and must report the line
// below, which findings.test.ts asserts.
// flow check: warning PredictionNotRetained  Findings/wrong-retain.predicts: the success carries `title` only as part of `summary`, so no carrier's shape holds the whole predicted field (2.8.6)
import { Schema } from "effect";
import { domain, entity, write, transaction } from "flow-state";
import { Effect } from "effect";

const Note = entity({
  id: "Findings/Note",
  fields: { noteId: Schema.String, title: Schema.String, revision: Schema.Number },
  primaryKey: ["noteId"],
  version: "revision",
});

const retitle = transaction({
  id: "Findings/retitle",
  input: { noteId: Schema.String, title: Schema.String },
  output: Schema.Struct({ noteId: Schema.String, summary: Schema.String, revision: Schema.Number }), // no `title`
  key: ["noteId"],
  concurrency: "reject",
  commit: (input) => Effect.succeed({ noteId: input.noteId, summary: input.title, revision: 2 }),
});

// WRONG: the prediction can never be confirmed by the answer it waits for: it ends at success (merge 5).
export const WrongRetain = domain("findings-retain", {
  retitle: write(retitle)
    .one(Note)
    .predicts(({ input }) => Note.patch({ noteId: input.noteId }, { title: input.title })),
});

export const expected = {
  code: "PredictionNotRetained",
  level: "warning",
  at: "Findings/wrong-retain.predicts",
} as const;
