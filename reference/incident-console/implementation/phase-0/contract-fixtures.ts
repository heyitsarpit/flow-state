import { Schema } from "../../../../packages/flow-state/node_modules/effect/dist/index.js";

export const NonNegativeSafeInteger = Schema.Int.check(
  Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
);

export type CanonicalCarrier =
  | null
  | string
  | boolean
  | number
  | ReadonlyArray<CanonicalCarrier>
  | Readonly<{ [key: string]: CanonicalCarrier }>;

export const CanonicalCarrier: Schema.Codec<CanonicalCarrier> = Schema.suspend(
  () =>
    Schema.Union([
      Schema.Null,
      Schema.String,
      Schema.Boolean,
      Schema.Number,
      Schema.Array(CanonicalCarrier),
      Schema.Record(Schema.String, CanonicalCarrier),
    ]) as Schema.Codec<CanonicalCarrier>,
);

const NullableString = Schema.NullOr(Schema.String);
const NullableInteger = Schema.NullOr(NonNegativeSafeInteger);
const StringArray = Schema.Array(Schema.String);
const CanonicalArray = Schema.Array(CanonicalCarrier);

export type CauseReasonProjection =
  | Readonly<{ _tag: "Fail"; error: CanonicalCarrier }>
  | Readonly<{
      _tag: "Die";
      defect: CanonicalCarrier | Readonly<{ _tag: "Error"; name: string; message: string }>;
    }>
  | Readonly<{ _tag: "Interrupt"; fiberOrdinal: number }>;

export const CauseReasonProjection: Schema.Codec<CauseReasonProjection> = Schema.Union([
  Schema.Struct({ _tag: Schema.Literal("Fail"), error: CanonicalCarrier }),
  Schema.Struct({
    _tag: Schema.Literal("Die"),
    defect: Schema.Union([
      CanonicalCarrier,
      Schema.Struct({
        _tag: Schema.Literal("Error"),
        name: Schema.String,
        message: Schema.String,
      }),
    ]),
  }),
  Schema.Struct({ _tag: Schema.Literal("Interrupt"), fiberOrdinal: NonNegativeSafeInteger }),
]);

export type CauseProjection = Readonly<{ reasons: ReadonlyArray<CauseReasonProjection> }>;

export const CauseProjection: Schema.Codec<CauseProjection> = Schema.Struct({
  reasons: Schema.Array(CauseReasonProjection),
});

export const FlowIssueSchema = Schema.Struct({
  kind: Schema.Literals(["failure", "defect", "interrupt", "cleanup", "invariant"]),
  source: Schema.Literals([
    "runtime",
    "machine",
    "resource",
    "transaction",
    "stream",
    "timer",
    "child",
  ]),
  id: Schema.String,
});

export const ResourceRefSchema = Schema.Struct({
  kind: Schema.Literal("resource"),
  descriptorId: Schema.String,
  args: CanonicalArray,
  identity: Schema.String,
});

export const TransactionRefSchema = Schema.Struct({
  kind: Schema.Literal("transaction"),
  descriptorId: Schema.String,
  key: CanonicalCarrier,
  identity: Schema.String,
});

const ResourceSnapshotSchema = Schema.Union([
  Schema.Struct({
    ref: ResourceRefSchema,
    status: Schema.Literal("idle"),
    availability: Schema.Literal("empty"),
    activity: Schema.Literal("idle"),
    freshness: Schema.Literal("stale"),
  }),
  Schema.Struct({
    ref: ResourceRefSchema,
    status: Schema.Literal("loading"),
    availability: Schema.Literal("empty"),
    activity: Schema.Literal("fetching"),
    freshness: Schema.Literal("stale"),
    generation: NonNegativeSafeInteger,
  }),
  Schema.Struct({
    ref: ResourceRefSchema,
    status: Schema.Literal("loading"),
    availability: Schema.Literal("placeholder"),
    activity: Schema.Literal("fetching"),
    freshness: Schema.Literal("stale"),
    generation: NonNegativeSafeInteger,
    value: CanonicalCarrier,
  }),
  Schema.Struct({
    ref: ResourceRefSchema,
    status: Schema.Literal("failure"),
    availability: Schema.Literal("empty"),
    activity: Schema.Literal("idle"),
    freshness: Schema.Literal("stale"),
    generation: NonNegativeSafeInteger,
    error: CanonicalCarrier,
  }),
  Schema.Struct({
    ref: ResourceRefSchema,
    status: Schema.Literals(["success", "stale"]),
    availability: Schema.Literal("value"),
    activity: Schema.Literals(["idle", "fetching"]),
    freshness: Schema.Literals(["fresh", "stale", "invalidated"]),
    generation: NullableInteger,
    value: CanonicalCarrier,
    updatedAt: NonNegativeSafeInteger,
    expiresAt: NonNegativeSafeInteger,
    invalidatedAt: NullableInteger,
  }),
]);

