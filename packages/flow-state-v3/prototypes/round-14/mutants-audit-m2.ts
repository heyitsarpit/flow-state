// Audit M2 (phase 1 record migration, round 3 and Q1 A, e8cd6d55 and 31a0eec6): wrong runtimes written by an independent auditor from the design text
// (rule 74, 2.7.13, 2.7.15, D78) and the user's decision (MIGRATION-QUESTIONS.md, Q1 A), before reading mutants-p1m.ts or mutants-am1.ts's q1a set.
// Each comment names the rule broken. Same shape as mutants-audit-m1.ts; not spread into any gate list.
const m = (id: string, kills: readonly string[], edits: ReadonlyArray<readonly [string, string, string]>, unscored?: string) => ({ id, kills, edits, ...(unscored ? { unscored } : {}) });
const D = "durable.ts";
const T = "turn.ts";
const MIG = ["P1-M", "P1-H", "R13-KEYS", "R12-KEYS", "R15-01", "R14-ID-02", "R14-ID-03"];
const RESET = "      if (mm && sameIdentity && shapeReset(mm, v)) {";
export const MUTANTS = [
  // ── Q1 A: "persisted memory or state shape changes incompatibly ... saved memory and state are discarded". Wrong: only a field's Schema counts;
  // a saved state the release removed is never a reset (the record falls to the restore path).
  m("m2.q1-state-gone-ignored", MIG, [[D, '  return gone(v["root"], null);', "  return false;"]]),
  // The same, for a fragment (2.2.2 "for fragments and machines alike"): a copy's saved state the release removed is not seen; only the root leaf is.
  m("m2.q1-fragment-state-gone-ignored", MIG, [[D, "    return Object.values(inc.kids ?? {}).some((k) => gone(k, typeof k?.frag === \"string\" ? k.frag : null));", "    return false;"]]),
  // The same: a fragment's memory field kept under another Schema version is incompatible like a root field. Wrong: only root fields are compared.
  m("m2.q1-fragment-field-version-ignored", MIG, [[D, "  if (was.fields.some((f) => kept.has(fieldName(f)) && kept.get(fieldName(f)) !== f)) return true;", '  if (was.fields.some((f) => !fieldName(f).includes(".") && kept.has(fieldName(f)) && kept.get(fieldName(f)) !== f)) return true;']]),
  // Q1 A: "that definition's saved memory and state are discarded". A retired record (D99, an identity ended with its memory kept for its return,
  // rule 73) is saved memory too. Wrong: only live records reset; a retired one restores its old-shape memory on return.
  m("m2.q1-retired-record-not-reset", MIG, [[D, RESET, "      if (mm && sameIdentity && !v.retired && shapeReset(mm, v)) {"]]),
  // Q1 A: "with an issue ... naming the definition", once per definition. Wrong: one per record.
  m("m2.q1-issue-per-record", MIG, [[D, "  for (const [definition, actors] of resetBy) issue(", "  for (const [definition, actors] of resetBy) for (let n = 0; n < actors; n++) issue("]]),
  // Q1 A "discarded at boot", and 2.7.13: a record removal "is flushed at once ... so a crash cannot bring the record back". Wrong: the reset is in
  // memory only; the old-shape record stays on disk and every boot resets it again.
  m("m2.q1-reset-not-written", MIG, [[D, "        tx.dropped.add(k.slice(6));\n        tx.touchedActors.add(k.slice(6));\n        continue;", "        continue;"]]),
  // Q1 A: "Writes in flight always kept: lanes, holds and endings survive the reset". Wrong: a reset record's lanes lose their parked endings.
  m("m2.q1-reset-drops-parked-endings", MIG, [[D, "  lanes.splice(0, lanes.length, ...placeLanes(tx, lanes));", "  lanes.splice(0, lanes.length, ...placeLanes(tx, lanes));\n  for (let i = 0; i < lanes.length; i++) if (reset.has(lanes[i]![1].actor)) lanes[i] = [lanes[i]![0], { ...lanes[i]![1], parked: [] }];"]]),
  // Q1 A: memory and state discarded; rule 73: "a waiting deadline is in the record". Wrong: a reset record's saved deadlines are still armed and fire.
  m("m2.q1-reset-keeps-timers", MIG, [[D, "        tx.dropped.add(k.slice(6));\n        tx.touchedActors.add(k.slice(6));\n        continue;", "        tx.dropped.add(k.slice(6));\n        tx.touchedActors.add(k.slice(6));\n        timers.push(...(Array.isArray(v.timers) ? v.timers : []));\n        continue;"]]),
  // Q1 A's stated limit: "a record written before format 4 has no shape and restores (or is quarantined) as before". Wrong: no stamp reads as changed.
  m("m2.q1-unstamped-record-resets", MIG, [[D, "  if (!now || !isShape(was) || (sameList(was.states, now.states) && sameList(was.fields, now.fields))) return false;", "  if (!now) return false;\n  if (!isShape(was)) return true;\n  if (sameList(was.states, now.states) && sameList(was.fields, now.fields)) return false;"]]),
  // Q1 A: "an identity field change stays rule 74's old-version record, checked first" (control). Wrong: the shape check runs first and resets it.
  m("m2.q1-shape-before-identity", MIG, [[D, RESET, "      if (mm && shapeReset(mm, v)) {"]]),
  // ── Rule 74: an old identity's lanes are never heard by the new identity. Wrong: a live ending is checked for an actor only, not its identity.
  m("m2.r74-live-ending-ignores-identity", MIG, [[T, "  if (!a || !ofIdentity(tx, lane)) {", "  if (!a) {"]]),
  // Rule 74 / 2.7.13: an old identity's lane is "listed (rule 44)" at each boot (control). Wrong: listed only while no record of its name text exists.
  m("m2.r74-unbound-by-record-only", MIG, [[D, "if ((!recorded.has(l.actor) && !Object.hasOwn(undecodable, l.actor)) || !ofIdentity(tx, l as Lane)) note(", "if (!recorded.has(l.actor) && !Object.hasOwn(undecodable, l.actor)) note("]]),
  // ── 2.7.15 "renaming an operation changes nothing persisted", D78 "the old record goes in the batch that writes the new" (control). Wrong: the
  // moved lane is written under its new name and the old record stays.
  m("m2.rename-old-record-kept", MIG, [[D, "  tx.w = { ...tx.w, rekeyed: { ...tx.w.rekeyed, [id]: v.id } };\n  return { ...v, op, id };", "  return { ...v, op, id };"]]),
  // 2.7.15: a lane is the write op's over its contract (the runner's "the one write op"). Wrong: any op over the contract, whatever its kind.
  m("m2.rename-any-op-kind", MIG, [[D, '  const same = Object.entries(m.ops).filter(([, o]) => o.kind === "write" && o.contract === v.contract);', "  const same = Object.entries(m.ops).filter(([, o]) => o.contract === v.contract);"]]),
];
