import { describe } from "vite-plus/test";
import { samples } from "./fixtures.ts";
import { persisted, sweeps } from "./pairs.ts";

describe("the pair sweep, persisted fixtures", () => {
  sweeps("command-palette", samples["command-palette"], {
    ...persisted,
    cancelsAcknowledging: false,
  });
  sweeps("pay", samples.pay, { ...persisted, cancelsAcknowledging: false });
});
