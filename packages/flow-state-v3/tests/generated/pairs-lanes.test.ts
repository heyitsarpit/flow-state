import { describe } from "vite-plus/test";
import { samples } from "./fixtures.ts";
import { persisted, sweeps } from "./pairs.ts";

describe("the pair sweep, the lane policies fixture", () => {
  sweeps("lanes", samples.lanes, { ...persisted, cancelsAcknowledging: true });
});
