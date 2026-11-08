// Round 15: the design rulings the runtime still owed (OD48, and the round 14 runner ruling on rule 15). Every expectation is the design's text,
// worked out by hand before the runtime was changed; each variant names its rule.
import type { Release } from "../fixtures/round6.compiled.ts";
import { keyStampFixture } from "../typed/round13.ts";
import { EdgeId, edgeFixture } from "../typed/round9b.ts";
import { deskListenFixture } from "../typed/desk.ts";
import { preVersionStampFixture, R15LateId, R15PlainId, R15StayId, R15SwitchId, r15LateFixture, r15PlainFixture, r15StayFixture, r15SwitchFixture } from "../typed/round15.ts";
import { Ctx, type Scenario } from "./ctx.ts";

const RL = { actor: R15LateId, id: "a" };
const KS = { actor: "Lab/KeyStamp", id: "a" };
const RS = { actor: R15StayId, id: "a" };
const RP = { actor: R15PlainId, id: "a" };
const ED = { actor: EdgeId, id: "a" };
const SW = { actor: R15SwitchId, id: "a" };
const denials = (c: Ctx) => c.r.evidence("Denied").map((e) => e["reasons"]);
const keyHoldThen = (c0: Ctx, to: number, from = 1) => {
  const rel: Release = { v: from };
  const c = new Ctx(c0.fresh([keyStampFixture(rel)], { captureMs: 0 }), KS);
  c.ensure(KS);
  c.send("Go", { k: from === 1 ? "a" : "ab" });
  c.ack();
  c.answer("charge", { lost: true });
  c.h.release(() => void (rel.v = to), () => void (rel.v = from));
  c.reload();
  return c;
};

