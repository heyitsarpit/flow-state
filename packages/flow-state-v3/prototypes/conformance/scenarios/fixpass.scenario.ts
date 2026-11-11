// Round 14's fix pass, after the independent final review. Every expectation is the design's text, worked out by hand: rule 44, rule 73 and
// 2.7.17 (Ready and hydration, its stated limits), Runtime O6, D6 (OD31).
import { traitStoreFixture, traitWriteFixture } from "../typed/desk.ts";
import { LifeId, lifeFixture } from "../typed/lifetime.ts";
import { BareId } from "../typed/round7.ts";
import { serialBareFixture } from "../typed/round8.ts";
import { LateQueueId, lateQueueFixture } from "../typed/latequeue.ts";
import { A1SubId, a1SubFixture } from "../typed/audit1.ts";
import { Ctx, type Scenario } from "./ctx.ts";
import { GRACE } from "./lifetime.scenario.ts";

const TW = { actor: "Lab/TraitWrite", id: "a" };
const SB1 = { actor: A1SubId, id: "a" };
const TS = { actor: "Lab/TraitStore", id: "a" };
const got = (c: Ctx) => c.inner(["t"])?.memory.got;
const onTW = (c0: Ctx) => {
  const c = new Ctx(c0.fresh([traitWriteFixture]), TW);
  c.ensure();
  return c;
};
// A head acknowledged and lost (Held), optionally a second commit waiting behind it; the screen leaves, the actor ends (a Held lane keeps
// nothing), its record is saved; then the reload.
const heldThenReload = (c0: Ctx, waiting: boolean) => {
  const c = onTW(c0);
  c.into(["t"], "Go");
  c.ack();
  if (waiting) c.into(["t"], "Go");
  c.answer("put", { lost: true });
  c.eq("the same incarnation heard it", got(c), ["unsure:a:NoResponse"]);
  c.detach();
  c.advance(GRACE);
  c.eq("held keeps nothing: ended", c.r.state(TW), undefined);
  c.do({ hide: true });
  c.reload();
  return c;
};
const parkedInRecord = (c: Ctx) => c.r.quiet().waits.filter((w) => w.kind === "parked" && (w as { record?: boolean }).record === true).length;

const X = { actor: LifeId, id: "a" };
const SB = { actor: BareId, id: "a" };
const LQ = { actor: LateQueueId, id: "a" };

