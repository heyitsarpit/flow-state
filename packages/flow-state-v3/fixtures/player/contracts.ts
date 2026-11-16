import { Context, Effect, Schema } from "effect";
import { Outcome, transaction } from "../../src/index.ts";

/**
 * The speaker said the track cannot play there.
 */
export class Unavailable extends Schema.TaggedError<Unavailable>()("Unavailable", {
  why: Schema.String,
}) {}

/**
 * No answer came back: the speaker may have started.
 */
export class NoResponse extends Schema.TaggedError<NoResponse>()("NoResponse", {}) {}

/**
 * The speaker port the play contract calls.
 */
export class SpeakerApi extends Context.Service<
  SpeakerApi,
  {
    readonly play: (
      input: { readonly device: string; readonly trackId: string },
      options: { readonly idempotencyKey: string },
    ) => Effect.Effect<void, Unavailable | NoResponse>;
  }
>()("flow-state-v3/fixtures/player/SpeakerApi") {}

/**
 * Starts a track on a device; a new play on the same device cancels the one before it.
 */
export const play = transaction({
  id: "Music/play",
  input: { device: Schema.String, trackId: Schema.String },
  key: ["device"],
  concurrency: "cancel",
  services: [SpeakerApi],
  commit: (input, { attempt }) =>
    Effect.flatMap(Effect.service(SpeakerApi), (api) =>
      api.play(input, { idempotencyKey: attempt.id }),
    ).pipe(Effect.catchTag("NoResponse", (e) => Outcome.unknown(e))),
});
