import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { outcome, read, type Reading } from "./read.ts";
import { inheritedLimitMb, isTop, runId, spawnRun, type Launch, type Run, type RunSpec } from "./spawn.ts";

export type Size = { readonly slots: number; readonly peakMb: number; readonly aloneS: number };
export type Pool = { readonly slots: number; readonly mb: number; readonly budgetS: number | null; readonly echo?: boolean };
export type Opened = { readonly spec: RunSpec; readonly close: () => void };
export type Job = { readonly name: string; readonly size: Size; readonly open: () => Promise<Opened> };
export type Done = { readonly job: Job; readonly first: Reading; readonly alone: Reading | null; readonly skipped: string | null };
export type Event = { readonly job: string; readonly attempt: "first" | "alone"; readonly at: "start" | "end" };
export type Runner = {
  readonly run: (job: Job) => Promise<Done>;
  readonly program: (job: Job) => Promise<Run>;
  readonly close: () => Promise<void>;
  readonly events: () => readonly Event[];
  readonly pool: Pool;
};

export const OWN_MB = 300;
export const final = (d: Done): Reading => d.alone ?? d.first;
export const aloneLimit = (first: number, size: Size): number => Math.min(first, Math.max(30, 3 * size.aloneS));
export const job = (name: string, spec: RunSpec, size: Size): Job => ({ name, size, open: async () => ({ spec, close: () => {} }) });

export const parentLimitHolds = (parentMb: number | null, running: readonly number[], next: number): boolean =>
  parentMb === null || running.reduce((a, b) => a + b, 0) + next + OWN_MB <= parentMb;

const DIR = join(tmpdir(), "flow-verdicts");
const TOPS = join(DIR, "tops");
const LOCK = join(DIR, "alone.lock");
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as { code?: string }).code === "EPERM";
  }
};
const lockHolder = (): number | null => {
  try {
    const pid = Number(readFileSync(LOCK, "utf8").trim());
    return Number.isFinite(pid) && pid > 0 && alive(pid) ? pid : null;
  } catch {
    return null;
  }
};
const takeLock = (): boolean => {
  mkdirSync(DIR, { recursive: true });
  for (let i = 0; i < 2; i++) {
    try {
      const fd = openSync(LOCK, "wx");
      writeSync(fd, String(process.pid));
      closeSync(fd);
      return true;
    } catch {
      const h = lockHolder();
      if (h === process.pid) return true;
      if (h !== null) return false;
      rmSync(LOCK, { force: true });
    }
  }
  return false;
};
const dropLock = () => {
  if (lockHolder() === process.pid) rmSync(LOCK, { force: true });
};
const register = (running: number) => {
  mkdirSync(TOPS, { recursive: true });
  writeFileSync(join(TOPS, `${process.pid}.json`), JSON.stringify({ running }));
};
const unregister = () => rmSync(join(TOPS, `${process.pid}.json`), { force: true });
const othersIdle = (): boolean => {
  if (!existsSync(TOPS)) return true;
  for (const f of readdirSync(TOPS)) {
    const pid = Number(f.replace(/\.json$/, ""));
    if (pid === process.pid || !alive(pid)) continue;
    try {
      if ((JSON.parse(readFileSync(join(TOPS, f), "utf8")) as { running: number }).running > 0) return false;
    } catch {}
  }
  return true;
};

type Waiting = { readonly job: Job; readonly seq: number; readonly start: () => void };

