import { checkpointMode } from "./checkpoint.ts";
import { trace } from "./trace.ts";

/**
 * The runner's tool modes (T61), by name: each takes the arguments after its mode and plays no
 * runtime of its own choosing first, so the runner prints no runtime line for it.
 */
export const TOOL_MODES = new Map([
  ["checkpoint", (_args: ReadonlyArray<string>) => checkpointMode],
  ["trace", trace],
]);
