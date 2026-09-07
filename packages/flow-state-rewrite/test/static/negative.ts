import { Context, Effect, Result, Stream } from "effect";

import type * as Public from "../../src/index.js";
import type * as InspectRoute from "../../src/inspect.js";
import type * as ReactRoute from "../../src/react-entry.js";
import type * as TestingRoute from "../../src/testing.js";

// @ts-expect-error Actor snapshot is deferred until its owner exists.
export type _ActorSnapshot = Public.ActorSnapshot;
// @ts-expect-error Persistence is deferred until its owner exists.
export type _Persistence = Public.Persistence;
// @ts-expect-error Persistence storage is deferred until its owner exists.
export type _PersistenceStorage = Public.PersistenceStorage;
// @ts-expect-error Persistence storage failure is deferred until its owner exists.
export type _PersistenceStorageError = Public.PersistenceStorageError;
// @ts-expect-error Persistence codec is deferred until its owner exists.
export type _PersistenceCodec = Public.PersistenceCodec;
// @ts-expect-error Persistence slot is deferred until its owner exists.
export type _PersistenceSlot = Public.PersistenceSlot;
// @ts-expect-error Persistence value is deferred until its owner exists.
export type _PersistenceValue = Public.PersistenceValue;
// @ts-expect-error Persistence entry is deferred until its owner exists.
export type _PersistenceEntry = Public.PersistenceEntry;
// @ts-expect-error FlowDisposeError is deferred until its owner exists.
export type _FlowDisposeError = typeof Public.FlowDisposeError;
// @ts-expect-error FlowPersistenceError is deferred until its owner exists.
export type _FlowPersistenceError = typeof Public.FlowPersistenceError;
// @ts-expect-error FlowUsageError is deferred until its owner exists.
export type _FlowUsageError = typeof Public.FlowUsageError;
// @ts-expect-error FlowPath is deferred until its owner exists.
export type _FlowPath = Public.FlowPath;
// @ts-expect-error FlowUsageCode is deferred until its owner exists.
export type _FlowUsageCode = Public.FlowUsageCode;
// @ts-expect-error can is deferred until its owner exists.
export type _Can = typeof Public.can;
// @ts-expect-error indexedDbStorage is deferred until its owner exists.
export type _IndexedDbStorage = typeof Public.indexedDbStorage;
// @ts-expect-error persistence is deferred until its owner exists.
export type _PersistenceRoot = typeof Public.persistence;
// @ts-expect-error webStorage is deferred until its owner exists.
export type _WebStorage = typeof Public.webStorage;

// @ts-expect-error FlowProvider is deferred until the React owner exists.
export type _FlowProvider = typeof ReactRoute.FlowProvider;
// @ts-expect-error useActor is deferred until the React owner exists.
export type _UseActor = typeof ReactRoute.useActor;
// @ts-expect-error useActorByRef is deferred until the React owner exists.
export type _UseActorByRef = typeof ReactRoute.useActorByRef;
// @ts-expect-error useView is deferred until the React owner exists.
export type _UseView = typeof ReactRoute.useView;

// @ts-expect-error FlowStoryExecutionError is deferred until the Story owner exists.
export type _FlowStoryExecutionError = typeof TestingRoute.FlowStoryExecutionError;
// @ts-expect-error behavior is deferred until the Story owner exists.
export type _Behavior = typeof TestingRoute.behavior;
// @ts-expect-error fixture is deferred until the Story owner exists.
export type _Fixture = typeof TestingRoute.fixture;
// @ts-expect-error model is deferred until the Story owner exists.
export type _Model = typeof TestingRoute.model;
// @ts-expect-error story is deferred until the Story owner exists.
export type _Story = typeof TestingRoute.story;

