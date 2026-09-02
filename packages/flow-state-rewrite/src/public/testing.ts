import { scaffoldNotImplemented } from "../internal/scaffold.js";
import * as Diagnostic from "../diagnostic/diagnostic.js";

/** The testing route's story failure is the canonical diagnostic error. */
export const FlowStoryExecutionError = Diagnostic.Error;

export type FlowStoryExecutionError = Diagnostic.Error;

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
