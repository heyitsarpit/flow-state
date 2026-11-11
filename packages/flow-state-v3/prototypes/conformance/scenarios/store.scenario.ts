// The record queue, predictions, marks, repair: LIKE-*, STORE-*. Worked out by hand from rules 27-32, 35, 2.8.5, 2.8.6, D3,
// D12/D40. `A` and `B` are two actors of one list; records are shared.
import { issueRef, issuesFixture } from "../typed/issues.ts";
import { orderRef, refundsFixture } from "../typed/stores.ts";
import { s1Fixture, s1Ref } from "../typed/stores.ts";
import { checkClaims, checkEndings, Ctx, type Scenario } from "./ctx.ts";

const A = { actor: "Issues/List", id: "a" };
const B = { actor: "Issues/List", id: "b" };
const I1 = issueRef("i1");
const k = { id: "i1" };
const F = [issuesFixture];
const opened = (c: Ctx, ...others: Array<typeof A>) => {
  c.ensure(A);
  for (const o of others) c.ensure(o);
  c.to(A, "Load");
  c.answer("list", { truth: true });
};
const toggle = (c: Ctx, liked: boolean, a = A) => c.to(a, "Toggle", { id: "i1", liked });
const row = (c: Ctx, op = "like", a = A) => c.r.row(a, op, k);
const server = (c: Ctx) => c.r.truth().server.issues;
// Audit 3: `unconfirmed` is a set; the design fixes no order.
const unconfirmedOf = (c: Ctx) => [...(c.rec(I1)?.unconfirmed ?? [])].sort();

const a0 = { actor: "S1", id: "a0" };
const a1 = { actor: "S1", id: "a1" };
const S1 = [s1Fixture];
const commit = (c: Ctx, a: typeof a0, mask: number, v: number) =>
  c.to(a, "Commit", { actor: a.id, mask, v });
const wOf = (c: Ctx, a: typeof a0, an: any) => c.answer("w", an, { actor: a.id });
const repairs = (c: Ctx) => {
  while (c.r.outside().open.some((o) => o.op === "repair" && !o.never))
    c.answer("repair", { truth: true });
};
const records = (c: Ctx) => c.r.truth().server.records;
const startS1 = (c: Ctx) => (c.ensure(a0), c.ensure(a1));

const reR = [refundsFixture];
const M = { actor: "Checkout/Refunds", id: "merchant-1" };
const O9 = orderRef("o-9");
const refund = (c: Ctx, amountCents: number, chargeId = "ch_9") =>
  c.to(M, "RefundAsked", { orderId: "o-9", chargeId, amountCents });
const inRefunds = (c: Ctx, f: (d: Ctx) => void) => {
  const d = new Ctx(c.fresh(reR), M);
  f(d);
  checkClaims(d.r);
  checkEndings(d.r);
};
const openRefunds = (c: Ctx) => {
  c.ensure(M);
  c.to(M, "Open");
  c.answer("orders", { truth: true });
};

