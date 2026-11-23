// Final reviewer's mutants for round 11, written from the code and rules before opening RESULTS.md or STATUS.md. Paths relative to round-11/, as mutate.ts takes them.
const F = "../conformance/typed/flow.ts";
const L = "../conformance/legacy.ts";
type M = { id: string; kills: readonly string[]; edits: ReadonlyArray<readonly [string, string, string]> };
const m = (id: string, file: string, find: string, replace: string): M => ({ id, kills: [], edits: [[file, find, replace]] });
export const MUTANTS: readonly M[] = [
  // ── Memory on the typed path (Q1: the production twin of the runtime's restore-less branch)
  m("mem.restore-forgets", F, "const s = stored as Record<string, unknown>;", "const s = {} as Record<string, unknown>;"),
  m("mem.restore-undecoded", F, "? (Schema.decodeUnknownSync(codecs.get(k)!)({ [k]: s[k] }) as Record<string, unknown>)[k]", "? s[k]"),
  m("mem.restore-no-default", F, ": defaults.get(k)!.has ? defaults.get(k)!.v : f.value,", ": f.value,"),
  m("mem.restore-absent-explicit", F, '.filter(([k, f]) => k in s || defaults.get(k)!.has || f.from !== "absent")', ".filter(() => true)"),
  m("mem.encode-identity", F, "codecs.has(k) ? (Schema.encodeUnknownSync(codecs.get(k)!)({ [k]: v[k] }) as Record<string, unknown>)[k] : v[k]", "v[k]"),
  m("mem.initial-no-input-default", F, "else if (defaults.get(k)!.has) out[k] = defaults.get(k)!.v;", "else if (false) out[k] = defaults.get(k)!.v;"),
  m("mem.initial-computed-blind", F, "const start = { ...out };", "const start = {} as Record<string, unknown>;"),
  m("mem.frag-restore-lost", F, "restore: restoreOf(d.id, (d.memory ?? {}) as M),", "restore: restoreOf(d.id, {} as M),"),
  // ── Operations
  m("op.timeout-dropped", F, "...(c.timeoutMs === undefined ? {} : { timeoutMs: c.timeoutMs }),", "...({}),"),
  m("op.latest-is-serialize", F, "concurrency: c.concurrency,", 'concurrency: (c.concurrency === "latest" ? "serialize" : c.concurrency) as Op["concurrency"],'),
  m("op.notcarried-dropped", F, "...(inputNotCarried.length ? { inputNotCarried } : {}),", "...({}),"),
  m("op.unknown-byreason-first", F, 'typeof u0["tag"] === "string" ? u0 : { byReason: u0 };', 'typeof u0["tag"] === "string" ? u0 : (Object.values(u0)[0] as Readonly<Record<string, unknown>>);'),
  m("op.failure-payload-lost", F, "compileMapped(definition, name, `failure.${k}`, v),", "compileMapped(definition, name, `failure.${k}`, { tag: (v as { tag: string }).tag }),"),
  m("op.dup-op-unchecked", F, "if (k in d.ops || frags.filter((f) => k in f.ops).length > 1) throw", "if (false) throw"),
  // ── Alternatives
  m("alt.exit-field-dropped", F, "...(one.exit ? { exit: { name: one.exit.name, ...(one.exit.f ? { from: slotOf(definition, `${path}.exit`, one.exit.f) } : {}) } } : {}),", "...({}),"),
  m("alt.exit-guard-lost", F, "x.exit !== undefined && Object.keys(x).length === 1;", "x.exit !== undefined;"),
  m("alt.raise-from-dropped", F, "...(r.fromFn ? { from: slotOf(definition, `${path}.raise[${i}]`, r.fromFn) } : {}),", "...({}),"),
  m("alt.notify-from-dropped", F, "...(n.f ? { from: slotOf<(a: { memory: unknown; event: unknown }) => unknown>(", "...(false ? { from: slotOf<(a: { memory: unknown; event: unknown }) => unknown>("),
  m("alt.module-value-dropped", F, "...(a.f ? { value: slotOf(definition, p, a.f) } : {})", "...({})"),
  m("alt.member-key-dropped", F, "return { op: a.op, verb: a.member, ...(keyFn ? { key: slotOf(definition, p, keyFn) } : {}) };", "return { op: a.op, verb: a.member };"),
  m("alt.retryable-times-plus", F, 'opGuard: { op, verb: "retryable", times: o.times },', 'opGuard: { op, verb: "retryable", times: o.times + 1 },'),
  m("alt.followups-dropped", F, "...(one.labFollowUps?.length", "...(false && one.labFollowUps?.length"),
  m("alt.exit-tok-from-dropped", F, "exit: { name, ...(f ? { from: slotOf(definition, `${path}.exit`, f) } : {}) },", "exit: { name },"),
  // ── Nodes, placements, schedules, activities
  m("node.default-dropped", F, "...(b.default ? { default: b.default.node } : {}),", "...({}),"),
  m("place.resumable-dropped", F, "...(p.resumable ? { resumable: true as const } : {}),", "...({}),"),
  m("place.each-max-plus", F, "...(p.each ? { each: p.each } : {}),", "...(p.each ? { each: { ...p.each, max: p.each.max + 1 } } : {}),"),
  m("place.input-dropped", F, "...(p.input ? { input: slotOf(definition, `${base}.input`, p.input) } : {}),", "...({}),"),
  m("place.into-name-ignored", F, "b.into.name ?? id", "id"),
  m("sched.armOn-empty", F, 'armOn: s.armOn ?? ["entry"],', "armOn: s.armOn ?? [],"),
  m("sched.ms-plus-one", F, "{ ms: Duration.toMillis(Duration.fromInputUnsafe(s.schedule)) }", "{ ms: Duration.toMillis(Duration.fromInputUnsafe(s.schedule)) + 1 }"),
  m("act.when-dropped", F, "...(x.when ? { when: slotOf<(a: unknown) => boolean>(definition, `${base}activities[${i}].when`, x.when) } : {}),", "...({}),"),
  // ── Fragments and the machine
  m("frag.default-root", F, 'default: d.default ?? "root",', 'default: "root",'),
  m("frag.abandon-from-dropped", F, "...(n.f ? { from: slotOf(d.id, `whenAbandoned[${i}]`, n.f) } : {})", "...({})"),
  m("frag.nested-not-collected", F, "f.places.forEach(visit);", ""),
  m("mach.local-dropped", F, "...(d.local ? { local: true as const } : {}),", "...({}),"),
  m("mach.events-dropped", F, "events: { external: Object.keys(d.events), internal: Object.keys(d.internalEvents) },", ""),
  m("dom.version-dropped", F, '...(d.version ? { version: slotOf(id, "domain.version", d.version) } : {}),', "...({}),"),
  m("dom.confirms-dropped", F, "...(w.confirms ? { confirms: slotOf(id, `domain.writes.${op}.confirms`, w.confirms) } : {})", "...({})"),
  m("stream.failureBy-dropped", F, "...(failureBy ? { failureBy: Object.fromEntries(Object.entries(failureBy).map(([k, t]) => [k, streamMapped(id, op, `failureBy.${k}`, t)])) } : {}),", "...({}),"),
  m("stream.catchUp-dropped", F, '...sl("catchUp", catchUp),', ""),
  // ── legacy.ts (D207's suite-side slotting)
  m("legacy.commit-path", L, "slot(id, `operations.${k}.commit`, op.commit)", "slot(id, `operations.${k}`, op.commit)"),
  m("legacy.reads-one-path", L, "(k, f) => slot(id, `domain.reads.${k}`, f)", '(k, f) => slot(id, "domain.read", f)'),
  m("legacy.stream-path-raw", L, '(n === "reconnectWhile" ? "reconnect.while" : n === "pageRetryWhile" ? "page.while" : n)', "(n)"),
  m("legacy.listens-left-bare", L, '...(d["listens"] ? { listens: each(d["listens"] as Record<string, unknown>, (k, f) => slot(id, `domain.listens.${k}`, f)) } : {}),', "...({}),"),
  m("legacy.catch-all-ops", L, 'const ops = each(c.ops, (k, op) => (typeof op.commit === "function" ? { ...op, commit: slot(id, `operations.${k}.commit`, op.commit) } : op));', "const ops = each(c.ops, (k, op) => Object.fromEntries(Object.entries(op).map(([n, v]) => [n, slot(id, `operations.${k}.${n}`, v)])));"),
  // ── The seal (D207)
  m("gate.dup-path-allowed", "gate.ts", 'if (had !== undefined && had !== o["run"]) throw', "if (false) throw"),
  m("gate.walk-function-allowed", "gate.ts", 'if (typeof v === "function") throw new Error(`SealUnknownClosure: ${c.id} ${p}`);', 'if (typeof v === "function") return;'),
  // ── Services (D211), the harness side
  m("drive.services-last-only", "../conformance/drive.ts", "services = given.length ? given.reduce((a, b) => Context.merge(a, b)) : undefined;", "services = given.length ? given[given.length - 1] : undefined;"),
  // ── The runtime's restore-less branch (Q1)
  m("h.restore-absent-lost", "durable.ts", "memory: dec ? dec.run(i.memory) : i.memory,", "memory: dec ? dec.run(i.memory) : {},"),
  m("durable.frag-restore-host", "durable.ts", "const dec = i.frag ? m.fragments?.[i.frag]?.memory.restore : m.memory.restore;", "const dec = m.memory.restore;"),
];
