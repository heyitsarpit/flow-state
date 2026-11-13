// The summary column beside every pay step: lines, delivery and the Pay button. A WRITING trait at the pay screen's
// root: it owns the shipping quote (`reserveShipping`, `cancel`, O8), and it is fresh for each cart (`resetOn` with
// the cart id, a string as rule 48 requires of a writing placement, F13).
//
// The Pay button is the trait's event, and whether it is allowed is the host's policy, entered through an
// annotated guard port (F15, F19): a guest may pay up to a limit, and nobody pays before a delivery slot is
// reserved. The view asks `check()` for the reason (F21). The trait asks; the host pays (`onPay`): the payment is
// the host's write, because a payment's lane must outlive any one summary.
import { Schema } from "effect";
import { deny, Flow, trait } from "flow-state";
import { ShippingSlot } from "../../adapters/types.js";
import { reserveShipping } from "./pay.contracts.js";

export const OrderSummary = trait(
  {
    id: "OrderSummary",
    events: { PayPressed: { paymentMethodId: Schema.String } },
    hostEvents: { Quote: { postcode: Schema.String } },
    internalEvents: {
      Quoted: { slot: ShippingSlot },
      NotDeliverable: { postcode: Schema.String },
      QuoteFailed: {},
      QuoteUnsure: Flow.uncertain({}),
    },
    guards: {
      mayPay: Flow.annotate(Flow.Guard, {
        title: "May pay",
        description: "Whether this shopper may pay for this cart now.",
        denials: {
          GuestLimit: "Guests can pay up to $500. Sign in to pay more.",
        },
      }),
    },
    callbacks: {
      onPay: Flow.Callback({ paymentMethodId: Schema.String, shippingSlotId: Schema.String }),
    },
    memory: {
      cartId: Flow.input(Schema.String),
      shipping: Flow.initial(Schema.NullOr(ShippingSlot), null),
      problem: Flow.initial(Schema.NullOr(Schema.String), null),
    },
    operations: ({ E }) => ({
      shipping: reserveShipping.outcomes({
        success: E.Quoted.from((slot) => ({ slot })),
        failure: {
          NotDeliverable: E.NotDeliverable.from((e) => ({ postcode: e.postcode })),
          NotSent: E.QuoteFailed,
        },
        unknown: E.QuoteUnsure,
      }),
    }),
  },
  ({ O, guards, callbacks }) => ({
    on: {
      // Each postcode the customer types replaces the quote on the wire (`cancel`): the server's slot for a postcode
      // they moved past is interrupted, and expires on its own.
      Quote: {
        target: "self",
        updateMemory: () => ({ shipping: null, problem: null }),
        actions: [
          O.shipping.commit(({ memory, event }) => ({
            cartId: memory.cartId,
            postcode: event.postcode,
          })),
        ],
      },
      Quoted: { target: "self", updateMemory: ({ event }) => ({ shipping: event.slot }) },
      NotDeliverable: {
        target: "self",
        updateMemory: ({ event }) => ({ problem: `We don't deliver to ${event.postcode}` }),
      },
      QuoteFailed: {
        target: "self",
        updateMemory: () => ({ problem: "Couldn't get delivery options" }),
      },
      // An interrupted quote ends `unknown { Cancelled }`; a lost one, unknown too. Either way the slot expires on
      // the server, so the lane is released and the next postcode quotes again.
      // design gap: under `cancel`, a key-less `O.shipping.cancel` in an ending's handler is assumed to release that
      // ending's Attempt only (rule N2 states this for `allow`), not the newer quote on the wire.
      QuoteUnsure: { target: "self", actions: [O.shipping.cancel] },
      PayPressed: {
        target: "self",
        guard: [guards.mayPay, ({ memory }) => memory.shipping !== null || deny("NoDelivery")],
        notify: [
          callbacks.onPay.from(({ memory, event }) => ({
            paymentMethodId: event.paymentMethodId,
            shippingSlotId: memory.shipping?.slotId ?? "",
          })),
        ],
      },
    },
  }),
);
