import { describe, it } from "vite-plus/test";
import { checked } from "./rules.ts";
import { slices, sweep, swept } from "./sweep.ts";

// Under `nub run faults` the stress files share the machine with seven planted copies.
const SWEEP_MS = 230_000;

describe("run rules", () => {
  it(
    "every stress Story keeps every rule",
    async () => {
      for (const story of slices.stress) {
        // oxlint-disable-next-line no-await-in-loop -- one run at a time: each Story is its own world
        checked(await story.run());
      }
    },
    SWEEP_MS,
  );
});

describe("the reload sweep", () => {
  it(
    "a reload at every step of every stress Story breaks no rule",
    async () => {
      swept(await sweep(slices.stress, true));
    },
    SWEEP_MS,
  );
});
