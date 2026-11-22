import { Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";
import { Cart } from "./cart.ts";

/**
 * How many items the shopper sees in the cart: each line's quantity as last asked for, the answered
 * one where no edit waits.
 */
export const shownCount = ({
  lines,
  wanted,
}: {
  readonly lines: typeof Cart.M.lines.Type;
  readonly wanted: typeof Cart.M.wanted.Type;
}) => Object.entries(lines).reduce((sum, [id, line]) => sum + (wanted[id] ?? line.quantity), 0);

/**
 * The header's mini-cart: its lines as the cart holds them, for the dropdown, and the item count it
 * shows, which follows each edit before the cart service answers. It pulses when the count grows
 * and stays lit until the shopper opens it.
 */
export const CartPulse = definition({
  id: "Shop/CartPulse",
  persist: false,
  states: ["QUIET", "PULSING"],
  events: { Opened: {} },
  internalEvents: { Grew: {}, Counted: { count: Schema.Number } },
  memory: {
    pulses: Flow.initial(Schema.Number, 0),
    shown: Flow.initial(Schema.Number, 0),
  },
  context: {
    lines: Flow.context(Cart.M.lines),
    count: Flow.context(Schema.Number, {
      reads: { lines: Cart.M.lines, wanted: Cart.M.wanted },
      select: shownCount,
    }),
  },
});

/**
 * The mini-cart: a larger count pulses it; every count change is shown; opening it stops the
 * pulse.
 */
export const CartPulseMachine = machine(CartPulse, ({ S, E, C }) => ({
  default: S.QUIET,
  onContext: [
    C.count.change({
      when: (current, previous) => previous === undefined || current > previous,
      event: E.Grew,
    }),
    C.count.change({ event: E.Counted.from((count) => ({ count })) }),
  ],
  on: {
    Grew: { target: S.PULSING, updateMemory: ({ memory }) => ({ pulses: memory.pulses + 1 }) },
    Counted: { updateMemory: ({ event }) => ({ shown: event.count }) },
  },
  states: { PULSING: { on: { Opened: S.QUIET } } },
}));
