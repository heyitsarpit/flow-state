import { Effect, Layer, Ref } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { checkout, shopSetup } from "../../fixtures/shop/app.ts";
import { Pay } from "../../fixtures/services/shop/machines/pay.ts";
import { NoResponse, ShopApi } from "../../fixtures/services/shop/services.ts";
import { Shop } from "../../fixtures/services/shop/server/shop.ts";
import {
  type Cell,
  type FakeWorld,
  PHASES,
  pairSweep,
  samplesOf,
  Story,
} from "../../src/host/testing/index.ts";
import { rules } from "../rules/rules.ts";
import { LIMITS } from "../limits.ts";

// Pay's samples over another port fake, so the sweep drives the same app over a different edge.
const over = (id: string, fake: Layer.Layer<ShopApi, never, FakeWorld>, name: string) =>
  samplesOf({
    id,
    story: Story.app(shopSetup, { id: `${id}/samples`, fixtures: [fake] }),
    names: { setup: "shopSetup", fixtures: [name] },
    actors: { checkout },
    servers: { Shop },
    failures: [Shop.decline({ code: "card_declined" })],
    landedFailures: [],
    values: {},
    controls: [],
    steps: (story) =>
      story
        .send(checkout, Pay.E.Start({ cartId: "c1", intentId: "pi1" }))
        .send(checkout, Pay.E.PayRequested({ paymentMethodId: "visa" }))
        .send(checkout, Pay.E.Leave())
        .send(checkout, Pay.E.Done()),
  });

// A port fake whose confirm reads the intent at the same time as it sends, so a read call is held
// beside the write's own call.
const PeekingShopFake = Layer.effect(
  ShopApi,
  Effect.map(Shop, (shop) =>
    ShopApi.of({
      confirm: (input, { idempotencyKey }) =>
        Effect.all(
          [
            shop.intent({ intentId: input.intentId }),
            shop.confirm({ ...input, key: idempotencyKey }),
          ],
          { concurrency: "unbounded" },
        ).pipe(Effect.map(([, confirmed]) => confirmed)),
      placeOrder: (input, { idempotencyKey }) => shop.placeOrder({ ...input, key: idempotencyKey }),
      voidAuthorization: (input, { idempotencyKey }) =>
        shop.voidAuthorization({ ...input, key: idempotencyKey }),
      intent: shop.intent,
      orderFor: shop.orderFor,
    }),
  ),
);

// A port fake that does not replay: only the first confirm of the whole sweep reaches the shop;
// every later one is lost at once, so a cell's replay of the drive never puts a confirm on the wire.
const confirms = Ref.makeUnsafe(0);

const FirstOnlyShopFake = Layer.effect(
  ShopApi,
  Effect.map(Shop, (shop) =>
    ShopApi.of({
      confirm: (input, { idempotencyKey }) =>
        Effect.flatMap(
          Ref.getAndUpdate(confirms, (n) => n + 1),
          (before) =>
            before === 0
              ? shop.confirm({ ...input, key: idempotencyKey })
              : Effect.fail(new NoResponse()),
        ),
      placeOrder: (input, { idempotencyKey }) => shop.placeOrder({ ...input, key: idempotencyKey }),
      voidAuthorization: (input, { idempotencyKey }) =>
        shop.voidAuthorization({ ...input, key: idempotencyKey }),
      intent: shop.intent,
      orderFor: shop.orderFor,
    }),
  ),
);

const SEEDS = Array.from({ length: 200 }, (_, n) => n + 1);

const cellAt = (cells: ReadonlyArray<Cell>, phase: string, fault: string) =>
  cells.find((c) => c.phase === phase && c.fault === fault)?.outcome;

describe("the pair sweep gives each fault to the write it drove (Testing O6)", () => {
  it(
    "a lost answer loses the write's own call, not another call held beside it",
    () => {
      const cells = pairSweep(over("pay-peeking", PeekingShopFake, "PeekingShopFake"), {
        properties: rules,
        seeds: SEEDS,
        stopAt: PHASES,
      });

      const lostAnswer = cellAt(cells, "OnWire", "lost answer");

      expect(lostAnswer?._tag).toBe("Reached");
      expect(lostAnswer !== undefined && "story" in lostAnswer ? lostAnswer.story : "").toContain(
        "Shop.confirm.lose()",
      );
    },
    LIMITS.pairSweepTool,
  );

  it(
    "a fault is given only while the write still stands in the phase when the drive is replayed",
    () => {
      const cells = pairSweep(over("pay-first-only", FirstOnlyShopFake, "FirstOnlyShopFake"), {
        properties: rules,
        seeds: SEEDS,
        stopAt: PHASES,
      });

      const onWire = cells.filter((c) => c.phase === "OnWire");

      expect(
        onWire.map((c) => [c.fault, "why" in c.outcome ? c.outcome.why : c.outcome._tag]),
      ).toEqual(onWire.map((c) => [c.fault, "the drive did not replay to the phase"]));
    },
    LIMITS.pairSweepTool,
  );
});
