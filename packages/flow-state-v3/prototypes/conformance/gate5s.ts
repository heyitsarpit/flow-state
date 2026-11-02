// The second pass: the suite at the runtime's own default interval, with no bound named. A flush happens before a disk read and before a storage fault, since those cases mean "after the
// write". A kill gets no flush: what that loses is the point. gate-5s-expected.txt names what may fail, with its reason. bun conformance/gate5s.ts --runtime ../round-7/adapter.ts
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const i = process.argv.indexOf("--runtime");
const runtime = process.argv[i + 1] ?? "../round-7/adapter.ts";
const p = Bun.spawnSync(["bun", join(import.meta.dir, "main.ts"), "--round", "7", "--runtime", runtime], {
  env: { ...process.env, FLOW_RUNTIME_DEFAULT: "1", FLOW_TEST_FLUSH: "reads,faults" },
});
const out = p.stdout.toString();
if (!out.includes("SUMMARY")) {
  console.log(`GATE-5S could not run: ${p.stderr.toString().slice(0, 400)}`);
  process.exit(2);
}
const failed = new Set(out.split("\n").filter((l) => l.startsWith("FAIL")).map((l) => l.split(/\s+/)[1]!));
const allowed = new Set(
  readFileSync(resolve(import.meta.dir, "gate-5s-expected.txt"), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split(" | ")[0]!),
);
const unexpected = [...failed].filter((x) => !allowed.has(x));
const passedNow = [...allowed].filter((x) => !failed.has(x));
console.log(`GATE-5S  ${failed.size} failed, ${allowed.size} expected; unexpected: ${unexpected.join(" ") || "none"}; expected but passed: ${passedNow.join(" ") || "none"}`);
process.exit(unexpected.length ? 1 : 0);
