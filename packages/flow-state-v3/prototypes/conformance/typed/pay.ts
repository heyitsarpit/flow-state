// Real Pay, typed: references/checkout/features/Pay/pay.{contracts,definition,machine}.ts, the same subset as the pinned `pay.compiled.ts`
// (convergence-1 section 11: signed-in only, no CHALLENGE, no summary trait). The confirmed bugs stay in: P1-P6 are pinned. No `any`.
import { Context, Effect, Schema } from "effect";
import type { Api } from "../../conformance/fake-world.ts";
import { Outcome, OutcomeFailure, OutcomeUnknown } from "../../conformance/fixtures/compiled.ts";
import { payFixture as handPay } from "../../conformance/fixtures/pay.compiled.ts";
import type { Fixture } from "../../conformance/harness.ts";
import { definition, deny, Flow, machine, provide, resource, transaction } from "./flow.ts";

// ── Where the data comes from: the shop's API, an Effect service (adapters/shop-api.ts). Flow is not a network library.
type NoResponse = { readonly _tag: "NoResponse" };
type ServerError = { readonly _tag: "ServerError" };
type Lost = NoResponse | ServerError;
type CardDeclined = { readonly _tag: "CardDeclined"; readonly code: string };
type Busy = { readonly _tag: "Busy"; readonly retryAfterMs?: number };
type IntentBusy = { readonly _tag: "IntentBusy"; readonly status: string };
type OrderExists = { readonly _tag: "OrderExists"; readonly order: { readonly orderId: string } };
type AlreadyCaptured = { readonly _tag: "AlreadyCaptured"; readonly chargeId: string };
type Intent = { readonly status: string; readonly clientSecret?: string };
type Idem = { readonly idempotencyKey: string };
export class ShopApi extends Context.Service<
  ShopApi,
  {
    readonly confirm: (
      i: { readonly intentId: string; readonly paymentMethodId: string },
      o: Idem,
    ) => Effect.Effect<Intent & { readonly intentId?: string }, CardDeclined | Busy | IntentBusy | Lost>;
    readonly placeOrder: (
      i: { readonly cartId: string; readonly intentId: string },
      o: Idem,
    ) => Effect.Effect<{ readonly orderId: string }, OrderExists | Lost>;
    readonly voidAuthorization: (
      i: { readonly intentId: string },
      o: Idem,
    ) => Effect.Effect<unknown, AlreadyCaptured | Lost>;
    readonly intent: (i: { readonly intentId: string }) => Effect.Effect<Intent, NoResponse>;
    readonly orderFor: (i: {
      readonly cartId: string;
    }) => Effect.Effect<{ readonly orderId: string } | null, NoResponse>;
  }
>()("ShopApi") {}

const unknownWhenLost = <A, E extends { readonly _tag: string }, R>(
  write: Effect.Effect<A, E, R>,
): Effect.Effect<A, Exclude<E, Lost> | OutcomeUnknown<Lost>, R> =>
  Effect.catch(write, (e: E): Effect.Effect<never, Exclude<E, Lost> | OutcomeUnknown<Lost>> =>
    e._tag === "NoResponse" || e._tag === "ServerError"
      ? Outcome.unknown(e as unknown as Lost)
      : Effect.fail(e as Exclude<E, Lost>),
  );

// The same, where a `Flow/Failure` is already among the errors, which has no `_tag` of ours.
const unknownWhenLostFlat = <A, R>(
  write: Effect.Effect<A, OutcomeFailure<IntentBusy> | CardDeclined | Busy | Lost, R>,
): Effect.Effect<A, OutcomeFailure<IntentBusy> | CardDeclined | Busy | OutcomeUnknown<Lost>, R> =>
  Effect.catch(
    write,
    (e): Effect.Effect<never, OutcomeFailure<IntentBusy> | CardDeclined | Busy | OutcomeUnknown<Lost>> =>
      e._tag === "NoResponse" || e._tag === "ServerError"
        ? Outcome.unknown<Lost>(e)
        : Effect.fail(e as OutcomeFailure<IntentBusy> | CardDeclined | Busy),
  );

