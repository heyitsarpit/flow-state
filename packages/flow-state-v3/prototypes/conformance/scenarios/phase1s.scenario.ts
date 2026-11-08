// Phase 1, streams. Every expectation is the design's text (2.11, rules 67-72, Operations O4), worked out by hand before the runtime was changed;
// each variant names its rule. Sources: a socket (Room), one app-wide socket whose service fans frames out per symbol (Ticker, 2.11.12.3), and
// a browser-shaped EventSource under 2.11.12.8's recipe (Notes).
import { notesFixture, roomFixture, tickerFixture } from "../typed/phase1s.ts";
import type { Fixture } from "../harness.ts";
import { Ctx, type Scenario } from "./ctx.ts";

const R = { actor: "Lab/Room", id: "a" };
const T = { actor: "Lab/Ticker", id: "a" };
const N = { actor: "Lab/Notes", id: "a" };
const at = (c0: Ctx, f: Fixture, a: { actor: string; id: string }, bounds?: Record<string, number>) => {
  const c = new Ctx(c0.fresh([f], bounds), a);
  c.namedIssues = c0.namedIssues;
  c.ensure();
  return c;
};
const live = (o: object = {}) => ({ _feed: "live", ...o });
const ping = { _feed: "ping" };
const feeds = (c: Ctx, op: string) => c.r.outside().feeds.filter((x) => x.op === op);
const openOf = (c: Ctx, op: string) => feeds(c, op).filter((x) => x.open && !x.closing);
const quoteRow = (c: Ctx, symbol: string) => c.r.module("sessions", `${T.actor}/${T.id}|quote|${JSON.stringify({ symbol })}`);
const sym = (symbol: string) => ({ symbol });
const quote = (c: Ctx, symbol: string, frame: unknown) => c.do({ feed: "quote", to: sym(symbol), frame });
const sse = (id: number, text: string) => ({ type: "message", data: JSON.stringify({ text }), lastEventId: String(id) });

