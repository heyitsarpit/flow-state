# Artifact wire contract

Status: enhanced-format package-private wire notation mirror; not an exported package API.

`PERSISTENCE_AND_ARTIFACTS.md` is the sole semantic and schema authority for WIRE-020A/B, including the exact
nested wire rules and when artifacts are captured, validated, and published. This file is the enhanced-format
relocated notation mirror used by Story and CLI; it does not extend or override `PERSISTENCE_AND_ARTIFACTS.md`,
and any mismatch resolves to that file. The aliases below preserve its transferred v2 decoded model as
TypeScript-like notation for implementation and proof; they are not public types.

## Surface and rule

- Surface: package-private behavior/trace v2 envelopes, decoded Story evidence, closed diagnostics, and CLI results.
- Rule: One canonical decoded model feeds artifact validation, Story evidence, CLI text, and CLI JSON. This
  notation mirrors every nested field and discriminant from `PERSISTENCE_AND_ARTIFACTS.md`; callers do not add
  envelope members or alternate unions.
- Accepts: Stable IDs, bounded canonical carriers, exact nullable fields, closed operation facts, lifecycle
  tuples, and command-specific result discriminants defined below.
- Rejects: callbacks, Effects, fixtures, runtime actors, live refs, runtime state, unknown members, missing
  nullable fields, duplicate keys, legacy `final`/`children`/Scenario/v1 shapes, and malformed operation facts.
- Observable guarantee: Decoding fails before application or Runtime acquisition with the closed diagnostic
  and exact path; successful envelopes are deeply frozen package-private values.
- Proof: `PERSISTENCE_AND_ARTIFACTS.md` WIRE-014–020 and `PROOF_MATRIX.md` PROOF-010/014.
- Trace: WIRE-020A, WIRE-020B; `CLI.md` CLI-007/CLI-008.

## Canonical carrier and identity

```ts
type StableId = string;
type RunLocalId = string;
type ActorIncarnationId = string;
type Nullable<T> = T | null;
type StringList = readonly string[];

// Accepted only when Number.isSafeInteger(value) && value >= 0.
type NonNegative = number;

type CanonicalCarrier =
  | null
  | string
  | boolean
  | number
  | readonly CanonicalCarrier[]
  | { readonly [key: string]: CanonicalCarrier };
```

Serialized artifact-carrier encoding rejects non-finite numbers, negative zero, lone surrogates, duplicate keys, accessors,
sparse arrays, cycles, reserved prototype keys, unsupported prototypes, and values outside the structural
bounds in `PERSISTENCE_AND_ARTIFACTS.md` WIRE-014–016. Object keys and ID-indexed arrays use the UTF-8
byte comparator; authored child, event, checkpoint, record, Cause-reason, and fact order is retained.
Canonical operation keys normalize `-0` to numeric `0` before the general artifact walker, so WIRE-016
sees canonical `0` and does not reject a canonical key for negative zero. The negative-zero rejection
above applies to serialized artifact carriers.

## Behavior artifact

```ts
type Slot = {
  machineId: StableId;
  stateId: StableId;
  kind: "activity" | "timer";
  name: StableId;
};
type Requirement = { id: StableId; operationIds: StringList };
type StateNode =
  | { token: StableId; kind: "leaf"; default: null; states: readonly [] }
  | { token: StableId; kind: "compound"; default: StableId; states: readonly StateNode[] };
type ContextRequirement = { key: StableId; providerMachineId: StableId; providerRef: Nullable<StableId> };
type Operation = { id: StableId; kind: "resource" | "transaction" | "stream"; requirementIds: StringList };
type BehaviorMachine = {
  machineId: StableId;
  moduleId: StableId;
  default: StableId;
  states: readonly StateNode[];
  events: StringList;
  contextRequirements: readonly ContextRequirement[];
  operations: readonly Operation[];
  activitySlots: readonly Slot[];
  timerSlots: readonly Slot[];
};
type StorySummary =
  | { id: StableId; kind: "app"; machineId: null; title: Nullable<string>; description: Nullable<string>; tags: StringList }
  | { id: StableId; kind: "machine"; machineId: StableId; title: Nullable<string>; description: Nullable<string>; tags: StringList };
type BehaviorArtifact = {
  kind: "behavior-contract";
  version: "flow-state/behavior-contract.v2";
  appId: StableId;
  persistenceVersion: string;
  appPlanFingerprint: string;
  requirements: readonly Requirement[];
  modules: readonly { id: StableId; machineIds: StringList }[];
  machines: readonly BehaviorMachine[];
  stories: readonly StorySummary[];
};
```

