import { outcome, read, type Reading } from "./read.ts";
import { inheritedLimitMb, isTop, runId, spawnRun, type Launch, type Run, type RunSpec } from "./spawn.ts";
import { classify } from "./core.ts";

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
export const final = (d: Done): Reading => d.alone ?? d.first;
export const aloneLimit = (first: number, size: Size): number => Math.min(first, Math.max(30, 3 * size.aloneS));
export const aloneCost = (size: Size): number => Math.max(30, 3 * size.aloneS);
export const job = (name: string, spec: RunSpec, size: Size): Job => ({ name, size: { ...size, limitMb: size.limitMb ?? spec.limits.mb }, open: async () => ({ spec, close: () => {} }) });
export const admittedAt = (top: boolean) => (s: Size): number => (top ? (s.limitMb ?? s.peakMb) : s.peakMb);

export const parentLimitHolds = (parentMb: number | null, running: readonly number[], next: number): boolean =>
  parentMb === null || running.reduce((a, b) => a + b, 0) + next + OWN_MB <= parentMb;

type Waiting = { readonly job: Job; readonly seq: number; readonly start: () => void };

class BudgetGone extends Error {}

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
  const limits: number[] = [];
  const limitWaiters: Array<() => void> = [];
  const firsts: Waiting[] = [];
  const alones: Waiting[] = [];
  let closed = false;
  const budgetLeft = () => (pool.budgetS === null ? Infinity : pool.budgetS - (performance.now() - t0) / 1000);
  const running = () => runningFirst + runningAlone;
  const startFirst = (w: Waiting) => {
    firsts.splice(firsts.indexOf(w), 1);
    slots += w.job.size.slots;
    mb += admitted(w.job.size);
    runningFirst++;
    w.start();
  };
  const startAlone = () => {
    runningAlone++;
    alones.shift()!.start();
  };
  const pump = () => {
    if (closed) return;
    if (stop.signal.aborted) {
      for (const w of limitWaiters.splice(0)) w();
      for (const w of [...firsts]) startFirst(w);
      while (alones.length) startAlone();
      return;
    }
    firsts.sort((a, b) => b.job.size.aloneS - a.job.size.aloneS || a.seq - b.seq);
    if (runningAlone === 0)
      for (const w of [...firsts]) {
        const fits = running() === 0 || (slots + w.job.size.slots <= pool.slots && mb + admitted(w.job.size) <= pool.mb);
        if (fits) startFirst(w);
      }
    if (alones.length && running() === 0 && firsts.length === 0) startAlone();
  };
  const budgetTimer = pool.budgetS === null ? undefined : setTimeout(() => (stop.abort("budget"), pump()), Math.max(0, pool.budgetS * 1000));
  const gone = () => new BudgetGone(stop.signal.reason === "closed" ? "closed before it started" : "no budget left");
  const attempt = async (j: Job, id: string, alone: boolean, seconds: (s: number) => number): Promise<Run> => {
    log.push({ job: j.name, attempt: alone ? "alone" : "first", at: "start" });
    let opened: Opened | undefined;
    let launch: Launch | undefined;
    try {
      if (stop.signal.aborted) throw gone();
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
        if (stop.signal.aborted) throw gone();
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
      return { kind: "unstarted", launch: l, message: e instanceof BudgetGone ? e.message : classify(e).message };
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
            if (budgetLeft() < aloneCost(j.size) || stop.signal.aborted) {
              runningAlone--;
              resolve({ job: j, first, alone: null, skipped: stop.signal.reason === "closed" ? "closed before the alone rerun" : "no budget left for the alone rerun" });
              queueMicrotask(pump);
              return;
            }
            attempt(j, `${id}.alone`, true, (s) => aloneLimit(s, j.size))
              .then((alone) => resolve({ job: j, first, alone: read(alone), skipped: null }))
              .catch(reject)
              .finally(() => {
                runningAlone--;
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
      while (alones.length) startAlone();
      await Promise.race([Promise.allSettled([...live]), Bun.sleep(50)]);
    }
    if (budgetTimer) clearTimeout(budgetTimer);
  };
  return { run, program, close, events: () => log, pool };
};
