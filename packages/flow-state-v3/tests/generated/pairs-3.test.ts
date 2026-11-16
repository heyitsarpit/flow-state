import { describe } from "vite-plus/test";
import { sweepShard } from "./pairs.ts";

describe("the pair sweep, shard 3 of 4", () => {
  sweepShard(3, 4);
});
