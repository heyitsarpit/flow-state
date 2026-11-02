// D91: the thin typed path. A typed definition compiles to `Compiled`, and the runtime cannot tell. Not a front end: enough for real Pay and the real ThreeDS and
// Countdown fragments. No `any` here. All types are erased at exactly one function, `erased`. Shapes follow machine-design 2.7; where this differs, RESULTS says so.
import { Duration, Effect, Schema, type Context } from "effect";
import {
  deny,
  OutcomeFailure,
  OutcomeUnknown,
  type Alternative,
  type At,
  type CommitCtx,
  type Compiled,
  type Denial,
  type Fragment,
  type Mapped,
  type Member,
  type Node,
  type Op,
  type Placement,
  type ScheduleSpec,
  type Slot,
  type TokenGuard,
} from "../../conformance/fixtures/compiled.ts";

export { deny };
type Fields = Readonly<Record<string, Schema.Top>>;
type TypeOf<F extends Fields> = { readonly [K in keyof F]: F[K]["Type"] };
type Tagged = { readonly _tag: string };

// ── The one erasure. A closure's types are the author's; `Compiled` holds them as data, checked at run time by the seal (D65).
const erased = <F>(f: unknown): F => f as F;
const slotOf = <F>(definition: string, path: string, f: unknown): Slot<F> => ({
  run: erased<F>(f),
  at: { definition, path },
});

// ── Memory. `Flow.initial`, `Flow.input`, `Flow.private`, as data: rule 12's fields, read by `flow check` and by restore.
type MemorySpec<S extends Schema.Top = Schema.Top> = {
  readonly schema: S;
  readonly from: "initial" | "input";
  readonly value?: S["Type"];
  readonly private?: true;
};
export const Flow = {
  initial: <S extends Schema.Top>(schema: S, value: S["Type"]): MemorySpec<S> => ({
    schema,
    from: "initial",
    value,
  }),
  input: <S extends Schema.Top>(schema: S): MemorySpec<S> => ({ schema, from: "input" }),
  private: <S extends Schema.Top>(m: MemorySpec<S>): MemorySpec<S> => ({ ...m, private: true }),
  Exit: <F extends Fields>(fields: F) => ({ fields }),
  Callback: <F extends Fields>(fields: F) => ({ fields }),
};
type MemoryFields = Readonly<Record<string, MemorySpec>>;
type MemoryOf<M extends MemoryFields> = { readonly [K in keyof M]: M[K]["schema"]["Type"] };
const initialOf = (definition: string, m: MemoryFields) =>
  slotOf<(input: unknown) => object>(definition, "memory.initial", (input: unknown) =>
    Object.fromEntries(
      Object.entries(m).map(([k, s]) => [
        k,
        s.from === "input" ? (input as Record<string, unknown>)[k] : s.value,
      ]),
    ),
  );
// D82's stand-in becomes real: a stored record decodes by the memory's Schema. A field a release added takes its initial value.
const restoreOf = (definition: string, m: MemoryFields) =>
  slotOf<(stored: unknown) => object>(definition, "memory.restore", (stored: unknown) => {
    const s = stored as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(m).map(([k, f]) => [
        k,
        k in s
          ? Schema.decodeUnknownSync(f.schema as unknown as Schema.Codec<unknown>)(s[k])
          : f.value,
      ]),
    );
  });

// ── Contracts: a key is a field list (rule 39, R10), so it is data. The commit's `R` is what it needs; `provide` closes it.
type Reason<E> =
  E extends OutcomeUnknown<unknown> ? never : E extends OutcomeFailure<infer R> ? R : E;
