// Round 12, compile prototype: operations (machine-design 2.7.1-2.7.3, rules 13-25, 39-47). A contract (`transaction`, `resource`) owns how the call is
// made and which server thing it is about; `.outcomes` binds it to a definition's events; the machine acts on it through `O` with the contract's verb.
// Compiles to `Compiled.ops[name]`: the key as a field list (D215), the input's fields, the services (D213), the endings' mapped events as Slots.
import { Effect, Schema, type Context } from "effect";
import { OutcomeFailure, OutcomeUnknown, type CommitCtx, type CompiledOp, type CompiledOutput, type Mapped, type Op, type TokenGuard } from "../fixtures/compiled.ts";
import { slotOf, type Fields, type Tagged, type TypeOf } from "./core.ts";
import { olderFormats, versioned } from "./ref.ts";
import { isIgnore, isUncertain, type EndCtx, type From, type Ignore, type Token } from "./events.ts";

// ── Services (D213, rule 57): named on the contract as values; `tsc` refuses a list that misses one of the commit's `R`.
export type Svc = Context.Key<any, any>;
type IdOf<Sv extends readonly Svc[]> = Context.Service.Identifier<Sv[number]>;
// On the result, not the argument, so the commit's own types still infer: a contract that misses a service has no `outcomes`.
// Mid review L1: a list widened to an array type says nothing (its identifiers are `any`), so it must be a tuple of the service values.
type Covered<R, Sv extends readonly Svc[], C> = number extends Sv["length"]
  ? { readonly "~servicesNotATuple": true }
  : [Exclude<R, IdOf<Sv>>] extends [never]
    ? C
    : { readonly "~servicesMissing": Exclude<R, IdOf<Sv>> };

type Reason<E> = E extends OutcomeUnknown<unknown> ? never : E extends OutcomeFailure<infer R> ? R : E;
type TagsOf<E> = Reason<E> extends infer X ? (X extends Tagged ? X["_tag"] : never) : never;
type OfTag<E, T> = Reason<E> extends infer X ? (X extends { readonly _tag: T } ? X : never) : never;
type NoPayload = Readonly<Record<string, never>>;
// An ending mapped with no `.from` needs an event that takes nothing. Round 14 (OD28): or `Flow.ignore`, no event at all.
type Target<V> = From<V> | Token<string, NoPayload> | Ignore;
export type Outcomes<O, E> = {
  readonly success?: Target<O>;
  readonly failure: { readonly [T in TagsOf<E>]?: Target<OfTag<E, T>> } & {
    readonly NotSent?: Target<{ readonly why: string }>;
    readonly Defect?: Target<unknown>;
    readonly Interrupted?: Target<unknown>;
  };
  // One event, or a record by reason as `failure` is by tag (design C6). The compiled form is `byReason`.
  readonly unknown?: Target<unknown> | Readonly<Record<string, Target<unknown>>>;
};
type Spec<I extends Fields, K extends keyof I, Sv extends readonly Svc[]> = {
  readonly id: string;
  readonly input: I;
  readonly output?: Schema.Top; // OD12. Not read by this prototype: no persisted resource, no SSR (api-changes)
  readonly key: readonly K[];
  readonly timeoutMs?: number;
  readonly services?: Sv;
};
export type Contract<I extends Fields, K extends keyof I, A, E, R> = {
  readonly id: string;
  readonly input: I;
  readonly key: readonly K[];
  readonly timeoutMs?: number;
  readonly services?: readonly Svc[];
  readonly kind: "write" | "read";
  readonly concurrency: Op["concurrency"];
  readonly guarded?: true;
  readonly commit: (input: TypeOf<I>, c: CommitCtx) => Effect.Effect<A, E, R>;
  readonly outcomes: (o: Outcomes<A, E>) => Bound<I, K, A, E, R>;
};
export type Bound<I extends Fields, K extends keyof I, A, E, R> = { readonly contract: Contract<I, K, A, E, R>; readonly mapped: Outcomes<A, E> };
const contract = <I extends Fields, K extends keyof I, A, E, R>(c: Omit<Contract<I, K, A, E, R>, "outcomes">): Contract<I, K, A, E, R> => {
  const self: Contract<I, K, A, E, R> = { ...c, outcomes: (mapped) => ({ contract: self, mapped }) };
  return self;
};
// 2.7.3: a write's function is `commit`, a read's `lookup`.
/**
 * A write contract: `commit` sends it, the record queue orders it, and its outcomes map to the machine's events.
 *
 * When to use `guarded: true`: your commit sends `basedOn` as a version condition the server enforces, such as PostgREST
 * `.eq("revision", basedOn)`, `If-Match` with a revision ETag, or a compare-and-swap.
 *
 * Details: `guarded: true` states a check the server enforces, not one Flow runs (unlike `guard:`). After the write is given
 * up, its doubt on a target record (the write's `.one` record, or each `many` key) ends only when an answer shows that
 * record's version past the `basedOn` it was sent with. An equal version proves nothing, a refusal proves nothing, no clock
 * ends it, and records the write touched but does not target keep their doubt.
 *
 * Gotchas: `flow check` cannot verify the claim, and refuses it on an entity whose version is not per record. Not a
 * timestamp, not a client-side transaction, not a read-then-write in your server, not a content-hash ETag. A first send
 * that succeeds over a base Flow already knew was stale is evidence (`GuardContradicted`) and voids the claim until reload.
 */
