// Round 13: Checkout's Stories (machine-design 2.10.18.2), on the typed Pay the suite boots (`conformance/typed/pay.ts`).
// Source: `fetch` to the payment API with `Idempotency-Key: attempt.id`, wrapped by the app's `ShopApi` service; here `ShopApi`'s client half is the
// fixture's `shopFrom(api)`, whose routes are `pay`, `place`, `void`, `intent` and `order`. The fake below holds the server's truth behind those routes.
import { Schema } from "effect";
import { payFixture } from "../../conformance/typed/pay.ts";
import { Fake } from "./fake.ts";
import { Story } from "./story.ts";

const S = Schema;
const Charge = S.Struct({ intentId: S.String, key: S.String }); // user-defined
type Truth = {
  readonly charges: ReadonlyArray<typeof Charge.Type>;
  readonly orders: ReadonlyArray<{ readonly cartId: string; readonly orderId: string }>;
  readonly busy: number;
}; // user-defined
const status = (t: Truth, intentId: string) => (t.charges.some((c) => c.intentId === intentId) ? "requires_capture" : "requires_payment_method");

export const Shop = Fake.server("Shop", {
  truth: { charges: S.Array(Charge), orders: S.Array(S.Struct({ cartId: S.String, orderId: S.String })), busy: S.Int },
  initial: { charges: [], orders: [], busy: 0 } as Truth,
  endpoints: {
    // The fake's own dedupe by idempotency key (brief C16): a second send of one Attempt charges nothing more.
    confirm: Fake.call<Truth>({
      route: "pay",
      request: { intentId: S.String, paymentMethodId: S.String },
      handle: (t, req: { intentId: string; paymentMethodId: string }, { idempotencyKey = "" }) =>
        t.busy > 0
          ? { truth: { ...t, busy: t.busy - 1 }, response: { fail: { _tag: "Busy", retryAfterMs: 2000 } } }
          : t.charges.some((c) => c.key === idempotencyKey)
            ? { response: { ok: { status: "requires_capture", clientSecret: "cs_1" } } } // truth omitted: unchanged
            : { truth: { ...t, charges: [...t.charges, { intentId: req.intentId, key: idempotencyKey }] }, response: { ok: { status: "requires_capture", clientSecret: "cs_1" } } },
    }),
    placeOrder: Fake.call<Truth>({
      route: "place",
      request: { cartId: S.String, intentId: S.String },
      handle: (t, req: { cartId: string }) => {
        const had = t.orders.find((o) => o.cartId === req.cartId);
        return had ? { response: { fail: { _tag: "OrderExists", order: { orderId: had.orderId } } } } : { truth: { ...t, orders: [...t.orders, { cartId: req.cartId, orderId: `ord_${t.orders.length + 1}` }] }, response: { ok: { orderId: `ord_${t.orders.length + 1}` } } };
      },
    }),
    voidAuthorization: Fake.call<Truth>({ route: "void", request: { intentId: S.String }, handle: () => ({ response: { ok: {} } }) }),
    intent: Fake.call<Truth>({ route: "intent", request: { intentId: S.String }, handle: (t, req: { intentId: string }) => ({ response: { ok: { status: status(t, req.intentId) } } }) }),
    orderFor: Fake.call<Truth>({ route: "order", request: { cartId: S.String }, handle: (t, req: { cartId: string }) => ({ response: { ok: t.orders.find((o) => o.cartId === req.cartId) ?? null } }) }),
  },
  controls: {
    busy: Fake.control<Truth, { readonly times: number }>({ times: S.Int }, (t, { times }) => ({ truth: { ...t, busy: times } })), // the next confirm answers 429
  },
});

const checkout = (id: string) => Story.machine(payFixture, { id, fakes: [Shop] });
const E = checkout("checkout/events").E;
export const start = E["Start"]!({ cartId: "cart_1", intentId: "pi_1" });
export const pay = E["PayRequested"]!({ paymentMethodId: "pm_card" });

// The common case: committed, invoked, answered, Confirmed, PLACING, placed, PAID.
export const paidFirstTime = checkout("checkout/paid").send(start, pay).checkpoint("paid");

// A second press while paying: two steps, two cuts (rule 64). The request waits in transit.
export const pressedTwice = checkout("checkout/pressed-twice")
  .world(Shop.confirm.hold())
  .send(start, pay, pay)
  .checkpoint("paying")
  .world(Shop.confirm.release())
  .checkpoint("paid");

// Busy, then paid: the next confirm answers `Busy`, the commit classifies it, WAITING arms its retry from the answer, a new Attempt is sent.
export const busyThenPaid = checkout("checkout/busy-then-paid")
  .world(Shop.busy({ times: 1 }))
  .send(start, pay)
  .checkpoint("waiting")
  .advance("2 seconds")
  .checkpoint("paid");

// A reload mid-charge (2.10.18.2's `reloadMidCharge`, here on a machine Story): acknowledged, sent, in transit; the page reloads; the server charges and
// the answer goes nowhere; the restored lane is unknown { Restored }, so UNSURE; its check reads the intent and the order, and Pay places the order.
export const reloadMidCharge = checkout("checkout/reload-mid-charge")
  .world(Shop.confirm.hold())
  .send(start, pay)
  .checkpoint("sent")
  .reload()
  .world(Shop.confirm.release())
  .checkpoint("reopened")
  .advance({ next: { schedule: "check" } })
  .checkpoint("settled");

export const payStories = [paidFirstTime, pressedTwice, busyThenPaid, reloadMidCharge];
