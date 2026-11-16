import { expect, it } from "vite-plus/test";
import { propertyTest } from "../../src/host/testing/index.ts";
import { rules } from "../rules/rules.ts";
import { samples, seeds, stressSamples } from "./fixtures.ts";

/**
 * Declares one test per fixture: its runs of a profile from the fixed seeds keep every run rule.
 */
// A minute per twenty seeds, so `FLOW_SEEDS` lengthens the limit with the run.
const limitMs = (profile: "usual" | "stress") => 60_000 * Math.ceil(seeds(profile).length / 20);

export const seededRuns = (profile: "usual" | "stress") => {
  for (const [name, sampled] of Object.entries(profile === "stress" ? stressSamples : samples))
    it(
      `${name}: ${profile} runs from fixed seeds keep every run rule`,
      () => {
        const failures = propertyTest(sampled, {
          profile,
          properties: rules,
          seeds: seeds(profile),
        });

        expect(
          failures.map(
            (f) => `${f.rule} from seed ${f.seed}:\n${f.breaches.join("\n")}\n${f.story}`,
          ),
        ).toEqual([]);
      },
      limitMs(profile),
    );
};
