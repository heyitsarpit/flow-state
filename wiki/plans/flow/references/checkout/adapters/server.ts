// The shop's and Stripe's rules as pure functions over plain truth: the one implementation the Story fakes call
// (testing/shop.fake.ts, testing/stripe.fake.ts) and the property test's oracle. Effect-only, and no Effect at all:
// a function takes truth and a request and returns the next truth and a reply.
//
// What it models of Stripe: a PaymentIntent per cart, confirmed with manual capture. A confirm authorizes (or asks
// for a 3-D Secure challenge first); placing the order captures; cancelling voids. Every confirm, capture and void
// is deduplicated by the idempotency key, as Stripe's API is, and a webhook event is processed once by its id.
import { Schema } from "effect";
import {
  AlreadyCaptured,
  Busy,
  CardDeclined,
  Cart,
  CartLine,
  ChallengeFailed,
  CouponRejected,
  Intent,
  IntentBusy,
  LineGone,
  NotDeliverable,
  Order,
  OverRefund,
  Product,
  Refund,
  type ShippingSlot,
} from "./types.js";

export type Result<A, E> = { ok: true; value: A } | { ok: false; error: E };

export type Step<A, E> = readonly [ShopTruth, Result<A, E>];

const ok = <A>(value: A): Result<A, never> => ({ ok: true, value });

const fail = <E>(error: E): Result<never, E> => ({ ok: false, error });

// One authorization or capture Stripe made, and under which key: "charged once" is checked on these.
export const Charge = Schema.Struct({
  intentId: Schema.String,
  key: Schema.String,
  amountCents: Schema.Int,
  status: Schema.Literals(["authorized", "captured", "voided"]),
});

export const ShopTruth = Schema.Struct({
  products: Schema.Array(Product),
  carts: Schema.Array(Cart),
  intents: Schema.Array(Intent),
  charges: Schema.Array(Charge),
  orders: Schema.Array(Order),
  refunds: Schema.Array(Refund),
  applied: Schema.Record(Schema.String, Schema.Unknown), // idempotency key → first reply
  webhooksSeen: Schema.Array(Schema.String), // event ids processed
  // Stripe's behaviour, set by controls: the next confirms answer 429, a challenge is required, a card is declined.
  busy: Schema.Int,
  challenge: Schema.Boolean,
  decline: Schema.NullOr(Schema.String),
  clock: Schema.Int,
});

export type ShopTruth = typeof ShopTruth.Type;

export const seed = (): ShopTruth => ({
  products: [
    { productId: "lamp", name: "Desk lamp", priceCents: 4_500, revision: 1 },
    { productId: "bulb", name: "LED bulb, 4-pack", priceCents: 1_200, revision: 1 },
  ],
  carts: [
    priced({
      cartId: "cart-1",
      lines: [line("cart-1", "l1", "lamp", 1, 4_500), line("cart-1", "l2", "bulb", 2, 1_200)],
      subtotalCents: 0,
      couponCode: null,
      discountCents: 0,
      totalCents: 0,
      intentId: "pi_1",
      revision: 1,
    }),
    // A second cart, for "buy again": the checkout's summary resets to it.
    priced({
      cartId: "cart-2",
      lines: [line("cart-2", "l1", "bulb", 1, 1_200)],
      subtotalCents: 0,
      couponCode: null,
      discountCents: 0,
      totalCents: 0,
      intentId: "pi_2",
      revision: 1,
    }),
  ],
  intents: [
    { intentId: "pi_1", status: "requires_payment_method", amountCents: 6_900, chargeId: null },
    { intentId: "pi_2", status: "requires_payment_method", amountCents: 1_200, chargeId: null },
  ],
  charges: [],
  orders: [
    // A finished order the merchant may refund (the Refunds page's seed).
    {
      orderId: "o-9",
      cartId: "cart-9",
      chargeId: "ch_9",
      status: "completed",
      amountCents: 9_000,
      refundedCents: 0,
      revision: 1,
    },
  ],
  refunds: [],
  applied: {},
  webhooksSeen: [],
  busy: 0,
  challenge: false,
  decline: null,
  clock: 1,
});

