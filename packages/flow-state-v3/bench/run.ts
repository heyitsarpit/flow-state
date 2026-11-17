import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { Console, DateTime, Effect, Option, Schema } from "effect";
import { benches } from "./benches/index.ts";
import {
  changeText,
  fixtureChange,
  seriesLines,
  storedComparison,
  summaryLines,
} from "./compare.ts";
import { type Bench, CONCERNS, type Concern } from "./declare.ts";
import { appendRows, HISTORY, writeSamples } from "./history.ts";
import { busyReason, commitOf, environmentOf } from "./machine.ts";
import { Report } from "./report.ts";
import { budgetState, countersText, failuresOf, type Result, resultOf, rowOf } from "./result.ts";
import { PACKAGE, worktreeAt } from "./worktree.ts";

const Options = Schema.Struct({
  concerns: Schema.Array(Schema.Literals(CONCERNS)),
  only: Schema.optionalKey(Schema.String),
  list: Schema.Boolean,
  record: Schema.Boolean,
  compare: Schema.optionalKey(Schema.String),
  stored: Schema.Boolean,
  summary: Schema.Boolean,
  full: Schema.Boolean,
  runs: Schema.optionalKey(Schema.FiniteFromString),
  warmup: Schema.optionalKey(Schema.FiniteFromString),
  workers: Schema.optionalKey(Schema.FiniteFromString),
  scratch: Schema.String,
  history: Schema.String,
  backfill: Schema.Boolean,
});

type Options = typeof Options.Type;

const optionsOf = (argv: ReadonlyArray<string>) => {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      only: { type: "string" },
      list: { type: "boolean", default: false },
      record: { type: "boolean", default: false },
      compare: { type: "string" },
      stored: { type: "boolean", default: false },
      summary: { type: "boolean", default: false },
      full: { type: "boolean", default: false },
      runs: { type: "string" },
      warmup: { type: "string" },
      workers: { type: "string" },
      scratch: { type: "string", default: tmpdir() },
      history: { type: "string", default: HISTORY },
      backfill: { type: "boolean", default: false },
    },
  });

  return Schema.decodeUnknownSync(Options)({ ...values, concerns: positionals });
};

// `--only` matches a bench id: `*` stands for any text, and a pattern with no `*` matches any id
// that contains it.
const matcherOf = (pattern: string) => {
  const escaped = pattern.replaceAll(/[.+?^${}()|[\]\\]/gu, "\\$&").replaceAll("*", ".*");

  return new RegExp(pattern.includes("*") ? `^${escaped}$` : escaped, "u");
};

const selected = (options: Options) =>
  benches.filter(
    (b) =>
      (options.concerns.length === 0 || options.concerns.includes(b.concern)) &&
      (options.only === undefined || matcherOf(options.only).test(b.id)),
  );

const workerArgs = (pkg: string, bench: Bench, options: Options) => {
  const args = [join(pkg, "bench", "worker.ts"), bench.id];

  if (bench.gc && !("bun" in process.versions)) args.unshift("--expose-gc");

  if (options.runs !== undefined) args.push("--runs", String(options.runs));

  if (options.warmup !== undefined) args.push("--warmup", String(options.warmup));

  return args;
};

// One worker process of a bench in a package folder, its report decoded.
const workerRun = (pkg: string, bench: Bench, options: Options) => {
  const done = spawnSync(process.execPath, workerArgs(pkg, bench, options), {
    cwd: pkg,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 45 * 60 * 1000,
    maxBuffer: 64 * 1024 * 1024,
  });

  const last = done.stdout.trim().split("\n").at(-1) ?? "";
  const exited = `the worker exited ${done.status ?? done.signal ?? "?"}`;

  const failed: Report = {
    _tag: "Failed",
    problem: `${exited}: ${done.stderr.trim().split("\n").slice(-3).join(" ")}`,
  };

  return Option.getOrElse(Schema.decodeUnknownOption(Report)(last), () => failed);
};

// The workers' reports together: the first failure, or workers that did different work.
const gather = (reports: ReadonlyArray<Report>) => {
  const runs = reports.flatMap((r) => (r._tag === "Done" ? [r] : []));
  const work = new Set(runs.map((r) => `${countersText(r.counters)}|${countersText(r.shape)}`));
  const failed = reports.flatMap((r) => (r._tag === "Failed" ? [r.problem] : []));

  if (work.size > 1) failed.push(`the workers did different work: ${[...work].join(" / ")}`);

  if (runs.length === 0 && failed.length === 0) failed.push("no worker ran");

  return { runs, problem: Option.fromUndefinedOr(failed[0]) };
};

