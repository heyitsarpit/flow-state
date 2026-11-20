// Runs the package's browser tests in each installed browser, one after the other, each alone and
// capped at 10 minutes; exits non-zero when either run fails. A signal this runner receives is
// passed to the browser run as SIGINT, so its provider ends the browsers it started.
//
//   node tools/browser/run.ts [--only chrome|safari] [--plant drop-last-write] [-- <vitest args>]
import { spawn } from "node:child_process";

// The tests the browser files hold; a run that ran fewer fails (tools/browser/vitest.config.ts).
const EXPECTED = "15";
const CAP_MS = 10 * 60 * 1000;

const args = process.argv.slice(2);
const only = args.includes("--only") ? [args[args.indexOf("--only") + 1] ?? ""] : ["chrome", "safari"];
const plant = args.includes("--plant") ? (args[args.indexOf("--plant") + 1] ?? "") : "";
const passed = args.includes("--") ? args.slice(args.indexOf("--") + 1) : [];

const runIn = (browser: string) =>
  new Promise<number>((resolve) => {
    console.log(`browser run: ${browser}${plant === "" ? "" : `, plant ${plant}`}`);
    // Its own process group, so a stop reaches Vitest's own process, where the provider listens.
    const child = spawn("node_modules/.bin/vp", ["test", "run", "--config", "tools/browser/vitest.config.ts", ...passed], {
      stdio: "inherit",
      detached: true,
      env: { ...process.env, FLOW_BROWSER: browser, FLOW_BROWSER_EXPECTED: EXPECTED, FLOW_BROWSER_PLANT: plant },
    });
    const stop = () => {
      if (child.pid !== undefined) process.kill(-child.pid, "SIGINT");
    };
    const cap = setTimeout(() => {
      console.error(`browser run: ${browser} passed its 10-minute cap`);
      stop();
    }, CAP_MS);

    for (const signal of ["SIGINT", "SIGTERM", "SIGALRM", "SIGHUP"] as const) process.on(signal, stop);

    child.on("exit", (code, signal) => {
      clearTimeout(cap);
      for (const s of ["SIGINT", "SIGTERM", "SIGALRM", "SIGHUP"] as const) process.off(s, stop);
      console.log(`browser run: ${browser} exited ${code ?? signal}`);
      resolve(code ?? 1);
    });
  });

let failed = false;

for (const browser of only) if ((await runIn(browser)) !== 0) failed = true;

process.exit(failed ? 1 : 0);
