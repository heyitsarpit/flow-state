// Audit M1 (phase 1 record migration, rounds 1-2, 4ca9c708 and 0c0b2017): wrong runtimes written by an independent auditor from the design text
// (rule 46, rule 74, 2.7.15, 2.7.17) and the runner's rulings (progress.md, 2026-11-09), before reading mutants-p1m.ts. Each comment names the rule
// broken. `lie:` ids fake the evidence an excuse reads. Same shape as mutants-audit-s1.ts; not spread into any gate list.
const m = (id: string, kills: readonly string[], edits: ReadonlyArray<readonly [string, string, string]>, unscored?: string) => ({ id, kills, edits, ...(unscored ? { unscored } : {}) });
const D = "durable.ts";
const L = "lane.ts";
const T = "turn.ts";
const ST = "step.ts";
const R = "../conformance/compile/ref.ts";
const MIG = ["P1-M", "P1-H", "R13-KEYS", "R12-KEYS", "R15-01", "R14-ID-02", "R14-ID-03"];
const FROM = 'const from = Object.hasOwn(v, "format") ? format : 1;';
export const MUTANTS = [
  // ── Record format (the runner's ruling, round 2): "newer/invalid formats quarantined". Wrong: a `null` format reads as untagged format 1.
  m("m1.null-format-as-1", MIG, [[D, FROM, 'const from = Object.hasOwn(v, "format") && format !== null ? format : 1;']]),
  // Same ruling: a non-integer format is quarantined. Wrong: 2.5 reads as 2.
  m("m1.fraction-format-floors", MIG, [[D, FROM, 'const from = Object.hasOwn(v, "format") ? (typeof format === "number" ? Math.floor(format) : format) : 1;']]),
  // Same ruling. Wrong: a string "2" is read as format 2.
  m("m1.string-format-coerced", MIG, [[D, FROM, 'const from = Object.hasOwn(v, "format") ? (typeof format === "string" ? Number(format) : format) : 1;']]),
  // Same ruling (control): a newer format is read as the current one.
  m("m1.newer-format-read", MIG, [[D, "(from as number) > RECORD_FORMAT) {", "(from as number) > RECORD_FORMAT + 99) {"]]),
  // "Format 1 is upgraded by a pure step": the record restores as it was (rule 46: "each Attempt carries its retryCount"). Wrong: the format 1 lane
  // upgrade loses the queued commits, the parked endings and the head's retryCount.
  m("m1.format1-lossy-lane", MIG, [[D, "const { id: _id, ...rest } = v;\n    return rest;", 'const { id: _id, w: _w, parked: _p, ...rest } = v;\n    const h = rest["head"] as Raw | undefined;\n    return { ...rest, w: [], parked: [], ...(h ? { head: { ...h, retryCount: 0 } } : {}) };']]),
  // The same, for an actor record: the upgrade loses its timers (rule 73's saved schedules) and its stopped reads.
  m("m1.format1-lossy-actor", MIG, [[D, 'if (!k.startsWith("lane/")) return v;', 'if (!k.startsWith("lane/")) return { ...v, timers: [], stopped: undefined };']]),
  // ── Quarantine (rule 46, U4): "a `cancel` on that key clears it". Wrong: a cancel leaves the quarantine standing.
  m("m1.quarantine-cancel-keeps", MIG, [[L, 'if (row === "cancel") {', 'if (row === "cancel" && false) {']]),
  // Same: the cancel clears it in memory, and the record stays on disk, so the next boot quarantines it again.
  m("m1.quarantine-cancel-leaves-record", MIG, [[L, "      tx.w = { ...tx.w, quarantined };\n      tx.touchedLanes.set(id, a.actor);", "      tx.w = { ...tx.w, quarantined };"]]),
  // Rule 46: "the record stays on disk". Wrong: a quarantined lane record is erased by the boot that quarantined it; the next boot frees its key.
  m("m1.quarantined-lane-erased-at-boot", MIG, [[D, "saved[k.slice(5)] = text;", 'saved[k.slice(5)] = text;\n        tx.touchedLanes.set(k.slice(5), k.slice(5).split("|")[0]!);']]),
  // Rule 46 (control): "a commit of that operation whose key's canonical text is that id declines". Wrong: it sends.
  m("m1.quarantine-commit-sends", MIG, [[L, "if (tx.w.quarantined[id] && !lane) {", 'if (tx.w.quarantined[id] && !lane && row !== "commit") {']]),
  // ── 2.7.15 (control): "every commit of that operation for that actor declines". Wrong: only a commit of the old lane's own key text.
  m("m1.old-version-same-key-only", MIG, [[L, "    if (old) {", "    if (old && old.id === id) {"]]),
  // The runner's ruling: `previous[i].retryable(k, { times })` exists, as on the current handle. Wrong: its `times` is ignored.
  m("m1.previous-retryable-ignores-times", MIG, [[T, "lane, t.op, t.times,", "lane, t.op, t.previous === undefined ? t.times : undefined,"]]),
  // ── FieldDropped (the runner's ruling; STATUS round 2, the reviewer's: not for a record then quarantined). Wrong: said before the last read check.
  m("m1.field-dropped-before-stopped", MIG, [
    [D, "      const stopped = v.stopped === undefined", '      for (const field of dropped) issue(tx, { code: "FieldDropped", origin: `${mm.id} memory`, input: { field } });\n      const stopped = v.stopped === undefined'],
    [D, '      for (const field of dropped) issue(tx, { code: "FieldDropped", origin: `${mm.id} memory`, input: { field } });\n      const root = orphanFrozen', "      const root = orphanFrozen"],
  ]),
  // Same ruling: "a field a release stops declaring is dropped with FieldDropped". Wrong: a fragment's dropped field is dropped silently.
  m("m1.field-dropped-fragment-silent", MIG, [[D, "if (!Object.hasOwn(memory, f)) dropped.push(i.frag ? `${i.frag}.${f}` : f);", "if (!i.frag && !Object.hasOwn(memory, f)) dropped.push(f);"]]),
  // ── HoldWithoutRecord (the runner's ruling): a held lane on a gone record is reported; a restored unknown holds its lane again (2.7.15, OD5).
  // Wrong: only a head saved as held, so an acknowledged head in flight at the reload, which restores as a hold, is not said.
  m("m1.hwr-only-saved-held", MIG, [[D, "if (l.head && Object.hasOwn(undecodable, l.actor))", "if (l.head?.held && Object.hasOwn(undecodable, l.actor))"]]),
  // Rule 74: an old-version record's lanes are unbound (UnboundLane), not HoldWithoutRecord (control).
  m("m1.hwr-old-version-too", MIG, [[D, "if (l.head && Object.hasOwn(undecodable, l.actor))", "if (l.head && (Object.hasOwn(undecodable, l.actor) || Object.hasOwn(oldVersion, l.actor)))"]]),
  // ── 2.7.17: "an ensure over a record that no longer decodes starts fresh ... and creates from input"; a persisted identity's record is saved.
  // Wrong: the fresh actor is never saved over the quarantined bytes, so the next boot quarantines again and its new memory is lost.
  m("m1.fresh-never-saved", MIG, [
    [ST, "undecodable: without(tx.w.undecodable, key) };", "undecodable: without(tx.w.undecodable, key), oldVersion: { ...tx.w.oldVersion, [`~${key}`]: true } };"],
    [D, "if (a && tx.machines[a.machine]!.persisted) {", "if (a && tx.machines[a.machine]!.persisted && !tx.w.oldVersion[`~${key}`]) {"],
  ]),
  // ── 2.7.15: "reordering key fields changes nothing". Wrong: a version compares in order.
  m("m1.key-order-matters", MIG, [[L, "const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((f) => b.includes(f)) && b.every((f) => a.includes(f));", "const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((f, i) => b[i] === f);"]]),
  // Rule 74 (Q2 A, OD50): "`minLength(1)` and `minLength(2)` differ". Wrong: a check compares by its id only.
  m("m1.check-payload-ignored", MIG, [[R, "structure({ id: rep.id, payload: rep.payload }, reps, seen)", "structure({ id: rep.id }, reps, seen)"]]),
  // Rule 74 (U17 B): the type side and the encoded side. Wrong: the type side only.
  m("m1.version-type-side-only", MIG, [[R, "return hash(`${structure(SchemaAST.toType(ast), reps)}|${structure(SchemaAST.toEncoded(ast), reps)}`);", "return hash(structure(SchemaAST.toType(ast), reps));"]]),
  // ── Lie (the (j) excuse reads the runtime's own RecordQuarantined after a release). Wrong: a release that changes an op's key quarantines the
  // actor record beside the old-version hold, instead of restoring it (2.7.15: the record restores; only the lane is an old-version hold).
  m("lie:m1.quarantine-beside-old-hold", MIG, [
    [
      D,
      "lanes.splice(0, lanes.length, ...placeLanes(tx, lanes));",
      "lanes.splice(0, lanes.length, ...placeLanes(tx, lanes));\n  for (const [, l] of lanes) {\n    const f = stampFields(tx.machines[l.machine]!.ops[l.op]);\n    const at = actors.findIndex(([a]) => a === l.actor);\n    if (at >= 0 && l.keyFields !== undefined && f && !sameFields(l.keyFields, f, olderOf(tx.machines[l.machine]!.ops[l.op]))) {\n      actors.splice(at, 1);\n      undecodable[l.actor] = true;\n      quarantine(tx, `actor/${l.actor}`, \"beside an old-version hold\");\n    }\n  }",
    ],
  ]),
];
