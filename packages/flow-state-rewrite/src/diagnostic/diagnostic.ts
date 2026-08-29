import {
  Array,
  Effect,
  flow,
  Predicate,
  Result as EffectResult,
  Schema,
  SchemaIssue,
} from "effect";

import { Code } from "./codes.js";
import { print } from "./render.js";

/**
 * The one typed failure value. It is simultaneously an Error, a Schema
 * codec, and a directly yield-able Effect failure.
 */
/* oxlint-disable-next-line anti-slop/no-parallel-diagnostic-errors -- this is the sole canonical Schema.TaggedError. */
export class Error extends Schema.TaggedError<Error>("Diagnostic")("Diagnostic", {
  code: Code,
  path: Schema.Array(Schema.Union([Schema.String, Schema.Finite])),
  details: Schema.Record(
    Schema.String,
    Schema.Union([Schema.String, Schema.Finite, Schema.Boolean, Schema.Null]),
  ),
  summary: Schema.String,
  help: Schema.String,
}) {
  override get message(): string {
    return print(this);
  }

  override toString(): string {
    return this.message;
  }
}

export type Path = Error["path"];

export type Details = Error["details"];

/** A local pure success/failure value with the canonical diagnostic failure. */
export type Result<A> = EffectResult.Result<A, Error>;

const schemaIssueFormatter = SchemaIssue.makeFormatterStandardSchemaV1();

const isStringOrNumber = Predicate.or(Predicate.isString, Predicate.isNumber);

const schemaIssuePath = flow(
  schemaIssueFormatter,
  ({ issues }) => issues.find(({ path }) => path !== undefined && path.length > 0)?.path ?? [],
  Array.map((segment) => (Predicate.isObject(segment) ? segment.key : segment)),
  Array.filter(isStringOrNumber),
);

/** Converts an Effect Schema failure into the canonical typed failure. */
export const fromSchemaError = (error: Schema.SchemaError): Error =>
  new Error({
    code: "SchemaValidation",
    path: schemaIssuePath(error.issue),
    details: { issue: error.issue._tag },
    summary: "Schema validation failed",
    help: "Fix the value at the reported path.",
  });

/**
 * Converts one unexpected defect into a generic, safe diagnostic. The native
 * Error `cause` keeps the original value off the schema and renderer fields.
 */
export const panic = (defect: unknown): Error => {
  const error = new Error({
    code: "Panic",
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

/**
 * Maps only Effect defects into Panic. Typed diagnostics retain identity and
 * interruption remains Effect cancellation.
 */
export const catchPanic = <A, R>(effect: Effect.Effect<A, Error, R>): Effect.Effect<A, Error, R> =>
  Effect.catchDefect(effect, (defect) => Effect.fail(panic(defect)));

export { Code } from "./codes.js";
export { print } from "./render.js";
