import { describe, expect, it } from "vite-plus/test";
import { palette } from "../../fixtures/command-palette/app.ts";
import { HUGE_LIST, stressHugeList } from "../../fixtures/command-palette/stories/usual.ts";
import { checked } from "../rules/rules.ts";
import { LIMITS } from "../limits.ts";

const RECORD = "actor/Palette/Palette/palette-1";

const MIB = 1024 * 1024;

describe("a palette record past 16 MiB (Actors R8; WriteAhead R4; Codec R1)", () => {
  it(
    "WriteAhead R4, Codec R1: 300,000 commands are saved as one record past 16 MiB, and a reload brings every one back; nothing is reported",
    async () => {
      const run = checked(await stressHugeList().run());
      const { saved, reloaded } = run.checkpoints;

      expect(saved.records.stored.get(RECORD)?.length ?? 0).toBeGreaterThan(16 * MIB);
      expect(reloaded.read(palette)?.memory.commands).toHaveLength(HUGE_LIST);
      expect(run.evidence.filter((e) => e._tag === "Reported")).toEqual([]);
    },
    LIMITS.largeList,
  );
});
