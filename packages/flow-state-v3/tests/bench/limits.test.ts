import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { Option } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { benches } from "../../bench/benches/index.ts";
import { bench } from "../../bench/declare.ts";
import { measure, TimedOut } from "../../bench/sample.ts";
import { selectBenches } from "../../bench/select.ts";

const runner = fileURLToPath(new URL("../../bench/run.ts", import.meta.url));
const planted = fileURLToPath(new URL("./planted.ts", import.meta.url));

// The processes still running whose command line holds a marker.
const alive = (marker: string) =>
  spawnSync("pgrep", ["-f", `sleep ${marker.replaceAll(".", "\\.")}`], { encoding: "utf8" })
    .stdout.split("\n")
    .filter((l) => l.trim() !== "");

const pause = (seconds: number) => spawnSync("sleep", [String(seconds)]);

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

  it("a hang and a spinner sharing a worker with healthy benches each time out at their own deadline", () => {
    const done = spawnSync(
      process.execPath,
      [runner, "--benches", planted, "--dev", "--only", "turn.planted.*", "--max-time", "60"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000 },
    );

    const out = `${done.stdout}${done.stderr}`;

    expect(done.status).toBe(1);
    expect(out.includes("turn.planted.hang.per-turn-ms: timed-out")).toBe(true);
    expect(out.includes("turn.planted.spin.per-turn-ms: timed-out")).toBe(true);
    expect(out.includes("turn.planted.tree.per-turn-ms: timed-out")).toBe(true);
    expect(/^turn\.planted\.last\.per-turn-ms\s+\d/mu.test(done.stdout)).toBe(true);
    expect(out.includes("not run")).toBe(false);
    expect(alive("3971.37")).toEqual([]);
    expect(alive("3972.37")).toEqual([]);
  }, 60_000);

  it("a signal to the run kills every worker and everything they started", async () => {
    const run = spawn(
      process.execPath,
      [runner, "--benches", planted, "--dev", "--only", "turn.held.signal", "--max-time", "60"],
      { stdio: "ignore" },
    );

    for (let n = 0; n < 50 && alive("3973.37").length === 0; n += 1) pause(0.2);

    expect(alive("3973.37").length > 0).toBe(true);
    run.kill("SIGTERM");
    await once(run, "exit");
    pause(0.5);

    expect(alive("3973.37")).toEqual([]);
    expect(
      spawnSync("pgrep", ["-f", "turn\\.held\\.signal"], { encoding: "utf8" }).stdout.trim(),
    ).toBe("");
  }, 60_000);

  it("the run's cap kills a bench's whole tree of children", () => {
    const done = spawnSync(
      process.execPath,
      [runner, "--benches", planted, "--dev", "--only", "turn.planted.tree", "--max-time", "1"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000 },
    );

    expect(done.status).toBe(3);
    pause(0.5);
    expect(alive("3972.37")).toEqual([]);
  }, 60_000);
});
