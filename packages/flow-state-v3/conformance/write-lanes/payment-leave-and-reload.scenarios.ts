import { Option } from "effect";
import type { Actor } from "../dsl/actor.ts";
import { type Case, type Scenario, variants } from "../dsl/case.ts";
import { Pay } from "../fixtures/pay.ts";
import { Answer } from "../world/network.ts";

const KEY = { intentId: "pi1" };
const CART = { cartId: "c1", intentId: "pi1" };
const CAPTURABLE = Answer.Ok({ value: { status: "requires_capture", clientSecret: "" } });

type Shopper = Actor<typeof Pay>;

const shopper = (c: Case) => c.actor(Pay, "shopper-1");

const pay = (s: Shopper) => s.send("PayRequested", { paymentMethodId: "visa" });
const start = (s: Shopper) => s.send("Start", CART);

const onWire = (c: Case) => {
  const s = shopper(c);
  s.ensure();
  start(s);
  pay(s);
  c.ack();
};

const row = (s: Shopper) => Option.getOrUndefined(s.row("pay", KEY));

const lastReason = (c: Case, operation: string) => c.endings(operation).at(-1)?.reason;

const sent = (c: Case, operation: string) => c.requests(operation).length;

const reloadOnWire = (c: Case) => {
  const s = shopper(c);
  onWire(c);
  c.reload();
  s.state("UNSURE");
  c.eq("uncertain", row(s)?.uncertain, true);
  c.eq("reason", lastReason(c, "pay"), "Restored");
  c.eq("requests", sent(c, "pay"), 1);
  c.answerLate("pay", CAPTURABLE);
  c.advance(3000);
  c.answer("order", Answer.Ok({ value: null }));
  c.answer("intent", Answer.Ok({ value: { status: "requires_capture" } }));
  s.state("PLACING");
  c.ack();
  c.answer("place", Answer.Ok({ value: { orderId: "o1" } }));
  s.state("PAID");
  c.eq("charges", c.landed("pay"), 1);
};

/**
 * The Pay cases `PAY-06` to `PAY-09`, ported from the prototype suite with the same steps and
 * expectations.
 */
export const paymentLeaveAndReloadScenarios: ReadonlyArray<Scenario> = [
  ...variants(
    {
      id: "PAY-06",
      cites: ["WriteLanes R2", "WriteLanes R8", "WriteLanes R10"],
      fixtures: [Pay],
    },
    {
      interruptible: (c) => {
        const s = shopper(c);
        onWire(c);
        c.answer("pay", Answer.Never());
        c.advance(8000);
        s.state("PAYING");
        c.eq("notice", s.memory().notice, "Still confirming with your bank…");
        c.eq("pending", row(s)?.pending, true);
        c.advance(52000);
        s.state("UNSURE");
        c.eq("uncertain", row(s)?.uncertain, true);
        c.eq("an unknown", c.endings("pay").at(-1)?.channel, "unknown");
        c.answerLate("pay", CAPTURABLE);
        s.state("UNSURE");
        c.eq("uncertain", row(s)?.uncertain, true);
        c.eq("charges", c.landed("pay"), 1);
        c.eq("one ending", c.endings("pay").length, 1);
      },
      uninterruptible: (c) => {
        const s = shopper(c);
        s.ensure();
        c.uninterruptible("pay");
        start(s);
        pay(s);
        c.ack();
        c.advance(60000);
        s.state("UNSURE");
        c.answerLate("pay", CAPTURABLE);
        s.state("UNSURE");
        c.eq("one ending", c.endings("pay").length, 1);
      },
    },
  ),
  ...variants(
    {
      id: "PAY-07",
      cites: ["WriteLanes R16", "WriteLanes R7"],
      fixtures: [Pay],
    },
    {
      leaveMidCharge: (c) => {
        const s = shopper(c);
        onWire(c);
        s.send("Leave", {});
        s.state("LEFT");
        c.eq("still pending", row(s)?.pending, true);
        c.answer("pay", CAPTURABLE);
        s.state("LEFT");
        c.ack();
        c.eq("void sent", sent(c, "void"), 1);
        c.answer("void", Answer.Ok({ value: {} }));
        s.state("LEFT");
        c.eq("notice", s.memory().notice, "The hold on your card was released.");
        c.eq("authorized", s.memory().authorized, false);
      },
      "late-in-a-new-PAYING": (c) => {
        const s = shopper(c);
        onWire(c);
        s.send("Leave", {});
        start(s);
        pay(s);
        s.state("PAYING");
        c.answer("pay", CAPTURABLE);
        s.state("PAYING");
        c.eq("lane gone", row(s), undefined);
        c.eq("charges", c.landed("pay"), 1);
      },
      "late-may-not-leave": (c) => {
        const s = shopper(c);
        onWire(c);
        c.answer("pay", CAPTURABLE);
        c.ack();
        s.send("Leave", {});
        start(s);
        pay(s);
        c.ack();
        c.answer("place", Answer.Ok({ value: { orderId: "o1" } }));
        s.state("PAYING");
        c.eq("denied", c.denials().at(-1), ["LateMayNotLeave"]);
      },
    },
  ),
  ...variants(
    {
      id: "PAY-08",
      cites: ["Restore R1", "Restore R2", "WriteLanes R8"],
      fixtures: [Pay],
    },
    {
      reloadDuringCharge: reloadOnWire,
      "reload-while-reconciling": (c) => {
        const s = shopper(c);
        onWire(c);
        c.answer("pay", Answer.Lost());
        c.advance(1000);
        c.reload();
        s.state("UNSURE");
        c.eq("uncertain", row(s)?.uncertain, true);
        c.advance(1999);
        c.eq("not yet", sent(c, "intent"), 0);
        c.advance(1);
        c.eq("the saved timer fired at its saved time", sent(c, "intent"), 1);
      },
    },
  ),
  ...variants(
    {
      id: "PAY-09",
      cites: ["WriteAhead R10", "Restore R1"],
      fixtures: [Pay],
    },
    {
      "ack-not-stored": (c) => {
        const s = shopper(c);
        s.ensure();
        start(s);
        pay(s);
        c.reload();
        c.eq("requests", sent(c, "pay"), 0);
        s.state("CARD");
        c.eq("no notice: the click is gone with its process", s.memory().notice, "");
        c.eq("charges", c.landed("pay"), 0);
        c.eq("row", row(s), undefined);
      },
      "ack-stored-confirmation-lost": (c) => {
        const s = shopper(c);
        s.ensure();
        start(s);
        pay(s);
        c.answerStorage("landNoAck");
        c.reload();
        c.eq("requests", sent(c, "pay"), 0);
        s.state("UNSURE");
        c.eq("reason", lastReason(c, "pay"), "Restored");
        c.eq("uncertain", row(s)?.uncertain, true);
      },
    },
  ),
];