// Each worker a fresh process; with the other commit's package, its processes and ours alternate.
const measure = (bench: Bench, options: Options, other: Option.Option<string>) => {
  const mine: Array<Report> = [];
  const theirs: Array<Report> = [];

  for (let n = 0; n < (options.workers ?? bench.workers); n += 1) {
    for (const pkg of Option.toArray(other)) theirs.push(workerRun(pkg, bench, options));
    mine.push(workerRun(PACKAGE, bench, options));
  }

  return { now: gather(mine), before: Option.map(other, () => gather(theirs)) };
};

const number = (v: number) => {
  if (Number.isNaN(v)) return "-";

  if (v >= 100) return v.toFixed(1);

  return v >= 1 ? v.toFixed(3) : v.toPrecision(3);
};

const line = (result: Result, options: Options, compared: string) => {
  const p = result.pooled;

  const tail = Number.isNaN(p.p99)
    ? `min ${number(p.min)} max ${number(p.max)}`
    : `p99 ${number(p.p99)} min ${number(p.min)}`;

  const budget = budgetState(result) === "over" ? "  OVER BUDGET" : "";

  const fails = failuresOf(result)
    .map((f) => `  FAIL ${f}`)
    .join("");

  const full = options.full
    ? `  [n ${p.count}, warm-up ${result.warmup}, batch ${result.batch}, shape ${result.fixture}, ${countersText(result.counters)}]`
    : "";

  const spread = `±${(result.spread * 100).toFixed(1)}%`;

  return `${result.bench.id.padEnd(58)} ${number(result.median).padStart(9)}  ${spread}  ${tail}${compared}${budget}${fails}${full}`;
};

type Measured = ReturnType<typeof measure>;

// How a result reads against the other commit: measured now beside it, or from its stored rows.
const comparedText = (options: Options, measured: Measured, result: Result, env: Env) => {
  if (options.compare === undefined) return "";
  const since = options.compare;

  return Option.match(measured.before, {
    onNone: () => storedComparison(options.history, since, result, env),
    onSome: (before) => {
      if (Option.isSome(before.problem)) return "  (not at the other commit)";
      const old = resultOf(result.bench, before.runs);

      return old.fixture === result.fixture
        ? changeText(old.processes, result, "interleaved")
        : fixtureChange(
            options.history,
            result.bench.concern,
            result.bench.id,
            result.fixture,
            since,
          );
    },
  });
};

type Env = ReturnType<typeof environmentOf>;

// Writes a run's samples, one gzip file per concern, and its rows.
const record = (options: Options, results: ReadonlyArray<Result>, env: Env, date: string) => {
  const head = commitOf(PACKAGE);
  // A backfill copies today's bench over a past commit, so only the bench differs from the commit.
  const tree = options.backfill || !head.dirty ? ("clean" as const) : ("dirty" as const);
  const stamp = date.replaceAll(/[-:.]/gu, "");
  const files = new Map<Concern, string>();

  for (const concern of CONCERNS) {
    const mine = results.filter((r) => r.bench.concern === concern);

    if (mine.length === 0) continue;
    const samples = Object.fromEntries(mine.map((r) => [r.bench.id, r.processes]));
    files.set(concern, writeSamples(options.history, concern, `${head.commit}-${stamp}`, samples));
  }

  const rows = results.map((r) =>
    rowOf(r, {
      commit: head.commit,
      tree,
      env,
      date,
      samples: files.get(r.bench.concern) ?? "",
      confidence: options.backfill ? "backfill" : "recorded",
    }),
  );

  appendRows(options.history, rows);

  return rows.length;
};

