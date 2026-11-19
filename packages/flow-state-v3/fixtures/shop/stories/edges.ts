import { checkout } from "../app.ts";
import { Shop } from "../../services/shop/server/shop.ts";
import { Pay } from "../../services/shop/machines/pay.ts";
import { shopStory } from "./usual.ts";

const visa = Pay.E.PayRequested({ paymentMethodId: "visa" });

const start = (n: number) => Pay.E.Start({ cartId: `c${String(n)}`, intentId: `pi${String(n)}` });

/**
 * The payment queue asks to retry after 0 ms, then after 2^31 - 1 ms, then after 2^31 ms: the
 * retry delays at the edge of a computed schedule's range.
 */
export const busyEdges = shopStory("shop/busy-edges")
  .ensure(checkout)
  .send(checkout, start(1))
  .world(Shop.busy({ retryAfterMs: 0 }))
  .send(checkout, visa)
  .advance("1 millis")
  .checkpoint("zero")
  .send(checkout, Pay.E.Done())
  .send(checkout, start(2))
  .world(Shop.busy({ retryAfterMs: 2 ** 31 - 1 }))
  .send(checkout, visa)
  .checkpoint("longest")
  .send(checkout, Pay.E.Leave())
  .send(checkout, start(3))
  .world(Shop.busy({ retryAfterMs: 2 ** 31 }))
  .send(checkout, visa)
  .checkpoint("past");
