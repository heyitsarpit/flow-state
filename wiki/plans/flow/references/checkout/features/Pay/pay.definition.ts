// The checkout: address, card, the bank's challenge, and the receipt. One actor per shopper, persisted, because a
// payment on the wire must survive a closed tab and a reload (rules 44, 46).
//
// How this module is different (COVERAGE.md 5.3): its commit is a payment, where a blind re-send is the bug. The
// confirm carries `Idempotency-Key: attempt.id` through our server to Stripe; an unknown answer is reconciled with a
// read before anything is sent again (`intentStatus`, R2), and the order exists only once (`placeOrder`, a 409 is
// success). Stripe.js is a commit that cannot be aborted (O2). 3-D Secure is a subroutine with exits and a visible
// `Countdown` (F8–F12, F18); leaving with an authorization voids it (compensation, O20); the summary resets per cart
// and waits for its own write (F13). Guests and signed-in customers get different steps (F22).
//
// Where each ending goes. Every ending is handled at the root too, because a new incarnation adopts the lane in any
// leaf (rule 44): the receipt appears even when the tab was closed mid-payment and opened again (O14).
import { Schema } from "effect";
import { definition, Flow } from "flow-state";
import { Address, IntentStatus } from "../../adapters/types.js";
import { CartDomain } from "../Cart/cart.domain.js";
import { Shopper } from "../Shopper/shopper.definition.js";
import { AddressStep } from "./address.subroutine.js";
import { OrderSummary } from "./order-summary.trait.js";
import {
  authenticate,
  intentStatus,
  orderForCart,
  pay,
  placeOrder,
  voidAuthorization,
} from "./pay.contracts.js";
import { ThreeDS } from "./three-ds.subroutine.js";

export const emptyAddress: typeof Address.Type = { name: "", line1: "", postcode: "", email: "" };

