// Phase 1, area E: the entity store, and the runner's two items from area H. Every expectation is the design's or the proposal's text
// (round-9/entity-proposal-2.md), or a ruling, worked out by hand before the runtime was changed; each variant names its rule.
import {
  gQueueRef,
  gTicketRef,
  p1GuardFixture,
  P1GuardId,
  p1GuardLyingFixture,
  p1GuardUnguardedCloseFixture,
  p1PersistedTicketFixture,
  P1ProfileId,
  p1ProfileFixture,
  p1ProfileRef,
  p1QueueCoversFixture,
  p1QueueFixture,
  P1QueueId,
  P1StopId,
  p1StopFixture,
  P1TicketId,
  p1TicketFixture,
  p1TicketRef,
  qTicketRef,
} from "../typed/phase1e.ts";
import { issueRef, issuesFixture } from "../typed/issues.ts";
import { s1Fixture, s1Ref } from "../typed/stores.ts";
import { Ctx, type Scenario } from "./ctx.ts";
import { GRACE } from "./lifetime.scenario.ts";

const IA = { actor: "Issues/List", id: "a" };
const IB = { actor: "Issues/List", id: "b" };
const I1 = issueRef("i1");
const TK = { actor: P1TicketId, id: "a" };
const T1 = p1TicketRef("t1");
const PF = { actor: P1ProfileId, id: "a" };
const P1 = p1ProfileRef("u1");

const ST = { actor: P1StopId, id: "a" };
const a0 = { actor: "S1", id: "a0" };
const a1 = { actor: "S1", id: "a1" };
const s1Commit = (c: Ctx, a: typeof a0, mask: number, v: number) => c.to(a, "Commit", { actor: a.id, mask, v });
const heard = (c: Ctx) => c.r.evidence("delivered").map((d) => d["event"]);
const QA = { actor: P1QueueId, id: "a" };
const Q1 = qTicketRef("t1");
const Q2 = qTicketRef("t2");
const ALL_Q = ["id", "queueId", "title", "revision", "note"];
const GA = { actor: P1GuardId, id: "a" };
const GT1 = gTicketRef("t1");
const marks = (c: Ctx, ref: string) => [c.rec(ref)?.uncertain, c.rec(ref)?.unconfirmed];
const board = (c: Ctx) => {
  c.send("Load");
  c.answer("board", { truth: true });
};
const elsewhere = (c: Ctx, t: Readonly<Record<string, unknown>>, queues = false) =>
  c.fault({
    mutateServer: (s: any) => ({
      ...s,
      tickets: { ...s.tickets, t1: { ...s.tickets.t1, ...t } },
      queues: queues ? Object.fromEntries(Object.entries(s.queues).map(([k, q]: [string, any]) => [k, { ...q, revision: q.revision + 1 }])) : s.queues,
    }),
  });
