import { describe, expect, it } from "vite-plus/test";
import { wallBadge } from "../../fixtures/session/machine.ts";
import { stressWall1024 } from "../../fixtures/session/stories/load.ts";
import { checked } from "../rules/rules.ts";

describe("a wall of 1,024 badges (fixtures.md S2 under L5)", () => {
  it("S2 x 1,024 under L5, Actors R13, R19: a rename under 1,024 badges reaches every badge, since context updates never count toward the 64 follow-ups, and the pings still count", async () => {
    const run = checked(await stressWall1024().run());

    for (const n of [0, 511, 1023])
      expect(run.checkpoints.renamed.read(wallBadge(n))?.context).toEqual({ team: "Platform" });
    expect(run.checkpoints.pinged.read(wallBadge(1023))?.memory["pings"]).toBe(2);
  }, 240_000);
});
