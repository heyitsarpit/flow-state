// Real flows: Cart (cart.story.ts), Refunds (refunds.story.ts), and other libraries' behaviours (LIB-*).
import { cartFixture, cartRef, lineRef, miniCartFixture } from "../typed/cart.ts";
import { issueRef, issuesFixture } from "../typed/issues.ts";
import { orderRef, refundsFixture } from "../typed/stores.ts";
import { Ctx, type Scenario } from "./ctx.ts";

const P = { actor: "Checkout/Cart", id: "c1" };
const H = { actor: "Checkout/MiniCart", id: "c1" };
const CART = { cartId: "c1" };
const C = [cartFixture, miniCartFixture];
const l = (lineId: string) => ({ cartId: "c1", lineId });
const shown = (c: Ctx, withHeader = false) => {
  c.ensure(P, CART);
  if (withHeader) c.ensure(H, CART);
  c.to(P, "Load");
  c.answer("cart", { truth: true });
};
const inc = (c: Ctx, lineId: string) => c.to(P, "Increment", { lineId });
const row = (c: Ctx, lineId: string, op = "setQuantity", a = P) => c.r.row(a, op, l(lineId));
const repairs = (c: Ctx) => {
  while (c.r.outside().open.some((o) => o.op === "repair" && !o.never))
    c.answer("repair", { truth: true });
};

const M = { actor: "Checkout/Refunds", id: "merchant-1" };
const O9 = orderRef("o-9");
const ch9 = { chargeId: "ch_9" };
const ask = (c: Ctx, amountCents: number) =>
  c.to(M, "RefundAsked", { orderId: "o-9", chargeId: "ch_9", amountCents });
const openRefunds = (c: Ctx) => {
  c.ensure(M);
  c.to(M, "Open");
  c.answer("orders", { truth: true });
};
const rrow = (c: Ctx) => c.r.row(M, "refund", ch9);

const IA = { actor: "Issues/List", id: "a" };
const IB = { actor: "Issues/List", id: "b" };

