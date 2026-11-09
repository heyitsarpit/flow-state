import { Effect } from "effect";
import type { Actor } from "../dsl/actor.ts";
import { Case, type Scenario } from "../dsl/case.ts";
import { Pay } from "../fixtures/pay.ts";
import { Answer } from "../world/network.ts";

const shoppers = Case.useSync((c) => ({
  c,
  a: c.actor(Pay, "shopper-1"),
  b: c.actor(Pay, "shopper-2"),
}));

const onWire = (c: typeof Case.Service, s: Actor<typeof Pay>, intentId: string) =>
  Effect.gen(function* () {
    yield* s.send("Start", { cartId: `cart-${intentId}`, intentId });
    yield* s.send("PayRequested", { paymentMethodId: "visa" });
    yield* c.ack;
  });

const restored = (c: typeof Case.Service) =>
  Effect.map(c.endings("pay"), (endings) => endings.filter((e) => e.reason === "Restored").length);

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
    run: Effect.gen(function* () {
      const { c, a } = yield* shoppers;
      yield* a.ensure;
      yield* onWire(c, a, "pi1");
      yield* a.send("Leave", {});
      yield* a.state("LEFT");
      yield* onWire(c, a, "pi2");
      yield* a.state("PAYING");
      yield* c.eq("two writes on the wire", (yield* c.requests("pay")).length, 2);
      yield* c.reload;
      yield* c.eq("both restored, once each", yield* restored(c), 2);
    }),
  },
  {
    id: "DLV-02",
    cites: ["WriteLanes R10", "WriteLanes I15", "Restore I6"],
    fixtures: [Pay],
    run: Effect.gen(function* () {
      const { c, a, b } = yield* shoppers;
      yield* a.ensure;
      yield* b.ensure;
      yield* onWire(c, a, "pi1");
      yield* onWire(c, b, "pi2");
      yield* c.reload;
      yield* c.eq("both restored, once each", yield* restored(c), 2);
      yield* a.state("UNSURE");
      yield* b.state("UNSURE");
    }),
  },
  {
    id: "DLV-03",
    cites: ["WriteLanes R10", "WriteLanes I15"],
    fixtures: [Pay],
    run: Effect.gen(function* () {
      const { c, a, b } = yield* shoppers;
      yield* a.ensure;
      yield* b.ensure;
      yield* onWire(c, a, "pi1");
      yield* c.answer(
        "pay",
        Answer.Fail({ tag: "CardDeclined", fields: { code: "card_declined" } }),
      );
      yield* a.state("CARD");
      yield* c.eq("notice", (yield* a.memory).notice, "Your card was declined (card_declined).");
      yield* b.state("IDLE");
    }),
  },
];
