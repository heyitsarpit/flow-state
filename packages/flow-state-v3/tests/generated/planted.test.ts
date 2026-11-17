import { describe, expect, it } from "vite-plus/test";
import { checkout, shopSetup } from "../../fixtures/shop/app.ts";
import { Shop } from "../../fixtures/services/shop/server/shop.ts";
import { Fake, propertyTest, Story } from "../../src/host/testing/index.ts";
import { breachesOf, rules } from "../rules/rules.ts";
import { planted, ResendingShopFake } from "./planted.ts";

// The names a printed Story uses, in scope as the fixture's own module has them.
const scope = { Story, Fake, shopSetup, ResendingShopFake, checkout, Shop };

// Evaluates a printed Story's text as the fixture would, after pasting it.
// RETURN_TYPE: evaluated code has no type of its own; the text is a printed Story.
const pasted = (text: string): Story<string> =>
  // oxlint-disable-next-line typescript/no-implied-eval, no-new-func -- the test pastes the printed text as code, which is what it checks
  new Function(...Object.keys(scope), `return ${text}`)(...Object.values(scope));

// The search and its shrink take about 1.2 s alone, past the 5 s default when the machine is loaded.
const SHRINK_MS = 60_000;

describe("a planted fault found from a seed (WriteLanes I6)", () => {
  it(
    "a port fake that re-sends a lost confirm under a fresh key is found from a seed, shrunk to under ten printed steps, and the printed text, run as code, breaks the same rule",
    async () => {
      const [failure, ...more] = propertyTest(planted, {
        profile: "stress",
        properties: rules,
        seeds: [17],
      });

      const story = failure?.story ?? "";
      const printedSteps = story.split("\n").slice(1);
      const again = await pasted(story).run();

      expect(more).toEqual([]);
      expect(failure?.rule).toBe("WriteLanes I6");
      expect(printedSteps.slice(9)).toEqual([]);
      expect(failure?.drawn ?? 0).toBeGreaterThan(10);
      expect(story).toContain("Shop.confirm.drop(");
      expect(breachesOf(again).some((b) => b.startsWith("WriteLanes I6:"))).toBe(true);
    },
    SHRINK_MS,
  );
});