export const flowScenarios: readonly Scenario[] = [
  {
    id: "CART-01",
    kind: "example",
    fixtures: C,
    actor: P,
    cites: ["rule:21", "D3"],
    run(c) {
      // cart.story.ts waitsBehindUnsure, cart.test.ts:59.
      shown(c);
      inc(c, "l2");
      c.answer("setQuantity", { lost: true });
      repairs(c); // QuantityUnsure re-sent at once; D39 holds the send for its repair
      c.eq("the same Attempt", row(c, "l2")?.retryCount, 1);
      inc(c, "l2");
      c.eq("waits", row(c, "l2")?.waiting, true);
      c.answer("setQuantity", { apply: true }); // the re-send's answer
      const keys = c.reqs("setQuantity").map((r) => r.idempotencyKey);
      c.eq("the re-send carried the first Attempt's id", keys[0], keys[1]);
      c.answer("setQuantity", { apply: true });
      c.eq("caught up", c.r.truth().server.lines.l2.quantity, 4);
    },
  },
  {
    id: "CART-02",
    kind: "example",
    fixtures: C,
    actor: P,
    cites: ["rule:16", "rule:29", "D3"],
    variants: {
      "five-taps"(c) {
        shown(c);
        for (let i = 0; i < 5; i++) inc(c, "l2");
        c.eq("one sent", c.reqs("setQuantity").length, 1);
        c.eq(
          "total predicted from the price beneath",
          c.rec(lineRef("l2"))?.data.lineTotalCents,
          7 * 500,
        );
        c.eq(
          "three replaced",
          c.r.evidence("Superseded").filter((e) => e["op"] === "setQuantity").length,
          3,
        );
        c.answer("setQuantity", { apply: true });
        c.answer("setQuantity", { apply: true });
        c.eq("two requests for five taps", c.reqs("setQuantity").length, 2);
        c.eq("the server ends with 7", c.r.truth().server.lines.l2.quantity, 7);
        c.eq("settled", c.rec(lineRef("l2"))?.predicted, false);
      },
      "lines-independent"(c) {
        shown(c);
        inc(c, "l1");
        inc(c, "l2");
        c.eq("both sent", c.reqs("setQuantity").length, 2);
      },
      "at-most-nine"(c) {
        shown(c);
        for (let i = 0; i < 8; i++) inc(c, "l1");
        c.eq("quantity", c.mem(P).quantities.l1, 9);
        inc(c, "l1");
        c.eq("denied, unchanged", c.mem(P).quantities.l1, 9);
      },
      "remove-asked"(c) {
        shown(c);
        c.to(P, "Decrement", { lineId: "l1" });
        c.state("REMOVING", P);
        c.eq("still shown", c.rec(lineRef("l1"))?.data.lineId, "l1");
        c.to(P, "Yes", { lineId: "l1" });
        c.state("SHOPPING", P);
        c.eq("predicted away", c.rec(lineRef("l1"))?.data, undefined);
        c.answer("removeLine", { apply: true });
        c.eq("gone", c.rec(lineRef("l1"))?.data, undefined);
        c.eq("server", c.r.truth().server.lines.l1, undefined);
      },
      // cart.story.ts pageAndHeader: two actors, one record. The removal waits behind the change.
      "page-and-header"(c) {
        shown(c, true);
        inc(c, "l1");
        c.to(H, "Remove", { lineId: "l1" });
        c.eq("removal waits", c.reqs("removeLine").length, 0);
        c.eq("both screens: hidden at once", c.rec(lineRef("l1"))?.data, undefined);
        c.answer("setQuantity", { apply: true });
        c.eq("then it goes", c.reqs("removeLine").length, 1);
        c.answer("removeLine", { apply: true });
        c.eq("gone at the server", c.r.truth().server.lines.l1, undefined);
      },
      // cart.story.ts repricedUnderPending (E11): a new base under a pending prediction replays its field function.
      "repriced-under-pending"(c) {
        shown(c, true);
        inc(c, "l1"); // quantity 2 at 2000
        c.eq("predicted", c.rec(lineRef("l1"))?.data.lineTotalCents, 4000);
        c.fault({
          mutateServer: (s: any) => ({
            ...s,
            lines: {
              ...s.lines,
              l1: { ...s.lines.l1, unitPriceCents: 5000, lineTotalCents: 5000 },
            },
          }),
        });
        c.to(H, "Remove", { lineId: "l2" });
        c.answer("removeLine", { apply: true }); // the answer is the whole cart: l1's new price arrives
        c.eq("replayed over the new base", c.rec(lineRef("l1"))?.data.lineTotalCents, 10000);
        c.eq("still predicted", c.rec(lineRef("l1"))?.predicted, true);
        c.answer("setQuantity", { apply: true });
        c.answer("repair", { truth: true }); // D47: a newer answer landed while it was out, and it differs: the server decides
        c.eq("confirmed", c.rec(lineRef("l1"))?.data.lineTotalCents, 10000);
        c.eq("settled", c.rec(lineRef("l1"))?.predicted, false);
      },
      // A plain write beside the domain's: the coupon's guess is memory (rule 36).
      coupon(c) {
        shown(c);
        c.to(P, "ApplyCoupon", { code: "SAVE10" });
        c.eq("guess in memory", c.mem(P).coupon.predictedTotalCents, 2700);
        c.to(P, "ApplyCoupon", { code: "WELCOME5" });
        c.eq("a second code is refused before anything", c.reqs("coupon").length, 1);
        c.answer("coupon", { apply: true });
        c.eq("status", c.mem(P).coupon.status, "applied");
        c.to(P, "ApplyCoupon", { code: "EXPIRED" });
        c.answer("coupon", { apply: true });
        c.eq("refused", c.mem(P).coupon.reason, "expired");
        c.eq("cart record untouched", c.rec(cartRef)?.predicted, false);
      },
    },
  },
  {
    id: "REFUND-01",
    kind: "example",
    fixtures: [refundsFixture],
    actor: M,
    cites: ["rule:30", "rule:32", "D43", "D3"],
    variants: {
      // refunds.test.ts:18
      "three-refunds"(c) {
        openRefunds(c);
        ask(c, 4000);
        ask(c, 3000);
        ask(c, 5000);
        c.eq("queued", [rrow(c)?.pending, rrow(c)?.outstanding], [true, 2]);
        c.eq("predicted over the record beneath", c.rec(O9)?.data, {
          orderId: "o-9",
          amountCents: 9000,
          refundedCents: 12000,
          status: "refunded",
        });
        c.eq("predicted", c.rec(O9)?.predicted, true);
        c.ack();
        c.eq("one on the wire", c.reqs("refund").length, 1);
        c.answer("refund", { apply: true });
        c.eq("a promoted commit waits for its own ack", c.reqs("refund").length, 1);
        c.ack();
        c.answer("refund", { apply: true });
        c.ack();
        c.answer("refund", { apply: true });
        c.eq(
          "in order",
          c.reqs("refund").map((r) => r.input.amountCents),
          [4000, 3000, 5000],
        );
        c.eq("server", c.r.truth().server.orders["o-9"].refundedCents, 7000);
        c.eq("notice", c.mem(M).notice, "Only $20.00 is left to refund on that charge.");
        c.eq("settled", [c.rec(O9)?.data.refundedCents, c.rec(O9)?.predicted], [7000, false]);
      },
      // refunds.test.ts:46: the catalog's row: a held re-send shows uncertain.
      "unsure-holds-the-charge"(c) {
        openRefunds(c);
        ask(c, 1000);
        ask(c, 1000);
        c.ack();
        c.answer("refund", { lost: true });
        c.eq("mark", c.rec(O9)?.uncertain, true);
        c.answer("repair", { truth: true });
        c.ack("capture"); // the re-send's capture
        c.eq(
          "re-sent",
          [rrow(c)?.pending, rrow(c)?.retryCount, rrow(c)?.outstanding],
          [true, 1, 1],
        );
        c.eq("the record stays uncertain during the re-send", c.rec(O9)?.uncertain, true);
        c.answer("refund", { apply: true });
        c.ack();
        c.answer("refund", { apply: true });
        c.eq("both, deduped by key", c.r.truth().server.orders["o-9"].refundedCents, 2000);
      },
      // refunds.test.ts:56
      "reload-mid-refund"(c) {
        openRefunds(c);
        ask(c, 2000);
        c.ack();
        c.reload();
        c.eq("the stored mark", c.rec(O9)?.uncertain, true);
        c.answer("repair", { truth: true });
        c.ack("capture");
        c.answer("refund", { apply: true });
        c.eq("repaired", [c.rec(O9)?.data.refundedCents, c.rec(O9)?.uncertain], [2000, false]);
      },
      // refunds.test.ts:65 says outstanding 64. Rule 35's record queue declines the 65th first: logged finding.
      "sixty-five"(c) {
        openRefunds(c);
        for (let i = 0; i < 65; i++) ask(c, 1);
        c.eq("notice", c.mem(M).notice, "Too many refunds queued on this charge.");
        c.eq("record queue full at 64: head and 63 waiting", rrow(c)?.outstanding, 63);
      },
    },
  },
  {
    id: "LIB-01",
    kind: "example",
    fixtures: [issuesFixture],
    actor: IA,
    cites: ["D3"],
    run(c) {
      // Query mutations.test.tsx:431,540: same scope serial, different scopes parallel.
      c.ensure(IA);
      c.ensure(IB);
      c.to(IA, "Toggle", { id: "i1", liked: true });
      c.to(IB, "Toggle", { id: "i1", liked: false });
      c.eq("same record serial", c.reqs("like").length, 1);
      c.to(IB, "Toggle", { id: "i2", liked: true });
      c.eq("another record parallel", c.reqs("like").length, 2);
    },
  },
  {
    id: "LIB-02",
    kind: "example",
    fixtures: [issuesFixture],
    actor: IA,
    cites: ["D3"],
    run(c) {
      // DB KeyScheduler.test.ts:106,226: a later ready write does not pass an earlier retry. Audit gaps, the runner's ruling (rule 30, 2.8.5): it does,
      // once the unknown's forced repair settles; the earlier write keeps its own lane, and its retry then waits behind the later one.
      c.ensure(IA);
      c.ensure(IB);
      c.to(IA, "Toggle", { id: "i1", liked: true });
      c.answer("like", { lost: true });
      c.to(IB, "Toggle", { id: "i1", liked: false });
      c.eq("the later write waits while the repair runs", c.reqs("like").length, 1);
      c.answer("repair", { truth: true });
      c.eq("the repair settled: the later write goes", c.reqs("like").at(-1)?.input.liked, false);
      c.to(IA, "ReconcileLike", { id: "i1" });
      c.eq("the retry waits behind it", c.reqs("like").length, 2);
      c.answer("like", { apply: true });
      c.eq("then the retry", c.reqs("like").at(-1)?.input.liked, true);
    },
  },
  {
    id: "LIB-03",
    kind: "example",
    fixtures: [issuesFixture],
    actor: IA,
    cites: ["no-decision"],
    run(c) {
      // Query mutations.test.tsx:1169: removing one of two observers keeps the write. An actor owns a lane; subscribers
      // only read. So a subscriber that stops listening cannot touch it. Finding, not a test of much.
      c.ensure(IA);
      let seen = 0;
      c.h.subscribe(() => void seen++);
      c.to(IA, "Toggle", { id: "i1", liked: true });
      c.answer("like", { apply: true });
      c.yes("notified", seen > 0);
      c.eq("the write finished", c.r.row(IA, "like", { id: "i1" }), undefined);
      c.eq("record", c.rec(issueRef("i1"))?.predicted ?? false, false);
    },
  },
];