// @ts-expect-error analyzeTrace is deferred until the inspection owner exists.
export type _AnalyzeTrace = typeof InspectRoute.analyzeTrace;
// @ts-expect-error attachInspectionSink is deferred until the inspection owner exists.
export type _AttachInspectionSink = typeof InspectRoute.attachInspectionSink;
// @ts-expect-error buildBehaviorContract is deferred until the inspection owner exists.
export type _BuildBehaviorContract = typeof InspectRoute.buildBehaviorContract;
// @ts-expect-error compressTraceArtifact is deferred until the inspection owner exists.
export type _CompressTraceArtifact = typeof InspectRoute.compressTraceArtifact;
// @ts-expect-error createInspectionBufferSink is deferred until the inspection owner exists.
export type _CreateInspectionBufferSink = typeof InspectRoute.createInspectionBufferSink;
// @ts-expect-error decompressTraceArtifact is deferred until the inspection owner exists.
export type _DecompressTraceArtifact = typeof InspectRoute.decompressTraceArtifact;
// @ts-expect-error diffBehaviorContracts is deferred until the inspection owner exists.
export type _DiffBehaviorContracts = typeof InspectRoute.diffBehaviorContracts;
// @ts-expect-error diffTrace is deferred until the inspection owner exists.
export type _DiffTrace = typeof InspectRoute.diffTrace;
// @ts-expect-error exportTraceArtifact is deferred until the inspection owner exists.
export type _ExportTraceArtifact = typeof InspectRoute.exportTraceArtifact;
// @ts-expect-error formatInspectionEvent is deferred until the inspection owner exists.
export type _FormatInspectionEvent = typeof InspectRoute.formatInspectionEvent;
// @ts-expect-error formatInspectionTimeline is deferred until the inspection owner exists.
export type _FormatInspectionTimeline = typeof InspectRoute.formatInspectionTimeline;
// @ts-expect-error formatNoTransitionSummary is deferred until the inspection owner exists.
export type _FormatNoTransitionSummary = typeof InspectRoute.formatNoTransitionSummary;
// @ts-expect-error formatRehydrationSummary is deferred until the inspection owner exists.
export type _FormatRehydrationSummary = typeof InspectRoute.formatRehydrationSummary;
// @ts-expect-error formatResourceFreshnessReport is deferred until the inspection owner exists.
export type _FormatResourceFreshnessReport = typeof InspectRoute.formatResourceFreshnessReport;
// @ts-expect-error formatTrace is deferred until the inspection owner exists.
export type _FormatTrace = typeof InspectRoute.formatTrace;
// @ts-expect-error formatTransactionOverlapSummary is deferred until the inspection owner exists.
export type _FormatTransactionOverlapSummary = typeof InspectRoute.formatTransactionOverlapSummary;
// @ts-expect-error graphOf is deferred until the inspection owner exists.
export type _GraphOf = typeof InspectRoute.graphOf;
// @ts-expect-error importTraceArtifact is deferred until the inspection owner exists.
export type _ImportTraceArtifact = typeof InspectRoute.importTraceArtifact;
// @ts-expect-error inspectActivities is deferred until the inspection owner exists.
export type _InspectActivities = typeof InspectRoute.inspectActivities;
// @ts-expect-error inspectMicrosteps is deferred until the inspection owner exists.
export type _InspectMicrosteps = typeof InspectRoute.inspectMicrosteps;
// @ts-expect-error inspectTransition is deferred until the inspection owner exists.
export type _InspectTransition = typeof InspectRoute.inspectTransition;
// @ts-expect-error renderBehaviorContract is deferred until the inspection owner exists.
export type _RenderBehaviorContract = typeof InspectRoute.renderBehaviorContract;
// @ts-expect-error renderBehaviorCoverage is deferred until the inspection owner exists.
export type _RenderBehaviorCoverage = typeof InspectRoute.renderBehaviorCoverage;
// @ts-expect-error renderBehaviorDiff is deferred until the inspection owner exists.
export type _RenderBehaviorDiff = typeof InspectRoute.renderBehaviorDiff;
// @ts-expect-error sliceBehaviorContract is deferred until the inspection owner exists.
export type _SliceBehaviorContract = typeof InspectRoute.sliceBehaviorContract;
// @ts-expect-error summarizeTrace is deferred until the inspection owner exists.
export type _SummarizeTrace = typeof InspectRoute.summarizeTrace;
// @ts-expect-error whyNoTransition is deferred until the inspection owner exists.
export type _WhyNoTransition = typeof InspectRoute.whyNoTransition;

import {
  Diagnostic,
  Implementation,
  app,
  definition,
  machine,
  module,
  resource,
  runtimeSetup,
  stream,
  transaction,
} from "../../src/index.js";

// These compile-only cases cover invalid static shapes across the available type surface.

type PublicDiagnostic = ReturnType<typeof Diagnostic.Failure>;

const resultSuccess = <Value>(result: Result.Result<Value, PublicDiagnostic>) => {
  if (Result.isFailure(result)) throw result.failure;
  return result.success;
};

class NegativeRepo extends Context.Service<
  NegativeRepo,
  { readonly read: () => Effect.Effect<string> }
>()("StaticHarness/NegativeRepo") {}

const ValidDefinitionResult = definition({
  id: "static-negative/valid",
  states: ["ready"],
  events: { opened: (id: string) => ({ id }) },
});
const ValidDefinition = resultSuccess(ValidDefinitionResult);

