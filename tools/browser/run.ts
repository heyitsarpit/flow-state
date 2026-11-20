// Runs the package's browser tests in each installed browser, one after the other, each alone and
// capped at 10 minutes; exits non-zero when either run fails. A signal this runner receives is
// passed to the browser run as SIGINT, so its provider ends the browsers it started, and no later
// browser runs. At the cap the run gets SIGINT, then, if it is still there after a grace, every
// process of it is killed by exact pid: the Vitest tree this runner spawned, found from its pid,
// and each browser process the provider noted in this run's pid file.
//
// Chrome runs headless and every test is required. Safari's two hide cases are display-bound: a
// page that starts hidden (the display asleep or locked) skips them as such, and the other cases
// are still required. `--attended`, or FLOW_BROWSER_ATTENDED=1, makes the hide cases required in
// Safari too, so a hidden start fails; a phase close and an attended session run with it.
//
//   node tools/browser/run.ts [--only chrome|safari] [--attended] [--plant drop-last-write] [-- <vitest args>]
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as wait } from "node:timers/promises";

// The tests the browser files hold, and the hide cases among them a hidden start may skip; a run
// that ran fewer than it requires fails (tools/browser/vitest.config.ts).
const TOTAL = 16;
const DISPLAY_BOUND = 2;
const CAP_MS = 10 * 60 * 1000;
const GRACE_MS = 15 * 1000;
const SIGNALS = ["SIGINT", "SIGTERM", "SIGALRM", "SIGHUP"] as const;

const args = process.argv.slice(2);
const only = args.includes("--only") ? [args[args.indexOf("--only") + 1] ?? ""] : ["chrome", "safari"];
const plant = args.includes("--plant") ? (args[args.indexOf("--plant") + 1] ?? "") : "";
const attended = args.includes("--attended") || process.env["FLOW_BROWSER_ATTENDED"] === "1";
const passed = args.includes("--") ? args.slice(args.indexOf("--") + 1) : [];

// Every process of this machine: pid, parent pid and command line.
const processes = () =>
  execFileSync("/bin/ps", ["-axo", "pid=,ppid=,command="], { encoding: "utf8" })
    .split("\n")
    .flatMap((line) => {
      const match = /^\s*(\d+)\s+(\d+)\s+(.*)$/u.exec(line);

      return match === null ? [] : [{ pid: Number(match[1]), ppid: Number(match[2]), command: match[3] ?? "" }];
    });

// The child and every process under it, by exact pid.
const treeOf = (root: number) => {
  const all = processes();
  const found = new Set([root]);

  for (let grew = true; grew; ) {
    grew = false;
    for (const p of all)
      if (found.has(p.ppid) && !found.has(p.pid)) {
        found.add(p.pid);
        grew = true;
      }
  }

  return all.filter((p) => found.has(p.pid));
};

// The browser processes the provider noted, each still running under the same command line, so a
// reused pid is never killed.
const notedIn = (file: string) => {
  if (!existsSync(file)) return [];
  const noted = readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as { readonly pid: number; readonly command: string });
  const all = processes();

  return noted.filter((n) => all.some((p) => p.pid === n.pid && p.command === n.command));
};

const killHard = (child: ChildProcess, pids: string) => {
  const targets = [...(child.pid === undefined ? [] : treeOf(child.pid)), ...notedIn(pids)];

  for (const { pid, command } of targets) {
    console.error(`browser run: killing pid ${pid} (${command.slice(0, 80)})`);
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Gone between the listing and the kill.
    }
  }
};

let stopped = false;

const runIn = (browser: string) =>
  new Promise<number>((resolve) => {
    const required = browser === "safari" && !attended ? TOTAL - DISPLAY_BOUND : TOTAL;
    const ownsDisplay = browser !== "safari" || attended;
    console.log(
      `browser run: ${browser}${plant === "" ? "" : `, plant ${plant}`}, ${ownsDisplay ? "every case required" : `${DISPLAY_BOUND} hide cases display-bound`}`,
    );
    const dir = mkdtempSync(join(tmpdir(), "flow-browser-run-"));
    const pids = join(dir, "pids");
    const child = spawn("node_modules/.bin/vp", ["test", "run", "--config", "tools/browser/vitest.config.ts", ...passed], {
      stdio: "inherit",
      env: {
        ...process.env,
        FLOW_BROWSER: browser,
        FLOW_BROWSER_EXPECTED: String(required),
        FLOW_BROWSER_ATTENDED: ownsDisplay ? "1" : "0",
        FLOW_BROWSER_PLANT: plant,
        FLOW_BROWSER_PIDS: pids,
      },
    });
    let hard: NodeJS.Timeout | undefined;

    // SIGINT to each process of the Vitest tree, by exact pid, so it reaches Vitest's own process,
    // where the provider listens; past the grace, the hard kill.
    const stop = () => {
      if (hard !== undefined) return;
      for (const { pid } of child.pid === undefined ? [] : treeOf(child.pid))
        try {
          process.kill(pid, "SIGINT");
        } catch {
          // Gone between the listing and the signal.
        }
      hard = setTimeout(() => killHard(child, pids), GRACE_MS);
    };
    const signalled = () => {
      stopped = true;
      stop();
    };
    const cap = setTimeout(() => {
      console.error(`browser run: ${browser} passed its 10-minute cap`);
      stop();
    }, CAP_MS);

    for (const signal of SIGNALS) process.on(signal, signalled);

    child.on("exit", (code, signal) => {
      clearTimeout(cap);
      for (const s of SIGNALS) process.off(s, signalled);
      console.log(`browser run: ${browser} exited ${code ?? signal}`);
      // The browsers the provider noted must be gone with it; any left is killed by exact pid.
      void wait(hard === undefined ? 0 : 1000).then(() => {
        if (hard !== undefined) clearTimeout(hard);
        for (const left of notedIn(pids)) {
          console.error(`browser run: ${left.pid} outlived the run; killing it`);
          process.kill(left.pid, "SIGKILL");
        }
        rmSync(dir, { recursive: true, force: true });
        resolve(code ?? 1);
      });
    });
  });

let failed = false;

for (const browser of only) {
  if (stopped) break;
  if ((await runIn(browser)) !== 0) failed = true;
}

process.exit(failed || stopped ? 1 : 0);
