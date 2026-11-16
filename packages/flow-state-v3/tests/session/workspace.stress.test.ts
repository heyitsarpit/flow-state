import { describe, expect, it } from "vite-plus/test";
import { wallBadge } from "../../fixtures/session/machine.ts";
import { stressWall1024 } from "../../fixtures/session/stories/load.ts";
import { checked } from "../rules/rules.ts";

describe("a wall of 1,024 badges (fixtures.md S2 under L5)", () => {
  it("S2 x 1,024 under L5: a team renamed under 1,024 badges reaches each one once, and each burst of pings keeps every rule", async () => {
    const run = checked(await stressWall1024().run());

    for (const n of [0, 511, 1023])
      expect(run.checkpoints.renamed.read(wallBadge(n))?.context).toEqual({ team: "Platform" });
    expect(run.checkpoints.pinged.read(wallBadge(1023))?.memory["pings"]).toBe(2);
  }, 240_000);
});
