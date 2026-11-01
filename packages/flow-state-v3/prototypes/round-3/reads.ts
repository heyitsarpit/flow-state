// The thin read lane (D23, rules 42, 52): no cache, no resources, no hold, not persisted. One lane per (actor, incarnation,
// operation); replace latest; a read's generation drops a superseded answer. D47: it carries the position it started at.
import { nextGen, note, position, without, type Owner, type Tx } from "./world.ts";

const keyOf = (actor: string, inc: string, op: string) => `read/${actor}/${inc}/${op}`;
export const lookup = (
  tx: Tx,
  a: {
    actor: string;
    machine: string;
    op: string;
    input: unknown;
    key: unknown;
    owner: Owner;
    inc: string;
  },
) => {
  const key = keyOf(a.actor, a.inc, a.op);
  const old = tx.w.reads[key];
  if (old) {
    note(tx, "Superseded", { op: a.op, attempt: key, send: old.gen });
    tx.commands.push({ k: "interrupt", attempt: key, send: old.gen });
  }
  const gen = nextGen(tx);
  tx.w = { ...tx.w, reads: { ...tx.w.reads, [key]: { ...a, gen, pos: position(tx) } } };
  note(tx, "invoked", { op: a.op, attempt: key, send: gen });
  tx.commands.push({
    k: "invoke",
    attempt: key,
    send: gen,
    machine: a.machine,
    op: a.op,
    input: a.input,
    ctx: { id: key, mayHaveApplied: false },
  });
};
export const cancelRead = (tx: Tx, actor: string, inc: string, op: string) => {
  const key = keyOf(actor, inc, op);
  const old = tx.w.reads[key];
  if (!old) return;
  tx.commands.push({ k: "interrupt", attempt: key, send: old.gen });
  tx.w = { ...tx.w, reads: without(tx.w.reads, key) };
  note(tx, "Superseded", { op, attempt: key, send: old.gen });
};
// Every read of an incarnation, for what ends it (rule 52) or freezes it. Returns them; the caller says what becomes of them.
export const dropReadsOf = (tx: Tx, inc: string) => {
  const out = Object.entries(tx.w.reads).filter(([, r]) => r.inc === inc);
  for (const [key, r] of out) {
    tx.commands.push({ k: "interrupt", attempt: key, send: r.gen });
    tx.w = { ...tx.w, reads: without(tx.w.reads, key) };
    note(tx, "Superseded", { op: r.op, attempt: key, send: r.gen });
  }
  return out.map(([, r]) => r);
};
export const takeRead = (tx: Tx, attempt: string, send: string) => {
  const r = tx.w.reads[attempt];
  if (!r || r.gen !== send) return undefined;
  tx.w = { ...tx.w, reads: without(tx.w.reads, attempt) };
  return r;
};
