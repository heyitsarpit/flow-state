import { Option } from "effect";
import type { Scenario } from "../dsl/case.ts";
import { Pay } from "../fixtures/pay.ts";
import {
  CAPTURABLE,
  KEY,
  onWire,
  pay,
  REREAD_MS,
  row,
  sent,
  shopper,
  start,
} from "../fixtures/pay-steps.ts";
import { Answer } from "../world/network.ts";

const LANDED = Answer.LostButLanded({ value: { status: "requires_capture", clientSecret: "" } });

const VOID_GAVE_UP =
  "We couldn't confirm the hold was released. Your bank releases it within 7 days.";

/**
 * Cases written for the convergence design's anchoring (`lane-oracle-convergence-v2-2026-11-11.md`,
 * T7 M1 and M2): each lane member names its own lane, and a guarded row is chosen by its guard.
 *
 * **Details**
 *
 * - `PAY-21`: two shoppers each hold a `pay`; the one whose intent read says captured cancels its
 *   own hold, and the other's stays Held (WriteLanes R9, I12).
 * - `PAY-22`: a `void` answered Lost four times is retried while `retryable({ times: 3 })` passes,
 *   then cancelled, so it is released only on the fourth `VoidUnsure` (WriteLanes R9, R14, I12).
 * - The design named them PAY-17 and PAY-18; those ids belong to ported cases.
 */
export const laneAnchorScenarios: ReadonlyArray<Scenario> = [
  {
    id: "PAY-21",
    cites: ["WriteLanes R9", "WriteLanes R14", "WriteLanes I10", "WriteLanes I12"],
    fixtures: [Pay],
    run: (c) => {
      const one = shopper(c);
      const two = c.actor(Pay, "shopper-2");

      for (const s of [one, two]) {
        s.ensure();
        start(s);
        pay(s);
      }

      c.ack();
      c.eq("both sent", sent(c, "pay"), 2);
      c.answer("pay", LANDED);
      c.answer("pay", LANDED);
      one.state("UNSURE");
      two.state("UNSURE");
      c.eq("one held", row(one)?.uncertain, true);
      c.eq("two held", row(two)?.uncertain, true);
      c.advance(REREAD_MS);
      c.answer("intent", Answer.Ok({ value: { status: "requires_capture" } }));
      one.state("PLACING");
      two.state("UNSURE");
      c.eq("one released", row(one), undefined);
      c.eq("two still held", row(two)?.uncertain, true);
      c.eq("one release", c.evidence("Released"), 1);
      c.eq("no re-send", sent(c, "pay"), 2);
    },
  },
  {
    id: "PAY-22",
    cites: ["WriteLanes R9", "WriteLanes R14", "WriteLanes I12"],
    fixtures: [Pay],
    run: (c) => {
      const s = shopper(c);
      onWire(c);
      s.send("Leave", {});
      s.state("LEFT");
      c.answer("pay", CAPTURABLE);
      s.state("LEFT");
      c.ack();

      for (const tries of [1, 2, 3]) {
        c.eq(`void sent ${tries}`, sent(c, "void"), tries);
        c.answer("void", Answer.Lost());
        c.eq(`retried ${tries}, still held`, Option.isSome(s.row("void", KEY)), true);
        c.eq(`no release ${tries}`, c.evidence("Released"), 0);
        c.ack();
      }

      c.eq("void sent 4", sent(c, "void"), 4);
      c.answer("void", Answer.Lost());
      s.state("LEFT");
      c.eq("released", s.row("void", KEY), Option.none());
      c.eq("one release", c.evidence("Released"), 1);
      c.eq("notice", s.memory().notice, VOID_GAVE_UP);
      c.eq("no fifth send", sent(c, "void"), 4);
    },
  },
];
