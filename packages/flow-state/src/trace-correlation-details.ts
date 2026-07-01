import type {
  FlowChildSnapshot,
  FlowEvent,
  FlowReceipt,
  FlowSnapshot,
  FlowTraceChildDetail,
  FlowTraceChildOutcome,
  FlowTraceCorrelationDetails,
  FlowTraceResourceDetail,
  FlowTraceResourceFetchOutcome,
  FlowTraceResourceFreshnessChange,
  FlowTraceResourceFreshnessReason,
  FlowTraceResourceInvalidationReason,
  FlowTraceResourceQueryMode,
  FlowTraceStreamCompletion,
  FlowTraceStreamDetail,
  FlowTraceTimerDetail,
  FlowTraceTimerOutcome,
  FlowTraceTransactionDetail,
} from "./public/types.js";
import { summarizeReceipts } from "./receipt-summary.js";

type TraceSnapshotState = Readonly<
  Pick<
    FlowSnapshot<unknown, string, FlowEvent>,
    "resources" | "transactions" | "streams" | "timers" | "children"
  >
>;

type Mutable<Type> = {
  -readonly [Key in keyof Type]: Type[Key];
};

type TraceReceiptFamily = keyof FlowTraceCorrelationDetails;

type TraceCorrelationDetailContext = Readonly<{
  readonly receiptIndices: WeakMap<FlowReceipt, number>;
  readonly latestIndices: Readonly<Record<TraceReceiptFamily, ReadonlyMap<string, number>>>;
  readonly snapshot?: TraceSnapshotState;
}>;

function familyForReceipt(receipt: FlowReceipt): TraceReceiptFamily | undefined {
  if (receipt.type.startsWith("query:") || receipt.type.startsWith("resource:")) {
    return "resources";
  }

  if (receipt.type.startsWith("transaction:")) {
    return "transactions";
  }

  if (receipt.type.startsWith("stream:")) {
    return "streams";
  }

  if (receipt.type.startsWith("timer:")) {
    return "timers";
  }

  if (receipt.type.startsWith("child:")) {
    return "children";
  }

  return undefined;
}

function receiptGroupsForFamily(
  receipts: ReadonlyArray<FlowReceipt>,
  family: TraceReceiptFamily,
): ReadonlyArray<readonly [string, ReadonlyArray<FlowReceipt>]> {
  const grouped = new Map<string, Array<FlowReceipt>>();

  for (const receipt of receipts) {
    if (familyForReceipt(receipt) !== family || typeof receipt.id !== "string") {
      continue;
    }

    const current = grouped.get(receipt.id) ?? [];
    current.push(receipt);
    grouped.set(receipt.id, current);
  }

  return Object.freeze(
    Array.from(grouped.entries()).map(
      ([id, groupedReceipts]) => [id, Object.freeze([...groupedReceipts])] as const,
    ),
  );
}

function lastGroupReceipt(receipts: ReadonlyArray<FlowReceipt>): FlowReceipt | undefined {
  return receipts.length === 0 ? undefined : receipts[receipts.length - 1];
}

function appliesFinalSnapshot(
  family: TraceReceiptFamily,
  id: string,
  receipts: ReadonlyArray<FlowReceipt>,
  context: TraceCorrelationDetailContext,
): boolean {
  const latestIndex = context.latestIndices[family].get(id);
  const latestReceipt = lastGroupReceipt(receipts);
  if (latestIndex === undefined || latestReceipt === undefined) {
    return false;
  }

  return context.receiptIndices.get(latestReceipt) === latestIndex;
}

function detailSummary(
  id: string,
  receipts: ReadonlyArray<FlowReceipt>,
): Readonly<{
  readonly receiptTypes: ReadonlyArray<string>;
  readonly relatedIds: ReadonlyArray<string>;
  readonly parentState?: string;
}> {
  const summary = summarizeReceipts(receipts, { seedIds: [id] });
  const parentState = receipts.find(
    (receipt) =>
      typeof receipt.parentState === "string" ||
      (receipt.type.startsWith("machine:") && typeof receipt.from === "string"),
  );

  return Object.freeze({
    receiptTypes: summary.receiptTypes,
    relatedIds: summary.relatedIds,
    ...(typeof parentState?.parentState === "string"
      ? { parentState: parentState.parentState }
      : typeof parentState?.from === "string"
        ? { parentState: parentState.from }
        : {}),
  });
}

function numericField(receipts: ReadonlyArray<FlowReceipt>, field: string): number | undefined {
  for (let index = receipts.length - 1; index >= 0; index -= 1) {
    const candidate = receipts[index]?.[field];
    if (typeof candidate === "number") {
      return candidate;
    }
  }

  return undefined;
}

