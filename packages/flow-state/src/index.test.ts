import { describe, expect, it } from "vite-plus/test";

import { createFlowPreview, packageInfo } from "./index.js";

describe("@flow-state/core", () => {
  it("exposes the planned primitive buckets", () => {
    expect(packageInfo.primitives).toEqual(["atom", "resource", "mutation", "machine"]);
  });

  it("runs a tiny Effect and XState integration smoke path", () => {
    expect(createFlowPreview()).toEqual({
      label: "Effect + XState ready",
      initialState: "idle",
      primitives: ["atom", "resource", "mutation", "machine"],
    });
  });
});
