import { describe } from "vite-plus/test";
import { LIMITS } from "../limits.ts";
import { onceShard } from "./reloads.ts";
import { sweepShard } from "./sweep.ts";

describe("the reload sweeps, shard 4 of 8", () => {
  sweepShard("rest", 4, 8, LIMITS.reloadSweep);
  onceShard(4, 8);
});
