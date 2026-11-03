// Round 11: every machine the suite boots, by the Fixture object that made it, with what it uses. bun round-11/typed/census.ts [--json out]
// Runs the suite once on round 11 with every harness's `start` observed, so inline fixtures in scenarios are counted too.
import { makeHarness } from "../../conformance/drive.ts";
import type { Fixture, Harness } from "../../conformance/harness.ts";
import { runScenarios } from "../../conformance/main.ts";
import type { Api } from "../../conformance/fake-world.ts";
import { port } from "../adapter.ts";

const api = new Proxy({}, { get: () => () => undefined }) as Api;
const seen = new Map<Fixture, Set<string>>();
let bucket: Fixture[] = [];
const base = makeHarness(port);
const make = (): Harness => {
  const h = base();
  const start = h.start;
  h.start = (cfg) => {
    bucket.push(...cfg.machines);
    start(cfg);
  };
  return h;
};
// Round 11: a case boots typed output when every machine it started came from `machine()` (a fixture marked `typed` by `conformance/typed/lab.ts`).
const caseTyped = new Map<string, boolean>();
const untypedIds = new Map<string, number>();
runScenarios(make, new Set(), undefined, {
  onResult: (r) => {
    const name = r.variant ? `${r.id}/${r.variant}` : r.id;
    for (const f of bucket) (seen.get(f) ?? seen.set(f, new Set()).get(f)!).add(name);
    const all = bucket.length > 0 && bucket.every((f) => (f as { typed?: boolean }).typed === true);
    caseTyped.set(name, all);
    if (!all) for (const id of new Set(bucket.filter((f) => !(f as { typed?: boolean }).typed).map((f) => f.id))) untypedIds.set(id, (untypedIds.get(id) ?? 0) + 1);
    bucket = [];
  },
});

type Stat = { slots: number; bare: string[]; paths: Map<string, number>; features: Set<string>; infinities: string[] };
const walk = (v: unknown, p: string, s: Stat, seenObj: Set<object>) => {
  if (typeof v === "function") return void s.bare.push(p);
  if (typeof v === "number" && !Number.isFinite(v)) s.infinities.push(p);
  if (v === null || typeof v !== "object") return;
  if (seenObj.has(v)) return;
  seenObj.add(v);
  if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${p}[${i}]`, s, seenObj));
  const o = v as Record<string, unknown>;
  if (typeof o["run"] === "function" && o["at"]) {
    s.slots++;
    const at = o["at"] as { definition: string; path: string };
    const k = `${at.definition}:${at.path}`;
    s.paths.set(k, (s.paths.get(k) ?? 0) + 1);
    return;
  }
  for (const k of Object.keys(o)) walk(o[k], p ? `${p}.${k}` : k, s, seenObj);
};
const features = (c: any): Set<string> => {
  const f = new Set<string>();
  if (c.fragments && Object.keys(c.fragments).length) f.add("fragments");
  if (c.streams && Object.keys(c.streams).length) f.add("streams");
  if (c.domain) f.add("domain");
  if (c.local) f.add("local");
  if (c.uses?.length) f.add(`uses:${c.uses.join("+")}`);
  if (c.persisted === false) f.add("unpersisted");
  if (c.events) f.add("events");
  const nodes = [c.nodes, ...Object.values(c.fragments ?? {}).map((x: any) => x.nodes)];
  for (const ns of nodes)
    for (const n of Object.values(ns ?? {}) as any[]) {
      if (n.activities?.length) f.add("activities");
      if (n.subroutine) f.add("subroutine");
      for (const p of [...(n.placements ?? []), ...(n.subroutine ? [n.subroutine] : [])]) {
        f.add("placement");
        if (p.each) f.add("each");
        if (p.resetOn) f.add("resetOn");
        if (p.resumable) f.add("resumable");
        if (p.guards) f.add("placement.guards");
      }
      for (const s of n.schedules ?? []) {
        f.add("schedule");
        if (typeof s.schedule?.run === "function") f.add("schedule.slot");
        if (s.disarmOn?.length) f.add("disarmOn");
        if (s.armOn?.some((x: string) => x !== "entry")) f.add("armOn");
      }
      if (n.parent && n.parent !== "root") f.add("nested");
      for (const alts of Object.values(n.on ?? {}) as any[])
        for (const a of alts) {
          if (a.followUps?.length) f.add("followUps");
          if (a.raises?.length) f.add("raises");
          if (a.notify?.length) f.add("notify");
          if (a.exit) f.add("exit");
          if (a.history) f.add("history");
          for (const t of a.tokens ?? []) f.add(`token:${"node" in t ? "node" : "port" in t ? "port" : t.verb}`);
          for (const m of a.members ?? []) f.add(`member:${m.verb}`);
        }
    }
  for (const op of Object.values(c.ops ?? {}) as any[]) {
    f.add(`op:${op.kind}:${op.concurrency}`);
    if (op.timeoutMs !== undefined) f.add("timeoutMs");
    if (op.fragment) f.add("op.fragment");
    if (typeof op.commit === "function") f.add("commit:bare");
    if (op.outcomes?.unknown?.byReason) f.add("unknown.byReason");
  }
  if (c.memory?.restore) f.add("memory.restore");
  if (c.memory?.encode) f.add("memory.encode");
  return f;
};
const rows = [...seen].map(([fx, cases]) => {
  const c = fx.make(api);
  const s: Stat = { slots: 0, bare: [], paths: new Map(), features: new Set(), infinities: [] };
  walk(c, "", s, new Set());
  const dups = [...s.paths].filter(([, n]) => n > 1).map(([k, n]) => `${k}×${n}`);
  return { fixture: fx.id, machine: c.id, cases: cases.size, slots: s.slots, bare: s.bare, dups, infinities: s.infinities, features: [...features(c)].sort(), sample: [...cases].slice(0, 3) };
});
rows.sort((a, b) => b.cases - a.cases);
const byId = new Map<string, number>();
for (const r of rows) byId.set(r.fixture, (byId.get(r.fixture) ?? 0) + 1);
for (const r of rows)
  console.log(`${r.fixture.padEnd(28)} ${String(r.cases).padStart(4)} cases  slots ${String(r.slots).padStart(3)}  bare ${String(r.bare.length).padStart(3)}  dups ${r.dups.length}  inf ${r.infinities.length}  ${byId.get(r.fixture)! > 1 ? "(same id, other object) " : ""}${r.features.join(" ")}`);
const t = (k: "slots") => rows.reduce((a, r) => a + r[k], 0);
console.log(`fixture objects ${rows.length}; distinct ids ${byId.size}; slots ${t("slots")}; bare ${rows.reduce((a, r) => a + r.bare.length, 0)}; duplicate paths ${rows.reduce((a, r) => a + r.dups.length, 0)}; non-finite numbers ${rows.reduce((a, r) => a + r.infinities.length, 0)}`);
const typedCases = [...caseTyped.values()].filter(Boolean).length;
console.log(`TYPED  ${typedCases}/${caseTyped.size} cases boot only typed output; hand machines still booted, by cases: ${[...untypedIds].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ") || "none"}`);
const i = process.argv.indexOf("--json");
if (i > 0) await Bun.write(process.argv[i + 1]!, JSON.stringify(rows, null, 1));
