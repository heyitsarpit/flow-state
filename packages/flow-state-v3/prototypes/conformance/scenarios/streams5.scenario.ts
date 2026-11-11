// Streams beyond the spike: a pulled source, catchUp and Repairing, Flapping, Overflow, `listen` on the version answer, `latest`. Worked
// out by hand from Streams T1-T7. Thin where it says so.
import {
  deskListenFixture,
  deskListenNoVersionFixture,
  ticketRef,
} from "../typed/desk.ts";
import { chatFixture, presenceFixture } from "../typed/chat.ts";
import type { Fixture } from "../harness.ts";
import { Ctx, type Scenario } from "./ctx.ts";

const C = { actor: "Lab/Chat", id: "a" };
const P = { actor: "Lab/Presence", id: "a" };
const T = { actor: "Desk/Tickets", id: "a" };
const T1 = ticketRef("t1");
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
const msg = (id: string, cursor?: number) => ({ id, ...(cursor === undefined ? {} : { cursor }) });
const live = (o: object = {}) => ({ _feed: "live", ...o });
const f = (c: Ctx, frame: unknown) => c.do({ feed: M, frame });
const feeds = (c: Ctx) => c.r.outside().feeds;
const lastFrom = (c: Ctx) => feeds(c).at(-1)?.from;
const row = (c: Ctx) => c.r.module("sessions", `${C.actor}/${C.id}|${M}`);
const ids = (c: Ctx) => c.mem().messages.map((m: any) => m.id);
const mark = (c: Ctx): any =>
  Object.values(
    c.record(C)?.root?.partition?.sessions ?? {},
  )[0];
const hist = (c: Ctx, ok: object) => c.answer("history", { ok });
const done = (items: readonly unknown[], through?: number) => ({
  _feed: "done",
  items,
  proof: "reached",
  ...(through === undefined ? {} : { through }),
});
const more = (items: readonly unknown[], next: unknown, through?: number) => ({
  _feed: "more",
  items,
  next,
  ...(through === undefined ? {} : { through }),
});

