// Turns a runtime's `Port` into a Harness. Settling, faults, plans and the fake live here, so a rewrite replaces only the
// port. Faults reach a runtime through what production has: compiled data (Slots), a Host, and its own input port.
import type { Compiled } from "./fixtures/compiled.ts";
import { FakeWorld, NoHeldRequest } from "./fake-world.ts";
import type { FaultState, Harness, Instance, Port, Step } from "./harness.ts";

export const rowKey = (op: string, key: unknown) => `${op}|${JSON.stringify(key)}`;
const actorKey = (a: { actor: string; id: string }) => `${a.actor}/${a.id}`;

export const makeHarness = (port: Port) => (): Harness => {
  let fake: FakeWorld;
  let compiled: Compiled[] = [];
  let bounds = {};
  let inst: Instance;
  const instances: Instance[] = [];
  const evidence: Array<Record<string, any>> = [];
  const issues: Array<{ code: string; origin?: string; input?: unknown }> = [];
  const faults: FaultState = {
    moduleThrows: new Map(),
    moduleThrowsAfter: new Map(),
    coreThrows: 0,
  };
  const throwIn = new Map<string, number>();
  const startThrows = new Set<string>();
  const armed: Array<{ segment: number; at: number; arm: () => void }> = [];
  const listeners: Array<() => void> = [];
  let dup: string | undefined;
  let plan: { at: number; inject: Step } | undefined;
  let yieldPlan: Step | undefined;
  const injections = { planned: 0, done: 0, withLive: 0, withChoice: 0 };

  // Compiled data is plain data: wrapping its Slots is what a test build would do, and the core cannot tell.
  const wrap = (v: any): any => {
    if (Array.isArray(v)) return v.map(wrap);
    if (v === null || typeof v !== "object") return v;
    if (typeof v.run === "function" && v.at) {
      const path: string = v.at.path;
      return {
        ...v,
        run: (...a: unknown[]) => {
          const n = throwIn.get(path);
          if (n) {
            throwIn.set(path, n - 1);
            throw new Error(`fault at ${path}`);
          }
          return v.run(...a);
        },
      };
    }
    if (Object.getPrototypeOf(v) !== Object.prototype) return v;
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => {
        if (k === "domain") return [k, x]; // opaque to the core; the module wraps nothing of it here
        if (k === "commit" && typeof x === "function")
          return [
            k,
            (i: unknown, c: unknown) => {
              if (startThrows.has(v.id)) {
                startThrows.delete(v.id);
                throw new Error(`start fault in ${v.id}`);
              }
              return (x as (i: unknown, c: unknown) => unknown)(i, c);
            },
          ];
        return [k, wrap(x)];
      }),
    );
  };
  const boot = () => {
    inst = port.boot({
      host: fake.host(),
      compiled,
      bounds,
      faults,
      onEvidence: (e) => void evidence.push(...e),
      onIssue: (i) => void issues.push(...i),
    });
    for (const f of listeners) inst.subscribe(f);
    instances.push(inst);
  };
  const settle = () => {
    for (let guard = 0; guard < 50_000; guard++) {
      if (plan && fake.scheduler.picks >= plan.at) {
        const { inject } = plan;
        plan = undefined;
        injections.done++;
        if (inst.live() > 0) injections.withLive++;
        if (fake.scheduler.q.length > 1) injections.withChoice++;
        run(inject);
      }
      if (yieldPlan && fake.hasLaters()) {
        const inject = yieldPlan;
        yieldPlan = undefined;
        run(inject);
      }
      const had = fake.hasWork();
      fake.settleStep();
      if (!had && !fake.hasWork() && !inst.pending()) return;
    }
    throw new Error("settle: did not quiesce");
  };
  // The oracle's exemption, from what the suite owns: an Attempt no write of which reached the disk dies with its process.
  const noteLost = () => {
    const disk = [...fake.kv.values()].join("\n");
    const gone = evidence
      .filter((e) => e["kind"] === "mint" && !disk.includes(e["attempt"]))
      .map((e) => ({ kind: "lostWithProcess", attempt: e["attempt"] }));
    evidence.push(...gone);
  };
  const arm = (f: () => void) => {
    armed.push({ segment: instances.length - 1, at: inst.logLength(), arm: f });
    f();
  };
  const run = (s: Step) => {
    if ("ensure" in s) inst.ensure(actorKey(s.ensure), s.ensure.actor, s.input);
    else if ("send" in s)
      inst.send(actorKey(s.send), {
        tag: s.event,
        payload: s.payload ?? {},
        ...(s.to ? { to: s.to } : {}),
      });
    else if ("dispose" in s) inst.dispose(actorKey(s.dispose));
    else if ("answer" in s) fake.answer(s.answer, s.with, s.where);
    else if ("storage" in s) fake.storageStep(s.storage, s.match);
    else if ("feed" in s) {
      fake.feedStep(s.feed, s);
    } else if ("disposeRuntime" in s) inst.disposeRuntime();
    else throw new Error(`raw: not a plain step: ${Object.keys(s)[0]}`);
  };
  const reads: Harness["read"] = {
    state: (a) => inst.state(actorKey(a)),
    memory: (a) => inst.memory(actorKey(a)),
    inner: (a, p) => inst.inner(actorKey(a), p),
    row: (a, op, key) => inst.row(actorKey(a), op, key ?? {}),
    record: (ref) => inst.record(ref),
    module: (id, ref) => inst.module(id, ref),
    peakDeliveriesInMail: () => Math.max(0, ...instances.map((i) => i.peakDeliveriesInMail())),
    requests: () => fake.publicRequests(),
    truth: () => fake.truth(),
    frames: () => instances.flatMap((i) => i.frames()),
    issues: () => issues,
    evidence: (kind) => (kind ? evidence.filter((e) => e["kind"] === kind) : evidence),
    stored: () => new Map([...fake.kv].map(([k, v]) => [k, JSON.parse(v)])),
    quiet: () => ({
      idle: !inst.pending() && !fake.hasWork(),
      fatal: inst.fatal(),
      waits: inst.waits(),
    }),
    outside: () => ({ ...fake.outside(), live: inst.live(), injections }),
    stateHash: () => inst.stateText(fake.stateText()),
    // S11: pure re-execution of each boot's input log, with its logged draws, against what was published.
    replay: () => {
      const liveThrow = new Map(throwIn);
      const liveModule = new Map(faults.moduleThrows);
      const liveCore = faults.coreThrows;
      throwIn.clear();
      faults.moduleThrows.clear();
      const liveAfter = new Map(faults.moduleThrowsAfter);
      faults.moduleThrowsAfter.clear();
      faults.coreThrows = 0;
      let result: { same: boolean; firstDiff?: unknown } = { same: true };
      for (let si = 0; si < instances.length; si++) {
        const r = instances[si]!.replay((i) => {
          for (const a of armed) if (a.segment === si && a.at === i) a.arm();
        });
        if (!r.same) {
          result = { same: false, firstDiff: { segment: si, ...(r.firstDiff as object) } };
          break;
        }
      }
      throwIn.clear();
      for (const [k, v] of liveThrow) throwIn.set(k, v);
      faults.moduleThrows.clear();
      for (const [k, v] of liveModule) faults.moduleThrows.set(k, v);
      faults.moduleThrowsAfter.clear();
      for (const [k, v] of liveAfter) faults.moduleThrowsAfter.set(k, v);
      faults.coreThrows = liveCore;
      return result;
    },
  };
  return {
    start(cfg) {
      fake = new FakeWorld(cfg.seed, cfg.machines.find((m) => m.server)?.server);
      bounds = cfg.bounds ?? {};
      compiled = cfg.machines.map((m) => wrap(m.make(fake.api)));
      boot();
    },
    raw: run,
    subscribe(f) {
      listeners.push(f);
      inst.subscribe(f);
    },
    send(a, event, payload) {
      inst.send(actorKey(a), { tag: event, payload: payload ?? {} });
    },
    do(s) {
      if ("advance" in s) {
        settle();
        fake.advanceWith(s.advance, settle);
        return;
      }
      if ("reload" in s) {
        plan = undefined;
        noteLost();
        fake.killProcess();
        boot();
        if (s.crashAfterBoot) {
          fake.killProcess();
          boot();
        }
        settle();
        return;
      }
      if ("fault" in s) {
        const f = s.fault;
        if ("throwIn" in f) arm(() => void throwIn.set(f.throwIn, f.times ?? 1));
        else if ("throwInModule" in f) arm(() => void faults.moduleThrows.set(f.throwInModule, 1));
        else if ("throwInModuleAfter" in f)
          arm(() => void faults.moduleThrowsAfter.set(f.throwInModuleAfter, 1));
        else if ("throwInCore" in f) arm(() => void (faults.coreThrows = 1));
        else if ("startThrows" in f) startThrows.add(f.startThrows);
        else if ("afterYield" in f) yieldPlan = f.afterYield;
        else if ("mutateServer" in f) fake.serverState = f.mutateServer(fake.serverState);
        else if ("socketClose" in f) fake.closeMs = f.socketClose;
        else if ("corruptStored" in f) {
          // A record edited on disk may be quarantined, and an Attempt in it with it: rule 46, named by an issue.
          const hit = [...fake.kv].filter(([k]) => k.includes(f.corruptStored.match)).map(([, v]) => v);
          const inHit = evidence
            .filter((e) => e["kind"] === "mint" && hit.some((v) => v.includes(e["attempt"])))
            .map((e) => ({ kind: "lostWithProcess", attempt: e["attempt"] }));
          evidence.push(...inHit);
          fake.corrupt(f.corruptStored.match, f.corruptStored.edit);
        }
        else if ("uninterruptibleHang" in f) fake.uninterruptible.add(f.uninterruptibleHang);
        else if ("syncAnswer" in f) fake.syncAnswers.set(f.syncAnswer[0], f.syncAnswer[1]);
        else if ("lateAnswer" in f) fake.lateAnswer(f.lateAnswer[0], f.lateAnswer[1]);
        else if ("landLate" in f) fake.landLate(f.landLate);
        else if ("duplicateCompletion" in f) dup = f.duplicateCompletion;
        else if ("schedulerShuffle" in f) {
          fake.scheduler.shuffle = f.schedulerShuffle;
          fake.scheduler.yieldEvery = 3;
          fake.yields = 1;
          if (f.inject) {
            injections.planned++;
            plan = { at: fake.scheduler.picks + (f.atTick ?? 0), inject: f.inject };
          }
        } else throw new Error(`fault not built: ${Object.keys(f)[0]}`);
        settle();
        return;
      }
      run(s);
      settle();
      // At-least-once delivery: the driver's own port receives the same completion again.
      if (dup && "answer" in s && s.answer === dup) {
        dup = undefined;
        inst.repeatLastCompletion();
        settle();
      }
    },
    read: reads,
  };
};
export { NoHeldRequest };
