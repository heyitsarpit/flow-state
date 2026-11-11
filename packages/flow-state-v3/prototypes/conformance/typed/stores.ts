// Round 11: `fixtures/refunds.compiled.ts`, `fixtures/s1.compiled.ts` and lab's Docs, with the machines in the public API and the domains in `Compiled`'s
// shape (D209). Refunds: one READY state, `serialize` per charge, a prediction by field function, a persisted identity. S1: one `latest` lane, two records,
// a commit predicts mask 1, 2 or 3. Docs: a domain write owned by a state, so its ending can be late (rule 15, rule 27, E13).
import { Effect, Schema } from "effect";
import type { Api } from "../fake-world.ts";
import { refundsFixture as handRefunds } from "../fixtures/refunds.compiled.ts";
import { s1Fixture as handS1 } from "../fixtures/s1.compiled.ts";
import { docsFixture as handDocs } from "../fixtures/lab.compiled.ts";
import { definition, Flow, machine, resource, transaction } from "../compile/index.ts";
import { call, FakeApi, fixture, write } from "./lab.ts";

export { orderRef } from "../fixtures/refunds.compiled.ts";
export { s1Ref } from "../fixtures/s1.compiled.ts";
import { orderRef } from "../fixtures/refunds.compiled.ts";
import { s1Ref } from "../fixtures/s1.compiled.ts";

const S = Schema;
const U = S.Unknown;
const repairBy = (api: Api) => (ref: string) => api.call("repair", { ref }) as Effect.Effect<unknown, unknown, never>;

// ── Refunds.
const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const refund = transaction({ id: "Checkout/refund", input: { chargeId: U, orderId: U, amountCents: U }, key: ["chargeId"], concurrency: "serialize", services: [FakeApi], commit: write<{ readonly orderId: unknown }, "OverRefund">("refund") });
const orders = resource({ id: "Checkout/orders", input: {}, key: [], services: [FakeApi], lookup: (i) => call<unknown, "NoResponse">("orders")(i) });
type Order = { readonly refundedCents: number; readonly amountCents: number };
const refunds = (api: Api) =>
  machine(
    definition({
      id: "Checkout/Refunds",
      persist: true,
      states: ["READY"],
      events: { Open: {}, RefundAsked: { chargeId: U, orderId: U, amountCents: U } },
      internalEvents: { Listed: {}, ListFailed: {}, Refunded: { orderId: U }, OverRefund: { leftCents: S.Number }, RefundNotSent: { why: U }, RefundUnsure: Flow.uncertain({}) },
      memory: { notice: Flow.initial(U, "") },
      uses: ["entities"],
      domain: {
        writes: {
          refund: {
            predicts: (i: { readonly orderId: string }) => [
              {
                ref: orderRef(i.orderId),
                patch: {
                  refundedCents: (b: Order, x: { readonly amountCents: number }) => b.refundedCents + x.amountCents,
                  status: (b: Order, x: { readonly amountCents: number }) => (b.refundedCents + x.amountCents >= b.amountCents ? "refunded" : "refunding"),
                },
              },
            ],
            // The answer is the Refund, not the order: it carries the refunded total only.
            confirms: (v: { readonly orderId: string; readonly refundedCents: number }) => [{ ref: orderRef(v.orderId), fields: { refundedCents: v.refundedCents } }],
          },
        },
        reads: { orders: (v: readonly { readonly orderId: string }[]) => v.map((o) => ({ ref: orderRef(o.orderId), fields: o })) },
        repair: repairBy(api),
      },
      operations: ({ E }) => ({
        refund: refund.outcomes({
          success: E.Refunded.from((r) => ({ orderId: r.orderId })),
          failure: { OverRefund: E.OverRefund.from((e) => ({ leftCents: (e as unknown as { readonly leftCents: number }).leftCents })), NotSent: E.RefundNotSent.from((e) => ({ why: e.why })) },
          unknown: E.RefundUnsure,
        }),
        orders: orders.outcomes({ success: E.Listed, failure: { NoResponse: E.ListFailed, Defect: E.ListFailed, Interrupted: E.ListFailed } }),
      }),
    }),
    ({ S: St, O }) => ({
      default: St.READY,
      on: {
        Open: { actions: [O.orders.lookup(() => ({}))] },
        Listed: {},
        ListFailed: {},
        RefundAsked: { updateMemory: () => ({ notice: "" }), actions: [O.refund.commit(({ event }) => event as never)] }, // the commit's input is the event as sent, as the hand fixture's
        Refunded: { updateMemory: () => ({ notice: "Refunded" }) },
        OverRefund: { updateMemory: ({ event }) => ({ notice: `Only ${money(event.leftCents)} is left to refund on that charge.` }) },
        RefundNotSent: { updateMemory: ({ event }) => ({ notice: event.why === "Overloaded" ? "Too many refunds queued on this charge." : "Not sent." }) },
        RefundUnsure: [
          { guard: [O.refund.retryable({ times: 2 })], actions: [O.refund.retry] },
          { updateMemory: () => ({ notice: "We couldn't confirm a refund. Check the order before refunding again." }), actions: [O.refund.cancel] },
        ],
      },
    }),
  );
