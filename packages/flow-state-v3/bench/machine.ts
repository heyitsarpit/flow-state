import { spawnSync } from "node:child_process";
import { cpus, loadavg, platform, totalmem, arch } from "node:os";
import { basename } from "node:path";
import { Option } from "effect";

const text = (command: string, args: ReadonlyArray<string>, cwd: string) => {
  const done = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
  });

  return done.status === 0 ? Option.some(done.stdout.trim()) : Option.none<string>();
};

/**
 * A 32-bit FNV-1a hash as eight hex digits: an opaque label that names no user or host.
 */
export const hashOf = (input: string) => {
  const h = { v: 0x811c9dc5 };

  for (let n = 0; n < input.length; n += 1) {
    h.v ^= input.charCodeAt(n);
    h.v = Math.imul(h.v, 0x01000193) >>> 0;
  }

  return h.v.toString(16).padStart(8, "0");
};

const powerOf = (cwd: string) => {
  const out = Option.getOrElse(
    platform() === "darwin" ? text("pmset", ["-g", "batt"], cwd) : Option.none(),
    () => "",
  );

  if (out.includes("'AC Power'")) return "ac" as const;

  if (out.includes("'Battery Power'")) return "battery" as const;

  return "unknown" as const;
};

/**
 * Reads the machine and runtime this process measures on.
 *
 * **Details**
 *
 * `machine` hashes the platform, architecture, CPU model, core count and memory size; it never
 * holds a user or host name. `power` is `ac`, `battery` or `unknown`; `load` the one-minute load
 * average; `flags` the runtime's own flags.
 */
export const environmentOf = (cwd: string) => {
  const cores = cpus();
  const cpu = cores[0]?.model ?? "unknown";
  const bun = process.versions["bun"];

  return {
    runtime: bun === undefined ? ("node" as const) : ("bun" as const),
    version: bun ?? process.versions.node,
    flags: process.execArgv.join(" "),
    machine: `m-${hashOf([platform(), arch(), cpu, cores.length, totalmem()].join("|"))}`,
    cpu,
    cores: cores.length,
    power: powerOf(cwd),
    load: loadavg()[0] ?? 0,
  };
};

/**
 * The commit a working tree is at and whether the package's code differs from it, not counting
 * the bench's own history.
 */
export const commitOf = (cwd: string) => ({
  commit: Option.getOrElse(text("git", ["rev-parse", "--short=8", "HEAD"], cwd), () => "unknown"),
  dirty: Option.match(
    text("git", ["status", "--porcelain", "--", ".", ":(exclude)bench/history"], cwd),
    { onNone: () => true, onSome: (out) => out !== "" },
  ),
});

/**
 * The names of processes a recording may not run beside when they are busy.
 */
const HEAVY = new Set(["node", "bun", "vitest", "tsc", "tsgo", "nub"]);

// The busiest share of one core another heavy process may use while a recording runs.
const BUSY_CPU = 25;

/**
 * Why a recording cannot run now, or none: a one-minute load over half the cores, or
 * another node, bun, vitest, tsc, tsgo or nub process (not this one or its ancestors) over 25% of
 * a core.
 */
export const busyReason = (cwd: string) => {
  const env = environmentOf(cwd);

  if (env.load > env.cores / 2)
    return Option.some(
      `the one-minute load is ${env.load.toFixed(2)}, over half of ${env.cores} cores`,
    );

  const rows = Option.getOrElse(text("ps", ["-Ao", "pid=,ppid=,pcpu=,comm="], cwd), () => "")
    .split("\n")
    .map((line) => /^\s*(\d+)\s+(\d+)\s+([\d.]+)\s+(.*)$/u.exec(line))
    .flatMap((m) =>
      m === null
        ? []
        : [
            {
              pid: Number(m[1]),
              ppid: Number(m[2]),
              cpu: Number(m[3]),
              name: basename(m[4] ?? ""),
            },
          ],
    );

  const parent = new Map(rows.map((r) => [r.pid, r.ppid]));
  const ours = new Set<number>();

  for (let pid = process.pid; pid > 1 && !ours.has(pid); pid = parent.get(pid) ?? 1) ours.add(pid);

  const busy = rows.filter((r) => HEAVY.has(r.name) && !ours.has(r.pid) && r.cpu > BUSY_CPU);

  return busy.length === 0
    ? Option.none<string>()
    : Option.some(
        `other heavy processes are busy: ${busy.map((r) => `${r.name} ${r.pid} at ${r.cpu}%`).join(", ")}`,
      );
};
