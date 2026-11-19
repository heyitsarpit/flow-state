import { Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";
import { Cart, itemsIn } from "./cart.ts";

/**
 * The header's cart badge: it shows how many items its cart holds, read as context, and bumps
 * each time that count changes.
 */
export const CartBadge = definition({
  id: "Shop/CartBadge",
  persist: false,
  states: ["SHOWN"],
  events: {},
  internalEvents: { CountChanged: { count: Schema.Number } },
  memory: { bumps: Flow.initial(Schema.Number, 0) },
  context: {
    cart: Flow.context(Schema.Number, {
      reads: { lines: Cart.M.lines },
      select: ({ lines }) => itemsIn(lines),
    }),
  },
});

/**
 * The badge: a changed count is one bump.
 */
export const CartBadgeMachine = machine(CartBadge, ({ S, E, C }) => ({
  default: S.SHOWN,
  onContext: [C.cart.change({ event: E.CountChanged.from((count) => ({ count })) })],
  on: { CountChanged: { updateMemory: ({ memory }) => ({ bumps: memory.bumps + 1 }) } },
}));
