import type { FlowIssue, FlowStreamSnapshot } from "../api/types.js";

type MaterializedTerminalStreamSnapshot = FlowStreamSnapshot &
  Readonly<{
    readonly generation: number;
    readonly emitted: number;
  }>;

export function createTerminalStreamSnapshot(args: {
  readonly id: string;
  readonly generation: number;
  readonly emitted: number;
  readonly value?: unknown;
  readonly issue?: FlowIssue;
}): MaterializedTerminalStreamSnapshot {
  const base = {
    id: args.id,
    generation: args.generation,
    emitted: args.emitted,
    ...(args.value === undefined ? {} : { value: args.value }),
  };

  if (args.issue === undefined) {
    return {
      ...base,
      status: "success",
    };
  }

  if (args.issue.kind === "interrupt") {
    return {
      ...base,
      status: "interrupt",
    };
  }

  if (args.issue.kind === "defect") {
    return {
      ...base,
      status: "defect",
    };
  }

  return {
    ...base,
    status: "failure",
    error: args.issue.error,
  };
}
