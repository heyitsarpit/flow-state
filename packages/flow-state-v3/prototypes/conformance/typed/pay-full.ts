// Round 11: `fixtures/pay-full.compiled.ts` from the public API. The real Pay with what round 1 flattened away: its summary trait (order-summary.trait.ts),
// its 3-D Secure subroutine (three-ds.subroutine.ts) with the nested resumable Countdown, and `authenticate`. The rest is typed Pay's body (`pay.ts`),
// the same bugs pinned. The hand file's stated gaps stay: `reserveShipping` is `latest`; no ADDRESS; PayRequested beside the summary's `onPay`.
import { Context, Schema } from "effect";
import type { Api } from "../fake-world.ts";
import { payFullFixture as handPayFull } from "../fixtures/pay-full.compiled.ts";
import { definition, deny, Flow, fragment, labHostOp, machine, servicesFor, transaction } from "./flow.ts";
import { call, FakeApi, write } from "./lab.ts";
import {
  Address,
  capturable,
  emptyAddress,
  intentStatus,
  MAX_BUSY_TRIES,
  orderForCart,
  pay,
  placeOrder,
  Receipt,
  savedAddress,
  shopFrom,
  voidAuthorization,
  type AlreadyCaptured,
  type Busy,
  type CardDeclined,
  type Intent,
} from "./pay.ts";
import { ThreeDS } from "./threeds.ts";