type TagsOf<E> = Reason<E> extends infer X ? (X extends Tagged ? X["_tag"] : never) : never;
type OfTag<E, T> = Reason<E> extends infer X ? (X extends { readonly _tag: T } ? X : never) : never;
type Token<Tag extends string, P> = { readonly tag: Tag; readonly _p?: (p: P) => void };
type EventToken<Tag extends string, P> = Token<Tag, P> & {
  readonly from: <V>(f: (v: V, c: EndCtx) => P) => From<V, Tag>;
};
type EndCtx = { readonly key: unknown; readonly input: unknown; readonly reason?: string };
type From<V, Tag extends string = string> = {
  readonly tag: Tag;
  readonly fromFn: (v: V, c: EndCtx) => unknown;
};
type NoPayload = Readonly<Record<string, never>>;
// An ending mapped with no `.from` needs an event that takes nothing.
type Target<V> = From<V> | Token<string, NoPayload>;
type Outcomes<O, E> = {
  readonly success?: Target<O>;
  readonly failure: { readonly [T in TagsOf<E>]?: Target<OfTag<E, T>> } & {
    readonly NotSent?: Target<{ readonly why: string }>;
    readonly Defect?: Target<unknown>;
    readonly Interrupted?: Target<unknown>;
  };
  readonly unknown?: Target<unknown>;
};
type ContractSpec<I extends Fields, K extends keyof I, A, E, R> = {
  readonly id: string;
  readonly input: I;
  readonly key: readonly K[];
  readonly timeoutMs?: number;
  readonly commit: (input: TypeOf<I>, c: CommitCtx) => Effect.Effect<A, E, R>;
};
export type Contract<I extends Fields, K extends keyof I, A, E, R> = ContractSpec<I, K, A, E, R> & {
  readonly kind: "write" | "read";
  readonly concurrency: Op["concurrency"];
  readonly outcomes: (o: Outcomes<A, E>) => Bound<I, K, A, E, R>;
};
type Bound<I extends Fields, K extends keyof I, A, E, R> = {
  readonly contract: Contract<I, K, A, E, R>;
  readonly mapped: Outcomes<A, E>;
};
const contract = <I extends Fields, K extends keyof I, A, E, R>(
  kind: "write" | "read",
  concurrency: Op["concurrency"],
  s: ContractSpec<I, K, A, E, R>,
): Contract<I, K, A, E, R> => {
  const self: Contract<I, K, A, E, R> = {
    ...s,
    kind,
    concurrency,
    outcomes: (mapped) => ({ contract: self, mapped }),
  };
  return self;
};
export const transaction = <I extends Fields, K extends keyof I, A, E, R>(
  s: ContractSpec<I, K, A, E, R> & { readonly concurrency: Op["concurrency"] },
) => contract("write", s.concurrency, s);
export const resource = <I extends Fields, K extends keyof I, A, E, R>(
  s: ContractSpec<I, K, A, E, R>,
) => contract("read", "reject", s); // D23: unused for a read

// ── Tokens.
type EventsOf<Ev extends Readonly<Record<string, Fields>>> = {
  readonly [K in keyof Ev & string]: EventToken<K, TypeOf<Ev[K]>>;
};
const tokens = <Ev extends Readonly<Record<string, Fields>>>(ev: Ev): EventsOf<Ev> =>
  Object.fromEntries(
    Object.keys(ev).map((tag) => [
      tag,
      { tag, from: (fromFn: unknown) => ({ tag, fromFn }) },
    ]),
  ) as EventsOf<Ev>;
type StateTree = { readonly [k: string]: StateTree };
type StateTok = { readonly node: string; readonly history?: true };
type StatesOf<T extends StateTree> = {
  readonly [K in keyof T & string]: StateTok & {
    readonly history: StateTok;
  } & StatesOf<T[K]>;
};
const statesOf = <T extends StateTree>(t: T): StatesOf<T> =>
  Object.fromEntries(
    Object.entries(t).map(([k, kids]) => [
      k,
      { node: k, history: { node: k, history: true }, ...statesOf(kids) },
    ]),
  ) as StatesOf<T>;

type In<M, Ev> = { readonly memory: M; readonly event: Ev };
type GuardFn<M, Ev> = (g: In<M, Ev>) => true | Denial;
type OpGuard = { readonly opGuard: TokenGuard; readonly keyFn?: unknown };
type Guard<M, Ev> = StateTok | OpGuard | GuardFn<M, Ev>;
type Act =
  | { readonly member: "commit" | "lookup"; readonly op: string; readonly f: unknown }
  | { readonly member: "retry" | "cancel"; readonly op: string; readonly keyFn?: unknown };
