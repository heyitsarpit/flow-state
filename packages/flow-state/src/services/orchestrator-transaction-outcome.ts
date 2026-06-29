import { Cause, type Exit } from "effect";

import type { FlowIssue, FlowMachine, InferMachineEvent } from "../public/types.js";
import { resolveTransactionOutcomeEvent } from "../transaction-outcome.js";
import { issueFromExit } from "./orchestrator-issues.js";
import type { UnknownFlowTransactionDefinition } from "./orchestrator-transaction-types.js";

export type TransactionFailureLane = "interrupt" | "failure" | "defect";

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
): FlowIssue {
  if (lane === "interrupt") {
    return {
      kind: "interrupt",
      source: "transaction",
      id: definition.id,
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
  return resolveTransactionOutcomeEvent(definition.config.routes, "success", { value }) as
    | InferMachineEvent<Machine>
    | undefined;
}

export function resolveFailedTransactionCompletion<Machine extends FlowMachine>(
  definition: UnknownFlowTransactionDefinition,
  exit: Exit.Failure<unknown, unknown>,
): Readonly<{
  readonly lane: TransactionFailureLane;
  readonly issue: FlowIssue;
  readonly routedEvent: InferMachineEvent<Machine> | undefined;
}> {
  const lane = failureLaneFromExit(exit);
  const issue =
    issueFromExit("transaction", definition.id, exit) ?? fallbackIssue(definition, exit, lane);
  const routedEvent =
    lane === "failure"
      ? resolveTransactionOutcomeEvent(definition.config.routes, "failure", {
          error: issue.error,
        })
      : lane === "interrupt"
        ? resolveTransactionOutcomeEvent(definition.config.routes, "interrupt", {})
        : resolveTransactionOutcomeEvent(definition.config.routes, "defect", {
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
