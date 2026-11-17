import { Option } from "effect";
import { manifest } from "../manifest.ts";
import { workspaceGrown } from "./app.ts";
import { long, samples, seededStress, stories, stressSamples } from "./stories/usual.ts";
import { corruptRecord, oversizedRecord } from "./stories/edges.ts";
import { avatarWall, wall } from "./stories/load.ts";
import { grownSamples } from "./stories/samples.ts";
import {
  corruptSeen,
  digestHeard,
  digestQuiet,
  formatOneAvatar,
  guestDotReturns,
  inboxSamples,
  threadHeard,
  agendaLong,
  listsPastStack,
  foldersPastStack,
  mapsPastStack,
  treePastStack,
  kindsPastStack,
  importPastStack,
  nestsSamples,
  nestsStressSamples,
  digestRefused,
  unreadRecovers,
  archiveLarge,
} from "./stories/values.ts";
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
    wall,
    avatarWall,
    signedOutReloaded,
    bylineReturns,
    guestBadgeFirst,
    digestHeard,
    digestQuiet,
    threadHeard,
    agendaLong,
    listsPastStack,
    foldersPastStack,
    mapsPastStack,
    treePastStack,
    kindsPastStack,
    importPastStack,
    digestRefused,
    unreadRecovers,
    archiveLarge,
    guestDotReturns,
    corruptSeen,
    formatOneAvatar,
  },
  samples: [samples, grownSamples, inboxSamples, nestsSamples],
  stressSamples: [stressSamples, nestsStressSamples],
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