function stringField(receipts: ReadonlyArray<FlowReceipt>, field: string): string | undefined {
  for (let index = receipts.length - 1; index >= 0; index -= 1) {
    const candidate = receipts[index]?.[field];
    if (typeof candidate === "string") {
      return candidate;
    }
  }

  return undefined;
}

function childSnapshotById(
  children: Readonly<Record<string, FlowChildSnapshot>>,
  id: string,
): FlowChildSnapshot | undefined {
  const direct = children[id];
  if (direct !== undefined) {
    return direct;
  }

  for (const child of Object.values(children)) {
    const nested = child.snapshot?.children;
    if (nested === undefined) {
      continue;
    }

    const found = childSnapshotById(nested, id);
    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
}

function transactionStatusAfter(
  receipts: ReadonlyArray<FlowReceipt>,
): FlowTraceTransactionDetail["statusAfter"] {
  const lastType = lastGroupReceipt(receipts)?.type;
  switch (lastType) {
    case "transaction:queue":
      return "queued";
    case "transaction:dequeue":
    case "transaction:start":
    case "transaction:preview-patch":
    case "transaction:retry":
      return "pending";
    case "transaction:success":
      return "success";
    case "transaction:failure":
    case "transaction:defect":
    case "transaction:reject":
    case "transaction:rollback":
      return "failure";
    case "transaction:interrupt":
      return "interrupt";
    case "transaction:reset":
      return "idle";
    default:
      return undefined;
  }
}

function streamCompletion(
  receipts: ReadonlyArray<FlowReceipt>,
): FlowTraceStreamCompletion | undefined {
  const type = lastGroupReceipt(receipts)?.type;
  switch (type) {
    case "stream:done":
      return "done";
    case "stream:failure":
      return "failure";
    case "stream:defect":
      return "defect";
    case "stream:interrupt":
      return "interrupt";
    default:
      return undefined;
  }
}

function streamStatusAfter(
  receipts: ReadonlyArray<FlowReceipt>,
): FlowTraceStreamDetail["statusAfter"] {
  const completion = streamCompletion(receipts);
  if (completion === "done") {
    return "success";
  }
  if (completion === "failure" || completion === "defect") {
    return "failure";
  }
  if (completion === "interrupt") {
    return "interrupt";
  }

  return receipts.some((receipt) => receipt.type === "stream:start") ? "running" : undefined;
}

function timerOutcome(receipts: ReadonlyArray<FlowReceipt>): FlowTraceTimerOutcome | undefined {
  const type = lastGroupReceipt(receipts)?.type;
  switch (type) {
    case "timer:fire":
      return "fire";
    case "timer:interrupt":
      return "interrupt";
    default:
      return undefined;
  }
}

function timerStatusAfter(
  receipts: ReadonlyArray<FlowReceipt>,
): FlowTraceTimerDetail["statusAfter"] {
  const outcome = timerOutcome(receipts);
  if (outcome === "fire") {
    return "fired";
  }
  if (outcome === "interrupt") {
    return "interrupt";
  }

  return receipts.some((receipt) => receipt.type === "timer:start") ? "scheduled" : undefined;
}

function childOutcome(receipts: ReadonlyArray<FlowReceipt>): FlowTraceChildOutcome | undefined {
  const type = lastGroupReceipt(receipts)?.type;
  switch (type) {
    case "child:start":
      return "start";
    case "child:success":
      return "success";
    case "child:failure":
      return "failure";
    case "child:defect":
      return "defect";
    case "child:interrupt":
      return "interrupt";
    case "child:stop":
      return "stop";
    case "child:retry":
      return "retry";
    default:
      return undefined;
  }
}

function childStatusAfter(
  receipts: ReadonlyArray<FlowReceipt>,
): FlowTraceChildDetail["statusAfter"] {
  const outcome = childOutcome(receipts);
  switch (outcome) {
    case "start":
    case "retry":
      return "active";
    case "success":
      return "success";
    case "failure":
    case "defect":
      return "failure";
    case "interrupt":
      return "interrupt";
    case "stop":
      return "stopped";
    default:
      return undefined;
  }
}

function uniqueStrings<T extends string>(values: ReadonlyArray<T>): ReadonlyArray<T> {
  const seen = new Set<string>();
  const ordered: Array<T> = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    ordered.push(value);
  }

  return Object.freeze(ordered);
}

