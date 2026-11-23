// Rule 73's wrong runtimes: each breaks one clause of rule 73 or 2.7.17, and LIFE-01..10 must go red on it by a named oracle.
// Same shape as mutate.ts's lists; run by ../conformance/lifetime-falsify.ts.
const m = (id: string, kills: string, file: string, find: string, replace = "") => ({ id, kills: [kills], edits: [[file, find, replace]] as ReadonlyArray<readonly [string, string, string]> });
const LANES = "if (l.actor === key && ((l.head !== undefined && l.head.phase.t !== \"held\") || l.w.length > 0)) return true;";
const MAIL = "return w.mail.has(key) || w.follow.some((m) => m.actor === key);";
export const MUTANTS = [
  // Uses and busy (rule 73's list).
  m("life.inflight-not-a-use", "rule:73", "step.ts", LANES, ""),
  m("life.mail-not-a-use", "rule:73", "step.ts", MAIL, "return false;"),
  m("life.held-is-a-use", "rule:73", "step.ts", LANES, "if (l.actor === key && (l.head !== undefined || l.w.length > 0)) return true;"),
  m("life.parked-is-a-use", "rule:73", "step.ts", LANES, "if (l.actor === key && ((l.head !== undefined && l.head.phase.t !== \"held\") || l.w.length > 0 || l.parked.length > 0)) return true;"),
  m("life.schedule-is-a-use", "rule:73", "step.ts", MAIL, "for (const id in w.timers) { const t = w.timers[id]!; if (t.kind === \"schedule\" && t.actor === key) return true; } " + MAIL),
  m("life.uses-not-counted", "rule:73", "step.ts", "setUses(tx, i.actor, (tx.w.uses[i.actor] ?? 0) + 1);", "setUses(tx, i.actor, 1);"),
  m("life.ensure-is-a-use", "OD27 Q2", "step.ts", "setUses(tx, key, 0); // rule 73", "setUses(tx, key, 1); // rule 73"),
  // The grace.
  m("life.no-grace", "rule:73", "step.ts", "const dueAt = tx.env.now + tx.bounds.graceMs;", "const dueAt = tx.env.now;"),
  m("life.grace-never-ends", "rule:73", "step.ts", "if (tx.w.uses[key] !== 0 || !getActor(tx.w.actors, key) || busy(tx.w, key)) return;", "return;"),
  // What disposal keeps.
  m("life.disposal-drops-record", "rule:73", "step.ts", '  note(tx, "unused", { actor: key });\n  onDisposeActor(tx, key);', '  note(tx, "unused", { actor: key });\n  onDisposeActor(tx, key);\n  tx.w = { ...tx.w, retired: without(tx.w.retired, key) };'),
  m("life.restore-from-initial", "C108", "step.ts", "const m: Compiled = tx.machines[machine]!;\n  const retired = own(tx.w.retired, key);", "const m: Compiled = tx.machines[machine]!;\n  const retired = undefined as ActorRec | undefined;"),
  // Sends (C105).
  m("life.send-no-restore", "C105", "step.ts", "const kept = own(tx.w.retired, key);", "const kept = undefined as ActorRec | undefined;"),
  m("life.send-absent-silent", "C105", "step.ts", 'issue(tx, { code: "SendTargetAbsent", origin: `send ${key}`, input: { reason: "NotPersisted" } });', ""),
];