Behavior artifacts contain declarations, requirements, module ownership, plan identity, and Story metadata
only. They contain no callbacks, Effects, fixtures, runtime actors, live refs, or runtime state. The private
fingerprint is lowercase hexadecimal SHA-256 over the exact canonical UTF-8 JSON encoding, without a trailing
newline, of `{ appId, persistenceVersion, requirements, modules, machines }` after ID-indexed sorting and
semantic-order preservation; `stories` are metadata and are not part of the plan preimage. The package-private
behavior builder owns the preimage and the encoder recomputes and verifies the emitted field. Import compares
the decoded fingerprint with the receiving compiled AppPlan and rejects a mismatch as
`ArtifactIdentityMismatch`; no fingerprint or collision-resolution API is public. `requirements` is the
normalized package-private static requirement table: it emits one record per static requirement identity,
and every operation requirement ID MUST resolve to exactly one record. Empty/duplicate/unresolved IDs,
duplicate machine values, duplicate module ownership, missing module references, invalid direct-child
defaults, duplicate operation or slot IDs, invalid Story metadata, malformed trace records, impossible
lifecycle tuples, and inconsistent Story evidence reject with the closed diagnostics below. Actor recipes are
run-local construction inputs and are not artifact Story kinds.

## Cause, diagnostics, and Story evidence

