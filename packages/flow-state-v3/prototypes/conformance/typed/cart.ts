// Round 11: `fixtures/cart.compiled.ts`, with the machines in the public API and the domain in `Compiled`'s shape (D209). Checkout's cart page and the
// header's mini-cart, flat: the stepper trait's Increment and Decrement are written on the host, keyed by the event's line.
import { Effect, Schema } from "effect";
import type { Api } from "../fake-world.ts";
import { cartRef, cartServer, lineRef } from "../fixtures/cart.compiled.ts";
import { definition, deny, Flow, machine, resource, transaction, type DomainIn } from "../compile/index.ts";
import { call, FakeApi, fixture, write } from "./lab.ts";

export { cartRef, cartServer, lineRef } from "../fixtures/cart.compiled.ts";
const S = Schema;
const U = S.Unknown;
const MAX_QUANTITY = 9;
type Line = { readonly lineId: string; readonly quantity: number };
type CartV = { readonly cartId: string; readonly lines: readonly Line[]; readonly subtotalCents: number; readonly totalCents: number };
const cartLines = (v: CartV) => [
  ...v.lines.map((l) => ({ ref: lineRef(l.lineId), fields: l })),
  { ref: cartRef, fields: { cartId: v.cartId, subtotalCents: v.subtotalCents, totalCents: v.totalCents } },
];
const domainOf = (api: Api): DomainIn => ({
  writes: {
    setQuantity: {
      predicts: (i: { readonly lineId: string; readonly quantity: number }) => [
        { ref: lineRef(i.lineId), patch: { quantity: i.quantity, lineTotalCents: (b: { readonly unitPriceCents: number }, x: { readonly quantity: number }) => b.unitPriceCents * x.quantity } },
      ],
      confirms: (v: CartV) => cartLines(v),
    },
    removeLine: {
      predicts: (i: { readonly lineId: string }) => [{ ref: lineRef(i.lineId), remove: true }],
      confirms: (v: CartV, i: { readonly lineId: string }) => [...cartLines(v), { ref: lineRef(i.lineId), removed: true }],
    },
  },
  reads: { cart: (v: CartV) => cartLines(v) },
  repair: (ref: string) => api.call("repair", { ref }) as Effect.Effect<unknown, unknown, never>,
});
const lineIn = { cartId: U, lineId: U };
const setQuantity = transaction({ id: "Checkout/setQuantity", input: { ...lineIn, quantity: U, delta: U }, key: ["cartId", "lineId"], concurrency: "latest", services: [FakeApi], commit: write<unknown, "LineGone">("setQuantity") });
const removeLine = transaction({ id: "Checkout/removeLine", input: lineIn, key: ["cartId", "lineId"], concurrency: "reject", services: [FakeApi], commit: write<unknown, "LineGone">("removeLine") });
const coupon = transaction({ id: "Checkout/coupon", input: { cartId: U, code: U }, key: [], concurrency: "reject", services: [FakeApi], commit: write<unknown, "CouponRejected">("coupon") });
const cartRead = resource({ id: "Checkout/cart", input: { cartId: U }, key: ["cartId"], services: [FakeApi], lookup: (i) => call<CartV, "NoResponse">("cart")(i) });
type Coupon = { readonly code: unknown; readonly status: string; readonly predictedTotalCents: number | null; readonly reason: unknown };
const page = (api: Api) =>
  machine(
    definition({
      id: "Checkout/Cart",
      states: ["SHOPPING", "REMOVING"],
      events: { Load: {}, Increment: { lineId: S.String }, Decrement: { lineId: S.String }, ApplyCoupon: { code: S.String }, Yes: { lineId: S.String }, Keep: {} },
      internalEvents: {
        Loaded: { lines: S.Array(U), subtotalCents: S.Number }, LoadFailed: {}, QuantitySet: {}, LineGone: {}, QuantityUnsure: Flow.uncertain({}), Removed: {}, RemoveUnsure: Flow.uncertain({}),
        CouponApplied: {}, CouponRefused: { reason: U }, CouponUnsure: Flow.uncertain({}),
      },
      memory: {
        cartId: Flow.input(U),
        quantities: Flow.initial(S.Record(S.String, S.Number), {}),
        subtotalCents: Flow.initial(S.Number, 0),
        removing: Flow.initial(U, null),
        coupon: Flow.initial(U, { code: null, status: "none", predictedTotalCents: null, reason: null }),
      },
      persisted: false,
      uses: ["entities"],
      domain: domainOf(api),
      operations: ({ E }) => ({
        setQuantity: setQuantity.outcomes({ success: E.QuantitySet, failure: { LineGone: E.LineGone, NotSent: E.QuantitySet }, unknown: E.QuantityUnsure }),
        removeLine: removeLine.outcomes({ success: E.Removed, failure: { LineGone: E.Removed, NotSent: E.Removed }, unknown: E.RemoveUnsure }),
        coupon: coupon.outcomes({
          success: E.CouponApplied,
          failure: { CouponRejected: E.CouponRefused.from((e) => ({ reason: (e as { readonly reason?: unknown }).reason })), NotSent: E.CouponRefused.from(() => ({ reason: "Not sent" })) },
          unknown: E.CouponUnsure,
        }),
        cart: cartRead.outcomes({
          success: E.Loaded.from((v) => ({ lines: v.lines.map((l) => ({ lineId: l.lineId, quantity: l.quantity })), subtotalCents: v.subtotalCents })),
          failure: { NoResponse: E.LoadFailed, Defect: E.LoadFailed, Interrupted: E.LoadFailed },
        }),
      }),
    }),
    ({ S: St, O }) => {
      const setQ = (delta: number) =>
        O.setQuantity.commit<{ readonly lineId: string }>(({ memory, event }) => ({ cartId: memory.cartId, lineId: event.lineId, quantity: memory.quantities[event.lineId], delta }));
      const bump = (d: number) => ({ memory, event }: { readonly memory: { readonly quantities: Readonly<Record<string, number>> }; readonly event: { readonly lineId: string } }) => ({
        quantities: { ...memory.quantities, [event.lineId]: (memory.quantities[event.lineId] ?? 1) + d },
      });
      return {
        default: St.SHOPPING,
        on: {
          Load: { actions: [O.cart.lookup(({ memory }) => ({ cartId: memory.cartId }))] },
          Loaded: { updateMemory: ({ event }) => ({ quantities: Object.fromEntries((event.lines as readonly Line[]).map((l) => [l.lineId, l.quantity])), subtotalCents: event.subtotalCents }) },
          LoadFailed: {},
          Increment: { guard: [({ memory, event }) => (memory.quantities[event.lineId] ?? 1) < MAX_QUANTITY || deny("AtMost")], updateMemory: bump(1), actions: [setQ(1)] },
          Decrement: [
            { guard: [({ memory, event }) => (memory.quantities[event.lineId] ?? 1) > 1 || deny("AtOne")], updateMemory: bump(-1), actions: [setQ(-1)] },
            { target: St.REMOVING, updateMemory: ({ event }) => ({ removing: event.lineId }) },
          ],
          QuantitySet: {},
          LineGone: {},
          // Once more as the same Attempt, then release: a waiting tap goes next.
          QuantityUnsure: [{ guard: [O.setQuantity.retryable({ times: 1 })], actions: [O.setQuantity.retry] }, { actions: [O.setQuantity.cancel] }],
          Removed: {},
          RemoveUnsure: [{ guard: [O.removeLine.retryable({ times: 1 })], actions: [O.removeLine.retry] }, { actions: [O.removeLine.cancel] }],
          ApplyCoupon: {
            guard: [O.coupon.idle, ({ event }) => event.code.trim() !== "" || deny("NoCode")],
            updateMemory: ({ memory, event }) => ({ coupon: { code: event.code, status: "applying", predictedTotalCents: Math.round(memory.subtotalCents * 0.9), reason: null } }),
            actions: [O.coupon.commit(({ memory, event }) => ({ cartId: memory.cartId, code: event.code }))],
          },
          CouponApplied: { updateMemory: ({ memory }) => ({ coupon: { ...(memory.coupon as Coupon), status: "applied", predictedTotalCents: null } }) },
          CouponRefused: { updateMemory: ({ event }) => ({ coupon: { code: null, status: "refused", predictedTotalCents: null, reason: event.reason } }) },
          CouponUnsure: { updateMemory: ({ memory }) => ({ coupon: { ...(memory.coupon as Coupon), status: "unsure" } }), actions: [O.coupon.cancel] },
        },
        states: {
          REMOVING: {
            on: {
              Yes: { target: St.SHOPPING, updateMemory: () => ({ removing: null }), actions: [O.removeLine.commit(({ event, memory }) => ({ cartId: memory.cartId, lineId: event.lineId }))] },
              Keep: { target: St.SHOPPING, updateMemory: () => ({ removing: null }) },
            },
          },
        },
      };
    },
  );
export const cartFixture = fixture(page, cartServer);

// The header. One line, two actors' writes: this actor's own lane on removeLine.
const mini = (api: Api) =>
  machine(
    definition({
      id: "Checkout/MiniCart",
      states: ["READY"],
      events: { Remove: { lineId: S.String } },
      internalEvents: { Removed: {}, RemoveUnsure: Flow.uncertain({}) },
      memory: { cartId: Flow.input(U) },
      persisted: false,
      uses: ["entities"],
      domain: domainOf(api),
      operations: ({ E }) => ({ removeLine: removeLine.outcomes({ success: E.Removed, failure: { LineGone: E.Removed, NotSent: E.Removed }, unknown: E.RemoveUnsure }) }),
    }),
    ({ S: St, O }) => ({
      default: St.READY,
      on: {
        Remove: {
          guard: [O.removeLine.idle(({ memory, event }) => ({ cartId: memory.cartId, lineId: event.lineId }))],
          actions: [O.removeLine.commit(({ event, memory }) => ({ cartId: memory.cartId, lineId: event.lineId }))],
        },
        Removed: {},
        RemoveUnsure: { actions: [O.removeLine.cancel] },
      },
    }),
  );
export const miniCartFixture = fixture(mini);
