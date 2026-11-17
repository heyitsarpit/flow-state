import { readdirSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { manifests } from "../../fixtures/index.ts";
import { generate } from "../../src/host/testing/index.ts";
import { seededRuns } from "./seeded.ts";

const fixtureDirs = readdirSync(new URL("../../fixtures", import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== "services")
  .map((entry) => entry.name)
  .toSorted();

describe("generated Stories", () => {
  it("every fixture has samples for generated runs", () => {
    expect(
      manifests
        .filter((m) => m.samples.length > 0)
        .map((m) => m.name)
        .toSorted(),
    ).toEqual(fixtureDirs);

    for (const sampled of manifests.flatMap((m) => m.samples))
      expect(generate(sampled, { drawing: "usual", seed: 1 }).run.evidence.length).toBeGreaterThan(
        0,
      );
  });

  seededRuns("usual");
});
