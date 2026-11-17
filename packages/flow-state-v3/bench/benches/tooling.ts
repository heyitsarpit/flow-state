import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { Option } from "effect";
import { bench } from "../declare.ts";

const repo = join(import.meta.dirname, "..", "..", "..", "..");

// The longest a tooling run may take before it counts as stuck.
const LIMIT_MS = 30 * 60 * 1000;

const count = (out: string, pattern: RegExp) => Number(pattern.exec(out)?.[1] ?? Number.NaN);

// One run of a workspace script under `/usr/bin/time -l`, which reports its peak resident memory.
const runScript = (script: string) => {
  const start = performance.now();

  const done = spawnSync("/usr/bin/time", ["-l", "nub", "run", script], {
    cwd: repo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: LIMIT_MS,
    maxBuffer: 256 * 1024 * 1024,
  });

  const ms = performance.now() - start;
  const out = `${done.stdout}\n${done.stderr}`;

  return {
    ms,
    out,
    status: done.status ?? -1,
    peakBytes: count(out, /^\s*(\d+)\s+maximum resident set size/mu),
    tests: count(out, /^\s*Tests\s+.*?(\d+)\s+passed/mu),
    failed: count(out, /^\s*Tests\s+.*?(\d+)\s+failed/mu),
  };
};

type Script = "test" | "test:stress" | "faults";

// What a run's output shows: tests run and failed, peak memory, and for the faults run, how many
// of its planted faults were caught.
const countersOf = (script: Script, done: ReturnType<typeof runScript>) => {
  const ran = {
    exit: done.status,
    tests: Number.isNaN(done.tests) ? 0 : done.tests,
    failed: Number.isNaN(done.failed) ? 0 : done.failed,
    peakMiB: Math.round(done.peakBytes / 1024 / 1024),
  };

  const caught = /faults caught: (\d+) of (\d+)/u.exec(done.out);

  if (script !== "faults") {
    if (ran.tests === 0) throw new Error(`${script} ran no tests (exit ${done.status})`);

    return ran;
  }

  if (caught === null) throw new Error("the faults run printed no caught count");

  return { ...ran, caught: Number(caught[1]), planted: Number(caught[2]) };
};

const toolingSubject = async (script: Script) => ({
  op: async () => {
    const done = runScript(script);

    return { units: 1, counters: countersOf(script, done), sample: Option.some(done.ms) };
  },
  proof: async () => Option.none<string>(),
  shape: {},
});

/**
 * Every `tooling` bench: the wall time of the package suite, the stress run and the planted
 * faults, each run once from the workspace root, with tests run, failures, peak memory and, for
 * the faults, how many of the planted faults were caught.
 */
export const toolingBenches = (["test", "test:stress", "faults"] as const).map((script) =>
  bench({
    id: `tooling.${script.replace(":", "-")}.wall-ms`,
    concern: "tooling",
    tags: ["command", script],
    size: { n: 1, unit: "run" },
    headline: ["median"],
    budget: Option.none(),
    workers: 1,
    runs: 1,
    warm: false,
    load: () => toolingSubject(script),
  }),
);
