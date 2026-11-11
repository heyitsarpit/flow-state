// Round 12, compile prototypes: what a machine body and a fragment body share. The state tree is written as the design writes it (2.3): an ordered list of
// a string leaf, `{ NAME: [children] }`, `{ NAME: Sub }`, or `{ NAME: Flow.state(subject, { traits }) }`, with placement (which fragment, `.each`,
// `.resumable()`) in the definition and filling (`input`, `resetOn`, `guards`, `callbacks`, `exits`) in the body at the node where it is placed.
import { Duration } from "effect";
import type { Alternative, At, Denial, Member, Node, Placement, Raise, ScheduleSpec, Slot, TokenGuard } from "../fixtures/compiled.ts";
import { list, slotOf, type UnionToIntersection } from "./core.ts";
import type { Act, AnyEvent, In, OpGuard } from "./operations.ts";

// ── Fragments as placed values. `.each({ of, max, by? })` and `.resumable()` are placement (2.1, rule 9), so they sit on the value in the definition.
export type FragmentValue = {
  readonly id: string;
  readonly kind: "trait" | "subroutine";
  readonly compiled: import("../fixtures/compiled.ts").CompiledFragment;
  readonly ops: Readonly<Record<string, import("../fixtures/compiled.ts").CompiledOp>>;
  readonly places: readonly FragmentValue[];
  readonly hostEvents: Readonly<Record<string, unknown>>;
  readonly events: Readonly<Record<string, unknown>>;
};
export type PlaceOpts = { readonly each?: { readonly of: string; readonly by?: string; readonly max: number }; readonly resumable?: true };
export type Placed<F extends FragmentValue = FragmentValue> = F & {
  readonly placement: PlaceOpts;
  readonly each: (o: NonNullable<PlaceOpts["each"]>) => Placed<F>;
  readonly resumable: () => Placed<F>;
};
export const placeable = <F extends FragmentValue>(f: F, placement: PlaceOpts = {}): Placed<F> => ({
  ...f,
  placement,
  each: (o) => placeable(f, { ...placement, each: o }),
  resumable: () => placeable(f, { ...placement, resumable: true }),
});
export type Traits = Readonly<Record<string, Placed>>;

// ── The state tree.
export type FlowState<Sub = unknown, Tr extends Traits = Traits> = { readonly "~flowState": true; readonly subject: Sub; readonly traits: Tr; readonly name?: string };
// `Flow.state(children | Sub | nothing, { traits })`. `name` is a seam, not public API (api-changes): a subroutine's instance named other than its state.
export function state<const L extends StateList, const Tr extends Traits = {}>(children: L, o?: { readonly traits?: Tr }): FlowState<L, Tr>;
export function state<S extends Placed, const Tr extends Traits = {}>(sub: S, o?: { readonly traits?: Tr; readonly name?: string }): FlowState<S, Tr>;
export function state<const Tr extends Traits = {}>(o: { readonly traits?: Tr }): FlowState<undefined, Tr>;
export function state(a: unknown, o?: { readonly traits?: Traits; readonly name?: string }): FlowState {
  const opts = Array.isArray(a) || isPlaced(a) ? o : (a as { traits?: Traits });
  return { "~flowState": true, subject: Array.isArray(a) || isPlaced(a) ? a : undefined, traits: opts?.traits ?? {}, ...(o?.name ? { name: o.name } : {}) };
}
export type StateEntry = string | { readonly [k: string]: StateList | Placed | FlowState };
export type StateList = readonly StateEntry[];
const isPlaced = (x: unknown): x is Placed => typeof x === "object" && x !== null && "compiled" in x && "placement" in x;
const isFlowState = (x: unknown): x is FlowState => typeof x === "object" && x !== null && "~flowState" in x;

