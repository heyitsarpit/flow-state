// Round 11: every typed fixture against its hand twin, as data. A closure (Slot or bare) is compared by where it sits, not what it does, and not by
// its path: what it does is the suite's job (whole output, D197). What typed adds by design is skipped and stated: keyFields, events, memory.restore
// and memory.encode, inputNotCarried. Anything else is printed, and exits 1 unless it is on the stated list below with its reason.
// bun round-11/typed/compare-all.ts [--all]
import type { Api } from "../../conformance/fake-world.ts";
import type { Fixture } from "../../conformance/harness.ts";
import { pairs } from "./pairs.ts";

const api = new Proxy({}, { get: () => () => undefined }) as Api;
// Round 12 (D213-D215): `inputFields`, `services` and memory `fields` are new on the typed side, and `key` is gone from it: the seal makes it from `keyFields`.
// Round 13 (round 12 review L5): skipped by path, not by name, so a raise's, a member's and a guard's `key` are compared again. Round 13 (M3): a fragment's
// `kind`, `events` and `ports` are new on the typed side.
const SKIP = [
  /^ops\.[^.]+\.(keyFields|inputFields|services|inputNotCarried|key)$/,
  /^(fragments\.[^.]+\.)?memory\.(fields|restore|encode)$/,
  /^events$/,
  /^fragments\.[^.]+\.(kind|events|ports)$/,
];
const shape = (v: unknown, path = ""): unknown => {
  if (typeof v === "function") return "(closure)";
  if (Array.isArray(v)) return v.map((x, i) => shape(x, `${path}[${i}]`));
  if (v === null || typeof v !== "object") return v;
  const o = v as Record<string, unknown>;
  if (typeof o["run"] === "function" && o["at"]) return "(closure)";
  const at = (k: string) => (path ? `${path}.${k}` : k);
  return Object.fromEntries(
    Object.keys(o)
      .filter((k) => !SKIP.some((r) => r.test(at(k))) && !(k === "at" && typeof o["target"] === "string") && o[k] !== undefined)
      .sort()
      .map((k) => [k, shape(o[k], at(k))]),
  );
};
const diff = (a: unknown, b: unknown, path: string, out: string[]) => {
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  if (typeof a === "object" && a && typeof b === "object" && b && Array.isArray(a) === Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
      diff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`, out);
    return;
  }
  out.push(`${path}: hand ${JSON.stringify(a)?.slice(0, 120)} typed ${JSON.stringify(b)?.slice(0, 120)}`);
};
const all: string[] = [];
const stated: string[] = [];
for (const p of pairs) {
  const out: string[] = [];
  const h = (p.hand as Fixture).make(api);
  const t = (p.typed as Fixture).make(api);
  diff(shape(h), shape(t), p.name, out);
  for (const l of out) (p.stated?.some((r) => r.test(l)) ? stated : all).push(l);
}
console.log(all.join("\n"));
console.log(`pairs: ${pairs.length}; differences stated: ${stated.length}; unexplained: ${all.length}`);
if (process.argv.includes("--all")) console.log(stated.join("\n"));
process.exit(all.length ? 1 : 0);
