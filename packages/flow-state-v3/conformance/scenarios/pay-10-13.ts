import { Option } from "effect";
import { type Case, type Scenario, variants } from "../dsl/case.ts";
import { Answer } from "../world/network.ts";

const SHOPPER = { machine: "Checkout/Pay", id: "shopper-1" };
const KEY = { intentId: "pi1" };
const CART = { cartId: "c1", intentId: "pi1" };

const pay = (c: Case) => c.send("PayRequested", { paymentMethodId: "visa" });
const start = (c: Case) => c.send("Start", CART);

const row = (c: Case) => Option.getOrUndefined(c.row("pay", KEY));

const CAPTURABLE = Answer.Ok({ value: { status: "requires_capture", clientSecret: "" } });

const onWire = (c: Case) => {
  c.ensure();
  start(c);
  pay(c);
  c.ack();
};

/**
 * The Pay cases `PAY-10` and `PAY-12`, ported from the prototype suite with the same steps and
 * expectations; the variants that need slot or module faults, a raw runtime disposal or the
 * scheduler's shuffle are not here.
 */
export const pay1013Scenarios: ReadonlyArray<Scenario> = [
  ...variants(
    {
      id: "PAY-10",
      cites: ["WriteAhead R13", "WriteLanes R3"],
      fixtures: ["pay"],
      actor: SHOPPER,
    },
    {
      refuse: (c) => {
        c.ensure();
        start(c);
        pay(c);
        c.answerStorage("refuse", Option.none());
        c.eq("requests", c.requests("pay").length, 0);
        c.state("CARD");
        c.eq("evidence", c.evidence("StorageFailure"), 1);
      },
      hang: (c) => {
        c.ensure();
        start(c);
        pay(c);
        c.answerStorage("hang", Option.none());
        c.advance(9999);
        c.state("PAYING");
        c.advance(1);
        c.eq("requests", c.requests("pay").length, 0);
        c.state("PAYING");
        c.eq("pending", row(c)?.pending, true);
        c.eq("no refusal", c.evidence("StorageFailure"), 0);
        c.eq("evidence", c.evidence("StorageSilent"), 1);
        c.eq("notice", c.memory()["notice"], "Still confirming with your bank…");
      },
    },
  ),
  ...variants(
    {
      id: "PAY-12",
      cites: ["WriteLanes R2", "WriteLanes R14", "WriteLanes R10"],
      fixtures: ["cells"],
      actor: SHOPPER,
    },
    {
      defect: (c) => {
        onWire(c);
        c.answer("pay", Answer.Die({ message: "boom" }));
        c.state("UNSURE");
        c.eq("reason", c.endings("pay").at(-1)?.reason, "Defect");
        c.eq("issue", c.issues(), ["Defect"]);
      },
      sync: (c) => {
        c.ensure();
        c.answerAtOnce("pay", CAPTURABLE);
        start(c);
        pay(c);
        c.ack();
        c.state("PLACING");
        c.eq("endings", c.endings("pay").length, 1);
      },
      "cancel-on-wire": (c) => {
        onWire(c);
        c.send("AbortPay", {});
        c.state("UNSURE");
        c.eq("reason", c.endings("pay").at(-1)?.reason, "Cancelled");
        c.eq("uncertain", row(c)?.uncertain, true);
      },
    },
  ),
];
