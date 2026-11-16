import { describe, expect, it } from "vite-plus/test";
import { wallBadge } from "../../fixtures/session/machine.ts";
import { stressWall1024 } from "../../fixtures/session/stories/load.ts";
import { refusedTurnIssueOnly } from "../rules/rules.ts";

describe("a wall of 1,024 badges (fixtures.md S2 under L5)", () => {
  it("S2 x 1,024 under L5, Actors R13 (@plan.Pending.D13): a rename under 1,024 badges would add more than 64 follow-ups in one turn, so it is refused and every badge keeps the team's old name, and the pings still count", async () => {
    const run = await stressWall1024().run();

    for (const n of [0, 511, 1023])
      expect(run.checkpoints.renamed.read(wallBadge(n))?.context).toEqual({ team: "" });
    expect(run.checkpoints.pinged.read(wallBadge(1023))?.memory["pings"]).toBe(2);
  }, 240_000);

  it.fails("Turn I14: the refused rename publishes one issue-only snapshot", async () => {
    expect(refusedTurnIssueOnly.breaches(await stressWall1024().run())).toEqual([]);
  }, 240_000);
});
