// One part used, a copy per entry of the wizard's parts list (F4: `.each` over memory, pure). It validates its
// quantity against the stock the lookup found and owns nothing else; the wizard owns the list.
import { Schema } from "effect";
import { deny, Flow, trait } from "flow-state";

export const PartLine = trait(
  {
    id: "PartLine",
    events: { SetQuantity: { quantity: Schema.Int }, Remove: {} },
    callbacks: { onRemove: Flow.Callback({ partNumber: Schema.String }) },
    memory: {
      partNumber: Flow.input(Schema.String),
      available: Flow.input(Schema.NullOr(Schema.Int)), // null: the lookup failed, so the line is unvalidated (R4)
      quantity: Flow.initial(Schema.Int, 1),
    },
  },
  ({ callbacks }) => ({
    on: {
      SetQuantity: {
        target: "self",
        guard: [
          ({ event }) => event.quantity >= 1 || deny("AtLeastOne"),
          ({ memory, event }) =>
            memory.available === null ||
            event.quantity <= memory.available ||
            deny("NotEnough", { available: memory.available }),
        ],
        updateMemory: ({ event }) => ({ quantity: event.quantity }),
      },
      Remove: {
        target: "self",
        notify: [callbacks.onRemove.from(({ memory }) => ({ partNumber: memory.partNumber }))],
      },
    },
  }),
);
