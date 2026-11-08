// Fragments: rules 1, 6, 9, 44, 48-60, 2.5, 2.9.2, 2.9.3. Flows are from pay.story.ts, comments.story.ts and upload.trait.ts,
// on compiled data flattened as each fixture says. Worked out by hand from the rule each case names.
import { commentRef, editorFixture, queueFixture } from "../typed/comments.ts";
import { issueRef, issuesFixture } from "../typed/issues.ts";
import {
  docsFixture,
  feedFixture,
  formFixture,
  issuesDenySettled,
  issuesDoubleCancel,
  issuesLocal,
  notesFixture,
} from "../typed/lab-machines.ts";
import { LENGTH_MS, payFullFixture } from "../typed/pay-full.ts";
import { payFixture } from "../typed/pay.ts";
import { searchFrag } from "../search/frag.search.ts";
import type { Scenario } from "./ctx.ts";
import { Ctx } from "./ctx.ts";
import { GRACE } from "./lifetime.scenario.ts";

const F = { actor: "Form", id: "a" };
const N = { actor: "Notes", id: "a" };
const P = { actor: "Checkout/Pay", id: "shopper-1" };
const L = { actor: "Issues/List", id: "a" };
const B = { actor: "Issues/List", id: "b" };
const K = { id: "i1" };
const I1 = issueRef("i1");
const CAP = { status: "requires_capture", clientSecret: "" };
const ACT = { status: "requires_action", clientSecret: "sec" };
const CART = { cartId: "c1", intentId: "pi1" };
const O = ["CHALLENGE"];

const inner = (c: Ctx, path: readonly string[]) => c.r.inner(c.A, path);
const docs = (...d: string[]) => ({ docs: d });
const toPayCard = (c: Ctx) => {
  c.ensure();
  c.send("Start", CART);
  c.ack(); // the quote's write-ahead
  c.answer("shipping", { ok: { slotId: "s1" } });
  c.state("CARD");
};
const toPaying = (c: Ctx) => {
  toPayCard(c);
  c.into(["summary"], "PayPressed", { paymentMethodId: "visa" });
  c.state("PAYING");
  c.ack();
};
const toChallenge = (c: Ctx) => {
  toPaying(c);
  c.answer("pay", { ok: ACT });
  c.state("CHALLENGE");
  c.ack(); // authenticate's write-ahead
};
const edit = (c: Ctx, d: string, body: string) => c.into([`docs:${d}`], "Edited", { body });
const saved = (c: Ctx, d: string) => c.inner([`docs:${d}`])?.memory;
const started = (c: Ctx, ...files: string[]) => {
  c.ensure();
  c.send("SetFiles", { files });
  c.advance(0); // Upload's 0 ms start schedule
};

