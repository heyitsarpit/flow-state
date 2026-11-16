import { readdirSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { generate } from "../../src/host/testing/index.ts";
import { samples } from "./fixtures.ts";
import { seededRuns } from "./seeded.ts";

const fixtureDirs = readdirSync(new URL("../../fixtures", import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .toSorted();

describe("generated Stories", () => {
  it("every fixture has samples for generated runs", () => {
    expect(Object.keys(samples).toSorted()).toEqual(fixtureDirs);

    for (const sampled of Object.values(samples))
      expect(generate(sampled, { drawing: "usual", seed: 1 }).run.evidence.length).toBeGreaterThan(
        0,
      );
  });

  seededRuns("usual");
});
