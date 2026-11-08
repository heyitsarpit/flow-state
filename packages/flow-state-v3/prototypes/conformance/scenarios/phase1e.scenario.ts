// Phase 1, area E: the entity store, and the runner's two items from area H. Every expectation is the design's or the proposal's text
// (round-9/entity-proposal-2.md), or a ruling, worked out by hand before the runtime was changed; each variant names its rule.
import { P1StopId, p1StopFixture, P1TicketId, p1TicketFixture, p1TicketRef } from "../typed/phase1e.ts";
import { issueRef, issuesFixture } from "../typed/issues.ts";
import { s1Fixture, s1Ref } from "../typed/stores.ts";
import { Ctx, type Scenario } from "./ctx.ts";

const IA = { actor: "Issues/List", id: "a" };
const IB = { actor: "Issues/List", id: "b" };
const I1 = issueRef("i1");
const TK = { actor: P1TicketId, id: "a" };
const T1 = p1TicketRef("t1");

const ST = { actor: P1StopId, id: "a" };
const a0 = { actor: "S1", id: "a0" };
const a1 = { actor: "S1", id: "a1" };
const s1Commit = (c: Ctx, a: typeof a0, mask: number, v: number) => c.to(a, "Commit", { actor: a.id, mask, v });
const heard = (c: Ctx) => c.r.evidence("delivered").map((d) => d["event"]);

