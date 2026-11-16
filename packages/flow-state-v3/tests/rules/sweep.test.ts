import { describe, it } from "vite-plus/test";
import { checked } from "./rules.ts";
import { slices, sweep, swept } from "./sweep.ts";

const SWEEP_MS = 120_000;

describe("run rules", () => {
  it("every fixture Story but the stress ones keeps every rule", async () => {
    for (const story of slices.rest) {
      // oxlint-disable-next-line no-await-in-loop -- one run at a time: each Story is its own world
      checked(await story.run());
    }
  });
});

describe("the reload sweep", () => {
  it(
    "a reload at every step of every fixture Story but the stress ones breaks no rule",
    async () => {
      swept(await sweep(slices.rest, true));
    },
    SWEEP_MS,
  );
});
