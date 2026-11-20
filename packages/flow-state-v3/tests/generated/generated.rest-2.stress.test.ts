import { describe } from "vite-plus/test";
import { seededRuns, whole } from "./seeded.ts";

describe("generated Stories", () => {
  seededRuns("stress", { ...whole, fixtures: (id) => id !== "palette", fixtureShard: [1, 2] });
});
