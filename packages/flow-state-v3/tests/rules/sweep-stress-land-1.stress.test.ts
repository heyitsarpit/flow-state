import { describe } from "vite-plus/test";
import { LIMITS } from "../limits.ts";
import { sweepShard } from "./sweep.ts";

describe("the reload sweep, stress land shard 1 of 4", () => {
  sweepShard("stress", 1, 4, LIMITS.stressReloadSweep, ["land"]);
});
