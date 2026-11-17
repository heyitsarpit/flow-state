import { Option } from "effect";
import type { Bench, Counters } from "./declare.ts";
import type { Row } from "./history.ts";
import { hashOf, type environmentOf } from "./machine.ts";
import type { Report } from "./report.ts";
import { madOf, medianOf, spreadOf } from "./stats.ts";

/**
 * One worker's finished report.
 */
export type Done = Extract<Report, { readonly _tag: "Done" }>;

/**
 * One bench's result over its workers: each worker's samples, the median of their medians, the
 * spread between workers as a share of it, and every sample pooled.
 */
export type Result = {
  readonly bench: Bench;
  readonly processes: ReadonlyArray<ReadonlyArray<number>>;
  readonly median: number;
  readonly spread: number;
  readonly pooled: ReturnType<typeof spreadOf>;
  readonly warmup: number;
  readonly batch: number;
  readonly counters: Counters;
  readonly fixture: string;
};

/**
 * The hash of a fixture's shape: its counts, in name order.
 */
export const fixtureHash = (shape: Counters) =>
  hashOf(
    Object.entries(shape)
      .toSorted(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${k}=${v}`)
      .join(";"),
  );

/**
 * Counters as `name=value` pairs joined by `;`.
 */
export const countersText = (counters: Counters) =>
  Object.entries(counters)
    .map(([k, v]) => `${k}=${Number.isInteger(v) ? v : v.toFixed(3)}`)
    .join(";");

/**
 * A bench's result from its workers' reports.
 */
export const resultOf = (bench: Bench, runs: ReadonlyArray<Done>) => {
  const processes = runs.map((r) => r.samples);
  const medians = processes.map(medianOf);
  const median = medianOf(medians);

  const result: Result = {
    bench,
    processes,
    median,
    spread: medians.length > 1 ? madOf(medians) / median : 0,
    pooled: spreadOf(processes.flat()),
    warmup: medianOf(runs.map((r) => r.warmup)),
    batch: medianOf(runs.map((r) => r.batch)),
    counters: runs[0]?.counters ?? {},
    fixture: fixtureHash(runs[0]?.shape ?? {}),
  };

  return result;
};

/**
 * `over` when the median or the slowest sample passes the bench's budget, `ok` within it, empty
 * with no budget.
 */
export const budgetState = (result: Result) =>
  Option.match(result.bench.budget, {
    onNone: () => "",
    onSome: (budget) => (result.median > budget || result.pooled.max > budget ? "over" : "ok"),
  });

/**
 * What a result's own counters show failed: a faults run that caught fewer than it planted.
 */
export const failuresOf = (result: Result) => {
  const { caught, planted } = result.counters;

  return caught !== undefined && planted !== undefined && caught < planted
    ? [`caught ${caught} of ${planted} planted faults`]
    : [];
};

/**
 * How one history row is labelled: its commit and tree, environment, date, samples file and
 * confidence.
 */
export type Label = {
  readonly commit: string;
  readonly tree: Row["tree"];
  readonly env: ReturnType<typeof environmentOf>;
  readonly date: string;
  readonly samples: string;
  readonly confidence: Row["confidence"];
};

// Six significant digits: past the noise of any bench, short enough to read in the CSV.
const kept = (v: number) => Number(v.toPrecision(6));

/**
 * A result as one history row.
 */
export const rowOf = (result: Result, label: Label) => {
  const row: Row = {
    commit: label.commit,
    tree: label.tree,
    date: label.date,
    runtime: label.env.runtime,
    version: label.env.version,
    flags: label.env.flags,
    machine: label.env.machine,
    cpu: label.env.cpu,
    cores: label.env.cores,
    power: label.env.power,
    load: Number(label.env.load.toFixed(2)),
    confidence: label.confidence,
    concern: result.bench.concern,
    bench: result.bench.id,
    size: result.bench.size.n,
    unit: result.bench.size.unit,
    workers: result.processes.length,
    samples_n: result.pooled.count,
    warmup: result.warmup,
    batch: result.batch,
    median: kept(result.median),
    min: kept(result.pooled.min),
    max: kept(result.pooled.max),
    p99: kept(result.pooled.p99),
    mad: kept(result.pooled.mad),
    spread: kept(result.spread),
    shape: result.fixture,
    counters: countersText(result.counters),
    samples: label.samples,
    budget: Option.match(result.bench.budget, { onNone: () => "", onSome: String }),
    budget_state: budgetState(result),
  };

  return row;
};
