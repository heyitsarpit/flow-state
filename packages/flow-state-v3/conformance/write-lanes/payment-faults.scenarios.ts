import { Option } from "effect";
import type { Actor } from "../dsl/actor.ts";
import { type Case, type Scenario, variants } from "../dsl/case.ts";
import { Cells, Pay } from "../fixtures/pay.ts";
import { Answer } from "../world/network.ts";

const KEY = { intentId: "pi1" };
const CART = { cartId: "c1", intentId: "pi1" };
const CAPTURABLE = Answer.Ok({ value: { status: "requires_capture", clientSecret: "" } });

type Shopper = Actor<typeof Pay>;

const shopper = (c: Case) => c.actor(Pay, "shopper-1");
const cells = (c: Case) => c.actor(Cells, "shopper-1");

const pay = (s: Shopper) => s.send("PayRequested", { paymentMethodId: "visa" });
const start = (s: Shopper) => s.send("Start", CART);

const row = (s: Shopper) => Option.getOrUndefined(s.row("pay", KEY));

const lastReason = (c: Case, operation: string) => c.endings(operation).at(-1)?.reason;

const sent = (c: Case, operation: string) => c.requests(operation).length;

const onWire = (c: Case) => {
  const s = cells(c);
  s.ensure();
  start(s);
  pay(s);
  c.ack();
};

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
        onWire(c);
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
        onWire(c);
        s.send("AbortPay", {});
        s.state("UNSURE");
        c.eq("reason", lastReason(c, "pay"), "Cancelled");
        c.eq("uncertain", row(s)?.uncertain, true);
      },
    },
  ),
];
