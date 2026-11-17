import { describe } from "vite-plus/test";
import { seededRuns, whole } from "./seeded.ts";

describe("generated Stories", () => {
  seededRuns("stress", { ...whole, fixtures: (id) => id === "palette", seedShard: [1, 4] });
});
