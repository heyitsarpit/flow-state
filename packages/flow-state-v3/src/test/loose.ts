/**
 * A value handed to Flow as an untyped caller would hand it: a form the types refuse, which the
 * boundary under test must refuse at run time too.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a value the types refuse, for the run-time refusal under test.
export const loose = (value: unknown) =>
  // SAFETY: every caller passes a form the types reject; the test asserts the run-time refusal.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, lint-bomb/no-escape-hatch-assertion -- the untyped caller each boundary guards against
  value as never;
