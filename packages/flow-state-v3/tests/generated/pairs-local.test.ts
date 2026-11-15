import { describe } from "vite-plus/test";
import { samples } from "./fixtures.ts";
import { sweeps } from "./pairs.ts";

const local = { writes: true, persisted: false, cancelsAcknowledging: false };

describe("the pair sweep, local fixtures", () => {
  sweeps("number-input", samples["number-input"], {
    ...local,
    writes: false,
    retainsUnknown: false,
  });
  sweeps("sign-in", samples["sign-in"], { ...local, retainsUnknown: false });
  sweeps("sync", samples.sync, { ...local, retainsUnknown: true });
});
