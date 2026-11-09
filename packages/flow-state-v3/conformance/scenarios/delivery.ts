import type { Actor } from "../dsl/actor.ts";
import type { Case, Scenario } from "../dsl/case.ts";
import { Pay } from "../fixtures/pay.ts";
import { Answer } from "../world/network.ts";

const shoppers = (c: Case) => ({ a: c.actor(Pay, "shopper-1"), b: c.actor(Pay, "shopper-2") });

const onWire = (c: Case, s: Actor<typeof Pay>, intentId: string) => {
  s.send("Start", { cartId: `cart-${intentId}`, intentId });
  s.send("PayRequested", { paymentMethodId: "visa" });
  c.ack();
};

const restored = (c: Case) => c.endings("pay").filter((e) => e.reason === "Restored").length;

/**
 * Cases built for the ending ledger: two endings owed to one actor, or to two actors, at once,
 * and a failure ending while another actor of the same machine lives. The endings' counts and
 * owners follow from the Specs (an Attempt on the wire at a kill restores as `unknown Restored`,
 * once, to its own actor); the states and notice come from the Pay fixture's mapping.
 */
export const deliveryScenarios: ReadonlyArray<Scenario> = [
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
];
