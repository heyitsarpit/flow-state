import { describe, it } from "vite-plus/test";
import { mirrorSamples } from "../../fixtures/sync/stories/sends.ts";
import { LIMITS } from "../limits.ts";
import { sweepChecks } from "./pairs.ts";

const localWrites = {
  writes: true,
  persisted: false,
  cancelsAcknowledging: false,
  retainsUnknown: true,
};

describe("writes reached through a send, in the pair sweep", () => {
  it.fails(
    "Actors R16, combinations: git-mirrors reaches every write phase of the client through the repository's commit",
    sweepChecks(mirrorSamples, localWrites, "usual"),
    LIMITS.pairSweep,
  );
});
