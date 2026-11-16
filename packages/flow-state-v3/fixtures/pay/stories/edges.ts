import { checkout } from "../machine.ts";
import { Shop } from "../server.ts";
import { shopStory } from "../stories.ts";

const visa = { _tag: "PayRequested", paymentMethodId: "visa" } as const;

const start = (n: number) =>
  ({ _tag: "Start", cartId: `c${String(n)}`, intentId: `pi${String(n)}` }) as const;

/**
 * The payment queue asks to retry after 0 ms, then after 2^31 - 1 ms, then after 2^31 ms: the
 * retry delays at the edge of a computed schedule's range.
 */
export const busyEdges = shopStory("pay/busy-edges")
  .ensure(checkout)
  .send(checkout, start(1))
  .world(Shop.busy({ retryAfterMs: 0 }))
  .send(checkout, visa)
  .advance("1 millis")
  .checkpoint("zero")
  .send(checkout, { _tag: "Done" })
  .send(checkout, start(2))
  .world(Shop.busy({ retryAfterMs: 2 ** 31 - 1 }))
  .send(checkout, visa)
  .checkpoint("longest")
  .send(checkout, { _tag: "Leave" })
  .send(checkout, start(3))
  .world(Shop.busy({ retryAfterMs: 2 ** 31 }))
  .send(checkout, visa)
  .checkpoint("past");
