import { describe, it } from "vite-plus/test";
import { slices, sweep, swept } from "./sweep.ts";

// Under `nub run faults` the stress files share the machine with seven planted copies.
const SWEEP_MS = 230_000;

describe("the reload sweep, landing held writes (Restore R3)", () => {
  it(
    "a reload that lands every held write unheard, at every step of every stress Story, breaks no rule",
    async () => {
      swept(await sweep(slices.stress, true, "land"));
    },
    SWEEP_MS,
  );
});
