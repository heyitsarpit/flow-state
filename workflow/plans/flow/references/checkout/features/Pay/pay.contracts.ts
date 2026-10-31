// Paying: the contracts. Every commit reads its source's answer beside the call and classifies it with `Outcome`
// (2.7.1). Where the data comes from: adapters/shop-api.ts (our server, which talks to Stripe's API with our
// `Idempotency-Key`) and adapters/stripe.ts (Stripe.js in the page, which takes no AbortSignal).
//
// The one rule this file exists for: a payment whose answer was lost MAY have charged the card. It is never re-sent
// as a new write, and never reported as "not charged". The lane holds the Attempt (rule 18); the PAY machine first
// reads the intent (`intentStatus`, a reconcile lookup), and only then re-sends the SAME Attempt, whose
// `attempt.id` Stripe dedups (rule 19), or releases it because the read already says what happened.
import { Effect, Schema } from "effect";
import { Outcome, resource, transaction } from "flow-state";
import { OrderExists, ShopApi } from "../../adapters/shop-api.js";
import { Authorized, handleNextAction } from "../../adapters/stripe.js";
import { Intent, IntentStatus, Order, Receipt, ShippingSlot } from "../../adapters/types.js";
import { unknownWhenLost } from "../Cart/cart.contracts.js";

export const Confirmed = Schema.Struct({
  intentId: Schema.String,
  status: IntentStatus,
  clientSecret: Schema.String,
  afterUnsure: Schema.Boolean, // `attempt.mayHaveApplied`: the receipt's wording (O13)
});

// Confirming the payment intent with the card. `reject`: one confirm per intent at a time, so a double click is
// `NotSent { Rejected }` and nothing is sent twice (O3).
export const pay = transaction({
  id: "Checkout/pay",
  input: { intentId: Schema.String, paymentMethodId: Schema.String },
  output: Confirmed,
  key: ["intentId"],
  concurrency: "reject",
  // No `signal`: our server forwards the confirm to Stripe and does not stop when the page stops listening. The
  // commit can only stop waiting; the confirm, once sent, finishes on Stripe's side.
  commit: (input, { attempt }) =>
    ShopApi.use((api) => api.confirm(input, { idempotencyKey: attempt.id })).pipe(
      Effect.map((v) => ({ ...v, afterUnsure: attempt.mayHaveApplied })),
      Effect.catchTags({
        // The intent moved on. After an earlier unknown send of this same Attempt, "already authorized" is OUR
        // first send having landed: success, read with the write's history (O13).
        IntentBusy: (e) =>
          attempt.mayHaveApplied && (e.status === "requires_capture" || e.status === "succeeded")
            ? Outcome.success({
                intentId: input.intentId,
                status: e.status,
                clientSecret: "",
                afterUnsure: true,
              })
            : Outcome.failure(e),
      }),
      unknownWhenLost,
    ),
  // A lane persisted by an older build whose PAY operation is gone or renamed: re-send the same Attempt, which
  // Stripe answers from its idempotency record (O20, P8, P19). Never a new charge.
  orphaned: ({ attempt, retry }) => retry(attempt),
});

// The bank's challenge (3-D Secure), through Stripe.js. The customer answers it in the bank's frame; the Promise
// resolves when they finish, however long that takes. An `api_connection_error` is unknown: the bank may have
// recorded the answer.
export const authenticate = transaction({
  id: "Checkout/authenticate",
  input: { intentId: Schema.String, clientSecret: Schema.String },
  output: Authorized,
  key: ["intentId"],
  concurrency: "reject",
  commit: (input) =>
    handleNextAction(input.clientSecret).pipe(
      Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)),
    ),
});

// The reconcile read after an unknown confirm (R2): one lane, latest delivered. Never cached for long: its point is
// what Stripe says now.
export const intentStatus = resource({
  id: "Checkout/intent-status",
  input: { intentId: Schema.String },
  output: Intent,
  key: ["intentId"],
  lookup: (input, { signal }) => ShopApi.use((api) => api.intent(input, { signal })),
  staleTime: "0 millis",
  gcTime: "1 minute",
});

// The order our server created for this cart, if any: written by the webhook as soon as Stripe told it the card
// was authorized, so the reconcile has a second, independent witness.
export const orderForCart = resource({
  id: "Checkout/order-for-cart",
  input: { cartId: Schema.String },
  output: Schema.NullOr(Order),
  key: ["cartId"],
  lookup: (input, { signal }) => ShopApi.use((api) => api.orderFor(input, { signal })),
  staleTime: "0 millis",
  gcTime: "1 minute",
});

// Placing the order for an authorized intent. The webhook may have placed it first (Stripe delivers events, and
// sometimes twice, Y4): 409 with the order is "it exists", which is what the customer wanted.
export const placeOrder = transaction({
  id: "Checkout/place-order",
  input: { cartId: Schema.String, intentId: Schema.String },
  output: Receipt,
  key: ["cartId"],
  concurrency: "reject",
  commit: (input, { attempt, signal }) =>
    ShopApi.use((api) => api.placeOrder(input, { idempotencyKey: attempt.id, signal })).pipe(
      Effect.map((order) => ({ order, alreadyPlaced: false })),
      Effect.catchTag("OrderExists", (e: OrderExists) =>
        Outcome.success({ order: e.order, alreadyPlaced: true }),
      ),
      unknownWhenLost,
    ),
});

// Compensation: the customer left with an authorization and no order, so the hold on their card is voided (O20).
// The background capture job may have captured it first: `AlreadyCaptured` is definite on a first send, and
// `StillUnknown { AlreadyCaptured }` after a lost one (O12): then nobody can say the hold is gone.
export const voidAuthorization = transaction({
  id: "Checkout/void-authorization",
  input: { intentId: Schema.String },
  key: ["intentId"],
  concurrency: "reject",
  commit: (input, { attempt, signal }) =>
    ShopApi.use((api) => api.voidAuthorization(input, { idempotencyKey: attempt.id, signal })).pipe(
      unknownWhenLost,
    ),
  orphaned: ({ attempt, retry }) => retry(attempt),
});

// A shipping quote reserves a delivery slot for a postcode. `cancel`: a new address interrupts the one on the wire,
// because only the last address the customer typed matters (O8). The interrupted commit's server reservation
// expires on its own; the abort is honest (`signal`).
export const reserveShipping = transaction({
  id: "Checkout/reserve-shipping",
  input: { cartId: Schema.String, postcode: Schema.String },
  output: ShippingSlot,
  key: ["cartId"],
  concurrency: "cancel",
  commit: (input, { attempt, signal }) =>
    ShopApi.use((api) => api.reserveShipping(input, { idempotencyKey: attempt.id, signal })).pipe(
      unknownWhenLost,
    ),
});
