import { Schema } from "effect";
import { actorRef, definition, Flow, machine, send } from "../../../src/index.ts";
import { Pay, PayMachine } from "../../services/shop/machines/pay.ts";

/**
 * A weekly box subscription: the card it renews with and how many weeks it has renewed.
 */
export const Subscription = definition({
  id: "Shop/Subscription",
  persist: true,
  states: ["OFF", "ACTIVE"],
  events: { Subscribe: { paymentMethodId: Schema.String }, Cancel: {} },
  internalEvents: { Due: {} },
  memory: {
    paymentMethodId: Flow.initial(Schema.String, ""),
    renewals: Flow.initial(Schema.Number, 0),
  },
});

const toPay = () => actorRef(PayMachine, "renewal");

/**
 * The subscription: once subscribed, every week it tells its renewal's Pay the card on file, then
 * to pay with it. It reads nothing of that Pay, so the Pay ends, is forgotten or is disposed on its
 * own.
 */
export const SubscriptionMachine = machine(Subscription, ({ S, E }) => ({
  default: S.OFF,
  states: {
    OFF: {
      on: {
        Subscribe: {
          target: S.ACTIVE,
          updateMemory: ({ event }) => ({ paymentMethodId: event.paymentMethodId }),
        },
      },
    },
    ACTIVE: {
      schedules: { renew: { schedule: "7 days", send: E.Due, armOn: [Flow.entry, E.Due] } },
      on: {
        Due: {
          updateMemory: ({ memory }) => ({ renewals: memory.renewals + 1 }),
          actions: [
            send(
              toPay,
              Pay.E.CardChosen.from(({ memory }) => ({ paymentMethodId: memory.paymentMethodId })),
            ),
            send(
              toPay,
              Pay.E.PayRequested.from(({ memory }) => ({
                paymentMethodId: memory.paymentMethodId,
              })),
            ),
          ],
        },
        Cancel: S.OFF,
      },
    },
  },
}));
