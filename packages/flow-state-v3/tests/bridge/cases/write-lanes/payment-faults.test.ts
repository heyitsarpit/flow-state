import { describe, it } from "vite-plus/test";
import { play } from "../../harness/case.ts";
import { Cells, Pay } from "../../harness/fixture.ts";
import {
  CAPTURABLE,
  cells,
  lastReason,
  onWire,
  pay,
  row,
  sent,
  shopper,
  start,
} from "../../harness/pay.ts";
import { Answer } from "../../harness/world/network.ts";

describe("PAY-10 (WriteAhead R13, WriteLanes R3)", () => {
  it("PAY-10/refuse", () =>
    play([Pay], (c) => {
      const s = shopper(c);
      s.ensure();
      start(s);
      pay(s);
      c.answerStorage("refuse");
      c.eq("requests", sent(c, "pay"), 0);
      s.state("CARD");
      c.eq("evidence", c.evidence("StorageFailure"), 1);
    }));

  it("PAY-10/hang", () =>
    play([Pay], (c) => {
      const s = shopper(c);
      s.ensure();
      start(s);
      pay(s);
      c.answerStorage("hang");
      c.advance(9999);
      s.state("PAYING");
      c.advance(1);
      c.eq("requests", sent(c, "pay"), 0);
      s.state("PAYING");
      c.eq("pending", row(s)?.pending, true);
      c.eq("no refusal", c.evidence("StorageFailure"), 0);
      c.eq("evidence", c.evidence("StorageSilent"), 1);
      c.eq("notice", s.memory().notice, "Still confirming with your bank…");
    }));
});

describe("PAY-12 (WriteLanes R2, WriteLanes R14, WriteLanes R10)", () => {
  it("PAY-12/defect", () =>
    play([Cells], (c) => {
      const s = cells(c);
      onWire(c, "cells");
      c.answer("pay", Answer.Die({ message: "boom" }));
      s.state("UNSURE");
      c.eq("reason", lastReason(c, "pay"), "Defect");
      c.eq("issue", c.issues(), ["Defect"]);
    }));

  it("PAY-12/sync", () =>
    play([Cells], (c) => {
      const s = cells(c);
      s.ensure();
      c.answerAtOnce("pay", CAPTURABLE);
      start(s);
      pay(s);
      c.ack();
      s.state("PLACING");
      c.eq("endings", c.endings("pay").length, 1);
    }));

  it("PAY-12/cancel-on-wire", () =>
    play([Cells], (c) => {
      const s = cells(c);
      onWire(c, "cells");
      s.send("AbortPay", {});
      s.state("UNSURE");
      c.eq("reason", lastReason(c, "pay"), "Cancelled");
      c.eq("uncertain", row(s)?.uncertain, true);
    }));
});
