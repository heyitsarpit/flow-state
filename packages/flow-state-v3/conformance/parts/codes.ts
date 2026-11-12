/**
 * A feature code of the catalogue's closed list (Conformance R16).
 */
export type Code = string;

/**
 * The closed list of feature codes: the catalogue's 35 and the Plan check's 18.
 */
export const CODES: ReadonlyArray<Code> = [];

/**
 * The codes the Spec model's tables implement.
 */
export const MODEL_CODES: ReadonlyArray<Code> = [];

/**
 * The codes of `codes` that are not in the closed list.
 */
export const unknownCodes = (codes: ReadonlyArray<string>) =>
  codes.filter((code) => !CODES.includes(code));
