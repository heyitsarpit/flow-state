// Runs one child under an RSS watchdog and a time limit. Every search and mutation goes through this: a mutant reached
// 11.9 GB on this MacBook in round 1. bun watch.ts --rss-mb 1800 --seconds 300 -- bun some.ts args
import { spawn } from "bun";

export type Watched = {
  code: number | null;
  peakMb: number; // D129: the whole tree's RSS at its largest, not the first process's
  killed: "rss" | "time" | null;
  ms: number;
  stdout: string;
  leftovers: number; // descendants still alive when the child ended, and ended here
};
type Proc = { pid: number; ppid: number; pgid: number; rssKb: number; started: string };
// One read of the whole table. `lstart` tells a pid apart from a later one that reuses its number.
const table = (): Proc[] => {
  const p = Bun.spawnSync(["ps", "-Ao", "pid=,ppid=,pgid=,rss=,lstart="]);
  const out: Proc[] = [];
  for (const l of p.stdout.toString().split("\n")) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(l);
    if (m) out.push({ pid: Number(m[1]), ppid: Number(m[2]), pgid: Number(m[3]), rssKb: Number(m[4]), started: m[5]! });
  }
  return out;
};
const self = process.pid;
const treeOf = (root: number, procs: readonly Proc[], seen: ReadonlyMap<number, string>): Proc[] => {
  const kids = new Map<number, Proc[]>();
  for (const p of procs) {
    const l = kids.get(p.ppid);
    if (l) l.push(p);
    else kids.set(p.ppid, [p]);
  }
  const out = new Map<number, Proc>();
  const walk = (p: Proc) => {
    if (out.has(p.pid)) return;
    out.set(p.pid, p);
    for (const k of kids.get(p.pid) ?? []) walk(k);
  };
  // The root, whoever shares its group, whoever we saw before and has since been left with PID 1, and all under them.
  for (const p of procs) if (p.pid !== self && (p.pid === root || p.pgid === root || seen.get(p.pid) === p.started)) walk(p);
  return [...out.values()];
};
export const watched = async (
  cmd: readonly string[],
  o: { rssMb: number; seconds: number; capture?: boolean; env?: Record<string, string>; cwd?: string },
): Promise<Watched> => {
  const t0 = Date.now();
  const child = spawn([...cmd], {
    stdin: "ignore",
    stdout: o.capture ? "pipe" : "inherit",
    stderr: o.capture ? "pipe" : "inherit",
    ...(o.env ? { env: { ...process.env, ...o.env } } : {}),
    ...(o.cwd ? { cwd: o.cwd } : {}),
    detached: true, // D129: a process group of its own, so a kill can reach what it spawned
  });
  let peakMb = 0;
  let killed: Watched["killed"] = null;
  let done = false;
  const seen = new Map<number, string>();
  void child.exited.then(() => (done = true));
  // Everything ever seen, and the group. By `lstart`, so a reused pid is left alone.
  const endTree = () => {
    const procs = treeOf(child.pid, table(), seen);
    for (const p of procs) {
      try {
        process.kill(p.pid, 9);
      } catch {}
    }
    try {
      process.kill(-child.pid, 9);
    } catch {}
    return procs;
  };
  const stdoutText = o.capture ? new Response(child.stdout as ReadableStream).text() : Promise.resolve("");
  // A read of the table takes a few ms; a poll every 40 ms keeps that from being the load.
  while (!done) {
    await Bun.sleep(40);
    if (done) break;
    const tree = treeOf(child.pid, table(), seen);
    for (const p of tree) seen.set(p.pid, p.started);
    const mb = tree.reduce((n, p) => n + p.rssKb, 0) / 1024;
    peakMb = Math.max(peakMb, mb);
    if (mb > o.rssMb) killed = "rss";
    else if (Date.now() - t0 > o.seconds * 1000) killed = "time";
    if (killed) {
      endTree();
      break;
    }
  }
  const code = await child.exited;
  const left = killed ? [] : endTree();
  const stdout = await stdoutText;
  return { code, peakMb: Math.round(peakMb), killed, ms: Date.now() - t0, stdout, leftovers: left.length };
};

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const sep = argv.indexOf("--");
  const arg = (k: string, d: string) => {
    const i = argv.indexOf(k);
    return i < 0 || i > sep ? d : argv[i + 1]!;
  };
  const r = await watched(argv.slice(sep + 1), {
    rssMb: Number(arg("--rss-mb", "1800")),
    seconds: Number(arg("--seconds", "300")),
  });
  console.log(
    `\nWATCH peak ${r.peakMb} MB, ${(r.ms / 1000).toFixed(1)} s, exit ${r.code}, killed ${r.killed ?? "no"}, leftovers ${r.leftovers}`,
  );
  process.exit(r.code ?? 1);
}
