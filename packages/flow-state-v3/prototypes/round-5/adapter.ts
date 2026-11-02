// The port over this runtime (conformance/drive.ts holds settling and faults). The registry resolves `Compiled.uses` (D44); the
// fault module and the machines proxy reach the core through what production has: a module and data.
import type { Compiled } from "../conformance/fixtures/compiled.ts";
import type { BootArgs, Instance, Port } from "../conformance/harness.ts";
import { createRuntime, type StepRecord } from "./driver.ts";
import { entities, readAll, type Slice } from "./entities.ts";
import { sessions } from "./sessions.ts";
import { kidAt, viewOf } from "./inc.ts";
import { row as rowOf, view, waitsOf } from "./publish.ts";
import type { Module } from "./seam.ts";
import { step } from "./step.ts";
import { defaultBounds, emptyWorld, type Machines, type World } from "./world.ts";

const REGISTRY: Readonly<Record<string, Module<any>>> = { entities, sessions };
const DRAIN = process.env["FLOW_DRAIN_MS"];
const STEP_HOOKS = new Set([
  "prepare",
  "start",
  "ended",
  "blocks",
  "input",
  "save",
  "restored",
  "dispose",
]);
export { sessions };

// For the suite's hash and replay only. Total: a world may hold what never needed encoding (D57).
const canon = (v: unknown, up: readonly unknown[] = []): unknown => {
  if (typeof v === "bigint") return `${v}n`;
  if (typeof v === "function") return undefined;
  if (v === null || typeof v !== "object") return v;
  if (up.includes(v)) return "(cycle)";
  const next = [...up, v];
  if (Array.isArray(v)) return v.map((x) => canon(x, next));
  return Object.fromEntries(
    Object.keys(v)
      .sort()
      .map((k) => [k, canon((v as Record<string, unknown>)[k], next)]),
  );
};
// Everything that decides the future, normalised: ids and generations by first occurrence, mints and positions by order, times
// from now. Saved records are in (L9): what storage last heard changes what a capture writes.
const normalise = (w: World, now: number, outside: string): string => {
  const { nextId: _i, nextMint: _m, seq: _s, boot: _b, savedMeta: _t, ...rest } = w;
  let text = `${JSON.stringify(canon(rest))}|${outside}`;
  text = text.replace(/(\\?"dueAt\\?":)(\d+)/g, (_x, k, n) => `${k}${Number(n) - now}`);
  const ranked = (re: RegExp) => {
    const seen = [...new Set([...text.matchAll(re)].map((m) => Number(m[2])))].sort(
      (a, b) => a - b,
    );
    text = text.replace(re, (_x, k, n) => `${k}${Number(n) === 0 ? "z" : seen.indexOf(Number(n))}`);
  };
  ranked(/(\\?"mint\\?":)(\d+)/g);
  ranked(/(\\?"(?:sentAt|changedAt|pos)\\?":)(\d+)/g);
  const ranks = new Map<string, number>();
  return text.replace(/att-\d+-\d+|g\d+\.\d+/g, (tok) => {
    let r = ranks.get(tok);
    if (r === undefined) {
      r = ranks.size;
      ranks.set(tok, r);
    }
    return `#${r}`;
  });
};

