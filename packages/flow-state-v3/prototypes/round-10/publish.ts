// What the outside reads of a world: rows, views, and claims about every wait (D29, D49). The suite checks the claims against
// what it owns, so nothing here is trusted.
import { getActor, allActors } from "./actors.ts";
import type { Claim, Module } from "./seam.ts";
import { canon, text } from "./gate.ts";
import { viewOf, walkIncs } from "./inc.ts";
import { sameSubject } from "./inc.ts";
import { laneKey, type Lane, type Machines, type World } from "./world.ts";

// D118: an ending the machine has not heard is on the row, so the app can read what Inspection can.
export const rowOf = (w: World, l: Lane | undefined) => {
  const undelivered = l?.parked.filter((p) => p.kept).length ?? 0;
  if (!l || (!l.head && undelivered === 0)) return undefined;
  return {
    pending: !!l.head && l.head.phase.t !== "held",
    uncertain: l.head?.phase.t === "held",
    waiting: l.w.length > 0,
    retryCount: l.head?.retryCount ?? 0,
    outstanding: l.w.length,
    ...(undelivered ? { undelivered } : {}),
  };
};
export const row = (w: World, actor: string, op: string, key: unknown) =>
  text(key) === undefined
    ? undefined
    : w.quarantined[laneKey(actor, op, key)]
      ? { pending: false, uncertain: true, waiting: false, retryCount: 0, outstanding: 0 } // D88
      : rowOf(w, w.lanes[laneKey(actor, op, key)]);

// A view is one complete cut: S1.
export const view = (w: World) => {
  const out: Record<string, { state: string; memory: unknown; rows: Record<string, unknown> }> = {};
  for (const a of allActors(w.actors))
    out[a.key] = { state: a.root.leaf, memory: viewOf(a.root), rows: {} };
  for (const l of Object.values(w.lanes)) {
    const v = out[l.actor];
    const r = rowOf(w, l);
    if (v && r) v.rows[`${l.op}|${canon(l.key)}`] = r;
  }
  return out;
};

const bound = (w: World, l: Lane) => {
  const a = getActor(w.actors, l.actor);
  if (!a) return "unbound" as const;
  const m = l.subject.length;
  if (m === 0) return "bound" as const;
  let found = false;
  walkIncs(a.root, (i) => {
    if (sameSubject(i.subject, l.subject) && !i.frozen) found = true;
  });
  return found ? ("bound" as const) : ("unplaced" as const);
};
export const waitsOf = (w: World, modules: readonly Module<any>[], machines: Machines) => {
  const out: Array<Record<string, unknown>> = [];
  const mods = modules.filter((m) => !w.disabled[m.id]);
  const blocked = (attempt: string): false | Claim => {
    for (const m of mods) {
      const b = m.blocks?.(w.ext[m.id], attempt);
      if (b) return b;
    }
    return false;
  };
  for (const x of Object.values(w.stranded)) out.push({ kind: "stranded", op: x.op, inc: x.inc }); // D123
  // Rule 52: what a paused life is owed waits with it, so a wait says so. A retired identity's too.
  for (const a of [...allActors(w.actors), ...Object.values(w.retired)])
    walkIncs(a.root, (i) => {
      for (const p of i.frozen?.parked ?? []) if (p.k === "ending") out.push({ kind: "parked", op: p.op, attempt: p.attempt ?? "", frozen: true });
    });
  for (const f of w.keptFires) out.push({ kind: "parked", op: f.event.tag, firing: true }); // D118
  for (const l of Object.values(w.lanes)) {
    for (const p of l.parked) out.push({ kind: "parked", op: l.op, attempt: p.attempt ?? "" });
    const h = l.head;
    if (!h) continue;
    // D49 (changed): a stall is Inspection's, here. The row does not say it.
    const base = {
      op: l.op,
      attempt: h.id,
      ...(w.stalled[h.id] ? { stalled: w.stalled[h.id] } : {}),
    };
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
          (m) => w.disabled[m.id] && machines[l.machine]?.uses.includes(m.id),
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
