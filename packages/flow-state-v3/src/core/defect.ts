/**
 * Throws a defect: a state Flow's own rules rule out, never an expected failure.
 *
 * **When to use**
 *
 * Only where the core or the driver meets what a valid Compiled and step cannot produce; an
 * expected failure is a value.
 */
// RETURN_TYPE: never, so a call stands in any expression.
export const defect = (what: string): never => {
  // oxlint-disable-next-line lint-bomb/no-throw-in-core -- a defect is Flow's own bug, never the app's; only defects are thrown
  throw new Error(`Defect: ${what}`);
};
