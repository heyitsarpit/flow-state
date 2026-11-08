// Audit 1 (phase 1 area H re-audit, rounds 14 finish to 15b): wrong runtimes written by an independent auditor from the design text (OD48-OD51 and
// the rules they touch), not from the builders' mutant lists. Each names the design rule it breaks in its id's comment. `correct:` ids are not wrong
// runtimes: they are correct variations the design allows (or now requires), kept to show a pin that fails them; they claim no kill.
const m = (id: string, kills: readonly string[], edits: ReadonlyArray<readonly [string, string, string]>, unscored?: string) => ({ id, kills, edits, ...(unscored ? { unscored } : {}) });
export const MUTANTS = [
  // Rule 15 (OD49): live work includes every queued commit of the exited activation, "including a commit queued behind a Held head".
  m("audit-1.r15-queue-behind-held-not-live", ["R14-FIX-01", "R15-01"], [
    ["turn.ts", "if (l.w.some((x) => ownedByExited(inc, exits, x.owner))) return true;", 'if (l.head?.phase.t !== "held" && l.w.some((x) => ownedByExited(inc, exits, x.owner))) return true;'],
  ]),
  // Rule 15 (OD49): "A Held head is not live work".
  m("audit-1.r15-held-head-is-live", ["R14-FIX-01", "R15-01"], [
    ["turn.ts", 'h !== undefined && h.phase.t !== "held" && ownedByExited', "h !== undefined && ownedByExited"],
  ]),
  // Rule 15 (R8, OD51): the static check reads only the ending's own op's lane; "the runtime still denies" other operations' work.
  m("audit-1.r15-own-op-only", ["R14-FIX-01", "R15-01"], [
    ["turn.ts", "if (l.actor !== w.a.key) return false;", 'if (l.actor !== w.a.key || (it?.k === "ending" && l.op !== it.op)) return false;'],
  ]),
  // Rule 15: an active subroutine counts as live work.
  m("audit-1.r15-subroutine-ignored", ["R14-FIX-01"], [["turn.ts", "if (exits.some((n) => frag.nodes[n]!.subroutine)) return true;", ""]]),
  // Rule 14 (OD49): a target naming the handler's own state re-enters it, and the re-entry is a new activation.
  m("audit-1.r14-reentry-keeps-activation", ["R14-FIX-01", "R15-01"], [
    ["turn.ts", "for (const n of enters) activations[n] = nextGen(w.tx);", "for (const n of enters) activations[n] = inc.activations[n] ?? nextGen(w.tx);"],
  ]),
  // Rule 24/43 (Q3 A, OD50): `cancelAll(k)` takes its key as `cancel` does. Wrong: a keyed cancelAll outside an ending does nothing.
  m("audit-1.cancel-all-keyed-does-nothing", ["P1-H", "R15-01"], [
    ["turn.ts", 'if (cancels && !mem.key && it?.k !== "ending"', 'if (cancels && (!mem.key || mem.verb === "cancelAll") && it?.k !== "ending"'],
  ]),
  // Rule 24 (Q3 A): "On a Held lane it releases the hold and the lane is Idle". Wrong: with a queue, only the queue ends.
  m("audit-1.cancel-all-leaves-the-head", ["P1-H", "R15-01"], [["lane.ts", "setLane(tx, cleared); cell(tx, \"cancel\", cleared, a);", "setLane(tx, cleared);"]]),
  // 2.7.13 (cancelAll): "in Idle it does nothing, with evidence". Wrong: no cell, no evidence.
  m("audit-1.cancel-all-idle-silent", ["P1-H"], [["lane.ts", 'if (!lane?.w.length) return cell(tx, "cancel", lane, a);', 'if (!lane) return; if (!lane.w.length) return cell(tx, "cancel", lane, a);']]),
  // Rule 24 (R10, OD51): beside a release "the head is left to the release". Wrong: cancelAll also cancels the head.
  m("audit-1.cancel-all-release-also-cancels-head", ["P1-H"], [
    ["lane.ts", "if (released && lane) return setLane(tx, dropW(tx, lane));", 'if (released && lane) { setLane(tx, dropW(tx, lane)); return cell(tx, "cancel", tx.w.lanes[lane.id], a); }'],
  ]),
  // Rule 43 (R2, OD50): on an unkeyed op a key-less member names its one lane "in every handler, a NotSent ending's included". Wrong: keyed limits in endings.
  m("audit-1.unkeyed-keyless-in-ending-keyed-rule", ["R15-01", "R15-02"], [
    ["turn.ts", ": op.keyFields?.length === 0", ': op.keyFields?.length === 0 && it?.k !== "ending"'],
  ]),
  // 2.7.13 disposal row (OD50 one shape): "a definite ending drops the head". Wrong: every ending during disposal keeps its head Held on disk.
  m("audit-1.disposal-definite-keeps-head", ["R15-01", "PAY-16"], [["lane.ts", 'e.ch === "unknown" ? { ...lane, head:', "true ? { ...lane, head:"]]),
  // C173 (R9, OD51): `forget` removes the record, "retired, old-version or undecodable". Wrong: an undecodable record stays.
  m("audit-1.forget-keeps-undecodable", ["R15-01", "P1-H"], [["step.ts", "if (r || Object.hasOwn(tx.w.undecodable, key))", "if (r)"]]),
  // C173 / Q1 A: "a Held lane, with its queued commits, stays an unbound lane"; rule 24: nothing drops a queued commit silently. Wrong: forget drops W.
  m("audit-1.forget-drops-the-queue", ["R15-01", "P1-H"], [["step.ts", "else setLane(tx, { ...l, parked: [] });", "else setLane(tx, { ...l, parked: [], w: [] });"]]),
  // C173 (amendment 9): a gone op's hold "is dropped, with evidence HoldForgotten". Wrong: dropped silently.
  m("audit-1.forget-gone-op-hold-silent", ["P1-H"], [["step.ts", 'if (l.head) note(tx, "HoldForgotten", { op: l.op, attempt: l.head.id });', ""]], "vacuous: a lane whose operation is gone is quarantined at the boot and never reaches this loop (a probe throw there reached no case)"),
  // 2.7.13 Unbound (OD50): "An undecodable record's lanes are not unbound". Wrong: Inspection lists them as unbound.
  m("audit-1.unbound-lists-undecodable", ["R15-01", "LIFE-24"], [["adapter.ts", "|| Object.hasOwn(w.undecodable, actor);", ";"]]),
  // Same rule, the boot's report: wrong: each boot reports an undecodable record's lanes as UnboundLane.
  m("audit-1.unbound-reports-undecodable", ["R15-01"], [["durable.ts", "&& !Object.hasOwn(undecodable, l.actor)", ""]]),
  // Rule 74 / 2.7.13 Unbound: "an old-version record's lanes are" unbound, listed and reported. Wrong: an old-version record is taken as undecodable.
  m("audit-1.old-version-record-as-undecodable", ["R14-ID-02", "P1-H"], [
    ["durable.ts", 'note(tx, "OldVersionActor", { actor: v.key, fields: v.fields, now });', 'note(tx, "OldVersionActor", { actor: v.key, fields: v.fields, now }); undecodable[k.slice(6)] = true;'],
  ]),
  // 2.7.15 (Q2 A, M2, OD51): beside an old-version hold every commit declines OldVersion "under every policy, serialize included". Wrong: reject only.
  m("audit-1.old-version-declines-under-reject-only", ["P1-H", "R15-01"], [
    ["lane.ts", 'if (row === "commit") {', 'if (row === "commit" && tx.machines[a.machine]?.ops[a.op]?.concurrency === "reject") {'],
  ]),
  // Rule 74 (R7, C181): "A format newer than the running Flow's (a downgrade) reads as an old version". Wrong: a newer format is the current version.
  m("audit-1.newer-format-is-current", ["P1-H", "R14-ID-02"], [
    ["lane.ts", "const theirs = older?.[String(Math.min(fa, fb))];", "if (Math.max(fa, fb) > 2) return true; const theirs = older?.[String(Math.min(fa, fb))];"],
  ]),
  // Rule 44: a starting incarnation receives, "per lane in creation order", each lane's restored endings. Wrong: newest lane first.
  m("audit-1.restore-lanes-newest-first", ["R15-02", "R14-FIX-02"], [["durable.ts", "mintOf(a) - mintOf(b)", "mintOf(b) - mintOf(a)"]]),
  // C173 / Q1 A: `forget` makes parked endings evidence and removes the record. Wrong: `forget` does nothing at all.
  m("audit-1.forget-is-a-no-op", ["R15-01", "P1-H"], [["step.ts", "onForget(tx, input.actor);", ""]]),
  // Rule 15 / 2.7.13: an ending admitted in a turn denied by rule 15 "still counts as delivered ... and is not delivered again". Wrong: redelivered once.
  m("audit-1.r15-denied-late-redelivered", ["R14-FIX-01", "R15-01"], [
    [
      "turn.ts",
      'return note(tx, sel.denied ? "Denied" : "Unhandled", { event: ev.tag, reasons: sel.reasons });',
      '{ if (sel.denied && late && item?.k === "ending" && !item.redelivered && sel.reasons.includes("LateMayNotLeave")) enqueue(tx, { ...item, redelivered: true }); return note(tx, sel.denied ? "Denied" : "Unhandled", { event: ev.tag, reasons: sel.reasons }); }',
    ],
  ]),
  // Correct variation (rule 44's one ordering rule, C179, OD51): at Runtime disposal each W entry's NotSent { Disposed } is parked before the head's unknown.
  m("correct:audit-1.disposal-w-before-unknown-head", [], [
    [
      "lane.ts",
      'setLane(tx, parkWaiting(tx, e.ch === "unknown" ? { ...lane, head: { ...h, mayHaveApplied: true, phase: { t: "held" } }, parked } : { ...rest, parked }));',
      'if (e.ch === "unknown") { const pw = parkWaiting(tx, { ...lane, head: { ...h, mayHaveApplied: true, phase: { t: "held" } } }); setLane(tx, { ...pw, parked: [...pw.parked, parked[parked.length - 1]!] }); } else setLane(tx, parkWaiting(tx, { ...rest, parked }));',
    ],
  ], "a correct variation (C179, OD51), not a wrong runtime: red only on R15-01's disposal pin, which follows the superseded C176 order"),
];
