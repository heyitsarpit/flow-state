// How the faults runner judges one test run: the run's outcome, its printed summary, and its
// verdict on a planted fault.

export type Run =
  | { readonly kind: "ran"; readonly passed: boolean; readonly out: string }
  | { readonly kind: "broken"; readonly why: string };

export const summaryOf = (out: string) => /^\s*Tests\s+(.*)$/mu.exec(out)?.[1]?.trim();

export const filesOf = (out: string) => /^\s*Test Files\s+(.*)$/mu.exec(out)?.[1]?.trim() ?? "";

// The failed tests a run names, each once, as "file > describe > title".
export const failedTestsOf = (out: string) => [
  ...new Set([...out.matchAll(/^\s*FAIL\s+(\S+ > .*?)\s*$/gmu)].map((match) => match[1] ?? "")),
];

// Whether a run shows a failed test: in its summary, or as a failed test's own line. A run stopped
// at its first failure can print a summary without it; a file that would not load fails no test.
const failedTest = (summary: string, out: string) =>
  /\d+ failed/u.test(summary) || /^\s*FAIL\s+\S+ > /mu.test(out);

// A run's verdict on a planted fault: caught only when the run fails and shows a failed test; a
// failing exit with no failed test (a file that would not load) is not judged.
export const verdictOf = (result: Run) => {
  if (result.kind === "broken") return `NOT JUDGED (${result.why})`;
  const summary = summaryOf(result.out);

  if (summary === undefined) return "NOT JUDGED (no test summary)";

  if (result.passed) return "MISSED";

  if (!failedTest(summary, result.out)) return "NOT JUDGED (no failed test)";

  // A run stopped at its first failure exits non-zero with a partial summary.
  return `caught (${summary}${filesOf(result.out) === "" ? "" : `; test files ${filesOf(result.out)}`})`;
};

// A file's text with each of its edits applied in turn, each `find` occurring exactly once in the
// text as the edits before it left it; undefined when one does not, so the fault is stale.
export const applyEdits = (
  text: string,
  edits: ReadonlyArray<{ readonly find: string; readonly replace: string }>,
): string | undefined =>
  edits.reduce<string | undefined>(
    (current, edit) =>
      current === undefined || current.split(edit.find).length !== 2
        ? undefined
        : current.replace(edit.find, () => edit.replace),
    text,
  );

// A fault's verdict once the tests already red in the unchanged run are set aside: the failed tests
// it is credited with, and MISSED when only such tests failed.
export const credited = (verdict: string, failed: ReadonlyArray<string>, knownRed: ReadonlySet<string>) => {
  const tests = failed.filter((test) => !knownRed.has(test)).toSorted();

  return {
    verdict: verdict.startsWith("caught") && tests.length === 0 ? "MISSED (only tests red in the unchanged run failed)" : verdict,
    tests,
  };
};

// Whether the unchanged run's reds are known for a judged run: the unchanged run covered the whole
// suite, or every file the judged run covers. "whole" is the whole suite.
export const redsKnown = (unchanged: ReadonlyArray<string> | "whole", judged: ReadonlyArray<string> | "whole") =>
  unchanged === "whole" || (judged !== "whole" && judged.every((file) => unchanged.includes(file)));

// What a run is asked for: every fault, or with `--only` (repeatable) the named ones in the order
// given; `--background` for a low-priority run. An unknown flag (`--only=x` included), a name not
// after `--only`, `--only` with no name, a duplicated name or an unknown name is refused, so a typo
// never passes for a clean run.
export const parseArgs = <F extends { readonly name: string }>(
  all: ReadonlyArray<F>,
  argv: ReadonlyArray<string>,
): { readonly faults: ReadonlyArray<F>; readonly only: boolean; readonly background: boolean } | { readonly refused: string } => {
  const names: Array<string> = [];
  // Where the reader is: before any `--only`, right after one (a name must follow), or among names.
  let at: "free" | "only" | "names" = "free";
  let only = false;
  let background = false;

  for (const arg of argv) {
    if (arg === "--background" || arg === "--only") {
      if (at === "only") return { refused: "--only names no fault" };
      background ||= arg === "--background";
      only ||= arg === "--only";
      at = arg === "--only" ? "only" : "free";
    } else if (arg.startsWith("-")) return { refused: `unknown flag ${arg}` };
    else if (at === "free") return { refused: `${arg} is not after --only` };
    else if (names.includes(arg)) return { refused: `${arg} named twice` };
    else {
      names.push(arg);
      at = "names";
    }
  }

  if (at === "only") return { refused: "--only names no fault" };
  const unknown = names.filter((name) => !all.some((fault) => fault.name === name));

  if (unknown.length > 0) return { refused: `no fault named ${unknown.join(", ")}` };

  return { faults: only ? names.flatMap((name) => all.filter((fault) => fault.name === name)) : all, only, background };
};
