// A record's bytes. D89, decided, and review H2: memory encodes through its machine's Schema when it has one, so reading and writing are one format. An actor's record holds an
// incarnation tree; each incarnation's memory is its definition's. No Schema (a hand-written Compiled): plain JSON, as restore reads it. Throws if a value has no text: the edge's poison clause.
import type { Compiled, Slot } from "../conformance/fixtures/compiled.ts";
import { carry } from "./gate.ts";

type Inc = { frag?: string | null; memory: unknown; kids?: Readonly<Record<string, Inc>> };
type Rec = { machine?: string; root?: Inc };
const walk = (m: Compiled, i: Inc): Inc => {
  // Round 12 (D214): every sealed memory has an encode.
  const mem = i.frag ? m.fragments?.[i.frag]?.memory : m.memory;
  const enc = mem?.encode as Slot<(x: unknown) => unknown> | undefined;
  return {
    ...i,
    memory: mem ? enc!.run(i.memory) : i.memory,
    ...(i.kids
      ? { kids: Object.fromEntries(Object.entries(i.kids).map(([k, v]) => [k, walk(m, v)])) }
      : {}),
  };
};
export const encodeRecord = (machines: Readonly<Record<string, Compiled>>, record: unknown): string => {
  const r = record as Rec;
  const m = r.machine ? machines[r.machine] : undefined;
  return carry(m && r.root ? { ...r, root: walk(m, r.root) } : record);
};
