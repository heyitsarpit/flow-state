// D57: a value from outside may not name, shape or stop the core. Every value core structures on comes through here. A failure has
// one effect per place: in a turn it refuses; a list repairs; a stored record quarantines; outside a turn the caller gives a
// default. No file parses meaning out of a string it built from a user's value.
import type { Compiled, Fragment, Node } from "../conformance/fixtures/compiled.ts";

export class Refused extends Error {
  constructor(
    readonly origin: string,
    cause: unknown,
  ) {
    super(String(cause));
  }
}
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
// One text for one value: an object's keys sorted, so a guard and a contract that write a key in other orders name one lane.
export const canon = (v: unknown): string =>
  JSON.stringify(v, (_k, x) =>
    isObject(x) && Object.getPrototypeOf(x) === Object.prototype
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .map((k) => [k, x[k]]),
        )
      : x,
  ) ?? "undefined";
// Never throws: undefined means it cannot be stored.
export const text = (v: unknown): string | undefined => {
  try {
    return canon(v);
  } catch {
    return undefined;
  }
};
export const same = (a: unknown, b: unknown) => {
  if (a === b) return true;
  const t = text(a);
  return t !== undefined && t === text(b);
};
// In a turn: what core must encode refuses the turn if it cannot.
export const encoded = (v: unknown, origin: string): string => {
  const t = text(v);
  if (t === undefined) throw new Refused(origin, "a value that cannot be encoded");
  return t;
};
export const admit = <A>(v: A, origin: string): A => (encoded(v, origin), v);
export const finiteMs = (v: unknown, origin: string): number => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0)
    throw new Refused(origin, `a schedule of ${String(v)}`);
  return v;
};
export const stringKey = (v: unknown, origin: string): string => {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  throw new Refused(origin, "a key that is not a string");
};
// A list field (rule 9): repaired, never refused. Keys are strings; a finite number reads as one.
export const listOf = (v: unknown): { list: readonly unknown[]; bad: boolean } =>
  Array.isArray(v) ? { list: v, bad: false } : { list: [], bad: v !== undefined };
export const listKey = (item: unknown, by: string | undefined): string | undefined => {
  const k = by === undefined ? item : isObject(item) ? item[by] : undefined;
  return typeof k === "string"
    ? k
    : typeof k === "number" && Number.isFinite(k)
      ? String(k)
      : undefined;
};

// ── Stored records, against the release that is running. Anything that fails is quarantined, per record (D46, D61).
const isStr = (v: unknown): v is string => typeof v === "string";
const strs = (v: unknown) => Array.isArray(v) && v.every(isStr);
const chainOf = (nodes: Readonly<Record<string, Node>>, leaf: string) => {
  const out: string[] = [];
  for (let n: string | undefined = leaf; n; n = nodes[n]?.parent) out.push(n);
  return out;
};
const validTimer = (t: unknown) =>
  isObject(t) &&
  t["kind"] === "schedule" &&
  ["key", "actor", "inc", "activation", "send", "id"].every((f) => isStr(t[f])) &&
  Number.isFinite(t["dueAt"]);
const placements = (f: Pick<Fragment, "nodes">, name: string) =>
  Object.values(f.nodes)
    .flatMap((n) => [...(n.placements ?? []), ...(n.subroutine ? [n.subroutine] : [])])
    .find((p) => p.name === name);
export const validInc = (m: Compiled, i: unknown, frag: string | null): boolean => {
  const f = frag === null ? m : m.fragments?.[frag];
  if (!f || !isObject(i) || !isStr(i["id"]) || !isStr(i["leaf"]) || !f.nodes[i["leaf"]])
    return false;
  if (
    !isObject(i["memory"]) ||
    !isObject(i["activations"]) ||
    !isObject(i["history"]) ||
    !isObject(i["kids"])
  )
    return false;
  if (!strs(i["subject"]) || (i["key"] !== undefined && !isStr(i["key"]))) return false;
  const act = i["activations"];
  if (!chainOf(f.nodes, i["leaf"]).every((n) => isStr(act[n]))) return false;
  if (!Object.values(i["history"]).every((n) => isStr(n) && f.nodes[n])) return false;
  const fz = i["frozen"];
  if (
    fz !== undefined &&
    !(
      isObject(fz) &&
      Array.isArray(fz["parked"]) &&
      Array.isArray(fz["timers"]) &&
      fz["timers"].every(validTimer)
    )
  )
    return false;
  return Object.values(i["kids"]).every((k) => {
    if (!isObject(k) || !isStr(k["name"])) return false;
    const p = placements(f, k["name"]);
    return p !== undefined && k["frag"] === p.fragment && validInc(m, k, p.fragment);
  });
};
export const validActor = (m: Compiled, v: Record<string, unknown>) =>
  isStr(v["key"]) &&
  Array.isArray(v["timers"]) &&
  v["timers"].every(validTimer) &&
  validInc(m, v["root"], null);
const validOwner = (o: unknown) =>
  isObject(o) &&
  isStr(o["inc"]) &&
  isStr(o["node"]) &&
  isStr(o["activation"]) &&
  Array.isArray(o["chain"]);
const validAttempt = (a: unknown) =>
  isObject(a) &&
  isStr(a["id"]) &&
  Number.isFinite(a["mint"]) &&
  Number.isFinite(a["retryCount"]) &&
  typeof a["mayHaveApplied"] === "boolean" &&
  validOwner(a["owner"]);
const validParked = (p: unknown) =>
  isObject(p) &&
  validOwner(p["owner"]) &&
  isObject(p["ending"]) &&
  ["success", "failure", "unknown"].includes(p["ending"]["ch"] as string);
export const validLane = (v: Record<string, unknown>) =>
  isStr(v["id"]) &&
  isStr(v["actor"]) &&
  strs(v["subject"]) &&
  Array.isArray(v["w"]) &&
  v["w"].every(validAttempt) &&
  (v["head"] === undefined || validAttempt(v["head"])) &&
  (v["parked"] === undefined || (Array.isArray(v["parked"]) && v["parked"].every(validParked)));