function line(
  cartId: string,
  lineId: string,
  productId: string,
  quantity: number,
  unitPriceCents: number,
): CartLine {
  return {
    cartId,
    lineId,
    productId,
    quantity,
    unitPriceCents,
    lineTotalCents: quantity * unitPriceCents,
    revision: 1,
  };
}

// Totals are the server's: the subtotal from the lines, then the coupon's discount.
function priced(cart: Cart): Cart {
  const subtotalCents = cart.lines.reduce((sum, l) => sum + l.quantity * l.unitPriceCents, 0);
  const discountCents = cart.couponCode === "SAVE10" ? Math.round(subtotalCents / 10) : 0;

  return {
    ...cart,
    lines: cart.lines.map((l) => ({ ...l, lineTotalCents: l.quantity * l.unitPriceCents })),
    subtotalCents,
    discountCents,
    totalCents: subtotalCents - discountCents,
  };
}

const replayed = <A>(truth: ShopTruth, key: string) => truth.applied[key] as A | undefined;

const remember = (truth: ShopTruth, key: string, reply: unknown): ShopTruth => ({
  ...truth,
  applied: { ...truth.applied, [key]: reply },
});

export const findCart = (truth: ShopTruth, cartId: string) =>
  truth.carts.find((c) => c.cartId === cartId);

const putCart = (truth: ShopTruth, cart: Cart): ShopTruth => ({
  ...truth,
  carts: truth.carts.map((c) =>
    c.cartId === cart.cartId ? priced({ ...cart, revision: c.revision + 1 }) : c,
  ),
  intents: truth.intents.map((i) =>
    i.intentId === cart.intentId ? { ...i, amountCents: priced(cart).totalCents } : i,
  ),
});

// --- the cart -------------------------------------------------------------------------------------------

export const setQuantity = (
  truth: ShopTruth,
  input: { cartId: string; lineId: string; quantity: number },
  key: string,
): Step<Cart, LineGone> => {
  const previous = replayed<Cart>(truth, key);

  if (previous) return [truth, ok(previous)];

  const cart = findCart(truth, input.cartId);

  if (!cart?.lines.some((l) => l.lineId === input.lineId))
    return [truth, fail(new LineGone({ lineId: input.lineId }))];

  const next = putCart(truth, {
    ...cart,
    lines: cart.lines.map((l) =>
      l.lineId === input.lineId ? { ...l, quantity: input.quantity, revision: l.revision + 1 } : l,
    ),
  });
  const reply = findCart(next, input.cartId)!;

  return [remember(next, key, reply), ok(reply)];
};

export const removeLine = (
  truth: ShopTruth,
  input: { cartId: string; lineId: string },
  key: string,
): Step<Cart, LineGone> => {
  const previous = replayed<Cart>(truth, key);

  if (previous) return [truth, ok(previous)];

  const cart = findCart(truth, input.cartId);

  if (!cart?.lines.some((l) => l.lineId === input.lineId))
    return [truth, fail(new LineGone({ lineId: input.lineId }))];

  const next = putCart(truth, {
    ...cart,
    lines: cart.lines.filter((l) => l.lineId !== input.lineId),
  });
  const reply = findCart(next, input.cartId)!;

  return [remember(next, key, reply), ok(reply)];
};

export const applyCoupon = (
  truth: ShopTruth,
  input: { cartId: string; code: string },
  key: string,
): Step<Cart, CouponRejected> => {
  const previous = replayed<Cart>(truth, key);

  if (previous) return [truth, ok(previous)];

  const cart = findCart(truth, input.cartId);

  if (!cart || input.code !== "SAVE10")
    return [truth, fail(new CouponRejected({ reason: "That code is not valid" }))];

  const next = putCart(truth, { ...cart, couponCode: input.code });
  const reply = findCart(next, input.cartId)!;

  return [remember(next, key, reply), ok(reply)];
};

