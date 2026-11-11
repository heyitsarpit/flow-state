// Checkout's merchant refunds, as written: one READY state, `serialize` per charge, a prediction by field function, and
// a persisted identity (`shopSetup` persists it). `writes: ordersOf.invalidate` is absent: the cache is round 5.
import { Effect } from "effect";
import type { Fixture } from "../harness.ts";
import type { Api, ServerModel } from "../fake-world.ts";
import type { Compiled } from "./compiled.ts";
import { fixtureOf, unknownWhenLost } from "./build.ts";

const D = "Checkout/Refunds";
const { node, commit, lookup, member, mapped, memory, key, slot } = fixtureOf(D);
export const orderRef = (id: string) => `Order|${id}`;
const money = (c: number) => `$${(c / 100).toFixed(2)}`;

const nodes = {
  root: node(
    "root",
    {
      Open: [{ members: lookup("orders", () => ({})) }],
      Listed: [{}],
      ListFailed: [{}],
      RefundAsked: [
        { patch: () => ({ notice: "" }), members: commit("refund", ({ event }) => event) },
      ],
      Refunded: [{ patch: () => ({ notice: "Refunded" }) }],
      OverRefund: [
        {
          patch: ({ event }) => ({
            notice: `Only ${money(event.leftCents)} is left to refund on that charge.`,
          }),
        },
      ],
      RefundNotSent: [
        {
          patch: ({ event }) => ({
            notice:
              event.why === "Overloaded" ? "Too many refunds queued on this charge." : "Not sent.",
          }),
        },
      ],
      RefundUnsure: [
        {
          tokens: [{ op: "refund", verb: "retryable", times: 2 }],
          members: member("refund", "retry"),
        },
        {
          patch: () => ({
            notice: "We couldn't confirm a refund. Check the order before refunding again.",
          }),
          members: member("refund", "cancel"),
        },
      ],
    },
    [],
    undefined,
  ),
  READY: node("READY"),
};

const make = (api: Api): Compiled => ({
  id: D,
  nodes,
  root: "root",
  default: "READY",
  memory: memory(() => ({ notice: "" })),
  ops: {
    refund: {
      id: "refund",
      contract: "Checkout/refund",
      kind: "write",
      key: key("refund", (i) => ({ chargeId: i.chargeId })),
      concurrency: "serialize",
      commit: (input, { attempt }) =>
        api
          .call("refund", input, { idempotencyKey: attempt.id })
          .pipe(unknownWhenLost) as Effect.Effect<unknown, unknown>,
      outcomes: {
        success: mapped("refund", "success", "Refunded", (r) => ({ orderId: r.orderId })),
        failure: {
          OverRefund: mapped("refund", "failure.OverRefund", "OverRefund", (e) => ({
            leftCents: e.leftCents,
          })),
          NotSent: mapped("refund", "failure.NotSent", "RefundNotSent", (e) => ({ why: e.why })),
        },
        unknown: { event: "RefundUnsure" },
      },
    },
    orders: {
      id: "orders",
      contract: "Checkout/orders",
      kind: "read",
      key: key("orders", () => ({})),
      concurrency: "reject",
      commit: (i) => api.call("orders", i) as Effect.Effect<unknown, unknown>,
      outcomes: {
        success: { event: "Listed" },
        failure: {
          NoResponse: { event: "ListFailed" },
          Defect: { event: "ListFailed" },
          Interrupted: { event: "ListFailed" },
        },
      },
    },
  },
  persisted: true,
  uses: ["entities"],
  domain: {
    writes: {
      refund: {
        predicts: slot("domain.refund.predicts", (i: any) => [
          {
            ref: orderRef(i.orderId),
            patch: {
              refundedCents: (b: any, x: any) => b.refundedCents + x.amountCents,
              status: (b: any, x: any) =>
                b.refundedCents + x.amountCents >= b.amountCents ? "refunded" : "refunding",
            },
          },
        ]),
        // The answer is the Refund, not the order: it carries the refunded total only.
        confirms: (v) => [{ ref: orderRef(v.orderId), fields: { refundedCents: v.refundedCents } }],
      },
    },
    reads: { orders: (v: any[]) => v.map((o) => ({ ref: orderRef(o.orderId), fields: o })) },
    repair: (ref) => api.call("repair", { ref }) as Effect.Effect<any, any, never>,
  },
});

const server: ServerModel = {
  init: () => ({
    orders: { "o-9": { orderId: "o-9", amountCents: 9_000, refundedCents: 0, status: "paid" } },
  }),
  apply(_op, i, s) {
    const o = s.orders[i.orderId];
    const left = o.amountCents - o.refundedCents;
    if (i.amountCents > left) return { s, fail: { _tag: "OverRefund", leftCents: left } };
    const refundedCents = o.refundedCents + i.amountCents;
    const n = {
      ...o,
      refundedCents,
      status: refundedCents >= o.amountCents ? "refunded" : "refunding",
    };
    return {
      s: { ...s, orders: { ...s.orders, [i.orderId]: n } },
      value: { orderId: i.orderId, refundedCents },
    };
  },
  read: (op, i, s) =>
    op === "orders" ? Object.values(s.orders) : (s.orders[i.ref.split("|")[1]] ?? null),
};
export const refundsFixture: Fixture = { id: D, make, server };
