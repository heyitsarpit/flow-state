import { captureTrace } from "../core/inspection/inspect.js";
import { summarizeIssue, summarizeReceipts } from "../core/inspection/receipt-summary.js";
import { canonicalFactFamily } from "../core/inspection/canonical-receipt.js";
import { createTraceActorHierarchy } from "../core/inspection/trace-actor-hierarchy.js";
import { createTraceReport } from "../core/inspection/trace-report.js";
import type {
  FlowEvent,
  FlowIssue,
  FlowSnapshot,
  FlowTestCache,
  FlowTestHarness,
  FlowTestStreamSnapshot,
  FlowTimerSnapshot,
  FlowTransactionReceipt,
  FlowTransactionSnapshot,
} from "../core/api/types.js";
import { isCanonicalTransactionReceipt } from "../core/inspection/canonical-receipt.js";
import { createChildSummary, createChildTree } from "./child-inspection.js";

type HarnessSnapshot<Context, Event extends FlowEvent, State extends string> = FlowSnapshot<
  Context,
  State,
  Event
>;

type FlowTestReadSurfaceDeps<Context, Event extends FlowEvent, State extends string> = Readonly<{
  readonly currentSnapshot: () => HarnessSnapshot<Context, Event, State>;
  readonly currentIssues: () => ReadonlyArray<FlowIssue>;
  readonly currentTransactions: () => Readonly<Record<string, FlowTransactionSnapshot>>;
  readonly currentTimerSnapshots: () => Readonly<Record<string, FlowTimerSnapshot>>;
  readonly currentStreamSnapshots: () => Readonly<Record<string, FlowTestStreamSnapshot>>;
  readonly cache: FlowTestCache;
}>;

type FlowTestReadSurface<Context, Event extends FlowEvent, State extends string> = Readonly<
  Pick<
    FlowTestHarness<Context, Event, State>,
    | "childTree"
    | "childSummary"
    | "cache"
    | "transactions"
    | "timers"
    | "receipts"
    | "receiptSummary"
    | "streams"
    | "issues"
    | "issueSummary"
    | "trace"
    | "captureTrace"
    | "traceFor"
  >
>;

type FlowTestPreviewPatchReceipt = Extract<
  FlowTransactionReceipt,
  Readonly<{ readonly type: "transaction:preview-patch" }>
>;

type FlowTestRollbackReceipt = Extract<
  FlowTransactionReceipt,
  Readonly<{ readonly type: "transaction:rollback" }>
>;

type FlowTestQueuedReceipt = Extract<
  FlowTransactionReceipt,
  Readonly<{ readonly type: "transaction:queue" }>
>;

export function createFlowTestReadSurface<Context, Event extends FlowEvent, State extends string>(
  deps: FlowTestReadSurfaceDeps<Context, Event, State>,
): FlowTestReadSurface<Context, Event, State> {
  const traceForCorrelation: FlowTestReadSurface<Context, Event, State>["traceFor"] = (
    correlationId,
  ) => {
    const snapshot = deps.currentSnapshot();
    const receipts = snapshot.receipts.filter((receipt) => receipt.correlationId === correlationId);
    if (receipts.length === 0) {
      return undefined;
    }

    return Object.freeze({
      kind: "trace" as const,
      snapshot,
      actorHierarchy: createTraceActorHierarchy(snapshot),
      receipts: Object.freeze([...receipts]),
      report: createTraceReport(receipts, snapshot),
      options: Object.freeze({
        correlationId,
      }),
    });
  };

  const transactionReceipts = (id: string): ReadonlyArray<FlowTransactionReceipt> =>
    deps
      .currentSnapshot()
      .receipts.filter(
        (receipt): receipt is FlowTransactionReceipt =>
          receipt.id === id && isCanonicalTransactionReceipt(receipt),
      );

  const readSurface: FlowTestReadSurface<Context, Event, State> = {
    childTree: () => createChildTree(deps.currentSnapshot().children),
    childSummary: () => {
      const snapshot = deps.currentSnapshot();
      return createChildSummary(snapshot.children, snapshot.receipts);
    },
    cache: () => deps.cache,
    transactions: () =>
      Object.freeze({
        all: () => deps.currentTransactions(),
        get: (id: string) => deps.currentTransactions()[id],
        events: transactionReceipts,
        previewPatches: (id: string) =>
          transactionReceipts(id).filter(
            (receipt): receipt is FlowTestPreviewPatchReceipt =>
              receipt.type === "transaction:preview-patch",
          ),
        rollbacks: (id: string) =>
          transactionReceipts(id).filter(
            (receipt): receipt is FlowTestRollbackReceipt =>
              receipt.type === "transaction:rollback",
          ),
        queued: (id: string) =>
          transactionReceipts(id).filter(
            (receipt): receipt is FlowTestQueuedReceipt => receipt.type === "transaction:queue",
          ),
      }),
    timers: () =>
      Object.freeze({
        all: () => deps.currentTimerSnapshots(),
        get: (id: string) => deps.currentTimerSnapshots()[id],
        active: (id: string) => {
          const timer = deps.currentTimerSnapshots()[id];
          return timer?.status === "scheduled" ? timer : undefined;
        },
        fired: (id: string) => {
          const timer = deps.currentTimerSnapshots()[id];
          return timer?.status === "fired" ? timer : undefined;
        },
        cancelled: (id: string) => {
          const timer = deps.currentTimerSnapshots()[id];
          return timer?.status === "interrupt" ? timer : undefined;
        },
        events: (id: string) =>
          deps
            .currentSnapshot()
            .receipts.filter(
              (receipt) => receipt.id === id && canonicalFactFamily(receipt.type) === "timer",
            ),
      }),
    receipts: () => deps.currentSnapshot().receipts,
    receiptSummary: () => summarizeReceipts(deps.currentSnapshot().receipts),
    streams: () =>
      Object.freeze({
        all: () => deps.currentStreamSnapshots(),
        running: (id: string) => {
          const stream = deps.currentStreamSnapshots()[id];
          return stream?.status === "running" ? stream : undefined;
        },
        cancelled: (id: string) => {
          const stream = deps.currentStreamSnapshots()[id];
          return stream?.status === "interrupt" ? stream : undefined;
        },
        events: (id: string) =>
          deps
            .currentSnapshot()
            .receipts.filter(
              (receipt) => receipt.id === id && canonicalFactFamily(receipt.type) === "stream",
            ),
      }),
    issues: () => deps.currentIssues(),
    issueSummary: () =>
      Object.freeze(
        deps.currentIssues().map((issue) =>
          summarizeIssue(issue, {
            receipts: deps.currentSnapshot().receipts,
          }),
        ),
      ),
    trace: (options) => captureTrace(deps.currentSnapshot(), options),
    captureTrace: (options) => captureTrace(deps.currentSnapshot(), options),
    traceFor: traceForCorrelation,
  };

  return Object.freeze(readSurface);
}
