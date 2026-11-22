import { Result } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { checkout, shopSetup } from "../../fixtures/shop/app.ts";
import { Shop } from "../../fixtures/services/shop/server/shop.ts";
import { Fake, propertyTest, Story, StoryFailed } from "../../src/host/testing/index.ts";
import { FlowError } from "../../src/index.ts";
import { breachesOf, rules } from "../rules/rules.ts";
import { planted, ResendingShopFake } from "./planted.ts";
import { LIMITS } from "../limits.ts";
import { loose } from "../../src/test/loose.ts";

// The names a printed Story uses, in scope as the fixture's own module has them.
const scope = { Story, Fake, shopSetup, ResendingShopFake, checkout, Shop };

// Evaluates a printed Story's text as the fixture would, after pasting it.
// RETURN_TYPE: evaluated code has no type of its own; the text is a printed Story.
const pasted = (text: string): Story<string> =>
  // oxlint-disable-next-line typescript/no-implied-eval, no-new-func, typescript/no-unsafe-call, typescript/no-unsafe-return -- the test pastes the printed text as code, which is what it checks
  new Function(...Object.keys(scope), `return ${text}`)(...Object.values(scope));

describe("a property named for one of Flow's own rules", () => {
  it("untyped, a property named turn limit is a script fault, so its breaches are never read as a turn limit", () => {
    const own = { rule: "turn limit", breaches: () => [] };

    const thrown = Result.try(() =>
      propertyTest(planted, loose({ profile: "usual", properties: [own], seeds: [1] })),
    );

    // The testing route's door refuses with a FlowError, the script fault kept as its cause.
    const problem =
      Result.isFailure(thrown) &&
      thrown.failure instanceof FlowError &&
      thrown.failure.cause instanceof StoryFailed
        ? thrown.failure.cause.problem
        : "";

    expect(problem).toContain("a property is named turn limit");
  });
});

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
    LIMITS.shrink,
  );
});
