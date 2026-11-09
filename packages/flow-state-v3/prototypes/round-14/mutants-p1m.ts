// Phase 1 record migration's wrong runtimes (and OD53's `dropAt` fix, folded in): each undoes one decision, and the named case must go red by assertion.
type M = { readonly id: string; readonly kills: readonly string[]; readonly edits: ReadonlyArray<readonly [string, string, string]> };
const m = (id: string, kills: readonly string[], file: string, find: string, replace: string): M => ({ id, kills, edits: [[file, find, replace]] });
const S = "sessions.ts";
const P = "P1-M/";
const PATH = `${P}release-1-records-restore-under-release-2-across-a-reload`;
const MEM = "../conformance/compile/memory.ts";
export const MUTANTS: readonly M[] = [
  // 2.7.15 (Q2 A): an old-version hold is reported at each boot as an issue. Wrong: evidence only, as before.
  m("p1m.old-version-lane-evidence", [PATH], "durable.ts", 'issue(tx, { code: "OldVersionLane", origin: `${v.machine} ${v.op}`, input: { lane: v.id, keyFields: v.keyFields } });', 'note(tx, "OldVersionLane", { op: v.op, lane: v.id, keyFields: v.keyFields });'),
  // 2.7.15: "never ... matched against a new key". Wrong: a current keyed member names a lane by its text, whatever its version (as before).
  m("p1m.current-names-old", [`${P}a-current-keyed-member-never-names-an-old-version-hold-even-by-the-same-text`, "P1-H/a-keyed-retryable-sees-its-own-lane-only"], "lane.ts", "  if (!lane || lane.keyFields === undefined) return previous === undefined ? lane : undefined;", "  if (!lane || lane.keyFields === undefined || previous === undefined) return previous === undefined ? lane : undefined;"),
  // 2.7.15: `previous[i]` names "the old lanes". Wrong: any lane of that text.
  m("p1m.previous-any-version", [`${P}a-previous-member-names-only-a-lane-of-its-own-version`], "lane.ts", "  return sameFields(lane.keyFields, fields, p?.keyVersion ? p.keyVersionByFormat : undefined) ? lane : undefined;", "  return previous !== undefined || sameFields(lane.keyFields, fields, p?.keyVersion ? p.keyVersionByFormat : undefined) ? lane : undefined;"),
  // 2.7.15: "every commit of that operation for that actor declines". Wrong: an old-version hold blocks the op for every actor.
  m("p1m.old-version-any-actor", ["R13-KEYS/another-actor-is-not-held"], "lane.ts", "find((l) => l.actor === actor && l.op === op && l.keyFields !== undefined", "find((l) => l.op === op && l.keyFields !== undefined"),
  // 2.7.15: `previous[i].retry(k)` and `.cancel(k)` exist. Wrong: they name nothing.
  m("p1m.previous-names-nothing", [PATH, `${P}previous-retry-re-sends-the-old-hold-as-the-same-attempt`, "R13-KEYS/a-release-that-adds-a-key-field-declines-every-commit-until-the-old-hold-ends"], "turn.ts", "      ? ofVersion(tx.w.lanes[laneKey(w.a.key, mem.op, r.key)], op, mem.previous)", "      ? (mem.previous === undefined ? ofVersion(tx.w.lanes[laneKey(w.a.key, mem.op, r.key)], op) : undefined)"),
  // The runner's call: an earlier key equal to the current one is refused (`PreviousIsCurrent`). Wrong: allowed.
  m("p1m.previous-is-current-allowed", [`${P}a-previous-key-equal-to-the-current-key-is-refused`], "../conformance/compile/operations.ts", "    if (sameEntries(version, keyVersion)) throw", "    if (false) throw"),
  // 2.2.2: "a stored field decodes by its codec". Wrong: the stored value is taken as it is, so release 1's string stays a string.
  m("p1m.restore-raw-memory", [PATH], MEM, "      if (k in s) out[k] = (Schema.decodeUnknownSync(codecs.get(k)!)({ [k]: s[k] }) as Record<string, unknown>)[k];", "      if (k in s) out[k] = s[k];"),
  // 2.2.2: a field the record lacks "runs its computed initial over the restored fields". Wrong: it is left out.
  m("p1m.restore-skips-computed", [PATH], MEM, "    for (const [k, f] of later) out[k] = f.computed!(start);\n    return out;\n  });\n};\nconst encodeOf", "    return out;\n  });\n};\nconst encodeOf"),
  // 2.7.17: "a record that does not decode" is quarantined. Wrong: memory this release cannot decode is kept as it was stored.
  m("p1m.undecodable-memory-kept", [`${P}a-memory-field-reshaped-with-no-migration-quarantines-the-record-and-an-ensure-starts-fresh`], "durable.ts", "    return walk(root);\n  } catch {\n    return undefined;\n  }", "    return walk(root);\n  } catch {\n    return root;\n  }"),
  // Rule 46: "a fresh incarnation adopts it even when the actor record no longer decodes". Wrong: an ensure over that record discards its lanes too.
  m("p1m.undecodable-drops-lanes", [`${P}a-state-a-release-removed-quarantines-the-record-and-an-ensure-starts-fresh-and-adopts-the-hold`], "step.ts", '    note(tx, "RecordUndecodable", { actor: key, discarded: true });', '    note(tx, "RecordUndecodable", { actor: key, discarded: true });\n    tx.w = { ...tx.w, lanes: Object.fromEntries(Object.entries(tx.w.lanes).filter(([, l]) => l.actor !== key)) };'),
  // OD53 (11): `lose` sets `dropAt` only on leaving `Live` or `Repairing`, or when none is set. Wrong: every time, as before.
  m("od53.lose-always-stamps", ["P1-S/a-connection-that-never-registered-keeps-the-earlier-dropat"], S, '    st: "Waiting",\n    ...(x.dropAt === undefined ? { dropAt: cx.now } : {}),', '    st: "Waiting",\n    dropAt: cx.now,'),
  // OD53 (11), T1's `down` row in `Connecting`: "`dropAt = now` if none". Wrong: only on leaving.
  m("od53.down-first-unset", ["P1-S/a-down-on-a-first-connection-sets-dropat"], S, "        ...(x.dropAt === undefined ? { dropAt: cx.now } : {}),\n        ...(leaving", "        ...(leaving ? { dropAt: cx.now } : {}),\n        ...(leaving"),
  // The runner's ruling (round 2): `dropAt` is persisted with the bookmark. Wrong: it is lost at a reload.
  m("od53.dropat-not-persisted", ["P1-S/a-reload-keeps-dropat-with-the-bookmark"], S, "    ...(x.dropAt !== undefined ? { dropAt: x.dropAt } : {}),\n  });", "  });"),
  // The `dropAt` note: a registration ends the not-live period. Wrong: an old start survives it (on the bookmark, across a reload).
  m("od53.registration-keeps-dropat", ["P1-S/a-registration-ends-the-not-live-period-so-a-later-drop-starts-a-new-one"], S, "  let x: Session = {\n    ...current(x0),\n    regInConn: true,", "  let x: Session = {\n    ...x0,\n    regInConn: true,"),
  // Flow's record format (round 2, proposed): every record says its format. Wrong: untagged, as format 1.
  { id: "p1m.no-record-format", kills: [`${P}every-record-flow-writes-says-its-record-format`], edits: [["durable.ts", "    format: RECORD_FORMAT,\n    actor: l.actor,", "    id: l.id,\n    actor: l.actor,"], ["durable.ts", "  return { format: RECORD_FORMAT, ...a,", "  return { ...a,"]] },
  // Flow reads every older record format by a pure upgrade. Wrong: an older format is quarantined.
  m("p1m.older-format-quarantined", [`${P}a-record-flow-wrote-in-format-1-restores-as-it-was`], "durable.ts", "(from as number) < 1 ||", "(from as number) < RECORD_FORMAT ||"),
  // A newer record format is never misread. Wrong: read as the current one.
  m("p1m.newer-format-read", [`${P}a-record-of-a-newer-flow-record-format-is-quarantined-and-its-lane-still-holds`], "durable.ts", " || (from as number) > RECORD_FORMAT)", ")"),
  // The runner's ruling (round 2): a field a release stops declaring is dropped with an issue (`FieldDropped`). Wrong: silently.
  m("p1m.field-dropped-silent", [PATH], "durable.ts", '      for (const field of dropped) issue(tx, { code: "FieldDropped", origin: `${mm.id} memory`, input: { field } });\n', ""),
  // The runner's ruling (round 2): a hold whose record this boot could not read is said (`HoldWithoutRecord`). Wrong: silently.
  m("p1m.hold-without-record-silent", [`${P}a-state-a-release-removed-quarantines-the-record-and-an-ensure-starts-fresh-and-adopts-the-hold`, `${P}a-memory-field-reshaped-with-no-migration-quarantines-the-record-and-an-ensure-starts-fresh`], "durable.ts", '  for (const [, l] of lanes) if (l.head && Object.hasOwn(undecodable, l.actor)) issue(tx, { code: "HoldWithoutRecord", origin: `${l.machine} ${l.op}`, input: { lane: l.id } });\n', ""),
  // The runner's ruling (round 2): `previous[i].retryable` sees `previous[i]`'s lanes. Wrong: it reads the current version's.
  m("p1m.previous-retryable-current", [`${P}previous-retryable-sees-the-old-hold-and-retry-re-sends-it`], "turn.ts", "w.m.ops[t.op], t.previous)", "w.m.ops[t.op])"),
  // The runner's ruling (round 2): on a fragment op, authority before version (rule 51 before 2.7.15). Wrong: the old-version decline first.
  m("p1m.old-version-before-rule-51", [`${P}on-a-fragment-op-another-subjects-commit-is-rejected-before-the-old-version-check`], "turn.ts", "      const lane = tx.w.lanes[laneKey(w.a.key, mem.op, r.key)];\n      if (lane && !sameSubject(lane.subject, subject)) {", '      if (oldVersionLane(tx, w.a.key, w.a.machine, mem.op)) {\n        decline(tx, { ...base, key: r.key, input: r.input, subject }, "OldVersion");\n        continue;\n      }\n      const lane = tx.w.lanes[laneKey(w.a.key, mem.op, r.key)];\n      if (lane && !sameSubject(lane.subject, subject)) {'),
];
