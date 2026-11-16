import { describe, expect, it } from "vite-plus/test";
import { wallBadge } from "../../fixtures/session/machine.ts";
import { stressWall1024 } from "../../fixtures/session/stories/load.ts";
import { breachesOf } from "../rules/rules.ts";

describe("a wall of 1,024 badges (fixtures.md S2 under L5)", () => {
  it.fails("S2 x 1,024 under L5, Actors R13, R19: a team renamed under 1,024 badges is not refused by the follow-up cap, since context updates do not count against it, and reaches each badge once", async () => {
    const run = await stressWall1024().run();

    for (const n of [0, 511, 1023])
      expect(run.checkpoints.renamed.read(wallBadge(n))?.context).toEqual({ team: "Platform" });
    expect(run.checkpoints.pinged.read(wallBadge(1023))?.memory["pings"]).toBe(2);
  }, 240_000);

  it.fails("Turn I14: the wall's run publishes one issue-only snapshot for each refused turn", async () => {
    expect(breachesOf(await stressWall1024().run())).toEqual([]);
  }, 240_000);
});
