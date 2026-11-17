import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Option } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { benches } from "../../bench/benches/index.ts";
import { bench } from "../../bench/declare.ts";
import { measure, TimedOut } from "../../bench/sample.ts";
import { optionsOf } from "../../bench/options.ts";
import { selectBenches } from "../../bench/select.ts";
import { batchesOf, workerArgs } from "../../bench/workers.ts";
import { planted, runner } from "./limits-support.ts";

// An operation that holds the thread for `ms`, as a slow bench's run does.
const busy = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

describe("bench limits", () => {
  it("a planted slow bench stops at its timeout, timed-out with the samples it took", async () => {
    const slow = bench({
      id: "turn.planted.slow.per-turn-ms",
      concern: "turn",
      tags: [],
      size: { n: 1, unit: "run" },
      budgetMs: 60_000,
      load: async () => ({
        op: async () => {
          busy(20);

          return { units: 1, counters: { runs: 1 }, sample: Option.none() };
        },
        proof: async () => Option.none(),
        shape: async () => ({}),
      }),
    });

    const subject = await slow.load();

    const settings = {
      runs: Option.none(),
      budgetMs: Option.none(),
      warmCap: 3,
      warmMs: 1000,
      timeoutMs: 300,
    };

    const outcome = await measure(slow, subject, settings).then(
      () => "finished",
      (fault: unknown) => fault,
    );

    expect(outcome instanceof TimedOut).toBe(true);
    expect(outcome instanceof TimedOut && outcome.samples.length > 0).toBe(true);
  });

  it("a run that reaches its --max-time cap stops its workers and exits 3, naming what did not run", () => {
    const done = spawnSync(
      process.execPath,
      [runner, "turn", "--only", "turn.session.long", "--max-time", "1"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 },
    );

    expect(done.status).toBe(3);
    expect(done.stderr.includes("not run: the run reached its --max-time cap")).toBe(true);
    expect(done.stderr.includes("stopped at the --max-time cap of 1 s")).toBe(true);
  }, 60_000);

  it("--max-n keeps only series points at or under it, and the dev tier keeps each series' smallest", () => {
    const picked = (maxN: Option.Option<number>, tier: "full" | "dev") =>
      selectBenches(benches, { tier, concerns: ["scale"], only: Option.none(), maxN });

    const small = picked(Option.some(100), "full");

    expect(small.length > 0).toBe(true);
    expect(small.every((b) => Option.isNone(b.series) || b.size.n <= 100)).toBe(true);

    const dev = picked(Option.none(), "dev");
    const smallest = new Map<string, number>();

    for (const b of benches)
      for (const s of Option.toArray(b.series))
        smallest.set(s.name, Math.min(smallest.get(s.name) ?? Number.POSITIVE_INFINITY, b.size.n));

    expect(
      dev.every((b) =>
        Option.match(b.series, {
          onNone: () => true,
          onSome: (s) => smallest.get(s.name) === b.size.n,
        }),
      ),
    ).toBe(true);
    expect(new Set(dev.flatMap((b) => Option.toArray(b.series).map((s) => s.name))).size).toBe(
      smallest.size,
    );
  });

  for (const flag of [
    ["--record", "--history", "history"],
    ["--compare", "HEAD", "--dev"],
  ])
    it(`a planted list with ${flag[0] ?? ""} is refused, and nothing is written`, () => {
      const scratch = mkdtempSync(join(tmpdir(), "bench-planted-"));
      const args = flag.map((a) => (a === "history" ? scratch : a));

      const done = spawnSync(
        process.execPath,
        [runner, "--benches", planted, "--only", "turn.planted.first", ...args],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000 },
      );

      const written = readdirSync(scratch);
      rmSync(scratch, { recursive: true, force: true });

      expect(done.status).toBe(1);
      expect(done.stderr.includes("--benches")).toBe(true);
      expect(written).toEqual([]);
    });

  it("a worker for another commit's package runs that package's own benches", () => {
    const other = join(tmpdir(), "bench-other", "packages", "flow-state-v3");
    const [batch] = batchesOf(optionsOf(["--dev"]), benches.slice(0, 1));

    const args = workerArgs(
      other,
      ["x"],
      batch ?? { benches: [], workers: 1 },
      optionsOf(["--dev"]),
    );

    const paths = args.filter((a) => a.includes("/"));

    expect(paths.length > 0).toBe(true);
    expect(paths.every((a) => a.startsWith(other))).toBe(true);
  });
});
