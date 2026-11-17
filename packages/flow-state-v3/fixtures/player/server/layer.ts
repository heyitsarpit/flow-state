import { Effect, Layer } from "effect";
import { NoResponse, SpeakerApi, Unavailable } from "../services.ts";
import { Speaker } from "./speaker.ts";

const lost = () => Effect.fail(new NoResponse());

/**
 * The speaker port over its fake, for Stories.
 */
export const SpeakerFake = Layer.effect(
  SpeakerApi,
  Effect.map(Speaker, (speaker) =>
    SpeakerApi.of({
      play: (input, { idempotencyKey }) =>
        speaker.play({ ...input, key: idempotencyKey }).pipe(
          Effect.asVoid,
          Effect.catchTags({
            FakeLost: lost,
            Unavailable: (e) => Effect.fail(new Unavailable({ why: e.why })),
          }),
        ),
    }),
  ),
);
