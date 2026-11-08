// Phase 1, streams. Every expectation is the design's text (2.11, rules 67-72, Operations O4), worked out by hand before the runtime was changed;
// each variant names its rule. Sources: a socket (Room, Price, Mirror), one app-wide WebSocket multiplexed by `Feed.multiplex` (Ticker, 2.11.12.3,
// STREAMS-QUESTIONS Q1 B), and a browser-shaped EventSource under 2.11.12.8's recipe (Notes). Ticker checks read the fake's socket (what was sent,
// whether it is open) and the machine's memory beside the runtime's row, so a row that lies is caught by what the world saw.
import { chatFixture } from "../typed/chat.ts";
import { mirrorFixture, notesFixture, priceFixture, roomFixture, tickerFixture } from "../typed/phase1s.ts";
import type { Fixture } from "../harness.ts";
import { Ctx, type Scenario } from "./ctx.ts";

const R = { actor: "Lab/Room", id: "a" };
const T = { actor: "Lab/Ticker", id: "a" };
const N = { actor: "Lab/Notes", id: "a" };
const P = { actor: "Lab/Price", id: "a" };
const M = { actor: "Lab/Mirror", id: "a" };
const C = { actor: "Lab/Chat", id: "a" };
const at = (c0: Ctx, f: Fixture, a: { actor: string; id: string }, bounds?: Record<string, number>) => {
  const c = new Ctx(c0.fresh([f], bounds), a);
  c.namedIssues = c0.namedIssues;
  c.ensure();
  return c;
};
const live = (o: object = {}) => ({ _feed: "live", ...o });
const ping = { _feed: "ping" };
const down = { _feed: "down", reason: "x" };
const feeds = (c: Ctx, op: string) => c.r.outside().feeds.filter((x) => x.op === op);
const openOf = (c: Ctx, op: string) => feeds(c, op).filter((x) => x.open && !x.closing);
const roomOf = (x: { input: unknown }) => (x.input as { roomId: unknown }).roomId;
const roomRow = (c: Ctx) => c.r.module("sessions", `${R.actor}/${R.id}|messages`);
const msgs = (c: Ctx) => (c.mem().messages as { id: string }[]).map((m) => m.id);
const sse = (id: number, text: string) => ({ type: "message", data: JSON.stringify({ text }), lastEventId: String(id) });
const noteIds = (c: Ctx) => (c.mem().notes as { id: number }[]).map((n) => n.id);
// Ticker: the protocol's frames, as the server sends them on the one socket.
const wire = (f: object) => ({ type: "message", data: JSON.stringify(f) });
const subscribed = (symbol: string) => wire({ t: "subscribed", symbol });
const tick = (symbol: string, price: number) => wire({ t: "quote", quote: { symbol, price } });
const beat = wire({ t: "ping" });
const A10 = { symbol: "A", price: 10 };
const market = (c: Ctx, ...frames: unknown[]) => c.do({ feed: "market", frames });
const sockets = (c: Ctx) => feeds(c, "market");
const sent = (x: { sent: readonly string[] }) => x.sent.map((s) => JSON.parse(s) as { op: string; symbol: string }).map((s) => `${s.op} ${s.symbol}`);
const quoteRow = (c: Ctx, symbol: string, a = T) => c.r.module("sessions", `${a.actor}/${a.id}|quote|${JSON.stringify({ symbol })}`);
const priceRow = (c: Ctx) => c.r.module("sessions", `${P.actor}/${P.id}|price`);
// The first socket opened and both symbols registered: 2.11.12.3's "each symbol registers when its subscribe is sent".
const watching = (c: Ctx) => {
  market(c, { type: "open" });
  market(c, subscribed("A"), subscribed("B"));
};
// Steps the clock until `when` holds, at most `max` ms; the ms it took (or -1).
const until = (c: Ctx, step: number, max: number, when: () => boolean) => {
  for (let t = 0; t <= max; t += step) {
    if (when()) return t;
    c.advance(step);
  }
  return -1;
};

