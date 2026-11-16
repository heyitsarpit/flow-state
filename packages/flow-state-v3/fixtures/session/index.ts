import { Option } from "effect";
import { manifest } from "../manifest.ts";
import { workspaceGrown } from "./app.ts";
import { long, samples, seededStress, stories, stressSamples } from "./stories.ts";
import { corruptRecord, oversizedRecord } from "./stories/edges.ts";
import { avatarWall65, wall64 } from "./stories/load.ts";
import { grownSamples } from "./stories/samples.ts";
import {
  bylineReturns,
  childFirst,
  guestBadgeFirst,
  newAccountRuntime,
  refusedLoadKeepsData,
  refusedWriteRetries,
  shellBeforeSession,
  signedOutReloaded,
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
    avatarWall65,
    signedOutReloaded,
    bylineReturns,
    guestBadgeFirst,
  },
  samples: [samples, grownSamples],
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
