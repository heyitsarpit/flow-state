import { Cause, type Exit } from "effect";

import type { FlowIssue, FlowReceipt } from "../api/types.js";
import { interruptIssue, issueFromExit } from "./orchestrator-issues.js";

type TransactionIdentity = Readonly<{ readonly id: string }>;

export type TransactionFailureLane = "interrupt" | "failure" | "defect";

type TransactionIssueContext = Readonly<{
  readonly correlationId?: string | undefined;
  readonly parentState?: string | undefined;
  readonly receipts?: ReadonlyArray<FlowReceipt> | undefined;
}>;

function failureLaneFromExit(exit: Exit.Failure<unknown, unknown>): TransactionFailureLane {
  return Cause.hasInterruptsOnly(exit.cause)
    ? "interrupt"
    : exit.cause.reasons.find(Cause.isFailReason) !== undefined
      ? "failure"
      : "defect";
}

function fallbackIssue(
  definition: TransactionIdentity,
  exit: Exit.Failure<unknown, unknown>,
  lane: TransactionFailureLane,
  context?: TransactionIssueContext,
): FlowIssue {
  if (lane === "interrupt") {
    return {
      ...interruptIssue("transaction", definition.id, context),
      cause: exit.cause,
    };
  }

  if (lane === "failure") {
    return {
      kind: "failure",
      source: "transaction",
      id: definition.id,
      cause: exit.cause,
    };
  }

  return {
    kind: "defect",
    source: "transaction",
    id: definition.id,
    cause: exit.cause,
  };
}

export function resolveFailedTransactionIssue(
  definition: TransactionIdentity,
  exit: Exit.Failure<unknown, unknown>,
  context?: TransactionIssueContext,
): Readonly<{
  readonly lane: TransactionFailureLane;
  readonly issue: FlowIssue;
}> {
  const lane = failureLaneFromExit(exit);
  const issue =
    issueFromExit("transaction", definition.id, exit, context) ??
    fallbackIssue(definition, exit, lane, context);

  return Object.freeze({
    lane,
    issue,
  });
}

export function transactionReceiptTypeForLane(
  lane: TransactionFailureLane,
): "transaction:interrupt" | "transaction:failure" | "transaction:defect" {
  if (lane === "interrupt") {
    return "transaction:interrupt";
  }

  return lane === "failure" ? "transaction:failure" : "transaction:defect";
}
