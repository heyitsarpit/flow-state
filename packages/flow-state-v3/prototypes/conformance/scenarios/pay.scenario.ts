// Round 1's scenarios, worked out by hand from SCENARIOS.md and pay.machine.ts, before any runtime existed.
import { cellsFixture } from "../fixtures/cells.compiled.ts";
import { ringFixture } from "../fixtures/order.compiled.ts";
import { payFixture } from "../fixtures/pay.compiled.ts";
import { checkEndings, Ctx, type Scenario } from "./ctx.ts";

export const A = { actor: "Checkout/Pay", id: "shopper-1" };
const K = { intentId: "pi1" };
export const CART = { cartId: "c1", intentId: "pi1" };
const req_cap = { ok: { status: "requires_capture", clientSecret: "" } };
const NOT_CHARGED = "Your payment wasn't sent. You haven't been charged.";

export const FIXTURES = [payFixture];
const CELLS = [cellsFixture];
const rowKey_ = (op: string, key: unknown) => `${op}|${JSON.stringify(key)}`;
const pay = (c: Ctx) => c.send("PayRequested", { paymentMethodId: "visa" });
const start = (c: Ctx) => c.send("Start", CART);
const onWire = (c: Ctx) => (c.ensure(), start(c), pay(c), c.ack());
const row = (c: Ctx, op = "pay", key: unknown = K) => c.r.row(c.A, op, key);

const toResend = (c: Ctx) => {
  onWire(c);
  c.answer("pay", { lost: true });
  c.state("UNSURE");
  c.eq("charges", c.r.truth().charges, 0);
  c.advance(3000);
  c.answer("order", { ok: null });
  c.answer("intent", { ok: { status: "requires_payment_method" } });
  c.state("PAYING");
  c.eq("not sent before capture", c.reqs("pay").length, 1);
  c.ack();
  c.eq("re-sent after capture", c.reqs("pay").length, 2);
  c.eq("same id", c.keys("pay").length, 1);
};

const reloadOnWire = (c: Ctx) => {
  onWire(c);
  c.reload();
  const boot = c.r.frames().filter((f) => f.cause === "boot")[1];
  c.eq("after boot, saved leaf", boot?.view[`${A.actor}/${A.id}`]?.state, "PAYING");
  c.eq(
    "after boot, not yet uncertain",
    boot?.view[`${A.actor}/${A.id}`]?.rows[rowKey_("pay", K)]?.uncertain,
    false,
  );
  c.state("UNSURE");
  c.eq("uncertain", row(c)?.uncertain, true);
  c.eq("reason", c.lastEnding("pay")?.reason, "Restored");
  c.eq("requests", c.reqs("pay").length, 1);
  c.eq("initial not re-run", c.r.evidence("initial").length, 1);
  // The old tab's request finishes on the server; nobody hears it (pay.story.ts `reloadWhileConfirming`).
  c.fault({ lateAnswer: ["pay", req_cap] });
  c.advance(3000);
  c.answer("order", { ok: null });
  c.answer("intent", { ok: { status: "requires_capture" } });
  c.state("PLACING");
  c.ack();
  c.answer("place", { ok: { orderId: "o1" } });
  c.state("PAID");
  c.eq("charges", c.r.truth().charges, 1);
};

