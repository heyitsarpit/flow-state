// D91: the thin typed path. A typed definition compiles to `Compiled`, and the runtime cannot tell. Round 11 (D199-D206): grown until every fixture machine of the
// suite can be written in it, as far as the public API (machine-design 2.2, 2.7, 2.9) reaches: fragments with operations, guard ports, `whenAbandoned`, `.each`,
// `resetOn`, keyed raises, `disarmOn`, unknown by reason, local identity, and placed fragments collected by the machine. What has no public form is a named seam
// (`labFollowUps`), counted in RESULTS. No literal `any`. A closure's types are erased by `erased`; other casts sit where a mapped token table meets the body's types.
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
  type DomainSpec,
  type StreamSpec,
  type Member,
  type Node,
  type Op,
  type Placement,
  type Raise,
  type ScheduleSpec,
  type Slot,
  type TokenGuard,
} from "../../conformance/fixtures/compiled.ts";

export { deny };
export type Fields = Readonly<Record<string, Schema.Top>>;
type TypeOf<F extends Fields> = { readonly [K in keyof F]: F[K]["Type"] };
type Tagged = { readonly _tag: string };

// ── The one erasure. A closure's types are the author's; `Compiled` holds them as data, checked at run time by the seal (D65).
const erased = <F>(f: unknown): F => f as F;
const slotOf = <F>(definition: string, path: string, f: unknown): Slot<F> => ({
  run: erased<F>(f),
  at: { definition, path },
});

