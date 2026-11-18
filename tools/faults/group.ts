// Runs the faults runner's test commands so that none outlives the run: each command starts its own
// process group, and the whole group, the command and every process it started, is killed when its
// time is up, when it ends, and when the run is stopped. Killing the command alone would orphan
// vitest and its workers.
import { spawn, spawnSync } from "node:child_process";

export type Ended = {
  readonly timedOut: boolean;
  readonly overflow: boolean;
  readonly code: number | null;
  readonly out: string;
};

const live = new Set<number>();

const killGroup = (pid: number) => {
  if (pid > 0) spawnSync("kill", ["-KILL", `-${String(pid)}`], { stdio: "ignore" });
};

export const runGrouped = (
  command: string,
  args: ReadonlyArray<string>,
  options: { readonly cwd: string; readonly env: NodeJS.ProcessEnv; readonly timeoutMs: number; readonly maxBuffer: number },
) =>
  new Promise<Ended>((done) => {
    const child = spawn(command, [...args], { cwd: options.cwd, env: options.env, stdio: ["ignore", "pipe", "pipe"], detached: true });
    const pid = child.pid ?? 0;
    const chunks: Array<string> = [];
    const ending = { timedOut: false, overflow: false, size: 0 };

    live.add(pid);

    const take = (chunk: unknown) => {
      const text = String(chunk);

      ending.size += text.length;
      chunks.push(text);

      if (ending.size > options.maxBuffer) {
        ending.overflow = true;
        killGroup(pid);
      }
    };

    child.stdout.on("data", take);
    child.stderr.on("data", take);

    const timer = setTimeout(() => {
      ending.timedOut = true;
      killGroup(pid);
    }, options.timeoutMs);

    // A command that has exited may leave processes holding its output open: kill them at once.
    child.on("exit", () => killGroup(pid));
    child.on("close", (code) => {
      clearTimeout(timer);
      killGroup(pid);
      live.delete(pid);
      done({ timedOut: ending.timedOut, overflow: ending.overflow, code, out: chunks.join("") });
    });
  });

// Kills every command still running, with all it started.
export const stopAll = () => {
  for (const pid of live) killGroup(pid);
};

// On SIGINT, SIGTERM or SIGHUP: stops every command, runs `cleanUp`, and exits 130.
export const stopOnSignals = (cleanUp: () => void) => {
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const)
    process.on(signal, () => {
      stopAll();
      cleanUp();
      process.exit(130);
    });
};
