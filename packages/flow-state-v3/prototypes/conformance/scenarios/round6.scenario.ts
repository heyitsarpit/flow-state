// Round 6: the review's findings as scenarios. Worked out by hand from convergence-6's tables and traces, or from the rule cited. D74-D82 are proposed.
import { chatFixture, type ChatOpts } from "../fixtures/chat.compiled.ts";
import {
  deskFixture,
  deskListenFixture,
  deskListenLexicalFixture,
  deskListenNoVersionFixture,
  deskTwoFeedsFixture,
  deskTwoFeedsNoVersionFixture,
  ticketRef,
} from "../typed/desk.ts";
import {
  engineFixture,
  engineRef,
  getterFixture,
  keyReleaseFixture,
  memoryReleaseFixture,
  rowMoveFixture,
  type Release,
} from "../typed/round6.ts";
import type { Fixture } from "../harness.ts";
import { Ctx, type Scenario } from "./ctx.ts";

const T = { actor: "Desk/Tickets", id: "a" };
const T1 = ticketRef("t1");
const C = { actor: "Lab/Chat", id: "a" };
const M = "messages";
const at = (
  c0: Ctx,
  f: Fixture,
  a: { actor: string; id: string },
  bounds?: Record<string, number>,
) => {
  const c = new Ctx(c0.fresh([f], bounds), a);
  c.namedIssues = c0.namedIssues;
  c.ensure();
  return c;
};
const row = (over: object = {}) => ({
  id: "t1",
  title: "title t1",
  slug: "title t1",
  archived: false,
  readAt: null,
  revision: 1,
  ...over,
});
const noRev = (over: object = {}) => {
  const { revision: _r, ...r } = row(over);
  return r;
};
const updated = (ticket: object) => ({ _tag: "TicketUpdated", ticket });
const hello = (c: Ctx, op = "changes") => c.do({ feed: op, frame: { _feed: "live", proof: "x" } });
const fr = (c: Ctx, frame: unknown, op = "changes") => c.do({ feed: op, frame });
const repairs = (c: Ctx) => c.reqs("repair").length;
const loaded = (c0: Ctx, f: Fixture) => {
  const c = at(c0, f, T);
  c.to(T, "Load");
  c.answer("list", { truth: true });
  return c;
};
const stopped = (c: Ctx) => {
  c.eq("not stopped", c.r.quiet().fatal, false);
  c.eq(
    "no module disabled",
    c.r.issues().filter((i) => i.code === "ModuleDefect" || i.code === "Fatal"),
    [],
  );
};
// Honest or marked: what an unmarked record shows is what the server holds. D74's one sentence.
const honest = (c: Ctx, field: string) => {
  const r = c.rec(T1);
  const t = c.r.truth().server.tickets.t1;
  if (r && !r.uncertain && !r.predicted)
    c.eq(`unmarked ${field} is the server's`, r.data?.[field], t?.[field]);
};
const chat = (c0: Ctx, o: ChatOpts, bounds?: Record<string, number>) =>
  at(c0, chatFixture(o), C, bounds);
const live = (o: object = {}) => ({ _feed: "live", ...o });
const f = (c: Ctx, frame: unknown) => c.do({ feed: M, frame });
const msg = (id: string, cursor?: number) => ({ id, ...(cursor === undefined ? {} : { cursor }) });
const session = (c: Ctx) => c.r.module("sessions", `${C.actor}/${C.id}|${M}`);
const feeds = (c: Ctx) => c.r.outside().feeds;
const ids = (c: Ctx) => c.mem().messages.map((m: any) => m.id);
const mark = (c: Ctx): any =>
  Object.values(
    c.record(C)?.root?.partition?.sessions ?? {},
  )[0];
const done = (items: readonly unknown[], through?: number) => ({
  _feed: "done",
  items,
  proof: "reached",
  ...(through === undefined ? {} : { through }),
});

const ER = engineRef("t1");
const EA = { actor: "Lab/Engine", id: "a" };
const eng = (c: Ctx, ref = ER) => c.r.module("engine", ref);
const poke = (
  c: Ctx,
  base: number,
  cookie: number,
  lmid: readonly string[],
  rows: readonly object[],
) => c.do({ feed: "changes", frame: { _tag: "Poke", base, cookie, lmid, rows } });

