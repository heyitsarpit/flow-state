import { describe, expect, it } from "vite-plus/test";
import { manifests } from "../../fixtures/index.ts";
import { generate, print } from "../../src/host/testing/index.ts";

// Each manifest's saved stress Story with the stress samples its seed prints from.
const saved = manifests.map(({ name, savedStress: { story, seed }, stressSamples }) => ({
  name,
  story,
  seed,
  sampled: stressSamples.find((s) => story.id === `${s.id}/stress-${seed}`),
}));

describe("each fixture's stress Story (Testing O6)", () => {
  it("every fixture saves one, and each runs the app", async () => {
    expect(saved.filter((s) => s.sampled === undefined).map((s) => s.name)).toEqual([]);

    for (const { story } of saved)
      // oxlint-disable-next-line no-await-in-loop -- one run at a time: each Story is its own world
      expect((await story.run()).evidence.length).toBeGreaterThan(0);
  });

  for (const { name, story, seed, sampled } of saved)
    it(`${name}: the saved stress Story is the stress run its seed prints, as fixture code`, () => {
      expect(sampled).toBeDefined();

      if (sampled === undefined) return;
      const run = generate(sampled, { drawing: "stress", seed });

      expect(run.run.evidence.length).toBeGreaterThan(0);
      expect(print(sampled, story.id, story.steps)).toBe(print(sampled, story.id, run.steps));
      expect(story.steps).toEqual(run.steps);
    });
});
