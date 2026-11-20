import { describe } from "vite-plus/test";
import { sweepShard } from "./pairs.ts";

// Every drive seed, past the reachable phases: probes that no seed opens a forbidden phase.
describe("the pair sweep over every drive seed, shard 3 of 4", () => {
  sweepShard("stress", 3, 4);
});
