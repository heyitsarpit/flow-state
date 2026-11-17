import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { describe, expect, it } from "vite-plus/test";
import { alive, pause, planted, runner } from "./limits-support.ts";

describe("bench limits", () => {
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGKILL"] as const)
    it(`${signal} to the run alone kills every worker and everything they started`, async () => {
      const run = spawn(
        process.execPath,
        [runner, "--benches", planted, "--dev", "--only", "turn.held.signal", "--max-time", "60"],
        { stdio: "ignore" },
      );

      for (let n = 0; n < 50 && alive("3973.37").length === 0; n += 1) pause(0.2);

      expect(alive("3973.37").length > 0).toBe(true);
      run.kill(signal);
      await once(run, "exit");

      for (let n = 0; n < 15 && alive("3973.37").length > 0; n += 1) pause(0.2);

      expect(alive("3973.37")).toEqual([]);
      expect(
        spawnSync("pgrep", ["-f", "turn\\.held\\.signal"], { encoding: "utf8" }).stdout.trim(),
      ).toBe("");
    }, 60_000);
});
