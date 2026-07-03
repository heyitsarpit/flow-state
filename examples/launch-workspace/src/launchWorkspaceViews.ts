import { flow } from "flow-state";

import type { LaunchProjectId } from "./domain";
import {
  approvalResource,
  assetsResource,
  projectResource,
  readinessResource,
} from "./launchWorkspaceResources";

export interface LaunchOverviewSelection {
  readonly projectId: LaunchProjectId;
  readonly projectResourceStatus: string;
  readonly readinessResourceStatus: string;
  readonly assetResourceStatus: string;
  readonly approvalResourceStatus: string;
  readonly saveTransactionStatus: string;
  readonly activeChildIds: readonly string[];
  readonly streamIds: readonly string[];
  readonly issueCount: number;
  readonly receiptCount: number;
}

export interface TraceStreamSummary {
  readonly id: string;
  readonly status: string;
  readonly emitted: number;
}

export interface TraceChildSummary {
  readonly id: string;
  readonly status: string;
  readonly parentState?: string;
}

export interface TraceIssueSummary {
  readonly id: string;
  readonly source: string;
  readonly kind: string;
}

export interface TraceTimelineSelection {
  readonly recentReceiptTypes: readonly string[];
  readonly streamSummaries: readonly TraceStreamSummary[];
  readonly childSummaries: readonly TraceChildSummary[];
  readonly issueSummaries: readonly TraceIssueSummary[];
}

interface LaunchContext {
  readonly activeProjectId: LaunchProjectId;
}

type LaunchState = string;
type TraceContext = LaunchContext;
type TraceState = string;

function nonIdleStreamIds<
  TStream extends Readonly<{ readonly id: string; readonly status: string }>,
>(streams: Readonly<Record<string, TStream>>): readonly string[] {
  return Object.freeze(
    Object.values(streams)
      .filter((stream) => stream.status !== "idle")
      .map((stream) => stream.id),
  );
}

function activeChildIds<TChild extends Readonly<{ readonly id: string; readonly status: string }>>(
  children: Readonly<Record<string, TChild>>,
): readonly string[] {
  return Object.freeze(
    Object.values(children)
      .filter((child) => child.status === "active")
      .map((child) => child.id),
  );
}

function streamSummaries<
  TStream extends Readonly<{
    readonly id: string;
    readonly status: string;
    readonly emitted?: number;
  }>,
>(streams: Readonly<Record<string, TStream>>): TraceTimelineSelection["streamSummaries"] {
  return Object.freeze(
    Object.values(streams)
      .filter((stream) => stream.status !== "idle")
      .map((stream) =>
        Object.freeze({
          id: stream.id,
          status: stream.status,
          emitted: stream.emitted ?? 0,
        }),
      ),
  );
}

function childSummaries<
  TChild extends Readonly<{
    readonly id: string;
    readonly status: string;
    readonly parentState?: string;
  }>,
>(children: Readonly<Record<string, TChild>>): TraceTimelineSelection["childSummaries"] {
  return Object.freeze(
    Object.values(children)
      .filter((child) => child.status !== "stopped")
      .map((child) =>
        Object.freeze({
          id: child.id,
          status: child.status,
          ...(child.parentState === undefined ? {} : { parentState: child.parentState }),
        }),
      ),
  );
}

function issueSummaries<
  TIssue extends Readonly<{
    readonly id: string;
    readonly source: string;
    readonly kind: string;
  }>,
>(issues: ReadonlyArray<TIssue>): TraceTimelineSelection["issueSummaries"] {
  return Object.freeze(
    issues.map((issue) =>
      Object.freeze({
        id: issue.id,
        source: issue.source,
        kind: issue.kind,
      }),
    ),
  );
}

function recentReceiptTypes<TReceipt extends Readonly<{ readonly type: string }>>(
  receipts: ReadonlyArray<TReceipt>,
): TraceTimelineSelection["recentReceiptTypes"] {
  return Object.freeze(receipts.slice(-6).map((receipt) => receipt.type));
}

const overviewView = flow.view<LaunchContext, LaunchState, LaunchOverviewSelection>({
  id: "Launch.overviewView",
  sources: ["context", "resources", "transactions", "streams", "children", "issues", "receipts"],
  select: ({ context, resources, transactions, streams, children, issues, receipts }) => ({
    projectId: context.activeProjectId,
    projectResourceStatus: resources[projectResource.id]?.status ?? "idle",
    readinessResourceStatus: resources[readinessResource.id]?.status ?? "idle",
    assetResourceStatus: resources[assetsResource.id]?.status ?? "idle",
    approvalResourceStatus: resources[approvalResource.id]?.status ?? "idle",
    saveTransactionStatus: transactions["launch.save-project"]?.status ?? "idle",
    activeChildIds: activeChildIds(children),
    streamIds: nonIdleStreamIds(streams),
    issueCount: issues.length,
    receiptCount: receipts.length,
  }),
});

export const Launch = flow.module(
  "Launch",
  {
    overviewView,
    views: { overviewView },
  },
  {
    dependencies: ["Project", "Readiness", "Assets", "Approval", "Assistant", "Chat"],
    tags: ["launch"],
    screens: ["Overview"],
  },
);

const timelineView = flow.view<TraceContext, TraceState, TraceTimelineSelection>({
  id: "Trace.timelineView",
  sources: ["streams", "children", "issues", "receipts"],
  select: ({ streams, children, issues, receipts }) => ({
    recentReceiptTypes: recentReceiptTypes(receipts),
    streamSummaries: streamSummaries(streams),
    childSummaries: childSummaries(children),
    issueSummaries: issueSummaries(issues),
  }),
});

export const Trace = flow.module(
  "Trace",
  {
    timelineView,
    views: { timelineView },
  },
  {
    tags: ["trace"],
    screens: ["Trace"],
  },
);