```ts
type CauseReasonProjection =
  | { _tag: "Fail"; error: CanonicalCarrier }
  | { _tag: "Die"; defect: CanonicalCarrier | { _tag: "Error"; name: string; message: string } }
  | { _tag: "Interrupt"; fiberOrdinal: NonNegative };
type CauseProjection = { reasons: readonly CauseReasonProjection[] };
type DiagnosticCode =
  | "InvalidCommand" | "InvalidOption" | "InvalidSelector" | "UnknownSelector"
  | "InvalidArtifactOperand" | "InvalidProjectRoot" | "ManifestNotFound" | "InvalidManifest"
  | "InvalidGatewayFile" | "GatewayEscape" | "UnsupportedGatewayImport" | "UndeclaredGatewayImport"
  | "PackageIdentityMismatch" | "InvalidGatewayExport" | "MixedAppBehavior" | "StoryNotFound"
  | "WrongArtifactKind" | "UnsupportedArtifactVersion" | "MalformedUtf8" | "MalformedJson"
  | "DuplicateJsonKey" | "DecompressionFailed" | "CompressedInputBoundExceeded"
  | "DecompressedOutputBoundExceeded" | "CanonicalEncodingBoundExceeded" | "StructuralBoundExceeded"
  | "InvalidCanonicalValue" | "InvalidDescriptorId" | "DuplicateDescriptorId" | "DuplicateMachineValue"
  | "DuplicateModuleOwnership" | "MissingModuleReference" | "InvalidStateDefault"
  | "UnresolvedRequirementId" | "InvalidStoryMetadata" | "InvalidTraceRecord"
  | "InvalidLifecycleTransition" | "InvalidStoryEvidence" | "ArtifactIdentityMismatch"
  | "ArtifactIncompatible" | "NonCanonicalTraceCause" | "EvidenceUnavailable" | "StoryExecutionFailed"
  | "CleanupFailed" | "ApplicationValidationFailed" | "ArtifactInputReadFailed" | "DestinationExists"
  | "UnsupportedAtomicPublication" | "ArtifactTempCreateFailed" | "ArtifactWriteFailed"
  | "ArtifactFlushFailed" | "ArtifactCloseFailed" | "ArtifactCommitFailed" | "BrokenPipe"
  | "Interrupted" | "InternalInvariant";
type UsageCode = "InvalidCommand" | "InvalidOption" | "InvalidSelector";
type GatewayCode =
  | "InvalidProjectRoot" | "ManifestNotFound" | "InvalidManifest" | "InvalidGatewayFile"
  | "GatewayEscape" | "UnsupportedGatewayImport" | "UndeclaredGatewayImport"
  | "PackageIdentityMismatch" | "InvalidGatewayExport" | "MixedAppBehavior";
type ArtifactCode =
  | "InvalidArtifactOperand" | "WrongArtifactKind" | "UnsupportedArtifactVersion" | "MalformedUtf8"
  | "MalformedJson" | "DuplicateJsonKey" | "DecompressionFailed" | "CompressedInputBoundExceeded"
  | "DecompressedOutputBoundExceeded" | "CanonicalEncodingBoundExceeded" | "StructuralBoundExceeded"
  | "InvalidCanonicalValue" | "InvalidDescriptorId" | "DuplicateDescriptorId" | "DuplicateMachineValue"
  | "DuplicateModuleOwnership" | "MissingModuleReference" | "InvalidStateDefault"
  | "UnresolvedRequirementId" | "InvalidStoryMetadata" | "InvalidTraceRecord"
  | "InvalidLifecycleTransition" | "InvalidStoryEvidence" | "ArtifactIdentityMismatch"
  | "ArtifactIncompatible" | "NonCanonicalTraceCause";
type StoryCode = "StoryNotFound";
type StoryExecutionCode = "StoryExecutionFailed";
type CleanupCode = "CleanupFailed";
type ApplicationCode = "ApplicationValidationFailed";
type IoCode =
  | "ArtifactInputReadFailed" | "DestinationExists" | "UnsupportedAtomicPublication"
  | "ArtifactTempCreateFailed" | "ArtifactWriteFailed" | "ArtifactFlushFailed" | "ArtifactCloseFailed"
  | "ArtifactCommitFailed" | "BrokenPipe";
type InterruptionCode = "Interrupted";
type InternalCode = "InternalInvariant";
type DiagnosticBase = { message: string; cause: Nullable<CauseProjection> };
type ArtifactDetails = { path: readonly (string | NonNegative)[]; limit: Nullable<NonNegative>; actual: Nullable<NonNegative> };
type Diagnostic =
  | (DiagnosticBase & { category: "usage"; code: UsageCode; details: { argument: Nullable<string> } })
  | (DiagnosticBase & { category: "gateway"; code: GatewayCode; details: { path: Nullable<string>; importSpecifier: Nullable<string> } })
  | (DiagnosticBase & { category: "artifact"; code: ArtifactCode; details: ArtifactDetails })
  | (DiagnosticBase & { category: "artifact"; code: "UnknownSelector"; details: ArtifactDetails & { selector: string } })
  | (DiagnosticBase & { category: "artifact"; code: "EvidenceUnavailable"; details: ArtifactDetails & { truncatedBeforeSequence: NonNegative } })
  | (DiagnosticBase & { category: "story"; code: StoryCode; details: { storyId: StableId } })
  | (DiagnosticBase & { category: "story-execution"; code: StoryExecutionCode; details: { storyId: StableId; failure: StoryFailure } })
  | (DiagnosticBase & { category: "cleanup"; code: CleanupCode; details: { operation: string } })
  | (DiagnosticBase & { category: "application"; code: ApplicationCode; details: { path: StringList; value: CanonicalCarrier } })
  | (DiagnosticBase & { category: "io"; code: IoCode; details: { path: Nullable<string>; operation: string; errno: Nullable<string> } })
  | (DiagnosticBase & { category: "interruption"; code: InterruptionCode; details: { kind: "signal"; signal: "SIGINT" | "SIGTERM" } | { kind: "programmatic" } })
  | (DiagnosticBase & { category: "internal"; code: InternalCode; details: { invariant: string } });
```

