import { Cause, Data, Option, Schema } from "effect";

/**
 * Flow's closed list of diagnostic codes. A code outside it is a defect in Flow.
 */
export const Code = Schema.Literals([
  "SchemaValidation",
  "InvalidConfiguration",
  "InvariantViolation",
  "Defect",
  "GuardDefect",
  "Interruption",
  "CleanupFailed",
  "UnencodableValue",
  "TwoDefaults",
  "ImpureDefault",
  "IdentityFieldOptional",
  "ReservedStateName",
  "UnknownNotUncertain",
  "RestoreMissingInput",
  "InputFieldForm",
  "ScheduleLeadsToWrite",
  "AsksForever",
  "RuntimeNotReady",
  "RuntimeDisposed",
  "IdentityExhausted",
  "ConflictingActorRef",
  "ForeignActorRef",
  "MissingContextProvider",
  "ContextCycle",
  "BlockedByDependents",
  "InvalidEvent",
  "AdmissionOverloaded",
  "SendTargetAbsent",
  "RecordUndecodable",
  "EndedWithWork",
  "TurnStorm",
  "InvalidKey",
  "InvalidWrite",
  "SharedContract",
  "DuplicatePlacement",
  "VerbMismatch",
  "KeyRequired",
  "UnresolvedHold",
  "KeyOmitsInput",
  "KeyFieldOptional",
  "UnusedOperation",
  "ReservedReason",
  "PreviousIsCurrent",
  "OldVersionLane",
  "DuplicateSession",
  "FeedUnhandled",
  "ListenNeedsEvery",
  "DuplicateListen",
  "SharedFills",
  "FillsNotPerKey",
  "UnboundedBridge",
  "SelectedNoKey",
  "ValuesWhileDown",
  "RegistrationChurn",
  "ReleaseOverdue",
  "ProofWithoutPosition",
  "PingsWithoutLive",
  "IdleWithoutPing",
  "DeliveryDenied",
  "FillsUntouched",
  "FillsOtherKey",
  "UserClosure",
  "HiddenOrder",
  "HiddenFilter",
  "UndeclaredEffect",
  "GoneWithoutKey",
  "GuardedUnbound",
  "GuardedWithoutVersion",
  "GuardedWithoutTarget",
  "PredictionNotRetained",
  "Stale",
  "RecordHeld",
  "RepairOverdue",
  "UnsettledEvicted",
  "GuardContradicted",
  "InputDecodeFailed",
  "StorageFailure",
  "StorageSilent",
  "NonDurableContextProvider",
  "RecordShapeChanged",
  "FieldDropped",
  "HoldWithoutRecord",
  "OldVersionActor",
  "UnboundLane",
  "LaneRekeyed",
  "OpRenamed",
  "LaneRekeyCollision",
  "HoldForgotten",
  "SecondTabNoPersistence",
  "EntryLoadFailed",
  "EntryMismatch",
  "ServerOnlyImport",
  "DehydratePersistentSetup",
  "DehydrateUnsettled",
  "ConcurrentCapture",
  "DehydrateCommitInFlight",
  "DehydrateTooLarge",
  "HydrateOutsideProvider",
  "HydrationCrossRequest",
  "HydrationScopeMismatch",
  "HydrationIncompatible",
  "HydrationMalformed",
  "HydrationRejected",
  "StoryTurnLimit",
  "InvalidDuration",
  "HostTimeWait",
  "StoryInvalidCommand",
  "SubjectAbsent",
  "AmbiguousRead",
  "StoryFakeError",
  "FramesTruncated",
  "PropertyTestFailed",
  "PropertyDefect",
  "DuplicateFixture",
  "UnusedWireRule",
  "CodecBoundExceeded",
  "CodecMalformed",
  "CodecSchemaMismatch",
  "InvalidInspectorCapacity",
  "InspectorAlreadyAttached",
  "InspectorSinkFailed",
  "InvalidTraceRecord",
  "InvalidLifecycleTransition",
  "InvalidStoryEvidence",
  "ArtifactIdentityMismatch",
  "InvalidArtifactOperand",
  "UnknownSelector",
  "TypeFactsUnavailable",
  "InvalidUsage",
  "ConfigLoadFailed",
  "OutputFailed",
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

const DEFECTS: ReadonlySet<Code> = new Set<Code>([
  "InvariantViolation",
  "Defect",
  "GuardDefect",
  "EntryMismatch",
  "ServerOnlyImport",
  "HydrateOutsideProvider",
  "HydrationCrossRequest",
]);

// FLOW_STATE_ALLOW_UNKNOWN: a failure Flow wraps is whatever its source raised.
const classify = (code: Code, cause: Option.Option<unknown>) => {
  if (DEFECTS.has(code)) return "Defect" as const;

  if (code === "Interruption") return "Interruption" as const;

  if (Option.isNone(cause) || !Cause.isCause(cause.value)) return "Failure" as const;

  if (Cause.hasDies(cause.value)) return "Defect" as const;

  return Cause.hasFails(cause.value) ? ("Failure" as const) : ("Interruption" as const);
};

/**
 * What a diagnostic says, before Flow classifies it.
 */
export type Finding = {
  readonly code: Code;
  readonly path: ReadonlyArray<string | number>;
  readonly details?: Readonly<Record<string, string | number | boolean | null>>;
  readonly summary: string;
  readonly help: string;
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
}> {}

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
