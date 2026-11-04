// D122 in a real page: real timers, real microtasks, no suite. spin.ts drives it over CDP. Answers as `commit: async () => cache.get(k)` gives them.
import { Effect, Scheduler } from "effect";
import { chainFixture, ChainId } from "../../conformance/fixtures/round9b.compiled.ts";
import { createRuntime } from "../driver.ts";
import { viewOf } from "../inc.ts";
import { getActor } from "../actors.ts";
import { newTask } from "./task.ts";

const g = globalThis as any;
type Say = (op: string, input: any) => "ok" | "dup" | "no";
const answer = (say: Say, how: "promise" | "sync") => (op: string, input: unknown): Effect.Effect<unknown, unknown> => {
  const a = () => say(op, input);
  if (how === "sync") return Effect.suspend(() => (a() === "ok" ? Effect.succeed({}) : Effect.fail({ _tag: a() === "dup" ? "Duplicate" : "Whatever" })));
  return Effect.tryPromise({
    try: async () => {
      const r = a();
      if (r !== "ok") throw { _tag: r === "dup" ? "Duplicate" : "Whatever" };
      return {};
    },
    catch: (e) => e,
  });
};
const hostOf = (later: "task" | "timeout") => ({
  now: () => Date.now(),
  id: () => `att-${crypto.randomUUID()}`,
  setTimer: (at: number, f: () => void) => {
    const t = setTimeout(f, Math.max(0, at - Date.now()));
    return () => clearTimeout(t);
  },
  later: later === "task" ? newTask() : (f: () => void) => void setTimeout(f, 0),
  scheduler: new Scheduler.MixedScheduler(),
  isHidden: () => document.visibilityState === "hidden",
  onHidden: () => {},
  storage: { load: () => new Map<string, string>(), write: (_w: unknown, _p: unknown, ok: (b: boolean) => void) => void ok(true) },
});
const make = (o: { how: "promise" | "sync"; say: Say; later?: "task" | "timeout"; drainMs?: number }) => {
  const issues: any[] = [];
  const f = chainFixture().make({ call: answer(o.say, o.how) } as never);
  const rt = createRuntime({
    host: hostOf(o.later ?? "task") as never,
    machines: [f],
    modules: [],
    persistence: false,
    bounds: { captureMs: 0, ...(o.drainMs === undefined ? {} : { drainMs: o.drainMs }) },
    onEvidence: () => {},
    onIssue: (i) => void issues.push(...i),
  });
  const mem = (id: string) => viewOf(getActor(rt.world().actors, `${ChainId}/${id}`)!.root) as any;
  const ensure = (id: string) => rt.input({ k: "ensure", actor: `${ChainId}/${id}`, machine: ChainId, input: {} });
  const send = (id: string, tag: string, payload: unknown = {}) => rt.input({ k: "send", actor: `${ChainId}/${id}`, event: { tag, payload } });
  return { rt, mem, ensure, send, issues };
};
// How long the page's own tasks waited: a 10 ms interval's gaps.
const gaps = () => {
  const seen: number[] = [];
  let last = performance.now();
  const t = setInterval(() => {
    const n = performance.now();
    seen.push(n - last);
    last = n;
  }, 10);
  return () => {
    clearInterval(t);
    const s = [...seen].sort((a, b) => a - b);
    return { ticks: s.length, p50: s[s.length >> 1] ?? -1, max: s.at(-1) ?? -1 };
  };
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (f: () => boolean, ms: number) => {
  const t0 = performance.now();
  while (!f()) {
    if (performance.now() - t0 > ms) return false;
    await new Promise((r) => setTimeout(r, 1));
  }
  return true;
};
g.__spin = async (o: { how: "promise" | "sync"; fail?: boolean; later?: "task" | "timeout"; ms: number }) => {
  const r = make({ how: o.how, say: () => (o.fail ? "no" : "ok"), later: o.later ?? "task" });
  r.ensure("a");
  let heard = 0;
  r.rt.subscribe(() => void heard++);
  let fired = false;
  setTimeout(() => (fired = true), o.ms / 2);
  const stop = gaps();
  r.send("a", "Spin");
  await sleep(o.ms);
  const out = { spun: r.mem("a").spun, fired, heard, gaps: stop(), storm: r.issues.filter((i) => i.code === "TurnStorm").length, visibility: document.visibilityState };
  r.send("a", "Stop");
  const stopped = await until(() => !r.rt.pending(), 1000);
  return { ...out, stopped };
};
// M2: a press on one actor, beside another's spin.
g.__press = async (o: { n: number; how: "promise" | "sync" }) => {
  const r = make({ how: o.how, say: () => "no" });
  r.ensure("a");
  r.ensure("b");
  r.send("a", "Spin");
  await sleep(100);
  const lat: number[] = [];
  for (let i = 0; i < o.n; i++) {
    const t0 = performance.now();
    r.send("b", "Press");
    await until(() => r.mem("b").presses === i + 1, 2000);
    lat.push(performance.now() - t0);
    await sleep(5);
  }
  r.send("a", "Stop");
  lat.sort((x, y) => x - y);
  return { p50: lat[lat.length >> 1], max: lat.at(-1), spun: r.mem("a").spun };
};
g.__rows = async (o: { n: number; how: "promise" | "sync"; dup?: "all" | "tenth" | "one"; later?: "task" | "timeout"; drainMs?: number; event?: string; budgetMs?: number }) => {
  const say: Say = (_op, input) => (o.dup === "all" || (o.dup === "tenth" && input.i % 10 === 0) || (o.dup === "one" && input.i === 150) ? "dup" : "ok");
  const r = make({ how: o.how, say, later: o.later ?? "task", ...(o.drainMs === undefined ? {} : { drainMs: o.drainMs }) });
  r.ensure("a");
  const stop = gaps();
  const t0 = performance.now();
  r.send("a", o.event ?? "Rows", { n: o.n });
  const done = await until(() => {
    const m = r.mem("a");
    return m.ok + m.dup >= o.n;
  }, o.budgetMs ?? 60_000);
  return { n: o.n, done, ms: Math.round(performance.now() - t0), gaps: stop(), m: { ok: r.mem("a").ok, dup: r.mem("a").dup }, storm: r.issues.filter((i) => i.code === "TurnStorm").length, visibility: document.visibilityState };
};
g.__ready = true;
