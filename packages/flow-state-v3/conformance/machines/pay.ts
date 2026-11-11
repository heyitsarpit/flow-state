import { Schema } from "effect";
import { definition, deny, Flow, machine } from "../../src/index.ts";
import type { MachineBody } from "../../src/machine.ts";
import {
  type AlreadyCaptured,
  type Busy,
  capturableStatus,
  type CardDeclined,
  type Confirmed,
  type Intent,
  intentStatus,
  orderForCart,
  pay,
  placeOrder,
  voidAuthorization,
} from "./pay.contracts.ts";

export { ShopApi } from "./pay.contracts.ts";

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

/**
 * Checkout's Pay definition (the real Pay's signed-in subset, as `prototypes/conformance/typed/pay.ts`
 * holds it), in the production API.
 */
export const Pay = definition({
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
        Busy: E.Busy.from((e: Busy) => ({ retryAfterMs: e.retryAfterMs ?? 1000 })),
        IntentBusy: E.PayRefused.from(() => ({
          reason: "This payment changed elsewhere. Refresh to continue.",
        })),
        NotSent: E.PayNotSent.from((e: { readonly why: string }) => ({ why: e.why })),
      },
      unknown: E.PayUnsure,
    }),
    place: placeOrder.outcomes({
      success: E.Placed.from(
        (r: { readonly order: { readonly orderId: string }; readonly alreadyPlaced: boolean }) => ({
          orderId: r.order.orderId,
          alreadyPlaced: r.alreadyPlaced,
        }),
      ),
      failure: { NotSent: E.PlaceRefused },
      unknown: E.PlaceUnsure,
    }),
    void: voidAuthorization.outcomes({
      success: E.Voided,
      failure: {
        AlreadyCaptured: E.VoidRefused.from((e: AlreadyCaptured) => ({ chargeId: e.chargeId })),
        NotSent: E.Voided,
      },
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
});

type Memory = {
  readonly intentId: string;
  readonly cartId: string;
  readonly paymentMethodId: string | null;
};

const capturable = ({ event }: { readonly event: { readonly status: string } }) =>
  capturableStatus(event.status) || deny("NotAuthorized");

const MAX_BUSY_TRIES = 3;

const intent = ({ memory }: { readonly memory: Memory }) => ({ intentId: memory.intentId });

const cart = ({ memory }: { readonly memory: Memory }) => ({
  cartId: memory.cartId,
  intentId: memory.intentId,
});

const withCard = ({
  memory,
  event,
}: {
  readonly memory: Memory;
  readonly event: { readonly paymentMethodId: string };
}) => ({
  intentId: memory.intentId,
  paymentMethodId: event.paymentMethodId,
});

// RETURN_TYPE: the machine body's contract types every handler's event and memory.
const payBody = ({
  S,
  E,
  O,
}: {
  readonly S: typeof Pay.S;
  readonly E: typeof Pay.E;
  readonly O: typeof Pay.O;
}): MachineBody<typeof Pay> => {
  const start = {
    target: S.CARD,
    updateMemory: ({
      event,
    }: {
      readonly event: { readonly cartId: string; readonly intentId: string };
    }) => ({
      cartId: event.cartId,
      intentId: event.intentId,
      address: savedAddress,
      receipt: null,
      authorized: false,
      afterUnsure: false,
      busyTries: 0,
      notice: "",
    }),
  };

  const requiresAction = ({ event }: { readonly event: { readonly status: string } }) =>
    event.status === "requires_action" || deny("NoChallenge");

  // The real Pay's 3-D Secure alternatives, with their CHALLENGE target outside this subset: each
  // keeps the real guard and actions and stays (the real Pay's pay.machine.ts).
  const payingChallenge = {
    guard: [requiresAction],
    updateMemory: ({ event }: { readonly event: { readonly clientSecret: string } }) => ({
      clientSecret: event.clientSecret,
    }),
  };

  const unsureChallenge = {
    guard: [
      requiresAction,
      ({ memory }: { readonly memory: { readonly clientSecret: string | null } }) =>
        memory.clientSecret !== null || deny("NoClientSecret"),
    ],
    actions: [O.pay.cancel(intent)],
  };

  return {
    default: S.IDLE,
    on: {
      PayRequested: [
        { guard: [S.PAYING], actions: [O.pay.commit(withCard)] },
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
            notice:
              "We couldn't confirm the hold was released. Your bank releases it within 7 days.",
          }),
          actions: [O.void.cancel],
        },
      ],
    },
    states: {
      IDLE: { on: { Start: start } },
      PAYING: {
        schedules: { slow: { schedule: "8 seconds", send: E.CheckTick } },
        on: {
          CheckTick: { updateMemory: () => ({ notice: "Still confirming with your bank…" }) },
          Confirmed: [
            payingChallenge,
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
          check: { schedule: "3 seconds", send: E.CheckTick, armOn: [Flow.entry, "CheckTick"] },
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
            unsureChallenge,
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
      PAID: { on: { Start: start, Done: { target: S.IDLE } } },
      STUCK: { on: { CheckAgain: { target: S.UNSURE } } },
      LEFT: { on: { Start: start } },
    },
  };
};

/**
 * Checkout's Pay machine in the production API.
 *
 * **Details**
 *
 * The real machine's 3-D Secure alternatives (a `requires_action` intent, which goes to its
 * CHALLENGE state) are outside this subset; each keeps its place, its guard and its actions and
 * stays, so every other alternative's place matches the real Pay's.
 */
export const PayMachine = machine(Pay, payBody);

/**
 * Pay with one more root event, `AbortPay`, which cancels `pay` (the suite's `cells` fixture,
 * `prototypes/conformance/typed/cells.ts`).
 */
export const Cells = definition({
  id: Pay.id,
  persist: true,
  states: Pay.states,
  events: { ...Pay.events, AbortPay: {} },
  internalEvents: Pay.internalEvents,
  memory: Pay.memory,
  operations: () => Pay.operations,
});

/**
 * The `cells` machine: Pay's handlers, and `AbortPay` cancelling the intent's `pay`.
 */
export const CellsMachine = machine(Cells, (tokens) => {
  const base = payBody(tokens);

  return {
    ...base,
    on: { ...base.on, AbortPay: { actions: [tokens.O.pay.cancel(intent)] } },
  };
});