const OtherDefinitionResult = definition({
  id: "static-negative/other",
  states: ["ready"],
  events: { opened: (id: string) => ({ id }) },
});
const OtherDefinition = resultSuccess(OtherDefinitionResult);

const validMachine = resultSuccess(
  machine(ValidDefinitionResult, ({ S }) => ({
    default: S.ready,
    states: { ready: {} },
  })),
);

type ValidMachineConfigurationMember = {
  readonly default: typeof ValidDefinition.S.ready;
  readonly states: { readonly ready: Readonly<Record<never, never>> };
};

type UnknownEventConfiguration = ValidMachineConfigurationMember & {
  readonly on?: unknown;
};

type EventConfigurationUnion = ValidMachineConfigurationMember | UnknownEventConfiguration;

declare const eventConfigurationUnion: EventConfigurationUnion;

type ValidMachineConfigurationWithEvent = ValidMachineConfigurationMember & {
  readonly on: { readonly opened: typeof ValidDefinition.S.ready };
};

type UncheckedValue = ReturnType<typeof JSON.parse>;

type NestedUnknownEventConfiguration = {
  readonly default: typeof ValidDefinition.S.ready;
  readonly states: { readonly ready: { readonly on?: unknown } };
};

type NestedUnknownEventConfigurationUnion =
  | ValidMachineConfigurationWithEvent
  | NestedUnknownEventConfiguration;

declare const nestedUnknownEventConfigurationUnion: NestedUnknownEventConfigurationUnion;

type NestedAnyEventConfiguration = {
  readonly default: typeof ValidDefinition.S.ready;
  readonly states: { readonly ready: { readonly on?: UncheckedValue } };
};

type NestedAnyEventConfigurationUnion =
  | ValidMachineConfigurationWithEvent
  | NestedAnyEventConfiguration;

declare const nestedAnyEventConfigurationUnion: NestedAnyEventConfigurationUnion;

type UnknownTimerConfiguration = {
  readonly default: typeof ValidDefinition.S.ready;
  readonly states: {
    readonly ready: { readonly timers?: unknown };
  };
};

type TimerConfigurationUnion = ValidMachineConfigurationMember | UnknownTimerConfiguration;

declare const timerConfigurationUnion: TimerConfigurationUnion;

type NestedUnknownTimerConfiguration = {
  readonly default: typeof ValidDefinition.S.ready;
  readonly states: { readonly ready: { readonly timers?: unknown } };
};

type NestedUnknownTimerConfigurationUnion =
  | ValidMachineConfigurationWithEvent
  | NestedUnknownTimerConfiguration;

declare const nestedUnknownTimerConfigurationUnion: NestedUnknownTimerConfigurationUnion;

type NestedAnyTimerConfiguration = {
  readonly default: typeof ValidDefinition.S.ready;
  readonly states: { readonly ready: { readonly timers?: UncheckedValue } };
};

type NestedAnyTimerConfigurationUnion =
  | ValidMachineConfigurationWithEvent
  | NestedAnyTimerConfiguration;

declare const nestedAnyTimerConfigurationUnion: NestedAnyTimerConfigurationUnion;

type ExtraRootKeyConfiguration = {
  readonly default: typeof ValidDefinition.S.ready;
  readonly states: { readonly ready: Readonly<Record<never, never>> };
  readonly extra: true;
};

type ExtraRootKeyConfigurationUnion =
  | ValidMachineConfigurationWithEvent
  | ExtraRootKeyConfiguration;

declare const extraRootKeyConfigurationUnion: ExtraRootKeyConfigurationUnion;

type ExtraNestedStateKeyConfiguration = {
  readonly default: typeof ValidDefinition.S.ready;
  readonly states: {
    readonly ready: Readonly<Record<never, never>>;
    readonly extra: Readonly<Record<never, never>>;
  };
};

type ExtraNestedStateKeyConfigurationUnion =
  | ValidMachineConfigurationWithEvent
  | ExtraNestedStateKeyConfiguration;

declare const extraNestedStateKeyConfigurationUnion: ExtraNestedStateKeyConfigurationUnion;

const validResource = resource({
  id: "static-negative/resource",
  key: (id: string) => [id] as const,
  // RETURN_TYPE: Preserves NegativeRepo and the missing channel in the negative capability proof.
  lookup: (id: string): Effect.Effect<string, "missing", NegativeRepo> => Effect.succeed(id),
});

