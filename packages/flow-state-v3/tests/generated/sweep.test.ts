import { Effect, Layer, Ref } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { checkout, ShopApi, shopSetup } from "../../fixtures/pay/machine.ts";
import { Shop } from "../../fixtures/pay/server.ts";
import {
  type Cell,
  type FakeWorld,
  pairSweep,
  samplesOf,
  Story,
} from "../../src/host/testing/index.ts";
import { rules } from "../rules/rules.ts";

const lost = () => Effect.fail({ _tag: "NoResponse" } as const);

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
        .send(checkout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
        .send(checkout, { _tag: "PayRequested", paymentMethodId: "visa" })
        .send(checkout, { _tag: "Leave" })
        .send(checkout, { _tag: "Done" }),
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
        ).pipe(
          Effect.map(([, confirmed]) => confirmed),
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
              ? shop
                  .confirm({ ...input, key: idempotencyKey })
                  .pipe(Effect.catchTag("FakeLost", lost))
              : lost(),
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

const SEEDS = Array.from({ length: 200 }, (_, n) => n + 1);

const cellAt = (cells: ReadonlyArray<Cell>, phase: string, fault: string) =>
  cells.find((c) => c.phase === phase && c.fault === fault)?.outcome;

describe("the pair sweep gives each fault to the write it drove (Testing O6)", () => {
  it("a lost answer loses the write's own call, not another call held beside it", () => {
    const cells = pairSweep(over("pay-peeking", PeekingShopFake, "PeekingShopFake"), {
      properties: rules,
      seeds: SEEDS,
    });

    const lostAnswer = cellAt(cells, "OnWire", "lost answer");

    expect(lostAnswer?._tag).toBe("Reached");
    expect(lostAnswer !== undefined && "story" in lostAnswer ? lostAnswer.story : "").toContain(
      "Shop.confirm.lose()",
    );
  }, 120_000);

  it("a fault is given only while the write still stands in the phase when the drive is replayed", () => {
    const cells = pairSweep(over("pay-first-only", FirstOnlyShopFake, "FirstOnlyShopFake"), {
      properties: rules,
      seeds: SEEDS,
    });

    const onWire = cells.filter((c) => c.phase === "OnWire");

    expect(
      onWire.map((c) => [c.fault, "why" in c.outcome ? c.outcome.why : c.outcome._tag]),
    ).toEqual(onWire.map((c) => [c.fault, "the drive did not replay to the phase"]));
  }, 120_000);
});