export const streams5Scenarios: readonly Scenario[] = [
  {
    id: "STREAM5-PULL",
    kind: "example",
    fixtures: [chatFixture({ source: "pulled" })],
    actor: C,
    cites: ["D71", "T4:every", "rule:69"],
    namedIssues: ["InvalidTurn"],
    variants: {
      "a-pulled-source-waits-for-the-turn"(c0) {
        const c = at(c0, chatFixture({ source: "pulled", reconnect: false }), C);
        f(c, live());
        c.do({
          feed: M,
          frames: [msg("a", 1), msg("boom", 2), msg("c", 3), msg("d", 4), msg("e", 5)],
        });
        c.eq("the second turn refused: end(Defect)", c.mem().ended, "Defect");
        c.eq("only what was asked for left the server", feeds(c)[0]!.backlog, 3);
        c.eq("delivered", ids(c), ["a"]);
      },
      "every-value-still-arrives-in-order"(c0) {
        const c = at(c0, chatFixture({ source: "pulled" }), C);
        f(c, live());
        c.do({ feed: M, frames: [1, 2, 3, 4].map((i) => msg(`m${i}`, i)) });
        c.eq("all", ids(c), ["m1", "m2", "m3", "m4"]);
        c.eq("the bookmark follows", mark(c)?.at, 4);
      },
      "a-closed-source-ends-its-pull"(c0) {
        const c = at(c0, chatFixture({ source: "pulled" }), C);
        f(c, live());
        c.do({ feed: M, end: true });
        c.eq("waiting", row(c).st, "Waiting");
        c.advance(1000);
        c.eq("again", feeds(c).length, 2);
      },
    },
  },
  {
    id: "STREAM5-REPAIR",
    kind: "example",
    fixtures: [chatFixture({ catchUp: true })],
    actor: C,
    cites: ["T1:Repairing", "T2:3", "T2:6", "T3:settle", "T4:every", "rule:71"],
    variants: {
      "first-open-reads-and-the-record-is-made-at-complete"(c0) {
        const c = at(c0, chatFixture({ catchUp: true }), C);
        f(c, live({ head: 3 }));
        c.eq("catching up", [row(c).connection, row(c).catchingUp], ["Live", true]);
        c.eq("T2 row 3: nothing written", mark(c), undefined);
        hist(c, done([msg("a", 1), msg("b", 2)], 3));
        c.eq("delivered", ids(c), ["a", "b"]);
        c.eq("settled", mark(c)?.at, 3);
        c.eq("no notice", c.mem().notices, 0);
        c.eq("Live", row(c).st, "Live");
      },
      "values-buffer-during-a-read-and-flush-after-its-pages"(c0) {
        const c = at(c0, chatFixture({ catchUp: true }), C);
        f(c, live());
        f(c, msg("live1", 10));
        c.eq("buffered", [ids(c), row(c).buffered], [[], 1]);
        hist(c, done([msg("old", 1)], 5));
        c.eq("pages, then the buffer", ids(c), ["old", "live1"]);
        c.eq("the buffer moves it", mark(c)?.at, 10);
      },
      "a-page-item-does-not-move-the-bookmark-through-does"(c0) {
        const c = at(c0, chatFixture({ catchUp: true }), C);
        f(c, live());
        hist(c, done([]));
        f(c, msg("a", 7));
        c.do({ feed: M, end: true });
        c.advance(1000);
        c.eq("from the bookmark", lastFrom(c), 7);
        f(c, live());
        c.eq(
          "T2 row 6, with C: no notice, it reads",
          [c.mem().notices, row(c).catchingUp],
          [0, true],
        );
        hist(c, more([msg("b", 8)], "p2"));
        c.eq("frozen", mark(c)?.at, 7);
        c.eq("the next page is asked for", c.reqs("history").at(-1)?.input.next, "p2");
        hist(c, more([msg("c", 9)], "p3", 9));
        c.eq("through moves it", mark(c)?.at, 9);
        hist(c, done([], 12));
        c.eq("at the end", mark(c)?.at, 12);
      },
      "gone-is-one-notice-then-what-is-kept"(c0) {
        const c = at(c0, chatFixture({ catchUp: true }), C);
        f(c, live());
        hist(c, done([msg("a", 1)], 1));
        c.do({ feed: M, end: true });
        c.advance(1000);
        f(c, live());
        hist(c, { _feed: "gone", reason: "too old", items: [msg("z", 50)], through: 50 });
        c.eq("told once", c.mem().notices, 1);
        c.eq("kept", ids(c), ["a", "z"]);
        c.eq("moved", mark(c)?.at, 50);
      },
      "a-drop-discards-the-buffer-and-keeps-the-place"(c0) {
        const c = at(c0, chatFixture({ catchUp: true }), C);
        f(c, live());
        hist(c, done([], 1));
        c.do({ feed: M, end: true });
        c.advance(1000);
        f(c, live());
        f(c, msg("buffered", 5));
        c.do({ feed: M, end: true });
        c.eq("gone, unmoved", [ids(c), mark(c)?.at], [[], 1]);
        c.advance(2000);
        c.eq("asks from there", lastFrom(c), 1);
      },
      "a-registration-during-a-read-restarts-it-no-second-notice"(c0) {
        const c = at(c0, chatFixture({ catchUp: true }), C);
        f(c, live());
        f(c, live());
        c.eq("said", c.r.evidence("RegistrationChurn").length, 1);
        c.eq("two reads, one left", c.reqs("history").length, 2);
        hist(c, done([], 1));
        c.eq("no notice", c.mem().notices, 0);
      },
      "a-proof-during-a-read-stays"(c0) {
        const c = at(c0, chatFixture({ catchUp: true }), C);
        f(c, live());
        f(c, live({ proof: "x" }));
        c.eq("one read", c.reqs("history").length, 1);
        hist(c, done([], 1));
      },
      "a-page-that-repeats-ends-it"(c0) {
        const c = at(c0, chatFixture({ catchUp: true }), C);
        f(c, live());
        hist(c, more([msg("a", 1)], "p"));
        hist(c, more([], "p"));
        c.eq("T1: page failure", c.mem().ended, "PageStalled");
      },
      "a-page-failure-retries-with-the-socket-open"(c0) {
        const c = at(c0, chatFixture({ catchUp: true }), C);
        f(c, live());
        c.answer("history", { fail: { tag: "PageBusy" } });
        c.eq("open", feeds(c).at(-1)?.open, true);
        c.advance(1000);
        c.eq("again", c.reqs("history").length, 2);
        hist(c, done([], 1));
        c.eq("Live", row(c).st, "Live");
      },
      "any-other-page-failure-ends"(c0) {
        const c = at(c0, chatFixture({ catchUp: true }), C);
        f(c, live());
        c.answer("history", { fail: { tag: "Nope" } });
        c.eq("failed", c.mem().ended, "Nope");
      },
      "a-page-of-no-shape-is-defect"(c0) {
        const c = at(c0, chatFixture({ catchUp: true }), C);
        f(c, live());
        hist(c, { nonsense: true });
        c.eq("T1", c.mem().ended, "Defect");
      },
      "pages-map-to-one-turn"(c0) {
        const c = at(c0, chatFixture({ catchUp: true, pages: true }), C);
        f(c, live());
        hist(c, done([msg("a", 1), msg("b", 2)], 2));
        c.eq("one turn", [c.mem().pagesSeen, ids(c)], [1, ["a", "b"]]);
      },
      "a-bookmark-member-restarts-from-its-place-no-notice"(c0) {
        const c = at(c0, chatFixture({ catchUp: true }), C);
        f(c, live());
        hist(c, done([msg("a", 1)], 1));
        c.send("Jump", { at: 40 });
        c.eq("reads", [row(c).catchingUp, c.reqs("history").at(-1)?.input.from], [true, 40]);
        c.eq("no notice", c.mem().notices, 0);
        hist(c, done([]));
        c.eq("the place holds", mark(c)?.at, 40);
      },
      "refetch-reads-from-nothing"(c0) {
        const c = at(c0, chatFixture({ catchUp: true }), C);
        f(c, live());
        hist(c, done([msg("a", 1)], 1));
        c.send("Refetch");
        c.eq(
          "from nothing",
          [row(c).catchingUp, c.reqs("history").at(-1)?.input.from],
          [true, undefined],
        );
        hist(c, done([msg("a", 1)], 1));
        c.eq("again", ids(c), ["a"]);
      },
      "a-reload-during-a-read-reads-again"(c0) {
        const c = at(c0, chatFixture({ catchUp: true }), C);
        f(c, live());
        hist(c, done([], 2));
        c.do({ feed: M, end: true });
        c.advance(1000);
        f(c, live());
        c.reload();
        c.eq("from the bookmark", lastFrom(c), 2);
        f(c, live());
        c.eq("reads", row(c).catchingUp, true);
        hist(c, done([], 3));
      },
      "a-release-abandons-the-read"(c0) {
        const c = at(c0, chatFixture({ catchUp: true }), C);
        f(c, live());
        c.send("Leave");
        c.do({ advance: 20 });
        c.eq("no session", row(c), undefined);
        c.eq("aborted", c.r.outside().open.filter((o) => o.op === "history").length, 0);
      },
      "three-repairs-with-no-move-then-one-lost"(c0) {
        const c = at(c0, chatFixture({ catchUp: true }), C);
        f(c, live());
        hist(c, done([], 1));
        c.do({ feed: M, end: true });
        c.advance(1000);
        for (const delay of [2000, 4000, 8000]) {
          f(c, live());
          c.eq("reads", row(c).catchingUp, true);
          c.do({ feed: M, fail: { _tag: "Overflow" } });
          c.advance(delay);
        }
        f(c, live());
        c.eq("T2 row 6: give up, one notice", c.mem().notices, 1);
        c.eq("Live, no read", [row(c).st, row(c).catchingUp], ["Live", false]);
      },
    },
  },
  {
    id: "STREAM5-LOSE",
    kind: "example",
    fixtures: [chatFixture()],
    actor: C,
    cites: ["T1:Live.fail", "T6", "sec:2.11.10", "T9"],
    variants: {
      "eight-short-connections-flap"(c0) {
        const c = at(c0, chatFixture(), C);
        for (let i = 0; i < 8; i++) {
          f(c, live());
          c.do({ feed: M, end: true });
          if (i < 7) c.advance(30_000 >= 1000 * 2 ** i ? 1000 * 2 ** i : 30_000);
        }
        c.eq("Flapping", c.mem().ended, "Flapping");
      },
      "a-healthy-minute-clears-flaps"(c0) {
        const c = at(c0, chatFixture(), C);
        for (let i = 0; i < 7; i++) {
          f(c, live());
          c.do({ feed: M, end: true });
          c.advance(1000 * 2 ** i);
        }
        f(c, live());
        c.advance(30_000);
        f(c, { _feed: "ping" });
        c.advance(30_000);
        c.do({ feed: M, end: true });
        c.eq("not ended", c.mem().ended, "");
        c.advance(1000);
        f(c, live());
        c.do({ feed: M, end: true });
        c.eq("and counting starts again", c.mem().ended, "");
      },
      "silence-is-not-a-flap"(c0) {
        const c = at(c0, chatFixture(), C);
        for (let i = 0; i < 9; i++) {
          f(c, live());
          c.advance(45_000);
          c.advance(30_000);
        }
        c.eq("not ended", c.mem().ended, "");
      },
      "a-tag-while-refuses-ends-by-that-tag"(c0) {
        const c = at(c0, chatFixture(), C);
        f(c, live());
        c.do({ feed: M, fail: { _tag: "Banned" } });
        c.state("BANNED");
      },
      "a-tag-while-accepts-reconnects"(c0) {
        const c = at(c0, chatFixture(), C);
        f(c, live());
        c.do({ feed: M, fail: { _tag: "SocketDropped" } });
        c.eq("waiting", row(c).st, "Waiting");
      },
      "overflow-with-no-reconnect-ends-it"(c0) {
        const c = at(
          c0,
          chatFixture({ source: "callback", bound: 2, reconnect: false, catchUp: true }),
          C,
        );
        f(c, live());
        c.do({ feed: M, frames: [msg("a", 1), msg("b", 2)] });
        // Repairing: the buffer holds 2, so the pull stops; the source's queue fills and fails.
        c.do({ feed: M, frames: [msg("c", 3), msg("d", 4), msg("e", 5)] });
        // Round 6, D79, a logged finding: T1's new row. The failing queue is heard with the pull stopped, not when the read answers.
        c.eq("heard out of band", c.mem().ended, "Overflow");
        c.eq("no longer catching up", row(c).catchingUp, false);
      },
      "when-places-and-releases-level-triggered"(c0) {
        const c = at(c0, chatFixture(), C);
        f(c, live());
        c.send("Mute");
        c.do({ advance: 20 });
        c.eq("released", feeds(c).filter((x) => x.open).length, 0);
        c.send("Unmute");
        c.eq("back", feeds(c).filter((x) => x.open).length, 1);
      },
    },
  },
  {
    id: "STREAM5-LISTEN",
    kind: "example",
    fixtures: [deskListenFixture],
    actor: T,
    cites: ["D67", "T7", "rule:72", "sec:2.8.14"],
    variants: {
      "version-frames-place-themselves"(c0) {
        const c = at(c0, deskListenFixture, T);
        c.to(T, "Load");
        c.answer("list", { truth: true });
        c.do({ feed: "changes", frame: { _feed: "live", proof: "resumed" } });
        const row = (over: object) => ({
          id: "t1",
          title: "x",
          slug: "x",
          archived: false,
          readAt: null,
          ...over,
        });
        c.do({
          feed: "changes",
          frame: { _tag: "TicketUpdated", ticket: row({ title: "v5", revision: 5 }) },
        });
        c.eq("newer applies", c.rec(T1)?.data.title, "v5");
        c.do({
          feed: "changes",
          frame: { _tag: "TicketUpdated", ticket: row({ title: "v3", revision: 3 }) },
        });
        c.eq("older drops", c.rec(T1)?.data.title, "v5");
        c.do({
          feed: "changes",
          frame: { _tag: "TicketUpdated", ticket: row({ title: "v5", revision: 5 }) },
        });
        c.eq(
          "a replay changes nothing",
          [c.rec(T1)?.data.title, c.rec(T1)?.uncertain],
          ["v5", false],
        );
        c.do({ feed: "changes", frame: { _tag: "TicketRemoved", ticketId: "t1", revision: 8 } });
        c.eq("a tombstone", c.rec(T1), undefined);
        c.do({
          feed: "changes",
          frame: { _tag: "TicketUpdated", ticket: row({ title: "v6", revision: 6 }) },
        });
        c.eq("older than the tombstone stays gone", c.rec(T1), undefined);
      },
      "a-frame-before-a-confirmed-write-does-not-silently-undo-it"(c0) {
        for (const fx of [deskListenFixture, deskListenNoVersionFixture]) {
          const c = at(c0, fx, T);
          c.to(T, "Load");
          c.answer("list", { truth: true });
          c.do({ feed: "changes", frame: { _feed: "live", proof: "resumed" } });
          c.send("Archive", { id: "t1" });
          c.answer("archive", { apply: true });
          c.do({
            feed: "changes",
            frame: {
              _tag: "TicketUpdated",
              ticket: { id: "t1", archived: false, title: "other", revision: 5 },
            },
          });
          c.eq("not overwritten", c.rec(T1)?.data.archived, true);
          c.eq("and marked", c.rec(T1)?.uncertain, true);
          c.answer("repair", { truth: true });
          c.eq("the server says", [c.rec(T1)?.data.archived, c.rec(T1)?.uncertain], [true, false]);
        }
      },
      "an-echo-clears-the-unplaced-write-at-no-cost"(c0) {
        const c = at(c0, deskListenNoVersionFixture, T);
        c.to(T, "Load");
        c.answer("list", { truth: true });
        c.do({ feed: "changes", frame: { _feed: "live", proof: "resumed" } });
        c.send("Archive", { id: "t1" });
        c.answer("archive", { apply: true });
        c.do({
          feed: "changes",
          frame: { _tag: "TicketUpdated", ticket: { id: "t1", archived: true } },
        });
        c.eq("no read", c.reqs("repair").length, 0);
        c.do({
          feed: "changes",
          frame: { _tag: "TicketUpdated", ticket: { id: "t1", title: "theirs" } },
        });
        c.eq(
          "then a frame applies",
          [c.rec(T1)?.data.title, c.rec(T1)?.uncertain],
          ["theirs", false],
        );
      },
      "a-write-with-a-row-and-no-version-stands-unplaced-too"(c0) {
        const c = at(c0, deskListenNoVersionFixture, T);
        c.to(T, "Load");
        c.answer("list", { truth: true });
        c.do({ feed: "changes", frame: { _feed: "live", proof: "resumed" } });
        c.send("Rename", { id: "t1", title: "Mine" });
        c.answer("rename", { apply: true });
        c.do({
          feed: "changes",
          frame: { _tag: "TicketUpdated", ticket: { id: "t1", title: "before" } },
        });
        c.eq(
          "not overwritten, marked",
          [c.rec(T1)?.data.title, c.rec(T1)?.uncertain],
          ["Mine", true],
        );
        c.answer("repair", { truth: true });
      },
      "a-version-bump-alone-is-an-echo"(c0) {
        const c = at(c0, deskListenFixture, T);
        c.to(T, "Load");
        c.answer("list", { truth: true });
        c.do({ feed: "changes", frame: { _feed: "live", proof: "resumed" } });
        c.send("Archive", { id: "t1" });
        c.answer("archive", { apply: true });
        c.do({
          feed: "changes",
          frame: { _tag: "TicketUpdated", ticket: { id: "t1", archived: true, revision: 2 } },
        });
        c.eq("no read", [c.reqs("repair").length, c.rec(T1)?.data.revision], [0, 2]);
      },
      "with-no-write-a-frame-just-applies-no-read"(c0) {
        const c = at(c0, deskListenNoVersionFixture, T);
        c.to(T, "Load");
        c.answer("list", { truth: true });
        c.do({ feed: "changes", frame: { _feed: "live", proof: "resumed" } });
        c.do({
          feed: "changes",
          frame: { _tag: "TicketUpdated", ticket: { id: "t1", title: "theirs" } },
        });
        c.eq("applied", [c.rec(T1)?.data.title, c.reqs("repair").length], ["theirs", 0]);
      },
      "a-patch-of-a-record-nobody-holds-changes-nothing"(c0) {
        const c = at(c0, deskListenFixture, T);
        c.do({ feed: "changes", frame: { _feed: "live", proof: "resumed" } });
        c.do({
          feed: "changes",
          frame: { _tag: "TicketUpdated", ticket: { id: "t9", title: "x", revision: 1 } },
        });
        c.eq("feed.domain.ts's gap", c.rec(ticketRef("t9")), undefined);
      },
      "an-unproven-registration-rereads-what-was-read-earlier"(c0) {
        const c = at(c0, deskListenFixture, T);
        c.to(T, "Load");
        c.answer("list", { truth: true });
        c.eq("one read", c.reqs("list").length, 1);
        c.do({ feed: "changes", frame: { _feed: "live" } });
        c.eq("a gap: read again", c.reqs("list").length, 2);
        c.do({
          fault: {
            mutateServer: (s: any) => ({
              tickets: { ...s.tickets, t1: { ...s.tickets.t1, title: "moved", revision: 9 } },
            }),
          },
        });
        c.answer("list", { truth: true });
        c.eq("landed", c.rec(T1)?.data.title, "moved");
      },
      "a-proven-registration-is-no-gap"(c0) {
        const c = at(c0, deskListenFixture, T);
        c.to(T, "Load");
        c.answer("list", { truth: true });
        c.do({ feed: "changes", frame: { _feed: "live", proof: "x" } });
        c.eq("none", c.reqs("list").length, 1);
      },
      "from-is-the-sessions-own-last-position"(c0) {
        const c = at(c0, deskListenFixture, T);
        c.to(T, "Load");
        c.answer("list", { truth: true });
        c.do({ feed: "changes", frame: { _feed: "live", proof: "x" } });
        c.do({
          feed: "changes",
          frame: { _tag: "TicketUpdated", revision: 4, ticket: { id: "t1", revision: 4 } },
        });
        c.do({ feed: "changes", end: true });
        c.advance(1000);
        c.eq("resumes", c.r.outside().feeds.at(-1)?.from, 4);
      },
    },
  },
  {
    id: "STREAM5-LATEST",
    kind: "example",
    fixtures: [presenceFixture],
    actor: P,
    cites: ["T5", "T4:latest", "rule:67"],
    variants: {
      "a-value-is-implicit-live-and-delivers"(c0) {
        const c = at(c0, presenceFixture, P);
        c.do({ feed: "who", frame: "ann" });
        const r = c.r.module("sessions", `${P.actor}/${P.id}|who`);
        c.eq("live, confirmed", [r.connection, r.value], ["Live", "ann"]);
        c.eq("delivered", c.mem().seen, ["ann"]);
      },
      "newest-wins-while-a-turn-is-behind"(c0) {
        const c = at(c0, presenceFixture, P, { drainMs: -1 });
        c.do({ feed: "who", frames: ["a", "b", "c"] });
        c.eq("what was behind never turned", c.mem().seen, ["c"]);
        c.yes("what was in flight is said. How many were in flight is the slice's business (D122)", c.r.evidence("discarded").length >= 1);
      },
      "an-equal-value-confirms-and-is-not-heard-again"(c0) {
        const c = at(c0, presenceFixture, P);
        c.do({ feed: "who", frame: "a" });
        c.do({ feed: "who", frame: "a" });
        c.eq("once", c.mem().seen, ["a"]);
      },
      "a-drop-stops-value-being-current"(c0) {
        const c = at(c0, presenceFixture, P);
        c.do({ feed: "who", frame: "a" });
        c.do({ feed: "who", frame: { _feed: "down", reason: "x" } });
        const r = c.r.module("sessions", `${P.actor}/${P.id}|who`);
        c.eq("no value; `last` stays", [r.value, r.last.value], [undefined, "a"]);
        c.do({ feed: "who", frame: "b" });
        c.eq("nothing delivered while down", c.mem().seen, ["a"]);
      },
      "live-alone-does-not-confirm-proof-confirms-its-own"(c0) {
        const c = at(c0, presenceFixture, P);
        c.do({ feed: "who", frame: "a" });
        c.do({ feed: "who", frame: { _feed: "live" } });
        c.eq("T5", c.r.module("sessions", `${P.actor}/${P.id}|who`).value, undefined);
        c.do({ feed: "who", frame: { _feed: "live", proof: "still" } });
        c.eq("T5", c.r.module("sessions", `${P.actor}/${P.id}|who`).value, "a");
        c.eq("not heard twice", c.mem().seen, ["a"]);
      },
    },
  },
];
