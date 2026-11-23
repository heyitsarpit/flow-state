import { describe, it } from "vite-plus/test";
import { samples } from "../../fixtures/chat/stories/samples.ts";
import { sweepChecks } from "../generated/pairs.ts";

// Chat's pair sweep, apart from the manifest's until it passes: in its Recapturing cells a reload
// delivers a deleteMessage ending again with nothing owed (Records R16, WriteLanes I15), and a
// refused send ending's turn also sends and mints the queued commit behind it (Operations R11, I23,
// Turn I14). When this passes, its samples rejoin the manifest's `pairs` and this file goes.

describe("chat's pair sweep (Operations R11, I23; Records R16)", () => {
  it.fails(
    "Operations R11, I23; Records R16: every reachable (phase, fault) cell of chat's samples keeps every run rule",
    sweepChecks(
      samples,
      { writes: true, persisted: true, cancelsAcknowledging: false, retainsUnknown: true },
      "usual",
    ),
    120_000,
  );
});
