// The entities module (2.8). The core knows nothing of this file: it sees a Module. Records, predictions over a confirmed base,
// the record queue in mint order (D3), marks (rule 32), forced repair with a bound (D40), answer positions (D47). A sync engine
// would implement the same hooks with `blocks: false`; no such engine here. It stays optional: no core file imports it.
//
// Prior art, read: a retry stays in place and the first unresolved blocks: codebases/tanstack-query/packages/query-core/src/
// mutationCache.ts:161-173, codebases/db/packages/offline-transactions/src/executor/KeyScheduler.ts:21-34,
// codebases/mono/packages/replicache/src/pending-mutations.ts. Replaying pending writes over a new base:
// codebases/db/packages/db/src/collection/state.ts:580. A stale read must not win over a confirmed write:
// codebases/tanstack-query/packages/query-core/src/mutationObserver.ts's cancelQueries convention, here a position compare.
import type { Carried, Compiled, Predicted, Slot } from "../conformance/fixtures/compiled.ts";
import type { Claim, Cx, Ended, Module, ReadAnswer, Told } from "./seam.ts";
import { own, same } from "./gate.ts";
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
};
type Mark = { readonly attempt: string; readonly mint: number; readonly given: boolean };
type Rec = {
  readonly base?: Readonly<Record<string, unknown>>;
  readonly unconfirmed: readonly string[];
  readonly marks: readonly Mark[];
  readonly queue: readonly string[]; // mint order by construction: mints only grow, a retry never rejoins (S13)
  readonly changedAt: number; // D58: the tick at which what `base` holds arrived
  readonly doubt?: number; // D58: the tick a doubt began. Goes only by a read that started after it
  readonly version?: string | number; // D67: from the entity's declared field, or a tombstone's
  readonly unechoed?: number; // D67: the tick of a confirmed write this record's version and position cannot place yet
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
};
const NONE: Rec = { unconfirmed: [], marks: [], queue: [], changedAt: 0 };
// D65: `ref` comes from a closure: "constructor" is a name like any other.
const empty: Slice = { records: {}, entries: {}, repairs: {} };
const recOf = (s: Slice, ref: string): Rec => own(s.records, ref) ?? NONE;
const withRec = (s: Slice, ref: string, f: (r: Rec) => Rec): Slice => ({
  ...s,
  records: { ...s.records, [ref]: f(recOf(s, ref)) },
});
const domainOf = (cx: { machine(id: string): Compiled }, machine: string) =>
  cx.machine(machine).domain;
const TIMER = "repair/";
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
export const readRecord = (s: Slice, ref: string) => {
  const r = own(s.records, ref);
  if (!r) return undefined;
  let data: any = r.base;
  let predicted = false;
  for (const id of r.queue) {
    const e = s.entries[id];
    if (!e) continue;
    for (const p of e.predicted) {
      if (p.ref !== ref) continue;
      predicted = true;
      const before = data;
      data = safely(() => applyPatch(before, p, e.input), before);
    }
  }
  const uncertain = r.marks.length > 0 || r.doubt !== undefined;
  if (r.base === undefined && !predicted && !uncertain && r.queue.length === 0) return undefined;
  return { data, predicted, uncertain, unconfirmed: r.unconfirmed };
};
export const readAll = (s: Slice) =>
  Object.fromEntries(
    Object.keys(s.records)
      .map((ref) => [ref, readRecord(s, ref)!])
      .filter(([, v]) => v),
  );