export const transaction = <I extends Fields, K extends keyof I, A, E, R, const Sv extends readonly Svc[] = readonly []>(
  s: Spec<I, K, Sv> & { readonly concurrency: Op["concurrency"]; readonly guarded?: true; readonly commit: (input: TypeOf<I>, c: CommitCtx) => Effect.Effect<A, E, R> },
): Covered<R, Sv, Contract<I, K, A, E, R>> => contract<I, K, A, E, R>({ ...s, kind: "write" }) as never;
export const resource = <I extends Fields, K extends keyof I, A, E, R, const Sv extends readonly Svc[] = readonly []>(
  s: Spec<I, K, Sv> & { readonly lookup: (input: TypeOf<I>, c: CommitCtx) => Effect.Effect<A, E, R> },
): Covered<R, Sv, Contract<I, K, A, E, R>> => {
  const { lookup, ...rest } = s;
  return contract<I, K, A, E, R>({ ...rest, kind: "read", concurrency: "reject", commit: lookup }) as never; // D23: concurrency unused for a read
};

// `never` for a bound's unused slots, so each one's own types stay out of the handle's.
export type AnyBound = {
  readonly contract: {
    readonly id: string;
    readonly kind: "write" | "read";
    readonly concurrency: Op["concurrency"];
    readonly guarded?: true;
    readonly input: Fields;
    readonly key: readonly PropertyKey[];
    readonly timeoutMs?: number;
    readonly services?: readonly Svc[];
    readonly commit: unknown;
  };
  readonly mapped: { readonly success?: unknown; readonly failure: unknown; readonly unknown?: unknown };
};
export type RequirementsOf<O> = { [K in keyof O]-?: NonNullable<O[K]> extends Bound<Fields, never, infer _A, infer _E, infer R> ? R : never }[keyof O];

// ── What the machine writes with `O.x`, typed where it is used (2.7.3: "the select is typed where it is used"). `Ev` is the event of the handler the
// member sits in, taken from its place by return-type inference; a member written outside a handler (a shared const) reads the event as `unknown` fields.
export type In<M, Ev> = { readonly memory: M; readonly event: Ev; readonly key?: string; readonly item?: unknown };
export type AnyEvent = { readonly [k: string]: unknown };
type ActData =
  | { readonly member: "commit" | "lookup"; readonly op: string; readonly f: unknown }
  | { readonly member: "retry" | "cancel" | "cancelAll"; readonly op: string; readonly keyFn?: unknown }
  | { readonly member: "module"; readonly op: string; readonly module: string; readonly name: string; readonly f?: unknown };
