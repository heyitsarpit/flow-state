import { describe, expect, it } from "vite-plus/test";
import { palette } from "../../fixtures/command-palette/machine.ts";
import {
  emptyQueryOrder,
  typingUnderHeldStore,
} from "../../fixtures/command-palette/stories/load.ts";
import {
  framesEight,
  secondPalette,
  stressFramesSixtyFour,
  twoPalettes,
} from "../../fixtures/command-palette/stories/structure.ts";
import type { StoryRun } from "../../src/host/testing/index.ts";
import { played } from "../rules/played.ts";
import { asPalette, memoryAt, shownAt } from "./reads.ts";

const reports = (run: StoryRun) =>
  run.evidence.flatMap((e) => (e._tag === "Reported" ? [e.code] : []));

describe("page frames deep (fixtures.md S1 with S9)", () => {
  it("S1 x 8 with S9: eight pages opened one in another are kept through a reload at the deepest, and Back steps out of each", async () => {
    const run = await played(framesEight);

    expect(memoryAt(run.checkpoints.deep).frames).toHaveLength(8);
    expect(memoryAt(run.checkpoints.reloaded).frames).toHaveLength(8);
    expect(memoryAt(run.checkpoints.top).frames).toEqual([]);
  });

  it("S1 x 64, Codec R1; Restore R9: 64 nested pages pass a record's depth bound, so the palette runs on unsaved, reported UnencodableValue, and a reload restores its last good capture", async () => {
    const run = await played(stressFramesSixtyFour());

    expect(memoryAt(run.checkpoints.deep).frames).toHaveLength(64);
    expect(reports(run)).toContain("UnencodableValue");
    expect(memoryAt(run.checkpoints.reloaded).frames).toEqual([]);
  });
});

describe("two palettes (fixtures.md S3)", () => {
  it("Actors R5: two palettes keep their own lists and queries", async () => {
    const run = await played(twoPalettes);
    const second = asPalette(run.checkpoints.typed.read(secondPalette)?.memory);

    expect(memoryAt(run.checkpoints.typed).query).toBe("pro");
    expect(second.query).toBe("li");
    expect(second.commands).toHaveLength(2);
  });
});

describe("queries and typing (fixtures.md E1, L5)", () => {
  it("an empty query shows the commands in their source order", async () => {
    const run = await played(emptyQueryOrder);

    expect(shownAt(run.checkpoints.cleared)).toEqual([
      "calendar",
      "emoji",
      "calculator",
      "profile",
      "theme",
      "settings",
    ]);
  });

  it("WriteAhead R10: a burst of typing while the store holds its writes ends with the last text, saved once the store answers", async () => {
    const run = await played(typingUnderHeldStore);

    expect(memoryAt(run.checkpoints.typed).query).toBe("settings");
    expect(memoryAt(run.checkpoints.reloaded).query).toBe("settings");
    expect(run.checkpoints.reloaded.read(palette)?.state).toBe("READY");
  });
});
