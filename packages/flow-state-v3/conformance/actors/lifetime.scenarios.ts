import type { Scenario } from "../dsl/case.ts";
import { Pay } from "../fixtures/pay.ts";
import { shopper, start } from "../fixtures/pay-steps.ts";
import { Observation } from "../port.ts";

/**
 * An actor's end (Actors R8, I10, I37).
 *
 * **Details**
 *
 * - `ACT-01/free-actor-ends`: a shopper that started its cart holds no work at `CARD`, a leaf with
 *   no schedule. While the story uses it, the clock moving past the grace ends nothing (I10); once
 *   released, it ends by the grace's end (I37), and the next ensure opens a new incarnation.
 *
 * Expected results come from the cited Requirements and Invariants.
 */
export const lifetimeScenarios: ReadonlyArray<Scenario> = [
  {
    id: "ACT-01/free-actor-ends",
    cites: ["Actors R8", "Actors I10", "Actors I37"],
    fixtures: [Pay],
    run: (c) => {
      const s = shopper(c);
      s.ensure();
      start(s);
      c.advance(1000);

      const ended = () => c.reports().filter((o) => Observation.$is("Finished")(o)).length;

      c.eq("Actors I10: an actor with a use does not end", ended(), 0);
      s.release("story");
      c.advance(1000);
      c.eq("Actors I37: a free actor ends by the grace's end", ended(), 1);
      s.ensure();
      s.state("CARD");
    },
  },
];
