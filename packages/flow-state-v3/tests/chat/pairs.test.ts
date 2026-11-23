import { describe, it } from "vite-plus/test";
import { samples } from "../../fixtures/chat/stories/samples.ts";
import { sweepChecks } from "../generated/pairs.ts";

// Chat's pair sweep, apart from the manifest's until it passes. Every reached cell keeps every run
// rule: a refused send ending's turn no longer sends the queued commit, and a reload no longer
// delivers a deleteMessage ending with nothing owed. It stays inverted because the sweep's lost
// answer never fires on an OnWire write of chat's samples, a reach of the sweep's own, not a rule
// of the runtime. When this passes, its samples rejoin the manifest's `pairs` and this file goes.

describe("chat's pair sweep (Operations R11, I23; Records R16)", () => {
  it.fails(
    "pair sweep reach: chat's OnWire × lost answer cell fires, and every reachable cell keeps every run rule",
    sweepChecks(
      samples,
      {
        writes: true,
        persisted: true,
        cancelsAcknowledging: true,
        retainsUnknown: true,
        storesBeside: false,
      },
      "usual",
    ),
    120_000,
  );
});
