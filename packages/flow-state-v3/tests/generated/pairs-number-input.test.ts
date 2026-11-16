import { describe } from "vite-plus/test";
import { samples } from "./fixtures.ts";
import { local, sweeps } from "./pairs.ts";

describe("the pair sweep, local fixtures", () => {
  sweeps("number-input", samples["number-input"], {
    ...local,
    writes: false,
    retainsUnknown: false,
  });
});
