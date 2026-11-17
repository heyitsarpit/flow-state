import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { Option, Schema } from "effect";
import type { Bench } from "./declare.ts";
import { NOT_RUN, type Options, TIERS, tierOf } from "./options.ts";
import { Report } from "./report.ts";
import { countersText } from "./result.ts";
import { WARM_CAP_MS } from "./sample.ts";
import type { Spawned } from "./timing.ts";
import { PACKAGE } from "./worktree.ts";

// A bench's timeout: four times its warm-up cap and sampling budget, plus 30 s to load and prove
// it; tooling runs whole suites, so it gets 30 minutes. The run's own cap bounds both.
export const timeoutOf = (bench: Bench, options: Options) => {
  const tier = TIERS[tierOf(options)];

  if (bench.concern === "tooling") return 30 * 60 * 1000;

  return 4 * ((tier.warmMs ?? WARM_CAP_MS) + (tier.budgetMs ?? bench.budgetMs)) + 30_000;
};

// The processes a run starts: in the full tier one per bench and worker; in the quick tier one per
// worker for every bench, except benches that must start cold or collect, which keep their own.
export const batchesOf = (options: Options, chosen: ReadonlyArray<Bench>) => {
  if (tierOf(options) === "full")
    return chosen.map((b) => ({ benches: [b], workers: options.workers ?? b.workers }));

  if (options.separate)
    return chosen.map((b) => ({
      benches: [b],
      workers: options.workers ?? Math.min(b.workers, TIERS.quick.workers),
    }));

  const shared = chosen.filter((b) => b.warm);
  const alone = chosen.filter((b) => !b.warm);

  const batches = alone.map((b) => ({
    benches: [b],
    workers: options.workers ?? Math.min(b.workers, TIERS.quick.workers),
  }));

  if (shared.length > 0)
    batches.unshift({ benches: shared, workers: options.workers ?? TIERS.quick.workers });

  return batches;
};

export type Batch = ReturnType<typeof batchesOf>[number];

const workerArgs = (pkg: string, ids: ReadonlyArray<string>, batch: Batch, options: Options) => {
  const args = [join(pkg, "bench", "worker.ts"), ...ids];
  const timeoutMs = Math.max(...batch.benches.map((b) => timeoutOf(b, options)));
  const tier = TIERS[tierOf(options)];

  if (batch.benches.some((b) => b.gc) && !("bun" in process.versions)) args.unshift("--expose-gc");

  if (options.runs !== undefined) args.push("--runs", String(options.runs));

  if (options.warmup !== undefined) args.push("--warmup", String(options.warmup));

  if (tier.budgetMs !== undefined) args.push("--budget", String(tier.budgetMs));

  if (tier.warmMs !== undefined) args.push("--warm-ms", String(tier.warmMs));
  args.push("--timeout-ms", String(timeoutMs));

  return args;
};

// What one worker process printed: the reports of the benches it finished.
export const reportsOf = (stdout: string) =>
  stdout
    .trim()
    .split("\n")
    .flatMap((l) => Option.toArray(Schema.decodeUnknownOption(Report)(l)));

export const notRun = (ids: ReadonlyArray<string>) =>
  ids.map((id) => ({ _tag: "Failed", id, problem: NOT_RUN }) satisfies Report);

// One process of a batch's worker over the benches left, killed at the sum of their timeouts or
// the run's deadline, whichever comes first.
export const spawnWorker = (
  pkg: string,
  ids: ReadonlyArray<string>,
  batch: Batch,
  options: Options,
  remaining: number,
) => {
  const own = batch.benches
    .filter((b) => ids.includes(b.id))
    .reduce((t, b) => t + timeoutOf(b, options), 0);

  const start = performance.now();

  const done = spawnSync(process.execPath, workerArgs(pkg, ids, batch, options), {
    cwd: pkg,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: Math.max(1, Math.floor(Math.min(own, remaining))),
    killSignal: "SIGKILL",
    maxBuffer: 64 * 1024 * 1024,
  });

  const got = reportsOf(done.stdout);
  const [current, ...rest] = ids.filter((id) => !got.some((r) => r.id === id));

  return {
    got,
    current: Option.fromUndefinedOr(current),
    rest,
    killed: done.signal === "SIGKILL",
    atCap: own >= remaining,
    exited: `the worker exited ${done.status ?? done.signal ?? "?"}: ${done.stderr.trim().split("\n").slice(-3).join(" ")}`,
    spawned: { pkg, wallMs: performance.now() - start, benches: ids, reports: got },
  };
};

// One worker of a batch in a package folder, before the run's deadline. A process killed at its
// timeout leaves its current bench timed-out and the rest to a new process; at the deadline every
// bench left is not run.
export const workerRun = (pkg: string, batch: Batch, options: Options, deadline: number) => {
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

    const run = spawnWorker(pkg, left.ids, batch, options, remaining);
    reports.push(...run.got);
    spawned.push(run.spawned);
    left.ids = [];

    for (const current of Option.toArray(run.current)) {
      if (!run.killed) {
        reports.push(
          ...[current, ...run.rest].map(
            (id) => ({ _tag: "Failed", id, problem: run.exited }) satisfies Report,
          ),
        );
        continue;
      }

      if (run.atCap) {
        reports.push(...notRun([current, ...run.rest]));
        left.capped = true;
        continue;
      }

      reports.push({
        _tag: "TimedOut",
        id: current,
        problem: "timed-out: killed at the bench's timeout",
        samples: [],
      });
      left.ids = run.rest;
    }
  }

  return { reports, spawned, capped: left.capped };
};

// One bench's reports from its workers: the first failure, or workers that did different work.
export const gather = (reports: ReadonlyArray<Report>) => {
  const runs = reports.flatMap((r) => (r._tag === "Done" ? [r] : []));
  const work = new Set(runs.map((r) => `${countersText(r.counters)}|${countersText(r.shape)}`));
  const failed = reports.flatMap((r) => (r._tag === "Done" ? [] : [r.problem]));

  if (work.size > 1) failed.push(`the workers did different work: ${[...work].join(" / ")}`);

  if (runs.length === 0 && failed.length === 0) failed.push("no worker ran");

  return { runs, problem: Option.fromUndefinedOr(failed[0]) };
};

// A batch's workers, each a fresh process; with the other commit's package, its processes and ours
// alternate. Returns each bench's gathered reports, ours and theirs.
export const measure = (
  batch: Batch,
  options: Options,
  other: Option.Option<string>,
  deadline: number,
) => {
  const mine: Array<Report> = [];
  const theirs: Array<Report> = [];
  const spawned: Array<Spawned> = [];
  const capped = { any: false };

  for (let n = 0; n < batch.workers && !capped.any; n += 1) {
    for (const pkg of Option.toArray(other)) {
      const run = workerRun(pkg, batch, options, deadline);
      theirs.push(...run.reports);
      spawned.push(...run.spawned);
      capped.any ||= run.capped;
    }

    const run = workerRun(PACKAGE, batch, options, deadline);
    mine.push(...run.reports);
    spawned.push(...run.spawned);
    capped.any ||= run.capped;
  }

  return {
    spawned,
    capped: capped.any,
    benches: batch.benches.map((bench) => ({
      bench,
      now: gather(mine.filter((r) => r.id === bench.id)),
      before: Option.map(other, () => gather(theirs.filter((r) => r.id === bench.id))),
    })),
  };
};
