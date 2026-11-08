// The entities module (2.8). The core knows nothing of this file: it sees a Module. Records, predictions over a confirmed base,
// the record queue in the order sends began (D3 as directed), `basedOn` rebased by mint (OD19 Q32 A, narrowed), marks (rule 32, U10), forced repair
// bounded by a count of asks, never a clock (D12/D40 as ruled), answer positions (D47). A sync engine
// would implement the same hooks with `blocks: false`; no such engine here. It stays optional: no core file imports it.
//
// Prior art, read: a retry stays in place and the first unresolved blocks: codebases/tanstack-query/packages/query-core/src/
// mutationCache.ts:161-173, codebases/db/packages/offline-transactions/src/executor/KeyScheduler.ts:21-34,
// codebases/mono/packages/replicache/src/pending-mutations.ts. Replaying pending writes over a new base:
// codebases/db/packages/db/src/collection/state.ts:580. A stale read must not win over a confirmed write:
// codebases/tanstack-query/packages/query-core/src/mutationObserver.ts's cancelQueries convention, here a position compare.
import type { Carried, Compiled, CoverTerm, Predicted, Slot } from "../conformance/fixtures/compiled.ts";
import { Effect, Schema } from "effect";
import type { Claim as QueueClaim, Cx, Ended, Module, ReadAnswer, Told } from "./seam.ts";
import { own, same, text, type SealedDomain } from "./gate.ts";
import type { Ending } from "./world.ts";

type Entry = {
  readonly attempt: string;
  readonly mint: number;
  readonly machine: string;
  readonly op: string;
  readonly input: unknown;
  readonly refs: readonly string[];
  readonly predicted: readonly Predicted[];
  readonly unknown: boolean;
  readonly released: boolean;
  readonly joined: boolean;
  readonly sent: boolean;
  // OD19 Q32 A, narrowed: per record, the version it was minted over; rebased only across an earlier-minted write's success, and only until sent.
  readonly basedOn: Readonly<Record<string, Ver | undefined>>;
  readonly targets: readonly string[]; // the records a `guarded` server fences (the write's `.one` or `many` keys); others it only touches
  readonly sends: number; // 0, 1, or 2 for re-sent: only "was this success its first send" is read. A restored Attempt may have been sent: 1
  readonly unsure?: true; // restored from a lane record written before its send: the base it was sent with may be a later one (a rebase)
  readonly known: Readonly<Record<string, Ver | undefined>>; // per target, the version the store held when the first send began
};
// Rule 32 as U10 rules it: `given` is the position of the give-up (null while the lane can still re-send); `quiet` once a read asked after it, or a
// later write's success, has landed: `unconfirmed` on its fields, never `uncertain`. Its exits (Q1 A, the convergence's rules): `guard`, on a target of
// a `guarded` write, the `basedOn` it was sent with, ended by an answer showing that record's version past it; `key`, a business key, ended by a
// later Attempt's success with the same values (a replay). Otherwise the cap.
type Mark = {
  readonly attempt: string;
  readonly mint: number;
  readonly machine: string;
  readonly op: string;
  readonly given: number | null;
  readonly quiet: boolean;
  readonly fields: readonly string[];
  readonly guard?: Ver;
  readonly key?: string;
  readonly removes?: true; // a removal moves the record out of any cover
};
const businessKey = (e: { machine: string; op: string; input: unknown }, cx: Cx): string | undefined => {
  const by = cx.machine(e.machine).ops[e.op]?.idempotency;
  return Array.isArray(by) ? text(by.map((f) => (e.input as Readonly<Record<string, unknown>>)?.[f])) : undefined;
};
const markOf = (e: Entry, ref: string, cx: Cx): Mark => {
  const guard = cx.machine(e.machine).ops[e.op]?.guarded && e.targets.includes(ref) && !e.unsure ? e.basedOn[ref] : undefined;
  const key = businessKey(e, cx);
  const removes = e.predicted.some((p) => p.ref === ref && p.remove);
  return {
    attempt: e.attempt,
    mint: e.mint,
    machine: e.machine,
    op: e.op,
    given: null,
    quiet: false,
    fields: [...new Set(e.predicted.filter((p) => p.ref === ref).flatMap((p) => Object.keys(p.patch ?? {})))],
    ...(guard === undefined ? {} : { guard }),
    ...(key === undefined ? {} : { key }),
    ...(removes ? { removes: true as const } : {}),
  };
};
// Q1 A: an answer showing the target's version strictly past the base the write was sent with; equal proves nothing. Void once contradicted.
const passed = (s: Slice, r: Rec, m: Mark, cx: Cx) => {
  if (m.given === null || m.guard === undefined || s.voided.includes(`${m.machine}|${m.op}`)) return false;
  const k = compareVersions(r.version, m.guard, domainOf(cx, m.machine)?.versionOrder, cx);
  return typeof k === "number" && k > 0;
};
const prove = (s: Slice, ref: string, cx: Cx): Slice => {
  const r = recOf(s, ref);
  const gone = r.marks.filter((m) => passed(s, r, m, cx));
  if (gone.length === 0) return s;
  for (const m of gone) cx.note("GuardPassed", { ref, attempt: m.attempt });
  return withRec(s, ref, (x) => ({ ...x, marks: x.marks.filter((m) => !gone.includes(m)) }));
};
const demote = (r: Rec, when: (m: Mark) => boolean): Rec =>
  r.marks.some((m) => !m.quiet && m.given !== null && when(m))
    ? { ...r, marks: r.marks.map((m) => (!m.quiet && m.given !== null && when(m) ? { ...m, quiet: true } : m)) }
    : r;