export type StateTok = { readonly node: string; readonly history?: true };
type Tok = StateTok & { readonly history: StateTok };
type ChildOf<V> = V extends StateList ? StatesOf<V> : V extends FlowState<infer L> ? (L extends StateList ? StatesOf<L> : {}) : {};
type EntryStates<X> = X extends string ? { readonly [K in X]: Tok } : { readonly [K in keyof X & string]: Tok & ChildOf<X[K]> };
export type StatesOf<L extends StateList> = L extends readonly [] ? {} : UnionToIntersection<EntryStates<L[number]>>;
// Every fragment placed in the tree, by instance name, for `E.<instance>.<Event>` raises: traits on `Flow.state`, and subroutines by their state.
type TraitsOfEntry<X> = X extends string
  ? {}
  : UnionToIntersection<{ [K in keyof X & string]: X[K] extends FlowState<infer Sub, infer Tr> ? Tr & (Sub extends Placed ? { readonly [N in K]: Sub } : Sub extends StateList ? TraitsOf<Sub> : {}) : X[K] extends Placed ? { readonly [N in K]: X[K] } : X[K] extends StateList ? TraitsOf<X[K]> : {} }[keyof X & string]>;
export type TraitsOf<L extends StateList> = L extends readonly [] ? {} : UnionToIntersection<TraitsOfEntry<L[number]>>;

// The parsed tree: each node's children, the traits placed on it, its subroutine.
export type TreeNode = { readonly id: string; readonly children: readonly TreeNode[]; readonly traits: Traits; readonly sub?: Placed; readonly subName?: string };
export const parseStates = (l: StateList | undefined, rootTraits: Traits = {}): TreeNode => {
  const seen = new Set<string>();
  const walk = (entries: StateList): TreeNode[] =>
    entries.flatMap((e) => {
      if (typeof e === "string") return [leaf(e, [], {})];
      return Object.entries(e).map(([id, v]) => {
        if (Array.isArray(v)) return leaf(id, walk(v as StateList), {});
        if (isFlowState(v)) {
          const s = v.subject;
          if (Array.isArray(s)) return leaf(id, walk(s as StateList), v.traits);
          if (isPlaced(s)) return leaf(id, subStates(s), v.traits, s, v.name);
          return leaf(id, [], v.traits);
        }
        if (isPlaced(v)) return leaf(id, subStates(v), {}, v);
        throw new Error(`BadState: ${id} is neither a list, a fragment nor Flow.state(...)`);
      });
    });
  const leaf = (id: string, children: TreeNode[], traits: Traits, sub?: Placed, subName?: string): TreeNode => {
    if (seen.has(id)) throw new Error(`DuplicateState: ${id}`);
    seen.add(id);
    return { id, children, traits, ...(sub ? { sub } : {}), ...(subName ? { subName } : {}) };
  };
  return { id: "root", children: walk(l ?? []), traits: rootTraits };
};
// A subroutine's own states live in its fragment, not the host's tree (2.1: "under its state", in the fragment's table).
const subStates = (_s: Placed): TreeNode[] => [];
export const statesOf = <L extends StateList>(t: TreeNode): StatesOf<L> => {
  const tok = (n: TreeNode): unknown => ({ node: n.id, history: { node: n.id, history: true }, ...Object.fromEntries(n.children.map((c) => [c.id, tok(c)])) });
  return Object.fromEntries(t.children.map((c) => [c.id, tok(c)])) as StatesOf<L>;
};
export const allNodes = (t: TreeNode): TreeNode[] => [t, ...t.children.flatMap(allNodes)];

