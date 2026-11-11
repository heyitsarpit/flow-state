// What the outside reads of a world: rows, views, and claims about every wait (D29). The suite checks the claims against
// what it owns, so nothing here is trusted.
import type { Claim, Module } from "./seam.ts";
import { laneKey, type Lane, type World } from "./world.ts";

export const rowOf = (l: Lane | undefined) =>
  l && {
    pending: l.head.phase.t !== "held",
    uncertain: l.head.phase.t === "held",
    waiting: l.w.length > 0,
    retryCount: l.head.retryCount,
    outstanding: l.w.length,
  };
export const row = (w: World, actor: string, op: string, key: unknown) =>
  rowOf(w.lanes[laneKey(actor, op, key)]);

// A view is one complete cut: S1.
export const view = (w: World) => {
  const out: Record<string, { state: string; memory: unknown; rows: Record<string, unknown> }> = {};
  for (const a of Object.values(w.actors))
    out[a.key] = { state: a.leaf, memory: a.memory, rows: {} };
  for (const l of Object.values(w.lanes)) {
    const v = out[l.actor];
    if (v) v.rows[`${l.op}|${JSON.stringify(l.key)}`] = rowOf(l)!;
  }
  return out;
};

const active = (w: World, modules: readonly Module<any>[]) =>
  modules.filter((m) => !w.disabled[m.id]);
export const waitsOf = (w: World, modules: readonly Module<any>[]) => {
  const out: Array<Record<string, unknown>> = [];
  const mods = active(w, modules);
  const blocked = (attempt: string): false | Claim => {
    for (const m of mods) {
      const b = m.blocks?.(w.ext[m.id], attempt);
      if (b) return b;
    }
    return false;
  };
  for (const l of Object.values(w.lanes)) {
    const h = l.head;
    const base = { op: l.op, attempt: h.id };
    if (w.status !== "live") {
      out.push({ kind: "disposing", ...base });
      continue;
    }
    switch (h.phase.t) {
      case "held":
        out.push({ kind: "held", ...base, mint: h.mint, actor: l.actor });
        break;
      case "wire":
        out.push({ kind: "wire", ...base });
        break;
      case "settled":
        out.push({ kind: "mail", ...base });
        break;
      case "durable":
        out.push({ kind: h.phase.on, ...base, key: `lane/${l.id}` });
        break;
      default: {
        const b = blocked(h.id);
        if (!b) out.push({ kind: "ready", ...base });
        else if (b.on === "queue")
          out.push({ kind: "queue", ...base, mint: h.mint, behind: b.behind });
        else out.push({ kind: "repair", ...base, ref: b.ref });
      }
    }
    for (const a of l.w)
      out.push({ kind: "W", op: l.op, attempt: a.id, mint: a.mint, behind: [h.id] });
  }
  for (const m of mods)
    for (const x of m.describe?.(w.ext[m.id]) ?? [])
      out.push({ kind: "repair", op: x.op, attempt: x.attempt, ref: x.ref });
  for (const r of Object.values(w.reads)) out.push({ kind: "wire", op: r.op });
  for (const t of Object.values(w.timers)) out.push({ kind: "timer", key: t.key, at: t.dueAt });
  return out;
};
