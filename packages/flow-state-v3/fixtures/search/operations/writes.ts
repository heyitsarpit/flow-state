import { Effect, Schema } from "effect";
import { Outcome, transaction } from "../../../src/index.ts";
import { SearchApi } from "../services.ts";

/**
 * Saves a search for a shopper; a second save while one is out is refused. A lost answer is
 * unknown.
 */
export const saveSearch = transaction({
  id: "Search/saveSearch",
  input: { shopper: Schema.String, q: Schema.String },
  key: ["shopper"],
  concurrency: "reject",
  services: [SearchApi],
  commit: (input, { attempt }) =>
    SearchApi.use((api) => api.save(input, { idempotencyKey: attempt.id })).pipe(
      Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)),
    ),
});
