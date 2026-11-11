// The entities module (2.8). The core knows nothing of this file: it sees a Module. Records, predictions over a confirmed
// base, the record queue in mint order (D3), marks (rule 32), forced repair with a bound (D40). A sync engine would implement
// the same hooks with `blocks: false` (D42); no such engine here.
//
// Prior art, read: a retry stays in place and the first unresolved blocks: codebases/tanstack-query/packages/query-core/src/
// mutationCache.ts:161-173 (`canRun`), codebases/db/packages/offline-transactions/src/executor/KeyScheduler.ts:21-34,
// codebases/mono/packages/replicache/src/pending-mutations.ts. Replaying pending writes over a new base:
// codebases/db/packages/db/src/collection/state.ts:580 (`recomputeOptimisticState`). A mint counter apart from any id:
// codebases/db/packages/db/src/transactions.ts:28,78.
import type { Carried, Compiled, Predicted } from "../conformance/fixtures/compiled.ts";
import type { Claim, Cx, Module } from "./seam.ts";
import type { Ending } from "./world.ts";

type Entry = {
  readonly attempt: string;
  readonly mint: number;
  readonly machine: string;
  readonly op: string;
  readonly input: unknown;
  readonly refs: readonly string[];
  readonly predicted: readonly Predicted[]; // live predictions; a forced repair ends them
  readonly unknown: boolean; // its Attempt has ended unknown at least once
  readonly released: boolean; // given up: it leaves when its repair settles
};
type Mark = { readonly attempt: string; readonly mint: number; readonly given: boolean };
type Rec = {
  readonly base?: Readonly<Record<string, unknown>>;
  readonly unconfirmed: readonly string[];
  readonly marks: readonly Mark[];
  readonly queue: readonly string[]; // attempts, in mint order by construction: mints only grow, a retry never rejoins (S13)
};
type Repair = { readonly gen: string; readonly machine: string; readonly again: boolean };
export type Slice = {
  readonly records: Readonly<Record<string, Rec>>;
  readonly entries: Readonly<Record<string, Entry>>;
  readonly repairs: Readonly<Record<string, Repair>>;
};
const NONE: Rec = { unconfirmed: [], marks: [], queue: [] };
const empty: Slice = { records: {}, entries: {}, repairs: {} };
const recOf = (s: Slice, ref: string): Rec => s.records[ref] ?? NONE;
const withRec = (s: Slice, ref: string, f: (r: Rec) => Rec): Slice => ({
  ...s,
  records: { ...s.records, [ref]: f(recOf(s, ref)) },
});
const domainOf = (cx: { machine(id: string): Compiled }, machine: string) =>
  cx.machine(machine).domain;
const timerKey = (ref: string) => `repair/${ref}`;

const applyPatch = (base: any, p: Predicted, input: unknown) => {
  if (p.remove) return undefined;
  if (base === undefined) return undefined; // E18: a prediction over a record the store does not hold shows nothing
  const next: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(p.patch ?? {}))
    next[k] = typeof v === "function" ? (v as (b: unknown, i: unknown) => unknown)(base, input) : v;
  return next;
};
// Every prediction on this record, in queue order, over the confirmed base: a new base replays them (E11).
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
      data = applyPatch(data, p, e.input);
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
  cx.arm(timerKey(ref), cx.now + cx.repairMs);
  cx.note("repair", { ref });
  return { ...s, repairs: { ...s.repairs, [ref]: { gen, machine, again: false } } };
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
const clearMarks = (s: Slice, e: Entry): Slice => {
  let out = s;
  for (const ref of e.refs)
    out = withRec(out, ref, (r) => ({
      ...r,
      // Rule 32: its own mark, and every mark on the record given up by an older Attempt. An unresolved one stays.
      marks: r.marks.filter((m) => !(m.attempt === e.attempt || (m.given && m.mint < e.mint))),
    }));
  return out;
};
const carry = (s: Slice, ref: string, c: Carried): Slice =>
  withRec(s, ref, (r) => {
    if (c.removed) {
      const { base: _b, ...rest } = r;
      return { ...rest, unconfirmed: [] };
    }
    const fields = c.fields ?? {};
    return {
      ...r,
      base: { ...r.base, ...fields },
      unconfirmed: r.unconfirmed.filter((f) => !(f in fields)),
    };
  });
