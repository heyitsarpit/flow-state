import type { Scenario } from "../dsl/case.ts";
import { coveredBy } from "../coverage.ts";
import { Form } from "../fixtures/form.ts";

/**
 * The part cases (Turn R2, R5, R6), ported from the old suite's FRAG-01 and FRAG-17 on `Form`.
 *
 * **Details**
 *
 * - `TURN-05/child-refusal`: a raise the child `check` denies refuses the whole turn, so the
 *   root's own patch is not published (I3).
 * - `TURN-05/removed-copy-ends-once`: a copy `SetIds` removes runs its `whenAbandoned` once, in
 *   that turn (I11).
 *
 * Expected results come from the cited Invariants' text.
 */
export const partsScenarios: ReadonlyArray<Scenario> = [
  {
    id: "TURN-05/child-refusal",
    cites: ["Turn R2", "Turn R5", "Turn I3"],
    fixtures: [Form],
    run: (c) => {
      const a = c.actor(Form, "a");
      a.ensure();
      a.send("RefuseChild", {});
      c.eq("Turn I3: a child's refusal refuses the whole turn", c.issues().at(-1), "InvalidTurn");
      c.eq(
        "Turn I3: a child's refusal publishes nothing of the parent's own",
        a.memory().moved,
        false,
      );
    },
  },
  {
    id: "TURN-05/removed-copy-ends-once",
    cites: ["Turn R6", "Turn I11"],
    fixtures: [Form],
    run: (c) => {
      const a = c.actor(Form, "a");
      a.ensure();
      a.send("SetIds", { ids: ["a", "b"] });
      a.send("SetIds", { ids: ["b"] });
      c.eq("Turn I11: the removed copy ran whenAbandoned once, in that turn", a.memory().goneRows, [
        "a",
      ]);
    },
  },
];

/**
 * The Invariants these cases check by their own expectations.
 */
export const partsCovered = coveredBy(partsScenarios).filter(
  (row) => row.invariant === "Turn I3" || row.invariant === "Turn I11",
);
