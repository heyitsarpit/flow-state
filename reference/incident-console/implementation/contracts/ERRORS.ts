/**
 * Normative diagnostic contract for Flow State.
 *
 * `Diagnostic` is the one package-owned diagnostic value. Its structured fields
 * are the compatibility surface; human text is deliberately replaceable. This
 * file records the boundary shape and composition laws. It is not a second
 * runtime, logger, service, Layer, or Effect wrapper.
 */

import { Schema } from "effect";
import type { Cause, Effect, Exit, Result } from "effect";

/** A path into the value, configuration, or operation that failed. */
export type DiagnosticPath = readonly (string | number)[];

/** The existing public spelling remains an alias of the diagnostic path. */
export type FlowPath = DiagnosticPath;

/** Values safe to retain in stable machine-readable diagnostic details. */
export type DiagnosticScalar = string | number | boolean | null;

/** Structured details are stable data; they are never parsed from human text. */
export type DiagnosticDetails = Readonly<Record<string, DiagnosticScalar>>;

/** Effect's three meaningful failure classes after complete-cause inspection. */
export type DiagnosticClassification = "Failure" | "Defect" | "Interruption";

/**
 * The exact public usage/admission codes transferred by API-002A.
 *
 * This union remains exactly eighteen members. Other diagnostic codes below
 * cover package-private structural, artifact, persistence, and host failures.
 */
export type FlowUsageCode =
  | "InvalidCanonicalValue"
  | "ForeignActorRef"
  | "MismatchedActorRef"
  | "MissingActorRef"
  | "DisposedActorRef"
  | "RuntimeNotReady"
  | "RuntimeDisposed"
  | "MissingContextProvider"
  | "ContextDependencyCycle"
  | "DuplicateActorClaim"
  | "UnadmittedMachine"
  | "ActorNotActive"
  | "InvalidOperationPlan"
  | "WrongOperationKind"
  | "OperationNotPending"
  | "OperationAlreadySettled"
  | "DuplicateStreamDeclaration"
  | "BlockedByDependents";

/**
 * Closed diagnostic code set shared by synchronous, Effect, evidence, and CLI
 * boundaries. Human summaries and help text do not add codes.
 */
export type DiagnosticCode =
  | FlowUsageCode
  | "InvalidMachineConfiguration"
  | "SchemaValidation"
  | "SemanticValidation"
  | "InvalidDescriptorId"
  | "DuplicateDescriptorId"
  | "DuplicateMachineValue"
  | "DuplicateModuleOwnership"
  | "MissingModuleReference"
  | "InvalidStateDefault"
  | "UnresolvedRequirementId"
  | "InvalidStoryMetadata"
  | "InvalidTraceRecord"
  | "InvalidLifecycleTransition"
  | "InvalidStoryEvidence"
  | "InvalidArtifactOperand"
  | "WrongArtifactKind"
  | "ArtifactIdentityMismatch"
  | "DecompressionFailed"
  | "BoundExceeded"
  | "StorageFailure"
  | "CodecFailure"
  | "IdentityVersionMismatch"
  | "MalformedData"
  | "ConcurrentCapture"
  | "NonDurableContextProvider"
  | "CleanupFailed"
  | "IoFailure"
  | "InvariantViolation"
  | "Defect"
  | "Interruption";

/**
 * The one package-owned diagnostic. The class is the executable Schema codec,
 * a real Error, and a directly yieldable Effect failure; there is no wrapper or
 * second expected-error family.
 */
