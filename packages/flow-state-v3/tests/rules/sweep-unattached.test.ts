import { describe, it } from "vite-plus/test";
import { slices, sweep, swept } from "./sweep.ts";

const SWEEP_MS = 120_000;

describe("the reload sweep, attaching nothing (Restore I1)", () => {
  it(
    "a reload that attaches nothing, at every step of every fixture Story but the stress ones, breaks no rule",
    async () => {
      swept(await sweep(slices.rest, false));
    },
    SWEEP_MS,
  );
});
