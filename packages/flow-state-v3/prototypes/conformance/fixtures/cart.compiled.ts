// Checkout's cart page and the header's mini-cart, flat: the stepper trait's Increment and Decrement are written on the
// host, keyed by the event's line, with the same guards. ConfirmRemove becomes the REMOVING state's Yes and Keep.
// `O.cart.subscribe` is a one-off lookup here: resources are round 5. The coupon is the plain write beside the domain's.
import { Effect } from "effect";
import type { Fixture } from "../harness.ts";
import type { Api, ServerModel } from "../fake-world.ts";
import { deny, type Compiled, type DomainSpec, type Op } from "./compiled.ts";
import { fixtureOf, unknownWhenLost } from "./build.ts";

const D = "Checkout/Cart";
const { node, commit, lookup, member, mapped, memory, key, slot } = fixtureOf(D);
const MAX_QUANTITY = 9;
export const lineRef = (lineId: string) => `CartLine|c1/${lineId}`;
export const cartRef = "Cart|c1";

const cartLines = (v: any) => [
  ...v.lines.map((l: any) => ({ ref: lineRef(l.lineId), fields: l })),
  {
    ref: cartRef,
    fields: { cartId: v.cartId, subtotalCents: v.subtotalCents, totalCents: v.totalCents },
  },
];

const domain = (api: Api): DomainSpec => ({
  writes: {
    setQuantity: {
      predicts: slot("domain.setQuantity.predicts", (i: any) => [
        {
          ref: lineRef(i.lineId),
          patch: {
            quantity: i.quantity,
            lineTotalCents: (b: any, x: any) => b.unitPriceCents * x.quantity,
          },
        },
      ]),
      confirms: (v) => cartLines(v),
    },
    removeLine: {
      predicts: slot("domain.removeLine.predicts", (i: any) => [
        { ref: lineRef(i.lineId), remove: true },
      ]),
      confirms: (v, i) => [...cartLines(v), { ref: lineRef(i.lineId), removed: true }],
    },
  },
  reads: { cart: (v) => cartLines(v) },
  repair: (ref) => api.call("repair", { ref }) as Effect.Effect<any, any, never>,
});

const write = (
  api: Api,
  id: string,
  concurrency: Op["concurrency"],
  k: (i: any) => unknown,
  outcomes: Op["outcomes"],
): Op => ({
  id,
  contract: `Checkout/${id}`,
  kind: "write",
  key: key(id, k),
  concurrency,
  commit: (input, { attempt }) =>
    api.call(id, input, { idempotencyKey: attempt.id }).pipe(unknownWhenLost) as Effect.Effect<
      unknown,
      unknown
    >,
  outcomes,
});
const lineKey = (i: any) => ({ cartId: i.cartId, lineId: i.lineId });

const removeOutcomes: Op["outcomes"] = {
  success: { event: "Removed" },
  failure: { LineGone: { event: "Removed" }, NotSent: { event: "Removed" } },
  unknown: { event: "RemoveUnsure" },
};

const setQ = (delta: number) =>
  commit("setQuantity", ({ memory, event }) => ({
    cartId: memory.cartId,
    lineId: event.lineId,
    quantity: memory.quantities[event.lineId],
    delta,
  }));
const bump =
  (d: number) =>
  ({ memory, event }: any) => ({
    quantities: {
      ...memory.quantities,
      [event.lineId]: (memory.quantities[event.lineId] ?? 1) + d,
    },
  });

