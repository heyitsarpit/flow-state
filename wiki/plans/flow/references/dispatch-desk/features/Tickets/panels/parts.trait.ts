// The Parts tab: what the technician takes for this ticket, held for fifteen minutes. Resumable (placed with
// `.resumable()` on its tab node): switching tab freezes it with its nested hold, and the hold's deadline survives.
import { Schema } from "effect";
import { deny, Flow, trait } from "flow-state";
import { Reservation } from "./reservation.trait.js";

export const PartsPanel = trait(
  {
    id: "PartsPanel",
    events: { Reserve: { partNumber: Schema.String }, ReleaseAll: {} },
    memory: {
      ticketId: Flow.input(Schema.String),
      reserved: Flow.initial(Schema.Array(Schema.String), []),
      expired: Flow.initial(Schema.Boolean, false),
    },
    traits: { reservation: Reservation({ length: "15 minutes" }) },
  },
  ({ E }) => ({
    traits: {
      reservation: {
        callbacks: {
          onExpired: { target: "self", updateMemory: () => ({ reserved: [], expired: true }) },
        },
      },
    },
    on: {
      // The first part starts the hold; later ones join it (Start re-arms only from a stopped hold).
      Reserve: [
        {
          target: "self",
          guard: [({ memory }) => memory.reserved.length === 0 || deny("HoldRunning")],
          updateMemory: ({ event }) => ({ reserved: [event.partNumber], expired: false }),
          raise: [E.reservation.Start],
        },
        {
          target: "self",
          updateMemory: ({ memory, event }) => ({
            reserved: [...memory.reserved, event.partNumber],
          }),
        },
      ],
      ReleaseAll: {
        target: "self",
        updateMemory: () => ({ reserved: [] }),
        raise: [E.reservation.Stop],
      },
    },
  }),
);
