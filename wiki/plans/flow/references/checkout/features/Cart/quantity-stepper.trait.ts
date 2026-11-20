// The "− 2 +" control on one cart line: a pure copy per line (F4: `.each` over memory, here the cart's line ids),
// which owns no write. It asks; the host writes (the cart's `setQuantity`), so one lane per line stays the host's.
// A view sends `E.steppers.key(lineId).Increment()` from that line's own button (F7).
import { Schema } from "effect";
import { deny, Flow, trait } from "flow-state";

export const MAX_QUANTITY = 9;

export const QuantityStepper = trait(
  {
    id: "QuantityStepper",
    events: { Increment: {}, Decrement: {} },
    callbacks: {
      onChange: Flow.Callback({ quantity: Schema.Int }),
      onRemoveAsked: Flow.Callback({}), // "−" at one: the host asks first (ConfirmRemove)
    },
    memory: { quantity: Flow.input(Schema.Int) },
  },
  ({ callbacks }) => ({
    on: {
      Increment: {
        target: "self",
        guard: ({ memory }) =>
          memory.quantity < MAX_QUANTITY || deny("AtMost", { max: MAX_QUANTITY }),
        updateMemory: ({ memory }) => ({ quantity: memory.quantity + 1 }),
        notify: [callbacks.onChange.from(({ memory }) => ({ quantity: memory.quantity + 1 }))],
      },
      Decrement: [
        {
          target: "self",
          guard: ({ memory }) => memory.quantity > 1 || deny("AtOne"),
          updateMemory: ({ memory }) => ({ quantity: memory.quantity - 1 }),
          notify: [callbacks.onChange.from(({ memory }) => ({ quantity: memory.quantity - 1 }))],
        },
        { target: "self", notify: [callbacks.onRemoveAsked] },
      ],
    },
  }),
);
