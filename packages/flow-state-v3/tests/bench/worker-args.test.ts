import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";
import { planted } from "./limits-support.ts";

const worker = fileURLToPath(new URL("../../bench/worker.ts", import.meta.url));

// The worker's arguments, as the run writes them, read the way the worker reads them.
const runWorker = (args: ReadonlyArray<string>) =>
  spawnSync(process.execPath, [worker, "turn.planted.none", "--benches", planted, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60_000,
  });

describe("the bench worker's arguments", () => {
  // Inverted: the worker reads `--runs abc` as NaN runs and goes on.
  it.fails("a number flag whose value is not a finite number is refused, naming the flag", () => {
    const done = runWorker(["--runs", "abc"]);

    expect(done.status).not.toBe(0);
    expect(done.stderr).toContain("runs");
  });

  // Inverted: the worker skips a flag it does not know and reads its value as a bench id.
  it.fails("a flag the worker does not know is refused, so a renamed flag is never dropped", () => {
    const done = runWorker(["--timeout", "5"]);

    expect(done.status).not.toBe(0);
    expect(done.stderr).toContain("timeout");
  });
});
