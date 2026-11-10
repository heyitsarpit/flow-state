import { Admission, Built, type CompiledHandle, type Surface } from "../surface.ts";

// SAFETY: the null surface's Compiled is never read; a case only hands it back to `admit`.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a branded handle has no constructor
const EMPTY = {} as CompiledHandle;

/**
 * A static surface that does nothing (Conformance R7): every construction gives an empty
 * `Compiled` without running the machine callback, and every Runtime creation is admitted.
 *
 * **When to use**
 *
 * Falsify runs every static case on it; a case that passes here proves nothing.
 */
export const nullSurface: Surface = {
  construct: () =>
    Built.Compiled({
      compiled: EMPTY,
      view: { states: [], events: [], uncertain: [], operations: [], slots: [], whole: {} },
    }),
  admit: () => Admission.Admitted(),
};
