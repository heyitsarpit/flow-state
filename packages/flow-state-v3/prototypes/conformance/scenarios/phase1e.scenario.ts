// Phase 1, area E: the entity store, and the runner's two items from area H. Every expectation is the design's or the proposal's text
// (round-9/entity-proposal-2.md), or a ruling, worked out by hand before the runtime was changed; each variant names its rule.
import {
  billRef,
  gQueueRef,
  gTicketRef,
  itemRef,
  P1BulkId,
  p1BulkFixture,
  p1GuardKeysFixture,
  p1GuardTwoFixture,
  P1PayId,
  p1PayFixture,
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
// Audit 2: `unconfirmed` is a set (the design fixes no order), and key fields have no cell (entity-proposal-2 2.2), so `id` is never in it.
const asSet = (x: readonly string[] | undefined) => [...(x ?? [])].sort();
const ALL_Q = ["note", "queueId", "revision", "title"];
const GA = { actor: P1GuardId, id: "a" };
const BK = { actor: P1BulkId, id: "a" };
const bulkIds = (n: number, p: string) => Array.from({ length: n }, (_, k) => `${p}${k}`);
const GT1 = gTicketRef("t1");
const marks = (c: Ctx, ref: string) => [c.rec(ref)?.uncertain, asSet(c.rec(ref)?.unconfirmed)];
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
      // Audit gaps, the runner's ruling on finding 1 (rule 30: unknown "holds the record queue until that repair settles"; 2.8.5's example): a sent hold
      // holds its record only while its forced repair runs. a1's write to r1 then goes; a0 keeps its lane's hold, and its re-send waits behind a1.
      "a-sent-hold-releases-its-record-when-its-repair-settles"(c0) {
        const c = new Ctx(c0.fresh([s1Fixture]), a0);
        c.ensure(a0);
        c.ensure(a1);
        s1Commit(c, a0, 1, 1);
        c.answer("w", { lost: true }, { actor: "a0" });
        s1Commit(c, a1, 1, 2);
        c.eq("a1 waits while the repair runs", c.reqs("w").length, 1);
        c.answer("repair", { truth: true });
        c.eq("the repair settled: a1 goes; a0 still holds its lane", [c.reqs("w").map((r) => r.input.v), c.r.quiet().waits.filter((w) => w.kind === "held").length], [[1, 2], 1]);
        c.to(a0, "Retry");
        c.eq("a0's re-send waits behind a1", c.reqs("w").length, 2);
        c.answer("w", { apply: true }, { actor: "a1" });
        c.eq("then goes", c.reqs("w").map((r) => r.input.v), [1, 2, 1]);
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
        c.eq("given up, no read since: uncertain", [c.rec(I1)?.uncertain, asSet(c.rec(I1)?.unconfirmed)], [true, []]);
        c.answer("repair", { truth: true });
        c.eq("the forced repair was asked before the give-up: still uncertain", c.rec(I1)?.uncertain, true);
        c.eq("the give-up asked one read", c.reqs("repair").length, 2);
        c.answer("repair", { truth: true });
        c.eq("a read asked after: quiet", [c.rec(I1)?.uncertain, asSet(c.rec(I1)?.unconfirmed)], [false, ["liked", "likes"]]);
        c.advance(3_600_000);
        c.eq("time clears nothing", asSet(c.rec(I1)?.unconfirmed), ["liked", "likes"]);
        c.to(IB, "Toggle", { id: "i1", liked: false });
        c.answer("like", { apply: true });
        c.eq("a later success clears nothing", [c.rec(I1)?.uncertain, asSet(c.rec(I1)?.unconfirmed)], [false, ["liked", "likes"]]);
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
        c.eq("quiet, not clean", [c.rec(I1)?.uncertain, asSet(c.rec(I1)?.unconfirmed)], [false, ["liked", "likes"]]);
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
        c.eq("confirmed from the response", [c.rec(T1)?.data, c.rec(T1)?.predicted, c.rec(T1)?.uncertain, asSet(c.rec(T1)?.unconfirmed)], [{ id: "t1", title: "New", slug: "new", revision: 2 }, false, false, ["slug"]]);
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
        c.eq("the give-up's read demotes it", [c.rec(I1)?.uncertain, asSet(c.rec(I1)?.unconfirmed)], [false, ["liked", "likes"]]);
      },
      // D15 as ruled (runner, item 2): no 5-minute clock. An unbound sent hold (its actor gone) with a write waiting behind it on its record yields at once:
      // released, its one read asked, its mark kept (rule 32), and the waiter goes.
      "an-unbound-hold-yields-to-a-waiting-write-with-no-clock"(c0) {
        const c = new Ctx(c0.fresh([issuesFixture]), IA);
        c.ensure(IA);
        c.ensure(IB);
        c.to(IA, "Toggle", { id: "i1", liked: true });
        c.answer("like", { lost: true });
        c.to(IB, "Toggle", { id: "i1", liked: false }); // audit gaps: while the forced repair runs, the hold holds the record (rule 30)
        c.detach(IA);
        c.eq("bound: B waits", c.reqs("like").length, 1);
        c.advance(GRACE);
        c.eq("unbound: yielded at once (released), the mark kept", [c.r.evidence("Released").length, c.rec(I1)?.uncertain], [1, true]);
        c.answer("repair", { truth: true });
        c.eq("its repair settles: the waiter is sent", c.reqs("like").length, 2);
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
        c.eq("i1's evicted, i2's kept", [c.r.evidence("UnsettledEvicted").map((e) => e["ref"]), asSet(c.rec(issueRef("i1"))?.unconfirmed), asSet(c.rec(issueRef("i2"))?.unconfirmed)], [[issueRef("i1")], [], ["liked", "likes"]]);
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
      // already holds one, so it ends there. Whether the give-up still asks its one read the design does not say (audit 2: not pinned).
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
        c.eq("given up past its base: clean", marks(c, GT1), [false, []]);
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
        c.eq("q1's ticket is behind, q2's untouched", [asSet(c.rec(Q1)?.unconfirmed), asSet(c.rec(Q2)?.unconfirmed)], [ALL_Q, []]);
        c.eq("one refetch asked", c.reqs("tickets").length, 2);
        c.answer("tickets", { truth: true });
        c.eq("the refetch, asked after the gap, clears it", asSet(c.rec(Q1)?.unconfirmed), []);
      },
      // Q3 A's default with no `.covers`: a session covers what it has itself delivered. It delivered t1, never t2; after a flap only t1 is behind.
      "with-no-covers-a-gap-marks-what-the-session-delivered"(c0) {
        const c = new Ctx(c0.fresh([p1QueueFixture()]), QA);
        c.ensure(QA);
        c.send("Load");
        c.answer("tickets", { truth: true });
        c.do({ feed: "changes", frame: { _feed: "live" } });
        c.eq("the first registration: nothing delivered yet, nothing behind", [asSet(c.rec(Q1)?.unconfirmed), asSet(c.rec(Q2)?.unconfirmed)], [[], []]);
        c.answer("tickets", { truth: true });
        c.fault({ mutateServer: (s: any) => ({ tickets: { ...s.tickets, t1: { ...s.tickets.t1, title: "A2", revision: 2 } } }) });
        c.do({ feed: "changes", frame: { eventType: "UPDATE", columns: "changed", new: { id: "t1", title: "A2", revision: 2 } } });
        c.do({ feed: "changes", fail: { _tag: "SocketDropped" } });
        c.advance(1_000);
        c.do({ feed: "changes", frame: { _feed: "live" } });
        c.eq("t1 is behind, t2 untouched", [asSet(c.rec(Q1)?.unconfirmed), asSet(c.rec(Q2)?.unconfirmed)], [ALL_Q, []]);
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
        c.eq("asked before: still behind", asSet(c.rec(Q1)?.unconfirmed), ALL_Q);
        c.answer("tickets", { truth: true });
        c.eq("the refetch clears it", asSet(c.rec(Q1)?.unconfirmed), []);
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
      // ── Audit 2's gaps. Each from the design or the proposal text it cites; none from a wrong runtime.
      // released-write-proof-proposal-2 4.2, the business-key row: "a success of any later Attempt of the same contract with the same key values". t2's
      // close has another key (t2), so t1's given-up close keeps its doubt.
      "audit-a-business-key-success-under-another-key-ends-nothing"(c0) {
        const c = new Ctx(c0.fresh([p1GuardKeysFixture()]), GA);
        c.ensure(GA);
        board(c);
        lostThenGivenUp(c, "Close", { id: "t1" }, "close", "GiveUpClose");
        c.eq("quiet", marks(c, GT1), [false, ["status"]]);
        c.send("Close", { id: "t2" });
        c.ack();
        c.answer("close", { apply: true });
        c.eq("t2's key succeeded; t1's doubt stays", [heard(c).at(-1), marks(c, GT1)], ["Done", [false, ["status"]]]);
      },
      // The same row: "of the same contract". `save` here has a business key with the same value (the ticket id), but it is another contract.
      "audit-a-business-key-success-of-another-contract-ends-nothing"(c0) {
        const c = new Ctx(c0.fresh([p1GuardKeysFixture()]), GA);
        c.ensure(GA);
        board(c);
        lostThenGivenUp(c, "Close", { id: "t1" }, "close", "GiveUpClose");
        c.send("Save", { id: "t1", title: "X" });
        c.ack();
        c.answer("save", { apply: true });
        c.eq("save's key succeeded; close's doubt stays", [heard(c).at(-1), marks(c, GT1)], ["Done", [false, ["status"]]]);
      },
      // 4.2's precondition row: the proof is "an answer carrying that record's version v > the base it was sent with (a read, a feed frame, any write's
      // success)". A frame: hidden while the session is live (4.4), so read after the session is lost, when a doubt not ended would show again.
      "audit-a-feed-frame-past-the-sent-base-ends-a-guarded-doubt"(c0) {
        const c = new Ctx(c0.fresh([p1GuardFixture()]), GA);
        c.ensure(GA);
        board(c);
        lostThenGivenUp(c, "Save", { id: "t1", title: "B" }, "save", "GiveUpSave");
        c.do({ feed: "changes", frame: { _feed: "live", proof: "resumed" } });
        c.do({ feed: "changes", frame: { ticket: { id: "t1", title: "C", queueId: "q1", status: "open", revision: 2 } } });
        c.do({ feed: "changes", fail: { _tag: "SocketDropped" } });
        c.eq("revision 2 by a frame: ended, not hidden", [c.rec(GT1)?.data.title, ...marks(c, GT1)], ["C", false, []]);
      },
      // The same row: any write's success. `close` succeeds at revision 2, past the base `save` was sent with.
      "audit-another-writes-success-past-the-sent-base-ends-a-guarded-doubt"(c0) {
        const c = new Ctx(c0.fresh([p1GuardFixture()]), GA);
        c.ensure(GA);
        board(c);
        lostThenGivenUp(c, "Save", { id: "t1", title: "B" }, "save", "GiveUpSave");
        c.send("Close", { id: "t1" });
        c.ack();
        c.answer("close", { apply: true });
        c.eq("close landed revision 2: save's doubt ended", [c.rec(GT1)?.data.revision, ...marks(c, GT1)], [2, false, []]);
      },
      // Item 3, reachable since the runner's ruling. Q5 A: the narrowed rebase holds "only until sent"; rule 31: a retry "sends the Attempt's input and
      // `basedOn` unchanged". a's draft (a2) is overtaken by b's save, which is sent over revision 2 and lost; once b's repair settles, a2 goes and
      // succeeds at revision 3. b, already sent, keeps its base: its retry is sent over revision 2 and meets the version check.
      "audit-a-sent-write-is-not-rebased-and-its-retry-keeps-its-base"(c0) {
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
        c.eq("b goes next, over a1's revision", c.reqs("save").map((r) => [r.input.patch.title, r.input.match.revision]), [["a1", 1], ["b", 2]]);
        c.answer("save", { lost: true });
        c.answer("ticket", { never: true }); // b's handler reads the row; the person presses Retry instead
        c.answer("repair", { truth: true });
        c.eq("b's repair settled: a's draft goes, over a1's revision", c.reqs("save").at(-1)?.input.match.revision, 2);
        c.answer("save", { apply: true });
        c.eq("a2 landed revision 3", c.r.truth().server.tickets.t1.revision, 3);
        c.to(TB, "Retry", { id: "t1" });
        c.eq("b's retry keeps the base it was sent with", c.reqs("save").at(-1)?.input.match, { id: "t1", revision: 2 });
      },
      // Rule 28: "invoked only once ... it heads every queue it joined". a0's write joins r1 (free) and r2 (a1's sent hold): it waits on r2.
      "audit-a-two-record-write-waits-on-its-second-records-queue"(c0) {
        const c = new Ctx(c0.fresh([s1Fixture]), a0);
        c.ensure(a0);
        c.ensure(a1);
        s1Commit(c, a1, 2, 1);
        c.answer("w", { lost: true }, { actor: "a1" });
        s1Commit(c, a0, 3, 2);
        c.eq("not invoked while r2 is held (a1's repair runs)", c.reqs("w").length, 1);
        c.answer("repair", { truth: true });
        c.eq("then invoked", c.reqs("w").map((r) => r.input.v), [1, 2]);
      },
      // Rule 32: "a mark whose Attempt is still unresolved stays", and 4.2's business-key row ends only given-up doubts. b1's pay is held when b2's
      // pay under the same order key succeeds.
      "audit-an-unresolved-mark-stays-beside-a-business-key-success"(c0) {
        const PA = { actor: P1PayId, id: "a" };
        const c = new Ctx(c0.fresh([p1PayFixture()]), PA);
        c.ensure(PA);
        c.send("Load");
        c.answer("bills", { truth: true });
        c.send("Pay", { orderId: "o1", bill: "b1" });
        c.answer("pay", { lost: true }, { bill: "b1" });
        c.eq("held: uncertain", c.rec(billRef("b1"))?.uncertain, true);
        c.send("Pay", { orderId: "o1", bill: "b2" });
        c.answer("pay", { apply: true }, { bill: "b2" });
        c.eq("b2 paid under the same key; b1, unresolved, still uncertain", [heard(c).at(-1), c.rec(billRef("b1"))?.uncertain], ["Done", true]);
      },
      // Rule 32 and U10's cap (proposal 4.5: given-up marks per entity): an unresolved mark is not a given-up one, so it neither counts nor goes.
      "audit-an-unresolved-mark-stays-beside-a-full-cap"(c0) {
        const c = new Ctx(c0.fresh([issuesFixture], { unsettledMax: 1 }), IA);
        const I2 = issueRef("i2");
        c.ensure(IA);
        c.to(IA, "Load");
        c.answer("list", { truth: true });
        c.to(IA, "Toggle", { id: "i2", liked: true });
        c.answer("like", { lost: true }, { id: "i2" });
        c.to(IA, "Toggle", { id: "i1", liked: true });
        c.answer("like", { lost: true }, { id: "i1" });
        c.answer("repair", { truth: true }, { ref: I1 });
        c.to(IA, "CancelLike", { id: "i1" });
        c.eq("one given-up mark, at the cap: nothing evicted; i2 held", [c.r.evidence("UnsettledEvicted").length, c.rec(I1)?.uncertain, c.rec(I2)?.uncertain], [0, true, true]);
      },
      // 4.4: hidden "while" a covering session is live, "ends nothing". A session registered after the give-up hides the doubt; lost, it shows again.
      "audit-a-cover-registered-after-the-give-up-hides-and-ends-nothing"(c0) {
        const c = new Ctx(c0.fresh([p1GuardFixture()]), GA);
        c.ensure(GA);
        board(c);
        lostThenGivenUp(c, "Save", { id: "t1", title: "B" }, "save", "GiveUpSave");
        c.do({ feed: "changes", frame: { _feed: "live", proof: "resumed" } });
        c.eq("hidden", marks(c, GT1), [false, []]);
        c.do({ feed: "changes", fail: { _tag: "SocketDropped" } });
        c.eq("lost: shown again", marks(c, GT1), [false, ["title"]]);
      },
      // 4.1: the mask is for "a given-up write's doubt". A held one may still be re-sent and is never hidden.
      "audit-a-cover-does-not-hide-an-unresolved-doubt"(c0) {
        const c = new Ctx(c0.fresh([p1GuardFixture()]), GA);
        c.ensure(GA);
        board(c);
        c.do({ feed: "changes", frame: { _feed: "live", proof: "resumed" } });
        c.send("Save", { id: "t1", title: "B" });
        c.ack();
        c.answer("save", { lost: true });
        c.eq("held under a live cover: uncertain", c.rec(GT1)?.uncertain, true);
      },
      // 4.2's `.covers` row: "a live, covering session with no open gap". After an unproven re-registration the record is behind: shown.
      "audit-a-cover-with-an-open-gap-hides-nothing"(c0) {
        const c = new Ctx(c0.fresh([p1GuardFixture()]), GA);
        c.ensure(GA);
        board(c);
        c.do({ feed: "changes", frame: { _feed: "live", proof: "resumed" } });
        c.send("Save", { id: "t1", title: "B" });
        c.ack();
        c.answer("save", { lost: true });
        c.answer("repair", { truth: true });
        c.send("GiveUpSave", { id: "t1" });
        c.eq("given up, hidden", c.rec(GT1)?.uncertain, false);
        c.do({ feed: "changes", fail: { _tag: "SocketDropped" } });
        c.advance(1_000);
        c.do({ feed: "changes", frame: { _feed: "live" } });
        c.eq("live again, but behind: shown", c.rec(GT1)?.uncertain, true);
      },
      // 4.4 (and the round 3 review): a removal moves the record out of every cover, so its landing would go unheard. Never hidden.
      "audit-a-cover-does-not-hide-a-removals-doubt"(c0) {
        const c = new Ctx(c0.fresh([p1GuardFixture()]), GA);
        c.ensure(GA);
        board(c);
        c.do({ feed: "changes", frame: { _feed: "live", proof: "resumed" } });
        c.send("Remove", { id: "t1" });
        c.ack();
        c.answer("remove", { lost: true });
        c.answer("repair", { truth: true });
        c.send("GiveUpRemove", { id: "t1" });
        c.eq("given up under a live cover, not yet read: uncertain", c.rec(GT1)?.uncertain, true);
      },
      // U10 field-scoped (rule 32 as decided, proposal section 5): demoted only by a success that "carried every field the mark is on". b's save
      // carries `title` and `revision`, not `slug`, which a's given-up save predicted too.
      "audit-a-later-success-carrying-some-of-the-marks-fields-demotes-nothing"(c0) {
        const TB = { actor: P1TicketId, id: "b" };
        const c = new Ctx(c0.fresh([p1TicketFixture()]), TK);
        c.ensure(TK);
        c.ensure(TB);
        c.send("Load");
        c.answer("tickets", { truth: true });
        c.send("Save", { id: "t1", title: "New" });
        c.answer("save", { lost: true });
        c.answer("repair", { truth: true });
        c.answer("ticket", { truth: true });
        c.eq("given up, not yet read", [c.mem(TK)?.toast, c.rec(T1)?.uncertain], ["Not saved", true]);
        c.to(TB, "Save", { id: "t1", title: "X" });
        c.answer("save", { apply: true });
        c.eq("b's success carried title, not slug: still uncertain", c.rec(T1)?.uncertain, true);
      },
      // Rule 32 as decided: "uncertain until the next read". A feed frame is no read: a move's doubt (shown, the cover reads queueId) stays uncertain.
      "audit-a-feed-frame-does-not-demote-a-given-up-mark"(c0) {
        const c = new Ctx(c0.fresh([p1GuardFixture()]), GA);
        c.ensure(GA);
        board(c);
        c.do({ feed: "changes", frame: { _feed: "live", proof: "resumed" } });
        c.send("Move", { id: "t1", from: "q1", to: "q2" });
        c.ack();
        c.answer("move", { lost: true });
        c.answer("repair", { truth: true });
        c.send("GiveUpMove", { id: "t1" });
        c.eq("given up, not yet read", c.rec(GT1)?.uncertain, true);
        c.do({ feed: "changes", frame: { ticket: { id: "t1", title: "A", queueId: "q1", status: "open", revision: 1 } } });
        c.eq("a frame at the same revision: still uncertain", c.rec(GT1)?.uncertain, true);
      },
      // 4.6: the tripwire fires on "a precondition contract's first send (a re-send may replay a stored success)". The first send began over base 1
      // with revision 2 known, and was lost; the re-send succeeds on a server ignoring the filter: no contradiction.
      "audit-a-re-sent-success-over-a-known-stale-base-is-no-contradiction"(c0) {
        const c = new Ctx(c0.fresh([p1GuardLyingFixture()]), GA);
        c.ensure(GA);
        board(c);
        c.send("Save", { id: "t1", title: "B" });
        elsewhere(c, { title: "C", revision: 2 });
        board(c);
        c.ack();
        c.answer("save", { lost: true });
        c.answer("repair", { truth: true });
        c.send("RetrySave", { id: "t1" });
        for (let i = 0; i < 4 && c.r.quiet().waits.some((w) => w.kind === "ack" || w.kind === "capture"); i++) c.ack();
        c.answer("save", { apply: true });
        c.eq("re-sent, heard, no contradiction", [c.reqs("save").length, heard(c).at(-1), c.r.evidence("GuardContradicted").length], [2, "Done", 0]);
      },
      // Q2 A: "the read's failure removes the row", a gap's refetch of that read included (T7 reruns the read). t1 was deleted during the gap.
      "audit-a-gap-refetch-that-answers-the-gone-tag-removes-the-row"(c0) {
        const c = new Ctx(c0.fresh([p1QueueFixture()]), QA);
        c.ensure(QA);
        c.send("One", { id: "t1" });
        c.answer("one", { truth: true });
        c.eq("held", c.rec(Q1)?.data.title, "A");
        c.fault({ mutateServer: (s: any) => ({ tickets: { t2: s.tickets.t2 } }) });
        c.do({ feed: "changes", frame: { _feed: "live" } });
        c.eq("the gap reruns the read", c.reqs("one").length, 2);
        c.answer("one", { truth: true });
        c.eq("its TicketNotFound removes the row", c.rec(Q1), undefined);
      },
      // U10's cap (proposal 4.5): "per entity". A move's given-up marks are one Ticket and two Queues: two per entity is within a cap of 2.
      "audit-the-cap-counts-each-entity-apart"(c0) {
        const c = new Ctx(c0.fresh([p1GuardFixture()], { unsettledMax: 2 }), GA);
        c.ensure(GA);
        board(c);
        lostThenGivenUp(c, "Move", { id: "t1", from: "q1", to: "q2" }, "move", "GiveUpMove");
        c.eq("nothing evicted", [c.r.evidence("UnsettledEvicted").length, marks(c, GT1), marks(c, gQueueRef("q1")), marks(c, gQueueRef("q2"))], [0, [false, ["queueId"]], [false, ["openCount"]], [false, ["openCount"]]]);
      },
      // Rule 35's `many` bound ("a `many` key array past 4,096 items ... ends NotSent { why: "Overloaded" }, with no prediction and no queue join") and
      // U10's cap past 64 (entity-proposal-2: "4,096 per entity"): 4,097 keys are declined before any join; 65 given-up marks all stay. The cap at its
      // exact value is P1-E-CAP (4,096 open repairs are too slow for every wrong runtime's run).
      "audit-the-many-bound-is-4096-and-the-cap-is-past-64"(c0) {
        const c = new Ctx(c0.fresh([p1BulkFixture()]), BK);
        c.ensure(BK);
        c.send("CloseAll", { ids: bulkIds(4_097, "x") });
        c.eq("4,097 keys: Overloaded, nothing sent or joined", [heard(c), c.lastEnding("closeAll")?.["reason"], c.reqs("closeAll").length, c.rec(itemRef("x0"))], [["No"], "Overloaded", 0, undefined]);
        c.send("CloseAll", { ids: bulkIds(65, "i") });
        c.answer("closeAll", { lost: true });
        c.send("GiveUpAll");
        c.eq("65 given-up marks: none evicted", [c.r.evidence("UnsettledEvicted").length, c.rec(itemRef("i0"))?.uncertain], [0, true]);
      },
      // Q3 A's over-marking ("both defaults over-mark, and that is the safe direction"): t2's last-known row is in q2, but its given-up move to q1 may
      // have landed, so it may be in q1's cover. A gap marks it behind with the covered records.
      "audit-a-gap-marks-a-record-that-may-have-moved-into-the-cover"(c0) {
        const c = new Ctx(c0.fresh([p1GuardTwoFixture()]), GA);
        const GT2 = gTicketRef("t2");
        c.ensure(GA);
        board(c);
        c.send("Move", { id: "t2", from: "q2", to: "q1" });
        c.ack();
        c.answer("move", { lost: true });
        c.send("GiveUpMove", { id: "t2" });
        for (let i = 0; i < 12 && c.tryAnswer("repair", { truth: true }); i++);
        c.eq("quiet: queueId", marks(c, GT2), [false, ["queueId"]]);
        c.do({ feed: "changes", frame: { _feed: "live" } });
        c.eq("t1 (in q1) and t2 (may be) behind: every field but the key", [asSet(c.rec(GT1)?.unconfirmed), asSet(c.rec(GT2)?.unconfirmed)], [["queueId", "revision", "status", "title"], ["queueId", "revision", "status", "title"]]);
      },
    },
  },
  {
    // Audit 2: U10's cap at its value (entity-proposal-2: "4,096 per entity, oldest out", named). Apart from P1-E, so lifetime-falsify's wrong runtimes
    // do not each pay its 4,096 open repairs.
    id: "P1-E-CAP",
    kind: "bounded",
    fixtures: [p1BulkFixture()],
    actor: BK,
    cites: ["rule:32", "rule:35"],
    run(c0) {
      const c = new Ctx(c0.fresh([p1BulkFixture()]), BK);
      c.ensure(BK);
      c.send("CloseAll", { ids: bulkIds(4_096, "i") });
      c.eq("4,096 keys: sent", c.reqs("closeAll").length, 1);
      c.answer("closeAll", { lost: true });
      c.send("GiveUpAll");
      c.eq("4,096 given-up marks: none evicted", [c.r.evidence("UnsettledEvicted").length, c.rec(itemRef("i4095"))?.uncertain], [0, true]);
      c.send("Close", { id: "extra" });
      c.answer("closeOne", { lost: true });
      c.send("GiveUp", { id: "extra" });
      c.eq("one more: the oldest evicted, named", c.r.evidence("UnsettledEvicted").length, 1);
    },
  },
];