// One bench: refused on a busy machine when recording, else measured, printed and compared.
const runOne = Effect.fn("runOne")(function* (
  options: Options,
  bench: Bench,
  other: Option.Option<string>,
  env: Env,
) {
  const busy = options.record ? busyReason(PACKAGE) : Option.none<string>();

  if (Option.isSome(busy))
    return {
      result: Option.none(),
      failures: [`${bench.id}: not recorded, ${busy.value}`],
      refused: true,
    };

  const measured = measure(bench, options, other);

  if (Option.isSome(measured.now.problem)) {
    yield* Console.log(`${bench.id.padEnd(58)} FAILED ${measured.now.problem.value}`);

    return {
      result: Option.none(),
      failures: [`${bench.id}: ${measured.now.problem.value}`],
      refused: false,
    };
  }

  const result = resultOf(bench, measured.now.runs);

  if (!options.summary)
    yield* Console.log(line(result, options, comparedText(options, measured, result, env)));

  return {
    result: Option.some(result),
    failures: failuresOf(result).map((f) => `${bench.id}: ${f}`),
    refused: false,
  };
});

const runAll = Effect.fn("runAll")(function* (options: Options, chosen: ReadonlyArray<Bench>) {
  const env = environmentOf(PACKAGE);
  const head = commitOf(PACKAGE);

  const other =
    options.compare === undefined || options.stored
      ? Option.none()
      : worktreeAt(options.compare, options.scratch);

  const results: Array<Result> = [];
  const failures: Array<string> = [];
  const refused = { any: false };

  yield* Console.log(
    `${env.runtime} ${env.version} on ${env.machine} (${env.cpu}, ${env.cores} cores, ${env.power}, load ${env.load.toFixed(2)}); ${head.commit}${head.dirty ? " dirty" : ""}`,
  );

  if (options.compare !== undefined && !options.stored && Option.isNone(other))
    yield* Console.log(`no worktree for ${options.compare}: comparing against its stored rows`);

  for (const bench of chosen) {
    const one = yield* runOne(
      options,
      bench,
      Option.map(other, (o) => o.package),
      env,
    );

    results.push(...Option.toArray(one.result));
    failures.push(...one.failures);
    refused.any ||= one.refused;
  }

  for (const o of Option.toArray(other)) o.remove();

  return { env, results, failures, refused: refused.any };
});

// Why a run cannot start: bad counts, nothing selected, or a busy machine when recording.
const refusalOf = (options: Options, chosen: ReadonlyArray<Bench>) => {
  if ((options.runs ?? 1) < 1 || (options.workers ?? 1) < 1)
    return Option.some({ problem: "--runs and --workers take a count of one or more", code: 1 });

  if (chosen.length === 0) return Option.some({ problem: "no bench matches", code: 1 });

  return Option.map(options.record ? busyReason(PACKAGE) : Option.none<string>(), (busy) => ({
    problem: `not recording: ${busy}`,
    code: 2,
  }));
};

const program = Effect.fn("bench")(function* (argv: ReadonlyArray<string>) {
  const options = optionsOf(argv);
  const chosen = selected(options);

  if (options.list) {
    for (const b of chosen)
      yield* Console.log(
        `${b.id}  [${b.concern}; ${b.tags.join(", ")}; ${b.size.n} ${b.size.unit}]`,
      );

    return 0;
  }

  const refusal = refusalOf(options, chosen);

  if (Option.isSome(refusal)) {
    yield* Console.error(refusal.value.problem);

    return refusal.value.code;
  }

  const date = DateTime.formatIso(yield* DateTime.now);
  const run = yield* runAll(options, chosen);

  const lines = options.summary
    ? summaryLines(options.history, run.results, run.env)
    : seriesLines(run.results);

  for (const l of lines) yield* Console.log(l);

  if (options.record) {
    const rows = record(options, run.results, run.env, date);
    yield* Console.log(`recorded ${rows} rows under ${options.history}`);
  }

  for (const f of run.failures) yield* Console.error(f);

  if (run.refused) return 2;

  return run.failures.length === 0 ? 0 : 1;
});

// `nub run bench [concern...] [--only <pattern>] [--list] [--record] [--compare <commit>
// [--stored]] [--summary] [--full] [--runs N] [--warmup N] [--workers N]`.
//
// Each bench runs in `--workers` fresh processes, one after another; with `--compare`, the other
// commit's processes run in a worktree, alternating with this tree's. `--record` appends rows to
// `history/<concern>.csv` and refuses on a busy machine (exit 2). Exit 1 names a bench that failed
// its proof or did not run.
// oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- the bench is a process entry point: it runs its one program
process.exitCode = await Effect.runPromise(program(process.argv.slice(2)));
