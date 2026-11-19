import { Cause, Data, Option, Schema } from "effect";

/**
 * Flow's closed list of diagnostic codes: the ones Flow produces. A code outside it is a defect in
 * Flow; a feature that produces a new code adds it here.
 */
export const Code = Schema.Literals([
  "SchemaValidation",
  "InvalidConfiguration",
  "Defect",
  "GuardDefect",
  "TwoDefaults",
  "ImpureDefault",
  "IdentityFieldOptional",
  "ReservedStateName",
  "UnknownNotUncertain",
  "RuntimeNotReady",
  "RuntimeDisposed",
  "ConflictingActorRef",
  "ForeignActorRef",
  "MissingContextProvider",
  "ContextCycle",
  "BlockedByDependents",
  "InvalidEvent",
  "RecordUndecodable",
  "SharedContract",
  "KeyFieldOptional",
  "StorageFailure",
  "CleanupFailed",
]);

/**
 * One of Flow's diagnostic codes.
 */
export type Code = typeof Code.Type;

/**
 * What kind of failure a diagnostic reports.
 */
export const Classification = Schema.Literals(["Failure", "Defect", "Interruption"]);

/**
 * What kind of failure a diagnostic reports.
 */
export type Classification = typeof Classification.Type;

const Detail = Schema.Union([Schema.String, Schema.Finite, Schema.Boolean, Schema.Null]);

/**
 * One finding Flow reports: its code, where it is, what was found and what to do about it.
 *
 * **Details**
 *
 * `path` names the field, identity or bound (strings or finite numbers); `details` holds safe
 * values only; `help` is the corrective action. The class is its own Schema: it encodes and decodes
 * as data, and decoding refuses an unknown code or a non-finite number.
 */
export class Diagnostic extends Schema.TaggedError<Diagnostic>()("Diagnostic", {
  classification: Classification,
  code: Code,
  path: Schema.Array(Schema.Union([Schema.String, Schema.Finite])),
  details: Schema.Record(Schema.String, Detail),
  summary: Schema.String,
  help: Schema.String,
}) {}

const DEFECTS: ReadonlySet<Code> = new Set<Code>(["Defect", "GuardDefect"]);

// FLOW_STATE_ALLOW_UNKNOWN: a failure Flow wraps is whatever its source raised.
const classify = (code: Code, cause: Option.Option<unknown>) => {
  if (DEFECTS.has(code)) return "Defect" as const;

  if (Option.isNone(cause) || !Cause.isCause(cause.value)) return "Failure" as const;

  if (Cause.hasDies(cause.value)) return "Defect" as const;

  return Cause.hasFails(cause.value) ? ("Failure" as const) : ("Interruption" as const);
};

/**
 * What a diagnostic says, before Flow classifies it.
 */
export type Finding = Pick<Diagnostic, "code" | "path" | "summary" | "help"> & {
  // oxlint-disable-next-line lint-bomb/no-optional-domain-properties -- a finding with no details is classified with none
  readonly details?: Diagnostic["details"];
};

// FLOW_STATE_ALLOW_UNKNOWN: a failure Flow wraps is whatever its source raised.
const diagnosticOf = (finding: Finding, cause: Option.Option<unknown>) =>
  new Diagnostic({
    classification: classify(finding.code, cause),
    code: finding.code,
    path: finding.path,
    details: finding.details ?? {},
    summary: finding.summary,
    help: finding.help,
  });

/**
 * Every Flow failure at a host boundary: one error with a closed code and every finding.
 *
 * **Details**
 *
 * `diagnostics` is never empty and `code` is its first entry's code: the failure that names the
 * boundary. A construction lists every violation it found, in declaration order, each with its
 * field path.
 */
export class FlowError extends Data.TaggedError("FlowError")<{
  readonly code: Code;
  readonly diagnostics: readonly [Diagnostic, ...Array<Diagnostic>];
  // FLOW_STATE_ALLOW_UNKNOWN: the failure Flow wraps, kept whole (an Effect error's standard field).
  readonly cause?: unknown;
}> {
  override get message() {
    return `${this.code}: ${this.diagnostics[0].summary}`;
  }
}

// FLOW_STATE_ALLOW_UNKNOWN: the failure Flow wraps, kept whole.
const diagnosticsOf = (
  findings: readonly [Finding, ...Array<Finding>],
  cause: Option.Option<unknown>,
) => {
  const [first, ...rest] = findings;

  return [diagnosticOf(first, cause), ...rest.map((f) => diagnosticOf(f, cause))] as const;
};

/**
 * One FlowError over its findings; its code is the first finding's.
 */
export const flowError = (findings: readonly [Finding, ...Array<Finding>]) =>
  new FlowError({ code: findings[0].code, diagnostics: diagnosticsOf(findings, Option.none()) });

/**
 * One FlowError over its findings and the failure it wraps, which classifies them.
 */
// FLOW_STATE_ALLOW_UNKNOWN: the failure Flow wraps, kept whole.
export const flowErrorOf = (findings: readonly [Finding, ...Array<Finding>], cause: unknown) =>
  new FlowError({
    code: findings[0].code,
    diagnostics: diagnosticsOf(findings, Option.some(cause)),
    cause,
  });

/**
 * An InvalidConfiguration finding with the reason it was refused.
 */
// RETURN_TYPE: the Finding protocol its callers collect.
export const invalid = (
  path: ReadonlyArray<string | number>,
  reason: string,
  summary: string,
  help: string,
): Finding => ({ code: "InvalidConfiguration", path, details: { reason }, summary, help });

/**
 * Throws a FlowError: the one way a public call refuses. Every other throw in Flow is a defect.
 */
// RETURN_TYPE: never, so a call stands in any expression.
export const raise = (error: FlowError): never => {
  throw error;
};

/**
 * Throws one FlowError listing every finding, when there is one; an invalid construction returns
 * nothing and starts nothing.
 */
export const refuse = (findings: ReadonlyArray<Finding>) => {
  const [first, ...rest] = findings;

  if (first !== undefined) raise(flowError([first, ...rest]));
};

/**
 * The finding of a public call the Runtime's life rejects: before it is ready, or after its life
 * ended, by its disposal or by a defect that stopped it.
 */
// RETURN_TYPE: the Finding protocol its callers throw.
export const lifeRejection = (
  code: "RuntimeNotReady" | "RuntimeDisposed",
  at: string,
  call: string,
  ready: string,
  ended: "dispose" | "stop",
): Finding => {
  if (code === "RuntimeNotReady")
    return {
      code,
      path: [at],
      summary: `${call} before ${ready}`,
      help: "Await runtime.ready() before using the Runtime.",
    };

  return ended === "stop"
    ? {
        code,
        path: [at],
        summary: `${call} after the Runtime stopped on a defect`,
        help: "Create a new Runtime; dispose() returns the defect that stopped this one.",
      }
    : {
        code,
        path: [at],
        summary: `${call} after dispose()`,
        help: "Create a new Runtime after disposal.",
      };
};
