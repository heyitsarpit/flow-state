// Round 2's review: its Highs and Mediums, and the eleven mutants that survived it. Each expected result is worked out from the
// rule it cites. M2 and M4's row field, D45-D55, are convergence-3's: citing them means the scenario tests that proposal.
import {
  docRef,
  docsFixture,
  issuesDenySettled,
  issuesPersisted,
  issuesThrowing,
  oddFixture,
} from "../fixtures/lab.compiled.ts";
import { issueRef, issuesFixture } from "../fixtures/issues.compiled.ts";
import { ringFixture } from "../fixtures/order.compiled.ts";
import { payFixture } from "../fixtures/pay.compiled.ts";
import type { Scenario } from "./ctx.ts";
import { Ctx } from "./ctx.ts";

const A = { actor: "Issues/List", id: "a" };
const B = { actor: "Issues/List", id: "b" };
const I1 = issueRef("i1");
const k = { id: "i1" };
const opened = (c: Ctx, ...others: Array<typeof A>) => {
  c.ensure(A);
  for (const o of others) c.ensure(o);
  c.to(A, "Load");
  c.answer("list", { truth: true });
};
const toggle = (c: Ctx, liked: boolean, a = A) => c.to(a, "Toggle", { id: "i1", liked });
const row = (c: Ctx, op = "like", a = A) => c.r.row(a, op, k);
const server = (c: Ctx) => c.r.truth().server.issues;
const P = { actor: "Checkout/Pay", id: "shopper-1" };
const CART = { cartId: "c1", intentId: "pi1" };
const CAP = { status: "requires_capture", clientSecret: "" };
const payTo = (c: Ctx) => {
  c.ensure();
  c.send("Start", CART);
  c.send("PayRequested", { paymentMethodId: "visa" });
};
const heldAfterReload = (c: Ctx) => {
  opened(c);
  toggle(c, true);
  c.do({ storage: "landNoAck" });
  c.reload();
  c.eq("restored unknown", c.lastEnding("like")?.reason, "Restored");
  c.eq("held", row(c)?.uncertain, true);
  c.answer("repair", { truth: true });
};
const D1 = { actor: "Docs", id: "a" };
const docs = (c: Ctx) => {
  c.ensure(D1);
  c.to(D1, "Open");
};

