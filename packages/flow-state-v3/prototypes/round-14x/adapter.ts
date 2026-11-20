// The port over this runtime (conformance/drive.ts holds settling and faults). The registry resolves `Compiled.uses` (D44); the
// fault module and the machines proxy reach the core through what production has: a module and data.
import { getActor } from "./actors.ts";
import type { Compiled } from "../conformance/fixtures/compiled.ts";
import type { BootArgs, Instance, Port } from "../conformance/harness.ts";
import { createRuntime, type StepRecord } from "./driver.ts";
import { entities, readAll, type Slice } from "./entities.ts";
import { engine } from "./engine-spike.ts";
import { sessions } from "./sessions.ts";
import { kidAt, viewOf } from "./inc.ts";
import { MailQ } from "./mailq.ts";
import { row as rowOf, view, waitsOf } from "./publish.ts";
import type { Module } from "./seam.ts";
import { step } from "./step.ts";
import { bindingIn } from "./turn.ts";
import { defaultBounds, emptyWorld, type Machines, type World } from "./world.ts";

const REGISTRY: Readonly<Record<string, Module<any>>> = { entities, sessions, engine };
const DRAIN = process.env["FLOW_DRAIN_MS"];
const FREEZE = process.env["FLOW_DEEP_FREEZE"] === "1";
const STEP_HOOKS = new Set([
  "prepare",
  "start",
  "ended",
  "blocks",
  "input",
  "told",
  "save",
  "restored",
  "dispose",
]);
export { sessions };

// For the suite's hash and replay only. Total: a world may hold what never needed encoding (D57).
// D141, bugs M3: what decides a future is the value, not the JSON it makes. A Date, a Map, a Set, a NaN each say what they are, so two states with different dates are two states.
const canon = (v: unknown, up: readonly unknown[] = []): unknown => {
  if (typeof v === "bigint") return `${v}n`;
  if (typeof v === "function") return undefined;
  if (typeof v === "symbol") return `$symbol:${String(v)}`;
  if (typeof v === "number" && !Number.isFinite(v)) return `$number:${v}`;
  if (v === null || typeof v !== "object") return v;
  if (up.includes(v)) return "(cycle)";
  const next = [...up, v];
  if (Array.isArray(v)) return v.map((x) => canon(x, next));
  if (v instanceof MailQ) return [...v].map((x) => canon(x, next));
  if (v instanceof Date) return `$date:${v.getTime()}`;
  if (v instanceof Map) return { $map: [...v].map((x) => canon(x, next)) };
  if (v instanceof Set) return { $set: [...v].map((x) => canon(x, next)) };
  return Object.fromEntries(
    Object.keys(v)
      .sort()
      .map((k) => [k, canon((v as Record<string, unknown>)[k], next)]),
  );
};
// Everything that decides the future, normalised: ids and generations by first occurrence, mints and positions by order, times
// from now. Saved records are in (L9): what storage last heard changes what a capture writes.
const normalise = (w: World, now: number, outside: string): string => {
  const { nextId: _i, nextMint: _m, seq: _s, boot: _b, asked: _t, ...rest } = w;
  // D143, over-assumptions F2: the ranks below are for the runtime's own fields. A user's memory, payload, input or value is theirs: written with no `"`, so no rank can reach a `pos` or a `since` in it, and `{pos:1}` and `{pos:2}` stay two states.
  // Its copies inside the edge's bytes and the fake's open requests are still ranked; one exact copy in the world is enough to keep the two states apart.
  const USER = new Set(["memory", "payload", "input", "value"]);
  const opaque = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(opaque);
    if (v === null || typeof v !== "object") return v;
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k, USER.has(k) && x !== null && typeof x === "object" ? `$user:${JSON.stringify(x).replaceAll('"', "'")}` : opaque(x)]),
    );
  };
  let text = `${JSON.stringify(opaque(canon(rest)))}|${outside}`;
  text = text.replace(/(\\?"dueAt\\?":)(\d+)/g, (_x, k, n) => `${k}${Number(n) - now}`);
  const ranked = (re: RegExp) => {
    const seen = [...new Set([...text.matchAll(re)].map((m) => Number(m[2])))].sort(
      (a, b) => a - b,
    );
    text = text.replace(re, (_x, k, n) => `${k}${Number(n) === 0 ? "z" : seen.indexOf(Number(n))}`);
  };
  ranked(/(\\?"mint\\?":)(\d+)/g);
  ranked(/(\\?"boot\\?":)(\d+)/g); // D99: a record's stamp. What matters is which are the same
  ranked(/(\\?"(?:sentAt|landedAt|pos|doubt|since)\\?":)(\d+)/g);
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