function resourceFetchOutcomes(
  receipts: ReadonlyArray<FlowReceipt>,
): ReadonlyArray<FlowTraceResourceFetchOutcome> {
  return uniqueStrings(
    receipts.flatMap<FlowTraceResourceFetchOutcome>((receipt) => {
      switch (receipt.type) {
        case "resource:success":
          return ["success"];
        case "resource:failure":
          return ["failure"];
        case "resource:defect":
          return ["defect"];
        case "resource:interrupt":
          return ["interrupt"];
        default:
          return [];
      }
    }),
  );
}

function resourceFreshnessChanges(
  receipts: ReadonlyArray<FlowReceipt>,
): ReadonlyArray<FlowTraceResourceFreshnessChange> {
  const changes: Array<FlowTraceResourceFreshnessChange> = [];

  for (const receipt of receipts) {
    if (
      receipt.type !== "resource:freshness" ||
      (receipt.from !== undefined &&
        receipt.from !== "fresh" &&
        receipt.from !== "stale" &&
        receipt.from !== "invalidated") ||
      (receipt.to !== "fresh" && receipt.to !== "stale" && receipt.to !== "invalidated")
    ) {
      continue;
    }

    const reason: FlowTraceResourceFreshnessReason | undefined =
      receipt.reason === "patch" ||
      receipt.reason === "lookup-success" ||
      receipt.reason === "lookup-failure" ||
      receipt.reason === "invalidate:command" ||
      receipt.reason === "invalidate:transaction"
        ? receipt.reason
        : undefined;

    changes.push(
      Object.freeze({
        ...(receipt.from === undefined ? {} : { from: receipt.from }),
        to: receipt.to,
        ...(reason === undefined ? {} : { reason }),
      }),
    );
  }

  return Object.freeze(changes);
}

function resourceInvalidationReasons(
  receipts: ReadonlyArray<FlowReceipt>,
): ReadonlyArray<FlowTraceResourceInvalidationReason> {
  return uniqueStrings(
    receipts.flatMap<FlowTraceResourceInvalidationReason>((receipt) => {
      if (receipt.type === "resource:invalidate") {
        if (receipt.reason === "command" || receipt.reason === "transaction") {
          return [receipt.reason];
        }
      }

      if (receipt.type === "resource:freshness") {
        if (receipt.reason === "invalidate:command") {
          return ["command"];
        }
        if (receipt.reason === "invalidate:transaction") {
          return ["transaction"];
        }
      }

      return [];
    }),
  );
}

function resourceDetails(
  receipts: ReadonlyArray<FlowReceipt>,
  context: TraceCorrelationDetailContext,
): FlowTraceCorrelationDetails["resources"] {
  return Object.freeze(
    receiptGroupsForFamily(receipts, "resources").map(([id, groupedReceipts]) => {
      const summary = detailSummary(id, groupedReceipts);
      const resourceSnapshot = appliesFinalSnapshot("resources", id, groupedReceipts, context)
        ? context.snapshot?.resources[id]
        : undefined;
      const queryModes: ReadonlyArray<FlowTraceResourceQueryMode> = uniqueStrings(
        groupedReceipts.flatMap<FlowTraceResourceQueryMode>((receipt) =>
          receipt.type === "query:start" &&
          (receipt.mode === "ensure" || receipt.mode === "observe" || receipt.mode === "refresh")
            ? [receipt.mode]
            : [],
        ),
      );
      const fetchOutcomes = resourceFetchOutcomes(groupedReceipts);
      const usedPlaceholder = groupedReceipts.some(
        (receipt) => receipt.type === "resource:placeholder",
      );
      const freshnessChanges = resourceFreshnessChanges(groupedReceipts);
      const invalidationReasons = resourceInvalidationReasons(groupedReceipts);
      const statusAfter: FlowTraceResourceDetail["statusAfter"] = resourceSnapshot?.status;
      const availabilityAfter: FlowTraceResourceDetail["availabilityAfter"] =
        resourceSnapshot?.availability;
      const activityAfter: FlowTraceResourceDetail["activityAfter"] = resourceSnapshot?.activity;
      const freshnessAfter: FlowTraceResourceDetail["freshnessAfter"] =
        resourceSnapshot?.freshness ??
        (groupedReceipts.some((receipt) => receipt.type === "resource:invalidate")
          ? "invalidated"
          : undefined);
      const detail: Mutable<FlowTraceResourceDetail> = {
        id,
        receiptTypes: summary.receiptTypes,
        relatedIds: summary.relatedIds,
        queryModes,
        fetchOutcomes,
        usedPlaceholder,
        freshnessChanges,
        invalidationReasons,
      };

      if (summary.parentState !== undefined) {
        detail.parentState = summary.parentState;
      }
      if (statusAfter !== undefined) {
        detail.statusAfter = statusAfter;
      }
      if (availabilityAfter !== undefined) {
        detail.availabilityAfter = availabilityAfter;
      }
      if (activityAfter !== undefined) {
        detail.activityAfter = activityAfter;
      }
      if (freshnessAfter !== undefined) {
        detail.freshnessAfter = freshnessAfter;
      }
      if (resourceSnapshot?.updatedAt !== undefined) {
        detail.updatedAt = resourceSnapshot.updatedAt;
      }
      if (resourceSnapshot?.invalidatedAt !== undefined) {
        detail.invalidatedAt = resourceSnapshot.invalidatedAt;
      }

      return Object.freeze(detail);
    }),
  );
}

