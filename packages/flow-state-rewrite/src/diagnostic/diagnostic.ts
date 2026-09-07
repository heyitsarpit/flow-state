import { Array, flow, Predicate, Schema, SchemaIssue } from "effect";

import { Code } from "./codes.js";
import type { FailureCode } from "./codes.js";
import { print } from "./render.js";

/*
 * Diagnostics:
 *
 * Canonical schema and carrier
 *
 * Construction:
 *   Failure, Defect, Interrupt
 *
 * Schema failure projection:
 *   schemaIssuePath, fromSchemaError
 *
 * Rendering export:
 *   print
 */

// Canonical schema and carrier
const Classification = Schema.Literals(["Failure", "Defect", "Interruption"] as const);

/**
 * The one canonical diagnostic carrier. It is simultaneously an Error, a
 * Schema codec, and a directly yield-able Effect failure.
 */
/* oxlint-disable-next-line anti-slop/no-parallel-diagnostic-errors -- this is the sole canonical Schema.TaggedError. */
export class Diagnostic extends Schema.TaggedError<Diagnostic>("flow-state/Diagnostic")(
  "Diagnostic",
  {
    classification: Classification,
    code: Code,
    path: Schema.Array(Schema.Union([Schema.String, Schema.Finite])),
    details: Schema.Record(
      Schema.String,
      Schema.Union([Schema.String, Schema.Finite, Schema.Boolean, Schema.Null]),
    ),
    summary: Schema.String,
    help: Schema.String,
  },
) {
  override get message() {
    return print(this);
  }

  override toString() {
    return this.message;
  }
}

export type Path = Diagnostic["path"];

export type Details = Diagnostic["details"];

export type FailureFields = Omit<
  Pick<Diagnostic, "code" | "path" | "details" | "summary" | "help">,
  "code"
> & {
  readonly code: FailureCode;
};

/** The public failure projection omits the internal classification field. */
export type PublicDiagnostic = Omit<Diagnostic, "classification">;

// Construction
/** Constructs the expected typed-failure projection and injects its classification. */
export const Failure = (fields: FailureFields) =>
  new Diagnostic({ ...fields, classification: "Failure" });

/**
 * Converts one unexpected defect into a generic, safe diagnostic. The native
 * Error `cause` keeps the original value off the schema and renderer fields.
 */
export const Defect = (defect: unknown) => {
  const error = new Diagnostic({
    classification: "Defect",
    code: "Defect",
    path: [],
    details: {},
    summary: "Unexpected runtime defect",
    help: "Inspect the original cause at the host boundary.",
  });
  Object.defineProperty(error, "cause", {
    configurable: true,
    enumerable: false,
    value: defect,
  });
  return error;
};

/** Constructs the standard interruption projection. */
export const Interrupt = () =>
  new Diagnostic({
    classification: "Interruption",
    code: "Interruption",
    path: [],
    details: {},
    summary: "Operation interrupted",
    help: "Retry the operation.",
  });

const schemaIssueFormatter = SchemaIssue.makeFormatterStandardSchemaV1();

const isStringOrNumber = Predicate.or(Predicate.isString, Predicate.isNumber);

const schemaIssuePath = flow(
  schemaIssueFormatter,
  ({ issues }) => issues.find(({ path }) => path !== undefined && path.length > 0)?.path ?? [],
  Array.map((segment) => {
    const key = Predicate.isObject(segment) ? segment.key : segment;
    return Predicate.isSymbol(key) ? String(key) : key;
  }),
  Array.filter(isStringOrNumber),
);

/** Converts an Effect Schema failure into the canonical typed failure. */
export const fromSchemaError = (error: Schema.SchemaError) =>
  Failure({
    code: "SchemaValidation",
    path: schemaIssuePath(error.issue),
    details: { issue: error.issue._tag },
    summary: "Schema validation failed",
    help: "Fix the value at the reported path.",
  });

// Rendering export
export { Code } from "./codes.js";
export type { DiagnosticCode, FailureCode } from "./codes.js";
export { print } from "./render.js";