// What `O.x` offers, narrowed by kind as the design's handles are. `M`: this machine's memory, so a selector is typed by the state it reads.
type WriteHandle<I extends Fields, K extends keyof I, M> = {
  readonly commit: <Ev>(f: (a: In<M, Ev>) => TypeOf<I>) => Act;
  readonly idle: <Ev>(key: (a: In<M, Ev>) => { readonly [F in K]: TypeOf<I>[F] }) => OpGuard;
  readonly retryable: <Ev>(o: {
    readonly times: number;
    readonly key?: (a: In<M, Ev>) => { readonly [F in K]: TypeOf<I>[F] };
  }) => OpGuard;
  readonly retry: Act & {
    readonly key: <Ev>(key: (a: In<M, Ev>) => { readonly [F in K]: TypeOf<I>[F] }) => Act;
  };
  readonly cancel: Act & {
    readonly key: <Ev>(key: (a: In<M, Ev>) => { readonly [F in K]: TypeOf<I>[F] }) => Act;
  };
};
type ReadHandle<I extends Fields, M> = {
  readonly lookup: <Ev>(f: (a: In<M, Ev>) => TypeOf<I>) => Act;
  readonly cancel: Act;
};
// `never` for a bound's unused slots, so each one's own types stay out of the handle's.
type AnyBound = {
  readonly contract: {
    readonly id: string;
    readonly kind: "write" | "read";
    readonly concurrency: Op["concurrency"];
    readonly input: Fields;
    readonly key: readonly PropertyKey[];
    readonly timeoutMs?: number;
    readonly commit: unknown;
  };
  readonly mapped: {
    readonly success?: unknown;
    readonly failure: unknown;
    readonly unknown?: unknown;
  };
};
type HandleOf<B, M> =
  B extends Bound<infer I, infer K, infer _A, infer _E, infer _R>
    ? WriteHandle<I, K, M> & ReadHandle<I, M>
    : never;
type RequirementsOf<O> = {
  [K in keyof O]: O[K] extends Bound<Fields, never, infer _A, infer _E, infer R> ? R : never;
}[keyof O];
const handles = <O extends Readonly<Record<string, AnyBound>>, M>(ops: O) =>
  Object.fromEntries(
    Object.keys(ops).map((op) => [
      op,
      {
        commit: (f: unknown): Act => ({ member: "commit", op, f }),
        lookup: (f: unknown): Act => ({ member: "lookup", op, f }),
        idle: (keyFn: unknown): OpGuard => ({ opGuard: { op, verb: "idle" }, keyFn }),
        retryable: (o: { times: number; key?: unknown }): OpGuard => ({
          opGuard: { op, verb: "retryable", times: o.times },
          ...(o.key ? { keyFn: o.key } : {}),
        }),
        retry: {
          member: "retry",
          op,
          key: (keyFn: unknown): Act => ({ member: "retry", op, keyFn }),
        },
        cancel: {
          member: "cancel",
          op,
          key: (keyFn: unknown): Act => ({ member: "cancel", op, keyFn }),
        },
      },
    ]),
  ) as { readonly [K in keyof O]: HandleOf<O[K], M> };

// ── A body. Each alternative is typed by its event; `self` is the default.
type AltSpec<M, Ev> = {
  readonly index?: number; // parity with the pinned, flattened Pay only: its real index, where it dropped the alternatives before this
  readonly target?: StateTok | "self";
  readonly guard?: Guard<M, Ev> | ReadonlyArray<Guard<M, Ev>>;
  readonly updateMemory?: (u: In<M, Ev>) => Partial<M>;
  readonly actions?: readonly Act[];
  readonly raise?: readonly RaiseTok[];
  readonly notify?: readonly NotifyTok<M, Ev>[];
};
type RaiseTok = { readonly to: string; readonly event: string };
type NotifyTok<M, Ev> = { readonly name: string; readonly f?: (a: In<M, Ev>) => unknown };
type ExitTok<M, Ev> = { readonly exit: NotifyTok<M, Ev> };
type OneAlt<M, Ev> = AltSpec<M, Ev> | StateTok | ExitTok<M, Ev>;
type Handler<M, Ev> = OneAlt<M, Ev> | ReadonlyArray<OneAlt<M, Ev>>;
type On<M, All> = { readonly [K in keyof All]?: Handler<M, All[K]> };
type SchedSpec<Tag extends string> = {
  readonly schedule: Duration.Input | ((a: In<never, never>) => number);
  readonly send: { readonly tag: Tag };
  readonly armOn?: ReadonlyArray<string>;
};
type StateBody<M, All> = {
  readonly default?: StateTok;
  readonly on?: On<M, All>;
  readonly schedules?: Readonly<Record<string, SchedSpec<string>>>;
  readonly traits?: Readonly<Record<string, Placed<M, All>>>;
  readonly into?: Placed<M, All> & { readonly fragment: string };
};
type Placed<M, All> = {
  readonly fragment?: string;
  readonly resumable?: true;
  readonly input?: (a: In<M, unknown>) => unknown;
  readonly callbacks?: Readonly<Record<string, Handler<M, unknown>>>;
  readonly exits?: Readonly<Record<string, Handler<M, unknown>>>;
  readonly _all?: All;
};

