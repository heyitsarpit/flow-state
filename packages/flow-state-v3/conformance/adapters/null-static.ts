import { Admission, Built, type CompiledHandle, Made, type Surface } from "../surface.ts";

// SAFETY: the null surface's Compiled is never read; a case only hands it back to `admit`.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a branded handle has no constructor
const EMPTY = {} as CompiledHandle;

/**
 * A static surface that does nothing (Conformance R7): every construction gives an empty
 * `Compiled` without running the machine callback, every Runtime creation is admitted, creation and
 * restore give empty memory, every CLI run exits 0 having printed nothing, and no fixture has a
 * place.
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
  admitApp: () => Admission.Admitted(),
  create: () => Made.Memory({ memory: {} }),
  restore: () => Made.Memory({ memory: {} }),
  cli: () => ({ code: 0, stdout: "", stderr: "" }),
  places: () => [],
};
