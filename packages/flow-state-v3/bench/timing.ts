import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Schema } from "effect";
import { Report } from "./report.ts";

/**
 * One worker process of a run: the package it ran in, its wall time, the benches it ran and its
 * reports, each with where its time went.
 */
export type Spawned = {
  readonly pkg: string;
  readonly wallMs: number;
  readonly benches: ReadonlyArray<string>;
  readonly reports: ReadonlyArray<Report>;
};

const Line = Schema.fromJsonString(
  Schema.Struct({
    pkg: Schema.String,
    wallMs: Schema.Number,
    benches: Schema.Array(Schema.String),
    reports: Schema.Array(Schema.String),
  }),
);

/**
 * Appends a run's worker processes to a local timing file, one JSON line each, and returns its
 * path. The file sits beside the raw samples, so it stays on this machine.
 */
export const writeTiming = (root: string, name: string, spawned: ReadonlyArray<Spawned>) => {
  const file = join(root, "samples", `timing-${name}.jsonl`);
  mkdirSync(join(root, "samples"), { recursive: true });

  for (const s of spawned)
    appendFileSync(
      file,
      `${Schema.encodeSync(Line)({ ...s, reports: s.reports.map((r) => Schema.encodeSync(Report)(r)) })}\n`,
    );

  return file;
};

type Done = Extract<Report, { readonly _tag: "Done" }>;

const of = (r: Done, key: string) => r.timing[key] ?? 0;

// One report's time, with its process's startup when that process ran it alone.
const entryOf = (s: Spawned, r: Done) => {
  const startup = s.benches.length === 1 ? of(r, "startedAt") : 0;

  return {
    startupMs: startup,
    loadProofMs: of(r, "loadMs") + of(r, "proofMs"),
    warmMs: of(r, "warmMs") + of(r, "coldMs"),
    warmOps: of(r, "warmOps") + 1,
    sampleMs: of(r, "sampleMs"),
    sampleOps: of(r, "sampleOps"),
    opMs: of(r, "opMs"),
    totalMs: of(r, "totalMs") + startup,
  };
};

type Entry = ReturnType<typeof entryOf>;

const ms = (v: number) => (v >= 100 ? v.toFixed(0) : v.toFixed(1));

const sum = (entries: ReadonlyArray<Entry>, key: Exclude<keyof Entry, "opMs">) =>
  entries.reduce((total, e) => total + e[key], 0);

const lineOf = (id: string, entries: ReadonlyArray<Entry>) => {
  const opMs =
    entries.map((e) => e.opMs).toSorted((a, b) => a - b)[Math.floor(entries.length / 2)] ?? 0;

  return {
    totalMs: sum(entries, "totalMs"),
    text: `${id} | ${entries.length} | ${ms(sum(entries, "startupMs"))} | ${ms(sum(entries, "loadProofMs"))} | ${ms(sum(entries, "warmMs"))} (${sum(entries, "warmOps")}) | ${ms(sum(entries, "sampleMs"))} (${sum(entries, "sampleOps")}) | ${ms(opMs)} | ${ms(sum(entries, "totalMs"))}`,
  };
};

// The time from a shared process's start to its first bench, counted once per process.
const sharedStartup = (spawned: ReadonlyArray<Spawned>) =>
  spawned
    .filter((s) => s.benches.length > 1)
    .reduce((total, s) => {
      const firsts = s.reports.flatMap((r) => (r._tag === "Done" ? [of(r, "startedAt")] : []));

      return total + (firsts.length === 0 ? 0 : Math.min(...firsts));
    }, 0);

/**
 * Where a run's time went, one line per bench sorted by total time, then the run's totals.
 *
 * **Details**
 *
 * A process's startup is the time from its start to its first bench; with one bench a process it
 * is that bench's, and with several it is counted once, as its own line. A bench's total is its
 * workers' load, proof, cold run, warm-up and sampling, plus its own processes' startup.
 */
export const timingLines = (spawned: ReadonlyArray<Spawned>, runMs: number) => {
  const byBench = new Map<string, Array<Entry>>();

  for (const s of spawned)
    for (const r of s.reports)
      if (r._tag === "Done") byBench.set(r.id, [...(byBench.get(r.id) ?? []), entryOf(s, r)]);

  const lines = [...byBench.entries()]
    .map(([id, entries]) => lineOf(id, entries))
    .toSorted((a, b) => b.totalMs - a.totalMs);

  return [
    "bench | workers | startup ms | load+proof ms | warm-up ms (runs) | sampling ms (runs) | ms a run | total ms",
    ...lines.map((l) => l.text),
    `shared process startup | ${ms(sharedStartup(spawned))} ms`,
    `processes ${spawned.length}, their wall ${ms(spawned.reduce((t, s) => t + s.wallMs, 0))} ms; run wall ${ms(runMs)} ms`,
  ];
};
