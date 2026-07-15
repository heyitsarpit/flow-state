import { describe, expect, it } from "vite-plus/test";

import { renderBehaviorCoverage } from "flow-state/inspect";

import { BehaviorGateway } from "./app/behavior";

describe("launch workspace behavior coverage proof", () => {
  it("renders the module coverage view from the explicit launch workspace gateway", () => {
    const output = renderBehaviorCoverage(BehaviorGateway, {
      moduleId: "LaunchWorkspace",
    });

    expect(output).toContain("behavior.coverage LaunchWorkspace+Session+Launch+Project+Checklist");
    expect(output).toContain("scope: module LaunchWorkspace; curated story coverage");
    expect(output).toContain(
      "launch-workspace: states=ready,runningAssistant; transitions=1; children=1; resources=5; streams=1",
    );
    expect(output).toContain(
      "unproved:\n  launch-workspace: states=saving,saveConflict,requestingApproval",
    );
    expect(output).not.toContain("errorStates=");
    expect(output).toContain(
      "transactions=launch.save-project -> success,launch.save-project -> failure,launch.request-approval -> success,launch.request-approval -> failure",
    );
    expect(output).toContain(
      "unproved views: launch.workspace.debug(transactions,timers,issues,receipts); launch.workspace.summary(transactions)",
    );
    expect(output).not.toContain("## ");
  });
});
