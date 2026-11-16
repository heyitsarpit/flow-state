import { cellsCheckout } from "../machine.ts";
import { cellsStory } from "../stories.ts";

const visa = { _tag: "PayRequested", paymentMethodId: "visa" } as const;

// The bytes `{"intentId":""}` adds around an intent id in its key's canonical text.
const KEY_FRAME = 15;

const KEY_BOUND = 8192;

const paidWith = (id: string, intentId: string) =>
  cellsStory(id)
    .ensure(cellsCheckout)
    .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId })
    .send(cellsCheckout, visa);

/**
 * A cart and intent with empty ids.
 */
export const emptyIds = cellsStory("cells/empty-ids")
  .ensure(cellsCheckout)
  .send(cellsCheckout, { _tag: "Start", cartId: "", intentId: "" })
  .send(cellsCheckout, visa)
  .checkpoint("paid");

/**
 * An intent id whose key's canonical text is exactly the 8,192-byte key bound.
 */
export const keyAtBound = paidWith(
  "cells/key-at-bound",
  "p".repeat(KEY_BOUND - KEY_FRAME),
).checkpoint("paid");

/**
 * An intent id one byte past the key bound.
 */
export const keyPastBound = paidWith(
  "cells/key-past-bound",
  "p".repeat(KEY_BOUND - KEY_FRAME + 1),
).checkpoint("refused");