// Another browser changes a product's price: every line naming it is re-priced.
export const changePrice = (truth: ShopTruth, productId: string, priceCents: number): ShopTruth =>
  truth.carts.reduce<ShopTruth>(
    (current, cart) =>
      putCart(current, {
        ...cart,
        lines: cart.lines.map((l) =>
          l.productId === productId
            ? { ...l, unitPriceCents: priceCents, revision: l.revision + 1 }
            : l,
        ),
      }),
    {
      ...truth,
      products: truth.products.map((p) =>
        p.productId === productId ? { ...p, priceCents, revision: p.revision + 1 } : p,
      ),
    },
  );

// --- Stripe: confirm, the challenge, capture, void --------------------------------------------------------

const findIntent = (truth: ShopTruth, intentId: string) =>
  truth.intents.find((i) => i.intentId === intentId)!;

const putIntent = (truth: ShopTruth, intent: Intent): ShopTruth => ({
  ...truth,
  intents: truth.intents.map((i) => (i.intentId === intent.intentId ? intent : i)),
});

export const confirm = (
  truth: ShopTruth,
  input: { intentId: string; paymentMethodId: string },
  key: string,
): Step<Intent, CardDeclined | Busy | IntentBusy> => {
  const previous = replayed<Intent>(truth, key);

  if (previous) return [truth, ok(previous)]; // the same Attempt: Stripe answers what it did

  if (truth.busy > 0)
    return [{ ...truth, busy: truth.busy - 1 }, fail(new Busy({ retryAfterMs: 2_000 }))];

  const intent = findIntent(truth, input.intentId);

  if (intent.status !== "requires_payment_method")
    return [truth, fail(new IntentBusy({ status: intent.status }))];

  if (truth.decline !== null) return [truth, fail(new CardDeclined({ code: truth.decline }))];

  const next: Intent = truth.challenge
    ? { ...intent, status: "requires_action" }
    : { ...intent, status: "requires_capture", chargeId: `ch_${input.intentId}` };
  const charged: ShopTruth = truth.challenge
    ? putIntent(truth, next)
    : {
        ...putIntent(truth, next),
        charges: [
          ...truth.charges,
          { intentId: input.intentId, key, amountCents: intent.amountCents, status: "authorized" },
        ],
      };

  return [remember(charged, key, next), ok(next)];
};

// The customer completes the bank's challenge (Stripe.js `handleNextAction`): the authorization happens now.
export const completeChallenge = (
  truth: ShopTruth,
  intentId: string,
  passed: boolean,
): Step<Intent, ChallengeFailed> => {
  const intent = findIntent(truth, intentId);

  if (intent.status !== "requires_action") return [truth, ok(intent)];

  if (!passed)
    return [
      putIntent(truth, { ...intent, status: "requires_payment_method" }),
      fail(new ChallengeFailed({ code: "authentication_failed" })),
    ];

  const next: Intent = { ...intent, status: "requires_capture", chargeId: `ch_${intentId}` };

  return [
    {
      ...putIntent(truth, next),
      charges: [
        ...truth.charges,
        {
          intentId,
          key: `challenge-${intentId}`,
          amountCents: intent.amountCents,
          status: "authorized",
        },
      ],
    },
    ok(next),
  ];
};

const setCharge = (
  truth: ShopTruth,
  intentId: string,
  status: "captured" | "voided",
): ShopTruth => ({
  ...truth,
  charges: truth.charges.map((c) =>
    c.intentId === intentId && c.status === "authorized" ? { ...c, status } : c,
  ),
});

// Placing the order captures the authorization and creates the order, once per cart.
export const placeOrder = (
  truth: ShopTruth,
  input: { cartId: string; intentId: string },
  key: string,
): Step<Order, { _tag: "OrderExists"; order: Order }> => {
  const previous = replayed<Order>(truth, key);

  if (previous) return [truth, ok(previous)];

  const existing = truth.orders.find((o) => o.cartId === input.cartId);

  if (existing) return [truth, fail({ _tag: "OrderExists", order: existing })];

  const intent = findIntent(truth, input.intentId);
  const order: Order = {
    orderId: `o-${input.cartId}`,
    cartId: input.cartId,
    chargeId: intent.chargeId ?? `ch_${input.intentId}`,
    status: "completed",
    amountCents: intent.amountCents,
    refundedCents: 0,
    revision: 1,
  };
  const captured = setCharge(
    putIntent(truth, { ...intent, status: "succeeded" }),
    input.intentId,
    "captured",
  );

  return [remember({ ...captured, orders: [...captured.orders, order] }, key, order), ok(order)];
};

