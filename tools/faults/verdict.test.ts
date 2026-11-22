// The faults runner's verdicts on canned test output: a fault counts as caught only when a test
// failed, never on a failing exit whose summary shows no failed test.
//
//   node --experimental-strip-types tools/faults/verdict.test.ts
import assert from "node:assert/strict";
import { applyEdits, credited, failedTestsOf, judge, parseArgs, verdictOf } from "./verdict.ts";
import type { Run } from "./verdict.ts";

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
assert.equal(
  verdictOf({
    kind: "ran",
    passed: false,
    out: ` FAIL  tests/a.test.ts > a > breaks\n${out("7 passed (47)", "1 passed (55)")}`,
  }),
  "caught (7 passed (47); test files 1 passed (55))",
);
assert.equal(
  verdictOf({
    kind: "ran",
    passed: false,
    out: ` FAIL  tests/a.test.ts [ tests/a.test.ts ]\nError: Transform failed\n${out("10 passed (10)", "1 failed (4)")}`,
  }),
  "NOT JUDGED (no failed test)",
);
assert.equal(verdictOf({ kind: "ran", passed: false, out: "Error: boom\n" }), "NOT JUDGED (no test summary)");
assert.equal(verdictOf({ kind: "broken", why: "timed out after 240000 ms" }), "NOT JUDGED (timed out after 240000 ms)");

assert.deepEqual(
  failedTestsOf(" FAIL  tests/a.test.ts > a > breaks\n FAIL  tests/a.test.ts [ tests/a.test.ts ]\n FAIL  tests/a.test.ts > a > breaks \n"),
  ["tests/a.test.ts > a > breaks"],
);

console.log("verdict: 8 of 8");

// Two edits of one file both land; a find missing from the text the first edit left is stale.
assert.equal(
  applyEdits("import a;\nuse(a);\n", [
    { find: "use(a);", replace: "use(b);" },
    { find: "import a;", replace: "import a, b;" },
  ]),
  "import a, b;\nuse(b);\n",
);
assert.equal(applyEdits("x;\n", [{ find: "x;", replace: "y;" }, { find: "x;", replace: "z;" }]), undefined);

// Arguments: `--only` (repeatable) plants the named faults in order; `--background` is a flag of
// its own; anything else is refused.
const named = [{ name: "a" }, { name: "b" }, { name: "c" }];
assert.deepEqual(parseArgs(named, []), { faults: named, only: false, background: false });
assert.deepEqual(parseArgs(named, ["--only", "c", "a"]), { faults: [{ name: "c" }, { name: "a" }], only: true, background: false });
assert.deepEqual(parseArgs(named, ["--only", "a", "--only", "b"]), { faults: [{ name: "a" }, { name: "b" }], only: true, background: false });
assert.deepEqual(parseArgs(named, ["--only", "b", "--background"]), { faults: [{ name: "b" }], only: true, background: true });
assert.deepEqual(parseArgs(named, ["--background"]), { faults: named, only: false, background: true });
assert.deepEqual(parseArgs(named, ["--only", "a", "typo"]), { refused: "no fault named typo" });
assert.deepEqual(parseArgs(named, ["--only"]), { refused: "--only names no fault" });
assert.deepEqual(parseArgs(named, ["--only", "--only", "a"]), { refused: "--only names no fault" });
assert.deepEqual(parseArgs(named, ["--only=a"]), { refused: "unknown flag --only=a" });
assert.deepEqual(parseArgs(named, ["--bail"]), { refused: "unknown flag --bail" });
assert.deepEqual(parseArgs(named, ["a"]), { refused: "a is not after --only" });
assert.deepEqual(parseArgs(named, ["--background", "a"]), { refused: "a is not after --only" });
assert.deepEqual(parseArgs(named, ["--only", "a", "a"]), { refused: "a named twice" });
assert.deepEqual(parseArgs(named, ["--only", "a", "--only", "a"]), { refused: "a named twice" });

// Judging: a test already red in the unchanged run is never a fault's catch.
const red = new Set(["tests/x.test.ts > bindings > red before any fault"]);
assert.deepEqual(credited("caught (1 failed (9))", ["tests/x.test.ts > bindings > red before any fault"], red), {
  verdict: "MISSED (only tests red in the unchanged run failed)",
  tests: [],
});
assert.deepEqual(credited("caught (2 failed (9))", ["tests/y.test.ts > b", "tests/x.test.ts > bindings > red before any fault"], red), {
  verdict: "caught (2 failed (9))",
  tests: ["tests/y.test.ts > b"],
});
// A fault is judged by its target files alone: a fault they let through is MISSED, and no other
// file runs, so a wrong target shows as a miss and is re-aimed, never widened to the whole suite.
const asked: Array<{ readonly files: ReadonlyArray<string>; readonly flags: ReadonlyArray<string> }> = [];
const runs = (...results: ReadonlyArray<Run>) => {
  const queue = [...results];

  return (files: ReadonlyArray<string>, flags: ReadonlyArray<string>) => {
    asked.push({ files, flags });

    return Promise.resolve(queue.shift() ?? { kind: "broken", why: "asked for a run too many" });
  };
};
const targets = { files: ["tests/a.test.ts"], pkg: "pkg", knownRed: new Set<string>(), everyCatch: false };

assert.deepEqual(await judge(targets, runs({ kind: "ran", passed: true, out: out("3 passed (3)", "1 passed (1)") })), {
  verdict: "MISSED",
  tests: [],
});
assert.deepEqual(asked.splice(0), [{ files: ["tests/a.test.ts"], flags: ["--bail=1"] }]);
// A stopped run that lost its failed test's report runs the same targets again, whole.
assert.deepEqual(
  await judge(
    targets,
    runs(
      { kind: "ran", passed: false, out: out("3 passed (3)", "1 failed (1)") },
      { kind: "ran", passed: false, out: ` FAIL  pkg/tests/a.test.ts > a > breaks\n${out("1 failed | 2 passed (3)", "1 failed (1)")}` },
    ),
  ),
  { verdict: "caught (1 failed | 2 passed (3); test files 1 failed (1))", tests: ["pkg/tests/a.test.ts > a > breaks"] },
);
assert.deepEqual(asked.splice(0), [
  { files: ["tests/a.test.ts"], flags: ["--bail=1"] },
  { files: ["tests/a.test.ts"], flags: [] },
]);
// A target holding a test red in the unchanged run runs to the end, and that test is never the catch.
await judge({ ...targets, knownRed: new Set(["pkg/tests/a.test.ts > a > red"]) }, runs({ kind: "ran", passed: true, out: out("3 passed (3)", "1 passed (1)") }));
assert.deepEqual(asked.splice(0), [{ files: ["tests/a.test.ts"], flags: [] }]);

console.log("arguments and judging: as expected");
