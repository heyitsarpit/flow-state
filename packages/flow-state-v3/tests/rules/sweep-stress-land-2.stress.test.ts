import { describe } from "vite-plus/test";
import { sweepShard } from "./sweep.ts";

// Under `nub run faults` the stress files share the machine with seven planted copies.
const SWEEP_MS = 230_000;

describe("the reload sweep, stress land shard 2 of 4", () => {
  sweepShard("stress", 2, 4, SWEEP_MS, ["land"]);
});
