import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { outcome, read, type Reading } from "./read.ts";
import { inheritedLimitMb, isTop, processStart, runId, spawnRun, type Launch, type Run, type RunSpec } from "./spawn.ts";

export type Size = { readonly slots: number; readonly peakMb: number; readonly aloneS: number; readonly limitMb?: number };
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
export const LOCK_POLL_MS = 200;
export const LOCK_WAIT_MS = 600_000;
export const final = (d: Done): Reading => d.alone ?? d.first;
export const aloneLimit = (first: number, size: Size): number => Math.min(first, Math.max(30, 3 * size.aloneS));
export const aloneCost = (size: Size): number => Math.max(30, 3 * size.aloneS);
export const job = (name: string, spec: RunSpec, size: Size): Job => ({ name, size: { ...size, limitMb: size.limitMb ?? spec.limits.mb }, open: async () => ({ spec, close: () => {} }) });
export const admittedAt = (top: boolean) => (s: Size): number => (top ? (s.limitMb ?? s.peakMb) : s.peakMb);

export const parentLimitHolds = (parentMb: number | null, running: readonly number[], next: number): boolean =>
  parentMb === null || running.reduce((a, b) => a + b, 0) + next + OWN_MB <= parentMb;

const DIR = process.env["FLOW_VERDICTS_DIR"] || join(tmpdir(), "flow-verdicts");
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
let ownStart: string | null | undefined;
const me = () => (ownStart ??= processStart(process.pid));
const same = (pid: number, start: unknown) => alive(pid) && (typeof start !== "string" || processStart(pid) === start);
const FOREIGN = -1;
const lockHolder = (): number | null => {
  let text: string;
  try {
    text = readFileSync(LOCK, "utf8");
  } catch (e) {
    return (e as { code?: string }).code === "ENOENT" ? null : FOREIGN;
  }
  const [p, ...start] = text.trim().split("|");
  const pid = Number(p);
  if (!Number.isFinite(pid) || pid <= 0) return FOREIGN;
  return same(pid, start.length ? start.join("|") : undefined) ? pid : null;
};
const takeLock = (): boolean => {
  mkdirSync(DIR, { recursive: true });
  for (let i = 0; i < 2; i++) {
    try {
      const fd = openSync(LOCK, "wx");
      writeSync(fd, `${process.pid}|${me() ?? ""}`);
      closeSync(fd);
      return true;
    } catch (e) {
      if ((e as { code?: string }).code !== "EEXIST") return false;
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
  writeFileSync(join(TOPS, `${process.pid}.json`), JSON.stringify({ running, start: me() }));
};
const unregister = () => rmSync(join(TOPS, `${process.pid}.json`), { force: true });
const othersIdle = (): boolean => {
  if (!existsSync(TOPS)) return true;
  for (const f of readdirSync(TOPS)) {
    const pid = Number(f.replace(/\.json$/, ""));
    if (pid === process.pid || !alive(pid)) continue;
    try {
      const e = JSON.parse(readFileSync(join(TOPS, f), "utf8")) as { running: number; start?: string };
      if (e.running > 0 && same(pid, e.start)) return false;
    } catch {
      return false;
    }
  }
  return true;
};

type Waiting = { readonly job: Job; readonly seq: number; readonly start: () => void };

export const makeRunner = (pool: Pool): Runner => {
  const top = isTop();
  const admitted = admittedAt(top);
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
  let cooldownUntil = 0;
  let lockWaitFrom: number | undefined;
  let gaveUp = false;
  const limits: number[] = [];
  const limitWaiters: Array<() => void> = [];
  const firsts: Waiting[] = [];
  const alones: Waiting[] = [];
  let closed = false;
  let poll: ReturnType<typeof setTimeout> | undefined;
  const budgetLeft = () => (pool.budgetS === null ? Infinity : pool.budgetS - (performance.now() - t0) / 1000);
  const running = () => runningFirst + runningAlone;
  const later = () => {
    if (poll === undefined && !closed) poll = setTimeout(() => ((poll = undefined), pump()), LOCK_POLL_MS);
  };
  const startFirst = (w: Waiting) => {
    firsts.splice(firsts.indexOf(w), 1);
    slots += w.job.size.slots;
    mb += admitted(w.job.size);
    runningFirst++;
    w.start();
  };
  const pump = () => {
    if (closed) return;
    if (stop.signal.aborted) {
      for (const w of limitWaiters.splice(0)) w();
      for (const w of [...firsts]) startFirst(w);
      while (alones.length) {
        runningAlone++;
        alones.shift()!.start();
      }
      if (top) register(running());
      return;
    }
    firsts.sort((a, b) => b.job.size.aloneS - a.job.size.aloneS || a.seq - b.seq);
    if (top && runningAlone === 0 && firsts.length) register(running() + 1);
    const blocked = top && (() => {
      const h = lockHolder();
      return h !== null && h !== process.pid;
    })();
    if (!blocked && runningAlone === 0) {
      for (const w of [...firsts]) {
        const fits = running() === 0 || (slots + w.job.size.slots <= pool.slots && mb + admitted(w.job.size) <= pool.mb);
        if (fits) startFirst(w);
      }
    } else if (blocked && firsts.length) later();
    if (top) register(running());
    if (top && alones.length && running() === 0 && firsts.length === 0) {
      if (performance.now() < cooldownUntil) return later();
      lockWaitFrom ??= performance.now();
      if (takeLock() && othersIdle()) {
        lockWaitFrom = undefined;
        const w = alones.shift()!;
        runningAlone++;
        if (top) register(running());
        w.start();
      } else {
        dropLock();
        if (performance.now() - lockWaitFrom > LOCK_WAIT_MS) {
          lockWaitFrom = undefined;
          gaveUp = true;
          const w = alones.shift()!;
          runningAlone++;
          w.start();
          gaveUp = false;
        } else later();
      }
    }
  };
  const budgetTimer = pool.budgetS === null ? undefined : setTimeout(() => (stop.abort("budget"), pump()), Math.max(0, pool.budgetS * 1000));
  if (top) register(0);
  const attempt = async (j: Job, id: string, alone: boolean, seconds: (s: number) => number): Promise<Run> => {
    log.push({ job: j.name, attempt: alone ? "alone" : "first", at: "start" });
    let opened: Opened | undefined;
    let launch: Launch | undefined;
    try {
      if (stop.signal.aborted) throw new BudgetGone(stop.signal.reason === "closed" ? "closed before it started" : "no budget left");
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
      while (!parentLimitHolds(parentMb, limits, launch.limits.mb)) {
        await new Promise<void>((r) => limitWaiters.push(r));
        if (stop.signal.aborted) throw new BudgetGone(stop.signal.reason === "closed" ? "closed before it started" : "no budget left");
      }
      limits.push(launch.limits.mb);
      try {
        return await spawnRun(launch, { echo: pool.echo === true, stop: stop.signal });
      } finally {
        limits.splice(limits.indexOf(launch.limits.mb), 1);
        for (const w of limitWaiters.splice(0)) w();
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("defect:")) throw e;
      const l: Launch = launch ?? { gate: j.name, cmd: [], cwd: "", env: {}, limits: { mb: 0, seconds: 0 }, contract: "gate", run: id, referenceMb: null, pool: { slots: j.size.slots, mb: j.size.peakMb }, alone };
      return { kind: "unstarted", launch: l, message: String((e as Error).message ?? e) };
    } finally {
      try {
        opened?.close();
      } finally {
        log.push({ job: j.name, attempt: alone ? "alone" : "first", at: "end" });
      }
    }
  };
  const settleFirst = (j: Job) => () => {
    slots -= j.size.slots;
    mb -= admitted(j.size);
    runningFirst--;
    pump();
  };
  const run = (j: Job): Promise<Done> => {
    if (closed) throw new Error("defect: the runner is closed");
    const id = `${parent}.${++seq}`;
    const mySeq = seq;
    const p = new Promise<Done>((resolve, reject) => {
      const firstDone = (first: Reading) => {
        if (!top || outcome(first) !== "unknown") return resolve({ job: j, first, alone: null, skipped: null });
        alones.push({
          job: j,
          seq: mySeq,
          start: () => {
            if (gaveUp || budgetLeft() < aloneCost(j.size) || stop.signal.aborted) {
              runningAlone--;
              dropLock();
              const skipped = gaveUp ? `waited ${LOCK_WAIT_MS / 1000} s for the machine-wide alone lock` : stop.signal.reason === "closed" ? "closed before the alone rerun" : "no budget left for the alone rerun";
              resolve({ job: j, first, alone: null, skipped });
              queueMicrotask(pump);
              return;
            }
            attempt(j, `${id}.alone`, true, (s) => aloneLimit(s, j.size))
              .then((alone) => resolve({ job: j, first, alone: read(alone), skipped: null }))
              .catch(reject)
              .finally(() => {
                runningAlone--;
                dropLock();
                cooldownUntil = performance.now() + 2 * LOCK_POLL_MS;
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
            .then((r) => firstDone(read(r)))
            .catch(reject)
            .finally(settleFirst(j));
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
              .then(resolve)
              .catch(reject)
              .finally(settleFirst(j));
          },
        });
      }),
    );
  };
  const close = async () => {
    if (!stop.signal.aborted) stop.abort("closed");
    pump();
    closed = true;
    while (live.size > 0) {
      for (const w of firsts.splice(0)) {
        runningFirst++;
        slots += w.job.size.slots;
        mb += admitted(w.job.size);
        w.start();
      }
      for (const w of alones.splice(0)) {
        runningAlone++;
        w.start();
      }
      await Promise.race([Promise.allSettled([...live]), Bun.sleep(50)]);
    }
    if (budgetTimer) clearTimeout(budgetTimer);
    if (poll) clearTimeout(poll);
    dropLock();
    if (top) unregister();
  };
  return { run, program, close, events: () => log, pool };
};

class BudgetGone extends Error {}
