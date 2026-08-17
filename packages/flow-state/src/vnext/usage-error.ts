import type { CanonicalKeyInput } from "./canonical.js";

export type FlowUsageErrorCode =
  | "InvalidDefinition"
  | "InvalidCanonicalValue"
  | "AppPlanCollision"
  | "ForeignIdentity";

export class FlowUsageError extends Error {
  readonly _tag = "FlowUsageError" as const;

  constructor(
    readonly code: FlowUsageErrorCode,
    readonly operation: string,
    readonly details: Readonly<Record<string, CanonicalKeyInput>>,
    override readonly cause?: unknown,
  ) {
    super(`${operation} failed with ${code}`);
    this.name = "FlowUsageError";
    Object.freeze(this.details);
    Object.freeze(this);
  }
}

export const usageError = (
  code: FlowUsageErrorCode,
  operation: string,
  details: Readonly<Record<string, CanonicalKeyInput>>,
  cause?: unknown,
): never => {
  throw new FlowUsageError(code, operation, details, cause);
};
