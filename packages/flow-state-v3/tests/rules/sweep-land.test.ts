import { describe, it } from "vite-plus/test";
import { slices, sweep, swept } from "./sweep.ts";

const SWEEP_MS = 120_000;

describe("the reload sweep, landing held writes (Restore R3)", () => {
  it(
    "a reload that lands every held write unheard, at every step of every fixture Story but the stress ones, breaks no rule",
    async () => {
      swept(await sweep(slices.rest, true, "land"));
    },
    SWEEP_MS,
  );

  it(
    "a reload that lands every held write unheard, at every step of every stress Story, breaks no rule",
    async () => {
      swept(await sweep(slices.stress, true, "land"));
    },
    SWEEP_MS,
  );
});