const startRepair = (s: Slice, ref: string, machine: string, cx: Cx): Slice => {
  const cur = own(s.repairs, ref);
  if (cur) return { ...s, repairs: { ...s.repairs, [ref]: { ...cur, again: true } } };
  const gen = cx.gen();
  const pos = cx.pos();
  cx.command({ k: "repair", ref, gen, machine });
  cx.arm(`${TIMER}${ref}`, cx.now + cx.repairMs);
  cx.note("repair", { ref });
  return { ...s, repairs: { ...s.repairs, [ref]: { gen, machine, again: false, pos } } };
};
const removeEntry = (s: Slice, attempt: string): Slice => {
  const e = s.entries[attempt];
  if (!e) return s;
  const { [attempt]: _gone, ...entries } = s.entries;
  let out: Slice = { ...s, entries };
  for (const ref of e.refs)
    out = withRec(out, ref, (r) => ({ ...r, queue: r.queue.filter((x) => x !== attempt) }));
  return out;
};
const clearMarks = (s: Slice, e: Entry, cx: Cx): Slice => {
  let out = s;
  for (const ref of e.refs) {
    const r = recOf(out, ref);
    // Rule 32: its own mark, and every mark on the record given up by an older Attempt. An unresolved one stays.
    const gone = r.marks.filter((m) => m.attempt === e.attempt || (m.given && m.mint < e.mint));
    out = withRec(out, ref, (x) => ({ ...x, marks: x.marks.filter((m) => !gone.includes(m)) }));
    // D55: a given-up write may still land. Look once, so a late landing is usually seen.
    if (gone.some((m) => m.given)) out = startRepair(out, ref, e.machine, cx);
  }
  return out;
};
// ── D66: one judge for all evidence. D67: the version places it if it and the record have one and no write stands unplaced; otherwise
// when it started; and what cannot be placed either way never overwrites silently. A table: convergence-5.
type Ver = number | string;
type Evidence = {
  readonly kind: "read" | "success" | "frame" | "repair";
  readonly start?: number; // a frame has none
  readonly carried: Carried;
  readonly version?: Ver;
  readonly versionField?: string;
};
type Verdict = "apply" | "keepUnconfirmed" | "stale" | "doubt" | "applyDoubt" | "again";
const older = (a: Ver, b: Ver) =>
  typeof a === typeof b ? (a === b ? 0 : a < b ? -1 : 1) : undefined;
