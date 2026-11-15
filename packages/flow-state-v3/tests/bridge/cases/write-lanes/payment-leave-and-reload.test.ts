import { describe, it } from "vite-plus/test";
import { play } from "../../harness/case.ts";
import { Pay } from "../../harness/fixture.ts";
import {
  CAPTURABLE,
  lastReason,
  onWire,
  pay,
  reloadOnWire,
  row,
  sent,
  shopper,
  start,
} from "../../harness/pay.ts";
import { Answer } from "../../harness/world/network.ts";

describe("PAY-06 (WriteLanes R2, WriteLanes R8, WriteLanes R10)", () => {
  it("PAY-06/interruptible", () =>
    play([Pay], (c) => {
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
    }));

  it("PAY-06/uninterruptible", () =>
    play([Pay], (c) => {
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
    }));
});

describe("PAY-07 (WriteLanes R16, WriteLanes R7)", () => {
  it("PAY-07/leaveMidCharge", () =>
    play([Pay], (c) => {
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
    }));

  it("PAY-07/late-in-a-new-PAYING", () =>
    play([Pay], (c) => {
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
    }));

  it("PAY-07/late-may-not-leave", () =>
    play([Pay], (c) => {
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
    }));
});

describe("PAY-08 (Restore R1, Restore R2, WriteLanes R8)", () => {
  it("PAY-08/reloadDuringCharge", () => play([Pay], reloadOnWire));

  it("PAY-08/reload-while-reconciling", () =>
    play([Pay], (c) => {
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
    }));
});

describe("PAY-09 (WriteAhead R10, Restore R1)", () => {
  it("PAY-09/ack-not-stored", () =>
    play([Pay], (c) => {
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
    }));

  it("PAY-09/ack-stored-confirmation-lost", () =>
    play([Pay], (c) => {
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
    }));
});