Diagnostic category and details are selected by the closed condition-to-code mapping, never by a generic
corrupt-artifact fallback: usage codes use `category: "usage"` and `{ argument }`; gateway codes use
`category: "gateway"` and `{ path, importSpecifier }`; artifact structural, bound, identity, decompression,
and trace codes use `category: "artifact"` and `{ path, limit, actual }`; `UnknownSelector` adds `selector`;
`EvidenceUnavailable` adds a non-null `truncatedBeforeSequence`; `StoryNotFound` uses `category: "story"`;
`StoryExecutionFailed` uses `category: "story-execution"` and the partial `StoryFailure`; cleanup,
application, I/O, interruption, and invariant codes use their matching categories and exact details above.
Invalid descriptor IDs use `InvalidDescriptorId`; duplicate IDs and duplicate operation or slot IDs use
`DuplicateDescriptorId`; duplicate machine values use `DuplicateMachineValue`; duplicate module ownership
uses `DuplicateModuleOwnership`; missing module references use `MissingModuleReference`; invalid defaults
use `InvalidStateDefault`; unresolved operation requirements use `UnresolvedRequirementId`; invalid Story
metadata uses `InvalidStoryMetadata`; malformed trace records use `InvalidTraceRecord`; impossible lifecycle
combinations use `InvalidLifecycleTransition`; inconsistent end/failure/cleanup evidence uses
`InvalidStoryEvidence`; and a mismatched plan fingerprint on import uses `ArtifactIdentityMismatch`.
Bound diagnostics retain path, limit, and actual separately from version, identity, decompression, and
application-domain failures.

```ts
type ActorLifecycle = "prepared" | "active" | "suspended" | "disposed";
type RunLocalRecipeId = { runId: RunLocalId; recipeId: RunLocalId };
type ActorEvidenceId =
  | { kind: "stable-ref"; value: StableId }
  | { kind: "story-recipe"; value: RunLocalRecipeId };
type IssueProjection = { id: StableId; kind: StableId; message: string; cause: Nullable<CauseProjection> };
type ActorSnapshotProjection = {
  state: StableId;
  memory: CanonicalCarrier;
  context: CanonicalCarrier;
  lifecycle: ActorLifecycle;
  issues: readonly IssueProjection[];
  publicationRevision: NonNegative;
  storeRevision: NonNegative;
};
type ActorEvidence = { actor: ActorEvidenceId; machineId: StableId; snapshot: ActorSnapshotProjection };
type PendingWork = {
  finite: readonly { kind: string; id: StableId }[];
  continuing: readonly { kind: string; id: StableId }[];
  nextTimerAt: Nullable<NonNegative>;
};
type RuntimeEvidence = { now: NonNegative; pendingWork: PendingWork };
type AppCheckpoint = { kind: "app"; name: string; commandIndex: NonNegative; actors: readonly ActorEvidence[]; runtime: RuntimeEvidence };
type MachineCheckpoint = { kind: "machine"; name: string; commandIndex: NonNegative; snapshot: ActorSnapshotProjection; runtime: RuntimeEvidence };
type Checkpoint = AppCheckpoint | MachineCheckpoint;
type LifecycleCause =
  | "fresh-creation" | "boot-restoration" | "attachment-commit" | "attachment-cleanup"
  | "attachment-reacquisition" | "owner-disposal" | "runtime-disposal";
type StoryFailure = {
  phase: "prepare" | "command" | "cancellation" | "cleanup" | "artifact";
  commandIndex: Nullable<NonNegative>;
  completedCheckpoints: readonly Checkpoint[];
  end: Nullable<Checkpoint>;
  diagnostic: Diagnostic;
  secondary: readonly Diagnostic[];
  cleanup: readonly Diagnostic[];
  cancellation: Nullable<{ kind: "signal"; signal: "SIGINT" | "SIGTERM" } | { kind: "programmatic" }>;
  evidence: { acceptedThrough: NonNegative; drainedThrough: NonNegative };
};
```