const differs = (r: Rec, ev: Evidence) => {
  const c = ev.carried;
  if (c.removed) return r.base !== undefined;
  if (r.base === undefined) return true;
  return !Object.entries(c.fields ?? {}).every(
    ([k, v]) => k === ev.versionField || same(r.base?.[k], v),
  );
};
const judge = (r: Rec, ev: Evidence): Verdict => {
  const order =
    ev.version !== undefined && r.version !== undefined ? older(ev.version, r.version) : undefined;
  const placed = r.unechoed === undefined;
  if (order !== undefined && order < 0)
    return ev.kind === "repair" && ev.start !== undefined && r.changedAt > ev.start
      ? "again"
      : "stale";
  if (order === 0) {
    if (placed) return "apply";
    return r.base === undefined ? "stale" : "keepUnconfirmed"; // an equal version cannot show a write that moved it
  }
  if (order !== undefined && placed) return "apply";
  // By position.
  const overlap = ev.start === undefined ? !placed : r.changedAt > ev.start;
  if (!overlap || !differs(r, ev)) return "apply";
  return ev.kind === "success" ? "applyDoubt" : ev.kind === "repair" ? "again" : "doubt";
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
// What a judged answer settles: a doubt or an unplaced write older than when it started.
const settled = (r: Rec, ev: Evidence, matched: boolean): Rec => {
  let out = r;
  if (ev.kind === "success") return out; // only a read says what is true now
  if (ev.start !== undefined && out.doubt !== undefined && ev.start >= out.doubt) {
    const { doubt: _d, ...rest } = out;
    out = rest;
  }
  if (
    out.unechoed !== undefined &&
    (matched || (ev.start !== undefined && ev.start > out.unechoed))
  ) {
    const { unechoed: _u, ...rest } = out;
    out = rest;
  }
  return out;
};
// A row's version comes by the entity's field; a tombstone's by `Carried.version`. A value of no shape is no version, with an issue.
const versionOf = (c: Carried, machine: string, cx: Cx) => {
  const fn = domainOf(cx, machine)?.version;
  const field = fn
    ? cx.user(asSlot(machine, "domain.version", fn), [c.ref], () => undefined)
    : undefined;
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
    carried: c,
    ...(start === undefined ? {} : { start }),
    ...(version === undefined ? {} : { version }),
    ...(field === undefined ? {} : { versionField: field as string }),
  };
};
const take = (r: Rec, ev: Evidence, at: number, keep: readonly string[] = []): Rec => {
  const c = ev.carried;
  const version = ev.version ?? r.version;
  if (c.removed) {
    const { base: _b, version: _v, ...rest } = r;
    return { ...rest, unconfirmed: [], changedAt: at, ...(version === undefined ? {} : { version }) };
  }
  const fields = Object.fromEntries(
    Object.entries(c.fields ?? {}).filter(([k]) => !keep.includes(k)),
  );
  return {
    ...r,
    changedAt: at,
    base: { ...r.base, ...fields },
    unconfirmed: r.unconfirmed.filter((f) => !(f in fields)),
    ...(version === undefined ? {} : { version }),
  };
};
// The one way evidence touches a record. Returns what it did, for a success's own remainder.
const admit = (s: Slice, ev: Evidence, machine: string, cx: Cx): { s: Slice; v: Verdict } => {
  const ref = ev.carried.ref;
  const r = recOf(s, ref);
  const v = judge(r, ev);
  if (v === "stale") {
    cx.note("Stale", { ref, of: ev.kind });
    return { s, v };
  }
  if (v === "again") return { s, v };
  if (v === "doubt") return { s: doubted(s, ref, machine, cx), v };
  const matched = !differs(r, ev);
  const at = cx.pos();
  let next = take(r, ev, at, v === "keepUnconfirmed" ? r.unconfirmed : []);
  next = settled(next, ev, matched);
  // D67's success row: the version places it, or it stands unplaced until an echo.
  if (ev.kind === "success" && ev.version === undefined) next = { ...next, unechoed: at };
  const out = withRec(s, ref, () => next);
  return { s: v === "applyDoubt" ? doubted(out, ref, machine, cx) : out, v };
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
const confirm = (s: Slice, e: Entry, value: unknown, sentAt: number, cx: Cx): Slice => {
  const fn = domainOf(cx, e.machine)?.writes[e.op]?.confirms;
  let threw = false;
  const raw = fn
    ? cx.user(asSlot(e.machine, `domain.${e.op}.confirms`, fn), [value, e.input], () => {
        threw = true;
        return [];
      })
    : [];
  let out = s;
  // D46: nothing can be believed: the prediction ends, the record is in doubt.
  if (threw) {
    for (const ref of e.refs) out = doubted(out, ref, e.machine, cx);
    return out;
  }
  const carried = carriedOf(raw, cx, `domain.${e.op}.confirms`);
  const verdicts = new Map<string, Verdict>();
  for (const c of carried) {
    const r = admit(out, evidenceOf("success", c, sentAt, e.machine, cx), e.machine, cx);
    out = r.s;
    verdicts.set(c.ref, r.v);
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
          out = withRec(out, ref, (x) => ({
            ...take(x, { kind: "success", carried: { ref, removed: true } }, at),
            unechoed: at,
          }));
        }
        continue;
      }
      if (!p.patch) continue;
      const r = recOf(out, ref);
      if (r.base === undefined) continue;
      const held = Object.keys(p.patch).filter((f) => !(c?.fields && f in c.fields));
      if (held.length === 0) continue;
      const applied = safely(() => applyPatch(r.base, p, e.input), r.base) as any;
      const at = cx.pos();
      out = withRec(out, ref, (x) => ({
        ...x,
        ...(c ? {} : { changedAt: at, unechoed: at }),
        base: { ...x.base, ...Object.fromEntries(held.map((f) => [f, applied?.[f]])) },
        unconfirmed: [...new Set([...x.unconfirmed, ...held])],
      }));
    }
  }
  return out;
};
// A repair has ended, however: the held Attempts' predictions on this record go, released entries may leave, the queue moves.
const endRepair = (s: Slice, ref: string, cx: Cx): Slice => {
  const cur = own(s.repairs, ref);
  if (!cur) return s;
  cx.disarm(`${TIMER}${ref}`);
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
        : { ...r, marks: [...r.marks, { attempt: e.attempt, mint: e.mint, given: false }] },
    );
    out = startRepair(out, ref, e.machine, cx);
  }
  return out;
};
const onEnded = (s: Slice, { attempt, how, sentAt }: Ended, cx: Cx): Slice => {
  const e = s.entries[attempt];
  if (!e) return s;
  cx.visible();
  if (how === "superseded") return removeEntry(s, attempt);
  if (how === "released") {
    let out: Slice = s;
    for (const ref of e.refs)
      out = withRec(out, ref, (r) => ({
        ...r,
        marks: r.marks.map((m) => (m.attempt === attempt ? { ...m, given: true } : m)),
      }));
    return e.refs.some((r) => own(s.repairs, r))
      ? { ...out, entries: { ...out.entries, [attempt]: { ...e, released: true } } }
      : removeEntry(out, attempt);
  }
  const ending: Ending = how;
  if (ending.ch === "success")
    return removeEntry(clearMarks(confirm(s, e, ending.value, sentAt, cx), e, cx), attempt);
  if (ending.ch === "failure") return removeEntry(s, attempt);
  return holdFor(s, e, cx);
};
const onAnswered = (s: Slice, a: ReadAnswer, cx: Cx): Slice => {
  const fn = domainOf(cx, a.machine)?.reads[a.op];
  if (!fn) return s;
  const raw = cx.user(asSlot(a.machine, `domain.${a.op}.read`, fn), [a.value, a.input], () => []);
  const carried = carriedOf(raw, cx, `domain.${a.op}.read`);
  cx.visible();
  let out = s;
  for (const c of carried) out = admit(out, evidenceOf("read", c, a.pos, a.machine, cx), a.machine, cx).s;
  return out;
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
    return s; // D40: a late answer, after the bound
  }
  if (
    !a.ok ||
    (a.value !== null && a.value !== undefined && (typeof a.value !== "object" || Array.isArray(a.value)))
  ) {
    cx.note("RepairFailed", { ref: a.ref }); // the doubt and the mark stay
    return endRepair(s, a.ref, cx);
  }
  const gone = a.value === null || a.value === undefined;
  const c: Carried = gone ? { ref: a.ref, removed: true } : { ref: a.ref, fields: a.value };
  const ev = evidenceOf("repair", c, cur.pos, cur.machine, cx);
  const r = recOf(s, a.ref);
  const whole = !same(r.base ?? null, a.value ?? null);
  const v = judge(r, ev);
  // D58: a repair that started before something newer landed asks again, rather than go backwards.
  if (v === "again" && whole) {
    const { [a.ref]: _g, ...repairs } = s.repairs;
    cx.disarm(`${TIMER}${a.ref}`);
    return startRepair({ ...s, repairs }, a.ref, cur.machine, cx);
  }
  if (v === "stale") return endRepair(s, a.ref, cx);
  const at = cx.pos();
  const out = withRec(s, a.ref, (x0) => {
    const { unechoed: _u, ...x } = settled(x0, ev, true);
    const version = ev.version ?? x.version;
    if (gone) {
      const { base: _b, ...rest } = x;
      return { ...rest, unconfirmed: [], changedAt: at };
    }
    return {
      ...x,
      base: a.value,
      unconfirmed: [],
      changedAt: at,
      ...(version === undefined ? {} : { version }),
    };
  });
  return endRepair(out, a.ref, cx);
};
// A push (2.8.14): "applied in order as they arrive, in a store publication, never through a turn". A patch of a record no list
// holds changes nothing (feed.domain.ts's stated gap); a tombstone is kept, so an older row cannot come back.
const onPushed = (s: Slice, p: PushedFrame, cx: Cx): Slice => {
  const fn = domainOf(cx, p.machine)?.listens?.[p.op];
  if (!fn) return s;
  const raw = cx.user(asSlot(p.machine, `domain.${p.op}.listen`, fn), [p.value], () => []);
  let out = s;
  cx.visible();
  for (const c of carriedOf(raw, cx, `domain.${p.op}.listen`)) {
    const ev = evidenceOf("frame", c, undefined, p.machine, cx);
    if (!c.removed && recOf(out, c.ref).base === undefined && recOf(out, c.ref).queue.length === 0) {
      cx.note("NotHeld", { ref: c.ref });
      continue;
    }
    out = admit(out, ev, p.machine, cx).s;
  }
  return out;
};
export type PushedFrame = {
  readonly k: "pushed";
  readonly machine: string;
  readonly op: string;
  readonly value: unknown;
};