export const storeScenarios: readonly Scenario[] = [
  {
    id: "LIKE-01",
    kind: "example",
    fixtures: F,
    actor: A,
    cites: ["D3", "rule:29", "rule:31", "F1", "sec:2.8.2"],
    run(c) {
      opened(c);
      toggle(c, true);
      c.eq("predicted", c.rec(I1)?.data.liked, true);
      c.answer("like", { lost: true });
      c.eq("held", row(c)?.uncertain, true);
      c.answer("repair", { truth: true });
      c.eq("repair ended the prediction", c.rec(I1)?.data.liked, false);
      c.eq("marked", c.rec(I1)?.uncertain, true);
      toggle(c, false); // the like button's second press, behind the hold
      c.eq("waits", row(c)?.waiting, true);
      c.to(A, "ReconcileLike", { id: "i1" }); // the retry: under design `a` this deadlocked (S1)
      c.eq("re-sent, same id", [c.reqs("like").length, c.keys("like").length], [2, 1]);
      c.answer("like", { apply: true });
      c.eq("waiting toggle goes", [c.reqs("like").length, c.keys("like").length], [3, 2]);
      c.answer("like", { apply: true });
      c.eq("last toggle wins at the server", server(c).i1.liked, false);
      c.eq("and on screen", c.rec(I1)?.data.liked, false);
      c.eq(
        "D59: the fresh re-send differed from the repair: marked until a later read",
        c.rec(I1)?.uncertain,
        true,
      );
      c.answer("repair", { truth: true });
      c.eq(
        "settled",
        [row(c), c.rec(I1)?.predicted, c.rec(I1)?.uncertain],
        [undefined, false, false],
      );
    },
  },
  {
    id: "LIKE-02",
    kind: "example",
    fixtures: S1,
    actor: a0,
    cites: ["D3", "S13", "S1:b2-trace"],
    run(c) {
      // S1's shortest b2 cycle: commit a0 m3; invoke; unknown; repair; commit a1 m3; retry a0; retry a1; repair; commit a0 m1.
      startS1(c);
      commit(c, a0, 3, 1);
      wOf(c, a0, { lost: true });
      repairs(c);
      // Audit gaps, the runner's ruling (rule 30, 2.8.5): a0's repair has settled, so its hold no longer holds r1 and r2; it keeps its own lane.
      commit(c, a1, 3, 2);
      c.eq("a1 goes past a0's settled hold", c.reqs("w").length, 2);
      c.to(a0, "Retry");
      c.eq("a0's re-send waits behind a1, on the wire", c.reqs("w").length, 2);
      c.to(a1, "Retry"); // InFlight: evidence, no re-send
      wOf(c, a1, { apply: true });
      c.eq("then a0 re-sends", c.reqs("w").length, 3);
      commit(c, a0, 1, 3);
      wOf(c, a0, { apply: true });
      wOf(c, a0, { apply: true });
      c.eq("finishes in send order: a0's late re-send of v1 lands over a1's v2 on r2 (no version: the stated limit)", records(c), { r1: 3, r2: 1 });
      c.eq("S1's commit-order oracle sees it", c.r.truth().server.inverted, true);
    },
  },
  {
    id: "LIKE-03",
    kind: "example",
    fixtures: S1,
    actor: a0,
    cites: ["D3", "S1:f-trace"],
    run(c) {
      startS1(c);
      commit(c, a0, 1, 1);
      wOf(c, a0, { lost: true });
      repairs(c);
      commit(c, a0, 2, 2); // a draft: in a0's W behind its own hold, it holds no record (D3 as directed)
      commit(c, a1, 3, 3); // a0's hold has settled its repair (the runner's ruling): a1 goes at once
      c.eq("a1 goes before a0's re-send and its draft", c.reqs("w").at(-1)?.input.v, 3);
      c.to(a0, "Retry");
      wOf(c, a1, { apply: true });
      wOf(c, a0, { apply: true });
      wOf(c, a0, { apply: true });
      c.eq("finishes, in the order sends began", records(c), { r1: 1, r2: 2 });
      c.eq("S1's commit-order oracle sees the late draft land last", c.r.truth().server.inverted, true);
    },
  },
  {
    id: "LIKE-04",
    kind: "example",
    fixtures: F,
    actor: A,
    cites: ["D3", "S5"],
    run(c) {
      opened(c, B);
      toggle(c, true);
      c.answer("like", { lost: true });
      c.answer("repair", { truth: true });
      // Audit gaps, the runner's ruling (rule 30, 2.8.5): A's repair has settled, so its hold keeps its own lane and no longer holds the record.
      toggle(c, true, B);
      c.eq("B sent at once", c.reqs("like").length, 2);
      const held = c.r.quiet().waits.find((w) => w.kind === "held");
      c.yes("Inspection still names A's hold", held && held.kind === "held" && held.actor === "Issues/List/a");
      c.eq("and nothing waits on it", c.r.quiet().waits.filter((w) => w.kind === "queue").length, 0);
      c.to(A, "CancelLike", { id: "i1" });
      c.eq("A gives up: released, nothing re-sent", [c.r.evidence("Released").length, c.reqs("like").length], [1, 2]);
    },
  },
  {
    id: "LIKE-05",
    kind: "example",
    fixtures: S1,
    actor: a0,
    cites: ["L2", "S1:mint-order"],
    run(c) {
      // commit a0; invoke; commit a0; commit a1; end; invoke#2; end; invoke#1. S1's `c` loses the last intent here.
      startS1(c);
      commit(c, a0, 1, 1);
      commit(c, a0, 1, 2);
      commit(c, a1, 1, 3);
      wOf(c, a0, { apply: true });
      c.eq("a1's head goes before a0's draft", c.reqs("w").at(-1)?.input.v, 3);
      c.eq("the draft waits", c.reqs("w").length, 2);
      wOf(c, a1, { apply: true });
      c.eq("the draft goes", c.reqs("w").at(-1)?.input.v, 2);
      wOf(c, a0, { apply: true });
      c.eq(
        "sent in the order sends began (D3 as directed), not mint order",
        c.reqs("w").map((r) => r.input.v),
        [1, 3, 2],
      );
      c.eq("the last sent holds: no version check here, so nothing names the conflict", records(c).r1, 2);
    },
  },
  {
    id: "LIKE-06",
    kind: "example",
    fixtures: F,
    actor: A,
    cites: ["sec:2.7.14", "OD:20.F1", "D55"],
    run(c) {
      // Stated limit: a released unknown may land after a newer write. Rule 32 (U10): the newer success demotes the mark to `unconfirmed`; it stays.
      opened(c, B);
      toggle(c, true);
      c.answer("like", { lost: true });
      c.answer("repair", { truth: true });
      c.to(A, "CancelLike", { id: "i1" });
      c.eq("mark stays after release", c.rec(I1)?.uncertain, true);
      toggle(c, false, B);
      c.answer("like", { apply: true });
      c.eq("rule 32 (U10): a later success demotes a released mark, never clears it", [c.rec(I1)?.uncertain, unconfirmedOf(c)], [false, ["liked", "likes"]]);
      c.eq("the give-up asked one read", c.reqs("repair").length, 2);
      c.answer("repair", { truth: true });
      c.fault({ landLate: "like" });
      c.eq("the world moved, unseen", server(c).i1.liked, true);
      c.eq("the screen is stale, but marked: unconfirmed, not clean", [c.rec(I1)?.data.liked, unconfirmedOf(c)], [false, ["liked", "likes"]]);
      c.to(A, "Load");
      c.answer("list", { truth: true });
      c.eq("a read repairs it, and the mark stays: nothing proves it was the last", [c.rec(I1)?.data.liked, unconfirmedOf(c)], [true, ["liked", "likes"]]);
    },
  },
  {
    id: "STORE-01",
    kind: "example",
    fixtures: F,
    actor: A,
    cites: ["rule:30", "cell:store.success", "D3"],
    run(c) {
      opened(c);
      c.to(A, "Edit", { id: "i1", title: "New" });
      c.eq(
        "predicted",
        [c.rec(I1)?.data.title, c.rec(I1)?.data.slug, c.rec(I1)?.predicted],
        ["New", "new", true],
      );
      c.answer("rename", { apply: true });
      c.eq("confirmed field replaced", c.rec(I1)?.data.title, "New");
      c.eq("no live prediction", c.rec(I1)?.predicted, false);
      c.eq("omitted field unconfirmed", unconfirmedOf(c), ["slug"]);
      c.eq("and still shown", c.rec(I1)?.data.slug, "new");
      c.to(A, "Load");
      c.answer("list", { truth: true });
      c.eq("a read confirms it", unconfirmedOf(c), []);
    },
  },
  {
    id: "STORE-02",
    kind: "example",
    fixtures: F,
    actor: A,
    cites: ["cell:store.failure", "rule:30", "D3"],
    run(c) {
      opened(c);
      toggle(c, true);
      c.answer("like", { fail: { tag: "Refused" } });
      c.eq("removed", [c.rec(I1)?.data.liked, c.rec(I1)?.predicted], [false, false]);
      c.eq("no repair", c.reqs("repair").length, 0);
      c.eq("uncertain unchanged", c.rec(I1)?.uncertain, false);
      c.eq("toast", c.mem(A).toast, "Could not update");
    },
  },
  {
    id: "STORE-03",
    kind: "example",
    fixtures: F,
    actor: A,
    cites: ["cell:store.unknown", "D3"],
    run(c) {
      opened(c, B);
      toggle(c, true);
      c.answer("like", { lost: true });
      c.eq("kept until repair", [c.rec(I1)?.data.liked, c.rec(I1)?.predicted], [true, true]);
      c.eq("forced", c.reqs("repair").length, 1);
      c.eq("marked", c.rec(I1)?.uncertain, true);
      toggle(c, false, B);
      c.answer("repair", { truth: true });
      c.eq("the repair ends A's prediction; B's still shows", c.rec(I1)?.predicted, true);
      c.eq("the mark stays", c.rec(I1)?.uncertain, true);
      c.eq("the repair settled: B goes (rule 30, the runner's ruling)", c.reqs("like").length, 2);
    },
  },
  {
    id: "STORE-04",
    kind: "example",
    fixtures: F,
    actor: A,
    cites: [
      "cell:notsent.Rejected",
      "cell:notsent.Overloaded",
      "cell:notsent.Superseded",
      "cell:notsent.Cancelled",
      "cell:notsent.Restored",
      "cell:notsent.StorageRefused",
      "cell:notsent.Disposed",
    ],
    variants: {
      Rejected(c) {
        opened(c);
        c.to(A, "Delete", { id: "i1" });
        c.eq("predicted away", c.rec(I1)?.data, undefined);
        c.eq("one queue entry", c.reqs("remove").length, 1);
        c.to(A, "Delete", { id: "i1" }); // idle token denies; so ask without it
        c.eq("denied, not rejected: the token sees it", c.r.evidence("Denied").length > 0, true);
      },
      Overloaded(c) {
        inRefunds(c, (d) => {
          d.ensure(M);
          for (let i = 0; i < 65; i++) refund(d, 1, `ch${i}`);
          d.eq("the 65th lane's write is declined", d.lastEnding("refund")?.reason, "Overloaded");
          d.eq("notice", d.mem(M).notice, "Too many refunds queued on this charge.");
        });
      },
      Superseded(c) {
        opened(c);
        toggle(c, true);
        toggle(c, false);
        toggle(c, true);
        c.eq(
          "evidence, one",
          c.r.evidence("Superseded").filter((e) => e["op"] === "like").length,
          1,
        );
        c.eq(
          "delivered to no handler",
          c.r.evidence("delivered").filter((e) => e["op"] === "like").length,
          0,
        );
        c.eq("prediction gone, the newer one shows", c.rec(I1)?.data.liked, true);
        c.eq("no repair", c.reqs("repair").length, 0);
      },
      // OD20 F4: a head never sent and not yet invoked is replaced too, not queued behind.
      "Superseded-head"(c) {
        opened(c, B);
        toggle(c, true);
        toggle(c, false, B); // B's head: never sent, waiting in the record queue
        toggle(c, true, B);
        c.eq("replaced", c.r.evidence("Superseded").filter((e) => e["op"] === "like").length, 1);
        c.eq("nothing behind it", row(c, "like", B)?.waiting, false);
      },
      Cancelled(c) {
        opened(c, B);
        toggle(c, true);
        toggle(c, false, B); // waits in the queue, never sent
        c.to(B, "CancelLike", { id: "i1" });
        c.eq("reason", c.lastEnding("like")?.reason, "Cancelled");
        c.eq("removed", c.rec(I1)?.data.liked, true);
        c.eq("toast", c.mem(B).toast, "Could not update");
      },
      Restored(c) {
        inRefunds(c, (d) => {
          openRefunds(d);
          refund(d, 100);
          d.reload(); // never acknowledged
          // Round 7, the edge: a first send's capture and ack are one batch: nothing on disk, so nothing to end. `Restored-W` still ends one.
          d.eq("no ending from the disk", d.lastEnding("refund")?.reason, undefined);
          d.eq("no mark", d.rec(O9), undefined);
          d.eq("no repair", d.reqs("repair").length, 0);
        });
      },
      // C2: on a reload each W entry ends too, delivered.
      "Restored-W"(c) {
        inRefunds(c, (d) => {
          openRefunds(d);
          refund(d, 100);
          refund(d, 200);
          d.ack();
          d.reload();
          const es = d.endings("refund").map((e) => e["reason"]);
          d.eq(
            "the head holds, W ends",
            [es.includes("Restored"), d.r.row(M, "refund", { chargeId: "ch_9" })?.outstanding],
            [true, 0],
          );
          d.eq("W's ending reached the machine", d.mem(M).notice, "Not sent.");
        });
      },
      StorageRefused(c) {
        inRefunds(c, (d) => {
          openRefunds(d);
          refund(d, 100);
          d.eq("predicted", d.rec(O9)?.data.refundedCents, 100);
          d.do({ storage: "refuse" });
          d.eq("reason", d.lastEnding("refund")?.reason, "StorageRefused");
          d.eq("removed", d.rec(O9)?.data.refundedCents, 0);
          d.eq("no mark", d.rec(O9)?.uncertain, false);
        });
      },
      Disposed(c) {
        inRefunds(c, (d) => {
          openRefunds(d);
          refund(d, 100);
          d.do({ disposeRuntime: true });
          d.eq("removed", d.rec(O9)?.data.refundedCents, 0);
          d.eq("reason", d.lastEnding("refund")?.reason, "Disposed");
        });
      },
      NothingToResend(c) {
        opened(c);
        c.to(A, "ReconcileLike", { id: "i1" });
        c.yes("evidence only", c.hitCell("lane.retry.Idle"));
        c.eq("nothing sent", c.reqs("like").length, 0);
      },
    },
  },
  {
    id: "STORE-05",
    kind: "example",
    fixtures: F,
    actor: A,
    cites: ["rule:32", "sec:2.8.6"],
    variants: {
      "retry-success-clears"(c) {
        opened(c);
        toggle(c, true);
        c.answer("like", { lost: true });
        c.answer("repair", { truth: true });
        c.to(A, "ReconcileLike", { id: "i1" });
        c.eq("a re-send does not clear", c.rec(I1)?.uncertain, true);
        c.answer("like", { apply: true });
        c.eq(
          "D59: it shows, marked: a read differed since it was sent",
          c.rec(I1)?.data.liked,
          true,
        );
        c.eq("marked", c.rec(I1)?.uncertain, true);
        c.answer("repair", { truth: true });
        c.eq("a later read clears it", c.rec(I1)?.uncertain, false);
      },
      "failed-retry-does-not"(c) {
        opened(c);
        toggle(c, true);
        c.answer("like", { lost: true });
        c.answer("repair", { truth: true });
        c.to(A, "ReconcileLike", { id: "i1" });
        c.answer("like", { fail: { tag: "Refused" } });
        c.eq("StillUnknown", c.lastEnding("like")?.reason, "StillUnknown");
        c.eq("mark stays", c.rec(I1)?.uncertain, true);
      },
      "a-read-does-not"(c) {
        opened(c);
        toggle(c, true);
        c.answer("like", { lost: true });
        c.answer("repair", { truth: true });
        c.to(A, "Load");
        c.answer("list", { truth: true });
        c.eq("mark stays", c.rec(I1)?.uncertain, true);
      },
      "a-later-failure-does-not"(c) {
        opened(c, B);
        toggle(c, true);
        c.answer("like", { lost: true });
        c.answer("repair", { truth: true });
        c.to(A, "CancelLike", { id: "i1" });
        toggle(c, false, B);
        c.answer("like", { fail: { tag: "Refused" } });
        c.eq("mark stays", c.rec(I1)?.uncertain, true);
      },
      "an-unresolved-mark-outlives-another-success"(c) {
        // A success elsewhere must not clear it, and an older Attempt still unresolved keeps its mark on this record.
        const d = new Ctx(c.fresh(S1), a0);
        startS1(d);
        commit(d, a0, 1, 1);
        wOf(d, a0, { lost: true });
        repairs(d);
        commit(d, a1, 2, 2);
        wOf(d, a1, { apply: true });
        d.eq("other record clean", d.rec(s1Ref("r2"))?.uncertain, false);
        d.eq("this one stays", d.rec(s1Ref("r1"))?.uncertain, true);
      },
    },
  },
  // Added from the second author's survivors.
  {
    id: "STORE-11",
    kind: "example",
    fixtures: F,
    actor: A,
    cites: ["D39", "cell:lane.cancel.InFlight", "rule:30", "D3"],
    variants: {
      "a-resend-waits-for-its-repair"(c) {
        opened(c);
        toggle(c, true);
        c.answer("like", { lost: true });
        c.to(A, "ReconcileLike", { id: "i1" });
        c.eq("waits", c.reqs("like").length, 1);
        c.answer("repair", { truth: true });
        c.eq("then goes", c.reqs("like").length, 2);
      },
      "cancel-a-waiting-resend"(c) {
        opened(c);
        toggle(c, true);
        c.answer("like", { lost: true });
        c.to(A, "ReconcileLike", { id: "i1" });
        c.to(A, "CancelLike", { id: "i1" });
        c.eq("released", c.r.evidence("Released").length, 1);
        c.eq("gone", row(c), undefined);
        c.answer("repair", { truth: true });
        c.eq("never sent again", c.reqs("like").length, 1);
      },
      "stillunknown-keeps-its-place"(c) {
        opened(c, B);
        toggle(c, true);
        c.answer("like", { lost: true });
        c.answer("repair", { truth: true });
        toggle(c, false, B);
        c.answer("like", { apply: true }, { liked: false });
        c.to(A, "ReconcileLike", { id: "i1" });
        c.eq("A re-sent", c.reqs("like").length, 3);
        c.answer("like", { fail: { tag: "Refused" } });
        c.eq("StillUnknown is unknown, not failure", [c.lastEnding("like")?.["channel"], c.lastEnding("like")?.["reason"]], ["unknown", "StillUnknown"]);
        toggle(c, true, B);
        c.eq("it holds the record again until its forced repair settles: B waits", c.reqs("like").length, 3);
        c.answer("repair", { truth: true });
        c.eq("then B goes", c.reqs("like").length, 4);
      },
    },
  },
  {
    id: "STORE-06",
    kind: "example",
    fixtures: S1,
    actor: a0,
    cites: ["rule:35"],
    run(c) {
      const actor = (i: number) => ({ actor: "S1", id: `x${i}` });
      for (let i = 0; i < 65; i++) c.ensure(actor(i));
      for (let i = 0; i < 64; i++) commit(c, actor(i), 2, i + 1);
      commit(c, actor(64), 3, 100); // would fit r1, not r2
      c.eq("declined", c.lastEnding("w")?.reason, "Overloaded");
      c.eq("no partial join: r1 shows nothing", c.rec(s1Ref("r1")), undefined);
      c.eq(
        "r2 stays predicted, over no base: E18 shows nothing",
        c.rec(s1Ref("r2"))?.predicted,
        true,
      );
    },
  },
  {
    id: "STORE-07",
    kind: "fault",
    fixtures: F,
    actor: A,
    cites: ["D40"],
    variants: {
      // D12/D40 as ruled: a repair ends when it answers or fails, bounded by a count of asks, never a clock.
      "released-entry-leaves-when-its-repair-fails"(c) {
        opened(c, B);
        toggle(c, true);
        c.answer("like", { lost: true });
        c.to(A, "CancelLike", { id: "i1" });
        toggle(c, false, B);
        c.advance(3_600_000);
        c.eq("B waits: no clock frees the queue", c.reqs("like").length, 1);
        c.answer("repair", { fail: { tag: "NoResponse" } });
        c.eq("the failed repair frees the queue", c.reqs("like").length, 2);
        c.eq("mark stays", c.rec(I1)?.uncertain, true);
      },
      "a-live-hold-outranks-three-failed-repairs"(c) {
        opened(c, B);
        toggle(c, true);
        c.answer("like", { lost: true });
        toggle(c, false, B);
        for (let i = 0; i < 3; i++) c.tryAnswer("repair", { fail: { tag: "NoResponse" } });
        c.eq("overdue", c.r.evidence("RepairOverdue").length, 1);
        c.eq("A still holds: D3", row(c)?.uncertain, true);
        c.eq("B still waits", c.reqs("like").length, 1);
        c.eq("A's prediction ended; B's shows", c.rec(I1)?.data.liked, false);
        c.to(A, "ReconcileLike", { id: "i1" });
        c.eq("D39: no repair runs, so the re-send goes", c.reqs("like").length, 2);
      },
      "a-hung-repair-holds-with-no-flow-bound"(c) {
        opened(c);
        c.fault({ uninterruptibleHang: "repair" });
        toggle(c, true);
        c.answer("like", { lost: true });
        c.advance(3_600_000);
        c.eq("no overdue, the mark stays", [c.r.evidence("RepairOverdue").length, c.rec(I1)?.uncertain], [0, true]);
      },
    },
  },
  {
    id: "STORE-08",
    kind: "example",
    fixtures: F,
    actor: A,
    cites: ["rule:28"],
    run(c) {
      opened(c, B);
      toggle(c, true);
      const n = c.r.frames().length;
      toggle(c, false, B);
      const fs = c.r.frames().slice(n);
      const with_ = fs.filter(
        (f) => f.records[I1]?.data?.liked === false && f.records[I1]?.predicted,
      );
      c.eq("the turn is one publication", fs.length, 1);
      c.eq(
        "row and prediction in it",
        fs[0]?.view["Issues/List/b"]?.rows[`like|${JSON.stringify(k)}`]?.pending,
        true,
      );
      c.eq("no frame between", with_.length, 1);
    },
  },
  {
    id: "STORE-09",
    kind: "example",
    fixtures: reR,
    actor: M,
    cites: ["rule:38", "rule:30", "rule:46", "D3"],
    run(c) {
      openRefunds(c);
      refund(c, 2000);
      c.ack();
      c.eq("on the wire", c.reqs("refund").length, 1);
      const stored = JSON.stringify(
        [...c.r.stored().entries()].filter(([k2]) => c.laneKeys().includes(k2)),
      );
      c.yes("predicted keys persist with the lane", stored.includes(O9));
      c.eq("prediction values do not", stored.includes("refundedCents"), false);
      c.reload();
      c.eq("no prediction after a reload", c.rec(O9)?.predicted ?? false, false);
      c.eq("marked", c.rec(O9)?.uncertain, true);
      c.eq("repair forced at boot", c.reqs("repair").length, 1);
    },
  },
  {
    id: "STORE-10",
    kind: "example",
    fixtures: reR,
    actor: M,
    cites: ["rule:22", "rule:28"],
    near: ["rule:36"],
    run(c) {
      // `optimistic` itself is not in the format yet; a queued commit's select is the same read: captured at commit.
      openRefunds(c);
      refund(c, 100);
      refund(c, 200);
      c.ack();
      c.answer("refund", { apply: true });
      c.ack();
      c.eq(
        "the queued start kept what its own turn saw",
        c.reqs("refund").at(-1)?.input.amountCents,
        200,
      );
    },
  },
];