// ── Raises into a placed child: `E.<child>.<Event>`, with `.key(f)` for one copy of an `.each`, `.from(f)` for its payload (2.2, rule 9).
type RaiseTok = { readonly to: string; readonly event: string; readonly keyFn?: unknown; readonly fromFn?: unknown };
export type RaiseBuilder = RaiseTok & {
  readonly from: (f: (a: In<never, never>) => unknown) => RaiseBuilder;
  readonly key: (f: (a: In<never, never>) => string) => RaiseBuilder;
};
const raiseTok = (r: RaiseTok): RaiseBuilder => ({ ...r, from: (f) => raiseTok({ ...r, fromFn: f }), key: (f) => raiseTok({ ...r, keyFn: f }) });
// A host raises any event its child takes: its `hostEvents` (only the host may) and its `events` (anyone may).
export type PlaceToksOf<P> = { readonly [K in keyof P]: P[K] extends FragmentValue ? { readonly [H in keyof P[K]["hostEvents"] | keyof P[K]["events"]]: RaiseBuilder } : never };
export const placeToksOf = (t: TreeNode) =>
  Object.fromEntries(
    allNodes(t).flatMap((n) => [
      ...Object.entries(n.traits).map(([name, p]) => [name, Object.fromEntries(Object.keys({ ...p.events, ...p.hostEvents }).map((e) => [e, raiseTok({ to: name, event: e })]))] as const),
      ...(n.sub ? [[n.subName ?? n.id, Object.fromEntries(Object.keys({ ...n.sub.events, ...n.sub.hostEvents }).map((e) => [e, raiseTok({ to: n.subName ?? n.id, event: e })]))] as const] : []),
    ]),
  );

// ── Alternatives. Each is typed by its event; `self` is the default target.
type PortTok = { readonly port: string };
type GuardFn<M, Ev> = (g: In<M, Ev>) => true | Denial;
type Guard<M, Ev> = StateTok | OpGuard<Ev> | PortTok | GuardFn<M, Ev>;
export type NotifyTok<M, Ev> = { readonly name: string; readonly f?: (a: In<M, Ev>) => unknown };
export type ExitTok<M, Ev> = { readonly exit: NotifyTok<M, Ev> };
export type AltSpec<M, Ev> = {
  readonly index?: number; // SEAM (round 11): parity with the pinned, flattened hand Pay's Slot paths under `--swap`. Retire with the pinned Pay
  // 2.2: a state, "self", or an exit of the subroutine this body belongs to (`target: exits.Done`, `exits.Done.from(f)`), F6 retired.
  readonly target?: StateTok | "self" | ExitTok<M, Ev>;
  readonly guard?: Guard<M, Ev> | ReadonlyArray<Guard<M, Ev>>;
  readonly updateMemory?: (u: In<M, Ev>) => Partial<M>;
  readonly actions?: ReadonlyArray<Act<Ev>>;
  readonly raise?: readonly RaiseTok[];
  readonly notify?: readonly NotifyTok<M, Ev>[];
  // SEAM (D203): NOT public API. A head insertion of the machine's own event, which the design leaves to the runtime (rule 54). Counted apart.
  readonly labFollowUps?: ReadonlyArray<(a: In<M, Ev>) => { readonly tag: string; readonly payload: unknown }>;
};
type OneAlt<M, Ev> = AltSpec<M, Ev> | StateTok | ExitTok<M, Ev>;
export type Handler<M, Ev> = OneAlt<M, Ev> | ReadonlyArray<OneAlt<M, Ev>>;
export type On<M, All> = { readonly [K in keyof All]?: Handler<M, All[K]> };
export type SchedSpec<Tag extends string> = {
  readonly schedule: Duration.Input | ((a: In<never, never>) => number);
  readonly send: { readonly tag: Tag };
  readonly armOn?: ReadonlyArray<string>;
  readonly disarmOn?: ReadonlyArray<string>; // rule 23
};
// A filling of a placed fragment (2.2's port table), at the node where it is placed.
export type Filling<M> = {
  readonly input?: (a: In<M, unknown>) => unknown;
  readonly resetOn?: (a: In<M, unknown>) => unknown; // rule 6
  readonly guards?: Readonly<Record<string, GuardFn<M, unknown>>>;
  readonly callbacks?: Readonly<Record<string, Handler<M, AnyEvent>>>;
  readonly exits?: Readonly<Record<string, Handler<M, AnyEvent>>>;
};
// SEAM (D208): 2.7.3's `activities`, by the stream's name, until the sessions module has handles (`O.x.subscribe(select)`).
export type Activities<M> = ReadonlyArray<{ readonly op: string; readonly input: (a: In<M, unknown>) => unknown; readonly when?: (a: In<M, unknown>) => boolean; readonly each?: true }>;
// A state's body, nested as the states are (2.3's example: `TWO_FACTOR: { states: { ENTERING: ... } }`).
export type StateBody<M, All> = Filling<M> & {
  readonly default?: StateTok;
  readonly on?: On<M, All>;
  readonly schedules?: Readonly<Record<string, SchedSpec<string>>>;
  readonly activities?: Activities<M>;
  readonly traits?: Readonly<Record<string, Filling<M>>>;
  readonly states?: Readonly<Record<string, StateBody<M, All>>>;
};
export type BodyShape<M, All> = {
  readonly on?: On<M, All>;
  readonly activities?: Activities<M>;
  readonly schedules?: Readonly<Record<string, SchedSpec<string>>>;
  readonly traits?: Readonly<Record<string, Filling<M>>>;
  readonly states?: Readonly<Record<string, StateBody<M, All>>>;
};

