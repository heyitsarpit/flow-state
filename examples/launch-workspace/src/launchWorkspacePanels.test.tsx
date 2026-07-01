import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { LaunchProjectId } from "./domain";
import {
  LaunchWorkspaceOverviewPanel,
  LaunchWorkspaceTracePanel,
  type LaunchWorkspaceShellSummary,
} from "./launchWorkspacePanels";
import type { LaunchOverviewSelection, TraceTimelineSelection } from "./launchWorkspaceViews";

const workspace: LaunchWorkspaceShellSummary = {
  title: "Launch Workspace",
  activeTab: "overview",
  readinessScore: 84,
  openChecklist: 3,
  assetCount: 5,
  approvalStatus: "pending",
  saveStatus: "idle",
  queuedSaves: 0,
  hasSaveConflict: false,
  traceLabel: "trace-7",
};

describe("Launch Workspace dumb panels", () => {
  it("renders the overview panel directly from a stable view selection", () => {
    const overview: LaunchOverviewSelection = {
      projectId: LaunchProjectId("launch-1"),
      projectResourceStatus: "success",
      readinessResourceStatus: "success",
      assetResourceStatus: "refreshing",
      approvalResourceStatus: "success",
      saveTransactionStatus: "pending",
      activeChildIds: ["assistant:launch"],
      streamIds: ["Chat.tokenStream"],
      issueCount: 2,
      receiptCount: 11,
    };

    const markup = renderToStaticMarkup(
      createElement(LaunchWorkspaceOverviewPanel, {
        overview,
        workspace,
      }),
    );

    expect(markup).toContain("Overview view");
    expect(markup).toContain("launch-1");
    expect(markup).toContain("pending");
    expect(markup).toContain("assistant:launch");
    expect(markup).toContain("Chat.tokenStream");
    expect(markup).toContain("overview");
  });

  it("renders the trace panel directly from trace summaries without a live actor", () => {
    const trace: TraceTimelineSelection = {
      recentReceiptTypes: ["machine:event", "transaction:start", "stream:emit"],
      streamSummaries: [{ id: "Chat.tokenStream", status: "running", emitted: 3 }],
      childSummaries: [{ id: "assistant:launch", status: "active", parentState: "ready" }],
      issueSummaries: [{ id: "issue-1", source: "transaction", kind: "failure" }],
    };

    const markup = renderToStaticMarkup(
      createElement(LaunchWorkspaceTracePanel, {
        trace,
        traceLabel: workspace.traceLabel,
      }),
    );

    expect(markup).toContain("Receipts and issues");
    expect(markup).toContain("trace-7");
    expect(markup).toContain("machine:event");
    expect(markup).toContain("Chat.tokenStream");
    expect(markup).toContain("active");
    expect(markup).toContain("failure");
  });
});
