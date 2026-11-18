import { expect, it } from "vite-plus/test";
import { propertyTest } from "../../src/host/testing/index.ts";
import { LIMITS, limitFrom } from "../limits.ts";
import { rules } from "../rules/rules.ts";
import { samples, seeds, stressSamples } from "./fixtures.ts";

// A test's limit grows with the seeds it runs, so `FLOW_SEEDS` lengthens it with the run.
const limitOf = (profile: "usual" | "stress", count: number) =>
  limitFrom((profile === "stress" ? LIMITS.stressSeed : LIMITS.usualSeed) * count);

type Shard = readonly [index: number, of: number];

const inShard = ([index, of]: Shard, i: number) => i % of === index;

/**
 * The part of a profile's runs one file declares: the fixtures it picks, its shard of them, and
 * its shard of the seeds. Across the files of a split every fixture runs every seed once.
 */
export type SeededPart = {
  readonly fixtures: (id: string) => boolean;
  readonly fixtureShard: Shard;
  readonly seedShard: Shard;
};

/** Every fixture at every seed, in one file. */
export const whole: SeededPart = { fixtures: () => true, fixtureShard: [0, 1], seedShard: [0, 1] };

/**
 * Declares one test per fixture: its runs of a profile from the fixed seeds keep every run rule.
 */
export const seededRuns = (profile: "usual" | "stress", part: SeededPart = whole) => {
  const picked = (profile === "stress" ? stressSamples : samples)
    .filter((s) => part.fixtures(s.id))
    .filter((_, i) => inShard(part.fixtureShard, i));

  const runs = seeds(profile).filter((_, i) => inShard(part.seedShard, i));

  for (const sampled of picked)
    it(
      `${sampled.id}: ${profile} runs from fixed seeds keep every run rule`,
      () => {
        const failures = propertyTest(sampled, {
          profile,
          properties: rules,
          seeds: runs,
        });

        expect(
          failures.map(
            (f) => `${f.rule} from seed ${f.seed}:\n${f.breaches.join("\n")}\n${f.story}`,
          ),
        ).toEqual([]);
      },
      limitOf(profile, runs.length),
    );
};