const isTok = (g: unknown): g is StateTok => typeof g === "object" && g !== null && "node" in g;
const isOpGuard = (g: unknown): g is OpGuard => (typeof g === "object" || typeof g === "function") && g !== null && "opGuard" in g; // `O.x.idle` is both
const isPort = (g: unknown): g is PortTok => typeof g === "object" && g !== null && "port" in g;
const isExit = (x: unknown): x is ExitTok<unknown, unknown> => typeof x === "object" && x !== null && "exit" in x && (x as { exit?: unknown }).exit !== undefined;
const exitOf = (definition: string, path: string, e: ExitTok<unknown, unknown>) => ({
  name: e.exit.name,
  ...(e.exit.f ? { from: slotOf<(a: { memory: unknown; event: unknown }) => unknown>(definition, `${path}.exit`, e.exit.f) } : {}),
});

const compileAlt = <M, Ev>(definition: string, path: string, oneAlt: OneAlt<M, Ev>): Alternative => {
  const at: At = { definition, path };
  if (isExit(oneAlt)) return { target: "self", at, tokens: [], guards: [], members: [], exit: exitOf(definition, path, oneAlt) };
  if ("node" in oneAlt) {
    const s = oneAlt as StateTok; // a bare state token carries `.history` (the token for `S.X.history`), so "is this the history token" is `=== true`
    return { target: s.node, at, tokens: [], guards: [], members: [], ...(s.history === true ? { history: true as const } : {}) };
  }
  const one = oneAlt as AltSpec<M, Ev>;
  const toks: TokenGuard[] = [];
  const closures: Array<Slot<(g: { memory: unknown; event: unknown }) => true | Denial>> = [];
  list(one.guard).forEach((g, position) => {
    if (isTok(g)) toks.push({ node: g.node });
    else if (isPort(g)) toks.push({ port: g.port });
    else if (isOpGuard(g)) toks.push({ ...g.opGuard, ...(g.keyFn ? { key: slotOf(definition, `${path}.guard[${position}]`, g.keyFn) } : {}) } as TokenGuard);
    else closures.push(slotOf(definition, `${path}.guard[${position}]`, g)); // by its place in the array, as a token's key is (D206)
  });
  const members: Member[] = (one.actions ?? []).map((a, i): Member => {
    const p = `${path}.actions[${i}]`;
    if (a.member === "commit" || a.member === "lookup") return { op: a.op, verb: a.member, input: slotOf(definition, p, a.f) };
    if (a.member === "module") return { op: a.op, verb: "module", module: a.module, name: a.name, ...(a.f ? { value: slotOf(definition, p, a.f) } : {}) };
    const keyFn = "keyFn" in a ? a.keyFn : undefined;
    return { op: a.op, verb: a.member, ...(keyFn ? { key: slotOf(definition, p, keyFn) } : {}), ...("previous" in a && a.previous !== undefined ? { previous: a.previous } : {}) };
  });
  const raises = (one.raise ?? []).map(
    (r, i): Raise => ({
      to: r.to,
      event: r.event,
      ...(r.keyFn ? { key: slotOf(definition, `${path}.raise[${i}].key`, r.keyFn) } : {}),
      ...(r.fromFn ? { from: slotOf(definition, `${path}.raise[${i}]`, r.fromFn) } : {}),
    }),
  );
  const t = one.target;
  const toState = t === undefined || t === "self" || isExit(t) ? undefined : (t as StateTok);
  return {
    target: toState ? toState.node : "self",
    ...(toState?.history === true ? { history: true as const } : {}),
    at,
    tokens: toks,
    guards: closures,
    ...(one.updateMemory ? { patch: slotOf(definition, `${path}.updateMemory`, one.updateMemory) } : {}),
    members,
    ...(one.labFollowUps?.length ? { followUps: one.labFollowUps.map((f, i) => slotOf<(a: unknown) => never>(definition, `${path}.followUp[${i}]`, f)) } : {}),
    ...(raises.length ? { raises } : {}),
    ...(t !== undefined && isExit(t) ? { exit: exitOf(definition, path, t as ExitTok<unknown, unknown>) } : {}),
    ...(one.notify?.length
      ? {
          notify: one.notify.map((n, i) => ({
            name: n.name,
            ...(n.f ? { from: slotOf<(a: { memory: unknown; event: unknown }) => unknown>(definition, one.notify!.length > 1 ? `${path}.notify[${i}]` : `${path}.notify`, n.f) } : {}),
          })),
        }
      : {}),
  };
};
const compileHandler = <M, Ev>(definition: string, base: string, h: Handler<M, Ev>) =>
  (list(h) as ReadonlyArray<OneAlt<M, Ev>>).map((one, i) => compileAlt(definition, `${base}[${"index" in one && one.index !== undefined ? one.index : i}]`, one));
