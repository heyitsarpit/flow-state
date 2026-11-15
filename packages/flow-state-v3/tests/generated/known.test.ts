import { describe, expect, it } from "vite-plus/test";
import { propertyTest } from "../../src/host/testing/index.ts";
import { rules } from "../rules/rules.ts";
import { samples } from "./fixtures.ts";

describe("known bugs found by generated runs", () => {
  it.fails("WriteLanes I3: an Attempt that delivered a failure never ends unknown afterwards (transfers, stress seed 397)", () => {
    const failures = propertyTest(samples.transfers, {
      profile: "stress",
      properties: rules,
      seeds: [397],
    });

    expect(failures.map((f) => `${f.rule}\n${f.breaches.join("\n")}\n${f.story}`)).toEqual([]);
  }, 60_000);
});
