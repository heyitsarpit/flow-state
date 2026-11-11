import type { Actor } from "../dsl/actor.ts";
import { Observation } from "../port.ts";
import type { Case, Scenario } from "../dsl/case.ts";
import { Pay } from "../fixtures/pay.ts";
import { Answer } from "../world/network.ts";

const shoppers = (c: Case) => ({ a: c.actor(Pay, "shopper-1"), b: c.actor(Pay, "shopper-2") });

const onWire = (c: Case, s: Actor<typeof Pay>, intentId: string) => {
  s.send("Start", { cartId: `cart-${intentId}`, intentId });
  s.send("PayRequested", { paymentMethodId: "visa" });
  c.ack();
};

const tries = (c: Case, operation: string) =>
  c.reports().filter((o) => Observation.$is("Delivered")(o) && o.operation === operation).length;

const restored = (c: Case) => c.endings("pay").filter((e) => e.reason === "Restored").length;

/**
 * Cases built for the endings oracle: two endings owed to one actor, or to two actors, at once,
 * and a failure ending while another actor of the same machine lives. The endings' counts and
 * owners follow from the Specs (an Attempt on the wire at a kill restores as `unknown Restored`,
 * once, to its own actor); the states and notice come from the Pay fixture's mapping. `DLV-05`:
 * a twice-refused place success is kept and gets one try per boot (Actors R15, I24). `DLV-06`: that
 * kept ending holds its lane, so the next place commit declines `Rejected` (WriteLanes R6, I8).
 */
export const endingDeliveryScenarios: ReadonlyArray<Scenario> = [
  {
    id: "DLV-01",
    cites: ["WriteLanes R10", "WriteLanes I15", "Restore I6"],
    fixtures: [Pay],
    run: (c) => {
      const { a } = shoppers(c);
      a.ensure();
      onWire(c, a, "pi1");
      a.send("Leave", {});
      a.state("LEFT");
      onWire(c, a, "pi2");
      a.state("PAYING");
      c.eq("two writes on the wire", c.requests("pay").length, 2);
      c.reload();
      c.eq("both restored, once each", restored(c), 2);
    },
  },
  {
    id: "DLV-02",
    cites: ["WriteLanes R10", "WriteLanes I15", "Restore I6"],
    fixtures: [Pay],
    run: (c) => {
      const { a, b } = shoppers(c);
      a.ensure();
      b.ensure();
      onWire(c, a, "pi1");
      onWire(c, b, "pi2");
      c.reload();
      c.eq("both restored, once each", restored(c), 2);
      a.state("UNSURE");
      b.state("UNSURE");
    },
  },
  {
    id: "DLV-03",
    cites: ["WriteLanes R10", "WriteLanes I15"],
    fixtures: [Pay],
    run: (c) => {
      const { a, b } = shoppers(c);
      a.ensure();
      b.ensure();
      onWire(c, a, "pi1");
      c.answer("pay", Answer.Fail({ tag: "CardDeclined", fields: { code: "card_declined" } }));
      a.state("CARD");
      c.eq("notice", a.memory().notice, "Your card was declined (card_declined).");
      b.state("IDLE");
    },
  },
  {
    id: "DLV-04",
    cites: ["WriteLanes R10", "WriteLanes I15", "Actors R15", "Actors I24"],
    fixtures: [Pay],
    run: (c) => {
      const { a } = shoppers(c);
      a.ensure();
      onWire(c, a, "pi1");
      c.answer("pay", Answer.Ok({ value: { status: "requires_capture", clientSecret: "" } }));
      a.state("PLACING");
      c.ack();
      c.eq("place sent", c.requests("place").length, 1);
      c.answer("place", Answer.Ok({ value: null }));
      a.state("PLACING");
      c.eq("no receipt", a.memory().receipt, null);
      c.eq("refusals are issues", c.issues().includes("InvalidTurn"), true);
      c.eq("place not sent again", c.requests("place").length, 1);
      c.reload();
      a.state("PLACING");
      c.eq("still no receipt", a.memory().receipt, null);
      c.eq("place not sent at the boot", c.requests("place").length, 1);
    },
  },
  {
    id: "DLV-05",
    cites: ["Actors R15", "Actors I24", "WriteLanes R10", "WriteLanes I15"],
    fixtures: [Pay],
    run: (c) => {
      const { a } = shoppers(c);
      a.ensure();
      onWire(c, a, "pi1");
      c.answer("pay", Answer.Ok({ value: { status: "requires_capture", clientSecret: "" } }));
      c.ack();
      c.answer("place", Answer.Ok({ value: null }));
      c.eq("delivered, then once more after a refusal", tries(c, "place"), 2);
      c.reload();
      c.eq("one try at the boot", tries(c, "place"), 3);
      c.reload();
      c.eq("one try at the next boot", tries(c, "place"), 4);
      c.eq("still no receipt", a.memory().receipt, null);
    },
  },
  {
    id: "DLV-06",
    cites: ["WriteLanes R6", "WriteLanes I8", "Actors R15"],
    fixtures: [Pay],
    run: (c) => {
      const { a } = shoppers(c);
      a.ensure();
      onWire(c, a, "pi1");
      c.answer("pay", Answer.Ok({ value: { status: "requires_capture", clientSecret: "" } }));
      c.ack();
      c.answer("place", Answer.Ok({ value: null }));
      c.eq("kept after two refusals", tries(c, "place"), 2);
      a.send("Leave", {});
      a.state("LEFT");
      a.send("Start", { cartId: "cart-pi1", intentId: "pi2" });
      a.state("CARD");
      a.send("PayRequested", { paymentMethodId: "visa" });
      a.state("PAYING");
      c.ack();
      c.ack();
      c.eq("second pay sent", c.requests("pay").length, 2);
      c.answer("pay", Answer.Ok({ value: { status: "requires_capture", clientSecret: "" } }));
      c.ack();
      c.eq("WriteLanes I8: the kept ending holds its lane", c.requests("place").length, 1);
      c.eq(
        "WriteLanes R6: the next place declines Rejected",
        c.endings("place").at(-1)?.reason,
        "Rejected",
      );
    },
  },
];
