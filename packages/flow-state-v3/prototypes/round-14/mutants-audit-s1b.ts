// Audit S1b (phase 1 streams, round 2, 99db9436): a narrow re-audit by an independent auditor. Wrong runtimes from the design text (rules 68-71,
// O4, Streams T1-T9, 2.11.10, 2.11.12.3) and the user's Q1 B `Feed.multiplex` (STREAMS-QUESTIONS.md), aimed at what round 2 added. Each comment
// names the rule broken. `lie:` ids fake what a rebuilt check reads. Same shape as mutants-audit-s1.ts; not spread into any gate list.
const m = (id: string, kills: readonly string[], edits: ReadonlyArray<readonly [string, string, string]>) => ({ id, kills, edits });
const S = "sessions.ts";
const F = "feed.ts";
const H = "../conformance/fixtures/multiplex.ts";
const P = "P1-S";
const STREAMS = ["P1-S", "STREAM", "STREAM5", "SPIKE", "REV5-SESS", "REV6-STREAMS", "REV6-H7", "REV9-STREAM"];
const SEARCH = ["SEARCH-SESSION", "SEARCH-REPAIR"];
const ahead: readonly [string, string, string] = [S, "writeMark(cx, x, { at: at ?? b?.at, filled: b?.filled ?? false }); // T3", "writeMark(cx, x, { at: (at as any)?.seq !== undefined ? { ...(at as object), seq: (at as any).seq + 1 } : (at ?? b?.at), filled: b?.filled ?? false }); // T3"];
export const MUTANTS = [
  // 2.11.10: "`exponential(\"500 millis\")`, jittered, then capped at 30 s". Wrong: factor 4 (500, 2000, 8000, then the cap).
  m("s1b.backoff-factor-4", STREAMS, [[S, "Math.round(500 * 2 ** n * (0.8", "Math.round(500 * 4 ** n * (0.8"]]),
  // 2.11.10 "jittered" (Effect's `jittered`: each delay drawn anew). Wrong: one factor per session, so two sessions keep their phase forever.
  m("s1b.jitter-per-session", STREAMS, [[S, "(0.8 + 0.4 * unit(`${id}#${n}`))", "(0.8 + 0.4 * unit(id))"]]),
  // T3 bound (req M1): "256 entries per operation in a slice, oldest out". Wrong: 128.
  m("s1b.bound-128", STREAMS, [[S, "const BOUND = 256;", "const BOUND = 128;"]]),
  // T5 "Leaving `Live`: `last.at = now` if confirmed; not confirmed". Wrong: `down` stamps an unconfirmed (restored) `last` too.
  m("s1b.down-stamps-unconfirmed", STREAMS, [[S, "...(leaving && x.last && x.confirmed ? { last: { ...x.last, at: cx.now } } : {}),", "...(leaving && x.last ? { last: { ...x.last, at: cx.now } } : {}),"]]),
  // The same row through `lose` (a stream failing or ending while Live).
  m("s1b.lose-stamps-unconfirmed", STREAMS, [[S, "const last = x.last && x.confirmed ? { last: { ...x.last, at: cx.now } } : {};", "const last = x.last ? { last: { ...x.last, at: cx.now } } : {};"]]),
  // T1 `down(r)` in `Live`: "`dropAt = now`". Wrong: only the first drop of the session sets it, so a value after a later drop ages from an older loss.
  m("s1b.dropat-first-only", STREAMS, [[S, "  let x: Session = {\n    ...current(x0),\n    regInConn: true,", "  let x: Session = {\n    ...x0,\n    regInConn: true,"]]),
  // Q2 A: `FillsOtherKey` when a key's first registration finds no record and the field filled by another key. Wrong: also on a return to a key
  // that has its own record.
  m("s1b.fills-other-key-on-return", [P], [[S, "if (!b && !E && otherFilled(cx, x))", "if (!E && otherFilled(cx, x))"]]),
  // Q1 B: "`add`, the first session of a key". Wrong: a second session of an already-added key joining an open socket sends `add` again.
  m("s1b.hub-readd-on-join", [P], [[H, "else if (conn.ops && !conn.dead && !route.added) {", "else if (conn.ops && !conn.dead) {"]]),
  // Q1 B: `add` only for keys that have a session. Wrong: the keys present when `connect` began are all added once it opens, so a key whose last
  // session left while the socket was connecting is subscribed and never removed.
  m("s1b.hub-adds-departed-key", [P], [
    [H, "          const ops = yield* Scope.provide(o.connect(emit), c.scope);", "          const pending = [...c.routes.values()];\n          const ops = yield* Scope.provide(o.connect(emit), c.scope);"],
    [H, "            const r = [...c.routes.values()].find((x) => !x.added);", "            const r = pending.find((x) => !x.added);"],
  ]),

  // ── Lies against the rebuilt harness.
  // Rule 70 (fake clock, `heldAtOpen`): no wait for a releasing predecessor, and each connection's input carries a counter, so the fake's
  // structural key (and the oracle's JSON key) differs per connection while the app's `subscribe` reads the same room.
  m("lie:s1b.r70-input-nonce", [...SEARCH, ...STREAMS], [
    [S, "Object.values(s.closing).some((c) => c.actor === actor && c.slot === slot);", "false;"],
    [S, "spec.subscribe.run(c.input, { from: c.from })", "spec.subscribe.run(typeof c.input === \"object\" && c.input !== null ? { ...(c.input as object), conn: c.conn } : c.input, { from: c.from })"],
  ]),
  // Rule 71's disk check reads `partition.sessions[slot].at`. This runtime keeps its bookmarks one level deeper (`{ m: mark }`), so the check
  // reads no `at`, and saves each bookmark one past the value it delivered.
  m("lie:s1b.r71-hidden-mark", [...SEARCH, ...STREAMS], [
    [S, "  own(marks(cx, x), x.slot);", "  (own(marks(cx, x), x.slot) as { m?: Mark } | undefined)?.m;"],
    [S, "    return { ...rest, [x.slot]: m };", "    return { ...rest, [x.slot]: { m } };"],
    [S, "const { [x.slot]: had, ...rest } = (old ?? {}) as Record<string, Mark>;", "const { [x.slot]: had, ...rest } = (old ?? {}) as Record<string, Mark>;\n    void had;"],
    [S, "  return Object.entries(marks(cx, x)).some(([k, b]) => k !== x.slot && k.startsWith(op) && b.filled);", "  return Object.entries(marks(cx, x)).some(([k, b]) => k !== x.slot && k.startsWith(op) && (b as { m?: Mark }).m?.filled);"],
    ahead,
  ]),
  // Rule 71, other epochs: a non-1 epoch passes when its seq is 0 and any reset was sent. This runtime saves a reset's place in epoch 99.
  m("lie:s1b.r71-any-epoch", [...SEARCH, ...STREAMS], [
    [S, "if (!b && E) writeMark(cx, x, { at: sig.restartAt, filled: false }); // row 1", "if (!b && E) writeMark(cx, x, { at: typeof sig.restartAt === \"object\" && sig.restartAt !== null ? { ...(sig.restartAt as object), epoch: 99 } : sig.restartAt, filled: false }); // row 1"],
    [S, "writeMark(cx, x, { at: it.at.at, filled: markOf(cx, x)?.filled ?? false }); // T3 row 2", "writeMark(cx, x, { at: typeof it.at.at === \"object\" && it.at.at !== null ? { ...(it.at.at as object), epoch: 99 } : it.at.at, filled: markOf(cx, x)?.filled ?? false }); // T3 row 2"],
  ]),
  // The browser-shaped EventSource: T6 release runs finalizers "awaited". This runtime skips a `Feed.callback`'s finalizer when the source failed
  // (it thinks a failed source is already closed); every row reads right, only the browser's own retry shows the open EventSource.
  m("lie:s1b.fail-skips-finalizer", STREAMS, [[F, 'const r = typeof finalizer === "function" ? finalizer() : undefined;', 'const r = typeof finalizer === "function" && !closing?.failing ? finalizer() : undefined;']]),
  // `Feed.multiplex`'s socket checks: the fake server says `subscribed` whatever the client sent, so every row goes Live. This hub marks a key
  // joining an open socket added without sending `add`.
  m("lie:s1b.hub-add-unsent", [P], [[H, "          route.added = true;\n          yield* conn.ops.add(key);", "          route.added = true;"]]),
];
