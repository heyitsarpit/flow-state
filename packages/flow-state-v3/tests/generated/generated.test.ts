import { readdirSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { manifests } from "../../fixtures/index.ts";
import { generate, propertyTest } from "../../src/host/testing/index.ts";
import { rules } from "../rules/rules.ts";
import { samples } from "./fixtures.ts";
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

// A known breach, owner not yet named: a home room's turn while offline publishes twice beside a
// held thermostat write and the house's vacation, from fresh usual seed 15 and stress seed 5. It
// fails the same way on the code before the schedule-issue rework.
describe("a home room's turn publishes once (Turn I9)", () => {
  it.fails("Turn I9: the lounge's turn while offline, beside a held write and a vacation, publishes once (usual seed 15)", () => {
    const sampled = samples.find((s) => s.id === "home-rooms");

    expect(
      sampled === undefined
        ? ["no home-rooms samples"]
        : propertyTest(sampled, { profile: "usual", properties: rules, seeds: [15] }).map(
            (f) => f.rule,
          ),
    ).toEqual([]);
  });
});