export const Pay = definition({
  id: "Checkout/Pay",
  states: [
    "IDLE",
    { ADDRESS: AddressStep },
    "CARD",
    "PAYING", // the confirm is on the wire
    "WAITING", // Stripe said Busy: nothing happened; try again after a pause (a new write)
    { CHALLENGE: ThreeDS },
    "UNSURE", // the confirm's answer was lost: reconcile before anything else
    "PLACING",
    "PAID",
    "STUCK", // still unknown after the budget: never "not charged"
    "LEFT", // the shopper left with no order: void whatever authorization lands
  ],
  events: {
    CardChosen: { paymentMethodId: Schema.String },
    Leave: {},
    CheckAgain: {},
    Done: {},
    // The app hands the checkout a cart (the cart page's Checkout button, or "buy again" after a receipt).
    Start: { cartId: Schema.String, intentId: Schema.String },
  },
  internalEvents: {
    CartLoaded: { totalCents: Schema.Int },
    Confirmed: { status: IntentStatus, clientSecret: Schema.String, afterUnsure: Schema.Boolean },
    Declined: { code: Schema.String },
    Busy: { retryAfterMs: Schema.Number },
    PayRefused: { reason: Schema.String },
    PayNotSent: { why: Schema.String },
    PayUnsure: Flow.uncertain({}),
    RetryNow: {},
    CheckTick: {},
    IntentRead: { status: IntentStatus },
    IntentReadFailed: {},
    OrderSeen: { orderId: Schema.String },
    Authenticated: { authId: Schema.String },
    AuthFailed: { code: Schema.String },
    AuthUnsure: Flow.uncertain({}),
    Placed: { orderId: Schema.String, alreadyPlaced: Schema.Boolean },
    PlaceRefused: {},
    PlaceUnsure: Flow.uncertain({}),
    Voided: {},
    VoidRefused: { chargeId: Schema.String },
    VoidUnsure: Flow.uncertain({}),
  },
  context: {
    signedIn: Shopper.select(({ memory }) => memory.customerId !== null),
    savedAddress: Shopper.select(({ memory }) => memory.savedAddress),
  },
  memory: {
    cartId: Flow.initial(Schema.String, ""),
    intentId: Flow.initial(Schema.String, ""),
    totalCents: Flow.initial(Schema.Int, 0),
    address: Flow.initial(Address, emptyAddress),
    addressDraft: Flow.initial(Address, emptyAddress),
    paymentMethodId: Flow.initial(Schema.NullOr(Schema.String), null),
    clientSecret: Flow.initial(Schema.NullOr(Schema.String), null),
    busyTries: Flow.initial(Schema.Int, 0),
    retryInMs: Flow.initial(Schema.Number, 0),
    afterUnsure: Flow.initial(Schema.Boolean, false), // this payment's answer was lost once
    authorized: Flow.initial(Schema.Boolean, false), // an authorization exists on the card (void it if we leave)
    // The receipt's wording: "Paid" or "Your bank confirmed the payment we weren't sure about" (O13).
    receipt: Flow.initial(
      Schema.NullOr(
        Schema.Struct({
          orderId: Schema.String,
          afterUnsure: Schema.Boolean,
          alreadyPlaced: Schema.Boolean,
        }),
      ),
      null,
    ),
    notice: Flow.initial(Schema.String, ""),
  },
  traits: { summary: OrderSummary },
  operations: ({ E }) => ({
    cart: CartDomain.cart.outcomes({
      value: E.CartLoaded.from((cart) => ({ totalCents: cart.totalCents })),
      failure: {
        NoResponse: E.IntentReadFailed,
        Defect: E.IntentReadFailed,
        Interrupted: E.IntentReadFailed,
      },
    }),
    pay: pay.outcomes({
      success: E.Confirmed.from((v) => ({
        status: v.status,
        clientSecret: v.clientSecret,
        afterUnsure: v.afterUnsure,
      })),
      failure: {
        CardDeclined: E.Declined.from((e) => ({ code: e.code })),
        Busy: E.Busy.from((e) => ({ retryAfterMs: e.retryAfterMs ?? 1_000 })),
        IntentBusy: E.PayRefused.from(() => ({
          reason: "This payment changed elsewhere. Refresh to continue.",
        })),
        NotSent: E.PayNotSent.from((e) => ({ why: e.why })),
      },
      unknown: E.PayUnsure, // StillUnknown arrives here too (rule 18)
    }),
    authenticate: authenticate.outcomes({
      success: E.Authenticated.from((v) => ({ authId: v.intentId })),
      failure: {
        ChallengeFailed: E.AuthFailed.from((e) => ({ code: e.code })),
        NotSent: E.AuthFailed.from(() => ({ code: "not_sent" })),
      },
      unknown: E.AuthUnsure,
    }),
    intent: intentStatus.outcomes({
      success: E.IntentRead.from((intent) => ({ status: intent.status })),
      failure: {
        NoResponse: E.IntentReadFailed,
        Defect: E.IntentReadFailed,
        Interrupted: E.IntentReadFailed,
      },
    }),
    order: orderForCart.outcomes({
      value: E.OrderSeen.from((order) => ({ orderId: order?.orderId ?? "" })),
      failure: {
        NoResponse: E.IntentReadFailed,
        Defect: E.IntentReadFailed,
        Interrupted: E.IntentReadFailed,
      },
    }),
    place: placeOrder.outcomes(
      {
        success: E.Placed.from((r) => ({
          orderId: r.order.orderId,
          alreadyPlaced: r.alreadyPlaced,
        })),
        failure: { NotSent: E.PlaceRefused },
        unknown: E.PlaceUnsure,
      },
      // The merchant's orders list and the cart are stale the moment an order exists (O22).
      { writes: ({ input }) => [CartDomain.cart.invalidate({ cartId: input.cartId })] },
    ),
    void: voidAuthorization.outcomes({
      success: E.Voided,
      failure: {
        AlreadyCaptured: E.VoidRefused.from((e) => ({ chargeId: e.chargeId })),
        NotSent: E.Voided,
      },
      unknown: E.VoidUnsure, // `StillUnknown { AlreadyCaptured }` after a lost first send (O12)
    }),
  }),
});