export declare class Diagnostic extends Schema.TaggedError<Diagnostic>("flow-state/Diagnostic")(
  "Diagnostic",
  {
    classification: Schema.Literals(["Failure", "Defect", "Interruption"] as const),
    code: Schema.Literals([
      "InvalidCanonicalValue",
      "ForeignActorRef",
      "MismatchedActorRef",
      "MissingActorRef",
      "DisposedActorRef",
      "RuntimeNotReady",
      "RuntimeDisposed",
      "MissingContextProvider",
      "ContextDependencyCycle",
      "DuplicateActorClaim",
      "UnadmittedMachine",
      "ActorNotActive",
      "InvalidOperationPlan",
      "WrongOperationKind",
      "OperationNotPending",
      "OperationAlreadySettled",
      "DuplicateStreamDeclaration",
      "BlockedByDependents",
      "InvalidMachineConfiguration",
      "SchemaValidation",
      "SemanticValidation",
      "InvalidDescriptorId",
      "DuplicateDescriptorId",
      "DuplicateMachineValue",
      "DuplicateModuleOwnership",
      "MissingModuleReference",
      "InvalidStateDefault",
      "UnresolvedRequirementId",
      "InvalidStoryMetadata",
      "InvalidTraceRecord",
      "InvalidLifecycleTransition",
      "InvalidStoryEvidence",
      "InvalidArtifactOperand",
      "WrongArtifactKind",
      "ArtifactIdentityMismatch",
      "DecompressionFailed",
      "BoundExceeded",
      "StorageFailure",
      "CodecFailure",
      "IdentityVersionMismatch",
      "MalformedData",
      "ConcurrentCapture",
      "NonDurableContextProvider",
      "CleanupFailed",
      "IoFailure",
      "InvariantViolation",
      "Defect",
      "Interruption",
    ] as const),
    path: Schema.Array(Schema.Union([Schema.String, Schema.Finite])),
    details: Schema.Record(
      Schema.String,
      Schema.Union([Schema.String, Schema.Finite, Schema.Boolean, Schema.Null]),
    ),
    summary: Schema.String,
    help: Schema.String,
  },
) {}

/** The encoded document type is derived from the canonical Schema class. */
export type DiagnosticDocument = Schema.Codec.Encoded<typeof Diagnostic>;

/** A usage diagnostic is the only diagnostic that may become FlowUsageError. */
export type UsageDiagnostic = Diagnostic & {
  readonly classification: "Failure";
  readonly code: FlowUsageCode;
};

/**
 * Machine-configuration rejection reasons are closed. The path and details
 * distinguish the exact field, token, or value without inventing source lines.
 */
export type InvalidMachineConfigurationReason =
  | "ConfigurationNotRecord"
  | "NonStringConfigurationKey"
  | "UnexpectedConfigurationField"
  | "StateConfigurationMismatch"
  | "ExpectedFunction"
  | "UnknownStateToken"
  | "UnknownEventToken"
  | "InvalidStateToken"
  | "TransitionObjectRequired"
  | "ExpectedTransition"
  | "ExpectedEventHandlers"
  | "UnknownEventHandler"
  | "EmptyEventHandlerList"
  | "EmptyRedirectList"
  | "ExpectedRedirect"
  | "ExpectedTimer"
  | "InvalidTimerDelay"
  | "ExpectedActivities"
  | "ExpectedStateConfiguration"
  | "MissingCompoundStateFields"
  | "InvalidDefaultTarget"
  | "ExpectedLeafConfiguration"
  | "InvalidCompoundState"
  | "InvalidTokenTables"
  | "AmbiguousHandler";

/**
 * Existing synchronous public boundary. Its constructor shape remains the
 * API-002A shape; callers discriminate by `_tag` and `code`, never `message`.
 */
export declare class FlowUsageError extends Error {
  readonly _tag: "FlowUsageError";
  readonly code: FlowUsageCode;
  readonly path: FlowPath;
  readonly details: DiagnosticDetails;

  constructor(code: FlowUsageCode, path?: FlowPath, details?: DiagnosticDetails);
}

/**
 * Compatibility-only terminal host envelope. Persistence, codec, identity, and
 * restoration failures remain canonical Diagnostic values in Result/Effect E;
 * this name is never a second expected-error family.
 */
export declare class FlowPersistenceError extends Error {}

/**
 * Serialization may use this historical label, but it is an alias and not a
 * second diagnostic model or authority.
 */
export type DiagnosticProjection = Diagnostic;

/**
 * Decode untrusted structure with one service-free private Effect Schema and
 * translate only SchemaError failures into the package-owned diagnostic value.
 * The result is plain data; no Effect is executed by this boundary.
 */
export declare const decodeStructure: <S extends Schema.ConstraintDecoder<unknown, never>>(
  schema: S,
  input: unknown,
) => Result.Result<S["Type"], Diagnostic>;

/** Map a semantic Result failure without throwing or widening its success type. */
export declare const mapResultFailure: <A, E>(
  result: Result.Result<A, E>,
  project: (failure: E) => Diagnostic,
) => Result.Result<A, Diagnostic>;

/** Pure machine and definition compilation carries this same value directly. */
export declare const invalidMachineConfigurationDiagnostic: (
  reason: InvalidMachineConfigurationReason,
  path: DiagnosticPath,
  details?: DiagnosticDetails,
) => Diagnostic;

