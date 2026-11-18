import { describe } from "vite-plus/test";
import { LIMITS } from "../limits.ts";
import { onceShard } from "./reloads.ts";
import { sweepShard } from "./sweep.ts";

describe("the reload sweeps, shard 7 of 8", () => {
  sweepShard("rest", 7, 8, LIMITS.reloadSweep);
  onceShard(7, 8);
});