const compileOn = <M, All>(definition: string, base: string, on: On<M, All> | undefined) =>
  Object.fromEntries(Object.entries(on ?? {}).map(([k, h]) => [k, compileHandler(definition, base ? `${base}.on.${k}` : `on.${k}`, h as Handler<M, unknown>)]));
const compileSchedules = (definition: string, base: string, sch: BodyShape<unknown, unknown>["schedules"]): readonly ScheduleSpec[] =>
  Object.entries(sch ?? {}).map(([id, s]) => ({
    id,
    send: s.send.tag,
    schedule: typeof s.schedule === "function" ? slotOf(definition, `${base}.schedules.${id}`, s.schedule) : { ms: Duration.toMillis(Duration.fromInputUnsafe(s.schedule)) },
    armOn: s.armOn ?? ["entry"],
    disarmOn: s.disarmOn ?? [],
  }));
const compileFilling = (definition: string, base: string, name: string, p: Placed, f: Filling<unknown>): Placement => ({
  name,
  fragment: p.id,
  ...(f.input ? { input: slotOf(definition, `${base}.input`, f.input) } : {}),
  ...(f.resetOn ? { resetOn: slotOf(definition, `${base}.resetOn`, f.resetOn) } : {}),
  ...(p.placement.each ? { each: p.placement.each } : {}),
  ...(p.placement.resumable ? { resumable: true as const } : {}),
  ...(f.guards ? { guards: Object.fromEntries(Object.entries(f.guards).map(([k, g]) => [k, slotOf<(g: { memory: unknown; event: unknown }) => true | Denial>(definition, `${base}.guards.${k}`, g)])) } : {}),
  ...(f.callbacks ? { callbacks: Object.fromEntries(Object.entries(f.callbacks).map(([k, h]) => [k, compileHandler(definition, `${base}.callbacks.${k}`, h)])) } : {}),
  ...(f.exits ? { exits: Object.fromEntries(Object.entries(f.exits).map(([k, h]) => [k, compileHandler(definition, `${base}.exits.${k}`, h)])) } : {}),
});
const compileActivities = (definition: string, base: string, acts: Activities<unknown> | undefined) =>
  acts?.length
    ? {
        activities: acts.map((x, i) => ({
          op: x.op,
          input: slotOf<(a: unknown) => unknown>(definition, `${base}activities[${i}]`, x.input),
          ...(x.when ? { when: slotOf<(a: unknown) => boolean>(definition, `${base}activities[${i}].when`, x.when) } : {}),
          ...(x.each ? { each: true as const } : {}),
        })),
      }
    : {};
