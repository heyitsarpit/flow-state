// The thin read lane (D23): no cache, no resources, no hold. One lane per (actor, operation); replace-latest; a read's
// generation drops a superseded answer. Not persisted (2.7.15): a restored actor has no read lanes.
import { nextGen, note, type Owner, type Tx } from "./world.ts";

const keyOf = (actor: string, op: string) => `read/${actor}/${op}`;

export const lookup = (
  tx: Tx,
  actor: string,
  machine: string,
  op: string,
  input: unknown,
  owner: Owner,
) => {
  const key = keyOf(actor, op);
  const old = tx.w.reads[key];
  if (old) {
    note(tx, "Superseded", { op, send: old.gen });
    tx.commands.push({ k: "interrupt", attempt: key, send: old.gen });
  }
  const gen = nextGen(tx);
  tx.w = { ...tx.w, reads: { ...tx.w.reads, [key]: { actor, op, gen, owner } } };
  note(tx, "invoked", { op, attempt: key, send: gen });
  tx.commands.push({
    k: "invoke",
    attempt: key,
    send: gen,
    machine,
    op,
    input,
    ctx: { id: key, mayHaveApplied: false },
  });
};

export const cancelRead = (tx: Tx, actor: string, op: string) => {
  const key = keyOf(actor, op);
  const old = tx.w.reads[key];
  if (!old) return;
  tx.commands.push({ k: "interrupt", attempt: key, send: old.gen });
  const { [key]: _gone, ...reads } = tx.w.reads;
  tx.w = { ...tx.w, reads };
  note(tx, "Superseded", { op, send: old.gen });
};

// A read's answer. A superseded or cancelled generation is a fence, like any other stale claim (D5).
export const takeRead = (tx: Tx, attempt: string, send: number) => {
  const r = tx.w.reads[attempt];
  if (!r || r.gen !== send) return undefined;
  const { [attempt]: _gone, ...reads } = tx.w.reads;
  tx.w = { ...tx.w, reads };
  return r;
};
