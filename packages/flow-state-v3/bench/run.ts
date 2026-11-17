import { Console, DateTime, Effect, Option } from "effect";
import { benchesFrom } from "./list.ts";
import {
  changeText,
  fixtureChange,
  seriesLines,
  storedComparison,
  summaryLines,
} from "./compare.ts";
import { type Bench, CONCERNS, type Concern } from "./declare.ts";
import { appendRows, writeSamples } from "./history.ts";
import { busyReason, commitOf, environmentOf } from "./machine.ts";
import { budgetState, countersText, failuresOf, type Result, resultOf, rowOf } from "./result.ts";
import { selectBenches } from "./select.ts";
import { type Spawned, timingLines, writeTiming } from "./timing.ts";
import { PACKAGE, worktreeAt } from "./worktree.ts";
import { HELP, optionsOf, type Options, scopeOf, tierOf } from "./options.ts";
import { batchesOf, killGroup, type Live, measure } from "./workers.ts";

const selected = (options: Options, benches: ReadonlyArray<Bench>) =>
  selectBenches(benches, {
    tier: tierOf(options),
    concerns: options.concerns,
    only: Option.fromUndefinedOr(options.only),
    maxN: Option.fromUndefinedOr(options.maxN),
  });

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

  const full = options.detail
    ? `  [n ${p.count}, warm-up ${result.warmup}, batch ${result.batch}, shape ${result.fixture}, ${countersText(result.counters)}]`
    : "";

  const spread = `±${(result.spread * 100).toFixed(1)}%`;

  return `${result.bench.id.padEnd(58)} ${number(result.median).padStart(9)}  ${spread}  ${tail}${compared}${budget}${fails}${full}`;
};

type Measured = Effect.Success<ReturnType<typeof measure>>["benches"][number];

