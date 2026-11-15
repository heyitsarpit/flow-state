import { describe, expect, it } from "vite-plus/test";
import { stories as pay } from "../../fixtures/pay/stories.ts";
import { stories as transfers } from "../../fixtures/transfers/stories.ts";
import { Step, StoryFailed, type Story } from "../../src/host/testing/index.ts";
import { breachesOf, checked } from "./rules.ts";

const fixtureStories: ReadonlyArray<Story<string>> = [
  ...Object.values(pay),
  ...Object.values(transfers),
];

// Script faults a reload can cause: a word that finds nothing held, or a hold no call uses.
const SKIPPED = [/^nothing held at /u, / never used$/u];

const skippable = (fault: unknown) =>
  fault instanceof StoryFailed &&
  fault.problem.split("; ").every((p) => SKIPPED.some((s) => s.test(p)));

const sweep = async (reattach: boolean) => {
  const skipped: Array<string> = [];
  const failed: Array<string> = [];
  let variants = 0;
  let turned = 0;

  for (const story of fixtureStories)
    for (let at = 0; at <= story.steps.length; at++) {
      const steps = story.steps.toSpliced(at, 0, Step.reload({ reattach, heldWrites: "abort" }));
      const name = `${story.id} with a reload at ${at}`;
      variants += 1;

      try {
        // oxlint-disable-next-line no-await-in-loop -- one run at a time: each variant is its own world
        const run = await story.run({ steps });
        failed.push(...breachesOf(run).map((b) => `${name}: ${b}`));

        if (run.evidence.some((e) => e._tag === "Turn")) turned += 1;
      } catch (fault) {
        if (skippable(fault)) skipped.push(name);
        else failed.push(`${name}: ${String(fault)}`);
      }
    }

  return { variants, skipped: skipped.length, turned, failed };
};

describe("run rules", () => {
  it("every fixture Story keeps every rule", async () => {
    for (const story of fixtureStories) {
      // oxlint-disable-next-line no-await-in-loop -- one run at a time: each Story is its own world
      checked(await story.run());
    }
  });
});

describe("the reload sweep", () => {
  it("a reload at every step of every fixture Story breaks no rule", async () => {
    const result = await sweep(true);

    expect(result.failed).toEqual([]);
    expect(result.variants).toBeGreaterThan(result.skipped);
    expect(result.turned).toBe(result.variants - result.skipped);
  });

  it("a reload that attaches nothing, at every step of every fixture Story, breaks no rule (Restore I1)", async () => {
    const result = await sweep(false);

    expect(result.failed).toEqual([]);
    expect(result.variants).toBeGreaterThan(result.skipped);
    expect(result.turned).toBe(result.variants - result.skipped);
  });
});
