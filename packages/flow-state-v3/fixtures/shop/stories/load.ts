import { cartOf, mainCart, shopperOf } from "../app.ts";
import { Carts } from "../server/carts.ts";
import { add, setQuantity, storeStory } from "./usual.ts";

/**
 * Three quick quantity clicks on one line while the first is on the wire.
 */
export const quantityClicks = storeStory("shop/quantity-clicks")
  .ensure(mainCart)
  .send(mainCart, add("l1", "v1"))
  .world(Carts.setQuantity.hold({ at: "response" }))
  .send(mainCart, setQuantity("l1", 2))
  .send(mainCart, setQuantity("l1", 3))
  .send(mainCart, setQuantity("l1", 4))
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
      .send(shopperOf(n), { _tag: "SignIn", name: `s${String(n)}` })
      .ensure(cartOf(n));

    const lossy = n % 4 === 3 ? signedIn.world(Carts.addLine.drop({ at: "response" })) : signedIn;

    return lossy.send(cartOf(n), add(`l${String(n)}`, "v1"));
  }, storeStory("shop/stress-many-shoppers"))
  .checkpoint("end");
