import { describe, it } from "vite-plus/test";
import { play } from "../../harness/case.ts";
import { Cells, Pay } from "../../harness/fixture.ts";
import {
  CART,
  cells,
  lastReason,
  onWire,
  pay,
  reloadOnWire,
  REREAD_MS,
  row,
  sent,
  shopper,
} from "../../harness/pay.ts";
import { Answer } from "../../harness/world/network.ts";

it("PAY-14 (Restore R3, WriteLanes R10)", () => play([Pay], reloadOnWire));

describe("PAY-15 (WriteLanes R2, WriteLanes R5, WriteLanes R7, WriteLanes R8, Restore R3)", () => {
  it("PAY-15/press-pay-while-held", () =>
    play([Pay], (c) => {
      const s = shopper(c);
      onWire(c);
      c.answer("pay", Answer.Lost());
      pay(s);
      s.state("PAYING");
      c.eq("declined", lastReason(c, "pay"), "Rejected");
      c.eq("still held", row(s)?.uncertain, true);
      c.eq("nothing sent", sent(c, "pay"), 1);
    }));

  it("PAY-15/busy-then-new-write", () =>
    play([Pay], (c) => {
      const s = shopper(c);
      onWire(c);
      c.answer("pay", Answer.Fail({ tag: "Busy", fields: { retryAfterMs: 500 } }));
      s.state("WAITING");
      c.eq("resolved", row(s), undefined);
      c.advance(500);
      s.state("PAYING");
      c.ack();
      c.eq("rule 19: a new id after a definite failure", c.keys("pay").length, 2);
    }));

  it("PAY-15/reload-holds-exactly-once", () =>
    play([Pay], (c) => {
      const s = shopper(c);
      onWire(c);
      c.answer("pay", Answer.Lost());
      c.reload();
      s.state("UNSURE");
      c.eq("uncertain", row(s)?.uncertain, true);
      c.eq("delivered once", c.endings("pay").filter((e) => e.reason === "Restored").length, 1);
    }));

  it("PAY-15/dead-activation-timer", () =>
    play([Pay], (c) => {
      const s = shopper(c);
      onWire(c);
      c.advance(1000);
      c.answer("pay", Answer.Lost());
      s.state("UNSURE");
      c.advance(7500);
      c.eq("two ticks by 8500", sent(c, "intent"), 2);
    }));

  it("PAY-15/retry-budget", () =>
    play([Pay], (c) => {
      const s = shopper(c);
      onWire(c);
      c.answer("pay", Answer.Lost());

      for (let i = 1; i <= 3; i++) {
        c.advance(REREAD_MS);
        c.answer("order", Answer.Ok({ value: null }));
        c.answer("intent", Answer.Ok({ value: { status: "requires_payment_method" } }));
        s.state("PAYING");
        c.ack();
        c.eq("retryCount", row(s)?.retryCount, i);
        c.answer("pay", Answer.Lost());
        s.state("UNSURE");
      }

      c.advance(REREAD_MS);
      c.answer("order", Answer.Ok({ value: null }));
      c.answer("intent", Answer.Ok({ value: { status: "requires_payment_method" } }));
      s.state("UNSURE");
      c.eq("four sends, one id", [sent(c, "pay"), c.keys("pay").length], [4, 1]);
    }));
});

describe("PAY-15 on Cells (WriteLanes R14)", () => {
  it("PAY-15/cancel-idle", () =>
    play([Cells], (c) => {
      const s = cells(c);
      s.ensure();
      s.send("Start", CART);
      s.send("AbortPay", {});
      s.state("CARD");
      c.eq("nothing", c.evidence("Released"), 0);
      c.eq("no evidence either: the cell is nothing", c.evidence("NothingToResend"), 0);
    }));

  it("PAY-15/cancel-on-wire", () =>
    play([Cells], (c) => {
      const s = cells(c);
      s.ensure();
      s.send("Start", CART);
      s.send("PayRequested", { paymentMethodId: "visa" });
      c.ack();
      s.send("AbortPay", {});
      s.state("UNSURE");
    }));
});
