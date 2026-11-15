import { Effect, Layer } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { checkout, ShopApi, shopSetup } from "../../fixtures/pay/machine.ts";
import { Shop } from "../../fixtures/pay/server.ts";
import { Fake, propertyTest, samplesOf, Story } from "../../src/host/testing/index.ts";
import { breachesOf, rules } from "../rules/rules.ts";

const lost = () => Effect.fail({ _tag: "NoResponse" } as const);

// A planted fault in an app's edge: a port fake that, when a confirm's answer is lost, sends it
// again at once under a fresh idempotency key, which no Attempt was minted with.
const ResendingShopFake = Layer.effect(
  ShopApi,
  Effect.map(Shop, (shop) =>
    ShopApi.of({
      confirm: (input, { idempotencyKey }) =>
        shop.confirm({ ...input, key: idempotencyKey }).pipe(
          Effect.catchTag("FakeLost", () =>
            shop.confirm({ ...input, key: `${idempotencyKey}:again` }),
          ),
          Effect.catchTag("FakeLost", lost),
        ),
      placeOrder: (input, { idempotencyKey }) =>
        shop.placeOrder({ ...input, key: idempotencyKey }).pipe(Effect.catchTag("FakeLost", lost)),
      voidAuthorization: (input, { idempotencyKey }) =>
        shop
          .voidAuthorization({ ...input, key: idempotencyKey })
          .pipe(Effect.catchTag("FakeLost", lost)),
      intent: (input) => shop.intent(input).pipe(Effect.catchTag("FakeLost", lost)),
      orderFor: (input) => shop.orderFor(input).pipe(Effect.catchTag("FakeLost", lost)),
    }),
  ),
);

const planted = samplesOf({
  id: "pay-planted",
  story: Story.app(shopSetup, { id: "pay-planted/samples", fixtures: [ResendingShopFake] }),
  names: { setup: "shopSetup", fixtures: ["ResendingShopFake"] },
  actors: { checkout },
  servers: { Shop },
  failures: [Shop.decline({ code: "card_declined" })],
  landedFailures: [],
  values: {},
  controls: [],
  steps: (story) =>
    story
      .send(checkout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
      .send(checkout, { _tag: "PayRequested", paymentMethodId: "visa" })
      .send(checkout, { _tag: "Done" }),
});

// The names a printed Story uses, in scope as the fixture's own module has them.
const scope = { Story, Fake, shopSetup, ResendingShopFake, checkout, Shop };

// Evaluates a printed Story's text as the fixture would, after pasting it.
// RETURN_TYPE: evaluated code has no type of its own; the text is a printed Story.
const pasted = (text: string): Story<string> =>
  // oxlint-disable-next-line typescript/no-implied-eval, no-new-func -- the test pastes the printed text as code, which is what it checks
  new Function(...Object.keys(scope), `return ${text}`)(...Object.values(scope));

describe("a planted fault found from a seed (WriteLanes I6)", () => {
  it("a port fake that re-sends a lost confirm under a fresh key is found from a seed, shrunk to under ten printed steps, and the printed text, run as code, breaks the same rule", async () => {
    const [failure, ...more] = propertyTest(planted, {
      profile: "stress",
      properties: rules,
      seeds: [5],
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
  });
});
