// Round 7's builder mutants. Builder-written, to find gaps: not an independent number. Each breaks one rule of convergence-7.
const m = (id: string, kills: string, file: string, find: string, replace = "") => ({
  id,
  kills: [kills],
  edits: [[file, find, replace]] as ReadonlyArray<readonly [string, string, string]>,
});
export const ROUND7 = [
  // D83.
  m("d83-reenter-all", "D83", "driver.ts", "if (issued.get(w.key) === n && !dirty.has(w.key)) dirty.set(w.key, w);", "if (!dirty.has(w.key)) dirty.set(w.key, w);"),
  m("d83-no-dirty-check", "D83", "driver.ts", "if (issued.get(w.key) === n && !dirty.has(w.key)) dirty.set(w.key, w);", "if (issued.get(w.key) === n) dirty.set(w.key, w);"),
  m("d83-awaited-keeps-dirty", "D83", "driver.ts", "for (const w of c.writes) dirty.delete(w.key); // D83: a retry waiting here is older than this", ""),
  m("d83-awaited-no-stamp", "D83", "driver.ts", "const n = stamp([...taken, ...c.writes]);", "const n = stamp(taken);"),
  m("d94-does-not-wait", "D94", "driver.ts", "if (behind(t.actor)) return void waitingAwaited.push({ actor: t.actor, go: () => issueAwaited(c, t) });", ""),
  m("d94-owed-not-carried", "D94", "driver.ts", "const owed = [...dirty.values()];", "const owed: Write[] = [];"),
  m("d94-waits-for-any-actor", "D94", "driver.ts", "[...plainOut].some((b) => b.keys.some((k) => k === `actor/${actor}` || k.startsWith(`lane/${actor}|`)));", "plainOut.size > 0;"),
  m("d83-plain-no-stamp", "D83", "driver.ts", "const n = stamp(batch);", "const n = 0;"),
  m("d83-saved-believes-refused", "D83", "durable.ts", 'tx.w = { ...tx.w, savedLanes: { ...tx.w.savedLanes, [l.id]: "" } };', ""),
  m("d83-saved-undefined-loses-delete", "D83", "durable.ts", 'savedLanes: { ...tx.w.savedLanes, [l.id]: "" }', "savedLanes: Object.fromEntries(Object.entries(tx.w.savedLanes).filter(([k]) => k !== l.id))"),
  m("l2-backoff-resets-on-issue", "D83", "driver.ts", "armCapture(Math.min(30_000, 1000 * 2 ** retryN++));", "armCapture(1000);"),
  m("l2-no-landed-reset", "D83", "driver.ts", "const landed = () => {\n    retryN = 0;", "const landed = () => {"),
  m("l2-report-every-time", "D83", "driver.ts", "if (!reportedFailure) {", "if (true) {"),
  // D84.
  m("d84-lane-coalesces", "D84", "driver.ts", 'w.key.startsWith("lane/") || (w.record', "(w.record"),
  m("d93-retired-coalesces", "D93", "driver.ts", '(w.record as { retired?: boolean } | undefined)?.retired === true', "false"),
  m("d84-everything-at-once", "D84", "driver.ts", "if (bounds.captureMs <= 0 || writes.some(now)) return flushCapture();", "return flushCapture();"),
  // D80.
  m("d80-no-hidden-flush", "D80", "driver.ts", "host.onHidden?.(() => flushCapture());", ""),
  m("d80-default-not-5s", "D80", "world.ts", "captureMs: 5_000,", "captureMs: 0,"),
  m("l3-dispose-no-flush", "D80", "driver.ts", "flushCapture(); // L3", ""),
  // D87.
  m("d87-no-bound", "D87", "driver.ts", "const offBound = host.setTimer(host.now() + bounds.bootMs, () =>\n      noRead(`no answer from storage in ${bounds.bootMs} ms`),\n    );", "const offBound = () => {};"),
  m("d87-late-answer-boots-again", "D87", "driver.ts", "void (loaded as PromiseLike<ReadonlyMap<string, string>>).then((records) => {\n      if (settled) return;", "void (loaded as PromiseLike<ReadonlyMap<string, string>>).then((records) => {"),
  m("d87-failed-read-keeps-persist", "D87", "driver.ts", "sys.machines = unpersist(sys.machines);", ""),
  m("d87-queue-unbounded", "D87", "driver.ts", "if (waitingBoot.length < bounds.bootQueue) return void waitingBoot.push(i);", "return void waitingBoot.push(i);"),
  m("d87-queue-silent", "D87", "driver.ts", 'guarded(() => cfg.onEvidence([{ kind: "dropped", input: i.k }]));\n  };\n  const loaded', "};\n  const loaded"),
  // D88.
  m("d88-no-hold-on-bad-body", "D88", "durable.ts", "if (!v) {\n        hold();\n        continue;\n      }", "if (!v) continue;"),
  m("d88-no-hold-on-invalid", "D88", "durable.ts", "); // goes to `orphaned` (P19) when that is built\n        hold();", "); // goes to `orphaned` (P19) when that is built"),
  m("d88-commit-passes", "D88", "lane.ts", 'if (row === "commit") return decline(tx, a, "Rejected");', ""),
  m("d88-idle-passes", "D88", "lane.ts", "if (quarantined) return false; // D88: not idle, and nothing to retry", ""),
  m("d88-row-silent", "D88", "publish.ts", ": w.quarantined[laneKey(actor, op, key)]\n      ? { pending: false, uncertain: true, waiting: false, retryCount: 0, outstanding: 0 } // D88\n      : rowOf", ": rowOf"),
  m("d88-cancel-keeps-record", "D88", "lane.ts", "tx.touchedLanes.add(id);\n    }\n    return;", "}\n    return;"),
  // D89.
  m("d89-skip-one-record", "D89", "driver.ts", "reportedEncoding = true;\n        return undefined;", "reportedEncoding = true;\n        continue;"),
  m("d89-batch-dropped-not-kept", "D89", "driver.ts", "if (!encoded) return;\n    dirty.clear();", "dirty.clear();\n    if (!encoded) return;"),
  m("d89-report-every-time", "D89", "driver.ts", "if (!reportedEncoding)", "if (true)"),
  m("m11-spread-unguarded", "D65", "gate.ts", "try {\n    return { ...v }; // M11: a class instance too: a throwing own getter is this closure's refusal, not the Runtime's\n  } catch (e) {\n    throw new Refused(origin, e);\n  }", "return { ...v };"),
  // D90.
  m("d90-delete-keeps-bucket", "D90", "actors.ts", "return put(t, h, Object.keys(rest).length ? rest : null);", "return t;"),
  m("d90-hash-collides-rows", "D90", "actors.ts", "row[(h >>> 6) & 63] = b;", "row[0] = b;"),
  m("d90-changed-misses-removed", "D90", "actors.ts", "for (const k in x) if (x[k] !== y?.[k]) out.add(k);", ""),
  m("d90-all-unsorted-drops-one", "D90", "actors.ts", "for (const r of t) if (r) for (const b of r) if (b) for (const k in b) out.push(b[k]!);", "for (const r of t) if (r) for (const b of r) if (b) for (const k in b) { out.push(b[k]!); break; }"),
  // L4.
  m("l4-duplicate-machine-allowed", "D77", "gate.ts", "if (dup !== undefined) throw new Error(`DuplicateMachine: ${dup}`);", ""),
];
