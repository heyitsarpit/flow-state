import { describe } from "vite-plus/test";
import { seededRuns } from "./seeded.ts";

describe("generated Stories", () => {
  seededRuns("stress");
});
