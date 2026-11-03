// D134: whole output, the default assertion. Every read of a harness reduced to one line per case, so what nobody named is still noticed: an extra request, a disk key, a memory field, an issue.
// It says what changed. A person says whether that is right: it is a change detector, not a proof, and a mutant killed only here is reported apart (`killedBy: "output"`).
import { createHash } from "node:crypto";
import type { ActorRef, Harness } from "./harness.ts";

// D141's tagged form: a value is compared as what it is, not as the JSON it happens to make. Keys sorted, so field order is not a difference.
export const canonValue = (v: unknown, up: readonly unknown[] = []): unknown => {
  if (typeof v === "bigint") return `$bigint:${v}`;
  if (typeof v === "number" && !Number.isFinite(v)) return `$number:${v}`;
  if (typeof v === "number" && Object.is(v, -0)) return "$number:-0";
  if (typeof v === "undefined") return "$undefined";
  if (typeof v === "symbol") return `$symbol:${String(v)}`;
  if (typeof v === "function") return "$function";
  if (v === null || typeof v !== "object") return v;
  if (up.includes(v)) return "$cycle";
  const next = [...up, v];
  if (Array.isArray(v)) return v.map((x) => canonValue(x, next));
  if (v instanceof Date) return `$date:${v.getTime()}`;
  if (v instanceof Map) return { $map: [...v].map((e) => canonValue(e, next)) };
  if (v instanceof Set) return { $set: [...v].map((e) => canonValue(e, next)) };
  const proto = Object.getPrototypeOf(v);
  const o = Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonValue((v as Record<string, unknown>)[k], next)]));
  return proto === Object.prototype || proto === null ? o : { $class: proto.constructor?.name ?? "?", ...o };
};
export const canonText = (v: unknown) => JSON.stringify(canonValue(v));

const shortSha = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 10);
const LONG = 160;
const brief = (s: string) => (s.length <= LONG ? s : `sha:${shortSha(s)}#${s.length}`);
const counts = (xs: readonly string[]) => {
  const m: Record<string, number> = {};
  for (const x of [...xs].sort()) m[x] = (m[x] ?? 0) + 1;
  return m;
};
export const SECTIONS = ["requests", "issues", "disk", "actors", "evidence", "frames", "waits", "truth", "outside", "hashes", "fatal"] as const;
export type Section = (typeof SECTIONS)[number];

export type Tracked = { h: Harness; actors: Map<string, ActorRef>; hashes: Set<number | bigint>; steps: number };

// Rank an Attempt's id by first sight: what a mint is called is the host's, and which is which is the output.
const ranker = () => {
  const ranks = new Map<string, number>();
  return (t: string) =>
    t.replace(/att-\d+-\d+/g, (x) => {
      let r = ranks.get(x);
      if (r === undefined) {
        r = ranks.size;
        ranks.set(x, r);
      }
      return `#${r}`;
    });
};

export const outputOf = (t: Tracked): Record<Section, unknown> => {
  const r = t.h.read;
  const rank = ranker();
  const reqs = r.requests();
  const seq = reqs.map((q) => `${q.op}:${q.idempotencyKey ?? "-"}:${canonText(q.input)}`).map(rank);
  const requests = seq.length <= 6 ? seq.map(brief) : { n: seq.length, ops: counts(reqs.map((q) => q.op)), keys: new Set(reqs.map((q) => q.idempotencyKey)).size, seq: shortSha(seq.join("\n")) };
  const issues = counts(r.issues().map((i) => `${i.code}${i.origin ? "@" : ""}`));
  const disk = counts(r.diskKeys().map((k) => (k.includes("/") ? k.slice(0, k.indexOf("/")) : k)));
  const actors = Object.fromEntries(
    [...t.actors].sort().map(([k, a]) => [k, { state: r.state(a) ?? null, memory: brief(rank(canonText(r.memory(a)))) }]),
  );
  const evidence = counts(r.evidence().map((e) => String(e["kind"])));
  const waits = counts(r.quiet().waits.map((w) => `${w.kind}:${"op" in w ? w.op : ""}`));
  const o = r.outside();
  return {
    requests,
    issues,
    disk,
    actors,
    evidence,
    frames: r.frames().length,
    waits,
    truth: brief(rank(canonText(r.truth()))),
    outside: { open: o.open.length, storage: o.storage.length, timers: o.timers.length, live: o.live },
    hashes: t.hashes.size,
    fatal: r.quiet().fatal,
  };
};
// One line per harness a case drove, in order. Harnesses that took no step say nothing.
// What a case allows is not in its line at all, so it cannot churn.
export const caseOutput = (ts: readonly Tracked[], allow: readonly Section[] = []): Array<Partial<Record<Section, unknown>>> =>
  ts
    .filter((t) => t.steps > 0)
    .map(outputOf)
    .map((o) => Object.fromEntries(Object.entries(o).filter(([k]) => !allow.includes(k as Section))) as Partial<Record<Section, unknown>>);
export const diffOutput = (want: string, got: string): string[] => {
  if (want === got) return [];
  const w = JSON.parse(want) as Array<Record<string, unknown>>;
  const g = JSON.parse(got) as Array<Record<string, unknown>>;
  const out: string[] = [];
  if (w.length !== g.length) out.push(`harnesses: expected ${w.length}, got ${g.length}`);
  for (let i = 0; i < Math.min(w.length, g.length); i++)
    for (const s of SECTIONS) {
      const a = JSON.stringify(w[i]![s]);
      const b = JSON.stringify(g[i]![s]);
      if (a !== b) out.push(`${i}.${s}: expected ${a}, got ${b}`);
    }
  return out;
};
