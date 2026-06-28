import { Option } from "effect";

import { flow } from "@flow-state/core";

import type { LaunchProjectId } from "./domain";

interface LaunchContext {
  readonly activeProjectId: Option.Option<LaunchProjectId>;
}

type LaunchState = "active";

const overviewView = flow.view<
  LaunchContext,
  LaunchState,
  {
    readonly projectId: LaunchProjectId | null;
    readonly projectStatus: string;
    readonly readinessStatus: string;
    readonly approvalStatus: string;
    readonly activeChildren: number;
    readonly receiptCount: number;
  }
>({
  id: "Launch.overviewView",
  sources: ["context", "resources", "children", "receipts"],
  select: ({ context, resources, children, receipts }) => ({
    projectId: Option.getOrNull(context.activeProjectId),
    projectStatus: resources["Project.byId"]?.status ?? "idle",
    readinessStatus: resources["Readiness.metrics"]?.status ?? "idle",
    approvalStatus: resources["Approval.current"]?.status ?? "idle",
    activeChildren: Object.values(children).filter((child) => child.status === "active").length,
    receiptCount: receipts.length,
  }),
});

export const Launch = flow.module(
  "Launch",
  () => ({
    overviewView,
    views: { overviewView },
  }),
  {
    dependencies: ["Project", "Readiness", "Assets", "Approval", "Assistant", "Chat"],
    tags: ["launch"],
    screens: ["Overview"],
  },
);

interface TraceContext {
  readonly selectedReceipt: Option.Option<string>;
}

type TraceState = "active";

const timelineView = flow.view<
  TraceContext,
  TraceState,
  {
    readonly receipts: readonly string[];
    readonly streamIds: readonly string[];
    readonly childIds: readonly string[];
  }
>({
  id: "Trace.timelineView",
  sources: ["streams", "children", "receipts"],
  select: ({ streams, children, receipts }) => ({
    receipts: receipts.map((receipt) => receipt.type),
    streamIds: Object.keys(streams),
    childIds: Object.keys(children),
  }),
});

export const Trace = flow.module(
  "Trace",
  () => ({
    timelineView,
    views: { timelineView },
  }),
  {
    tags: ["trace"],
    screens: ["Trace"],
  },
);
