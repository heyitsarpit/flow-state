// Runs a module's hook in its own attempt, and gives a throw its owner (D46).
import type { Slot } from "../conformance/fixtures/compiled.ts";
import type { Claim, Cx, Module, WriteRef } from "./seam.ts";
import { armTimer, disarmTimer } from "./timers.ts";
import { issue, nextGen, note, position, type Tx } from "./world.ts";

export class Refused extends Error {
  constructor(
    readonly origin: string,
    cause: unknown,
  ) {
    super(String(cause));
  }
}
export const run = <A extends unknown[], B>(slot: Slot<(...a: A) => B>, ...a: A): B => {
  try {
    return slot.run(...a);
  } catch (e) {
    if (e instanceof Refused) throw e;
    throw new Refused(`${slot.at.definition} ${slot.at.path}`, e);
  }
};
// Core encodes what closures return. Inside a turn's attempt, so what cannot encode refuses it (H2).
export const encodable = <A>(v: A, origin: string): A => {
  try {
    JSON.stringify(v);
    return v;
  } catch (e) {
    throw new Refused(origin, e);
  }
};
const cxFor = (tx: Tx, m: Module<any>): Cx => ({
  now: tx.env.now,
  queueMax: tx.bounds.queueMax,
  repairMs: tx.bounds.repairMs,
  gen: () => nextGen(tx),
  pos: () => position(tx),
  arm: (key, dueAt) => void armTimer(tx, { key, kind: "module", module: m.id, dueAt }),
  disarm: (key) => disarmTimer(tx, key),
  command: (cmd) => void tx.commands.push({ k: "module", m: m.id, cmd }),
  note: (kind, f) => note(tx, kind, f ?? {}),
  issue: (code, f) => issue(tx, { code, origin: m.id, input: f }),
  visible: () => void (tx.visible = true),
  machine: (id) => tx.machines[id]!,
  user: (slot, args, fallback) => {
    if (tx.inTurn) return run(slot, ...args);
    try {
      return slot.run(...args);
    } catch (e) {
      issue(tx, {
        code: "UserClosure",
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
export const inputAll = (tx: Tx, payload: unknown) => {
  for (const m of tx.modules) input(tx, m.id, payload);
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
    if (!uses(tx, w.machine, m)) {
      if (m.start && active(tx, m))
        attempt(
          tx,
          m,
          "start",
          () => undefined,
          () => undefined,
        );
      continue;
    }
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
