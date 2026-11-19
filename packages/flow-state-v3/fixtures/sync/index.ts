import { Option } from "effect";
import { benchStress, benchTurn, manifest } from "../manifest.ts";
import { gitWatched, gitWatchedSetup, clientOf } from "./app.ts";
import {
  pullFirstPause,
  pullPaused,
  pullRepaused,
  pullSamples,
  pullUnchanged,
  pullWatching,
} from "./stories/context.ts";
import {
  long,
  samples,
  seededStress,
  stories,
  emptyName,
  leaveWhileSyncing,
  connectionCloseFails,
  interruptCleanupFails,
  signOutWhileSyncing,
  openRepo,
} from "./stories/usual.ts";
import { retryEdges } from "./stories/edges.ts";
import { samples as repoSamples } from "./stories/samples.ts";
import { manyRepos } from "./stories/load.ts";
import { reloadedInBackoff, repoFirst, repoOpenedInBackoff } from "./stories/structure.ts";
import {
  mirrorChainWithStatus,
  mirrorImportsRef,
  mirrorLoop,
  mirrorSamples,
  replicaLoop,
  replicasLoop,
  replicaPairs,
  repoCommits,
} from "./stories/sends.ts";

/**
 * The sync fixture, as every runner reads it.
 */
export const sync = manifest({
  name: "sync",
  setup: gitWatchedSetup,
  app: gitWatched,
  stories: {
    ...stories,
    repoOpenedInBackoff,
    openRepo,
    emptyName,
    leaveWhileSyncing,
    connectionCloseFails,
    interruptCleanupFails,
    signOutWhileSyncing,
    manyRepos,
    repoFirst,
    reloadedInBackoff,
    retryEdges,
    repoCommits,
    mirrorLoop,
    mirrorChainWithStatus,
    mirrorImportsRef,
    replicaLoop,
    replicasLoop,
    replicaPairs,
    pullWatching,
    pullPaused,
    pullUnchanged,
    pullFirstPause,
    pullRepaused,
  },
  samples: [samples, repoSamples, mirrorSamples, pullSamples],
  stressSamples: [samples, repoSamples, mirrorSamples, pullSamples],
  long: Option.some(long),
  savedStress: { story: seededStress, seed: 36 },
  mix: Option.none(),
  pairs: [
    {
      samples,
      reach: { writes: true, persisted: false, cancelsAcknowledging: false, retainsUnknown: true },
    },
    {
      samples: repoSamples,
      reach: { writes: true, persisted: false, cancelsAcknowledging: false, retainsUnknown: true },
    },
    {
      samples: mirrorSamples,
      reach: { writes: true, persisted: false, cancelsAcknowledging: false, retainsUnknown: true },
    },
  ],
  bench: {
    probe: (n) => clientOf(n),
    persist: Option.none(),
    stories: [benchStress(benchTurn(() => mirrorChainWithStatus))],
  },
});
