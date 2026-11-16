// The faults runner's verdicts on canned test output: a fault counts as caught only when a test
// failed, never on a failing exit whose summary shows no failed test.
//
//   node --experimental-strip-types tools/faults/verdict.test.ts
import assert from "node:assert/strict";
import { verdictOf } from "./verdict.ts";

const out = (tests: string, files: string) => ` Test Files  ${files}\n      Tests  ${tests}\n`;

assert.equal(
  verdictOf({ kind: "ran", passed: false, out: out("1 failed | 12 passed (13)", "1 failed | 3 passed (4)") }),
  "caught (1 failed | 12 passed (13); test files 1 failed | 3 passed (4))",
);
assert.equal(verdictOf({ kind: "ran", passed: true, out: out("13 passed (13)", "4 passed (4)") }), "MISSED");
assert.equal(
  verdictOf({ kind: "ran", passed: false, out: out("10 passed (10)", "1 failed | 3 passed (4)") }),
  "NOT JUDGED (no failed test)",
);
assert.equal(verdictOf({ kind: "ran", passed: false, out: "Error: boom\n" }), "NOT JUDGED (no test summary)");
assert.equal(verdictOf({ kind: "broken", why: "timed out after 240000 ms" }), "NOT JUDGED (timed out after 240000 ms)");

console.log("verdict: 5 of 5");