// Stripe's webhook, processed once per event id even when Stripe delivers it twice (Y4).
export const webhook = (
  truth: ShopTruth,
  event: { id: string; intentId: string; cartId: string },
): ShopTruth => {
  if (truth.webhooksSeen.includes(event.id)) return truth;

  const seen = { ...truth, webhooksSeen: [...truth.webhooksSeen, event.id] };
  const [placed] = placeOrder(
    seen,
    { cartId: event.cartId, intentId: event.intentId },
    `webhook-${event.id}`,
  );

  return placed;
};

export const voidAuthorization = (
  truth: ShopTruth,
  input: { intentId: string },
  key: string,
): Step<void, AlreadyCaptured> => {
  if (replayed(truth, key) !== undefined) return [truth, ok(undefined)];

  const intent = findIntent(truth, input.intentId);

  if (intent.status === "succeeded")
    return [truth, fail(new AlreadyCaptured({ chargeId: intent.chargeId ?? "" }))];

  const voided = setCharge(
    putIntent(truth, { ...intent, status: "canceled" }),
    input.intentId,
    "voided",
  );

  return [remember(voided, key, true), ok(undefined)];
};

// Someone else (the background capture job) captures an authorization: a race the void can lose.
export const captureElsewhere = (truth: ShopTruth, intentId: string): ShopTruth => {
  const intent = findIntent(truth, intentId);

  return intent.status === "requires_capture"
    ? setCharge(putIntent(truth, { ...intent, status: "succeeded" }), intentId, "captured")
    : truth;
};

// --- shipping and refunds -------------------------------------------------------------------------------

export const reserveShipping = (
  truth: ShopTruth,
  input: { cartId: string; postcode: string },
  key: string,
): Step<ShippingSlot, NotDeliverable> => {
  const previous = replayed<ShippingSlot>(truth, key);

  if (previous) return [truth, ok(previous)];

  if (input.postcode.startsWith("ZZ"))
    return [truth, fail(new NotDeliverable({ postcode: input.postcode }))];

  const slot = {
    slotId: `slot-${input.postcode}`,
    postcode: input.postcode,
    feeCents: input.postcode.startsWith("N") ? 0 : 499,
  };

  return [remember(truth, key, slot), ok(slot)];
};

// Refunds on one charge add up; past what is left, the server refuses (409).
export const refund = (
  truth: ShopTruth,
  input: { orderId: string; chargeId: string; amountCents: number },
  key: string,
): Step<Refund, OverRefund> => {
  const previous = replayed<Refund>(truth, key);

  if (previous) return [truth, ok(previous)];

  const order = truth.orders.find((o) => o.orderId === input.orderId)!;
  const left = order.amountCents - order.refundedCents;

  if (input.amountCents > left) return [truth, fail(new OverRefund({ leftCents: left }))];

  const refundedCents = order.refundedCents + input.amountCents;
  const row: Refund = {
    refundId: `re-${String(truth.refunds.length + 1)}`,
    orderId: input.orderId,
    chargeId: input.chargeId,
    amountCents: input.amountCents,
    status: "succeeded",
  };
  const next: ShopTruth = {
    ...truth,
    refunds: [...truth.refunds, row],
    orders: truth.orders.map((o) =>
      o.orderId === input.orderId
        ? {
            ...o,
            refundedCents,
            status: refundedCents === o.amountCents ? "refunded" : "completed",
            revision: o.revision + 1,
          }
        : o,
    ),
  };

  return [remember(next, key, row), ok(row)];
};
