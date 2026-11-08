// Audit 1b (re-audit of rounds 14-15b and phase 1 area H after audit 1 was closed): wrong runtimes written by an independent auditor from the design
// text (OD48-OD51 and the rules they touch), aimed at clauses audit 1 did not target, and one lie per excuse that `policy-testing` forbids (an
// obligation excused on the runtime's own report). Each comment names the rule broken. `lie:` ids fake the evidence an excuse reads; their `kills`
// name the cases where the excuse is exercised. Not spread into any gate list.
const m = (id: string, kills: readonly string[], edits: ReadonlyArray<readonly [string, string, string]>, unscored?: string) => ({ id, kills, edits, ...(unscored ? { unscored } : {}) });
export const MUTANTS = [
  // ── Audit 1's `disposal-definite-keeps-head`, re-anchored (its line moved when C179 was built). 2.7.13 disposal row: "a definite ending drops the head".
  m("1b.disposal-definite-keeps-head", ["R15-01", "PAY-16"], [["lane.ts", 'if (e.ch !== "unknown") return setLane(tx, parkWaiting(tx, { ...rest, parked: [...lane.parked, own] }));', 'if (false) return setLane(tx, parkWaiting(tx, { ...rest, parked: [...lane.parked, own] }));']]),
  // 2.7.13 disposal, one shape (OD50) with C179: a definite ending is parked and each W entry's `NotSent { Disposed }` after it. Wrong: W first.
  m("1b.disposal-definite-w-first", ["R15-01", "PAY-16"], [["lane.ts", 'if (e.ch !== "unknown") return setLane(tx, parkWaiting(tx, { ...rest, parked: [...lane.parked, own] }));', 'if (e.ch !== "unknown") { const pw = parkWaiting(tx, rest); return setLane(tx, { ...pw, parked: [...pw.parked, own] }); }']]),
  // Rule 44: the parked endings first, "in saved order". Wrong: each lane's parked endings in reverse.
  m("1b.r44-parked-reverse-order", ["R15-01", "R15-02", "PAY-16"], [["durable.ts", "for (const p of l.parked ?? []) {", "for (const p of [...(l.parked ?? [])].reverse()) {"]]),
  // Rule 44 / D107: on a reload each W entry's `NotSent { Restored }` first, then the held head's `unknown { Restored }`. Wrong: the head first.
  m("1b.r44-restore-head-before-w", ["R15-02", "R14-FIX-02", "R15-01"], [
    ["durable.ts", "// D107: W first.", 'const early = !parked.some((p) => p.attempt === h.id) && !l.releasing; if (early) mail(tx, l, h, { ch: "unknown", reason: "Restored" }, true, !h.held); // D107: W first.'],
    ["durable.ts", "mail(tx, l, h, ending, true, !h.held);", "if (!early) mail(tx, l, h, ending, true, !h.held);"],
  ]),
  // Rule 17 / 2.7.13 (G3, OD49): a head whose own ending is parked restores as parked, "never unknown { Restored } for the same Attempt". Wrong: both.
  m("1b.r17-own-parked-also-restored", ["R14-FIX-02", "R15-01", "R15-02"], [["durable.ts", "if (ownParked) {", "if (ownParked && false) {"]]),
  // Rule 17 (OD49) / storage-refused row: a re-send whose capture is refused returns to Held and delivers `unknown { StorageRefused }`. Wrong: silent.
  m("1b.r17-refused-resend-silent", ["R14-FIX-01", "R14-FIX-02", "R15-01"], [["lane.ts", "    noteEnding(tx, { op: l!.op, attempt: h.id }, e);\n    settleHead(tx, l!, e);\n  },\n  resolve(", "    setLane(tx, { ...l!, head: { ...h, phase: { t: \"held\" } } });\n  },\n  resolve("]]),
  // Rule 24 (OD46, OD51 R6): a `cancel` waiting on a never-sent head's write-ahead ack, refused: `NotSent { StorageRefused }` (the cancel's). Wrong: `Cancelled`.
  m("1b.r24-cancel-refused-ack-ends-cancelled", ["P1-H", "R15-01"], [["durable.ts", "if (!i.ok) {", 'if (!i.ok && p.then === "cancel") return afterAck(tx, { ...l, head: { ...l.head!, phase: { t: "ready" } } }, "cancel"); if (!i.ok) {']]),
  // C180 (R6, OD51): a replacement whose replaced head's ack is refused: the head ends `Superseded` (evidence) and the newer commit is sent. Wrong: the
  // pre-C180 runtime, the replaced head delivered `NotSent { StorageRefused }`.
  m("1b.c180-replacement-refused-ack-delivered", ["P1-H"], [["durable.ts", 'if (!i.ok && p.then === "replace") {', "if (false) {"]]),
  // Rule 24 (OD50, agent reading): `cancelAll` on a head on the wire interrupts it and the lane stays `InFlight` until `unknown { Cancelled }` lands.
  // Wrong: the head is Held at once.
  m("1b.cancel-all-wire-held-at-once", ["P1-H", "R15-01"], [["lane.ts", "  cell(tx, \"cancel\", cleared, a);\n  for (const x of queued) {", "  cell(tx, \"cancel\", cleared, a);\n  { const c2 = tx.w.lanes[lane.id]; if (c2?.head?.phase.t === \"wire\") setLane(tx, { ...c2, head: { ...c2.head, phase: { t: \"held\" } } }); }\n  for (const x of queued) {"]]),
  // Rule 24 (R5, OD51) / C179: the queued commits' `NotSent { Cancelled }` "in mint order". Wrong: reverse lane order.
  m("1b.cancel-all-queue-reversed", ["P1-H", "R15-01"], [["lane.ts", "for (const x of queued) {", "for (const x of [...queued].reverse()) {"]]),
  // Rule 24 (Q3 A): "the queue is emptied first, so nothing is promoted". Wrong: the head is cancelled first, which promotes W's first commit and sends it.
  m("1b.cancel-all-promotes-before-emptying", ["P1-H", "R15-01"], [["lane.ts", "  const queued = lane.w;\n  const cleared = { ...lane, w: [] };\n  setLane(tx, cleared);\n  cell(tx, \"cancel\", cleared, a);", "  cell(tx, \"cancel\", lane, a);\n  const now = tx.w.lanes[lane.id];\n  const queued = now?.w ?? [];\n  if (now) setLane(tx, { ...now, w: [] });"]]),
  // Rule 43 (U2, D22): on a keyed op a key-less member names "that ending's own Attempt only"; resolved, it acts as on Idle; in a NotSent ending it does
  // nothing. Wrong: it falls back to the ending's key's lane (the promoted head, or a NotSent's lane).
  m("1b.r43-keyless-falls-back-to-key", ["R15-02", "R15-01", "P1-H"], [["turn.ts", "? laneOfAttempt(tx.w, it.attempt)", "? (laneOfAttempt(tx.w, it.attempt) ?? tx.w.lanes[laneKey(w.a.key, mem.op, it.key)])"]]),
  // Rule 15: "A call started in a late turn is an ordinary call with its own owner: lateness is not transitive". Wrong: it inherits the late owner.
  m("1b.r15-lateness-transitive", ["R14-FIX-01", "R15-01"], [["turn.ts", "const ownerOf = (w: Walk, part: Part): Owner => {", 'const ownerOf = (w: Walk, part: Part): Owner => { if (w.late && w.item?.k === "ending") return w.item.owner as Owner;']]),
  // Rule 15 / 2.7.13 (F8): an ending admitted in a Denied turn "keeps its lane effect", and a hold it leaves stays until a later keyed cancel or
  // cancelAll. Wrong: the denied late unknown's hold is released.
  m("1b.r15-denied-late-releases-hold", ["R14-FIX-01", "R15-01"], [
    ["turn.ts", 'return note(tx, sel.denied ? "Denied" : "Unhandled", { event: ev.tag, reasons: sel.reasons });', '{ if (sel.denied && late && item?.k === "ending" && item.attempt) { const hl = tx.w.lanes[tx.w.byAttempt[item.attempt] ?? ""]; if (hl?.head?.id === item.attempt && hl.head.phase.t === "held") cell(tx, "cancel", hl, argsOf(hl)); } return note(tx, sel.denied ? "Denied" : "Unhandled", { event: ev.tag, reasons: sel.reasons }); }'],
  ]),
  // Rule 14 (OD49): re-entry by a history target is a new activation too. Wrong: a history re-entry keeps the old activation.
  m("1b.r14-history-reentry-keeps-activation", ["R14-FIX-01", "R15-01", "FRAG"], [["turn.ts", "for (const n of enters) activations[n] = nextGen(w.tx);", "for (const n of enters) activations[n] = mv.history ? (inc.activations[n] ?? nextGen(w.tx)) : nextGen(w.tx);"]]),
  // Rule 8 (OD38, OD49): a refused turn of an ending (an outcome mapper that throws at admission included) is delivered once more. Wrong: never again.
  m("1b.r8-refused-ending-not-redelivered", ["R14-FIX-02", "REV8", "R14-FIX-01"], [["turn.ts", 'if (item.k === "ending" && !again) {', 'if (item.k === "ending" && !again && false) {']]),
  // 2.7.13 forget (C173): it removes the record "retired, old-version or undecodable". Wrong: a retired record with boot mail is kept.
  m("1b.forget-keeps-retired-with-boot-mail", ["R15-01"], [["step.ts", "if (r || Object.hasOwn(tx.w.undecodable, key)", "if ((r && !r.bootMail?.length) || Object.hasOwn(tx.w.undecodable, key)"]]),
  // 2.7.13 forget (OD51 R9): "A held lane stays an unbound lane, with no mark". Wrong: forget marks it releasing, so the adopting ensure hears nothing.
  m("1b.forget-marks-held-lane", ["R15-01", "P1-H"], [["step.ts", "else setLane(tx, { ...l, parked: [] });", "else setLane(tx, { ...l, parked: [], releasing: true as const });"]]),
  // 2.7.13 forget (amendment 9): a hold on a lane whose operation is gone "is dropped, with evidence". Wrong: evidence said, the hold kept.
  m("1b.forget-gone-op-quarantine-kept", ["P1-H"], [["step.ts", "tx.w = { ...tx.w, quarantined };", "tx.w = { ...tx.w };"]]),
  // 2.7.13 Unbound (OD50): unbound while the identity has no decoded record "(live or retired)". Wrong: a retired record's lanes are listed unbound.
  m("1b.unbound-lists-retired", ["R15-01", "LIFE-24", "P1-H"], [["adapter.ts", "|| Object.hasOwn(w.retired, actor)", ""]]),
  // Same rule, the boot's report: wrong: a retired record's held lanes are reported UnboundLane at each boot.
  m("1b.unbound-reports-retired", ["R15-01", "P1-H"], [["durable.ts", "const recorded = new Set([...actors, ...retired]", "const recorded = new Set([...actors]"]]),
  // 2.7.15 (Q2 A, M2): beside an old-version hold every commit declines OldVersion "under every policy". Wrong: `latest` and `cancel` send beside it.
  m("1b.old-version-latest-cancel-send", ["P1-H", "R13-KEYS", "R15-01"], [["lane.ts", 'if (row === "commit") {', 'if (row === "commit" && !["latest", "cancel"].includes(String(tx.machines[a.machine]?.ops[a.op]?.concurrency))) {']]),
  // 2.7.15: beside an old-version hold "a keyed `idle` denies". Wrong: it passes.
  m("1b.old-version-idle-passes", ["R13-KEYS", "P1-H"], [["turn.ts", '(t.verb === "idle" ? oldVersionLane(w.tx, w.a.key, w.a.machine, t.op) : undefined)', "undefined"]]),
  // Rule 74 / C181 (R7, OD51): an older format is read by recomputing the current Schema in that format. Wrong: across formats, names only.
  m("1b.r74-older-format-by-names", ["P1-H", "R14-ID-02"], [["lane.ts", "  const theirs = older?.[String(Math.min(fa, fb))];\n  return theirs !== undefined && sameSet(fa < fb ? a : b, theirs);", '  return sameSet(a.map((f) => f.split("#")[0]!), b.map((f) => f.split("#")[0]!));']]),
  // C184 (H1, OD51): a default under `suspend` is read too. Wrong: suspend is not followed.
  m("1b.c184-suspend-unread", ["P1-H"], [["../conformance/compile/memory.ts", 'if (o["_tag"] === "Suspend"', 'if (false && o["_tag"] === "Suspend"']]),
  // C184: a decoding default is read by asking its getter for the absent key. Wrong: only constructor defaults are read.
  m("1b.c184-decoding-default-unread", ["P1-H"], [["../conformance/compile/memory.ts", 'if (o["_tag"] === "TransformOptionalEffect"', 'if (false && o["_tag"] === "TransformOptionalEffect"']]),

  // ── Lies: one per excuse built from the runtime's report.
  // Self-release cause (drive.ts `releasedBySelf`): a Released plus a `lane.cancel.Held` cell this step, with a handler that may cancel. This runtime
  // releases every restored hold after its restored delivery, with exactly that evidence, whether or not the handler's cancel ran.
  m("lie:1b.self-release-faked", ["R15-01", "R15-02", "R14-FIX-02", "P1-H"], [
    ["turn.ts", 'if (ran && item.ending.ch === "unknown") endHeldThisTurn(tx, item.attempt);', 'if (ran && item.ending.ch === "unknown") { endHeldThisTurn(tx, item.attempt); const sl = tx.w.lanes[tx.w.byAttempt[item.attempt ?? ""] ?? ""]; if (item.restored && sl?.head?.id === item.attempt && sl.head.phase.t === "held") cell(tx, "cancel", sl, argsOf(sl)); }'],
  ]),
  // Forget excuse (drive.ts, the `forget` step): attempts with a runtime `parked` and no runtime `delivered` become `lettingGo`. This runtime says
  // `parked` for each held head at dispose, then at `forget` drops a held lane with no queue (Released) instead of keeping it unbound.
  m("lie:1b.forget-fake-parked", ["R15-01", "P1-H"], [
    ["step.ts", 'const onDisposeActor = (tx: Tx, key: string, how: "end" | "dispose" | "remount") => {', 'const onDisposeActor = (tx: Tx, key: string, how: "end" | "dispose" | "remount") => { if (how !== "remount") for (const fl of Object.values(tx.w.lanes)) if (fl.actor === key && fl.head?.phase.t === "held") note(tx, "parked", { op: fl.op, attempt: fl.head.id });'],
    ["step.ts", "else setLane(tx, { ...l, parked: [] });", 'else if (l.head?.phase.t === "held" && l.w.length === 0) { note(tx, "Released", { op: l.op, attempt: l.head.id }); deleteLane(tx, l.id); } else setLane(tx, { ...l, parked: [] });'],
  ]),
  // The same, refined so the waits list the faked parked ending (the first is red by "(j) parked, and no wait says so" in unrelated cases): a real
  // parked `unknown { Restored }` entry at dispose, which an adopting ensure hears as it would the hold. Red only by R15-01's forget assertions;
  // with the forget excuse deleted from drive.ts the same 8 cases are red and the control stays 941/941 (the excuse is used by no case).
  m("lie:1b.forget-fake-parked-2", ["R15-01", "P1-H"], [
    ["step.ts", 'const onDisposeActor = (tx: Tx, key: string, how: "end" | "dispose" | "remount") => {', 'const onDisposeActor = (tx: Tx, key: string, how: "end" | "dispose" | "remount") => { if (how === "dispose") for (const fl of Object.values(tx.w.lanes)) if (fl.actor === key && fl.head?.phase.t === "held" && fl.w.length === 0 && !fl.parked.some((p) => p.attempt === fl.head!.id)) { note(tx, "parked", { op: fl.op, attempt: fl.head.id }); setLane(tx, { ...fl, parked: [...fl.parked, { attempt: fl.head.id, ending: { ch: "unknown", reason: "Restored" }, owner: fl.head.owner, input: fl.head.input }] }); }'],
    ["step.ts", "else setLane(tx, { ...l, parked: [] });", 'else if (l.head?.phase.t === "held" && l.w.length === 0) { note(tx, "Released", { op: l.op, attempt: l.head.id }); deleteLane(tx, l.id); } else setLane(tx, { ...l, parked: [] });'],
  ]),
  // (h)'s turn-end exemption: runtime `delivered`, then `lane.turnEnd.HeldThisTurn`, no runtime re-send since. This runtime says a `cancel`-policy unknown
  // delivered and runs no handler for it (the turn-end release follows, so the head leaves the disk).
  m("lie:1b.turn-end-unheard", ["R15-01", "P1-H", "R14-FIX-01"], [
    ["turn.ts", "const ran = attemptTurn(tx, item, mapped.event, () => {", 'const ran = item.ending.ch === "unknown" && !item.restored && tx.machines[a.machine]?.ops[item.op]?.concurrency === "cancel" ? true : attemptTurn(tx, item, mapped.event, () => {'],
  ]),
  // `replacedUnderCancel`: no runtime `ending` for the Attempt, so any later runtime `mint` of the op by its owner excuses it. This runtime drops every
  // `cancel`-policy success at settlement with no ending at all.
  m("lie:1b.replaced-no-ending", ["R15-01", "P1-H"], [
    ["lane.ts", "export const settleSend = (tx: Tx, lane: Lane, send: string, ending: Ending) => {", 'export const settleSend = (tx: Tx, lane: Lane, send: string, ending: Ending) => { if (ending.ch === "success" && tx.machines[lane.machine]?.ops[lane.op]?.concurrency === "cancel") { disarmTimer(tx, `timeout/${lane.head!.id}`); return emptied(tx, { ...lane, w: [] }); }'],
  ]),
];
