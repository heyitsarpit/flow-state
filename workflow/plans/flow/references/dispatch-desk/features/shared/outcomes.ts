// Wiring every write contract in the desk shares. The classification sits beside the statuses a port decoded,
// never in the port itself.
import { Effect } from "effect";
import { Outcome } from "flow-state";

// The two ways a write can end without an answer: `fetch` rejected (`NoResponse`), or the server failed with a 5xx
// (`ServerError`) and may have applied the write first. Both are "this may have happened" (2.7.1); every other tagged
// error a port fails with is a 4xx the server meant, so it stays a plain error and defaults to failure.
export const unknownWhenLost = <A, E extends { readonly _tag: string }, R>(
  write: Effect.Effect<A, E, R>,
) =>
  write.pipe(
    Effect.catchTags({
      NoResponse: (e) => Outcome.unknown(e),
      ServerError: (e) => Outcome.unknown(e),
    }),
  );
