import { describe, expect, it } from "vite-plus/test";

import { renderBehaviorCoverage } from "flow-state/inspect";

import { BehaviorGateway } from "./app/behavior";

describe("launch workspace behavior coverage proof", () => {
  it("renders the Phase 3 module coverage view from the explicit launch workspace gateway", () => {
    const output = renderBehaviorCoverage(BehaviorGateway, {
      moduleId: "LaunchWorkspace",
    });

    expect(output).toContain("module slice: LaunchWorkspace");
    expect(output).toContain("## Covered States By Machine");
    expect(output).toContain("- launch-workspace: ready, runningAssistant");
    expect(output).toContain("## Uncovered States By Machine");
    expect(output).toContain("requestingApproval");
    expect(output).toContain("## Covered Story-Target States By Machine");
    expect(output).toContain("- launch-workspace: ready, runningAssistant");
    expect(output).toContain("## Unproved Story-Target States By Machine");
    expect(output).toContain("- launch-workspace: none");
    expect(output).toContain("## Covered Error-Path States By Machine");
    expect(output).toContain("- launch-workspace: none");
    expect(output).toContain("## Unproved Error-Path States By Machine");
    expect(output).toContain("- launch-workspace: saveConflict");
    expect(output).toContain("## Covered Child Supervision By Machine");
    expect(output).toContain(
      "- launch-workspace: runningAssistant -> Assistant.task (stop-on-failure)",
    );
    expect(output).toContain("## Unproved Child Supervision By Machine");
    expect(output).toContain("- launch-workspace: none");
    expect(output).toContain("## Covered Stream Lifecycles By Machine");
    expect(output).toContain(
      "- launch-workspace: runningAssistant -> Assistant.progress (state-owned lifecycle; pressure queue limit=10; routes value)",
    );
    expect(output).toContain("## Unproved Stream Lifecycles By Machine");
    expect(output).toContain("- launch-workspace: none");
    expect(output).toContain("## Blocked Stories");
    expect(output).toContain("(none)");
    expect(output).toContain("## Mismatch Stories");
    expect(output).toContain("(none)");
  });
});
