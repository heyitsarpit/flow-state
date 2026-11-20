import { Effect, Layer } from "effect";
import { SpeakerApi } from "../services.ts";
import { Speaker } from "./speaker.ts";

/**
 * The speaker port over its fake, for Stories; a lost answer is the port's NoResponse.
 */
export const SpeakerFake = Layer.effect(
  SpeakerApi,
  Effect.map(Speaker, (speaker) =>
    SpeakerApi.of({
      play: (input, { idempotencyKey }) =>
        speaker.play({ ...input, key: idempotencyKey }).pipe(Effect.asVoid),
    }),
  ),
);
