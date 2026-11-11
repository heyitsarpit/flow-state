import { type Scenario, variants } from "../dsl/case.ts";
import { Cells, Pay } from "../fixtures/pay.ts";
import { Answer } from "../world/network.ts";
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
} from "../fixtures/pay-steps.ts";

/**
 * The Pay cases `PAY-10` and `PAY-12`, ported from the prototype suite with the same steps and
 * expectations; the variants that need slot or module faults or the scheduler's shuffle are not
 * here, and `PAY-13` (Runtime disposal) is in `actors/runtime-disposal.scenarios.ts`.
 */
export const paymentFaultsScenarios: ReadonlyArray<Scenario> = [
  ...variants(
    {
      id: "PAY-10",
      cites: ["WriteAhead R13", "WriteLanes R3"],
      fixtures: [Pay],
    },
    {
      refuse: (c) => {
        const s = shopper(c);
        s.ensure();
        start(s);
        pay(s);
        c.answerStorage("refuse");
        c.eq("requests", sent(c, "pay"), 0);
        s.state("CARD");
        c.eq("evidence", c.evidence("StorageFailure"), 1);
      },
      hang: (c) => {
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
      },
    },
  ),
  ...variants(
    {
      id: "PAY-12",
      cites: ["WriteLanes R2", "WriteLanes R14", "WriteLanes R10"],
      fixtures: [Cells],
    },
    {
      defect: (c) => {
        const s = cells(c);
        onWire(c, "cells");
        c.answer("pay", Answer.Die({ message: "boom" }));
        s.state("UNSURE");
        c.eq("reason", lastReason(c, "pay"), "Defect");
        c.eq("issue", c.issues(), ["Defect"]);
      },
      sync: (c) => {
        const s = cells(c);
        s.ensure();
        c.answerAtOnce("pay", CAPTURABLE);
        start(s);
        pay(s);
        c.ack();
        s.state("PLACING");
        c.eq("endings", c.endings("pay").length, 1);
      },
      "cancel-on-wire": (c) => {
        const s = cells(c);
        onWire(c, "cells");
        s.send("AbortPay", {});
        s.state("UNSURE");
        c.eq("reason", lastReason(c, "pay"), "Cancelled");
        c.eq("uncertain", row(s)?.uncertain, true);
      },
    },
  ),
];
