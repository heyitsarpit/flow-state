import { flow } from "@flow-state/core";

import { launchRuntimeFacts } from "./launchWorkspaceCoverage";

type RuntimeFactName = (typeof launchRuntimeFacts)[number]["fact"];

export interface LaunchWorkspacePendingTimerSummary {
  readonly id: string;
  readonly dueAt: number;
  readonly parentState: string;
}

export interface LaunchWorkspacePendingChildSummary {
  readonly id: string;
  readonly status: string;
  readonly parentState?: string;
}

export interface LaunchWorkspaceReceiptSummary {
  readonly type: string;
  readonly id?: string;
  readonly source?: string;
}

export interface LaunchWorkspaceRuntimeFactSummary {
  readonly fact: RuntimeFactName;
  readonly status: string;
}

export interface LaunchWorkspaceDebugSelection {
  readonly pendingTransactions: readonly string[];
  readonly pendingStreams: readonly string[];
  readonly scheduledTimers: readonly LaunchWorkspacePendingTimerSummary[];
  readonly activeChildren: readonly LaunchWorkspacePendingChildSummary[];
  readonly recentReceipts: readonly LaunchWorkspaceReceiptSummary[];
  readonly activeRuntimeFacts: readonly LaunchWorkspaceRuntimeFactSummary[];
}

const runtimeFactStatusByName = new Map<RuntimeFactName, string>(
  launchRuntimeFacts.map((entry) => [entry.fact, entry.status] as const),
);

function pendingTransactions<
  TTransaction extends Readonly<{ readonly id: string; readonly status: string }>,
>(
  transactions: Readonly<Record<string, TTransaction>>,
): LaunchWorkspaceDebugSelection["pendingTransactions"] {
  return Object.freeze(
    Object.values(transactions)
      .filter((transaction) => transaction.status === "pending" || transaction.status === "queued")
      .map((transaction) => transaction.id),
  );
}

function pendingStreams<TStream extends Readonly<{ readonly id: string; readonly status: string }>>(
  streams: Readonly<Record<string, TStream>>,
): LaunchWorkspaceDebugSelection["pendingStreams"] {
  return Object.freeze(
    Object.values(streams)
      .filter((stream) => stream.status === "running")
      .map((stream) => stream.id),
  );
}

function scheduledTimers<
  TTimer extends Readonly<{
    readonly id: string;
    readonly status: string;
    readonly dueAt: number;
    readonly parentState: string;
  }>,
>(timers: Readonly<Record<string, TTimer>>): LaunchWorkspaceDebugSelection["scheduledTimers"] {
  return Object.freeze(
    Object.values(timers)
      .filter((timer) => timer.status === "scheduled")
      .map((timer) =>
        Object.freeze({
          id: timer.id,
          dueAt: timer.dueAt,
          parentState: timer.parentState,
        }),
      ),
  );
}

function activeChildren<
  TChild extends Readonly<{
    readonly id: string;
    readonly status: string;
    readonly parentState?: string;
  }>,
>(children: Readonly<Record<string, TChild>>): LaunchWorkspaceDebugSelection["activeChildren"] {
  return Object.freeze(
    Object.values(children)
      .filter((child) => child.status === "active")
      .map((child) =>
        Object.freeze({
          id: child.id,
          status: child.status,
          ...(child.parentState === undefined ? {} : { parentState: child.parentState }),
        }),
      ),
  );
}

function recentReceipts<
  TReceipt extends Readonly<{
    readonly type: string;
    readonly id?: string;
    readonly source?: string;
  }>,
>(receipts: ReadonlyArray<TReceipt>): LaunchWorkspaceDebugSelection["recentReceipts"] {
  return Object.freeze(
    receipts.slice(-8).map((receipt) =>
      Object.freeze({
        type: receipt.type,
        ...(receipt.id === undefined ? {} : { id: receipt.id }),
        ...(receipt.source === undefined ? {} : { source: receipt.source }),
      }),
    ),
  );
}

function activeRuntimeFacts(args: {
  readonly resources: Readonly<Record<string, Readonly<{ readonly status: string }>>>;
  readonly transactions: Readonly<Record<string, Readonly<{ readonly status: string }>>>;
  readonly streams: Readonly<Record<string, Readonly<{ readonly status: string }>>>;
  readonly timers: Readonly<Record<string, Readonly<{ readonly status: string }>>>;
  readonly children: Readonly<Record<string, Readonly<{ readonly status: string }>>>;
  readonly issues: ReadonlyArray<unknown>;
  readonly receipts: ReadonlyArray<unknown>;
}): LaunchWorkspaceDebugSelection["activeRuntimeFacts"] {
  const facts = new Set<RuntimeFactName>();

  if (Object.values(args.resources).some((resource) => resource.status !== "idle")) {
    facts.add("Resource snapshots");
  }
  if (Object.values(args.transactions).some((transaction) => transaction.status !== "idle")) {
    facts.add("Transaction snapshots");
  }
  if (Object.values(args.streams).some((stream) => stream.status !== "idle")) {
    facts.add("Stream snapshots");
  }
  if (Object.values(args.timers).some((timer) => timer.status !== "interrupt")) {
    facts.add("Timer snapshots");
  }
  if (Object.values(args.children).some((child) => child.status !== "stopped")) {
    facts.add("Child actor snapshots");
  }
  if (args.receipts.length > 0) {
    facts.add("Receipts");
    facts.add("Trace and timeline facts");
  }
  if (args.issues.length > 0) {
    facts.add("Issues");
    facts.add("Trace and timeline facts");
  }

  return Object.freeze(
    Array.from(facts).map((fact) =>
      Object.freeze({
        fact,
        status: runtimeFactStatusByName.get(fact) ?? "unknown",
      }),
    ),
  );
}

export const launchWorkspaceDebugView = flow.view<{}, string, LaunchWorkspaceDebugSelection>({
  id: "launch.workspace.debug",
  sources: ["resources", "transactions", "streams", "timers", "children", "issues", "receipts"],
  select: ({ resources, transactions, streams, timers, children, issues, receipts }) => {
    const currentPendingTransactions = pendingTransactions(transactions);
    const currentPendingStreams = pendingStreams(streams);
    const currentScheduledTimers = scheduledTimers(timers);
    const currentActiveChildren = activeChildren(children);

    return {
      pendingTransactions: currentPendingTransactions,
      pendingStreams: currentPendingStreams,
      scheduledTimers: currentScheduledTimers,
      activeChildren: currentActiveChildren,
      recentReceipts: recentReceipts(receipts),
      activeRuntimeFacts: activeRuntimeFacts({
        resources,
        transactions,
        streams,
        timers,
        children,
        issues,
        receipts,
      }),
    };
  },
});