export const phase1eScenarios: readonly Scenario[] = [
  {
    id: "P1-E",
    kind: "fault",
    fixtures: [p1StopFixture()],
    actor: ST,
    cites: ["rule:24", "sec:2.7.13", "D48", "D3", "rule:29", "rule:32", "sec:2.8.5", "sec:2.8.6"],
    variants: {
      // 0a (the runner, after area H): a cancel that waits for its head's acknowledgement (D48, `then: "cancel"`) is never lost to a later `latest`
      // commit. The earlier commit is still cancelled, NotSent { Cancelled }, heard; the later one proceeds and is sent.
      "a-pending-cancel-survives-a-later-latest-commit"(c0) {
        const c = new Ctx(c0.fresh([p1StopFixture()]), ST);
        c.ensure(ST);
        c.send("Go", { q: "a" });
        c.send("Stop");
        c.send("Go", { q: "ab" });
        c.ack();
        c.ack();
        c.eq("the first is cancelled and heard", [heard(c), c.endings("look").map((e) => e["reason"])], [["No"], ["Cancelled"]]);
        c.eq("never sent; the later one is", c.reqs("look").map((r) => r.input), [{ q: "ab" }]);
        c.eq("nothing Superseded", c.r.evidence("Superseded").length, 0);
      },
      // D3 as directed by the user via the runner: strict per-record order, but a write joins its record's queue when its send begins (it heads its
      // lane), not when minted. a0's second commit waits in a0's W behind a0's own hold: a draft, so a1's write to the same record r2 goes at once.
      "a-draft-behind-its-own-hold-stalls-no-other-actor"(c0) {
        const c = new Ctx(c0.fresh([s1Fixture]), a0);
        c.ensure(a0);
        c.ensure(a1);
        s1Commit(c, a0, 1, 1);
        c.answer("w", { lost: true }, { actor: "a0" });
        s1Commit(c, a0, 2, 2);
        c.eq("a0's draft waits in its W", c.reqs("w").length, 1);
        s1Commit(c, a1, 2, 3);
        c.eq("a1's write to r2 is sent at once", c.reqs("w").map((r) => r.input.v), [1, 3]);
        c.eq("r2 is predicted", c.rec(s1Ref("r2"))?.predicted, true);
        c.advance(600_000);
        c.eq("no stall named, however long the hold lasts", c.r.evidence("RecordHeld").length, 0);
        c.answer("w", { apply: true }, { actor: "a1" });
      },
      // The price that stays (D3, rule 29): a sent hold keeps its place. a1's write to r1 waits behind a0's Held head however long it lasts.
      "a-sent-hold-still-stalls-another-actor-on-its-record"(c0) {
        const c = new Ctx(c0.fresh([s1Fixture]), a0);
        c.ensure(a0);
        c.ensure(a1);
        s1Commit(c, a0, 1, 1);
        c.answer("w", { lost: true }, { actor: "a0" });
        s1Commit(c, a1, 1, 2);
        c.eq("a1 waits behind the hold", c.reqs("w").length, 1);
        c.answer("repair", { truth: true });
        c.eq("the forced repair does not release it (D3: resolved or released)", c.reqs("w").length, 1);
        c.to(a0, "Retry");
        c.answer("w", { apply: true }, { actor: "a0" });
        c.eq("then goes", c.reqs("w").map((r) => r.input.v), [1, 1, 2]);
      },
      // U10 (OD48; FOR-ARPIT Q7 A; entity-proposal-2 section 5 and its 2.5 table): a later success cannot clear a mark, nor can time. After give-up
      // (OD28 P1's release) the mark is `uncertain` until a read asked after the give-up lands, then `unconfirmed` on its fields, quiet, asking nothing.
      // A read asked before the give-up (the forced repair already out) does not demote it. The give-up asks one read.
      "a-given-up-mark-is-uncertain-until-a-read-asked-after-then-quiet-for-good"(c0) {
        const c = new Ctx(c0.fresh([issuesFixture]), IA);
        c.ensure(IA);
        c.ensure(IB);
        c.to(IA, "Load");
        c.answer("list", { truth: true });
        c.to(IA, "Toggle", { id: "i1", liked: true });
        c.answer("like", { lost: true });
        c.eq("held: uncertain", c.rec(I1)?.uncertain, true);
        c.to(IA, "CancelLike", { id: "i1" });
        c.eq("given up, no read since: uncertain", [c.rec(I1)?.uncertain, c.rec(I1)?.unconfirmed], [true, []]);
        c.answer("repair", { truth: true });
        c.eq("the forced repair was asked before the give-up: still uncertain", c.rec(I1)?.uncertain, true);
        c.eq("the give-up asked one read", c.reqs("repair").length, 2);
        c.answer("repair", { truth: true });
        c.eq("a read asked after: quiet", [c.rec(I1)?.uncertain, c.rec(I1)?.unconfirmed], [false, ["liked", "likes"]]);
        c.advance(3_600_000);
        c.eq("time clears nothing", c.rec(I1)?.unconfirmed, ["liked", "likes"]);
        c.to(IB, "Toggle", { id: "i1", liked: false });
        c.answer("like", { apply: true });
        c.eq("a later success clears nothing", [c.rec(I1)?.uncertain, c.rec(I1)?.unconfirmed], [false, ["liked", "likes"]]);
        c.eq("and asks nothing", c.reqs("repair").length, 2);
      },
      // U10: a later write's success, landing before any read after the give-up, demotes the mark too (section 5: "that read lands, or C succeeds").
      "a-later-success-demotes-a-given-up-mark-and-does-not-clear-it"(c0) {
        const c = new Ctx(c0.fresh([issuesFixture]), IA);
        c.ensure(IA);
        c.ensure(IB);
        c.to(IA, "Load");
        c.answer("list", { truth: true });
        c.to(IA, "Toggle", { id: "i1", liked: true });
        c.answer("like", { lost: true });
        c.answer("repair", { truth: true });
        c.to(IA, "CancelLike", { id: "i1" });
        c.to(IB, "Toggle", { id: "i1", liked: false });
        c.answer("like", { apply: true });
        c.eq("quiet, not clean", [c.rec(I1)?.uncertain, c.rec(I1)?.unconfirmed], [false, ["liked", "likes"]]);
      },
      // The real source shape (supabase-js's PostgREST update): its response carries `title` and `revision`, decoded by the adapter's Schema; the store
      // takes both at settlement (2.8.1, 2.8.4), and `slug`, predicted and not carried, is `unconfirmed` (2.8.6's success row; proposal 4.3).
      "a-postgrest-update-response-confirms-what-it-carries"(c0) {
        const c = new Ctx(c0.fresh([p1TicketFixture()]), TK);
        c.ensure(TK);
        c.send("Load");
        c.answer("tickets", { truth: true });
        c.send("Save", { id: "t1", title: "New", revision: 1 });
        c.eq("predicted", [c.rec(T1)?.data.title, c.rec(T1)?.data.slug, c.rec(T1)?.predicted], ["New", "new", true]);
        c.answer("save", { apply: true });
        c.eq("confirmed from the response", [c.rec(T1)?.data, c.rec(T1)?.predicted, c.rec(T1)?.uncertain, c.rec(T1)?.unconfirmed], [{ id: "t1", title: "New", slug: "new", revision: 2 }, false, false, ["slug"]]);
        c.eq("heard", heard(c), ["Listed", "Saved"]);
      },
      // A stale write meets the server's version check as an ordinary conflict. PostgREST's is "no row matched": `data: []`, status 200. The adapter makes it
      // a definite failure, so the store takes 2.8.6's failure row: the prediction is removed, no repair, no mark.
      "a-postgrest-update-that-matches-no-row-is-a-definite-conflict"(c0) {
        const c = new Ctx(c0.fresh([p1TicketFixture()]), TK);
        c.ensure(TK);
        c.send("Load");
        c.answer("tickets", { truth: true });
        c.send("Save", { id: "t1", title: "New", revision: 1 });
        c.answer("save", { apply: true });
        c.send("Save", { id: "t1", title: "Stale", revision: 1 });
        c.answer("save", { apply: true });
        c.eq("heard as a conflict", heard(c), ["Listed", "Saved", "Changed"]);
        c.eq("prediction removed, no repair, no mark", [c.rec(T1)?.data.title, c.rec(T1)?.predicted, c.rec(T1)?.uncertain, c.reqs("repair").length], ["New", false, false, 0]);
      },
      // A dropped connection: supabase-js resolves with `error` and status 0. The request may have landed, so the adapter makes it unknown: a forced repair,
      // and the record is `uncertain` for this Attempt (2.8.6's unknown row).
      "a-postgrest-status-0-is-unknown-and-forces-a-repair"(c0) {
        const c = new Ctx(c0.fresh([p1TicketFixture()]), TK);
        c.ensure(TK);
        c.send("Load");
        c.answer("tickets", { truth: true });
        c.send("Save", { id: "t1", title: "New", revision: 1 });
        c.answer("save", { ok: { data: null, error: { message: "TypeError: Failed to fetch", code: "", details: null, hint: null }, count: null, status: 0, statusText: "" } });
        c.eq("unknown: held, repaired, marked", [heard(c), c.reqs("repair").length, c.rec(T1)?.uncertain], [["Listed", "Unsure"], 1, true]);
      },
    },
  },
];