function transactionDetails(
  receipts: ReadonlyArray<FlowReceipt>,
): FlowTraceCorrelationDetails["transactions"] {
  return Object.freeze(
    receiptGroupsForFamily(receipts, "transactions").map(([id, groupedReceipts]) => {
      const summary = detailSummary(id, groupedReceipts);
      const queued = groupedReceipts.some((receipt) => receipt.type === "transaction:queue");
      const dequeued = groupedReceipts.some((receipt) => receipt.type === "transaction:dequeue");
      const startReceipt = groupedReceipts.find(
        (
          receipt,
        ): receipt is FlowReceipt &
          Readonly<{
            readonly type: "transaction:start";
            readonly trigger?: "event" | "state";
          }> =>
          receipt.type === "transaction:start" &&
          (receipt.trigger === "event" || receipt.trigger === "state"),
      );
      const trigger: FlowTraceTransactionDetail["trigger"] = startReceipt?.trigger;
      const generation = numericField(groupedReceipts, "generation");
      const statusAfter: FlowTraceTransactionDetail["statusAfter"] =
        transactionStatusAfter(groupedReceipts);
      const detail: Mutable<FlowTraceTransactionDetail> = {
        id,
        receiptTypes: summary.receiptTypes,
        relatedIds: summary.relatedIds,
        queued,
        dequeued,
        attempts: groupedReceipts.filter((receipt) => receipt.type === "transaction:start").length,
      };

      if (summary.parentState !== undefined) {
        detail.parentState = summary.parentState;
      }
      if (trigger !== undefined) {
        detail.trigger = trigger;
      }
      if (generation !== undefined) {
        detail.generation = generation;
      }
      if (queued || dequeued) {
        detail.queueCause = "serialize-overlap";
      }
      if (statusAfter !== undefined) {
        detail.statusAfter = statusAfter;
      }

      return Object.freeze(detail);
    }),
  );
}

function streamDetails(
  receipts: ReadonlyArray<FlowReceipt>,
  context: TraceCorrelationDetailContext,
): FlowTraceCorrelationDetails["streams"] {
  return Object.freeze(
    receiptGroupsForFamily(receipts, "streams").map(([id, groupedReceipts]) => {
      const summary = detailSummary(id, groupedReceipts);
      const streamSnapshot = appliesFinalSnapshot("streams", id, groupedReceipts, context)
        ? context.snapshot?.streams[id]
        : undefined;
      const statusAfter = streamSnapshot?.status ?? streamStatusAfter(groupedReceipts);
      const generation = streamSnapshot?.generation ?? numericField(groupedReceipts, "generation");
      const completion = streamCompletion(groupedReceipts);

      return Object.freeze({
        id,
        receiptTypes: summary.receiptTypes,
        relatedIds: summary.relatedIds,
        ...(summary.parentState === undefined ? {} : { parentState: summary.parentState }),
        ...(statusAfter === undefined ? {} : { statusAfter }),
        ...(generation === undefined ? {} : { generation }),
        ...(streamSnapshot?.emitted === undefined ? {} : { emittedCount: streamSnapshot.emitted }),
        ...(completion === undefined ? {} : { completion }),
      }) satisfies FlowTraceStreamDetail;
    }),
  );
}

