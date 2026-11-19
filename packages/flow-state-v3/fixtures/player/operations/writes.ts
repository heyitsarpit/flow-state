import { Effect, Schema } from "effect";
import { Outcome, transaction } from "../../../src/index.ts";
import { SpeakerApi } from "../services.ts";

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
    SpeakerApi.use((api) => api.play(input, { idempotencyKey: attempt.id })).pipe(
      Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)),
    ),
});
