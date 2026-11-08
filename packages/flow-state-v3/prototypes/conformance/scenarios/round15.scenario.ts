// Round 15: the design rulings the runtime still owed (OD48, and the round 14 runner ruling on rule 15). Every expectation is the design's text,
// worked out by hand before the runtime was changed; each variant names its rule.
import { R15LateId, r15LateFixture } from "../typed/round15.ts";
import { Ctx, type Scenario } from "./ctx.ts";

const RL = { actor: R15LateId, id: "a" };
const denials = (c: Ctx) => c.r.evidence("Denied").map((e) => e["reasons"]);

export const round15Scenarios: readonly Scenario[] = [
  {
    id: "R15-01",
    kind: "fault",
    fixtures: [r15LateFixture()],
    actor: RL,
    cites: ["rule:15", "rule:43"],
    variants: {
      // Rule 15's cancel exemption (the round 14 runner ruling): a late transition that cancels the lane (key-less) exempts that lane's queued
      // commits and its never-sent head promoted at settlement. The late success settles the first head; the second commit, queued by the re-entered
      // W, is promoted before the late turn runs; the late Ok cancels the lane and leaves W.
      "a-late-exit-that-cancels-the-lane-may-leave-its-promoted-head"(c0) {
        const c = new Ctx(c0.fresh([r15LateFixture()]), RL);
        c.ensure(RL);
        c.send("Go");
        c.ack();
        c.send("Go");
        c.send("Cancelling");
        c.answer("charge", { ok: {} });
        c.eq("no denial", denials(c), []);
        c.state("A");
      },
      // The control: the same walk without the cancel. The promoted head is live work owned by the exited activation, so the late turn is denied.
      "a-late-exit-that-does-not-cancel-may-not-leave-its-promoted-head"(c0) {
        const c = new Ctx(c0.fresh([r15LateFixture()]), RL);
        c.ensure(RL);
        c.send("Go");
        c.ack();
        c.send("Go");
        c.answer("charge", { ok: {} });
        c.eq("denied", (denials(c).at(-1) as string[] | undefined)?.includes("LateMayNotLeave"), true);
        c.state("W");
      },
    },
  },
];
