import { describe, expect, it } from "vite-plus/test";
import { stories as cells } from "../../fixtures/cells/stories.ts";
import { stories as palette } from "../../fixtures/command-palette/stories.ts";
import { stories as lanes } from "../../fixtures/lanes/stories.ts";
import { stories as numberInput } from "../../fixtures/number-input/stories.ts";
import { stories as pay } from "../../fixtures/pay/stories.ts";
import { stories as player } from "../../fixtures/player/stories.ts";
import { stories as session } from "../../fixtures/session/stories.ts";
import { stories as signIn } from "../../fixtures/sign-in/stories.ts";
import { stories as sync } from "../../fixtures/sync/stories.ts";
import { stories as transfers } from "../../fixtures/transfers/stories.ts";
import { generate, print, type Story } from "../../src/host/testing/index.ts";
import { samples } from "./fixtures.ts";

const saved: ReadonlyArray<readonly [keyof typeof samples, Story<string>, number]> = [
  ["cells", cells.seededStress, 56],
  ["command-palette", palette.seededStress, 36],
  ["lanes", lanes.seededStress, 36],
  ["number-input", numberInput.seededStress, 36],
  ["pay", pay.seededStress, 36],
  ["player", player.seededStress, 36],
  ["session", session.seededStress, 36],
  ["sign-in", signIn.seededStress, 36],
  ["sync", sync.seededStress, 36],
  ["transfers", transfers.seededStress, 45],
];

describe("each fixture's stress Story (Testing O6)", () => {
  it("every fixture saves one, and each runs the app", async () => {
    expect(saved.map(([name]) => name).toSorted()).toEqual(Object.keys(samples).toSorted());

    for (const [, story] of saved)
      // oxlint-disable-next-line no-await-in-loop -- one run at a time: each Story is its own world
      expect((await story.run()).evidence.length).toBeGreaterThan(0);
  });

  for (const [name, story, seed] of saved)
    it(`${name}: the saved stress Story is the stress run its seed prints, as fixture code`, () => {
      const sampled = samples[name];
      const run = generate(sampled, { drawing: "stress", seed });

      expect(story.id).toBe(`${sampled.id}/stress-${seed}`);
      expect(run.run.evidence.length).toBeGreaterThan(0);
      expect(print(sampled, story.id, story.steps)).toBe(print(sampled, story.id, run.steps));
      expect(story.steps).toEqual(run.steps);
    });
});