export const payScenarios: readonly Scenario[] = [
  {
    id: "PAY-01",
    kind: "example",
    fixtures: FIXTURES,
    cites: [
      "rule:17",
      "rule:21",
      "cell:lane.commit.Idle",
      "cell:lane.success.InFlight",
      "sec:2.7.12",
      "D4",
    ],
    run(c) {
      c.ensure();
      start(c);
      c.state("CARD");
      pay(c);
      c.state("PAYING");
      c.eq("pending", row(c)?.pending, true);
      c.eq("no send before ack", c.reqs("pay").length, 0);
      c.ack();
      c.eq("sent", c.reqs("pay").length, 1);
      c.answer("pay", req_cap);
      c.state("PLACING");
      c.eq("lane gone", row(c), undefined);
      c.eq("place waits", c.reqs("place").length, 0);
      c.ack();
      c.eq("place sent", c.reqs("place").length, 1);
      c.answer("place", { ok: { orderId: "o1" } });
      c.state("PAID");
      c.eq("receipt", c.mem().receipt, { orderId: "o1", afterUnsure: false, alreadyPlaced: false });
      c.eq("charges", c.r.truth().charges, 1);
    },
  },
  {
    id: "PAY-02",
    kind: "example",
    fixtures: FIXTURES,
    cites: ["rule:16", "cell:lane.commit.InFlight", "sec:2.7.1.NotSent"],
    run(c) {
      onWire(c);
      pay(c);
      c.state("PAYING");
      c.eq("requests", c.reqs("pay").length, 1);
      c.eq(
        "cell",
        c.r
          .evidence("lane")
          .filter((e) => e.op === "pay")
          .at(-1)?.cell,
        "lane.commit.InFlight",
      );
      c.eq("notice", c.mem().notice, "");
      c.eq("decline ending", c.lastEnding("pay")?.reason, "Rejected");
    },
  },
  {
    id: "PAY-03",
    kind: "example",
    fixtures: FIXTURES,
    cites: ["rule:24", "cell:lane.cancel.Held", "cell:lane.unknown.InFlight"],
    run(c) {
      onWire(c);
      c.answer("pay", { lostButLanded: req_cap.ok });
      c.state("UNSURE");
      c.eq("uncertain", row(c)?.uncertain, true);
      c.eq("afterUnsure", c.mem().afterUnsure, true);
      c.eq("charges", c.r.truth().charges, 1);
      c.advance(3000);
      c.eq("intent read", c.reqs("intent").length, 1);
      c.eq("order read", c.reqs("order").length, 1);
      c.answer("intent", { ok: { status: "requires_capture" } });
      c.state("PLACING");
      c.eq("released", row(c), undefined);
      c.eq("evidence", c.r.evidence("Released").length, 1);
      c.eq("no re-send", c.reqs("pay").length, 1);
      c.answer("order", { ok: null });
      c.state("PLACING");
      c.ack();
      c.answer("place", { ok: { orderId: "o1" } });
      c.state("PAID");
      c.eq("afterUnsure receipt", c.mem().receipt.afterUnsure, true);
      c.eq("charges", c.r.truth().charges, 1);
    },
  },
  {
    id: "PAY-04",
    kind: "example",
    fixtures: FIXTURES,
    cites: ["rule:19", "cell:lane.retry.Held", "cell:lane.invoked.InFlight", "S6"],
    run(c) {
      toResend(c);
      c.eq("retryCount", row(c)?.retryCount, 1);
      c.answer("pay", req_cap);
      c.state("PLACING");
      c.eq("charges", c.r.truth().charges, 1);
      c.eq("distinct keys", c.keys("pay").length, 1);
      c.eq("afterUnsure", c.mem().afterUnsure, true);
    },
  },
  {
    id: "PAY-05",
    kind: "example",
    fixtures: FIXTURES,
    cites: ["rule:18", "sec:2.7.1.StillUnknown"],
    run(c) {
      toResend(c);
      const notice = c.mem().notice;
      c.answer("pay", { fail: { tag: "CardDeclined", code: "card_declined" } });
      c.state("UNSURE");
      c.eq("uncertain", row(c)?.uncertain, true);
      c.eq("reason", c.lastEnding("pay")?.reason, "StillUnknown");
      c.eq("notice unchanged", c.mem().notice, notice);
    },
  },
  {
    id: "PAY-06",
    kind: "fault",
    fixtures: FIXTURES,
    cites: ["D8", "D5", "S4", "rule:25"],
    variants: {
      interruptible(c) {
        onWire(c);
        c.answer("pay", { never: true });
        c.advance(8000);
        c.state("PAYING");
        c.eq("notice", c.mem().notice, "Still confirming with your bank…");
        c.eq("pending", row(c)?.pending, true);
        c.advance(52000);
        c.state("UNSURE");
        c.eq("uncertain", row(c)?.uncertain, true);
        c.eq("reason", c.lastEnding("pay")?.reason, "TimedOut");
        c.eq("interrupted", c.r.evidence("interrupt").length, 1);
        c.eq("fence", c.r.evidence("fence").length, 1); // the interrupted fiber's own exit, before any answer
        c.fault({ lateAnswer: ["pay", req_cap] });
        c.state("UNSURE");
        c.eq("uncertain", row(c)?.uncertain, true);
        c.eq("still one fence: the fiber is gone", c.r.evidence("fence").length, 1);
        c.eq("charges", c.r.truth().charges, 1);
        c.eq("one ending", c.endings("pay").length, 1);
      },
      // Added: an interrupt that cannot land, so `fetch`'s late answer really reaches the core (walkthrough step 5).
      uninterruptible(c) {
        c.ensure();
        c.fault({ uninterruptibleHang: "pay" });
        start(c);
        pay(c);
        c.ack();
        c.advance(60000);
        c.state("UNSURE");
        c.eq("no fence yet", c.r.evidence("fence").length, 0);
        c.fault({ lateAnswer: ["pay", req_cap] });
        c.eq("late answer dropped", c.r.evidence("fence").length, 1);
        c.state("UNSURE");
        c.eq("one ending", c.endings("pay").length, 1);
      },
    },
  },
  {
    id: "PAY-07",
    kind: "example",
    fixtures: FIXTURES,
    cites: ["rule:14", "rule:15", "rule:17"],
    pins: ["P2", "P3"],
    variants: {
      leaveMidCharge(c) {
        onWire(c);
        c.send("Leave");
        c.state("LEFT");
        c.eq("still pending", row(c)?.pending, true);
        c.answer("pay", req_cap);
        c.state("LEFT");
        c.ack();
        c.eq("void sent", c.reqs("void").length, 1);
        c.answer("void", { ok: {} });
        c.state("LEFT");
        c.eq("notice", c.mem().notice, "The hold on your card was released.");
        c.eq("authorized", c.mem().authorized, false);
      },
      // Added: rule 14 with a leaf that handles the same event. The owner's activation died, so it routes from the root.
      "late-in-a-new-PAYING"(c) {
        onWire(c);
        c.send("Leave");
        start(c);
        pay(c); // Rejected: the first Attempt still holds the lane
        c.state("PAYING");
        c.answer("pay", req_cap);
        c.state("PAYING"); // root Confirmed, last alternative: self. See RESULTS: the checkout is now stuck, by the rules
        c.eq("lane gone", row(c), undefined);
        c.eq("charges", c.r.truth().charges, 1);
      },
      // Added: rule 15. Placed is late and its only alternative would leave PAYING, which owns a live confirm.
      "late-may-not-leave"(c) {
        onWire(c);
        c.answer("pay", req_cap);
        c.ack(); // place on the wire
        c.send("Leave");
        start(c);
        pay(c);
        c.ack(); // a new pay on the wire, owned by this PAYING
        c.answer("place", { ok: { orderId: "o1" } });
        c.state("PAYING");
        c.eq("denied", c.r.evidence("Denied").at(-1)?.reasons, ["LateMayNotLeave"]);
      },
    },
  },
  {
    id: "PAY-08",
    kind: "example",
    fixtures: FIXTURES,
    cites: ["rule:46", "cell:lane.restore.InFlight", "S10", "sec:2.7.15"],
    variants: {
      reloadDuringCharge: reloadOnWire,
      // Added: the saved leaf is UNSURE, so PayUnsure is `self` and nothing re-enters: only a restored timer keeps asking.
      "reload-while-reconciling"(c) {
        onWire(c);
        c.answer("pay", { lost: true });
        c.advance(1000);
        c.reload();
        c.state("UNSURE");
        c.eq("uncertain", row(c)?.uncertain, true);
        c.advance(1999);
        c.eq("not yet", c.reqs("intent").length, 0);
        c.advance(1);
        c.eq("the saved timer fired at its saved time", c.reqs("intent").length, 1);
      },
    },
  },
  {
    id: "PAY-09",
    kind: "fault",
    fixtures: FIXTURES,
    cites: ["sec:2.7.1.NotSent", "cell:lane.restore.InFlight", "S7", "rule:46"],
    variants: {
      "ack-not-stored"(c) {
        c.ensure();
        start(c);
        pay(c);
        c.reload();
        c.eq("requests", c.reqs("pay").length, 0);
        c.state("CARD");
        // Round 7, the edge: the capture and its ack are one batch, so before it lands nothing of the click is on disk. An earlier true state, with no notice. 2.10.15's row: see convergence-7.
        c.eq("no notice: the click is gone with its process", c.mem().notice, "");
        c.eq("charges", c.r.truth().charges, 0);
        c.eq("row", row(c), undefined);
      },
      // Added: design 2.10's `hold({ at: "response" })`, the G1 cell. Stored, confirmation lost: cannot say "not charged".
      "ack-stored-confirmation-lost"(c) {
        c.ensure();
        start(c);
        pay(c);
        c.do({ storage: "landNoAck" });
        c.reload();
        c.eq("requests", c.reqs("pay").length, 0);
        c.state("UNSURE");
        c.eq("reason", c.lastEnding("pay")?.reason, "Restored");
        c.eq("uncertain", row(c)?.uncertain, true);
      },
    },
  },
  {
    id: "PAY-10",
    kind: "fault",
    fixtures: FIXTURES,
    cites: ["cell:lane.storageRefused.InFlight", "D30", "S7"],
    variants: {
      refuse(c) {
        c.ensure();
        start(c);
        pay(c);
        c.do({ storage: "refuse" });
        c.eq("requests", c.reqs("pay").length, 0);
        c.state("CARD");
        c.eq("evidence", c.r.evidence("StorageFailure").length, 1);
      },
      hang(c) {
        c.ensure();
        start(c);
        pay(c);
        c.do({ storage: "hang" });
        c.advance(9999);
        c.state("PAYING");
        c.advance(1);
        // D30: silence is not a refusal. Pending, with evidence; nobody is told "not charged".
        c.eq("requests", c.reqs("pay").length, 0);
        c.state("PAYING");
        c.eq("pending", row(c)?.pending, true);
        c.eq("no refusal", c.r.evidence("StorageFailure").length, 0);
        c.eq("evidence", c.r.evidence("StorageSilent").length, 1);
        c.eq("notice", c.mem().notice, "Still confirming with your bank…");
      },
    },
  },
  {
    id: "PAY-11",
    kind: "fault",
    fixtures: FIXTURES,
    cites: ["rule:12", "F3", "F6", "D46", "D50", "sec:2.5"],
    variants: {
      // D50: a closure that throws once costs one issue, not the fact.
      guard(c) {
        onWire(c);
        c.fault({ throwIn: "states.PAYING.on.Confirmed[1].guard[0]", times: 1 });
        c.answer("pay", req_cap);
        c.state("PLACING");
        c.eq("cell kept", row(c), undefined);
        const i = c.r.issues();
        c.eq("one issue", i.length, 1);
        c.eq("issue", i[0]?.code, "InvalidTurn");
        c.eq("origin", i[0]?.origin, "Checkout/Pay states.PAYING.on.Confirmed[1].guard[0]");
        c.eq("input", i[0]?.input, { k: "mail", event: "Confirmed" });
        c.namedIssues = ["InvalidTurn"];
      },
      // A closure that always throws: redelivered once, then final. No loop.
      "guard-twice"(c) {
        onWire(c);
        c.fault({ throwIn: "states.PAYING.on.Confirmed[1].guard[0]", times: 2 });
        c.answer("pay", req_cap);
        c.state("PAYING");
        c.eq("cell kept, and the row says so", (row(c) as any)?.undelivered, 1); // D118
        const i = c.r.issues();
        c.eq("two issues", i.length, 2);
        c.eq("second says it was the redelivery", i[1]?.input, {
          k: "mail",
          event: "Confirmed",
          redelivered: true,
        });
        c.namedIssues = ["InvalidTurn"];
        c.send("Leave");
        c.state("LEFT");
      },
      // M5: the unknown's handler throws once: the fact and the hold's owner survive.
      "unknown-handler-throws-once"(c) {
        onWire(c);
        c.fault({ throwIn: "states.PAYING.on.PayUnsure[0].updateMemory", times: 1 });
        c.answer("pay", { lostButLanded: { status: "requires_capture", clientSecret: "" } });
        c.state("UNSURE");
        c.advance(3000);
        c.eq("the owner polls", c.reqs("intent").length, 1);
        c.namedIssues = ["InvalidTurn"];
      },
      // A refused turn keeps none of its own members (2.5 step 5). The throw comes after the members applied.
      "refused-after-members"(c) {
        const R = { actor: "Ring", id: "a" };
        const d = new Ctx(c.fresh([ringFixture]), R);
        d.namedIssues = ["InvalidTurn"];
        d.ensure();
        d.fault({ throwIn: "on.WorkBad[0].followUp[0]" });
        d.send("WorkBad", { n: 1, who: "a" });
        d.eq("issue", d.r.issues().at(-1)?.code, "InvalidTurn");
        d.eq("no request", d.reqs("job").length, 0);
        d.eq("no row", d.r.row(R, "job", { n: 1 }), undefined);
        d.eq("no memory", d.mem().log, []);
      },
      // D46: a hook's throw disables that module with an issue; the core's own work stands. Pay does not use this module.
      module(c) {
        onWire(c);
        c.fault({ throwInModule: "ended" });
        c.answer("pay", { lost: true });
        c.state("UNSURE");
        c.send("Leave");
        c.state("LEFT");
        c.eq("issue", c.r.issues().at(-1)?.code, "ModuleDefect");
        c.namedIssues = ["ModuleDefect"];
        c.send("Start", CART);
        c.state("CARD");
      },
    },
  },
  {
    id: "PAY-12",
    kind: "fault",
    fixtures: CELLS,
    cites: ["rule:17", "D5", "D6", "F2", "S4"],
    variants: {
      defect(c) {
        onWire(c);
        c.answer("pay", { die: "boom" });
        c.state("UNSURE");
        c.eq("reason", c.lastEnding("pay")?.reason, "Defect");
        c.eq(
          "issue",
          c.r.issues().map((i) => i.code),
          ["Defect"],
        );
        c.namedIssues = ["Defect"];
      },
      sync(c) {
        c.ensure();
        c.fault({ syncAnswer: ["pay", req_cap] });
        start(c);
        pay(c);
        c.ack();
        c.state("PLACING");
        c.eq("endings", c.endings("pay").length, 1);
        const seqs = c.r.frames().map((f) => f.seq);
        c.eq(
          "frames in order",
          seqs,
          [...seqs].sort((a, b) => a - b),
        );
      },
      // Added: mutant cancelled-reads-interrupted survived. Flow's own cancel on the wire: rule 24, not `Interrupted`.
      "cancel-on-wire"(c) {
        onWire(c);
        c.send("AbortPay");
        c.state("UNSURE");
        c.eq("reason", c.lastEnding("pay")?.reason, "Cancelled");
        c.eq("uncertain", row(c)?.uncertain, true);
        const cells = c.r
          .evidence("lane")
          .filter((e) => e.op === "pay")
          .map((e) => e.cell);
        c.eq("cells", cells.slice(-2), ["lane.cancel.InFlight", "lane.interrupt.InFlight"]);
      },
      duplicate(c) {
        onWire(c);
        c.fault({ duplicateCompletion: "pay" });
        c.answer("pay", req_cap);
        c.state("PLACING");
        c.eq("endings", c.endings("pay").length, 1);
        c.eq("fence", c.r.evidence("fence").length, 1);
      },
      // H1: a plan survives to its tick. Asserted: injections land with a fiber live, and picks had a choice.
      shuffle(c) {
        const B = { actor: A.actor, id: "shopper-2" };
        const injects = [
          { send: A, event: "Leave", payload: {} },
          { send: A, event: "AbortPay", payload: {} },
        ];
        let withLive = 0;
        let withChoice = 0;
        let choices = 0;
        for (let seed = 1; seed <= 8; seed++)
          for (let tick = 0; tick <= 6; tick++)
            for (const inject of injects) {
              const d = new Ctx(c.fresh(CELLS));
              d.ensure();
              d.ensure(B);
              start(d);
              d.to(B, "Start", { cartId: "c2", intentId: "pi2" });
              pay(d);
              d.to(B, "PayRequested", { paymentMethodId: "visa" });
              d.fault({ schedulerShuffle: seed, atTick: tick, inject });
              d.ack(); // both commits start: two fibers, so a pick has a choice
              const o = d.r.outside();
              withLive += o.injections.withLive;
              withChoice += o.injections.withChoice;
              choices += o.scheduler.choices;
              d.tryAnswer("pay", req_cap);
              d.tryAnswer("pay", req_cap);
              checkEndings(d.r);
              d.eq(`seed ${seed} tick ${tick} ${inject.event}: replay`, d.r.replay().same, true);
            }
        c.yes("injections landed with a fiber live", withLive > 0);
        c.yes("injections landed with two tasks ready", withChoice > 0);
        c.yes("the shuffle had choices", choices > 0);
      },
    },
  },
  {
    id: "PAY-13",
    kind: "fault",
    fixtures: FIXTURES,
    cites: ["D6", "L5", "cell:lane.runtimeDisposal.InFlight"],
    variants: {
      "hung-commit"(c) {
        c.ensure();
        c.fault({ uninterruptibleHang: "pay" });
        start(c);
        pay(c);
        c.ack();
        c.do({ disposeRuntime: true });
        c.eq("not yet", c.r.evidence("Disposed").length, 0);
        c.advance(5000);
        c.eq("disposed", c.r.evidence("Disposed").length, 1);
        c.eq("abandoned", c.r.evidence("AbandonedFiber").length, 1);
        c.eq(
          "lane stored",
          [...c.r.stored().keys()].some((k) => k.startsWith("lane/")),
          true,
        );
        c.reload(); // next boot delivers Restored
        c.state("UNSURE");
        c.eq("reason", c.lastEnding("pay")?.reason, "Restored");
      },
      // Added: the never-sent half of the same cell. The final capture queues behind the held ack on the same key.
      "waiting-flushed"(c) {
        c.ensure();
        start(c);
        pay(c);
        c.do({ disposeRuntime: true });
        c.eq("disposed at once", c.r.evidence("Disposed").length, 1);
        c.ack();
        c.eq("requests", c.reqs("pay").length, 0);
        c.reload();
        c.state("CARD");
        c.eq("reason", c.lastEnding("pay")?.reason, "Disposed");
        c.eq("no send after boot", c.reqs("pay").length, 0);
      },
      // The table: "if the final capture fails, the last good capture's lane record restores per the restore row".
      "waiting-flush-lost"(c) {
        c.ensure();
        start(c);
        pay(c);
        c.do({ disposeRuntime: true });
        c.reload();
        c.state("CARD");
        // Round 7, the edge: nothing of it was on disk, so no `Restored`; the disposal's own ending is the last.
        c.eq("reason", c.lastEnding("pay")?.reason, "Disposed");
        c.eq("no send after boot", c.reqs("pay").length, 0);
      },
    },
  },
  {
    id: "PAY-14",
    kind: "example",
    fixtures: FIXTURES,
    cites: ["S11"],
    run(c) {
      reloadOnWire(c);
      c.eq("replay", c.r.replay().same, true);
      const seqs = c.r.frames().map((f) => f.seq);
      c.eq(
        "frames monotonic",
        seqs,
        [...new Set(seqs)].sort((a, b) => a - b),
      );
    },
  },
  // Added after the UNTESTED report: cells owed by round 1 that Pay can reach and no script named.
  {
    id: "PAY-15",
    kind: "example",
    fixtures: CELLS,
    pins: ["P4"],
    cites: [
      "cell:lane.commit.Held",
      "cell:lane.cancel.Idle",
      "cell:lane.cancel.InFlight",
      "cell:lane.idle.Idle",
      "cell:lane.failure.InFlight",
      "cell:lane.interrupt.InFlight",
      "cell:lane.restore.Held",
      "cell:lane.runtimeDisposal.Held",
      "cell:lane.retryable.Held",
    ],
    variants: {
      "press-pay-while-held"(c) {
        onWire(c);
        c.answer("pay", { lost: true });
        pay(c);
        c.state("PAYING"); // the machine moves: rule 16, a decline never refuses the transition
        c.eq("declined", c.lastEnding("pay")?.reason, "Rejected");
        c.eq("still held", row(c)?.uncertain, true);
        c.eq("nothing sent", c.reqs("pay").length, 1);
      },
      "cancel-idle"(c) {
        c.ensure();
        start(c);
        c.send("AbortPay");
        c.state("CARD");
        c.eq("nothing", c.r.evidence("Released").length, 0);
        c.eq("no evidence either: the cell is nothing", c.r.evidence("NothingToResend").length, 0);
      },
      "cancel-on-wire"(c) {
        onWire(c);
        c.send("AbortPay");
        c.state("UNSURE");
      },
      "busy-then-new-write"(c) {
        onWire(c);
        c.answer("pay", { fail: { tag: "Busy", retryAfterMs: 500 } });
        c.state("WAITING");
        c.eq("resolved", row(c), undefined);
        c.advance(500);
        c.state("PAYING");
        c.ack();
        c.eq("rule 19: a new id after a definite failure", c.keys("pay").length, 2);
      },
      "reload-holds-exactly-once"(c) {
        onWire(c);
        c.answer("pay", { lost: true });
        c.reload();
        c.state("UNSURE");
        c.eq("uncertain", row(c)?.uncertain, true);
        c.eq(
          "delivered once",
          c.endings("pay").filter((e) => e["reason"] === "Restored").length,
          1,
        );
        c.eq(
          "cell",
          c.r.evidence("lane").some((e) => e["cell"] === "lane.restore.Held"),
          true,
        );
      },
      "dispose-held"(c) {
        onWire(c);
        c.answer("pay", { lost: true });
        c.do({ disposeRuntime: true });
        c.eq("disposed", c.r.evidence("Disposed").length, 1);
        c.reload();
        c.state("UNSURE");
        c.eq("uncertain", row(c)?.uncertain, true);
      },
      // Added: mutant dead-timer-fires. PAYING's 8 s timer dies with PAYING; ticks are UNSURE's alone.
      "dead-activation-timer"(c) {
        onWire(c);
        c.advance(1000);
        c.answer("pay", { lost: true });
        c.state("UNSURE");
        c.advance(7500); // UNSURE ticks at 4000 and 7000 and 10000; PAYING's would have been at 8000
        c.eq("two ticks by 8500", c.reqs("intent").length, 2);
      },
      "retry-budget"(c) {
        onWire(c);
        c.answer("pay", { lost: true });
        for (let i = 1; i <= 3; i++) {
          c.advance(3000);
          c.answer("order", { ok: null });
          c.answer("intent", { ok: { status: "requires_payment_method" } });
          c.state("PAYING");
          c.ack();
          c.eq("retryCount", row(c)?.retryCount, i);
          c.answer("pay", { lost: true });
          c.state("UNSURE");
        }
        c.advance(3000);
        c.answer("order", { ok: null });
        c.answer("intent", { ok: { status: "requires_payment_method" } });
        c.state("UNSURE"); // retryable({ times: 3 }) denies; the last alternative keeps asking
        c.eq("four sends, one id", [c.reqs("pay").length, c.keys("pay").length], [4, 1]);
      },
    },
  },
  // One per mutant the independent review found surviving (review H2), and H3, H5, M3.
  {
    id: "PAY-16",
    kind: "fault",
    fixtures: CELLS,
    cites: [
      "D5",
      "rule:18",
      "D8",
      "cell:lane.storageRefused.InFlight",
      "rule:16",
      "D23",
      "rule:46",
      "D6",
      "rule:22",
      "rule:24",
      "sec:2.7.1",
    ],
    variants: {
      // rule 18 across a reload: a re-send's decline after a reload is StillUnknown, because the first send may have landed.
      "restore-keeps-mayHaveApplied"(c) {
        onWire(c);
        c.reload();
        c.state("UNSURE");
        c.advance(3000);
        c.answer("order", { ok: null });
        c.answer("intent", { ok: { status: "requires_payment_method" } });
        c.state("PAYING");
        c.ack();
        c.answer("pay", { fail: { tag: "CardDeclined", code: "x" } });
        c.eq("reason", c.lastEnding("pay")?.reason, "StillUnknown");
        c.state("UNSURE");
      },
      // D8 "per send": a hung re-send times out too.
      "timeout-per-send"(c) {
        toResend(c);
        c.answer("pay", { never: true });
        c.advance(59_999);
        c.state("PAYING");
        c.advance(1);
        c.state("UNSURE");
        c.eq("reason", c.lastEnding("pay")?.reason, "TimedOut");
      },
      // The re-send half of the storage row, and H3: after a refused capture the next retry still works.
      "resend-refused-capture"(c) {
        onWire(c);
        c.answer("pay", { lost: true });
        c.advance(3000);
        c.answer("order", { ok: null });
        c.answer("intent", { ok: { status: "requires_payment_method" } });
        c.state("PAYING");
        c.do({ storage: "refuse" });
        c.state("UNSURE");
        c.eq("reason", c.lastEnding("pay")?.reason, "StorageRefused");
        c.eq("held", row(c)?.uncertain, true);
        c.eq("no budget used", row(c)?.retryCount, 0);
        c.advance(3000);
        c.answer("order", { ok: null });
        c.answer("intent", { ok: { status: "requires_payment_method" } });
        c.state("PAYING");
        c.ack();
        c.eq("sent again", c.reqs("pay").length, 2);
        c.eq("same id", c.keys("pay").length, 1);
        c.answer("pay", req_cap);
        c.state("PLACING");
      },
      // rule 16 "delivered": the decline reaches the machine as an event, through a turn.
      "rejected-is-delivered"(c) {
        onWire(c);
        pay(c);
        const d = c.r.evidence("delivered").filter((e) => e["op"] === "pay");
        c.eq("delivered", d.at(-1)?.["event"], "PayNotSent");
        c.eq("guard kept it", c.r.evidence("turn").at(-1)?.["event"], "PayNotSent");
      },
      "retry-count-persists"(c) {
        toResend(c);
        c.answer("pay", { lost: true });
        c.eq("retryCount", row(c)?.retryCount, 1);
        c.reload();
        c.state("UNSURE");
        c.eq("kept", row(c)?.retryCount, 1);
      },
      // Disposal row: an ending that settles before the final capture is saved, then delivered once.
      "settled-during-disposal-parked"(c) {
        onWire(c);
        c.do({ disposeRuntime: true });
        c.eq("not yet", c.r.evidence("Disposed").length, 1); // an interruptible fetch ends at the interrupt
        c.reload();
        c.state("UNSURE");
        c.eq("parked and delivered", c.lastEnding("pay")?.reason, "Interrupted");
        c.eq("once", c.endings("pay").filter((e) => e["reason"] === "Interrupted").length, 1);
      },
      // D5: an older send's exit, while its own Attempt's re-send is on the wire, is stale.
      "stale-send-fenced"(c) {
        c.ensure();
        c.fault({ uninterruptibleHang: "pay" });
        start(c);
        pay(c);
        c.ack();
        c.advance(60_000); // timed out; the fiber cannot be interrupted, so its exit is still to come
        c.state("UNSURE");
        c.advance(3000);
        c.answer("order", { ok: null });
        c.answer("intent", { ok: { status: "requires_payment_method" } });
        c.ack();
        c.eq("re-sent", c.reqs("pay").length, 2);
        c.fault({ lateAnswer: ["pay", req_cap] }); // the first send's answer
        c.state("PAYING");
        c.eq("the re-send still pending", row(c)?.pending, true);
        c.yes(
          "fenced",
          c.r.evidence("fence").some((e) => e["send"] !== undefined),
        );
      },
      // A waiting re-send at disposal returns to Held: its Attempt was sent, so "Disposed" would be a lie.
      "dispose-waiting-resend"(c) {
        onWire(c);
        c.answer("pay", { lost: true });
        c.advance(3000);
        c.answer("order", { ok: null });
        c.answer("intent", { ok: { status: "requires_payment_method" } });
        c.do({ disposeRuntime: true }); // the capture is still out
        c.eq(
          "no Disposed ending",
          c.endings("pay").some((e) => e["reason"] === "Disposed"),
          false,
        );
      },
      // The parked ending is what is delivered, not a generic Restored (G3).
      "parked-success-is-delivered"(c) {
        // A settled ending in the mail when disposal starts. A drain budget below zero yields after every step, and the
        // fault lands disposal in that gap.
        const d = new Ctx(c.fresh(CELLS, { drainMs: -1 }));
        d.ensure();
        start(d);
        pay(d);
        d.ack();
        d.fault({ afterYield: { disposeRuntime: true } });
        d.answer("pay", req_cap);
        d.reload();
        d.yes(
          "it was parked",
          d.r.evidence("unparked").some((e) => e["op"] === "pay"),
        );
        d.state("PLACING");
        d.eq("no hold", row(d), undefined);
      },
      // D6: disposal finishes when the set empties, without waiting for the bound.
      "disposal-ends-with-the-last-fiber"(c) {
        c.ensure();
        c.fault({ uninterruptibleHang: "pay" });
        start(c);
        pay(c);
        c.ack();
        c.do({ disposeRuntime: true });
        c.eq("not yet", c.r.evidence("Disposed").length, 0);
        c.fault({ lateAnswer: ["pay", req_cap] });
        c.eq("finished when it ended", c.r.evidence("Disposed").length, 1);
        c.eq("no fiber abandoned", c.r.evidence("AbandonedFiber").length, 0);
      },
      // rule 22: a schedule's duration reads after memory.
      "schedule-reads-after-memory"(c) {
        onWire(c);
        c.answer("pay", { fail: { tag: "Busy", retryAfterMs: 500 } });
        c.state("WAITING");
        c.advance(499);
        c.state("WAITING");
        c.advance(1);
        c.state("PAYING");
      },
      // rule 24's reason belongs to one send: a later send's interruption is not Cancelled.
      "cancelled-does-not-stick"(c) {
        onWire(c);
        c.send("AbortPay");
        c.state("UNSURE");
        c.advance(3000);
        c.answer("order", { ok: null });
        c.answer("intent", { ok: { status: "requires_payment_method" } });
        c.state("PAYING");
        c.ack();
        c.do({ disposeRuntime: true }); // this send's interrupt is Flow's disposal, not the earlier cancel
        c.eq("reason", c.lastEnding("pay")?.reason, "Interrupted");
      },
      // 2.7.1: a read's defect is an actor issue.
      "read-defect-issue"(c) {
        onWire(c);
        c.answer("pay", { lost: true });
        c.advance(3000);
        c.answer("intent", { die: "boom" });
        c.eq(
          "issue",
          c.r.issues().map((i) => i.code),
          ["Defect"],
        );
        c.namedIssues = ["Defect"];
        c.eq("failure", c.lastEnding("intent")?.reason, "Defect");
      },
      // D23: a newer lookup ends the older one; its answer is dropped.
      "superseded-read"(c) {
        onWire(c);
        c.answer("pay", { lost: true });
        c.advance(3000);
        c.eq("first", c.reqs("intent").length, 1);
        c.advance(3000); // tick again before any answer: replace latest
        c.eq("second", c.reqs("intent").length, 2);
        c.eq(
          "older was interrupted",
          c.r.outside().open.filter((o) => o.op === "intent").length,
          1,
        );
        c.yes(
          "superseded evidence",
          c.r.evidence("Superseded").some((e) => e["op"] === "intent"),
        );
      },
    },
  },
  // D27 by input kind. A hook's throw never eats the core's work on any kind; a core throw is fatal.
  {
    id: "PAY-17",
    kind: "fault",
    fixtures: FIXTURES,
    cites: ["D46", "L5"],
    variants: {
      "hook-throws-on-sent"(c) {
        onWire(c);
        c.fault({ throwInModule: "ended" });
        c.answer("pay", req_cap);
        c.state("PLACING");
        c.eq("issue", c.r.issues().at(-1)?.code, "ModuleDefect");
        c.namedIssues = ["ModuleDefect"];
      },
      "hook-throws-on-timer"(c) {
        onWire(c);
        c.answer("pay", { never: true });
        c.fault({ throwInModule: "ended" });
        c.advance(60_000); // the op's timeout timer settles the Attempt, and `ended` throws in that step
        c.state("UNSURE");
        c.advance(3000);
        c.eq("reconcile asked", c.reqs("intent").length, 1);
        c.namedIssues = ["ModuleDefect"];
      },
      "hook-throws-on-acked"(c) {
        c.ensure();
        start(c);
        pay(c);
        c.fault({ throwInModule: "blocks" });
        c.ack();
        c.eq("sent", c.reqs("pay").length, 1);
        c.namedIssues = ["ModuleDefect"];
      },
      "hook-throws-on-turn"(c) {
        c.ensure();
        start(c);
        c.fault({ throwInModule: "prepare" });
        pay(c);
        c.state("PAYING");
        c.eq("the commit's cell stands", row(c)?.pending, true);
        c.namedIssues = ["ModuleDefect"];
      },
      "core-throw-is-fatal"(c) {
        c.namedIssues = ["Fatal"];
        onWire(c);
        c.fault({ throwInCore: true });
        c.answer("pay", req_cap); // this step's core code throws: the world freezes
        c.eq("issue", c.r.issues().at(-1)?.code, "Fatal");
        c.yes("fatal", c.r.quiet().fatal);
        c.send("Leave"); // dropped
        c.yes("dropped", c.r.evidence("dropped").length > 0);
        c.reload(); // a reload recovers, by the one restore path
        c.state("UNSURE");
        c.eq("reason", c.lastEnding("pay")?.reason, "Restored");
      },
    },
  },
  // M3 with D30: the shopper is never told "not charged" while the ack may have landed.
  {
    id: "PAY-18",
    kind: "fault",
    fixtures: FIXTURES,
    cites: ["D30", "S7", "rule:46"],
    run(c) {
      c.ensure();
      start(c);
      pay(c);
      c.do({ storage: "landNoAck" });
      c.advance(10_000);
      c.state("PAYING");
      c.eq("never told", c.mem().notice.includes("haven't been charged"), false);
      c.reload();
      c.state("UNSURE");
      c.eq("reason", c.lastEnding("pay")?.reason, "Restored");
    },
  },
  // P1 pinned: both orders of H4. Expected results are the bug. They will fight its fix.
  {
    id: "PAY-19",
    kind: "example",
    fixtures: FIXTURES,
    cites: ["rule:15", "rule:14"],
    pins: ["P1"],
    variants: {
      "void-answers-first"(c) {
        onWire(c);
        c.answer("pay", req_cap);
        c.ack();
        c.send("Leave");
        c.ack();
        c.answer("void", { ok: {} });
        c.answer("place", { ok: { orderId: "o1" } });
        c.state("PAID"); // an order with its authorization voided
        c.eq("both", [c.r.truth().placed, c.r.truth().voided], [1, 1]);
      },
      "place-answers-first"(c) {
        onWire(c);
        c.answer("pay", req_cap);
        c.ack();
        c.send("Leave");
        c.ack();
        c.answer("place", { ok: { orderId: "o1" } });
        c.state("LEFT");
        c.answer("void", { ok: {} });
        c.state("LEFT");
        c.eq("both", [c.r.truth().placed, c.r.truth().voided], [1, 1]);
        c.eq("no receipt", c.mem().receipt, null);
      },
    },
  },
  // D145: a server as strict as Stripe's. Each answer here is one the fake could not give before round 10.
  {
    id: "PAY-20",
    kind: "fault",
    fixtures: FIXTURES,
    cites: ["D145", "rule:19"],
    variants: {
      // assumptions #4. Round 9 sent no ServerError at all. It lands, answers 500, and the retry hears the same 500.
      // A machine that retried the same key on unknown would hear 500 for ever here. Pay reads the intent, as the server holds it, and goes on.
      "a-500-that-landed-is-unknown-and-pay-reads-the-intent"(c) {
        onWire(c);
        c.answer("pay", { applyFail: { tag: "ServerError" } });
        c.state("UNSURE");
        c.eq("unknown, not a failure", c.lastEnding("pay")?.["reason"] !== undefined || c.r.quiet().waits.some((w) => w.kind === "held"), true);
        c.eq("it was charged", c.r.truth().charges, 1);
        c.advance(3000);
        c.answer("order", { ok: null });
        c.answer("intent", { truth: true });
        c.state("PLACING");
        c.eq("no second pay", c.reqs("pay").length, 1);
        c.eq("once at the server", c.r.appliedTwice().length, 0);
      },
      // assumptions #2. A key the server has pruned is a new request, so a resend on it would charge twice, and Flow cannot see that. Pay does not resend before it has read the intent, so the hazard does not reach it.
      // Contract for authors (D145): a resend on an old key needs what the server holds first, as Pay does. Flow has no key age.
      "a-pruned-key-does-not-charge-twice-since-pay-reads-first"(c) {
        onWire(c);
        c.answer("pay", { applyLost: true });
        c.fault({ forgetKeys: true });
        c.advance(3000);
        c.answer("order", { ok: null });
        c.answer("intent", { truth: true });
        c.state("PLACING");
        c.eq("no second pay", c.reqs("pay").length, 1);
        c.eq("once at the server", c.r.appliedTwice().length, 0);
      },
    },
  },
];
