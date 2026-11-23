import { parseArgs } from "node:util";
import { Data, Effect, Option, Record, Result, Schema } from "effect";

// The worker's number flags, by the field each fills: the run writes them and the worker reads them from this one
// table, so a flag renamed on one side is renamed on both.
const NUMBERS = {
  runs: "runs",
  warmup: "warmup",
  budgetMs: "budget",
  warmMs: "warm-ms",
  timeoutMs: "timeout-ms",
  run: "run",
} as const;

// The flag naming the module a worker loads its benches from, instead of the package's own list.
const LIST_FLAG = "benches";

/**
 * What a worker runs: the bench ids, each flag's value when the run sets it.
 */
export type WorkerArgs = {
  readonly ids: ReadonlyArray<string>;
  readonly numbers: { readonly [K in keyof typeof NUMBERS]: Option.Option<number> };
  readonly benches: Option.Option<string>;
};

/**
 * Why a worker refused its arguments: a flag it does not know, a flag with no value, or a number
 * flag whose value is not a finite number.
 */
export class WorkerArgsRefused extends Data.TaggedError("WorkerArgsRefused")<{
  readonly problem: string;
}> {}

const finite = Schema.decodeUnknownResult(Schema.FiniteFromString);

const flagged = (flag: string, value: Option.Option<string>) =>
  Option.match(value, { onNone: () => [], onSome: (v) => [`--${flag}`, v] });

/**
 * The command line a worker is started with, after its script.
 */
export const writeWorkerArgs = (args: WorkerArgs) => [
  ...args.ids,
  ...Record.toEntries(NUMBERS).flatMap(([field, flag]) =>
    flagged(flag, Option.map(args.numbers[field], String)),
  ),
  ...flagged(LIST_FLAG, args.benches),
];

/**
 * A worker's command line read back, every flag checked: an unknown flag, a flag with no value or a
 * number that is not finite is refused, naming the flag.
 */
export const readWorkerArgs = (argv: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const { values, positionals } = yield* Effect.try({
      try: () =>
        parseArgs({
          args: [...argv],
          allowPositionals: true,
          strict: true,
          options: Record.fromEntries(
            [...Record.values(NUMBERS), LIST_FLAG].map((flag) => [
              flag,
              { type: "string" as const },
            ]),
          ),
        }),
      catch: (fault) =>
        new WorkerArgsRefused({ problem: fault instanceof Error ? fault.message : String(fault) }),
    });

    const text = (flag: string) => Option.fromUndefinedOr(values[flag]);

    const numbers = yield* Effect.fromResult(
      Result.all(
        Record.map(NUMBERS, (flag) =>
          Option.match(text(flag), {
            onNone: () => Result.succeed(Option.none<number>()),
            onSome: (given) =>
              Result.mapBoth(finite(given), {
                onFailure: () =>
                  new WorkerArgsRefused({ problem: `--${flag} ${given}: not a finite number` }),
                onSuccess: Option.some,
              }),
          }),
        ),
      ),
    );

    return { ids: positionals, numbers, benches: text(LIST_FLAG) } satisfies WorkerArgs;
  });
