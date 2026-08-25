import { scaffoldNotImplemented } from "../internal/scaffold.js";

export class FlowStoryExecutionError extends Error {
  readonly _tag = "FlowStoryExecutionError" as const;
}

export function behavior(..._args: readonly unknown[]): never {
  return scaffoldNotImplemented("behavior");
}

export function fixture(..._args: readonly unknown[]): never {
  return scaffoldNotImplemented("fixture");
}

export function model(..._args: readonly unknown[]): never {
  return scaffoldNotImplemented("model");
}

export function story(..._args: readonly unknown[]): never {
  return scaffoldNotImplemented("story");
}
