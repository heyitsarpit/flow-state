// "Suggest a reply": a streamed write. Demonstrates M6 2.9 and 4.4 (a transaction whose commit reports
// `progress(p)` as the body arrives) and rule 39 (a contract states input, output and key).
// Pending merge 6: written against merge-6-streams/proposal-v2.md revision 7.1, S5 Q11.
import { Effect, Schema, Stream } from "effect";
import { Outcome, transaction } from "flow-state";
import { AssistantApi, Usage } from "./assistant-api.js";

// The model went quiet for 20 s. A stall fails, it never completes (FC37), and the text so far may be
// all there will be: unknown, not a failure.
export class Stalled extends Schema.TaggedError<Stalled>()("Stalled", {}) {}

// The body ended without `done` (FC80): not complete, whatever arrived.
export class Truncated extends Schema.TaggedError<Truncated>()("Truncated", {}) {}

export const Reply = Schema.Struct({ text: Schema.String, usage: Usage });

export type Reply = typeof Reply.Type;

// pending merge 6
export const suggestReply = transaction({
  id: "DispatchDesk/suggest-reply",
  input: { workspaceId: Schema.String, ticketId: Schema.String, prompt: Schema.String },
  output: Reply,
  key: ["workspaceId", "ticketId"], // one reply per ticket at a time
  // `cancel` (the desk's only one): a newer commit interrupts the Attempt on the wire, whose ending is then evidence
  // (rule 17). That is Regenerate: nobody wants the old reply once a new one is asked for. The lane holds nothing
  // beyond an ending's own turn (`HeldThisTurn`), so no handler has to release anything (O8).
  concurrency: "cancel",
  progress: { text: Schema.String }, // the text so far; latest wins, so the commit accumulates
  commit: (input, { attempt, signal, progress }) =>
    Effect.gen(function* () {
      const api = yield* AssistantApi;
      let text = "";
      let usage: Usage | undefined;

      // Where the data comes from: `api.suggest` wraps `fetch`'s streamed NDJSON body (next/http-api.ts)
      // and ends with NoResponse, ServerError or Refused. `signal` aborts the fetch, which closes the body.
      yield* api.suggest(input, { idempotencyKey: attempt.id, signal }).pipe(
        Stream.timeoutOrElse({
          duration: "20 seconds",
          orElse: () => Stream.fail(new Stalled()),
        }),
        Stream.runForEach((frame) =>
          Effect.sync(() => {
            if (frame.t === "token") {
              text += frame.text;
              progress({ text }); // pending merge 6: no turn per token (SR29); the row's `progress` updates
            } else {
              usage = frame.usage;
            }
          }),
        ),
        // Refused is a 4xx the server meant: definite, it stays a plain error and defaults to failure.
        // Anything else may have produced an answer we did not see: unknown.
        Effect.catchTags({
          NoResponse: (e) => Outcome.unknown(e),
          ServerError: (e) => Outcome.unknown(e),
          Stalled: (e) => Outcome.unknown(e),
        }),
      );

      if (usage === undefined) return yield* Outcome.unknown(new Truncated()); // no terminator (FC80)

      return { text, usage };
    }),
});
