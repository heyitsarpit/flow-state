import { describe, expect, it } from "vite-plus/test";
import { propertyTest } from "../../src/host/testing/index.ts";
import { rules } from "../rules/rules.ts";
import { mix, seeds } from "./fixtures.ts";

// The stress seed count, past the default suite's first five, plus any `FLOW_SEEDS` adds.
const SEEDS = seeds("stress").map((n) => n + 5);

describe("generated Stories of the app mix", () => {
  it("runs of the mix profile from fixed seeds keep every run rule", () => {
    const failures = propertyTest(mix, { profile: "mix", properties: rules, seeds: SEEDS });

    expect(
      failures.map((f) => `${f.rule} from seed ${f.seed}:\n${f.breaches.join("\n")}\n${f.story}`),
    ).toEqual([]);
  }, 240_000);
});
