export const MUTANTS: ReadonlyArray<{ readonly id: string; readonly kills: readonly string[]; readonly edits: ReadonlyArray<readonly [string, string, string]> }> = [
  { id: "pinsb.nan-carried-as-null", kills: ["REV8-PINS"], edits: [["gate.ts", "throw new Error(`${x} has no carried form`);", 'return "null";']] },
  { id: "pinsb.map-is-empty-object", kills: ["REV8-PINS"], edits: [["../conformance/compile/memory.ts", "codecs.has(k) ? (Schema.encodeUnknownSync(codecs.get(k)!)({ [k]: v[k] })", "codecs.has(k) ? (Schema.encodeUnknownSync(codecs.get(k)!)({ [k]: v[k] instanceof Map ? {} : v[k] })"]] },
  { id: "pinsb.schedule-unbounded", kills: ["REV8-PINS"], edits: [["gate.ts", "v < 0 || v > 2_147_483_647)", "v < 0)"]] },
  { id: "pinsb.retry-uncapped", kills: ["REV8-PINS"], edits: [["edge.ts", "Math.min(o.retryMaxMs, 1000 * 2 ** (s.failures - 1))", "1000 * 2 ** (s.failures - 1)"]] },
  { id: "pinsb.write-jumps-backoff", kills: ["REV8-PINS"], edits: [["edge.ts", "const inBackoff = s.failures > 0 && s.due !== Infinity;", "const inBackoff = false;"]] },
  { id: "pinsb.restore-ignores-w-floor", kills: ["REV8-PINS"], edits: [["durable.ts", "    for (const x of l.w) maxMint = Math.max(maxMint, x.mint);", ""]] },
  { id: "pinsb.queue-unbounded", kills: ["REV8-PINS"], edits: [["lane.ts", 'if (policy === "serialize" && l.w.length >= tx.bounds.queueMax) {', 'if (policy === "serialize" && l.w.length >= Infinity) {']] },
  { id: "pinsb.undecodable-memory-fatal", kills: ["REV8-PINS"], edits: [["durable.ts", "    return walk(root);\n  } catch {\n    return undefined;", "    return walk(root);\n  } catch (e) {\n    throw e;"]] },
  { id: "pinsb.unknown-closure-allowed", kills: ["REV8-PINS"], edits: [["gate.ts", "  known(o, OP_CLOSURES, `${definition} ops.${o.id}`); // L4", "  void definition;"], ["gate.ts", 'if (typeof v === "function") throw new Error(`SealUnknownClosure: ${c.id} ${p}`);', 'if (typeof v === "function") return;']] },
];
