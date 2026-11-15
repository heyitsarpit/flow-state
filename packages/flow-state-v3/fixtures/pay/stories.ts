import { Story } from "../../src/host/testing/index.ts";
import { actorRef, app, runtimeSetup } from "../../src/index.ts";
import { PayMachine } from "./machine.ts";
import { Shop, ShopFake } from "./server.ts";
import { ShopLive } from "./shop-http.ts";

/**
 * The checkout app: Pay alone.
 */
export const shop = app({ id: "shop", machines: { pay: PayMachine } });

/**
 * The checkout's real setup: the shop over HTTP, persisted, each capture written at once.
 */
export const shopSetup = runtimeSetup({
  app: shop,
  services: ShopLive("https://shop.example"),
  scope: "shop",
  persistence: { captureMs: 0 },
});

/**
 * The checkout the stories use.
 */
export const checkout = actorRef(PayMachine, "checkout-1");

/**
 * A `confirm` reaches the shop and its answer is held, never released; the commit's 60-second
 * deadline passes; the page reloads; then time moves on.
 */
export const lostConfirm = Story.app(shopSetup, { id: "pay/lost-confirm", fixtures: [ShopFake] })
  .ensure(checkout)
  .send(checkout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .world(Shop.confirm.hold({ at: "response" }))
  .send(checkout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .advance("59999 millis")
  .checkpoint("before deadline")
  .advance("1001 millis")
  .checkpoint("late")
  .reload()
  .checkpoint("reloaded")
  .advance("10 seconds")
  .checkpoint("after");

/**
 * Every Story of the fixture, by name.
 */
export const stories = { lostConfirm };
