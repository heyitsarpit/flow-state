import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";
import { planted } from "./limits-support.ts";

const worker = fileURLToPath(new URL("../../bench/worker.ts", import.meta.url));

// A healthy planted bench, on a budget small enough to finish at once.
const runWorker = (args: ReadonlyArray<string>) =>
  spawnSync(
    process.execPath,
    [worker, "turn.planted.first.per-turn-ms", "--benches", planted, ...args],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 10_000 },
  );

const SMALL = ["--runs", "1", "--budget", "1", "--warm-ms", "1", "--timeout-ms", "2000"];

describe("the bench worker's arguments", () => {
  it("control: the arguments the run writes run the bench and exit 0", () => {
    const done = runWorker(SMALL);

    expect(done.status).toBe(0);
    expect(done.stdout).toContain('"_tag":"Done"');
  });

  for (const flag of ["--runs", "--timeout-ms", "--run"])
    it.fails(`${flag} abc, not a finite number, is refused at once, naming the flag`, () => {
      const done = runWorker([
        ...SMALL.filter((a, n, all) => a !== flag && all[n - 1] !== flag),
        flag,
        "abc",
      ]);

      expect(done.status).not.toBeNull();
      expect(done.status).not.toBe(0);
      expect(done.stderr).toContain(flag);
    });

  it.fails("a flag the worker does not know is refused at once, so a renamed flag is never dropped", () => {
    const done = runWorker([...SMALL, "--timeout", "5"]);

    expect(done.status).not.toBeNull();
    expect(done.status).not.toBe(0);
    expect(done.stderr).toContain("--timeout");
  });
});