export const entities: Module<Slice> = {
  id: "entities",
  rank: 20,
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
              (p.remove === true || p.patch === undefined || (typeof p.patch === "object" && p.patch !== null)),
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
    // Rule 35: no partial join.
    if (refs.some((ref) => recOf(s, ref).queue.length >= cx.queueMax)) return { s, ok: false };
    const e: Entry = { ...w, refs, predicted: p.predicted, unknown: false, released: false };
    let out: Slice = { ...s, entries: { ...s.entries, [w.attempt]: e } };
    for (const ref of refs)
      out = withRec(out, ref, (r) => ({ ...r, queue: [...r.queue, w.attempt] }));
    return { s: out, ok: true };
  },
  ended: onEnded,
  blocks(s, attempt): false | Claim {
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
  save: (s, attempt) => s.entries[attempt]?.refs,
  restored(s, w, cx) {
    // D57: what is on disk is a value from outside. This module's own to check.
    const saved = w.saved;
    if (saved !== undefined && !(Array.isArray(saved) && saved.every((x) => typeof x === "string")))
      cx.issue("UserClosure", { where: "a saved entry", why: "a value of no shape" });
    const refs: readonly string[] = Array.isArray(saved)
      ? saved.filter((x): x is string => typeof x === "string")
      : [];
    const e: Entry = { ...w, refs, predicted: [], unknown: true, released: false };
    let out: Slice = { ...s, entries: { ...s.entries, [w.attempt]: e } };
    for (const ref of refs) {
      out = withRec(out, ref, (r) => ({
        ...r,
        queue: [...r.queue, w.attempt],
        marks: [...r.marks, { attempt: w.attempt, mint: w.mint, given: false }],
      }));
      out = startRepair(out, ref, w.machine, cx);
    }
    return out;
  },
  told(s, fact: Told, cx) {
    if (fact.k === "answered") return onAnswered(s, fact, cx);
    if (fact.k === "module" && (fact.payload as PushedFrame)?.k === "pushed")
      return onPushed(s, fact.payload as PushedFrame, cx);
    return s;
  },
  input(s, payload, cx) {
    const p = payload as RepairAnswer | { k: "timer"; key: string };
    if (p.k === "repair") return onRepair(s, p, cx);
    const ref = p.key.slice(TIMER.length);
    cx.note("RepairOverdue", { ref }); // the mark stays
    cx.command({ k: "stop", ref, gen: own(s.repairs, ref)?.gen });
    return endRepair(s, ref, cx);
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
    const c = cmd as { k: "repair" | "stop"; ref: string; gen: string; machine: string };
    if (c.k === "stop") return io.stop(`repair:${c.gen}`);
    const effect = io.machine(c.machine).domain!.repair(c.ref);
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
