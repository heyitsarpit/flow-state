import { Schema } from "effect";
import { actorRef, definition, Flow, machine, send } from "../../../src/index.ts";
import { House, HouseMachine } from "./house.ts";

const home = () => actorRef(HouseMachine, "home");

/**
 * A planned trip, named by its name: booking it records when the household returns, in Runtime
 * Clock milliseconds.
 */
export const Trip = definition({
  id: "Home/Trip",
  persist: true,
  states: ["PLANNED", "BOOKED"],
  events: { Book: { returns: Schema.Number } },
  memory: { name: Flow.input(Schema.String), returns: Flow.initial(Schema.Number, 0) },
});

/**
 * The trip: booking it puts the house on vacation until the trip's return.
 */
export const TripMachine = machine(Trip, ({ S }) => ({
  default: S.PLANNED,
  states: {
    PLANNED: {
      on: {
        Book: {
          target: S.BOOKED,
          updateMemory: ({ event }) => ({ returns: event.returns }),
          actions: [
            send(
              home,
              House.E.StartVacation.from(({ event }) => ({ until: event.returns })),
            ),
          ],
        },
      },
    },
  },
}));
