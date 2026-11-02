// D52: the incarnation tree. An actor's root is an incarnation with path [] and frag null, so there is one code path. Pure
// helpers over an Inc, plus seeding, which allocates generations. The turn decides when; this says what.
import type {
  Activity,
  Compiled,
  Fragment,
  Node,
  Placement,
} from "../conformance/fixtures/compiled.ts";
import { entered, listKey, listOf, own, text } from "./gate.ts";
import { run } from "./hooks.ts";
import { fragOf, issue, nextGen, type Inc, type Tx } from "./world.ts";

export type Path = readonly string[];
export const kidAt = (root: Inc, path: Path): Inc | undefined => {
  let cur: Inc | undefined = root;
  for (const p of path) cur = cur && own(cur.kids, p);
  return cur;
};
export const withKid = (root: Inc, path: Path, f: (i: Inc) => Inc | undefined): Inc => {
  if (path.length === 0) return f(root) ?? root;
  const [p, ...rest] = path;
  const kid = own(root.kids, p!);
  if (!kid) return root;
  const next = rest.length === 0 ? f(kid) : withKid(kid, rest, f);
  if (next === undefined) {
    const { [p!]: _gone, ...kids } = root.kids;
    return { ...root, kids };
  }
  return { ...root, kids: { ...root.kids, [p!]: next } };
};
export const pathOfId = (root: Inc, id: string, here: Path = []): Path | undefined => {
  if (root.id === id) return here;
  for (const [name, k] of Object.entries(root.kids)) {
    const p = pathOfId(k, id, [...here, name]);
    if (p) return p;
  }
  return undefined;
};
export const walkIncs = (root: Inc, f: (i: Inc, p: Path) => void, here: Path = []) => {
  f(root, here);
  for (const [name, k] of Object.entries(root.kids)) walkIncs(k, f, [...here, name]);
};
export const up = (frag: { nodes: Readonly<Record<string, Node>> }, leaf: string) => {
  const out: string[] = [];
  for (let n: string | undefined = leaf; n; n = frag.nodes[n]!.parent) out.push(n);
  return out;
};
export const down = (frag: { nodes: Readonly<Record<string, Node>> }, node: string) => {
  let n = node;
  while (frag.nodes[n]!.default) n = frag.nodes[n]!.default!;
  return n;
};
// D57: a part is built once and never parsed. A placement's name has no ":", so this is one way only.
export const partOf = (name: string, key?: string) => (key === undefined ? name : `${name}:${key}`);
export const partsNamed = (host: Inc, name: string) =>
  Object.keys(host.kids).filter((x) => host.kids[x]!.name === name);
export const samePath = (a: Path, b: Path) =>
  a.length === b.length && a.every((x, i) => x === b[i]);
// Where a placement is declared, for a host and an instance name.
export const placementOf = (m: Compiled, host: Inc, name: string): Placement | undefined => {
  for (const n of Object.values(fragOf(m, host).nodes)) {
    const p = n.placements?.find((x) => x.name === name);
    if (p) return p;
    if (n.subroutine?.name === name) return n.subroutine;
  }
  return undefined;
};
// A fragment's or a host's readable memory: its own, then its children's slices (2.1's "Reading").
export const viewOf = (i: Inc): any => {
  const names = Object.keys(i.kids);
  const base = i.key === undefined ? i.memory : { ...i.memory, key: i.key, item: i.item };
  if (names.length === 0 && !i.each?.length) return base;
  const out: Record<string, unknown> = { ...base };
  for (const n of i.each ?? []) out[n] = [];
  for (const n of names) {
    const k = i.kids[n]!;
    if (k.key !== undefined)
      out[k.name!] = [...((out[k.name!] as unknown[] | undefined) ?? []), viewOf(k)];
    else out[k.name!] = viewOf(k);
  }
  return out;
};
const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);
export const sameSubject = sameList;

