// The harness over this runtime. Faults reach it only through what production has: compiled data (Slots, modules),
// the Host, and `input`, the driver's own port.
import type { Compiled } from "../conformance/fixtures/compiled.ts";
import { FakeWorld } from "../conformance/fake-world.ts";
import type { Harness, Step } from "../conformance/harness.ts";
import { afterAbort, createRuntime, safeStep, type LogEntry, type Runtime } from "./driver.ts";
import { persistence } from "./persistence.ts";
import { row, view, waitsOf } from "./publish.ts";
import { emptyWorld } from "./step.ts";
import type { Evidence, Issue, Module, World } from "./world.ts";

const DRAIN_MS =
  process.env["FLOW_DRAIN_MS"] === undefined ? 8 : Number(process.env["FLOW_DRAIN_MS"]);

const actorKey = (a: { actor: string; id: string }) => `${a.actor}/${a.id}`;

export const makeHarness = (): Harness => {
  let fake: FakeWorld;
  let compiled: Compiled[] = [];
  let rt: Runtime;
  const evidence: Evidence[] = [];
  const issues: Issue[] = [];
  const segments: Array<{ log: LogEntry[]; frames: Runtime["frames"] }> = [];
  // Faults, armed at a log position so replay re-arms them at the same place.
  const faults = { throwIn: new Map<string, number>(), moduleThrows: 0 };
  const armed: Array<{ segment: number; at: number; arm: () => void }> = [];
  const dup = { op: undefined as string | undefined };
  let tickPlan: { atTick: number; inject: Step } | undefined;

  const faultModule: Module = {
    id: "fault",
    rank: 99,
    onCommit(s) {
      if (faults.moduleThrows > 0) {
        faults.moduleThrows--;
        throw new Error("fault in a module");
      }
      return s;
    },
  };
  const modules = [persistence, faultModule];

  // Compiled data is plain data: wrapping its Slots is what a test build would do, and the core cannot tell.
  const wrap = (v: any): any => {
    if (Array.isArray(v)) return v.map(wrap);
    if (v === null || typeof v !== "object") return v;
    if (typeof v.run === "function" && v.at) {
      const path: string = v.at.path;
      return {
        ...v,
        run: (a: unknown) => {
          const n = faults.throwIn.get(path);
          if (n) {
            faults.throwIn.set(path, n - 1);
            throw new Error(`fault at ${path}`);
          }
          return v.run(a);
        },
      };
    }
    if (Object.getPrototypeOf(v) !== Object.prototype) return v;
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, wrap(x)]));
  };
  const boot = () => {
    rt = createRuntime({
      host: fake.host(),
      compiled,
      modules,
      bounds: { drainMs: DRAIN_MS },
      onEvidence: (e) => {
        evidence.push(...e);
        if (evidence.length > 2_000) throw new Error("TurnStorm"); // D13's test-mode issue, here as a hard stop
      },
      onIssue: (i) => void issues.push(...i),
    });
    segments.push({ log: rt.log, frames: rt.frames });
  };
  const settle = () => {
    let tick = 0;
    for (let guard = 0; guard < 2_000; guard++) {
      if (tickPlan && tick === tickPlan.atTick) {
        const { inject } = tickPlan;
        tickPlan = undefined;
        run(inject);
      }
      const had = fake.scheduler.q.length > 0;
      if (had) tick++;
      fake.settleStep();
      if (!had && !fake.scheduler.q.length && !rt.pending() && !tickPlan) return;
      if (!had && !fake.scheduler.q.length && !rt.pending()) tickPlan = undefined;
    }
    throw new Error("settle: did not quiesce");
  };
  const arm = (f: () => void) => {
    armed.push({ segment: segments.length - 1, at: rt.log.length, arm: f });
    f();
  };
  const run = (s: Step) => {
    if ("ensure" in s)
      rt.input({ k: "ensure", actor: actorKey(s.ensure), machine: s.ensure.actor, input: s.input });
    else if ("send" in s)
      rt.input({
        k: "send",
        actor: actorKey(s.send),
        event: { tag: s.event, payload: s.payload ?? {} },
      });
    else if ("answer" in s) fake.answer(s.answer, s.with);
    else if ("storage" in s) fake.storageStep(s.storage, s.match);
    else if ("disposeRuntime" in s) rt.input({ k: "disposeRuntime" });
    else if ("dispose" in s) throw new Error("dispose: the row is outside round 1");
  };

  return {
    start(cfg) {
      fake = new FakeWorld(cfg.seed, cfg.storage);
      compiled = cfg.machines.map((m) => wrap(m.make(fake.api)));
      boot();
    },
    do(s) {
      if ("advance" in s) {
        settle();
        fake.advanceWith(s.advance, settle);
        return;
      }
      if ("reload" in s) {
        fake.killProcess();
        boot();
        settle();
        return;
      }
      if ("fault" in s) {
        const f = s.fault;
        if ("throwIn" in f) arm(() => void faults.throwIn.set(f.throwIn, f.times ?? 1));
        else if ("throwInModule" in f) arm(() => void (faults.moduleThrows = 1));
        else if ("uninterruptibleHang" in f) fake.uninterruptible.add(f.uninterruptibleHang);
        else if ("syncAnswer" in f) fake.syncAnswers.set(f.syncAnswer[0], f.syncAnswer[1]);
        else if ("lateAnswer" in f) fake.lateAnswer(f.lateAnswer[0], f.lateAnswer[1]);
        else if ("duplicateCompletion" in f) dup.op = f.duplicateCompletion;
        else if ("schedulerShuffle" in f) {
          fake.scheduler.shuffle = f.schedulerShuffle;
          fake.scheduler.yieldEvery = 3;
          fake.yields = 1;
          if (f.inject) tickPlan = { atTick: f.atTick ?? 0, inject: f.inject };
        } else throw new Error(`fault not built: ${Object.keys(f)[0]}`);
        settle();
        return;
      }
      run(s);
      settle();
      // At-least-once delivery: the driver's own port receives the same completion again.
      if (dup.op && "answer" in s && s.answer === dup.op) {
        const again = [...rt.log].reverse().find((e) => e.input.k === "sent");
        dup.op = undefined;
        if (again) rt.input(again.input);
        settle();
      }
    },
    read: {
      state: (a) => rt.world().actors[actorKey(a)]?.leaf,
      memory: (a) => rt.world().actors[actorKey(a)]?.memory,
      row: (a, op, key) => row(rt.world(), actorKey(a), op, key ?? {}),
      requests: () => fake.publicRequests(),
      truth: () => fake.truth(),
      frames: () =>
        segments.flatMap((s) =>
          s.frames.map((f) => ({ cause: f.cause, at: f.at, seq: f.seq, view: view(f.world) })),
        ),
      issues: () => issues,
      evidence: (kind) => (kind ? evidence.filter((e) => e.kind === kind) : evidence),
      stored: () => new Map([...fake.kv].map(([k, v]) => [k, JSON.parse(v)])),
      quiet: () => {
        const waits = waitsOf(rt.world(), modules);
        const open = ["pay", "place", "void", "intent", "order"]
          .filter((op) => fake.hasOpen(op))
          .map((op) => `open:${op}`);
        const held = fake.heldStorage();
        return {
          idle: !rt.pending(),
          waits: [...waits, ...open, ...(held ? [`storage:${held}`] : [])],
        };
      },
      // S11: pure re-execution of each boot's input log, with its logged draws, against what was published.
      replay: () => {
        const liveFaults = { throwIn: new Map(faults.throwIn), moduleThrows: faults.moduleThrows };
        faults.throwIn.clear();
        faults.moduleThrows = 0;
        let result: { same: boolean; firstDiff?: unknown } = { same: true };
        outer: for (let si = 0; si < segments.length; si++) {
          const seg = segments[si]!;
          let w: World = emptyWorld;
          for (let i = 0; i < seg.log.length; i++) {
            for (const a of armed) if (a.segment === si && a.at === i) a.arm();
            const e = seg.log[i]!;
            let d = 0;
            const env = { now: e.now, id: () => e.ids[d++]! };
            const out = safeStep(w, e.input, env, rt.machines, modules);
            const sameOut =
              out === "aborted" || e.out === "aborted"
                ? out === e.out
                : JSON.stringify([out.commands, out.frame?.seq, out.world]) ===
                  JSON.stringify([e.out.commands, e.out.frame?.seq, e.out.world]);
            if (!sameOut) {
              result = { same: false, firstDiff: { segment: si, step: i, input: e.input.k } };
              break outer;
            }
            w = out === "aborted" ? afterAbort(w, e.input) : out.world;
          }
        }
        faults.throwIn = liveFaults.throwIn;
        faults.moduleThrows = liveFaults.moduleThrows;
        return result;
      },
    },
  };
};
