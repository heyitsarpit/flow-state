import { Cause, type Exit } from "effect";

import type { FlowIssue, FlowMachine, FlowReceipt, InferMachineEvent } from "../core/api/types.js";
import { resolveTransactionOutcomeEventWithDiagnostics } from "../transaction-outcome-callbacks.js";
import { interruptIssue, issueFromExit } from "./orchestrator-issues.js";
import type { UnknownFlowTransactionDefinition } from "./orchestrator-transaction-types.js";

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
  definition: UnknownFlowTransactionDefinition,
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

export function resolveSuccessTransactionRoute<Machine extends FlowMachine>(
  definition: UnknownFlowTransactionDefinition,
  value: unknown,
): InferMachineEvent<Machine> | undefined {
  return resolveTransactionOutcomeEventWithDiagnostics(definition, "success", { value }) as
    | InferMachineEvent<Machine>
    | undefined;
}

export function resolveFailedTransactionCompletion<Machine extends FlowMachine>(
  definition: UnknownFlowTransactionDefinition,
  exit: Exit.Failure<unknown, unknown>,
  context?: TransactionIssueContext,
): Readonly<{
  readonly lane: TransactionFailureLane;
  readonly issue: FlowIssue;
  readonly routedEvent: InferMachineEvent<Machine> | undefined;
}> {
  const lane = failureLaneFromExit(exit);
  const issue =
    issueFromExit("transaction", definition.id, exit, context) ??
    fallbackIssue(definition, exit, lane, context);
  const routedEvent =
    lane === "failure"
      ? resolveTransactionOutcomeEventWithDiagnostics(definition, "failure", {
          error: issue.error,
        })
      : lane === "interrupt"
        ? resolveTransactionOutcomeEventWithDiagnostics(definition, "interrupt", {})
        : resolveTransactionOutcomeEventWithDiagnostics(definition, "defect", {
            cause: issue.cause ?? exit.cause,
          });

  return Object.freeze({
    lane,
    issue,
    routedEvent: routedEvent as InferMachineEvent<Machine> | undefined,
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
