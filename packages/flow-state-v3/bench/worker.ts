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

const measure = async (bench: Bench, subject: Subject, runs: number, warmCap: number) => {
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

  while (!long && warm.length < warmCap && performance.now() - warmStart < WARM_CAP_MS) {
    const s = await sampleOf(subject, batch.n, first);
    warm.push(s.perOp);

    if (isSteady(warm, WINDOW, STEADY)) break;
  }

  if (!long && warm.length > 0) batch.n = batchFor(medianOf(warm.slice(-WINDOW)));

  // One more sample than asked: the first after warm-up is dropped.
  const samples: Array<number> = [];

  for (let n = 0; n <= runs; n += 1)
    samples.push((await sampleOf(subject, batch.n, first)).perUnit);

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

// Runs one bench in this process and reports it.
//
// `worker.ts <bench-id> [--runs N] [--warmup N]`: `--warmup` caps the warm-up samples. The bench
// is loaded, its proof run, then it warms up until steady and takes its samples, each a batch of
// operations calibrated to at least 1 ms.
const main = Effect.fn("worker")(
  function* (args: ReadonlyArray<string>) {
    const id = args[0] ?? "";
    const bench = benches.find((b) => b.id === id);

    if (bench === undefined)
      return yield* new BenchFailed({ problem: `no bench has the id ${id}` });

    const runs = Option.getOrElse(flag(args, "--runs"), () => bench.runs);
    const warmCap = Option.getOrElse(flag(args, "--warmup"), () => WARM_CAP);
    const subject = yield* attempt(`${id} did not load`, bench.load);
    const prove = attempt(`${id} has no proof`, subject.proof);
    const time = attempt(`${id} did not run`, () => measure(bench, subject, runs, warmCap));
    // A cold bench is timed before its proof, so the proof's run does not warm it.
    const done = bench.warm ? Option.none() : Option.some(yield* time);
    const problem = yield* prove;

    if (Option.isSome(problem)) return yield* new BenchFailed({ problem: problem.value });

    const measured = Option.isSome(done) ? done.value : yield* time;
    const report: Report = { _tag: "Done", ...measured, shape: subject.shape };

    return report;
  },
  Effect.catchTag("BenchFailed", ({ problem }) =>
    Effect.succeed<Report>({ _tag: "Failed", problem }),
  ),
  Effect.flatMap((report) => Console.log(Schema.encodeSync(Report)(report))),
);

// oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- the worker is a process entry point: it runs its one program
await Effect.runPromise(main(process.argv.slice(2)));