export const refundsFixture = fixture(refunds, handRefunds.server);

// ── S1.
const recsOf = (mask: number) => (mask === 1 ? ["r1"] : mask === 2 ? ["r2"] : ["r1", "r2"]);
const w = transaction({ id: "s1/w", input: { mask: U, v: U }, key: [], concurrency: "latest", services: [FakeApi], commit: write<unknown, "Refused">("w") });
const s1 = (persisted: boolean) => (api: Api) =>
  machine(
    definition({
      id: "S1",
      states: ["READY"],
      events: { Commit: { mask: U, v: U }, Retry: {}, Cancel: {} },
      internalEvents: { Done: {}, Refused: {}, NotSent: {}, Unsure: Flow.uncertain({}) },
      memory: {},
      persist: persisted,
      uses: ["entities"],
      domain: {
        writes: {
          w: {
            predicts: (i: { readonly mask: number; readonly v: unknown }) => recsOf(i.mask).map((r) => ({ ref: s1Ref(r), patch: { v: i.v } })),
            confirms: (_val: unknown, i: { readonly mask: number; readonly v: unknown }) => recsOf(i.mask).map((r) => ({ ref: s1Ref(r), fields: { v: i.v } })),
          },
        },
        repair: repairBy(api),
      },
      operations: ({ E }) => ({ w: w.outcomes({ success: E.Done, failure: { Refused: E.Refused, NotSent: E.NotSent }, unknown: E.Unsure }) }),
    }),
    ({ S: St, O }) => ({
      default: St.READY,
      on: {
        Commit: { actions: [O.w.commit(({ event }) => event as never)] }, // the event as sent, as the hand fixture's
        Retry: { actions: [O.w.retry(() => ({}))] },
        Cancel: { actions: [O.w.cancel(() => ({}))] },
        Done: {},
        Refused: {},
        NotSent: {},
        Unsure: {},
      },
    }),
  );
export const s1Fixture = fixture(s1(false), handS1.server);
// lab.compiled.ts's persisted S1, for the crossed search and H1, M1.
export const s1Persisted = fixture(s1(true), handS1.server);

// ── Docs.
const docRef = (id: string) => `Doc|${id}`;
const docSave = transaction({ id: "lab/save", input: { id: U, title: U }, key: ["id"], concurrency: "reject", services: [FakeApi], commit: write<{ readonly title?: unknown }, "Refused">("save") });
const docTouch = transaction({ id: "lab/touch", input: { id: U }, key: ["id"], concurrency: "reject", services: [FakeApi], commit: write("touch") });
const docs = (api: Api) =>
  machine(
    definition({
      id: "Docs",
      states: ["LIST", "DETAIL"],
      events: { Open: {}, Close: {}, Save: { id: U, title: U }, Touch: { id: U } },
      internalEvents: { Saved: {}, Touched: {}, Unsure: Flow.uncertain({}), Failed: {} },
      memory: { saved: Flow.initial(S.Number, 0), lateSaved: Flow.initial(S.Number, 0) },
      persist: false,
      uses: ["entities"],
      domain: {
        writes: {
          save: {
            predicts: (i: { readonly id: string; readonly title: unknown }) => [{ ref: docRef(i.id), patch: { title: i.title } }],
            confirms: (v: { readonly title?: unknown } | undefined, i: { readonly id: string; readonly title: unknown }) => [{ ref: docRef(i.id), fields: { title: v?.title ?? i.title } }],
          },
        },
        repair: repairBy(api),
      },
      operations: ({ E }) => ({
        save: docSave.outcomes({ success: E.Saved, failure: { NotSent: E.Failed, Refused: E.Failed }, unknown: E.Unsure }),
        touch: docTouch.outcomes({ success: E.Touched, failure: { NotSent: E.Failed }, unknown: E.Unsure }),
      }),
    }),
    ({ S: St, O }) => ({
      default: St.LIST,
      on: { Open: St.DETAIL, Close: St.LIST, Saved: { target: St.LIST, updateMemory: ({ memory }) => ({ lateSaved: memory.lateSaved + 1 }) }, Touched: {}, Unsure: {}, Failed: {} },
      states: {
        DETAIL: {
          on: {
            Save: { actions: [O.save.commit(({ event }) => ({ id: event.id, title: event.title }))] },
            Touch: { actions: [O.touch.commit(({ event }) => ({ id: event.id }))] },
            Saved: { updateMemory: ({ memory }) => ({ saved: memory.saved + 1 }) },
          },
        },
      },
    }),
  );
export const docsFixture = fixture(docs, handDocs.server);
export { docRef };
