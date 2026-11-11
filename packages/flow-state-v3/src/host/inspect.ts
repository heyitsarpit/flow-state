import type { Evidence } from "../core/evidence.ts";
import { InspectorId, type Runtime } from "./runtime.ts";

/**
 * Attaches a callback to a Runtime's evidence (Inspection O3).
 *
 * **When to use**
 *
 * In development tools and tests, to watch every Runtime decision in order.
 *
 * **Details**
 *
 * Each record is passed after the publication it describes. A callback that throws detaches
 * itself. `dispose` detaches the callback.
 *
 * **Gotchas**
 *
 * - This build delivers records synchronously at the end of each step, not on a later task.
 */
export const attachInspector = (runtime: Runtime, callback: (evidence: Evidence) => void) => ({
  dispose: runtime[InspectorId](callback),
});

export type { Evidence };