const validTransaction = transaction({
  id: "static-negative/transaction",
  key: (id: string) => [id] as const,
  // RETURN_TYPE: Preserves NegativeRepo and the rejected channel in the negative capability proof.
  commit: (id: string): Effect.Effect<string, "rejected", NegativeRepo> => Effect.succeed(id),
});

const validStream = stream({
  id: "static-negative/stream",
  key: (id: string) => [id] as const,
  // RETURN_TYPE: Preserves NegativeRepo and the offline channel in the negative capability proof.
  subscribe: (id: string): Stream.Stream<string, "offline", NegativeRepo> => Stream.make(id),
});

const publicFailure = Diagnostic.Failure({
  code: "SchemaValidation",
  path: [],
  details: {},
  summary: "schema validation failed",
  help: "fix the input",
});

const publicResultFailure: Result.Result<never, PublicDiagnostic> = Result.fail(publicFailure);
const publicEffectFailure: Effect.Effect<never, PublicDiagnostic> = Effect.fail(publicFailure);
void publicResultFailure;
void publicEffectFailure;

const publicFailureWithClassification = Diagnostic.Failure({
  code: "SchemaValidation",
  path: [],
  details: {},
  summary: "schema validation failed",
  help: "fix the input",
  // @ts-expect-error Callers cannot supply internal classification.
  classification: "Failure",
});
void publicFailureWithClassification;

const publicFailureWithReservedCode = Diagnostic.Failure({
  // @ts-expect-error Defect is reserved for the defect projection.
  code: "Defect",
  path: [],
  details: {},
  summary: "invalid reserved code",
  help: "unreachable",
});
void publicFailureWithReservedCode;

const publicFailureWithInterruptionCode = Diagnostic.Failure({
  // @ts-expect-error Interruption is reserved for the interruption projection.
  code: "Interruption",
  path: [],
  details: {},
  summary: "invalid reserved code",
  help: "unreachable",
});
void publicFailureWithInterruptionCode;

// @ts-expect-error The defect factory accepts exactly one cause argument, not typed-failure fields.
Diagnostic.Defect(publicFailure, "extra argument");

// @ts-expect-error The interruption factory accepts no typed-failure arguments.
Diagnostic.Interrupt(publicFailure);

// @ts-expect-error Public diagnostics hide the internal classification.
void publicFailure.classification;

const publicDefinitionResult = definition({
  id: "static-negative/public-definition",
  states: ["ready"],
  events: {},
});

if (Result.isFailure(publicDefinitionResult)) {
  // @ts-expect-error Inferred public builder failures hide the internal classification.
  void publicDefinitionResult.failure.classification;
}

const publicEventDefinitionResult = definition({
  id: "static-negative/public-event-definition",
  states: ["ready"],
  events: { opened: "bare" },
});

if (Result.isSuccess(publicEventDefinitionResult)) {
  const publicEventResult = publicEventDefinitionResult.success.E.opened();
  if (Result.isFailure(publicEventResult)) {
    // @ts-expect-error Inferred public event failures hide the internal classification.
    void publicEventResult.failure.classification;
  }
}

const invalidEventMarker = null;

