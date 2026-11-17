import { Option } from "effect";
import { type Bench, type Counters, type Subject, workChange } from "./declare.ts";
import { isSteady, medianOf } from "./stats.ts";

// A sample should take at least this long, so timer resolution and a per-sample await vanish.
const SAMPLE_MS = 1;

// Warm-up stops once the last `WINDOW` samples sit within `STEADY` of their median, or at the cap.
const WINDOW = 5;
const STEADY = 0.1;

/**
 * The most warm-up samples, unless the command line sets fewer.
 */
export const WARM_CAP = 100;

/**
 * The longest warm-up, unless the command line sets another.
 */
export const WARM_CAP_MS = 3000;

// An operation this slow gets one throwaway run as its warm-up.
const LONG_MS = 1000;

const MAX_BATCH = 100_000;

// The most samples a worker takes on its time budget: enough for a p99.
const MAX_RUNS = 1000;

class WorkChanged extends Error {}

/**
 * A bench that ran past its timeout: the samples it took before stopping.
 */
export class TimedOut extends Error {
  readonly samples: ReadonlyArray<number>;

  constructor(samples: ReadonlyArray<number>, timeoutMs: number) {
    super(`timed-out after ${String(timeoutMs)} ms with ${String(samples.length)} samples`);
    this.samples = samples;
  }
}

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

/**
 * How a worker samples: an exact count or its time budget, how long warm-up may take, the longest
 * operation the tier allows, and the bench's timeout.
 */
export type Settings = {
  readonly runs: Option.Option<number>;
  readonly budgetMs: Option.Option<number>;
  readonly warmCap: number;
  readonly warmMs: number;
  readonly timeoutMs: number;
};

// Warms a bench up until its last samples are steady, within the warm-up caps, unless one cold
// operation already took a second or the bench measures bytes; returns the batch size to sample at.
const warmUp = async (
  bench: Bench,
  subject: Subject,
  settings: Settings,
  cold: { readonly coldMs: number; readonly first: Counters; readonly late: () => boolean },
) => {
  const long = bench.measure !== "ms" || cold.coldMs >= LONG_MS;
  const warm: Array<number> = [];
  const batch = { n: long ? 1 : batchFor(cold.coldMs) };
  const warmStart = performance.now();

  const warming = () =>
    !long && warm.length < settings.warmCap && performance.now() - warmStart < settings.warmMs;

  while (warming()) {
    if (cold.late()) throw new TimedOut([], settings.timeoutMs);
    const s = await sampleOf(subject, batch.n, cold.first);
    warm.push(s.perOp);

    if (isSteady(warm, WINDOW, STEADY)) break;
  }

  if (warm.length > 0) batch.n = batchFor(medianOf(warm.slice(-WINDOW)));

  return { warm, batch };
};

/**
 * Times one bench: a cold operation, a warm-up until steady, then samples on its budget, each a
 * batch of operations calibrated to at least 1 ms.
 *
 * **Details**
 *
 * Past `settings.timeoutMs` from its start it stops between samples and throws `TimedOut` with
 * the samples taken; an operation longer than the timeout is stopped by its process's kill.
 */
export const measure = async (bench: Bench, subject: Subject, settings: Settings) => {
  const begun = performance.now();
  const late = () => performance.now() - begun > settings.timeoutMs;
  const { runs } = settings;
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
      timing: { coldMs, warmMs: 0, warmOps: 0, sampleMs: 0, sampleOps: 1, opMs: coldMs },
    };

  const warmStart = performance.now();
  const { warm, batch } = await warmUp(bench, subject, settings, { coldMs, first, late });

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

  const perOp: Array<number> = [];

  while (!enough()) {
    if (late()) throw new TimedOut(samples.slice(1), settings.timeoutMs);
    const s = await sampleOf(subject, batch.n, first);
    samples.push(s.perUnit);
    perOp.push(s.perOp);
  }

  const timing = {
    coldMs,
    warmMs: sampling - warmStart,
    warmOps: warm.length * batch.n,
    sampleMs: performance.now() - sampling,
    sampleOps: samples.length * batch.n,
    opMs: medianOf(perOp),
  };

  return {
    samples: samples.slice(1),
    warmup: warm.length + 1,
    batch: batch.n,
    counters: first,
    timing,
  };
};
