import { Option, Schema } from "effect";
import { definition, deny, Flow, machine } from "../../../src/index.ts";
import { capturableStatus } from "../../services/shop/services.ts";
import { intentStatus, orderForCart } from "../../services/shop/operations/reads.ts";
import { pay, placeOrder, voidAuthorization } from "../../services/shop/operations/writes.ts";

const Address = Schema.Struct({
  name: Schema.String,
  line1: Schema.String,
  postcode: Schema.String,
  email: Schema.String,
});

const emptyAddress = { name: "", line1: "", postcode: "", email: "" };

const savedAddress = {
  name: "Ada Lovelace",
  line1: "12 Canal St",
  postcode: "N1 9GU",
  email: "ada@example.com",
};

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
      success: E.Confirmed.from((v) => v),
      failure: {
        CardDeclined: E.Declined.from((e) => ({ code: e.code })),
        Busy: E.Busy.from((e) => ({
          retryAfterMs: retryHintOf(Option.fromUndefinedOr(e.retryAfterMs)),
        })),
        IntentBusy: E.PayRefused.from(() => ({
          reason: "This payment changed elsewhere. Refresh to continue.",
        })),
      },
      notSent: E.PayNotSent.from((e) => ({ why: e.why })),
      unknown: E.PayUnsure,
    }),
    place: placeOrder.outcomes({
      success: E.Placed.from((r) => ({
        orderId: r.order.orderId,
        alreadyPlaced: r.alreadyPlaced,
      })),
      failure: {},
      notSent: E.PlaceRefused,
      unknown: E.PlaceUnsure,
    }),
    void: voidAuthorization.outcomes({
      success: E.Voided,
      failure: {
        AlreadyCaptured: E.VoidRefused.from((e) => ({ chargeId: e.chargeId })),
      },
      notSent: E.Voided,
      unknown: E.VoidUnsure,
    }),
    intent: intentStatus.outcomes({
      success: E.IntentRead.from((v) => ({ status: v.status })),
      failure: {
        NoResponse: E.IntentReadFailed,
        ServerError: E.IntentReadFailed,
        Defect: E.IntentReadFailed,
        Interrupted: E.IntentReadFailed,
      },
    }),
    order: orderForCart.outcomes({
      // oxlint-disable-next-line lint-bomb/no-nullish-function-contracts -- the shop API answers null for a cart with no order; this mapper is where that answer is read
      success: E.OrderSeen.from((o) => ({
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

const MAX_BUSY_TRIES = 3;

const capturable = ({ event }: { readonly event: typeof Cells.E.IntentRead.Type }) =>
  capturableStatus(event.status) || deny("NotAuthorized");

const intent = ({ memory }: { readonly memory: typeof Cells.Memory.Type }) => ({
  intentId: memory.intentId,
});

const cart = ({ memory }: { readonly memory: typeof Cells.Memory.Type }) => ({
  cartId: memory.cartId,
  intentId: memory.intentId,
});

const withCard = ({
  memory,
  event,
}: {
  readonly memory: typeof Cells.Memory.Type;
  readonly event: typeof Cells.E.PayRequested.Type;
}) => ({ intentId: memory.intentId, paymentMethodId: event.paymentMethodId });

/**
 * The `cells` machine: Pay's handlers, and `AbortPay` cancelling the intent's `pay`.
 */
export const CellsMachine = machine(Cells, ({ S, E, O }) => ({
  default: S.IDLE,
  on: {
    AbortPay: { actions: [O.pay.cancel(intent)] },
    PayRequested: [
      {
        guard: [S.PAYING],
        actions: [O.pay.commit(withCard)],
      },
      {
        target: S.PAYING,
        updateMemory: ({ event }) => ({ paymentMethodId: event.paymentMethodId, notice: "" }),
        actions: [O.pay.commit(withCard)],
      },
    ],
    CartLoaded: { updateMemory: ({ event }) => ({ totalCents: event.totalCents }) },
    CardChosen: { updateMemory: ({ event }) => ({ paymentMethodId: event.paymentMethodId }) },
    Leave: [
      {
        target: S.LEFT,
        guard: [
          ({ memory }) => (memory.authorized && memory.receipt === null) || deny("NothingHeld"),
        ],
        actions: [O.void.commit(intent)],
      },
      { target: S.LEFT },
    ],
    Confirmed: [
      {
        guard: [S.LEFT, capturable],
        updateMemory: () => ({ authorized: true }),
        actions: [O.void.commit(intent)],
      },
      {
        target: S.PLACING,
        guard: [S.IDLE, capturable],
        updateMemory: () => ({ authorized: true }),
        actions: [O.place.commit(cart)],
      },
      {},
    ],
    PayUnsure: [
      {
        guard: [S.LEFT],
        updateMemory: () => ({ notice: "Your bank may still show a pending charge." }),
      },
      { target: S.UNSURE },
    ],
    Declined: {},
    Busy: {},
    PayRefused: {},
    PayNotSent: {},
    IntentRead: {},
    IntentReadFailed: {},
    OrderSeen: {},
    CheckTick: {},
    Placed: {
      target: S.PAID,
      updateMemory: ({ memory, event }) => ({
        receipt: {
          orderId: event.orderId,
          afterUnsure: memory.afterUnsure,
          alreadyPlaced: event.alreadyPlaced,
        },
        authorized: false,
      }),
    },
    PlaceRefused: { updateMemory: () => ({ notice: "We couldn't place the order. Try again." }) },
    PlaceUnsure: [
      { guard: [O.place.retryable({ times: 3 })], actions: [O.place.retry] },
      { target: S.STUCK },
    ],
    Voided: {
      updateMemory: () => ({ authorized: false, notice: "The hold on your card was released." }),
    },
    VoidRefused: {
      updateMemory: () => ({
        notice: "Your payment was captured before you left. We'll be in touch.",
      }),
    },
    VoidUnsure: [
      { guard: [O.void.retryable({ times: 3 })], actions: [O.void.retry] },
      {
        updateMemory: () => ({
          notice: "We couldn't confirm the hold was released. Your bank releases it within 7 days.",
        }),
        actions: [O.void.cancel],
      },
    ],
  },
  states: {
    IDLE: {
      on: {
        Start: {
          target: S.CARD,
          updateMemory: ({ event }) => ({
            cartId: event.cartId,
            intentId: event.intentId,
            address: savedAddress,
            receipt: null,
            authorized: false,
            afterUnsure: false,
            busyTries: 0,
            notice: "",
          }),
        },
      },
    },
    PAYING: {
      schedules: { slow: { schedule: "8 seconds", send: E.CheckTick } },
      on: {
        CheckTick: { updateMemory: () => ({ notice: "Still confirming with your bank…" }) },
        Confirmed: [
          {
            guard: [({ event }) => event.status === "requires_action" || deny("NoChallenge")],
            updateMemory: ({ event }) => ({ clientSecret: event.clientSecret }),
          },
          {
            target: S.PLACING,
            guard: [capturable],
            updateMemory: ({ event }) => ({
              authorized: true,
              afterUnsure: event.afterUnsure,
              notice: "",
            }),
            actions: [O.place.commit(cart)],
          },
          {
            target: S.CARD,
            updateMemory: () => ({ notice: "Your bank didn't authorize the payment." }),
          },
        ],
        Declined: {
          target: S.CARD,
          updateMemory: ({ event }) => ({ notice: `Your card was declined (${event.code}).` }),
        },
        Busy: [
          {
            target: S.WAITING,
            guard: [({ memory }) => memory.busyTries < MAX_BUSY_TRIES || deny("TooBusy")],
            updateMemory: ({ memory, event }) => ({
              busyTries: memory.busyTries + 1,
              retryInMs: event.retryAfterMs,
            }),
          },
          {
            target: S.CARD,
            updateMemory: () => ({ notice: "Payments are busy. Try again in a minute." }),
          },
        ],
        PayRefused: { target: S.CARD, updateMemory: ({ event }) => ({ notice: event.reason }) },
        PayNotSent: [
          { guard: [({ event }) => event.why === "Rejected" || deny("NotADoubleClick")] },
          {
            target: S.CARD,
            updateMemory: () => ({
              notice: "Your payment wasn't sent. You haven't been charged.",
            }),
          },
        ],
        PayUnsure: { target: S.UNSURE, updateMemory: () => ({ afterUnsure: true }) },
      },
    },
    WAITING: {
      schedules: { retry: { schedule: ({ memory }) => memory.retryInMs, send: E.RetryNow } },
      on: {
        RetryNow: [
          {
            target: S.PAYING,
            guard: [O.pay.idle(intent)],
            actions: [
              O.pay.commit(({ memory }) => ({
                intentId: memory.intentId,
                paymentMethodId: memory.paymentMethodId ?? "",
              })),
            ],
          },
          {},
        ],
      },
    },
    UNSURE: {
      schedules: {
        check: { schedule: "3 seconds", send: E.CheckTick, armOn: [Flow.entry, E.CheckTick] },
      },
      on: {
        CheckTick: {
          actions: [
            O.intent.lookup(intent),
            O.order.lookup(({ memory }) => ({ cartId: memory.cartId })),
          ],
        },
        IntentRead: [
          {
            target: S.PLACING,
            guard: [capturable],
            updateMemory: () => ({ authorized: true }),
            actions: [O.pay.cancel(intent), O.place.commit(cart)],
          },
          {
            guard: [
              ({ event }) => event.status === "requires_action" || deny("NoChallenge"),
              ({ memory }) => memory.clientSecret !== null || deny("NoClientSecret"),
            ],
            actions: [O.pay.cancel(intent)],
          },
          {
            target: S.PAYING,
            guard: [
              ({ event }) => event.status === "requires_payment_method" || deny("Moved"),
              O.pay.retryable(intent, { times: 3 }),
            ],
            actions: [O.pay.retry(intent)],
          },
          {},
        ],
        OrderSeen: [
          {
            target: S.PAID,
            guard: [({ event }) => event.orderId !== "" || deny("NoOrder")],
            updateMemory: ({ event }) => ({
              receipt: { orderId: event.orderId, afterUnsure: true, alreadyPlaced: true },
            }),
            actions: [O.intent.cancel, O.pay.cancel(intent)],
          },
          {},
        ],
        PayUnsure: {},
      },
    },
    PAID: {
      on: {
        Start: {
          target: S.CARD,
          updateMemory: ({ event }) => ({
            cartId: event.cartId,
            intentId: event.intentId,
            address: savedAddress,
            receipt: null,
            authorized: false,
            afterUnsure: false,
            busyTries: 0,
            notice: "",
          }),
        },
        Done: { target: S.IDLE },
      },
    },
    STUCK: { on: { CheckAgain: { target: S.UNSURE } } },
    LEFT: {
      on: {
        Start: {
          target: S.CARD,
          updateMemory: ({ event }) => ({
            cartId: event.cartId,
            intentId: event.intentId,
            address: savedAddress,
            receipt: null,
            authorized: false,
            afterUnsure: false,
            busyTries: 0,
            notice: "",
          }),
        },
      },
    },
  },
}));
