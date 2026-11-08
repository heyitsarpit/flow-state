// Rule 73's wrong runtimes (OD31): each breaks one clause of rule 73 or 2.7.17, and some LIFE case must go red on it by a named oracle.
// Same shape as mutate.ts's lists; run by ../conformance/lifetime-falsify.ts, which also lists any LIFE case no mutant turns red.
import { MUTANTS as MISC } from "./mutants-lifetime-misc.ts";
import { MUTANTS as PAY16 } from "./mutants-lifetime-pay16.ts";
import { MUTANTS as PINS_A } from "./mutants-lifetime-pins-a.ts";
import { MUTANTS as PINS_B } from "./mutants-lifetime-pins-b.ts";
const m = (id: string, kills: string, file: string, find: string, replace = "") => ({ id, kills: [kills], edits: [[file, find, replace]] as ReadonlyArray<readonly [string, string, string]> });
const WRITE = 'if (l.actor === key && l.head !== undefined && l.head.phase.t !== "held") out.push(`write:${l.op}`);';
const READ = "for (const id in w.reads) if (w.reads[id]!.actor === key && w.reads[id]!.kept) out.push(`read:${w.reads[id]!.op}`);";
export const MUTANTS = [
  // Work in flight (rule 73's list), and what keeps nothing.
  m("life.inflight-keeps-nothing", "rule:73", "step.ts", WRITE, ""),
  m("life.held-keeps", "rule:73", "step.ts", WRITE, "if (l.actor === key && l.head !== undefined) out.push(`write:${l.op}`);"),
  m("life.kept-read-keeps-nothing", "rule:73", "step.ts", READ, ""),
  m("life.every-read-keeps", "rule:73", "reads.ts", "...(tx.keeps ? { kept: true as const } : {})", "kept: true as const"),
  m("life.mail-is-work", "rule:73", "step.ts", "if (!free) {", "if (!free || hasMail(tx.w, key)) {"),
  m("life.uses-not-counted", "rule:73", "step.ts", "setUses(tx, key, [...(tx.w.uses[key] ?? []), owner]);", "setUses(tx, key, [owner]);"),
  m("life.ensure-is-a-use", "OD27 Q2", "step.ts", "setUses(tx, key, []); // rule 73", 'setUses(tx, key, ["host"]); // rule 73'),
  m("life.no-pending-use", "C105", "step.ts", "if (usesOf(tx.w, key) === 0) setUses(tx, key, undefined);", "setUses(tx, key, undefined);"),
  // Schedules wait (C124).
  m("life.schedule-fires-unused", "C124", "step.ts", "if (counted(tx, t.actor) && usesOf(tx.w, t.actor) === 0) {", "if (false) {"),
  m("life.waiting-never-wakes", "C124", "step.ts", "if (was === 0 && getActor(tx.w.actors, key)) wake(tx, key);", ""),
  m("life.waiting-survives-re-arm", "C124", "timers.ts", "const dropWaiting = (tx: Tx, key: string) => {", "const dropWaiting = (tx: Tx, key: string) => { return;"),
  m("life.waiting-lost-at-end", "C124", "step.ts", "const timers = [...armed, ...waiting,", "const timers = [...armed,"),
  // The grace.
  m("life.no-grace", "rule:73", "step.ts", "const dueAt = tx.env.now + tx.bounds.graceMs;", "const dueAt = tx.env.now;"),
  m("life.grace-never-ends", "rule:73", "step.ts", "if (usesOf(tx.w, key) !== 0 || !getActor(tx.w.actors, key) || busy(tx.w, key)) return;", "return;"),
  m("life.grace-unfenced", "rule:73", "step.ts", "const gen = `${dueAt}`;", 'const gen = "grace";'),
  // The end and the record.
  m("life.end-drops-record", "rule:73", "step.ts", 'const keep = m.persisted && how === "end";', "const keep = false;"),
  m("life.dispose-keeps-record", "OD31", "step.ts", 'const keep = m.persisted && how === "end";', "const keep = m.persisted;"),
  m("life.end-ignores-codec", "rule:73", "step.ts", "if (tx.machines[a.machine]!.persisted && !encodes(tx, a)) {", "if (false) {"),
  m("life.restored-once-per-runtime", "C126", "step.ts", "const adopted = bootMail ? bootMail : rebindActor(tx, fresh);", "const adopted = bootMail ? bootMail : [];"),
  // Sends (C105).
  m("life.send-no-restore", "C105", "step.ts", 'returnActor(tx, key, "send");', ""),
  m("life.send-absent-silent", "C105", "step.ts", "issue(tx, { code: \"SendTargetAbsent\", origin: `send ${key}`, input: { reason } });", ""),
  m("life.undecodable-is-no-record", "C105", "step.ts", 'const reason = tx.w.undecodable[key] ? "RecordUndecodable" : "NoRecord";', 'const reason = "NoRecord";'),
  // Ready (C106).
  m("life.ready-all-live", "C106", "step.ts", "if (!shared(tx, a.machine) || owedTo.has(a.key)) continue;", "continue;"),
  m("life.ready-owed-sleeps", "C106", "step.ts", "if (!shared(tx, a.machine) || owedTo.has(a.key)) continue;", "if (!shared(tx, a.machine)) continue;"),
  // Local actors, reads, diagnostics.
  m("life.no-remount", "rule:73", "step.ts", "if (!a || !tx.machines[a.machine]!.local || usesOf(tx.w, key) !== 0 || !busy(tx.w, key)) return;", "return;"),
  m("life.handle-not-identity", "C108", "adapter.ts", "const live = getActor(w.actors, actor) ?? w.retired[actor];", "const live = getActor(w.actors, actor);"),
  m("life.no-ended-with-work", "C125", "step.ts", 'note(tx, "EndedWithWork",', 'void (tx, "EndedWithWork",'),
  m("life.no-soon-note", "C111", "step.ts", "if (tx.env.now < soon.dueAt) note(", "if (false) note("),
  // Identity (rule 74, OD30), area 2.
  m("id.record-without-fields", "rule:74", "step.ts", "...(identity ? { fields: [...identity].sort() } : {})", ""),
  m("id.old-version-restored", "OD:30", "durable.ts", "if (Array.isArray(v.fields) && (v.fields.length", "if (false && Array.isArray(v.fields) && (v.fields.length"),
  m("id.version-by-names-only", "OD:30", "durable.ts", "v.fields.some((f: string, i: number) => f !== now[i])", "v.fields.some((f: string, i: number) => f.split(\":\")[0] !== now[i]!.split(\":\")[0])"),
  m("id.no-conflict", "rule:74", "step.ts", "if (was !== undefined && was !== persist) return issue(", "if (false) return issue("),
  m("id.dispose-drops-lanes", "rule:46", "step.ts", 'if (m.local && how !== "remount")', 'if (how !== "remount")'),
  // Flow.ignore (OD28, 2.7.18), area 3.
  m("ign.runs-a-turn", "OD:28", "turn.ts", "if (mm && mappedFor(mm, item)?.ignore) {", "if (false) {"),
  m("ign.unknown-held", "rule:40", "turn.ts", 'if (item.ending.ch === "unknown" && cur?.head?.phase.t === "held" && cur.head.id === item.attempt) cell(tx, "cancel", cur, argsOf(cur));', ""),
  m("ign.parked-without-incarnation", "OD:28", "turn.ts", "if (mm && mappedFor(mm, item)?.ignore) {", "if (mm && getActor(tx.w.actors, item.actor) && mappedFor(mm, item)?.ignore) {"),
  m("d5.remount-in-grace-is-fresh", "OD:31", "step.ts", "usesOf(tx.w, key) !== 0 || !busy(tx.w, key)) return;", "usesOf(tx.w, key) !== 0) return;"),
  m("d6.disposed-ending-is-evidence", "OD:31", "turn.ts", "(own(tx.w.retired, item.actor) !== undefined || tx.machines[machine]?.persisted);", "own(tx.w.retired, item.actor) !== undefined;"),
  m("d7.undecodable-reads-pre-attach", "OD:31", "adapter.ts", 'if (w.undecodable[actor]) return { lifecycle: "quarantined", issue: "RecordUndecodable" };', ""),
  m("d1.stopped-read-lost", "OD:31", "step.ts", "if (kept && cutReads.length)", "if (false && kept && cutReads.length)"),
  // F (OD29), area 4.
  m("f.absent-is-placed", "OD:29", "inc.ts", "if (p.resetOn && absentReset(p, { memory: viewOf(cur), event: {} })) continue;", ""),
  m("f.filling-has-no-key", "OD:29", "inc.ts", "(present?.ok ? { ...hv, key: present.v } : hv)", "hv"),
  m("f.absent-does-not-end", "OD:29", "turn.ts", "if (p.each || now === undefined) continue;", "if (p.each) continue;"),
  m("id.value-is-not-the-input", "rule:74", "step.ts", "memory: run(m.memory.initial, input as never),", "memory: run(m.memory.initial, (identity ? {} : input) as never),"),
  // Fix pass after the final review (H-A): Runtime O6 lets an invoked commit settle within the disposal bound.
  m("o6.dispose-interrupts-wire", "Runtime O6", "lane.ts", "disposeWire() {},", 'disposeWire(tx, l) { const h = l!.head!; if (h.phase.t === "wire") tx.commands.push({ k: "interrupt", attempt: h.id, send: h.phase.gen }); },'),
  m("o6.settled-in-bound-stays-held", "Runtime O6", "lane.ts", "const { head: _h, ...rest } = parkWaiting(tx, parked); return setLane(tx, rest);", 'return setLane(tx, parkWaiting(tx, { ...parked, head: { ...next.head!, phase: { t: "held" as const } } }));'),
  m("o6.no-bound", "Runtime O6", "step.ts", "if (wires(tx.w).length === 0) finishDisposal(tx);", "if (true) finishDisposal(tx);"),
  // fragstore.row: what a boot queues for a record kept at ready is said, waited on, and kept by a dispose (D6).
  { id: "boot.mail-unsaid", kills: ["rule:44"], edits: [
    ["step.ts", 'for (const m of bootMail) if (m.k === "ending") note(tx, "parked", { op: m.op, attempt: m.attempt ?? "", record: true });', ""],
    ["step.ts", 'for (const m of bootMail ?? []) if (m.k === "ending") note(tx, "unparked", { op: m.op, attempt: m.attempt ?? "", record: true });', ""],
  ] as ReadonlyArray<readonly [string, string, string]> },
  m("m5.return-from-ready-writes", "rule:73", "step.ts", "if (!fromBoot) tx.touchedActors.add(key);", "tx.touchedActors.add(key);"),
  m("l1.version-by-type-side", "rule:74", "../conformance/compile/ref.ts", "return `${f}:${String(SchemaAST.toEncoded(ast))}#${hash(structure(SchemaAST.toEncoded(ast)))}`;", "return `${f}:${String(ast)}<-${String(SchemaAST.toEncoded(ast))}`;"),
  m("l1.version-by-printed-name", "rule:74", "../conformance/compile/ref.ts", "return `${f}:${String(SchemaAST.toEncoded(ast))}#${hash(structure(SchemaAST.toEncoded(ast)))}`;", "return `${f}:${String(SchemaAST.toEncoded(ast))}`;"),
  m("m3.persist-survives-dispose", "rule:74", "step.ts", 'if (how === "dispose" && tx.w.refPersist[key] !== undefined) tx.w = { ...tx.w, refPersist: without(tx.w.refPersist, key) };', ""),
  m("d3.return-keeps-old-id", "OD:31", "step.ts", "const inc = fromBoot ? old : nextGen(tx);", "const inc = old;"),
  m("d1.woken-drops-stopped", "OD:31", "step.ts", "for (const m of stoppedEndings(tx, key, stopped, rec.root.id, rec.root.id)) enqueue(tx, m);", ""),
  m("d1.reload-drops-stopped", "OD:31", "durable.ts", "...(stopped.value ? { stopped: stopped.value } : {})", ""),
  m("m4.held-w-owed", "rule:73", "durable.ts", "else mail(tx, l, a, e, false, !h.held);", "else mail(tx, l, a, e, false);"),
  m("boot.mail-lost-at-dispose", "OD:31", "step.ts", "setLane(tx, { ...l, parked: [...l.parked, { ...(m.attempt ? { attempt: m.attempt } : {}), ending: m.ending, owner: m.owner, input: m.input }] });", ""),
  ...PAY16,
  ...PINS_A,
  ...PINS_B,
  ...MISC,
];
