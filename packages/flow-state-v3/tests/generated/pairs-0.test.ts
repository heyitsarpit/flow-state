import { describe } from "vite-plus/test";
import { sweepShard } from "./pairs.ts";

describe("the pair sweep, shard 0 of 4", () => {
  sweepShard(0, 4);
});