// ── Contracts.
const pay = transaction({
  id: "Checkout/pay",
  input: { intentId: Schema.String, paymentMethodId: Schema.String },
  key: ["intentId"],
  concurrency: "reject",
  timeoutMs: 60_000, // D8, as the pinned fixture
  commit: (input, { attempt }) =>
    Effect.flatMap(Effect.service(ShopApi), (api) =>
      api.confirm(input, { idempotencyKey: attempt.id }),
    ).pipe(
      Effect.map((v) => ({
        status: v.status,
        clientSecret: v.clientSecret ?? "",
        afterUnsure: attempt.mayHaveApplied,
      })),
      Effect.catch((e): Effect.Effect<
        { status: string; clientSecret: string; afterUnsure: boolean },
        OutcomeFailure<IntentBusy> | CardDeclined | Busy | Lost
      > =>
        e._tag === "IntentBusy"
          ? attempt.mayHaveApplied && (e.status === "requires_capture" || e.status === "succeeded")
            ? Outcome.success({ status: e.status, clientSecret: "", afterUnsure: true })
            : Outcome.failure(e)
          : Effect.fail(e),
      ),
      unknownWhenLostFlat,
    ),
});
const placeOrder = transaction({
  id: "Checkout/place-order",
  input: { cartId: Schema.String, intentId: Schema.String },
  key: ["cartId"],
  concurrency: "reject",
  commit: (input, { attempt }) =>
    Effect.flatMap(Effect.service(ShopApi), (api) =>
      api.placeOrder(input, { idempotencyKey: attempt.id }),
    ).pipe(
      Effect.map((order) => ({ order, alreadyPlaced: false })),
      Effect.catch((e): Effect.Effect<
        { order: { readonly orderId: string }; alreadyPlaced: boolean },
        Lost
      > =>
        e._tag === "OrderExists"
          ? Outcome.success({ order: e.order, alreadyPlaced: true })
          : Effect.fail(e),
      ),
      unknownWhenLost,
    ),
});
const voidAuthorization = transaction({
  id: "Checkout/void-authorization",
  input: { intentId: Schema.String },
  key: ["intentId"],
  concurrency: "reject",
  commit: (input, { attempt }) =>
    Effect.flatMap(Effect.service(ShopApi), (api) =>
      api.voidAuthorization(input, { idempotencyKey: attempt.id }),
    ).pipe(unknownWhenLost),
});
const intentStatus = resource({
  id: "Checkout/intent-status",
  input: { intentId: Schema.String },
  key: ["intentId"],
  commit: (input) => Effect.flatMap(Effect.service(ShopApi), (api) => api.intent(input)),
});
const orderForCart = resource({
  id: "Checkout/order-for-cart",
  input: { cartId: Schema.String },
  key: ["cartId"],
  commit: (input) => Effect.flatMap(Effect.service(ShopApi), (api) => api.orderFor(input)),
});

