import { Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";
import { cart } from "../operations/reads.ts";
import { quickAdd } from "../operations/writes.ts";
import { Lines } from "../services.ts";

/**
 * The header's mini cart: which cart it shows and its lines as last read.
 */
export const MiniCart = definition({
  id: "Shop/MiniCart",
  states: ["SHOWN", "CLOSED"],
  events: {
    Show: { cartId: Schema.String },
    Add: { lineId: Schema.String, variantId: Schema.String },
    Close: {},
    Open: {},
  },
  internalEvents: {
    Read: { lines: Lines },
    Unread: {},
    Added: {},
    AddFailed: {},
    AddUnsure: Flow.uncertain({}),
  },
  memory: {
    cartId: Flow.initial(Schema.String, "cart-1"),
    lines: Flow.initial(Lines, {}),
    notice: Flow.initial(Schema.String, ""),
  },
  operations: ({ E }) => ({
    cart: cart.outcomes({
      value: E.Read.from((v) => ({ lines: v.lines })),
      failure: { NoResponse: E.Unread, Defect: E.Unread, Interrupted: E.Unread },
    }),
    quickAdd: quickAdd.outcomes({
      success: E.Added,
      failure: { SoldOut: E.AddFailed },
      unknown: E.AddUnsure,
    }),
  }),
});

/**
 * The mini cart places the cart it shows while open; an add, from the mini cart or from a product
 * page while it is closed, shows its line at once as an optimistic value on the cart and is
 * invalidated when the server answers, so the cart is read again.
 */
export const MiniCartMachine = machine(MiniCart, ({ S, O }) => ({
  default: S.SHOWN,
  on: {
    Show: { updateMemory: ({ event }) => ({ cartId: event.cartId }) },
    Add: {
      actions: [
        O.quickAdd.commit(
          ({ memory, event }) => ({
            cartId: memory.cartId,
            lineId: event.lineId,
            variantId: event.variantId,
          }),
          {
            optimistic: ({ memory, event }) => [
              cart.update({ cartId: memory.cartId }, (current) => ({
                lines: {
                  ...current.lines,
                  [event.lineId]: { variantId: event.variantId, quantity: 1 },
                },
              })),
            ],
          },
        ),
      ],
    },
    Added: { actions: [O.cart.invalidate(({ memory }) => ({ cartId: memory.cartId }))] },
    AddFailed: { updateMemory: () => ({ notice: "sold out" }) },
    AddUnsure: { updateMemory: () => ({ notice: "checking your cart" }) },
  },
  states: {
    SHOWN: {
      activities: [O.cart.subscribe(({ memory }) => ({ cartId: memory.cartId }))],
      on: {
        Read: { updateMemory: ({ event }) => ({ lines: event.lines }) },
        Unread: { updateMemory: () => ({ notice: "cart unavailable" }) },
        Close: S.CLOSED,
      },
    },
    CLOSED: { on: { Open: S.SHOWN } },
  },
}));
