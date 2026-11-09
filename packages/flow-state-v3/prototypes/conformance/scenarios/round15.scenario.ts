// Round 15: the design rulings the runtime still owed (OD48, and the round 14 runner ruling on rule 15). Every expectation is the design's text,
// worked out by hand before the runtime was changed; each variant names its rule.
import type { Release } from "../fixtures/round6.compiled.ts";
import { keyStampFixture } from "../typed/round13.ts";
import { EdgeId, edgeFixture } from "../typed/round9b.ts";
import { deskListenFixture } from "../typed/desk.ts";
import { preVersionStampFixture, R15LateId, R15PlainId, R15StayId, R15SwitchId, r15LateFixture, r15PlainFixture, r15StayFixture, r15SwitchFixture } from "../typed/round15.ts";
import { A1bDenyId, a1bDenyFixture, A1bHeldId, a1bHeldFixture, A1bHistId, a1bHistFixture, A1bTransId, a1bTransFixture } from "../typed/audit1b.ts";
import { Ctx, type Scenario } from "./ctx.ts";
import { GRACE } from "./lifetime.scenario.ts";

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
    namedIssues: ["OldVersionLane", "HoldWithoutRecord"], // 2.7.15 (Q2 A): an old-version hold is an issue at each boot; round 2: a hold without its record too
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
        // C179 (OD51): an ending that leaves a hold is delivered last: W's NotSent { Disposed }, then the head's unknown.
        c.eq("the restored incarnation hears both, the hold's ending last", c.r.evidence("delivered").slice(before).map((d) => [d["event"], d["reason"]]), [["No", "Disposed"], ["Unsure", "Disposed"]]);
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
        c.eq("the boot reports it", c.reportsOf("charge").length, 1);
        c.reload();
        c.eq("and each boot again", c.reportsOf("charge").length, 2);
        c.eq("still listed", unbound().length, 1);
        const before = c.r.evidence("delivered").length;
        c.ensure(RL);
        c.eq("adopted: the hold's unknown { Restored } is heard", c.r.evidence("delivered").slice(before).map((d) => [d["event"], d["reason"]]), [["Unsure", "Restored"]]);
        c.eq("no longer unbound", unbound(), []);
        c.reload();
        c.eq("no boot reports it now", c.reportsOf("charge").length, 2);
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
        const parked = String(c.r.evidence("parked")[0]?.["attempt"]);
        const n0 = c.r.evidence().length;
        c.do({ forget: RL });
        c.yes("its parked ending is evidence", c.madeEvidence(parked, n0).length > 0);
        c.eq("the hold stays, listed as unbound", c.r.inspect(RL)?.unbound?.length, 1);
        c.reload();
        c.eq("each boot reports it", c.reportsOf("charge").length, 1);
        c.reload();
        c.eq("and the next", c.reportsOf("charge").length, 2);
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
        const head = String(c.r.evidence("mint").find((e) => e["op"] === "charge")?.["attempt"]);
        const n0 = c.r.evidence().length;
        c.do({ forget: RL });
        c.yes("evidence now", c.madeEvidence(head, n0).length > 0);
        c.eq("the record is gone", c.record(RL), undefined);
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
        c.eq("no live actor, no record", [c.r.state(RL), c.record(RL)], [undefined, undefined]);
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
        c.eq("an old-version hold, said at the boot", c.r.issues().filter((i) => i.code === "OldVersionLane").length, 1);
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
        c.eq("no old-version hold", c.r.issues().filter((i) => i.code === "OldVersionLane").length, 0);
        c.send("Go", { k: "b" });
        c.ack();
        c.eq("another key sends", [c.mem(KS)?.declined, c.reqs("charge").length], [0, 2]);
      },
      // Q2 A: a check is compared by its `representation` ({ id, payload }): `isMinLength(1)` to `isMinLength(2)` is a new version of the op, so the
      // hold is an old-version hold and another key's commit declines beside it.
      "a-key-fields-check-parameter-change-is-a-new-version-of-the-op"(c0) {
        const c = keyHoldThen(c0, 7, 6);
        c.eq("an old-version hold, said at the boot", c.r.issues().filter((i) => i.code === "OldVersionLane").length, 1);
        c.send("Go", { k: "cd" });
        c.ack();
        c.eq("declined beside it, nothing sent", [c.mem(KS)?.declined, c.reqs("charge").length], [1, 1]);
      },
      // Q2 A's stated limit: a custom filter has no representation, so a change of its predicate need not be a new version. A limit is not a
      // guarantee (audit 1): a runtime that does see the change is as correct. What holds either way: the hold is kept, and another key's commit
      // is either sent or declined beside it, never lost.
      "a-custom-filter-change-is-no-new-version-a-stated-limit"(c0) {
        const c = keyHoldThen(c0, 9, 8);
        c.send("Go", { k: "cd" });
        c.ack();
        c.eq("the hold kept; the other commit sent or declined, once", [c.laneKeys().length > 0, (c.mem(KS)?.declined ?? 0) + c.keys("charge").length - 1], [true, 1]);
      },
      // U17: "a brand or a description is not" a new version. The hold is current; another key's commit sends.
      "a-key-fields-description-change-is-no-new-version-of-the-op"(c0) {
        const c = keyHoldThen(c0, 5);
        c.eq("no old-version hold", c.r.issues().filter((i) => i.code === "OldVersionLane").length, 0);
        c.send("Go", { k: "b" });
        c.ack();
        c.eq("another key sends", [c.mem(KS)?.declined, c.reqs("charge").length], [0, 2]);
      },
      // Audit 1, 2.7.13 Unbound (OD50): "An undecodable record's lanes are not unbound": its identity still has a record, so Inspection does not list
      // them as unbound and no boot reports them.
      "audit-an-undecodable-records-lanes-are-not-unbound"(c0) {
        const c = new Ctx(c0.fresh([r15LateFixture()]), RL);
        c.ensure(RL);
        c.send("Go");
        c.ack();
        c.answer("charge", { lost: true });
        c.fault({ corruptStored: { match: "actor/", edit: () => "{{{" } });
        c.reload();
        c.namedIssues = ["RecordQuarantined"];
        c.eq("not unbound, not reported (Inspection must answer: audit 3)", [c.r.inspect(RL)?.unbound, c.reportsOf("charge").length], [[], 0]);
      },
      // Audit 1, C173 (R9): `forget` removes an undecodable record, as it does a retired or old-version one.
      "audit-forget-removes-an-undecodable-record"(c0) {
        const c = new Ctx(c0.fresh([r15LateFixture()]), RL);
        c.ensure(RL);
        c.send("Go");
        c.ack();
        c.answer("charge", { ok: {} });
        c.fault({ corruptStored: { match: "actor/", edit: () => "{{{" } });
        c.reload();
        c.namedIssues = ["RecordQuarantined"];
        const named = () => c.r.issues().filter((i) => i.code === "RecordQuarantined").length;
        c.eq("the boot named the undecodable record", named(), 1);
        c.do({ forget: RL });
        c.reload();
        c.eq("forget removed it: the next boot finds nothing to name", named(), 1);
      },
      // Audit 1, Q1 A (C173): `forget` keeps a Held lane with its queued commits: the hold and its queue stay unbound, so an adopting ensure hears the
      // queued commit's NotSent { Restored } and then the hold's unknown { Restored } (rule 44, U3).
      "audit-forget-keeps-a-held-lane-with-its-queued-commits"(c0) {
        const c = new Ctx(c0.fresh([r15LateFixture()]), RL);
        c.ensure(RL);
        c.send("Go");
        c.ack();
        c.answer("charge", { lost: true });
        c.send("Go");
        c.ack();
        c.do({ forget: RL });
        c.reload();
        const before = c.r.evidence("delivered").length;
        c.ensure(RL);
        c.eq("the queue, then the hold", c.r.evidence("delivered").slice(before).map((d) => [d["event"], d["reason"]]), [["No", "Restored"], ["Unsure", "Restored"]]);
      },
      // ── Audit 1b's gaps. Each from the design text it cites; none from a wrong runtime.
      // 2.7.13's disposal row (OD50, amended by OD51 R5): "a definite ending drops the head", and "a definite ending keeps lane order, the head's first".
      // The head succeeds within Runtime O6's bound with a commit queued behind it; after the final capture a reload delivers the head's Ok, then W's
      // NotSent { Disposed }, and no hold is left.
      "audit-a-definite-ending-during-disposal-is-parked-before-w-and-drops-the-head"(c0) {
        const c = new Ctx(c0.fresh([r15LateFixture()]), RL);
        c.ensure(RL);
        c.send("Go");
        c.ack();
        c.send("Go");
        c.do({ disposeRuntime: true });
        c.advance(1_000);
        c.answer("charge", { ok: {} });
        c.advance(4_000);
        const before = c.r.evidence("delivered").length;
        c.reload();
        c.eq("the head's success, then W's NotSent { Disposed }", c.r.evidence("delivered").slice(before).map((d) => [d["event"], d["event"] === "No" ? d["reason"] : null]), [["Ok", null], ["No", "Disposed"]]);
        c.eq("the head dropped: nothing held, nothing on disk for the lane", [c.r.quiet().waits.filter((w) => w.kind === "held").length, c.lanesOf(RL).length], [0, 0]);
      },
      // Rule 15: "A call started in a late turn is an ordinary call with its own owner: lateness is not transitive". The late `Ok` (W was left) stays
      // put at the root and commits `note`, owned by the root, alive: `note`'s ending is current and routes from the active leaf, B.
      "audit-a-call-started-in-a-late-turn-ends-current"(c0) {
        const TR = { actor: A1bTransId, id: "a" };
        const c = new Ctx(c0.fresh([a1bTransFixture()]), TR);
        c.ensure(TR);
        c.send("Go");
        c.send("Leave");
        c.answer("charge", { ok: {} });
        c.eq("the late Ok committed note", c.reqs("note").length, 1);
        c.answer("note", { ok: {} });
        c.eq("note's ending is current: B's handler", [c.r.state(TR), c.mem(TR)?.noted], ["B", "B"]);
      },
      // Rule 15 and 2.7.13 (F8): "an ending admitted in a turn denied this way still counts as delivered and keeps its lane effect ..., and a hold it
      // leaves stays until a later turn's keyed cancel(k) or cancelAll(k)". The late Unsure would leave W, which owns the queued commit: denied. Its
      // cell holds the head: still uncertain, nothing new sent; `cancelAll` then gives it up and ends the queued commit.
      "audit-a-denied-late-unknown-keeps-its-hold-until-cancel-all"(c0) {
        const DN = { actor: A1bDenyId, id: "a" };
        const c = new Ctx(c0.fresh([a1bDenyFixture()]), DN);
        c.ensure(DN);
        c.send("Go");
        c.send("Go");
        c.ack();
        c.answer("charge", { lost: true });
        c.eq("denied", c.r.evidence("Denied").at(-1)?.["reasons"]?.includes("LateMayNotLeave"), true);
        c.eq("the hold stays, nothing new sent, nothing released", [c.r.quiet().waits.filter((w) => w.kind === "held" && w.op === "charge").length, c.reqs("charge").length, c.r.evidence("Released").length], [1, 1, 0]);
        c.send("Stop");
        c.eq("cancelAll gives it up: released, the queued commit NotSent { Cancelled }", [c.r.evidence("Released").length, c.endings("charge").map((e) => e["reason"]).at(-1), c.reqs("charge").length], [1, "Cancelled", 1]);
      },
      // Rule 14 (OD49): re-entry "is a new activation; so is any other re-entry (a history target, rule 1, is one case). A call the old activation owns
      // is then late when it ends". `Reset` re-enters P and X by P's history while X's call is in flight; its Ok is late and routes from the root.
      "audit-a-history-re-entry-makes-an-in-flight-calls-ending-late"(c0) {
        const HI = { actor: A1bHistId, id: "a" };
        const c = new Ctx(c0.fresh([a1bHistFixture()]), HI);
        c.ensure(HI);
        c.send("Go");
        c.send("Reset");
        c.answer("charge", { ok: {} });
        c.eq("late: heard at the root, not in X", c.mem(HI)?.heard, "root");
      },
      // Rule 15 (OD49): "A `Held` head is not live work: its call has returned". The late `Paid` (L was left) leaves H, which owns only charge's Held
      // head: it goes.
      "audit-a-late-exit-may-leave-another-operations-held-head"(c0) {
        const HE = { actor: A1bHeldId, id: "a" };
        const c = new Ctx(c0.fresh([a1bHeldFixture()]), HE);
        c.ensure(HE);
        c.send("Hold");
        c.answer("charge", { lost: true });
        c.send("Start");
        c.send("ToM");
        c.answer("pay", { ok: {} });
        c.eq("not denied: out of H", [c.r.evidence("Denied").length, c.r.state(HE)], [0, "OUT"]);
      },
      // Rule 15 (OD49): the live work is "every call owned by an activation it exits", whatever its operation. With charge InFlight the same late exit
      // is denied, and the walk goes on to the root's alternative, which stays put.
      "audit-a-late-exit-may-not-leave-another-operations-in-flight-head"(c0) {
        const HE = { actor: A1bHeldId, id: "a" };
        const c = new Ctx(c0.fresh([a1bHeldFixture()]), HE);
        c.ensure(HE);
        c.send("Hold");
        c.send("Start");
        c.send("ToM");
        c.answer("pay", { ok: {} });
        c.eq("H's exit denied: still in H", c.r.state(HE), "M");
      },
      // 2.7.13 Unbound (OD50): "a lane is unbound while its identity has no decoded actor record (live or retired) and no incarnation". The actor ends
      // after the grace with its hold (rule 73), so its record is kept, retired: its held lane is not unbound, not listed, and no boot reports it.
      "audit-a-retired-records-held-lane-is-not-unbound"(c0) {
        const c = new Ctx(c0.fresh([r15LateFixture()]), RL);
        c.ensure(RL);
        c.send("Go");
        c.ack();
        c.answer("charge", { lost: true });
        c.detach(RL);
        c.advance(GRACE);
        c.eq("a retired record, a held lane", [c.r.state(RL), c.record(RL) !== undefined, c.lanesOf(RL).length], [undefined, true, 1]);
        // Audit 3: Inspection must answer; a runtime with none is not "nothing unbound".
        c.eq("not listed as unbound", c.r.inspect(RL)?.unbound, []);
        c.reload();
        c.eq("no boot reports it", [c.reportsOf("charge").length, c.r.inspect(RL)?.unbound], [0, []]);
      },
    },
  },
];
