// Part two's mutants: D122-D124, D126. Builder-written, to find gaps: not an independent number. `mutants-lost.ts` is D125's. Part one's `mutants-r9.ts` and older lists name code D122 removed: not rerun.
const m = (id: string, kills: string, file: string, find: string, replace = "") => ({ id, kills: [kills], edits: [[file, find, replace]] as ReadonlyArray<readonly [string, string, string]> });
export const MUTANTS = [
  // D122: the slice.
  m("d122.slice-per-pump", "D122", "driver.ts", "running = true;\n    let mark = clock();", "running = true;\n    spent = 0;\n    let mark = clock();"), // H1 itself
  m("d122.no-yield-in-loop", "D122", "driver.ts", "if (spent > bounds.drainMs && work()) {", "if (false) {"),
  m("d122.spent-never-refills", "D122", "driver.ts", "yielding = false;\n      spent = 0;", "yielding = false;"),
  m("d122.no-notify-at-yield", "D122", "driver.ts", "yieldToPage();\n          break;", "yieldToPage();\n          return void (running = false);"),
  m("d122.cut-waits-for-the-drain", "D122", "driver.ts", "if (!fatal && world.follow.length > 0) return void host.later(runAfterDrain);", "if (work()) return void host.later(runAfterDrain);"),
  m("d122.cut-splits-a-turn", "D84", "driver.ts", "if (!fatal && world.follow.length > 0) return void host.later(runAfterDrain);"),
  // D122: fairness.
  m("d122.mail-fifo", "D122", "world.ts", "const at = actor === undefined ? 0 : tx.w.mail.findIndex((m) => m.actor === actor);", "const at = 0;"),
  m("d122.rota-not-rotated", "D122", "world.ts", "[...rota.slice(1), item.actor]", "rota"),
  m("d122.rota-forgets", "D122", "world.ts", "const rota = tx.w.rota.includes(m.actor) ? tx.w.rota : [...tx.w.rota, m.actor];", "const rota = tx.w.rota;"),
  // D122: the name.
  m("d122.named-each", "D122", "turn.ts", "if (n === tx.bounds.sameFailures)", "if (n >= tx.bounds.sameFailures)"),
  m("d122.not-named", "D122", "turn.ts", "if (n === tx.bounds.sameFailures)", "if (false)"),
  m("d122.any-input-counts", "D122", "turn.ts", "const n = was?.input === input ? was.n + 1 : 1;", "const n = (was?.n ?? 0) + 1;"),
  m("d122.success-counts", "D122", "turn.ts", 'if (item.ending.ch === "success") {\n    if (tx.w.failing[key])', 'if (false) {\n    if (tx.w.failing[key])'),
  m("d122.redelivery-counts", "D122", "turn.ts", "if (!item.redelivered) countFailure(tx, item);", "countFailure(tx, item);"),
  m("d122.lint-silent", "D122", "cli/check.ts", 'rule: "AsksForever"', 'rule: "Nothing"'),
  m("d122.lint-any", "D122", "cli/check.ts", "here.every(({ alt })", "here.some(({ alt })"),
  // Rule 52, reached by D122.
  m("rule52.freeze-leaves-mail", "rule:52", "turn.ts", 'if (m.k === "ending" && m.inc === inc.id) {', "if (false) {"),
  // D123.
  m("d123.decline-blocks", "D123", "lane.ts", "lane?.parked.some((p) => p.kept && p.attempt)", "lane?.parked.some((p) => p.kept)"),
  m("d123.parked-is-kept", "D123", "lane.ts", "lane?.parked.some((p) => p.kept && p.attempt)", "lane?.parked.some((p) => p.attempt)"),
  m("d123.keyless-idle-heads-only", "D123", "turn.ts", "(l) => l.actor === w.a.key && l.op === t.op); // D123", "(l) => l.actor === w.a.key && l.op === t.op && l.head); // D123"),
  m("d123.keyless-cancel-nothing", "D123", "turn.ts", 'if (mem.verb === "cancel" && !mem.key && it?.k !== "ending") {', "if (false) {"),
  m("d123.keyless-cancel-all-subjects", "D123", "turn.ts", 'l.op === mem.op && sameSubject(l.subject, subject)) letGoKept(tx, l);', "l.op === mem.op) letGoKept(tx, l);"),
  m("d123.letgo-takes-all", "D123", "lane.ts", "l.parked.filter((p) => !p.kept)", "[]"),
  m("d123.named-cancel-skips-kept", "D123", "turn.ts", 'const lane = named && mem.verb === "cancel" && sameSubject(named.subject, subject) ? letGoKept(tx, named) : named;', "const lane = named;"),
  m("d123.decline-piles-up", "D123", "turn.ts", "lane.parked.filter((p) => p.attempt || !p.kept)", "lane.parked"),
  m("d123.decline-replaces-sent", "D123", "turn.ts", "lane.parked.filter((p) => p.attempt || !p.kept)", "lane.parked.filter((p) => !p.kept)"),
  m("d123.decline-key-null", "D123", "turn.ts", 'const key = mem.verb === "commit" || mem.verb === "lookup" ? nameOf(op, input) : null;', "const key = null;"),
  m("d123.local-keeps", "D123", "step.ts", "const l = dropParked(tx, old);", "const l: typeof old | undefined = old;"),
  m("d123.persisted-drops-too", "D123", "step.ts", "if (m.local)\n    for (const old", "for (const old"),
  m("d123.strand-by-op", "D123", "world.ts", "const strandKey = (actor: string, inc: string, op: string) => `${actor}|${inc}|${op}`;", "const strandKey = (actor: string, _inc: string, op: string) => `${actor}|${op}`;"),
  m("d123.strand-outlives-life", "D123", "turn.ts", "reapStranded(tx, (s) => s.actor === w.a.key && !pathOfId(w.root, s.inc));"),
  m("d123.strand-outlives-actor", "D123", "step.ts", "reapStranded(tx, (s) => s.actor === key);"),
  m("d123.boot-tries-twice", "D123", "durable.ts", "kept: true as const, redelivered: true as const", "kept: true as const"),
  m("d123.adoption-tries-twice", "D123", "turn.ts", "...(p.kept ? { kept: true as const, redelivered: true as const } : {}),"),
  m("d123.rekeep-forgets", "D123", "turn.ts", "...(kept || item.kept ? { kept: true as const } : {}),", "...(kept ? { kept: true as const } : {}),"),
  m("d123.no-cause", "D123", "turn.ts", "cause: e.message, // D123"),
  m("d123.delivered-silent-at-boot", "D123", "turn.ts", "if (!item.redelivered || item.kept)", "if (!item.redelivered)"),
  // D114 on reads.
  m("d114.read-input-lost", "M6", "reads.ts", "ending, input: a.input, inc: a.inc", "ending, input: undefined, inc: a.inc"),
  m("d114.read-key-lost", "M6", "reads.ts", "key: a.key, owner: a.owner, ending", "key: null, owner: a.owner, ending"),
  // D124. Round 12 (review L4): retargeted to the compile prototype for operations, where the door's lint now is.
  m("d124.front-none", "D124", "../conformance/compile/operations.ts", "...(inputNotCarried.length ? { inputNotCarried } : {}),"),
  m("d124.keys-only", "D124", "../conformance/compile/operations.ts", "Object.entries(c.input as Record<string, { ast: Ast }>).flatMap(", "Object.entries(c.input as Record<string, { ast: Ast }>).filter(([f]) => keyFields.includes(f)).flatMap("),
  m("d124.no-objects", "D124", "../conformance/compile/operations.ts", 'case "Objects":\n      return [', 'case "Objects":\n      return []; return ['),
  m("d124.no-records", "D124", "../conformance/compile/operations.ts", '...(ast["indexSignatures"] as Array<{ type: Ast }>).flatMap((i) => inner(i.type, `${path}[]`)),'),
  m("d124.no-arrays", "D124", "../conformance/compile/operations.ts", 'case "Arrays":\n      return [', 'case "Arrays":\n      return []; return ['),
  m("d124.no-unions", "D124", "../conformance/compile/operations.ts", 'return [...new Set<string>((ast["types"] as Ast[]).flatMap((t) => inner(t, path)))];', "return [];"),
  m("d124.no-sets", "D124", "../conformance/compile/operations.ts", 'if (says === "ReadonlySet" || says === "ReadonlyMap") return [path];'),
  m("d124.date-warns", "D124", "../conformance/compile/operations.ts", 'if (says === "ReadonlySet" || says === "ReadonlyMap") return [path];', "return [path];"),
];
