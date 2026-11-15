import { readdirSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { generate, propertyTest } from "../../src/host/testing/index.ts";
import { rules } from "../rules/rules.ts";
import { samples, seeds } from "./fixtures.ts";

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

  for (const [name, sampled] of Object.entries(samples))
    for (const profile of ["usual", "stress"] as const)
      it(`${name}: ${profile} runs from fixed seeds keep every run rule`, () => {
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
      });
});