// `Ev = unknown` for a member with no select (`O.x.cancel`), which fits any handler.
export type Act<Ev = unknown> = ActData & { readonly _ev?: (e: Ev) => void };
export type OpGuard<Ev = unknown> = { readonly opGuard: TokenGuard; readonly keyFn?: unknown; readonly _ev?: (e: Ev) => void };
// Round 13 (D221, Arpit's call): key fields are required, so the key is a plain required pick of the input. The compile refuses an optional or defaulted
// key field (`KeyFieldOptional`, below): an absent value is never a key value.
type KeyOf<I extends Fields, K extends keyof I> = Required<Pick<TypeOf<I>, K & keyof TypeOf<I>>>;
type WriteHandle<I extends Fields, K extends keyof I, M> = {
  readonly commit: <Ev = AnyEvent>(f: (a: In<M, Ev>) => TypeOf<I>) => Act<Ev>;
  // 2.7.3: `idle(k?)`, `retry(k?)`, `cancel(k?)`; key-less names the one lane, or the ending's Attempt (OD8). `retryable({ times })`, `retryable(k, { times })`.
  readonly idle: (<Ev = AnyEvent>(key: (a: In<M, Ev>) => KeyOf<I, K>) => OpGuard<Ev>) & OpGuard;
  readonly retryable: {
    (o: { readonly times: number }): OpGuard;
    <Ev = AnyEvent>(key: (a: In<M, Ev>) => KeyOf<I, K>, o: { readonly times: number }): OpGuard<Ev>;
  };
  readonly retry: Act & (<Ev = AnyEvent>(key: (a: In<M, Ev>) => KeyOf<I, K>) => Act<Ev>);
  readonly cancel: Act & (<Ev = AnyEvent>(key: (a: In<M, Ev>) => KeyOf<I, K>) => Act<Ev>);
  readonly cancelAll: Act & (<Ev = AnyEvent>(key: (a: In<M, Ev>) => KeyOf<I, K>) => Act<Ev>);
};
type ReadHandle<I extends Fields, M> = {
  readonly lookup: <Ev = AnyEvent>(f: (a: In<M, Ev>) => TypeOf<I>) => Act<Ev>;
  readonly cancel: Act;
};
export type HandleOf<B, M> = B extends Bound<infer I, infer K, infer _A, infer _E, infer _R> ? WriteHandle<I, K, M> & ReadHandle<I, M> : never;
const member = <F extends (...a: never[]) => unknown, T extends object>(f: F, data: T): F & T => Object.assign(f, data);
export const handles = <O extends Readonly<Record<string, AnyBound>>, M>(ops: O) =>
  Object.fromEntries(
    Object.keys(ops).map((op) => [
      op,
      {
        commit: (f: unknown): Act => ({ member: "commit", op, f }),
        lookup: (f: unknown): Act => ({ member: "lookup", op, f }),
        idle: member((keyFn: unknown): OpGuard => ({ opGuard: { op, verb: "idle" }, keyFn }), { opGuard: { op, verb: "idle" } as TokenGuard }),
        retryable: (a: unknown, b?: { times: number }): OpGuard =>
          typeof a === "function" ? { opGuard: { op, verb: "retryable", times: b!.times }, keyFn: a } : { opGuard: { op, verb: "retryable", times: (a as { times: number }).times } },
        retry: member((keyFn: unknown): Act => ({ member: "retry", op, keyFn }), { member: "retry" as const, op }),
        cancel: member((keyFn: unknown): Act => ({ member: "cancel", op, keyFn }), { member: "cancel" as const, op }),
        cancelAll: member((keyFn: unknown): Act => ({ member: "cancelAll", op, keyFn }), { member: "cancelAll" as const, op }),
      },
    ]),
  ) as { readonly [K in keyof O]: HandleOf<O[K], M> };