const TransactionSnapshotSchema = Schema.Union([
  Schema.Struct({ ref: TransactionRefSchema, status: Schema.Literal("idle") }),
  Schema.Struct({
    ref: TransactionRefSchema,
    status: Schema.Literals(["queued", "pending"]),
    generation: NonNegativeSafeInteger,
  }),
  Schema.Struct({
    ref: TransactionRefSchema,
    status: Schema.Literal("success"),
    generation: NonNegativeSafeInteger,
    value: CanonicalCarrier,
  }),
  Schema.Struct({
    ref: TransactionRefSchema,
    status: Schema.Literals(["failure", "defect", "interrupt"]),
    generation: NonNegativeSafeInteger,
  }),
]);

const StreamSnapshotSchema = Schema.Struct({
  bindingId: Schema.String,
  descriptorId: Schema.String,
  status: Schema.Literals(["idle", "running", "complete", "failure", "defect", "interrupt"]),
  generation: NullableInteger,
  value: CanonicalCarrier,
});

const TimerSnapshotSchema = Schema.Struct({
  slot: Schema.String,
  stateId: Schema.String,
  generation: NonNegativeSafeInteger,
  status: Schema.Literals(["scheduled", "fired", "interrupt"]),
  startedAt: NonNegativeSafeInteger,
  dueAt: NonNegativeSafeInteger,
  firedAt: NullableInteger,
});

const ChildSnapshotSchema = Schema.Struct({
  bindingId: Schema.String,
  actorId: Schema.String,
  machineId: Schema.String,
  generation: NonNegativeSafeInteger,
  status: Schema.Literals(["active", "complete", "failure", "defect", "interrupt"]),
  terminal: Schema.NullOr(CanonicalCarrier),
});

export const ActorSnapshotSchema = Schema.Struct({
  value: Schema.String,
  memory: CanonicalCarrier,
  revision: NonNegativeSafeInteger,
  storeRevision: NonNegativeSafeInteger,
  lifecycle: Schema.Literals(["active", "disposed"]),
  resources: Schema.Array(ResourceSnapshotSchema),
  transactions: Schema.Array(TransactionSnapshotSchema),
  streams: Schema.Array(StreamSnapshotSchema),
  timers: Schema.Array(TimerSnapshotSchema),
  children: Schema.Array(ChildSnapshotSchema),
  issues: Schema.Array(FlowIssueSchema),
});

const OverlaySchema = Schema.Struct({
  actorId: Schema.String,
  transactionId: Schema.String,
  generation: NonNegativeSafeInteger,
  value: CanonicalCarrier,
});

const StoreResourceSchema = Schema.Struct({
  ref: ResourceRefSchema,
  valueRevision: NonNegativeSafeInteger,
  value: Schema.NullOr(CanonicalCarrier),
  failure: Schema.NullOr(CanonicalCarrier),
  updatedAt: NullableInteger,
  expiresAt: NullableInteger,
  invalidatedAt: NullableInteger,
  lookupGeneration: NonNegativeSafeInteger,
  tags: StringArray,
  overlays: Schema.Array(OverlaySchema),
});

const StoreStateSchema = Schema.Struct({
  revision: NonNegativeSafeInteger,
  resources: Schema.Array(StoreResourceSchema),
});