export const port: Port = {
  boot(a: BootArgs): Instance {
    const faulted = <S>(m: Module<S>): Module<S> =>
      new Proxy(m, {
        get(t, k, r) {
          const v = Reflect.get(t, k, r);
          if (typeof v !== "function" || typeof k !== "string" || !STEP_HOOKS.has(k)) return v;
          return (...args: unknown[]) => {
            const n = a.faults.moduleThrows.get(k);
            if (n) {
              a.faults.moduleThrows.set(k, n - 1);
              throw new Error(`fault in ${k}`);
            }
            const r = v.apply(t, args);
            const after = a.faults.moduleThrowsAfter.get(k);
            if (after) {
              a.faults.moduleThrowsAfter.set(k, after - 1);
              throw new Error(`fault after ${k}`);
            }
            return r;
          };
        },
      });
    // Reaches a machine that does not use it, so the hook's own attempt shows, with nothing held by its failure.
    const faultModule: Module<null> = {
      id: "fault",
      rank: 99,
      init: () => null,
      ended: (s) => s,
      blocks: () => false,
      prepare: () => undefined,
    };
    const used = [...new Set(a.compiled.flatMap((c) => c.uses))].map((u) => REGISTRY[u]!);
    const plainModules = [...used, faultModule].sort((x, y) => x.rank - y.rank);
    const modules = plainModules.map(faulted);
    const plain: Machines = Object.fromEntries(a.compiled.map((c) => [c.id, c]));
    // A core bug, reached through data: the next read of the machines throws, inside core code.
    const machines: Machines = new Proxy(plain, {
      get(t, k, r) {
        if (a.faults.coreThrows > 0) {
          a.faults.coreThrows--;
          throw new Error("fault in core");
        }
        return Reflect.get(t, k, r);
      },
    });
    const log: StepRecord[] = [];
    // Rule 69: the suite's read. A session's deliveries are named `${session}#n`.
    let peakInMail = 0;
    const countMail = (w: World) => {
      const per = new Map<string, number>();
      for (const m of [...w.mail, ...w.follow])
        if (m.k === "deliver") {
          const s = m.tag.split("#")[0]!;
          per.set(s, (per.get(s) ?? 0) + 1);
        }
      for (const n of per.values()) peakInMail = Math.max(peakInMail, n);
    };
    const frames: Array<{ cause: string; at: number; seq: number; world: World }> = [];
    let lastCompletion: StepRecord["input"] | undefined;
    const bounds = { ...a.bounds, ...(DRAIN === undefined ? {} : { drainMs: Number(DRAIN) }) };
    const rt = createRuntime({
      host: a.host,
      machines,
      modules,
      bounds,
      onStep: (r) => {
        log.push(r);
        if (r.out !== "fatal") countMail(r.out.world);
        if (r.input.k === "sent") lastCompletion = r.input;
        if (r.out !== "fatal" && r.out.frame) frames.push(r.out.frame);
      },
      onEvidence: (e) => a.onEvidence(e),
      onIssue: (i) => a.onIssue(i),
    });
    const sys = { machines, modules, bounds: { ...defaultBounds, ...bounds } };
    const store = (w: World) => w.ext["entities"] as Slice | undefined;
    const reg = REGISTRY["entities"]!;
    return {
      ensure: (actor, machine, input) => rt.input({ k: "ensure", actor, machine, input }),
      send: (actor, event) => rt.input({ k: "send", actor, event }),
      dispose: (actor) => rt.input({ k: "dispose", actor }),
      disposeRuntime: () => rt.input({ k: "disposeRuntime" }),
      repeatLastCompletion: () => {
        if (lastCompletion) rt.input(lastCompletion);
      },
      pending: () => rt.pending(),
      live: () => rt.live(),
      logLength: () => log.length,
      state: (x) => rt.world().actors[x]?.root.leaf,
      memory: (x) => {
        const r = rt.world().actors[x]?.root;
        return r && viewOf(r);
      },
      inner: (x, path) => {
        const r = rt.world().actors[x]?.root;
        const i = r && kidAt(r, path);
        return i && { state: i.leaf, memory: viewOf(i) };
      },
      row: (x, op, key) => rowOf(rt.world(), x, op, key),
      record: (ref) => {
        const s = store(rt.world());
        return s && (reg.read!(s, ref) as never);
      },
      module: (id, ref) => {
        const s = rt.world().ext[id];
        return s === undefined ? undefined : REGISTRY[id]!.read!(s, ref);
      },
      peakDeliveriesInMail: () => peakInMail,
      waits: () => waitsOf(rt.world(), plainModules, plain) as never,
      fatal: () => rt.fatal(),
      frames: () =>
        frames.map((f) => {
          const s = store(f.world);
          return {
            cause: f.cause,
            at: f.at,
            seq: f.seq,
            view: view(f.world) as never,
            records: (s ? readAll(s) : {}) as never,
          };
        }),
      stateText: (outside) => normalise(rt.world(), a.host.now(), outside),
      // S11: pure re-execution of this boot's input log, with its logged draws, against what was published.
      replay: (before) => {
        let w: World = emptyWorld;
        for (let i = 0; i < log.length; i++) {
          before(i);
          const e = log[i]!;
          let d = 0;
          const env = { now: e.now, id: () => e.ids[d++]! };
          try {
            const out = step(w, e.input, env, sys);
            if (e.out === "fatal")
              return { same: false, firstDiff: { step: i, input: e.input.k, was: "fatal" } };
            const same =
              JSON.stringify(canon([out.commands, out.frame?.seq, out.world])) ===
              JSON.stringify(canon([e.out.commands, e.out.frame?.seq, e.out.world]));
            if (!same) return { same: false, firstDiff: { step: i, input: e.input.k } };
            w = out.world;
          } catch (x) {
            if (e.out !== "fatal")
              return { same: false, firstDiff: { step: i, input: e.input.k, threw: String(x) } };
            break;
          }
        }
        return { same: true };
      },
      subscribe: (f) => rt.subscribe(f),
    };
  },
};
export type { Compiled };
