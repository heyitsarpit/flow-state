import { describe, it } from "vite-plus/test";
import { slices, sweep, swept } from "./sweep.ts";

const SWEEP_MS = 120_000;

describe("the reload sweep, attaching nothing (Restore I1)", () => {
  it(
    "a reload that attaches nothing, at every step of every stress Story, breaks no rule",
    async () => {
      swept(await sweep(slices.stress, false));
    },
    SWEEP_MS,
  );
});