const ActivityBootSchema = Schema.Struct({
  kind: Schema.Literals(["resource", "transaction", "stream", "timer", "child", "lease"]),
  slot: Schema.String,
  descriptorId: NullableString,
  refIdentity: NullableString,
  generation: NonNegativeSafeInteger,
  status: Schema.Literals(["active", "consumed"]),
  cursor: NullableInteger,
  params: Schema.NullOr(CanonicalCarrier),
});

const PendingOutcomeSchema = Schema.Struct({
  outcomeId: Schema.String,
  bindingId: Schema.String,
  generation: NonNegativeSafeInteger,
  eventId: Schema.String,
  outcomeKind: Schema.Literals(["success", "failure", "defect", "interrupt", "complete"]),
  sequence: NonNegativeSafeInteger,
  payload: CanonicalCarrier,
});

const ActorBootSchema = Schema.Struct({
  actorId: Schema.String,
  machineId: Schema.String,
  kind: Schema.Literals(["root", "dynamic", "child"]),
  parentActorId: NullableString,
  hostId: NullableString,
  state: Schema.String,
  memory: CanonicalCarrier,
  revision: NonNegativeSafeInteger,
  observedStoreRevision: NonNegativeSafeInteger,
  issues: Schema.Array(FlowIssueSchema),
  resourceRefs: Schema.Array(ResourceRefSchema),
  transactionRefs: Schema.Array(TransactionRefSchema),
  activities: Schema.Array(ActivityBootSchema),
  timers: Schema.Array(TimerSnapshotSchema),
  pendingOutcomes: Schema.Array(PendingOutcomeSchema),
  nextOutcomeSequence: NonNegativeSafeInteger,
  childTerminalSnapshots: Schema.Array(ChildSnapshotSchema),
});

export const RuntimeBootSchema = Schema.Struct({
  kind: Schema.Literal("runtime-boot"),
  version: Schema.Literal("flow-state/runtime-boot.v2"),
  definitionFormatVersion: Schema.Literal("flow-state/definition.v2"),
  appId: Schema.String,
  persistenceVersion: Schema.String,
  capturedAt: NonNegativeSafeInteger,
  appPlanFingerprint: Schema.String,
  store: StoreStateSchema,
  actors: Schema.Array(ActorBootSchema),
});

const SlotIdentitySchema = Schema.Struct({
  machineId: Schema.String,
  stateId: Schema.String,
  kind: Schema.Literals(["activity", "timer"]),
  name: Schema.String,
});

const BehaviorMachineSchema = Schema.Struct({
  machineId: Schema.String,
  states: StringArray,
  events: StringArray,
  activitySlots: Schema.Array(SlotIdentitySchema),
  timerSlots: Schema.Array(SlotIdentitySchema),
});

const BehaviorStorySchema = Schema.Struct({
  id: Schema.String,
  machineId: Schema.String,
  title: NullableString,
  description: NullableString,
  tags: StringArray,
});

export const BehaviorArtifactSchema = Schema.Struct({
  kind: Schema.Literal("behavior-contract"),
  version: Schema.Literal("flow-state/behavior-contract.v2"),
  appId: Schema.String,
  persistenceVersion: Schema.String,
  appPlanFingerprint: Schema.String,
  machines: Schema.Array(BehaviorMachineSchema),
  stories: Schema.Array(BehaviorStorySchema),
});

