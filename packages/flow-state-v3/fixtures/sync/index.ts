import { Option } from "effect";
import { manifest } from "../manifest.ts";
import { gitGrown } from "./app.ts";
import { long, samples, seededStress, stories } from "./stories.ts";
import { retryEdges } from "./stories/edges.ts";
import { samples as repoSamples } from "./stories/samples.ts";
import { manyRepos } from "./stories/load.ts";
import { reloadedInBackoff, repoFirst, repoOpenedInBackoff } from "./stories/structure.ts";
import { emptyName, openRepo } from "./stories/usual.ts";

/**
 * The sync fixture, as every runner reads it.
 */
export const sync = manifest({
  name: "sync",
  app: gitGrown,
  stories: {
    ...stories,
    repoOpenedInBackoff,
    openRepo,
    emptyName,
    manyRepos,
    repoFirst,
    reloadedInBackoff,
    retryEdges,
  },
  samples: [samples, repoSamples],
  stressSamples: [samples, repoSamples],
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
});
