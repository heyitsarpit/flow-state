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
      // U13 (OD48; 2.7.13's Runtime-disposal row, 2.7.1): an Attempt still on the wire past Runtime O6's bound ends unknown { Disposed }; each W
      // entry ends NotSent { Disposed } when the bound ends, after the head, so the lane's parked endings keep lane order. For a persisted
      // identity both are pending mapped outcomes, delivered to the restored incarnation: no unknown { Restored }.
      "past-the-disposal-bound-the-attempt-ends-unknown-disposed"(c0) {
        const c = new Ctx(c0.fresh([r15LateFixture()]), RL);
        c.ensure(RL);
        c.send("Go");
        c.ack();
        c.send("Go");
        c.do({ disposeRuntime: true });
        c.advance(4_999);
        c.eq("within the bound nothing ends", c.endings("charge").length, 0);
        c.advance(1);
        c.eq("the bound ends the head unknown { Disposed }, then W", c.endings("charge").map((e) => [e["channel"], e["reason"]]), [["unknown", "Disposed"], ["failure", "Disposed"]]);
        const before = c.r.evidence("turn").length;
        c.reload();
        c.eq("the restored incarnation hears both, head first", c.r.evidence("turn").slice(before).map((t) => t["event"]), ["Unsure", "No"]);
        c.eq("no Restored", c.endings("charge").some((e) => e["reason"] === "Restored"), false);
      },
      // U14 (OD48; 2.7.13): an unbound lane record left by `disposeActor` ends when an ensure of the identity adopts it; until then Inspection
      // lists it as unbound under the identity, and each boot reports it, as OldVersionLane does for an old-version hold.
      "an-unbound-lane-left-by-dispose-is-listed-and-reported-until-adopted"(c0) {
        const c = new Ctx(c0.fresh([r15LateFixture()]), RL);
        c.ensure(RL);
        c.send("Go");
        c.ack();
        c.answer("charge", { lost: true });
        c.state("A");
        c.dispose();
        const unbound = () => c.r.inspect(RL)?.unbound ?? [];
        c.eq("listed as unbound under the identity", unbound().length, 1);
        c.reload();
        c.eq("the boot reports it", c.r.evidence("UnboundLane").map((e) => e["op"]), ["charge"]);
        c.eq("still listed", unbound().length, 1);
        c.ensure(RL);
        c.eq("adopted: no longer unbound", unbound(), []);
        c.reload();
        c.eq("no boot reports it now", c.r.evidence("UnboundLane").length, 1);
      },
    },
  },
];