const pageNodes = {
  root: node(
    "root",
    {
      Load: [{ members: lookup("cart", ({ memory }) => ({ cartId: memory.cartId })) }],
      Loaded: [
        {
          patch: ({ event }) => ({
            quantities: Object.fromEntries(event.lines.map((l: any) => [l.lineId, l.quantity])),
            subtotalCents: event.subtotalCents,
          }),
        },
      ],
      LoadFailed: [{}],
      Increment: [
        {
          guards: [
            ({ memory, event }) =>
              (memory.quantities[event.lineId] ?? 1) < MAX_QUANTITY || deny("AtMost"),
          ],
          patch: bump(1),
          members: setQ(1),
        },
      ],
      Decrement: [
        {
          guards: [
            ({ memory, event }) => (memory.quantities[event.lineId] ?? 1) > 1 || deny("AtOne"),
          ],
          patch: bump(-1),
          members: setQ(-1),
        },
        { target: "REMOVING", patch: ({ event }) => ({ removing: event.lineId }) },
      ],
      QuantitySet: [{}],
      LineGone: [{}],
      // Once more as the same Attempt, then release: a waiting tap goes next.
      QuantityUnsure: [
        {
          tokens: [{ op: "setQuantity", verb: "retryable", times: 1 }],
          members: member("setQuantity", "retry"),
        },
        { members: member("setQuantity", "cancel") },
      ],
      Removed: [{}],
      RemoveUnsure: [
        {
          tokens: [{ op: "removeLine", verb: "retryable", times: 1 }],
          members: member("removeLine", "retry"),
        },
        { members: member("removeLine", "cancel") },
      ],
      ApplyCoupon: [
        {
          tokens: [{ op: "coupon", verb: "idle" }],
          guards: [({ event }) => event.code.trim() !== "" || deny("NoCode")],
          patch: ({ memory, event }) => ({
            coupon: {
              code: event.code,
              status: "applying",
              predictedTotalCents: Math.round(memory.subtotalCents * 0.9),
              reason: null,
            },
          }),
          members: commit("coupon", ({ memory, event }) => ({
            cartId: memory.cartId,
            code: event.code,
          })),
        },
      ],
      CouponApplied: [
        {
          patch: ({ memory }) => ({
            coupon: { ...memory.coupon, status: "applied", predictedTotalCents: null },
          }),
        },
      ],
      CouponRefused: [
        {
          patch: ({ event }) => ({
            coupon: {
              code: null,
              status: "refused",
              predictedTotalCents: null,
              reason: event.reason,
            },
          }),
        },
      ],
      CouponUnsure: [
        {
          patch: ({ memory }) => ({ coupon: { ...memory.coupon, status: "unsure" } }),
          members: member("coupon", "cancel"),
        },
      ],
    },
    [],
    undefined,
  ),
  SHOPPING: node("SHOPPING"),
  REMOVING: node("REMOVING", {
    Yes: [
      {
        target: "SHOPPING",
        patch: () => ({ removing: null }),
        members: commit("removeLine", ({ event, memory }) => ({
          cartId: memory.cartId,
          lineId: event.lineId,
        })),
      },
    ],
    Keep: [{ target: "SHOPPING", patch: () => ({ removing: null }) }],
  }),
};

const makePage = (api: Api): Compiled => ({
  id: D,
  nodes: pageNodes,
  root: "root",
  default: "SHOPPING",
  memory: memory((i: any) => ({
    cartId: i.cartId,
    quantities: {},
    subtotalCents: 0,
    removing: null,
    coupon: { code: null, status: "none", predictedTotalCents: null, reason: null },
  })),
  ops: {
    setQuantity: write(api, "setQuantity", "latest", lineKey, {
      success: { event: "QuantitySet" },
      failure: { LineGone: { event: "LineGone" }, NotSent: { event: "QuantitySet" } },
      unknown: { event: "QuantityUnsure" },
    }),
    removeLine: write(api, "removeLine", "reject", lineKey, removeOutcomes),
    coupon: write(api, "coupon", "reject", () => ({}), {
      success: { event: "CouponApplied" },
      failure: {
        CouponRejected: mapped("coupon", "failure.CouponRejected", "CouponRefused", (e) => ({
          reason: e.reason,
        })),
        NotSent: mapped("coupon", "failure.NotSent", "CouponRefused", () => ({
          reason: "Not sent",
        })),
      },
      unknown: { event: "CouponUnsure" },
    }),
    cart: {
      id: "cart",
      contract: "Checkout/cart",
      kind: "read",
      key: key("cart", (i) => ({ cartId: i.cartId })),
      concurrency: "reject",
      commit: (i) => api.call("cart", i) as Effect.Effect<unknown, unknown>,
      outcomes: {
        success: mapped("cart", "value", "Loaded", (v) => ({
          lines: v.lines.map((l: any) => ({ lineId: l.lineId, quantity: l.quantity })),
          subtotalCents: v.subtotalCents,
        })),
        failure: {
          NoResponse: { event: "LoadFailed" },
          Defect: { event: "LoadFailed" },
          Interrupted: { event: "LoadFailed" },
        },
      },
    },
  },
  persisted: false,
  uses: ["entities"],
  domain: domain(api),
});

