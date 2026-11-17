import { memoryBenches } from "./memory.ts";
import { persistBenches } from "./persist.ts";
import { scaleBenches } from "./scale.ts";
import { startupBenches } from "./startup.ts";
import { toolingBenches } from "./tooling.ts";
import { turnBenches } from "./turn.ts";
import { valuesBenches } from "./values.ts";

/**
 * Every bench, each declared once, in concern order.
 */
export const benches = [
  ...turnBenches,
  ...scaleBenches,
  ...persistBenches,
  ...valuesBenches,
  ...startupBenches,
  ...memoryBenches,
  ...toolingBenches,
];
