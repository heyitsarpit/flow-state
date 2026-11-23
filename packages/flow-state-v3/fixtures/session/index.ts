import { actorRef } from "../../src/index.ts";
import { OrgMachine } from "./machines/org.ts";
import { Option } from "effect";
import { benchPoint, benchSeries, benchStress, benchTurn, manifest } from "../manifest.ts";
import { workspaceGrown, workspaceGrownSetup } from "./app.ts";
import { long, samples, seededStress, stories, stressSamples } from "./stories/usual.ts";
import { workspaceHide } from "./stories/visibility.ts";
import { corruptRecord, oversizedRecord } from "./stories/edges.ts";
import {
  avatarWall,
  newsletterRun,
  wall,
  stressWall,
  waveNoop,
  wallOfSize,
} from "./stories/load.ts";
import { grownSamples, shellSamples } from "./stories/samples.ts";
import { invalidWrite, renameShownAtOnce, shellUsual, signOutClears } from "./stories/shell.ts";
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
  outlineDeep,
  nestAt,
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
  setup: workspaceGrownSetup,
  app: workspaceGrown,
  stories: {
    workspaceHide,
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
    waveNoop,
    newsletterRun,
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
    shellUsual,
    renameShownAtOnce,
    invalidWrite,
    signOutClears,
  },
  samples: [samples, grownSamples, inboxSamples, nestsSamples, shellSamples],
  stressSamples: [stressSamples, nestsStressSamples, shellSamples],
  long: Option.some(long),
  savedStress: { story: seededStress, seed: 36 },
  mix: Option.some({ usual: samples, stress: stressSamples }),
  pairs: [
    {
      samples,
      reach: {
        writes: true,
        persisted: true,
        cancelsAcknowledging: true,
        retainsUnknown: true,
        storesBeside: false,
      },
    },
    {
      samples: shellSamples,
      reach: {
        writes: true,
        persisted: false,
        cancelsAcknowledging: false,
        retainsUnknown: true,
        storesBeside: false,
      },
    },
  ],
  bench: {
    probe: (n) => actorRef(OrgMachine, `org-${String(n)}`),
    persist: Option.some(() => long),
    stories: [
      benchTurn(() => agendaLong),
      benchTurn(() => waveNoop),
      benchTurn(() => newsletterRun),
      benchTurn(() => wallOfSize(100)),
      benchTurn(() => archiveLarge),
      benchPoint(() => wall, { series: "saved-identities", n: 64, unit: "saved", growth: "flat" }),
      benchPoint(() => wallOfSize(500), {
        series: "saved-identities",
        n: 500,
        unit: "saved",
        growth: "flat",
      }),
      benchStress(
        benchPoint(stressWall, {
          series: "saved-identities",
          n: 5000,
          unit: "saved",
          growth: "flat",
        }),
      ),
      benchPoint(() => avatarWall, { series: "avatars", n: 65, unit: "saved", growth: "flat" }),
      ...benchSeries(
        {
          series: "value-depth",
          unit: "levels",
          growth: "linear",
          sizes: [100, 1000, 3000],
          stressFrom: Option.some(3000),
        },
        (n) => nestAt("Lists", n, `session/nest-lists-${n}`),
      ),
      benchStress(
        benchPoint(outlineDeep, {
          series: "outline-depth",
          n: 100_000,
          unit: "levels",
          growth: "linear",
        }),
      ),
    ],
  },
});
