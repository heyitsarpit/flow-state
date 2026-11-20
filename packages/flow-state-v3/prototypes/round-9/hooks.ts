// Runs a module's hook in its own attempt, and gives a throw its owner (D46).
import { getActor, setActor } from "./actors.ts";
import type { Slot } from "../conformance/fixtures/compiled.ts";
import type { Claim, Cx, Module, Told, WriteRef } from "./seam.ts";
import { armTimer, disarmTimer } from "./timers.ts";
import { own, Refused, Unencodable } from "./gate.ts";
import { activitiesOf, kidAt, pathOfId, viewOf, withKid } from "./inc.ts";
import { enqueue, issue, nextGen, note, position, type Mail, type Tx } from "./world.ts";

export { Refused };
export const run = <A extends unknown[], B>(slot: Slot<(...a: A) => B>, ...a: A): B => {
  try {
    return slot.run(...a);
  } catch (e) {
    if (e instanceof Refused) throw e;
    throw new Refused(`${slot.at.definition} ${slot.at.path}`, e);
  }
};
const cxFor = (tx: Tx, m: Module<any>): Cx => ({
  now: tx.env.now,
  queueMax: tx.bounds.queueMax,
  repairMs: tx.bounds.repairMs,
  pageMs: tx.bounds.pageMs,
  gen: () => nextGen(tx),
  pos: () => position(tx),
  // L5: a module's timers go through the same gate as a schedule's. Past the bound it is not armed, and named.
  arm: (key, dueAt) => {
    if (!Number.isFinite(dueAt) || dueAt - tx.env.now > 2_147_483_647) {
      if (dueAt !== Infinity) note(tx, "TimerRefused", { key });
      return;
    }
    armTimer(tx, { key, kind: "module", module: m.id, dueAt });
  },
  disarm: (key) => disarmTimer(tx, key),
  command: (cmd) => void tx.commands.push({ k: "module", m: m.id, cmd }),
  note: (kind, f) => note(tx, kind, f ?? {}),
  issue: (code, f) => issue(tx, { code, origin: m.id, input: f }),
  visible: () => void (tx.visible = true),
  machine: (id) => tx.machines[id]!,
  deliver: (d) => enqueue(tx, { k: "deliver", module: m.id, ...d }),
  retract: (tag) => {
    const keep = (x: Mail) => !(x.k === "deliver" && x.tag === tag);
    tx.w = { ...tx.w, mail: tx.w.mail.filter(keep), follow: tx.w.follow.filter(keep) };
  },
  machineOf: (key) => getActor(tx.w.actors, key)?.machine ?? own(tx.w.retired, key)?.machine,
  placed: (key) => {
    const a = getActor(tx.w.actors, key);
    return a ? activitiesOf(tx.machines[a.machine]!, a.root) : [];
  },
  slice: (key, inc) => {
    const a = getActor(tx.w.actors, key);
    const path = a && pathOfId(a.root, inc);
    const i = path && kidAt(a!.root, path);
    return i && { memory: viewOf(i), partition: i.partition?.[m.id] };
  },
  publish: (fact) => {
    for (const x of tx.modules) if (x.store) told(tx, x.id, fact);
  },
  partition: (actor, inc, f) => {
    const a = getActor(tx.w.actors, actor);
    const path = a && pathOfId(a.root, inc);
    if (!a || !path) return;
    const root = withKid(a.root, path, (i) => ({
      ...i,
      partition: { ...i.partition, [m.id]: f(i.partition?.[m.id]) },
    }));
    tx.w = { ...tx.w, actors: setActor(tx.w.actors, actor, { ...a, root }) };
    tx.touchedActors.add(actor);
    tx.visible = true;
  },
  user: (slot, args, fallback) => {
    if (tx.inTurn) return run(slot, ...args);
    try {
      return slot.run(...args);
    } catch (e) {
      issue(tx, {
        code: e instanceof Unencodable ? "UnencodableValue" : "UserClosure", // D118
        origin: `${slot.at.definition} ${slot.at.path}`,
        input: String(e),
      });
      return fallback();
    }
  },
});
const uses = (tx: Tx, machine: string, m: Module<any>) => tx.machines[machine]!.uses.includes(m.id);
const active = (tx: Tx, m: Module<any>) => !tx.w.disabled[m.id];
const kept = (tx: Tx) => ({
  w: tx.w,
  commands: tx.commands.length,
  evidence: tx.evidence.length,
  visible: tx.visible,
});
const disable = (tx: Tx, m: Module<any>, hook: string, e: unknown, k: ReturnType<typeof kept>) => {
  tx.w = { ...k.w, disabled: { ...k.w.disabled, [m.id]: true } };
  tx.commands.length = k.commands;
  tx.evidence.length = k.evidence;
  tx.visible = true;
  issue(tx, { code: "ModuleDefect", origin: `${m.id}.${hook}`, input: String(e) });
};
const attempt = <R>(tx: Tx, m: Module<any>, name: string, f: () => R, onThrow: () => R): R => {
  const k = kept(tx);
  try {
    return f();
  } catch (e) {
    if (e instanceof Refused) throw e; // a user closure in a turn: the turn's to refuse
    disable(tx, m, name, e, k);
    return onThrow();
  }
};
// A hook that returns the module's next slice.
export const hook = (
  tx: Tx,
  name: "ended" | "dispose" | "restored",
  f: (m: Module<any>, s: any, cx: Cx) => unknown,
) => {
  for (const m of tx.modules) {
    if (!m[name] || !active(tx, m)) continue;
    attempt(
      tx,
      m,
      name,
      () => {
        const s = f(m, tx.w.ext[m.id], cxFor(tx, m));
        tx.w = { ...tx.w, ext: { ...tx.w.ext, [m.id]: s } };
      },
      () => undefined,
    );
  }
};
export const input = (tx: Tx, id: string, payload: unknown) => {
  const m = tx.modules.find((x) => x.id === id);
  if (!m?.input || !active(tx, m)) return;
  attempt(
    tx,
    m,
    "input",
    () => {
      const s = m.input!(tx.w.ext[m.id], payload, cxFor(tx, m));
      tx.w = { ...tx.w, ext: { ...tx.w.ext, [m.id]: s } };
    },
    () => undefined,
  );
};
export const told = (tx: Tx, id: string, fact: Told) => {
  const m = tx.modules.find((x) => x.id === id);
  if (!m?.told || !active(tx, m)) return;
  attempt(
    tx,
    m,
    "told",
    () => {
      const s = m.told!(tx.w.ext[m.id], fact, cxFor(tx, m));
      tx.w = { ...tx.w, ext: { ...tx.w.ext, [m.id]: s } };
    },
    () => undefined,
  );
};
export const toldAll = (tx: Tx, fact: Told) => {
  for (const m of tx.modules) told(tx, m.id, fact);
};
export const prepareAll = (tx: Tx, w: { machine: string; op: string; input: unknown }) => {
  const out: Record<string, unknown> = {};
  for (const m of tx.modules) {
    if (!m.prepare || !active(tx, m)) continue;
    attempt(
      tx,
      m,
      "prepare",
      () => void (out[m.id] = m.prepare!(tx.w.ext[m.id], w, cxFor(tx, m))),
      () => undefined,
    );
  }
  return out;
};
// P6: undefined, or why not. D46: a disabled module this machine uses declines what would join it.
export const startAll = (
  tx: Tx,
  w: WriteRef,
  prepared: Readonly<Record<string, unknown>>,
): string | undefined => {
  for (const m of tx.modules) {
    if (!uses(tx, w.machine, m)) continue;
    if (!active(tx, m)) return "ModuleDisabled";
    if (!m.start) continue;
    const why = attempt<string | undefined>(
      tx,
      m,
      "start",
      () => {
        const r = m.start!(tx.w.ext[m.id], w, prepared[m.id], cxFor(tx, m));
        if (!r.ok) return "Overloaded";
        tx.w = { ...tx.w, ext: { ...tx.w.ext, [m.id]: r.s } };
        return undefined;
      },
      () => "ModuleDisabled",
    );
    if (why) return why;
  }
  return undefined;
};
export const blockedBy = (tx: Tx, attempt_: string, machine: string): false | Claim => {
  for (const m of tx.modules) {
    if (!active(tx, m)) {
      if (uses(tx, machine, m)) return { on: "disabled", module: m.id };
      continue;
    }
    if (!m.blocks) continue;
    const b = attempt<false | Claim>(
      tx,
      m,
      "blocks",
      () => m.blocks!(tx.w.ext[m.id], attempt_),
      () => (uses(tx, machine, m) ? { on: "disabled", module: m.id } : false),
    );
    if (b) return b;
  }
  return false;
};
export const saveAll = (tx: Tx, attempt_: string) => {
  let out: Record<string, unknown> | undefined;
  for (const m of tx.modules) {
    if (!m.save || !active(tx, m)) continue;
    attempt(
      tx,
      m,
      "save",
      () => {
        const v = m.save!(tx.w.ext[m.id], attempt_);
        if (v !== undefined) (out ??= {})[m.id] = v;
      },
      () => undefined,
    );
  }
  return out;
};
