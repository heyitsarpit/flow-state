import { describe } from "vite-plus/test";
import { LIMITS } from "../limits.ts";
import { sweepShard } from "./sweep.ts";

describe("the reload sweep, stress abort shard 0 of 4", () => {
  sweepShard("stress", 0, 4, LIMITS.stressReloadSweep, ["abort"]);
});
