import { describe, expect, it } from "vite-plus/test";

import * as flowState from "./index.js";

const expectedTopLevelExports = new Set([
  "createControlledEffect",
  "createControlledStream",
  "flow",
  "flowTest",
]);

describe("Phase 1 public API contract", () => {
  it("exposes the final package entrypoints", () => {
    expect(new Set(Object.keys(flowState))).toEqual(expectedTopLevelExports);
  });
});