export const fixpassScenarios: readonly Scenario[] = [
  {
    // D3 (OD31 correction; Runtime C2): a return after an end is a new incarnation, and identities are never reused. Three lives of one
    // persisted identity, each ended by the grace, carry three distinct root ids.
    id: "R14-FIX-03",
    kind: "example",
    fixtures: [lifeFixture()],
    actor: X,
    cites: ["rule:73", "C2"],
    run(c0) {
      const c = new Ctx(c0.fresh([lifeFixture()]), X);
      for (let i = 0; i < 3; i++) {
        c.ensure(X);
        c.detach(X);
        c.advance(GRACE);
        c.eq("ended", c.r.state(X), undefined);
      }
      const ids = c.r.evidence("ended").map((e) => e["inc"]);
      c.eq("three ends, three distinct incarnation ids", [ids.length, new Set(ids).size], [3, 3]);
    },
  },
  {
    // 2.7.17 Ready: "a record kept at ready whose lane is Held is not woken, and evidence and Inspection name it". Rule 44: the boot owes the
    // held head its unknown { Restored } once per incarnation; it waits in the record until a return hears it. D6: if `disposeActor` takes
    // the record first, what the boot queued waits raw on its lane, and the next incarnation hears each once.
    id: "R14-FIX-01",
    kind: "fault",
    fixtures: [traitWriteFixture, traitStoreFixture("row"), serialBareFixture(), lateQueueFixture()],
    actor: TW,
    cites: ["rule:44", "C106", "OD:31"],
    variants: {
      // Audit 1, rule 15: "a late turn may not leave a state that owns ... an active subroutine". W's commit lands late, in SUB, where A1Mini runs; the
      // root's `Ok` would leave SUB, so the turn is denied and the subroutine keeps running.
      "audit-a-late-turn-may-not-leave-an-active-subroutine"(c0) {
        const c = new Ctx(c0.fresh([a1SubFixture()]), SB1);
        c.ensure(SB1);
        c.send("Go");
        c.send("Open");
        c.state("SUB", SB1);
        c.answer("pay", { ok: {} });
        c.eq("denied: still in SUB", [c.r.state(SB1), c.r.evidence("Denied").some((d) => String(d["reasons"]).includes("LateMayNotLeave"))], ["SUB", true]);
      },
      // The search's walk (fragstore.row): the dispose's record removal is still in a pending capture at the reload (D80), so the disk's live
      // record is restored; its lane is Held, so it stays a record at ready, owed the head's Restored.
      "a-held-record-at-ready-names-what-it-is-owed"(c0) {
        const c = new Ctx(c0.fresh([traitStoreFixture("row")]), TS);
        c.ensure();
        c.into(["t"], "Go", { v: 1 });
        c.ack();
        c.into(["t"], "GiveUp");
        c.into(["t"], "Resend");
        c.dispose();
        c.reload();
        c.eq("a record at ready, not woken", [c.r.state(TS), c.r.evidence("recordAtReady").length], [undefined, 1]);
        c.eq("evidence and Inspection name the owed Restored", [c.r.evidence("parked").filter((e) => e["record"] === true).length, parkedInRecord(c)], [1, 1]);
        const heard = () => c.r.evidence("delivered").filter((e) => e["op"] === "put").length;
        const before = heard();
        c.ensure();
        c.eq("the return hears it once", heard() - before, 1);
        c.eq("nothing waits in a record now", parkedInRecord(c), 0);
      },
      // The search's next walk: that record at ready is disposed before any return. D6: what the boot queued waits on the lane; the fresh
      // incarnation hears the head's Restored once, from the parked list (not told again by the rebind).
      "a-dispose-of-a-record-at-ready-parks-what-the-boot-queued"(c0) {
        const c = new Ctx(c0.fresh([traitStoreFixture("row")]), TS);
        c.ensure();
        c.into(["t"], "Go", { v: 1 });
        c.ack();
        c.into(["t"], "GiveUp");
        c.into(["t"], "Resend");
        c.dispose();
        c.reload();
        c.dispose();
        c.eq("on the lane now, and a wait says so", c.r.quiet().waits.filter((w) => w.kind === "parked" && w.op === "put").length, 1);
        const heard = () => c.r.evidence("delivered").filter((e) => e["op"] === "put").length;
        const before = heard();
        c.ensure();
        c.eq("heard once", heard() - before, 1);
      },
      // fragstore.row's depth-7 walk. 2.7.11's storage-refused row: a re-send whose capture is refused returns to Held and its unknown event
      // is delivered again, with reason StorageRefused; the screen is away, so it parks (rule 44) and is on disk at the kill. It is the
      // re-send's own ending, never delivered, so the boot restores it (2.7.13: a head's own parked ending, not Restored) and the return hears it once.
      "a-refused-resend-parked-before-a-kill-is-heard-once-after"(c0) {
        const c = new Ctx(c0.fresh([traitStoreFixture("row")]), TS);
        c.ensure();
        c.into(["t"], "Go", { v: 1 });
        c.ack();
        c.into(["t"], "GiveUp");
        c.into(["t"], "Resend");
        c.send("Away");
        c.do({ storage: "refuse" });
        c.eq("parked while away", c.r.quiet().waits.filter((w) => w.kind === "parked" && w.op === "put").length, 1);
        c.advance(30_000);
        c.reload();
        c.eq("still owed after the kill", c.r.quiet().waits.filter((w) => w.kind === "parked" && w.op === "put").length, 1);
        const heard = () => c.r.evidence("delivered").filter((e) => e["op"] === "put");
        const before = heard().length;
        c.send("Back");
        c.eq("heard once, as the re-send's StorageRefused", [heard().length - before, c.lastEnding("put")?.reason], [1, "StorageRefused"]);
      },
      // Rule 15 and 1.6 ("a late ending never leaves live work"), ruled for the round 14 finish: an InFlight head and every queued commit of the
      // exited activation are live work, a commit queued behind a Held head included; a Held head is not; a cancel in the leaving transition
      // exempts nothing (round 15, R1). The queue search's walk: the head's late NotSent { Cancelled } routes from the root.
      "a-late-ending-may-not-leave-a-queued-commit"(c0) {
        const c = new Ctx(c0.fresh([serialBareFixture()]), SB);
        c.ensure(SB);
        c.send("Go");
        c.send("Go");
        c.send("Forget");
        c.send("Go");
        c.state("W");
        c.ack();
        c.eq("the late turn is denied", c.r.evidence("Denied").at(-1)?.["reasons"], ["LateMayNotLeave"]);
        c.state("W");
      },
      "a-commit-queued-behind-a-held-head-is-live-work"(c0) {
        const c = new Ctx(c0.fresh([lateQueueFixture()]), LQ);
        c.ensure(LQ);
        c.send("Go");
        c.send("Go");
        c.ack();
        c.answer("charge", { lost: true });
        c.eq("the late Unsure is denied", c.r.evidence("Denied").at(-1)?.["reasons"]?.includes("LateMayNotLeave"), true);
        c.state("W");
      },
      // Round 15 (R1, the runner's ruling): no cancel exemption. A late exit whose transition cancels the lane still leaves the queued commit, so it
      // is denied; giving the work up is written in an alternative that stays put (R15-01).
      "a-late-exit-whose-transition-cancels-the-lane-is-denied"(c0) {
        const c = new Ctx(c0.fresh([lateQueueFixture()]), LQ);
        c.ensure(LQ);
        c.send("Go");
        c.send("Go");
        c.send("Cancelling");
        c.ack();
        c.answer("charge", { lost: true });
        c.eq("the late Unsure is denied", c.r.evidence("Denied").at(-1)?.["reasons"]?.includes("LateMayNotLeave"), true);
        c.state("W");
      },
      "a-late-exit-with-nothing-queued-goes"(c0) {
        const c = new Ctx(c0.fresh([lateQueueFixture()]), LQ);
        c.ensure(LQ);
        c.send("Go");
        c.send("Away");
        c.ack();
        c.answer("charge", { lost: true });
        c.eq("no denial", c.r.evidence("Denied").length, 0);
        c.state("A");
      },
      "a-late-exit-of-a-state-that-does-not-own-the-queue-goes"(c0) {
        const c = new Ctx(c0.fresh([lateQueueFixture()]), LQ);
        c.ensure(LQ);
        c.send("Go");
        c.send("Go");
        c.send("Away");
        c.ack();
        c.answer("charge", { lost: true });
        c.eq("no denial", c.r.evidence("Denied").length, 0);
        c.state("A");
      },
      // Rule 8 (OD38): a turn refused at admission (the outcome mapper throws) is delivered once more, after the mail already queued. At the
      // boot the two queued commits' NotSent { Restored } are refused once each, the head's unknown { Restored } runs, then each No.
      "a-mapper-refused-at-the-boot-is-tried-once-more-after-queued-mail"(c0) {
        const c = new Ctx(c0.fresh([serialBareFixture()]), SB);
        c.ensure(SB);
        c.send("Go");
        c.send("Go");
        c.send("Go");
        c.ack();
        c.do({ fault: { throwIn: "operations.charge.failure.NotSent", times: 2 } });
        const before = c.r.evidence("turn").length;
        c.reload();
        c.eq("Unsure, then each No once", c.r.evidence("turn").slice(before).map((t) => t["event"]), ["Unsure", "No", "No"]);
        c.eq("each refusal is an issue", c.r.issues().filter((i) => i.code === "InvalidTurn").length, 2);
        c.namedIssues = ["InvalidTurn"];
        c.state("A");
      },
      // M5 (fix pass): a record kept at ready is on disk as it is; its return is no change, so nothing is written for it (the outputs round 14
      // had changed: one more capture timer outstanding after each return).
      "a-return-from-ready-writes-nothing"(c0) {
        const c = new Ctx(c0.fresh([lifeFixture()], { captureMs: 0 }), X);
        c.ensure(X);
        c.send("Look");
        c.answer("look", { ok: {} });
        c.do({ hide: true });
        const writes = () => c.r.outside().batches.filter((b) => b.writes.some((w) => w.key === `actor/${c.r.actorKey(X)}`)).length;
        const n = writes();
        c.reload(); // the Story's use is attached again: the record at ready returns in this step
        c.eq("returned, its record as on disk", [c.r.evidence("recordAtReady").length, c.r.evidence("returned").length, c.mem(X)?.log], [1, 1, ["looked"]]);
        c.eq("no write of it", writes(), n);
      },
      // An end before the reload: the identity is a retired record, its lanes' endings park on the lane at the boot (rule 44). The dispose
      // removes the record, so the next incarnation starts fresh from input (D6) and hears each once, W first (D107).
      "a-dispose-of-that-record-keeps-its-endings-on-the-lane"(c0) {
        const c = heldThenReload(c0, true);
        c.eq("a record at ready, not woken", c.r.state(TW), undefined);
        c.dispose();
        c.eq("the record is gone", c.record(TW), undefined);
        c.ensure();
        c.eq("a fresh incarnation hears each once, W first (D107)", got(c), ["no:a:Restored", "unsure:a:Restored"]);
      },
    },
  },
  {
    // Rule 73 as merged: a Held lane, with or without waiting commits, keeps nothing; 2.7.17's stated limit: "an offline write that ended
    // unknown (Held) before a reload is not woken at ready; it syncs at the next use". The waiting commit's NotSent { Restored } is not owed.
    id: "R14-FIX-02",
    kind: "example",
    fixtures: [traitWriteFixture],
    actor: TW,
    cites: ["rule:73", "C106"],
    run(c0) {
      const c = heldThenReload(c0, true);
      c.eq("not woken at ready", [c.r.state(TW), c.r.evidence("wokenAtReady").length], [undefined, 0]);
      c.ensure();
      c.eq("the next use hears both", got(c), ["unsure:a:NoResponse", "no:a:Restored", "unsure:a:Restored"]);
    },
  },
];