// The header. One line, two actors' writes: this actor's own lane on removeLine.
const M = "Checkout/MiniCart";
const mini = fixtureOf(M);
const miniNodes = {
  root: mini.node(
    "root",
    {
      Remove: [
        {
          tokens: [
            {
              op: "removeLine",
              verb: "idle",
              key: mini.slot("on.Remove[0].guard[0]", ({ memory, event }: any) => ({
                cartId: memory.cartId,
                lineId: event.lineId,
              })),
            },
          ],
          members: mini.commit("removeLine", ({ event, memory }) => ({
            cartId: memory.cartId,
            lineId: event.lineId,
          })),
        },
      ],
      Removed: [{}],
      RemoveUnsure: [{ members: mini.member("removeLine", "cancel") }],
    },
    [],
    undefined,
  ),
  READY: mini.node("READY"),
};
const makeMini = (api: Api): Compiled => ({
  id: M,
  nodes: miniNodes,
  root: "root",
  default: "READY",
  memory: mini.memory((i: any) => ({ cartId: i.cartId })),
  ops: { removeLine: write(api, "removeLine", "reject", lineKey, removeOutcomes) },
  persisted: false,
  uses: ["entities"],
  domain: domain(api),
});

const line = (lineId: string, quantity: number, unitPriceCents: number) => ({
  cartId: "c1",
  lineId,
  quantity,
  unitPriceCents,
  lineTotalCents: quantity * unitPriceCents,
});
const answer = (s: any) => ({
  cartId: "c1",
  lines: Object.values(s.lines),
  subtotalCents: Object.values<any>(s.lines).reduce((n, l) => n + l.lineTotalCents, 0),
  totalCents: Object.values<any>(s.lines).reduce((n, l) => n + l.lineTotalCents, 0),
});
export const cartServer: ServerModel = {
  init: () => ({ lines: { l1: line("l1", 1, 2000), l2: line("l2", 2, 500) }, sent: [] }),
  apply(op, i, s) {
    if (op === "coupon")
      return i.code === "EXPIRED"
        ? { s, fail: { _tag: "CouponRejected", reason: "expired" } }
        : { s, value: answer(s) };
    if (!s.lines[i.lineId]) return { s, fail: { _tag: "LineGone" } };
    if (op === "removeLine") {
      const { [i.lineId]: _gone, ...lines } = s.lines;
      const n = { ...s, lines };
      return { s: n, value: answer(n) };
    }
    const l = s.lines[i.lineId];
    const lines = {
      ...s.lines,
      [i.lineId]: { ...l, quantity: i.quantity, lineTotalCents: l.unitPriceCents * i.quantity },
    };
    const n = { ...s, lines };
    return { s: n, value: answer(n) };
  },
  read: (op, i, s) => {
    if (op === "cart") return answer(s);
    const [entity, k] = i.ref.split("|");
    if (entity === "Cart") return { cartId: "c1", subtotalCents: answer(s).subtotalCents };
    return s.lines[k.split("/")[1]] ?? null;
  },
};
export const cartFixture: Fixture = { id: D, make: makePage, server: cartServer };
export const miniCartFixture: Fixture = { id: M, make: makeMini };