export const makeRunner = (pool: Pool): Runner => {
  const top = isTop();
  const parent = runId();
  const parentMb = inheritedLimitMb();
  const t0 = performance.now();
  const log: Event[] = [];
  const stop = new AbortController();
  const live = new Set<Promise<unknown>>();
  let seq = 0;
  let slots = 0;
  let mb = 0;
  let runningFirst = 0;
  let runningAlone = 0;
  const limits: number[] = [];
  const limitWaiters: Array<() => void> = [];
  const firsts: Waiting[] = [];
  const alones: Waiting[] = [];
  let closed = false;
  let poll: ReturnType<typeof setTimeout> | undefined;
  const budgetLeft = () => (pool.budgetS === null ? Infinity : pool.budgetS - (performance.now() - t0) / 1000);
  const budgetTimer =
    pool.budgetS === null ? undefined : setTimeout(() => stop.abort("budget"), Math.max(0, pool.budgetS * 1000));
  if (top) register(0);
  const running = () => runningFirst + runningAlone;
  const note = (e: Event) => {
    log.push(e);
    if (top) register(running());
  };
  const later = () => {
    if (poll === undefined && !closed) poll = setTimeout(() => ((poll = undefined), pump()), 200);
  };
  const pump = () => {
    if (closed) return;
    const blocked = top && (() => {
      const h = lockHolder();
      return h !== null && h !== process.pid;
    })();
    if (!blocked && runningAlone === 0) {
      firsts.sort((a, b) => b.job.size.aloneS - a.job.size.aloneS || a.seq - b.seq);
      for (const w of [...firsts]) {
        const fits = running() === 0 || (slots + w.job.size.slots <= pool.slots && mb + w.job.size.peakMb <= pool.mb);
        if (!fits) continue;
        firsts.splice(firsts.indexOf(w), 1);
        slots += w.job.size.slots;
        mb += w.job.size.peakMb;
        runningFirst++;
        w.start();
      }
    } else if (blocked && firsts.length) later();
    if (top && alones.length && running() === 0 && firsts.length === 0) {
      if (takeLock() && othersIdle()) {
        const w = alones.shift()!;
        runningAlone++;
        w.start();
      } else {
        dropLock();
        later();
      }
    }
  };
  const attempt = async (j: Job, id: string, alone: boolean, seconds: (s: number) => number): Promise<Run> => {
    note({ job: j.name, attempt: alone ? "alone" : "first", at: "start" });
    let opened: Opened | undefined;
    let launch: Launch | undefined;
    try {
      if (stop.signal.aborted) throw new BudgetGone();
      opened = await j.open();
      const spec = opened.spec;
      launch = {
        ...spec,
        limits: { mb: spec.limits.mb, seconds: seconds(spec.limits.seconds) },
        run: id,
        referenceMb: j.size.peakMb > 0 ? j.size.peakMb : null,
        pool: { slots: j.size.slots, mb: j.size.peakMb },
        alone,
      };
      if (!parentLimitHolds(parentMb, [], launch.limits.mb))
        throw new Error(`defect: ${j.name}'s kill limit ${launch.limits.mb} MB does not fit its parent's ${parentMb} MB even alone`);
      while (!parentLimitHolds(parentMb, limits, launch.limits.mb)) await new Promise<void>((r) => limitWaiters.push(r));
      limits.push(launch.limits.mb);
      try {
        return await spawnRun(launch, { echo: pool.echo === true, stop: stop.signal });
      } finally {
        limits.splice(limits.indexOf(launch.limits.mb), 1);
        for (const w of limitWaiters.splice(0)) w();
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("defect:")) throw e;
      const l: Launch = launch ?? {
        gate: j.name,
        cmd: [],
        cwd: "",
        env: {},
        limits: { mb: 0, seconds: 0 },
        contract: "gate",
        run: id,
        referenceMb: null,
        pool: { slots: j.size.slots, mb: j.size.peakMb },
        alone,
      };
      return { kind: "unstarted", launch: l, message: e instanceof BudgetGone ? "no budget left" : String((e as Error).message ?? e) };
    } finally {
      try {
        opened?.close();
      } finally {
        note({ job: j.name, attempt: alone ? "alone" : "first", at: "end" });
      }
    }
  };
  const run = (j: Job): Promise<Done> => {
    if (closed) throw new Error("defect: the runner is closed");
    const id = `${parent}.${++seq}`;
    const mySeq = seq;
    const p = new Promise<Done>((resolve, reject) => {
      const firstDone = (first: Reading) => {
        if (!top || outcome(first) !== "unknown") return resolve({ job: j, first, alone: null, skipped: null });
        const limit = (s: number) => aloneLimit(s, j.size);
        alones.push({
          job: j,
          seq: mySeq,
          start: () => {
            const est = Math.max(30, 3 * j.size.aloneS);
            if (budgetLeft() < est || stop.signal.aborted) {
              runningAlone--;
              resolve({ job: j, first, alone: null, skipped: "no budget left for the alone rerun" });
              queueMicrotask(pump);
              return;
            }
            attempt(j, `${id}.alone`, true, limit)
              .then((alone) => resolve({ job: j, first, alone: read(alone), skipped: null }), reject)
              .finally(() => {
                runningAlone--;
                dropLock();
                pump();
              });
          },
        });
        pump();
      };
      firsts.push({
        job: j,
        seq: mySeq,
        start: () => {
          attempt(j, id, false, (s) => s)
            .then((r) => firstDone(read(r)), reject)
            .finally(() => {
              slots -= j.size.slots;
              mb -= j.size.peakMb;
              runningFirst--;
              pump();
            });
        },
      });
    });
    return track(p);
  };
  const track = <T>(p: Promise<T>): Promise<T> => {
    live.add(p);
    void p.catch(() => {}).finally(() => live.delete(p));
    queueMicrotask(pump);
    return p;
  };
  const program = (j: Job): Promise<Run> => {
    if (closed) throw new Error("defect: the runner is closed");
    const id = `${parent}.${++seq}`;
    const mySeq = seq;
    return track(
      new Promise<Run>((resolve, reject) => {
        firsts.push({
          job: j,
          seq: mySeq,
          start: () => {
            attempt(j, id, false, (s) => s)
              .then(resolve, reject)
              .finally(() => {
                slots -= j.size.slots;
                mb -= j.size.peakMb;
                runningFirst--;
                pump();
              });
          },
        });
      }),
    );
  };
  const close = async () => {
    stop.abort("closed");
    closed = true;
    for (const w of firsts.splice(0)) {
      slots += w.job.size.slots;
      mb += w.job.size.peakMb;
      runningFirst++;
      w.start();
    }
    while (live.size > 0) {
      for (const w of alones.splice(0)) {
        runningAlone++;
        w.start();
      }
      await Promise.race([Promise.allSettled([...live]), Bun.sleep(50)]);
    }
    await Promise.allSettled([...live]);
    if (budgetTimer) clearTimeout(budgetTimer);
    if (poll) clearTimeout(poll);
    dropLock();
    if (top) unregister();
  };
  return { run, program, close, events: () => log, pool };
};

class BudgetGone extends Error {}