export const fragScenarios: readonly Scenario[] = [
  {
    id: "FRAG-01",
    kind: "example",
    fixtures: [formFixture],
    actor: F,
    cites: ["rule:1", "rule:9"],
    variants: {
      "removed-copy-ends-once"(c) {
        c.ensure();
        c.send("SetIds", { ids: ["a", "b"] });
        c.eq(
          "two copies, seeded",
          [inner(c, ["rows:a"])?.memory.value, inner(c, ["rows:b"])?.memory.value],
          ["seed a", "seed b"],
        );
        c.send("SetIds", { ids: ["b"] });
        c.eq("gone", inner(c, ["rows:a"]), undefined);
        c.eq("whenAbandoned once", c.mem().goneRows, ["a"]);
        c.send("SetIds", { ids: ["b"] });
        c.eq("not again", c.mem().goneRows, ["a"]);
      },
      "repair-never-refuses"(c) {
        c.ensure();
        c.send("SetIds", { ids: ["a", "a", "b", "c"] });
        c.eq(
          "duplicate keeps first, past max dropped",
          [
            inner(c, ["rows:a"]) !== undefined,
            inner(c, ["rows:b"]) !== undefined,
            inner(c, ["rows:c"]),
          ],
          [true, true, undefined],
        );
        c.eq("evidence", c.r.evidence("listRepair").length, 2);
      },
      "readd-is-a-new-incarnation"(c) {
        c.ensure();
        c.send("SetIds", { ids: ["a"] });
        c.into(["rows:a"], "Changed", { value: "typed" });
        c.send("SetIds", { ids: [] });
        c.send("SetIds", { ids: ["a"] });
        c.eq("fresh memory", inner(c, ["rows:a"])?.memory.value, "seed a");
      },
      "removal-and-readd-in-one-patch-changes-nothing"(c) {
        c.ensure();
        c.send("SetIds", { ids: ["a"] });
        c.into(["rows:a"], "Changed", { value: "typed" });
        c.send("SetIds", { ids: ["a"] });
        c.eq("same incarnation", inner(c, ["rows:a"])?.memory.value, "typed");
        c.eq("no abandon", c.mem().goneRows, []);
      },
      "a-keystroke-for-a-removed-row-is-unhandled"(c) {
        c.ensure();
        c.into(["rows:zz"], "Changed", { value: "x" });
        c.eq("unhandled", c.r.evidence("Unhandled").length, 1);
      },
      "raise-into-a-key-added-this-turn"(c) {
        c.ensure();
        c.send("AddAndRaise", { key: "n" });
        c.eq("raise reached the new copy", inner(c, ["rows:n"])?.memory.value, "raised");
      },
    },
  },
  {
    id: "FRAG-02",
    kind: "example",
    fixtures: [formFixture],
    actor: F,
    cites: ["rule:1", "F3.2", "D11", "sec:2.5"],
    variants: {
      "reset-on-a-source-patch"(c) {
        c.ensure();
        c.into(["check"], "Changed", { value: "typed" });
        c.send("SetSubject", { subject: "s2" });
        c.eq("new incarnation, input on before-walk", inner(c, ["check"])?.memory, {
          value: "s2",
          touched: false,
        });
        c.eq("whenAbandoned read the old memory", c.mem().gone, ["typed"]);
      },
      "a-raise-in-the-resetting-turn-reaches-the-fresh-one"(c) {
        c.ensure();
        c.send("SetAndRaise", { subject: "s2" });
        c.eq("fresh and raised into", inner(c, ["check"])?.memory, {
          value: "into fresh",
          touched: true,
        });
      },
      "a-part-writing-the-key-is-a-pending-reset"(c) {
        c.ensure();
        const before = c.r.frames().length;
        c.into(["check"], "Changed", { value: "subject:s9" });
        const after = c.r.frames().slice(before);
        c.eq(
          "first publication: new subject, old incarnation",
          (after[0]?.view[`Form/a`]?.memory as any).check.value,
          "subject:s9",
        );
        c.eq("then the follow-up", (after.at(-1)?.view[`Form/a`]?.memory as any).check.value, "s9");
        c.eq("exactly one snapshot of lag", after.length, 2);
      },
      "a-throwing-reseton-refuses"(c) {
        c.ensure();
        c.fault({ throwIn: "traits.check.resetOn" });
        c.send("SetSubject", { subject: "s2" });
        c.eq("refused", c.r.issues().at(-1)?.code, "InvalidTurn");
        c.eq("no patch", c.mem().subject, "s1");
        c.namedIssues = ["InvalidTurn"];
      },
    },
  },
  {
    id: "FRAG-03",
    kind: "fault",
    fixtures: [formFixture],
    actor: F,
    cites: ["D35", "rule:1"],
    namedIssues: ["InvalidTurn"],
    run(c) {
      c.ensure();
      c.send("Spin"); // arms it: whenAbandoned reads before, so the writing starts next time
      c.send("Spin");
      const i = c.r.issues().at(-1);
      c.eq("stopped at the bound", (i?.input as any)?.chain, "FollowUpBound");
      c.eq("origin", String(i?.origin).includes("Osc") || String(i?.origin).includes("osc"), true);
      c.yes("bounded", c.mem().resets <= 70 && c.mem().resets >= 60);
      c.send("Go");
      c.state("DONE");
    },
  },
  {
    id: "FRAG-04",
    kind: "example",
    fixtures: [notesFixture],
    actor: N,
    cites: ["rule:53", "rule:54", "sec:2.9.3"],
    variants: {
      "parked-then-adopted-keeps-the-text"(c) {
        c.ensure();
        c.send("SetDocs", docs("d1"));
        edit(c, "d1", "mine");
        c.ack();
        c.send("SetDocs", docs());
        c.eq("the write runs on", c.reqs("save").length, 1);
        c.eq("row still there", c.r.row(N, "save", { docId: "d1" })?.pending, true);
        c.answer("save", { fail: { tag: "Conflict" } });
        c.eq("lane cell applied, ending parked", c.r.evidence("parked").length, 1);
        c.eq(
          "listed as a wait",
          c.r.quiet().waits.some((w) => w.kind === "parked"),
          true,
        );
        c.send("SetDocs", docs("d1"));
        c.eq("delivered to the new copy", saved(c, "d1")?.status, "conflict");
        c.eq("rule 55: from the event", saved(c, "d1")?.mine, "mine");
        c.eq(
          "lane gone",
          c.r.quiet().waits.some((w) => w.kind === "parked"),
          false,
        );
      },
      "an-inflight-ending-reaches-a-new-copy-when-it-lands"(c) {
        c.ensure();
        c.send("SetDocs", docs("d1"));
        edit(c, "d1", "mine");
        c.ack();
        c.send("SetDocs", docs());
        c.send("SetDocs", docs("d1"));
        c.eq("nothing yet", saved(c, "d1")?.status, "clean");
        c.answer("save", { apply: true });
        c.eq("adopted, current", saved(c, "d1")?.status, "clean");
        c.eq("its Saved ran", saved(c, "d1")?.saved, "mine");
      },
      "a-held-lane-delivers-restored-to-the-new-copy-once"(c) {
        c.ensure();
        c.send("SetDocs", docs("d1"));
        edit(c, "d1", "mine");
        c.ack();
        c.answer("save", { lost: true });
        c.send("SetDocs", docs());
        c.send("SetDocs", docs("d1"));
        c.eq("unknown Restored", saved(c, "d1")?.reason, "Restored");
        c.eq("once", c.endings("save").filter((e) => e["reason"] === "Restored").length, 1);
        c.into(["docs:d1"], "Resend");
        c.ack();
        c.eq("same id", c.keys("save").length, 1);
      },
    },
  },
  {
    id: "FRAG-05",
    kind: "example",
    fixtures: [notesFixture],
    actor: N,
    cites: ["rule:54", "rule:44", "sec:2.7.13"],
    run(c) {
      // Rule 54: parked endings in saved order, then a held head's unknown { Restored }. Both before a later event.
      c.ensure();
      c.send("SetDocs", docs("d1"));
      c.into(["docs:d1"], "Shared");
      c.ack();
      c.answer("shared", { lost: true });
      edit(c, "d1", "mine");
      c.ack();
      c.send("SetDocs", docs());
      c.answer("save", { apply: true });
      const mark = c.r.evidence("delivered").length;
      c.send("SetDocs", docs("d1"));
      c.eq(
        "order",
        c.r
          .evidence("delivered")
          .slice(mark)
          .map((e) => e["op"]),
        ["save", "shared"],
      );
    },
  },
  {
    id: "FRAG-06",
    kind: "example",
    fixtures: [notesFixture],
    actor: N,
    cites: ["rule:60", "sec:2.9.3", "D48"],
    variants: {
      "wire-is-interrupted-and-nothing-delivered"(c) {
        started(c, "r1");
        c.ack();
        c.eq("sent", c.reqs("put").length, 1);
        c.send("SetFiles", { files: [] });
        c.eq("lane gone", c.r.row(N, "put", { ref: "r1" }), undefined);
        c.eq("not delivered", c.r.evidence("delivered").filter((e) => e["op"] === "put").length, 0);
        c.eq("released", c.r.evidence("Released").length, 1);
      },
      "waiting-never-sent-waits-for-its-ack"(c) {
        started(c, "r1");
        c.send("SetFiles", { files: [] });
        c.eq("row pending until the disk answers", c.r.row(N, "put", { ref: "r1" })?.pending, true);
        c.ack();
        c.eq("ended", c.r.row(N, "put", { ref: "r1" }), undefined);
        c.eq(
          "evidence, no delivery",
          [c.reqs("put").length, c.r.evidence("delivered").filter((e) => e["op"] === "put").length],
          [0, 0],
        );
      },
      "held-is-released-now"(c) {
        started(c, "r1");
        c.ack();
        c.answer("put", { lost: true });
        c.send("SetFiles", { files: [] });
        c.eq("gone", c.r.row(N, "put", { ref: "r1" }), undefined);
        c.eq("released", c.r.evidence("Released").length, 1);
      },
      "reload-of-a-releasing-lane-delivers-nothing"(c) {
        started(c, "r1");
        c.fault({ uninterruptibleHang: "put" });
        c.ack();
        c.send("SetFiles", { files: [] });
        c.eq("still on the wire, marked", c.r.row(N, "put", { ref: "r1" })?.pending, true);
        c.reload();
        c.eq("no row", c.r.row(N, "put", { ref: "r1" }), undefined);
        c.eq("no delivery", c.r.evidence("delivered").filter((e) => e["op"] === "put").length, 0);
        c.eq(
          "no record",
          c.laneKeys().length > 0,
          false,
        );
      },
      "readd-before-idle-clears-the-mark-and-adopts"(c) {
        started(c, "r1");
        c.fault({ uninterruptibleHang: "put" });
        c.ack();
        c.send("SetFiles", { files: [] });
        c.send("SetFiles", { files: ["r1"] });
        c.advance(0);
        c.eq("one request: the idle guard held", c.reqs("put").length, 1);
        c.do({ fault: { lateAnswer: ["put", { ok: {} }] } });
        c.eq(
          "the mark cleared: delivered to the new copy",
          c.inner(["uploads:r1"])?.memory.status,
          "unsure",
        );
        c.eq(
          "the interrupt it asked for reads unknown: nothing lost",
          c.lastEnding("put")?.reason,
          "Cancelled",
        );
      },
    },
  },
  {
    id: "FRAG-07",
    kind: "example",
    fixtures: [notesFixture],
    actor: N,
    cites: ["rule:51", "rule:16"],
    variants: {
      "another-paths-members-are-declined"(c) {
        c.ensure();
        c.send("SetDocs", docs("d1", "d2"));
        c.into(["docs:d1"], "Shared");
        c.ack();
        c.into(["docs:d2"], "Shared");
        c.eq("commit: NotSent Rejected to the asker", saved(c, "d2")?.shared, "Rejected");
        c.eq("first untouched", saved(c, "d1")?.shared, null);
        c.eq("one request", c.reqs("shared").length, 1);
        c.answer("shared", { lost: true });
        c.eq("d1 hears", saved(c, "d1")?.status, "unsure");
        c.into(["docs:d2"], "RetryShared");
        c.eq("retryable denies, the fallback ran", saved(c, "d2")?.shared, "retry-denied");
        c.into(["docs:d2"], "CancelShared");
        c.eq("cancel does nothing", c.r.row(N, "shared", {})?.uncertain, true);
        c.into(["docs:d2"], "IdleShared");
        c.eq("idle denies by the lane's state", saved(c, "d2")?.shared, "busy");
      },
    },
  },
  {
    id: "FRAG-08",
    kind: "example",
    fixtures: [issuesFixture],
    actor: L,
    cites: ["rule:44", "OD:21", "OD:22", "cell:lane.rebind.Held"],
    variants: {
      // Proposal-v6 7.1, T1 (rule 73, OD31): the screen leaves mid-charge. The InFlight lane keeps Pay, so its ending reaches the same
      // incarnation (PLACING), once, and `place` keeps it again. Formerly a dispose parked the ending for a rebind.
      "persisted-disposed-ending-parked-delivered-once"(c0) {
        const c = new Ctx(c0.fresh([payFixture]), P);
        c.ensure();
        c.send("Start", CART);
        c.send("PayRequested", { paymentMethodId: "visa" });
        c.ack();
        c.detach();
        c.advance(GRACE);
        c.state("PAYING");
        c.answer("pay", { ok: CAP });
        c.state("PLACING");
        c.eq("once", c.r.evidence("delivered").filter((e) => e["op"] === "pay").length, 1);
        c.eq("the same incarnation", c.incarnations(P), 1);
        c.eq("its memory", c.mem().intentId, "pi1");
        c.advance(GRACE);
        c.state("PLACING");
      },
      // T2: detach, past the grace (the Held lane keeps nothing), ensure.
      "rebind-delivers-a-hold-once"(c) {
        c.ensure(L);
        c.to(L, "Toggle", { id: "i1", liked: true });
        c.answer("like", { lost: true });
        c.answer("repair", { truth: true });
        c.detach(L);
        c.advance(GRACE);
        c.eq("ended", c.r.state(L), undefined);
        c.eq(
          "listed unbound",
          c.r.quiet().waits.some((w) => w.kind === "held" && w.owner === "unbound"),
          true,
        );
        c.ensure(L);
        c.eq(
          "once, Restored",
          c.endings("like").filter((e) => e["reason"] === "Restored").length,
          1,
        );
        c.eq("fresh memory", c.mem().toast, null);
        c.to(L, "ReconcileLike", K);
        c.eq("the new incarnation owns it", c.keys("like").length, 1);
        // blind-derivation: the line above stayed true with `ReconcileLike` removed. The re-send is the proof: a second request on the one key.
        c.eq("and re-sends on it", c.reqs("like").length, 2);
      },
      // T4: `disposeActor` is explicit; the non-persisted actor's ending is evidence.
      "non-persisted-with-no-return-is-evidence"(c) {
        c.ensure(L);
        c.to(L, "Toggle", { id: "i1", liked: true });
        c.dispose();
        c.answer("like", { apply: true });
        c.eq("applied", c.r.row(L, "like", K), undefined);
        c.eq("store confirmed", c.r.record(I1)?.predicted ?? false, false);
      },
      // T1, the sibling (proposal-v5 11.1): the screen leaves instead. The write keeps the actor, so the ending is delivered, not evidence.
      "non-persisted-detached-hears-its-ending"(c) {
        c.ensure(L);
        c.to(L, "Toggle", { id: "i1", liked: true });
        c.detach(L);
        c.advance(GRACE);
        c.state("READY", L);
        c.answer("like", { apply: true });
        c.eq("delivered to the same incarnation", c.r.evidence("delivered").filter((e) => e["op"] === "like").length, 1);
        c.eq("no evidence-only ending", c.r.evidence("evidenceOnly").length, 0);
        c.eq("one incarnation", c.incarnations(L), 1);
        c.advance(GRACE);
        c.eq("then it ends", c.r.state(L), undefined);
      },
    },
  },
  {
    id: "FRAG-09",
    kind: "example",
    fixtures: [payFullFixture],
    actor: P,
    cites: ["rule:44", "rule:14", "rule:18", "rule:24"],
    variants: {
      // pay.story.ts: reloadWhileConfirming
      reloadWhileConfirming(c) {
        toPaying(c);
        c.reload();
        c.state("UNSURE");
        c.eq("restored", c.lastEnding("pay")?.reason, "Restored");
        c.eq("the summary came back", inner(c, ["summary"])?.memory.shipping, { slotId: "s1" });
        c.do({ fault: { lateAnswer: ["pay", { ok: CAP }] } });
        c.advance(3000);
        c.answer("order", { truth: true });
        c.answer("intent", { truth: true });
        c.state("PLACING");
        c.ack();
        c.answer("place", { ok: { orderId: "o1" } });
        c.state("PAID");
        c.eq("one charge", c.r.truth().charges, 1);
      },
      // pay.story.ts: webhookWins
      webhookWins(c) {
        toPaying(c);
        c.answer("pay", { lostButLanded: CAP });
        c.state("UNSURE");
        c.advance(3000);
        c.answer("order", { ok: { orderId: "o1" } });
        c.state("PAID");
        c.eq("receipt says so", c.mem().receipt, {
          orderId: "o1",
          afterUnsure: true,
          alreadyPlaced: true,
        });
        c.eq("hold released", c.r.row(P, "pay", { intentId: "pi1" }), undefined);
      },
      // pay.story.ts: voidLostRace
      voidLostRace(c) {
        toPaying(c);
        c.send("Leave");
        c.answer("pay", { ok: CAP });
        c.ack();
        c.answer("void", { lost: true });
        c.ack();
        c.eq("re-sent once by the machine", c.reqs("void").length, 2);
        c.eq("same id", c.keys("void").length, 1);
        c.answer("void", { fail: { tag: "AlreadyCaptured", chargeId: "ch" } });
        c.eq("StillUnknown, never VoidRefused", c.lastEnding("void")?.reason, "StillUnknown");
      },
      // pay.story.ts: buyAgain, rule 56's idle guard on the reset
      buyAgain(c) {
        c.ensure();
        c.send("Start", CART);
        c.ack();
        c.send("Leave");
        c.send("Start", { cartId: "c2", intentId: "pi2" });
        c.state("LEFT");
        c.answer("shipping", { ok: { slotId: "s1" } });
        c.send("Start", { cartId: "c2", intentId: "pi2" });
        c.state("CARD");
        c.eq("fresh for the new cart, quote on its way", inner(c, ["summary"])?.memory, {
          cartId: "c2",
          shipping: null,
          problem: null,
        });
        c.ack();
        c.answer("shipping", { ok: { slotId: "s2" } });
        c.eq("quote landed in the fresh one", inner(c, ["summary"])?.memory.shipping, {
          slotId: "s2",
        });
      },
      "summary-guard-port-and-denial"(c) {
        c.ensure();
        c.send("Start", CART);
        c.ack();
        c.into(["summary"], "PayPressed", { paymentMethodId: "visa" });
        c.state("CARD");
        c.eq("denied NoDelivery", c.r.evidence("Denied").at(-1)?.["reasons"], ["NoDelivery"]);
      },
      "host-guard-port-refuses-for-the-host"(c) {
        toPayCard(c);
        c.send("CartLoaded", { totalCents: 90_000 });
        c.into(["summary"], "PayPressed", { paymentMethodId: "visa" });
        c.state("CARD");
        c.eq("denied GuestLimit", c.r.evidence("Denied").at(-1)?.["reasons"], ["GuestLimit"]);
      },
      "a-double-click-is-rejected-in-a-callback"(c) {
        toPaying(c);
        c.into(["summary"], "PayPressed", { paymentMethodId: "visa" });
        c.state("PAYING");
        c.eq("one request", c.reqs("pay").length, 1);
      },
    },
  },
  {
    id: "FRAG-10",
    kind: "example",
    fixtures: [payFullFixture],
    actor: P,
    cites: ["rule:6", "rule:15", "rule:14", "rule:1"],
    variants: {
      // pay.story.ts: lateChallenge
      lateChallenge(c) {
        toChallenge(c);
        c.eq("in the subroutine", inner(c, O)?.state, "BANK");
        c.eq("a host read of it", c.mem().CHALLENGE.intentId, "pi1");
        c.into(O, "BankShown");
        c.advance(LENGTH_MS);
        c.eq("expired", inner(c, O)?.state, "EXPIRED");
        c.advance(2000);
        c.state("CARD");
        c.eq("exit's filling", c.mem().notice, "The bank's check timed out. You can pay again.");
        c.eq("subroutine gone", inner(c, O), undefined);
        c.answer("authenticate", { ok: { intentId: "pi1" } });
        c.state("PLACING");
        c.eq("late handler: authorized", c.mem().authorized, true);
      },
      // pay.story.ts: lateWhilePaying
      lateWhilePaying(c) {
        toChallenge(c);
        c.into(O, "BankShown");
        c.advance(LENGTH_MS + 2000);
        c.state("CARD");
        c.into(["summary"], "PayPressed", { paymentMethodId: "visa" });
        c.state("PAYING");
        c.ack();
        c.answer("authenticate", { ok: { intentId: "pi1" } });
        c.state("PAYING");
      },
      // pay.story.ts: helpKeepsDeadline
      helpKeepsDeadline(c) {
        toChallenge(c);
        c.into(O, "BankShown");
        c.advance(120_000);
        c.into(O, "Help");
        c.eq("help", inner(c, O)?.state, "HELP");
        c.eq("a frozen slice stays readable", inner(c, [...O, "countdown"]) !== undefined, true);
        c.advance(240_000);
        c.eq("nothing fired while frozen", inner(c, O)?.state, "HELP");
        c.into(O, "CloseHelp");
        c.eq("overdue fires once on return", inner(c, O)?.state, "EXPIRED");
        c.eq("help counted", inner(c, O)?.memory.helpOpened, 1);
        c.advance(2000);
        c.state("CARD");
      },
      "history-restores-control-only"(c) {
        toChallenge(c);
        c.into(O, "Help");
        c.into(O, "CloseHelp");
        c.eq("back where the customer was", inner(c, O)?.state, "BANK");
      },
      "answer-from-the-host-passes-the-exit"(c) {
        toChallenge(c);
        c.answer("authenticate", { ok: { intentId: "pi1" } });
        c.state("PLACING");
        c.eq("exit's patch", c.mem().authorized, true);
        c.ack();
        c.eq("exit's commit", c.reqs("place").length, 1);
      },
      "failure-exits-with-its-reason"(c) {
        toChallenge(c);
        c.answer("authenticate", { fail: { tag: "ChallengeFailed", code: "x" } });
        c.state("CARD");
        c.eq("notice", c.mem().notice, "Your bank declined the check (x).");
      },
      "host-event-falls-through-the-subroutine"(c) {
        toChallenge(c);
        c.send("Leave");
        c.state("LEFT");
        c.eq("abandoned", inner(c, O), undefined);
      },
      "reload-inside-the-subroutine"(c) {
        toChallenge(c);
        c.into(O, "BankShown");
        c.advance(1000);
        c.reload();
        c.state("CHALLENGE");
        c.eq("inner state came back", inner(c, O)?.state, "BANK");
        c.advance(LENGTH_MS);
        c.eq("its timer too", inner(c, O)?.state, "EXPIRED");
      },
    },
  },
  {
    id: "FRAG-11",
    kind: "example",
    fixtures: [editorFixture],
    actor: { actor: "Desk/Editor", id: "t" },
    cites: ["rule:9", "rule:51", "rule:53", "rule:30", "D3"],
    variants: {
      // comments.story.ts: postedInOrder
      postedInOrder(c) {
        c.ensure();
        c.into(["comments"], "Post", { clientId: "c1", text: "first" });
        c.into(["comments"], "Post", { clientId: "c2", text: "second" });
        const row = () => c.r.row(c.A, "post", { ticketId: "T-42" });
        c.eq("second queued", [row()?.outstanding, c.reqs("post").length], [1, 1]);
        c.answer("post", { apply: true });
        c.answer("post", { apply: true });
        c.eq("order at the server", c.r.truth().server.posts, ["first", "second"]);
        c.eq(
          "both sent",
          c.inner(["comments"])?.memory.drafts.map((d: any) => d.sent),
          [true, true],
        );
      },
      // comments.story.ts: an unconfirmed head holds; Resend, the same Attempt
      "unconfirmed-head-holds-then-resend"(c) {
        c.ensure();
        c.into(["comments"], "Post", { clientId: "c1", text: "first" });
        c.into(["comments"], "Post", { clientId: "c2", text: "second" });
        c.answer("post", { applyLost: true });
        c.eq("nothing passes it", c.reqs("post").length, 1);
        c.eq("draft says", c.inner(["comments"])?.memory.drafts[0].problem, "unsure");
        c.into(["comments"], "Resend", { clientId: "c1" });
        c.answer("post", { apply: true });
        c.eq("same id", c.reqs("post")[0]?.idempotencyKey, c.reqs("post")[1]?.idempotencyKey);
        c.answer("post", { apply: true });
        c.eq("once each", c.r.truth().server.posts, ["first", "second"]);
      },
      "give-up-releases-the-head"(c) {
        c.ensure();
        c.into(["comments"], "Post", { clientId: "c1", text: "first" });
        c.into(["comments"], "Post", { clientId: "c2", text: "second" });
        c.answer("post", { lost: true });
        c.into(["comments"], "GiveUp", { clientId: "c1" });
        c.eq("the next goes", c.reqs("post").length, 2);
      },
      // comments.story.ts: deleteRefused
      deleteRefused(c) {
        c.ensure();
        c.into(["comments"], "Load");
        c.answer("thread", { truth: true });
        const ref = commentRef("T-42", "c2");
        c.eq("there", c.rec(ref)?.data.text, "two");
        c.into(["comments"], "Delete", { commentId: "c2" });
        c.eq("predicted away", c.rec(ref)?.data, undefined);
        c.answer("remove", { apply: true });
        c.eq("back, without a repair", c.rec(ref)?.data.text, "two");
        c.eq("no repair", c.reqs("repair").length, 0);
        c.eq(
          "notice",
          c.inner(["comments"])?.memory.notice,
          "Past the edit window: the comment stays",
        );
      },
      "a-b-a-adopts-as-the-story-says"(c0) {
        const Q = { actor: "Desk/Queue", id: "q" };
        const c = new Ctx(c0.fresh([queueFixture]), Q);
        c.ensure();
        c.into(["comments"], "Post", { clientId: "c1", text: "first" });
        c.send("Preview", { id: "T-2" });
        c.eq("fresh for T-2", c.inner(["comments"])?.memory.drafts, []);
        c.eq("post runs on", c.r.row(Q, "post", { ticketId: "T-1" })?.pending, true);
        c.answer("post", { apply: true });
        c.eq("parked for T-1", c.r.evidence("parked").length, 1);
        c.eq("not for T-2", c.inner(["comments"])?.memory.drafts, []);
        c.send("Preview", { id: "T-1" });
        c.eq("adopted by T-1, from the event", c.inner(["comments"])?.memory.drafts, [
          { clientId: "c1", text: "first", sent: true, problem: null },
        ]);
      },
      "reset-subject-is-in-the-lane-record"(c0) {
        const Q = { actor: "Desk/Queue", id: "q" };
        const c = new Ctx(c0.fresh([queueFixture]), Q);
        c.ensure();
        c.into(["comments"], "Post", { clientId: "c1", text: "first" });
        c.send("Preview", { id: "T-2" });
        c.into(["comments"], "Post", { clientId: "c2", text: "other" });
        c.eq("its own lane", c.r.row(Q, "post", { ticketId: "T-2" })?.pending, true);
      },
    },
  },
  {
    id: "FRAG-12",
    kind: "example",
    fixtures: [issuesFixture],
    actor: L,
    cites: ["D15", "OD:5"],
    variants: {
      "unbound-hold-with-a-waiter-yields"(c) {
        c.ensure(L);
        c.ensure(B);
        c.to(L, "Toggle", { id: "i1", liked: true });
        c.answer("like", { lost: true });
        // Audit gaps, the runner's ruling (rule 30, 2.8.5): the record is held only while the forced repair runs, so it stays unanswered here.
        c.to(B, "Toggle", { id: "i1", liked: false });
        c.detach(L); // T2 (rule 73): the Held lane keeps nothing; the actor ends after the grace and the hold is unbound
        c.eq("waits while the hold is bound", c.reqs("like").length, 1);
        c.advance(GRACE);
        c.eq("ended", c.r.state(L), undefined);
        c.eq("D15 as ruled: released as soon as it was unbound with a waiter, no clock", c.r.evidence("Released").length, 1);
        c.answer("repair", { truth: true });
        c.eq("the waiter goes when the repair settles (rule 30)", c.reqs("like").length, 2);
        c.eq("mark kept", c.rec(I1)?.uncertain, true);
        c.ensure(L);
        c.eq(
          "parked Abandoned reaches the next incarnation",
          c.r.evidence("unparked").length >= 0 && c.endings("like").at(-1)?.reason,
          "Abandoned",
        );
      },
      "bound-hold-never-yields"(c) {
        c.ensure(L);
        c.ensure(B);
        c.to(L, "Toggle", { id: "i1", liked: true });
        c.answer("like", { lost: true });
        c.answer("repair", { truth: true });
        c.to(B, "Toggle", { id: "i1", liked: false });
        c.advance(3_600_000);
        c.eq("A holds its lane, never released", [c.r.row(L, "like", K)?.uncertain, c.r.evidence("Released").length], [true, 0]);
        c.eq("its repair settled, so B went (the runner's ruling, rule 30)", c.reqs("like").length, 2);
      },
      "unbound-hold-with-no-waiter-stays"(c) {
        c.ensure(L);
        c.to(L, "Toggle", { id: "i1", liked: true });
        c.answer("like", { lost: true });
        c.answer("repair", { truth: true });
        c.detach(L); // T2 (rule 73)
        c.advance(GRACE);
        c.eq("ended", c.r.state(L), undefined);
        c.advance(3_600_000);
        c.eq("no release", c.r.evidence("Released").length, 0);
      },
    },
  },
  {
    id: "FRAG-13",
    kind: "example",
    fixtures: [issuesLocal],
    actor: L,
    cites: ["D21", "sec:2.7.13"],
    run(c) {
      c.ensure(L);
      c.ensure(B);
      c.to(L, "Toggle", { id: "i1", liked: true });
      c.answer("like", { lost: true });
      c.answer("repair", { truth: true });
      c.to(B, "Toggle", { id: "i1", liked: false });
      c.dispose(L);
      c.eq("released at once", c.r.evidence("Released").length, 1);
      c.eq("B goes", c.reqs("like").length, 2);
      c.eq("mark kept", c.rec(I1)?.uncertain, true);
      c.ensure(L);
      c.eq(
        "no adoption",
        c.endings("like").some((e) => e["reason"] === "Restored"),
        false,
      );
    },
  },
  {
    id: "FRAG-14",
    kind: "example",
    fixtures: [issuesDoubleCancel],
    actor: L,
    cites: ["D22", "rule:43"],
    run(c) {
      c.ensure(L);
      c.to(L, "Toggle", { id: "i1", liked: true });
      c.to(L, "Toggle", { id: "i1", liked: false });
      c.answer("like", { lost: true });
      c.eq("own Attempt released", c.r.evidence("Released").length, 1);
      c.answer("repair", { truth: true }); // the released entry leaves when its repair settles
      c.eq("the promoted one is untouched and goes", c.reqs("like").length, 2);
    },
  },
  {
    id: "FRAG-15",
    kind: "bounded",
    fixtures: [notesFixture],
    actor: N,
    cites: ["rule:53", "rule:54", "L3"],
    namedIssues: ["SendTargetAbsent"], // rule 73 (OD31): a send after `disposeActor` has no record (C105)
    run(c) {
      const r = searchFrag(c.make, { depth: 5, maxStates: 1200 });
      c.eq("no oracle failed", r.failure ?? "none", "none");
      c.eq("it ends on its state bound, not a clock: the verdict and the depth it completed", [r.verdict, r.depthCompleted], ["completed", 5]);
      c.yes("it searched", r.states > 50);
    },
  },
  {
    id: "FRAG-16",
    kind: "fault",
    fixtures: [issuesDenySettled],
    actor: L,
    cites: ["F3", "sec:2.5"],
    variants: {
      "denied-keeps-the-cell-and-promotes"(c) {
        c.ensure(L);
        c.to(L, "Toggle", { id: "i1", liked: true });
        c.to(L, "Toggle", { id: "i1", liked: false });
        c.answer("like", { apply: true });
        c.eq("promoted", c.reqs("like").length, 2);
        c.eq("denied", c.r.evidence("Denied").length, 1);
        c.eq("counts as delivered", c.r.evidence("delivered").length, 1);
      },
    },
  },
  {
    id: "FRAG-17",
    kind: "fault",
    fixtures: [formFixture],
    actor: F,
    cites: ["sec:2.5", "rule:9", "rule:7"],
    variants: {
      "a-child-that-cannot-react-refuses-the-whole-turn"(c) {
        c.ensure();
        c.send("RefuseChild");
        c.eq("refused", c.r.issues().at(-1)?.code, "InvalidTurn");
        c.eq("source patch gone", c.mem().moved, false);
        c.namedIssues = ["InvalidTurn"];
      },
      "raise-into-an-absent-key-refuses-outside-a-delivery"(c) {
        c.ensure();
        c.send("RaiseGone", { key: "nope" });
        c.eq("refused", c.r.issues().at(-1)?.code, "InvalidTurn");
        c.namedIssues = ["InvalidTurn"];
      },
      "leaving-cancels-a-node-traits-schedule"(c) {
        c.ensure();
        c.send("Go");
        c.advance(5000);
        c.eq("no firing", c.mem().flashes, 0);
        c.eq("slice undefined", inner(c, ["flash"]), undefined);
        c.send("Back");
        c.advance(999);
        c.eq("fresh incarnation, full length", c.mem().flashes, 0);
        c.advance(1);
        c.eq("fired", c.mem().flashes, 1);
      },
      "one-publication-per-turn"(c) {
        c.ensure();
        const before = c.r.frames().length;
        c.send("SetIds", { ids: ["a", "b"] });
        c.eq("one frame for the turn and its copies", c.r.frames().length - before, 1);
      },
    },
  },
  {
    id: "FRAG-18",
    kind: "example",
    fixtures: [feedFixture],
    actor: { actor: "Feed", id: "a" },
    cites: ["rule:52", "rule:1"],
    variants: {
      "freeze-interrupts-a-lookup-thaw-delivers-it-first"(c) {
        c.ensure();
        c.into(["tail"], "Sync");
        c.send("Away");
        c.eq("slice readable", inner(c, ["tail"])?.memory.failed, []);
        c.send("Live");
        c.eq("Interrupted at thaw", inner(c, ["tail"])?.memory.failed, ["Interrupted"]);
      },
      "a-frozen-schedule-keeps-due-and-fires-once"(c) {
        c.ensure();
        c.into(["tail"], "Sync");
        c.advance(500);
        c.send("Away");
        c.advance(5000);
        c.eq("not while frozen", inner(c, ["tail"])?.memory.ticks, 0);
        c.send("Live");
        c.eq("once, on return", inner(c, ["tail"])?.memory.ticks, 1);
      },
      "reload-while-frozen-keeps-the-parked-ending"(c) {
        c.ensure();
        c.into(["tail"], "Sync");
        c.send("Away");
        c.reload();
        c.send("Live");
        c.eq("delivered after a reload", inner(c, ["tail"])?.memory.failed, ["Interrupted"]);
      },
      "a-live-lookup-is-not-persisted"(c) {
        c.ensure();
        c.into(["tail"], "Sync");
        c.reload();
        c.eq("nothing delivered", inner(c, ["tail"])?.memory.failed, []);
        c.eq("no open read", c.r.outside().open.length, 0);
      },
    },
  },
  {
    id: "FRAG-19",
    kind: "example",
    fixtures: [notesFixture],
    actor: N,
    cites: ["rule:46", "rule:51", "sec:2.9.4"],
    variants: {
      "copies-and-subject-paths-survive-a-reload"(c) {
        c.ensure();
        c.send("SetDocs", docs("d1"));
        edit(c, "d1", "mine");
        c.ack();
        c.eq(
          "record carries its path",
          (c.r.stored().get('lane/Notes/a|save|{"docId":"d1"}') as any)?.subject,
          ["d1"],
        );
        c.reload();
        c.eq("copy back", saved(c, "d1")?.body, "mine");
        c.eq("unknown Restored, to its copy", saved(c, "d1")?.status, "unsure");
      },
      "unplaced-parked-survives-a-reload"(c) {
        c.ensure();
        c.send("SetDocs", docs("d1"));
        edit(c, "d1", "mine");
        c.ack();
        c.send("SetDocs", docs());
        c.answer("save", { apply: true });
        c.reload();
        c.send("SetDocs", docs("d1"));
        c.eq("once, and only now", saved(c, "d1")?.saved, "mine");
      },
    },
  },
  // Stage F, re-check H1''': which row hears a failure. Two live copies, a failure on the second; the first must not hear it.
  {
    id: "FRAG-21",
    kind: "example",
    fixtures: [notesFixture],
    actor: N,
    cites: ["rule:51", "rule:53"],
    variants: {
      "a-failure-on-the-second-copy-reaches-only-it"(c) {
        c.ensure();
        c.send("SetDocs", docs("d1", "d2"));
        edit(c, "d1", "one");
        edit(c, "d2", "two");
        c.ack();
        c.ack();
        c.answer("save", { fail: { tag: "Conflict" } }, { docId: "d2" });
        c.eq("the second copy heard its conflict", saved(c, "d2")?.status, "conflict");
        c.eq("the first copy heard nothing", saved(c, "d1")?.status, "saving");
        c.eq("the first copy's text is its own", saved(c, "d1")?.body, "one");
        c.answer("save", { apply: true }, { docId: "d1" });
        c.eq("the first copy's own success", saved(c, "d1")?.saved, "one");
        c.eq("the second copy kept its conflict", saved(c, "d2")?.status, "conflict");
      },
      // Re-check L1, tried: a keyed copy's failing save, answered with other sends to the same actor queued in the same tick. The runtime
      // admits the ending before or after that mail, never beside it, so D161's keyed "owner moved" trigger still fires in no case (stage F).
      "a-keyed-failure-and-sends-in-one-tick"(c) {
        c.ensure();
        c.send("SetDocs", docs("d1", "d2"));
        edit(c, "d1", "one");
        c.ack();
        c.h.raw({ answer: "save", with: { fail: { tag: "Conflict" } }, where: { docId: "d1" } });
        c.h.raw({ sendMany: [[N, "SetDocs", docs("d1", "d2", "d3")], [N, "SetDocs", docs("d1", "d2")]] });
        c.h.do({ advance: 0 });
        c.eq("the copy heard its conflict", saved(c, "d1")?.status, "conflict");
        c.eq("the other copy is untouched", saved(c, "d2")?.status, "clean");
      },
    },
  },
  // Stage G (re-check H1''''): the entity shape. Two actors of one machine, three keyed copies each, every copy's memory its own (so the
  // suite's observed recipient is one actor and one copy). Endings of one actor's copy must reach that copy of that actor only.
  {
    id: "FRAG-22",
    kind: "example",
    fixtures: [notesFixture],
    actor: N,
    cites: ["rule:51", "rule:53", "rule:14"],
    variants: {
      "two-actors-three-copies-each-ending-reaches-its-own"(c) {
        const B = { actor: "Notes", id: "b" };
        for (const a of [N, B]) {
          c.ensure(a);
          c.to(a, "SetDocs", docs("d1", "d2", "d3"));
          for (const d of ["d1", "d2", "d3"]) {
            c.into([`docs:${d}`], "Edited", { body: `${a.id}-${d}` }, a);
            c.ack();
          }
        }
        c.answer("save", { lost: true }, { docId: "d2", body: "a-d2" });
        c.eq("a's second copy heard its unknown", c.inner(["docs:d2"], N)?.memory.status, "unsure");
        c.eq("b's second copy heard nothing", c.inner(["docs:d2"], B)?.memory.status, "saving");
        c.answer("save", { fail: { tag: "Conflict" } }, { docId: "d2", body: "b-d2" });
        c.eq("b's second copy heard its conflict", c.inner(["docs:d2"], B)?.memory.status, "conflict");
        c.eq("a's second copy kept its unknown", c.inner(["docs:d2"], N)?.memory.status, "unsure");
        c.answer("save", { apply: true }, { docId: "d3", body: "b-d3" });
        c.eq("b's third copy saved its own text", c.inner(["docs:d3"], B)?.memory.saved, "b-d3");
        for (const d of ["d1", "d3"]) c.eq(`a's ${d} heard nothing`, c.inner([`docs:${d}`], N)?.memory.status, "saving");
        c.eq("b's first heard nothing", c.inner(["docs:d1"], B)?.memory.status, "saving");
      },
      // A keyed copy's failure, admitted in the same batch as another copy's own turn and another actor's: two lanes answered in one
      // `do`, and a send to a third copy. (j) must see each ending land in its own copy, and pay no let-go for the moving copy beside it.
      "keyed-failure-beside-another-copys-turn-in-one-batch"(c) {
        const B = { actor: "Notes", id: "b" };
        for (const a of [N, B]) {
          c.ensure(a);
          c.to(a, "SetDocs", docs("d1", "d2", "d3"));
          for (const d of ["d1", "d2"]) {
            c.into([`docs:${d}`], "Edited", { body: `${a.id}-${d}` }, a);
            c.ack();
          }
        }
        c.h.raw({ answer: "save", with: { fail: { tag: "Conflict" } }, where: { docId: "d1", body: "a-d1" } });
        c.h.raw({ answer: "save", with: { lost: true }, where: { docId: "d2", body: "b-d2" } });
        c.h.raw({ send: N, event: "Edited", payload: { body: "a-d3" }, to: ["docs:d3"] });
        c.h.raw({ send: B, event: "Edited", payload: { body: "b-d3" }, to: ["docs:d3"] });
        c.h.do({ advance: 0 });
        c.eq("a's first copy heard its conflict", c.inner(["docs:d1"], N)?.memory.status, "conflict");
        c.eq("b's second copy heard its unknown", c.inner(["docs:d2"], B)?.memory.status, "unsure");
        c.eq("a's second copy heard nothing", c.inner(["docs:d2"], N)?.memory.status, "saving");
        c.eq("b's first copy heard nothing", c.inner(["docs:d1"], B)?.memory.status, "saving");
        c.eq("each third copy took its own edit", [c.inner(["docs:d3"], N)?.memory.body, c.inner(["docs:d3"], B)?.memory.body], ["a-d3", "b-d3"]);
      },
    },
  },
  // Stage H (re-check 10g, equal views): actors and copies whose published views are EQUAL, the entity shape with identity in the key only.
  // (j) places a recipient by the suite's own identity of each incarnation, not by its view, so each ending must land in its own.
  {
    id: "FRAG-23",
    kind: "example",
    fixtures: [feedFixture, notesFixture],
    actor: { actor: "Feed", id: "a" },
    cites: ["rule:51", "rule:53", "rule:14"],
    variants: {
      "equal-memory-actors-in-one-state-an-ending-reaches-one"(c) {
        const A = { actor: "Feed", id: "a" };
        const B = { actor: "Feed", id: "b" };
        c.ensure(A);
        c.ensure(B);
        c.into(["tail"], "Sync", undefined, A);
        c.into(["tail"], "Sync", undefined, B);
        c.eq("equal views before", c.inner(["tail"], A)?.memory, c.inner(["tail"], B)?.memory);
        c.eq("one state", [c.r.state(A), c.r.state(B)], ["LIVE", "LIVE"]);
        c.answer("catchUp", { ok: {} });
        c.eq("exactly one tail heard its ending", [c.inner(["tail"], A)?.memory.caught, c.inner(["tail"], B)?.memory.caught].sort(), [0, 1]);
      },
      "equal-memory-actors-in-two-states-an-ending-reaches-the-live-one"(c) {
        const A = { actor: "Feed", id: "a" };
        const B = { actor: "Feed", id: "b" };
        c.ensure(A);
        c.ensure(B);
        c.to(B, "Away");
        c.into(["tail"], "Sync", undefined, A);
        c.eq("equal root memory", c.r.memory(A), c.r.memory(B));
        c.eq("two states", [c.r.state(A), c.r.state(B)], ["LIVE", "AWAY"]);
        c.answer("catchUp", { ok: {} });
        c.eq("a's tail heard it", c.inner(["tail"], A)?.memory.caught, 1);
        c.to(B, "Live");
        c.eq("b's tail heard nothing", c.inner(["tail"], B)?.memory.caught, 0);
      },
      "two-equal-copies-in-two-actors-an-ending-reaches-one"(c) {
        const A = { actor: "Notes", id: "a" };
        const B = { actor: "Notes", id: "b" };
        for (const a of [A, B]) {
          c.ensure(a);
          c.to(a, "SetDocs", docs("d1"));
          c.into(["docs:d1"], "Edited", { body: "same" }, a);
          c.ack();
        }
        c.eq("equal copy views", c.inner(["docs:d1"], A)?.memory, c.inner(["docs:d1"], B)?.memory);
        c.answer("save", { lost: true }, { docId: "d1", body: "same" });
        c.eq("exactly one copy heard its unknown", [c.inner(["docs:d1"], A)?.memory.status, c.inner(["docs:d1"], B)?.memory.status].sort(), ["saving", "unsure"]);
      },
      // The suite's own send of an ending's event, to another actor, in the batch the ending lands in: the send pays b's run, never a's.
      "an-ending-beside-the-suites-own-send-of-its-event-to-another-actor"(c) {
        const A = { actor: "Notes", id: "a" };
        const B = { actor: "Notes", id: "b" };
        for (const a of [A, B]) {
          c.ensure(a);
          c.to(a, "SetDocs", docs("d1"));
          c.into(["docs:d1"], "Edited", { body: a.id }, a);
          c.ack();
        }
        c.h.raw({ send: B, event: "Unsure", payload: { reason: "Lost" }, to: ["docs:d1"] });
        c.h.raw({ answer: "save", with: { lost: true }, where: { docId: "d1", body: "a" } });
        c.h.do({ advance: 0 });
        c.eq("a's copy heard its unknown", c.inner(["docs:d1"], A)?.memory.status, "unsure");
        c.eq("b's copy took the suite's send", c.inner(["docs:d1"], B)?.memory.status, "unsure");
      },
    },
  },
  // From the second author's survivors, after his number was taken (35/50). They do not change that number.
  {
    id: "FRAG-20",
    kind: "fault",
    fixtures: [notesFixture],
    actor: N,
    cites: ["rule:60", "rule:14", "rule:15", "D15", "D21", "D46", "rule:1", "rule:17"],
    variants: {
      "release-only-the-ending-subject"(c) {
        started(c, "r1", "r2");
        c.ack();
        c.send("SetFiles", { files: ["r2"] });
        c.eq("r1 gone", c.r.row(N, "put", { ref: "r1" }), undefined);
        c.eq("r2 untouched", c.r.row(N, "put", { ref: "r2" })?.pending, true);
      },
      "a-commit-in-a-copy-the-same-turn-removes-is-marked"(c) {
        c.ensure();
        c.send("SetFiles", { files: ["r1"] });
        c.send("KickAndDrop", { key: "r1" });
        c.eq("waiting for its ack, marked", c.r.row(N, "put", { ref: "r1" })?.pending, true);
        c.ack();
        c.eq("ended as evidence", c.r.row(N, "put", { ref: "r1" }), undefined);
        c.eq("never sent", c.reqs("put").length, 0);
      },
      "actor-record-does-not-parse"(c0) {
        const c = new Ctx(c0.fresh([payFixture]), P);
        c.ensure();
        c.send("Start", CART);
        c.fault({ corruptStored: { match: "actor/", edit: () => "{{{" } });
        c.reload();
        c.eq("alive", c.r.quiet().fatal, false);
        c.eq("named", c.r.issues().at(-1)?.code, "RecordQuarantined");
        c0.namedIssues = ["RecordQuarantined"];
      },
      "adopted-ending-is-current-from-the-active-leaf"(c0) {
        const D = { actor: "Docs", id: "a" };
        const c = new Ctx(c0.fresh([docsFixture]), D);
        c.ensure();
        c.send("Open");
        c.send("Save", { id: "d1", title: "T" });
        c.dispose();
        c.ensure();
        c.send("Open");
        c.answer("save", { apply: true });
        c.eq("current, not late", [c.mem().saved, c.mem().lateSaved], [1, 0]);
      },
      "a-late-ending-may-not-leave-an-active-subroutine"(c0) {
        const c = new Ctx(c0.fresh([payFullFixture]), P);
        toPaying(c);
        c.answer("pay", { ok: CAP });
        c.state("PLACING");
        c.ack();
        c.into(["summary"], "PayPressed", { paymentMethodId: "visa" }); // P6's press, on the real machine
        c.state("PAYING");
        c.ack();
        c.answer("pay", { ok: ACT });
        c.state("CHALLENGE");
        c.ack();
        c.answer("place", { ok: { orderId: "o1" } });
        c.state("CHALLENGE");
        c.eq("denied", c.r.evidence("Denied").at(-1)?.["reasons"], ["LateMayNotLeave"]);
      },
      "a-bound-hold-never-yields-an-actor-back-in-time"(c0) {
        const c = new Ctx(c0.fresh([issuesFixture]), L);
        c.ensure(L);
        c.ensure(B);
        c.to(L, "Toggle", { id: "i1", liked: true });
        c.answer("like", { lost: true });
        c.answer("repair", { truth: true });
        c.to(B, "Toggle", { id: "i1", liked: false });
        c.detach(L); // T2 with no advance (rule 73): detach and ensure in one step, the same incarnation
        c.ensure(L);
        c.eq("one incarnation", c.incarnations(L), 1);
        c.advance(300_000);
        c.eq("no release", c.r.evidence("Released").length, 0);
      },
      "no-waiter-left-no-yield"(c0) {
        const c = new Ctx(c0.fresh([issuesFixture]), L);
        c.ensure(L);
        c.ensure(B);
        c.to(L, "Toggle", { id: "i1", liked: true });
        c.answer("like", { lost: true });
        c.answer("repair", { truth: true });
        c.to(B, "Toggle", { id: "i1", liked: false });
        c.to(B, "Delete", { id: "i9" }); // a bystander
        c.to(B, "CancelLike", { id: "i1" }); // the waiter leaves while the hold is still bound
        c.detach(L); // T2 (rule 73): the Held lane keeps nothing
        c.advance(GRACE);
        c.eq("ended", c.r.state(L), undefined);
        c.advance(300_000);
        c.eq("the hold stays", c.r.row(L, "like", K)?.uncertain, true);
      },
      "local-sent-finishes-to-evidence"(c0) {
        const c = new Ctx(c0.fresh([issuesLocal]), L);
        c.ensure(L);
        c.to(L, "Toggle", { id: "i1", liked: true });
        c.dispose(L);
        c.ensure(L);
        c.answer("like", { apply: true });
        c.eq("not delivered to the fresh one", c.r.evidence("delivered").length, 0);
      },
      "re-entering-does-not-refresh-a-resumable"(c0) {
        const X = { actor: "Feed", id: "a" };
        const c = new Ctx(c0.fresh([feedFixture]), X);
        c.ensure();
        c.into(["tail"], "Sync");
        c.answer("catchUp", { ok: {} });
        c.send("Live"); // LIVE to LIVE
        c.eq("same memory", c.inner(["tail"])?.memory.caught, 1);
      },
      "a-freeze-is-an-ending-not-a-release"(c0) {
        const X = { actor: "Feed", id: "a" };
        const c = new Ctx(c0.fresh([feedFixture]), X);
        c.ensure();
        c.into(["tail"], "Sync");
        c.send("Away");
        c.eq("not Superseded", c.r.evidence("Superseded").length, 0);
      },
    },
  },
  // Stage J (re-check 10i): two `.each` copies of one actor, each with a write in flight, reload. Each restored unknown runs in its own
  // copy, placed by the serial the Host's decode minted on that copy's memory in the record.
  {
    id: "FRAG-24",
    kind: "example",
    fixtures: [notesFixture],
    actor: N,
    cites: ["rule:44", "rule:53", "D176"],
    variants: {
      "two-copies-reload-each-hears-its-own-restored-unknown"(c) {
        c.ensure();
        c.send("SetDocs", docs("d1", "d2"));
        edit(c, "d1", "one");
        c.ack();
        edit(c, "d2", "two");
        c.ack();
        c.eq("two writes out", c.reqs("save").length, 2);
        c.reload();
        c.eq("d1 heard Restored", saved(c, "d1")?.reason, "Restored");
        c.eq("d2 heard Restored", saved(c, "d2")?.reason, "Restored");
        c.eq("each once", c.endings("save").filter((e) => e["reason"] === "Restored").length, 2);
      },
      // Stage L (review H4): entity rows are copies. The store loads slowly and a dispose of the actor waits for it; each copy still hears
      // its own restored unknown first (rule 44), and (j) judges both at the reload.
      "a-dispose-waiting-on-a-slow-load-runs-after-both-copies-restored-endings"(c) {
        c.ensure();
        c.send("SetDocs", docs("d1", "d2"));
        edit(c, "d1", "one");
        c.ack();
        edit(c, "d2", "two");
        c.ack();
        c.do({ reload: true, load: "hang" });
        c.h.do({ dispose: N });
        c.do({ storage: "loadOk" });
        c.eq("both copies heard Restored before the dispose", c.r.evidence("delivered").filter((e) => e["op"] === "save" && e["attempt"]).length, 2);
        c.eq("disposed", c.r.state(N), undefined);
      },
    },
  },
];