const list = <X>(x: X | ReadonlyArray<X> | undefined): readonly X[] =>
  x === undefined ? [] : Array.isArray(x) ? (x as readonly X[]) : [x as X];
const isTok = (g: unknown): g is StateTok =>
  typeof g === "object" && g !== null && "node" in g;
const isOpGuard = (g: unknown): g is OpGuard =>
  typeof g === "object" && g !== null && "opGuard" in g;

const compileAlt = <M, Ev>(
  definition: string,
  path: string,
  one: OneAlt<M, Ev>,
): Alternative => {
  const at: At = { definition, path };
  if ("exit" in one) {
    const { name, f } = one.exit;
    return {
      target: "self",
      at,
      tokens: [],
      guards: [],
      members: [],
      exit: { name, ...(f ? { from: slotOf(definition, `${path}.exit`, f) } : {}) },
    };
  }
  if ("node" in one) {
    return {
      target: one.node,
      at,
      tokens: [],
      guards: [],
      members: [],
      ...(one.history ? { history: true as const } : {}),
    };
  }
  const guards = list(one.guard);
  const toks: TokenGuard[] = [];
  const closures: Array<Slot<(g: { memory: unknown; event: unknown }) => true | Denial>> = [];
  guards.forEach((g, position) => {
    if (isTok(g)) toks.push({ node: g.node });
    else if (isOpGuard(g))
      toks.push({
        ...g.opGuard,
        ...(g.keyFn ? { key: slotOf(definition, `${path}.guard[${position}]`, g.keyFn) } : {}),
      } as TokenGuard);
    else closures.push(slotOf(definition, `${path}.guard[${closures.length}]`, g));
  });
  const members: Member[] = (one.actions ?? []).map((a, i): Member => {
    const p = `${path}.actions[${i}]`;
    if (a.member === "commit" || a.member === "lookup")
      return { op: a.op, verb: a.member, input: slotOf(definition, p, a.f) };
    const keyFn = "keyFn" in a ? a.keyFn : undefined;
    return { op: a.op, verb: a.member, ...(keyFn ? { key: slotOf(definition, p, keyFn) } : {}) };
  });
  return {
    target: one.target === undefined || one.target === "self" ? "self" : one.target.node,
    at,
    tokens: toks,
    guards: closures,
    ...(one.updateMemory ? { patch: slotOf(definition, `${path}.updateMemory`, one.updateMemory) } : {}),
    members,
    ...(one.raise?.length ? { raises: one.raise.map((r) => ({ to: r.to, event: r.event })) } : {}),
    ...(one.notify?.length
      ? {
          notify: one.notify.map((n) => ({
            name: n.name,
            ...(n.f ? { from: slotOf<(a: { memory: unknown; event: unknown }) => unknown>(definition, `${path}.notify`, n.f) } : {}),
          })),
        }
      : {}),
  };
};
const compileHandler = <M, Ev>(definition: string, base: string, h: Handler<M, Ev>) =>
  (list(h) as ReadonlyArray<OneAlt<M, Ev>>).map((one, i) =>
    compileAlt(
      definition,
      `${base}[${"index" in one && one.index !== undefined ? one.index : i}]`,
      one,
    ),
  );
