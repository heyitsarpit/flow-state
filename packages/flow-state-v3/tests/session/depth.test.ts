import { Option } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { mainNests, nestView } from "../../fixtures/session/app.ts";
import {
  foldersAtDepth,
  listsAtDepth,
  mapsAtDepth,
} from "../../fixtures/session/stories/values.ts";
import type { StoryRun } from "../../src/host/testing/index.ts";
import { checked } from "../rules/rules.ts";

const NESTS = "actor/Workspace/Nests/main";

// The UnencodableValue reports, by the record they name, or "-" for a selection.
const unencodable = (run: StoryRun) =>
  run.evidence.flatMap((e) =>
    e._tag === "Reported" && e.code === "UnencodableValue"
      ? [Option.getOrElse(e.record, () => "-")]
      : [],
  );

const cases = [
  ["plain JSON lists", listsAtDepth, "lists"],
  ["a folder tree under a recursive Schema", foldersAtDepth, "folders"],
  ["an index of Maps", mapsAtDepth, "maps"],
] as const;

describe("a value's depth limit (Codec R1, R4; Actors R18, R19)", () => {
  for (const [what, story, kind] of cases)
    it(`Codec R1, R4: ${what} at the limit save, restore and are heard once; one past it in memory or in a selection is reported UnencodableValue, never thrown, and no ending is lost or made up`, async () => {
      const run = checked(await story.run());

      const heard = (cut: keyof typeof run.checkpoints) =>
        run.checkpoints[cut].read(nestView)?.memory[kind];

      expect(heard("at")).toBe(1);
      expect(run.checkpoints.at.records.stored.get(NESTS)).toBeDefined();
      // The title alone changed: the nest's reaction hears nothing.
      expect(heard("titled")).toBe(1);
      // Memory one past: the selection is at the limit and heard; the record is withheld.
      expect(heard("memory past")).toBe(2);
      // The selection one past: its slot keeps the last selection, and nothing is heard.
      expect(heard("selection past")).toBe(2);
      // Far past, where Effect's own walks would run out of stack: still reported, never thrown.
      expect(heard("far past")).toBe(2);
      expect(heard("back")).toBe(3);
      expect(heard("reloaded")).toBe(3);
      expect(run.checkpoints.reloaded.read(mainNests)?.memory["title"]).toBe("renamed");
      expect(unencodable(run)).toContain(NESTS);
      expect(unencodable(run)).toContain("-");
      expect(run.evidence.filter((e) => e._tag === "Issue")).toEqual([]);
    });
});
