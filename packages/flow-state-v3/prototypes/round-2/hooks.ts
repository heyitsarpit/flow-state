// Runs a module's hook in its own attempt (D27), and tells a user closure's throw from a module's own.
import type { Slot } from "../conformance/fixtures/compiled.ts";
import type { Cx, Module } from "./seam.ts";
import { armTimer, disarmTimer } from "./timers.ts";
import { issue, note, nextGen, type Tx } from "./world.ts";

export class Refused extends Error {
  constructor(
    readonly origin: string,
    cause: unknown,
  ) {
    super(String(cause));
  }
}
export const run = <A, B>(slot: Slot<(...a: any[]) => B>, a: A, c?: unknown): B => {
  try {
    return slot.run(a, c);
  } catch (e) {
    throw new Refused(`${slot.at.definition} ${slot.at.path}`, e);
  }
};
const cxFor = (tx: Tx, m: Module<any>): Cx => ({
  now: tx.env.now,
  queueMax: tx.bounds.queueMax,
  repairMs: tx.bounds.repairMs,
  gen: () => nextGen(tx),
  arm: (key, dueAt) => void armTimer(tx, { key, kind: "module", module: m.id, dueAt }),
  disarm: (key) => disarmTimer(tx, key),
  command: (cmd) => void tx.commands.push({ k: "module", m: m.id, cmd }),
  note: (kind, f) => note(tx, kind, f ?? {}),
  issue: (code, f) => issue(tx, { code, origin: m.id, input: f }),
  visible: () => void (tx.visible = true),
  machine: (id) => tx.machines[id]!,
  user: run,
});
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
  tx.visible = k.visible;
  issue(tx, { code: "ModuleDefect", origin: `${m.id}.${hook}`, input: String(e) });
};

// A hook that returns the module's next slice.
export const hook = <H extends keyof Module<any>>(
  tx: Tx,
  name: H,
  f: (m: Module<any>, s: any, cx: Cx) => unknown,
) => {
  for (const m of tx.modules) {
    if (!m[name] || !active(tx, m)) continue;
    const k = kept(tx);
    try {
      const s = f(m, tx.w.ext[m.id], cxFor(tx, m));
      tx.w = { ...tx.w, ext: { ...tx.w.ext, [m.id]: s } };
    } catch (e) {
      if (e instanceof Refused) throw e;
      disable(tx, m, String(name), e, k);
    }
  }
};
// One module's input or timer.
export const hookOne = (tx: Tx, id: string, f: (m: Module<any>, s: any, cx: Cx) => unknown) => {
  const m = tx.modules.find((x) => x.id === id);
  if (!m || !active(tx, m)) return;
  const k = kept(tx);
  try {
    const s = f(m, tx.w.ext[m.id], cxFor(tx, m));
    tx.w = { ...tx.w, ext: { ...tx.w.ext, [m.id]: s } };
  } catch (e) {
    disable(tx, m, "input", e, k);
  }
};
// P5: what each module would do. Nothing is written.
export const prepareAll = (tx: Tx, w: { machine: string; op: string; input: unknown }) => {
  const out: Record<string, unknown> = {};
  for (const m of tx.modules) {
    if (!m.prepare || !active(tx, m)) continue;
    const k = kept(tx);
    try {
      out[m.id] = m.prepare(tx.w.ext[m.id], w, cxFor(tx, m));
    } catch (e) {
      if (e instanceof Refused) throw e;
      disable(tx, m, "prepare", e, k);
    }
  }
  return out;
};
// P6: true unless some module declines. No partial joins: a decline after another module's start is impossible with
// one store, and with two it would need a withdraw. Stated: one module answers `start` today.
export const startAll = (
  tx: Tx,
  w: { attempt: string; mint: number; machine: string; op: string; input: unknown },
  prepared: Readonly<Record<string, unknown>>,
) => {
  for (const m of tx.modules) {
    if (!m.start || !active(tx, m)) continue;
    const k = kept(tx);
    try {
      const r = m.start(tx.w.ext[m.id], w, prepared[m.id], cxFor(tx, m));
      if (!r.ok) return false;
      tx.w = { ...tx.w, ext: { ...tx.w.ext, [m.id]: r.s } };
    } catch (e) {
      if (e instanceof Refused) throw e;
      disable(tx, m, "start", e, k);
    }
  }
  return true;
};
export const blockedBy = (tx: Tx, attempt: string) => {
  for (const m of tx.modules) {
    if (!m.blocks || !active(tx, m)) continue;
    const k = kept(tx);
    try {
      const b = m.blocks(tx.w.ext[m.id], attempt);
      if (b) return b;
    } catch (e) {
      disable(tx, m, "blocks", e, k);
    }
  }
  return false as const;
};
export const captureAll = (tx: Tx, attempt: string) => {
  let out: Record<string, unknown> | undefined;
  for (const m of tx.modules) {
    if (!m.capture || !active(tx, m)) continue;
    const k = kept(tx);
    try {
      const v = m.capture(tx.w.ext[m.id], attempt);
      if (v !== undefined) (out ??= {})[m.id] = v;
    } catch (e) {
      disable(tx, m, "capture", e, k);
    }
  }
  return out;
};
