// How the faults runner judges one test run: the run's outcome, its printed summary, and its
// verdict on a planted fault.

export type Run =
  | { readonly kind: "ran"; readonly passed: boolean; readonly out: string }
  | { readonly kind: "broken"; readonly why: string };

export const summaryOf = (out: string) => /^\s*Tests\s+(.*)$/mu.exec(out)?.[1]?.trim();

export const filesOf = (out: string) => /^\s*Test Files\s+(.*)$/mu.exec(out)?.[1]?.trim() ?? "";

// A run's verdict on a planted fault: caught only when the run fails and its summary shows a failed
// test; a failing exit with no failed test (a file that would not load) is not judged.
export const verdictOf = (result: Run) => {
  if (result.kind === "broken") return `NOT JUDGED (${result.why})`;
  const summary = summaryOf(result.out);

  if (summary === undefined) return "NOT JUDGED (no test summary)";

  if (result.passed) return "MISSED";

  if (!/\d+ failed/u.test(summary)) return "NOT JUDGED (no failed test)";

  // A run stopped at its first failure exits non-zero with a partial summary.
  return `caught (${summary}${filesOf(result.out) === "" ? "" : `; test files ${filesOf(result.out)}`})`;
};
