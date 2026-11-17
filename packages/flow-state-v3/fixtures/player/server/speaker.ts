import { Exit, Schema } from "effect";
import { Fake } from "../../../src/host/testing/index.ts";

const SpeakerTruth = Schema.Struct({
  playing: Schema.Record(Schema.String, Schema.String),
  blocked: Schema.Array(Schema.String),
});

type Truth = typeof SpeakerTruth.Type;

/**
 * The speakers' fake: what each device plays, and the tracks they refuse.
 */
export const Speaker = Fake.server("Speaker", {
  truth: SpeakerTruth,
  initial: { playing: {}, blocked: [] },
  endpoints: {
    play: Fake.call({
      request: { device: Schema.String, trackId: Schema.String, key: Schema.String },
      success: Schema.Struct({}),
      failure: Schema.TaggedStruct("Unavailable", { why: Schema.String }),
      handle: (truth: Truth, { device, trackId }) =>
        truth.blocked.includes(trackId)
          ? { truth, exit: Exit.fail({ _tag: "Unavailable" as const, why: "not in your region" }) }
          : {
              truth: { ...truth, playing: { ...truth.playing, [device]: trackId } },
              exit: Exit.succeed({}),
            },
    }),
  },
  controls: {
    block: Fake.control({ trackId: Schema.String }, (truth: Truth, { trackId }) => ({
      ...truth,
      blocked: [...truth.blocked, trackId],
    })),
  },
});