const confirm = (s: Slice, e: Entry, value: unknown, cx: Cx): Slice => {
  const carried = domainOf(cx, e.machine)?.writes[e.op]?.confirms?.(value, e.input) ?? [];
  let out = s;
  for (const c of carried) out = carry(out, c.ref, c);
  // Fields predicted and not carried stay, unconfirmed, until a read (2.8.6's success row).
  for (const p of e.predicted) {
    if (p.remove || !p.patch) continue;
    const c = carried.find((x) => x.ref === p.ref);
    if (c?.removed) continue;
    const r = recOf(out, p.ref);
    if (r.base === undefined) continue;
    const held = Object.keys(p.patch).filter((f) => !(c?.fields && f in c.fields));
    if (held.length === 0) continue;
    const applied = applyPatch(r.base, p, e.input);
    out = withRec(out, p.ref, (x) => ({
      ...x,
      base: { ...x.base, ...Object.fromEntries(held.map((f) => [f, applied[f]])) },
      unconfirmed: [...new Set([...x.unconfirmed, ...held])],
    }));
  }
  return out;
};
// A repair has ended, however: the held Attempts' predictions on this record go, released entries may leave, the queue moves.
const endRepair = (s: Slice, ref: string, cx: Cx): Slice => {
  const cur = s.repairs[ref];
  if (!cur) return s;
  cx.disarm(timerKey(ref));
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

type RepairAnswer = {
  readonly k: "repair";
  readonly ref: string;
  readonly gen: string;
  readonly ok: boolean;
  readonly value?: any;
};

export const entities: Module<Slice> = {
  id: "entities",
  rank: 20,
  init: () => empty,
  prepare(_s, w, cx) {
    const write = domainOf(cx, w.machine)?.writes[w.op];
    return write ? { predicted: cx.user(write.predicts, w.input) } : undefined;
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
  // Rule 30, and 2.8.5's table for NotSent, by channel: rule 27 says routing cannot matter here.
  settled(s, { attempt, ending }, cx) {
    const e = s.entries[attempt];
    if (!e) return s;
    cx.visible();
    if (ending.ch === "success")
      return removeEntry(clearMarks(confirm(s, e, ending.value, cx), e), attempt);
    if (ending.ch === "failure") return removeEntry(s, attempt);
    return holdFor(s, e, ending, cx);
  },
  withdraw: (s, { attempt }) => removeEntry(s, attempt),
  released(s, { attempt }, cx) {
    const e = s.entries[attempt];
    if (!e) return s;
    let out: Slice = s;
    for (const ref of e.refs)
      out = withRec(out, ref, (r) => ({
        ...r,
        marks: r.marks.map((m) => (m.attempt === attempt ? { ...m, given: true } : m)),
      }));
    cx.visible();
    return e.refs.some((r) => s.repairs[r])
      ? { ...out, entries: { ...out.entries, [attempt]: { ...e, released: true } } }
      : removeEntry(out, attempt);
  },
  readAnswered(s, { machine, op, input, value }, cx) {
    const carried = domainOf(cx, machine)?.reads[op]?.(value, input);
    if (!carried) return s;
    cx.visible();
    let out = s;
    for (const c of carried)
      out = withRec(out, c.ref, (r) => ({ ...r, base: c.fields ?? {}, unconfirmed: [] }));
    return out;
  },
  blocks(s, attempt): false | Claim {
    const e = s.entries[attempt];
    if (!e) return false;
    for (const ref of e.refs) {
      const q = recOf(s, ref).queue;
      const at = q.indexOf(attempt);
      if (at > 0) return { on: "queue", behind: q.slice(0, at) };
    }
    for (const ref of e.refs) if (s.repairs[ref]) return { on: "repair", ref }; // D39
    return false;
  },
  capture: (s, attempt) => s.entries[attempt]?.refs,
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
    const a = payload as RepairAnswer;
    const cur = s.repairs[a.ref];
    if (!cur || cur.gen !== a.gen) {
      cx.note("fence", { repair: a.ref });
      return s; // D40: a late answer, after the bound
    }
    if (!a.ok) {
      cx.note("RepairFailed", { ref: a.ref });
      return endRepair(s, a.ref, cx);
    }
    const out = withRec(s, a.ref, (r) => {
      if (a.value === null || a.value === undefined) {
        const { base: _b, ...rest } = r;
        return { ...rest, unconfirmed: [] };
      }
      return { ...r, base: a.value, unconfirmed: [] };
    });
    return endRepair(out, a.ref, cx);
  },
  timer(s, key, cx) {
    const ref = key.slice(timerKey("").length);
    cx.note("RepairOverdue", { ref }); // the mark stays
    return endRepair(s, ref, cx);
  },
  describe(s) {
    const out: Array<{ attempt: string; op: string; ref: string }> = [];
    for (const ref of Object.keys(s.repairs))
      for (const id of recOf(s, ref).queue) {
        const e = s.entries[id];
        if (e?.unknown) out.push({ attempt: id, op: e.op, ref });
      }
    return out;
  },
  exec(cmd, io) {
    const c = cmd as { k: "repair"; ref: string; gen: string; machine: string };
    const effect = io.machine(c.machine).domain!.repair(c.ref);
    io.fork(effect, (exit) =>
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
// Unknown: predictions stay until the forced repair lands, the entry keeps its place, the record is marked for this Attempt.
const holdFor = (s: Slice, e: Entry, ending: Ending, cx: Cx): Slice => {
  let out: Slice = { ...s, entries: { ...s.entries, [e.attempt]: { ...e, unknown: true } } };
  for (const ref of e.refs) {
    out = withRec(out, ref, (r) =>
      r.marks.some((m) => m.attempt === e.attempt)
        ? r
        : { ...r, marks: [...r.marks, { attempt: e.attempt, mint: e.mint, given: false }] },
    );
    // A refused capture sent nothing, so there is nothing new to repair.
    if (!(ending.ch === "unknown" && ending.reason === "StorageRefused"))
      out = startRepair(out, ref, e.machine, cx);
  }
  return out;
};