const S = Schema;
const U = S.Unknown;
// The summary trait's own write, on the fake world (the hand fixture's `api.call("shipping")`).
const shipping = transaction({
  id: "Checkout/reserve-shipping",
  input: { cartId: S.String, postcode: S.String },
  key: ["cartId"],
  concurrency: "latest",
  services: [FakeApi],
  commit: write<unknown, "NotDeliverable">("shipping"),
});
const OrderSummary = fragment(
  {
    id: "OrderSummary",
    events: { PayPressed: { paymentMethodId: S.String } },
    hostEvents: { Quote: { postcode: S.String } },
    internalEvents: { Quoted: { slot: U }, NotDeliverable: { postcode: U }, QuoteFailed: {}, QuoteUnsure: {} },
    guards: { mayPay: Flow.Guard },
    callbacks: { onPay: Flow.Callback({ paymentMethodId: S.String, shippingSlotId: S.String }) },
    memory: { cartId: Flow.input(S.String), shipping: Flow.initial(U, null), problem: Flow.initial(U, null) },
    operations: ({ E }) => ({
      shipping: shipping.outcomes({
        success: E.Quoted.from((slot) => ({ slot })),
        failure: { NotDeliverable: E.NotDeliverable.from((e) => ({ postcode: (e as { readonly postcode?: unknown }).postcode })), NotSent: E.QuoteFailed },
        unknown: E.QuoteUnsure,
      }),
    }),
  },
  ({ O, guards, callbacks }) => ({
    on: {
      Quote: { updateMemory: () => ({ shipping: null, problem: null }), actions: [O.shipping.commit(({ memory, event }: { readonly memory: { readonly cartId: string }; readonly event: { readonly postcode: string } }) => ({ cartId: memory.cartId, postcode: event.postcode }))] },
      Quoted: { updateMemory: ({ event }) => ({ shipping: event.slot }) },
      NotDeliverable: { updateMemory: ({ event }) => ({ problem: `We don't deliver to ${String(event.postcode)}` }) },
      QuoteFailed: { updateMemory: () => ({ problem: "Couldn't get delivery options" }) },
      QuoteUnsure: { actions: [O.shipping.cancel] },
      PayPressed: {
        guard: [guards.mayPay, ({ memory }) => memory.shipping !== null || deny("NoDelivery")],
        notify: [
          callbacks.onPay.from(({ memory, event }: { readonly memory: { readonly shipping: unknown }; readonly event: { readonly paymentMethodId: string } }) => ({
            paymentMethodId: event.paymentMethodId,
            shippingSlotId: (memory.shipping as { readonly slotId?: string } | null)?.slotId ?? "",
          })),
        ],
      },
    },
  }),
);
const authenticate = transaction({
  id: "Checkout/authenticate",
  input: { intentId: S.String, clientSecret: S.String },
  key: ["intentId"],
  concurrency: "reject",
  services: [FakeApi],
  commit: write<{ readonly intentId?: string }, "ChallengeFailed">("authenticate"),
});
const PayFull = definition({
  id: "Checkout/Pay",
  states: { IDLE: {}, CARD: {}, PAYING: {}, WAITING: {}, UNSURE: {}, PLACING: {}, PAID: {}, STUCK: {}, LEFT: {}, CHALLENGE: {} },
  events: {
    CardChosen: { paymentMethodId: S.String },
    PayRequested: { paymentMethodId: S.String },
    Leave: {},
    CheckAgain: {},
    Done: {},
    Start: { cartId: S.String, intentId: S.String },
  },
  internalEvents: {
    CartLoaded: { totalCents: S.Int },
    Confirmed: { status: S.String, clientSecret: S.String, afterUnsure: S.Boolean },
    Declined: { code: S.String },
    Busy: { retryAfterMs: S.Number },
    PayRefused: { reason: S.String },
    PayNotSent: { why: S.String },
    PayUnsure: {},
    RetryNow: {},
    CheckTick: {},
    IntentRead: { status: S.String },
    IntentReadFailed: {},
    OrderSeen: { orderId: S.String },
    Placed: { orderId: S.String, alreadyPlaced: S.Boolean },
    PlaceRefused: {},
    PlaceUnsure: {},
    Voided: {},
    VoidRefused: { chargeId: S.String },
    VoidUnsure: {},
    Quoted: {}, // the hand host lists its trait's event at the root, unguarded; kept, so `flow check` reads the same machine
    Authenticated: { authId: S.String },
    AuthFailed: { code: S.String },
    AuthUnsure: {},
  },
  memory: {
    cartId: Flow.initial(S.String, ""),
    intentId: Flow.initial(S.String, ""),
    totalCents: Flow.initial(S.Number, 0),
    address: Flow.initial(Address, emptyAddress),
    addressDraft: Flow.initial(Address, emptyAddress),
    paymentMethodId: Flow.initial(S.NullOr(S.String), null),
    clientSecret: Flow.initial(S.NullOr(S.String), null),
    busyTries: Flow.initial(S.Number, 0),
    retryInMs: Flow.initial(S.Number, 0),
    afterUnsure: Flow.initial(S.Boolean, false),
    authorized: Flow.initial(S.Boolean, false),
    receipt: Flow.initial(S.NullOr(Receipt), null),
    notice: Flow.initial(S.String, ""),
  },
  places: { summary: OrderSummary, CHALLENGE: ThreeDS },
  operations: ({ E }) => ({
    pay: pay.outcomes({
      success: E.Confirmed.from((v: { status: string; clientSecret: string; afterUnsure: boolean }) => ({ status: v.status, clientSecret: v.clientSecret, afterUnsure: v.afterUnsure })),
      failure: {
        CardDeclined: E.Declined.from((e: CardDeclined) => ({ code: e.code })),
        Busy: E.Busy.from((e: Busy) => ({ retryAfterMs: e.retryAfterMs ?? 1000 })),
        IntentBusy: E.PayRefused.from(() => ({ reason: "This payment changed elsewhere. Refresh to continue." })),
        NotSent: E.PayNotSent.from((e: { readonly why: string }) => ({ why: e.why })),
      },
      unknown: E.PayUnsure,
    }),
    place: placeOrder.outcomes({
      success: E.Placed.from((r: { order: { readonly orderId: string }; alreadyPlaced: boolean }) => ({ orderId: r.order.orderId, alreadyPlaced: r.alreadyPlaced })),
      failure: { NotSent: E.PlaceRefused },
      unknown: E.PlaceUnsure,
    }),
    void: voidAuthorization.outcomes({ success: E.Voided, failure: { AlreadyCaptured: E.VoidRefused.from((e: AlreadyCaptured) => ({ chargeId: e.chargeId })), NotSent: E.Voided }, unknown: E.VoidUnsure }),
    intent: intentStatus.outcomes({ success: E.IntentRead.from((v: Intent) => ({ status: v.status })), failure: { NoResponse: E.IntentReadFailed, Defect: E.IntentReadFailed, Interrupted: E.IntentReadFailed } }),
    order: orderForCart.outcomes({ success: E.OrderSeen.from((o: { readonly orderId: string } | null) => ({ orderId: o?.orderId ?? "" })), failure: { NoResponse: E.IntentReadFailed, Defect: E.IntentReadFailed, Interrupted: E.IntentReadFailed } }),
    authenticate: authenticate.outcomes({
      success: E.Authenticated.from((v) => ({ authId: v.intentId ?? "" })),
      failure: { ChallengeFailed: E.AuthFailed.from((e) => ({ code: (e as { readonly code?: string }).code ?? "" })), NotSent: E.AuthFailed.from(() => ({ code: "not_sent" })) },
      unknown: E.AuthUnsure,
    }),
  }),
});
type M = { readonly intentId: string; readonly cartId: string; readonly paymentMethodId: string | null };
const intent = ({ memory }: { readonly memory: M }) => ({ intentId: memory.intentId });
const cart = ({ memory }: { readonly memory: M }) => ({ cartId: memory.cartId, intentId: memory.intentId });
const PayFullMachine = machine(PayFull, ({ S: St, E, O }) => {
  // The summary trait's write, asked by the host: the host has no handle for its fragment's op (finding F3), so the token is written as its data.
  const shippingIdle = labHostOp("shipping").idle; // rule 50 forbids it; a named seam (D212, F3)
  const start = [
    {
      target: St.CARD,
      guard: [shippingIdle],
      updateMemory: ({ event }: { readonly event: { readonly cartId: string; readonly intentId: string } }) => ({
        cartId: event.cartId, intentId: event.intentId, address: savedAddress, receipt: null, authorized: false, afterUnsure: false, busyTries: 0, notice: "",
      }),
      raise: [E.summary.Quote.from(() => ({ postcode: "N1 9GU" }))],
    },
  ] as const;
  const withCard = ({ memory, event }: { readonly memory: M; readonly event: { readonly paymentMethodId: string } }) => ({ intentId: memory.intentId, paymentMethodId: event.paymentMethodId });
  return {
    default: St.IDLE,
    traits: {
      summary: {
        input: ({ memory }) => ({ cartId: memory.cartId }),
        resetOn: ({ memory }) => memory.cartId,
        guards: { mayPay: ({ memory }) => memory.totalCents <= 50_000 || deny("GuestLimit") },
        callbacks: {
          onPay: [
            { guard: [St.PAYING], actions: [O.pay.commit(withCard as never)] },
            { target: St.PAYING, updateMemory: ({ event }) => ({ paymentMethodId: (event as { readonly paymentMethodId: string }).paymentMethodId, notice: "" }), actions: [O.pay.commit(withCard as never)] },
          ],
        },
      },
    },
    on: {
      PayRequested: [
        { guard: [St.PAYING], actions: [O.pay.commit(withCard)] },
        { target: St.PAYING, updateMemory: ({ event }) => ({ paymentMethodId: event.paymentMethodId, notice: "" }), actions: [O.pay.commit(withCard)] },
      ],
      CartLoaded: { updateMemory: ({ event }) => ({ totalCents: event.totalCents }) },
      CardChosen: { updateMemory: ({ event }) => ({ paymentMethodId: event.paymentMethodId }) },
      Leave: [{ target: St.LEFT, guard: [({ memory }) => (memory.authorized && memory.receipt === null) || deny("NothingHeld")], actions: [O.void.commit(intent)] }, { target: St.LEFT }],
      Confirmed: [
        { guard: [St.LEFT, capturable], updateMemory: () => ({ authorized: true }), actions: [O.void.commit(intent)] },
        { target: St.PLACING, guard: [St.IDLE, capturable], updateMemory: () => ({ authorized: true }), actions: [O.place.commit(cart)] },
        {},
      ],
      PayUnsure: [{ guard: [St.LEFT], updateMemory: () => ({ notice: "Your bank may still show a pending charge." }) }, { target: St.UNSURE }],
      Declined: {},
      Busy: {},
      PayRefused: {},
      PayNotSent: {},
      IntentRead: {},
      IntentReadFailed: {},
      OrderSeen: {},
      CheckTick: {},
      Placed: { target: St.PAID, updateMemory: ({ memory, event }) => ({ receipt: { orderId: event.orderId, afterUnsure: memory.afterUnsure, alreadyPlaced: event.alreadyPlaced }, authorized: false }) },
      PlaceRefused: { updateMemory: () => ({ notice: "We couldn't place the order. Try again." }) },
      PlaceUnsure: [{ guard: [O.place.retryable({ times: 3 })], actions: [O.place.retry] }, { target: St.STUCK }],
      Voided: { updateMemory: () => ({ authorized: false, notice: "The hold on your card was released." }) },
      VoidRefused: { updateMemory: () => ({ notice: "Your payment was captured before you left. We'll be in touch." }) },
      VoidUnsure: [
        { guard: [O.void.retryable({ times: 3 })], actions: [O.void.retry] },
        { updateMemory: () => ({ notice: "We couldn't confirm the hold was released. Your bank releases it within 7 days." }), actions: [O.void.cancel] },
      ],
      Quoted: {},
      Authenticated: [
        { target: St.PLACING, guard: [St.CARD], updateMemory: () => ({ authorized: true, notice: "" }), actions: [O.place.commit(cart)] },
        { guard: [St.LEFT], updateMemory: () => ({ authorized: true }), actions: [O.void.commit(intent)] },
        { updateMemory: () => ({ authorized: true }) },
      ],
      AuthFailed: {},
      AuthUnsure: { actions: [O.authenticate.cancel.key(intent)] },
    },
    states: {
      IDLE: { on: { Start: start } },
      PAYING: {
        schedules: { slow: { schedule: "8 seconds", send: E.CheckTick } },
        on: {
          CheckTick: { updateMemory: () => ({ notice: "Still confirming with your bank…" }) },
          Confirmed: [
            {
              target: St.CHALLENGE,
              guard: [({ event }) => event.status === "requires_action" || deny("NoChallenge")],
              updateMemory: ({ event }) => ({ clientSecret: event.clientSecret }),
              actions: [O.authenticate.commit(({ memory, event }: { readonly memory: M; readonly event: { readonly clientSecret: string } }) => ({ intentId: memory.intentId, clientSecret: event.clientSecret }))],
            },
            { target: St.PLACING, guard: [capturable], updateMemory: ({ event }) => ({ authorized: true, afterUnsure: event.afterUnsure, notice: "" }), actions: [O.place.commit(cart)] },
            { target: St.CARD, updateMemory: () => ({ notice: "Your bank didn't authorize the payment." }) },
          ],
          Declined: { target: St.CARD, updateMemory: ({ event }) => ({ notice: `Your card was declined (${event.code}).` }) },
          Busy: [
            { target: St.WAITING, guard: [({ memory }) => memory.busyTries < MAX_BUSY_TRIES || deny("TooBusy")], updateMemory: ({ memory, event }) => ({ busyTries: memory.busyTries + 1, retryInMs: event.retryAfterMs }) },
            { target: St.CARD, updateMemory: () => ({ notice: "Payments are busy. Try again in a minute." }) },
          ],
          PayRefused: { target: St.CARD, updateMemory: ({ event }) => ({ notice: event.reason }) },
          PayNotSent: [
            { guard: [({ event }) => event.why === "Rejected" || deny("NotADoubleClick")] },
            { target: St.CARD, updateMemory: () => ({ notice: "Your payment wasn't sent. You haven't been charged." }) },
          ],
          PayUnsure: { target: St.UNSURE, updateMemory: () => ({ afterUnsure: true }) },
        },
      },
      WAITING: {
        schedules: { retry: { schedule: ({ memory }: { readonly memory: { readonly retryInMs: number } }) => memory.retryInMs, send: E.RetryNow } },
        on: { RetryNow: [{ target: St.PAYING, guard: [O.pay.idle(intent)], actions: [O.pay.commit(({ memory }) => ({ intentId: memory.intentId, paymentMethodId: memory.paymentMethodId ?? "" }))] }, {}] },
      },
      UNSURE: {
        schedules: { check: { schedule: "3 seconds", send: E.CheckTick, armOn: ["entry", "CheckTick"] } },
        on: {
          CheckTick: { actions: [O.intent.lookup(intent), O.order.lookup(({ memory }) => ({ cartId: memory.cartId }))] },
          IntentRead: [
            { target: St.PLACING, guard: [capturable], updateMemory: () => ({ authorized: true }), actions: [O.pay.cancel.key(intent), O.place.commit(cart)] },
            { index: 2, target: St.PAYING, guard: [({ event }) => event.status === "requires_payment_method" || deny("Moved"), O.pay.retryable({ times: 3, key: intent })], actions: [O.pay.retry.key(intent)] },
            { index: 3 },
          ],
          OrderSeen: [
            { target: St.PAID, guard: [({ event }) => event.orderId !== "" || deny("NoOrder")], updateMemory: ({ event }) => ({ receipt: { orderId: event.orderId, afterUnsure: true, alreadyPlaced: true } }), actions: [O.intent.cancel, O.pay.cancel.key(intent)] },
            {},
          ],
          PayUnsure: {},
        },
      },
      PAID: { on: { Start: start, Done: { target: St.IDLE } } },
      STUCK: { on: { CheckAgain: { target: St.UNSURE } } },
      LEFT: { on: { Start: start } },
      CHALLENGE: {
        into: {
          fragment: ThreeDS,
          input: ({ memory }) => ({ intentId: memory.intentId }),
          exits: {
            Passed: { target: St.PLACING, updateMemory: () => ({ authorized: true }), actions: [O.place.commit(cart)] },
            Declined: { target: St.CARD, updateMemory: ({ event }) => ({ notice: `Your bank declined the check (${(event as { readonly code: string }).code}).` }) },
            TimedOut: { target: St.CARD, updateMemory: () => ({ notice: "The bank's check timed out. You can pay again." }) },
          },
        },
        on: {
          Authenticated: { raise: [E.CHALLENGE.Answered.from(({ event }) => ({ authId: (event as { readonly authId: string }).authId }))] },
          AuthFailed: { raise: [E.CHALLENGE.Failed.from(({ event }) => ({ code: (event as { readonly code: string }).code }))] },
        },
      },
    },
  };
});
export const typedPayFullFixture = {
  id: handPayFull.id,
  ...(handPayFull.server ? { server: handPayFull.server } : {}),
  make: () => PayFullMachine.compiled,
  services: (api: Api) => servicesFor(PayFullMachine, Context.merge(shopFrom(api), Context.make(FakeApi, api))), // D211; D213: checked against its `R`
  typed: true as const,
};
export const payFullFixture = typedPayFullFixture;
export { LENGTH_MS } from "../fixtures/pay-full.compiled.ts";
void call;