// D142: this runtime's format, said by the runtime. `actor/<key>` holds an actor's record; `lane/<actor>|<op>|<key>` a lane, with its head and parked endings.
const json = (v: string): any => {
  try {
    return JSON.parse(v);
  } catch {
    return undefined;
  }
};
const lanes = (kv: ReadonlyMap<string, string>) => [...kv].filter(([k]) => k.startsWith("lane/")).map(([, v]) => json(v));
const disk: Port["disk"] = {
  kind: (k) => (k.startsWith("actor/") ? "actor" : k.startsWith("lane/") ? "lane" : k === "meta" ? "meta" : k.startsWith("host/") ? "host" : "other"),
  scope: (k) => (k.startsWith("actor/") ? k.slice(6) : k.startsWith("lane/") ? k.slice(5, k.indexOf("|") < 0 ? undefined : k.indexOf("|")) : undefined),
  heads: (kv) => lanes(kv).flatMap((l) => (typeof l?.head?.id === "string" ? [l.head.id] : [])),
  parked: (kv) => [...kv].filter(([k]) => k.startsWith("lane/")).flatMap(([k, v]) => {
    const l = json(v);
    return Array.isArray(l?.parked) ? l.parked.map((p: any) => ({ op: String(l.op), attempt: p?.attempt ?? "", lane: k })) : [];
  }),
  decode: (_k, v) => JSON.parse(v),
  // Stage K: an actor record is `{ key, machine, root, timers, retired? }`; an incarnation `{ leaf, kids, frozen? }`, kids by path part.
  leaves: (kv, actor) => {
    const r = json(kv.get(`actor/${actor}`) ?? "");
    if (!r || typeof r !== "object" || r.retired || typeof r.root?.leaf !== "string") return undefined;
    const out: Array<{ path: readonly string[]; leaf: string }> = [];
    const walk = (i: any, p: readonly string[]) => {
      if (typeof i?.leaf === "string" && !i.frozen) out.push({ path: p, leaf: i.leaf });
      for (const [k, v] of Object.entries(i?.kids ?? {})) walk(v, [...p, k]);
    };
    walk(r.root, []);
    return out;
  },
};
export const port: Port = {
  disk,
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
    // A core bug, reached through data: the next read of the machines throws, inside core code.
    const faultedMachines = (t0: Machines): Machines =>
      new Proxy(t0, {
        get(t, k, r) {
          if (a.faults.coreThrows > 0) {
            a.faults.coreThrows--;
            throw new Error("fault in core");
          }
          return Reflect.get(t, k, r);
        },
      });
    const log: StepRecord[] = [];
    // The purity check: world, inputs and outputs frozen around every step. A step that writes in place throws, and that is Fatal.
    const deepFreeze = (v: any, seen = new Set<unknown>()): void => {
      if (v === null || typeof v !== "object" || seen.has(v) || Object.isFrozen(v)) return;
      const proto = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== Array.prototype) return; // plain objects only
      seen.add(v);
      Object.freeze(v);
      for (const k of Object.keys(v)) deepFreeze(v[k], seen);
    };
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
    const CAP = process.env["FLOW_CAPTURE_MS"]; // a sweep: every case at D80's interval
    const bounds = {
      ...a.bounds,
      ...(DRAIN === undefined ? {} : { drainMs: Number(DRAIN) }),
      ...(CAP === undefined ? {} : { captureMs: Number(CAP) }),
    };
    const byId: Record<string, Compiled> = {};
    for (const c of a.compiled) byId[c.id] ??= c;
    // Stage J (S1): what is published, from the first step on. Before `createRuntime` returns (a boot's own pump), the world of the last
    // step logged; after, the runtime's. The same reads either way, so a boot's runs are read like any other.
    let early: World = emptyWorld;
    let up = false;
    const cur = (): World => (up ? rt.world() : early);
    const reads = {
      state: (x: string) => getActor(cur().actors, x)?.root.leaf,
      binding: (x: string, op: string, subject: readonly string[]) => {
        const r = getActor(cur().actors, x);
        return r && bindingIn(byId, r, op, subject); // the sealed data as booted, not `rt.sys.machines`: a read there is a core fault's trigger
      },
      memory: (x: string) => {
        const r = getActor(cur().actors, x)?.root;
        return r && viewOf(r);
      },
      inner: (x: string, path: readonly string[]) => {
        const r = getActor(cur().actors, x)?.root;
        const i = r && kidAt(r, path);
        return i && { state: i.leaf, memory: viewOf(i) };
      },
    };
    a.reads?.(reads);
    const rt = createRuntime({
      host: a.host,
      machines: a.compiled, // D77: createRuntime seals
      ...(a.services ? { services: a.services } : {}), // D211
      around: faultedMachines,
      modules,
      bounds,
      onStep: (r) => {
        if (FREEZE) {
          deepFreeze(r.input);
          if (r.out !== "fatal") deepFreeze(r.out);
        }
        log.push(r);
        a.faults.onLogged?.(log.length);
        if (r.out !== "fatal") countMail(r.out.world);
        if (r.out !== "fatal") early = r.out.world;
        if (r.input.k === "sent") lastCompletion = r.input;
        if (r.out !== "fatal" && r.out.frame) frames.push(r.out.frame);
      },
      onEvidence: (e) => a.onEvidence(e),
      onIssue: (i) => a.onIssue(i),
    });
    up = true;
    const plain: Machines = rt.sealed;
    const sys = {
      get machines() {
        return rt.sys.machines; // D87: a failed read unpersists them
      },
      modules,
      bounds: { ...defaultBounds, ...bounds },
    };
    const store = (w: World) => w.ext["entities"] as Slice | undefined;
    const reg = REGISTRY["entities"]!;
    return {
      ensure: (actor, machine, input) => rt.input({ k: "ensure", actor, machine, input }),
      send: (actor, event) => rt.input({ k: "send", actor, event }),
      dispose: (actor) => rt.input({ k: "dispose", actor }), // Story `dispose(ref)`: the explicit rebind, the record kept
      attach: (actor, machine, input, existing) => rt.input({ k: "attach", actor, machine, input, ...(existing ? { existing: true } : {}) }),
      release: (actor) => rt.input({ k: "release", actor }),
      disposeRuntime: () => rt.input({ k: "disposeRuntime" }),
      repeatLastCompletion: () => {
        if (lastCompletion) rt.input(lastCompletion);
      },
      pending: () => rt.pending(),
      live: () => rt.live(),
      logLength: () => log.length,
      ...reads,
      row: (x, op, key) => rowOf(rt.world(), x, op, key),
      record: (ref) => {
        const s = store(rt.world());
        return s && (reg.read!(s, ref) as never);
      },
      module: (id, ref) => {
        const s = rt.world().ext[id];
        return s === undefined ? undefined : REGISTRY[id]?.read!(s, ref);
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
      stateText: (outside) => normalise(rt.world(), a.host.now(), `${outside}|${rt.edgeText()}`),
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
            if (!same) {
              if (process.env["FLOW_REPLAY_TRACE"]) {
                const a = JSON.stringify(canon([out.commands, out.frame?.seq, out.world]));
                const b = JSON.stringify(canon([e.out.commands, e.out.frame?.seq, e.out.world]));
                let k = 0;
                while (k < a.length && a[k] === b[k]) k++;
                console.log(`REPLAY at ${k}\n  replayed ${a.slice(Math.max(0, k - 120), k + 160)}\n  logged   ${b.slice(Math.max(0, k - 120), k + 160)}`);
              }
              return { same: false, firstDiff: { step: i, input: e.input.k } };
            }
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
