// The header's mini-cart: a count and a remove button per line, on the same cart. A second actor, so its remove
// and the cart page's quantity change are two actors' writes on ONE record: the record queue orders their sends
// (rule 29, E12), and both screens show one line (E7).
import { Schema } from "effect";
import { definition, Flow, machine } from "flow-state";
import { CartDomain } from "./cart.domain.js";

export const MiniCart = definition({
  id: "Checkout/MiniCart",
  states: ["OPEN"],
  events: { Remove: { lineId: Schema.String } },
  internalEvents: { Removed: {}, RemoveUnsure: Flow.uncertain({}) },
  memory: { cartId: Flow.input(Schema.String) },
  operations: ({ E }) => ({
    cart: CartDomain.cart, // bare: the header reads the records
    removeLine: CartDomain.removeLine.outcomes({
      success: E.Removed,
      failure: { LineGone: E.Removed, NotSent: E.Removed },
      unknown: E.RemoveUnsure,
    }),
  }),
});

export const MiniCartMachine = machine(MiniCart, ({ S, O }) => ({
  default: S.OPEN,
  activities: [O.cart.subscribe(({ memory }) => ({ cartId: memory.cartId }))],
  on: {
    Remove: {
      target: "self",
      guard: [
        O.removeLine.idle(({ memory, event }) => ({ cartId: memory.cartId, lineId: event.lineId })),
      ],
      actions: [
        O.removeLine.commit(({ memory, event }) => ({
          cartId: memory.cartId,
          lineId: event.lineId,
        })),
      ],
    },
    Removed: { target: "self" },
    RemoveUnsure: { target: "self", actions: [O.removeLine.cancel] },
  },
  states: { OPEN: {} },
}));
