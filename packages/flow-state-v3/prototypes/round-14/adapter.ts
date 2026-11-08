// The port over this runtime (conformance/drive.ts holds settling and faults). The registry resolves `Compiled.uses` (D44); the
// fault module and the machines proxy reach the core through what production has: a module and data.
import { allActors, getActor } from "./actors.ts";
import type { Compiled } from "../conformance/fixtures/compiled.ts";
import { inPlaceGuard, type BootArgs, type Instance, type Port } from "../conformance/harness.ts";
import { createRuntime, type StepRecord } from "./driver.ts";
import { entities, readAll, type Slice } from "./entities.ts";
import { engine } from "./engine-spike.ts";
import { sessions } from "./sessions.ts";
import { kidAt, viewOf } from "./inc.ts";
import { MailQ } from "./mailq.ts";
import { row as rowOf, view, waitsOf } from "./publish.ts";
import type { Module } from "./seam.ts";
import { step, workOf as busyOf } from "./step.ts";
import { bindingIn } from "./turn.ts";
import { defaultBounds, emptyWorld, type Machines, type World } from "./world.ts";

const REGISTRY: Readonly<Record<string, Module<any>>> = { entities, sessions, engine };
const DRAIN = process.env["FLOW_DRAIN_MS"];
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
let cycles = 0;
const canon = (v: unknown, up: Set<object> = new Set()): unknown => {
  if (typeof v === "bigint") return `${v}n`;
  if (typeof v === "function") return undefined;
  if (typeof v === "symbol") return `$symbol:${String(v)}`;
  if (typeof v === "number" && !Number.isFinite(v)) return `$number:${v}`;
  if (v === null || typeof v !== "object") return v;
  if (up.has(v)) {
    cycles++;
    return "(cycle)";
  }
  up.add(v);
  try {
    return canonObject(v, up);
  } finally {
    up.delete(v);
  }
};
const canonObject = (v: object, next: Set<object>): unknown => {
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
const inText = (x: unknown) => x !== undefined && typeof x !== "function";
class Cycle extends Error {}
// Whether `JSON.stringify(canon(a)) === JSON.stringify(canon(b))`, walking plain arrays and objects side by side: a JSON value's text
// is self-delimiting and an object's keys are in an order its key set decides, so two texts are equal exactly when their parts are.
// Logged and replayed worlds are never written in place, so a pair of subtrees found equal stays equal, and the next step pays only
// for what it changed. A cycle anywhere: whole texts from then on.
const canonComparer = () => {
  const equal = new WeakMap<object, object>();
  let whole = false;
  const upA = new Set<object>();
  const upB = new Set<object>();
  const plain = (v: unknown): v is object =>
    v !== null && typeof v === "object" && (Array.isArray(v) || Object.getPrototypeOf(v) === Object.prototype);
  const scratch = new Set<object>();
  const text = (v: unknown) => JSON.stringify(canon(v, scratch));
  const item = (v: unknown) => text(v) ?? "null";
  const eq = (a: unknown, b: unknown, inArray: boolean): boolean => {
    const ta = typeof a;
    if (ta === typeof b && (ta === "string" || ta === "boolean" || (ta === "number" && Number.isFinite(a) && Number.isFinite(b)))) return a === b;
    if (!plain(a) || !plain(b)) return inArray ? item(a) === item(b) : text(a) === text(b);
    if (equal.get(a) === b) return true;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (upA.has(a) || upB.has(b)) throw new Cycle();
    upA.add(a);
    upB.add(b);
    try {
      if (Array.isArray(a)) {
        const y = b as unknown[];
        if (a.length !== y.length) return false;
        for (let i = 0; i < a.length; i++) if (!eq(i in a ? a[i] : undefined, i in y ? y[i] : undefined, true)) return false;
      } else {
        const x = a as Record<string, unknown>;
        const y = b as Record<string, unknown>;
        let nb = 0;
        for (const k of Object.keys(y)) if (inText(y[k])) nb++;
        let na = 0;
        for (const k of Object.keys(x)) {
          if (!inText(x[k])) continue;
          na++;
          if (!Object.hasOwn(y, k) || !inText(y[k]) || !eq(x[k], y[k], false)) return false;
        }
        if (na !== nb) return false;
      }
    } finally {
      upA.delete(a);
      upB.delete(b);
    }
    equal.set(a, b);
    return true;
  };
  return (a: unknown, b: unknown): boolean => {
    const before = cycles;
    if (!whole)
      try {
        const same = eq(a, b, false);
        if (cycles === before) return same;
      } catch (x) {
        if (!(x instanceof Cycle)) throw x;
      }
    whole = true;
    return text(a) === text(b);
  };
};
const CANON_CHECK = process.env["FLOW_CANON_CHECK"] === "1";
const canonChecked = { steps: 0, differ: 0 };
if (CANON_CHECK) process.on("exit", () => console.error(`CANON-CHECK steps ${canonChecked.steps}, differ ${canonChecked.differ}`));
// Everything that decides the future, normalised: ids and generations by first occurrence, mints and positions by order, times
// from now. Saved records are in (L9): what storage last heard changes what a capture writes.
const normalise = (w: World, now: number, outside: string): string => {
  // Fix pass L2: `warned` decides whether a later `EndedWithWork` or `RecordUnencodable` is said, and `soon` whether a create carries
  // `createdSoonAfterEnd`, so both are in: `soon` as the time left, only while it can still fire (its incarnation id decides nothing).
  const { nextId: _i, nextMint: _m, seq: _s, boot: _b, asked: _t, soon: soon0, ...rest0 } = w as World & { asked?: unknown };
  const soonLeft = Object.fromEntries(Object.entries(soon0).filter(([, s]) => s.dueAt > now).map(([k, s]) => [k, s.dueAt - now]));
  const rest = { ...rest0, soon: soonLeft };
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
  text = text.replace(/(\\?"gen\\?":\\?")(\d+)(\\?")/g, (_x, k, n, q) => `${k}${Number(n) - now}${q}`); // rule 73: a grace is its deadline
  const ranked = (re: RegExp) => {
    const seen = [...new Set([...text.matchAll(re)].map((m) => Number(m[2])))].sort(
      (a, b) => a - b,
    );
    const rank = new Map(seen.map((n, i) => [n, i]));
    text = text.replace(re, (_x, k, n) => `${k}${Number(n) === 0 ? "z" : (rank.get(Number(n)) ?? -1)}`);
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
    // The purity check: every logged step, input and output, guarded against a write in place (`inPlaceGuard`).
    const logged = inPlaceGuard();
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
    const terminal = new Map<string, { state: string; memory: unknown }>(); // the host's handles: each identity's last published snapshot
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
      version: () => {
        const w = cur();
        logged.guard(w);
        return w;
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
        logged.guard(r.input);
        if (r.out !== "fatal") logged.guard(r.out);
        log.push(r);
        a.faults.onLogged?.(log.length);
        if (r.out !== "fatal") countMail(r.out.world);
        if (r.out !== "fatal") early = r.out.world;
        if (r.input.k === "sent") lastCompletion = r.input;
        if (r.out !== "fatal" && r.out.frame) frames.push(r.out.frame);
        if (r.out !== "fatal" && r.out.frame)
          for (const x of allActors(r.out.world.actors)) terminal.set(x.key, { state: x.root.leaf, memory: viewOf(x.root) });
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
    let lastText: { w: World; now: number; said: string; text: string } | undefined;
    const store = (w: World) => w.ext["entities"] as Slice | undefined;
    const reg = REGISTRY["entities"]!;
    return {
      ensure: (actor, machine, input, identity) => rt.input({ k: "ensure", actor, machine, input, ...(identity ? { identity } : {}) }),
      send: (actor, event) => rt.input({ k: "send", actor, event }),
      dispose: (actor) => rt.input({ k: "dispose", actor }), // Story `dispose(ref)` is `disposeActor` (OD31): the record goes
      attach: (actor, machine, input, owner, existing, identity) =>
        rt.input({ k: "attach", actor, machine, input, owner, ...(existing ? { existing: true } : {}), ...(identity ? { identity } : {}) }),
      detach: (actor, owner) => rt.input({ k: "detach", actor, owner }),
      // Reads (2.7.17): a handle follows the identity. The live incarnation; with none, a persisted identity's record in the Runtime's copy
      // (lifecycle active); with neither, the last incarnation's terminal snapshot (disposed), or the pre-attach snapshot (none).
      snapshot: (actor) => {
        const w = rt.world();
        const live = getActor(w.actors, actor) ?? w.retired[actor];
        if (live) return { lifecycle: "active", state: live.root.leaf, memory: viewOf(live.root) };
        // D7: an identity whose record does not decode reads as quarantined, with the issue, until an ensure starts it fresh.
        if (w.undecodable[actor]) return { lifecycle: "quarantined", issue: "RecordUndecodable" };
        const last = terminal.get(actor);
        return last ? { ...last, lifecycle: "disposed" } : { lifecycle: "pre-attach" };
      },
      inspect: (actor) => {
        const w = rt.world();
        const t = w.timers[`grace/${actor}`];
        const bound = getActor(w.actors, actor) !== undefined || Object.hasOwn(w.retired, actor) || Object.hasOwn(w.undecodable, actor);
        const unbound = bound ? [] : Object.values(w.lanes).filter((l) => l.actor === actor).map((l) => l.id);
        const quarantined = Object.keys(w.quarantined).filter((id) => id.startsWith(`${actor}|`));
        return { uses: w.uses[actor] ?? [], busy: busyOf(w, actor), ...(t ? { grace: t.dueAt } : {}), waiting: Object.values(w.waiting).filter((x) => x.actor === actor).map((x) => x.id), unbound, quarantined };
      },
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
      stateText: (outside) => {
        const w = rt.world();
        const now = a.host.now();
        const said = `${outside}|${rt.edgeText()}`;
        if (lastText?.w !== w || lastText.now !== now || lastText.said !== said) lastText = { w, now, said, text: normalise(w, now, said) };
        return lastText.text;
      },
      // S11: pure re-execution of this boot's input log, with its logged draws, against what was published.
      replay: (before) => {
        const was = logged.written();
        if (was.arrays > 0) return { same: false, firstDiff: { writtenInPlace: was } };
        const replayed = inPlaceGuard(false);
        let w: World = emptyWorld;
        const compare = canonComparer();
        const sameCanon = (x: unknown, y: unknown) => {
          const same = compare(x, y);
          if (CANON_CHECK) {
            canonChecked.steps++;
            if (same !== (JSON.stringify(canon(x)) === JSON.stringify(canon(y)))) {
              canonChecked.differ++;
              throw new Error(`canon comparison differs from canon text: ${same}`);
            }
          }
          return same;
        };
        for (let i = 0; i < log.length; i++) {
          before(i);
          const e = log[i]!;
          let d = 0;
          const env = { now: e.now, id: () => e.ids[d++]! };
          try {
            const out = step(w, e.input, env, sys);
            replayed.guard(out);
            if (e.out === "fatal")
              return { same: false, firstDiff: { step: i, input: e.input.k, was: "fatal" } };
            const same = sameCanon([out.commands, out.frame?.seq, out.world], [e.out.commands, e.out.frame?.seq, e.out.world]);
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
        const then = logged.written();
        if (then.arrays > 0) return { same: false, firstDiff: { writtenInPlace: then } };
        return { same: true };
      },
      subscribe: (f) => rt.subscribe(f),
    };
  },
};
export type { Compiled };
