// S4's page: a runtime given by --runtime, real timers, real microtasks, real fibers, in a browser. Bundled by s4-run.ts into about:blank.
// No suite, no fake: a commit answers on the next macrotask. Turn time is `send` to its return, since D2 runs it there.
import { Effect, Scheduler } from "effect";
import { issuesFixture, server as serverModel } from "../fixtures/issues.compiled.ts";
import { ringFixture } from "../fixtures/order.compiled.ts";
import type { Api } from "../fake-world.ts";
// @ts-expect-error: resolved by s4-run.ts's plugin to the runtime under test
import { createRuntime } from "flow-runtime/driver";
// @ts-expect-error: as above
import { entities } from "flow-runtime/entities";
import { growActor, growMachine, message } from "./fixture.ts";

let state = serverModel.init();
let ids = 0;
const answerLater = (v: () => unknown) =>
  Effect.callback<unknown>((resume) => {
    setTimeout(() => resume(Effect.succeed(v())), 0);
  });
const api = {
  call: (op: string, input: any) =>
    answerLater(() => {
      if (op === "list" || op === "repair")
        return serverModel.read!(op, input, state, undefined as never);
      const out = serverModel.apply!(op, input, state);
      state = out.s;
      return out.value;
    }),
} as unknown as Api;
const issues = issuesFixture.make(api);
const ring = ringFixture.make(api);
const machines = { [issues.id]: issues, [ring.id]: ring };
const newRuntime = () =>
  createRuntime({
    host: {
      now: () => performance.now(),
      id: () => `att-${++ids}`,
      setTimer: (at, f) => {
        const t = setTimeout(f, Math.max(0, at - performance.now()));
        return () => clearTimeout(t);
      },
      later: (f) => void setTimeout(f, 0),
      scheduler: new Scheduler.MixedScheduler(),
      storage: { load: () => new Map(), write: () => {} },
    },
    machines,
    modules: [entities],
    onEvidence: () => {},
    onIssue: (i) => {
      for (const x of i) (globalThis as any).__issues.push(x.code);
    },
  });
// Persisted memory at size: a value's whole turn on this main thread, writes going nowhere. Only the cost of the turn.
(globalThis as any).__grow = (size: number, bounds: object) => {
  const m = growMachine(size, true);
  const rt = createRuntime({
    host: {
      now: () => performance.now(),
      id: () => `att-${++ids}`,
      setTimer: () => () => {},
      later: (f: () => void) => void setTimeout(f, 0),
      scheduler: new Scheduler.MixedScheduler(),
      storage: { load: () => new Map(), write: () => {} },
    },
    machines: { [m.id]: m },
    modules: [],
    bounds,
    onEvidence: () => {},
    onIssue: () => {},
  });
  rt.input({ k: "ensure", actor: growActor, machine: m.id, input: {} });
  const turns = size >= 10_000 ? 30 : 100;
  const xs: number[] = [];
  for (let i = 0; i < turns; i++) {
    const t = performance.now();
    rt.input({
      k: "send",
      actor: growActor,
      event: { tag: "Add", payload: { message: message(size + i) } },
    });
    xs.push(performance.now() - t);
  }
  return {
    size,
    medianMs: Math.round(pct(xs, 0.5) * 100) / 100,
    p99Ms: Math.round(pct(xs, 0.99) * 100) / 100,
  };
};
const pct = (xs: number[], p: number) =>
  [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) * p)]!;
const stats = (xs: number[]) => ({
  n: xs.length,
  medianUs: Math.round(pct(xs, 0.5) * 1000),
  p99Us: Math.round(pct(xs, 0.99) * 1000),
  maxUs: Math.round(Math.max(...xs) * 1000),
});
(globalThis as any).__issues = [];
(globalThis as any).__run = async (actors: number) => {
  const rt = newRuntime();
  for (let i = 0; i < actors; i++)
    rt.input({ k: "ensure", actor: `Ring/${i}`, machine: "Ring", input: {} });
  const a = "Issues/List/a";
  rt.input({ k: "ensure", actor: a, machine: "Issues/List", input: {} });
  rt.input({ k: "send", actor: a, event: { tag: "Load", payload: {} } });
  await new Promise((r) => setTimeout(r, 20));
  // A plain turn, on one of many actors: most of what a click costs in the core.
  const say: number[] = [];
  for (let i = 0; i < 2000; i++) {
    const t = performance.now();
    rt.input({
      k: "send",
      actor: `Ring/${i % Math.max(actors, 1)}`,
      event: { tag: "JobUnsure", payload: {} },
    });
    say.push(performance.now() - t);
  }
  // performance.now is coarse in a page, so a whole batch gives the mean a single sample cannot.
  const b0 = performance.now();
  for (let i = 0; i < 2000; i++)
    rt.input({
      k: "send",
      actor: `Ring/${i % Math.max(actors, 1)}`,
      event: { tag: "JobUnsure", payload: {} },
    });
  const plainMeanUs = Math.round(((performance.now() - b0) / 2000) * 1000 * 10) / 10;
  // A click: a commit, a prediction, a queue join, a real fiber started, one publication.
  const click: number[] = [];
  const round: number[] = [];
  for (let i = 0; i < 300; i++) {
    const t = performance.now();
    rt.input({
      k: "send",
      actor: a,
      event: { tag: "Toggle", payload: { id: "i1", liked: i % 2 === 0 } },
    });
    click.push(performance.now() - t);
    while (Object.keys(rt.world().lanes).length) await new Promise((r) => setTimeout(r, 0));
    round.push(performance.now() - t);
  }
  return {
    actors,
    plainMeanUs,
    plainTurn: stats(say),
    click: stats(click),
    clickToSettled: stats(round),
    issues: (globalThis as any).__issues,
  };
};
