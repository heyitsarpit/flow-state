import { Option, Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";
import { payBody } from "../../services/shop/machines/pay.ts";
import { intentStatus, orderForCart } from "../../services/shop/operations/reads.ts";
import {
  type Confirmed,
  pay,
  placeOrder,
  voidAuthorization,
} from "../../services/shop/operations/writes.ts";
import type { AlreadyCaptured, Busy, CardDeclined, Intent } from "../../services/shop/services.ts";

const Address = Schema.Struct({
  name: Schema.String,
  line1: Schema.String,
  postcode: Schema.String,
  email: Schema.String,
});

const emptyAddress = { name: "", line1: "", postcode: "", email: "" };

const Receipt = Schema.Struct({
  orderId: Schema.String,
  afterUnsure: Schema.Boolean,
  alreadyPlaced: Schema.Boolean,
});

// A busy answer's retry hint, 1 s when it gives none; a negative hint is one the client cannot
// read, so mapping it throws, as a parser does.
const retryHintOf = (hint: Option.Option<number>) => {
  if (Option.exists(hint, (ms) => ms < 0))
    throw new Error(`unreadable retry hint ${String(Option.getOrUndefined(hint))}`);

  return Option.getOrElse(hint, () => 1000);
};

/**
 * Pay with one more root event, `AbortPay`, which cancels `pay`. It keeps Pay's machine id, so an
 * app holds one of the two.
 */
export const Cells = definition({
  id: "Checkout/Pay",
  persist: true,
  states: ["IDLE", "CARD", "PAYING", "WAITING", "UNSURE", "PLACING", "PAID", "STUCK", "LEFT"],
  events: {
    CardChosen: { paymentMethodId: Schema.String },
    PayRequested: { paymentMethodId: Schema.String },
    Leave: {},
    CheckAgain: {},
    Done: {},
    Start: { cartId: Schema.String, intentId: Schema.String },
    AbortPay: {},
  },
  internalEvents: {
    CartLoaded: { totalCents: Schema.Number },
    Confirmed: { status: Schema.String, clientSecret: Schema.String, afterUnsure: Schema.Boolean },
    Declined: { code: Schema.String },
    Busy: { retryAfterMs: Schema.Number },
    PayRefused: { reason: Schema.String },
    PayNotSent: { why: Schema.String },
    PayUnsure: Flow.uncertain({}),
    RetryNow: {},
    CheckTick: {},
    IntentRead: { status: Schema.String },
    IntentReadFailed: {},
    OrderSeen: { orderId: Schema.String },
    Placed: { orderId: Schema.String, alreadyPlaced: Schema.Boolean },
    PlaceRefused: {},
    PlaceUnsure: Flow.uncertain({}),
    Voided: {},
    VoidRefused: { chargeId: Schema.String },
    VoidUnsure: Flow.uncertain({}),
  },
  memory: {
    cartId: Flow.initial(Schema.String, ""),
    intentId: Flow.initial(Schema.String, ""),
    totalCents: Flow.initial(Schema.Number, 0),
    address: Flow.initial(Address, emptyAddress),
    addressDraft: Flow.initial(Address, emptyAddress),
    paymentMethodId: Flow.initial(Schema.NullOr(Schema.String), null),
    clientSecret: Flow.initial(Schema.NullOr(Schema.String), null),
    busyTries: Flow.initial(Schema.Number, 0),
    retryInMs: Flow.initial(Schema.Number, 0),
    afterUnsure: Flow.initial(Schema.Boolean, false),
    authorized: Flow.initial(Schema.Boolean, false),
    receipt: Flow.initial(Schema.NullOr(Receipt), null),
    notice: Flow.initial(Schema.String, ""),
  },
  operations: ({ E }) => ({
    pay: pay.outcomes({
      success: E.Confirmed.from((v: Confirmed) => v),
      failure: {
        CardDeclined: E.Declined.from((e: CardDeclined) => ({ code: e.code })),
        Busy: E.Busy.from((e: Busy) => ({
          retryAfterMs: retryHintOf(Option.fromUndefinedOr(e.retryAfterMs)),
        })),
        IntentBusy: E.PayRefused.from(() => ({
          reason: "This payment changed elsewhere. Refresh to continue.",
        })),
      },
      notSent: E.PayNotSent.from((e: { readonly why: string }) => ({ why: e.why })),
      unknown: E.PayUnsure,
    }),
    place: placeOrder.outcomes({
      success: E.Placed.from(
        (r: { readonly order: { readonly orderId: string }; readonly alreadyPlaced: boolean }) => ({
          orderId: r.order.orderId,
          alreadyPlaced: r.alreadyPlaced,
        }),
      ),
      failure: {},
      notSent: E.PlaceRefused,
      unknown: E.PlaceUnsure,
    }),
    void: voidAuthorization.outcomes({
      success: E.Voided,
      failure: {
        AlreadyCaptured: E.VoidRefused.from((e: AlreadyCaptured) => ({ chargeId: e.chargeId })),
      },
      notSent: E.Voided,
      unknown: E.VoidUnsure,
    }),
    intent: intentStatus.outcomes({
      success: E.IntentRead.from((v: Intent) => ({ status: v.status })),
      failure: {
        NoResponse: E.IntentReadFailed,
        ServerError: E.IntentReadFailed,
        Defect: E.IntentReadFailed,
        Interrupted: E.IntentReadFailed,
      },
    }),
    order: orderForCart.outcomes({
      // oxlint-disable-next-line lint-bomb/no-nullish-function-contracts -- the shop API answers null for a cart with no order; this mapper is where that answer is read
      success: E.OrderSeen.from((o: { readonly orderId: string } | null) => ({
        orderId: o?.orderId ?? "",
      })),
      failure: {
        NoResponse: E.IntentReadFailed,
        ServerError: E.IntentReadFailed,
        Defect: E.IntentReadFailed,
        Interrupted: E.IntentReadFailed,
      },
    }),
  }),
  schedules: { slow: {}, retry: {}, check: {} },
});

/**
 * The `cells` machine: Pay's handlers, and `AbortPay` cancelling the intent's `pay`.
 */
export const CellsMachine = machine(Cells, (tokens) => {
  const base = payBody(tokens);

  return {
    ...base,
    on: {
      ...base.on,
      AbortPay: {
        actions: [tokens.O.pay.cancel(({ memory }) => ({ intentId: memory.intentId }))],
      },
    },
  };
});