// ── The compile of one operation.
const compileMapped = (definition: string, op: string, name: string, t: unknown): Mapped => {
  if (isIgnore(t)) return { event: "", ignore: true }; // OD28: admitted with no turn (2.7.18)
  const x = t as { readonly tag: string; readonly fromFn?: unknown };
  return { event: x.tag, ...(x.fromFn ? { from: slotOf(definition, `operations.${op}.${name}`, x.fromFn) } : {}) };
};
// D124: what the door refuses is a value's decoded form, anywhere in the input (a bigint, a Map, a Set, a function, a cycle). This walks the decoded type of every
// field and names each place. What it cannot see into (`Unknown`, an opaque declaration) it says nothing about. A union is named if any member cannot go.
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
      return (ast["annotations"]?.["~constructor"] ? (ast["typeParameters"] as Ast[]) : []).flatMap((t) => inner(t, path));
    }
    default:
      return [];
  }
};
const optionalOrDefaulted = (f: string, s: Schema.Top): boolean => {
  if ((s.ast as { context?: { isOptional?: boolean } }).context?.isOptional === true) return true;
  const st = Schema.Struct({ [f]: s }) as unknown as Schema.Codec<Record<string, unknown>, unknown> & { makeOption: (i: unknown) => { _tag: string } };
  if (st.makeOption({})._tag === "Some") return true; // a constructor default
  try {
    Schema.decodeUnknownSync(st)({});
    return true; // a decoding default
  } catch {
    return false;
  }
};
export const FLOW_REASONS = new Set(["Cancelled", "Restored", "Interrupted", "Defect", "StillUnknown", "StorageRefused", "Disposed"]);
export const WRITE_ONLY_REASONS = new Set(["NotSent"]);
// A contract's own unknown tags live in its commit's type, which this compile cannot read; what it can refuse is a key naming one of Flow's never-unknown reasons.
const NEVER_UNKNOWN = new Set([...WRITE_ONLY_REASONS, "Rejected", "Overloaded", "Unencodable", "NoPersistence", "OldVersion"]);
// `events`: the declaring definition's or fragment's event records, so `unknown:` is checked against `Flow.uncertain` (rule 13).
export const compileOp = (definition: string, name: string, b: AnyBound, events: Readonly<Record<string, Fields>>, fragment?: string): CompiledOp => {
  const c = b.contract;
  const m = b.mapped;
  const keyFields = c.key.map(String);
  // D221 (rule 39, round 13 mid review L5): a key field is required and has no default, so every key names its server thing by values the caller gave.
  for (const f of keyFields) {
    const s = (c.input as Record<string, Schema.Top>)[f];
    if (!s) throw new Error(`SealKeyField: ${definition} operations.${name} key field ${f} is not an input field (rule 39)`);
    if (optionalOrDefaulted(f, s)) throw new Error(`KeyFieldOptional: ${definition} operations.${name} key field ${f} is optional or has a default (rule 39)`);
  }
  for (const tag of Object.keys((m.failure ?? {}) as object))
    if ((FLOW_REASONS.has(tag) && !(c.kind !== "write" && (tag === "Defect" || tag === "Interrupted"))) || (c.kind === "read" && WRITE_ONLY_REASONS.has(tag)))
      throw new Error(`ReservedReason: ${definition} operations.${name} maps a failure tag ${tag}, which is one of Flow's reasons (rule 13)`);
  const inputNotCarried = Object.entries(c.input as Record<string, { ast: Ast }>).flatMap(([f, s]) => notCarried(s.ast, f));
  const u0 = m.unknown as Readonly<Record<string, unknown>> | undefined;
  const u = u0 === undefined ? undefined : typeof u0["tag"] === "string" || isIgnore(u0) ? u0 : { byReason: u0 }; // a token's `tag` is a string; a reason's value is a token
  if (u && "byReason" in u)
    for (const k of Object.keys(u.byReason as object))
      if (NEVER_UNKNOWN.has(k)) throw new Error(`ReservedReason: ${definition} operations.${name} maps unknown reason ${k}, which is Flow's and never an unknown (rule 13)`);
  // D220's check, with OD28: `unknown: Flow.ignore` (or one reason's) maps no event, so it needs no `Flow.uncertain` one.
  const unknownTags = (u === undefined ? [] : "byReason" in u ? Object.values(u.byReason as Record<string, unknown>) : [u]).filter((t) => !isIgnore(t)).map((t) => (t as { tag: string }).tag);
  for (const t of unknownTags)
    if (!isUncertain(events[t])) throw new Error(`UnknownNotUncertain: ${definition} operations.${name} maps unknown to ${t}, which is not Flow.uncertain (rule 13)`);
  return {
    ...(inputNotCarried.length ? { inputNotCarried } : {}),
    id: name,
    contract: c.id,
    kind: c.kind,
    ...(fragment ? { fragment } : {}),
    keyFields, // rule 39's field list: the one source of the lane's key (D215); the seal makes the key from it
    keyVersion: keyFields.map((f) => versioned(f, (c.input as Record<string, Schema.Top>)[f])),
    keyVersionByFormat: olderFormats(keyFields.map((f) => [f, (c.input as Record<string, Schema.Top>)[f]] as const)),
    inputFields: Object.keys(c.input),
    services: (c.services ?? []).map((s) => s.key),
    concurrency: c.concurrency,
    ...(c.guarded ? { guarded: true } : {}),
    ...(c.timeoutMs === undefined ? {} : { timeoutMs: c.timeoutMs }),
    commit: slotOf(definition, `operations.${name}.commit`, c.commit),
    outcomes: {
      ...(m.success ? { success: compileMapped(definition, name, "success", m.success) } : {}),
      failure: Object.fromEntries(Object.entries((m.failure ?? {}) as Readonly<Record<string, unknown>>).map(([k, v]) => [k, compileMapped(definition, name, `failure.${k}`, v)])),
      ...(u
        ? "byReason" in u
          ? { unknown: { byReason: Object.fromEntries(Object.entries(u.byReason as Readonly<Record<string, unknown>>).map(([k, v]) => [k, compileMapped(definition, name, `unknown.${k}`, v)])) } }
          : { unknown: compileMapped(definition, name, "unknown", u) }
        : {}),
    },
  } as unknown as CompiledOp;
};

// ── What a machine needs from the boot: `R`, the union of its contracts' requirements (rule 57).
export type Typed<R> = { readonly compiled: CompiledOutput; readonly _R?: (r: R) => R };
// D213: the one place a context's type is erased for the Runtime, after `tsc` has checked it against the machine's `R` (the machine's own operations and,
// D218, every fragment it places).
export const servicesFor = <R>(_t: Typed<R>, services: Context.Context<NoInfer<R>>): Context.Context<never> => services as Context.Context<never>;
void Effect;
