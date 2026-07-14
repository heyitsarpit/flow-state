import { Cause, type Exit } from "effect";

import type { AnyFlowMachine, FlowIssue, FlowReceipt, InferMachineEvent } from "../api/types.js";
import { resolveTransactionOutcomeEventWithDiagnostics } from "../transactions/transaction-outcome-callbacks.js";
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

export function resolveSuccessTransactionRoute<Machine extends AnyFlowMachine>(
  definition: UnknownFlowTransactionDefinition,
  value: unknown,
): InferMachineEvent<Machine> | undefined {
  return resolveTransactionOutcomeEventWithDiagnostics(definition, "success", { value }) as
    | InferMachineEvent<Machine>
    | undefined;
}

export function resolveFailedTransactionIssue(
  definition: UnknownFlowTransactionDefinition,
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

export function resolveFailedTransactionRoute<Machine extends AnyFlowMachine>(
  definition: UnknownFlowTransactionDefinition,
  exit: Exit.Failure<unknown, unknown>,
  completion: Readonly<{
    readonly lane: TransactionFailureLane;
    readonly issue: FlowIssue;
  }>,
): InferMachineEvent<Machine> | undefined {
  const routedEvent =
    completion.lane === "failure"
      ? resolveTransactionOutcomeEventWithDiagnostics(definition, "failure", {
          error: completion.issue.error,
        })
      : completion.lane === "interrupt"
        ? resolveTransactionOutcomeEventWithDiagnostics(definition, "interrupt", {})
        : resolveTransactionOutcomeEventWithDiagnostics(definition, "defect", {
            cause: completion.issue.cause ?? exit.cause,
          });

  return routedEvent as InferMachineEvent<Machine> | undefined;
}

export function resolveFailedTransactionCompletion<Machine extends AnyFlowMachine>(
  definition: UnknownFlowTransactionDefinition,
  exit: Exit.Failure<unknown, unknown>,
  context?: TransactionIssueContext,
): Readonly<{
  readonly lane: TransactionFailureLane;
  readonly issue: FlowIssue;
  readonly routedEvent: InferMachineEvent<Machine> | undefined;
}> {
  const completion = resolveFailedTransactionIssue(definition, exit, context);

  return Object.freeze({
    ...completion,
    routedEvent: resolveFailedTransactionRoute<Machine>(definition, exit, completion),
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
