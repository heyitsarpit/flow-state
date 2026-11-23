import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vite-plus/test";
import { alive, pause, planted, runner } from "./limits-support.ts";
import { LIMITS } from "../limits.ts";
import { switchedOn } from "../switches.ts";

// These test the bench runner (its timeouts, caps and signals), not the runtime, and wait on real
// processes, so the usual suite leaves them out: `nub run bench:limits` runs them
// (FLOW_BENCH_LIMITS=true).
describe.skipIf(!switchedOn("FLOW_BENCH_LIMITS"))("bench limits", () => {
  it(
    "a hang and a spinner sharing a worker with healthy benches each time out at their own deadline",
    () => {
      const done = spawnSync(
        process.execPath,
        [runner, "--benches", planted, "--dev", "--only", "turn.planted.*", "--max-time", "60"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: LIMITS.benchChild },
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
    },
    LIMITS.benchTest,
  );

  it(
    "the run's cap kills a bench's whole tree of children",
    () => {
      const done = spawnSync(
        process.execPath,
        [runner, "--benches", planted, "--dev", "--only", "turn.planted.tree", "--max-time", "1"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: LIMITS.benchChild },
      );

      expect(done.status).toBe(3);
      pause(0.5);
      expect(alive("3972.37")).toEqual([]);
    },
    LIMITS.benchTest,
  );
});
