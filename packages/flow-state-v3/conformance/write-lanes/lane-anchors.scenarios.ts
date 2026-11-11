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
 * - `PAY-21`: two shoppers each hold a `pay` on their own intent; the one whose intent read says
 *   captured cancels its own hold, and the other's stays Held (WriteLanes R9, R14, I10, I12). Each
 *   request is answered by its input, so no order of the two rereads is assumed.
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
      const other = { cartId: "c2", intentId: "pi2" };
      const twoRow = () => Option.getOrUndefined(two.row("pay", { intentId: other.intentId }));

      one.ensure();
      start(one);
      pay(one);
      two.ensure();
      two.send("Start", other);
      pay(two);
      c.ack();
      c.eq("both sent", sent(c, "pay"), 2);
      c.answerTo("pay", KEY, LANDED);
      c.answerTo("pay", { intentId: other.intentId }, LANDED);
      one.state("UNSURE");
      two.state("UNSURE");
      c.eq("one held", row(one)?.uncertain, true);
      c.eq("two held", twoRow()?.uncertain, true);
      c.advance(REREAD_MS);
      c.answerTo("intent", KEY, Answer.Ok({ value: { status: "requires_capture" } }));
      one.state("PLACING");
      two.state("UNSURE");
      c.eq("one released", row(one), undefined);
      c.eq("two still held", twoRow()?.uncertain, true);
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