// ── The definition.
const Address = Schema.Struct({
  name: Schema.String,
  line1: Schema.String,
  postcode: Schema.String,
  email: Schema.String,
});
const emptyAddress = { name: "", line1: "", postcode: "", email: "" };
const savedAddress = { name: "Ada Lovelace", line1: "12 Canal St", postcode: "N1 9GU", email: "ada@example.com" };
const Receipt = Schema.Struct({
  orderId: Schema.String,
  afterUnsure: Schema.Boolean,
  alreadyPlaced: Schema.Boolean,
});
const Pay = definition({
  id: "Checkout/Pay",
  states: {
    IDLE: {}, CARD: {}, PAYING: {}, WAITING: {}, UNSURE: {}, PLACING: {}, PAID: {}, STUCK: {}, LEFT: {},
  },
  events: {
    CardChosen: { paymentMethodId: Schema.String },
    PayRequested: { paymentMethodId: Schema.String }, // the summary trait's `onPay`, flattened as in the pinned fixture
    Leave: {},
    CheckAgain: {},
    Done: {},
    Start: { cartId: Schema.String, intentId: Schema.String },
  },
  internalEvents: {
    CartLoaded: { totalCents: Schema.Int },
    Confirmed: { status: Schema.String, clientSecret: Schema.String, afterUnsure: Schema.Boolean },
    Declined: { code: Schema.String },
    Busy: { retryAfterMs: Schema.Number },
    PayRefused: { reason: Schema.String },
    PayNotSent: { why: Schema.String },
    PayUnsure: {},
    RetryNow: {},
    CheckTick: {},
    IntentRead: { status: Schema.String },
    IntentReadFailed: {},
    OrderSeen: { orderId: Schema.String },
    Placed: { orderId: Schema.String, alreadyPlaced: Schema.Boolean },
    PlaceRefused: {},
    PlaceUnsure: {},
    Voided: {},
    VoidRefused: { chargeId: Schema.String },
    VoidUnsure: {},
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
      success: E.Confirmed.from((v: { status: string; clientSecret: string; afterUnsure: boolean }) => ({
        status: v.status,
        clientSecret: v.clientSecret,
        afterUnsure: v.afterUnsure,
      })),
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
      success: E.Placed.from((r: { order: { readonly orderId: string }; alreadyPlaced: boolean }) => ({
        orderId: r.order.orderId,
        alreadyPlaced: r.alreadyPlaced,
      })),
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
      failure: { NoResponse: E.IntentReadFailed, Defect: E.IntentReadFailed, Interrupted: E.IntentReadFailed },
    }),
    order: orderForCart.outcomes({
      success: E.OrderSeen.from((o: { readonly orderId: string } | null) => ({ orderId: o?.orderId ?? "" })),
      failure: { NoResponse: E.IntentReadFailed, Defect: E.IntentReadFailed, Interrupted: E.IntentReadFailed },
    }),
  }),
});
type G = { readonly memory: MemoryT };
type MemoryT = {
  readonly intentId: string;
  readonly cartId: string;
  readonly paymentMethodId: string | null;
};
const capturable = ({ event }: { readonly event: { readonly status: string } }) =>
  event.status === "requires_capture" || event.status === "succeeded" || deny("NotAuthorized");
const MAX_BUSY_TRIES = 3;
const intent = ({ memory }: G) => ({ intentId: memory.intentId });
const cart = ({ memory }: G) => ({ cartId: memory.cartId, intentId: memory.intentId });

