import type { Case, Scenario } from "../dsl/case.ts";
import { Pay } from "../fixtures/pay.ts";
import { CAPTURABLE, onWire, pay, shopper } from "../fixtures/pay-steps.ts";
import { Answer } from "../world/network.ts";
import { Observation } from "../port.ts";

/**
 * PAYING's `slow` schedule: "8 seconds", sending `CheckTick` (`prototypes/conformance/typed/pay.ts`).
 */
const SLOW_MS = 8000;

const ticks = (c: Case) =>
  c.reports().filter((o) => Observation.$is("Turn")(o) && o.event === "CheckTick").length;

/**
 * The schedule cases: when PAYING's `slow` schedule may fire.
 *
 * **Details**
 *
 * - `TURN-03/unused`: released while `pay` is on the wire, the actor lives on with no use, so the
 *   deadline waits (Turn R17); the returning use fires it once, overdue (R17, I22).
 * - `TURN-03/exited`: leaving PAYING stops its schedule (R14), so its deadline never fires (R15).
 * - `TURN-03/on-time`: it fires at 8 s and not before (R14, R15).
 * - `TURN-03/re-entered`: leaving PAYING and entering it again starts a new deadline; the first
 *   activation's never fires (R14, R15, I20).
 *
 * Expected results were drafted from the Specs before the cases ran (@task.V3.T8).
 */
export const schedulesScenarios: ReadonlyArray<Scenario> = [
  {
    id: "TURN-03/unused",
    cites: ["Turn R17", "Turn I22", "Turn I23"],
    fixtures: [Pay],
    run: (c) => {
      const s = shopper(c);
      onWire(c);
      s.release("story");
      c.advance(SLOW_MS + 1000);
      c.eq("Turn I23: no firing while unused", ticks(c), 0);
      c.eq("Turn I23: the notice is unchanged while unused", s.memory().notice, "");
      s.ensure();
      c.eq("Turn I22: the overdue deadline fires once on the returning use", ticks(c), 1);
      s.state("PAYING");
      c.eq("notice", s.memory().notice, "Still confirming with your bank…");
    },
  },
  {
    id: "TURN-03/exited",
    cites: ["Turn R14", "Turn R15"],
    fixtures: [Pay],
    run: (c) => {
      const s = shopper(c);
      onWire(c);
      c.answer("pay", CAPTURABLE);
      s.state("PLACING");
      c.advance(SLOW_MS + 1000);
      c.eq("no firing after the exit", ticks(c), 0);
      c.eq("notice", s.memory().notice, "");
    },
  },
  {
    id: "TURN-03/on-time",
    cites: ["Turn R14", "Turn R15"],
    fixtures: [Pay],
    run: (c) => {
      onWire(c);
      c.advance(SLOW_MS - 1);
      c.eq("not before its delay", ticks(c), 0);
      c.eq("Turn I21: no notice before its delay", shopper(c).memory().notice, "");
      c.advance(1);
      c.eq("once at its delay", ticks(c), 1);
      c.advance(SLOW_MS);
      c.eq("a Duration fires once", ticks(c), 1);
    },
  },
  {
    id: "TURN-03/re-entered",
    cites: ["Turn R14", "Turn R15", "Turn I20"],
    fixtures: [Pay],
    run: (c) => {
      const s = shopper(c);
      onWire(c);
      c.advance(SLOW_MS / 2);
      c.answer("pay", Answer.Fail({ tag: "CardDeclined", fields: { code: "card_declined" } }));
      s.state("CARD");
      pay(s);
      c.ack();
      s.state("PAYING");
      c.advance(SLOW_MS / 2 + 500);
      c.eq("Turn I20: the first activation's deadline never fires", s.memory().notice, "");
    },
  },
];
