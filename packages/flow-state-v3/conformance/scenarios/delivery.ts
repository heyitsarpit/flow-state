import { Option } from "effect";
import type { Case, Scenario } from "../dsl/case.ts";
import { Answer } from "../world/network.ts";

const A = { machine: "Checkout/Pay", id: "shopper-1" };
const B = { machine: "Checkout/Pay", id: "shopper-2" };

const onWire = (c: Case, shopper: typeof A, intentId: string) => {
  c.to(shopper, "Start", { cartId: `cart-${intentId}`, intentId });
  c.to(shopper, "PayRequested", { paymentMethodId: "visa" });
  c.ack();
};

const restored = (c: Case) => c.endings("pay").filter((e) => e.reason === "Restored").length;

/**
 * Cases built for the ending ledger: two endings owed to one actor, or to two actors, at once,
 * and a failure ending while another actor of the same machine lives. Each expectation follows
 * from the Specs alone: an Attempt on the wire at a kill restores as `unknown Restored`, once,
 * to its own actor.
 */
export const deliveryScenarios: ReadonlyArray<Scenario> = [
  {
    id: "DLV-01",
    cites: ["WriteLanes R10", "WriteLanes I15", "Restore I6"],
    fixtures: ["pay"],
    actor: A,
    run: (c) => {
      c.ensure();
      onWire(c, A, "pi1");
      c.send("Leave", {});
      c.state("LEFT");
      onWire(c, A, "pi2");
      c.state("PAYING");
      c.eq("two writes on the wire", c.requests("pay").length, 2);
      c.reload();
      c.eq("both restored, once each", restored(c), 2);
    },
  },
  {
    id: "DLV-02",
    cites: ["WriteLanes R10", "WriteLanes I15", "Restore I6"],
    fixtures: ["pay"],
    actor: A,
    run: (c) => {
      c.ensure();
      c.ensureOf(B, Option.none());
      onWire(c, A, "pi1");
      onWire(c, B, "pi2");
      c.reload();
      c.eq("both restored, once each", restored(c), 2);
      c.stateOf(A, "UNSURE");
      c.stateOf(B, "UNSURE");
    },
  },
  {
    id: "DLV-03",
    cites: ["WriteLanes R10", "WriteLanes I15"],
    fixtures: ["pay"],
    actor: A,
    run: (c) => {
      c.ensure();
      c.ensureOf(B, Option.none());
      onWire(c, A, "pi1");
      c.answer("pay", Answer.Fail({ tag: "CardDeclined", fields: { code: "card_declined" } }));
      c.stateOf(A, "CARD");
      c.eq("notice", c.memory()["notice"], "Your card was declined (card_declined).");
      c.stateOf(B, "IDLE");
    },
  },
];
