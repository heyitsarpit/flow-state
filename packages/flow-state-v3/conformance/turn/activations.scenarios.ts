import type { Scenario } from "../dsl/case.ts";
import { LateQueue } from "../fixtures/one-lane.ts";
import { Answer } from "../world/network.ts";

const OK = Answer.Ok({ value: {} });

/**
 * The Activation cases (Turn R3, R20, R21), ported from the old suite's R14-FIX-01: `Go` re-enters
 * W, so a call the first W owns is late once W is re-entered.
 *
 * **Details**
 *
 * - `re-entry-makes-the-first-ending-late`: the first call's success is late (its W was re-entered,
 *   I5) and may not leave W, whose new Activation owns the queued commit (I27); the second call's
 *   success is current and leaves.
 * - `a-late-exit-with-nothing-queued-goes`: with W left for B and nothing queued, the late ending
 *   goes.
 */
export const activationsScenarios: ReadonlyArray<Scenario> = [
  {
    id: "TURN-04/re-entry-makes-the-first-ending-late",
    cites: ["Turn R3", "Turn R20", "Turn R21", "Turn I5", "Turn I27"],
    fixtures: [LateQueue],
    run: (c) => {
      const a = c.actor(LateQueue, "a");
      a.ensure();
      a.send("Go", {});
      c.ack();
      a.send("Go", {});
      c.ack();
      c.answer("charge", OK);
      c.eq(
        "Turn I5: the first W was re-entered, so its call's ending is late and may not leave the new W",
        c.denials().at(-1)?.includes("LateMayNotLeave"),
        true,
      );
      a.state("W");
      c.ack();
      c.eq("the queued commit is sent once the head ended", c.requests("charge").length, 2);
      c.answer("charge", OK);
      a.state("B");
    },
  },
  {
    id: "TURN-04/a-late-exit-with-nothing-queued-goes",
    cites: ["Turn R20", "Turn R21"],
    fixtures: [LateQueue],
    run: (c) => {
      const a = c.actor(LateQueue, "a");
      a.ensure();
      a.send("Go", {});
      a.send("Away", {});
      c.ack();
      c.answer("charge", Answer.Lost());
      c.eq("no denial", c.denials().length, 0);
      a.state("A");
    },
  },
];