export const phase1sScenarios: readonly Scenario[] = [
  {
    id: "P1-S",
    kind: "fault",
    fixtures: [roomFixture, tickerFixture, notesFixture],
    actor: R,
    namedIssues: ["UserClosure"],
    cites: ["rule:68", "rule:70", "rule:71", "rule:41", "T1", "T5", "T9", "sec:2.11.10", "sec:2.11.12.3", "sec:2.11.12.8"],
    variants: {
      // Rule 68: one session per (incarnation, placement path, operation, key). Operations O4: "changing identity releases it before opening
      // another". A key field changing while the state stays put is a new identity.
      "a-key-change-releases-the-session-and-opens-the-new-key"(c0) {
        const c = at(c0, roomFixture, R);
        c.do({ feed: "messages", frame: live() });
        c.do({ feed: "messages", frame: { id: "m1", cursor: 1 } });
        c.send("Retarget", { roomId: "r2" });
        c.do({ advance: 50 });
        c.eq("r1's connection is closed", feeds(c, "messages").filter((x) => (x.input as { roomId: unknown }).roomId === "r1").map((x) => x.open), [false]);
        c.eq("one open, on r2, from r2's own (empty) bookmark", openOf(c, "messages").map((x) => [(x.input as { roomId: unknown }).roomId, x.from]), [["r2", undefined]]);
      },
      // S11: a session reads `input` once, at start, so a non-key field never restarts it.
      "a-non-key-field-change-keeps-the-session-and-its-input"(c0) {
        const c = at(c0, roomFixture, R);
        c.do({ feed: "messages", frame: live() });
        c.send("SetLang", { lang: "fr" });
        c.do({ advance: 50 });
        c.eq("no second connection", feeds(c, "messages").length, 1);
        c.do({ feed: "messages", frame: { id: "m1", cursor: 1 } });
        c.eq("the mapper sees the input read at start", (c.mem().messages as { lang: unknown }[]).map((m) => m.lang), ["en"]);
      },
      // Proposed (as T9's `when`): the select runs on each change to find the key; a throw keeps what is placed, with one issue (D46).
      "a-select-that-throws-later-keeps-the-session-with-one-issue"(c0) {
        const c = at(c0, roomFixture, R);
        c.do({ feed: "messages", frame: live() });
        c.send("Break");
        c.do({ advance: 50 });
        c.eq("one issue", c.r.issues().length, 1);
        c.eq("still placed", [openOf(c, "messages").length, c.r.module("sessions", `${R.actor}/${R.id}|messages`)?.connection], [1, "Live"]);
      },
      // Rule 71: the bookmark is per (operation, key), so returning to a key continues from its own place.
      "returning-to-a-key-continues-from-its-own-bookmark"(c0) {
        const c = at(c0, roomFixture, R);
        c.do({ feed: "messages", frame: live() });
        c.do({ feed: "messages", frame: { id: "m1", cursor: 1 } });
        c.send("Retarget", { roomId: "r2" });
        c.do({ advance: 50 });
        c.send("Retarget", { roomId: "r1" });
        c.do({ advance: 50 });
        c.eq("r1 again, from 1", openOf(c, "messages").map((x) => [(x.input as { roomId: unknown }).roomId, x.from]), [["r1", 1]]);
      },
      // Rule 41 (2.11.12.3): `subscribe.each`, one session per distinct key; two selected inputs with one key are one session.
      "each-places-one-session-per-distinct-key"(c0) {
        const c = at(c0, tickerFixture, T);
        c.eq("A and B, A once", openOf(c, "quote").map((x) => (x.input as { symbol: unknown }).symbol), ["A", "B"]);
      },
      // 2.11.12.3: "Each symbol registers when its subscribe is sent, and the socket's pings must reach every symbol's stream." A quiet symbol
      // stays Live on pings; a half-open socket (no pings) is Silent at 25 s for every symbol, dim with its true age.
      "a-quiet-symbol-stays-live-on-the-sockets-pings-and-a-half-open-socket-is-silent"(c0) {
        const c = at(c0, tickerFixture, T);
        c.do({ feed: "quote", all: true, frame: live() });
        quote(c, "A", { price: 10 });
        for (let i = 0; i < 3; i++) {
          c.advance(20_000);
          c.do({ feed: "quote", all: true, frame: ping });
        }
        c.eq("both Live after 60 s; B never quoted", [quoteRow(c, "A")?.connection, quoteRow(c, "B")?.connection, quoteRow(c, "B")?.value], ["Live", "Live", undefined]);
        c.eq("A is current", quoteRow(c, "A")?.value, { price: 10 });
        c.advance(25_000);
        c.eq("Silent: both reconnecting", [quoteRow(c, "A")?.connection, quoteRow(c, "B")?.connection], ["Connecting", "Connecting"]);
        c.eq("A dim: last kept, not current", [quoteRow(c, "A")?.value, quoteRow(c, "A")?.last?.value], [undefined, { price: 10 }]);
        c.eq("delivered once", c.mem().quotes, ["A:10"]);
      },
      // Rule 41 with rule 70: a key leaving the selected list releases that key's session only.
      "unwatching-a-symbol-releases-only-its-session"(c0) {
        const c = at(c0, tickerFixture, T);
        c.do({ feed: "quote", all: true, frame: live() });
        c.send("Unwatch", { symbol: "B" });
        c.do({ advance: 50 });
        c.eq("A stays, B gone", openOf(c, "quote").map((x) => (x.input as { symbol: unknown }).symbol), ["A"]);
        c.eq("A's session untouched", [feeds(c, "quote").length, quoteRow(c, "A")?.connection, quoteRow(c, "B")], [2, "Live", undefined]);
      },
      // 2.11.6 and 2.11.12.3: a failure `while` refuses ends that key's session and reaches the machine with its key (req C10).
      "a-symbols-own-failure-ends-only-that-key-and-names-it"(c0) {
        const c = at(c0, tickerFixture, T);
        c.do({ feed: "quote", all: true, frame: live() });
        c.do({ feed: "quote", to: sym("B"), fail: { _tag: "Delisted" } });
        c.do({ advance: 50 });
        c.eq("the machine heard B", c.mem().ended, ["B"]);
        c.eq("A untouched", [openOf(c, "quote").map((x) => (x.input as { symbol: unknown }).symbol), quoteRow(c, "A")?.connection], [["A"], "Live"]);
      },
      // T1 `lose`: a socket drop the service reports to every symbol: each session waits its own backoff and reconnects; none ends.
      "a-socket-drop-reaches-every-symbol-and-each-reconnects"(c0) {
        const c = at(c0, tickerFixture, T);
        c.do({ feed: "quote", all: true, frame: live() });
        c.do({ feed: "quote", all: true, fail: { _tag: "MarketDropped" } });
        c.eq("both waiting", [quoteRow(c, "A")?.st, quoteRow(c, "B")?.st], ["Waiting", "Waiting"]);
        c.advance(1000);
        c.eq("two new subscribes", openOf(c, "quote").map((x) => (x.input as { symbol: unknown }).symbol), ["A", "B"]);
        c.eq("nothing ended", c.mem().ended, []);
      },
      // T9 Restore: "`Connecting`; `last` from age"; 2.7: "a `latest` feed restores `last` and its baseline"; 2.11.12.3: "Equal price after
      // reconnect: undimmed, not heard."
      "a-reload-restores-last-and-an-equal-value-is-not-heard-again"(c0) {
        const c = at(c0, tickerFixture, T, { captureMs: 0 });
        c.do({ feed: "quote", all: true, frame: live() });
        quote(c, "A", { price: 10 });
        c.reload();
        c.eq("dim after the reload", [quoteRow(c, "A")?.connection, quoteRow(c, "A")?.value, quoteRow(c, "A")?.last?.value], ["Connecting", undefined, { price: 10 }]);
        quote(c, "A", live({ proof: "still" }));
        c.eq("T5: a proof confirms only this session's own value", quoteRow(c, "A")?.value, undefined);
        quote(c, "A", { price: 10 });
        c.eq("undimmed", quoteRow(c, "A")?.value, { price: 10 });
        c.eq("not heard twice", c.mem().quotes, ["A:10"]);
        quote(c, "A", { price: 11 });
        c.eq("a change is heard", c.mem().quotes, ["A:10", "A:11"]);
      },
      // 2.11.10: "a server with no heartbeat under a duration reconnects each `idle`, flagged `IdleWithoutPing`, and does not end".
      "a-silent-end-with-no-ping-in-the-connection-is-flagged"(c0) {
        const c = at(c0, roomFixture, R);
        c.do({ feed: "messages", frame: live() });
        c.advance(45_000);
        c.eq("flagged once", c.r.evidence("IdleWithoutPing").length, 1);
        c.advance(1000);
        c.do({ feed: "messages", frame: live() });
        c.do({ feed: "messages", frame: ping });
        c.advance(45_000);
        c.eq("a connection that pinged is not flagged", c.r.evidence("IdleWithoutPing").length, 1);
        c.eq("not ended", c.mem().ended, "");
      },
      // 2.11.12.8, EventSource: dense ids, no greeting. The first message decides: contiguous after the bookmark is a proof (T2 row 4), no notice.
      "eventsource-contiguous-ids-after-the-bookmark-are-a-proof"(c0) {
        const c = at(c0, notesFixture, N);
        c.do({ feed: "notes", frames: [{ type: "open" }, sse(1, "a"), sse(2, "b")] });
        c.eq("first open: no notice", [c.mem().notices, (c.mem().notes as { id: number }[]).map((n) => n.id)], [0, [1, 2]]);
        c.do({ feed: "notes", frame: { type: "error" } });
        c.eq("closed on error, waiting", c.r.module("sessions", `${N.actor}/${N.id}|notes`)?.st, "Waiting");
        c.advance(1000);
        c.eq("asks after the bookmark", feeds(c, "notes").at(-1)?.from, 2);
        c.do({ feed: "notes", frames: [{ type: "open" }, sse(3, "c")] });
        c.eq("proven: no notice", [c.mem().notices, (c.mem().notes as { id: number }[]).map((n) => n.id)], [0, [1, 2, 3]]);
      },
      // T2 row 6, no catchUp: a reconnect whose first id skips is unproven, one notice; `open` alone does not register (the recipe registers
      // on the first message), so a quiet reconnect stays Connecting (2.11.12.8's stated cost).
      "eventsource-a-skipped-id-is-one-notice-and-a-quiet-reconnect-stays-connecting"(c0) {
        const c = at(c0, notesFixture, N);
        c.do({ feed: "notes", frames: [{ type: "open" }, sse(1, "a")] });
        c.do({ feed: "notes", frame: { type: "error" } });
        c.advance(1000);
        c.do({ feed: "notes", frame: { type: "open" } });
        c.eq("open is not a registration here", c.r.module("sessions", `${N.actor}/${N.id}|notes`)?.connection, "Connecting");
        c.do({ feed: "notes", frame: sse(5, "e") });
        c.eq("one notice", c.mem().notices, 1);
        c.do({ feed: "notes", frame: sse(6, "f") });
        c.eq("still one", [c.mem().notices, (c.mem().notes as { id: number }[]).map((n) => n.id)], [1, [1, 5, 6]]);
      },
      // A reload continues from the saved bookmark (rule 71, T9 Restore) through the browser's own source.
      "eventsource-a-reload-asks-after-the-saved-bookmark"(c0) {
        const c = at(c0, notesFixture, N, { captureMs: 0 });
        c.do({ feed: "notes", frames: [{ type: "open" }, sse(1, "a"), sse(2, "b")] });
        c.reload();
        c.eq("after 2", feeds(c, "notes").at(-1)?.from, 2);
        c.do({ feed: "notes", frames: [{ type: "open" }, sse(3, "c")] });
        c.eq("proven", c.mem().notices, 0);
      },
    },
  },
];
