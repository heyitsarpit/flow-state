import { describe } from "vite-plus/test";
import { sweepShard } from "./pairs.ts";

describe("the pair sweep, shard 1 of 4", () => {
  sweepShard("usual", 1, 4);
});
