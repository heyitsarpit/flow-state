import { Schema } from "effect";
import { actorRef, definition, deny, Flow, machine, send } from "../../../src/index.ts";
import { Pay, PayMachine } from "../../services/shop/machines/pay.ts";
import { Cart, itemsIn, waiting } from "./cart.ts";
import { Shopper } from "./shopper.ts";

/**
 * A cart's checkout steps: address, then shipping (a method, then a delivery slot), then pay. It
 * reads its cart's item count and whether the cart still waits on the cart service, its shopper's
 * name, and the state of the checkout's Pay, as context.
 */
export const CheckoutFlow = definition({
  id: "Shop/CheckoutFlow",
  persist: true,
  states: ["BROWSING", "ADDRESS", { SHIPPING: ["METHOD", "SLOT"] }, "PAY", "DONE"],
  events: {
    Begin: {},
    AddressEntered: { line1: Schema.String },
    MethodChosen: { method: Schema.String },
    SlotChosen: { slot: Schema.String },
    Back: {},
    PayWith: { paymentMethodId: Schema.String },
  },
  internalEvents: {
    CartChanged: { count: Schema.Number },
    ShopperChanged: { name: Schema.String },
    PaymentChanged: { state: Schema.String },
  },
  memory: {
    cartId: Flow.input(Schema.String),
    shopperName: Flow.initial(Schema.String, ""),
    line1: Flow.initial(Schema.String, ""),
    method: Flow.initial(Schema.String, ""),
    slot: Flow.initial(Schema.String, ""),
  },
  context: {
    count: Flow.context(Schema.Number, {
      reads: { lines: Cart.M.lines },
      select: ({ lines }) => itemsIn(lines),
    }),
    busy: Flow.context(Schema.Boolean, {
      reads: { adding: Cart.M.adding, wanted: Cart.M.wanted },
      select: waiting,
    }),
    shopper: Flow.context(Shopper.M.name),
    payment: Flow.context(Pay.state),
  },
});

const toPay = () => actorRef(PayMachine, "checkout-1");

/**
 * The checkout flow: Begin, reading the cart through its context, is denied on an empty cart or one
 * still waiting on the cart service; a cart emptied mid-checkout returns it to browsing; Back from
 * pay re-enters shipping at the step it left, by history; the checkout's Pay reaching PAID ends it.
 * Paying with a card tells the checkout's Pay the card, then to pay with it.
 */
export const CheckoutFlowMachine = machine(CheckoutFlow, ({ S, E, C }) => ({
  default: S.BROWSING,
  onContext: [
    C.count.change({ event: E.CartChanged.from((count) => ({ count })) }),
    C.shopper.change({ event: E.ShopperChanged.from((name) => ({ name })) }),
    C.payment.change({ event: E.PaymentChanged.from((state) => ({ state })) }),
  ],
  on: {
    CartChanged: [
      { target: S.BROWSING, guard: [({ event }) => event.count === 0 || deny("CartNotEmpty")] },
      {},
    ],
    ShopperChanged: { updateMemory: ({ event }) => ({ shopperName: event.name }) },
    PaymentChanged: [
      { target: S.DONE, guard: [({ event }) => event.state === "PAID" || deny("NotPaid")] },
      {},
    ],
  },
  states: {
    BROWSING: {
      on: {
        Begin: {
          target: S.ADDRESS,
          guard: [
            ({ context }) => (context.count ?? 0) > 0 || deny("EmptyCart"),
            ({ context }) => context.busy !== true || deny("CartBusy"),
          ],
        },
      },
    },
    ADDRESS: {
      on: {
        AddressEntered: {
          target: S.SHIPPING,
          updateMemory: ({ event }) => ({ line1: event.line1 }),
        },
        Back: S.BROWSING,
      },
    },
    SHIPPING: {
      default: S.SHIPPING.METHOD,
      states: {
        METHOD: {
          on: {
            MethodChosen: {
              target: S.SHIPPING.SLOT,
              updateMemory: ({ event }) => ({ method: event.method }),
            },
            Back: S.ADDRESS,
          },
        },
        SLOT: {
          on: {
            SlotChosen: { target: S.PAY, updateMemory: ({ event }) => ({ slot: event.slot }) },
            Back: S.SHIPPING.METHOD,
          },
        },
      },
    },
    PAY: {
      on: {
        Back: S.SHIPPING.history,
        PayWith: {
          actions: [
            send(
              toPay,
              Pay.E.CardChosen.from(({ event }) => ({ paymentMethodId: event.paymentMethodId })),
            ),
            send(
              toPay,
              Pay.E.PayRequested.from(({ event }) => ({ paymentMethodId: event.paymentMethodId })),
            ),
          ],
        },
      },
    },
    DONE: {},
  },
}));
