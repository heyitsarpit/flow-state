import { Option } from "effect";
import { manifest } from "../manifest.ts";
import { workspaceGrown } from "./app.ts";
import { long, samples, seededStress, stories, stressSamples } from "./stories.ts";
import { corruptRecord, oversizedRecord } from "./stories/edges.ts";
import { wall64 } from "./stories/load.ts";
import {
  childFirst,
  newAccountRuntime,
  refusedLoadKeepsData,
  refusedWriteRetries,
  shellBeforeSession,
  signedOutUndefined,
  teamForgotten,
} from "./stories/structure.ts";

/**
 * The session fixture, as every runner reads it.
 */
export const session = manifest({
  name: "session",
  app: workspaceGrown,
  stories: {
    ...stories,
    shellBeforeSession,
    newAccountRuntime,
    refusedWriteRetries,
    refusedLoadKeepsData,
    childFirst,
    teamForgotten,
    signedOutUndefined,
    corruptRecord,
    oversizedRecord,
    wall64,
  },
  samples: [samples],
  stressSamples: [stressSamples],
  long: Option.some(long),
  savedStress: { story: seededStress, seed: 36 },
  mix: Option.some({ usual: samples, stress: stressSamples }),
  pairs: [
    {
      samples,
      reach: { writes: true, persisted: true, cancelsAcknowledging: true, retainsUnknown: true },
    },
  ],
});