export const phase1sScenarios: readonly Scenario[] = [
  {
    id: "P1-S",
    kind: "fault",
    fixtures: [roomFixture, tickerFixture, notesFixture, priceFixture, mirrorFixture],
    actor: R,
    namedIssues: ["UserClosure", "SelectedNoKey"],
    cites: ["rule:68", "rule:69", "rule:70", "rule:71", "rule:41", "T1", "T2", "T3", "T4", "T5", "T6", "T9", "sec:2.11.7", "sec:2.11.10", "sec:2.11.12.3", "sec:2.11.12.8"],
    variants: {
      // Rule 68: one session per (incarnation, placement path, operation, key). Operations O4: "changing identity releases it before opening
      // another". A key field changing while the state stays put is a new identity.
      "a-key-change-releases-the-session-and-opens-the-new-key"(c0) {
        const c = at(c0, roomFixture, R);
        c.do({ feed: "messages", frame: live() });
        c.do({ feed: "messages", frame: { id: "m1", cursor: 1 } });
        c.send("Retarget", { roomId: "r2" });
        c.do({ advance: 50 });
        c.eq("r1's connection is closed", feeds(c, "messages").filter((x) => roomOf(x) === "r1").map((x) => x.open), [false]);
        c.eq("one open, on r2, from r2's own (empty) bookmark", openOf(c, "messages").map((x) => [roomOf(x), x.from]), [["r2", undefined]]);
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
      // The runner's ruling (finding 1): the select runs on every committed turn; a throw keeps what is placed, with one issue (D46).
      "a-select-that-throws-later-keeps-the-session-with-one-issue"(c0) {
        const c = at(c0, roomFixture, R);
        c.do({ feed: "messages", frame: live() });
        c.send("Break");
        c.do({ advance: 50 });
        c.eq("one issue", c.r.issues().filter((i) => i.code === "UserClosure").length, 1);
        c.eq("still placed", [openOf(c, "messages").length, roomRow(c)?.connection], [1, "Live"]);
      },
      // The runner's ruling (finding 2): a select returning `undefined` releases what was placed, with an issue, not silently.
      "a-select-returning-undefined-releases-with-an-issue"(c0) {
        const c = at(c0, roomFixture, R);
        c.do({ feed: "messages", frame: live() });
        c.send("Off");
        c.do({ advance: 50 });
        c.eq("released: the connection is closed", [openOf(c, "messages").length, roomRow(c)], [0, undefined]);
        c.eq("said once", c.r.issues().filter((i) => i.code === "SelectedNoKey").length, 1);
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
        c.eq("r1 again, from 1", openOf(c, "messages").map((x) => [roomOf(x), x.from]), [["r1", 1]]);
      },
      // Rule 70: "the wait for a releasing predecessor per (actor, operation, key)". r1's close never finishes; r2 is another key.
      "a-new-key-does-not-wait-for-another-keys-close"(c0) {
        const c = at(c0, roomFixture, R);
        c.do({ feed: "messages", frame: live() });
        c.fault({ socketClose: Infinity });
        c.send("Retarget", { roomId: "r2" });
        c.do({ advance: 50 });
        c.eq("r1 still closing", feeds(c, "messages").filter((x) => roomOf(x) === "r1").map((x) => [x.open, x.closing]), [[true, true]]);
        c.eq("r2 open now", openOf(c, "messages").map(roomOf), ["r2"]);
      },
      // Rule 70, per actor: equal keys in two actors are two waits. a's r1 never finishes closing; b's r1 opens at once.
      "equal-keys-in-two-actors-do-not-wait-on-each-other"(c0) {
        const c = at(c0, roomFixture, R);
        c.do({ feed: "messages", frame: live() });
        c.fault({ socketClose: Infinity });
        c.send("Leave");
        c.ensure({ actor: R.actor, id: "b" });
        c.do({ advance: 50 });
        c.eq("a's r1 closing, b's r1 open", feeds(c, "messages").map((x) => [roomOf(x), x.closing]), [["r1", true], ["r1", false]]);
        c.do({ feed: "messages", frame: live() });
        c.do({ feed: "messages", frame: { id: "m1", cursor: 1 } });
        c.eq("b heard it", (c.mem({ actor: R.actor, id: "b" }).messages as { id: string }[]).map((m) => m.id), ["m1"]);
      },
      // T1: the deadline is "not armed" in `Dropped`, and a ping there is evidence only: an SDK healing itself is not `Silent`.
      "pings-while-dropped-do-not-arm-the-deadline"(c0) {
        const c = at(c0, roomFixture, R);
        c.do({ feed: "messages", frame: live() });
        c.do({ feed: "messages", frame: down });
        for (let i = 0; i < 2; i++) {
          c.advance(20_000);
          c.do({ feed: "messages", frame: ping });
        }
        c.advance(50_000);
        c.eq("the one connection is still open, never replaced", feeds(c, "messages").map((x) => x.open && !x.closing), [true]);
        c.eq("still Dropped", roomRow(c)?.st, "Dropped");
      },
      // T1 Row: "`connection`: `Connecting` for `Connecting`, `Dropped`, `Waiting`".
      "a-dropped-session-reads-connecting"(c0) {
        const c = at(c0, roomFixture, R);
        c.do({ feed: "messages", frame: live() });
        c.do({ feed: "messages", frame: down });
        c.eq("Connecting", roomRow(c)?.connection, "Connecting");
      },
      // T1 `lose`: "A `Silent` end neither adds nor resets `flaps`: 8, none healthy in between." 4 flaps, a Silent end, 4 flaps: `Flapping`.
      "a-silent-end-neither-adds-nor-resets-flaps"(c0) {
        const c = at(c0, roomFixture, R);
        const flap = () => {
          c.do({ feed: "messages", frame: live() });
          c.do({ feed: "messages", end: true });
          c.advance(1000);
        };
        for (let i = 0; i < 4; i++) flap();
        c.do({ feed: "messages", frame: live() });
        c.advance(45_000);
        c.advance(1000);
        for (let i = 0; i < 3; i++) flap();
        c.eq("seven flaps: not yet", c.mem().ended, "");
        c.do({ feed: "messages", frame: live() });
        c.do({ feed: "messages", end: true });
        c.eq("the eighth ends it", c.mem().ended, "Flapping");
      },
      // T1: only `healthy` elapsed resets `n` and `flaps`; 2.11.10's recipe: "never reset on a value" (req C3).
      "values-do-not-reset-flaps"(c0) {
        const c = at(c0, roomFixture, R);
        for (let i = 0; i < 8; i++) {
          c.do({ feed: "messages", frame: live() });
          c.do({ feed: "messages", frame: { id: `m${i}`, cursor: i + 1 } });
          c.do({ feed: "messages", end: true });
          if (i < 7) c.advance(1000);
        }
        c.eq("Flapping", c.mem().ended, "Flapping");
      },
      // 2.11.10: "A connection that never registers spends and restores nothing, so offline waits forever."
      "connections-that-never-register-never-flap"(c0) {
        const c = at(c0, roomFixture, R);
        let tries = 0;
        for (let i = 0; i < 12; i++) {
          if (openOf(c, "messages").length === 0) break;
          tries++;
          c.do({ feed: "messages", end: true });
          c.advance(1000);
        }
        c.eq("every try reconnected, nothing ended", [tries, openOf(c, "messages").length, c.mem().ended], [12, 1, ""]);
      },
      // T3: "`at = v[position] ?? at`. No comparison: last delivered wins, may move backward."
      "the-bookmark-moves-backward"(c0) {
        const c = at(c0, roomFixture, R);
        c.do({ feed: "messages", frame: live() });
        c.do({ feed: "messages", frame: { id: "m5", cursor: 5 } });
        c.do({ feed: "messages", frame: { id: "m3", cursor: 3 } });
        c.do({ feed: "messages", end: true });
        c.advance(1000);
        c.eq("from 3", feeds(c, "messages").at(-1)?.from, 3);
      },
      // 2.11.4 and T6: `Feed.callback` is "Bounded at 1,024": a burst past it fails `Overflow`; the values past the bound are dropped.
      "a-pushed-source-holds-1024-by-default"(c0) {
        const c = at(c0, roomFixture, R, { drainMs: -1 });
        c.do({ feed: "messages", frame: live() });
        c.do({ feed: "messages", frames: Array.from({ length: 1100 }, (_, i) => ({ id: `m${i}`, cursor: i + 1 })) });
        c.advance(2000);
        const got = new Set(msgs(c));
        c.eq("the first 1,024 arrive", Array.from({ length: 1024 }, (_, i) => got.has(`m${i}`)).every(Boolean), true);
        c.eq("none past the queue's 1,024 and the one the session holds", Array.from({ length: 75 }, (_, i) => `m${1025 + i}`).filter((m) => got.has(m)), []);
        c.eq("Overflow reconnects", [feeds(c, "messages").length > 1, c.mem().ended], [true, ""]);
      },
      // T6's group merge: "No merge upgrades an answer". `live()` then `live({ proof })` between two values is the weaker, so T2 row 6 owes
      // its one notice for the second registration.
      "a-merged-group-keeps-the-weaker-registration"(c0) {
        const c = at(c0, chatFixture({ source: "callback", bound: 8 }), C, { drainMs: -1 });
        c.do({ feed: "messages", frame: live() });
        c.do({ feed: "messages", frames: [{ id: "a", cursor: 1 }, live(), live({ proof: "p" }), { id: "b", cursor: 2 }] });
        c.do({ advance: 50 });
        c.eq("one notice", c.mem().notices, 1);
      },
      // "... or hides a drop": `live()` then `down` in one group pulls `live`, then `down`, so the next value arrives in `Dropped` and owes
      // again (T1's `Dropped` value row).
      "a-merged-group-keeps-a-drop-after-a-registration"(c0) {
        const c = at(c0, chatFixture({ source: "callback", bound: 8 }), C, { drainMs: -1 });
        c.do({ feed: "messages", frame: live() });
        c.do({ feed: "messages", frames: [{ id: "a", cursor: 1 }, live(), down, { id: "b", cursor: 2 }] });
        c.do({ advance: 50 });
        c.eq("Dropped, a notice for each interruption", [c.r.module("sessions", `${C.actor}/${C.id}|messages`)?.st, c.mem().notices], ["Dropped", 2]);
      },
      // T1's `Releasing` column: a value from a connection being released is discarded, with evidence; it never reaches the machine.
      "a-frame-during-a-release-is-discarded"(c0) {
        const c = at(c0, roomFixture, R);
        c.do({ feed: "messages", frame: live() });
        c.fault({ socketClose: 1000 });
        c.send("Retarget", { roomId: "r2" });
        c.do({ advance: 50 });
        c.do({ feed: "messages", closing: true, to: { roomId: "r1", lang: "en" }, frame: { id: "late", cursor: 9 } });
        c.advance(2000);
        c.eq("not delivered", msgs(c), []);
      },
      // T3's bound (req M1): "256 entries per operation in a slice, oldest out. A missing entry reads none: ... empty, nothing is held", so an
      // evicted, quiet, empty key reads first open (no notice), while a kept one, `{ at: undefined }`, owes T2 row 7's one notice.
      "at-most-256-bookmarks-per-operation-oldest-out"(c0) {
        const c = at(c0, roomFixture, R);
        const visit = (room: string) => {
          c.send("Retarget", { roomId: room });
          c.do({ advance: 50 });
          c.do({ feed: "messages", frame: live() });
        };
        for (let i = 0; i < 260; i++) visit(`q${i}`);
        visit("q0");
        c.eq("the oldest was dropped: a first open", c.mem().notices, 0);
        visit("q258");
        c.eq("a kept one owes its notice", c.mem().notices, 1);
      },
      // Q2 A (2.11.7): "the field holds only this feed's items". A key change that keeps the old key's items is flagged `FillsOtherKey` and owes
      // T2 row 7's one notice; emptying the field in the same turn is a first open with neither.
      "a-key-change-that-keeps-the-old-keys-items-is-flagged"(c0) {
        const c = at(c0, roomFixture, R);
        c.do({ feed: "messages", frame: live() });
        c.do({ feed: "messages", frame: { id: "m1", cursor: 1 } });
        c.send("Retarget", { roomId: "r2" });
        c.do({ advance: 50 });
        c.do({ feed: "messages", frame: live() });
        c.eq("flagged, one notice", [c.r.evidence("FillsOtherKey").length > 0, c.mem().notices], [true, 1]);
      },
      "a-key-change-that-empties-the-field-is-a-first-open"(c0) {
        const c = at(c0, roomFixture, R);
        c.do({ feed: "messages", frame: live() });
        c.do({ feed: "messages", frame: { id: "m1", cursor: 1 } });
        c.send("Switch", { roomId: "r2" });
        c.do({ advance: 50 });
        c.do({ feed: "messages", frame: live() });
        c.eq("no flag, no notice", [c.r.evidence("FillsOtherKey").length, c.mem().notices], [0, 0]);
      },

      // ── Rule 70 (S11): two operations on one contract and key are two sessions; rule 71's bookmark is per operation and key.
      "two-operations-on-one-contract-and-key-keep-their-own-bookmarks"(c0) {
        const c = at(c0, mirrorFixture, M);
        c.eq("two connections", [openOf(c, "main").length, openOf(c, "copy").length], [1, 1]);
        c.do({ feed: "main", frame: live() });
        c.do({ feed: "copy", frame: live() });
        c.do({ feed: "main", frame: { id: "m1", cursor: 1 } });
        c.do({ feed: "main", end: true });
        c.do({ feed: "copy", end: true });
        c.advance(1000);
        c.eq("main from 1, copy from its own empty place", [feeds(c, "main").at(-1)?.from, feeds(c, "copy").at(-1)?.from], [1, undefined]);
      },
      // 2.11.10's default schedule: `exponential("500 millis")`, jittered, then capped at 30 s. Mirror declares no `backoff`.
      "with-no-backoff-the-default-schedule-runs"(c0) {
        const c = at(c0, mirrorFixture, M);
        c.do({ feed: "main", end: true });
        c.do({ feed: "copy", end: true });
        const back: Record<string, number> = {};
        for (let t = 0; t <= 700 && Object.keys(back).length < 2; t++) {
          for (const op of ["main", "copy"]) if (back[op] === undefined && feeds(c, op).length === 2) back[op] = t;
          c.advance(1);
        }
        const first = [back["main"] ?? -1, back["copy"] ?? -1];
        c.yes(`each first delay in 400..600 ms: ${first}`, first.every((t) => t >= 400 && t <= 600));
        c.yes(`jittered: two sessions do not reconnect together: ${first}`, first[0] !== first[1]);
        const delays: number[] = [];
        for (let i = 0; i < 8; i++) {
          const n = feeds(c, "main").length;
          c.do({ feed: "main", end: true });
          delays.push(until(c, 100, 31_000, () => feeds(c, "main").length > n));
        }
        c.yes(`each at most 30 s: ${delays}`, delays.every((d) => d >= 0 && d <= 30_000));
        c.eq("capped at 30 s once 500 ms x 2^n passes it", delays.slice(-2), [30_000, 30_000]);
      },

      // ── Rule 41, 2.11.12.3, Q1 B: `subscribe.each` over one socket multiplexed by `Feed.multiplex`.
      // "Each symbol registers when its subscribe is sent": one socket, one subscribe per distinct key (A, B, A is two sessions).
      "each-places-one-session-per-distinct-key"(c0) {
        const c = at(c0, tickerFixture, T);
        c.eq("one socket, opened for the first key", sockets(c).length, 1);
        market(c, { type: "open" });
        c.eq("one subscribe per distinct key", sent(sockets(c)[0]!).sort(), ["subscribe A", "subscribe B"]);
        c.eq("two sessions", [quoteRow(c, "A")?.connection, quoteRow(c, "B")?.connection], ["Connecting", "Connecting"]);
      },
      // 2.11.12.3: "Quiet market: `Feed.live()` at subscribe registers it, and pings keep it `Live`. Half-open: 25 s, `Silent`, dim with true age."
      "a-quiet-symbol-stays-live-on-the-sockets-pings-and-a-half-open-socket-is-silent"(c0) {
        const c = at(c0, tickerFixture, T);
        watching(c);
        market(c, tick("A", 10));
        for (let i = 0; i < 3; i++) {
          c.advance(20_000);
          market(c, beat);
        }
        c.eq("both Live after 60 s; B never quoted", [quoteRow(c, "A")?.connection, quoteRow(c, "B")?.connection, quoteRow(c, "B")?.value], ["Live", "Live", undefined]);
        c.eq("A is current; the socket untouched", [quoteRow(c, "A")?.value, sockets(c).length, sockets(c)[0]?.closing], [A10, 1, false]);
        const silentAt = c.r.now() + 25_000;
        c.advance(25_000);
        c.eq("Silent: both reconnecting", [quoteRow(c, "A")?.connection, quoteRow(c, "B")?.connection], ["Connecting", "Connecting"]);
        c.eq("dim with true age", [quoteRow(c, "A")?.value, quoteRow(c, "A")?.last?.value, quoteRow(c, "A")?.last?.at], [undefined, A10, silentAt]);
        c.eq("the half-open socket is closed once no key holds it", [sockets(c)[0]?.closing, sent(sockets(c)[0]!).filter((s) => s.startsWith("unsubscribe")).sort()], [true, ["unsubscribe A", "unsubscribe B"]]);
        c.eq("delivered once", c.mem().quotes, ["A:10"]);
      },
      // Rule 41 with rule 70: a key leaving the selected list releases that key's session only; the hub says `remove` for it.
      "unwatching-a-symbol-releases-only-its-session"(c0) {
        const c = at(c0, tickerFixture, T);
        watching(c);
        c.send("Unwatch", { symbol: "B" });
        c.do({ advance: 50 });
        c.eq("unsubscribe B, the socket stays", [sent(sockets(c)[0]!).at(-1), sockets(c)[0]?.open, sockets(c)[0]?.closing], ["unsubscribe B", true, false]);
        c.eq("A's session untouched", [quoteRow(c, "A")?.connection, quoteRow(c, "B")], ["Live", undefined]);
      },
      // Q1 B: "one connection while any key has a session": the last key gone closes the socket; the next key opens a new one.
      "the-socket-closes-with-the-last-key-and-reopens-for-the-next"(c0) {
        const c = at(c0, tickerFixture, T);
        watching(c);
        c.send("Unwatch", { symbol: "A" });
        c.send("Unwatch", { symbol: "B" });
        c.do({ advance: 50 });
        c.eq("both removed, then closed", [sent(sockets(c)[0]!).slice(-2).sort(), sockets(c)[0]?.closing], [["unsubscribe A", "unsubscribe B"], true]);
        c.send("Watch", { symbol: "C" });
        c.do({ advance: 50 });
        market(c, { type: "open" });
        c.eq("a new socket for C", [sockets(c).length, sent(sockets(c)[1]!)], [2, ["subscribe C"]]);
      },
      // Q1 B: `add` on a key's first session, `remove` on its last. Two actors watching one symbol share it on the app's one socket.
      "a-key-shared-by-two-actors-is-subscribed-once-and-removed-with-the-last"(c0) {
        const c = at(c0, tickerFixture, T);
        const B2 = { actor: T.actor, id: "b" };
        c.ensure(B2);
        market(c, { type: "open" });
        c.eq("one socket, one subscribe per key", [sockets(c).length, sent(sockets(c)[0]!).sort()], [1, ["subscribe A", "subscribe B"]]);
        c.to(T, "Unwatch", { symbol: "A" });
        c.do({ advance: 50 });
        c.eq("b still watches A", sent(sockets(c)[0]!).includes("unsubscribe A"), false);
        c.to(B2, "Unwatch", { symbol: "A" });
        c.do({ advance: 50 });
        c.eq("the last one removes it", sent(sockets(c)[0]!).filter((s) => s === "unsubscribe A").length, 1);
        market(c, tick("B", 7));
        c.eq("B reaches both actors", [c.mem().quotes, c.mem(B2).quotes], [["B:7"], ["B:7"]]);
      },
      // 2.11.6 and 2.11.12.3: a failure `while` refuses ends that key's session and reaches the machine with its key (req C10).
      "a-symbols-own-failure-ends-only-that-key-and-names-it"(c0) {
        const c = at(c0, tickerFixture, T);
        watching(c);
        market(c, wire({ t: "error", symbol: "B", code: "Delisted" }));
        c.do({ advance: 50 });
        c.eq("the machine heard B", c.mem().ended, ["B"]);
        c.eq("A untouched, the socket open; no `remove` for a key the server refused", [quoteRow(c, "A")?.connection, sockets(c)[0]?.closing, sent(sockets(c)[0]!).includes("unsubscribe B")], ["Live", false, false]);
        c.send("RetryQuote", { symbol: "B" });
        c.do({ advance: 50 });
        c.eq("a retry asks the server again", sent(sockets(c)[0]!).filter((s) => s === "subscribe B").length, 2);
      },
      // T1 `lose`: a socket drop fails every symbol; each waits its own (jittered) backoff, and the first reopens the socket and the rest join
      // it (Q1 B's stated cost). None ends.
      "a-socket-drop-reaches-every-symbol-and-each-reconnects"(c0) {
        const c = at(c0, tickerFixture, T);
        watching(c);
        market(c, { type: "close", code: 1006 });
        c.eq("both waiting", [quoteRow(c, "A")?.st, quoteRow(c, "B")?.st], ["Waiting", "Waiting"]);
        const back = [until(c, 10, 1000, () => quoteRow(c, "A")?.st !== "Waiting"), until(c, 10, 1000, () => quoteRow(c, "B")?.st !== "Waiting")];
        c.yes(`each reconnected on its own first backoff: ${back}`, back.every((t) => t >= 0));
        c.eq("one new socket for both", [sockets(c).length, sockets(c).filter((x) => x.open && !x.closing).length], [2, 1]);
        market(c, { type: "open" });
        c.eq("both subscribed again", sent(sockets(c)[1]!).sort(), ["subscribe A", "subscribe B"]);
        c.eq("nothing ended", c.mem().ended, []);
      },
      // 2.11.12.3: "Equal price after reconnect: undimmed, not heard" (T4 `latest`'s `heard`).
      "an-equal-price-after-a-reconnect-is-undimmed-and-not-heard"(c0) {
        const c = at(c0, tickerFixture, T);
        watching(c);
        market(c, tick("A", 10));
        market(c, { type: "close", code: 1006 });
        c.advance(1000);
        market(c, { type: "open" });
        market(c, subscribed("A"), tick("A", 10));
        c.eq("undimmed, not heard", [quoteRow(c, "A")?.value, c.mem().quotes], [A10, ["A:10"]]);
      },
      // 2.11.12.3: "A queued tick from before a drop is fenced and discarded" (T4 `latest`: at admission the slot must be current, or `NotLive`).
      "a-tick-in-mail-before-a-drop-is-fenced"(c0) {
        const c = at(c0, tickerFixture, T, { drainMs: -1 });
        market(c, { type: "open" });
        market(c, subscribed("A"), tick("A", 10), { type: "close", code: 1006 });
        c.do({ advance: 50 });
        c.eq("fenced", c.mem().quotes, []);
      },
      // T9: "Leave, key gone: bookmark kept"; "Placement starts: `Connecting`; restored `last`" (rule 71 keeps `latest`'s last and heard).
      "re-watching-a-symbol-restores-its-last"(c0) {
        const c = at(c0, tickerFixture, T);
        watching(c);
        market(c, tick("A", 10));
        c.send("Unwatch", { symbol: "A" });
        c.do({ advance: 50 });
        c.send("Watch", { symbol: "A" });
        c.do({ advance: 50 });
        c.eq("removed and added again on the socket", sent(sockets(c)[0]!).slice(-2), ["unsubscribe A", "subscribe A"]);
        c.eq("dim, restored", [quoteRow(c, "A")?.connection, quoteRow(c, "A")?.value, quoteRow(c, "A")?.last?.value], ["Connecting", undefined, A10]);
        market(c, subscribed("A"), tick("A", 10));
        c.eq("an equal tick is not heard again", c.mem().quotes, ["A:10"]);
      },
      // T9 Restore: "`Connecting`; `last` from age"; 2.7: "a `latest` feed restores `last` and its baseline"; 2.11.12.3: "Equal price after
      // reconnect: undimmed, not heard."
      "a-reload-restores-last-and-an-equal-value-is-not-heard-again"(c0) {
        const c = at(c0, tickerFixture, T, { captureMs: 0 });
        watching(c);
        market(c, tick("A", 10));
        c.reload();
        c.eq("dim after the reload", [quoteRow(c, "A")?.connection, quoteRow(c, "A")?.value, quoteRow(c, "A")?.last?.value], ["Connecting", undefined, A10]);
        market(c, { type: "open" });
        market(c, subscribed("A"), tick("A", 10));
        c.eq("undimmed", quoteRow(c, "A")?.value, A10);
        c.eq("not heard twice", c.mem().quotes, ["A:10"]);
        market(c, tick("A", 11));
        c.eq("a change is heard", c.mem().quotes, ["A:10", "A:11"]);
      },

      // ── T5 on a plain `latest` feed: the rows the multiplexed protocol never says.
      // T5 "Leaving `Live`: `last.at = now` if confirmed"; T1's `down` row leaves `Live`.
      "a-down-stamps-last-at"(c0) {
        const c = at(c0, priceFixture, P);
        c.do({ feed: "price", frame: live() });
        c.do({ feed: "price", frame: { price: 10 } });
        c.advance(5000);
        const t = c.r.now();
        c.do({ feed: "price", frame: down });
        c.eq("dim, as of the drop", [priceRow(c)?.value, priceRow(c)?.last?.at], [undefined, t]);
      },
      // T5 `Dropped`: "`last = { v, dropAt, not own }`, nothing delivered"; a proof confirms "only if `last.own`".
      "a-value-while-dropped-is-aged-from-the-drop-and-a-proof-does-not-confirm-it"(c0) {
        const c = at(c0, priceFixture, P);
        c.do({ feed: "price", frame: live() });
        c.do({ feed: "price", frame: { price: 10 } });
        c.advance(1000);
        const dropAt = c.r.now();
        c.do({ feed: "price", frame: down });
        c.advance(5000);
        c.do({ feed: "price", frame: { price: 11 } });
        c.eq("kept, aged from the drop", [priceRow(c)?.last?.value, priceRow(c)?.last?.at], [{ price: 11 }, dropAt]);
        c.do({ feed: "price", frame: live({ proof: "p" }) });
        c.eq("not current, not delivered", [priceRow(c)?.value, c.mem(P).prices], [undefined, [10]]);
      },
      // T9 Restore with T5: a restored `last` is not this session's own, so a proof does not confirm it; an equal value then is not heard.
      "a-restored-last-is-not-confirmed-by-a-proof"(c0) {
        const c = at(c0, priceFixture, P, { captureMs: 0 });
        c.do({ feed: "price", frame: live() });
        c.do({ feed: "price", frame: { price: 10 } });
        c.reload();
        c.eq("dim after the reload", [priceRow(c)?.connection, priceRow(c)?.value, priceRow(c)?.last?.value], ["Connecting", undefined, { price: 10 }]);
        c.do({ feed: "price", frame: live({ proof: "still" }) });
        c.eq("a proof confirms only this session's own value", priceRow(c)?.value, undefined);
        c.do({ feed: "price", frame: { price: 10 } });
        c.eq("undimmed, not heard twice", [priceRow(c)?.value, c.mem(P).prices], [{ price: 10 }, [10]]);
      },

      // 2.11.10: "a server with no heartbeat under a duration reconnects each `idle`, flagged `IdleWithoutPing`, and does not end".
      "a-silent-end-with-no-ping-in-the-connection-is-flagged"(c0) {
        const c = at(c0, roomFixture, R);
        c.do({ feed: "messages", frame: live() });
        c.advance(45_000);
        c.eq("flagged once", c.r.evidence("IdleWithoutPing").length, 1);
        c.advance(1000);
        c.eq("reconnected after the backoff, not ended", [feeds(c, "messages").length, openOf(c, "messages").length, c.mem().ended], [2, 1, ""]);
        c.do({ feed: "messages", frame: live() });
        c.do({ feed: "messages", frame: ping });
        c.advance(45_000);
        c.eq("a connection that pinged is not flagged", c.r.evidence("IdleWithoutPing").length, 1);
        c.eq("not ended", c.mem().ended, "");
      },

      // ── Audit S1b: each row's edge, written from the design text.
      // T3 "256 entries per operation in a slice, oldest out"; T2 row 7: a kept `{ at: undefined }` owes one notice; an evicted, quiet, empty
      // key reads first open. r1 registered, then 255 more keys: 256 entries, r1 kept. One key more: 257, r1 out.
      "the-256th-bookmark-keeps-the-oldest-and-the-257th-evicts-it"(c0) {
        const fill = (keys: number) => {
          const c = at(c0, roomFixture, R);
          const visit = (room: string) => {
            c.send("Retarget", { roomId: room });
            c.do({ advance: 50 });
            c.do({ feed: "messages", frame: live() });
          };
          c.do({ feed: "messages", frame: live() });
          for (let i = 1; i < keys; i++) visit(`q${i}`);
          visit("r1");
          return c.mem().notices;
        };
        c0.eq("256 entries: r1 kept, owes its notice", fill(256), 1);
        c0.eq("257 keys: r1 evicted, a first open", fill(257), 0);
      },
      // 2.11.10: "`exponential(\"500 millis\")`, jittered, then capped at 30 s": the n-th delay is 500 x 2^n, times 0.8-1.2 (Effect's
      // `jittered`). Mirror declares no `backoff`; its connections never register, so nothing resets `n`.
      "the-default-delay-doubles-each-try"(c0) {
        const c = at(c0, mirrorFixture, M);
        const d: number[] = [];
        for (let i = 0; i < 3; i++) {
          const n = feeds(c, "main").length;
          c.do({ feed: "main", end: true });
          d.push(until(c, 1, 3000, () => feeds(c, "main").length > n));
        }
        c.yes(`first 400..600, second 800..1200, third 1600..2400: ${d}`, d[0]! >= 400 && d[0]! <= 600 && d[1]! >= 800 && d[1]! <= 1200 && d[2]! >= 1600 && d[2]! <= 2400);
      },
      // 2.11.10 "jittered", Effect's `jittered`: each delay draws its own factor in 0.8-1.2, so one session's delays are not one factor apart.
      "each-default-delay-draws-its-own-jitter"(c0) {
        const c = at(c0, mirrorFixture, M);
        const f: number[] = [];
        for (let i = 0; i < 4; i++) {
          const n = feeds(c, "main").length;
          c.do({ feed: "main", end: true });
          f.push(until(c, 1, 9000, () => feeds(c, "main").length > n) / (500 * 2 ** i));
        }
        c.yes(`each factor in 0.8..1.2: ${f}`, f.every((x) => x >= 0.799 && x <= 1.201));
        c.yes(`the factors vary: ${f}`, Math.max(...f) - Math.min(...f) > 0.02);
      },
      // T5 "Leaving `Live`: `last.at = now` if confirmed"; T9: a restored `last` is not this session's own, and T5's `live()` row does not
      // confirm it. T1's `down` leaves `Live`: the restored age stays.
      "a-down-keeps-an-unconfirmed-last-at"(c0) {
        const c = at(c0, priceFixture, P, { captureMs: 0 });
        c.do({ feed: "price", frame: live() });
        c.do({ feed: "price", frame: { price: 10 } });
        c.reload();
        c.do({ feed: "price", frame: live() });
        const before = priceRow(c)?.last?.at;
        c.advance(5000);
        c.do({ feed: "price", frame: down });
        c.eq("Live, not confirmed, then dropped: not stamped", [typeof before, priceRow(c)?.value, priceRow(c)?.last?.at], ["number", undefined, before]);
      },
      // The same T5 row through T1 `lose`: a stream that completes while `Live`.
      "a-lose-keeps-an-unconfirmed-last-at"(c0) {
        const c = at(c0, priceFixture, P, { captureMs: 0 });
        c.do({ feed: "price", frame: live() });
        c.do({ feed: "price", frame: { price: 10 } });
        c.reload();
        c.do({ feed: "price", frame: live() });
        const before = priceRow(c)?.last?.at;
        c.advance(5000);
        c.do({ feed: "price", end: true });
        c.eq("Live, not confirmed, then lost: not stamped", [typeof before, priceRow(c)?.value, priceRow(c)?.last?.at], ["number", undefined, before]);
      },
      // T1 `down(r)` in `Live`: "`dropAt = now`", every time; T5 `Dropped`: a value is aged from `dropAt`. Two drops: the second one's time.
      "a-second-drop-sets-dropat-again"(c0) {
        const c = at(c0, priceFixture, P);
        c.do({ feed: "price", frame: live() });
        c.do({ feed: "price", frame: { price: 10 } });
        c.do({ feed: "price", frame: down });
        c.advance(1000);
        c.do({ feed: "price", frame: live() });
        c.advance(3000);
        const second = c.r.now();
        c.do({ feed: "price", frame: down });
        c.advance(2000);
        c.do({ feed: "price", frame: { price: 11 } });
        c.eq("aged from the second drop", [priceRow(c)?.last?.value, priceRow(c)?.last?.at], [{ price: 11 }, second]);
      },
      // Q1 B: "`add`, the first session of a key". Sessions joining an open socket: a new key (C) is added once; another actor's sessions of
      // keys already added (A twice, B) send nothing, and, the server having registered those keys, are registered at once (2.11.12.3: a quiet
      // symbol is `Live` on its registration), not left `Connecting` until `idle` makes them `Silent`.
      "joining-an-open-socket-adds-only-a-keys-first-session"(c0) {
        const c = at(c0, tickerFixture, T);
        const B2 = { actor: T.actor, id: "b" };
        watching(c);
        c.send("Watch", { symbol: "C" });
        c.do({ advance: 50 });
        c.ensure(B2);
        c.do({ advance: 50 });
        c.eq("one add per key, on the one socket", [sockets(c).length, sent(sockets(c)[0]!).sort()], [1, ["subscribe A", "subscribe B", "subscribe C"]]);
        c.eq("b's keys registered with no reply of their own", [quoteRow(c, "A", B2)?.connection, quoteRow(c, "B", B2)?.connection], ["Live", "Live"]);
      },
      // Q1 B: `add` only for a key that has a session when the socket opens. B unwatched while the socket connects is never added.
      "a-key-unwatched-while-the-socket-connects-is-never-added"(c0) {
        const c = at(c0, tickerFixture, T);
        c.send("Unwatch", { symbol: "B" });
        c.do({ advance: 50 });
        market(c, { type: "open" });
        c.eq("only A, once", sent(sockets(c)[0]!), ["subscribe A"]);
      },
      // Q2 A: `FillsOtherKey` at "a registration with no entry for its key, a filled field, and another key's entry filled". Back to r1, which
      // has its own entry: not flagged again.
      "returning-to-a-key-with-its-own-bookmark-is-not-flagged"(c0) {
        const c = at(c0, roomFixture, R);
        c.do({ feed: "messages", frame: live() });
        c.do({ feed: "messages", frame: { id: "m1", cursor: 1 } });
        c.send("Retarget", { roomId: "r2" });
        c.do({ advance: 50 });
        c.do({ feed: "messages", frame: live() });
        c.eq("r2 flagged", c.r.evidence("FillsOtherKey").length, 1);
        c.send("Retarget", { roomId: "r1" });
        c.do({ advance: 50 });
        c.do({ feed: "messages", frame: live() });
        c.eq("r1 not flagged", c.r.evidence("FillsOtherKey").length, 1);
      },
      // T1 `connect`: "`claim = b.at`", the bookmark at this connect. After a reload the session's first claim is 1; `O.x.refetch` (T3: `b =
      // { at: undefined, filled: false }`) then a reconnect claims nothing, so a proof at that first registration is not believed (T2 row 4
      // needs `claim` defined or not `first`) and row 7 owes its notice.
      "a-reconnect-claims-the-bookmark-at-that-connect"(c0) {
        const c = at(c0, chatFixture({}), C, { captureMs: 0 });
        c.do({ feed: "messages", frame: live() });
        c.do({ feed: "messages", frame: { id: "m1", cursor: 1 } });
        c.reload();
        c.eq("resumes from 1", feeds(c, "messages").at(-1)?.from, 1);
        c.send("Refetch");
        const before = c.mem(C).notices;
        c.do({ feed: "messages", end: true });
        c.advance(1000);
        c.eq("claims nothing", feeds(c, "messages").at(-1)?.from, undefined);
        c.do({ feed: "messages", frame: live({ proof: "p" }) });
        c.eq("the proof is not believed: one more notice", c.mem(C).notices, before + 1);
      },
      // 2.11.12.8, EventSource: dense ids, no greeting. The first message decides: contiguous after the bookmark is a proof (T2 row 4), no notice.
      "eventsource-contiguous-ids-after-the-bookmark-are-a-proof"(c0) {
        const c = at(c0, notesFixture, N);
        c.do({ feed: "notes", frames: [{ type: "open" }, sse(1, "a"), sse(2, "b")] });
        c.eq("first open: no notice", [c.mem().notices, noteIds(c)], [0, [1, 2]]);
        c.do({ feed: "notes", frame: { type: "error" } });
        c.eq("closed on error, waiting", c.r.module("sessions", `${N.actor}/${N.id}|notes`)?.st, "Waiting");
        c.advance(1000);
        c.eq("asks after the bookmark", feeds(c, "notes").at(-1)?.from, 2);
        c.do({ feed: "notes", frames: [{ type: "open" }, sse(3, "c")] });
        c.eq("proven: no notice", [c.mem().notices, noteIds(c)], [0, [1, 2, 3]]);
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
        c.eq("still one", [c.mem().notices, noteIds(c)], [1, [1, 5, 6]]);
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
      // 2.11.12.8: "`onerror` ... closes, so the browser's Last-Event-ID cannot disagree"; "this adapter closes on error, so the browser's retry
      // never runs". The server ending the response reaches the recipe; Flow reconnects from the bookmark, and the browser never does.
      "eventsource-a-server-end-reaches-the-recipe-and-the-browser-never-retries"(c0) {
        const c = at(c0, notesFixture, N);
        c.do({ feed: "notes", frames: [{ type: "open" }, sse(1, "a"), sse(2, "b")] });
        c.do({ feed: "notes", end: true });
        c.eq("heard as a drop", c.r.module("sessions", `${N.actor}/${N.id}|notes`)?.st, "Waiting");
        c.advance(10_000);
        c.eq("Flow's one reconnect, from 2; no browser retry", feeds(c, "notes").map((x) => [x.from, x.lastEventIdHeader]), [[undefined, undefined], [2, undefined]]);
        c.eq("not ended", c.mem().ended, "");
      },
      // The same for a request that fails (a fatal error): the recipe hears it, and `reconnect.while` retries it.
      "eventsource-a-failed-request-reaches-the-recipe"(c0) {
        const c = at(c0, notesFixture, N);
        c.do({ feed: "notes", frames: [{ type: "open" }, sse(1, "a")] });
        c.do({ feed: "notes", fail: { status: 502 } });
        c.advance(1000);
        c.eq("reconnected from 1", [feeds(c, "notes").at(-1)?.from, c.mem().ended], [1, ""]);
      },
      // T3: the bookmark is where the last admitted value says. A browser gives an id-less message the last id it saw, so the recipe's
      // `toNote` reads the same id again: the bookmark stays at 2.
      "eventsource-an-id-less-message-keeps-the-bookmark"(c0) {
        const c = at(c0, notesFixture, N);
        c.do({ feed: "notes", frames: [{ type: "open" }, sse(1, "a"), sse(2, "b"), { type: "message", data: JSON.stringify({ text: "c" }) }] });
        c.do({ feed: "notes", frame: { type: "error" } });
        c.advance(1000);
        c.eq("from 2", feeds(c, "notes").at(-1)?.from, 2);
      },
      // 2.11.12.8: the recipe listens to `onmessage`; a named event goes to its own listeners, so it is never a value and never moves the bookmark.
      "eventsource-a-named-event-never-reaches-the-recipe"(c0) {
        const c = at(c0, notesFixture, N);
        c.do({ feed: "notes", frames: [{ type: "open" }, sse(1, "a"), { type: "message", event: "update", data: JSON.stringify({ text: "u" }), lastEventId: "2" }] });
        c.eq("not delivered", noteIds(c), [1]);
        c.do({ feed: "notes", frame: { type: "error" } });
        c.advance(1000);
        c.eq("from 1", feeds(c, "notes").at(-1)?.from, 1);
      },
      // T2: "A stale `from` ... only over-replays"; row 6: a first message that is not `from + 1` is unproven, one notice. Last delivered wins (T3).
      "eventsource-a-replayed-id-is-one-notice-and-the-bookmark-follows"(c0) {
        const c = at(c0, notesFixture, N);
        c.do({ feed: "notes", frames: [{ type: "open" }, sse(1, "a"), sse(2, "b")] });
        c.do({ feed: "notes", frame: { type: "error" } });
        c.advance(1000);
        c.do({ feed: "notes", frames: [{ type: "open" }, sse(2, "b"), sse(3, "c")] });
        c.eq("one notice, no duplicate", [c.mem().notices, noteIds(c)], [1, [1, 2, 3]]);
        c.do({ feed: "notes", frame: { type: "error" } });
        c.advance(1000);
        c.eq("from 3", feeds(c, "notes").at(-1)?.from, 3);
      },
    },
  },
];
