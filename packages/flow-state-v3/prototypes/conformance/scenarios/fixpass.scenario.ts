// Round 14's fix pass, after the independent final review. Every expectation is the design's text, worked out by hand: rule 44, rule 73 and
// 2.7.17 (Ready and hydration, its stated limits), Runtime O6, D6 (OD31).
import { traitStoreFixture, traitWriteFixture } from "../typed/desk.ts";
import { LifeId, lifeFixture } from "../typed/lifetime.ts";
import { Ctx, type Scenario } from "./ctx.ts";
import { GRACE } from "./lifetime.scenario.ts";

const TW = { actor: "Lab/TraitWrite", id: "a" };
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
    fixtures: [traitWriteFixture, traitStoreFixture("row")],
    actor: TW,
    cites: ["rule:44", "C106", "OD:31"],
    variants: {
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
