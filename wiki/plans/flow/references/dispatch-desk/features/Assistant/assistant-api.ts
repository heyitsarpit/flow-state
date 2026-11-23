// 4): the assistant port. `suggest` posts the request and returns the NDJSON
// body as a Stream of `token` / `done` frames. The commit in assistant.contracts.ts runs it,
// forwarding each token to the lane's `progress`, so no turn is taken per token.
//
// Failures: `NoResponse` when `fetch` rejects or the body breaks mid-stream, `ServerError` for a
// 5xx, `Refused` for a 4xx. Whether the body ended with `done` is the commit's business: a stream
// that ends without it is `Truncated` (FC80), a stall is `Stalled` (FC37).
import { Context, Schema, type Stream } from "effect";
import type { NoResponse, ServerError } from "../Tickets/types.js";

export const SuggestInput = Schema.Struct({
  workspaceId: Schema.String,
  ticketId: Schema.String,
  prompt: Schema.String,
});

export type SuggestInput = typeof SuggestInput.Type;

export const Usage = Schema.Struct({ tokens: Schema.Number });

export type Usage = typeof Usage.Type;

export const SuggestFrame = Schema.Union([
  Schema.Struct({ t: Schema.Literal("token"), text: Schema.String }),
  Schema.Struct({ t: Schema.Literal("done"), usage: Usage }),
]);

export type SuggestFrame = typeof SuggestFrame.Type;

// 4xx: the assistant will not answer (rate limit, a ticket it may not read). Definite.
export class Refused extends Schema.TaggedError<Refused>()("Refused", {
  status: Schema.Number,
}) {}

export class AssistantApi extends Context.Service<
  AssistantApi,
  {
    // The Stream opens the request when run and emits the body's frames. Aborting `signal`
    // cancels the `fetch`, which closes the body.
    suggest: (
      input: SuggestInput,
      options: { idempotencyKey: string; signal: AbortSignal },
    ) => Stream.Stream<SuggestFrame, NoResponse | ServerError | Refused>;
  }
>()("DispatchDesk/AssistantApi") {}