export const reviewScenarios: readonly Scenario[] = [
  // ── H1: a restored Attempt is never "never sent". 2.7.13's restore row, G1, D45.
  {
    id: "HIGH-01",
    kind: "fault",
    fixtures: [issuesPersisted],
    actor: A,
    cites: [
      "D45",
      "cell:lane.restore.InFlight",
      "cell:lane.storageRefused.InFlight",
      "rule:18",
      "rule:24",
      "G1",
    ],
    variants: {
      "pay-told-not-charged"(c0) {
        const c = new Ctx(c0.fresh([payFixture]), P);
        payTo(c);
        c.do({ storage: "landNoAck" });
        c.reload();
        c.state("UNSURE");
        c.advance(3000);
        c.answer("order", { ok: null });
        c.answer("intent", { ok: { status: "requires_payment_method" } });
        c.state("PAYING");
        c.do({ storage: "refuse" });
        c.state("UNSURE");
        c.eq("never told", c.mem().notice.includes("haven't been charged"), false);
        c.eq("unknown again", c.lastEnding("pay")?.reason, "StorageRefused");
        c.eq("row held", c.r.row(P, "pay", { intentId: "pi1" })?.uncertain, true);
      },
      "retry-then-cancel-releases"(c) {
        heldAfterReload(c);
        c.to(A, "ReconcileLike", k);
        c.to(A, "CancelLike", k);
        c.eq("no definite ending", c.lastEnding("like")?.reason, "Restored");
        c.eq("released", c.r.evidence("Released").length, 1);
        c.eq("lane gone", row(c), undefined);
        c.eq("mark stays", c.rec(I1)?.uncertain, true);
      },
      "retry-then-commit-queues-behind"(c) {
        heldAfterReload(c);
        const id = c.r.evidence("mint")[0]?.["attempt"];
        c.to(A, "ReconcileLike", k);
        toggle(c, false);
        c.eq(
          "never Superseded",
          c.r.evidence("Superseded").filter((e) => e["attempt"] === id).length,
          0,
        );
        c.eq("waiting", row(c)?.waiting, true);
        c.ack();
        c.eq(
          "the re-send goes first, same id",
          c.reqs("like").map((q) => q.idempotencyKey),
          [id],
        );
        c.answer("like", { apply: true });
        c.ack();
        c.eq("the new write only after it", c.reqs("like").length, 2);
        c.answer("like", { apply: true });
        c.eq("last intent wins", server(c).i1.liked, false);
        c.eq("mark cleared by the retry's success", c.rec(I1)?.uncertain, false);
      },
      "retry-then-refuse-holds"(c) {
        heldAfterReload(c);
        c.to(A, "ReconcileLike", k);
        c.do({ storage: "refuse" });
        c.eq("unknown again", c.lastEnding("like")?.reason, "StorageRefused");
        c.eq("held", row(c)?.uncertain, true);
        c.eq("record kept", c.rec(I1)?.uncertain, true);
      },
    },
  },
  // ── H2: a poison record or a user value is not fatal. PERSIST-02, rule 46, D46.
  {
    id: "HIGH-02",
    kind: "fault",
    fixtures: [payFixture],
    actor: P,
    cites: ["D46", "rule:46"],
    namedIssues: ["RecordQuarantined"],
    variants: {
      "lane-does-not-parse"(c) {
        payTo(c);
        c.ack();
        c.fault({ corruptStored: { match: "lane/", edit: () => "{{{" } });
        for (const _ of [1, 2]) {
          c.reload();
          c.eq("alive", c.r.quiet().fatal, false);
          c.eq("named", String(c.r.issues().at(-1)?.input).includes("lane/"), true);
        }
        c.send("Leave");
        c.state("LEFT");
      },
      "lane-names-a-removed-operation"(c) {
        payTo(c);
        c.ack();
        c.fault({
          corruptStored: {
            match: "lane/",
            edit: (raw) => raw.replace('"op":"pay"', '"op":"gone"'),
          },
        });
        for (const _ of [1, 2]) {
          c.reload();
          c.eq("alive", c.r.quiet().fatal, false);
        }
        c.send("Leave");
        c.state("LEFT");
      },
      "actor-of-a-removed-machine"(c) {
        payTo(c);
        c.ack();
        c.fault({
          corruptStored: {
            match: "actor/",
            edit: (raw) => raw.replace('"machine":"Checkout/Pay"', '"machine":"Gone"'),
          },
        });
        for (const _ of [1, 2]) {
          c.reload();
          c.eq("alive", c.r.quiet().fatal, false);
        }
        c.eq("no actor", c.r.state(P), undefined);
        c.ensure();
        c.eq(
          "a fresh one starts and adopts the lane's hold",
          c.lastEnding("pay")?.reason,
          "Restored",
        );
      },
      "a-key-closure-returns-what-cannot-encode"(c0) {
        const X = { actor: "Odd", id: "x" };
        const Y = { actor: "Odd", id: "y" };
        const c = new Ctx(c0.fresh([oddFixture]), X);
        c.ensure();
        c.ensure(Y);
        c.send("BadKey");
        // Round 7, D89, decided: a commit that cannot be keyed declines; the turn is not refused.
        c.eq("named", c.r.issues().at(-1)?.code, "UnencodableValue");
        c.eq("alive", c.r.quiet().fatal, false);
        c.to(Y, "Fine");
        c.eq("others go on", c.r.memory(Y).n, 1);
        c.namedIssues = ["UnencodableValue"];
        c0.namedIssues = ["UnencodableValue"];
      },
      "persisted-memory-that-cannot-encode"(c0) {
        const X = { actor: "Odd", id: "x" };
        const c = new Ctx(c0.fresh([oddFixture]), X);
        c.ensure();
        c.send("BadMemory");
        // Round 7, D89, O5 over D57: the turn commits; the driver keeps the batch back and names it. The disk keeps the last good capture.
        c.eq("named", c.r.issues().at(-1)?.code, "UnencodableValue");
        c.eq("committed", typeof c.mem().big, "bigint");
        c.reload();
        c.eq("the last good capture", c.mem().big, undefined);
        c.send("Fine");
        c.reload();
        c.eq("the record is good", c.mem().n, 1);
        c.namedIssues = ["UnencodableValue"];
        c0.namedIssues = ["UnencodableValue"];
      },
    },
  },
  // ── H3, H6: a user closure outside a turn. D46's defaults.
  {
    id: "HIGH-03",
    kind: "fault",
    fixtures: [issuesFixture],
    actor: A,
    cites: ["D46", "rule:27"],
    namedIssues: ["UserClosure"],
    variants: {
      "confirms-throws-on-a-shape"(c) {
        opened(c, B);
        c.to(A, "Edit", { id: "i1", title: "new" });
        c.answer("rename", { ok: null }); // confirms reads v.title: throws, at settlement
        const i = c.r.issues().at(-1);
        c.eq("issue", i?.code, "UserClosure");
        c.eq("origin", String(i?.origin).includes("confirms"), true);
        c.eq("the prediction ended", c.rec(I1)?.predicted, false);
        c.eq("repair forced", c.reqs("repair").length, 1);
        c.answer("repair", { truth: true });
        // the store lives: ordering still holds
        toggle(c, true);
        toggle(c, false, B);
        c.eq("B waits behind A", c.reqs("like").length, 1);
      },
      "a-read-mapper-throws"(c) {
        c.ensure(A);
        c.to(A, "Load");
        c.answer("list", { ok: null }); // reads.list does v.map
        c.eq("issue", c.r.issues().at(-1)?.code, "UserClosure");
        // D147: the machine does not hear `Listed` for a list the store could not take. Blind derivation's loose end.
        c.eq("the read's ending is its Defect", [c.lastEnding("list")?.["channel"], c.lastEnding("list")?.["reason"]], ["failure", "Defect"]);
        toggle(c, true);
        c.eq("the store lives", c.reqs("like").length, 1);
      },
    },
  },
  // ── H4, D41's replacement. E7: a replayed response, with a newer value in hand.
  {
    id: "HIGH-04",
    kind: "example",
    fixtures: [issuesFixture],
    actor: A,
    cites: ["D47", "sec:2.8.6", "rule:31", "rule:32"],
    run(c) {
      opened(c);
      toggle(c, true);
      c.answer("like", { applyLost: true });
      c.answer("repair", { truth: true });
      c.eq("repair says it landed", c.rec(I1)?.data.liked, true);
      c.fault({
        mutateServer: (s: any) => ({
          ...s,
          issues: { ...s.issues, i1: { ...s.issues.i1, liked: false, title: "other device" } },
        }),
      });
      c.to(A, "Load");
      c.answer("list", { truth: true });
      c.eq("the read shows the newer value", c.rec(I1)?.data.title, "other device");
      c.to(A, "ReconcileLike", k);
      c.answer("like", { apply: true }); // the server replays what it stored
      // D59: a success applies, marked, until a later read. The one case it is wrong it says so.
      c.eq("marked", c.rec(I1)?.uncertain, true);
      c.eq("a repair runs: the answer differed", c.reqs("repair").length, 2);
      c.answer("repair", { truth: true });
      c.eq("screen equals server", c.rec(I1)?.data, server(c).i1);
      c.eq("the mark goes with it", c.rec(I1)?.uncertain, false);
    },
  },
  {
    id: "HIGH-04b",
    kind: "example",
    fixtures: [issuesFixture],
    actor: A,
    cites: ["D47"],
    run(c) {
      // The common path: same value, no extra read.
      opened(c);
      toggle(c, true);
      c.answer("like", { applyLost: true });
      c.answer("repair", { truth: true });
      c.to(A, "ReconcileLike", k);
      c.answer("like", { apply: true });
      c.eq("no second repair", c.reqs("repair").length, 1);
      c.eq("clean", [c.rec(I1)?.data.liked, c.rec(I1)?.uncertain], [true, false]);
    },
  },
  // ── M1: given up, then back from the dead. D48.
  {
    id: "MED-01",
    kind: "fault",
    fixtures: [issuesPersisted],
    actor: A,
    cites: ["D48", "rule:17", "rule:24", "cell:lane.cancel.InFlight"],
    variants: {
      "cancel-waits-for-its-ack"(c) {
        opened(c);
        toggle(c, true);
        c.to(A, "CancelLike", k);
        c.eq("no ending yet", c.endings("like").length, 0);
        c.eq("still pending", row(c)?.pending, true);
        c.ack();
        c.eq("now NotSent", c.lastEnding("like")?.reason, "Cancelled");
        c.eq("lane gone", row(c), undefined);
        c.eq("nothing was sent", c.reqs("like").length, 0);
      },
      "cancel-refused-by-storage"(c) {
        opened(c);
        toggle(c, true);
        c.to(A, "CancelLike", k);
        c.do({ storage: "refuse" });
        c.eq("the disk's answer stands", c.lastEnding("like")?.reason, "StorageRefused");
      },
      "landed-without-ack-then-reload"(c) {
        opened(c);
        toggle(c, true);
        c.do({ storage: "landNoAck" });
        c.to(A, "CancelLike", k);
        c.eq("never told NotSent", c.endings("like").length, 0);
        c.reload();
        c.eq("unknown, and no contradiction", c.lastEnding("like")?.reason, "Restored");
        c.eq(
          "not Cancelled, ever",
          c.endings("like").some((e) => e["reason"] === "Cancelled"),
          false,
        );
      },
      "latest-replace-waits-for-its-ack"(c) {
        opened(c);
        toggle(c, true);
        toggle(c, false);
        c.eq("first not superseded yet", c.r.evidence("Superseded").length, 0);
        c.ack(); // the first's ack: it may be on disk, and now storage has answered
        c.eq("superseded now", c.r.evidence("Superseded").length, 1);
        c.ack(); // the replacement's own
        c.eq(
          "only the newest goes",
          c.reqs("like").map((q) => q.input.liked),
          [false],
        );
      },
      "other-actor-behind-a-hung-ack"(c) {
        opened(c, B);
        toggle(c, true);
        c.to(A, "CancelLike", k);
        c.do({ storage: "landNoAck" });
        toggle(c, false, B);
        c.ack();
        c.eq("B does not pass what may be on disk", c.reqs("like").length, 0);
        c.reload();
        c.eq("server untouched", server(c).i1.liked, false);
      },
    },
  },
  // ── M2: D3's price made visible. D49.
  {
    id: "MED-02",
    kind: "example",
    fixtures: [issuesFixture],
    actor: A,
    cites: ["D49", "D3", "D40"],
    variants: {
      "record-held-names-holder-and-waiter"(c) {
        opened(c, B);
        c.to(A, "Edit", { id: "i1", title: "x" });
        c.answer("rename", { lost: true });
        c.answer("repair", { truth: true });
        toggle(c, true, B);
        c.advance(29_999);
        c.eq("not yet", c.r.evidence("RecordHeld").length, 0);
        c.advance(1);
        const e = c.r.evidence("RecordHeld");
        c.eq("once", e.length, 1);
        c.eq(
          "names both",
          [e[0]?.["holder"], e[0]?.["waiter"]],
          [c.r.evidence("mint")[0]?.["attempt"], c.r.evidence("mint")[1]?.["attempt"]],
        );
        c.eq("Inspection says it", c.stalled("like"), "record");
        c.advance(3_600_000);
        c.eq(
          "still once, still not sent",
          [c.r.evidence("RecordHeld").length, c.reqs("like").length],
          [1, 0],
        );
        c.to(A, "CancelRename", k);
        c.eq("the holder gives up: it goes", c.reqs("like").length, 1);
        c.eq("it clears", c.stalled("like"), undefined);
      },
    },
  },
  // ── M3: a read's answer has a position.
  {
    id: "MED-03",
    kind: "example",
    fixtures: [issuesFixture],
    actor: A,
    cites: ["D47", "sec:2.7.9"],
    variants: {
      "stale-read-does-not-overwrite-a-confirmed-write"(c) {
        c.ensure(A);
        c.to(A, "Load");
        c.answer("list", { truth: true });
        c.to(A, "Load");
        toggle(c, true);
        c.answer("like", { apply: true });
        c.eq("confirmed", c.rec(I1)?.data.liked, true);
        // A row-shaped answer from before the write:
        c.answer("list", {
          ok: [{ id: "i1", title: "title i1", slug: "title i1", liked: false, likes: 0 }],
        });
        c.eq("the old read lost", c.rec(I1)?.data.liked, true);
        c.eq("and asked again", c.reqs("repair").length, 1);
        c.answer("repair", { truth: true });
        c.eq("truth", c.rec(I1)?.data.liked, true);
      },
      "a-read-started-after-the-write-applies"(c) {
        opened(c);
        toggle(c, true);
        c.answer("like", { apply: true });
        c.to(A, "Load");
        c.fault({
          mutateServer: (s: any) => ({
            ...s,
            issues: { ...s.issues, i1: { ...s.issues.i1, title: "later" } },
          }),
        });
        c.answer("list", { truth: true });
        c.eq("applied", c.rec(I1)?.data.title, "later");
        c.eq("no repair", c.reqs("repair").length, 0);
      },
      "stale-repair-runs-again"(c) {
        opened(c);
        toggle(c, true);
        c.answer("like", { lost: true });
        // repair 1 is out. Now a read started later lands first with newer data
        c.to(A, "Load");
        c.fault({
          mutateServer: (s: any) => ({
            ...s,
            issues: { ...s.issues, i1: { ...s.issues.i1, title: "newer" } },
          }),
        });
        c.answer("list", { truth: true });
        c.answer("repair", { ok: { id: "i1", title: "older", slug: "s", liked: false, likes: 0 } });
        c.eq("older repair did not win", c.rec(I1)?.data.title, "newer");
      },
    },
  },
  // ── M4: how silence is seen. D30, D49.
  {
    id: "MED-04",
    kind: "fault",
    fixtures: [payFixture],
    actor: P,
    cites: ["D49", "D30"],
    run(c) {
      payTo(c);
      c.do({ storage: "hang" });
      c.advance(9_999);
      c.eq("not yet", c.stalled("pay"), undefined);
      c.advance(1);
      c.eq("Inspection says storage", c.stalled("pay"), "storage");
      c.eq("evidence once", c.r.evidence("StorageSilent").length, 1);
      c.eq("no ending", c.endings("pay").length, 0);
      c.advance(3_600_000);
      c.state("PAYING");
      c.eq("no request", c.reqs("pay").length, 0);
    },
  },
  // ── M7: module fibers have an owner. D51.
  {
    id: "MED-07",
    kind: "fault",
    fixtures: [issuesFixture],
    actor: A,
    cites: ["D51", "D40", "D6"],
    variants: {
      "repair-stops-at-its-bound"(c) {
        opened(c);
        toggle(c, true);
        c.answer("like", { lost: true });
        c.answer("repair", { never: true });
        c.eq("live: the repair", c.r.outside().live, 1);
        c.advance(30_000);
        c.eq("stopped at the bound", c.r.outside().live, 0);
      },
      "disposal-stops-module-fibers"(c) {
        opened(c);
        toggle(c, true);
        c.answer("like", { lost: true });
        c.do({ disposeRuntime: true });
        c.advance(5_000);
        c.eq("none live", c.r.outside().live, 0);
      },
      "a-survivor-is-evidence"(c) {
        opened(c);
        c.fault({ uninterruptibleHang: "repair" });
        toggle(c, true);
        c.answer("like", { lost: true });
        c.do({ disposeRuntime: true });
        c.advance(5_000);
        c.eq(
          "named",
          c.r.evidence("AbandonedFiber").some((e) => String(e["op"]).includes("repair")),
          true,
        );
      },
    },
  },
  // ── M8: a prediction's field function throws at the turn. Rule 28, 2.8.13.
  {
    id: "MED-08",
    kind: "fault",
    fixtures: [issuesThrowing],
    actor: A,
    cites: ["D46", "rule:28"],
    namedIssues: ["InvalidTurn"],
    run(c) {
      opened(c);
      c.to(A, "Poke", k);
      c.eq("refused at the turn", c.r.issues().at(-1)?.code, "InvalidTurn");
      c.eq("no row", row(c, "poke"), undefined);
      c.eq("no request", c.reqs("poke").length, 0);
      c.eq("reading the record does not throw", c.rec(I1)?.data.title, "title i1");
    },
  },
  // ── The eleven survivors (review H5). Each one line of rule.
  {
    id: "SURV-01",
    kind: "example",
    fixtures: [docsFixture],
    actor: D1,
    cites: ["rule:27", "sec:2.8.4"],
    run(c) {
      // Rule 27, E13: routing never changes store effects. A late domain success still confirms and clears.
      docs(c);
      c.to(D1, "Save", { id: "d1", title: "T" });
      c.to(D1, "Close");
      c.state("LIST");
      c.answer("save", { apply: true });
      c.eq("late", c.mem().lateSaved, 1);
      c.eq("queue empty, row gone", c.r.row(D1, "save", { id: "d1" }), undefined);
      c.eq("no prediction left", c.rec(docRef("d1"))?.predicted ?? false, false);
    },
  },
  {
    id: "SURV-02",
    kind: "example",
    fixtures: [docsFixture],
    actor: D1,
    cites: ["rule:15"],
    run(c) {
      // Rule 15: "another pending call". A Held lane in the state is not pending: the late ending may leave.
      docs(c);
      c.to(D1, "Save", { id: "d1", title: "T" });
      c.to(D1, "Close");
      c.to(D1, "Open"); // a new activation of DETAIL
      c.to(D1, "Touch", { id: "d2" });
      c.answer("touch", { lost: true });
      c.eq("held", c.r.row(D1, "touch", { id: "d2" })?.uncertain, true);
      c.answer("save", { apply: true });
      c.state("LIST");
      c.eq("not denied", c.r.evidence("Denied").length, 0);
    },
  },
  {
    id: "SURV-03",
    kind: "example",
    fixtures: [issuesPersisted],
    actor: A,
    cites: ["rule:44"],
    run(c) {
      // Rule 44: per lane in creation order, before any external event.
      opened(c);
      toggle(c, true);
      c.ack();
      c.to(A, "Delete", { id: "i2" });
      c.ack();
      const mints = c.r.evidence("mint").map((e) => e["attempt"]);
      c.reload();
      const delivered = c.r
        .evidence("delivered")
        .map((e) => e["attempt"])
        .slice(-2);
      c.eq("in mint order", delivered, mints);
    },
  },
  {
    id: "SURV-04",
    kind: "fault",
    fixtures: [issuesFixture],
    actor: A,
    cites: ["rule:24", "cell:lane.cancel.InFlight"],
    run(c) {
      // Rule 24: "A settled ending is never rewritten". A cancel admitted between settlement and admission does nothing.
      opened(c);
      c.fault({ syncAnswer: ["like", { apply: true }] });
      let once = false;
      c.h.subscribe(() => {
        if (once) return;
        once = true;
        c.h.send(A, "Toggle", { id: "i1", liked: true });
        c.h.send(A, "CancelLike", { id: "i1" });
      });
      c.to(A, "Listed"); // any drain
      c.eq("the real ending stands", c.lastEnding("like")?.channel, "success");
      c.eq("not released", c.r.evidence("Released").length, 0);
      c.eq(
        "server has it, and so do we",
        [server(c).i1.liked, c.rec(I1)?.data.liked],
        [true, true],
      );
    },
  },
  {
    id: "SURV-05",
    kind: "fault",
    fixtures: [issuesFixture],
    actor: A,
    cites: ["D40"],
    run(c) {
      // D40's fence with a repair running: an old repair's late answer, after its bound and after a new repair began.
      opened(c);
      c.fault({ uninterruptibleHang: "repair" });
      toggle(c, true);
      c.answer("like", { lost: true });
      c.advance(30_000);
      c.eq("overdue", c.r.evidence("RepairOverdue").length, 1);
      c.to(A, "ReconcileLike", k);
      c.answer("like", { lost: true }); // StillUnknown: a second repair
      c.eq("two repairs asked", c.reqs("repair").length, 2);
      c.do({
        fault: {
          lateAnswer: [
            "repair",
            { ok: { id: "i1", title: "ancient", slug: "s", liked: false, likes: 0 } },
          ],
        },
      });
      c.eq("fenced", c.rec(I1)?.data.title, "title i1");
      c.yes(
        "evidence",
        c.r.evidence("fence").some((e) => e["repair"] === I1),
      );
    },
  },
  {
    id: "SURV-06",
    kind: "example",
    fixtures: [issuesFixture],
    actor: A,
    cites: ["sec:2.8.5", "cell:lane.interrupt.InFlight"],
    run(c) {
      // E5, 2.8.5: `Cancelled` on the wire is an unknown: mark, and a forced repair.
      opened(c);
      toggle(c, true);
      c.to(A, "CancelLike", k);
      c.eq("unknown", c.lastEnding("like")?.reason, "Cancelled");
      c.eq("marked", c.rec(I1)?.uncertain, true);
      c.eq("repair forced", c.reqs("repair").length, 1);
    },
  },
  {
    id: "SURV-07",
    kind: "fault",
    fixtures: [issuesFixture],
    actor: A,
    cites: ["cell:lane.runtimeDisposal.InFlight"],
    run(c) {
      // The table: "from its start nothing is invoked". B is ready behind A's queue entry at disposal.
      opened(c, B);
      c.fault({ uninterruptibleHang: "like" });
      toggle(c, true);
      toggle(c, false, B);
      c.do({ disposeRuntime: true });
      c.do({ fault: { lateAnswer: ["like", { ok: { id: "i1", liked: true } }] } });
      c.eq("B never invoked", c.reqs("like").length, 1);
    },
  },
  {
    id: "SURV-08",
    kind: "fault",
    fixtures: [issuesFixture],
    actor: A,
    cites: ["rule:30", "D3", "cell:lane.runtimeDisposal.InFlight"],
    run(c) {
      // Rule 30: NotSent { Disposed } removes the prediction. Here on a W entry.
      opened(c);
      toggle(c, true);
      toggle(c, false);
      c.eq("W's prediction shows", c.rec(I1)?.data.liked, false);
      c.do({ disposeRuntime: true });
      c.eq("the W prediction is gone; head's stays until it ends", c.rec(I1)?.data.liked, true);
    },
  },
  {
    id: "SURV-09",
    kind: "example",
    fixtures: [issuesFixture],
    actor: A,
    cites: ["rule:30", "D3"],
    run(c) {
      // E18: a prediction over a record the store does not hold shows nothing: absent, not a made-up record.
      c.ensure(A);
      toggle(c, true);
      const r = c.rec(I1);
      c.eq("the write itself goes", c.reqs("like").length, 1);
      c.eq("no data", r?.data, undefined);
    },
  },
  {
    id: "SURV-10",
    kind: "example",
    fixtures: [issuesFixture],
    actor: A,
    cites: ["sec:2.8.6"],
    run(c) {
      // 2.8.6's success row: omitted fields are unconfirmed; a later carried field clears that field.
      opened(c);
      c.to(A, "Edit", { id: "i1", title: "New" });
      c.answer("rename", { apply: true });
      c.eq("slug unconfirmed", c.rec(I1)?.unconfirmed, ["slug"]);
      toggle(c, true);
      c.answer("like", { apply: true }); // the answer carries the whole row, slug included
      c.eq("cleared by a carried field", c.rec(I1)?.unconfirmed, []);
    },
  },
  {
    id: "SURV-11",
    kind: "example",
    fixtures: [ringFixture],
    actor: { actor: "Ring", id: "a" },
    cites: ["D1"],
    run(c) {
      // D1: "A follow-up inherits its cause's place, so it runs next". Nested: a's x runs before b's, and x's own y before b.
      c.ensure();
      c.send("SayThenX", { n: "a" });
      c.eq("order", c.mem().log, ["a", "x"]);
      c.send("Nest", { n: "n" });
      c.eq("nested follow-ups are head insertions", c.mem().log, [
        "a",
        "x",
        "n",
        "n1",
        "n11",
        "n2",
      ]);
    },
  },
  {
    id: "STORE-12",
    kind: "fault",
    fixtures: [issuesDenySettled],
    actor: A,
    cites: ["rule:30", "D3", "F3"],
    run(c) {
      // F3.1, 2.5 step 2: a Denied turn keeps the ending's cell and promotes.
      opened(c);
      toggle(c, true);
      toggle(c, false);
      c.answer("like", { apply: true });
      c.eq("promoted though the handler denied", c.reqs("like").length, 2);
      c.eq("denied", c.r.evidence("Denied").length, 1);
    },
  },
];
