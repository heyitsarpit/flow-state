// D90: `actors` as a fixed two-level table of small records. `{ ...o, [k]: v }` on a 1,000-key object goes megamorphic once a site has seen other
// shapes: round 6's review measured 60 us at 1x and 400-600 us at 6x. Here a turn copies two 64-slot arrays and one small record. Canonical: the same
// keys give the same table whatever the order, so a replay and a state hash compare it as a plain value. A key is a name, never a property of anything shared.
import type { ActorRec } from "./world.ts";

type Bucket = Readonly<Record<string, ActorRec>>;
type Row = ReadonlyArray<Bucket | null>;
export type Actors = ReadonlyArray<Row | null>;
const SIZE = 64;
const empty: Row = Array.from({ length: SIZE }, () => null);
export const noActors: Actors = Array.from({ length: SIZE }, () => null);
const hash = (k: string) => {
  let h = 2166136261;
  for (let i = 0; i < k.length; i++) h = Math.imul(h ^ k.charCodeAt(i), 16777619);
  return h >>> 0;
};
const has = Object.prototype.hasOwnProperty;
export const getActor = (t: Actors, k: string): ActorRec | undefined => {
  const h = hash(k);
  const b = t[h & 63]?.[(h >>> 6) & 63];
  return b && has.call(b, k) ? b[k] : undefined;
};
const put = (t: Actors, h: number, b: Bucket | null): Actors => {
  const top = t.slice();
  const row = (t[h & 63] ?? empty).slice();
  row[(h >>> 6) & 63] = b;
  top[h & 63] = row;
  return top;
};
export const setActor = (t: Actors, k: string, v: ActorRec): Actors => {
  const h = hash(k);
  const b = t[h & 63]?.[(h >>> 6) & 63];
  return put(t, h, { ...b, [k]: v });
};
export const deleteActor = (t: Actors, k: string): Actors => {
  const h = hash(k);
  const b = t[h & 63]?.[(h >>> 6) & 63];
  if (!b || !has.call(b, k)) return t;
  const { [k]: _gone, ...rest } = b;
  return put(t, h, Object.keys(rest).length ? rest : null);
};
export const allActors = (t: Actors): ActorRec[] => {
  const out: ActorRec[] = [];
  for (const r of t) if (r) for (const b of r) if (b) for (const k in b) out.push(b[k]!);
  return out.sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0)); // an order that is not the table's
};
// What changed between two tables, by identity. Costs what changed, not how many actors there are.
export const changedActors = (a: Actors, b: Actors): string[] => {
  const out = new Set<string>();
  for (let i = 0; i < SIZE; i++) {
    if (a[i] === b[i]) continue;
    for (let j = 0; j < SIZE; j++) {
      const x = a[i]?.[j] ?? null;
      const y = b[i]?.[j] ?? null;
      if (x === y) continue;
      for (const k in x) if (x[k] !== y?.[k]) out.add(k);
      for (const k in y) if (x?.[k] !== y[k]) out.add(k);
    }
  }
  return [...out].sort();
};
