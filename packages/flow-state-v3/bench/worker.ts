import { Console, Data, Effect, Option, Schema } from "effect";
import { Report } from "./report.ts";
import { benches } from "./benches/index.ts";
import { type Bench, type Subject, workChange } from "./declare.ts";
import { isSteady, medianOf } from "./stats.ts";

// A sample should take at least this long, so timer resolution and a per-sample await vanish.
const SAMPLE_MS = 1;

// Warm-up stops once the last `WINDOW` samples sit within `STEADY` of their median, or at the cap.
const WINDOW = 5;
const STEADY = 0.1;
const WARM_CAP = 100;
const WARM_CAP_MS = 3000;

// An operation this slow gets one throwaway run as its warm-up.
const LONG_MS = 1000;

const MAX_BATCH = 100_000;

// The most samples a worker takes on its time budget: enough for a p99.
const MAX_RUNS = 1000;

class WorkChanged extends Error {}

// Runs `batch` operations and returns their sample per unit and per operation, checking each did
// the first operation's work.
const sampleOf = async (
  subject: Subject,
  batch: number,
  first: Readonly<Record<string, number>>,
) => {
  const total = { sample: 0, units: 0 };

  for (let n = 0; n < batch; n += 1) {
    const start = performance.now();
    const work = await subject.op();
    const wall = performance.now() - start;
    const changed = workChange(first, work.counters);

    if (Option.isSome(changed)) throw new WorkChanged(changed.value);

    if (work.units <= 0) throw new WorkChanged("an operation did no units of work");

    total.sample += Option.getOrElse(work.sample, () => wall);
    total.units += work.units;
  }

  return { perUnit: total.sample / total.units, perOp: total.sample / batch };
};

const batchFor = (perOp: number) =>
  Math.min(MAX_BATCH, Math.max(1, Math.ceil(SAMPLE_MS / Math.max(perOp, 1e-6))));

// How a worker samples: an exact count or its time budget, and how long warm-up may take.
type Settings = {
  readonly runs: Option.Option<number>;
  readonly budgetMs: Option.Option<number>;
  readonly warmCap: number;
  readonly warmMs: number;
};

const measure = async (bench: Bench, subject: Subject, settings: Settings) => {
  const { runs, warmCap } = settings;
  const budgetMs = Option.getOrElse(settings.budgetMs, () => bench.budgetMs);
  const start = performance.now();
  const cold = await subject.op();
  const coldMs = performance.now() - start;
  const first = cold.counters;

  if (!bench.warm)
    return {
      samples: [Option.getOrElse(cold.sample, () => coldMs) / cold.units],
      warmup: 0,
      batch: 1,
      counters: first,
    };

  const timed = bench.measure === "ms";
  const long = !timed || coldMs >= LONG_MS;
  const warm: Array<number> = [];
  const batch = { n: long ? 1 : batchFor(coldMs) };
  const warmStart = performance.now();

  while (!long && warm.length < warmCap && performance.now() - warmStart < settings.warmMs) {
    const s = await sampleOf(subject, batch.n, first);
    warm.push(s.perOp);

    if (isSteady(warm, WINDOW, STEADY)) break;
  }

  if (!long && warm.length > 0) batch.n = batchFor(medianOf(warm.slice(-WINDOW)));

  // One more sample than counted: the first after warm-up is dropped.
  const samples: Array<number> = [];
  const sampling = performance.now();

  const enough = () =>
    Option.match(runs, {
      onSome: (count) => samples.length > count,
      onNone: () =>
        samples.length >= MAX_RUNS ||
        (samples.length > bench.minRuns && performance.now() - sampling >= budgetMs),
    });

  while (!enough()) samples.push((await sampleOf(subject, batch.n, first)).perUnit);

  return { samples: samples.slice(1), warmup: warm.length + 1, batch: batch.n, counters: first };
};

const flag = (args: ReadonlyArray<string>, name: string) => {
  const at = args.indexOf(name);

  return at === -1 ? Option.none<number>() : Option.some(Number(args[at + 1]));
};

class BenchFailed extends Data.TaggedError("BenchFailed")<{ readonly problem: string }> {}

// A bench's own Promise, its rejection kept as the problem a report names.
const attempt = <A>(what: string, run: () => Promise<A>) =>
  // FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: a bench's operations are its own Promises.
  Effect.tryPromise({
    try: run,
    catch: (fault) =>
      new BenchFailed({
        problem: `${what}: ${fault instanceof Error ? fault.message : String(fault)}`,
      }),
  });

// One bench in this process, reported with its id.
const one = (id: string, settings: Settings) =>
  Effect.gen(function* () {
    const bench = benches.find((b) => b.id === id);

    if (bench === undefined)
      return yield* new BenchFailed({ problem: `no bench has the id ${id}` });

    const subject = yield* attempt(`${id} did not load`, bench.load);
    const prove = attempt(`${id} has no proof`, subject.proof);
    const time = attempt(`${id} did not run`, () => measure(bench, subject, settings));
    // A cold bench is timed before its proof, so the proof's run does not warm it.
    const done = bench.warm ? Option.none() : Option.some(yield* time);
    const problem = yield* prove;

    if (Option.isSome(problem)) return yield* new BenchFailed({ problem: problem.value });

    const measured = Option.isSome(done) ? done.value : yield* time;
    const fixture = yield* attempt(`${id} has no shape`, subject.shape);
    const report: Report = { _tag: "Done", id, ...measured, shape: fixture };

    return report;
  }).pipe(
    Effect.catchTag("BenchFailed", ({ problem }) =>
      Effect.succeed<Report>({ _tag: "Failed", id, problem }),
    ),
    Effect.flatMap((report) => Console.log(Schema.encodeSync(Report)(report))),
  );

// Runs each named bench in this process, one after another, and prints one report line for each.
//
// `worker.ts <bench-id...> [--runs N] [--warmup N] [--budget MS] [--warm-ms MS]`: `--warmup` caps
// the warm-up samples and `--warm-ms` its time; `--budget` replaces each bench's sampling budget.
// Each bench is loaded, its proof run, then it warms up until steady and takes its samples, each a
// batch of operations calibrated to at least 1 ms.
const main = Effect.fn("worker")(function* (args: ReadonlyArray<string>) {
  const flags = new Set(["--runs", "--warmup", "--budget", "--warm-ms"]);
  const ids = args.filter((a, n) => !a.startsWith("--") && !flags.has(args[n - 1] ?? ""));

  const settings: Settings = {
    runs: flag(args, "--runs"),
    budgetMs: flag(args, "--budget"),
    warmCap: Option.getOrElse(flag(args, "--warmup"), () => WARM_CAP),
    warmMs: Option.getOrElse(flag(args, "--warm-ms"), () => WARM_CAP_MS),
  };

  for (const id of ids) yield* one(id, settings);
});

// oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- the worker is a process entry point: it runs its one program
await Effect.runPromise(main(process.argv.slice(2)));
