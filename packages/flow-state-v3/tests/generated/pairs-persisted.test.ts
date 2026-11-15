import { describe } from "vite-plus/test";
import { samples } from "./fixtures.ts";
import { sweeps } from "./pairs.ts";

const persisted = { writes: true, persisted: true, retainsUnknown: true };

describe("the pair sweep, persisted fixtures", () => {
  sweeps("cells", samples.cells, { ...persisted, cancelsAcknowledging: true });
  sweeps("command-palette", samples["command-palette"], {
    ...persisted,
    cancelsAcknowledging: false,
  });
  sweeps("pay", samples.pay, { ...persisted, cancelsAcknowledging: false });
  sweeps("transfers", samples.transfers, { ...persisted, cancelsAcknowledging: true });
});
