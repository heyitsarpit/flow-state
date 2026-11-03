// The thin streams spike (convergence-4): Streams T1, T2's no-catchUp rows, T3, T4, rule 69-71, on round 4's runtime, through the
// Harness. Worked out by hand from the tables. It tests the seam, not all of streams.
import {
  deskFeedFixture,
  deskFeedNoReconnect,
  roomsFixture,
  type Cursor,
} from "../typed/feed.ts";
import type { Scenario } from "./ctx.ts";
import { Ctx } from "./ctx.ts";

const F = { actor: "DispatchDesk/DeskFeed", id: "w1" };
const R = { actor: "Desk/Rooms", id: "a" };
const OP = "activity";
const cur = (seq: number, epoch = 1): Cursor => ({ epoch, seq });
const entry = (id: string, seq: number) => ({ id, cursor: cur(seq) });
const frame = (c: Ctx, f: unknown) => c.do({ feed: OP, frame: f });
const hello = (c: Ctx, replayedFrom?: Cursor) =>
  frame(c, { t: "hello", ...(replayedFrom ? { replayedFrom } : {}) });
const value = (c: Ctx, id: string, seq: number) =>
  frame(c, { t: "activity", entry: entry(id, seq) });
const conns = (c: Ctx) => c.r.outside().feeds;
const lastFrom = (c: Ctx) => conns(c).at(-1)?.from;
const openConns = (c: Ctx) => conns(c).filter((x) => x.open).length;
const closes = (c: Ctx) => c.do({ advance: 20 }); // review H7: the fake's close takes time
const row = (c: Ctx, a = F) => c.r.module("sessions", `${a.actor}/${a.id}|${OP}`);
const ids = (c: Ctx) => c.mem().activity.map((e: any) => e.id);
// Rule 71: read what the disk holds, not what the runtime says.
const saved = (c: Ctx, a = F) => c.record(a);
const bookmark = (c: Ctx, a = F): any =>
  Object.values((saved(c, a)?.root?.partition?.sessions ?? {}) as Record<string, unknown>)[0];

