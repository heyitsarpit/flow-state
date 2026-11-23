import { Effect, Schema } from "effect";
import { Outcome, transaction } from "../../../src/index.ts";
import { DocsApi } from "../services.ts";

/**
 * Saves a document's body on the revision it was read at; a newer save replaces one still
 * queued. A lost answer is unknown.
 */
export const save = transaction({
  id: "Draft/save",
  input: { id: Schema.String, body: Schema.String, revision: Schema.Number },
  key: ["id"],
  concurrency: "latest",
  services: [DocsApi],
  commit: (input, { attempt }) =>
    DocsApi.use((api) => api.save(input, { idempotencyKey: attempt.id })).pipe(
      Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)),
    ),
});
