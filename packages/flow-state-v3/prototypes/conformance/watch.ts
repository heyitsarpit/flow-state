// Runs one child under an RSS watchdog and a time limit. Every search and mutation goes through this: a mutant reached
// 11.9 GB on this MacBook in round 1. bun watch.ts --rss-mb 1800 --seconds 300 -- bun some.ts args
import { spawn } from "bun";

export type Watched = {
  code: number | null;
  peakMb: number;
  killed: "rss" | "time" | null;
  ms: number;
  stdout: string;
};
const rssMb = (pid: number) => {
  const p = Bun.spawnSync(["ps", "-o", "rss=", "-p", String(pid)]);
  const kb = Number(p.stdout.toString().trim());
  return Number.isFinite(kb) ? kb / 1024 : 0;
};
export const watched = async (
  cmd: readonly string[],
  o: { rssMb: number; seconds: number; capture?: boolean },
): Promise<Watched> => {
  const t0 = Date.now();
  const child = spawn([...cmd], {
    stdout: o.capture ? "pipe" : "inherit",
    stderr: o.capture ? "pipe" : "inherit",
  });
  let peakMb = 0;
  let killed: Watched["killed"] = null;
  let done = false;
  void child.exited.then(() => (done = true));
  while (!done) {
    await Bun.sleep(15);
    if (done) break;
    const mb = rssMb(child.pid);
    peakMb = Math.max(peakMb, mb);
    if (mb > o.rssMb) killed = "rss";
    else if (Date.now() - t0 > o.seconds * 1000) killed = "time";
    if (killed) {
      child.kill(9);
      break;
    }
  }
  const code = await child.exited;
  const stdout = o.capture ? await new Response(child.stdout as ReadableStream).text() : "";
  return { code, peakMb: Math.round(peakMb), killed, ms: Date.now() - t0, stdout };
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
    `\nWATCH peak ${r.peakMb} MB, ${(r.ms / 1000).toFixed(1)} s, exit ${r.code}, killed ${r.killed ?? "no"}`,
  );
  process.exit(r.code ?? 1);
}
