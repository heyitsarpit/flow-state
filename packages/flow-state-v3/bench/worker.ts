import { Console, Data, Effect, Option, Schema } from "effect";
import { Report } from "./report.ts";
import { BENCHES, benchesFrom } from "./list.ts";
import type { Bench } from "./declare.ts";
import { measure, type Settings, TimedOut, WARM_CAP, WARM_CAP_MS } from "./sample.ts";

const flag = (args: ReadonlyArray<string>, name: string) => {
  const at = args.indexOf(name);

  return at === -1 ? Option.none<number>() : Option.some(Number(args[at + 1]));
};

class BenchFailed extends Data.TaggedError("BenchFailed")<{ readonly problem: string }> {}

class BenchTimedOut extends Data.TaggedError("BenchTimedOut")<{
  readonly problem: string;
  readonly samples: ReadonlyArray<number>;
}> {}

// A bench's own Promise, its rejection kept as the problem a report names.
const attempt = <A>(what: string, run: () => Promise<A>) =>
  // FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: a bench's operations are its own Promises.
  Effect.tryPromise({
    try: run,
    catch: (fault) => {
      const problem = `${what}: ${fault instanceof Error ? fault.message : String(fault)}`;

      return fault instanceof TimedOut
        ? new BenchTimedOut({ problem, samples: fault.samples })
        : new BenchFailed({ problem });
    },
  });

// One bench in this process, reported with its id.
const one = (id: string, benches: ReadonlyArray<Bench>, settings: Settings) =>
  Effect.gen(function* () {
    const bench = benches.find((b) => b.id === id);

    if (bench === undefined)
      return yield* new BenchFailed({ problem: `no bench has the id ${id}` });

    const startedAt = performance.now();
    const subject = yield* attempt(`${id} did not load`, bench.load);
    const loaded = performance.now();
    const prove = attempt(`${id} has no proof`, subject.proof);
    const time = attempt(`${id} did not run`, () => measure(bench, subject, settings));
    // A cold bench is timed before its proof, so the proof's run does not warm it.
    const done = bench.warm ? Option.none() : Option.some(yield* time);
    const proving = performance.now();
    const problem = yield* prove;
    const proofMs = performance.now() - proving;

    if (Option.isSome(problem)) return yield* new BenchFailed({ problem: problem.value });

    const measured = Option.isSome(done) ? done.value : yield* time;
    const fixture = yield* attempt(`${id} has no shape`, subject.shape);

    const timing = {
      ...measured.timing,
      startedAt,
      loadMs: loaded - startedAt,
      proofMs,
      totalMs: performance.now() - startedAt,
    };

    const report: Report = { _tag: "Done", id, ...measured, timing, shape: fixture };

    return report;
  }).pipe(
    Effect.catchTags({
      BenchFailed: ({ problem }) => Effect.succeed<Report>({ _tag: "Failed", id, problem }),
      BenchTimedOut: ({ problem, samples }) =>
        Effect.succeed<Report>({ _tag: "TimedOut", id, problem, samples }),
    }),
    Effect.flatMap((report) => Console.log(Schema.encodeSync(Report)(report))),
  );

// Runs each named bench in this process, one after another, and prints one report line for each.
//
// `worker.ts <bench-id...> [--runs N] [--warmup N] [--budget MS] [--warm-ms MS] [--timeout-ms MS]`:
// `--warmup` caps the warm-up samples and `--warm-ms` its time; `--budget` replaces each bench's
// sampling budget; `--timeout-ms` stops a bench between samples past that time, reported timed-out.
// Each bench is loaded, its proof run, then it warms up until steady and takes its samples, each a
// batch of operations calibrated to at least 1 ms.
const main = Effect.fn("worker")(function* (args: ReadonlyArray<string>) {
  const flags = new Set([
    "--runs",
    "--warmup",
    "--budget",
    "--warm-ms",
    "--timeout-ms",
    "--benches",
  ]);

  const ids = args.filter((a, n) => !a.startsWith("--") && !flags.has(args[n - 1] ?? ""));

  const settings: Settings = {
    runs: flag(args, "--runs"),
    budgetMs: flag(args, "--budget"),
    warmCap: Option.getOrElse(flag(args, "--warmup"), () => WARM_CAP),
    warmMs: Option.getOrElse(flag(args, "--warm-ms"), () => WARM_CAP_MS),
    timeoutMs: Option.getOrElse(flag(args, "--timeout-ms"), () => Number.POSITIVE_INFINITY),
  };

  const at = args.indexOf("--benches");
  const benches = yield* benchesFrom(at === -1 ? BENCHES : (args[at + 1] ?? BENCHES));

  for (const id of ids) yield* one(id, benches, settings);
});

// oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- the worker is a process entry point: it runs its one program
await Effect.runPromise(main(process.argv.slice(2)));
