// Runs one command under the watchdog (verdicts/spawn.ts), for a person: bun watch.ts --rss-mb 1800 --seconds 300 -- bun some.ts args
// Its streams are copied to this process's stderr as they come; the last line says how it ended. Gates read runs through verdicts/, not this.
import { spawnRun } from "./verdicts/spawn.ts";

const argv = process.argv.slice(2);
const sep = argv.indexOf("--");
const arg = (k: string, d: string) => {
  const i = argv.indexOf(k);
  return i < 0 || i > sep ? d : argv[i + 1]!;
};
const mb = Number(arg("--rss-mb", "1800"));
const r = await spawnRun(
  { gate: "watch", cmd: argv.slice(sep + 1), cwd: process.cwd(), env: {}, limits: { mb, seconds: Number(arg("--seconds", "300")) }, contract: "program", run: "watch", referenceMb: null, pool: { slots: 1, mb }, alone: false },
  { echo: "same", stop: new AbortController().signal },
);
if (r.kind === "unstarted") {
  console.log(`\nWATCH could not start: ${r.message}`);
  process.exit(1);
}
console.log(`\nWATCH peak ${r.peakMb} MB, ${(r.ms / 1000).toFixed(1)} s, exit ${r.exit ?? r.signal}, killed ${r.killed ? r.decided : "no"}, leftovers ${r.leftovers}`);
process.exit(r.exit ?? 1);
