import { Option } from "effect";

/**
 * Every concern a bench belongs to; each keeps its own history file.
 */
export const CONCERNS = [
  "turn",
  "scale",
  "persist",
  "values",
  "startup",
  "memory",
  "tooling",
] as const;

/**
 * One concern of the bench.
 */
export type Concern = (typeof CONCERNS)[number];

/**
 * Counts one operation did, beside its time: turns, events, effects, bytes, keys, memo hits.
 */
export type Counters = Readonly<Record<string, number>>;

/**
 * What one operation did: `units` is what its time is divided by (turns, sends, bytes walked), and
 * `counters` the work it did, which must be the same on every operation of a bench. `sample` is
 * the operation's own measurement: a time bench's measured part in ms, when it has setup that must
 * not be timed, or a bytes bench's bytes. With none, the whole operation is timed.
 */
export type Work = {
  readonly units: number;
  readonly counters: Counters;
  readonly sample: Option.Option<number>;
};

/**
 * A loaded bench: one operation, its proof, and the numbers that fix its fixture's shape.
 *
 * **Details**
 *
 * `op` does one operation and says what it did; its sample is its own, or else its wall time. `proof` runs once
 * before timing (after it, for a cold bench) and names any way the work differs from what the bench
 * claims. `shape`, read after timing, is hashed into each history row, so a comparison across a fixture change is refused.
 */
export type Subject = {
  readonly op: () => Promise<Work>;
  readonly proof: () => Promise<Option.Option<string>>;
  readonly shape: () => Promise<Counters>;
};

/**
 * How a bench's sample is read: a wall time per unit, or bytes per unit read from its counters.
 */
export type Measure = "ms" | "bytes";

/**
 * The numbers a summary shows for a bench.
 */
export type Headline = "median" | "p99" | "min";

/**
 * One benchmark, declared once.
 *
 * **Details**
 *
 * `id` reads `<concern>.<subject>.<metric>-<unit>`, such as `turn.transfers.long.per-turn-ms`.
 * `size` is the size of the work it times, in its unit; benches sharing `series` form one growth
 * series, whose log-log slope must stay at or under `maxSlope`. `budget` is the most one unit may
 * take; time benches default to one 60 Hz frame. `workers` fresh processes each warm up and then sample
 * until `budgetMs` of sampling has passed and at least `minRuns` samples are taken (at most 1,000),
 * unless `--runs` sets the count; a bench that is not `warm` is timed cold,
 * with no warm-up. `gc` runs its workers with a full collector exposed.
 */
export type Bench = {
  readonly id: string;
  readonly concern: Concern;
  readonly tags: ReadonlyArray<string>;
  readonly size: { readonly n: number; readonly unit: string };
  readonly measure: Measure;
  readonly series: Option.Option<{ readonly name: string; readonly maxSlope: number }>;
  readonly headline: ReadonlyArray<Headline>;
  readonly budget: Option.Option<number>;
  readonly workers: number;
  readonly budgetMs: number;
  readonly minRuns: number;
  readonly gc: boolean;
  readonly warm: boolean;
  readonly load: () => Promise<Subject>;
};

/**
 * One 60 Hz frame, the budget of any one unit of work that blocks a page.
 */
export const FRAME_MS = 16;

type Declared = Pick<Bench, "id" | "concern" | "tags" | "size" | "load"> &
  Partial<Omit<Bench, "id" | "concern" | "tags" | "size" | "load">>;

/**
 * Declares a bench with the defaults: timed, no series, median and p99 as headline, the frame
 * budget for time, five workers that each warm up and then sample for two seconds (five samples at
 * least), no collector.
 */
export const bench = (declared: Declared) => {
  const measure = declared.measure ?? "ms";

  const made: Bench = {
    measure,
    series: Option.none(),
    headline: ["median", "p99"],
    budget: measure === "ms" ? Option.some(FRAME_MS) : Option.none(),
    workers: 5,
    budgetMs: 2000,
    minRuns: 5,
    gc: false,
    warm: true,
    ...declared,
  };

  return made;
};

/**
 * Whether the counters of two operations show the same work.
 */
export const sameWork = (a: Counters, b: Counters) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);

  return [...keys].every((key) => a[key] === b[key]);
};

/**
 * Names how an operation's counters differ from the first operation's, or none.
 */
export const workChange = (first: Counters, now: Counters) =>
  sameWork(first, now)
    ? Option.none<string>()
    : Option.some(
        `the work changed between operations: ${Object.entries(first)
          .map(([k, v]) => `${k} ${v} then ${now[k] ?? "none"}`)
          .join(", ")}`,
      );