export const TurnFactSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("event"),
    eventId: Schema.String,
    payload: CanonicalCarrier,
  }),
  Schema.Struct({
    kind: Schema.Literal("transition"),
    eventId: Schema.String,
    from: Schema.String,
    to: Schema.String,
  }),
  Schema.Struct({ kind: Schema.Literal("memory"), changed: Schema.Boolean }),
  Schema.Struct({
    kind: Schema.Literal("activity"),
    activityKind: Schema.Literals(["resource", "transaction", "stream", "timer", "child", "lease"]),
    slot: Schema.String,
    generation: NonNegativeSafeInteger,
    status: Schema.Literals(["admitted", "started", "released", "settled"]),
  }),
  Schema.Struct({
    kind: Schema.Literal("outcome"),
    outcomeId: Schema.String,
    bindingId: Schema.String,
    generation: NonNegativeSafeInteger,
    eventId: Schema.String,
    disposition: Schema.Literals([
      "admitted",
      "applied",
      "inapplicable-cleared",
      "stale-duplicate",
      "cleanup-cleared",
    ]),
  }),
  Schema.Struct({
    kind: Schema.Literal("resource"),
    ref: ResourceRefSchema,
    status: Schema.String,
    valueRevision: NonNegativeSafeInteger,
  }),
  Schema.Struct({ kind: Schema.Literal("issue"), issue: FlowIssueSchema }),
  Schema.Struct({
    kind: Schema.Literal("lifecycle"),
    status: Schema.Literals(["activated", "disposed"]),
  }),
]);

export const TurnRecordSchema = Schema.Struct({
  sequence: NonNegativeSafeInteger,
  actorId: Schema.String,
  actorRevision: NonNegativeSafeInteger,
  storeRevision: NonNegativeSafeInteger,
  cause: Schema.Literals(["activation", "event", "outcome", "timer", "store", "disposal"]),
  snapshot: ActorSnapshotSchema,
  facts: Schema.Array(TurnFactSchema),
});

const PendingWorkSchema = Schema.Struct({
  finite: Schema.Array(Schema.Struct({ kind: Schema.String, id: Schema.String })),
  continuing: Schema.Array(Schema.Struct({ kind: Schema.String, id: Schema.String })),
  nextTimerAt: NullableInteger,
});

const ObservationSchema = Schema.Struct({
  snapshot: ActorSnapshotSchema,
  pendingWork: PendingWorkSchema,
  clock: NonNegativeSafeInteger,
});

const CheckpointSchema = Schema.Struct({
  name: Schema.String,
  commandIndex: NonNegativeSafeInteger,
  observation: ObservationSchema,
});

const CleanupSchema = Schema.Union([
  Schema.Struct({ status: Schema.Literal("complete") }),
  Schema.Struct({ status: Schema.Literal("failed"), cause: CauseProjection }),
]);

const StoryFailureSchema = Schema.Struct({
  phase: Schema.Literals(["prepare", "command", "cancellation", "disposal"]),
  commandIndex: NullableInteger,
  completedCheckpoints: Schema.Array(CheckpointSchema),
  atFailure: Schema.NullOr(ObservationSchema),
  final: Schema.NullOr(ObservationSchema),
  cause: CauseProjection,
  cleanup: CleanupSchema,
});

export const TraceArtifactSchema = Schema.Struct({
  kind: Schema.Literal("trace-artifact"),
  version: Schema.Literal("flow-state/trace-artifact.v2"),
  appId: Schema.String,
  persistenceVersion: Schema.String,
  appPlanFingerprint: Schema.String,
  capturedAt: NonNegativeSafeInteger,
  truncatedBeforeSequence: NullableInteger,
  records: Schema.Array(TurnRecordSchema),
  checkpoints: Schema.Array(CheckpointSchema),
  failure: Schema.NullOr(StoryFailureSchema),
  cleanup: CleanupSchema,
});

export const CliCommands = [
  "behavior.build",
  "behavior.render",
  "behavior.diff",
  "behavior.check",
  "story.list",
  "story.describe",
  "story.run",
  "trace.summarize",
  "trace.proof",
  "trace.diff",
] as const;
const CliCommandSchema = Schema.Literals(CliCommands);

const DiffSectionSchema = Schema.Struct({
  name: Schema.String,
  equal: Schema.Boolean,
  lines: StringArray,
});
const StorySummarySchema = Schema.Struct({
  id: Schema.String,
  machineId: Schema.String,
  title: NullableString,
  tags: StringArray,
});

