// Audit S1 (phase 1 streams, round 1, 0b704aef, with the stream, session and feed cases before it): wrong runtimes written by an independent
// auditor from the design text (rules 67-72, Streams T1-T9, 2.11.10, 2.11.12.3, Operations O4), before reading mutants-p1s.ts. Each comment
// names the rule broken. `lie:` ids fake the evidence an excuse reads. Same shape as mutants-audit-3.ts; not spread into any gate list.
const m = (id: string, kills: readonly string[], edits: ReadonlyArray<readonly [string, string, string]>, unscored?: string) => ({ id, kills, edits, ...(unscored ? { unscored } : {}) });
const S = "sessions.ts";
const F = "feed.ts";
const P = "P1-S";
const STREAMS = ["P1-S", "STREAM", "STREAM5", "SPIKE", "REV5-SESS", "REV6-STREAMS", "REV6-H7", "REV9-STREAM"];
export const MUTANTS = [
  // ── Rule 70: "the wait for a releasing predecessor per (actor, operation, key)". Wrong: a new key waits for any closing session of its op.
  m("s1.wait-per-op", [P], [
    [S, "Object.values(s.closing).some((c) => c.actor === actor && c.slot === slot);", 'Object.values(s.closing).some((c) => c.actor === actor && c.slot.split("|")[0] === slot.split("|")[0]);'],
    [S, '(y) => y.st === "Queued" && y.actor === gone.actor && y.slot === gone.slot,', '(y) => y.st === "Queued" && y.actor === gone.actor && y.slot.split("|")[0] === gone.slot.split("|")[0],'],
  ]),
  // Same rule, the other side (control): no wait at all for a releasing predecessor of the same key.
  m("s1.no-predecessor-wait", STREAMS, [[S, "Object.values(s.closing).some((c) => c.actor === actor && c.slot === slot);", "false;"]]),
  // Operations O4: "Equal keys in different actors have independent sessions". Wrong: one actor's closing session holds another actor's same key.
  m("s1.wait-ignores-actor", STREAMS, [
    [S, "Object.values(s.closing).some((c) => c.actor === actor && c.slot === slot);", "Object.values(s.closing).some((c) => c.slot === slot);"],
    [S, '(y) => y.st === "Queued" && y.actor === gone.actor && y.slot === gone.slot,', '(y) => y.st === "Queued" && y.slot === gone.slot,'],
  ]),
  // T9 "Leave, key gone: bookmark kept"; "Placement starts: restored `last`" (2.11.12.3's dim price). Wrong: a `latest` key that leaves forgets
  // its `last` and `heard`, so re-watching a symbol shows nothing (and an equal tick is heard again). A reload still restores it.
  m("s1.leave-forgets-last", [P], [[S, "  const out = drop(s, x.id);\n  return x.st", '  if (cx.machine(x.machine).streams?.[x.op]?.delivers === "latest") writeMark(cx, x, undefined);\n  const out = drop(s, x.id);\n  return x.st']]),
  // T1 ping row, `Connecting`: "Does not re-arm" (2.11.3: "Until a connection registers, a ping does not extend it"). Wrong: it re-arms.
  m("s1.ping-connecting-rearms", STREAMS, [[S, 'cx.note("PingsWithoutLive", { op: x.op }); // does not re-arm', 'cx.note("PingsWithoutLive", { op: x.op }); armIdle(cx, x, spec);']]),
  // T1: the deadline is "not armed" in `Dropped`. Wrong: a ping in `Dropped` arms it, so an SDK healing itself ends `Silent`.
  m("s1.ping-dropped-arms", STREAMS, [[S, 'if (x.st === "Dropped") return y;', 'if (x.st === "Dropped") { armIdle(cx, x, spec); return y; }']]),
  // 2.11.10: a server with no heartbeat "reconnects each `idle`, flagged `IdleWithoutPing`, and does not end". Wrong: flagged, then ended.
  m("s1.silent-unpinged-ends", STREAMS, [[S, 'if (!x.pinged) cx.note("IdleWithoutPing", { op: x.op });\n      return lose(', 'if (!x.pinged) { cx.note("IdleWithoutPing", { op: x.op }); return end(s, x, spec, cx, "Silent"); }\n      return lose(']]),
  // T1 `lose`: "A `Silent` end neither adds nor resets `flaps`". Wrong: a Silent end resets them.
  m("s1.silent-resets-flaps", STREAMS, [[S, "? x.flaps + 1\n      : x.flaps;", '? x.flaps + 1\n      : why === "Silent" ? 0 : x.flaps;']]),
  // 2.11.10: "8 connections in a row that register and die within `healthy` end `Flapping`". Wrong: 7.
  m("s1.flap-at-7", STREAMS, [[S, "if (!retried || flaps >= 8) {", "if (!retried || flaps >= 7) {"]]),
  // T1: only `healthy` elapsed resets `n` and `flaps` (2.11.10's recipe: "never reset on a value", req C3). Wrong: a value resets `flaps`.
  m("s1.value-resets-flaps", STREAMS, [[S, "  let cur = s;\n  let y = x;", "  let cur = s;\n  let y: Session = { ...x, flaps: 0 };"]]),
  // 2.11.10: "A connection that never registers spends and restores nothing, so offline waits forever". Wrong: an unregistered connection
  // that fails counts as a flap, so a long outage ends `Flapping`.
  m("s1.unregistered-flaps", STREAMS, [[S, 'why !== "Silent" && x.liveSince !== undefined && cx.now - x.liveSince < spec.healthyMs', 'why !== "Silent" && cx.now - (x.liveSince ?? cx.now) < spec.healthyMs']]),
  // T1: `healthy` elapsed resets `n` and `flaps`. Wrong: only `n` (control).
  m("s1.healthy-keeps-flaps", STREAMS, [[S, 'if (kind === "healthy") return put(s, { ...x, n: 0, flaps: 0 });', 'if (kind === "healthy") return put(s, { ...x, n: 0 });']]),
  // T5, `Dropped`: "`last = { v, dropAt, not own }`, nothing delivered"; a later proof confirms "only if `last.own`". Wrong: own.
  m("s1.dropped-value-own", STREAMS, [[S, "last: { v: f, at: cx.now, own: live },", "last: { v: f, at: cx.now, own: true },"]]),
  // T5 "Leaving `Live`: `last.at = now` if confirmed"; 2.11.12.3 "Half-open: 25 s, `Silent`, dim with true age". Wrong: the age stays the arrival.
  m("s1.leave-live-no-stamp", [P, "STREAM5-LATEST"], [[S, "const last = x.last && x.confirmed ? { last: { ...x.last, at: cx.now } } : {};", "const last = {};"]]),
  // T4 `latest`: "At admission the slot must be current and match the connection, or discard (`NotLive`)"; 2.11.12.3 "A queued tick from before
  // a drop is fenced and discarded". Wrong: a value in mail when the connection stops being current is kept.
  m("s1.no-fence-in-mail", STREAMS, [[S, "(!current || text(x.inFlight.item.v) !== t)", "(current && text(x.inFlight.item.v) !== t)"]]),
  // 2.11.12.3 "Equal price after reconnect: undimmed, not heard" (T4's `heard`). Wrong: a reconnect forgets `heard`, so an equal tick is a turn.
  m("s1.reconnect-forgets-heard", [P, "STREAM5-LATEST"], [[S, "    n: x.n + 1,\n    flaps,", "    n: x.n + 1,\n    heard: undefined,\n    flaps,"]]),
  // T3: "`at = v[position] ?? at`. No comparison: last delivered wins, may move backward". Wrong: the bookmark only moves forward.
  m("s1.bookmark-max", STREAMS, [[S, "writeMark(cx, x, { at: at ?? b?.at, filled: b?.filled ?? false }); // T3", 'writeMark(cx, x, { at: typeof at === "number" && typeof b?.at === "number" ? Math.max(at, b.at) : at ?? b?.at, filled: b?.filled ?? false }); // T3']]),
  // Rule 70: "A released session's undelivered items are discarded with evidence". Wrong: discarded silently.
  m("s1.release-silent-discard", STREAMS, [[S, '    cx.note("discarded", { op: x.op, item: q.kind });\n  disarmAll', "    void q;\n  disarmAll"]]),
  // Operations O4: "A terminal session restarts only when its activity starts again (identity change or re-entry of its state)". Wrong: an
  // Ended session is re-opened on the actor's next committed turn.
  m("s1.ended-restarts-on-a-turn", STREAMS, [[S, "      if (own(s.sessions, id)) continue;\n      const spec = specOf(cx, a.machine, p.activity.op);", '      if (own(s.sessions, id) && own(s.sessions, id)!.st !== "Ended") continue;\n      if (own(s.sessions, id)) s = drop(s, id);\n      const spec = specOf(cx, a.machine, p.activity.op);']]),
  // T6: "No merge upgrades an answer". Wrong: `live()` then `live({ proof })` between two values merges to the proof.
  m("s1.merge-upgrades", STREAMS, [[F, 'return a["proof"] !== undefined ? b : a;', 'return a["proof"] !== undefined ? a : b;']]),
  // T6: "... or hides a drop". Wrong: a `down` after a `live` in one group is dropped.
  m("s1.merge-hides-down", STREAMS, [[F, "    if (g.live) g.down2 = s;\n    else g.down1 = s;", "    if (!g.live) g.down1 = s;"]]),
  // T6 / 2.11.4: `Feed.callback` is "Bounded at 1,024". Wrong: 4,096 when the author names none.
  m("s1.callback-bound-4096", STREAMS, [[F, "const bound = cb.bound ?? 1024;", "const bound = cb.bound ?? 4096;"]]),
  // T4: in `Repairing` "it pulls into `buf` until full" (1,024). Wrong: 4,096.
  m("s1.repair-buf-4096", STREAMS, [[S, "if (buf.length >= (spec.callbackBound ?? 1024)) {", "if (buf.length >= (spec.callbackBound ?? 4096)) {"]]),
  // T1 `register` (`latest`, T5 `Connecting`/`live()`): "`Live`, `value` undefined" until a value of this connection. Wrong: a bare `live()`
  // after a reconnect confirms the previous connection's own `last`.
  m("s1.live-confirms-own", STREAMS, [[S, "x = { ...x, confirmed: sig.proof !== undefined && x.last?.own === true };", "x = { ...x, confirmed: x.last?.own === true };"]]),
  // T1 `connect` (`every`): `subscribe(input, { from: claim })`, the bookmark at connect. Wrong: a reconnect of a key after a key change asks
  // from the session's first claim, not the partition's (only differs when the bookmark moved).
  m("s1.from-is-first-claim", STREAMS, [[S, "return put(s, { ...x, conn, claim: b?.at, st: \"Connecting\", regInConn: false });", "return put(s, { ...x, conn, claim: x.connected && x.claim !== undefined ? x.claim : b?.at, st: \"Connecting\", regInConn: false });"]]),

  // T6 release: "run finalizers, awaited". Wrong: a `Feed.callback`'s finalizer never runs, so the adapter's source (an EventSource's
  // `close()`) stays open behind every reconnect.
  m("s1.no-finalizer", STREAMS, [[F, 'const r = typeof finalizer === "function" ? finalizer() : undefined;', "const r = undefined;"]]),

  // ── Lies: one per excuse an oracle builds on the runtime's word.
  // session.search.ts: rule 70's "one connection per key" is switched off for the whole run once the runtime has said `ReleaseOverdue`. This
  // runtime never waits for a releasing predecessor and says `ReleaseOverdue` at every close.
  m("lie:s1.overdue-excuse", ["SEARCH-SESSION", "REV5-SESS"], [
    [S, "Object.values(s.closing).some((c) => c.actor === actor && c.slot === slot);", "false;"],
    [S, '  cx.command({ k: "close", conn: x.conn });\n  cx.arm(`overdue/', '  cx.command({ k: "close", conn: x.conn });\n  cx.note("ReleaseOverdue", { op: x.op });\n  cx.arm(`overdue/'],
  ]),
  // P1-S, ticker: "both Live after 60 s" reads only the runtime's row, never a connection (B is never quoted). This runtime reports `Live` for
  // a session whose connection the fake has closed, i.e. any session that is not Ended, Waiting or Queued.
  m("lie:s1.row-says-live", [P], [[S, '    const c =\n      x.st === "Live" || x.st === "Repairing" ? "Live"', '    const c =\n      x.st === "Live" || x.st === "Repairing" || x.st === "Dropped" ? "Live"']]),
];
