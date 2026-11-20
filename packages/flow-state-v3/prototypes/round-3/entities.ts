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
import type { Claim, Cx, Ended, Module, ReadAnswer } from "./seam.ts";
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
  readonly changedAt: number; // D47: the position of the last answer applied to `base`
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
const empty: Slice = { records: {}, entries: {}, repairs: {} };
const recOf = (s: Slice, ref: string): Rec => s.records[ref] ?? NONE;
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
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

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
  const r = s.records[ref];
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
  if (r.base === undefined && !predicted && r.marks.length === 0 && r.queue.length === 0)
    return undefined;
  return { data, predicted, uncertain: r.marks.length > 0, unconfirmed: r.unconfirmed };
};
export const readAll = (s: Slice) =>
  Object.fromEntries(
    Object.keys(s.records)
      .map((ref) => [ref, readRecord(s, ref)!])
      .filter(([, v]) => v),
  );

const startRepair = (s: Slice, ref: string, machine: string, cx: Cx): Slice => {
  const cur = s.repairs[ref];
  if (cur) return { ...s, repairs: { ...s.repairs, [ref]: { ...cur, again: true } } };
  const gen = cx.gen();
  cx.command({ k: "repair", ref, gen, machine });
  cx.arm(`${TIMER}${ref}`, cx.now + cx.repairMs);
  cx.note("repair", { ref });
  return { ...s, repairs: { ...s.repairs, [ref]: { gen, machine, again: false, pos: cx.pos() } } };
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
// D47: an answer older than what we hold, and different, is not applied. Otherwise it applies and the position moves.
const staleFields = (r: Rec, fields: Readonly<Record<string, unknown>>, pos: number) =>
  r.changedAt > pos && !Object.entries(fields).every(([k, v]) => same(r.base?.[k], v));
const carry = (s: Slice, ref: string, c: Carried, at: number): Slice =>
  withRec(s, ref, (r) => {
    if (c.removed) {
      const { base: _b, ...rest } = r;
      return { ...rest, unconfirmed: [], changedAt: at };
    }
    const fields = c.fields ?? {};
    return {
      ...r,
      changedAt: at,
      base: { ...r.base, ...fields },
      unconfirmed: r.unconfirmed.filter((f) => !(f in fields)),
    };
  });
const confirm = (s: Slice, e: Entry, value: unknown, sentAt: number, cx: Cx): Slice => {
  const fn = domainOf(cx, e.machine)?.writes[e.op]?.confirms;
  let threw = false;
  const carried = fn
    ? cx.user(asSlot(e.machine, `domain.${e.op}.confirms`, fn), [value, e.input], () => {
        threw = true;
        return [];
      })
    : [];
  let out = s;
  // D46: nothing can be believed: the prediction ends, the record is repaired.
  if (threw) {
    for (const ref of e.refs) out = startRepair(out, ref, e.machine, cx);
    return out;
  }
  const staleRefs = new Set<string>();
  for (const c of carried) {
    const r = recOf(out, c.ref);
    if (!c.removed && staleFields(r, c.fields ?? {}, sentAt)) {
      staleRefs.add(c.ref);
      out = startRepair(out, c.ref, e.machine, cx);
      continue;
    }
    out = carry(out, c.ref, c, cx.pos());
  }
  // Fields predicted and not carried stay, unconfirmed, until a read (2.8.6's success row).
  for (const p of e.predicted) {
    if (p.remove || !p.patch || staleRefs.has(p.ref)) continue;
    const c = carried.find((x) => x.ref === p.ref);
    if (c?.removed) continue;
    const r = recOf(out, p.ref);
    if (r.base === undefined) continue;
    const held = Object.keys(p.patch).filter((f) => !(c?.fields && f in c.fields));
    if (held.length === 0) continue;
    const applied = safely(() => applyPatch(r.base, p, e.input), r.base) as any;
    out = withRec(out, p.ref, (x) => ({
      ...x,
      base: { ...x.base, ...Object.fromEntries(held.map((f) => [f, applied?.[f]])) },
      unconfirmed: [...new Set([...x.unconfirmed, ...held])],
    }));
  }
  return out;
};
// A repair has ended, however: the held Attempts' predictions on this record go, released entries may leave, the queue moves.
const endRepair = (s: Slice, ref: string, cx: Cx): Slice => {
  const cur = s.repairs[ref];
  if (!cur) return s;
  cx.disarm(`${TIMER}${ref}`);
  const { [ref]: _gone, ...repairs } = s.repairs;
  let out: Slice = { ...s, repairs };
  for (const id of recOf(out, ref).queue) {
    const e = out.entries[id];
    if (!e?.unknown) continue;
    const predicted = e.predicted.filter((p) => p.ref !== ref);
    out = { ...out, entries: { ...out.entries, [id]: { ...e, predicted } } };
    if (e.released && !e.refs.some((x) => out.repairs[x])) out = removeEntry(out, id);
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
    return e.refs.some((r) => s.repairs[r])
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
  const carried = cx.user(
    asSlot(a.machine, `domain.${a.op}.read`, fn),
    [a.value, a.input],
    () => [],
  );
  cx.visible();
  let out = s;
  for (const c of carried) {
    const r = recOf(out, c.ref);
    if (c.removed) {
      out = carry(out, c.ref, c, cx.pos());
      continue;
    }
    if (staleFields(r, c.fields ?? {}, a.pos)) {
      out = startRepair(out, c.ref, a.machine, cx); // M3: the server decides
      continue;
    }
    out = withRec(out, c.ref, (x) => ({
      ...x,
      base: c.fields ?? {},
      unconfirmed: [],
      changedAt: cx.pos(),
    }));
  }
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
  const cur = s.repairs[a.ref];
  if (!cur || cur.gen !== a.gen) {
    cx.note("fence", { repair: a.ref });
    return s; // D40: a late answer, after the bound
  }
  if (!a.ok) {
    cx.note("RepairFailed", { ref: a.ref });
    return endRepair(s, a.ref, cx);
  }
  const r = recOf(s, a.ref);
  // D47: a repair that started before something newer landed asks again, rather than go backwards.
  if (r.changedAt > cur.pos && !same(r.base ?? null, a.value ?? null)) {
    const { [a.ref]: _g, ...repairs } = s.repairs;
    cx.disarm(`${TIMER}${a.ref}`);
    return startRepair({ ...s, repairs }, a.ref, cur.machine, cx);
  }
  const out = withRec(s, a.ref, (x) => {
    if (a.value === null || a.value === undefined) {
      const { base: _b, ...rest } = x;
      return { ...rest, unconfirmed: [], changedAt: cx.pos() };
    }
    return { ...x, base: a.value, unconfirmed: [], changedAt: cx.pos() };
  });
  return endRepair(out, a.ref, cx);
};

export const entities: Module<Slice> = {
  id: "entities",
  rank: 20,
  init: () => empty,
  prepare(s, w, cx) {
    const write = domainOf(cx, w.machine)?.writes[w.op];
    if (!write) return undefined;
    const predicted = cx.user(write.predicts, [w.input], () => []);
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
    if (e.unknown) for (const ref of e.refs) if (s.repairs[ref]) return { on: "repair", ref };
    return false;
  },
  save: (s, attempt) => s.entries[attempt]?.refs,
  restored(s, w, cx) {
    const refs = (w.saved as readonly string[] | undefined) ?? [];
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
  input(s, payload, cx) {
    const p = payload as RepairAnswer | ReadAnswer | { k: "timer"; key: string };
    if (p.k === "answered") return onAnswered(s, p, cx);
    if (p.k === "repair") return onRepair(s, p, cx);
    const ref = p.key.slice(TIMER.length);
    cx.note("RepairOverdue", { ref }); // the mark stays
    cx.command({ k: "stop", ref, gen: s.repairs[ref]?.gen });
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
