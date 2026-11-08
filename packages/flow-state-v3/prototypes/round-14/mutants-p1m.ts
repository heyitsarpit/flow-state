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
  m("p1m.undecodable-memory-kept", [`${P}a-memory-field-reshaped-with-no-migration-quarantines-the-record-and-an-ensure-starts-fresh`], "durable.ts", "  try {\n    return walk(root);\n  } catch {\n    return undefined;\n  }", "  try {\n    return walk(root);\n  } catch {\n    return root;\n  }"),
  // Rule 46: "a fresh incarnation adopts it even when the actor record no longer decodes". Wrong: an ensure over that record discards its lanes too.
  m("p1m.undecodable-drops-lanes", [`${P}a-state-a-release-removed-quarantines-the-record-and-an-ensure-starts-fresh-and-adopts-the-hold`], "step.ts", '    note(tx, "RecordUndecodable", { actor: key, discarded: true });', '    note(tx, "RecordUndecodable", { actor: key, discarded: true });\n    tx.w = { ...tx.w, lanes: Object.fromEntries(Object.entries(tx.w.lanes).filter(([, l]) => l.actor !== key)) };'),
  // OD53 (11): `lose` sets `dropAt` only on leaving `Live` or `Repairing`, or when none is set. Wrong: every time, as before.
  m("od53.lose-always-stamps", ["P1-S/a-connection-that-never-registered-keeps-the-earlier-dropat"], S, "    ...(x.liveSince !== undefined || x.dropAt === undefined ? { dropAt: cx.now } : {}),", "    dropAt: cx.now,"),
  // OD53 (11), T1's `down` row in `Connecting`: "`dropAt = now` if none". Wrong: only on leaving.
  m("od53.down-first-unset", ["P1-S/a-down-on-a-first-connection-sets-dropat"], S, "...(leaving || x.dropAt === undefined ? { dropAt: cx.now } : {}),", "...(leaving ? { dropAt: cx.now } : {}),"),
];
