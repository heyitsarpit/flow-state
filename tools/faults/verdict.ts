// How the faults runner judges one test run: the run's outcome, its printed summary, and its
// verdict on a planted fault.

export type Run =
  | { readonly kind: "ran"; readonly passed: boolean; readonly out: string }
  | { readonly kind: "broken"; readonly why: string };

export const summaryOf = (out: string) => /^\s*Tests\s+(.*)$/mu.exec(out)?.[1]?.trim();

export const filesOf = (out: string) => /^\s*Test Files\s+(.*)$/mu.exec(out)?.[1]?.trim() ?? "";

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