`StoryFailure` requires cancellation evidence exactly for the cancellation phase, and
`drainedThrough <= acceptedThrough`. Root cleanup status and `failure.cleanup` must agree. A completed
trace has `end`, `failure: null`, and complete cleanup; a failed trace has `failure` and never fabricates
successful `run.end`. The public in-process failure envelope may retain complete `Cause.Cause<unknown>`;
the wire carrier uses only `CauseProjection`. Both evidence sequence values are the last accepted/drained
runtime-global evidence sequence for the run; zero means no evidence was accepted.

## Trace records and closed operation facts

```ts
type OperationTraceIdentity = {
  operationId: StableId;
  operationKind: "resource" | "transaction" | "stream";
  actor: ActorEvidenceId;
  generation: Nullable<NonNegative>;
  occurrence: Nullable<NonNegative>;
  key: CanonicalCarrier;
};
type TraceOperationBase = { kind: "operation"; identity: OperationTraceIdentity };
type TraceRetention = { data?: never } | { data: CanonicalCarrier };
type ResourceTraceFact = TraceOperationBase & (
  | { identity: OperationTraceIdentity & { operationKind: "resource"; generation: null; occurrence: null }; status: "missing" }
  | { identity: OperationTraceIdentity & { operationKind: "resource"; generation: NonNegative }; status: "pending" }
  | { identity: OperationTraceIdentity & { operationKind: "resource"; generation: NonNegative }; status: "ready" | "refreshing"; data: CanonicalCarrier }
  | ({ identity: OperationTraceIdentity & { operationKind: "resource"; generation: NonNegative }; status: "failure"; error: CanonicalCarrier } & TraceRetention)
  | ({ identity: OperationTraceIdentity & { operationKind: "resource"; generation: NonNegative }; status: "defect"; defect: CanonicalCarrier } & TraceRetention)
  | ({ identity: OperationTraceIdentity & { operationKind: "resource"; generation: NonNegative }; status: "interrupted" } & TraceRetention)
);
type TransactionTraceFact = TraceOperationBase & (
  | { identity: OperationTraceIdentity & { operationKind: "transaction"; generation: null; occurrence: null }; status: "idle" }
  | { identity: OperationTraceIdentity & { operationKind: "transaction"; generation: NonNegative; occurrence: NonNegative }; status: "pending" }
  | { identity: OperationTraceIdentity & { operationKind: "transaction"; generation: NonNegative; occurrence: NonNegative }; status: "success"; value: CanonicalCarrier }
  | { identity: OperationTraceIdentity & { operationKind: "transaction"; generation: NonNegative; occurrence: NonNegative }; status: "failure"; error: CanonicalCarrier }
  | { identity: OperationTraceIdentity & { operationKind: "transaction"; generation: NonNegative; occurrence: NonNegative }; status: "defect"; defect: CanonicalCarrier }
  | { identity: OperationTraceIdentity & { operationKind: "transaction"; generation: NonNegative; occurrence: NonNegative }; status: "interrupted" }
  | { identity: OperationTraceIdentity & { operationKind: "transaction"; generation: NonNegative; occurrence: NonNegative }; status: "unknown"; reconcileRequired: true }
);
type StreamTraceValue =
  | { hasValue: false; latest?: never; emissionCount: 0 }
  | { hasValue: true; latest: CanonicalCarrier; emissionCount: NonNegative };
type StreamTraceFact = TraceOperationBase & (
  | ({ identity: OperationTraceIdentity & { operationKind: "stream"; generation: null; occurrence: null }; status: "idle" } & StreamTraceValue)
  | ({ identity: OperationTraceIdentity & { operationKind: "stream"; generation: NonNegative }; status: "running" | "complete" | "interrupted" } & StreamTraceValue)
  | ({ identity: OperationTraceIdentity & { operationKind: "stream"; generation: NonNegative }; status: "failure"; error: CanonicalCarrier } & StreamTraceValue)
  | ({ identity: OperationTraceIdentity & { operationKind: "stream"; generation: NonNegative }; status: "defect"; defect: CanonicalCarrier } & StreamTraceValue)
);
type TraceFact = ResourceTraceFact | TransactionTraceFact | StreamTraceFact
  | { kind: "context"; consumer: ActorEvidenceId; key: StableId; provider: ActorEvidenceId; providerRevision: NonNegative; value: CanonicalCarrier }
  | { kind: "store"; revision: NonNegative; changedRefs: StringList; value: CanonicalCarrier }
  | { kind: "timer"; timerId: StableId; dueAt: NonNegative; status: StableId }
  | { kind: "issue"; issueId: StableId; source: StableId; value: CanonicalCarrier };
type TraceRecordBase = {
  sequence: NonNegative;
  actor: ActorEvidenceId;
  actorIncarnation: ActorIncarnationId;
  appId: StableId;
  appPlanFingerprint: string;
  publicationRevision: NonNegative;
  machineTurnRevision: NonNegative;
  snapshot: ActorSnapshotProjection;
  timestamp: NonNegative;
};
type TurnRecordProjection = TraceRecordBase & { kind: "turn"; cause: Nullable<CauseProjection>; facts: readonly TraceFact[] };
type LifecycleRecordProjection = TraceRecordBase & (
  | { kind: "lifecycle"; event: "actor:restore"; from: "prepared"; to: "prepared"; cause: "boot-restoration" }
  | { kind: "lifecycle"; event: "actor:start"; from: "prepared"; to: "active"; cause: "fresh-creation" | "boot-restoration" | "attachment-commit" }
  | { kind: "lifecycle"; event: "actor:suspend"; from: "active"; to: "suspended"; cause: "attachment-cleanup" }
  | { kind: "lifecycle"; event: "actor:resume"; from: "suspended"; to: "active"; cause: "attachment-reacquisition" }
  | { kind: "lifecycle"; event: "actor:dispose"; from: "prepared" | "active" | "suspended"; to: "disposed"; cause: "owner-disposal" | "runtime-disposal" }
);
type TraceRecord = TurnRecordProjection | LifecycleRecordProjection;
```

