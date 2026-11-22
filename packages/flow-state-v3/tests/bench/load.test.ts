import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";
import { benches } from "../../bench/benches/index.ts";
import { runner } from "./limits-support.ts";
import { LIMITS } from "../limits.ts";

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// A real nub process, started the way `nub run bench` starts the bench. nub resolves imports
// through the package's tsconfig `paths`, which plain node ignores, so only nub shows a module
// that loads under node but not under the bench.
const underNub = (args: ReadonlyArray<string>) =>
  spawnSync("nub", args, {
    cwd: at("../.."),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: LIMITS.benchLoad,
  });

describe("the bench loads the way `nub run bench` loads it", () => {
  it.fails(
    "the bench runner lists its benches",
    () => {
      const done = underNub([runner, "--list"]);
      const ids = new Set(benches.map((b) => b.id));
      const listed = done.stdout.split("\n").filter((l) => l.trim() !== "");

      expect(done.stderr.includes("did not load")).toBe(false);
      expect(done.status).toBe(0);
      expect(listed.length).toBeGreaterThan(0);
      expect(listed.filter((l) => !ids.has(l.split(" ")[0] ?? ""))).toEqual([]);
    },
    2 * LIMITS.benchLoad,
  );

  it.fails(
    "nothing reachable from fixtures/index.ts or bench/benches/index.ts imports the test runner",
    () => {
      const done = underNub([
        at("./load-probe.ts"),
        at("../../fixtures/index.ts"),
        at("../../bench/benches/index.ts"),
      ]);

      expect(done.stdout.split("\n").filter((l) => l !== "")).toEqual([]);
      expect(done.status).toBe(0);
    },
    2 * LIMITS.benchLoad,
  );
});