const compileOn = <M, All>(definition: string, base: string, on: On<M, All> | undefined) =>
  Object.fromEntries(
    Object.entries(on ?? {}).map(([k, h]) => [
      k,
      compileHandler(definition, base ? `${base}.on.${k}` : `on.${k}`, h as Handler<M, unknown>),
    ]),
  );
const compileSchedules = (
  definition: string,
  base: string,
  sch: StateBody<unknown, unknown>["schedules"],
): readonly ScheduleSpec[] =>
  Object.entries(sch ?? {}).map(([id, s]) => ({
    id,
    send: s.send.tag,
    schedule:
      typeof s.schedule === "function"
        ? slotOf(definition, `${base}.schedules.${id}`, s.schedule)
        : { ms: Duration.toMillis(Duration.fromInputUnsafe(s.schedule)) },
    armOn: s.armOn ?? ["entry"],
    disarmOn: [],
  }));
const compilePlaced = <M, All>(
  definition: string,
  base: string,
  name: string,
  fragmentId: string,
  p: Placed<M, All>,
): Placement => ({
  name,
  fragment: fragmentId,
  ...(p.input ? { input: slotOf(definition, `${base}.input`, p.input) } : {}),
  ...(p.resumable ? { resumable: true as const } : {}),
  ...(p.callbacks
    ? {
        callbacks: Object.fromEntries(
          Object.entries(p.callbacks).map(([k, h]) => [
            k,
            compileHandler(definition, `${base}.callbacks.${k}`, h),
          ]),
        ),
      }
    : {}),
  ...(p.exits
    ? {
        exits: Object.fromEntries(
          Object.entries(p.exits).map(([k, h]) => [
            k,
            compileHandler(definition, `${base}.exits.${k}`, h),
          ]),
        ),
      }
    : {}),
});
// The state tree walked once: a node per state, its parent, its default child, its path in the real machine.
const compileNodes = <M, All>(
  definition: string,
  tree: StateTree,
  fragmentIds: Readonly<Record<string, string>>,
  body: {
    readonly on?: On<M, All>;
    readonly schedules?: StateBody<M, All>["schedules"];
    readonly traits?: StateBody<M, All>["traits"];
    readonly states?: Readonly<Record<string, StateBody<M, All>>>;
  },
): Record<string, Node> => {
  const nodes: Record<string, Node> = {};
  // TypeScript cannot refuse this through the callback's return (type-tests.ts), so compiling does.
  const names = (t: StateTree): string[] => Object.entries(t).flatMap(([k, v]) => [k, ...names(v)]);
  const known = new Set(names(tree));
  for (const k of Object.keys(body.states ?? {}))
    if (!known.has(k)) throw new Error(`UnknownState: ${definition} has a body for ${k}, which its states do not list`);
  const placedAt = (base: string, b: StateBody<M, All>) =>
    Object.entries(b.traits ?? {}).map(([name, p]) =>
      compilePlaced(definition, `${base}traits.${name}`, name, p.fragment ?? fragmentIds[name]!, p),
    );
  const root = placedAt("", body as StateBody<M, All>);
  nodes["root"] = {
    id: "root",
    on: compileOn(definition, "", body.on),
    schedules: compileSchedules(definition, "", body.schedules as never),
    ...(root.length ? { placements: root } : {}),
  };
  const walk = (t: StateTree, parent: string, prefix: string) => {
    for (const [id, kids] of Object.entries(t)) {
      const path = `${prefix}states.${id}`;
      const b = (body.states?.[id] ?? {}) as StateBody<M, All>;
      const placements = placedAt(`${path}.`, b);
      const into = b.into && compilePlaced(definition, path, id, b.into.fragment, b.into);
      nodes[id] = {
        id,
        parent,
        on: compileOn(definition, path, b.on),
        schedules: compileSchedules(definition, path, b.schedules as never),
        ...(b.default ? { default: b.default.node } : {}),
        ...(placements.length ? { placements } : {}),
        ...(into ? { subroutine: into } : {}),
      };
      walk(kids, id, `${path}.`);
    }
  };
  walk(tree, "root", "");
  return nodes;
};

