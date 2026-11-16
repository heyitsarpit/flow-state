import { describe } from "vite-plus/test";
import { samples } from "./fixtures.ts";
import { persisted, sweeps } from "./pairs.ts";

describe("the pair sweep, persisted fixtures", () => {
  sweeps("session", samples.session, { ...persisted, cancelsAcknowledging: false });
});
