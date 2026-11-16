import { describe, expect, it } from "vite-plus/test";
import { propertyTest } from "../../src/host/testing/index.ts";
import { rules } from "../rules/rules.ts";
import { mix } from "./fixtures.ts";

const SEEDS = Array.from({ length: 40 }, (_, n) => n + 6);

describe("generated Stories of the app mix", () => {
  it("runs of the mix profile from fixed seeds keep every run rule", () => {
    const failures = propertyTest(mix, { profile: "mix", properties: rules, seeds: SEEDS });

    expect(
      failures.map((f) => `${f.rule} from seed ${f.seed}:\n${f.breaches.join("\n")}\n${f.story}`),
    ).toEqual([]);
  }, 240_000);
});