// How a result reads against the other commit: measured now beside it, or from its stored rows.
const comparedText = (options: Options, measured: Measured, result: Result, env: Env) => {
  if (options.compare === undefined) return "";
  const since = options.compare;

  return Option.match(measured.before, {
    onNone: () => storedComparison(options.history, since, result, env, scopeOf(options)),
    onSome: (before) => {
      if (Option.isSome(before.problem)) return "  (not at the other commit)";
      const old = resultOf(result.bench, before.runs);

      return old.fixture === result.fixture
        ? changeText(old.processes, result, "interleaved", scopeOf(options))
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
    files.set(
      concern,
      writeSamples(options.history, concern, `${head.commit}-${tierOf(options)}-${stamp}`, samples),
    );
  }

  const rows = results.map((r) =>
    rowOf(r, {
      commit: head.commit,
      tree,
      env,
      date,
      samples: files.get(r.bench.concern) ?? "",
      confidence: options.backfill ? "backfill" : "recorded",
      tier: tierOf(options),
    }),
  );

  appendRows(options.history, rows);

  return rows.length;
};

// One bench's outcome: failed, or measured, printed and compared.
const reportOne = Effect.fn("reportOne")(function* (
  options: Options,
  measured: Measured,
  env: Env,
) {
  const { bench } = measured;

  if (Option.isSome(measured.now.problem)) {
    yield* Console.log(`${bench.id.padEnd(58)} FAILED ${measured.now.problem.value}`);

    return {
      result: Option.none<Result>(),
      failures: [`${bench.id}: ${measured.now.problem.value}`],
    };
  }

  const result = resultOf(bench, measured.now.runs);

  if (!options.summary)
    yield* Console.log(line(result, options, comparedText(options, measured, result, env)));

  return {
    result: Option.some(result),
    failures: failuresOf(result).map((f) => `${bench.id}: ${f}`),
  };
});

// What a run measures on and against, as its first lines.
const headerOf = (
  options: Options,
  env: Env,
  head: ReturnType<typeof commitOf>,
  interleaved: boolean,
) => {
  const where = `${env.runtime} ${env.version} on ${env.machine} (${env.cpu}, ${env.cores} cores, ${env.power}, load ${env.load.toFixed(2)})`;
  const what = `${head.commit}${head.dirty ? " dirty" : ""}; ${tierOf(options)} tier`;

  const stored =
    options.compare !== undefined && !options.stored && !interleaved
      ? `\nno worktree for ${options.compare}: comparing against its stored rows`
      : "";

  return `${where}; ${what}${stored}`;
};

const runAll = Effect.fn("runAll")(function* (
  options: Options,
  chosen: ReadonlyArray<Bench>,
  deadline: number,
  live: Live,
) {
  const env = environmentOf(PACKAGE);
  const head = commitOf(PACKAGE);

  const other =
    options.compare === undefined || options.stored
      ? Option.none()
      : worktreeAt(options.compare, options.scratch);

  const results: Array<Result> = [];
  const failures: Array<string> = [];
  const refused = { any: false };
  const capped = { any: false };
  const spawned: Array<Spawned> = [];

  yield* Console.log(headerOf(options, env, head, Option.isSome(other)));

  for (const batch of batchesOf(options, chosen)) {
    const busy = options.record ? busyReason(PACKAGE) : Option.none<string>();

    if (Option.isSome(busy)) {
      failures.push(...batch.benches.map((b) => `${b.id}: not recorded, ${busy.value}`));
      refused.any = true;
      continue;
    }

    const batchRun = yield* measure(
      batch,
      options,
      Option.map(other, (o) => o.package),
      deadline,
      live,
    );

    spawned.push(...batchRun.spawned);
    capped.any ||= batchRun.capped;

    for (const measured of batchRun.benches) {
      const one = yield* reportOne(options, measured, env);
      results.push(...Option.toArray(one.result));
      failures.push(...one.failures);
    }
  }

  for (const o of Option.toArray(other)) o.remove();

  return { env, results, failures, refused: refused.any, capped: capped.any, spawned };
});

// Why a run cannot start: bad counts, nothing selected, or a busy machine when recording.
const refusalOf = (options: Options, chosen: ReadonlyArray<Bench>) => {
  if ((options.runs ?? 1) < 1 || (options.workers ?? 1) < 1)
    return Option.some({ problem: "--runs and --workers take a count of one or more", code: 1 });

  if (chosen.length === 0) return Option.some({ problem: "no bench matches", code: 1 });

  if (options.stress && options.full)
    return Option.some({ problem: "--stress and --full are separate tiers: pick one", code: 1 });

  if (options.dev && options.record)
    return Option.some({
      problem: "the dev tier records nothing: drop --record or --dev",
      code: 1,
    });

  return Option.map(options.record ? busyReason(PACKAGE) : Option.none<string>(), (busy) => ({
    problem: `not recording: ${busy}`,
    code: 2,
  }));
};

type Run = Effect.Success<ReturnType<typeof runAll>>;

// 3 at the run's cap, 2 when a busy machine refused a recording, 1 for any failed bench.
const exitCodeOf = (run: Run) => {
  if (run.capped) return 3;

  if (run.refused) return 2;

  return run.failures.length === 0 ? 0 : 1;
};

// The run's closing lines: its timing table when asked (the timing file is always kept), then
// its series or its summary.
const closingLines = (options: Options, run: Run, runMs: number, date: string) => {
  const mode = tierOf(options);

  const timing = writeTiming(
    options.history,
    `${commitOf(PACKAGE).commit}-${mode}-${date.replaceAll(/[-:.]/gu, "")}`,
    run.spawned,
  );

  const table = options.timing ? [...timingLines(run.spawned, runMs), `timing file ${timing}`] : [];

  const lines = options.summary
    ? summaryLines(options.history, run.results, run.env, scopeOf(options))
    : seriesLines(run.results);

  return [...table, ...lines];
};

// A signal to the run kills every worker's process group, so nothing it started outlives it.
const onSignal = (live: Live) => (signal: NodeJS.Signals) => {
  for (const pid of live) killGroup(pid);
  process.exit(signal === "SIGINT" ? 130 : 143);
};

const program = Effect.fn("bench")(function* (argv: ReadonlyArray<string>) {
  const options = optionsOf(argv);
  const chosen = selected(options, yield* benchesFrom(options.benches));

  if (options.help || options.list) {
    yield* Console.log(
      options.help
        ? HELP
        : chosen
            .map((b) => `${b.id}  [${b.concern}; ${b.tags.join(", ")}; ${b.size.n} ${b.size.unit}]`)
            .join("\n"),
    );

    return 0;
  }

  const refusal = refusalOf(options, chosen);

  if (Option.isSome(refusal)) {
    yield* Console.error(refusal.value.problem);

    return refusal.value.code;
  }

  const date = DateTime.formatIso(yield* DateTime.now);
  const started = performance.now();
  const live: Live = new Set();
  process.once("SIGINT", onSignal(live));
  process.once("SIGTERM", onSignal(live));

  const run = yield* runAll(options, chosen, started + options.maxTime * 1000, live).pipe(
    Effect.ensuring(
      Effect.sync(() => {
        for (const pid of live) killGroup(pid);
      }),
    ),
  );

  const runMs = performance.now() - started;

  for (const l of closingLines(options, run, runMs, date)) yield* Console.log(l);

  if (options.record) {
    const rows = record(options, run.results, run.env, date);
    yield* Console.log(`recorded ${rows} rows under ${options.history}`);
  }

  for (const f of run.failures) yield* Console.error(f);

  if (run.capped)
    yield* Console.error(
      `stopped at the --max-time cap of ${options.maxTime} s: the benches marked not run did not run. Run one concern at a time (nub run bench scale --full), or raise --max-time.`,
    );

  return exitCodeOf(run);
});

// oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- the bench is a process entry point: it runs its one program
process.exitCode = await Effect.runPromise(program(process.argv.slice(2)));