const compileMapped = (definition: string, op: string, name: string, t: unknown): Mapped => {
  const x = t as { readonly tag: string; readonly fromFn?: unknown };
  return {
    event: x.tag,
    ...(x.fromFn ? { from: slotOf(definition, `operations.${op}.${name}`, x.fromFn) } : {}),
  };
};
const compileOp = (definition: string, name: string, b: AnyBound): Op => {
  const c = b.contract;
  const m = b.mapped;
  const keyFields = c.key.map(String);
  return {
    id: name,
    contract: c.id,
    kind: c.kind,
    keyFields, // new on `Compiled`: rule 39's field list, as data
    key: slotOf(definition, `operations.${name}.key`, (i: Record<string, unknown>) =>
      Object.fromEntries(keyFields.map((f) => [f, i[f]])),
    ),
    concurrency: c.concurrency,
    ...(c.timeoutMs === undefined ? {} : { timeoutMs: c.timeoutMs }),
    commit: slotOf(definition, `operations.${name}.commit`, c.commit),
    outcomes: {
      ...(m.success ? { success: compileMapped(definition, name, "success", m.success) } : {}),
      failure: Object.fromEntries(
        Object.entries((m.failure ?? {}) as Readonly<Record<string, unknown>>).map(([k, v]) => [
          k,
          compileMapped(definition, name, `failure.${k}`, v),
        ]),
      ),
      ...(m.unknown ? { unknown: compileMapped(definition, name, "unknown", m.unknown) } : {}),
    },
  } as unknown as Op;
};

// ── `Compiled` with what it needs: `R`, the services its commits ask for. `provide` closes it, so the Runtime stays `never`.
export type Typed<R> = { readonly compiled: Compiled; readonly _R?: (r: R) => void };
export const provide = <R>(t: Typed<R>, services: Context.Context<R>): Compiled => ({
  ...t.compiled,
  ops: Object.fromEntries(
    Object.entries(t.compiled.ops).map(([k, op]): [string, Op] => {
      const c = op.commit as unknown as Slot<(i: unknown, x: CommitCtx) => Effect.Effect<unknown, unknown, R>>;
      return [
        k,
        {
          ...op,
          commit: {
            ...c,
            run: (i: unknown, x: CommitCtx) => Effect.provide(c.run(i, x), services),
          },
        },
      ];
    }),
  ),
});

// ── The definition, then the machine. Two calls, as the design has them, so `E` is known before the operations and `S`, `O` before the body.
export const definition = <
  T extends StateTree,
  Ev extends Readonly<Record<string, Fields>>,
  In_ extends Readonly<Record<string, Fields>>,
  M extends MemoryFields,
  O extends Readonly<Record<string, AnyBound>>,
>(d: {
  readonly id: string;
  readonly states: T;
  readonly events: Ev;
  readonly internalEvents: In_;
  readonly memory: M;
  readonly persisted?: boolean;
  readonly operations: (t: { readonly E: EventsOf<In_> }) => O;
}) => ({
  ...d,
  ops: d.operations({ E: tokens(d.internalEvents) }),
  allEvents: tokens({ ...d.events, ...d.internalEvents }),
});
type EventPayloads<Ev extends Readonly<Record<string, Fields>>> = {
  readonly [K in keyof Ev]: TypeOf<Ev[K]>;
};
export const machine = <
  T extends StateTree,
  Ev extends Readonly<Record<string, Fields>>,
  In_ extends Readonly<Record<string, Fields>>,
  M extends MemoryFields,
  O extends Readonly<Record<string, AnyBound>>,
>(
  d: ReturnType<typeof definition<T, Ev, In_, M, O>>,
  body: (t: {
    readonly S: StatesOf<T>;
    readonly E: EventsOf<Ev & In_>;
    readonly O: { readonly [K in keyof O]: HandleOf<O[K], MemoryOf<M>> };
  }) => {
    readonly default: StateTok;
    readonly on?: On<MemoryOf<M>, EventPayloads<Ev & In_>>;
    readonly states?: {
      readonly [K in keyof T]?: StateBody<MemoryOf<M>, EventPayloads<Ev & In_>>;
    };
  },
): Typed<RequirementsOf<O>> => {
  const b = body({
    S: statesOf(d.states),
    E: d.allEvents as unknown as EventsOf<Ev & In_>,
    O: handles<O, MemoryOf<M>>(d.ops),
  });
  return {
    compiled: {
      id: d.id,
      nodes: compileNodes(d.id, d.states, {}, b as never),
      root: "root",
      default: b.default.node,
      memory: { initial: initialOf(d.id, d.memory), restore: restoreOf(d.id, d.memory) },
      ops: Object.fromEntries(
        Object.entries(d.ops).map(([k, x]) => [k, compileOp(d.id, k, x)]),
      ),
      persisted: d.persisted ?? true,
      uses: [],
      events: { external: Object.keys(d.events), internal: Object.keys(d.internalEvents) },
    },
  };
};