Operation facts are the closed projection of the exact resource, transaction, and stream state unions in
`PUBLIC_API.md` API-006; they are not a generic status/value record. Missing and idle lanes have `null`
generation and `null` occurrence. Resource and stream lanes carry a generation except when missing or idle;
a trace occurrence is either `null` or a non-negative value and is present when the owning kernel has an
associated finite/declaration occurrence. Transaction non-idle lanes carry both generation and occurrence.
`hasValue`, `latest`, and `emissionCount` follow the stream value union. Failure, defect, success, unknown,
and retention fields are present only on the matching discriminant. Raw Effect `Cause` never enters these
carriers. The WIRE-020B decoder rejects missing, extra, or inconsistent fields—including impossible
generation, occurrence, retention, `latest`, or `reconcileRequired` combinations—with `InvalidTraceRecord`
before application or Runtime acquisition.

## Trace and CLI envelopes

```ts
type TraceArtifactBase = {
  kind: "trace-artifact";
  version: "flow-state/trace-artifact.v2";
  storyId: StableId;
  appId: StableId;
  persistenceVersion: string;
  appPlanFingerprint: string;
  capturedAt: NonNegative;
  truncatedBeforeSequence: Nullable<NonNegative>;
  records: readonly TraceRecord[];
  checkpoints: readonly Checkpoint[];
};
type TraceArtifact =
  | (TraceArtifactBase & { outcome: "completed"; end: Checkpoint; failure: null; cleanup: { status: "complete" } })
  | (TraceArtifactBase & { outcome: "failed"; end: Nullable<Checkpoint>; failure: StoryFailure; cleanup: { status: "complete" } | { status: "failed"; diagnostics: readonly Diagnostic[] } });
type CliCommand =
  | "behavior.build" | "behavior.render" | "behavior.diff" | "behavior.check"
  | "story.list" | "story.describe" | "story.run"
  | "trace.summarize" | "trace.proof" | "trace.diff";
type DiffSection = { name: string; equal: boolean; lines: StringList };
type EqualDiffData = { equal: true; sections: readonly DiffSection[] };
type DifferentDiffData = { equal: false; sections: readonly DiffSection[] };
type TraceDiffData =
  | { equal: true; complete: true; sections: readonly DiffSection[] }
  | { equal: false; complete: true; sections: readonly DiffSection[] }
  | { equal: true; complete: false; sections: readonly DiffSection[] }
  | { equal: false; complete: false; sections: readonly DiffSection[] };
type TraceSummaryData =
  | { complete: true; truncatedBeforeSequence: null; counts: { records: NonNegative; issues: NonNegative; actors: NonNegative }; timeline: readonly { sequence: NonNegative; actor: ActorEvidenceId; summary: string }[] }
  | { complete: false; truncatedBeforeSequence: NonNegative; counts: { records: NonNegative; issues: NonNegative; actors: NonNegative }; timeline: readonly { sequence: NonNegative; actor: ActorEvidenceId; summary: string }[] };
type TraceProofData = { selector: string; complete: true; evidence: readonly { sequence: NonNegative; actor: ActorEvidenceId; facts: readonly TraceFact[] }[] };
type CliDataByCommand = {
  "behavior.build": { artifact: BehaviorArtifact; appId: StableId; appPlanFingerprint: string };
  "behavior.render": { appId: StableId; moduleId: Nullable<StableId>; section: "contract" | "coverage"; lines: StringList };
  "behavior.diff": EqualDiffData | DifferentDiffData;
  "behavior.check": EqualDiffData | DifferentDiffData;
  "story.list": { stories: readonly StorySummary[] };
  "story.describe": { story: StorySummary };
  "story.run": { storyId: StableId; checkpoints: readonly Checkpoint[]; end: Checkpoint; failure: null; traceOutput: Nullable<string> };
  "trace.summarize": TraceSummaryData;
  "trace.proof": TraceProofData;
  "trace.diff": TraceDiffData;
};
type CliData = CliDataByCommand[CliCommand];
type CliEnvelope<C extends CliCommand, O extends string, D> = { version: "flow-state/cli-result.v2"; kind: "result"; command: C; outcome: O; data: D };
type CliResultByCommand = {
  "behavior.build": CliEnvelope<"behavior.build", "completed", CliDataByCommand["behavior.build"]>;
  "behavior.render": CliEnvelope<"behavior.render", "completed", CliDataByCommand["behavior.render"]>;
  "behavior.diff": CliEnvelope<"behavior.diff", "equal", EqualDiffData> | CliEnvelope<"behavior.diff", "different", DifferentDiffData>;
  "behavior.check": CliEnvelope<"behavior.check", "equal", EqualDiffData> | CliEnvelope<"behavior.check", "different", DifferentDiffData>;
  "story.list": CliEnvelope<"story.list", "completed", CliDataByCommand["story.list"]>;
  "story.describe": CliEnvelope<"story.describe", "completed", CliDataByCommand["story.describe"]>;
  "story.run": CliEnvelope<"story.run", "completed", CliDataByCommand["story.run"]>;
  "trace.summarize": CliEnvelope<"trace.summarize", "completed", Extract<TraceSummaryData, { complete: true }>> | CliEnvelope<"trace.summarize", "incomplete", Extract<TraceSummaryData, { complete: false }>>;
  "trace.proof": CliEnvelope<"trace.proof", "completed", TraceProofData>;
  "trace.diff":
    | CliEnvelope<"trace.diff", "equal", { equal: true; complete: true; sections: readonly DiffSection[] }>
    | CliEnvelope<"trace.diff", "different", { equal: false; complete: true; sections: readonly DiffSection[] }>
    | CliEnvelope<"trace.diff", "different", { equal: false; complete: false; sections: readonly DiffSection[] }>
    | CliEnvelope<"trace.diff", "incomplete", { equal: true; complete: false; sections: readonly DiffSection[] }>;
};
type CliResult = CliResultByCommand[CliCommand];
type CliError = { version: "flow-state/cli-result.v2"; kind: "error"; command: Nullable<CliCommand>; diagnostic: Diagnostic; secondary: readonly Diagnostic[] };
```