export const streamScenarios: readonly Scenario[] = [
  {
    id: "SPIKE-01",
    kind: "example",
    fixtures: [deskFeedFixture],
    actor: F,
    cites: [
      "rule:68",
      "rule:69",
      "rule:71",
      "T1:Connecting.live",
      "T1:Live.value",
      "T2:3",
      "T3:filled",
    ],
    variants: {
      "first-open-registers-and-names-a-place"(c) {
        c.ensure();
        c.eq("connected with nothing to claim", [conns(c).length, lastFrom(c)], [1, undefined]);
        c.eq("not registered", row(c).connection, "Connecting");
        hello(c);
        c.eq("registered", row(c).connection, "Live");
        c.eq("T2 row 3: no notice", c.mem().notices, 0);
        c.eq("a record is made", bookmark(c), { filled: false });
      },
      "a-value-and-its-bookmark-are-one-write"(c) {
        c.ensure();
        hello(c);
        value(c, "a", 1);
        c.eq("delivered", ids(c), ["a"]);
        c.eq("the bookmark moved", bookmark(c)?.at, cur(1));
        c.eq("and is in the same record as the memory", saved(c).root.memory.activity.length, 1);
        c.eq("T3: filled follows the field", bookmark(c)?.filled, true);
      },
      "a-denied-value-still-moves-the-bookmark"(c) {
        c.ensure();
        hello(c);
        value(c, "denied", 7);
        c.eq("not in memory", ids(c), []);
        c.eq("T3: kept through Denied", bookmark(c)?.at, cur(7));
      },
      "values-in-order-one-in-mail"(c) {
        c.ensure();
        hello(c);
        for (let i = 1; i <= 20; i++) value(c, `e${i}`, i);
        c.eq("all, in order", ids(c).length, 20);
        c.eq(
          "one turn each",
          c.r.evidence("turn").filter((e) => e["event"] === "Entry").length,
          20,
        );
        c.eq("nothing left queued", [row(c).queued, row(c).inFlight], [0, false]);
      },
      "a-value-before-any-hello-registers-first"(c) {
        c.ensure();
        value(c, "a", 1);
        c.eq("registered by T1's row", row(c).connection, "Live");
        c.eq("delivered", ids(c), ["a"]);
      },
    },
  },
  {
    id: "SPIKE-02",
    kind: "example",
    fixtures: [deskFeedFixture],
    actor: F,
    cites: ["T2:6", "T2:4", "T2:2", "T1:Live.fail", "rule:71"],
    variants: {
      "a-reload-restores-memory-and-bookmark-together"(c) {
        c.ensure();
        hello(c);
        value(c, "a", 1);
        c.reload();
        c.eq("memory", ids(c), ["a"]);
        c.eq("from the bookmark, with no ensure: restore is a fact too", lastFrom(c), cur(1));
        hello(c);
        c.eq("T2 row 6: nothing proved it", c.mem().notices, 1);
        value(c, "a", 1);
        value(c, "b", 2);
        c.eq("at-least-once, stored by id", ids(c), ["a", "b"]);
      },
      "the-servers-echo-is-proof-no-notice"(c) {
        c.ensure();
        hello(c);
        value(c, "a", 1);
        c.reload();
        hello(c, cur(1));
        c.eq("T2 row 4", c.mem().notices, 0);
      },
      "a-drop-reconnects-from-the-bookmark-on-the-backoff"(c) {
        c.ensure();
        hello(c);
        value(c, "a", 1);
        c.do({ feed: OP, end: true });
        c.eq("waiting, as the row says", [row(c).connection, row(c).st], ["Connecting", "Waiting"]);
        c.eq("no connection yet", openConns(c), 0);
        c.advance(999);
        c.eq("not yet", conns(c).length, 1);
        c.advance(1);
        c.eq("again", [conns(c).length, lastFrom(c)], [2, cur(1)]);
      },
      "idle-loses-it-a-ping-re-arms-it-a-ping-before-hello-does-not"(c) {
        c.ensure();
        frame(c, { t: "ping" });
        c.eq("evidence", c.r.evidence("PingsWithoutLive").length, 1);
        c.advance(45_000);
        c.eq("idle fired: a ping before hello did not extend it", row(c).st, "Waiting");
        c.advance(1000);
        hello(c);
        c.advance(30_000);
        frame(c, { t: "ping" });
        c.advance(30_000);
        c.eq("re-armed", row(c).st, "Live");
      },
      "a-server-reset-moves-the-bookmark-at-the-notices-admission"(c) {
        c.ensure();
        hello(c);
        value(c, "a", 1);
        frame(c, { t: "reset", epoch: 2 });
        c.eq("told", c.mem().notices, 1);
        c.eq("moved", bookmark(c)?.at, cur(0, 2));
      },
      "a-reset-at-the-first-open-is-silent"(c) {
        c.ensure();
        frame(c, { t: "reset", epoch: 2 });
        c.eq("T2 row 1", [c.mem().notices, bookmark(c)?.at], [0, cur(0, 2)]);
      },
      "a-wipe-the-field-emptied-reads-as-owed"(c) {
        c.ensure();
        hello(c);
        value(c, "a", 1);
        c.send("Clear");
        c.eq("T3: filled follows on any committed turn", bookmark(c)?.filled, false);
      },
    },
  },
  {
    id: "SPIKE-03",
    kind: "example",
    fixtures: [deskFeedFixture],
    actor: F,
    namedIssues: ["InvalidTurn"],
    cites: ["T3:bookmark", "T3:refetch", "rule:71", "F3"],
    variants: {
      "bookmark-is-a-member-on-after-memory"(c) {
        c.ensure();
        hello(c);
        value(c, "a", 1);
        c.send("Jump", { at: cur(50) });
        c.eq("moved", bookmark(c)?.at, cur(50));
        c.eq("T1: no catchUp, a notice at the head", c.mem().notices, 1);
      },
      "a-refused-turn-takes-its-member-with-it"(c) {
        c.ensure();
        hello(c);
        value(c, "a", 1);
        c.send("JumpThenThrow", { at: cur(50) });
        c.eq("refused", c.r.issues().at(-1)?.code, "InvalidTurn");
        c.eq("not moved", bookmark(c)?.at, cur(1));
        c.send("DismissNotice");
        c.eq("and not moved later: nothing left pending", bookmark(c)?.at, cur(1));
      },
      "refetch-forgets-the-place"(c) {
        c.ensure();
        hello(c);
        value(c, "a", 1);
        c.send("Refetch");
        c.eq("T3", bookmark(c), { filled: false });
        c.reload();
        c.eq("connects from nothing", lastFrom(c), undefined);
      },
      "a-value-in-mail-when-its-placement-ends-is-discarded"(c0) {
        const c = new Ctx(c0.fresh([deskFeedFixture], { drainMs: -1 }), F);
        c.ensure();
        hello(c);
        c.do({
          fault: { afterYield: { feed: OP, frame: { t: "activity", entry: entry("late", 1) } } },
        });
        c.send("SignOut");
        c.state("SIGNED_OUT");
        c.eq("rule 70: discarded with evidence", c.r.evidence("discarded").length, 1);
        c.eq(
          "no turn for it",
          c.r.evidence("delivered").length +
            c.r.evidence("turn").filter((e) => e["event"] === "Entry").length,
          0,
        );
        c.eq("and its bookmark never moved", bookmark(c), { filled: false });
      },
      "with-no-session-placed-T3-only"(c) {
        c.ensure();
        hello(c);
        value(c, "a", 1);
        c.send("SignOut");
        closes(c);
        c.eq("released", openConns(c), 0);
        c.send("Jump", { at: cur(9) });
        c.eq("written all the same: the partition is the slice's", bookmark(c)?.at, cur(9));
        c.send("Open");
        c.eq("the next session starts there", lastFrom(c), cur(9));
      },
    },
  },
  {
    id: "SPIKE-04",
    kind: "example",
    fixtures: [roomsFixture],
    actor: R,
    cites: ["T9", "rule:70", "rule:1", "rule:52", "D62"],
    bounds: { drainMs: -1 },
    variants: {
      "a-session-belongs-to-its-incarnation-a-reset-is-a-new-slice"(c) {
        c.ensure();
        hello(c);
        value(c, "a", 1);
        c.send("ShowRoom", { roomId: "w2" });
        closes(c);
        c.eq(
          "one connection, the new one",
          [openConns(c), conns(c).at(-1)?.input],
          [1, { workspaceId: "w2" }],
        );
        c.eq("T3: the partition is new", lastFrom(c), undefined);
        c.eq("fresh memory", c.inner(["room"])?.memory.activity, []);
      },
      "an-old-value-in-mail-does-not-reach-the-new-slice"(c) {
        c.ensure();
        hello(c);
        c.do({
          fault: { afterYield: { feed: OP, frame: { t: "activity", entry: entry("old", 1) } } },
        });
        c.send("ShowRoom", { roomId: "w2" });
        c.eq("not in the new one", c.inner(["room"])?.memory.activity, []);
        c.eq("discarded with evidence", c.r.evidence("discarded").length, 1);
      },
      "a-freeze-releases-and-a-thaw-comes-back-from-the-same-place"(c) {
        c.ensure();
        hello(c);
        value(c, "a", 1);
        c.send("Away");
        closes(c);
        c.eq("released", openConns(c), 0);
        c.eq("the slice stays", c.inner(["room"])?.memory.activity.length, 1);
        c.send("Back");
        c.eq("from the frozen slice's bookmark", [openConns(c), lastFrom(c)], [1, cur(1)]);
        c.eq("no reset: same memory", c.inner(["room"])?.memory.activity.length, 1);
      },
      "a-frozen-partition-survives-a-reload"(c) {
        c.ensure();
        hello(c);
        value(c, "a", 1);
        c.send("Away");
        c.reload();
        c.eq("no session while frozen", openConns(c), 0);
        c.send("Back");
        c.eq("same place", lastFrom(c), cur(1));
      },
      "dispose-then-ensure-brings-both-back"(c) {
        c.ensure();
        hello(c);
        value(c, "a", 1);
        c.dispose();
        closes(c);
        c.eq("released", openConns(c), 0);
        c.ensure();
        c.eq("the record came back whole, bookmark with memory", lastFrom(c), cur(1));
      },
      "one-connection-at-a-time-for-one-key"(c) {
        c.ensure();
        hello(c);
        c.send("Away");
        c.send("Back");
        c.eq("never two", openConns(c), 1);
        closes(c);
        c.eq("still one, the new one", [openConns(c), conns(c).length], [1, 2]);
      },
    },
  },
  {
    id: "SPIKE-05",
    kind: "fault",
    fixtures: [deskFeedFixture],
    actor: F,
    cites: ["T1:Live.defect", "D50", "D46", "D57", "rule:8"],
    variants: {
      "a-refused-value-ends-the-session"(c) {
        c.namedIssues.push("InvalidTurn");
        c.ensure();
        hello(c);
        value(c, "boom", 1);
        c.state("RETRY_WAIT"); // T1: InvalidTurn on a delivery is end(Defect), and the machine's FeedEnded leaves LIVE
        c.eq("not moved", bookmark(c), { filled: false });
      },
      "a-failure-delivery-refused-once-comes-again"(c0) {
        const c = new Ctx(c0.fresh([deskFeedNoReconnect]), F);
        c0.namedIssues.push("InvalidTurn");
        c.ensure();
        hello(c);
        c.fault({ throwIn: "states.LIVE.on.FeedEnded[0].updateMemory" });
        c.do({ feed: OP, end: true });
        c.state("RETRY_WAIT");
        c.eq("once", c.r.issues().length, 1);
      },
      "a-module-defect-fails-closed-and-no-value-is-lost"(c) {
        c.namedIssues.push("ModuleDefect");
        c.ensure();
        hello(c);
        value(c, "a", 1);
        c.fault({ throwInModule: "input" });
        value(c, "b", 2);
        c.eq("dropped, not delivered", ids(c), ["a"]);
        c.eq("alive", c.r.quiet().fatal, false);
        c.eq("the bookmark did not move", bookmark(c)?.at, cur(1));
        c.reload();
        c.eq("a reload replays from there", lastFrom(c), cur(1));
      },
      "a-position-that-cannot-be-saved-ends-the-session"(c) {
        c.namedIssues.push("InvalidTurn", "UnencodableValue");
        c.ensure();
        hello(c);
        c.do({ feed: OP, frame: { t: "activity", entry: { id: "x", cursor: 10n } } });
        c.state("RETRY_WAIT"); // the entry is memory: the gate refuses the turn, so T1 ends it
        c.eq("alive", c.r.quiet().fatal, false);
        c.eq("not moved", bookmark(c), { filled: false });
      },
    },
  },
];
