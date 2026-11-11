// The thin read lane (D23): no cache, no resources, no hold, not persisted. One lane per (actor, operation); replace
// latest; a read's generation drops a superseded answer.
import { nextGen, note, without, type Owner, type Tx } from "./world.ts";

const keyOf = (actor: string, op: string) => `read/${actor}/${op}`;
export const lookup = (
  tx: Tx,
  a: { actor: string; machine: string; op: string; input: unknown; key: unknown; owner: Owner },
) => {
  const key = keyOf(a.actor, a.op);
  const old = tx.w.reads[key];
  if (old) {
    note(tx, "Superseded", { op: a.op, attempt: key, send: old.gen });
    tx.commands.push({ k: "interrupt", attempt: key, send: old.gen });
  }
  const gen = nextGen(tx);
  tx.w = { ...tx.w, reads: { ...tx.w.reads, [key]: { ...a, gen } } };
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
export const cancelRead = (tx: Tx, actor: string, op: string) => {
  const key = keyOf(actor, op);
  const old = tx.w.reads[key];
  if (!old) return;
  tx.commands.push({ k: "interrupt", attempt: key, send: old.gen });
  tx.w = { ...tx.w, reads: without(tx.w.reads, key) };
  note(tx, "Superseded", { op, attempt: key, send: old.gen });
};
// A superseded or cancelled generation is a fence, like any other stale claim (D5).
export const takeRead = (tx: Tx, attempt: string, send: string) => {
  const r = tx.w.reads[attempt];
  if (!r || r.gen !== send) return undefined;
  tx.w = { ...tx.w, reads: without(tx.w.reads, attempt) };
  return r;
};
