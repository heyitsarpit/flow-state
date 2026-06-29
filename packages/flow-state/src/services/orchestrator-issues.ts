import { Cause, Exit } from "effect";

import type { FlowIssue } from "../public/types.js";
import type { FlowReceipt } from "../public/types.js";
import { issueFactsFromReceipts } from "../receipt-summary.js";

type FlowIssueContext = Readonly<{
  readonly correlationId?: string | undefined;
  readonly parentState?: string | undefined;
  readonly receipts?: ReadonlyArray<FlowReceipt> | undefined;
  readonly relatedIds?: ReadonlyArray<string> | undefined;
}>;

export function latestIssue(issues: ReadonlyArray<FlowIssue>): FlowIssue | undefined {
  return issues.length === 0 ? undefined : issues[issues.length - 1];
}

export function replaceIssue(
  issues: ReadonlyArray<FlowIssue>,
  nextIssue: FlowIssue,
): ReadonlyArray<FlowIssue> {
  const remaining = issues.filter(
    (issue) => issue.source !== nextIssue.source || issue.id !== nextIssue.id,
  );
  return Object.freeze([...remaining, nextIssue]);
}

export function clearIssue(
  issues: ReadonlyArray<FlowIssue>,
  source: FlowIssue["source"],
  id: string,
): ReadonlyArray<FlowIssue> {
  return Object.freeze(issues.filter((issue) => issue.source !== source || issue.id !== id));
}

function withIssueFacts(issue: FlowIssue, context?: FlowIssueContext): FlowIssue {
  return Object.freeze({
    ...issue,
    facts: issueFactsFromReceipts(issue.id, context),
  });
}

export function interruptIssue(
  source: FlowIssue["source"],
  id: string,
  context?: FlowIssueContext,
): FlowIssue {
  return withIssueFacts(
    {
      kind: "interrupt",
      source,
      id,
    },
    context,
  );
}

export function issueFromExit(
  source: FlowIssue["source"],
  id: string,
  exit: Exit.Exit<unknown, unknown>,
  context?: FlowIssueContext,
): FlowIssue | undefined {
  if (Exit.isSuccess(exit)) {
    return undefined;
  }

  if (Cause.hasInterruptsOnly(exit.cause)) {
    return withIssueFacts(
      {
        kind: "interrupt",
        source,
        id,
        cause: exit.cause,
      },
      context,
    );
  }

  const failReason = exit.cause.reasons.find(Cause.isFailReason);
  if (failReason !== undefined) {
    return withIssueFacts(
      {
        kind: "failure",
        source,
        id,
        error: failReason.error,
        cause: exit.cause,
      },
      context,
    );
  }

  return withIssueFacts(
    {
      kind: "defect",
      source,
      id,
      cause: exit.cause,
    },
    context,
  );
}
