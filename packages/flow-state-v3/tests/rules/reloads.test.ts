import { describe, expect, it } from "vite-plus/test";
import { LIMITS } from "../limits.ts";
import { contextStories, reactionTurnsOf, reload } from "./reloads.ts";

describe("reloads over a consistent saved world (Actors R9, R19; Restore R2)", () => {
  it(
    "Actors R9, R19: every context Story, reloaded at its end, hears no onContext event it did not hear before, and three reloads hear no more",
    async () => {
      const made: Array<string> = [];

      for (const { story, steps } of contextStories) {
        const ran = story.steps.slice(0, steps);

        // oxlint-disable-next-line no-await-in-loop -- one run at a time: each Story is its own world
        const counts = await Promise.all(
          [0, 1, 3].map((n) =>
            reactionTurnsOf(story, [...ran, ...Array.from({ length: n }, () => reload)]),
          ),
        );

        if (new Set(counts).size > 1 || counts.join().includes("faulted"))
          made.push(`${story.id}: ${counts.join(", ")}`);
      }

      expect(made).toEqual([]);
    },
    LIMITS.reloadAtEnd,
  );
});