/** The result shape owned by pure definition/machine semantic compilation. */
export type CompilationResult<A> = Result.Result<A, Diagnostic>;

/**
 * Map one understood typed Effect failure at its owning boundary. `A` and `R`
 * are preserved exactly; defects and interruption remain in the Effect Cause.
 */
export declare const mapEffectFailure: <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  project: (failure: E) => Diagnostic,
) => Effect.Effect<A, Diagnostic, R>;

/** The Effect shape after a boundary intentionally translates typed failures. */
export type DiagnosticEffect<A, R> = Effect.Effect<A, Diagnostic, R>;

/** Convert only a usage/admission diagnostic at the synchronous JS boundary. */
export declare const toFlowUsageError: (diagnostic: UsageDiagnostic) => FlowUsageError;

/*
 * Cause/Exit classification is package-private. It retains the complete Exit
 * and Cause until cleanup and evidence aggregation finish. The only public
 * classes permitted to carry that raw Cause are FlowDisposeError and
 * FlowStoryExecutionError, as specified by the other active contracts.
 */
type ClassifiedFailure<A, E> = {
  readonly classification: DiagnosticClassification;
  readonly exit: Exit.Exit<A, E>;
  readonly cause: Cause.Cause<E>;
  readonly diagnostics: readonly Diagnostic[];
};

declare const classifyCause: <A, E>(exit: Exit.Exit<A, E>) => ClassifiedFailure<A, E>;

/**
 * The renderer is shared by all diagnostic owners. It must emit safe
 * Rust-like text such as `error[Code] at path: summary` followed by actionable
 * `help:` text, escape path/detail values, and never invent a file, line, or
 * column. ANSI, stack traces, raw input, and raw Cause are not renderer input.
 */
export declare const renderDiagnostic: (diagnostic: Diagnostic) => string;

/** Formatting policy is separate from the canonical Schema and its fields. */
export interface DiagnosticPrinter {
  readonly compact: (diagnostic: Diagnostic) => string;
  readonly pretty: (diagnostic: Diagnostic) => string;
}

export declare const DiagnosticPrinter: DiagnosticPrinter;
export declare const renderDiagnosticCompact: (diagnostic: Diagnostic) => string;
export declare const renderDiagnosticPretty: (diagnostic: Diagnostic) => string;

/*
 * Composition laws
 *
 * - Schema.decodeUnknownResult(schema)(input) is the structural decoder. Its
 *   SchemaError is mapped to Diagnostic with the issue path and safe details;
 *   its decoded value is never re-decoded by machine compilation.
 * - Result carries semantic validation and compilation failures explicitly.
 *   Result.isFailure narrows the failure branch; no generic Error is used for
 *   expected invalid configuration.
 * - Effect.mapError is the typed E -> Diagnostic boundary and preserves A/R.
 *   Effect.runPromiseExit retains an Exit, while Exit.isFailure exposes the
 *   complete Cause for classification.
 * - Cause Fail, Die, and Interrupt remain distinguishable. Classification
 *   precedence is defect, typed failure, then interruption-only. Cause.squash
 *   is forbidden before the intentionally lossy synchronous JS boundary.
 * - FlowUsageError is synchronous and carries only stable usage code/path/
 *   details plus evolving Error.message remediation. No public diagnostic
 *   service, Context.Service, Layer, Logger, or custom Effect wrapper exists.
 */

/*
 * Source-backed examples (illustrative; undeclared schemas and compilers are
 * owned by their feature contracts and this file adds no overloads):
 *
 * const decoded = decodeStructure(MachineSchema, authored);
 * const compiled = mapResultFailure(decoded, (failure) =>
 *   invalidMachineConfigurationDiagnostic(
 *     "UnexpectedConfigurationField",
 *     ["states", "ACTIVE"],
 *     { field: "debug" },
 *   ),
 * );
 *
 * const load: Effect.Effect<Machine, MachineFailure, RuntimeServices> = ...;
 * const publicLoad = mapEffectFailure(load, diagnosticForMachineFailure);
 *
 * const exit = await Effect.runPromiseExit(publicLoad);
 * if (Exit.isFailure(exit)) {
 *   // retain exit.cause for classification; renderDiagnostic receives only
 *   // the resulting stable Diagnostic projection.
 * }
 */
