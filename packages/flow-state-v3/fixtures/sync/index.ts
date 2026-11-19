import { Option } from "effect";
import { benchStress, benchTurn, manifest } from "../manifest.ts";
import { gitMirrored, gitMirroredSetup, clientOf } from "./app.ts";
import { long, samples, seededStress, stories, emptyName, openRepo } from "./stories/usual.ts";
import { retryEdges } from "./stories/edges.ts";
import { samples as repoSamples } from "./stories/samples.ts";
import { manyRepos } from "./stories/load.ts";
import { reloadedInBackoff, repoFirst, repoOpenedInBackoff } from "./stories/structure.ts";
import {
  mirrorChainWithStatus,
  mirrorImportsRef,
  mirrorLoop,
  mirrorSamples,
  repoCommits,
} from "./stories/sends.ts";

/**
 * The sync fixture, as every runner reads it.
 */
export const sync = manifest({
  name: "sync",
  setup: gitMirroredSetup,
  app: gitMirrored,
  stories: {
    ...stories,
    repoOpenedInBackoff,
    openRepo,
    emptyName,
    manyRepos,
    repoFirst,
    reloadedInBackoff,
    retryEdges,
    repoCommits,
    mirrorLoop,
    mirrorChainWithStatus,
    mirrorImportsRef,
  },
  samples: [samples, repoSamples, mirrorSamples],
  stressSamples: [samples, repoSamples, mirrorSamples],
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
  ],
  bench: {
    probe: (n) => clientOf(n),
    persist: Option.none(),
    stories: [benchStress(benchTurn(() => mirrorChainWithStatus))],
  },
});
