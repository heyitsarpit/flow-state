// The fewest samples a p99 is reported from; below it p99 is NaN and min and max stand instead.
const P99_SAMPLES = 1000;

// The scale that makes a median absolute deviation estimate a normal distribution's deviation.
const MAD_SCALE = 1.4826;

const rank = (sorted: ReadonlyArray<number>, share: number) =>
  sorted[Math.max(0, Math.ceil(share * sorted.length) - 1)] ?? Number.NaN;

const middle = (sorted: ReadonlyArray<number>) => {
  const half = Math.floor(sorted.length / 2);
  const high = sorted[half] ?? Number.NaN;

  return sorted.length % 2 === 1 ? high : ((sorted[half - 1] ?? Number.NaN) + high) / 2;
};

/**
 * The median of a list of numbers, the mean of the middle two for an even count.
 */
export const medianOf = (values: ReadonlyArray<number>) => middle(values.toSorted((a, b) => a - b));

/**
 * The median absolute deviation, scaled by 1.4826 so it estimates a deviation without being moved
 * by outliers.
 */
export const madOf = (values: ReadonlyArray<number>) => {
  const centre = medianOf(values);

  return MAD_SCALE * medianOf(values.map((v) => Math.abs(v - centre)));
};

/**
 * A set of timings summarised: the median is the headline, with min, max, the scaled MAD and the
 * count beside it; the p99, by nearest rank, only from 1,000 samples, NaN below.
 */
export const spreadOf = (timings: ReadonlyArray<number>) => {
  const sorted = timings.toSorted((a, b) => a - b);

  return {
    median: middle(sorted),
    min: sorted[0] ?? Number.NaN,
    max: sorted.at(-1) ?? Number.NaN,
    p99: sorted.length >= P99_SAMPLES ? rank(sorted, 0.99) : Number.NaN,
    mad: madOf(sorted),
    count: sorted.length,
  };
};

/**
 * Whether the last `window` samples sit within `share` of their own median: a warm-up stops here.
 */
export const isSteady = (samples: ReadonlyArray<number>, window: number, share: number) => {
  if (samples.length < window) return false;

  const last = samples.slice(-window);
  const centre = medianOf(last);

  return last.every((v) => Math.abs(v - centre) <= share * centre);
};

/**
 * A small deterministic generator (xorshift32), so a bootstrap gives the same interval on every
 * read of the same samples.
 */
const generator = (seed: number) => {
  const state = { x: seed >>> 0 || 1 };

  return (below: number) => {
    state.x ^= state.x << 13;
    state.x >>>= 0;
    state.x ^= state.x >>> 17;
    state.x ^= state.x << 5;
    state.x >>>= 0;

    return state.x % below;
  };
};

const pick = <A>(values: ReadonlyArray<A>, draw: (below: number) => number) =>
  Array.from({ length: values.length }, () => values[draw(values.length)] ?? values[0]);

// One resample of processes, then of samples inside each: the median of their medians.
const resampled = (
  processes: ReadonlyArray<ReadonlyArray<number>>,
  draw: (below: number) => number,
) =>
  medianOf(
    pick(processes, draw).map((samples) => medianOf(pick(samples ?? [], draw).map((v) => v ?? 0))),
  );

/**
 * A change between two benches' samples, each grouped by worker process: the ratio of their
 * medians of medians and its 95% interval from a two-level bootstrap.
 *
 * **Details**
 *
 * Each resample draws processes with replacement and then samples inside each, so the interval
 * carries the spread between processes, which repeats inside one process understate.
 */
export type Change = {
  readonly ratio: number;
  readonly low: number;
  readonly high: number;
};

const RESAMPLES = 2000;

/**
 * The ratio `after / before` of medians of medians, with its 95% bootstrap interval.
 */
export const changeOf = (
  before: ReadonlyArray<ReadonlyArray<number>>,
  after: ReadonlyArray<ReadonlyArray<number>>,
) => {
  const ratio = medianOf(after.map(medianOf)) / medianOf(before.map(medianOf));

  // Fewer than three samples on a side give no noise band: the interval spans everything.
  if (before.flat().length < 3 || after.flat().length < 3)
    return { ratio, low: 0, high: Number.POSITIVE_INFINITY };

  const draw = generator(0x9e3779b9);

  const ratios = Array.from(
    { length: RESAMPLES },
    () => resampled(after, draw) / resampled(before, draw),
  ).toSorted((a, b) => a - b);

  return {
    ratio,
    low: rank(ratios, 0.025),
    high: rank(ratios, 0.975),
  };
};

// The smallest change counted as one, as a share of the old median.
const MIN_EFFECT = 0.05;

/**
 * A change counts only when its interval excludes no change and its size passes the minimum effect,
 * `MIN_EFFECT` unless a wider one is given.
 */
export const verdictOf = (change: Change, minEffect = MIN_EFFECT) => {
  if (change.low > 1 && change.ratio - 1 >= minEffect) return "slower" as const;

  if (change.high < 1 && 1 - change.ratio >= minEffect) return "faster" as const;

  return "same" as const;
};

/**
 * A least-squares line through log10(size) and log10(value): its slope is the series' order of
 * growth (1 is linear) and `r2` how well a power law fits it. Needs two sizes or more.
 */
export const slopeOf = (points: ReadonlyArray<{ readonly n: number; readonly value: number }>) => {
  const xs = points.map((p) => Math.log10(p.n));
  const ys = points.map((p) => Math.log10(p.value));
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const sxx = xs.reduce((sum, x) => sum + (x - mx) ** 2, 0);
  const sxy = xs.reduce((sum, x, n) => sum + (x - mx) * ((ys[n] ?? my) - my), 0);
  const syy = ys.reduce((sum, y) => sum + (y - my) ** 2, 0);
  const slope = sxy / sxx;

  return { slope, r2: syy === 0 ? 1 : (sxy * sxy) / (sxx * syy) };
};
