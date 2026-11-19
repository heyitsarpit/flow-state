import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { Effect, Option, Schema } from "effect";
import type { Bench } from "./declare.ts";
import { NOT_RUN, type Options, TIERS, TIMED_OUT, tierOf } from "./options.ts";
import { FailedReport, Report, TimedOutReport } from "./report.ts";
import { countersText } from "./result.ts";
import { WARM_CAP_MS } from "./sample.ts";
import type { Spawned } from "./timing.ts";
import { writeWorkerArgs } from "./worker-args.ts";
import { PACKAGE } from "./worktree.ts";

// A bench's timeout: its own when it declares one (tooling runs whole suites), else four times
// its tier's warm-up cap and sampling budget, plus 30 s to load and prove it. The run's cap bounds
// both.
const timeoutOf = (bench: Bench, options: Options) => {
  const tier = TIERS[tierOf(options)];

  return Option.getOrElse(
    bench.timeoutMs,
    () => 4 * ((tier.warmMs ?? WARM_CAP_MS) + (tier.budgetMs ?? bench.budgetMs)) + 30_000,
  );
};

// The processes a run starts: in the full tier one per bench and worker; in the quick tier one per
// worker for every bench, except benches that must start cold or collect, which keep their own.
export const batchesOf = (options: Options, chosen: ReadonlyArray<Bench>) => {
  const tier = tierOf(options);

  if (tier === "full")
    return chosen.map((b) => ({ benches: [b], workers: options.workers ?? b.workers }));

  const workers = options.workers ?? TIERS[tier].workers;

  const batches = chosen
    .filter((b) => !b.warm)
    .map((b) => ({ benches: [b], workers: Math.min(b.workers, workers) }));

  const shared = chosen.filter((b) => b.warm);

  if (shared.length > 0) batches.unshift({ benches: shared, workers });

  return batches;
};

export type Batch = ReturnType<typeof batchesOf>[number];

export const workerArgs = (
  pkg: string,
  ids: ReadonlyArray<string>,
  batch: Batch,
  options: Options,
) => {
  const tier = TIERS[tierOf(options)];
  const gc = batch.benches.some((b) => b.gc) && !("bun" in process.versions);
  const node = gc ? ["--expose-gc"] : [];

  return [
    ...node,
    join(pkg, "bench", "worker.ts"),
    ...writeWorkerArgs({
      ids,
      numbers: {
        runs: Option.fromUndefinedOr(options.runs),
        warmup: Option.fromUndefinedOr(options.warmup),
        budgetMs: Option.fromUndefinedOr(tier.budgetMs),
        warmMs: Option.fromUndefinedOr(tier.warmMs),
        timeoutMs: Option.some(Math.max(...batch.benches.map((b) => timeoutOf(b, options)))),
        run: Option.some(process.pid),
      },
      benches: Option.fromUndefinedOr(options.benches),
    }),
  ];
};

// What one worker process printed: the reports of the benches it finished.
const reportsOf = (lines: ReadonlyArray<string>) =>
  lines.flatMap((l) => Option.toArray(Schema.decodeUnknownOption(Report)(l)));

const notRun = (ids: ReadonlyArray<string>) =>
  ids.map((id) => FailedReport.make({ id, problem: NOT_RUN }));

/**
 * The process groups of a run's live workers, so a cap, a timeout, a signal or the run's exit
 * kills each worker with everything it started.
 */
export type Live = Set<number>;

/**
 * Kills a worker's whole process group: the worker, and any command it started and their children.
 */
export const killGroup = (pid: number) => {
  if (pid > 0) spawnSync("kill", ["-KILL", `-${String(pid)}`], { stdio: "ignore" });
};

type Ended = {
  readonly got: ReadonlyArray<Report>;
  readonly killed: "no" | "bench" | "cap";
  readonly exited: string;
  readonly wallMs: number;
};

