import { Cause, Exit } from "effect";

import type { FlowReceipt, FlowResourceRef, FlowResourceSnapshot } from "../core/api/types.js";
import { receiptWithCorrelation } from "../receipt-correlation.js";

type ResourceQueryMode = "ensure" | "observe" | "refresh";
type ResourceOutcomeReceiptType =
  | "resource:success"
  | "resource:failure"
  | "resource:defect"
  | "resource:interrupt";
type ResourceFreshnessReason =
  | "patch"
  | "lookup-success"
  | "lookup-failure"
  | "invalidate:command"
  | "invalidate:transaction";
type ResourceInvalidationReason = "command" | "transaction";

function resourceOutcomeReceiptType(exit: Exit.Exit<unknown, unknown>): ResourceOutcomeReceiptType {
  if (Exit.isSuccess(exit)) {
    return "resource:success";
  }

  if (Cause.hasInterruptsOnly(exit.cause)) {
    return "resource:interrupt";
  }

  return exit.cause.reasons.find(Cause.isFailReason) === undefined
    ? "resource:defect"
    : "resource:failure";
}

function resourceLookupDidSettle(
  previousResource: FlowResourceSnapshot | undefined,
  nextResource: FlowResourceSnapshot | undefined,
): boolean {
  return (
    nextResource?.requestId !== undefined && nextResource.requestId !== previousResource?.requestId
  );
}

export function resourcePlaceholderReceipt(
  id: string,
  mode: ResourceQueryMode,
  parentState: string,
  correlationId: string | undefined,
): FlowReceipt {
  return receiptWithCorrelation(
    {
      type: "resource:placeholder",
      id,
      mode,
      parentState,
    },
    correlationId,
  );
}

export function resourceFreshnessReceipt(
  id: string,
  parentState: string,
  previousResource: FlowResourceSnapshot | undefined,
  nextResource: FlowResourceSnapshot | undefined,
  reason: ResourceFreshnessReason,
  correlationId: string | undefined,
): FlowReceipt | undefined {
  if (nextResource === undefined || previousResource?.freshness === nextResource.freshness) {
    return undefined;
  }

  return receiptWithCorrelation(
    {
      type: "resource:freshness",
      id,
      ...(previousResource?.freshness === undefined ? {} : { from: previousResource.freshness }),
      to: nextResource.freshness,
      reason,
      parentState,
    },
    correlationId,
  );
}

export function resourceLookupLifecycleReceipts(
  id: string,
  mode: ResourceQueryMode,
  parentState: string,
  previousResource: FlowResourceSnapshot | undefined,
  nextResource: FlowResourceSnapshot | undefined,
  exit: Exit.Exit<unknown, unknown>,
  correlationId: string | undefined,
): ReadonlyArray<FlowReceipt> {
  if (!resourceLookupDidSettle(previousResource, nextResource)) {
    return Object.freeze([]);
  }

  const outcomeType = resourceOutcomeReceiptType(exit);
  const receipts: Array<FlowReceipt> = [
    receiptWithCorrelation(
      {
        type: outcomeType,
        id,
        mode,
        parentState,
        ...(nextResource?.status === undefined ? {} : { status: nextResource.status }),
        ...(nextResource?.availability === undefined
          ? {}
          : { availability: nextResource.availability }),
        ...(nextResource?.freshness === undefined ? {} : { freshness: nextResource.freshness }),
        ...(nextResource?.updatedAt === undefined ? {} : { updatedAt: nextResource.updatedAt }),
        ...(nextResource?.invalidatedAt === undefined
          ? {}
          : { invalidatedAt: nextResource.invalidatedAt }),
      },
      correlationId,
    ),
  ];

  const freshnessReceipt = resourceFreshnessReceipt(
    id,
    parentState,
    previousResource,
    nextResource,
    outcomeType === "resource:success" ? "lookup-success" : "lookup-failure",
    correlationId,
  );
  if (freshnessReceipt !== undefined) {
    receipts.push(freshnessReceipt);
  }

  return Object.freeze(receipts);
}

export function resourceFreshnessReceiptsForRefs(
  refs: ReadonlyArray<FlowResourceRef>,
  previousResources: Readonly<Record<string, FlowResourceSnapshot>>,
  nextResources: Readonly<Record<string, FlowResourceSnapshot>>,
  parentState: string,
  reason: ResourceFreshnessReason,
  correlationId: string | undefined,
): ReadonlyArray<FlowReceipt> {
  const receipts: Array<FlowReceipt> = [];

  for (const ref of refs) {
    const receipt = resourceFreshnessReceipt(
      ref.id,
      parentState,
      previousResources[ref.id],
      nextResources[ref.id],
      reason,
      correlationId,
    );
    if (receipt !== undefined) {
      receipts.push(receipt);
    }
  }

  return Object.freeze(receipts);
}

export function resourceInvalidationSummaryReceipt(
  targetId: string,
  count: number,
  parentState: string,
  reason: ResourceInvalidationReason,
  correlationId: string | undefined,
): FlowReceipt {
  return receiptWithCorrelation(
    {
      type: "resource:invalidate",
      id: targetId,
      count,
      reason,
      parentState,
    },
    correlationId,
  );
}