// The tree walked once with the body: a node per state, its parent, its default child, its placements with their fillings. Every placed fragment is collected.
export const compileNodes = <M, All>(definition: string, tree: TreeNode, body: BodyShape<M, All>, placed: FragmentValue[]): Record<string, Node> => {
  const nodes: Record<string, Node> = {};
  const placementsAt = (base: string, n: TreeNode, fills: Readonly<Record<string, Filling<unknown>>> | undefined): Placement[] => {
    for (const k of Object.keys(fills ?? {})) if (!(k in n.traits)) throw new Error(`UnknownTrait: ${definition} fills ${k} at ${n.id}, which its definition does not place there`);
    return Object.entries(n.traits).map(([name, p]) => {
      placed.push(p);
      return compileFilling(definition, `${base}traits.${name}`, name, p, fills?.[name] ?? {});
    });
  };
  const rootPlacements = placementsAt("", tree, body.traits as never);
  nodes["root"] = {
    id: "root",
    on: compileOn(definition, "", body.on),
    schedules: compileSchedules(definition, "", body.schedules as never),
    ...compileActivities(definition, "", body.activities as never),
    ...(rootPlacements.length ? { placements: rootPlacements } : {}),
  };
  const walk = (parent: TreeNode, prefix: string, bodies: Readonly<Record<string, StateBody<unknown, unknown>>> | undefined) => {
    // TypeScript cannot refuse this through the callback's return (type-tests.ts), so compiling does.
    for (const k of Object.keys(bodies ?? {}))
      if (!parent.children.some((c) => c.id === k)) throw new Error(`UnknownState: ${definition} has a body for ${k} under ${parent.id}, which its states do not list there`);
    for (const n of parent.children) {
      const path = `${prefix}states.${n.id}`;
      const b = (bodies?.[n.id] ?? {}) as StateBody<unknown, unknown>;
      const placements = placementsAt(`${path}.`, n, b.traits);
      if (n.sub) placed.push(n.sub);
      const sub = n.sub && compileFilling(definition, path, n.subName ?? n.id, n.sub, b);
      nodes[n.id] = {
        id: n.id,
        parent: parent.id,
        on: compileOn(definition, path, b.on as never),
        schedules: compileSchedules(definition, path, b.schedules),
        ...compileActivities(definition, `${path}.`, b.activities),
        ...(b.default ? { default: b.default.node } : {}),
        ...(placements.length ? { placements } : {}),
        ...(sub ? { subroutine: sub } : {}),
      };
      walk(n, `${path}.`, b.states);
    }
  };
  walk(tree, "", body.states as never);
  return nodes;
};
// Every fragment a definition places, and every one they place, once each.
export const collect = (roots: readonly FragmentValue[]) => {
  const out = new Map<string, FragmentValue>();
  const visit = (f: FragmentValue) => {
    const had = out.get(f.id);
    if (had) {
      if (had.compiled !== f.compiled) throw new Error(`DuplicateFragment: two fragments are named ${f.id}`);
      return;
    }
    out.set(f.id, f);
    f.places.forEach(visit);
  };
  roots.forEach(visit);
  return [...out.values()];
};
