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

/**
 * The shop turns a held charge away as busy with a retry delay past 2^31 - 1 ms, so the turn that would
 * arm the retry is refused, refused again on its one redelivery, and then kept; an hour passes
 * with no reload.
 */
export const busyKeptAnHour = shopStory("shop/busy-kept-an-hour")
  .ensure(checkout)
  .send(checkout, start(1))
  .world(Shop.confirm.hold())
  .send(checkout, visa)
  .checkpoint("before")
  .world(Shop.busy({ retryAfterMs: 2 ** 31 }), Shop.confirm.release())
  .checkpoint("refused")
  .advance("1 hour")
  .checkpoint("later");