export type Started = { path: Path; inc: Inc; entered: readonly string[] };
// A new incarnation (rule 1). Its Input from the host's view as the caller holds it; then its children, active by default.
// D108: a reset value that cannot encode is one constant, so nothing resets on it. A fragment's identity needs a name, and "this value has none" is the honest one.
export const resetValue = (tx: Tx, slot: NonNullable<Placement["resetOn"]>, view: object): string => {
  const got = entered(() => run(slot, view as never));
  if (got.ok) return text(got.v)!;
  issue(tx, { code: "UnencodableValue", origin: `${slot.at.definition} ${slot.at.path}` });
  return "$unencodable";
};
export const seed = (
  tx: Tx,
  m: Compiled,
  host: Inc,
  p: Placement,
  path: Path,
  key: string | undefined,
  item: unknown,
  started: Started[],
): Inc => {
  const frag: Fragment = m.fragments![p.fragment]!;
  const hv = { memory: viewOf(host), event: {}, ...(key === undefined ? {} : { key, item }) };
  const input = p.input ? run(p.input, hv as never) : {};
  const reset = p.resetOn ? resetValue(tx, p.resetOn, hv) : undefined;
  const subject = [
    ...host.subject,
    ...(reset === undefined ? [] : [reset]),
    ...(key === undefined ? [] : [key]),
  ];
  const leaf = down(frag, frag.default);
  const active = up(frag, leaf);
  const activations = Object.fromEntries(active.map((n) => [n, nextGen(tx)]));
  const base: Inc = {
    id: nextGen(tx),
    name: p.name,
    frag: p.fragment,
    leaf,
    memory: run(frag.memory.initial, input as never),
    activations,
    history: {},
    subject,
    kids: {},
    ...(reset === undefined ? {} : { reset }),
    ...(key === undefined ? {} : { key, item: item ?? key }),
  };
  const out = seedKids(tx, m, base, active, path, started);
  started.push({ path, inc: out, entered: active });
  return out;
};
// The placements on these nodes that should now exist. `.each` membership is the turn's business once a list exists.
export const seedKids = (
  tx: Tx,
  m: Compiled,
  inc: Inc,
  nodes: readonly string[],
  path: Path,
  started: Started[],
): Inc => {
  let cur = inc;
  const frag = fragOf(m, inc);
  // Outermost first, so an inner state's fragment can read an outer one.
  for (const n of [...nodes].reverse()) {
    const node = frag.nodes[n]!;
    for (const p of [...(node.placements ?? []), ...(node.subroutine ? [node.subroutine] : [])]) {
      if (p.each) {
        if (!cur.each?.includes(p.name)) cur = { ...cur, each: [...(cur.each ?? []), p.name] };
        for (const { key, item } of membership(cur, p).keys) {
          const part = partOf(p.name, key);
          if (cur.kids[part]) continue;
          const k = seed(tx, m, cur, p, [...path, part], key, item, started);
          cur = { ...cur, kids: { ...cur.kids, [part]: k } };
        }
        continue;
      }
      const old = cur.kids[p.name];
      if (old) continue; // a resumable one thaws in the turn
      const k = seed(tx, m, cur, p, [...path, p.name], undefined, undefined, started);
      cur = { ...cur, kids: { ...cur.kids, [p.name]: k } };
    }
  }
  return cur;
};
// Rule 9: membership is host data, repaired and never refused.
export const membership = (host: Inc, p: Placement) => {
  const { list, bad } = listOf(host.memory?.[p.each!.of]);
  const seen = new Set<string>();
  const keys: Array<{ key: string; item: unknown }> = [];
  let repairs = bad ? 1 : 0;
  for (const it of list) {
    const key = listKey(it, p.each!.by);
    if (key === undefined || seen.has(key) || keys.length >= p.each!.max) {
      repairs++;
      continue;
    }
    seen.add(key);
    keys.push({ key, item: it });
  }
  return { keys, repairs };
};
export const placementsActive = (m: Compiled, inc: Inc) => {
  const frag = fragOf(m, inc);
  const out: Array<{ p: Placement; node: string }> = [];
  for (const n of up(frag, inc.leaf).reverse()) {
    const node = frag.nodes[n]!;
    for (const p of node.placements ?? []) out.push({ p, node: n });
    if (node.subroutine) out.push({ p: node.subroutine, node: n });
  }
  return out;
};
// D69: what a module may know of the tree. The active activities of this actor, by placement: not the tree.
export type PlacedActivity = {
  readonly inc: string;
  readonly node: string;
  readonly activation: string;
  readonly activity: Activity;
};
export const activitiesOf = (m: Compiled, root: Inc): PlacedActivity[] => {
  const out: PlacedActivity[] = [];
  walkIncs(root, (i) => {
    if (i.frozen) return;
    const f = fragOf(m, i);
    for (const n of up(f, i.leaf))
      for (const activity of f.nodes[n]!.activities ?? [])
        out.push({ inc: i.id, node: n, activation: i.activations[n] ?? "", activity });
  });
  return out;
};
