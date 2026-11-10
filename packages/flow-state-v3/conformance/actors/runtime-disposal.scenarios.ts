import { type Scenario, variants } from "../dsl/case.ts";
import { disposalBoundMs } from "../dsl/oracle.ts";
import { Cells, Pay } from "../fixtures/pay.ts";
import { Answer } from "../world/network.ts";
import {
  CAPTURABLE,
  cells,
  lastReason,
  onWire,
  pay,
  row,
  sent,
  shopper,
  start,
} from "../fixtures/pay-steps.ts";

/**
 * The Pay cases that dispose the Runtime: `PAY-13`, `PAY-15/dispose-held` and the disposal
 * variants of `PAY-16`, with the prototype suite's steps.
 *
 * **Details**
 *
 * - The Port shows no abandoned fiber, stored lane or parked count; those assertions are not here.
 *   A parked ending shows as the ending the next boot delivers in its place (WriteAhead R14).
 * - `waiting-flushed` asserts the disposal ended once the pending write was answered (Actors R23:
 *   disposal waits for the final write), not at once as the prototype case did.
 * - `PAY-16/parked-success-is-delivered` is not here: it needs a yield fault the Port lacks.
 * - `PAY-15/dispose-held` runs on `cells`; the `PAY-16` variants on `pay`, whose steps do not use
 *   `cells`' `AbortPay`.
 */
export const runtimeDisposalScenarios: ReadonlyArray<Scenario> = [
  ...variants(
    {
      id: "PAY-13",
      cites: ["Actors R22", "Actors R23", "Actors I29", "Actors I30", "WriteAhead R14"],
      fixtures: [Pay],
    },
    {
      "hung-commit": (c) => {
        const s = shopper(c);
        s.ensure();
        c.uninterruptible("pay");
        start(s);
        pay(s);
        c.ack();
        c.disposeRuntime();
        c.eq("not yet", c.runtimeDisposals(), 0);
        c.advance(disposalBoundMs);
        c.eq("disposed", c.runtimeDisposals(), 1);
        c.reload();
        s.state("UNSURE");
        c.eq("reason", lastReason(c, "pay"), "Disposed");
      },
      "waiting-flushed": (c) => {
        const s = shopper(c);
        s.ensure();
        start(s);
        pay(s);
        c.disposeRuntime();
        c.ack();
        c.eq("disposed once the last write is answered", c.runtimeDisposals(), 1);
        c.eq("requests", sent(c, "pay"), 0);
        c.reload();
        s.state("CARD");
        c.eq("reason", lastReason(c, "pay"), "Disposed");
        c.eq("no send after boot", sent(c, "pay"), 0);
      },
      "waiting-flush-lost": (c) => {
        const s = shopper(c);
        s.ensure();
        start(s);
        pay(s);
        c.disposeRuntime();
        c.reload();
        s.state("CARD");
        c.eq("nothing on disk, so no Restored after it", lastReason(c, "pay"), "Disposed");
        c.eq("no send after boot", sent(c, "pay"), 0);
      },
    },
  ),
  {
    id: "PAY-15/dispose-held",
    cites: ["Actors R22", "Actors I29"],
    fixtures: [Cells],
    run: (c) => {
      const s = cells(c);
      s.ensure();
      start(s);
      pay(s);
      c.ack();
      c.answer("pay", Answer.Lost());
      c.disposeRuntime();
      c.eq("disposed", c.runtimeDisposals(), 1);
      c.reload();
      s.state("UNSURE");
      c.eq("uncertain", row(s)?.uncertain, true);
    },
  },
  ...variants(
    {
      id: "PAY-16",
      cites: ["Actors R22", "Actors I29", "Actors I30", "Actors I31", "WriteAhead R14"],
      fixtures: [Pay],
    },
    {
      "settled-during-disposal-parked": (c) => {
        const s = shopper(c);
        onWire(c);
        c.disposeRuntime();
        c.eq("not yet: the commit may settle", c.runtimeDisposals(), 0);
        c.answer("pay", CAPTURABLE);
        c.eq("disposed once the wire is empty", c.runtimeDisposals(), 1);
        c.eq("its own ending", c.endings("pay").at(-1)?.channel, "success");
        c.reload();
        s.state("PLACING");
        c.eq(
          "no Restored: the parked ending is delivered",
          c.endings("pay").some((e) => e.reason === "Restored"),
          false,
        );
        c.eq("a definite ending drops the head", row(s), undefined);
      },
      "on-the-wire-at-the-bound-ends-unknown-disposed": (c) => {
        const s = shopper(c);
        onWire(c);
        c.disposeRuntime();
        c.advance(disposalBoundMs - 1);
        c.eq("within the bound", c.runtimeDisposals(), 0);
        c.advance(1);
        c.eq("the bound ends it", c.runtimeDisposals(), 1);
        c.eq(
          "unknown { Disposed }",
          [c.endings("pay").at(-1)?.channel, lastReason(c, "pay")],
          ["unknown", "Disposed"],
        );
        c.reload();
        s.state("UNSURE");
        c.eq(
          "no Restored: the parked ending is delivered",
          c.endings("pay").some((e) => e.reason === "Restored"),
          false,
        );
      },
      "dispose-waiting-resend": (c) => {
        onWire(c);
        c.answer("pay", Answer.Lost());
        c.advance(3000);
        c.answer("order", Answer.Ok({ value: null }));
        c.answer("intent", Answer.Ok({ value: { status: "requires_payment_method" } }));
        c.disposeRuntime();
        c.eq(
          "no Disposed ending",
          c.endings("pay").some((e) => e.reason === "Disposed"),
          false,
        );
      },
      "disposal-ends-with-the-last-fiber": (c) => {
        const s = shopper(c);
        s.ensure();
        c.uninterruptible("pay");
        start(s);
        pay(s);
        c.ack();
        c.disposeRuntime();
        c.eq("not yet", c.runtimeDisposals(), 0);
        c.answerLate("pay", CAPTURABLE);
        c.eq("finished when it ended", c.runtimeDisposals(), 1);
      },
    },
  ),
];
