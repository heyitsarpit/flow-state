/**
 * One mutation of a Spec model table cell: the cell, the Invariant that cell's refusals name, and
 * whether a pilot part's trace noticed it (Conformance R19, T39).
 */
export type CellMutant = {
  readonly cell: string;
  readonly invariant: string;
  readonly noticed: boolean;
};

/**
 * Every cell of the model's tables, by name.
 */
// RETURN_TYPE: the contract the requirement checks are written against (T47 step 1); the body comes in its step.
export const tableCells = (): ReadonlyArray<string> => [];

/**
 * Each table cell mutated in turn and judged against the pilots' recorded runs.
 */
// RETURN_TYPE: the contract the requirement checks are written against (T47 step 1); the body comes in its step.
export const cellMutants = (): ReadonlyArray<CellMutant> => [];