// One worker process over the benches left, in its own process group. Each bench gets its own
// timeout, counted from the report before it; past it, or past the run's deadline, the group is
// killed.
const spawnWorker = (
  pkg: string,
  ids: ReadonlyArray<string>,
  batch: Batch,
  options: Options,
  remaining: number,
  live: Live,
) =>
  Effect.callback<Ended>((resume) => {
    const start = performance.now();

    const child = spawn(process.execPath, workerArgs(pkg, ids, batch, options), {
      cwd: pkg,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });

    const pid = child.pid ?? 0;
    const got: Array<Report> = [];
    const kills: Array<Ended["killed"]> = [];
    const state = { out: "", err: "", got };
    const timers = { bench: setTimeout(() => undefined, 0), cap: setTimeout(() => undefined, 0) };

    const timeoutFor = (id: string) =>
      Option.match(Option.fromUndefinedOr(batch.benches.find((b) => b.id === id)), {
        onNone: () => 0,
        onSome: (b) => timeoutOf(b, options),
      });

    const kill = (why: Ended["killed"]) => {
      kills.push(why);
      killGroup(pid);
    };

    const arm = () => {
      clearTimeout(timers.bench);

      for (const next of Option.toArray(Option.fromUndefinedOr(ids[state.got.length])))
        timers.bench = setTimeout(() => kill("bench"), timeoutFor(next));
    };

    live.add(pid);
    timers.cap = setTimeout(() => kill("cap"), Math.max(1, remaining));
    arm();
    child.stderr.on("data", (chunk: Buffer) => {
      state.err = `${state.err}${chunk.toString("utf8")}`.slice(-4000);
    });
    child.stdout.on("data", (chunk: Buffer) => {
      const lines = `${state.out}${chunk.toString("utf8")}`.split("\n");
      state.out = lines.pop() ?? "";
      const reported = reportsOf(lines);

      if (reported.length === 0) return;
      state.got.push(...reported);
      arm();
    });
    child.on("close", (code, signal) => {
      clearTimeout(timers.bench);
      clearTimeout(timers.cap);
      live.delete(pid);
      killGroup(pid);
      state.got.push(...reportsOf([state.out]));
      resume(
        Effect.succeed({
          got: state.got,
          killed: kills[0] ?? "no",
          exited: `the worker exited ${code ?? signal ?? "?"}: ${state.err.trim().split("\n").slice(-3).join(" ")}`,
          wallMs: performance.now() - start,
        }),
      );
    });

    return Effect.sync(() => kill("cap"));
  });

// One worker of a batch in a package folder, before the run's deadline. A bench past its own
// timeout is timed-out and the benches after it go to a fresh process; at the deadline every
// bench left is not run.
const workerRun = Effect.fn("workerRun")(function* (
  pkg: string,
  batch: Batch,
  options: Options,
  deadline: number,
  live: Live,
) {
  const reports: Array<Report> = [];
  const spawned: Array<Spawned> = [];
  const left = { ids: batch.benches.map((b) => b.id), capped: false };

  while (left.ids.length > 0) {
    const remaining = deadline - performance.now();

    if (remaining <= 0) {
      reports.push(...notRun(left.ids));
      left.capped = true;
      break;
    }

    const ids = left.ids;
    const run = yield* spawnWorker(pkg, ids, batch, options, remaining, live);
    const [current, ...rest] = ids.filter((id) => !run.got.some((r) => r.id === id));
    reports.push(...run.got);
    spawned.push({ pkg, wallMs: run.wallMs, benches: ids, reports: run.got });
    left.ids = [];

    if (current === undefined) break;

    if (run.killed === "cap") {
      reports.push(...notRun([current, ...rest]));
      left.capped = true;
    } else if (run.killed === "bench") {
      reports.push(TimedOutReport.make({ id: current, problem: TIMED_OUT, samples: [] }));
      left.ids = rest;
    } else {
      reports.push(
        ...[current, ...rest].map((id) => FailedReport.make({ id, problem: run.exited })),
      );
    }
  }

  return { reports, spawned, capped: left.capped };
});

// One bench's reports from its workers: the first failure, or workers that did different work.
const gather = (reports: ReadonlyArray<Report>) => {
  const runs = reports.flatMap((r) => (r._tag === "Done" ? [r] : []));
  const work = new Set(runs.map((r) => `${countersText(r.counters)}|${countersText(r.shape)}`));
  const failed = reports.flatMap((r) => (r._tag === "Done" ? [] : [r.problem]));

  if (work.size > 1) failed.push(`the workers did different work: ${[...work].join(" / ")}`);

  if (runs.length === 0 && failed.length === 0) failed.push("no worker ran");

  return { runs, problem: Option.fromUndefinedOr(failed[0]) };
};

// A batch's workers, each a fresh process; with the other commit's package, its processes and ours
// alternate. Returns each bench's gathered reports, ours and theirs. At the cap, a bench without a
// report from every worker is not run, so it is never recorded from fewer workers.
export const measure = Effect.fn("measure")(function* (
  batch: Batch,
  options: Options,
  other: Option.Option<string>,
  deadline: number,
  live: Live,
) {
  const mine: Array<Report> = [];
  const theirs: Array<Report> = [];
  const spawned: Array<Spawned> = [];
  const capped = { any: false };

  for (let n = 0; n < batch.workers && !capped.any; n += 1) {
    for (const pkg of Option.toArray(other)) {
      const run = yield* workerRun(pkg, batch, options, deadline, live);
      theirs.push(...run.reports);
      spawned.push(...run.spawned);
      capped.any ||= run.capped;
    }

    const run = yield* workerRun(PACKAGE, batch, options, deadline, live);
    mine.push(...run.reports);
    spawned.push(...run.spawned);
    capped.any ||= run.capped;
  }

  const complete = (reports: ReadonlyArray<Report>, id: string) => {
    const own = reports.filter((r) => r.id === id);

    return capped.any && own.filter((r) => r._tag === "Done").length < batch.workers
      ? [...own, ...notRun([id])]
      : own;
  };

  return {
    spawned,
    capped: capped.any,
    benches: batch.benches.map((bench) => ({
      bench,
      now: gather(complete(mine, bench.id)),
      before: Option.map(other, () => gather(complete(theirs, bench.id))),
    })),
  };
});
