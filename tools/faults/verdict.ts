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

// The faults a run plants: every fault, or with `--only` the named ones, in the order given. An
// unknown name, or `--only` with no name, is refused, so a typo never passes for a clean run.
export const chosenFaults = <F extends { readonly name: string }>(
  all: ReadonlyArray<F>,
  argv: ReadonlyArray<string>,
): { readonly faults: ReadonlyArray<F> } | { readonly refused: string } => {
  const at = argv.indexOf("--only");

  if (at === -1) return { faults: all };
  const after = argv.slice(at + 1);
  const end = after.findIndex((arg) => arg.startsWith("--"));
  const names = end === -1 ? after : after.slice(0, end);

  if (names.length === 0) return { refused: "--only names no fault" };
  const unknown = names.filter((name) => !all.some((fault) => fault.name === name));

  if (unknown.length > 0) return { refused: `no fault named ${unknown.join(", ")}` };

  return { faults: names.flatMap((name) => all.filter((fault) => fault.name === name)) };
};

// Whether a run is `--background`: the whole list at low CPU priority on 2 copies x 2 workers, its
// verdict written to a file as well as stdout.
export const inBackground = (argv: ReadonlyArray<string>) => argv.includes("--background");
