/**
 * How long a test may take, from how long it took alone: its slowest run measured alone on a
 * 12-core machine, times `HEADROOM`, and never under vitest's own 5 s default.
 *
 * **When to use**
 *
 * Every test whose run is longer than the default names its limit here, so each limit has one
 * source and the measurement it came from beside it. Re-measure when a test's work changes.
 *
 * **Details**
 *
 * `HEADROOM` is 4: under `nub run faults` (copies times workers about the core count) a test
 * measured up to about twice its alone time, and a slower machine may take as long again.
 */
const HEADROOM = 4;

const DEFAULT_MS = 5000;

/**
 * The limit of a test measured at `aloneMs` alone.
 */
export const limitFrom = (aloneMs: number) => Math.max(DEFAULT_MS, Math.ceil(aloneMs * HEADROOM));

/**
 * Each long test's limit, by what it runs, measured alone at the revision that last changed it.
 */
export const LIMITS = {
  /** A default-tier reload sweep shard's test: slowest 9.6 s; the double reload at every position (FLOW_EVERY_RELOAD) 20.8 s. */
  reloadSweep: limitFrom(20_800),
  /** A stress reload sweep shard's test: slowest 54.9 s (palette/stress-36, land). */
  stressReloadSweep: limitFrom(54_900),
  /** Every Story's run rules in one test: stress Stories 1.2 s, the rest 2.3 s. */
  runRules: limitFrom(2300),
  /** Every Story under another seed or world: 3.8 s. */
  otherWorld: limitFrom(3800),
  /** Every context Story reloaded at its end, once and three times: 4.8 s. */
  reloadAtEnd: limitFrom(4800),
  /** One fixture's pair sweep: the usual tier 4.1 s, every drive seed (stress) 14.1 s. */
  pairSweep: limitFrom(14_100),
  /** The pair sweep's own tool tests over a peeking or first-only shop: 2.2 s. */
  pairSweepTool: limitFrom(2200),
  /** An app mix test: 2.4 s; the mix's stress run 7.9 s. */
  mix: limitFrom(2400),
  mixStress: limitFrom(7900),
  /** A planted fault found and shrunk by the generator: 2.2 s. */
  shrink: limitFrom(2200),
  /** One generated seed: the usual profile 70 ms, the stress profile 5.2 s (palette). */
  usualSeed: 70,
  stressSeed: 5200,
  /** A value 100,000 deep saved, restored and reloaded: 13.7 s (the folder tree). */
  deepValue: limitFrom(13_700),
  /** An actor named by a folder tree past the call stack, saved and restored: 2.8 s. */
  deepName: limitFrom(2800),
  /** 300,000 commands saved as one record and reloaded: 10.6 s. */
  largeList: limitFrom(10_600),
  /** 4,200 cancels on a lane whose calls never answer: 7.9 s. */
  laneBound: limitFrom(7900),
  /** Large receipts under the stress profile: 2.4 s. */
  durability: limitFrom(2400),
  /** Every bench's proof: 21.1 s. */
  benchProofs: limitFrom(21_100),
} as const;