export const round15Scenarios: readonly Scenario[] = [
  {
    id: "R15-01",
    kind: "fault",
    fixtures: [r15LateFixture(), r15StayFixture(), r15PlainFixture(), edgeFixture({ local: true }), deskListenFixture, r15SwitchFixture(), keyStampFixture({ v: 1 })],
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
      // R1's pattern with Q3 A: to give the work up, the late handler cancels the whole lane in an alternative that stays put (key-less on an unkeyed
      // op names its one lane, rule 43 as ruled, R2). `cancelAll` releases the late unknown's own hold and ends each of the two queued commits
      // NotSent { Cancelled }, in lane order, delivered as endings (not evidence); nothing more is sent, and their handlers move the actor to A.
      "a-stay-put-cancel-all-gives-up-every-queued-commit"(c0) {
        const c = new Ctx(c0.fresh([r15StayFixture()]), RS);
        c.ensure(RS);
        c.send("Go");
        c.ack();
        c.send("Go");
        c.send("Go");
        c.answer("charge", { lost: true });
        c.eq("no denial", denials(c), []);
        c.eq("its own hold released", c.r.evidence("Released").length, 1);
        c.eq("both queued commits end NotSent { Cancelled }, never sent", [c.endings("charge").map((e) => [e["channel"], e["reason"]]), c.reqs("charge").length], [[["unknown", "NoResponse"], ["failure", "Cancelled"], ["failure", "Cancelled"]], 1]);
        c.eq("each is heard", c.r.evidence("delivered").map((d) => d["event"]), ["Unsure", "No", "No"]);
        c.state("A", RS);
        c.eq("the lane is gone", c.r.quiet().waits.filter((w) => "op" in w && w.op === "charge").length, 0);
      },
      // Q5 A: `persist` defaults to false. A definition that does not say `persist: true` writes nothing ahead: its commit is sent at once (no
      // acknowledgement to wait for), and a reload finds no record and restores nothing.
      "a-definition-with-no-persist-is-not-persisted"(c0) {
        const c = new Ctx(c0.fresh([r15PlainFixture()]), RP);
        c.ensure(RP);
        c.send("Go");
        c.eq("sent with no write-ahead", c.reqs("charge").length, 1);
        c.eq("nothing stored", [...c.r.stored().keys()].filter((k) => k.includes(R15PlainId)), []);
        c.reload();
        c.eq("no record and nothing restored", [c.record(RP), c.endings("charge").length], [undefined, 0]);
      },
      // Persistence O2: "a local actor of a persisted machine is not persisted". Lab/Edge's definition says `persist: true`; its local identity
      // writes nothing ahead (its commit goes out with no acknowledgement) and leaves no record or lane on disk, before or after a dispose.
      "a-local-identity-of-a-persisted-machine-is-not-persisted"(c0) {
        const c = new Ctx(c0.fresh([edgeFixture({ local: true })]), ED);
        c.ensure(ED);
        c.send("Go");
        c.eq("sent with no write-ahead", c.reqs("save").length, 1);
        c.answer("save", { ok: { v: "x" } });
        c.dispose(ED);
        c.eq("nothing of it on disk", [...c.r.stored().keys()].filter((k) => k.includes(EdgeId)), []);
      },
      // Runtime O6, as the runner ruled it for modules: "from its start nothing is invoked", and no module starts work once disposal starts.
      // Disposal releases the listen session, and a release is a gap (Streams T7), which would make the store read again what it read before.
      // Nothing is read: the only `list` request is the one the Load made.
      "no-module-starts-work-once-disposal-starts"(c0) {
        const T = { actor: "Desk/Tickets", id: "a" };
        const c = new Ctx(c0.fresh([deskListenFixture]), T);
        c.ensure(T);
        c.to(T, "Load");
        c.answer("list", { truth: true });
        c.do({ feed: "changes", frame: { _feed: "live", proof: "resumed" } });
        c.eq("one read", c.reqs("list").length, 1);
        const opened = c.r.outside().feeds.length;
        c.do({ disposeRuntime: true });
        c.advance(5_000);
        c.eq("no read after disposal starts", c.reqs("list").length, 1);
        c.eq("no session opened after disposal starts", c.r.outside().feeds.length, opened);
      },
      // C153, 2.7.13's `cancel` table, row `commit`, column `InFlight` on the wire: "interrupt it (its ending is evidence by Attempt id), mint →
      // InFlight". The first Attempt's answer, when it lands, is not delivered; the second's is. Two requests, two keys, one `Ok`.
      "under-cancel-a-commit-interrupts-the-attempt-on-the-wire"(c0) {
        const c = new Ctx(c0.fresh([r15SwitchFixture()]), SW);
        c.ensure(SW);
        c.send("Go", { q: "a" });
        c.ack();
        c.send("Go", { q: "ab" });
        c.ack();
        c.eq("two sends, two Attempts", [c.reqs("search").length, c.keys("search").length], [2, 2]);
        c.yes("the newer commit hit the InFlight cell", c.hitCell("lane.commit.InFlight"));
        c.eq("the first was interrupted: unknown { Cancelled }, as evidence", c.endings("search").map((e) => [e["channel"], e["reason"]]), [["unknown", "Cancelled"]]);
        c.answer("search", { ok: {} }); // the interrupted request's answer goes nowhere
        c.answer("search", { ok: {} });
        c.eq("only the newer Attempt's ending is heard", c.r.evidence("delivered").map((d) => d["event"]), ["Ok"]);
        c.eq("one Ok in memory", c.mem(SW)?.oks, 1);
        c.state("A", SW);
      },
      // Row `commit`, `InFlight` waiting to be invoked and never sent: "it ends `Superseded` (evidence), mint". Only the newer commit is sent.
      "under-cancel-a-never-sent-attempt-is-superseded"(c0) {
        const c = new Ctx(c0.fresh([r15SwitchFixture()]), SW);
        c.ensure(SW);
        c.send("Go", { q: "a" });
        c.send("Go", { q: "ab" });
        c.send("Go", { q: "abc" });
        c.ack();
        c.ack();
        c.eq("one send, the last", [c.reqs("search").length, c.reqs("search")[0]?.input], [1, { q: "abc" }]);
        c.eq("the two before it are Superseded, as evidence", c.r.evidence("Superseded").length, 2);
        c.answer("search", { ok: {} });
        c.eq("one Ok heard", c.r.evidence("delivered").map((d) => d["event"]), ["Ok"]);
      },
      // Rows `unknown` (InFlight → HeldThisTurn) and `turn end` (→ Idle; "the unknown is evidence"): an unknown holds only for its own ending's turn.
      // `Unsure` neither retries nor cancels, so after its turn the lane is Idle and the next commit is sent at once, minted fresh.
      "under-cancel-an-unknown-is-held-only-for-its-own-turn"(c0) {
        const c = new Ctx(c0.fresh([r15SwitchFixture()]), SW);
        c.ensure(SW);
        c.send("Go", { q: "a" });
        c.ack();
        c.answer("search", { lost: true });
        c.eq("heard once", c.r.evidence("delivered").map((d) => d["event"]), ["Unsure"]);
        c.eq("released at the turn's end", [c.hitCell("lane.turnEnd.HeldThisTurn"), c.r.evidence("Released").length], [true, 1]);
        c.eq("no hold on the row", c.r.row(SW, "search", {})?.uncertain ?? false, false);
        c.send("Go", { q: "b" });
        c.ack();
        c.eq("the next commit goes out, a new Attempt", [c.reqs("search").length, c.keys("search").length], [2, 2]);
      },
      // Row `retry`, column `HeldThisTurn`: "re-send, same id → InFlight". A key-less `retry` in the unknown's own handler re-sends the same Attempt.
      "under-cancel-a-retry-in-the-unknowns-turn-re-sends-the-same-id"(c0) {
        const c = new Ctx(c0.fresh([r15SwitchFixture()]), SW);
        c.ensure(SW);
        c.send("Retrying");
        c.send("Go", { q: "a" });
        c.ack();
        c.answer("search", { lost: true });
        c.ack();
        c.eq("re-sent with the same key", [c.reqs("search").length, c.keys("search").length], [2, 1]);
        c.eq("not released", c.r.evidence("Released").length, 0);
        c.answer("search", { ok: {} });
        c.eq("its success is heard", c.r.evidence("delivered").map((d) => d["event"]), ["Unsure", "Ok"]);
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
      // Q1 A, C173 (phase 1, R9): `forget` makes the identity's parked ending (the lost answer that landed after the dispose) evidence, never
      // delivered; it drops no hold: the held lane stays an unbound lane, listed and reported at each boot, until its owner's cancel or an adopting
      // ensure. An ensure binds the lane again: it hears the hold's `unknown { Restored }`, not the forgotten `NoResponse`.
      "forget-turns-parked-endings-into-evidence-and-keeps-the-hold"(c0) {
        const c = new Ctx(c0.fresh([r15LateFixture()]), RL);
        c.ensure(RL);
        c.send("Go");
        c.ack();
        c.dispose(RL);
        c.answer("charge", { lost: true });
        c.eq("parked for the identity", c.r.evidence("parked").length, 1);
        const before = c.r.evidence("delivered").length;
        c.do({ forget: RL });
        c.eq("its parked ending is evidence", c.r.evidence("ParkedForgotten").length, 1);
        c.eq("the hold stays, listed as unbound", c.r.inspect(RL)?.unbound?.length, 1);
        c.reload();
        c.eq("each boot reports it", c.r.evidence("UnboundLane").length, 1);
        c.reload();
        c.eq("and the next", c.r.evidence("UnboundLane").length, 2);
        c.ensure(RL);
        c.eq("bound again: the hold's Restored, not the forgotten ending", c.r.evidence("delivered").slice(before).map((d) => [d["event"], d["reason"]]), [["Unsure", "Restored"]]);
        c.eq("its cancel is the owner's: the hold is still there to hear it", c.r.row(RL, "charge", {})?.uncertain, true);
      },
      // Q1 A across a reload (the round 15b review): the boot queues the held head's `unknown { Restored }` for a record kept at ready, in the record.
      // `forget` makes that evidence too and removes the record (C173), so the next ensure starts fresh from its input and hears nothing; the hold stays.
      "forget-also-turns-a-boot-queued-ending-into-evidence"(c0) {
        const c = new Ctx(c0.fresh([r15LateFixture()]), RL);
        c.ensure(RL);
        c.send("Go");
        c.ack();
        c.answer("charge", { lost: true });
        c.send("Cancelling");
        c.detach(RL);
        c.reload();
        c.eq("kept at ready, its Restored queued in the record", c.r.evidence("recordAtReady").length, 1);
        const before = c.r.evidence("delivered").length;
        c.do({ forget: RL });
        c.eq("evidence now", c.r.evidence("ParkedForgotten").length, 1);
        c.yes("the record is gone", ![...c.r.stored().keys()].some((k) => k.startsWith("actor/")));
        c.ensure(RL);
        c.eq("a fresh actor, from its input", [c.r.evidence("incarnation").at(-1)?.["from"], c.mem(RL)?.cancelling], ["input", false]);
        c.eq("it adopts the hold and hears it as its new owner, once", c.r.evidence("delivered").slice(before).map((d) => [d["event"], d["reason"]]), [["Unsure", "Restored"]]);
        c.eq("the hold stays", c.r.row(RL, "charge", {})?.uncertain, true);
      },
      // W27 and 2.10.10 (`dispose` with `{ how: "forget" }`; phase 1, R9): `forget` of a live actor disposes it first, then forgets. The actor and
      // its record are gone; the Attempt on the wire stays on its unbound lane, and its ending, when it lands, waits there for an adopting ensure.
      "forget-of-a-live-actor-disposes-it-then-forgets"(c0) {
        const c = new Ctx(c0.fresh([r15LateFixture()]), RL);
        c.ensure(RL);
        c.send("Cancelling");
        c.send("Go");
        c.ack();
        c.do({ forget: RL });
        c.eq("no live actor, no record", [c.r.state(RL), [...c.r.stored().keys()].some((k) => k.startsWith("actor/"))], [undefined, false]);
        c.answer("charge", { ok: {} });
        c.eq("its ending is heard by no one yet", c.r.evidence("delivered").length, 0);
        c.ensure(RL);
        c.eq("a fresh actor, from its input", [c.r.evidence("incarnation").at(-1)?.["from"], c.mem(RL)?.cancelling], ["input", false]);
        c.eq("it adopts the lane and hears the ending", c.r.evidence("delivered").map((d) => d["event"]), ["Ok"]);
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
      // Q2 A: a check is compared by its `representation` ({ id, payload }): `isMinLength(1)` to `isMinLength(2)` is a new version of the op, so the
      // hold is an old-version hold and another key's commit declines beside it.
      "a-key-fields-check-parameter-change-is-a-new-version-of-the-op"(c0) {
        const c = keyHoldThen(c0, 7, 6);
        c.eq("an old-version hold, said at the boot", c.r.evidence("OldVersionLane").length, 1);
        c.send("Go", { k: "cd" });
        c.ack();
        c.eq("declined beside it, nothing sent", [c.mem(KS)?.declined, c.reqs("charge").length], [1, 1]);
      },
      // Q2 A's stated limit: a custom filter has no representation, so a change of its predicate is no new version (the hold stays current and
      // another key's commit sends). This case documents the limit; it is not a guarantee.
      "a-custom-filter-change-is-no-new-version-a-stated-limit"(c0) {
        const c = keyHoldThen(c0, 9, 8);
        c.eq("no old-version hold", c.r.evidence("OldVersionLane").length, 0);
        c.send("Go", { k: "cd" });
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
