import { describe, expect, it } from "vite-plus/test";

import {
  formatStoryPathListText,
  formatScenarioPretty,
  formatTraceSummaryText,
} from "./cli/shared.js";

describe("CLI output compression architecture", () => {
  it("bounds default path text while preserving the full path count", () => {
    const paths = Array.from({ length: 40 }, (_, index) => ({
      finalState: `state-${index}`,
      stepCount: 1,
      weight: 1,
      events: [{ type: `EVENT_${index}` }],
    }));
    const output = formatStoryPathListText({
      machineId: "example.machine",
      strategy: "shortest",
      pathCount: paths.length,
      paths,
    });

    expect(output.split("\n").length).toBe(16);
    expect(output).toContain("more: 28 paths; use --format json for all");
    expect(output).not.toContain("EVENT_39");
  });

  it("keeps clean trace summaries below a compact character budget", () => {
    const output = formatTraceSummaryText({
      kind: "trace-summary",
      source: "story-run-trace",
      machineId: "workspace",
      summary: {
        kind: "trace-summary",
        machineId: "workspace",
        finalState: "ready",
        headline: "workspace ended in ready after OPEN with 1 outcome(s)",
        receiptCount: 8,
        correlationCount: 1,
        issueCount: 0,
        receiptTypes: ["machine:event"],
        relatedIds: ["workspace", "project"],
        bucketCounts: {
          events: 1,
          transitions: 1,
          resources: 0,
          transactions: 0,
          streams: 0,
          children: 0,
          timers: 0,
          actors: 0,
          other: 0,
        },
        outcomeCounts: { success: 1, failure: 0, defect: 0, interrupt: 0 },
        correlations: [],
        issues: [],
      },
    });

    expect(output.length < 220).toBe(true);
    expect(output).toContain("8 receipts, 1 correlations, 0 issues");
    expect(output).not.toContain("Receipt types");
    expect(output).not.toContain("source:");
  });

  it("does not repeat empty issue and pending-work categories in run text", () => {
    const output = formatScenarioPretty({
      kind: "story-run",
      story: {
        id: "ready",
        machineId: "workspace",
        title: "Ready",
        start: "default",
        tags: [],
      },
      outcome: {
        kind: "story-run",
        status: "success",
        finalState: "ready",
        receiptCount: 2,
        correlationCount: 1,
        issueCount: 0,
        receiptSummary: { receiptTypes: ["machine:event"], relatedIds: ["workspace"] },
        issueSummary: { count: 0, kinds: [], sources: [] },
        outcomeSummary: { count: 0, kinds: [], sources: [], outcomes: [] },
      },
      pendingWork: {
        ready: 0,
        activeFibers: 0,
        mailboxes: [],
        timers: [],
        streams: [],
        transactions: [],
        children: [],
      },
    });

    expect(output).toContain("pending: none");
    expect(output.match(/issues/g)?.length).toBe(1);
    expect(output).not.toContain("Issue kinds");
    expect(output).not.toContain("Issue sources");
  });
});
