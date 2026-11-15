import { it } from "vite-plus/test";
import { play } from "../../harness/case.ts";
import { Pay } from "../../harness/fixture.ts";
import { shopper, start } from "../../harness/pay.ts";
import { Observation } from "../../harness/reports.ts";

const CAPTURE_MS = 5000;

it("ACT-01/free-actor-ends (Actors R8, Actors I10, Actors I37)", () =>
  play([Pay], (c) => {
    const s = shopper(c);
    s.ensure();
    start(s);
    c.advance(1000);

    const ended = () => c.reports().filter((o) => Observation.$is("Finished")(o)).length;

    c.expect("Actors I10", "an actor with a use does not end", ended(), 0);
    s.release("story");
    c.advance(1000);
    c.expect("Actors I37", "a free actor ends by the grace's end", ended(), 1);
    s.ensure();
    s.state("CARD");
  }));

it("ACT-02/dirty-record-written-at-end (Actors R8, Actors I12, Actors I37)", () =>
  play(
    [Pay],
    (c) => {
      const s = shopper(c);
      s.ensure();
      start(s);
      s.send("CardChosen", { paymentMethodId: "visa" });
      s.release("story");
      c.advance(1000);

      const ended = () => c.reports().filter((o) => Observation.$is("Finished")(o)).length;

      c.expect("Actors I37", "a free actor ends by the grace's end", ended(), 1);
    },
    CAPTURE_MS,
  ));

it("ACT-03/no-end-before-the-grace (Actors R8, Actors I10)", () =>
  play(
    [Pay],
    (c) => {
      const s = shopper(c);
      s.ensure();
      start(s);
      s.release("story");
      c.advance(50);

      const ended = () => c.reports().filter((o) => Observation.$is("Finished")(o)).length;

      c.expect("Actors I10", "no end before the grace has run", ended(), 0);
      c.advance(60);
      c.expect("Actors I37", "the end by the grace's end", ended(), 1);
    },
    CAPTURE_MS,
  ));
