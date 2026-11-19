import { cellsCheckout } from "../app.ts";
import { Cells } from "../machines/cells.ts";
import { cellsStory } from "./usual.ts";

const visa = Cells.E.PayRequested({ paymentMethodId: "visa" });

// A key well past any id a real payment provider issues.
const LONG_ID = 100_000;

const paidWith = (id: string, intentId: string) =>
  cellsStory(id)
    .ensure(cellsCheckout)
    .send(cellsCheckout, Cells.E.Start({ cartId: "c1", intentId }))
    .send(cellsCheckout, visa);

/**
 * A cart and intent with empty ids.
 */
export const emptyIds = cellsStory("cells/empty-ids")
  .ensure(cellsCheckout)
  .send(cellsCheckout, Cells.E.Start({ cartId: "", intentId: "" }))
  .send(cellsCheckout, visa)
  .checkpoint("paid");

/**
 * An intent id of 100,000 characters, the key of `pay`.
 */
export const longKey = paidWith("cells/long-key", "p".repeat(LONG_ID)).checkpoint("paid");