// D74: what a confirmed write established and which fields, until a version or a later read places it. Replaces `unechoed`.
type Claim = {
  readonly since: number; // the newest such write's success landed here
  readonly fields: readonly string[];
  readonly removed?: true;
  readonly values?: Readonly<Record<string, unknown>>; // only on a record with no base yet (H1), so a row can be overlaid
};
// D76: what the feed said of a record nobody has a row for. Replayed through `place` over the row a read that started earlier lands.
type Early = {
  readonly since: number;
  readonly fields: Readonly<Record<string, unknown>>;
  readonly version?: Ver;
  readonly whole?: true; // Q4 A: a whole row is among them, so what they omit is absent
};
type Rec = {
  readonly base?: Readonly<Record<string, unknown>>;
  readonly unconfirmed: readonly string[];
  readonly marks: readonly Mark[];
  readonly queue: readonly string[]; // the order sends began (D3 as directed); a retry never rejoins
  readonly asks?: number; // repairs asked for the open doubt; past 3, `RepairOverdue` and no more until news
  readonly landedAt: number; // D58: the tick at which what this record holds arrived
  readonly doubt?: number; // D58: the tick a doubt began. Goes only by a read that started after it
  readonly version?: Ver; // the highest placed. On a tombstone: its floor
  readonly gone?: true; // absence is evidence: a row at this version is from before it (H2)
  readonly claim?: Claim;
  readonly early?: Early;
  readonly behind?: number; // Q3 A: a covering session's unproven registration at this position; `unconfirmed` until a read asked after it lands
  readonly keyed?: readonly string[]; // the entity's key fields, which have no cell (entity-proposal-2 2.2): never `unconfirmed` by a gap
};
type Repair = {
  readonly gen: string;
  readonly machine: string;
  readonly again: boolean;
  readonly pos: number;
};
export type Slice = {
  readonly records: Readonly<Record<string, Rec>>;
  readonly entries: Readonly<Record<string, Entry>>;
  readonly repairs: Readonly<Record<string, Repair>>;
  // T7, thin: answers landed, so a gap can re-read what was read before it. No cache here: it reruns the read's own commit.
  readonly answers: Readonly<Record<string, Answered>>;
  readonly earlyOrder: readonly string[]; // D76: refs with a stub, oldest first. Bounded
  readonly delivered: Readonly<Record<string, readonly string[]>>; // Q3 A's default: per live session, the records it has itself delivered
  readonly live: Readonly<Record<string, Live>>; // registered `.covers` sessions, until lost or ended: what may hide a given-up doubt
  readonly voided: readonly string[]; // `machine|op`: `guarded` writes contradicted in this Runtime (GuardContradicted). Memory only
};
type Live = { readonly entity: string; readonly where: readonly CoverTerm[]; readonly input: Readonly<Record<string, unknown>> };
type Answered = {
  readonly machine: string;
  readonly op: string;
  readonly input: unknown;
  readonly start: number;
};
const NONE: Rec = { unconfirmed: [], marks: [], queue: [], landedAt: 0 };
const EARLY_BOUND = 1024;
// D65: `ref` comes from a closure: "constructor" is a name like any other.
const empty: Slice = { records: {}, entries: {}, repairs: {}, answers: {}, earlyOrder: [], delivered: {}, live: {}, voided: [] };
const recOf = (s: Slice, ref: string): Rec => own(s.records, ref) ?? NONE;
const withRec = (s: Slice, ref: string, f: (r: Rec) => Rec): Slice => ({
  ...s,
  records: { ...s.records, [ref]: f(recOf(s, ref)) },
});
// D77: sealed. Every closure in it is a Slot.
const domainOf = (cx: { machine(id: string): Compiled }, machine: string) =>
  cx.machine(machine).domain as unknown as SealedDomain | undefined;
const asSlot = <F>(machine: string, path: string, run: F): Slot<F> => ({
  run,
  at: { definition: machine, path },
});

// M8: a field function's throw is the turn's when the prediction is made (`dryRun`), and never a reader's after that.
const applyPatch = (base: any, p: Predicted, input: unknown) => {
  if (p.remove) return undefined;
  if (base === undefined) return undefined; // E18: a prediction over a record the store does not hold shows nothing
  const next: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(p.patch ?? {}))
    next[k] = typeof v === "function" ? (v as (b: unknown, i: unknown) => unknown)(base, input) : v;
  return next;
};
const safely = <A>(f: () => A, fallback: A): A => {
  try {
    return f();
  } catch {
    return fallback;
  }
};
const draftsOf = (s: Slice, ref: string) =>
  Object.values(s.entries)
    .filter((e) => !e.joined && e.refs.includes(ref))
    .sort((a, b) => a.mint - b.mint);
// The convergence's `.covers` mask: a given-up doubt is hidden, never ended, while a registered `.covers` session covers the record with no open gap on
// it and its filter reads no field the write changed (a write that moves a record out of the cover would land unheard). Hidden is not proven: when the
// session is lost or ends, the mark shows again.
const hidden = (s: Slice, ref: string, r: Rec, m: Mark) =>
  m.given !== null &&
  !m.removes &&
  r.behind === undefined &&
  r.base !== undefined &&
  Object.values(s.live).some(
    (l) =>
      ref.startsWith(`${l.entity}|`) &&
      l.where.every((t) => same(r.base![t.field], "input" in t ? l.input[t.input] : t.value)) &&
      !l.where.some((t) => m.fields.includes(t.field)),
  );
export const readRecord = (s: Slice, ref: string) => {
  const r = own(s.records, ref);
  if (!r) return undefined;
  let data: any = r.base;
  let predicted = false;
  for (const e of [...r.queue.map((id) => s.entries[id]), ...draftsOf(s, ref)]) {
    if (!e) continue;
    for (const p of e.predicted) {
      if (p.ref !== ref) continue;
      predicted = true;
      const before = data;
      data = safely(() => applyPatch(before, p, e.input), before);
    }
  }
  const marks = r.marks.filter((m) => !hidden(s, ref, r, m));
  const uncertain = marks.some((m) => !m.quiet) || r.doubt !== undefined;
  const quiet = marks.filter((m) => m.quiet).flatMap((m) => m.fields);
  const gapped = r.behind !== undefined && r.base ? Object.keys(r.base).filter((f) => !r.keyed?.includes(f)) : [];
  const unconfirmed = quiet.length || gapped.length ? [...new Set([...r.unconfirmed, ...quiet, ...gapped])] : r.unconfirmed;
  if (r.base === undefined && !predicted && !uncertain && r.queue.length === 0) return undefined;
  return { data, predicted, uncertain, unconfirmed };
};
export const readAll = (s: Slice) =>
  Object.fromEntries(
    Object.keys(s.records)
      .map((ref) => [ref, readRecord(s, ref)!])
      .filter(([, v]) => v),
  );