// ── Memory. `Flow.initial`, `Flow.input`, `Flow.private`, as data: rule 12's fields, read by `flow check` and by restore.
// Round 11 (D200): `Flow.initial(schema, start => value)`, machine-design 2.2.2's computed start, a pure function of the input and constant fields. A `Flow.input`
// absent from the input takes the Schema's own decoding default for a missing key (`withDecodingDefaultKey`), or stays absent.
type MemorySpec<S extends Schema.Top = Schema.Top> = {
  readonly schema: S;
  readonly from: "initial" | "input" | "absent";
  readonly value?: S["Type"];
  readonly computed?: (start: Readonly<Record<string, unknown>>) => S["Type"];
  readonly private?: true;
};
const isFn = (x: unknown): x is (...a: never[]) => unknown => typeof x === "function";
export const Flow = {
  initial: <S extends Schema.Top>(
    schema: S,
    value: S["Type"] | ((start: Readonly<Record<string, unknown>>) => S["Type"]),
  ): MemorySpec<S> =>
    isFn(value) && !Schema.isSchema(value)
      ? { schema, from: "initial", computed: value as (start: Readonly<Record<string, unknown>>) => S["Type"] }
      : { schema, from: "initial", value: value as S["Type"] },
  input: <S extends Schema.Top>(schema: S): MemorySpec<S> => ({ schema, from: "input" }),
  private: <S extends Schema.Top>(m: MemorySpec<S>): MemorySpec<S> => ({ ...m, private: true }),
  // machine-design 2.2.2's "an optional key starts absent" (`Schema.optionalKey` as a field). Round 11 names it, so every field has a `Flow` source (D200).
  absent: <S extends Schema.Top>(schema: S): MemorySpec<S> => ({ schema, from: "absent" }),
  Exit: <F extends Fields>(fields: F) => ({ fields }),
  Callback: <F extends Fields>(fields: F) => ({ fields }),
  Guard: { guard: true } as const, // machine-design 2.2: a predicate the host writes
};
type MemoryFields = Readonly<Record<string, MemorySpec>>;
type MemoryOf<M extends MemoryFields> = { readonly [K in keyof M]: M[K]["schema"]["Type"] };
const missingDefault = (k: string, s: Schema.Top): { readonly has: boolean; readonly v?: unknown } => {
  try {
    const out = Schema.decodeUnknownSync(Schema.Struct({ [k]: s }) as unknown as Schema.Codec<Record<string, unknown>, unknown>)({});
    return k in out ? { has: true, v: out[k] } : { has: false };
  } catch {
    return { has: false };
  }
};
const initialOf = (definition: string, m: MemoryFields) => {
  const defaults = new Map(Object.entries(m).filter(([, s]) => s.from === "input").map(([k, s]) => [k, missingDefault(k, s.schema)]));
  return slotOf<(input: unknown) => object>(definition, "memory.initial", (input: unknown) => {
    const given = (input ?? {}) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, s] of Object.entries(m)) {
      if (s.from === "input") {
        if (k in given) out[k] = given[k];
        else if (defaults.get(k)!.has) out[k] = defaults.get(k)!.v;
        else out[k] = undefined;
      } else if (s.from === "initial" && !s.computed) out[k] = s.value;
    }
    const start = { ...out };
    for (const [k, s] of Object.entries(m)) if (s.computed) out[k] = s.computed(start);
    return out;
  });
};
// D82's stand-in becomes real: a stored record decodes by the memory's Schema. A field a release added takes its initial value.
// Round 11: a field missing from the record takes, in order, its Schema's decoding default for a missing key (what D82's stand-in meant: "a Schema with a
// default"), its constant initial, or stays absent when it starts absent.
const restoreOf = (definition: string, m: MemoryFields) => {
  const defaults = new Map(Object.entries(m).map(([k, f]) => [k, missingDefault(k, f.schema)]));
  return slotOf<(stored: unknown) => object>(definition, "memory.restore", (stored: unknown) => {
    const s = stored as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(m)
        .filter(([k, f]) => k in s || defaults.get(k)!.has || f.from !== "absent")
        .map(([k, f]) => [
          k,
          k in s
            ? Schema.decodeUnknownSync(jsonCodec(f))(s[k])
            : defaults.get(k)!.has
              ? defaults.get(k)!.v
              : f.value,
        ]),
    );
  });
};
// Review H2: written and read by one codec. `toCodecJson` is what makes a Date or a NaN a JSON value and back.
const jsonCodec = (f: MemorySpec) => Schema.toCodecJson(f.schema as unknown as Schema.Codec<unknown, unknown>);
const encodeOf = (definition: string, m: MemoryFields) =>
  slotOf<(memory: unknown) => object>(definition, "memory.encode", (memory: unknown) => {
    const v = memory as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(v).map((k) => [
        k,
        m[k] ? Schema.encodeUnknownSync(jsonCodec(m[k]!))(v[k]) : v[k],
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
  // Round 11 (D201): rule 13's unknown by its reason, as `Compiled` has had since M6.
  readonly unknown?: Target<unknown> | { readonly byReason: Readonly<Record<string, Target<unknown>>> };
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

// Round 11: `key`, a copy's own key inside an `.each` (rule 9: "`key` and `item` are" the copy's). Absent outside one.
type In<M, Ev> = { readonly memory: M; readonly event: Ev; readonly key?: string; readonly item?: unknown };
type GuardFn<M, Ev> = (g: In<M, Ev>) => true | Denial;
type OpGuard = { readonly opGuard: TokenGuard; readonly keyFn?: unknown };
type PortTok = { readonly port: string };
type Guard<M, Ev> = StateTok | OpGuard | PortTok | GuardFn<M, Ev>;
type Act =
  | { readonly member: "commit" | "lookup"; readonly op: string; readonly f: unknown }
  | { readonly member: "retry" | "cancel"; readonly op: string; readonly keyFn?: unknown }
  // Round 11 (D208): a module's member (M8, D63: `O.x.bookmark`, `O.x.refetch`), written as its data until the sessions module has handles (finding F3).
  | { readonly member: "module"; readonly op: string; readonly module: string; readonly name: string; readonly f?: unknown };
export const moduleMember = <M = never, Ev = never>(op: string, module: string, name: string, f?: (a: In<M, Ev>) => unknown): Act => ({ member: "module", op, module, name, ...(f ? { f } : {}) });
// What `O.x` offers, narrowed by kind as the design's handles are. `M`: this machine's memory, so a selector is typed by the state it reads.
type WriteHandle<I extends Fields, K extends keyof I, M> = {
  readonly commit: <Ev>(f: (a: In<M, Ev>) => TypeOf<I>) => Act;
  // Round 11 (D202): `idle` with no key asks of every lane of the operation, as `Compiled`'s key-less token always meant.
  readonly idle: (<Ev>(key: (a: In<M, Ev>) => { readonly [F in K]: TypeOf<I>[F] }) => OpGuard) & OpGuard;
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
        idle: Object.assign((keyFn: unknown): OpGuard => ({ opGuard: { op, verb: "idle" }, keyFn }), { opGuard: { op, verb: "idle" } }),
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
  // Round 11 (D203): NOT public API. A head insertion of the machine's own event, which the design leaves to the runtime (pending resets, adoption, rule 54). Hand fixtures
  // drive the runtime's mechanism with it directly (ORDER-*, Notes, Kept); kept as a named seam so those cases still boot from this front end, and counted apart.
  readonly labFollowUps?: ReadonlyArray<(a: In<M, Ev>) => { readonly tag: string; readonly payload: unknown }>;
  readonly exit?: NotifyTok<M, Ev>; // round 11: an exit behind a guard, in one alternative (`exits.X.from(f).exit`)
};
// Round 11 (D204): a raise names its child; `.key(f)` for one copy of an `.each`, `.from(f)` for its payload. machine-design 2.2's `E.pager.Jump.from(f)`, 2.4 rule 9's keyed raise.
type RaiseTok = {
  readonly to: string;
  readonly event: string;
  readonly keyFn?: unknown;
  readonly fromFn?: unknown;
};
type RaiseBuilder = RaiseTok & {
  readonly from: (f: (a: In<never, never>) => unknown) => RaiseBuilder;
  readonly key: (f: (a: In<never, never>) => string) => RaiseBuilder;
};
const raiseTok = (r: RaiseTok): RaiseBuilder => ({
  ...r,
  from: (f) => raiseTok({ ...r, fromFn: f }),
  key: (f) => raiseTok({ ...r, keyFn: f }),
});
type NotifyTok<M, Ev> = { readonly name: string; readonly f?: (a: In<M, Ev>) => unknown };
type ExitTok<M, Ev> = { readonly exit: NotifyTok<M, Ev> };
type OneAlt<M, Ev> = AltSpec<M, Ev> | StateTok | ExitTok<M, Ev>;
type Handler<M, Ev> = OneAlt<M, Ev> | ReadonlyArray<OneAlt<M, Ev>>;
type On<M, All> = { readonly [K in keyof All]?: Handler<M, All[K]> };
type SchedSpec<Tag extends string> = {
  readonly schedule: Duration.Input | ((a: In<never, never>) => number);
  readonly send: { readonly tag: Tag };
  readonly armOn?: ReadonlyArray<string>;
  readonly disarmOn?: ReadonlyArray<string>; // round 11: machine-design rule 23
};
type StateBody<M, All> = {
  readonly default?: StateTok;
  readonly on?: On<M, All>;
  readonly schedules?: Readonly<Record<string, SchedSpec<string>>>;
  // Round 11 (D208): 2.7.3's `activities`, a stream's session placed while the state is active and `when` holds. By the stream's name, until the sessions
  // module has handles (`O.x.subscribe(select)` in the design).
  readonly activities?: ReadonlyArray<{ readonly op: string; readonly input: (a: In<M, unknown>) => unknown; readonly when?: (a: In<M, unknown>) => boolean }>;
  readonly traits?: Readonly<Record<string, Placed<M, All>>>;
  // A subroutine's instance is named by its state; `name` says otherwise (round 11: the hand Desk/Ticket names RESOLVING's wizard `wizard`, and its cases address it so).
  readonly into?: Placed<M, All> & { readonly fragment: FragRef; readonly name?: string };
};
// A placed fragment, by the value `fragment()` returned (the machine collects it and every fragment it places) or by id for a fragment the host names elsewhere.
export type FragmentValue = {
  readonly id: string;
  readonly compiled: Fragment;
  readonly ops: Readonly<Record<string, Op>>;
  readonly places: readonly FragmentValue[];
};
type FragRef = FragmentValue | string;
type Placed<M, All> = {
  readonly fragment?: FragRef;
  readonly resumable?: true;
  readonly input?: (a: In<M, unknown>) => unknown;
  readonly resetOn?: (a: In<M, unknown>) => unknown; // machine-design rule 6
  readonly each?: { readonly of: string; readonly by?: string; readonly max: number }; // `.each({ of, max, by? })`, rule 9
  readonly guards?: Readonly<Record<string, GuardFn<M, unknown>>>; // the host's predicate for a guard port, 2.2
  readonly callbacks?: Readonly<Record<string, Handler<M, unknown>>>;
  readonly exits?: Readonly<Record<string, Handler<M, unknown>>>;
  readonly _all?: All;
};

const list = <X>(x: X | ReadonlyArray<X> | undefined): readonly X[] =>
  x === undefined ? [] : Array.isArray(x) ? (x as readonly X[]) : [x as X];
const isTok = (g: unknown): g is StateTok =>
  typeof g === "object" && g !== null && "node" in g;
const isOpGuard = (g: unknown): g is OpGuard =>
  (typeof g === "object" || typeof g === "function") && g !== null && "opGuard" in g; // `O.x.idle` is both a guard and a function of a key
const isPort = (g: unknown): g is PortTok =>
  typeof g === "object" && g !== null && "port" in g;

const compileAlt = <M, Ev>(
  definition: string,
  path: string,
  one: OneAlt<M, Ev>,
): Alternative => {
  const at: At = { definition, path };
  if ("exit" in one && one.exit && Object.keys(one).length === 1) {
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
      // Round 11, found by the port: a bare state token carries `.history` (the token for `S.X.history`), so "is this the history token" is `=== true`.
      ...(one.history === true ? { history: true as const } : {}),
    };
  }
  const guards = list(one.guard);
  const toks: TokenGuard[] = [];
  const closures: Array<Slot<(g: { memory: unknown; event: unknown }) => true | Denial>> = [];
  guards.forEach((g, position) => {
    if (isTok(g)) toks.push({ node: g.node });
    else if (isPort(g)) toks.push({ port: g.port });
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
    if (a.member === "module") return { op: a.op, verb: "module", module: a.module, name: a.name, ...(a.f ? { value: slotOf(definition, p, a.f) } : {}) };
    const keyFn = "keyFn" in a ? a.keyFn : undefined;
    return { op: a.op, verb: a.member, ...(keyFn ? { key: slotOf(definition, p, keyFn) } : {}) };
  });
  const raises = (one.raise ?? []).map(
    (r, i): Raise => ({
      to: r.to,
      event: r.event,
      ...(r.keyFn ? { key: slotOf(definition, `${path}.raise[${i}].key`, r.keyFn) } : {}),
      ...(r.fromFn ? { from: slotOf(definition, `${path}.raise[${i}]`, r.fromFn) } : {}),
    }),
  );
  return {
    target: one.target === undefined || one.target === "self" ? "self" : one.target.node,
    at,
    tokens: toks,
    guards: closures,
    ...(one.updateMemory ? { patch: slotOf(definition, `${path}.updateMemory`, one.updateMemory) } : {}),
    members,
    ...(one.labFollowUps?.length
      ? { followUps: one.labFollowUps.map((f, i) => slotOf<(a: unknown) => never>(definition, `${path}.followUp[${i}]`, f)) }
      : {}),
    ...(raises.length ? { raises } : {}),
    ...(one.exit ? { exit: { name: one.exit.name, ...(one.exit.f ? { from: slotOf(definition, `${path}.exit`, one.exit.f) } : {}) } } : {}),
    ...(one.notify?.length
      ? {
          notify: one.notify.map((n, i) => ({
            name: n.name,
            ...(n.f
              ? {
                  from: slotOf<(a: { memory: unknown; event: unknown }) => unknown>(
                    definition,
                    one.notify!.length > 1 ? `${path}.notify[${i}]` : `${path}.notify`,
                    n.f,
                  ),
                }
              : {}),
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
    disarmOn: s.disarmOn ?? [],
  }));
const idOf = (f: FragRef) => (typeof f === "string" ? f : f.id);
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
  ...(p.resetOn ? { resetOn: slotOf(definition, `${base}.resetOn`, p.resetOn) } : {}),
  ...(p.each ? { each: p.each } : {}),
  ...(p.resumable ? { resumable: true as const } : {}),
  ...(p.guards
    ? { guards: Object.fromEntries(Object.entries(p.guards).map(([k, g]) => [k, slotOf<(g: { memory: unknown; event: unknown }) => true | Denial>(definition, `${base}.guards.${k}`, g)])) }
    : {}),
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
const compileActivities = (definition: string, base: string, list: StateBody<unknown, unknown>["activities"]) =>
  list?.length
    ? {
        activities: list.map((x, i) => ({
          op: x.op,
          input: slotOf<(a: unknown) => unknown>(definition, `${base}activities[${i}]`, x.input),
          ...(x.when ? { when: slotOf<(a: unknown) => boolean>(definition, `${base}activities[${i}].when`, x.when) } : {}),
        })),
      }
    : {};
type BodyShape<M, All> = {
  readonly on?: On<M, All>;
  readonly activities?: StateBody<M, All>["activities"];
  readonly schedules?: StateBody<M, All>["schedules"];
  readonly traits?: StateBody<M, All>["traits"];
  readonly states?: Readonly<Record<string, StateBody<M, All>>>;
};
// The state tree walked once: a node per state, its parent, its default child, its path in the real machine. `placed` collects every fragment value a placement names.
const compileNodes = <M, All>(
  definition: string,
  tree: StateTree,
  fragmentIds: Readonly<Record<string, string>>,
  body: BodyShape<M, All>,
  placed: FragmentValue[] = [],
): Record<string, Node> => {
  const nodes: Record<string, Node> = {};
  // TypeScript cannot refuse this through the callback's return (type-tests.ts), so compiling does.
  const names = (t: StateTree): string[] => Object.entries(t).flatMap(([k, v]) => [k, ...names(v)]);
  const known = new Set(names(tree));
  for (const k of Object.keys(body.states ?? {}))
    if (!known.has(k)) throw new Error(`UnknownState: ${definition} has a body for ${k}, which its states do not list`);
  const note = (f: FragRef | undefined) => {
    if (f !== undefined && typeof f !== "string") placed.push(f);
  };
  const placedAt = (base: string, b: StateBody<M, All>) =>
    Object.entries(b.traits ?? {}).map(([name, p]) => {
      note(p.fragment);
      return compilePlaced(definition, `${base}traits.${name}`, name, p.fragment ? idOf(p.fragment) : fragmentIds[name]!, p);
    });
  const root = placedAt("", body as StateBody<M, All>);
  nodes["root"] = {
    id: "root",
    on: compileOn(definition, "", body.on),
    schedules: compileSchedules(definition, "", body.schedules as never),
    ...compileActivities(definition, "", body.activities as never),
    ...(root.length ? { placements: root } : {}),
  };
  const walk = (t: StateTree, parent: string, prefix: string) => {
    for (const [id, kids] of Object.entries(t)) {
      const path = `${prefix}states.${id}`;
      const b = (body.states?.[id] ?? {}) as StateBody<M, All>;
      const placements = placedAt(`${path}.`, b);
      note(b.into?.fragment);
      const into = b.into && compilePlaced(definition, path, b.into.name ?? id, idOf(b.into.fragment), b.into);
      nodes[id] = {
        id,
        parent,
        on: compileOn(definition, path, b.on),
        schedules: compileSchedules(definition, path, b.schedules as never),
        ...compileActivities(definition, `${path}.`, b.activities as never),
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
// D124, replaces D120's tag list: what the door refuses is a value's decoded form, anywhere in the input (`gate.ts`: a bigint, a Map, a Set, a function, a cycle). So this walks the decoded type of every field, into objects, arrays and classes, and names each place. What it cannot see into (`Unknown`, an opaque declaration) it says nothing about: the warning says "every commit", so it must be sure of the shape. A union is named if any member cannot go: that member's commits decline.
type Ast = { readonly _tag: string; readonly [k: string]: any };
export const notCarried = (ast: Ast | undefined, path: string, seen: Set<Ast> = new Set()): readonly string[] => {
  if (!ast || seen.has(ast)) return [];
  seen.add(ast);
  const inner = (x: Ast | undefined, p: string) => notCarried(x, p, seen);
  switch (ast._tag) {
    case "BigInt":
      return [path];
    case "Literal":
      return typeof ast["literal"] === "bigint" ? [path] : [];
    case "Union":
      return [...new Set<string>((ast["types"] as Ast[]).flatMap((t) => inner(t, path)))];
    case "Suspend":
      return inner(ast["thunk"](), path);
    case "Objects":
      return [
        ...(ast["propertySignatures"] as Array<{ name: PropertyKey; type: Ast }>).flatMap((p) => inner(p.type, `${path}.${String(p.name)}`)),
        ...(ast["indexSignatures"] as Array<{ type: Ast }>).flatMap((i) => inner(i.type, `${path}[]`)),
      ];
    case "Arrays":
      return [...(ast["elements"] as Ast[]), ...(ast["rest"] as Ast[])].flatMap((t) => inner(t, `${path}[]`));
    case "Declaration": {
      const says = ast["annotations"]?.expected;
      if (says === "ReadonlySet" || says === "ReadonlyMap") return [path];
      return (ast["annotations"]?.["~constructor"] ? (ast["typeParameters"] as Ast[]) : []).flatMap((t) => inner(t, path)); // a class: its fields
    }
    default:
      return [];
  }
};
const compileOp = (definition: string, name: string, b: AnyBound, fragment?: string): Op => {
  const c = b.contract;
  const m = b.mapped;
  const keyFields = c.key.map(String);
  const inputNotCarried = Object.entries(c.input as Record<string, { ast: Ast }>).flatMap(([f, s]) => notCarried(s.ast, f));
  const u = m.unknown as { readonly byReason?: Readonly<Record<string, unknown>> } | undefined;
  return {
    ...(inputNotCarried.length ? { inputNotCarried } : {}), // D124
    id: name,
    contract: c.id,
    kind: c.kind,
    ...(fragment ? { fragment } : {}),
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
      ...(u
        ? u.byReason
          ? { unknown: { byReason: Object.fromEntries(Object.entries(u.byReason).map(([k, v]) => [k, compileMapped(definition, name, `unknown.${k}`, v)])) } }
          : { unknown: compileMapped(definition, name, "unknown", u) }
        : {}),
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

// Every fragment a machine places, and every one they place, once each; their operations join the machine's (rule 51: one per actor).
const collect = (roots: readonly FragmentValue[]) => {
  const out = new Map<string, FragmentValue>();
  const visit = (f: FragmentValue) => {
    const had = out.get(f.id);
    if (had) {
      if (had !== f) throw new Error(`DuplicateFragment: two fragments are named ${f.id}`);
      return;
    }
    out.set(f.id, f);
    f.places.forEach(visit);
  };
  roots.forEach(visit);
  return [...out.values()];
};

// ── Round 11 (D209): the entity and session modules' data, in `Compiled`'s own shape, with plain closures that this front end makes Slots under their own
// paths. NOT the design's entity API (2.8) or stream contract (2.11): those front ends are the entity step and the compile prototypes (HANDOFF, plan cut).
// What this proves is that `Compiled` carries them as Slots; what it does not is that the design's API compiles to them (finding F5).
type Fn = (...a: never[]) => unknown;
export type DomainIn = {
  readonly writes: Readonly<Record<string, { readonly predicts: Fn; readonly confirms?: Fn }>>;
  readonly reads?: Readonly<Record<string, Fn>>;
  readonly listens?: Readonly<Record<string, Fn>>;
  readonly repair: Fn;
  readonly version?: Fn;
  readonly versionOrder?: "lexical" | Fn;
};
const compileDomain = (id: string, d: DomainIn): DomainSpec =>
  ({
    writes: Object.fromEntries(
      Object.entries(d.writes).map(([op, w]) => [
        op,
        { predicts: slotOf(id, `domain.writes.${op}.predicts`, w.predicts), ...(w.confirms ? { confirms: slotOf(id, `domain.writes.${op}.confirms`, w.confirms) } : {}) },
      ]),
    ),
    reads: Object.fromEntries(Object.entries(d.reads ?? {}).map(([op, f]) => [op, slotOf(id, `domain.reads.${op}`, f)])),
    ...(d.listens ? { listens: Object.fromEntries(Object.entries(d.listens).map(([op, f]) => [op, slotOf(id, `domain.listens.${op}`, f)])) } : {}),
    repair: slotOf(id, "domain.repair", d.repair),
    ...(d.version ? { version: slotOf(id, "domain.version", d.version) } : {}),
    ...(d.versionOrder === undefined ? {} : { versionOrder: d.versionOrder === "lexical" ? "lexical" : slotOf(id, "domain.versionOrder", d.versionOrder) }),
  }) as unknown as DomainSpec;
type MappedIn = { readonly tag: string; readonly fromFn?: unknown };
export type StreamIn = Omit<StreamSpec, "key" | "backoff" | "subscribe" | "reconnectWhile" | "pageRetryWhile" | "catchUp" | "value" | "missed" | "failure" | "failureBy" | "pages"> & {
  readonly key: Fn;
  readonly backoff: Fn;
  readonly subscribe: Fn;
  readonly reconnectWhile?: Fn;
  readonly pageRetryWhile?: Fn;
  readonly catchUp?: Fn;
  readonly value: MappedIn;
  readonly missed: MappedIn;
  readonly failure: MappedIn;
  readonly failureBy?: Readonly<Record<string, MappedIn>>;
  readonly pages?: MappedIn;
};
const streamMapped = (id: string, op: string, name: string, t: MappedIn): Mapped => ({ event: t.tag, ...(t.fromFn ? { from: slotOf(id, `streams.${op}.${name}`, t.fromFn) } : {}) });
const compileStreams = (id: string, s: Readonly<Record<string, StreamIn>>): Readonly<Record<string, StreamSpec>> =>
  Object.fromEntries(
    Object.entries(s).map(([op, x]) => {
      const sl = (n: string, f: Fn | undefined) => (f ? { [n]: slotOf(id, `streams.${op}.${n === "reconnectWhile" ? "reconnect.while" : n === "pageRetryWhile" ? "page.while" : n}`, f) } : {});
      const { key, backoff, subscribe, reconnectWhile, pageRetryWhile, catchUp, value, missed, failure, failureBy, pages, ...data } = x;
      return [
        op,
        {
          ...data,
          ...sl("key", key),
          ...sl("backoff", backoff),
          ...sl("subscribe", subscribe),
          ...sl("reconnectWhile", reconnectWhile),
          ...sl("pageRetryWhile", pageRetryWhile),
          ...sl("catchUp", catchUp),
          value: streamMapped(id, op, "value", value),
          missed: streamMapped(id, op, "missed", missed),
          failure: streamMapped(id, op, "failure", failure),
          ...(failureBy ? { failureBy: Object.fromEntries(Object.entries(failureBy).map(([k, t]) => [k, streamMapped(id, op, `failureBy.${k}`, t)])) } : {}),
          ...(pages ? { pages: streamMapped(id, op, "pages", pages) } : {}),
        } as unknown as StreamSpec,
      ];
    }),
  );

// ── The definition, then the machine. Two calls, as the design has them, so `E` is known before the operations and `S`, `O` before the body.
export const definition = <
  T extends StateTree,
  Ev extends Readonly<Record<string, Fields>>,
  In_ extends Readonly<Record<string, Fields>>,
  M extends MemoryFields,
  O extends Readonly<Record<string, AnyBound>>,
  P extends Readonly<Record<string, PlacedFrag>> = {},
>(d: {
  readonly id: string;
  readonly states: T;
  readonly events: Ev;
  readonly internalEvents: In_;
  readonly memory: M;
  readonly persisted?: boolean;
  readonly local?: true; // round 11: a local identity (D21), whose lanes are never adopted
  readonly uses?: readonly string[]; // the modules its operations import, by name (D44)
  readonly places?: P; // round 11: the fragments it places, by instance name, as a fragment's `places`; `E.<name>.<HostEvent>` raises into one
  readonly operations: (t: { readonly E: EventsOf<In_> }) => O;
  readonly domain?: DomainIn; // D209
  readonly streams?: (t: { readonly E: EventsOf<In_> }) => Readonly<Record<string, StreamIn>>; // D209
}) => ({
  ...d,
  ops: d.operations({ E: tokens(d.internalEvents) }),
  allEvents: tokens({ ...d.events, ...d.internalEvents }),
});
type EventPayloads<Ev extends Readonly<Record<string, Fields>>> = {
  readonly [K in keyof Ev]: TypeOf<Ev[K]>;
};
// A host raises any event its child takes: its `hostEvents` (only the host may) and its `events` (anyone may). Round 11: hand fixtures raise both.
type PlaceToksOf<P extends Readonly<Record<string, PlacedFrag>>> = {
  readonly [K in keyof P]: { readonly [H in keyof P[K]["hostEvents"] | keyof NonNullable<P[K]["events"]>]: RaiseBuilder };
};
const placeToksOf = (places: Readonly<Record<string, PlacedFrag>>) =>
  Object.fromEntries(
    Object.entries(places).map(([name, p]) => [
      name,
      Object.fromEntries(Object.keys({ ...p.events, ...p.hostEvents }).map((e) => [e, raiseTok({ to: name, event: e })])),
    ]),
  );
export const machine = <
  T extends StateTree,
  Ev extends Readonly<Record<string, Fields>>,
  In_ extends Readonly<Record<string, Fields>>,
  M extends MemoryFields,
  O extends Readonly<Record<string, AnyBound>>,
  P extends Readonly<Record<string, PlacedFrag>> = {},
>(
  d: ReturnType<typeof definition<T, Ev, In_, M, O, P>>,
  body: (t: {
    readonly S: StatesOf<T>;
    readonly E: EventsOf<Ev & In_> & PlaceToksOf<P>;
    readonly O: { readonly [K in keyof O]: HandleOf<O[K], MemoryOf<M>> };
  }) => {
    readonly default: StateTok;
    readonly on?: On<MemoryOf<M>, EventPayloads<Ev & In_>>;
    readonly traits?: Readonly<Record<string, Placed<MemoryOf<M>, EventPayloads<Ev & In_>>>>;
    readonly schedules?: Readonly<Record<string, SchedSpec<string>>>;
    readonly activities?: StateBody<MemoryOf<M>, EventPayloads<Ev & In_>>["activities"];
    readonly states?: {
      readonly [K in keyof T]?: StateBody<MemoryOf<M>, EventPayloads<Ev & In_>>;
    };
  },
): Typed<RequirementsOf<O>> => {
  const places = (d.places ?? {}) as P;
  const b = body({
    S: statesOf(d.states),
    E: { ...d.allEvents, ...placeToksOf(places) } as never,
    O: handles<O, MemoryOf<M>>(d.ops),
  });
  const placed: FragmentValue[] = Object.values(places).filter((p): p is PlacedFrag & FragmentValue => "compiled" in p);
  const nodes = compileNodes(d.id, d.states, Object.fromEntries(Object.entries(places).map(([k, p]) => [k, p.id])), b as never, placed);
  const frags = collect(placed);
  const fragOps = Object.fromEntries(frags.flatMap((f) => Object.entries(f.ops)));
  for (const k of Object.keys(fragOps))
    if (k in d.ops || frags.filter((f) => k in f.ops).length > 1) throw new Error(`DuplicateOperation: ${d.id} has two operations named ${k} (rule 51)`);
  return {
    compiled: {
      id: d.id,
      nodes,
      root: "root",
      default: b.default.node,
      memory: {
        initial: initialOf(d.id, d.memory),
        restore: restoreOf(d.id, d.memory),
        encode: encodeOf(d.id, d.memory),
      },
      ops: {
        ...Object.fromEntries(Object.entries(d.ops).map(([k, x]) => [k, compileOp(d.id, k, x)])),
        ...fragOps,
      },
      ...(frags.length ? { fragments: Object.fromEntries(frags.map((f) => [f.id, f.compiled])) } : {}),
      persisted: d.persisted ?? true,
      ...(d.local ? { local: true as const } : {}),
      uses: d.uses ?? [],
      ...(d.domain ? { domain: compileDomain(d.id, d.domain) } : {}),
      ...(d.streams ? { streams: compileStreams(d.id, d.streams({ E: tokens(d.internalEvents) })) } : {}),
      events: { external: Object.keys(d.events), internal: Object.keys(d.internalEvents) },
    },
  };
};

// ── A fragment: its own ports, its body over them. The nested fragment is named in `places`, so `E.countdown.Shown` is checked.
type Ports = Readonly<Record<string, { readonly fields: Fields }>>;
type GuardPorts = Readonly<Record<string, { readonly guard: true }>>;
type PlacedFrag = { readonly id: string; readonly hostEvents: Readonly<Record<string, Fields>>; readonly events?: Readonly<Record<string, Fields>> };
export const fragment = <
  T extends StateTree = {},
  Ev extends Readonly<Record<string, Fields>> = {},
  Host extends Readonly<Record<string, Fields>> = {},
  In_ extends Readonly<Record<string, Fields>> = {},
  X extends Ports = {},
  C extends Ports = {},
  M extends MemoryFields = {},
  P extends Readonly<Record<string, PlacedFrag>> = {},
  G extends GuardPorts = {},
  O extends Readonly<Record<string, AnyBound>> = {},
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
    readonly guards?: G;
    readonly memory?: M;
    readonly places?: P;
    // Round 11 (D199): rule 49, a fragment declares operations; their endings map onto its own internal events. They join the host's at placement.
    readonly operations?: (t: { readonly E: EventsOf<In_> }) => O;
  },
  body: (t: {
    readonly S: StatesOf<T>;
    readonly E: EventsOf<Ev & Host & In_> & {
      readonly [K in keyof P]: { readonly [H in keyof P[K]["hostEvents"] | keyof NonNullable<P[K]["events"]>]: RaiseBuilder };
    };
    readonly exits: {
      readonly [K in keyof X]: ExitTok<MemoryOf<M>, unknown> & {
        readonly from: <V>(f: (a: In<MemoryOf<M>, V>) => TypeOf<X[K]["fields"]>) => ExitTok<MemoryOf<M>, V>;
      };
    };
    readonly callbacks: {
      readonly [K in keyof C]: NotifyTok<MemoryOf<M>, unknown> & {
        readonly from: <V>(f: (a: In<MemoryOf<M>, V>) => TypeOf<C[K]["fields"]>) => NotifyTok<MemoryOf<M>, V>;
      };
    };
    readonly guards: { readonly [K in keyof G]: PortTok };
    readonly O: { readonly [K in keyof O]: HandleOf<O[K], MemoryOf<M>> };
  }) => {
    readonly on?: On<MemoryOf<M>, EventPayloads<Ev & Host & In_>>;
    readonly schedules?: Readonly<Record<string, SchedSpec<string>>>;
    readonly traits?: Readonly<Record<string, Placed<MemoryOf<M>, EventPayloads<Ev & Host & In_>>>>;
    readonly activities?: StateBody<MemoryOf<M>, EventPayloads<Ev & Host & In_>>["activities"]; // rule 41, 52: a trait body may hold activities
    readonly states?: {
      readonly [K in string]?: StateBody<MemoryOf<M>, EventPayloads<Ev & Host & In_>>;
    };
    // machine-design 2.2: notified when the incarnation ends, except by an exit; a key-less `O.x.cancel` here releases (rule 60)
    readonly whenAbandoned?: ReadonlyArray<NotifyTok<MemoryOf<M>, unknown> | Act>;
  },
) => {
  const places = (d.places ?? {}) as P;
  const placeToks = placeToksOf(places);
  const exitToks = Object.fromEntries(
    Object.keys(d.exits ?? {}).map((name) => [
      name,
      {
        exit: { name },
        from: (f: unknown) => ({ exit: { name, f } }),
      },
    ]),
  );
  const cb = Object.fromEntries(Object.keys(d.callbacks ?? {}).map((name) => [name, { name, from: (f: unknown) => ({ name, f }) }]));
  const gp = Object.fromEntries(Object.keys(d.guards ?? {}).map((name) => [name, { port: name }]));
  const ops = d.operations ? d.operations({ E: tokens((d.internalEvents ?? {}) as In_) }) : ({} as O);
  const tree = (d.states ?? {}) as T;
  const b = body({
    S: statesOf(tree),
    E: {
      ...tokens({ ...d.events, ...d.hostEvents, ...d.internalEvents }),
      ...placeToks,
    } as never,
    exits: exitToks as never,
    callbacks: cb as never,
    guards: gp as never,
    O: handles<O, MemoryOf<M>>(ops),
  });
  const fragmentIds = Object.fromEntries(Object.entries(places).map(([k, p]) => [k, p.id]));
  const placedHere: FragmentValue[] = [];
  const abandon = b.whenAbandoned ?? [];
  const notify = abandon.filter((x): x is NotifyTok<MemoryOf<M>, unknown> => "name" in x);
  const release = abandon.filter((x): x is Act => "member" in x).map((a) => a.op);
  const compiled: Fragment = {
    id: d.id,
    root: "root",
    default: d.default ?? "root",
    nodes: compileNodes(d.id, tree, fragmentIds, b as never, placedHere),
    memory: {
      initial: initialOf(d.id, (d.memory ?? {}) as M),
      restore: restoreOf(d.id, (d.memory ?? {}) as M),
      encode: encodeOf(d.id, (d.memory ?? {}) as M),
    },
    ...(abandon.length
      ? {
          whenAbandoned: {
            ...(notify.length ? { notify: notify.map((n, i) => ({ name: n.name, ...(n.f ? { from: slotOf(d.id, `whenAbandoned[${i}]`, n.f) } : {}) })) } : {}),
            ...(release.length ? { release } : {}),
          },
        }
      : {}),
  };
  const value: FragmentValue = {
    id: d.id,
    compiled,
    ops: Object.fromEntries(Object.entries(ops).map(([k, x]) => [k, compileOp(d.id, k, x, d.id)])),
    places: [...(Object.values(places).filter((p): p is PlacedFrag & FragmentValue => "compiled" in p)), ...placedHere],
  };
  return {
    ...value,
    hostEvents: (d.hostEvents ?? {}) as Host,
    events: (d.events ?? {}) as Ev,
    resumable: () => ({ resumable: true as const }),
  };
};
