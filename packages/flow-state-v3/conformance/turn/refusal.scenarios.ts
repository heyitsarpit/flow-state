import { type Scenario, variants } from "../dsl/case.ts";
import { Pay } from "../fixtures/pay.ts";
import { Answer } from "../world/network.ts";
import { CAPTURABLE, CART, onWire, sent, shopper, start } from "../fixtures/pay-steps.ts";

/**
 * The refusal cases: a rejected turn and an unhandled event leave the actor as it was.
 *
 * **Details**
 *
 * - `TURN-01/schedule-refused`: a `Busy` answer with a negative delay makes WAITING's `retry`
 *   schedule invalid, so the turn that enters WAITING is rejected whole (Turn R8, @plan.Machines O3
 *   "an invalid duration rejects the whole turn"), and redelivered once (WriteLanes R10).
 * - `TURN-01/mapper-refused`: `place` answered with no order makes the `Placed` mapper throw at
 *   admission, which refuses the turn; the ending is redelivered once and refused again
 *   (WriteLanes R10).
 * - `TURN-02`: an event no state handles is Unhandled and changes nothing (Turn R9).
 *
 * Expected results were drafted from the Specs before the cases ran (STATUS.md, T8 refusal).
 * Any refused turn's ending is redelivered once and a second refusal is final (WriteLanes R10,
 * Actors R15; @plan.Pending D4), so both variants expect two `InvalidTurn` issues.
 */
/**
 * Turn I17's case: the runner replays seed 1 of every case and compares the reports; TURN-02
 * carries the citation and the mutant.
 */
export const refusalCovered = [{ invariant: "Turn I17" as const, cases: ["TURN-02"] }];

export const refusalScenarios: ReadonlyArray<Scenario> = [
  ...variants(
    { id: "TURN-01", cites: ["Turn R8", "Turn R10", "WriteLanes R10"], fixtures: [Pay] },
    {
      "schedule-refused": (c) => {
        const s = shopper(c);
        onWire(c);
        const before = s.memory();
        c.answer("pay", Answer.Fail({ tag: "Busy", fields: { retryAfterMs: -1 } }));
        s.state("PAYING");
        c.eq("memory unchanged", s.memory(), before);
        c.eq("refused, then refused again on its one redelivery", c.issues(), [
          "InvalidTurn",
          "InvalidTurn",
        ]);
        c.eq("no new request", sent(c, "pay"), 1);
      },
      "mapper-refused": (c) => {
        const s = shopper(c);
        onWire(c);
        c.answer("pay", CAPTURABLE);
        s.state("PLACING");
        c.ack();
        const before = s.memory();
        c.answer("place", Answer.Ok({ value: null }));
        s.state("PLACING");
        c.eq("memory unchanged", s.memory(), before);
        c.eq("refused, then refused again on its one redelivery", c.issues(), [
          "InvalidTurn",
          "InvalidTurn",
        ]);
        c.eq("no new request", sent(c, "place"), 1);
      },
    },
  ),
  {
    id: "TURN-02",
    cites: ["Turn R2", "Turn R9", "Turn I17"],
    fixtures: [Pay],
    run: (c) => {
      const s = shopper(c);
      s.ensure();
      start(s);
      s.state("CARD");
      const before = s.memory();
      s.send("Done", {});
      s.state("CARD");
      c.eq("memory unchanged", s.memory(), before);
      c.eq("no issue", c.issues(), []);
      c.eq("cart kept", s.memory().cartId, CART.cartId);
    },
  },
];