const REPAIR_ASKS = 3;
const MANY_MAX = 4_096;
const startRepair = (s: Slice, ref: string, machine: string, cx: Cx): Slice => {
  const cur = own(s.repairs, ref);
  if (cur) return { ...s, repairs: { ...s.repairs, [ref]: { ...cur, again: true } } };
  if (!cx.live) return s;
  const asks = recOf(s, ref).asks ?? 0;
  if (asks >= REPAIR_ASKS) {
    cx.note("RepairOverdue", { ref }); // the mark stays; the next news asks again
    return withRec(s, ref, (r) => ({ ...r, asks: 0 }));
  }
  const gen = cx.gen();
  const pos = cx.pos();
  cx.command({ k: "repair", ref, gen, machine });
  cx.note("repair", { ref });
  return withRec({ ...s, repairs: { ...s.repairs, [ref]: { gen, machine, again: false, pos } } }, ref, (r) => ({ ...r, asks: asks + 1 }));
};
// An answer placed: the doubt it was asked for is answered, so the count starts again.
const answered = (s: Slice, ref: string): Slice => (recOf(s, ref).asks ? withRec(s, ref, (r) => ({ ...r, asks: 0 })) : s);
const removeEntry = (s: Slice, attempt: string): Slice => {
  const e = s.entries[attempt];
  if (!e) return s;
  const { [attempt]: _gone, ...entries } = s.entries;
  let out: Slice = { ...s, entries };
  for (const ref of e.refs)
    out = withRec(out, ref, (r) => ({ ...r, queue: r.queue.filter((x) => x !== attempt) }));
  return out;
};
// Rule 32 (U10, field-scoped): its own mark goes; a given-up mark is demoted only by a success that carried every field the mark is on.
type Covered = ReadonlyMap<string, "all" | readonly string[]>;
const clearMarks = (s: Slice, e: Entry, covered: Covered): Slice => {
  let out = s;
  for (const ref of e.refs) {
    if (!recOf(out, ref).marks.length) continue;
    const c = covered.get(ref);
    const covers = (m: Mark) => c === "all" || (c !== undefined && m.fields.every((f) => c.includes(f)));
    out = withRec(out, ref, (x) => demote({ ...x, marks: x.marks.filter((m) => m.attempt !== e.attempt) }, covers));
  }
  return out;
};
// U10's row cap (proposal 4.5): given-up marks per entity, oldest out. A count, never a clock.
const evict = (s: Slice, cx: Cx): Slice => {
  const given = Object.entries(s.records).flatMap(([ref, r]) => r.marks.filter((m) => m.given !== null).map((m) => ({ ref, m })));
  const byEntity = new Map<string, typeof given>();
  for (const g of given) {
    const ent = g.ref.slice(0, g.ref.indexOf("|"));
    byEntity.set(ent, [...(byEntity.get(ent) ?? []), g]);
  }
  let out = s;
  for (const list of byEntity.values()) {
    if (list.length <= cx.unsettledMax) continue;
    for (const { ref, m } of [...list].sort((a, b) => a.m.given! - b.m.given!).slice(0, list.length - cx.unsettledMax)) {
      cx.note("UnsettledEvicted", { ref, attempt: m.attempt });
      out = withRec(out, ref, (r) => ({ ...r, marks: r.marks.filter((x) => x !== m) }));
    }
  }
  return out;
};
// ── D74: evidence is placed, then disposed. Two questions, two functions, one table (convergence-6). Every caller obeys.
type Ver = number | string;
type FieldEq = (field: string, a: unknown, b: unknown) => boolean;
// The judge's equality (proposal 2.2): the field's `Schema.toEquivalence` where the domain gives its Schema, else structural. A throw is "differs".
const eqCache = new WeakMap<object, FieldEq>();
const fieldEq = (d: SealedDomain | undefined): FieldEq => {
  const fields = d?.fields;
  if (!fields) return (_f, a, b) => same(a, b);
  const hit = eqCache.get(fields);
  if (hit) return hit;
  const eqs = new Map(Object.entries(fields).map(([f, sc]) => [f, Schema.toEquivalence(sc as Schema.Schema<unknown>)]));
  const eq: FieldEq = (f, a, b) => {
    const e = eqs.get(f);
    if (!e || a === undefined || b === undefined) return same(a, b);
    return safely(() => e(a, b), false);
  };
  eqCache.set(fields, eq);
  return eq;
};
type Evidence = {
  readonly eq: FieldEq;
  readonly kind: "read" | "success" | "frame" | "repair" | "early";
  readonly start?: number; // a frame has none
  readonly carried: Carried;
  readonly version?: Ver;
  readonly versionField?: string;
};
type Order = number | "different" | undefined; // undefined: either has none
type Place = "older" | "same" | "newer" | "open";
type Verb = "stale" | "again" | "apply" | "replace" | "merge" | "doubt" | "applyDoubt" | "fill";
// D75: numbers order. A string orders only if the entity declares how; otherwise it is compared for equality, and different means "cannot place".
const compareVersions = (
  a: Ver | undefined,
  b: Ver | undefined,
  declared: SealedDomain["versionOrder"],
  cx: Cx,
): Order => {
  if (a === undefined || b === undefined) return undefined;
  if (a === b) return 0;
  if (declared !== undefined && declared !== "lexical") {
    const n = cx.user(declared, [a, b], () => NaN);
    return Number.isFinite(n) ? n : "different";
  }
  if (typeof a === "number" && typeof b === "number") return a < b ? -1 : 1;
  if (declared === "lexical" && typeof a === "string" && typeof b === "string")
    return a < b ? -1 : 1;
  return "different";
};
export const place = (r: Rec, ev: Evidence, order: Order): Place => {
  const pastClaim = !r.claim || (ev.start !== undefined && ev.start > r.claim.since);
  const pastLanding = ev.start !== undefined && ev.start >= r.landedAt;
  if (typeof order === "number" && order < 0) return "older";
  if (typeof order === "number" && order > 0) return pastClaim ? "newer" : "open";
  if (order === 0) {
    if (r.gone) return pastLanding ? "open" : "older"; // absent at v: a row at v is from before
    return pastClaim ? "same" : "open";
  }
  // No order between them. A frame has no start: arrival order, the stated limit, and only with nothing unplaced.
  if (ev.kind === "frame") return r.claim ? "open" : "newer";
  if (ev.kind === "early") return "open";
  return pastClaim && pastLanding ? "newer" : "open";
};
const carriedFields = (ev: Evidence) =>
  Object.keys(ev.carried.fields ?? {}).filter((k) => k !== ev.versionField);
