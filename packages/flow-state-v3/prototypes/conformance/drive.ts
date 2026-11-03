// Turns a runtime's `Port` into a Harness. Settling, faults, plans and the fake live here, so a rewrite replaces only the
// port. Faults reach a runtime through what production has: compiled data (Slots), a Host, and its own input port.
import type { Fixture as Fixture_ } from "./harness.ts";
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
  let yieldPlan: Step | readonly Step[] | undefined;
  const injections = { planned: 0, done: 0, withLive: 0, withChoice: 0 };

  // Compiled data is plain data: wrapping its Slots is what a test build would do, and the core cannot tell.
  // D117, D125, oracle (j): no ending goes missing. Its first half, what a turn asked for: by operation, per step, a committed turn's asks must each become something.
  let asking: string[] = [];
  let replaying = false;
  const missing: string[] = [];
  // Its second half, a ledger of every ending, from the evidence the runtime gives and the disk the suite owns. An ending said is owed until it is heard (`delivered`), goes as evidence, is parked, or is let go. What is parked is owed until it is unparked, and a wait must name it, op and Attempt. A refusal is owed its second try, and a second refusal is owed a keep. What is on disk at a kill is owed at the boot.
  const told = new Map<string, number>();
  const parkedOwed = new Map<string, number>();
  const bootOwed = new Map<string, number>();
  const tryAgain = new Map<string, number>();
  let keptNow: Array<{ op: string; attempt: string }> = [];
  let keptNames: Array<{ op: string; attempt: string }> = [];
  let ledgerOff = false; // a disposed runtime, or a disk edited or wiped by the case
  const bump = (m: Map<string, number>, k: string, by = 1) => {
    const n = (m.get(k) ?? 0) + by;
    if (n > 0) m.set(k, n);
    else m.delete(k);
  };
  const ledgerKey = (e: Record<string, any>) => `${e["op"]} ${e["attempt"] ?? ""}`;
  const ledger = (e: readonly Record<string, any>[]) => {
    for (const x of e) {
      const k = ledgerKey(x);
      switch (x["kind"]) {
        case "ending":
          bump(told, k);
          break;
        case "delivered":
        case "evidenceOnly":
          bump(told, k, -1);
          break;
        case "parked":
          bump(told, k, -1);
          bump(parkedOwed, k);
          break;
        case "unparked":
          if (bootOwed.has(k)) bump(bootOwed, k, -1);
          else bump(parkedOwed, k, -1);
          bump(told, k);
          break;
        case "kept":
          bump(parkedOwed, k, x["onLane"] ? 1 : 0);
          keptNow.push({ op: x["op"], attempt: x["attempt"] ?? "" });
          keptNames.push({ op: x["op"], attempt: x["attempt"] ?? "" });
          break;
        case "KeptLetGo":
        case "ParkedLetGo":
          bump(parkedOwed, k, -1);
          break;
        case "refused":
          bump(tryAgain, String(x["event"]));
          break;
        case "turn":
        case "Denied":
        case "Unhandled":
          bump(tryAgain, String(x["event"]), -1);
          break;
        case "fence":
        case "unbound":
          tryAgain.clear();
          break;
        case "DisposeStart":
          ledgerOff = true;
          break;
        default:
      }
    }
  };
  // What the disk holds of a parked ending is owed at this boot. What was only in memory went with the process.
  const owedAtBoot = () => {
    told.clear();
    parkedOwed.clear();
    bootOwed.clear();
    tryAgain.clear();
    keptNow = [];
    keptNames = [];
    for (const [k, v] of fake.kv)
      if (k.startsWith("lane/"))
        try {
          const l = JSON.parse(v);
          for (const p of l?.parked ?? []) bump(bootOwed, `${l.op} ${p.attempt ?? ""}`);
        } catch {}
  };
  const refusal = (i: { code: string; input?: unknown }) => {
    if (i.code !== "InvalidTurn") return;
    const input = i.input as { k?: string; event?: string; redelivered?: boolean } | undefined;
    if (input?.k !== "mail" || input.event === undefined) return;
    if (!input.redelivered) return;
    bump(tryAgain, input.event, -1);
    if (keptNow.length === 0) missing.push(`(j) refused twice, and kept nowhere: ${input.event}`);
    keptNow = [];
  };
  const askedFor = (op: string, slot: any) => ({
    ...slot,
    run: (...a: unknown[]) => {
      const r = slot.run(...a);
      if (!replaying) asking.push(op);
      return r;
    },
  });
  const judgeAsks = (e: readonly Record<string, any>[]) => {
    const asks = asking;
    asking = [];
    if (!e.some((x) => x["kind"] === "turn")) return; // a refused turn asked for nothing
    const left = new Map<string, number>();
    for (const op of asks) left.set(op, (left.get(op) ?? 0) + 1);
    for (const x of e) {
      const became = x["kind"] === "mint" || (x["kind"] === "invoked" && String(x["attempt"]).startsWith("read/")) || (x["kind"] === "ending" && x["attempt"] === undefined);
      if (became && left.get(x["op"])) left.set(x["op"], left.get(x["op"])! - 1);
    }
    for (const [op, n] of left) if (n > 0) missing.push(`(j) ${n} ask(s) of ${op} in a committed turn became nothing`);
  };
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
        if (k === "input" && (v.verb === "commit" || v.verb === "lookup")) return [k, askedFor(v.op, wrap(x))];
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
      onEvidence: (e) => {
        judgeAsks(e);
        ledger(e);
        evidence.push(...e);
      },
      onIssue: (i) => {
        for (const x of i) refusal(x);
        issues.push(...i);
      },
    });
    for (const f of listeners) inst.subscribe(f);
    instances.push(inst);
  };
  let tasksPerStep: number | null = null;
  let spinning = false;
  const settle = () => {
    const firstTask = fake.tasks;
    const t0 = Date.now();
    spinning = false;
    for (let guard = 0; ; guard++) {
      if (tasksPerStep !== null && fake.tasks - firstTask >= tasksPerStep) {
        spinning = true;
        return;
      }
      // A step that never settles is a spin nobody said to expect: fail it here, rather than leave it to the watchdog.
      if (fake.tasks - firstTask > 5_000 || (guard % 4096 === 4095 && Date.now() - t0 > 20_000)) throw new Error("settle: did not quiesce");
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
        for (const x of Array.isArray(inject) ? (inject as readonly Step[]) : [inject as Step]) run(x);
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
    else if ("burst" in s) for (let i = 0; i < s.n; i++) inst.send(actorKey(s.burst), { tag: s.event, payload: {} });
    else if ("send" in s)
      inst.send(actorKey(s.send), {
        tag: s.event,
        payload: s.payload ?? {},
        ...(s.to ? { to: s.to } : {}),
      });
    else if ("dispose" in s) inst.dispose(actorKey(s.dispose));
    else if ("answer" in s) fake.answer(s.answer, s.with, s.where);
    else if ("reload" in s) die(s);
    else if ("storage" in s) fake.storageStep(s.storage, s.match);
    else if ("hide" in s) {
      fake.hidden = true; // review M3: what follows while hidden does not wait
      fake.hide();
      if (!s.stay) fake.hidden = false; // a flush event, the common use here. `stay`: the page stays hidden
    } else if ("clockBack" in s) fake.clockBack(s.clockBack);
    else if ("freeze" in s) fake.freezeTimers = s.freeze;
    else if ("tasksPerStep" in s) tasksPerStep = s.tasksPerStep;
    else if ("holdPlain" in s) fake.holdPlain = s.holdPlain;
    else if ("slowAfterAck" in s) fake.slowAfterAck = true;
    else if ("advanceNow" in s) fake.advanceWith(s.advanceNow, () => {});
    else if ("nextYield" in s) yieldPlan = s.nextYield;
    else if ("storeWide" in s) fake.storeWide = s.storeWide;
    else if ("feed" in s) {
      fake.feedStep(s.feed, s);
    } else if ("disposeRuntime" in s) inst.disposeRuntime();
    else throw new Error(`raw: not a plain step: ${Object.keys(s)[0]}`);
  };
  // A kill and the next boot. `do` settles after it; a kill at a yield is already inside a settle.
  const die = (s: Extract<Step, { reload: true }>) => {
    plan = undefined;
    if (s.tear !== undefined) fake.tearLast(s.tear);
    if (s.wipe) {
      fake.wipe();
      for (const k of fake.mayHave()) excused.add(k);
    }
    if (TEST_FLUSH.includes("kills")) {
      fake.hide();
      settle();
    }
    // Round 7: what a kill took, for classifying. The tail of the state text is what the runtime held back.
    if (process.env["FLOW_KILL_TRACE"])
      ((globalThis as any).__kills ??= []).push(
        `kill: held back ${inst.stateText("").split("|").at(-1)}; on disk ${[...fake.kv.keys()].filter((k) => k !== "meta" && k !== "host/ready").join(",") || "nothing"}`,
      );
    noteLost();
    if (s.wipe || s.tear !== undefined) ledgerOff = true;
    owedAtBoot();
    fake.killProcess();
    if (s.load) fake.loadMode = s.load;
    boot();
    if (s.crashAfterBoot) {
      owedAtBoot();
      fake.killProcess();
      boot();
    }
  };
  const excused = new Set<string>(); // D112: what a wipe or an edited record took. Nothing else may leave a key undecided with no head on disk
  const reads: Harness["read"] = {
    missingEndings: () => {
      const out = [...missing];
      if (ledgerOff) return out;
      const q = inst.waits() as ReadonlyArray<Record<string, any>>;
      for (const { op, attempt } of keptNames)
        if (!q.some((w) => (w["kind"] === "parked" || w["kind"] === "held" || w["kind"] === "stranded") && w["op"] === op && (w["kind"] === "stranded" || w["firing"] || (w["attempt"] ?? "") === attempt)))
          out.push(`(j) kept, and no wait names it: ${op} ${attempt}`);
      keptNames = [];
      for (const k of told.keys()) out.push(`(j) an ending reached nobody: ${k}`);
      for (const k of bootOwed.keys()) out.push(`(j) parked on disk, and not heard at the boot: ${k}`);
      for (const k of tryAgain.keys()) out.push(`(j) refused once, and not tried again: ${k}`);
      const parkedWaits = new Map<string, number>();
      for (const w of q) if (w["kind"] === "parked" && !w["firing"]) bump(parkedWaits, `${w["op"]} ${w["attempt"] ?? ""}`);
      for (const [k, n] of parkedOwed) if ((parkedWaits.get(k) ?? 0) < n) out.push(`(j) parked, and no wait says so: ${k}`);
      return out;
    },
    writeAheadLies: () => {
      const undecided = fake.mayHave();
      if (undecided.length === 0) return [];
      const heads = new Set<string>();
      for (const [k, v] of fake.kv)
        if (k.startsWith("lane/"))
          try {
            heads.add(JSON.parse(v)?.head?.id);
          } catch {}
      const writes = new Set(compiled.filter((c) => c.persisted).flatMap((c) => Object.values(c.ops).filter((o) => o.kind === "write").map((o) => o.id)));
      const released = new Set(evidence.filter((e) => e["kind"] === "Released").map((e) => e["attempt"]));
      return undecided.filter((key) => {
        const q = fake.requests.find((r) => r.idempotencyKey === key)!;
        return writes.has(q.op) && !heads.has(key) && !released.has(key) && !excused.has(key) && !key.startsWith("business:");
      });
    },
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
    issues: () => {
      if (TEST_FLUSH.includes("probes")) fake.hide();
      return issues;
    },
    evidence: (kind) => (kind ? evidence.filter((e) => e["kind"] === kind) : evidence),
    stored: () => {
      if (TEST_FLUSH.includes("reads")) fake.hide();
      settle();
      return new Map([...fake.kv].map(([k, v]) => [k, JSON.parse(v)]));
    },
    quiet: () => ({
      idle: !inst.pending() && !fake.hasWork(),
      fatal: inst.fatal(),
      waits: inst.waits(),
      ...(spinning ? { spinning: true } : {}),
    }),
    tasks: () => fake.tasks,
    now: () => fake.now,
    outside: () => {
      if (TEST_FLUSH.includes("probes")) fake.hide();
      return { ...fake.outside(), live: inst.live(), injections };
    },
    stateHash: () => inst.stateText(fake.stateText()),
    // S11: pure re-execution of each boot's input log, with its logged draws, against what was published.
    replay: () => {
      replaying = true;
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
      replaying = false;
      return result;
    },
  };
  return {
    start(cfg) {
      fake = new FakeWorld(cfg.seed, cfg.machines.find((m) => m.server)?.server);
      // Round 7: the older cases were written with plain writes landing at once. D80's 5 s is the runtime's default; a case that means it says so.
      // `runtimeDefault`: a case that reads the runtime's own default says so, and is given no bound at all.
      const { runtimeDefault, ...named } = (cfg.bounds ?? {}) as Record<string, number>;
      // The second pass (gate5s.ts): no bound named means the runtime's own default.
      bounds = runtimeDefault || process.env["FLOW_RUNTIME_DEFAULT"] ? named : { captureMs: 0, ...named };
      compiled = cfg.machines.map((m) => wrap((swaps.get(m) ?? m).make(fake.api)));
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
        die(s);
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
        else if ("throwInCoreAfter" in f) {
          const at = inst.logLength() + f.throwInCoreAfter;
          const go = () => void (faults.coreThrows = 1);
          armed.push({ segment: instances.length - 1, at, arm: go });
          faults.onLogged = (n) => {
            if (n === at) go();
          };
        }
        else if ("startThrows" in f) startThrows.add(f.startThrows);
        else if ("afterYield" in f) yieldPlan = f.afterYield;
        else if ("mutateServer" in f) fake.serverState = f.mutateServer(fake.serverState);
        else if ("socketClose" in f) fake.closeMs = f.socketClose;
        else if ("storageFails" in f || "storageFailsLate" in f || "storageFailsHeld" in f) {
          if (TEST_FLUSH.includes("faults")) fake.hide();
          if ("storageFails" in f) fake.plainFails = f.storageFails;
          else if ("storageFailsLate" in f) fake.plainFailsLate = f.storageFailsLate;
          else fake.plainFailsHeld = f.storageFailsHeld;
        }
        else if ("corruptStored" in f) {
          if (TEST_FLUSH.includes("faults")) fake.hide();
          // A record edited on disk may be quarantined, and an Attempt in it with it: rule 46, named by an issue.
          const hit = [...fake.kv]
            .filter(([k]) => k.includes(f.corruptStored.match))
            .map(([, v]) => v);
          const inHit = evidence
            .filter((e) => e["kind"] === "mint" && hit.some((v) => v.includes(e["attempt"])))
            .map((e) => ({ kind: "lostWithProcess", attempt: e["attempt"] }));
          evidence.push(...inHit);
          ledgerOff = true; // a record edited on disk may be quarantined, and what it owed with it: rule 46
          fake.corrupt(f.corruptStored.match, f.corruptStored.edit);
          for (const k of fake.mayHave()) excused.add(k);
        } else if ("uninterruptibleHang" in f) fake.uninterruptible.add(f.uninterruptibleHang);
        else if ("syncAnswer" in f) fake.syncAnswers.set(f.syncAnswer[0], f.syncAnswer[1]);
        else if ("microAnswer" in f) {
          const a = f.microAnswer[1];
          fake.microAnswers.set(f.microAnswer[0], typeof a === "function" ? a : () => a);
        }
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
// Round 7: classifying what fails at D80's interval. A flush, through the host's own hide, before a disk read, or before a kill. Off in a normal run.
const TEST_FLUSH = process.env["FLOW_TEST_FLUSH"] ?? "";
// Round 7: the same scenario on another way of building the same machine (`main.ts --swap`). By identity, so nothing else with its id is touched.
const swaps = new Map<Fixture_, Fixture_>();
export const swapFixtures = (m: ReadonlyMap<Fixture_, Fixture_>) => {
  for (const [a, b] of m) swaps.set(a, b);
};
export { NoHeldRequest };
