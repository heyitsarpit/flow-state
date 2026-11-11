// What the outside reads of a world: rows, views, and the wait table (L1, L3).
import { laneKey, type Lane, type Module, type World } from "./world.ts";

export const rowOf = (l: Lane | undefined) =>
  l && {
    pending: l.state === "InFlight",
    uncertain: l.state === "Held",
    waiting: false,
    retryCount: l.head.retryCount,
  };

export const row = (w: World, actor: string, op: string, key: unknown) =>
  rowOf(w.lanes[laneKey(actor, op, key)]);

// A view is one complete cut: S1. Round 1 has one key per operation, so rows go by operation name.
export const view = (w: World) =>
  Object.fromEntries(
    Object.values(w.actors).map((a) => [
      a.key,
      {
        state: a.leaf,
        memory: a.memory,
        rows: Object.fromEntries(
          Object.values(w.lanes)
            .filter((l) => l.actor === a.key)
            .map((l) => [l.op, rowOf(l)!]),
        ),
      },
    ]),
  );

// Every non-terminal Attempt has one kind of wait; `stuck:` is a wait with no sink, the L3 violation.
export const waitsOf = (w: World, modules: readonly Module[]): string[] => {
  const out: string[] = [];
  for (const l of Object.values(w.lanes)) {
    const name = `${l.op}:${JSON.stringify(l.key)}`;
    if (w.disposing) out.push(`disposing:${name}`);
    else if (l.state === "Held") out.push(`held:${name}:owner=${l.actor}`);
    else if (l.head.wire) out.push(`wire:${name}`);
    else if (l.head.settled)
      out.push(w.mail.length ? `mail:${name}` : `stuck:${name}:settled, nothing in mail`);
    else {
      const by = modules
        .map((m) => m.blocksInvoke?.(w.ext[m.id], l.head, undefined as never))
        .find(Boolean);
      out.push(by ? `${by}:${name}` : `stuck:${name}:eligible, not invoked`);
    }
  }
  for (const r of Object.values(w.reads)) out.push(`read:${r.op}`);
  for (const t of Object.values(w.timers)) out.push(`timer:${t.key}@${t.dueAt}`);
  return out;
};
