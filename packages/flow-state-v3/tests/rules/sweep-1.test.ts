import { describe } from "vite-plus/test";
import { onceShard } from "./reloads.ts";
import { sweepShard } from "./sweep.ts";

const SWEEP_MS = 120_000;

describe("the reload sweeps, shard 1 of 8", () => {
  sweepShard("rest", 1, 8, SWEEP_MS);
  onceShard(1, 8);
});
