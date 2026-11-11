import { Option } from "effect";
import type { Actor } from "../dsl/actor.ts";
import type { Case, Scenario } from "../dsl/case.ts";
import { disposalBoundMs } from "../dsl/oracle.ts";
import { Serialize } from "../fixtures/one-lane.ts";
import { Pay } from "../fixtures/pay.ts";
import { Answer } from "../world/network.ts";

const KEY = { intentId: "pi1" };

type Shopper = Actor<typeof Pay>;

const held = (c: Case) => {
  const s = c.actor(Pay, "shopper-1");
  s.ensure();
  s.send("Start", { cartId: "c1", intentId: "pi1" });
  s.send("PayRequested", { paymentMethodId: "visa" });
  c.ack();
  c.answer("pay", Answer.Lost());

  return s;
};

const uncertain = (s: Shopper) => Option.getOrUndefined(s.row("pay", KEY))?.uncertain;

/**
 * Cases where a lane outlives its actor or its Runtime: an actor released or disposed with a Held
 * head, and a Runtime disposed with a queue behind a head on the wire.
 *
 * **Details**
 *
 * - `DISP-01` releases the only use of an actor whose `pay` is Held and lets a second pass, past
 *   any grace; the end of the case attaches every actor that minted a write, so the `disposal`
 *   oracle sees the lane after the reload.
 * - `DISP-02` disposes the actor and ensures it again: the unbound lane binds to the new
 *   incarnation, which hears its unknown, and the row still reads uncertain.
 * - `DISP-03` disposes the Runtime with `put` on the wire and one commit queued behind it, past
 *   the bound: the queued commit's NotSent { Disposed } is delivered before the head's unknown.
 * - `DISP-04` disposes the Runtime while Pay's reads are open: nothing is invoked after, read or
 *   write.
 * - `DISP-06` disposes the actor with `pay` on the wire; the answer lands, parks on the lane for
 *   the identity, and the next ensure hears it.
 * - `DISP-07` moves an actor with no write, lands its record and reloads: it resumes that state.
 * - `DISP-05` forgets the identity, reloads and ensures it again: forget drops no hold, so the
 *   lane, unbound across the boot, binds to the fresh actor, which hears its unknown.
 */
export const laneKeepingScenarios: ReadonlyArray<Scenario> = [
  {
    id: "DISP-01",
    cites: ["WriteLanes R8", "WriteLanes I12", "Actors R22", "Actors I29"],
    fixtures: [Pay],
    run: (c) => {
      const s = held(c);
      s.state("UNSURE");
      s.release("story");
      c.advance(1000);
      c.eq("WriteLanes I12: the hold outlives its grace", uncertain(s), true);
    },
  },
  {
    id: "DISP-02",
    cites: ["Actors R20", "Actors I29", "Restore I6"],
    fixtures: [Pay],
    run: (c) => {
      const s = held(c);
      s.dispose();
      s.ensure();
      c.eq("the adopted lane is still Held", uncertain(s), true);
      c.eq("a Held head is not sent again on adoption", c.requests("pay").length, 1);
    },
  },
  {
    id: "DISP-03",
    cites: ["Actors R22", "Actors I31", "Actors I35"],
    fixtures: [Serialize],
    run: (c) => {
      const a = c.actor(Serialize, "a");
      a.ensure();
      a.send("Go", { n: 1 });
      c.ack();
      a.send("Go", { n: 2 });
      c.disposeRuntime();
      c.advance(disposalBoundMs);
      c.eq(
        "the queued commit ends NotSent Disposed, the head unknown Disposed at the bound",
        c
          .endings("put")
          .map((e) => `${e.channel} ${e.reason}`)
          .toSorted(),
        ["failure Disposed", "unknown Disposed"],
      );
      c.reload();
    },
  },
  {
    id: "DISP-04",
    cites: ["Actors R22", "Actors I30"],
    fixtures: [Pay],
    run: (c) => {
      held(c);
      c.advance(3000);
      c.eq("a read is open when the disposal begins", c.requests("order").length, 1);
      c.disposeRuntime();
      c.eq("no read after the disposal began", c.requests("order").length, 1);
    },
  },
  {
    id: "DISP-05",
    cites: ["Actors R21", "Actors I32", "Restore I6"],
    fixtures: [Pay],
    run: (c) => {
      const s = held(c);
      s.forget();
      c.reload();
      s.ensure();
      c.eq("the adopted lane is still Held", uncertain(s), true);
      c.eq("a Held head is not sent again on adoption", c.requests("pay").length, 1);
    },
  },
  {
    id: "DISP-06",
    cites: ["Actors R20", "WriteLanes R10", "WriteLanes I15"],
    fixtures: [Pay],
    run: (c) => {
      const s = c.actor(Pay, "shopper-1");
      s.ensure();
      s.send("Start", { cartId: "c1", intentId: "pi1" });
      s.send("PayRequested", { paymentMethodId: "visa" });
      c.ack();
      s.dispose();
      c.answer("pay", Answer.Ok({ value: { status: "requires_capture", clientSecret: "" } }));
      s.ensure();
      c.eq("the parked success reached the adopting actor", s.memory().authorized, true);
    },
  },
  {
    id: "DISP-07",
    cites: ["Restore R1", "Restore I1"],
    fixtures: [Pay],
    run: (c) => {
      const s = c.actor(Pay, "shopper-1");
      s.ensure();
      s.send("Start", { cartId: "c1", intentId: "pi1" });
      s.state("CARD");
      c.ack();
      c.reload();
      s.ensure();
      s.state("CARD");
    },
  },
];
