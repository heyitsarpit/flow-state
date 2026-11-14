import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { ownsRows } from "./coverage.ts";

describe("a Task cannot close while an owed row names it (consult A3)", () => {
  it("a Task in progress, draft or ready owns rows; one done or in review does not", () => {
    for (const status of ["draft", "ready", "in_progress", "blocked"])
      assert.ok(ownsRows(status), status);

    for (const status of ["done", "review"]) assert.ok(!ownsRows(status), status);
  });
});
