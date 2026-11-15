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
 * deadline passes; the tab reloads; then time moves on.
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
 * The shop turns a confirm away as busy with a negative retry delay: the turn that would arm that
 * retry is refused, refused again on its one redelivery, and given one more try after a reload.
 */
export const busyRefused = Story.app(shopSetup, { id: "pay/busy-refused", fixtures: [ShopFake] })
  .ensure(checkout)
  .send(checkout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .world(Shop.busy({ retryAfterMs: -1 }))
  .send(checkout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .checkpoint("refused")
  .reload()
  .checkpoint("reloaded");

/**
 * Every Story of the fixture, by name.
 */
export const stories = { lostConfirm, busyRefused };
