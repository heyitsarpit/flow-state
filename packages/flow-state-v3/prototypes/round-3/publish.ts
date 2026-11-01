// What the outside reads of a world: rows, views, and claims about every wait (D29, D49). The suite checks the claims against
// what it owns, so nothing here is trusted.
import type { Claim, Module } from "./seam.ts";
import { viewOf, walkIncs } from "./inc.ts";
import { sameSubject } from "./inc.ts";
import { laneKey, type Lane, type World } from "./world.ts";

export const rowOf = (w: World, l: Lane | undefined) =>
  l?.head && {
    pending: l.head.phase.t !== "held",
    uncertain: l.head.phase.t === "held",
    waiting: l.w.length > 0,
    retryCount: l.head.retryCount,
    outstanding: l.w.length,
    ...(w.stalled[l.head.id] ? { stalled: w.stalled[l.head.id] } : {}),
  };
export const row = (w: World, actor: string, op: string, key: unknown) =>
  rowOf(w, w.lanes[laneKey(actor, op, key)]);

// A view is one complete cut: S1.
export const view = (w: World) => {
  const out: Record<string, { state: string; memory: unknown; rows: Record<string, unknown> }> = {};
  for (const a of Object.values(w.actors))
    out[a.key] = { state: a.root.leaf, memory: viewOf(a.root), rows: {} };
  for (const l of Object.values(w.lanes)) {
    const v = out[l.actor];
    if (v && l.head) v.rows[`${l.op}|${JSON.stringify(l.key)}`] = rowOf(w, l)!;
  }
  return out;
};

const bound = (w: World, l: Lane) => {
  const a = w.actors[l.actor];
  if (!a) return "unbound" as const;
  const m = l.subject.length;
  if (m === 0) return "bound" as const;
  let found = false;
  walkIncs(a.root, (i) => {
    if (sameSubject(i.subject, l.subject) && !i.frozen) found = true;
  });
  return found ? ("bound" as const) : ("unplaced" as const);
};
export const waitsOf = (w: World, modules: readonly Module<any>[]) => {
  const out: Array<Record<string, unknown>> = [];
  const mods = modules.filter((m) => !w.disabled[m.id]);
  const blocked = (attempt: string): false | Claim => {
    for (const m of mods) {
      const b = m.blocks?.(w.ext[m.id], attempt);
      if (b) return b;
    }
    return false;
  };
  for (const l of Object.values(w.lanes)) {
    for (const p of l.parked) out.push({ kind: "parked", op: l.op, attempt: p.attempt ?? "" });
    const h = l.head;
    if (!h) continue;
    const base = { op: l.op, attempt: h.id };
    if (w.status !== "live") {
      out.push({ kind: "disposing", ...base });
      continue;
    }
    switch (h.phase.t) {
      case "held":
        out.push({ kind: "held", ...base, mint: h.mint, actor: l.actor, owner: bound(w, l) });
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
        const disabled = modules.find(
          (m) => w.disabled[m.id] && w.ext[m.id] !== undefined && m.id !== "fault",
        );
        const b = blocked(h.id);
        if (w.stalled[h.id] === "module" && disabled)
          out.push({ kind: "disabled", ...base, module: disabled.id });
        else if (!b) out.push({ kind: "ready", ...base });
        else if (b.on === "queue")
          out.push({ kind: "queue", ...base, mint: h.mint, behind: b.behind });
        else if (b.on === "repair") out.push({ kind: "repair", ...base, ref: b.ref });
      }
    }
    for (const a of l.w)
      out.push({ kind: "W", op: l.op, attempt: a.id, mint: a.mint, behind: [h.id] });
  }
  for (const m of mods)
    for (const x of m.waits?.(w.ext[m.id]) ?? [])
      out.push({ kind: "repair", op: x.op, attempt: x.attempt, ref: x.ref });
  for (const r of Object.values(w.reads)) out.push({ kind: "wire", op: r.op });
  for (const t of Object.values(w.timers)) out.push({ kind: "timer", key: t.key, at: t.dueAt });
  return out;
};