const heldValue = (r: Rec, f: string) => (r.base && f in r.base ? r.base[f] : r.claim?.values?.[f]);
// It says something against what a write established.
const againstClaim = (r: Rec, ev: Evidence) => {
  const cl = r.claim;
  if (!cl) return false;
  const c = ev.carried;
  if (cl.removed) return !c.removed;
  if (c.removed) return true;
  return cl.fields.some((f) => c.fields && f in c.fields && !ev.eq(f, c.fields[f], heldValue(r, f)));
};
// H2 row 2: an echo carries *every* field the write established. A partial frame says nothing about the rest.
const echoes = (r: Rec, ev: Evidence) => {
  const cl = r.claim;
  if (!cl) return false;
  const c = ev.carried;
  if (cl.removed) return c.removed === true;
  if (c.removed) return false;
  return (
    cl.fields.length > 0 &&
    cl.fields.every((f) => c.fields && f in c.fields && ev.eq(f, c.fields[f], heldValue(r, f)))
  );
};
const heldDiffers = (r: Rec, ev: Evidence) => {
  if (ev.carried.removed) return r.base !== undefined;
  if (r.base === undefined) return r.gone === true;
  return carriedFields(ev).some((f) => !ev.eq(f, r.base?.[f], ev.carried.fields?.[f]));
};
const dispose = (r: Rec, ev: Evidence, p: Place, order: Order): Verb => {
  const repair = ev.kind === "repair";
  if (p === "older")
    return repair && ev.start !== undefined && r.landedAt > ev.start ? "again" : "stale";
  if (p === "same" || p === "newer") return repair ? "replace" : "apply";
  if (echoes(r, ev)) return repair ? "replace" : "apply";
  const against = againstClaim(r, ev);
  const ordered = typeof order === "number"; // an ordered newer or an equal version speaks only to what it carries
  const conflict = against || (!ordered && heldDiffers(r, ev));
  if (ev.kind === "success") return conflict ? "applyDoubt" : "apply";
  if (!conflict) return "merge";
  if (repair) return "again";
  if (against && order === 0) return "merge"; // an equal version with a differing claimed field is from before the write
  return r.base === undefined && !r.gone && ev.carried.removed !== true ? "fill" : "doubt";
};
const doubted = (s: Slice, ref: string, machine: string, cx: Cx): Slice => {
  const at = cx.pos();
  return startRepair(
    withRec(s, ref, (r) => ({ ...r, doubt: at })),
    ref,
    machine,
    cx,
  );
};
const withoutDoubtIf = (r: Rec, ev: Evidence): Rec => {
  if (ev.kind === "success" || ev.start === undefined || r.doubt === undefined) return r;
  if (ev.start < r.doubt) return r;
  const { doubt: _d, ...rest } = r;
  return rest;
};
const caughtUp = (r: Rec): Rec => {
  const { behind: _b, ...rest } = r;
  return rest;
};
const withoutClaim = (r: Rec): Rec => {
  const { claim: _c, ...rest } = r;
  return rest;
};
const addClaim = (
  r: Rec,
  since: number,
  fields: readonly string[],
  o: { removed?: true; values?: Readonly<Record<string, unknown>> } = {},
): Rec => {
  const old = r.claim;
  const values = { ...old?.values, ...o.values };
  return {
    ...r,
    claim: {
      since,
      fields: [...new Set([...(old && !old.removed ? old.fields : []), ...fields])],
      ...(o.removed ? { removed: true as const } : {}),
      ...(Object.keys(values).length ? { values } : {}),
    },
  };
};
// A row's version comes by the entity's field; a tombstone's by `Carried.version`. A value of no shape is no version, with an issue.
const versionOf = (c: Carried, machine: string, cx: Cx) => {
  const fn = domainOf(cx, machine)?.version;
  const field = fn ? cx.user(fn, [c.ref], () => undefined) : undefined;
  if (typeof field !== "string" && !(c.removed && c.version !== undefined))
    return { field: undefined, version: undefined };
  const v = c.removed ? c.version : c.fields?.[field as string];
  if (v === undefined) return { field, version: undefined };
  if ((typeof v === "number" && Number.isFinite(v)) || typeof v === "string")
    return { field, version: v as Ver };
  cx.issue("UserClosure", { where: `version of ${c.ref}`, why: "a version of no shape" });
  return { field, version: undefined };
};
const evidenceOf = (
  kind: Evidence["kind"],
  c: Carried,
  start: number | undefined,
  machine: string,
  cx: Cx,
): Evidence => {
  const { field, version } = versionOf(c, machine, cx);
  return {
    kind,
    eq: fieldEq(domainOf(cx, machine)),
    carried: c,
    ...(start === undefined ? {} : { start }),
    ...(version === undefined ? {} : { version }),
    ...(field === undefined ? {} : { versionField: field as string }),
  };
};
const take = (
  r: Rec,
  ev: Evidence,
  at: number,
  how: "merge" | "replace" = "merge",
  keep: readonly string[] = [],
): Rec => {
  const c = ev.carried;
  const version = ev.version ?? r.version;
  if (c.removed) {
    const { base: _b, version: _v, gone: _g, ...rest } = r;
    return {
      ...rest,
      gone: true,
      unconfirmed: [],
      landedAt: at,
      ...(version === undefined ? {} : { version }),
    };
  }
  const fields = Object.fromEntries(
    Object.entries(c.fields ?? {}).filter(([k]) => !keep.includes(k)),
  );
  const { gone: _g, ...rest } = r;
  return {
    ...rest,
    landedAt: at,
    base: how === "replace" ? fields : { ...r.base, ...fields },
    unconfirmed: how === "replace" ? [] : r.unconfirmed.filter((f) => !(f in fields)),
    ...(version === undefined ? {} : { version }),
  };
};
// The one way evidence touches a record.
const admit = (s0: Slice, ev: Evidence, machine: string, cx: Cx): { s: Slice; v: Verb } => {
  const ref = ev.carried.ref;
  const asked = ev.start;
  const asking = (ev.kind === "read" || ev.kind === "repair") && asked !== undefined;
  const s1 = asking && recOf(s0, ref).marks.length ? withRec(s0, ref, (x) => demote(x, (m) => m.given! <= asked)) : s0;
  const s = asking && recOf(s1, ref).behind !== undefined && asked >= recOf(s1, ref).behind! ? withRec(s1, ref, caughtUp) : s1;
  const r = recOf(s, ref);
  const order = compareVersions(ev.version, r.version, domainOf(cx, machine)?.versionOrder, cx);
  const p = place(r, ev, order);
  const v = dispose(r, ev, p, order);
  if (v === "stale") {
    cx.note("Stale", { ref, of: ev.kind });
    return { s: foldEarly(s, ev, ref, machine, cx), v };
  }
  if (v === "again") return { s, v };
  if (v === "doubt") return { s: foldEarly(doubted(s, ref, machine, cx), ev, ref, machine, cx), v };
  const at = cx.pos();
  const placed = p === "same" || p === "newer" || echoes(r, ev);
  // A merge at an equal version keeps what a write established; everything else it carries is the row's.
  const heldBack = v === "merge" && r.claim ? r.claim.fields : [];
  let next: Rec;
  if (v === "fill") {
    // No base, and a claim against this row: the row is applied under the claim, marked, so neither is lost (H1).
    const over = { ...r.claim?.values };
    const taken = take(r, ev, at);
    next = { ...taken, base: { ...taken.base, ...over } };
  } else next = take(r, ev, at, v === "replace" || (v === "apply" && ev.carried.evidence === "whole") ? "replace" : "merge", heldBack);
  next = withoutDoubtIf(next, ev);
  if (placed) next = withoutClaim(next);
  const out = prove(withRec(s, ref, () => next), ref, cx);
  const done = v === "applyDoubt" || v === "fill" ? doubted(out, ref, machine, cx) : out;
  return { s: foldEarly(done, ev, ref, machine, cx), v };
};
// D76: a read or repair has landed: what the feed said earlier is placed over it now, or was already in it.
const foldEarly = (s: Slice, ev: Evidence, ref: string, machine: string, cx: Cx): Slice => {
  if (ev.kind !== "read" && ev.kind !== "repair") return s;
  const e = recOf(s, ref).early;
  if (!e) return s;
  const { early: _e, ...rest } = recOf(s, ref);
  const out: Slice = {
    ...withRec(s, ref, () => rest),
    earlyOrder: s.earlyOrder.filter((x) => x !== ref),
  };
  if (ev.start !== undefined && ev.start > e.since) return out; // the read started after it
  const c: Carried = { ref, fields: e.fields, ...(e.whole ? { evidence: "whole" as const } : {}) };
  const replay = evidenceOf("early", c, undefined, machine, cx);
  return admit(out, replay, machine, cx).s;
};
const keepEarly = (s: Slice, c: Carried, ev: Evidence, machine: string, cx: Cx): Slice => {
  const old = recOf(s, c.ref).early;
  // Among themselves, the version places them too.
  const placed = compareVersions(ev.version, old?.version, domainOf(cx, machine)?.versionOrder, cx);
  if (typeof placed === "number" && placed < 0) return s;
  let out = withRec(s, c.ref, (r) => ({
    ...r,
    early: {
      since: old?.since ?? cx.pos(),
      fields: c.evidence === "whole" ? { ...c.fields } : { ...old?.fields, ...c.fields },
      ...(ev.version === undefined ? {} : { version: ev.version }),
      ...(c.evidence === "whole" || old?.whole ? { whole: true as const } : {}),
    },
  }));
  if (old) return out;
  let order = [...s.earlyOrder, c.ref];
  if (order.length > EARLY_BOUND) {
    const [gone, ...rest] = order;
    order = rest;
    const { early: _e, ...kept } = recOf(out, gone!);
    out = withRec(out, gone!, () => kept);
    cx.note("EarlyDropped", { ref: gone }); // D76: past the bound the race is back, and named
  }
  return { ...out, earlyOrder: order };
};
// D57: a mapper's result is a value from outside. What has no shape is dropped and named; it does not stop the store.
const carriedOf = (v: unknown, cx: Cx, where: string): readonly Carried[] => {
  const ok = (c: any) =>
    typeof c?.ref === "string" &&
    (c.removed === true ||
      c.fields === undefined ||
      (typeof c.fields === "object" && c.fields !== null && !Array.isArray(c.fields)));
  if (Array.isArray(v) && v.every(ok)) return v;
  cx.issue("UserClosure", { where, why: "a result of no shape" });
  return Array.isArray(v) ? v.filter(ok) : [];
};
// D66: a success moves the record whatever it carried. The table's five rows.
const rebase = (s: Slice, e: Entry, ref: string, v: Ver): Slice => {
  let out = s;
  for (const x of Object.values(s.entries))
    if (x !== e && !x.sent && x.mint > e.mint && x.refs.includes(ref) && same(x.basedOn[ref], e.basedOn[ref]))
      out = { ...out, entries: { ...out.entries, [x.attempt]: { ...x, basedOn: { ...x.basedOn, [ref]: v } } } };
  return out;
};
const confirm = (s: Slice, e: Entry, value: unknown, sentAt: number, cx: Cx): { s: Slice; covered: Covered } => {
  const fn = domainOf(cx, e.machine)?.writes[e.op]?.confirms;
  let threw = false;
  const raw = fn
    ? cx.user(fn, [value, e.input], () => {
        threw = true;
        return [];
      })
    : [];
  let out = s;
  const covered = new Map<string, "all" | readonly string[]>();
  // D46: nothing can be believed: the prediction ends, the record is in doubt.
  if (threw) {
    for (const ref of e.refs) out = doubted(out, ref, e.machine, cx);
    return { s: out, covered };
  }
  const carried = carriedOf(raw, cx, `domain.${e.op}.confirms`);
  const verdicts = new Map<string, Verb>();
  for (const c of carried) {
    const ev = evidenceOf("success", c, sentAt, e.machine, cx);
    const r = admit(out, ev, e.machine, cx);
    out = r.s;
    verdicts.set(c.ref, r.v);
    covered.set(c.ref, c.removed ? "all" : Object.keys(c.fields ?? {}));
    // OD19 Q32 A, narrowed: a never-sent write minted after this one, over the same base, takes the version this success returned.
    if (ev.version !== undefined && r.v !== "stale") out = rebase(out, e, c.ref, ev.version);
    // D74's success row: the version places it, or it stands as a claim until an echo or a later read.
    if (r.v !== "stale" && ev.version === undefined) {
      const at = recOf(out, c.ref).landedAt;
      out = withRec(out, c.ref, (x) =>
        c.removed ? addClaim(x, at, [], { removed: true }) : addClaim(x, at, carriedFields(ev)),
      );
    }
  }
  for (const ref of e.refs) {
    if (verdicts.get(ref) === "stale") continue; // what we hold is newer than this write's own answer
    const c = carried.find((x) => x.ref === ref);
    const live = e.predicted.filter((p) => p.ref === ref);
    if (!c && live.length === 0) {
      out = doubted(out, ref, e.machine, cx); // it landed and we cannot say what it did: a re-send, a restore
      continue;
    }
    for (const p of live) {
      if (c?.removed) continue;
      if (p.remove) {
        if (!c) {
          const at = cx.pos();
          out = withRec(out, ref, (x) =>
            addClaim(take(x, { kind: "success", eq: (_f, a, b) => same(a, b), carried: { ref, removed: true } }, at), at, [], {
              removed: true,
            }),
          );
        }
        continue;
      }
      if (!p.patch) continue;
      const r = recOf(out, ref);
      const names = Object.keys(p.patch);
      if (r.base === undefined) {
        // H1's second door: no row yet. What it established waits for one, as a claim. A field function has no base to run on: no value.
        const values = Object.fromEntries(
          Object.entries(p.patch).filter(([, v]) => typeof v !== "function"),
        );
        const at = cx.pos();
        out = withRec(out, ref, (x) => addClaim({ ...x, landedAt: at }, at, names, { values }));
        continue;
      }
      const held = names.filter((f) => !(c?.fields && f in c.fields));
      if (held.length === 0) continue;
      const applied = safely(() => applyPatch(r.base, p, e.input), r.base) as any;
      const at = cx.pos();
      out = withRec(out, ref, (x) => {
        const y = {
          ...x,
          base: { ...x.base, ...Object.fromEntries(held.map((f) => [f, applied?.[f]])) },
          unconfirmed: [...new Set([...x.unconfirmed, ...held])],
        };
        // A version carried placed this write, so what it omitted is only `unconfirmed`. Otherwise it stands as a claim.
        return c && versionOf(c, e.machine, cx).version !== undefined
          ? y
          : addClaim({ ...y, landedAt: at }, at, held);
      });
    }
  }
  return { s: out, covered };
};
// A repair has ended, however: the held Attempts' predictions on this record go, released entries may leave, the queue moves.
const endRepair = (s: Slice, ref: string, cx: Cx): Slice => {
  const cur = own(s.repairs, ref);
  if (!cur) return s;
  const { [ref]: _gone, ...repairs } = s.repairs;
  let out: Slice = { ...s, repairs };
  for (const id of recOf(out, ref).queue) {
    const e = out.entries[id];
    if (!e?.unknown) continue;
    const predicted = e.predicted.filter((p) => p.ref !== ref);
    out = { ...out, entries: { ...out.entries, [id]: { ...e, predicted } } };
    if (e.released && !e.refs.some((x) => own(out.repairs, x))) out = removeEntry(out, id);
  }
  cx.visible();
  return cur.again ? startRepair(out, ref, cur.machine, cx) : out;
};
// Unknown: predictions stay until the forced repair lands, the entry keeps its place, the record is marked for this Attempt.
const holdFor = (s: Slice, e: Entry, cx: Cx): Slice => {
  let out: Slice = { ...s, entries: { ...s.entries, [e.attempt]: { ...e, unknown: true } } };
  for (const ref of e.refs) {
    out = withRec(out, ref, (r) =>
      r.marks.some((m) => m.attempt === e.attempt)
        ? r
        : { ...r, marks: [...r.marks, markOf(e, ref, cx)] },
    );
    out = startRepair(out, ref, e.machine, cx);
  }
  return out;
};
// The convergence's tripwire (`GuardContradicted`, proposed): a `guarded` write's first send succeeded over a base the store already knew was stale
// (known > base), which a server enforcing the claim would have refused. Skipped for a business key (a new Attempt may replay a stored success) and for
// a re-send (it may replay its own). It catches a stale-base send only, never a commit that ignores a fresh base. The claim is void until a reload.
const contradicted = (s: Slice, e: Entry, cx: Cx): Slice => {
  const op = cx.machine(e.machine).ops[e.op];
  const id = `${e.machine}|${e.op}`;
  if (!op?.guarded || e.sends !== 1 || Array.isArray(op.idempotency) || s.voided.includes(id)) return s;
  const order = domainOf(cx, e.machine)?.versionOrder;
  const ref = e.targets.find((t) => {
    const k = compareVersions(e.known[t], e.basedOn[t], order, cx);
    return typeof k === "number" && 0 < k;
  });
  if (ref === undefined) return s;
  cx.note("GuardContradicted", { contract: op.contract, attempt: e.attempt, record: ref, basedOn: e.basedOn[ref], known: e.known[ref] });
  return { ...s, voided: [...s.voided, id] };
};
// A business key's success is a replay of every given-up Attempt of the same contract with the same values: the server holds the key, so a late
// copy is replayed or refused as a whole. Every record those Attempts touched ends its doubt.
const replayed = (s: Slice, e: Entry, cx: Cx): Slice => {
  const key = businessKey(e, cx);
  if (key === undefined) return s;
  const ofKey = (m: Mark) => m.given !== null && m.machine === e.machine && m.op === e.op && m.key === key;
  let out = s;
  for (const [ref, r] of Object.entries(s.records))
    if (r.marks.some(ofKey)) out = withRec(out, ref, (x) => ({ ...x, marks: x.marks.filter((m) => !ofKey(m)) }));
  return out;
};
const onEnded = (s: Slice, { attempt, how, sentAt }: Ended, cx: Cx): Slice => {
  const e = s.entries[attempt];
  if (!e) return s;
  cx.visible();
  if (how === "superseded") return removeEntry(s, attempt);
  if (how === "released") {
    let out: Slice = s;
    const at = cx.pos();
    for (const ref of e.refs)
      out = withRec(out, ref, (r) => ({
        ...r,
        marks: r.marks.map((m) => (m.attempt === attempt ? { ...m, given: at } : m)),
      }));
    for (const ref of e.refs) out = prove(out, ref, cx);
    out = e.refs.some((r) => own(s.repairs, r))
      ? { ...out, entries: { ...out.entries, [attempt]: { ...e, released: true } } }
      : removeEntry(out, attempt);
    for (const ref of e.refs) if (recOf(out, ref).marks.some((m) => m.attempt === attempt)) out = startRepair(out, ref, e.machine, cx);
    return evict(out, cx);
  }
  const ending: Ending = how;
  if (ending.ch === "success") {
    const c = confirm(contradicted(s, e, cx), e, ending.value, sentAt, cx);
    return replayed(removeEntry(clearMarks(c.s, e, c.covered), attempt), e, cx);
  }
  if (ending.ch === "failure") return removeEntry(s, attempt);
  return holdFor(s, e, cx);
};
const onAnswered = (s: Slice, a: ReadAnswer, cx: Cx): Slice => {
  const fn = domainOf(cx, a.machine)?.reads[a.op];
  if (!fn) return s;
  const raw = cx.user(fn, [a.value, a.input], () => []);
  const carried = carriedOf(raw, cx, `domain.${a.op}.read`);
  cx.visible();
  let out: Slice = {
    ...s,
    answers: {
      ...s.answers,
      [`${a.machine}|${a.op}|${text(a.input)}`]: {
        machine: a.machine,
        op: a.op,
        input: a.input,
        start: a.pos,
      },
    },
  };
  for (const c of carried)
    out = admit(out, evidenceOf("read", c, a.pos, a.machine, cx), a.machine, cx).s;
  return out;
};
// Q2 A: a read's `.gone(tag)`: that failure is a tombstone for the read's key, judged at the read's position like any answer. The machine
// still hears the failure; the core routes it as before.
const onFailed = (s: Slice, f: Extract<Told, { k: "failed" }>, cx: Cx): Slice => {
  const g = domainOf(cx, f.machine)?.gone?.[f.op];
  if (!g || g.tag !== f.tag) return s;
  const ref = cx.user(g.ref, [f.input], () => undefined as unknown as string);
  if (typeof ref !== "string") {
    if (ref !== undefined) cx.issue("UserClosure", { where: `domain.gone.${f.op}`, why: "a key of no shape" });
    return s;
  }
  cx.visible();
  return admit(s, evidenceOf("read", { ref, removed: true }, f.pos, f.machine, cx), f.machine, cx).s;
};
type Reread = {
  readonly k: "reread";
  readonly machine: string;
  readonly op: string;
  readonly input: unknown;
  readonly pos: number;
  readonly ok: boolean;
  readonly value?: unknown;
  readonly tag?: string; // a failure's own tag, so a refetch's `.gone` answer is one too
};
type RepairAnswer = {
  readonly k: "repair";
  readonly ref: string;
  readonly gen: string;
  readonly ok: boolean;
  readonly value?: any;
};
const onRepair = (s: Slice, a: RepairAnswer, cx: Cx): Slice => {
  const cur = own(s.repairs, a.ref);
  if (!cur || cur.gen !== a.gen) {
    cx.note("fence", { repair: a.ref });
    return s; // an answer to a repair this store no longer runs
  }
  if (
    !a.ok ||
    (a.value !== null &&
      a.value !== undefined &&
      (typeof a.value !== "object" || Array.isArray(a.value)))
  ) {
    cx.note("RepairFailed", { ref: a.ref }); // the doubt and the mark stay; asked again, up to the count
    return endRepair({ ...s, repairs: { ...s.repairs, [a.ref]: { ...cur, again: true } } }, a.ref, cx);
  }
  const gone = a.value === null || a.value === undefined;
  const c: Carried = gone ? { ref: a.ref, removed: true } : { ref: a.ref, fields: a.value };
  const r = recOf(s, a.ref);
  const { s: out, v } = admit(
    s,
    evidenceOf("repair", c, cur.pos, cur.machine, cx),
    cur.machine,
    cx,
  );
  // D58: a repair that started before something newer landed asks again, rather than go backwards. One judge: this branch only acts on it.
  if (v === "again" && !same(r.base ?? null, a.value ?? null)) {
    const { [a.ref]: _g, ...repairs } = out.repairs;
    return startRepair({ ...out, repairs }, a.ref, cur.machine, cx);
  }
  return endRepair(answered(out, a.ref), a.ref, cx);
};
// A push (2.8.14): "applied in order as they arrive, in a store publication, never through a turn". A patch of a record no list
// holds changes nothing (feed.domain.ts's stated gap); a tombstone is kept, so an older row cannot come back.
const onPushed = (s: Slice, p: Extract<Told, { k: "pushed" }>, cx: Cx): Slice => {
  const fn = domainOf(cx, p.machine)?.listens?.[p.op];
  if (!fn) return s;
  const raw = cx.user(fn, [p.value], () => []);
  let out = s;
  cx.visible();
  const tracks = domainOf(cx, p.machine)?.covers?.[p.op] === undefined;
  const had = out.delivered[p.session] ?? [];
  const mine = new Set(had);
  for (const c of carriedOf(raw, cx, `domain.${p.op}.listen`)) {
    const ev = evidenceOf("frame", c, undefined, p.machine, cx);
    // Q4 A: a delta is ordered by its version or it is nothing; the type refuses one without, so this is a value from outside.
    if (c.evidence === "partial" && ev.version === undefined) {
      cx.issue("UserClosure", { where: `domain.${p.op}.listen`, why: "a delta without its version" });
      continue;
    }
    mine.add(c.ref);
    const held = recOf(out, c.ref);
    if (!c.removed && held.base === undefined && !held.gone && !held.claim) {
      cx.note("NotHeld", { ref: c.ref });
      out = keepEarly(out, c, ev, p.machine, cx); // D76: a list may be on its way
      continue;
    }
    out = admit(out, ev, p.machine, cx).s;
  }
  return tracks && mine.size > had.length ? { ...out, delivered: { ...out.delivered, [p.session]: [...mine] } } : out;
};
// Q3 A: what a session covers. `.covers` is a conjunction of `eq` terms, each a record field against an input field or a value; absent, the
// records this session has itself delivered. A record with no row has nothing to cover.
const coveredBy = (s: Slice, g: Extract<Told, { k: "gap" }>, cx: Cx): readonly string[] => {
  const c = domainOf(cx, g.machine)?.covers?.[g.op];
  if (!c) return s.delivered[g.session] ?? [];
  const input = (g.input ?? {}) as Readonly<Record<string, unknown>>;
  const eq = fieldEq(domainOf(cx, g.machine));
  const within = Object.entries(s.records)
    .filter(([ref, r]) => ref.startsWith(`${c.entity}|`) && r.base !== undefined && c.where.every((t) => eq(t.field, r.base![t.field], "input" in t ? input[t.input] : t.value)))
    .map(([ref]) => ref);
  // Over-marking is the safe direction (Q3): a record whose filter fields this store holds in doubt, or predicts into the cover, may be in it.
  const mayBeIn = (ref: string, r: Rec) => {
    const shown = readRecord(s, ref)?.data as Readonly<Record<string, unknown>> | undefined;
    return c.where.every((t) => {
      const want = "input" in t ? input[t.input] : t.value;
      return eq(t.field, r.base![t.field], want) || (shown !== undefined && eq(t.field, shown[t.field], want)) || r.doubt !== undefined || r.unconfirmed.includes(t.field) || r.marks.some((m) => m.fields.includes(t.field));
    });
  };
  const sure = new Set(within);
  return [...within, ...Object.entries(s.records).filter(([ref, r]) => !sure.has(ref) && ref.startsWith(`${c.entity}|`) && r.base !== undefined && mayBeIn(ref, r)).map(([ref]) => ref)];
};
// T7: a gap starts a refetch of each answer read earlier. One at a time per answer: its generation fences a slow one. Q3 A: an unproven
// registration marks what the session covers as behind, until a read asked after it lands; a session that ends forgets what it delivered.
const onGap = (s0: Slice, g: Extract<Told, { k: "gap" }>, cx: Cx): Slice => {
  let s = s0;
  if (g.why === "unproven") {
    const refs = coveredBy(s, g, cx);
    if (refs.length) {
      const at = cx.pos();
      const keys = domainOf(cx, g.machine)?.primaryKey;
      if (keys) for (const ref of refs) s = withRec(s, ref, (r) => ({ ...r, keyed: keys[ref.slice(0, ref.indexOf("|"))] ?? [] }));
      for (const ref of refs) s = withRec(s, ref, (r) => ({ ...r, behind: at }));
      cx.visible();
    }
  }
  if (g.why === "ended" && s.delivered[g.session]) {
    const { [g.session]: _gone, ...delivered } = s.delivered;
    s = { ...s, delivered };
  }
  if (g.why !== "unproven" && s.live[g.session]) {
    const { [g.session]: _gone, ...live } = s.live;
    s = { ...s, live };
    cx.visible();
  }
  if (!cx.live) return s;
  const at = cx.pos();
  for (const a of Object.values(s.answers)) {
    if (a.machine !== g.machine || a.start > at) continue;
    cx.command({
      k: "reread",
      gen: cx.gen(),
      machine: a.machine,
      op: a.op,
      input: a.input,
      pos: cx.pos(),
    });
  }
  return s;
};
// A `guarded` write's fenced records: the domain's `targets` (compiled from `.one` or `many`), only among the records it predicts. None declared, none fenced.
const targetsOf = (w: { machine: string; op: string; input: unknown }, refs: readonly string[], cx: Cx): readonly string[] => {
  const fn = domainOf(cx, w.machine)?.writes[w.op]?.targets;
  if (!fn || !cx.machine(w.machine).ops[w.op]?.guarded) return [];
  const got = cx.user(fn, [w.input], () => [] as readonly string[]);
  return Array.isArray(got) ? got.filter((r): r is string => typeof r === "string" && refs.includes(r)) : [];
};
const isVer = (v: unknown): v is Ver => (typeof v === "number" && Number.isFinite(v)) || typeof v === "string";
const savedOf = (saved: unknown): { refs: readonly string[]; basedOn: Readonly<Record<string, Ver>>; sent: boolean; fine: boolean } => {
  const strings = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string"))] : []);
  if (saved === undefined) return { refs: [], basedOn: {}, sent: false, fine: true };
  if (Array.isArray(saved)) return { refs: strings(saved), basedOn: {}, sent: false, fine: strings(saved).length === saved.length };
  const o = saved as { refs?: unknown; basedOn?: unknown; sent?: unknown };
  const refs = strings(o?.refs);
  const raw = typeof o?.basedOn === "object" && o.basedOn !== null && !Array.isArray(o.basedOn) ? (o.basedOn as Record<string, unknown>) : {};
  const basedOn = Object.fromEntries(Object.entries(raw).filter((kv): kv is [string, Ver] => refs.includes(kv[0]) && isVer(kv[1])));
  const fine = Array.isArray(o?.refs) && refs.length === (o.refs as unknown[]).length && Object.keys(basedOn).length === Object.keys(raw).length && (o.sent === undefined || o.sent === true);
  return { refs, basedOn, sent: o.sent === true, fine };
};
export const entities: Module<Slice> = {
  id: "entities",
  rank: 20,
  store: true,
  init: () => empty,
  prepare(s, w, cx) {
    const write = domainOf(cx, w.machine)?.writes[w.op];
    if (!write) return undefined;
    // D57: `predicts` is a closure like any other. A result of no shape refuses this turn, where the turn can say so.
    const predicted = cx.user(
      asSlot(w.machine, write.predicts.at.path, (i: unknown) => {
        const v = write.predicts.run(i);
        const fine =
          Array.isArray(v) &&
          v.every(
            (p: any) =>
              typeof p?.ref === "string" &&
              (p.remove === true ||
                p.patch === undefined ||
                (typeof p.patch === "object" && p.patch !== null)),
          );
        if (!fine) throw new Error("a prediction of no shape");
        return v as readonly Predicted[];
      }),
      [w.input],
      () => [] as readonly Predicted[],
    );
    // Rule 28: a field function's throw refuses this turn. A prediction over nothing has none to run yet (E18).
    for (const p of predicted) {
      const base = recOf(s, p.ref).base;
      if (base)
        cx.user(
          asSlot(w.machine, `domain.${w.op}.predicts.field`, () => applyPatch(base, p, w.input)),
          [],
          () => undefined,
        );
    }
    return { predicted };
  },
  start(s, w, prepared, cx) {
    const p = prepared as { predicted: readonly Predicted[] } | undefined;
    if (!p) return { s, ok: true };
    const refs = [...new Set(p.predicted.map((x) => x.ref))];
    // Rule 35: a `many` key array (the write's `targets`) past 4,096 items is `Overloaded`, before any join.
    const many = domainOf(cx, w.machine)?.writes[w.op]?.targets;
    const keys: unknown = many ? cx.user(many, [w.input], () => [] as readonly string[]) : [];
    if (Array.isArray(keys) && keys.length > MANY_MAX) return { s, ok: false };
    // Rule 35: no partial join.
    if (refs.some((ref) => recOf(s, ref).queue.length + draftsOf(s, ref).length >= cx.queueMax)) return { s, ok: false };
    const basedOn = Object.fromEntries(refs.map((ref) => [ref, recOf(s, ref).version]));
    const e: Entry = { ...w, refs, predicted: p.predicted, unknown: false, released: false, joined: false, sent: false, basedOn, targets: targetsOf(w, refs, cx), sends: 0, known: {} };
    let out: Slice = { ...s, entries: { ...s.entries, [w.attempt]: e } };
    for (const ref of refs) out = withRec(out, ref, (r) => r);
    return { s: out, ok: true };
  },
  sent(s, attempt) {
    const e = s.entries[attempt];
    if (!e) return { s };
    const basedOn = e.refs.length === 1 ? e.basedOn[e.refs[0]!] : e.refs.some((r) => e.basedOn[r] !== undefined) ? e.basedOn : undefined;
    if (e.sends >= 2) return { s, basedOn };
    const known = e.sends === 0 ? Object.fromEntries(e.targets.map((t) => [t, recOf(s, t).version])) : e.known;
    return { s: { ...s, entries: { ...s.entries, [attempt]: { ...e, sent: true, sends: e.sends + 1, known } } }, basedOn };
  },
  sending(s, attempt) {
    const e = s.entries[attempt];
    if (!e || e.joined) return s;
    let out: Slice = { ...s, entries: { ...s.entries, [attempt]: { ...e, joined: true } } };
    for (const ref of e.refs) out = withRec(out, ref, (r) => ({ ...r, queue: [...r.queue, attempt] }));
    return out;
  },
  ended: onEnded,
  blocks(s, attempt): false | QueueClaim {
    const e = s.entries[attempt];
    if (!e) return false;
    for (const ref of e.refs) {
      const q = recOf(s, ref).queue;
      const at = q.indexOf(attempt);
      if (at > 0) return { on: "queue", behind: q.slice(0, at) };
    }
    // D39, narrowed by D47: a re-send waits for its own repair. A new write need not: a repair it overtakes answers stale.
    if (e.unknown) for (const ref of e.refs) if (own(s.repairs, ref)) return { on: "repair", ref };
    return false;
  },
  // The lane record carries what a restored re-send needs: the records, and the `basedOn` each was sent over (a precondition re-sent).
  save: (s, attempt) => {
    const e = s.entries[attempt];
    if (!e) return undefined;
    const basedOn = Object.fromEntries(Object.entries(e.basedOn).filter(([, v]) => v !== undefined));
    // `sent`: written after the send, so `basedOn` is the base it went with. Written before (the write-ahead), a later rebase may have moved it.
    return Object.keys(basedOn).length ? { refs: e.refs, basedOn, ...(e.sent ? { sent: true } : {}) } : e.refs;
  },
  restored(s, w, cx) {
    // D57: what is on disk is a value from outside. This module's own to check.
    const { refs, basedOn, sent, fine } = savedOf(w.saved);
    if (!fine) cx.issue("UserClosure", { where: "a saved entry", why: "a value of no shape" });
    const e: Entry = { ...w, refs, predicted: [], unknown: true, released: false, joined: true, sent: true, basedOn, targets: targetsOf(w, refs, cx), sends: 1, known: {}, ...(sent ? {} : { unsure: true as const }) };
    let out: Slice = { ...s, entries: { ...s.entries, [w.attempt]: e } };
    for (const ref of refs) {
      out = withRec(out, ref, (r) => ({
        ...r,
        queue: [...r.queue, w.attempt],
        marks: [...r.marks, markOf(e, ref, cx)],
      }));
      out = startRepair(out, ref, w.machine, cx);
    }
    return out;
  },
  told(s, fact: Told, cx) {
    if (fact.k === "answered") return onAnswered(s, fact, cx);
    if (fact.k === "failed") return onFailed(s, fact, cx);
    if (fact.k === "pushed") return onPushed(s, fact, cx);
    if (fact.k === "gap") return onGap(s, fact, cx);
    if (fact.k === "live") {
      const c = domainOf(cx, fact.machine)?.covers?.[fact.op];
      if (!c) return s;
      cx.visible();
      return { ...s, live: { ...s.live, [fact.session]: { entity: c.entity, where: c.where, input: (fact.input ?? {}) as Readonly<Record<string, unknown>> } } };
    }
    return s;
  },
  input(s, payload, cx) {
    const p = payload as RepairAnswer | Reread;
    if (p.k === "repair") return onRepair(s, p, cx);
    if (p.k === "reread")
      return p.ok
        ? onAnswered(
            s,
            {
              k: "answered",
              machine: p.machine,
              op: p.op,
              input: p.input,
              value: p.value,
              pos: p.pos,
            },
            cx,
          )
        : p.tag === undefined
          ? s
          : onFailed(s, { k: "failed", machine: p.machine, op: p.op, input: p.input, tag: p.tag, pos: p.pos }, cx);
    return s;
  },
  read: readRecord,
  waits(s) {
    const out: Array<{ attempt: string; op: string; ref: string }> = [];
    for (const ref of Object.keys(s.repairs))
      for (const id of recOf(s, ref).queue) {
        const e = s.entries[id];
        if (e?.unknown) out.push({ attempt: id, op: e.op, ref });
      }
    return out;
  },
  dispose(s, cx) {
    for (const [ref, r] of Object.entries(s.repairs)) cx.command({ k: "stop", ref, gen: r.gen });
    return { ...s, repairs: {} };
  },
  exec(cmd, io) {
    const c = cmd as {
      k: "repair" | "stop" | "reread";
      ref: string;
      gen: string;
      machine: string;
      op: string;
      input: unknown;
      pos: number;
    };
    if (c.k === "stop") return io.stop(`repair:${c.gen}`);
    if (c.k === "reread") {
      const eff = Effect.suspend(() =>
        (io.machine(c.machine).ops[c.op]!.commit as Slot<(i: unknown, c: unknown) => Effect.Effect<unknown, unknown>>).run(c.input, {
          attempt: { id: c.gen, mayHaveApplied: false },
        }),
      );
      return io.fork(`reread:${c.gen}`, eff, (exit) =>
        io.input({
          k: "reread",
          machine: c.machine,
          op: c.op,
          input: c.input,
          pos: c.pos,
          ok: exit.t === "ok",
          ...(exit.t === "ok" ? { value: exit.value } : {}),
          ...(exit.t === "failure" && typeof (exit.reason as { _tag?: unknown })?._tag === "string" ? { tag: (exit.reason as { _tag: string })._tag } : {}),
        } satisfies Reread),
      );
    }
    // D77: a closure that throws building its effect is a failed repair; the mark stays.
    const repair = (io.machine(c.machine).domain as unknown as SealedDomain).repair;
    const effect = Effect.suspend(() => repair.run(c.ref));
    io.fork(`repair:${c.gen}`, effect, (exit) =>
      io.input({
        k: "repair",
        ref: c.ref,
        gen: c.gen,
        ok: exit.t === "ok",
        ...(exit.t === "ok" ? { value: exit.value } : {}),
      } satisfies RepairAnswer),
    );
  },
};