// ── A fragment: its own ports, its body over them. The nested fragment is named in `places`, so `E.countdown.Shown` is checked.
type Ports = Readonly<Record<string, { readonly fields: Fields }>>;
type PlacedFrag = { readonly id: string; readonly hostEvents: Readonly<Record<string, Fields>> };
export const fragment = <
  T extends StateTree = {},
  Ev extends Readonly<Record<string, Fields>> = {},
  Host extends Readonly<Record<string, Fields>> = {},
  In_ extends Readonly<Record<string, Fields>> = {},
  X extends Ports = {},
  C extends Ports = {},
  M extends MemoryFields = {},
  P extends Readonly<Record<string, PlacedFrag>> = {},
>(
  d: {
    readonly id: string;
    readonly states?: T;
    readonly default?: string;
    readonly events?: Ev;
    readonly hostEvents?: Host;
    readonly internalEvents?: In_;
    readonly exits?: X;
    readonly callbacks?: C;
    readonly memory?: M;
    readonly places?: P;
  },
  body: (t: {
    readonly S: StatesOf<T>;
    readonly E: EventsOf<Ev & Host & In_> & {
      readonly [K in keyof P]: { readonly [H in keyof P[K]["hostEvents"]]: RaiseTok };
    };
    readonly exits: {
      readonly [K in keyof X]: ExitTok<MemoryOf<M>, unknown> & {
        readonly from: <V>(f: (a: In<MemoryOf<M>, V>) => TypeOf<X[K]["fields"]>) => ExitTok<MemoryOf<M>, V>;
      };
    };
    readonly callbacks: { readonly [K in keyof C]: NotifyTok<MemoryOf<M>, unknown> };
  }) => {
    readonly on?: On<MemoryOf<M>, EventPayloads<Ev & Host & In_>>;
    readonly schedules?: Readonly<Record<string, SchedSpec<string>>>;
    readonly states?: {
      readonly [K in string]?: StateBody<MemoryOf<M>, EventPayloads<Ev & Host & In_>>;
    };
  },
) => {
  const places = (d.places ?? {}) as P;
  const placeTokens = Object.fromEntries(
    Object.entries(places).map(([name, p]) => [
      name,
      Object.fromEntries(Object.keys(p.hostEvents).map((e) => [e, { to: name, event: e }])),
    ]),
  );
  const exitToks = Object.fromEntries(
    Object.keys(d.exits ?? {}).map((name) => [
      name,
      {
        exit: { name },
        from: (f: unknown) => ({ exit: { name, f } }),
      },
    ]),
  );
  const cb = Object.fromEntries(Object.keys(d.callbacks ?? {}).map((name) => [name, { name }]));
  const tree = (d.states ?? {}) as T;
  const b = body({
    S: statesOf(tree),
    E: {
      ...tokens({ ...d.events, ...d.hostEvents, ...d.internalEvents }),
      ...placeTokens,
    } as never,
    exits: exitToks as never,
    callbacks: cb as never,
  });
  const fragmentIds = Object.fromEntries(Object.entries(places).map(([k, p]) => [k, p.id]));
  const compiled: Fragment = {
    id: d.id,
    root: "root",
    default: d.default ?? "root",
    nodes: compileNodes(d.id, tree, fragmentIds, b as never),
    memory: { initial: initialOf(d.id, (d.memory ?? {}) as M) },
  };
  return {
    id: d.id,
    hostEvents: (d.hostEvents ?? {}) as Host,
    compiled,
    resumable: () => ({ resumable: true as const }),
  };
};
