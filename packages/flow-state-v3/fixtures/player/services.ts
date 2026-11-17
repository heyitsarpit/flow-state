import { Context, Effect, Schema } from "effect";

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
