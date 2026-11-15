import { describe, it } from "vite-plus/test";
import { play } from "../../harness/case.ts";
import { Pay } from "../../harness/fixture.ts";
import {
  CAPTURABLE,
  CART,
  lastReason,
  onWire,
  pay,
  REREAD_MS,
  row,
  sent,
  shopper,
  toResend,
} from "../../harness/pay.ts";
import { Observation } from "../../harness/reports.ts";
import { Answer } from "../../harness/world/network.ts";

describe("payment endings", () => {
  it("PAY-01 (WriteLanes R2, WriteLanes R5, WriteLanes R8, WriteAhead R4)", () =>
    play([Pay], (c) => {
      const s = shopper(c);
      s.ensure();
      s.send("Start", CART);
      s.state("CARD");
      pay(s);
      s.state("PAYING");
      c.eq("pending", row(s)?.pending, true);
      c.eq("no send before ack", sent(c, "pay"), 0);
      c.ack();
      c.eq("sent", sent(c, "pay"), 1);
      c.answer("pay", CAPTURABLE);
      s.state("PLACING");
      c.eq("lane gone", row(s), undefined);
      c.eq("place waits", sent(c, "place"), 0);
      c.ack();
      c.eq("place sent", sent(c, "place"), 1);
      c.answer("place", Answer.Ok({ value: { orderId: "o1" } }));
      s.state("PAID");
      c.eq("receipt", s.memory().receipt, {
        orderId: "o1",
        afterUnsure: false,
        alreadyPlaced: false,
      });
      c.eq("charges", c.landed("pay"), 1);
    }));

  it("PAY-02 (WriteLanes R7, WriteLanes R3)", () =>
    play([Pay], (c) => {
      const s = shopper(c);
      onWire(c);
      pay(s);
      s.state("PAYING");
      c.eq("requests", sent(c, "pay"), 1);
      c.eq("notice", s.memory().notice, "");
      c.eq("decline ending", lastReason(c, "pay"), "Rejected");
      c.answer("pay", Answer.Fail({ tag: "CardDeclined", fields: { code: "card_declined" } }));
      s.state("CARD");
      c.expect("WriteLanes I8", "nothing waited behind the head", row(s), undefined);
    }));

  it("PAY-03 (WriteLanes R14, WriteLanes R8)", () =>
    play([Pay], (c) => {
      const s = shopper(c);
      onWire(c);
      c.answer(
        "pay",
        Answer.LostButLanded({ value: { status: "requires_capture", clientSecret: "" } }),
      );
      s.state("UNSURE");
      c.eq("uncertain", row(s)?.uncertain, true);
      c.eq("afterUnsure", s.memory().afterUnsure, true);
      c.eq("charges", c.landed("pay"), 1);
      c.advance(REREAD_MS);
      c.eq("intent read", sent(c, "intent"), 1);
      c.eq("order read", sent(c, "order"), 1);
      c.answer("intent", Answer.Ok({ value: { status: "requires_capture" } }));
      s.state("PLACING");
      c.eq("released", row(s), undefined);
      c.eq("evidence", c.evidence("Released"), 1);
      c.eq("no re-send", sent(c, "pay"), 1);
      c.answer("order", Answer.Ok({ value: null }));
      s.state("PLACING");
      c.ack();
      c.answer("place", Answer.Ok({ value: { orderId: "o1" } }));
      s.state("PAID");
      c.eq("afterUnsure receipt", s.memory().receipt, {
        orderId: "o1",
        afterUnsure: true,
        alreadyPlaced: false,
      });
      c.eq("charges", c.landed("pay"), 1);
    }));

  it("PAY-04 (WriteLanes R8, WriteLanes R5)", () =>
    play([Pay], (c) => {
      const s = shopper(c);
      toResend(c);
      c.eq("retryCount", row(s)?.retryCount, 1);
      c.answer("pay", CAPTURABLE);
      s.state("PLACING");
      c.eq("charges", c.landed("pay"), 1);
      c.eq("distinct keys", c.keys("pay").length, 1);
      c.eq("afterUnsure", s.memory().afterUnsure, true);
    }));

  it("PAY-05 (WriteLanes R2)", () =>
    play([Pay], (c) => {
      const s = shopper(c);
      toResend(c);
      const notice = s.memory().notice;
      c.answer("pay", Answer.Fail({ tag: "CardDeclined", fields: { code: "card_declined" } }));
      s.state("UNSURE");
      c.eq("uncertain", row(s)?.uncertain, true);
      c.eq("reason", lastReason(c, "pay"), "StillUnknown");
      c.eq("notice unchanged", s.memory().notice, notice);
    }));

  it("PAY-05/held-head-sleeps-at-boot (WriteAhead I24, Restore I1)", () =>
    play([Pay], (c) => {
      const s = shopper(c);
      toResend(c);
      c.answer("pay", Answer.Fail({ tag: "CardDeclined", fields: { code: "card_declined" } }));
      s.state("UNSURE");
      s.release("story");
      c.advance(10_000);
      c.ack();
      const before = c.reports().length;
      c.reload();
      c.expect(
        "WriteAhead I24",
        "a head saved Held has inFlight false, so the boot wakes no one",
        c.reports().slice(before).filter(Observation.$is("Incarnated")).length,
        0,
      );
    }));

  it("PAY-23 (Turn R2, WriteLanes R8)", () =>
    play([Pay], (c) => {
      const s = shopper(c);
      onWire(c);
      c.answer("pay", Answer.Lost());
      s.state("UNSURE");
      c.advance(REREAD_MS);
      c.answer("order", Answer.Ok({ value: null }));
      const before = s.memory();
      c.answer("intent", Answer.Ok({ value: { status: "requires_action" } }));
      s.state("UNSURE");
      c.eq("no alternative wrote memory", s.memory(), before);
      c.eq("a challenge needs a client secret: the hold stays", row(s)?.uncertain, true);
      c.eq("not sent again", sent(c, "pay"), 1);
    }));
});