// The write is lost, the person gives up, and the forced repair and the give-up's one read land (U10: quiet from here).
const lostThenGivenUp = (c: Ctx, ev: string, payload: Readonly<Record<string, unknown>>, op: string, giveUp: string) => {
  c.send(ev, payload);
  c.ack();
  c.answer(op, { lost: true });
  c.send(giveUp, { id: "t1" });
  for (let i = 0; i < 12 && c.tryAnswer("repair", { truth: true }); i++);
};
const PGRST116 = { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116", details: "The result contains 0 rows", hint: null }, count: null, status: 406, statusText: "Not Acceptable" };

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
        c.send("Save", { id: "t1", title: "New" });
        c.eq("predicted", [c.rec(T1)?.data.title, c.rec(T1)?.data.slug, c.rec(T1)?.predicted], ["New", "new", true]);
        c.eq("sent with Flow's basedOn, the row's revision", c.reqs("save").map((r) => r.input.match.revision), [1]);
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
        c.fault({ mutateServer: (s: any) => ({ tickets: { ...s.tickets, t1: { ...s.tickets.t1, title: "Theirs", revision: 2 } } }) }); // another client
        c.send("Save", { id: "t1", title: "Mine" });
        c.answer("save", { apply: true });
        c.eq("heard as a conflict", heard(c), ["Listed", "Changed"]);
        c.eq("prediction removed, no repair, no mark", [c.rec(T1)?.data.title, c.rec(T1)?.predicted, c.rec(T1)?.uncertain, c.reqs("repair").length], ["Old", false, false, 0]);
      },
      // A dropped connection: supabase-js resolves with `error` and status 0. The request may have landed, so the adapter makes it unknown: a forced repair,
      // the record `uncertain` (2.8.6's unknown row). The app settles it by a read (2.7.20): the row does not hold its title, so it gives the hold up.
      "a-postgrest-status-0-is-unknown-and-forces-a-repair"(c0) {
        const c = new Ctx(c0.fresh([p1TicketFixture()]), TK);
        c.ensure(TK);
        c.send("Load");
        c.answer("tickets", { truth: true });
        c.send("Save", { id: "t1", title: "New" });
        c.answer("save", { ok: { data: null, error: { message: "TypeError: Failed to fetch", code: "", details: null, hint: null }, count: null, status: 0, statusText: "" } });
        c.eq("unknown: held, repaired, marked", [heard(c), c.reqs("repair").length, c.rec(T1)?.uncertain], [["Listed", "Unsure"], 1, true]);
        c.answer("ticket", { truth: true });
        c.eq("settled by a read: not ours, given up", [c.mem(TK)?.toast, c.r.row(TK, "save", { id: "t1" })], ["Not saved", undefined]);
      },
      // OD19 Q32 A, narrowed (runner, item 1): one actor saves twice quickly. The second waits in W, minted after the first and over the same revision, so it
      // rebases onto the revision the first returns: no self-conflict.
      "a-double-save-rebases-onto-its-own-earlier-write"(c0) {
        const c = new Ctx(c0.fresh([p1TicketFixture()]), TK);
        c.ensure(TK);
        c.send("Load");
        c.answer("tickets", { truth: true });
        c.send("Save", { id: "t1", title: "A" });
        c.send("Save", { id: "t1", title: "AB" });
        c.answer("save", { apply: true });
        c.eq("the second is sent on the first's revision", c.reqs("save").map((r) => r.input.match.revision), [1, 2]);
        c.answer("save", { apply: true });
        c.eq("both saved, no conflict", [heard(c), c.rec(T1)?.data.title, c.rec(T1)?.data.revision], [["Listed", "Saved", "Saved"], "AB", 3]);
      },
      // LIKE-05's shape on a version-checked source: a's second save is a draft behind a's first; b's save, minted after it, overtakes it (D3 as directed).
      // Both rebase onto a's first (minted earlier); a's draft does not rebase past b's (minted later), so it meets the version check: an ordinary conflict.
      "an-overtaken-draft-meets-the-version-check-as-a-conflict"(c0) {
        const TB = { actor: P1TicketId, id: "b" };
        const c = new Ctx(c0.fresh([p1TicketFixture()]), TK);
        c.ensure(TK);
        c.ensure(TB);
        c.send("Load");
        c.answer("tickets", { truth: true });
        c.send("Save", { id: "t1", title: "a1" });
        c.send("Save", { id: "t1", title: "a2" });
        c.to(TB, "Save", { id: "t1", title: "b" });
        c.answer("save", { apply: true });
        c.eq("b goes next, rebased", c.reqs("save").map((r) => [r.input.patch.title, r.input.match.revision]), [["a1", 1], ["b", 2]]);
        c.answer("save", { apply: true });
        c.eq("a's draft goes last, not rebased past b", c.reqs("save").at(-1)?.input.match.revision, 2);
        c.answer("save", { apply: true });
        c.eq("a hears a conflict for its draft; the server holds b", [c.mem(TK)?.toast, c.mem(TB)?.toast, c.r.truth().server.tickets.t1.title], ["Changed by someone else", "Saved", "b"]);
      },
      // PostgREST has no idempotency key: a Retry after an unknown re-sends, and if the first landed the re-send matches no row (`200 []`). Rule 18 makes
      // that `StillUnknown`, not a conflict; the app settles it by a read and hears its own write as saved.
      "a-postgrest-re-send-of-a-landed-write-is-settled-by-a-read"(c0) {
        const c = new Ctx(c0.fresh([p1TicketFixture()]), TK);
        c.ensure(TK);
        c.send("Load");
        c.answer("tickets", { truth: true });
        c.send("Save", { id: "t1", title: "New" });
        c.answer("save", { applyLost: true });
        c.answer("ticket", { never: true }); // the app's read is slow; the person presses Retry
        c.answer("repair", { truth: true });
        c.send("Retry", { id: "t1" });
        c.answer("save", { apply: true });
        c.eq("the re-send matched no row: still unknown, never a conflict", [heard(c).includes("Changed"), c.endings("save").at(-1)?.reason], [false, "StillUnknown"]);
        c.answer("ticket", { truth: true });
        c.eq("the read says it landed: saved, given up", [c.mem(TK)?.toast, c.r.truth().server.tickets.t1.revision], ["Saved", 2]);
      },
      // A landed write whose answer does not decode is unknown (it may have changed the row), not a defect.
      "a-postgrest-answer-that-does-not-decode-is-unknown"(c0) {
        const c = new Ctx(c0.fresh([p1TicketFixture()]), TK);
        c.ensure(TK);
        c.send("Load");
        c.answer("tickets", { truth: true });
        c.send("Save", { id: "t1", title: "New" });
        c.answer("save", { ok: { data: [{ title: 5 }], error: null, count: null, status: 200, statusText: "OK" } });
        c.eq("unknown, held and repaired", [c.endings("save").at(-1)?.reason, c.reqs("repair").length, c.rec(T1)?.uncertain], ["Undecodable", 1, true]);
      },
      // The judge (runner, item 3): a lower version is silently stale, with Inspection evidence; a higher version applies whenever it was asked.
      "a-lower-version-is-silently-stale-with-evidence"(c0) {
        const c = new Ctx(c0.fresh([p1TicketFixture()]), TK);
        c.ensure(TK);
        c.send("Load");
        c.answer("tickets", { truth: true });
        c.send("Save", { id: "t1", title: "New" });
        c.answer("save", { apply: true });
        c.send("Load"); // asked after our save landed, answered by a lagging replica
        c.answer("tickets", { ok: [{ id: "t1", title: "Old", slug: "old", revision: 1 }] });
        c.eq("stale, kept, no mark, named in evidence", [c.rec(T1)?.data.title, c.rec(T1)?.uncertain, c.r.evidence("Stale").length], ["New", false, 1]);
      },
      "a-higher-version-applies-whenever-it-was-asked"(c0) {
        const c = new Ctx(c0.fresh([p1TicketFixture()]), TK);
        c.ensure(TK);
        c.send("Load");
        c.answer("tickets", { truth: true });
        c.send("Load"); // asked before our save landed
        c.send("Save", { id: "t1", title: "New" });
        c.answer("save", { apply: true });
        c.answer("tickets", { ok: [{ id: "t1", title: "Theirs", slug: "theirs", revision: 3 }] });
        c.eq("a higher version applies", [c.rec(T1)?.data.title, c.rec(T1)?.data.revision, c.rec(T1)?.uncertain], ["Theirs", 3, false]);
      },
      // The judge's equality: the field's Schema equivalence. The write's 204 is confirmed from its input "New@X.com"; a read asked before it landed answers
      // the server's "new@x.com". Equal by the field's Schema, so no doubt; a structural compare would mark the record.
      "equality-is-the-field-schemas-equivalence"(c0) {
        const c = new Ctx(c0.fresh([p1ProfileFixture()]), PF);
        c.ensure(PF);
        c.send("Load", { id: "u1" });
        c.answer("profile", { truth: true });
        c.send("SetEmail", { id: "u1", email: "New@X.com" });
        c.send("Load", { id: "u1" });
        c.answer("setEmail", { apply: true });
        c.answer("profile", { truth: true });
        c.eq("one value, no doubt", [c.rec(P1)?.uncertain, c.reqs("repair").length], [false, 0]);
      },
      // U10, field-scoped (runner, item 4): a later success demotes a given-up mark only if it carried every field the mark is on.
      "a-later-success-on-other-fields-leaves-a-given-up-mark-uncertain"(c0) {
        const c = new Ctx(c0.fresh([issuesFixture]), IA);
        c.ensure(IA);
        c.ensure(IB);
        c.to(IA, "Load");
        c.answer("list", { truth: true });
        c.to(IA, "Toggle", { id: "i1", liked: true });
        c.answer("like", { lost: true });
        c.answer("repair", { truth: true });
        c.to(IA, "CancelLike", { id: "i1" });
        c.to(IB, "Edit", { id: "i1", title: "x" });
        c.answer("rename", { apply: true });
        c.eq("a title's success says nothing of liked: still uncertain", c.rec(I1)?.uncertain, true);
        c.answer("repair", { truth: true });
        c.eq("the give-up's read demotes it", [c.rec(I1)?.uncertain, c.rec(I1)?.unconfirmed], [false, ["liked", "likes"]]);
      },
      // D15 as ruled (runner, item 2): no 5-minute clock. An unbound sent hold (its actor gone) with a write waiting behind it on its record yields at once:
      // released, its one read asked, its mark kept (rule 32), and the waiter goes.
      "an-unbound-hold-yields-to-a-waiting-write-with-no-clock"(c0) {
        const c = new Ctx(c0.fresh([issuesFixture]), IA);
        c.ensure(IA);
        c.ensure(IB);
        c.to(IA, "Toggle", { id: "i1", liked: true });
        c.answer("like", { lost: true });
        c.answer("repair", { truth: true });
        c.to(IB, "Toggle", { id: "i1", liked: false });
        c.detach(IA);
        c.eq("bound: B waits", c.reqs("like").length, 1);
        c.advance(GRACE);
        c.eq("unbound: yielded at once, the waiter sent, a read asked, the mark kept", [c.reqs("like").length, c.reqs("repair").length, c.rec(I1)?.uncertain], [2, 2, true]);
      },
      // U10's cap (proposal 4.5), set small here: given-up marks per entity, oldest out, named.
      "the-given-up-mark-cap-evicts-the-oldest"(c0) {
        const c = new Ctx(c0.fresh([issuesFixture], { unsettledMax: 1 }), IA);
        c.ensure(IA);
        c.to(IA, "Load");
        c.answer("list", { truth: true });
        for (const id of ["i1", "i2"]) {
          c.to(IA, "Toggle", { id, liked: true });
          c.answer("like", { lost: true });
          c.answer("repair", { truth: true });
          c.to(IA, "CancelLike", { id });
          c.answer("repair", { truth: true });
        }
        c.eq("i1's evicted, i2's kept", [c.r.evidence("UnsettledEvicted").map((e) => e["ref"]), c.rec(issueRef("i1"))?.unconfirmed, c.rec(issueRef("i2"))?.unconfirmed], [[issueRef("i1")], [], ["liked", "likes"]]);
      },
      // Q1 A, `guarded: true`, with the convergence's rules (round-9/released-write-proof-proposal-2.md 4.1, spelled `guarded`). Example 1: B is sent over
      // revision 1, lost, given up. While the row is at 1 the request may still land; once an answer shows revision 2 it cannot, and the doubt ends.
      "a-guarded-given-up-doubt-ends-on-an-answer-past-its-base"(c0) {
        const c = new Ctx(c0.fresh([p1GuardFixture()]), GA);
        c.ensure(GA);
        board(c);
        lostThenGivenUp(c, "Save", { id: "t1", title: "B" }, "save", "GiveUpSave");
        c.eq("given up, read: quiet", marks(c, GT1), [false, ["title"]]);
        elsewhere(c, { title: "C", revision: 2 });
        board(c);
        c.eq("revision 2 is past the base it was sent with: ended", [c.rec(GT1)?.data.title, ...marks(c, GT1)], ["C", false, []]);
        c.send("Save", { id: "t1", title: "E" });
        c.ack();
        c.answer("save", { apply: true });
        c.eq("an ordinary save over a fresh base: no contradiction", [heard(c).at(-1), c.r.evidence("GuardContradicted").length], ["Done", 0]);
      },
      // The base as sent is on the durable lane record (round 2's finding 2), so a doubt restored after a reload is proven the same way.
      "a-restored-given-up-doubt-is-proven-by-the-base-its-lane-saved"(c0) {
        const c = new Ctx(c0.fresh([p1GuardFixture()]), GA);
        c.ensure(GA);
        board(c);
        c.send("Save", { id: "t1", title: "B" });
        c.ack();
        c.answer("save", { lost: true });
        c.reload();
        c.send("GiveUpSave", { id: "t1" });
        c.eq("restored and given up, no read since: uncertain", c.rec(GT1)?.uncertain, true);
        elsewhere(c, { title: "C", revision: 2 });
        c.answer("repair", { truth: true }); // the restore's repair, asked before the give-up: it demotes nothing, but it carries revision 2
        c.eq("past the saved base: ended", [c.rec(GT1)?.uncertain, c.rec(GT1)?.data.title], [false, "C"]);
      },
      // 4.1: "an equal version proves nothing", and "no refusal ... ends it" (RC8: PostgREST's zero rows may be row-level security). A later save over the
      // same stale base is refused (`[]`, TicketChanged): still marked. Only the read showing revision 2 ends it.
      "an-equal-version-and-a-refusal-prove-nothing"(c0) {
        const c = new Ctx(c0.fresh([p1GuardFixture()]), GA);
        c.ensure(GA);
        board(c);
        lostThenGivenUp(c, "Save", { id: "t1", title: "B" }, "save", "GiveUpSave");
        board(c);
        c.eq("revision 1 again: equal, still marked", marks(c, GT1), [false, ["title"]]);
        elsewhere(c, { title: "C", revision: 2 });
        c.send("Save", { id: "t1", title: "D" });
        c.ack();
        c.answer("save", { apply: true });
        c.eq("refused over the stale base, and still marked", [heard(c).at(-1), ...marks(c, GT1)], ["Changed", false, ["title"]]);
        board(c);
        c.eq("the read shows 2: ended", marks(c, GT1), [false, []]);
      },
      // 4.1 is about a given-up write: a held one may still be re-sent, so a version past its base ends nothing while held. At the give-up the store
      // already holds one, so it ends there, and the give-up asks no read.
      "a-held-doubt-is-not-ended-and-the-proof-already-held-ends-it-at-the-give-up"(c0) {
        const c = new Ctx(c0.fresh([p1GuardFixture()]), GA);
        c.ensure(GA);
        board(c);
        c.send("Save", { id: "t1", title: "B" });
        c.ack();
        c.answer("save", { lost: true });
        elsewhere(c, { title: "C", revision: 2 });
        c.answer("repair", { truth: true });
        c.eq("held: still uncertain", c.rec(GT1)?.uncertain, true);
        c.send("GiveUpSave", { id: "t1" });
        c.eq("given up past its base: clean, no read asked", [...marks(c, GT1), c.reqs("repair").length], [false, [], 1]);
      },
      // G5 (the round 3 runtime review): the lane record written ahead of the send may hold a base a rebase later moved. A doubt restored from it has no
      // base it can trust, so no version proves it: the cap. Here the reload lands after the send and before the record that says so.
      "a-doubt-restored-from-a-record-written-before-its-send-is-not-proven"(c0) {
        const c = new Ctx(c0.fresh([p1GuardFixture()]), GA);
        c.ensure(GA);
        board(c);
        c.send("Save", { id: "t1", title: "B" });
        c.fault({ storageFails: 1 }); // the record written after the send never lands
        c.ack();
        c.eq("sent", c.reqs("save").length, 1);
        c.namedIssues = ["StorageFailure"];
        c.reload();
        c.send("GiveUpSave", { id: "t1" });
        elsewhere(c, { title: "C", revision: 2 });
        c.answer("repair", { truth: true });
        c.eq("no trusted base: still in doubt", c.rec(GT1)?.uncertain, true);
      },
      // RC6, 4.2's first row: `move_ticket` fences the ticket's revision, not the queues'. A version past each base ends only the target's doubt; the
      // queues the write touched (`.alsoChanges`) keep theirs until the cap, though their own revisions moved too.
      "a-two-record-write-is-fenced-on-its-target-only"(c0) {
        const c = new Ctx(c0.fresh([p1GuardFixture()]), GA);
        c.ensure(GA);
        board(c);
        lostThenGivenUp(c, "Move", { id: "t1", from: "q1", to: "q2" }, "move", "GiveUpMove");
        c.eq("all three quiet", [marks(c, GT1), marks(c, gQueueRef("q1")), marks(c, gQueueRef("q2"))], [[false, ["queueId"]], [false, ["openCount"]], [false, ["openCount"]]]);
        elsewhere(c, { revision: 2 }, true);
        board(c);
        c.eq("the ticket ended; the queues kept", [marks(c, GT1), marks(c, gQueueRef("q1")), marks(c, gQueueRef("q2"))], [[false, []], [false, ["openCount"]], [false, ["openCount"]]]);
      },
      // 4.4 (RC7): a live `.covers` session would hear the request land, so it hides the doubt, never ends it; when the session is lost the mark shows again.
      "a-live-cover-hides-a-given-up-doubt-until-the-session-is-lost"(c0) {
        const c = new Ctx(c0.fresh([p1GuardFixture()]), GA);
        c.ensure(GA);
        board(c);
        c.do({ feed: "changes", frame: { _feed: "live", proof: "resumed" } });
        lostThenGivenUp(c, "Save", { id: "t1", title: "B" }, "save", "GiveUpSave");
        c.eq("hidden while the queue's channel is live", marks(c, GT1), [false, []]);
        c.do({ feed: "changes", fail: { _tag: "SocketDropped" } });
        c.eq("lost: shown again, nothing proven", marks(c, GT1), [false, ["title"]]);
      },
      // 4.4: a write that changes a field the cover reads can carry its record out of the cover, and its landing would go unheard. Never hidden.
      "a-write-that-can-move-its-record-out-of-the-cover-is-not-hidden"(c0) {
        const c = new Ctx(c0.fresh([p1GuardFixture()]), GA);
        c.ensure(GA);
        board(c);
        c.do({ feed: "changes", frame: { _feed: "live", proof: "resumed" } });
        lostThenGivenUp(c, "Move", { id: "t1", from: "q1", to: "q2" }, "move", "GiveUpMove");
        c.eq("shown under the live cover", marks(c, GT1), [false, ["queueId"]]);
      },
      // 4.6 (RC9): a first send that succeeds over a base the store already knew was stale (known 2 > base 1) is something a server enforcing the claim
      // would have refused. Here the server ignores the filter. Evidence, and the claim is void for the Runtime: a later given-up doubt keeps its mark.
      "a-first-send-succeeding-over-a-known-stale-base-contradicts-the-claim"(c0) {
        const c = new Ctx(c0.fresh([p1GuardLyingFixture()]), GA);
        c.ensure(GA);
        board(c);
        c.send("Save", { id: "t1", title: "B" });
        elsewhere(c, { title: "C", revision: 2 });
        board(c);
        c.ack();
        c.answer("save", { apply: true });
        c.eq("contradicted, named", c.r.evidence("GuardContradicted").map((e) => [e["record"], e["basedOn"], e["known"]]), [[GT1, 1, 2]]);
        lostThenGivenUp(c, "Save", { id: "t1", title: "D" }, "save", "GiveUpSave");
        elsewhere(c, { revision: 9 });
        board(c);
        c.eq("void: a version past the base proves nothing now", marks(c, GT1), [false, ["title"]]);
      },
      // 4.6's business-key row (R4): a new Attempt with the same key is replayed the stored success over its stale base. No contradiction.
      "a-replayed-business-key-success-is-no-contradiction"(c0) {
        const c = new Ctx(c0.fresh([p1GuardFixture()]), GA);
        c.ensure(GA);
        board(c);
        c.send("Close", { id: "t1" });
        c.ack();
        c.answer("close", { applyLost: true });
        c.send("GiveUpClose", { id: "t1" });
        c.send("Close", { id: "t1" });
        board(c);
        for (let i = 0; i < 12 && c.tryAnswer("repair", { truth: true }); i++);
        c.ack();
        c.answer("close", { apply: true });
        c.eq("replayed, heard, no contradiction", [heard(c).at(-1), c.r.evidence("GuardContradicted").length], ["Done", 0]);
      },
      // 4.2's business-key row: a later Attempt's success under the same key means the server holds the key, so the given-up copy can only be replayed:
      // its doubt ends on every record it touched, though `close` here is not `guarded`.
      "a-business-key-success-ends-a-given-up-doubt"(c0) {
        const c = new Ctx(c0.fresh([p1GuardUnguardedCloseFixture()]), GA);
        c.ensure(GA);
        board(c);
        lostThenGivenUp(c, "Close", { id: "t1" }, "close", "GiveUpClose");
        c.eq("quiet", marks(c, GT1), [false, ["status"]]);
        elsewhere(c, { title: "C", revision: 2 });
        board(c);
        c.eq("not guarded: a version past its base proves nothing", marks(c, GT1), [false, ["status"]]);
        c.send("Close", { id: "t1" });
        c.ack();
        c.answer("close", { apply: true });
        c.eq("the same key succeeded: ended", marks(c, GT1), [false, []]);
      },
      // Q2 A: `.gone("TicketNotFound")` on a read. PostgREST's `.single()` answers a deleted row with PGRST116 (406); the adapter fails with the tag.
      // The row is removed (a tombstone at the read's position) and the machine still hears the failure.
      "a-postgrest-single-not-found-removes-the-row"(c0) {
        const c = new Ctx(c0.fresh([p1TicketFixture()]), TK);
        c.ensure(TK);
        c.send("Load");
        c.answer("tickets", { truth: true });
        c.fault({ mutateServer: () => ({ tickets: {} }) });
        c.send("Single", { id: "t1" });
        c.answer("single", { truth: true });
        c.eq("removed, and heard", [c.rec(T1), heard(c)], [undefined, ["Listed", "NotFound"]]);
      },
      "a-rest-404-removes-the-row"(c0) {
        const c = new Ctx(c0.fresh([p1TicketFixture()]), TK);
        c.ensure(TK);
        c.send("Load");
        c.answer("tickets", { truth: true });
        c.fault({ mutateServer: () => ({ tickets: {} }) });
        c.send("Rest", { id: "t1" });
        c.answer("rest", { truth: true });
        c.eq("removed, and heard", [c.rec(T1), heard(c)], [undefined, ["Listed", "NotFound"]]);
      },
      // Q2 A: only the named tag is "no such record". Another failure of the same read leaves the row.
      "another-failure-of-a-gone-read-leaves-the-row"(c0) {
        const c = new Ctx(c0.fresh([p1TicketFixture()]), TK);
        c.ensure(TK);
        c.send("Load");
        c.answer("tickets", { truth: true });
        c.send("Single", { id: "t1" });
        c.answer("single", { ok: { data: null, error: { message: "permission denied", code: "42501", details: null, hint: null }, count: null, status: 403, statusText: "Forbidden" } });
        c.eq("kept, and the failure heard", [c.rec(T1)?.data.title, heard(c)], ["Old", ["Listed", "ReadFailed"]]);
      },
      // Q2 A, "at the read's position": the read was asked before our save landed revision 2. Its not-found cannot be ordered after that row (it has
      // no version), so it decides nothing: the row stays, the record is in doubt and one repair is asked (2.2's judge, a removal as any answer).
      "a-gone-answer-asked-before-a-newer-row-landed-is-judged-at-its-position"(c0) {
        const c = new Ctx(c0.fresh([p1TicketFixture()]), TK);
        c.ensure(TK);
        c.send("Load");
        c.answer("tickets", { truth: true });
        c.send("Single", { id: "t1" });
        c.send("Save", { id: "t1", title: "New" });
        c.answer("save", { apply: true });
        c.answer("single", { ok: PGRST116 });
        c.eq("kept, in doubt, repaired", [c.rec(T1)?.data.title, c.rec(T1)?.uncertain, c.reqs("repair").length], ["New", true, 1]);
      },
      // Q3 A: `.covers(({ input, record }) => eq(record.queueId, input.queueId))`. Supabase's registration proves nothing, so the first one is a gap:
      // what was read before it and is in queue q1 is `unconfirmed` until a read asked after lands; q2's ticket is untouched.
      "covers-a-gap-marks-only-the-covered-records"(c0) {
        const c = new Ctx(c0.fresh([p1QueueCoversFixture()]), QA);
        c.ensure(QA);
        c.send("Load");
        c.answer("tickets", { truth: true });
        c.do({ feed: "changes", frame: { _feed: "live" } });
        c.eq("q1's ticket is behind, q2's untouched", [c.rec(Q1)?.unconfirmed, c.rec(Q2)?.unconfirmed], [ALL_Q, []]);
        c.eq("one refetch asked", c.reqs("tickets").length, 2);
        c.answer("tickets", { truth: true });
        c.eq("the refetch, asked after the gap, clears it", c.rec(Q1)?.unconfirmed, []);
      },
      // Q3 A's default with no `.covers`: a session covers what it has itself delivered. It delivered t1, never t2; after a flap only t1 is behind.
      "with-no-covers-a-gap-marks-what-the-session-delivered"(c0) {
        const c = new Ctx(c0.fresh([p1QueueFixture()]), QA);
        c.ensure(QA);
        c.send("Load");
        c.answer("tickets", { truth: true });
        c.do({ feed: "changes", frame: { _feed: "live" } });
        c.eq("the first registration: nothing delivered yet, nothing behind", [c.rec(Q1)?.unconfirmed, c.rec(Q2)?.unconfirmed], [[], []]);
        c.answer("tickets", { truth: true });
        c.fault({ mutateServer: (s: any) => ({ tickets: { ...s.tickets, t1: { ...s.tickets.t1, title: "A2", revision: 2 } } }) });
        c.do({ feed: "changes", frame: { eventType: "UPDATE", columns: "changed", new: { id: "t1", title: "A2", revision: 2 } } });
        c.do({ feed: "changes", fail: { _tag: "SocketDropped" } });
        c.advance(1_000);
        c.do({ feed: "changes", frame: { _feed: "live" } });
        c.eq("t1 is behind, t2 untouched", [c.rec(Q1)?.unconfirmed, c.rec(Q2)?.unconfirmed], [ALL_Q, []]);
      },
      // Q3 A: only a read asked after the gap clears it. A read asked before, landing after, does not.
      "a-read-asked-before-the-gap-does-not-clear-it"(c0) {
        const c = new Ctx(c0.fresh([p1QueueCoversFixture()]), QA);
        c.ensure(QA);
        c.send("Load");
        c.answer("tickets", { truth: true });
        c.send("Load");
        c.do({ feed: "changes", frame: { _feed: "live" } });
        c.answer("tickets", { truth: true });
        c.eq("asked before: still behind", c.rec(Q1)?.unconfirmed, ALL_Q);
        c.answer("tickets", { truth: true });
        c.eq("the refetch clears it", c.rec(Q1)?.unconfirmed, []);
      },
      // Q4 A: `Ticket.row(e.new)`, a whole row. What it omits is absent, not unknown: the note the read held is gone.
      "a-row-frame-replaces-the-row-what-it-omits-is-absent"(c0) {
        const c = new Ctx(c0.fresh([p1QueueFixture()]), QA);
        c.ensure(QA);
        c.send("Load");
        c.answer("tickets", { truth: true });
        c.do({ feed: "changes", frame: { _feed: "live", proof: "resumed" } });
        c.do({ feed: "changes", frame: { eventType: "UPDATE", columns: "all", new: { id: "t1", queueId: "q1", title: "A2", revision: 2 } } });
        c.eq("the whole row, and no note", c.rec(Q1)?.data, { id: "t1", queueId: "q1", title: "A2", revision: 2 });
      },
      // Q4 A with D76: a whole row that arrives before any read holds the record waits, and is placed over the read that started earlier. It is
      // still whole: the read's note, which the row omits, is absent.
      "an-early-whole-row-is-still-whole-when-placed-over-a-read"(c0) {
        const c = new Ctx(c0.fresh([p1QueueFixture()]), QA);
        c.ensure(QA);
        c.send("Load");
        c.do({ feed: "changes", frame: { _feed: "live", proof: "resumed" } });
        c.do({ feed: "changes", frame: { eventType: "UPDATE", columns: "all", new: { id: "t1", queueId: "q1", title: "A2", revision: 2 } } });
        c.answer("tickets", { truth: true });
        c.eq("the row, placed by its revision, and no note", c.rec(Q1)?.data, { id: "t1", queueId: "q1", title: "A2", revision: 2 });
      },
      // Q4 A: `Ticket.delta(key, e.new)`, ordered by its revision. It speaks only to what it carries: the note stays.
      "a-delta-frame-changes-only-what-it-carries"(c0) {
        const c = new Ctx(c0.fresh([p1QueueFixture()]), QA);
        c.ensure(QA);
        c.send("Load");
        c.answer("tickets", { truth: true });
        c.do({ feed: "changes", frame: { _feed: "live", proof: "resumed" } });
        c.do({ feed: "changes", frame: { eventType: "UPDATE", columns: "changed", new: { id: "t1", title: "A2", revision: 2 } } });
        c.eq("title and revision moved, the note kept", c.rec(Q1)?.data, { id: "t1", queueId: "q1", title: "A2", revision: 2, note: "n" });
        c.do({ feed: "changes", frame: { eventType: "UPDATE", columns: "changed", new: { id: "t1", title: "A1", revision: 1 } } });
        c.eq("an older delta is placed by its revision: dropped", c.rec(Q1)?.data.title, "A2");
      },
      // Q4 A: a delta must carry the version; the type refuses one without. One that arrives anyway (a value from outside) is dropped and named.
      "a-delta-without-its-version-is-dropped-and-named"(c0) {
        const c = new Ctx(c0.fresh([p1QueueFixture()]), QA);
        c.namedIssues = ["UserClosure"];
        c.ensure(QA);
        c.send("Load");
        c.answer("tickets", { truth: true });
        c.do({ feed: "changes", frame: { _feed: "live", proof: "resumed" } });
        c.do({ feed: "changes", frame: { eventType: "UPDATE", columns: "changed", new: { id: "t1", title: "A2" } } });
        c.eq("dropped, named", [c.rec(Q1)?.data.title, c.r.issues().filter((i) => i.code === "UserClosure").length], ["A", 1]);
      },
      // Round 2's finding 2: the lane record saves `basedOn`, so a re-send restored after a reload carries the precondition it was first sent with.
      // Without it a PostgREST re-send has no revision filter to match, and the save fails as a conflict.
      "a-restored-re-send-carries-its-based-on"(c0) {
        const c = new Ctx(c0.fresh([p1PersistedTicketFixture()]), TK);
        c.ensure(TK);
        c.send("Load");
        c.answer("tickets", { truth: true });
        c.send("Save", { id: "t1", title: "New" });
        c.ack();
        c.answer("save", { lost: true });
        c.reload();
        c.send("Retry", { id: "t1" });
        c.ack();
        c.answer("repair", { truth: true });
        c.eq("re-sent over revision 1", c.reqs("save").map((r) => r.input.match.revision), [1, 1]);
        c.answer("save", { apply: true });
        c.eq("saved", [c.r.truth().server.tickets.t1.title, heard(c).at(-1)], ["New", "Saved"]);
      },
    },
  },
];
