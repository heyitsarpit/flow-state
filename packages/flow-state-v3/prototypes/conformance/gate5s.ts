// The second pass: the suite at the runtime's own default interval, with no bound named. A flush happens before a disk read and before a storage fault, since those cases mean "after the
// write". A kill gets no flush: what that loses is the point. gate-5s-expected.txt names what may fail, with its reason. bun conformance/gate5s.ts --runtime ../round-7/adapter.ts
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const i = process.argv.indexOf("--runtime");
const runtime = process.argv[i + 1] ?? "../round-8/adapter.ts";
const p = Bun.spawnSync(["bun", join(import.meta.dir, "main.ts"), "--round", "8", "--no-catalog", "--runtime", runtime], {
  env: { ...process.env, FLOW_RUNTIME_DEFAULT: "1", FLOW_TEST_FLUSH: "reads,faults" },
});
const out = p.stdout.toString();
if (!out.includes("SUMMARY")) {
  console.log(`GATE-5S could not run: ${p.stderr.toString().slice(0, 400)}`);
  process.exit(2);
}
const failed = new Map(
  out
    .split("\n")
    .map((l) => /^FAIL\s+(\S+)\s+(.*)$/.exec(l))
    .filter((m) => m !== null)
    .map((m) => [m[1]!, m[2]!] as const),
);
// Round 8: the review's worry about a free-text allow list. A listed case must still fail as it was read to fail.
const allowed = new Map(
  readFileSync(resolve(import.meta.dir, "gate-5s-expected.txt"), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const c = l.split(" | ");
      return [c[0]!, c.at(-1)!] as const;
    }),
);
const unexpected = [...failed.keys()].filter((x) => !allowed.has(x));
const differently = [...failed].filter(([k, why]) => allowed.has(k) && !why.startsWith(allowed.get(k)!)).map(([k]) => k);
const passedNow = [...allowed.keys()].filter((x) => !failed.has(x));
console.log(`GATE-5S  ${failed.size} failed, ${allowed.size} expected; unexpected: ${unexpected.join(" ") || "none"}; failing differently: ${differently.join(" ") || "none"}; expected but passed: ${passedNow.join(" ") || "none"}`);
process.exit(unexpected.length || differently.length ? 1 : 0);
