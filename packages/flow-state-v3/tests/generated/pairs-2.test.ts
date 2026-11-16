import { describe } from "vite-plus/test";
import { sweepShard } from "./pairs.ts";

describe("the pair sweep, shard 2 of 4", () => {
  sweepShard(2, 4);
});