const invalidOwnerCompilations = () => {
  definition({
    id: "static-negative/bad-memory",
    states: ["ready"],
    events: {},
    // @ts-expect-error Definition memory initializers return object memory.
    memory: () => "not-memory",
  });

  definition({
    id: "static-negative/invalid-event-marker",
    states: ["ready"],
    // @ts-expect-error Zero-argument events require the exact "bare" marker.
    events: { closed: invalidEventMarker },
  });

  definition({
    id: "static-negative/unknown-event-marker",
    states: ["ready"],
    // @ts-expect-error Arbitrary strings are not event declarations.
    events: { closed: "empty" },
  });

  definition({
    id: "static-negative/structural-operation",
    states: ["ready"],
    events: {},
    // @ts-expect-error Definition operations require constructed descriptors.
    operations: { forged: { kind: "resource" } },
  });

  // @ts-expect-error Machine states must match definition states.
  machine(ValidDefinitionResult, ({ S }) => ({
    default: S.ready,
    states: {
      ready: {},
      unknown: {},
    },
  }));

  const explicitUndefinedEventConfiguration = {
    default: ValidDefinition.S.ready,
    on: { opened: undefined },
    states: { ready: {} },
  };
  // @ts-expect-error A present event handler cannot be undefined.
  machine(ValidDefinitionResult, () => explicitUndefinedEventConfiguration);

  const explicitUndefinedTimerConfiguration = {
    default: ValidDefinition.S.ready,
    states: { ready: { timers: { opened: undefined } } },
  };
  // @ts-expect-error A present timer entry cannot be undefined.
  machine(ValidDefinitionResult, () => explicitUndefinedTimerConfiguration);

  // @ts-expect-error A union cannot hide an unknown event-handler shape.
  machine(ValidDefinitionResult, () => eventConfigurationUnion);

  // @ts-expect-error A nested union cannot hide unknown timer configuration.
  machine(ValidDefinitionResult, () => timerConfigurationUnion);

  // @ts-expect-error A nested union cannot hide unknown event configuration.
  machine(ValidDefinitionResult, () => nestedUnknownEventConfigurationUnion);

  // @ts-expect-error A nested union cannot hide any event configuration.
  machine(ValidDefinitionResult, () => nestedAnyEventConfigurationUnion);

  // @ts-expect-error A nested union cannot hide unknown timer configuration.
  machine(ValidDefinitionResult, () => nestedUnknownTimerConfigurationUnion);

  // @ts-expect-error A nested union cannot hide any timer configuration.
  machine(ValidDefinitionResult, () => nestedAnyTimerConfigurationUnion);

  // @ts-expect-error A union cannot hide an extra root configuration key.
  machine(ValidDefinitionResult, () => extraRootKeyConfigurationUnion);

  // @ts-expect-error A nested union cannot hide an extra state key.
  machine(ValidDefinitionResult, () => extraNestedStateKeyConfigurationUnion);

  machine(ValidDefinitionResult, () => ({
    // @ts-expect-error A machine default retains its originating definition.
    default: OtherDefinition.S.ready,
    states: { ready: {} },
  }));

  machine(ValidDefinitionResult, ({ E }) => {
    // @ts-expect-error Event constructors retain their authored argument tuple.
    E.opened(1);
    return { default: ValidDefinition.S.ready, states: { ready: {} } };
  });

  resource({
    id: "static-negative/bad-key",
    // @ts-expect-error Resource keys are bounded canonical tuples.
    key: (id: string) => id,
    lookup: (id: string) => Effect.succeed(id),
  });

  transaction({
    id: "static-negative/bad-transaction-key",
    // @ts-expect-error Transaction keys are bounded canonical tuples.
    key: (id: string) => id,
    // @ts-expect-error The invalid key also rejects the fallback overload.
    commit: (id: string) => Effect.succeed(id),
  });

  stream({
    id: "static-negative/bad-stream-key",
    // @ts-expect-error Stream keys are bounded canonical tuples.
    key: (id: string) => id,
    subscribe: (id: string) => Stream.make(id),
  });

  resource({
    id: "static-negative/bad-value",
    key: (id: string) => [id] as const,
    // @ts-expect-error Resource success values cannot be undefined.
    lookup: () => Effect.succeed(undefined),
  });

  const invalidMachineRecord = module({
    id: "static-negative/bad-module",
    // @ts-expect-error Modules admit constructed machines, not definitions.
    machines: { root: ValidDefinition },
  });
  void invalidMachineRecord;

  const invalidAppRecord = app({
    id: "static-negative/bad-app",
    persistenceVersion: "1",
    // @ts-expect-error App modules must be constructed module records.
    modules: [{ id: "not-a-module", machines: {} }],
  });
  void invalidAppRecord;

  const structurallyForgedApp = {
    kind: "app" as const,
    id: "static-negative/forged-app",
    persistenceVersion: "1",
    modules: [] as const,
    M: {},
    plan: {
      appId: "static-negative/forged-app",
      persistenceVersion: "1",
      modules: [] as const,
      machines: [] as const,
      descriptors: [] as const,
      resolveMachine: () => undefined,
      admitsMachine: () => false,
      resolveDescriptor: () => undefined,
      admitsDescriptor: () => false,
    },
  };
  // @ts-expect-error RuntimeSetup requires an App constructed by app(), not a structural lookalike.
  runtimeSetup({ app: structurallyForgedApp });

  const invalidImplementation = Implementation.effect(
    NegativeRepo,
    // @ts-expect-error Implementation effects preserve the service value type.
    Effect.succeed(42),
  );
  void invalidImplementation;

  const invalidImplementationKey = Implementation.succeed(
    // @ts-expect-error Implementation providers require a typed Context.Key.
    { key: "not-a-context-key" },
    {},
  );
  void invalidImplementationKey;

  // @ts-expect-error Stream descriptors do not expose actor cancellation.
  validStream.cancel(validStream.key("id"));
  // @ts-expect-error Transaction params retain their own authored shape.
  validTransaction.commit({ id: "wrong-shape" });
  void validResource;
  void validMachine;
};

void invalidOwnerCompilations;