`TraceArtifact.truncatedBeforeSequence` is null only for a complete retained prefix. A non-null value marks the first omitted
runtime-global sequence, the earliest sequence not retained, under the retained window convention. Artifact files use canonical stable-key UTF-8
JSON with one trailing newline; text and JSON CLI output are projections of these envelopes, never second
schema authorities. Comparison commands use `equal`, `different`, or `incomplete`; `trace.summarize` uses
`completed` or `incomplete`; `trace.proof` requires complete evidence. A truncated proof returns `CliError`
with `EvidenceUnavailable`. Every nullable field is serialized as `null`; unknown members and duplicate keys
reject before projection. The envelope `command` member discriminates the `data` union and is not serialized
a second time inside `data`. A successful `story.run` has `outcome: "completed"`, a non-null `end`, and
`failure: null`; execution, cancellation, cleanup, and trace-write failures use `CliError` with the partial
Story failure in the primary diagnostic and ordered `secondary` diagnostics. The envelopes are deeply frozen
and remain package-private. Artifact input is stable-key UTF-8 JSON or exactly one gzip member; concatenated
gzip members and trailing bytes reject as `DecompressionFailed`, and compressed and decompressed streams
are each capped at 2,097,152 bytes.

At the trace envelope boundary, `TraceArtifact.truncatedBeforeSequence` is `null` exactly when the trace contains the
complete retained prefix; a non-null value marks the first omitted runtime-global sequence under the retained
window convention. Decoding rejects a missing or inconsistent truncation marker, and summary projection
preserves the same null/non-null distinction.

The WIRE-018 inspection `snapshot()` field named `truncatedBeforeSequence` has a different meaning: it is
the greatest dropped or explicitly cleared runtime-global sequence. The inspection marker and the
`TraceArtifact` marker are different surfaces and are not interchangeable. Export derives the trace
marker from the first sequence omitted by the trace's retained prefix; it does not copy the inspection
marker or apply a fixed increment/decrement, and the contract defines no arithmetic conversion between
the fields. Decoders apply the meaning owned by their surface, preventing the inspection
greatest-dropped value from being read as the trace first-omitted value.

Trace artifacts preserve ordered records and checkpoints. In-process named checkpoint lookup is serialized
as an ordered array and duplicate checkpoint names reject. A completed artifact has a non-null `end`,
`failure: null`, and complete cleanup; a failed artifact has a non-null `failure`, and its root cleanup
status agrees with the failure cleanup diagnostics. `end` is named `end`, never `final`, and never implies
actor completion. Opaque application memory, event payloads, operation values/errors, and diagnostic carriers
use the owning application codec and bounded canonical carrier walker; they contain no callbacks, Effects,
fibers, Queues, Scopes, actor handles, or live refs. Legacy `final`, `children`, Scenario, and v1 trace
shapes reject before projection.
