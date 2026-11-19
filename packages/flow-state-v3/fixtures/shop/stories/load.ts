import { cartOf, mainCart, shopperOf } from "../app.ts";
import { Carts } from "../server/carts.ts";
import { Cart } from "../machines/cart.ts";
import { Shopper } from "../machines/shopper.ts";
import { storeStory } from "./usual.ts";
import { opened } from "./context.ts";

/**
 * Three quick quantity clicks on one line while the first is on the wire.
 */
export const quantityClicks = storeStory("shop/quantity-clicks")
  .ensure(mainCart)
  .send(mainCart, Cart.E.Add({ lineId: "l1", variantId: "v1" }))
  .world(Carts.setQuantity.hold({ at: "response" }))
  .send(mainCart, Cart.E.SetQuantity({ lineId: "l1", quantity: 2 }))
  .send(mainCart, Cart.E.SetQuantity({ lineId: "l1", quantity: 3 }))
  .send(mainCart, Cart.E.SetQuantity({ lineId: "l1", quantity: 4 }))
  .checkpoint("clicked")
  .world(Carts.setQuantity.release())
  .checkpoint("settled");

const SHOPPERS = 64;

/**
 * 64 shoppers sign in and each adds a line to their own cart; every fourth add's answer is lost
 * after the server applied it.
 */
export const manyShoppers = Array.from({ length: SHOPPERS }, (_, n) => n)
  .reduce((story, n) => {
    const signedIn = story
      .ensure(shopperOf(n))
      .send(shopperOf(n), Shopper.E.SignIn({ name: `s${String(n)}` }))
      .ensure(cartOf(n));

    const lossy = n % 4 === 3 ? signedIn.world(Carts.addLine.drop({ at: "response" })) : signedIn;

    return lossy.send(cartOf(n), Cart.E.Add({ lineId: `l${String(n)}`, variantId: "v1" }));
  }, storeStory("shop/stress-many-shoppers"))
  .checkpoint("end");

/**
 * How many quantity edits the mini-cart's burst sends: a first guess, re-measured on the bench.
 */
export const BURST = 64;

/**
 * One line, then BURST quick edits raising it by one each while the first edit's answer is held
 * (L5): every edit is a larger count, so each is one pulse and one shown count; the answers then
 * change nothing the mini-cart shows.
 */
export const pulseBurst = Array.from({ length: BURST }, (_, n) => n + 2)
  .reduce(
    (story, quantity) => story.send(mainCart, Cart.E.SetQuantity({ lineId: "l1", quantity })),
    opened("shop/stress-pulse-burst")
      .send(mainCart, Cart.E.Add({ lineId: "l1", variantId: "v1" }))
      .world(Carts.setQuantity.hold({ at: "response" })),
  )
  .checkpoint("burst")
  .world(Carts.setQuantity.release())
  .checkpoint("answered");

/**
 * How many lines the mini-cart's large cart holds (E3): a first guess, re-measured on the bench.
 */
export const LARGE = 1000;

/**
 * A cart of LARGE lines, each added and answered in turn: the mini-cart's lines and count follow
 * every one. Built on call and kept out of `stories`, since the reload sweep would run it once per
 * step.
 */
export const largePulse = () =>
  Array.from({ length: LARGE }, (_, n) => `l${String(n)}`)
    .reduce(
      (story, lineId) => story.send(mainCart, Cart.E.Add({ lineId, variantId: "v1" })),
      opened("shop/stress-pulse-large"),
    )
    .checkpoint("full");