export const CliSuccessSchema = Schema.Union([
  Schema.Struct({
    version: Schema.Literal("flow-state/cli-result.v1"),
    kind: Schema.Literal("flow-state-cli-result"),
    command: Schema.Literal("behavior.build"),
    outcome: Schema.Literal("completed"),
    data: Schema.Struct({
      output: Schema.String,
      appId: Schema.String,
      fingerprint: Schema.String,
    }),
  }),
  Schema.Struct({
    version: Schema.Literal("flow-state/cli-result.v1"),
    kind: Schema.Literal("flow-state-cli-result"),
    command: Schema.Literal("behavior.render"),
    outcome: Schema.Literal("completed"),
    data: Schema.Struct({ section: Schema.Literals(["contract", "coverage"]), lines: StringArray }),
  }),
  Schema.Struct({
    version: Schema.Literal("flow-state/cli-result.v1"),
    kind: Schema.Literal("flow-state-cli-result"),
    command: Schema.Literals(["behavior.diff", "behavior.check"]),
    outcome: Schema.Literals(["completed", "different"]),
    data: Schema.Struct({ equal: Schema.Boolean, sections: Schema.Array(DiffSectionSchema) }),
  }),
  Schema.Struct({
    version: Schema.Literal("flow-state/cli-result.v1"),
    kind: Schema.Literal("flow-state-cli-result"),
    command: Schema.Literal("story.list"),
    outcome: Schema.Literal("completed"),
    data: Schema.Struct({ stories: Schema.Array(StorySummarySchema) }),
  }),
  Schema.Struct({
    version: Schema.Literal("flow-state/cli-result.v1"),
    kind: Schema.Literal("flow-state-cli-result"),
    command: Schema.Literal("story.describe"),
    outcome: Schema.Literal("completed"),
    data: Schema.Struct({ story: BehaviorStorySchema }),
  }),
  Schema.Struct({
    version: Schema.Literal("flow-state/cli-result.v1"),
    kind: Schema.Literal("flow-state-cli-result"),
    command: Schema.Literal("story.run"),
    outcome: Schema.Literals(["completed", "incomplete"]),
    data: Schema.Struct({
      storyId: Schema.String,
      checkpoints: Schema.Array(CheckpointSchema),
      final: Schema.NullOr(ObservationSchema),
      traceOutput: NullableString,
    }),
  }),
  Schema.Struct({
    version: Schema.Literal("flow-state/cli-result.v1"),
    kind: Schema.Literal("flow-state-cli-result"),
    command: Schema.Literal("trace.summarize"),
    outcome: Schema.Literals(["completed", "incomplete"]),
    data: Schema.Struct({
      complete: Schema.Boolean,
      truncatedBeforeSequence: NullableInteger,
      counts: Schema.Struct({
        records: NonNegativeSafeInteger,
        issues: NonNegativeSafeInteger,
        actors: NonNegativeSafeInteger,
      }),
      timeline: Schema.Array(
        Schema.Struct({
          sequence: NonNegativeSafeInteger,
          actorId: Schema.String,
          summary: Schema.String,
        }),
      ),
    }),
  }),
  Schema.Struct({
    version: Schema.Literal("flow-state/cli-result.v1"),
    kind: Schema.Literal("flow-state-cli-result"),
    command: Schema.Literal("trace.proof"),
    outcome: Schema.Literals(["completed", "incomplete"]),
    data: Schema.Struct({
      selector: Schema.String,
      complete: Schema.Boolean,
      evidence: Schema.Array(
        Schema.Struct({
          sequence: NonNegativeSafeInteger,
          actorId: Schema.String,
          facts: Schema.Array(TurnFactSchema),
        }),
      ),
    }),
  }),
  Schema.Struct({
    version: Schema.Literal("flow-state/cli-result.v1"),
    kind: Schema.Literal("flow-state-cli-result"),
    command: Schema.Literal("trace.diff"),
    outcome: Schema.Literals(["completed", "different", "incomplete"]),
    data: Schema.Struct({
      equal: Schema.Boolean,
      complete: Schema.Boolean,
      sections: Schema.Array(DiffSectionSchema),
    }),
  }),
]);

