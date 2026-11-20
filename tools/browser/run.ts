// Runs the package's browser tests in each installed browser, one after the other, each alone and
// capped at 10 minutes; exits non-zero when either run fails.
//
//   node tools/browser/run.ts [--only chrome|safari] [--plant drop-last-write]
import { spawnSync } from "node:child_process";

// The tests the browser files hold; a run that ran fewer fails (tools/browser/vitest.config.ts).
const EXPECTED = "15";

const args = process.argv.slice(2);
const only = args.includes("--only") ? [args[args.indexOf("--only") + 1] ?? ""] : ["chrome", "safari"];
const plant = args.includes("--plant") ? (args[args.indexOf("--plant") + 1] ?? "") : "";

let failed = false;

for (const browser of only) {
  console.log(`browser run: ${browser}${plant === "" ? "" : `, plant ${plant}`}`);
  const run = spawnSync("node_modules/.bin/vp", ["test", "run", "--config", "tools/browser/vitest.config.ts"], {
    stdio: "inherit",
    timeout: 10 * 60 * 1000,
    killSignal: "SIGINT",
    env: { ...process.env, FLOW_BROWSER: browser, FLOW_BROWSER_EXPECTED: EXPECTED, FLOW_BROWSER_PLANT: plant },
  });
  console.log(`browser run: ${browser} exited ${run.status ?? run.signal}`);
  if (run.status !== 0) failed = true;
}

process.exit(failed ? 1 : 0);
