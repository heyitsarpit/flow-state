import type {
  FlowChildSnapshot,
  FlowEvent,
  FlowReceipt,
  FlowResourceReceipt,
  FlowSnapshot,
  FlowTraceChildDetail,
  FlowTraceChildOutcome,
  FlowTraceChildRetryCause,
  FlowTraceChildSpawnReason,
  FlowTraceChildStopReason,
  FlowTraceCorrelationDetails,
  FlowTraceResourceDetail,
  FlowTraceResourceFetchOutcome,
  FlowTraceResourceFreshnessChange,
  FlowTraceResourceFreshnessReason,
  FlowTraceResourceInvalidationReason,
  FlowTraceResourceQueryMode,
  FlowTraceStreamCompletion,
  FlowTraceStreamDetail,
  FlowTraceStreamInterruptReason,
  FlowTraceTimerDetail,
  FlowTraceTimerInterruptReason,
  FlowTraceTimerOutcome,
  FlowTraceTransactionAttemptTiming,
  FlowTraceTransactionDetail,
  FlowTraceTransactionOverlapCause,
  FlowTraceTransactionPreviewSummary,
  FlowTraceTransactionRollbackSummary,
  FlowTraceTransactionRoutedEvent,
  FlowTransactionReceipt,
} from "../api/types.js";
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
  if (receipt.type.startsWith("resource:")) {
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

function isCanonicalResourceReceipt(receipt: FlowReceipt): receipt is FlowResourceReceipt {
  switch (receipt.type) {
    case "resource:start":
    case "resource:patch":
    case "resource:invalidate":
    case "resource:hydrate":
    case "resource:placeholder":
    case "resource:success":
    case "resource:failure":
    case "resource:defect":
    case "resource:interrupt":
    case "resource:freshness":
      return true;
    default:
      return false;
  }
}

function isCanonicalTransactionReceipt(receipt: FlowReceipt): receipt is FlowTransactionReceipt {
  switch (receipt.type) {
    case "transaction:queue":
    case "transaction:dequeue":
    case "transaction:start":
    case "transaction:success":
    case "transaction:failure":
    case "transaction:defect":
    case "transaction:interrupt":
    case "transaction:reject":
    case "transaction:retry":
    case "transaction:reset":
    case "transaction:preview-patch":
    case "transaction:rollback":
      return true;
    default:
      return false;
  }
}

function latestCanonicalParentState(
  receipts: ReadonlyArray<FlowResourceReceipt | FlowTransactionReceipt>,
): string | undefined {
  for (let index = receipts.length - 1; index >= 0; index -= 1) {
    const parentState = receipts[index]?.parentState;
    if (typeof parentState === "string") {
      return parentState;
    }
  }

  return undefined;
}

function latestTransactionGeneration(
  receipts: ReadonlyArray<FlowTransactionReceipt>,
): number | undefined {
  for (let index = receipts.length - 1; index >= 0; index -= 1) {
    const receipt = receipts[index];
    if (receipt === undefined) {
      continue;
    }
    if ("generation" in receipt && typeof receipt.generation === "number") {
      return receipt.generation;
    }
  }

  return undefined;
}

function latestTransactionQueueKey(
  receipts: ReadonlyArray<FlowTransactionReceipt>,
): string | undefined {
  for (let index = receipts.length - 1; index >= 0; index -= 1) {
    const receipt = receipts[index];
    if (receipt === undefined) {
      continue;
    }
    if ("queueKey" in receipt && typeof receipt.queueKey === "string") {
      return receipt.queueKey;
    }
  }

  return undefined;
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

function booleanField(receipts: ReadonlyArray<FlowReceipt>, field: string): boolean | undefined {
  for (let index = receipts.length - 1; index >= 0; index -= 1) {
    const candidate = receipts[index]?.[field];
    if (typeof candidate === "boolean") {
      return candidate;
    }
  }

  return undefined;
}

function uniqueValues<Type>(values: ReadonlyArray<Type>): ReadonlyArray<Type> {
  const seen = new Set<Type>();
  const ordered: Array<Type> = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    ordered.push(value);
  }

  return Object.freeze(ordered);
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
      return "failure";
    case "transaction:defect":
      return "defect";
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

function isTransactionOverlapCause(value: unknown): value is FlowTraceTransactionOverlapCause {
  return (
    value === "active-attempt" ||
    value === "serialize-scope" ||
    value === "cancel-previous" ||
    value === "reject-while-running"
  );
}

function transactionOverlapCauses(
  receipts: ReadonlyArray<FlowTransactionReceipt>,
): FlowTraceTransactionDetail["overlapCauses"] {
  return uniqueValues(
    receipts.flatMap((receipt) => receipt.overlapCause).filter(isTransactionOverlapCause),
  );
}

function transactionAttemptTimings(
  receipts: ReadonlyArray<FlowTransactionReceipt>,
): FlowTraceTransactionDetail["attemptTimings"] {
  const timings = new Map<string, Mutable<FlowTraceTransactionAttemptTiming>>();
  let unknownAttemptIndex = 0;

  for (const receipt of receipts) {
    if (receipt.type !== "transaction:start" || typeof receipt.startedAt !== "number") {
      continue;
    }

    const generation = typeof receipt.generation === "number" ? receipt.generation : undefined;
    const key =
      generation === undefined ? `unknown:${unknownAttemptIndex++}` : `generation:${generation}`;
    timings.set(key, {
      ...(generation === undefined ? {} : { generation }),
      startedAt: receipt.startedAt,
    });
  }

  for (const receipt of receipts) {
    if (
      receipt.type !== "transaction:success" &&
      receipt.type !== "transaction:failure" &&
      receipt.type !== "transaction:defect" &&
      receipt.type !== "transaction:interrupt"
    ) {
      continue;
    }

    if (typeof receipt.startedAt !== "number") {
      continue;
    }

    const generation = typeof receipt.generation === "number" ? receipt.generation : undefined;
    const key =
      generation === undefined
        ? `unknown-completion:${unknownAttemptIndex++}`
        : `generation:${generation}`;
    const timing =
      timings.get(key) ??
      ({
        ...(generation === undefined ? {} : { generation }),
        startedAt: receipt.startedAt,
      } satisfies Mutable<FlowTraceTransactionAttemptTiming>);
    if (typeof receipt.endedAt === "number") {
      timing.endedAt = receipt.endedAt;
    }
    if (typeof receipt.durationMillis === "number") {
      timing.durationMillis = receipt.durationMillis;
    }
    timings.set(key, timing);
  }

  return Object.freeze(Array.from(timings.values()).map((timing) => Object.freeze({ ...timing })));
}

function transactionRefSummaries(
  receipts: ReadonlyArray<FlowTransactionReceipt>,
  receiptType: "transaction:preview-patch" | "transaction:rollback",
): ReadonlyArray<FlowTraceTransactionPreviewSummary | FlowTraceTransactionRollbackSummary> {
  const summaries = new Map<
    string,
    Mutable<FlowTraceTransactionPreviewSummary | FlowTraceTransactionRollbackSummary>
  >();

  for (const receipt of receipts) {
    if (receipt.type !== receiptType || typeof receipt.refId !== "string") {
      continue;
    }

    const generation = typeof receipt.generation === "number" ? receipt.generation : undefined;
    const key = generation === undefined ? "unknown" : `generation:${generation}`;
    const summary = summaries.get(key) ?? {
      ...(generation === undefined ? {} : { generation }),
      refIds: [],
    };
    summary.refIds = [...summary.refIds, receipt.refId];
    summaries.set(key, summary);
  }

  return Object.freeze(
    Array.from(summaries.values()).map((summary) =>
      Object.freeze({
        ...summary,
        refIds: Object.freeze([...summary.refIds]),
      }),
    ),
  );
}

function transactionLaneForReceipt(
  receipt: FlowTransactionReceipt,
): FlowTraceTransactionRoutedEvent["lane"] | undefined {
  switch (receipt.type) {
    case "transaction:success":
      return "success";
    case "transaction:failure":
      return "failure";
    case "transaction:defect":
      return "defect";
    case "transaction:interrupt":
      return "interrupt";
    default:
      return undefined;
  }
}

function transactionRoutedEvents(
  receipts: ReadonlyArray<FlowTransactionReceipt>,
): FlowTraceTransactionDetail["routedEvents"] {
  return Object.freeze(
    receipts.flatMap((receipt) => {
      const lane = transactionLaneForReceipt(receipt);
      if (lane === undefined || typeof receipt.routedEventType !== "string") {
        return [];
      }

      return [
        Object.freeze({
          lane,
          eventType: receipt.routedEventType,
          ...(typeof receipt.generation === "number" ? { generation: receipt.generation } : {}),
        }) satisfies FlowTraceTransactionRoutedEvent,
      ];
    }),
  );
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

function isChildSupervision(value: unknown): value is FlowTraceChildDetail["supervision"] {
  return value === "stop-on-failure" || value === "continue-on-failure";
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

function childSpawnReasons(
  receipts: ReadonlyArray<FlowReceipt>,
): FlowTraceChildDetail["spawnReasons"] {
  return uniqueStrings(
    receipts.flatMap<FlowTraceChildSpawnReason>((receipt) =>
      receipt.type === "child:start" &&
      (receipt.spawnReason === "state-entry" || receipt.spawnReason === "retry")
        ? [receipt.spawnReason]
        : [],
    ),
  );
}

function childStopReasons(
  receipts: ReadonlyArray<FlowReceipt>,
): FlowTraceChildDetail["stopReasons"] {
  return uniqueStrings(
    receipts.flatMap<FlowTraceChildStopReason>((receipt) =>
      receipt.type === "child:stop" &&
      (receipt.stopReason === "state-exit" ||
        receipt.stopReason === "parent-dispose" ||
        receipt.stopReason === "child-dispose")
        ? [receipt.stopReason]
        : [],
    ),
  );
}

function childRetryCauses(
  receipts: ReadonlyArray<FlowReceipt>,
): FlowTraceChildDetail["retryCauses"] {
  return uniqueStrings(
    receipts.flatMap<FlowTraceChildRetryCause>((receipt) =>
      receipt.type === "child:retry" && receipt.retryCause === "manual" ? [receipt.retryCause] : [],
    ),
  );
}

function resourceFetchOutcomes(
  receipts: ReadonlyArray<FlowResourceReceipt>,
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
  receipts: ReadonlyArray<FlowResourceReceipt>,
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
  receipts: ReadonlyArray<FlowResourceReceipt>,
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
    receiptGroupsForFamily(receipts, "resources").flatMap(([id, groupedReceipts]) => {
      const canonicalResourceReceipts = groupedReceipts.filter(isCanonicalResourceReceipt);
      if (canonicalResourceReceipts.length === 0) {
        return [];
      }
      const summary = detailSummary(id, canonicalResourceReceipts);
      const resourceSnapshot = appliesFinalSnapshot("resources", id, groupedReceipts, context)
        ? context.snapshot?.resources[id]
        : undefined;
      const queryModes: ReadonlyArray<FlowTraceResourceQueryMode> = uniqueStrings(
        canonicalResourceReceipts.flatMap<FlowTraceResourceQueryMode>((receipt) =>
          receipt.type === "resource:start" &&
          (receipt.mode === "ensure" || receipt.mode === "observe" || receipt.mode === "refresh")
            ? [receipt.mode]
            : [],
        ),
      );
      const fetchOutcomes = resourceFetchOutcomes(canonicalResourceReceipts);
      const usedPlaceholder = canonicalResourceReceipts.some(
        (receipt) => receipt.type === "resource:placeholder",
      );
      const freshnessChanges = resourceFreshnessChanges(canonicalResourceReceipts);
      const invalidationReasons = resourceInvalidationReasons(canonicalResourceReceipts);
      const statusAfter: FlowTraceResourceDetail["statusAfter"] = resourceSnapshot?.status;
      const availabilityAfter: FlowTraceResourceDetail["availabilityAfter"] =
        resourceSnapshot?.availability;
      const activityAfter: FlowTraceResourceDetail["activityAfter"] = resourceSnapshot?.activity;
      const freshnessAfter: FlowTraceResourceDetail["freshnessAfter"] =
        resourceSnapshot?.freshness ??
        (canonicalResourceReceipts.some((receipt) => receipt.type === "resource:invalidate")
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

      const parentState = latestCanonicalParentState(canonicalResourceReceipts);
      if (parentState !== undefined) {
        detail.parentState = parentState;
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

      return [Object.freeze(detail)];
    }),
  );
}

function transactionDetails(
  receipts: ReadonlyArray<FlowReceipt>,
): FlowTraceCorrelationDetails["transactions"] {
  return Object.freeze(
    receiptGroupsForFamily(receipts, "transactions").flatMap(([id, groupedReceipts]) => {
      const canonicalTransactionReceipts = groupedReceipts.filter(isCanonicalTransactionReceipt);
      if (canonicalTransactionReceipts.length === 0) {
        return [];
      }
      const summary = detailSummary(id, canonicalTransactionReceipts);
      const queued = canonicalTransactionReceipts.some(
        (receipt) => receipt.type === "transaction:queue",
      );
      const dequeued = canonicalTransactionReceipts.some(
        (receipt) => receipt.type === "transaction:dequeue",
      );
      const startReceipt = canonicalTransactionReceipts.find(
        (
          receipt,
        ): receipt is Extract<
          FlowTransactionReceipt,
          Readonly<{ readonly type: "transaction:start" }>
        > => receipt.type === "transaction:start",
      );
      const trigger: FlowTraceTransactionDetail["trigger"] = startReceipt?.trigger;
      const generation = latestTransactionGeneration(canonicalTransactionReceipts);
      const statusAfter: FlowTraceTransactionDetail["statusAfter"] = transactionStatusAfter(
        canonicalTransactionReceipts,
      );
      const queueKey = latestTransactionQueueKey(canonicalTransactionReceipts);
      const detail: Mutable<FlowTraceTransactionDetail> = {
        id,
        receiptTypes: summary.receiptTypes,
        relatedIds: summary.relatedIds,
        queued,
        dequeued,
        overlapCauses: transactionOverlapCauses(canonicalTransactionReceipts),
        attemptTimings: transactionAttemptTimings(canonicalTransactionReceipts),
        previews: transactionRefSummaries(
          canonicalTransactionReceipts,
          "transaction:preview-patch",
        ) as FlowTraceTransactionDetail["previews"],
        rollbacks: transactionRefSummaries(
          canonicalTransactionReceipts,
          "transaction:rollback",
        ) as FlowTraceTransactionDetail["rollbacks"],
        routedEvents: transactionRoutedEvents(canonicalTransactionReceipts),
        attempts: canonicalTransactionReceipts.filter(
          (receipt) => receipt.type === "transaction:start",
        ).length,
      };

      const parentState = latestCanonicalParentState(canonicalTransactionReceipts);
      if (parentState !== undefined) {
        detail.parentState = parentState;
      }
      if (trigger !== undefined) {
        detail.trigger = trigger;
      }
      if (generation !== undefined) {
        detail.generation = generation;
      }
      if (queueKey !== undefined) {
        detail.queueKey = queueKey;
      }
      if (queued || dequeued) {
        detail.queueCause = "serialize-overlap";
      }
      if (statusAfter !== undefined) {
        detail.statusAfter = statusAfter;
      }

      return [Object.freeze(detail)];
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
      const emittedCount = streamSnapshot?.emitted ?? numericField(groupedReceipts, "emitted");
      const completion = streamCompletion(groupedReceipts);
      const restored = groupedReceipts.some((receipt) => receipt.restored === true);
      const lastValueAvailable =
        streamSnapshot?.value !== undefined
          ? true
          : booleanField(groupedReceipts, "lastValueAvailable");
      const interruptReason =
        stringField(groupedReceipts, "interruptReason") === "state-exit" ||
        stringField(groupedReceipts, "interruptReason") === "dispose"
          ? (stringField(groupedReceipts, "interruptReason") as FlowTraceStreamInterruptReason)
          : undefined;

      return Object.freeze({
        id,
        receiptTypes: summary.receiptTypes,
        relatedIds: summary.relatedIds,
        ...(summary.parentState === undefined ? {} : { parentState: summary.parentState }),
        ...(statusAfter === undefined ? {} : { statusAfter }),
        ...(generation === undefined ? {} : { generation }),
        ...(emittedCount === undefined ? {} : { emittedCount }),
        ...(completion === undefined ? {} : { completion }),
        restored,
        ...(lastValueAvailable === undefined ? {} : { lastValueAvailable }),
        ...(interruptReason === undefined ? {} : { interruptReason }),
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
      const startedAt = timerSnapshot?.startedAt ?? numericField(groupedReceipts, "startedAt");
      const endedAt = timerSnapshot?.endedAt ?? numericField(groupedReceipts, "endedAt");
      const outcome = timerOutcome(groupedReceipts);
      const restored = groupedReceipts.some((receipt) => receipt.restored === true);
      const interruptReason =
        stringField(groupedReceipts, "interruptReason") === "state-exit" ||
        stringField(groupedReceipts, "interruptReason") === "dispose"
          ? (stringField(groupedReceipts, "interruptReason") as FlowTraceTimerInterruptReason)
          : undefined;
      const statusAfter: FlowTraceTimerDetail["statusAfter"] =
        timerSnapshot?.status ?? timerStatusAfter(groupedReceipts);
      const generation = timerSnapshot?.generation ?? numericField(groupedReceipts, "generation");
      const detail: Mutable<FlowTraceTimerDetail> = {
        id,
        receiptTypes: summary.receiptTypes,
        relatedIds: summary.relatedIds,
        restored,
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
      if (interruptReason !== undefined) {
        detail.interruptReason = interruptReason;
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
      const ownerPath = stringField(groupedReceipts, "ownerPath");
      const stateAfter = childSnapshot?.state ?? stringField(groupedReceipts, "state");
      const supervisionCandidate = stringField(groupedReceipts, "supervision");
      const supervision =
        childSnapshot?.supervision ??
        (isChildSupervision(supervisionCandidate) ? supervisionCandidate : undefined);
      const statusAfter = childSnapshot?.status ?? childStatusAfter(groupedReceipts);
      const spawnReasons = childSpawnReasons(groupedReceipts);
      const stopReasons = childStopReasons(groupedReceipts);
      const retryCauses = childRetryCauses(groupedReceipts);

      return Object.freeze({
        id,
        receiptTypes: summary.receiptTypes,
        relatedIds: summary.relatedIds,
        ...(summary.parentState === undefined ? {} : { parentState: summary.parentState }),
        ...(actorId === undefined ? {} : { actorId }),
        ...(ownerPath === undefined ? {} : { ownerPath }),
        ...(stateAfter === undefined ? {} : { stateAfter }),
        ...(statusAfter === undefined ? {} : { statusAfter }),
        ...(supervision === undefined ? {} : { supervision }),
        spawnReasons,
        stopReasons,
        retryCauses,
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