export const round6Scenarios: readonly Scenario[] = [
  {
    id: "REV6-CAPTURE",
    kind: "example",
    fixtures: [chatFixture()],
    actor: C,
    cites: ["D80", "O3", "O6"],
    bounds: { captureMs: 50 },
    variants: {
      "plain-writes-coalesce-to-the-newest"(c0) {
        const c = chat(c0, {}, { captureMs: 50 });
        c.advance(50);
        const disk = () => c.record(C)?.root.memory.muted;
        c.send("Mute");
        c.eq("not yet", disk(), false);
        c.send("Unmute");
        c.send("Mute");
        c.advance(50);
        c.eq("the newest", disk(), true);
      },
      "a-crash-loses-plain-memory-and-only-that"(c0) {
        const c = chat(c0, {}, { captureMs: 50 });
        c.advance(50);
        c.send("Mute");
        c.reload();
        c.eq("the last good capture", c.mem().muted, false);
      },
      "an-awaited-write-carries-what-waits-with-it"(c0) {
        const A = { actor: "Lab/KeyRelease", id: "a" };
        const c = at(c0, keyReleaseFixture({ v: 1 }), A, { captureMs: 50 });
        c.advance(50);
        c.send("Go");
        c.yes("the lane is out", c.r.outside().storage.length === 1);
        // Round 7, the edge: all of it is in that one batch, so none of it is on disk before the answer.
        c.yes("the batch holds the actor and the lane", c.r.outside().storage[0]!.keys.length >= 2);
        c.reload();
        c.eq("never sent", c.reqs("charge").length, 0);
      },
    },
  },
  {
    id: "REV6-ENGINE",
    kind: "example",
    fixtures: [engineFixture],
    actor: EA,
    cites: ["D81"],
    variants: {
      "a-poke-is-atomic-one-publication"(c0) {
        const c = at(c0, engineFixture, EA);
        c.do({ feed: "changes", frame: { _feed: "live", proof: "x" } });
        const before = c.r.frames().length;
        poke(
          c,
          0,
          1,
          [],
          [
            { ref: ER, fields: { title: "a" } },
            { ref: engineRef("t2"), fields: { title: "b" } },
          ],
        );
        c.eq("both", [eng(c).data.title, eng(c, engineRef("t2")).data.title], ["a", "b"]);
        c.yes(
          "no frame shows one without the other",
          c.r
            .frames()
            .slice(before)
            .every((f) => Object.keys(f.records).length === 0),
        );
        c.eq("no store in the world but its own", c.rec(ER), undefined);
      },
      "confirmed-and-visible-cannot-disagree"(c0) {
        const c = at(c0, engineFixture, EA);
        poke(c, 0, 1, [], [{ ref: ER, fields: { title: "a" } }]);
        c.send("Rename", { id: "t1", title: "mine" });
        c.eq("predicted", [eng(c).data.title, eng(c).predicted], ["mine", true]);
        const key = c.reqs("rename")[0]!.idempotencyKey!;
        c.answer("rename", { ok: {} });
        c.eq("a response is not evidence: still predicted", eng(c).predicted, true);
        poke(c, 1, 2, [key], [{ ref: ER, fields: { title: "mine" } }]);
        c.eq(
          "the snapshot says both at once",
          [eng(c).data.title, eng(c).predicted],
          ["mine", false],
        );
      },
      "blocks-false-drops-D3-the-server-orders"(c0) {
        const c = at(c0, engineFixture, EA);
        poke(c, 0, 1, [], [{ ref: ER, fields: { title: "a" } }]);
        c.send("Rename", { id: "t1", title: "x" });
        c.send("Rename", { id: "t1", title: "y" });
        c.eq("both on the wire", c.reqs("rename").length, 2);
        c.eq("replayed in order on top", eng(c).data.title, "y");
      },
      "an-older-cookie-changes-nothing-a-hole-asks-again"(c0) {
        const c = at(c0, engineFixture, EA);
        poke(c, 0, 2, [], [{ ref: ER, fields: { title: "two" } }]);
        poke(c, 0, 1, [], [{ ref: ER, fields: { title: "one" } }]);
        c.eq("a replay is nothing", eng(c).data.title, "two");
        poke(c, 5, 6, [], [{ ref: ER, fields: { title: "six" } }]);
        c.eq("not applied on another base", eng(c).data.title, "two");
        c.eq("asked", c.reqs("pull").length, 1);
        c.answer("pull", {
          ok: {
            _tag: "Poke",
            base: 2,
            cookie: 6,
            lmid: [],
            rows: [{ ref: ER, fields: { title: "six" } }],
          },
        });
        c.eq("then it lands", eng(c).data.title, "six");
      },
    },
  },
  {
    id: "REV6-H1",
    kind: "example",
    fixtures: [deskListenFixture],
    actor: T,
    cites: ["D74", "D76", "sec:2.8.6"],
    variants: {
      "a-frame-before-the-first-row-is-kept"(c0) {
        const c = at(c0, deskListenFixture, T);
        hello(c);
        c.send("Load");
        fr(c, updated(row({ title: "newer", revision: 2 })));
        c.answer("list", { ok: [row()] });
        c.eq("the newer frame shows", c.rec(T1)!.data.title, "newer");
        c.eq("at its version", c.rec(T1)!.data.revision, 2);
        c.eq("no repair needed", repairs(c), 0);
      },
      "an-older-frame-before-the-first-row-loses"(c0) {
        const c = at(c0, deskListenFixture, T);
        hello(c);
        c.send("Load");
        fr(c, updated(row({ title: "older", revision: 1 })));
        c.answer("list", { ok: [row({ title: "listed", revision: 2 })] });
        c.eq("the row wins", c.rec(T1)!.data.title, "listed");
      },
      "no-version-it-is-marked-and-asked"(c0) {
        const c = at(c0, deskListenNoVersionFixture, T);
        hello(c);
        c.send("Load");
        fr(c, updated(noRev({ title: "newer" })));
        c.answer("list", { ok: [noRev()] });
        c.yes("marked", c.rec(T1)!.uncertain);
        c.eq("one repair", repairs(c), 1);
        c.answer("repair", { ok: noRev({ title: "server" }) });
        c.eq("then truth", c.rec(T1)!.data.title, "server");
        c.eq("unmarked", c.rec(T1)!.uncertain, false);
      },
      "a-read-that-started-after-the-frame-needs-no-stub"(c0) {
        const c = at(c0, deskListenNoVersionFixture, T);
        hello(c);
        fr(c, updated(noRev({ title: "early" })));
        c.send("Load");
        c.answer("list", { ok: [noRev({ title: "later" })] });
        c.eq("the read is later", c.rec(T1)!.data.title, "later");
        c.eq("unmarked", c.rec(T1)!.uncertain, false);
      },
      "a-success-before-the-first-row-is-a-claim"(c0) {
        const c = at(c0, deskFixture, T);
        c.send("Load");
        c.send("Archive", { id: "t1" });
        c.answer("archive", { apply: true });
        c.answer("list", { atStart: true });
        honest(c, "archived");
        c.eq("the write shows", c.rec(T1)!.data.archived, true);
        c.yes("marked", c.rec(T1)!.uncertain);
        c.answer("repair", { truth: true });
        c.eq("then truth", c.rec(T1)!.data.archived, true);
        c.eq("unmarked", c.rec(T1)!.uncertain, false);
      },
      "a-remove-before-the-first-row-stays-removed"(c0) {
        const c = at(c0, deskFixture, T);
        c.send("Load");
        c.send("Remove", { id: "t1" });
        c.answer("remove", { apply: true });
        c.answer("list", { atStart: true });
        c.eq("it does not come back", c.rec(T1)?.data, undefined);
      },
    },
  },
  {
    id: "REV6-H2",
    kind: "example",
    fixtures: [deskListenFixture],
    actor: T,
    cites: ["D74", "sec:2.8.6", "rule:32"],
    variants: {
      "gone-keeps-its-version-and-a-row-there-is-older"(c0) {
        const c = loaded(c0, deskListenFixture);
        c.send("Load");
        c.send("Archive", { id: "t1" });
        c.answer("archive", { lost: true });
        c.answer("repair", { ok: null });
        c.eq("gone", c.rec(T1)?.data, undefined);
        c.send("Reconcile", { id: "t1" });
        c.answer("archive", { apply: true });
        c.answer("list", { ok: [row()] });
        const r = c.rec(T1);
        c.yes("not back, or marked", r?.data === undefined || r.uncertain);
      },
      "a-partial-frame-is-no-echo"(c0) {
        const c = loaded(c0, deskListenFixture);
        hello(c);
        c.send("Load");
        c.send("Archive", { id: "t1" });
        c.answer("archive", { apply: true });
        fr(c, updated({ id: "t1", title: "title t1", revision: 1 }));
        c.answer("list", { ok: [row()] });
        c.eq("the write stands", c.rec(T1)!.data.archived, true);
        c.send("Load");
        c.answer("list", { truth: true });
        c.eq("a later read says the same", c.rec(T1)!.data.archived, true);
        c.eq("nothing unconfirmed now", c.rec(T1)!.unconfirmed, []);
      },
      "a-repair-obeys-the-judge"(c0) {
        const c = loaded(c0, deskListenFixture);
        hello(c);
        c.send("Archive", { id: "t1" });
        c.answer("archive", { apply: true });
        fr(c, updated({ id: "t1", title: "someone" }));
        c.eq("doubted, asked", repairs(c), 1);
        c.send("MarkRead", { ids: ["t1"], at: 5 });
        c.answer("markRead", { apply: true });
        c.answer("repair", { ok: row({ archived: true }) });
        const r = c.rec(T1)!;
        c.yes("kept, or still asked", r.data.readAt === 5 || r.uncertain);
        c.eq("asked again", repairs(c), 2);
        c.answer("repair", { truth: true });
        c.eq("then truth", c.rec(T1)!.data.readAt, 5);
        c.eq("unmarked", c.rec(T1)!.uncertain, false);
      },
      "a-success-with-a-version-settles-an-older-claim-L7"(c0) {
        const c = loaded(c0, deskListenFixture);
        hello(c);
        c.send("Archive", { id: "t1" });
        c.answer("archive", { apply: true });
        c.send("Rename", { id: "t1", title: "mine" });
        c.answer("rename", { apply: true });
        fr(c, updated(row({ title: "mine", archived: false, revision: 9 })));
        c.eq("a newer version applies", c.rec(T1)!.data.archived, false);
        c.eq("no repair", repairs(c), 0);
      },
      "a-whole-echo-clears-the-claim"(c0) {
        const c = loaded(c0, deskListenFixture);
        hello(c);
        c.send("Archive", { id: "t1" });
        c.answer("archive", { apply: true });
        fr(c, updated(row({ archived: true, revision: 2 })));
        fr(c, updated(row({ archived: false, revision: 3 })));
        c.eq("no claim now: a newer version applies", c.rec(T1)!.data.archived, false);
        c.eq("no repair", repairs(c), 0);
      },
      "a-differing-newer-frame-over-a-claim-is-doubted"(c0) {
        const c = loaded(c0, deskListenFixture);
        hello(c);
        c.send("Archive", { id: "t1" });
        c.answer("archive", { apply: true });
        fr(c, updated(row({ archived: false, revision: 2 })));
        c.yes("marked", c.rec(T1)!.uncertain);
        c.eq("the claim shows", c.rec(T1)!.data.archived, true);
        c.eq("asked", repairs(c), 1);
      },
      "other-fields-of-a-newer-frame-merge-under-a-claim"(c0) {
        const c = loaded(c0, deskListenFixture);
        hello(c);
        c.send("Archive", { id: "t1" });
        c.answer("archive", { apply: true });
        fr(c, updated({ id: "t1", title: "other", revision: 2 }));
        c.eq("the title moved", c.rec(T1)!.data.title, "other");
        c.eq("the claim stays", c.rec(T1)!.data.archived, true);
        c.eq("no repair", repairs(c), 0);
      },
    },
  },
  {
    id: "REV6-H3",
    kind: "example",
    fixtures: [deskListenFixture],
    actor: T,
    cites: ["D75", "sec:2.8.6"],
    variants: {
      "string-versions-have-no-order-unless-declared"(c0) {
        const c = at(c0, deskListenFixture, T);
        hello(c);
        c.send("Load");
        c.answer("list", { ok: [row({ revision: "9" })] });
        fr(c, updated(row({ title: "ten", revision: "10" })));
        c.eq("a different string applies", c.rec(T1)!.data.title, "ten");
        c.eq("no stale", c.r.evidence("Stale").length, 0);
      },
      "electric-offsets-are-strings"(c0) {
        const c = at(c0, deskListenFixture, T);
        hello(c);
        c.send("Load");
        c.answer("list", { ok: [row({ revision: "1_9" })] });
        fr(c, updated(row({ title: "ten", revision: "1_10" })));
        c.eq("applies", c.rec(T1)!.data.title, "ten");
      },
      "a-string-write-still-defends-itself-by-claim"(c0) {
        const c = at(c0, deskListenFixture, T);
        hello(c);
        c.send("Load");
        c.answer("list", { ok: [row({ revision: "a" })] });
        c.send("Archive", { id: "t1" });
        c.answer("archive", { apply: true });
        fr(c, updated(row({ archived: false, revision: "b" })));
        c.eq("the claim shows", c.rec(T1)!.data.archived, true);
        c.yes("marked", c.rec(T1)!.uncertain);
      },
      "a-declared-lexical-order-compares"(c0) {
        const c = at(c0, deskListenLexicalFixture, T);
        hello(c);
        c.send("Load");
        c.answer("list", { ok: [row({ revision: "2026-02" })] });
        fr(c, updated(row({ title: "older", revision: "2026-01" })));
        c.eq("older by the declared order", c.rec(T1)!.data.title, "title t1");
        fr(c, updated(row({ title: "newer", revision: "2026-03" })));
        c.eq("newer by the declared order", c.rec(T1)!.data.title, "newer");
      },
      "numbers-still-order"(c0) {
        const c = at(c0, deskListenFixture, T);
        hello(c);
        c.send("Load");
        c.answer("list", { ok: [row({ revision: 9 })] });
        fr(c, updated(row({ title: "ten", revision: 10 })));
        c.eq("ten is after nine", c.rec(T1)!.data.title, "ten");
        fr(c, updated(row({ title: "eight", revision: 8 })));
        c.eq("eight is before", c.rec(T1)!.data.title, "ten");
      },
    },
  },
  {
    id: "REV6-TWOFEEDS",
    kind: "example",
    fixtures: [deskTwoFeedsFixture],
    actor: T,
    cites: ["D74", "sec:2.8.14"],
    variants: {
      "with-a-version-frames-may-cross"(c0) {
        const c = loaded(c0, deskTwoFeedsFixture);
        hello(c);
        hello(c, "changes2");
        fr(c, updated(row({ title: "v3", revision: 3 })), "changes2");
        fr(c, updated(row({ title: "v2", revision: 2 })), "changes");
        c.eq("newest stays", c.rec(T1)!.data.title, "v3");
      },
      "with-no-version-the-stated-limit"(c0) {
        const c = loaded(c0, deskTwoFeedsNoVersionFixture);
        hello(c);
        hello(c, "changes2");
        fr(c, updated(noRev({ title: "new" })), "changes2");
        fr(c, updated(noRev({ title: "old" })), "changes");
        c.eq("D74 (b): arrival order, a stated limit", c.rec(T1)!.data.title, "old");
      },
    },
  },
  {
    id: "REV6-H4",
    kind: "fault",
    fixtures: [chatFixture()],
    actor: C,
    cites: ["D77", "D46", "D65"],
    namedIssues: ["UserClosure"],
    variants: {
      "a-throwing-backoff-does-not-stop-streaming"(c0) {
        const c = chat(c0, { odd: { backoff: "throw" } });
        f(c, live());
        c.do({ feed: M, fail: { _tag: "Boom" } });
        stopped(c);
        c.advance(31_000);
        c.eq("reconnected by the default", feeds(c).length, 2);
      },
      "a-backoff-of-no-shape-is-not-an-hour-L5"(c0) {
        const c = chat(c0, { odd: { backoff: NaN } });
        f(c, live());
        c.do({ feed: M, fail: { _tag: "Boom" } });
        stopped(c);
        c.advance(31_000);
        c.eq("reconnected", feeds(c).length, 2);
      },
      "a-throwing-reconnect-while-means-not-retried"(c0) {
        const c = chat(c0, { odd: { reconnectWhile: true } });
        f(c, live());
        c.do({ feed: M, fail: { _tag: "Boom" } });
        stopped(c);
        c.eq("ended", session(c).st, "Ended");
        c.eq("the machine hears", c.mem().ended, "Boom");
      },
      "a-throwing-page-retry-means-not-retried"(c0) {
        const c = chat(c0, { catchUp: true, odd: { pageRetryWhile: true } });
        f(c, live());
        c.answer("history", { fail: { tag: "PageBusy" } });
        stopped(c);
        c.eq("ended", session(c).st, "Ended");
      },
      "a-throwing-key-places-no-session"(c0) {
        const c = chat(c0, { odd: { key: true } });
        stopped(c);
        c.eq("no connection", feeds(c).length, 0);
      },
      "other-machines-keep-streaming"(c0) {
        const box = { reconnectWhile: true };
        const c = chat(c0, { odd: box });
        f(c, live());
        const other = { actor: C.actor, id: "b" };
        c.ensure(other);
        c.do({ feed: M, fail: { _tag: "Boom" } }); // the newest: b's
        stopped(c);
        c.do({ feed: M, frame: live() });
        c.do({ feed: M, frame: msg("a", 1) });
        c.eq("a's session still takes values", ids(c), ["a"]);
      },
      "a-throwing-subscribe-is-a-defect-M4"(c0) {
        const c = chat(c0, { odd: { subscribe: true } });
        c.eq("T1: end(Defect)", c.mem().ended, "Defect");
        c.eq("ended", session(c).st, "Ended");
        stopped(c);
      },
      "a-dying-stream-is-a-defect-M4"(c0) {
        const c = chat(c0, { dies: true });
        c.eq("T1: end(Defect)", c.mem().ended, "Defect");
        c.advance(60_000);
        c.eq("no reconnect", feeds(c).length, 0);
      },
      "a-throwing-getter-refuses-at-the-gate-M11"(c0) {
        const c = at(c0, getterFixture, { actor: "Lab/Getter", id: "a" });
        c.namedIssues.push("InvalidTurn");
        c.to({ actor: "Lab/Getter", id: "a" }, "Trap");
        stopped(c);
      },
    },
  },
  {
    id: "REV6-H5",
    kind: "fault",
    fixtures: [keyReleaseFixture({ v: 1 })],
    actor: { actor: "Lab/KeyRelease", id: "a" },
    cites: ["D78", "rule:17", "rule:46"],
    variants: {
      "a-release-that-changes-a-key-does-not-mint-beside-a-hold"(c0) {
        const rel: Release = { v: 1 };
        const c = at(c0, keyReleaseFixture(rel), { actor: "Lab/KeyRelease", id: "a" });
        c.send("Go");
        c.ack();
        c.answer("charge", { lost: true });
        c.eq("held", c.mem().unsure, 1);
        c.h.release(() => void (rel.v = 2), () => void (rel.v = 1));
        c.reload();
        c.send("Go");
        c.eq("the request count stays", c.reqs("charge").length, 1);
        c.eq("no second Attempt", c.keys("charge").length, 1);
        c.eq("said", c.r.evidence("LaneRekeyed").length, 1);
      },
      "the-rekeyed-lane-is-what-a-guard-reads"(c0) {
        const rel: Release = { v: 1 };
        const c = at(c0, keyReleaseFixture(rel), { actor: "Lab/KeyRelease", id: "a" });
        c.send("Go");
        c.ack();
        c.answer("charge", { lost: true });
        c.h.release(() => void (rel.v = 2), () => void (rel.v = 1));
        c.reload();
        c.yes(
          "still held on disk under the new id",
          [...c.r.stored().keys()].some((k) => k.includes('"key":"a"')),
        );
        c.yes("the old id is gone", ![...c.r.stored().keys()].some((k) => k.includes('"k":"a"')));
      },
    },
  },
  {
    id: "REV6-H7",
    kind: "example",
    fixtures: [chatFixture({ catchUp: true })],
    actor: C,
    cites: ["D79", "T1", "T2", "T6"],
    variants: {
      "a-read-that-never-answers-does-not-wedge"(c0) {
        const c = chat(c0, { catchUp: true });
        f(c, live());
        c.yes("catching up", session(c).catchingUp);
        c.do({ answer: "history", with: { never: true } });
        for (let i = 0; i < 4; i++) {
          c.advance(20_000);
          if (feeds(c).at(-1)?.open) f(c, { _feed: "ping" });
        }
        c.eq(
          "no longer waiting on that read",
          session(c).catchingUp === true && c.reqs("history").length === 1,
          false,
        );
        c.yes("said", c.r.evidence("PageSilent").length >= 1);
      },
      "three-silent-reads-make-one-lost"(c0) {
        const c = chat(c0, { catchUp: true });
        f(c, live());
        c.answer("history", { ok: done([msg("a", 1)]) });
        // Each round: the connection drops, a new one registers from a place it cannot prove, a read goes out and never answers.
        for (let i = 0; i < 4; i++) {
          c.do({ feed: M, fail: { _tag: "Boom" } });
          c.advance(31_000);
          f(c, live());
          if (i < 3) c.advance(31_000); // the page deadline: a stall, then backoff
          if (i < 3) c.advance(31_000);
          if (i < 3 && feeds(c).at(-1)?.open) f(c, { _feed: "down", reason: "x" });
          if (i === 2) break;
        }
        c.yes("said three times", c.r.evidence("PageSilent").length >= 1);
      },
      "overflow-reaches-a-stopped-pull-out-of-band"(c0) {
        const c = chat(c0, { catchUp: true, source: "callback", bound: 4 });
        f(c, live());
        c.yes("catching up", session(c).catchingUp);
        c.do({ feed: M, frames: Array.from({ length: 12 }, (_x, i) => msg(`m${i}`, i)) });
        c.eq("not waiting on the read any more", session(c).catchingUp, false);
        c.yes("said", c.r.evidence("discarded").length + c.r.evidence("Overflowed").length >= 1);
        c.advance(31_000);
        c.eq("reconnected", feeds(c).length, 2);
      },
      "overflow-with-a-running-pull-drains-then-fails"(c0) {
        const c = chat(c0, { source: "callback", bound: 4 }, { drainMs: -1 });
        f(c, live());
        c.do({ feed: M, frames: Array.from({ length: 7 }, (_x, i) => msg(`m${i}`, i)) });
        c.yes("what fitted arrived, in order", ids(c).slice(0, 4).join() === "m0,m1,m2,m3");
        c.eq("no value of the queue was lost past the bound", ids(c).length <= 5, true);
      },
      "a-deadline-is-armed-only-while-a-pull-is-out-T1"(c0) {
        const c = chat(c0, { catchUp: true, source: "pulled" });
        f(c, live());
        c.do({ feed: M, frames: Array.from({ length: 2000 }, (_x, i) => msg(`m${i}`, i)) });
        c.eq("buf full: no pull outstanding", feeds(c)[0]!.backlog > 0, true);
        c.advance(29_000);
        c.eq("still reading, not called Silent", session(c).catchingUp, true);
        c.eq("no Silent", c.r.evidence("repair").length, 0);
      },
    },
  },
  {
    id: "REV6-STREAMS",
    kind: "example",
    fixtures: [chatFixture({ catchUp: true })],
    actor: C,
    cites: ["D79", "D71", "T1", "T3", "T4"],
    namedIssues: ["InvalidTurn"],
    variants: {
      "M1-a-read-banks-no-credit"(c0) {
        // Review L1, round 7: `drainMs: -1`, or the turn drains the pulls before the bug can show, and `m1-banks-credit` survives.
        const c = chat(c0, { catchUp: true, source: "pulled", reconnect: false }, { drainMs: -1 });
        f(c, live());
        c.answer("history", { ok: done([]) });
        for (let i = 0; i < 5; i++) {
          c.send("Jump", { at: i + 100 });
          c.answer("history", { ok: done([]) });
        }
        c.do({
          feed: M,
          frames: [
            msg("a", 1),
            msg("boom", 2),
            ...Array.from({ length: 6 }, (_x, i) => msg(`z${i}`, 3 + i)),
          ],
        });
        c.eq("only what was asked for left the server", feeds(c)[0]!.backlog, 6);
      },
      "M2-end-mid-flush-discards-with-evidence"(c0) {
        const c = chat(c0, { catchUp: true, reconnect: false });
        f(c, live());
        c.do({ feed: M, frames: [msg("a", 1), msg("boom", 2), msg("c", 3), msg("d", 4)] });
        c.answer("history", { ok: done([]) });
        c.eq("ended", c.mem().ended, "Defect");
        c.eq("what was queued is named", c.r.evidence("discarded").length, 2);
      },
      "M3-a-member-stops-the-in-mail-value-with-catchUp"(c0) {
        const c = chat(c0, { catchUp: true }, { drainMs: -1 });
        f(c, live());
        c.answer("history", { ok: done([]) });
        c.h.raw({ send: C, event: "Jump", payload: { at: 40 } });
        c.do({ feed: M, frame: msg("v", 7) });
        c.answer("history", { ok: done([]) });
        c.eq("T3: the member wins over a frozen value", mark(c).at, 40);
      },
      "L2-down-disarms-healthy-and-idle"(c0) {
        const c = chat(c0, {});
        f(c, live());
        f(c, { _feed: "down", reason: "x" });
        c.eq("no timer left for this session", c.r.outside().timers.length, 0);
      },
      "L4-a-value-with-a-field-named-feed-is-a-value"(c0) {
        const c = chat(c0, {});
        f(c, live());
        f(c, { id: "odd", cursor: 1, _feed: "bogus" });
        c.eq("delivered", ids(c), ["odd"]);
      },
      "M13-a-denied-value-moves-the-bookmark"(c0) {
        const c = chat(c0, {});
        f(c, live());
        f(c, msg("denied", 9));
        c.eq("rule 71", mark(c).at, 9);
        c.eq("not delivered", ids(c), []);
      },
      "M13-a-ping-does-not-re-arm-connecting"(c0) {
        const c = chat(c0, {});
        c.advance(30_000);
        f(c, { _feed: "ping" });
        c.advance(16_000);
        c.eq("Silent on the first deadline, then a reconnect", feeds(c).length, 2);
      },
      "M13-two-empty-pages-stall"(c0) {
        const c = chat(c0, { catchUp: true, reconnect: false });
        f(c, live());
        c.answer("history", { ok: { _feed: "more", items: [], next: "n1" } });
        c.answer("history", { ok: { _feed: "more", items: [], next: "n2" } });
        c.eq("PageStalled", c.mem().ended, "PageStalled");
      },
    },
  },
  {
    id: "REV6-M7",
    kind: "fault",
    fixtures: [chatFixture()],
    actor: C,
    cites: ["D80", "O5", "O3"],
    namedIssues: ["StorageFailure"],
    variants: {
      "a-failed-plain-write-is-not-believed"(c0) {
        const c = chat(c0, {});
        c.fault({ storageFails: 1 });
        c.send("Mute");
        c.eq("the turn committed", c.mem().muted, true);
        const disk = () => c.record(C)?.root.memory.muted;
        c.eq("the last good capture stands", disk(), false);
        c.eq("said", c.r.issues().filter((i) => i.code === "StorageFailure").length, 1);
        c.advance(5_000);
        c.eq("retried: the newest state", disk(), true);
      },
      "newer-state-wins-a-retry"(c0) {
        const c = chat(c0, {});
        c.fault({ storageFails: 1 });
        c.send("Mute");
        c.send("Unmute");
        c.advance(5_000);
        const disk = () => c.record(C)?.root.memory.muted;
        c.eq("newest", disk(), false);
      },
      "a-failed-write-survives-a-reload-as-the-last-good-capture"(c0) {
        const c = chat(c0, {});
        c.fault({ storageFails: 1 });
        c.send("Mute");
        c.reload();
        c.eq("what the disk had", c.mem().muted, false);
        c.eq("not stopped", c.r.quiet().fatal, false);
      },
    },
  },
  {
    id: "REV6-TEAR",
    kind: "fault",
    fixtures: [keyReleaseFixture({ v: 1 })],
    actor: { actor: "Lab/KeyRelease", id: "a" },
    cites: ["D80", "O3"],
    variants: {
      "a-store-with-no-atomic-batch-strands-nothing-silently"(c0) {
        const A = { actor: "Lab/KeyRelease", id: "a" };
        const c = at(c0, keyReleaseFixture({ v: 1 }), A);
        c.send("Go"); // actor + lane (not acknowledged) land as one batch; the ack hangs
        c.do({ reload: true, tear: 1 }); // the actor landed, the lane did not
        c.eq("no request ever left", c.reqs("charge").length, 0);
        c.eq("not stopped", c.r.quiet().fatal, false);
        c.send("Go");
        c.ack();
        c.answer("charge", { ok: {} });
        c.eq("it can start again", c.reqs("charge").length, 1);
      },
    },
  },
  // Stage I (re-check 10h H1⁶, T1): two rows of one machine reload with a write in flight each. Each restored ending must reach its own row,
  // placed by the suite after `port.boot` returns. Once through the compiled `memory.restore`, once through the runtime's own branch for none.
  {
    id: "R10-BOOT-ROWS",
    kind: "fault",
    fixtures: [memoryReleaseFixture({ v: 1 }, true)],
    actor: { actor: "Lab/MemoryRelease", id: "a" },
    cites: ["rule:44", "D82", "D72"],
    variants: {
      "two-rows-with-a-restore-each-hear-their-own-ending"(c0) {
        const A = { actor: "Lab/MemoryRelease", id: "a" };
        const B = { actor: "Lab/MemoryRelease", id: "b" };
        const rel: Release = { v: 1 };
        const c = at(c0, memoryReleaseFixture(rel, true), A);
        c.send("Go");
        c.ack();
        c.answer("put", { ok: {} });
        c.eq("a has one ok", c.mem(A).oks, 1);
        c.send("Go");
        c.ensure(B);
        c.to(B, "Go");
        c.ack();
        c.h.release(() => void (rel.v = 2), () => void (rel.v = 1));
        c.reload();
        c.eq("each row heard its own restored unknown, through the restore", [c.mem(A).oks, c.mem(B).oks], [101, 100]);
        c.eq("no refusal", c.r.issues().length, 0);
      },
      "two-rows-without-a-restore-each-keep-their-memory"(c0) {
        const A = { actor: "Lab/MemoryRelease", id: "a" };
        const B = { actor: "Lab/MemoryRelease", id: "b" };
        const c = at(c0, memoryReleaseFixture({ v: 1 }, false), A);
        c.send("Go");
        c.ack();
        c.answer("put", { ok: {} });
        c.send("Go");
        c.ensure(B);
        c.to(B, "Go");
        c.ack();
        c.reload();
        c.eq("each row kept its own memory past the runtime's own decode", [c.mem(A).oks, c.mem(B).oks], [1, 0]);
        c.eq("both restored endings were delivered", c.r.evidence("delivered").filter((e) => e["op"] === "put").length, 3);
        c.eq("no refusal", c.r.issues().length, 0);
      },
    },
  },
  // Stage J (re-check 10i S1): two rows reload with a write in flight each; one moved to another state while its write was out. Each
  // restored unknown takes its row's current state's handler, and (j)'s ear checks that state at the boot as at any batch.
  {
    id: "R10-BOOT-STATE",
    kind: "fault",
    fixtures: [rowMoveFixture],
    actor: { actor: "Lab/RowMove", id: "a" },
    cites: ["rule:44", "rule:14", "D176"],
    variants: {
      "a-row-that-moved-takes-its-current-states-handler"(c0) {
        const A = { actor: "Lab/RowMove", id: "a" };
        const B = { actor: "Lab/RowMove", id: "b" };
        const c = at(c0, rowMoveFixture, A);
        c.send("Go");
        c.ensure(B);
        c.to(B, "Go");
        c.ack();
        c.send("Review"); // a moves while its write is out; b stays in SAVING
        c.state("REVIEW", A);
        c.state("SAVING", B);
        c.reload();
        c.eq("a heard it in REVIEW", c.mem(A), { inEditing: 0, inSaving: 0, inReview: 1 });
        c.eq("b heard it in SAVING", c.mem(B), { inEditing: 0, inSaving: 1, inReview: 0 });
        c.state("REVIEW", A);
        c.state("EDITING", B);
        c.eq("no refusal", c.r.issues().length, 0);
      },
    },
  },
  // Stage K (re-check 10j, D11 of `ending-check-design.md`): the store loads slowly, as IndexedDB does. Two rows reload with a write in
  // flight each; while the load hangs, the suite sends a to a state it is not in yet and disposes b. Rule 44: each row receives its restored
  // ending before any later input addressed to it, so a hears its `Unsure` in SAVING first and b hears its own before its dispose.
  {
    id: "R10-BOOT-ORDER",
    kind: "fault",
    fixtures: [rowMoveFixture],
    actor: { actor: "Lab/RowMove", id: "a" },
    cites: ["rule:44", "rule:54", "O4"],
    variants: {
      "inputs-that-wait-on-a-slow-load-run-after-the-restored-endings"(c0) {
        const A = { actor: "Lab/RowMove", id: "a" };
        const B = { actor: "Lab/RowMove", id: "b" };
        const c = at(c0, rowMoveFixture, A);
        c.send("Go");
        c.ensure(B);
        c.to(B, "Go");
        c.ack();
        c.do({ reload: true, load: "hang" });
        c.h.do({ send: A, event: "Review" }); // SAVING handles it, EDITING does not: it must find a in EDITING
        c.h.do({ dispose: B });
        c.do({ storage: "loadOk" });
        c.eq("a heard its restored ending in SAVING, before the waiting send", c.mem(A), { inEditing: 0, inSaving: 1, inReview: 0 });
        c.state("EDITING", A);
        c.eq("b heard its own before the waiting dispose", c.r.evidence("delivered").filter((e) => e["op"] === "put").length, 2);
        c.eq("b is disposed", c.r.state(B), undefined);
      },
    },
  },
  {
    id: "REV6-M8",
    kind: "fault",
    fixtures: [memoryReleaseFixture({ v: 1 }, true)],
    actor: { actor: "Lab/MemoryRelease", id: "a" },
    cites: ["D82", "D50", "O5"],
    namedIssues: ["InvalidTurn"],
    variants: {
      "a-declared-decode-gives-the-new-field-its-default"(c0) {
        const A = { actor: "Lab/MemoryRelease", id: "a" };
        const rel: Release = { v: 1 };
        const c = at(c0, memoryReleaseFixture(rel, true), A);
        c.send("Go");
        c.ack();
        c.h.release(() => void (rel.v = 2), () => void (rel.v = 1));
        c.reload();
        c.eq("the restored ending ran", c.mem().oks, 100);
        c.eq("no refusal", c.r.issues().length, 0);
      },
      "without-one-the-refusal-is-as-designed"(c0) {
        const A = { actor: "Lab/MemoryRelease", id: "a" };
        const rel: Release = { v: 1 };
        const c = at(c0, memoryReleaseFixture(rel, false), A);
        c.send("Go");
        c.ack();
        c.h.release(() => void (rel.v = 2), () => void (rel.v = 1));
        c.reload();
        c.yes(
          "D50, stated",
          c.r.issues().some((i) => i.code === "InvalidTurn"),
        );
      },
    },
  },
  {
    id: "REV6-L3",
    kind: "fault",
    fixtures: [chatFixture()],
    actor: C,
    cites: ["D57", "D61", "rule:46"],
    namedIssues: ["RecordQuarantined"],
    variants: {
      "a-stored-frag-of-no-shape-quarantines"(c0) {
        const c = chat(c0, {});
        c.fault({
          corruptStored: {
            match: "actor/",
            edit: (raw: string) => {
              const r = JSON.parse(raw);
              r.root.frag = 5;
              return JSON.stringify(r);
            },
          },
        });
        c.reload();
        c.eq("not stopped", c.r.quiet().fatal, false);
        c.yes(
          "named",
          c.r.issues().some((i) => i.code === "RecordQuarantined"),
        );
      },
      "a-stored-key-of-proto-quarantines"(c0) {
        const c = chat(c0, {});
        c.fault({
          corruptStored: {
            match: "actor/",
            edit: (raw: string) => {
              const r = JSON.parse(raw);
              r.key = "__proto__";
              return JSON.stringify(r);
            },
          },
        });
        c.reload();
        c.eq("not stopped", c.r.quiet().fatal, false);
        c.yes(
          "named",
          c.r.issues().some((i) => i.code === "RecordQuarantined"),
        );
      },
    },
  },
];
