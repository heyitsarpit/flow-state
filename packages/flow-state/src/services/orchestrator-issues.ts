import { Cause, Exit } from "effect";

import type { FlowIssue } from "../public/types.js";

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

export function issueFromExit(
  source: FlowIssue["source"],
  id: string,
  exit: Exit.Exit<unknown, unknown>,
): FlowIssue | undefined {
  if (Exit.isSuccess(exit)) {
    return undefined;
  }

  if (Cause.hasInterruptsOnly(exit.cause)) {
    return {
      kind: "interrupt",
      source,
      id,
      cause: exit.cause,
    };
  }

  const failReason = exit.cause.reasons.find(Cause.isFailReason);
  if (failReason !== undefined) {
    return {
      kind: "failure",
      source,
      id,
      error: failReason.error,
      cause: exit.cause,
    };
  }

  return {
    kind: "defect",
    source,
    id,
    cause: exit.cause,
  };
}
