// Rule 73's wrong runtimes (OD31): each breaks one clause of rule 73 or 2.7.17, and some LIFE case must go red on it by a named oracle.
// Same shape as mutate.ts's lists; run by ../conformance/lifetime-falsify.ts, which also lists any LIFE case no mutant turns red.
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
  m("life.waiting-lost-at-end", "C124", "step.ts", "const timers = [...armed, ...waiting,", "const timers = [...armed,"),
  // The grace.
  m("life.no-grace", "rule:73", "step.ts", "const dueAt = tx.env.now + tx.bounds.graceMs;", "const dueAt = tx.env.now;"),
  m("life.grace-never-ends", "rule:73", "step.ts", "if (usesOf(tx.w, key) !== 0 || !getActor(tx.w.actors, key) || busy(tx.w, key)) return;", "return;"),
  m("life.grace-unfenced", "rule:73", "step.ts", "const gen = `${dueAt}`;", 'const gen = "grace";'),
  // The end and the record.
  m("life.end-drops-record", "rule:73", "step.ts", 'const keep = m.persisted && how === "end";', "const keep = false;"),
  m("life.dispose-keeps-record", "OD31", "step.ts", 'const keep = m.persisted && how === "end";', "const keep = m.persisted;"),
  m("life.end-ignores-codec", "rule:73", "step.ts", "if (tx.machines[a.machine]!.persisted && tx.w.unencodable[key]) {", "if (false) {"),
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
  m("id.no-conflict", "rule:74", "step.ts", "if (was !== undefined && was !== form && tx.machines[machine]?.identityFields)", "if (false)"),
  m("id.dispose-drops-lanes", "rule:46", "step.ts", 'if (m.local && how !== "remount")', 'if (how !== "remount")'),
  // Flow.ignore (OD28, 2.7.18), area 3.
  m("ign.runs-a-turn", "OD:28", "turn.ts", "if (mm && mappedFor(mm, item)?.ignore) {", "if (false) {"),
  m("ign.unknown-held", "rule:40", "turn.ts", 'if (item.ending.ch === "unknown" && cur?.head?.phase.t === "held" && cur.head.id === item.attempt) cell(tx, "cancel", cur, argsOf(cur));', ""),
  m("ign.parked-without-incarnation", "OD:28", "turn.ts", "if (mm && mappedFor(mm, item)?.ignore) {", "if (mm && getActor(tx.w.actors, item.actor) && mappedFor(mm, item)?.ignore) {"),
  m("id.value-is-not-the-input", "rule:74", "step.ts", "memory: run(m.memory.initial, input as never),", "memory: run(m.memory.initial, (identity ? {} : input) as never),"),
];
