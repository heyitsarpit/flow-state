import { describe } from "vite-plus/test";
import { LIMITS } from "../limits.ts";
import { onceShard } from "./reloads.ts";
import { sweepShard } from "./sweep.ts";

describe("the reload sweeps, shard 6 of 8", () => {
  sweepShard("rest", 6, 8, LIMITS.reloadSweep);
  onceShard(6, 8);
});
