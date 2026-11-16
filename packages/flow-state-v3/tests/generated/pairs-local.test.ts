import { describe } from "vite-plus/test";
import { samples } from "./fixtures.ts";
import { local, sweeps } from "./pairs.ts";

describe("the pair sweep, local fixtures", () => {
  sweeps("sign-in", samples["sign-in"], { ...local, retainsUnknown: false });
  sweeps("sync", samples.sync, { ...local, retainsUnknown: true });
});