export const DiagnosticCodes = {
  usage: ["InvalidCommand", "InvalidOption", "InvalidSelector", "InvalidArtifactOperand"],
  gateway: [
    "InvalidProjectRoot",
    "ManifestNotFound",
    "InvalidManifest",
    "InvalidGatewayFile",
    "GatewayEscape",
    "UnsupportedGatewayImport",
    "UndeclaredGatewayImport",
    "PackageIdentityMismatch",
    "InvalidGatewayExport",
    "MixedAppBehavior",
    "StoryNotFound",
  ],
  artifact: [
    "WrongArtifactKind",
    "UnsupportedArtifactVersion",
    "MalformedUtf8",
    "MalformedJson",
    "DuplicateJsonKey",
    "DecompressionFailed",
    "CompressedInputBoundExceeded",
    "DecompressedOutputBoundExceeded",
    "CanonicalEncodingBoundExceeded",
    "StructuralBoundExceeded",
    "InvalidCanonicalValue",
    "ArtifactIdentityMismatch",
    "ArtifactIncompatible",
    "NonCanonicalTraceCause",
    "EvidenceUnavailable",
  ],
  "story-execution": ["StoryExecutionFailed"],
  cleanup: ["CleanupFailed"],
  io: [
    "ArtifactInputReadFailed",
    "DestinationExists",
    "UnsupportedAtomicPublication",
    "ArtifactTempCreateFailed",
    "ArtifactWriteFailed",
    "ArtifactFlushFailed",
    "ArtifactCloseFailed",
    "ArtifactCommitFailed",
    "BrokenPipe",
  ],
  interruption: ["Interrupted"],
  internal: ["InternalInvariant"],
} as const;

const UsageDetailsSchema = Schema.Struct({ argument: NullableString });
const GatewayDetailsSchema = Schema.Struct({
  path: NullableString,
  importSpecifier: NullableString,
});
const ArtifactDetailsSchema = Schema.Struct({
  path: Schema.Array(Schema.Union([Schema.String, NonNegativeSafeInteger])),
  limit: NullableInteger,
  actual: NullableInteger,
});
const StoryExecutionDetailsSchema = Schema.Struct({
  storyId: Schema.String,
  failure: StoryFailureSchema,
});
const CleanupDetailsSchema = Schema.Struct({ operation: Schema.String, cause: CauseProjection });
const IoDetailsSchema = Schema.Struct({
  path: NullableString,
  operation: Schema.String,
  errno: NullableString,
});
const InterruptionDetailsSchema = Schema.Struct({ signal: Schema.Literals(["SIGINT", "SIGTERM"]) });
const InternalDetailsSchema = Schema.Struct({ invariant: Schema.String });

const diagnosticMembers = Object.entries(DiagnosticCodes).flatMap(([category, codes]) =>
  codes.map((code) => {
    const details =
      category === "usage"
        ? UsageDetailsSchema
        : category === "gateway"
          ? GatewayDetailsSchema
          : category === "artifact"
            ? ArtifactDetailsSchema
            : category === "story-execution"
              ? StoryExecutionDetailsSchema
              : category === "cleanup"
                ? CleanupDetailsSchema
                : category === "io"
                  ? IoDetailsSchema
                  : category === "interruption"
                    ? InterruptionDetailsSchema
                    : InternalDetailsSchema;
    return Schema.Struct({
      category: Schema.Literal(category),
      code: Schema.Literal(code),
      message: Schema.String,
      details,
    });
  }),
);

export const CliDiagnosticSchema = Schema.Union(diagnosticMembers);

export const CliErrorSchema = Schema.Struct({
  version: Schema.Literal("flow-state/cli-result.v1"),
  kind: Schema.Literal("flow-state-cli-error"),
  command: Schema.NullOr(CliCommandSchema),
  diagnostic: CliDiagnosticSchema,
});

export const Phase0Schemas = {
  RuntimeBootSchema,
  BehaviorArtifactSchema,
  TraceArtifactSchema,
  CauseProjection,
  TurnRecordSchema,
  CliSuccessSchema,
  CliErrorSchema,
} as const;
