// Round 15: the design rulings the runtime still owed (OD48, and the round 14 runner ruling on rule 15). Every expectation is the design's text,
// worked out by hand before the runtime was changed; each variant names its rule.
import type { Release } from "../fixtures/round6.compiled.ts";
import { keyStampFixture } from "../typed/round13.ts";
import { preVersionStampFixture, R15LateId, R15StayId, r15LateFixture, r15StayFixture } from "../typed/round15.ts";
import { Ctx, type Scenario } from "./ctx.ts";

const RL = { actor: R15LateId, id: "a" };
const KS = { actor: "Lab/KeyStamp", id: "a" };
const RS = { actor: R15StayId, id: "a" };
const denials = (c: Ctx) => c.r.evidence("Denied").map((e) => e["reasons"]);
const keyHoldThen = (c0: Ctx, to: number) => {
  const rel: Release = { v: 1 };
  const c = new Ctx(c0.fresh([keyStampFixture(rel)], { captureMs: 0 }), KS);
  c.ensure(KS);
  c.send("Go", { k: "a" });
  c.ack();
  c.answer("charge", { lost: true });
  c.h.release(() => void (rel.v = to), () => void (rel.v = 1));
  c.reload();
  return c;
};

export const round15Scenarios: readonly Scenario[] = [
  {
    id: "R15-01",
    kind: "fault",
    fixtures: [r15LateFixture(), r15StayFixture(), keyStampFixture({ v: 1 })],
    actor: RL,
    cites: ["rule:15", "rule:43"],
    variants: {
      // Rule 15 and 1.6 ("a late ending never leaves live work"), as ruled for round 15 (R1: no cancel exemption). The late success settles the
      // first head; the second commit, queued by the re-entered W, is promoted before the late turn runs. The late Ok's alternative that cancels the
      // lane and leaves W is denied all the same: the promoted head is live work of the exited activation.
      "a-late-exit-that-cancels-the-lane-may-not-leave-its-promoted-head"(c0) {
        const c = new Ctx(c0.fresh([r15LateFixture()]), RL);
        c.ensure(RL);
        c.send("Go");
        c.ack();
        c.send("Go");
        c.send("Cancelling");
        c.answer("charge", { ok: {} });
        c.eq("denied", (denials(c).at(-1) as string[] | undefined)?.includes("LateMayNotLeave"), true);
        c.state("W");
      },
      // R1's pattern: to give the work up, the late handler cancels in an alternative that stays put (key-less on an unkeyed op names its one lane,
      // rule 43 as ruled, R2). The first cancel releases the late unknown's own hold, which promotes the queued commit; the second cancels that
      // never-sent head, which ends NotSent { Cancelled } as a current ending (its owner, the re-entered W, is current), and its handler moves.
      "a-stay-put-alternative-gives-up-the-work-and-the-current-ending-moves"(c0) {
        const c = new Ctx(c0.fresh([r15StayFixture()]), RS);
        c.ensure(RS);
        c.send("Go");
        c.ack();
        c.send("Go");
        c.answer("charge", { lost: true });
        c.ack();
        c.eq("no denial", denials(c), []);
        c.eq("the promoted head ends NotSent { Cancelled }, never sent", [c.endings("charge").map((e) => [e["channel"], e["reason"]]).at(-1), c.reqs("charge").length], [["failure", "Cancelled"], 1]);
        c.state("A", RS);
      },
      // Rule 43 as ruled (R2): "On an unkeyed operation (`key: []`) a key-less member names its one lane", outside an ending too. `Drop` cancels the
      // never-sent head; once its acknowledgement lands (rule 24) it ends NotSent { Cancelled } and nothing is sent.
      "a-key-less-cancel-on-an-unkeyed-op-outside-an-ending-names-its-one-lane"(c0) {
        const c = new Ctx(c0.fresh([r15StayFixture()]), RS);
        c.ensure(RS);
        c.send("Go");
        c.send("Drop");
        c.ack();
        c.eq("NotSent { Cancelled }, never sent", [c.lastEnding("charge")?.["reason"], c.reqs("charge").length], ["Cancelled", 0]);
        c.state("A", RS);
      },
      // U13 (OD48; 2.7.13's Runtime-disposal row, 2.7.1): an Attempt still on the wire past Runtime O6's bound ends unknown { Disposed }; each W
      // entry ends NotSent { Disposed } when the bound ends, after the head, so the lane's parked endings keep lane order. For a persisted
      // identity both are pending mapped outcomes, delivered to the restored incarnation: no unknown { Restored }.
      "past-the-disposal-bound-the-attempt-ends-unknown-disposed"(c0) {
        const c = new Ctx(c0.fresh([r15LateFixture()]), RL);
        c.ensure(RL);
        c.send("Cancelling");
        c.send("Go");
        c.ack();
        c.send("Go");
        c.do({ disposeRuntime: true });
        c.advance(4_999);
        c.eq("within the bound nothing ends", c.endings("charge").length, 0);
        c.advance(1);
        c.eq("the bound ends the head unknown { Disposed }, then W", c.endings("charge").map((e) => [e["channel"], e["reason"]]), [["unknown", "Disposed"], ["failure", "Disposed"]]);
        const before = c.r.evidence("delivered").length;
        c.reload();
        c.eq("the restored incarnation hears both, head first, as parked", c.r.evidence("delivered").slice(before).map((d) => [d["event"], d["reason"]]), [["Unsure", "Disposed"], ["No", "Disposed"]]);
        c.eq("no Restored", c.endings("charge").some((e) => e["reason"] === "Restored"), false);
        c.eq("its handler's cancel releases the hold it kept", c.r.evidence("Released").length, 1);
      },
      // Runtime O6 within the bound, the reload a kill: the last capture holds the acknowledged head on the wire (InFlight), so the boot's restore
      // cell applies (2.7.13: "an Attempt still on the wire at the final capture ... a reload uses this table's restore cell (unknown { Restored })").
      "a-kill-inside-the-disposal-window-restores-the-wire-head-unknown-restored"(c0) {
        const c = new Ctx(c0.fresh([r15LateFixture()]), RL);
        c.ensure(RL);
        c.send("Go");
        c.ack();
        c.do({ disposeRuntime: true });
        c.advance(1_000);
        const before = c.r.evidence("delivered").length;
        c.reload();
        c.eq("unknown { Restored }", c.r.evidence("delivered").slice(before).map((d) => [d["event"], d["reason"]]), [["Unsure", "Restored"]]);
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
        c.reload();
        c.eq("and each boot again", c.r.evidence("UnboundLane").length, 2);
        c.eq("still listed", unbound().length, 1);
        const before = c.r.evidence("delivered").length;
        c.ensure(RL);
        c.eq("adopted: the hold's unknown { Restored } is heard", c.r.evidence("delivered").slice(before).map((d) => [d["event"], d["reason"]]), [["Unsure", "Restored"]]);
        c.eq("no longer unbound", unbound(), []);
        c.reload();
        c.eq("no boot reports it now", c.r.evidence("UnboundLane").length, 2);
      },
      // U17 (OD48; 2.7.15): an operation key's fingerprint compares each key field's type side and encoded side, ignoring annotations. `k` from
      // String to Trim keeps the encoded side (a string) and changes the type side: a new version of the op, so the hold is an old-version hold
      // and every commit of the op declines beside it, whatever its key (D221).
      "a-key-fields-type-side-change-is-a-new-version-of-the-op"(c0) {
        const c = keyHoldThen(c0, 4);
        c.eq("an old-version hold, said at the boot", c.r.evidence("OldVersionLane").length, 1);
        c.send("Go", { k: "b" });
        c.ack();
        c.eq("declined beside it, nothing sent", [c.mem(KS)?.declined, c.reqs("charge").length], [1, 1]);
      },
      // U17 across a Flow upgrade (R3, the runner's ruling): a lane stamped by a Flow from before Schema versions joined the stamp (bare names) reads
      // under the new Flow, with no Schema change, as the current version: no old-version hold, and another key's commit sends.
      "a-names-only-stamp-from-before-the-upgrade-is-the-current-version"(c0) {
        const rel: Release = { v: 0 };
        const c = new Ctx(c0.fresh([preVersionStampFixture(rel)], { captureMs: 0 }), KS);
        c.ensure(KS);
        c.send("Go", { k: "a" });
        c.ack();
        c.answer("charge", { lost: true });
        c.yes("stamped with bare names", JSON.stringify([...c.r.stored().values()]).includes('"keyFields":["k"]'));
        c.h.release(() => void (rel.v = 1), () => void (rel.v = 0));
        c.reload();
        c.eq("no old-version hold", c.r.evidence("OldVersionLane").length, 0);
        c.send("Go", { k: "b" });
        c.ack();
        c.eq("another key sends", [c.mem(KS)?.declined, c.reqs("charge").length], [0, 2]);
      },
      // U17: "a brand or a description is not" a new version. The hold is current; another key's commit sends.
      "a-key-fields-description-change-is-no-new-version-of-the-op"(c0) {
        const c = keyHoldThen(c0, 5);
        c.eq("no old-version hold", c.r.evidence("OldVersionLane").length, 0);
        c.send("Go", { k: "b" });
        c.ack();
        c.eq("another key sends", [c.mem(KS)?.declined, c.reqs("charge").length], [0, 2]);
      },
    },
  },
];