// Round 11: callable, so the codec's measure can compile it many times under other ids (`codec/measure.ts`). The suite compiles it once.
export const compilePay = (id: string = Pay.id) => machine({ ...Pay, id }, ({ S, E, O }) => {
  const start = [
    {
      target: S.CARD,
      updateMemory: ({ event }: { readonly event: { readonly cartId: string; readonly intentId: string } }) => ({
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
  ] as const;
  const withCard = ({ memory, event }: { readonly memory: MemoryT; readonly event: { readonly paymentMethodId: string } }) => ({
    intentId: memory.intentId,
    paymentMethodId: event.paymentMethodId,
  });
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
          guard: [({ memory }) => (memory.authorized && memory.receipt === null) || deny("NothingHeld")],
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
        { guard: [S.LEFT], updateMemory: () => ({ notice: "Your bank may still show a pending charge." }) },
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
          receipt: { orderId: event.orderId, afterUnsure: memory.afterUnsure, alreadyPlaced: event.alreadyPlaced },
          authorized: false,
        }),
      },
      PlaceRefused: { updateMemory: () => ({ notice: "We couldn't place the order. Try again." }) },
      PlaceUnsure: [
        { guard: [O.place.retryable({ times: 3 })], actions: [O.place.retry] },
        { target: S.STUCK },
      ],
      Voided: { updateMemory: () => ({ authorized: false, notice: "The hold on your card was released." }) },
      VoidRefused: { updateMemory: () => ({ notice: "Your payment was captured before you left. We'll be in touch." }) },
      VoidUnsure: [
        { guard: [O.void.retryable({ times: 3 })], actions: [O.void.retry] },
        {
          updateMemory: () => ({ notice: "We couldn't confirm the hold was released. Your bank releases it within 7 days." }),
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
            {
              index: 1, // [0] in the real machine is the requires_action alternative to CHALLENGE, absent here
              target: S.PLACING,
              guard: [capturable],
              updateMemory: ({ event }) => ({ authorized: true, afterUnsure: event.afterUnsure, notice: "" }),
              actions: [O.place.commit(cart)],
            },
            { index: 2, target: S.CARD, updateMemory: () => ({ notice: "Your bank didn't authorize the payment." }) },
          ],
          Declined: { target: S.CARD, updateMemory: ({ event }) => ({ notice: `Your card was declined (${event.code}).` }) },
          Busy: [
            {
              target: S.WAITING,
              guard: [({ memory }) => memory.busyTries < MAX_BUSY_TRIES || deny("TooBusy")],
              updateMemory: ({ memory, event }) => ({ busyTries: memory.busyTries + 1, retryInMs: event.retryAfterMs }),
            },
            { target: S.CARD, updateMemory: () => ({ notice: "Payments are busy. Try again in a minute." }) },
          ],
          PayRefused: { target: S.CARD, updateMemory: ({ event }) => ({ notice: event.reason }) },
          PayNotSent: [
            { guard: [({ event }) => event.why === "Rejected" || deny("NotADoubleClick")] },
            { target: S.CARD, updateMemory: () => ({ notice: "Your payment wasn't sent. You haven't been charged." }) },
          ],
          PayUnsure: { target: S.UNSURE, updateMemory: () => ({ afterUnsure: true }) },
        },
      },
      WAITING: {
        schedules: {
          retry: {
            schedule: ({ memory }: { readonly memory: { readonly retryInMs: number } }) => memory.retryInMs,
            send: E.RetryNow,
          },
        },
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
        schedules: { check: { schedule: "3 seconds", send: E.CheckTick, armOn: ["entry", "CheckTick"] } },
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
              actions: [O.pay.cancel.key(intent), O.place.commit(cart)],
            },
            {
              index: 2, // [1] in the real machine is the CHALLENGE alternative, absent here
              target: S.PAYING,
              guard: [
                ({ event }) => event.status === "requires_payment_method" || deny("Moved"),
                O.pay.retryable({ times: 3, key: intent }),
              ],
              actions: [O.pay.retry.key(intent)],
            },
            { index: 3 },
          ],
          OrderSeen: [
            {
              target: S.PAID,
              guard: [({ event }) => event.orderId !== "" || deny("NoOrder")],
              updateMemory: ({ event }) => ({
                receipt: { orderId: event.orderId, afterUnsure: true, alreadyPlaced: true },
              }),
              actions: [O.intent.cancel, O.pay.cancel.key(intent)],
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
});
const PayMachine = compilePay();
export const payCompiled = PayMachine;
export { shopFrom };
// Round 11: for `pay-full.ts`, the real Pay with its summary trait and 3-D Secure, which shares these.
export { pay, placeOrder, voidAuthorization, intentStatus, orderForCart, Address, Receipt, emptyAddress, savedAddress, capturable, MAX_BUSY_TRIES };
export type { CardDeclined, Busy, AlreadyCaptured, Intent };

// The fixture's seam: the fake's untyped `Api` given the service's types, here and nowhere else. Real code gets a real Layer.
const shopFrom = (api: Api) =>
  Context.make(ShopApi, {
    confirm: (i, o) => api.confirm(i, o) as never,
    placeOrder: (i, o) => api.placeOrder(i, o) as never,
    voidAuthorization: (i, o) => api.voidAuthorization(i, o) as never,
    intent: (i) => api.intent(i) as never,
    orderFor: (i) => api.orderFor(i) as never,
  });
export const typedPayFixture: Fixture & { readonly typed: true } = {
  id: handPay.id,
  ...(handPay.server ? { server: handPay.server } : {}),
  make: () => PayMachine.compiled,
  services: (api) => shopFrom(api) as Context.Context<never>, // D211: given to the Runtime at boot
  typed: true,
};
void provide;
// Round 11: the scenarios' name for Pay, so a scenario file switches by its import path alone (D195).
export const payFixture = typedPayFixture;
