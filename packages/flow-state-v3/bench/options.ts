import { tmpdir } from "node:os";
import { parseArgs } from "node:util";
import { Schema } from "effect";
import { CONCERNS } from "./declare.ts";
import { HISTORY } from "./history.ts";

// The longest a run may take by default, in seconds: under the five-minute rule for any command.
export const MAX_TIME_S = 240;

export const NOT_RUN = "not run: the run reached its --max-time cap";

export const Options = Schema.Struct({
  concerns: Schema.Array(Schema.Literals(CONCERNS)),
  only: Schema.optionalKey(Schema.String),
  list: Schema.Boolean,
  record: Schema.Boolean,
  compare: Schema.optionalKey(Schema.String),
  stored: Schema.Boolean,
  summary: Schema.Boolean,
  full: Schema.Boolean,
  stress: Schema.Boolean,
  detail: Schema.Boolean,
  separate: Schema.Boolean,
  dev: Schema.Boolean,
  help: Schema.Boolean,
  maxN: Schema.optionalKey(Schema.FiniteFromString),
  maxTime: Schema.FiniteFromString,
  timing: Schema.Boolean,
  runs: Schema.optionalKey(Schema.FiniteFromString),
  warmup: Schema.optionalKey(Schema.FiniteFromString),
  workers: Schema.optionalKey(Schema.FiniteFromString),
  scratch: Schema.String,
  history: Schema.String,
  backfill: Schema.Boolean,
});

export type Options = typeof Options.Type;

export const optionsOf = (argv: ReadonlyArray<string>) => {
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
      stress: { type: "boolean", default: false },
      detail: { type: "boolean", default: false },
      separate: { type: "boolean", default: false },
      dev: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
      "max-n": { type: "string" },
      "max-time": { type: "string", default: String(MAX_TIME_S) },
      timing: { type: "boolean", default: false },
      runs: { type: "string" },
      warmup: { type: "string" },
      workers: { type: "string" },
      scratch: { type: "string", default: tmpdir() },
      history: { type: "string", default: HISTORY },
      backfill: { type: "boolean", default: false },
    },
  });

  const { "max-n": maxN, "max-time": maxTime, ...rest } = values;

  const sized = maxN === undefined ? {} : { maxN };

  return Schema.decodeUnknownSync(Options)({ ...rest, ...sized, maxTime, concerns: positionals });
};

/**
 * How a tier samples: the quick tier runs each concern's headline benches in two workers, each
 * running every bench in one process on a short budget; the full tier runs every bench in its own
 * fresh processes on its full budget.
 */
export const TIERS = {
  quick: { workers: 2, budgetMs: 300, warmMs: 500, minEffect: 0.1 },
  stress: { workers: 2, budgetMs: 300, warmMs: 500, minEffect: 0.1 },
  full: { workers: 5, budgetMs: undefined, warmMs: undefined, minEffect: 0.05 },
  dev: { workers: 1, budgetMs: 200, warmMs: 300, minEffect: 0.1 },
} as const;

export const tierOf = (options: Options) => {
  if (options.dev) return "dev" as const;

  if (options.stress) return "stress" as const;

  return options.full ? ("full" as const) : ("quick" as const);
};

export const scopeOf = (options: Options) => ({
  name: tierOf(options),
  minEffect: TIERS[tierOf(options)].minEffect,
});

export const HELP = `nub run bench [concern...] [--full | --stress | --dev] [--only <pattern>] [--max-n <n>]
  [--max-time <s>] [--list] [--record] [--compare <commit> [--stored]] [--summary] [--detail]
  [--timing] [--separate] [--runs N] [--warmup N] [--workers N]

Tiers:
  (default)  quick: each concern's headline benches but the stress ones, two workers sharing a process each, a short
             budget; changes count past 10%. The periodic run.
  --stress   only the stress benches (those on a stress Story), run as the quick tier runs; its rows
             are a tier of their own and never mix with quick's.
  --full     every bench, five fresh processes each, its full budget; changes past 5%. The full
             tier runs past the cap: run it one concern at a time, as in nub run bench scale --full.
  --dev      any bench, one worker, a short budget, records nothing; with no --max-n, only each
             series' smallest point. For iterating: --only <pattern> --dev, --compare HEAD --dev.

Limits:
  --max-time <s>  the whole run's wall-clock cap, ${MAX_TIME_S} s by default: past it, every worker is
                  stopped, the benches left are marked not run, and the run exits 3.
  every bench has a timeout from its warm-up cap and budget; one that passes it is killed, reported
  timed-out and never recorded, and the run moves on.
  --max-n <n>     leave out series points larger than n.

Tooling (suite, stress, faults) runs only when named. --record appends rows to
history/<concern>.csv and refuses under load (exit 2): a one-minute load over half the cores, or
another node, bun, vitest, tsc, tsgo or nub process over 25% of a core. Exit 1 names a bench that
failed its proof, did not run, or timed out.`;
