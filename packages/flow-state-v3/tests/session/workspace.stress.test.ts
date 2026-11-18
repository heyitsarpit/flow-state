import { describe, expect, it } from "vite-plus/test";
import { LIMITS } from "../limits.ts";
import { wallBadge } from "../../fixtures/session/app.ts";
import { STRESS_WALL, stressWall } from "../../fixtures/session/stories/load.ts";
import { checked } from "../rules/rules.ts";

const LAST = STRESS_WALL - 1;

describe("a wall of 5,000 badges (fixtures.md S2 under L5)", () => {
  it(
    "S2 x 5,000 under L5, Actors R13, R19; WriteAhead R4: a rename reaches every badge, every ping counts, and every badge's record is saved",
    async () => {
      const run = checked(await stressWall().run());
      const { renamed, pinged } = run.checkpoints;

      for (const n of [0, 2500, LAST])
        expect(renamed.read(wallBadge(n))?.context).toEqual({ team: "Platform" });
      expect(pinged.read(wallBadge(LAST))?.memory["pings"]).toBe(2);
      expect(
        [...pinged.records.stored.keys()].filter((k) =>
          k.startsWith("actor/Workspace/Badge/wall-"),
        ),
      ).toHaveLength(STRESS_WALL);
    },
    LIMITS.stressWall,
  );
});