function timerDetails(
  receipts: ReadonlyArray<FlowReceipt>,
  context: TraceCorrelationDetailContext,
): FlowTraceCorrelationDetails["timers"] {
  return Object.freeze(
    receiptGroupsForFamily(receipts, "timers").map(([id, groupedReceipts]) => {
      const summary = detailSummary(id, groupedReceipts);
      const timerSnapshot = appliesFinalSnapshot("timers", id, groupedReceipts, context)
        ? context.snapshot?.timers[id]
        : undefined;
      const dueAt = timerSnapshot?.dueAt ?? numericField(groupedReceipts, "dueAt");
      const startedAt = timerSnapshot?.startedAt;
      const endedAt = timerSnapshot?.endedAt ?? numericField(groupedReceipts, "endedAt");
      const outcome = timerOutcome(groupedReceipts);
      const statusAfter: FlowTraceTimerDetail["statusAfter"] =
        timerSnapshot?.status ?? timerStatusAfter(groupedReceipts);
      const generation = timerSnapshot?.generation ?? numericField(groupedReceipts, "generation");
      const detail: Mutable<FlowTraceTimerDetail> = {
        id,
        receiptTypes: summary.receiptTypes,
        relatedIds: summary.relatedIds,
      };

      if (summary.parentState !== undefined) {
        detail.parentState = summary.parentState;
      }
      if (statusAfter !== undefined) {
        detail.statusAfter = statusAfter;
      }
      if (generation !== undefined) {
        detail.generation = generation;
      }
      if (dueAt !== undefined) {
        detail.dueAt = dueAt;
      }
      if (startedAt !== undefined) {
        detail.startedAt = startedAt;
      }
      if (endedAt !== undefined) {
        detail.endedAt = endedAt;
      }
      if (startedAt !== undefined && dueAt !== undefined) {
        detail.scheduledMillis = Math.max(0, dueAt - startedAt);
      }
      if (startedAt !== undefined && endedAt !== undefined) {
        detail.elapsedMillis = Math.max(0, endedAt - startedAt);
      }
      if (outcome !== undefined) {
        detail.outcome = outcome;
      }

      return Object.freeze(detail);
    }),
  );
}

function childDetails(
  receipts: ReadonlyArray<FlowReceipt>,
  context: TraceCorrelationDetailContext,
): FlowTraceCorrelationDetails["children"] {
  return Object.freeze(
    receiptGroupsForFamily(receipts, "children").map(([id, groupedReceipts]) => {
      const summary = detailSummary(id, groupedReceipts);
      const childSnapshot =
        appliesFinalSnapshot("children", id, groupedReceipts, context) &&
        context.snapshot !== undefined
          ? childSnapshotById(context.snapshot.children, id)
          : undefined;
      const outcome = childOutcome(groupedReceipts);
      const actorId = childSnapshot?.actorId ?? stringField(groupedReceipts, "actorId");
      const statusAfter = childSnapshot?.status ?? childStatusAfter(groupedReceipts);

      return Object.freeze({
        id,
        receiptTypes: summary.receiptTypes,
        relatedIds: summary.relatedIds,
        ...(summary.parentState === undefined ? {} : { parentState: summary.parentState }),
        ...(actorId === undefined ? {} : { actorId }),
        ...(statusAfter === undefined ? {} : { statusAfter }),
        ...(childSnapshot?.supervision === undefined
          ? {}
          : { supervision: childSnapshot.supervision }),
        ...(outcome === undefined ? {} : { outcome }),
      }) satisfies FlowTraceChildDetail;
    }),
  );
}

export function createTraceCorrelationDetailContext(
  receipts: ReadonlyArray<FlowReceipt>,
  snapshot?: TraceSnapshotState,
): TraceCorrelationDetailContext {
  const receiptIndices = new WeakMap<FlowReceipt, number>();
  const latestIndices = {
    resources: new Map<string, number>(),
    transactions: new Map<string, number>(),
    streams: new Map<string, number>(),
    timers: new Map<string, number>(),
    children: new Map<string, number>(),
  } satisfies Record<TraceReceiptFamily, Map<string, number>>;

  for (const [index, receipt] of receipts.entries()) {
    receiptIndices.set(receipt, index);
    const family = familyForReceipt(receipt);
    if (family === undefined || typeof receipt.id !== "string") {
      continue;
    }

    latestIndices[family].set(receipt.id, index);
  }

  return Object.freeze({
    receiptIndices,
    latestIndices,
    ...(snapshot === undefined ? {} : { snapshot }),
  });
}

export function createTraceCorrelationDetails(
  receipts: ReadonlyArray<FlowReceipt>,
  context: TraceCorrelationDetailContext,
): FlowTraceCorrelationDetails {
  return Object.freeze({
    resources: resourceDetails(receipts, context),
    transactions: transactionDetails(receipts),
    streams: streamDetails(receipts, context),
    timers: timerDetails(receipts, context),
    children: childDetails(receipts, context),
  });
}
