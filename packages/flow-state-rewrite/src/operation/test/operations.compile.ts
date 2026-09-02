import { Effect, Stream } from "effect";
import type { Duration } from "effect";

import { OperationAdapterTypeId } from "../operation.js";
import type { CacheWritePlan, OperationOptions, RequirementsOf } from "../operation.js";
import { resource } from "../resource.js";
import type { Resource } from "../resource.js";
import { stream } from "../stream.js";
import type { FlowStream } from "../stream.js";
import { transaction } from "../transaction.js";
import type { Transaction } from "../transaction.js";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;
type Expect<Value extends true> = Value;

class ProjectRepo {
  readonly _tag = "ProjectRepo";
}

type ProjectInput = { readonly id: string };
type Project = { readonly id: string };

const project = resource({
  id: "projects.by-id",
  key: ({ id }: ProjectInput) => [id] as const,
  lookup: (
    { id }: ProjectInput,
    { signal }: { readonly signal: AbortSignal },
  ): Effect.Effect<Project, "missing", ProjectRepo> => {
    void signal;
    return Effect.succeed({ id });
  },
});

const save = transaction({
  id: "projects.save",
  key: (params: ProjectInput) => [params.id] as const,
  commit: (
    params: ProjectInput,
    { signal }: { readonly signal: AbortSignal },
  ): Effect.Effect<Project, "rejected", ProjectRepo> => {
    void signal;
    return Effect.succeed({ id: params.id });
  },
});

const updates = stream({
  id: "projects.updates",
  key: ({ id }: ProjectInput) => [id] as const,
  subscribe: (
    { id }: ProjectInput,
    { signal }: { readonly signal: AbortSignal },
  ): Stream.Stream<Project, "offline", ProjectRepo> => {
    void signal;
    return Stream.make({ id });
  },
});

const projectKey = project.key({ id: "project-1" });
const projectState = project.getState(projectKey);
const transactionKey = save.key({ id: "project-1" });
const transactionState = save.getState(transactionKey);
const streamKey = updates.key({ id: "project-1" });
const streamState = updates.getState(streamKey);
const defaultRefresh = transaction({
  id: "projects.refresh",
  commit: ({ signal }: OperationOptions) => {
    void signal;
    return Effect.succeed({ refreshed: true });
  },
});
const defaultRefreshPlan = defaultRefresh.commit(undefined);
const refresh = transaction({
  id: "projects.refresh",
  key: () => ["refresh"] as const,
  commit: () => Effect.succeed({ refreshed: true }),
});
const refreshPlan = refresh.commit(undefined);
const refreshOptions = {};
const refreshOptionsPlan = refresh.commit(undefined, refreshOptions);
const lookupPlan = project.lookup(
  { id: "project-1" },
  {
    outcomes: {
      success: (value) => ({ type: "PROJECT_READY", value }),
      failure: (error) => ({ type: "PROJECT_MISSING", error }),
    },
  },
);
const commitPlan = save.commit(
  { id: "project-1" },
  {
    writes: ({ params, value }) => [project.setData(project.key(params), value)],
    outcomes: {
      success: (value) => ({ type: "PROJECT_SAVED", value }),
      failure: (error) => ({ type: "PROJECT_REJECTED", error }),
      defect: (defect) => ({ type: "PROJECT_DEFECT", defect }),
      interrupt: () => ({ type: "PROJECT_INTERRUPTED" }),
    },
  },
);
const streamPlan = updates.subscribe(
  { id: "project-1" },
  {
    outcomes: {
      value: (value) => ({ type: "PROJECT_UPDATE", value }),
      failure: (error) => ({ type: "PROJECT_OFFLINE", error }),
      complete: () => ({ type: "PROJECT_COMPLETE" }),
      defect: (defect) => ({ type: "PROJECT_STREAM_DEFECT", defect }),
      interrupt: () => ({ type: "PROJECT_STREAM_INTERRUPTED" }),
    },
  },
);
const exactLookupSuccess = (value: Project) => ({ type: "PROJECT_READY", value }) as const;
const exactLookupPlan = project.lookup(
  { id: "project-1" },
  { outcomes: { success: exactLookupSuccess } },
);
const exactCommitFailure = (error: "rejected") => ({ type: "PROJECT_REJECTED", error }) as const;
const exactCommitPlan = save.commit(
  { id: "project-1" },
  { outcomes: { failure: exactCommitFailure } },
);
const exactStreamValue = (value: Project) => ({ type: "PROJECT_UPDATE", value }) as const;
const exactStreamPlan = updates.subscribe(
  { id: "project-1" },
  { outcomes: { value: exactStreamValue } },
);
const cacheWritePlan = project.setData(projectKey, { id: "project-1" });
const resourceCancelPlan = project.cancel(projectKey);
const transactionCancelPlan = save.cancel(transactionKey);

// Positive compile proofs preserve operation inference and plan relationships.
type _ProjectKey = Expect<Equal<typeof projectKey, readonly [string]>>;
type _ResourceDefaultId = Expect<Equal<Resource["id"], string>>;
type _TransactionDefaultId = Expect<Equal<Transaction["id"], string>>;
type _StreamDefaultId = Expect<Equal<FlowStream["id"], string>>;
type _ProjectValue = Expect<Equal<ReturnType<typeof project.getData>, Project | undefined>>;
type _ProjectRequirements = Expect<Equal<RequirementsOf<typeof project>, ProjectRepo>>;
type _ProjectAdapter = Expect<
  Equal<
    ReturnType<(typeof project)[typeof OperationAdapterTypeId]["lookup"]>,
    Effect.Effect<Project, "missing", ProjectRepo>
  >
>;
type _ProjectStaleTime = Expect<Equal<typeof project.staleTime, Duration.Input | undefined>>;
type _ProjectGcTime = Expect<Equal<typeof project.gcTime, Duration.Input | undefined>>;
type _CacheWriteDescriptor = Expect<Equal<typeof cacheWritePlan.descriptor, "projects.by-id">>;
type _CacheWriteFamily = Expect<Equal<typeof cacheWritePlan.family, "resource">>;
type _CacheWriteKey = Expect<Equal<typeof cacheWritePlan.key, readonly [string]>>;
type _ResourceCancelDescriptor = Expect<
  Equal<typeof resourceCancelPlan.descriptor, "projects.by-id">
>;
type _ResourceCancelFamily = Expect<Equal<typeof resourceCancelPlan.family, "resource">>;
type _ResourceCancelKey = Expect<Equal<typeof resourceCancelPlan.key, readonly [string]>>;
type _SaveValue = Expect<Equal<ReturnType<typeof save.commit>["params"], ProjectInput>>;
type _SaveKey = Expect<Equal<ReturnType<NonNullable<typeof save.key>>, readonly [string]>>;
type _SavePlanKey = Expect<Equal<typeof commitPlan.key, readonly [string]>>;
type _SaveAdapter = Expect<
  Equal<
    ReturnType<(typeof save)[typeof OperationAdapterTypeId]["commit"]>,
    Effect.Effect<Project, "rejected", ProjectRepo>
  >
>;
type _RefreshKey = Expect<Equal<ReturnType<typeof refresh.key>, readonly ["refresh"]>>;
type _RefreshPlan = Expect<Equal<typeof refreshPlan.key, readonly ["refresh"]>>;
type _RefreshParams = Expect<Equal<typeof refreshPlan.params, undefined>>;
type _RefreshOptionsParams = Expect<Equal<typeof refreshOptionsPlan.params, undefined>>;
type _TransactionCancelDescriptor = Expect<
  Equal<typeof transactionCancelPlan.descriptor, "projects.save">
>;
type _TransactionCancelFamily = Expect<Equal<typeof transactionCancelPlan.family, "transaction">>;
type _TransactionCancelKey = Expect<Equal<typeof transactionCancelPlan.key, readonly [string]>>;
type _SaveRequirements = Expect<Equal<RequirementsOf<typeof save>, ProjectRepo>>;
type _StreamValue = Expect<Equal<ReturnType<typeof updates.subscribe>["params"], ProjectInput>>;
type _StreamRequirements = Expect<Equal<RequirementsOf<typeof updates>, ProjectRepo>>;
type _StreamAdapter = Expect<
  Equal<
    ReturnType<(typeof updates)[typeof OperationAdapterTypeId]["subscribe"]>,
    Stream.Stream<Project, "offline", ProjectRepo>
  >
>;
type _LookupKey = Expect<Equal<typeof lookupPlan.key, readonly [string]>>;
type _CommitParams = Expect<Equal<typeof commitPlan.params, ProjectInput>>;
type _StreamKey = Expect<Equal<typeof streamPlan.key, readonly [string]>>;
type _CommitWrites = Expect<
  Equal<
    ReturnType<NonNullable<NonNullable<typeof commitPlan.options>["writes"]>>,
    CacheWritePlan<"projects.by-id", readonly [string], Project>[]
  >
>;
type _DefaultRefreshKey = Expect<Equal<ReturnType<typeof defaultRefresh.key>, readonly []>>;
type _DefaultRefreshPlanKey = Expect<Equal<typeof defaultRefreshPlan.key, readonly []>>;
type _DefaultRefreshParams = Expect<Equal<typeof defaultRefreshPlan.params, undefined>>;
type _DefaultRefreshAdapterOptions = Expect<
  Equal<
    Parameters<(typeof defaultRefresh)[typeof OperationAdapterTypeId]["commit"]>,
    [OperationOptions]
  >
>;
type _LookupOutcome = Expect<
  Equal<
    ReturnType<NonNullable<NonNullable<typeof exactLookupPlan.options>["outcomes"]>["success"]>,
    ReturnType<typeof exactLookupSuccess>
  >
>;
type _CommitOutcome = Expect<
  Equal<
    ReturnType<NonNullable<NonNullable<typeof exactCommitPlan.options>["outcomes"]>["failure"]>,
    ReturnType<typeof exactCommitFailure>
  >
>;
type _StreamOutcome = Expect<
  Equal<
    ReturnType<NonNullable<NonNullable<typeof exactStreamPlan.options>["outcomes"]>["value"]>,
    ReturnType<typeof exactStreamValue>
  >
>;
type Proofs = readonly [
  _ResourceDefaultId,
  _TransactionDefaultId,
  _StreamDefaultId,
  _ProjectKey,
  _ProjectValue,
  _ProjectRequirements,
  _ProjectAdapter,
  _ProjectStaleTime,
  _ProjectGcTime,
  _CacheWriteDescriptor,
  _CacheWriteFamily,
  _CacheWriteKey,
  _ResourceCancelDescriptor,
  _ResourceCancelFamily,
  _ResourceCancelKey,
  _SaveValue,
  _SaveKey,
  _SavePlanKey,
  _SaveAdapter,
  _RefreshKey,
  _RefreshPlan,
  _RefreshParams,
  _RefreshOptionsParams,
  _TransactionCancelDescriptor,
  _TransactionCancelFamily,
  _TransactionCancelKey,
  _SaveRequirements,
  _StreamValue,
  _StreamRequirements,
  _StreamAdapter,
  _LookupKey,
  _CommitParams,
  _StreamKey,
  _CommitWrites,
  _DefaultRefreshKey,
  _DefaultRefreshPlanKey,
  _DefaultRefreshParams,
  _DefaultRefreshAdapterOptions,
  _LookupOutcome,
  _CommitOutcome,
  _StreamOutcome,
];

if (projectState.status === "ready" || projectState.status === "refreshing") {
  const exactProject: Project = projectState.data;
  void exactProject;
}
if (projectState.status === "failure" && "data" in projectState) {
  const retainedFailure: Project = projectState.data;
  void retainedFailure;
}
if (projectState.status === "defect" && "data" in projectState) {
  const retainedDefect: Project = projectState.data;
  void retainedDefect;
}
if (projectState.status === "interrupted" && "data" in projectState) {
  const retainedInterruption: Project = projectState.data;
  void retainedInterruption;
}
if (transactionState.status === "unknown") {
  const reconciliation: true = transactionState.reconcileRequired;
  void reconciliation;
}
if (streamState.status === "complete") {
  const generation: number = streamState.generation;
  void generation;
}
if (streamState.status === "failure") {
  const terminalFailure: "offline" = streamState.error;
  void terminalFailure;
}
if (streamState.status === "defect") {
  const terminalDefect: unknown = streamState.defect;
  void terminalDefect;
}
if (streamState.status === "interrupted") {
  const interruptedGeneration: number = streamState.generation;
  void interruptedGeneration;
}
if (streamState.hasValue) {
  const latestProject: Project = streamState.latest;
  void latestProject;
} else {
  const count: 0 = streamState.emissionCount;
  void count;
}

const invalidCanonicalKeys = (): void => {
  resource({
    id: "invalid.resource-key",
    // @ts-expect-error Keys are bounded canonical tuples.
    key: ({ id }: ProjectInput) => id,
    lookup: (params: ProjectInput) => Effect.succeed({ id: params.id }),
  });

  transaction({
    id: "invalid.transaction-key",
    // @ts-expect-error Transaction keys are bounded canonical tuples.
    key: (params: ProjectInput) => params.id,
    commit: (params: ProjectInput) => Effect.succeed({ id: params.id }),
  });

  stream({
    id: "invalid.stream-key",
    // @ts-expect-error Stream keys are bounded canonical tuples.
    key: (params: ProjectInput) => params.id,
    subscribe: (params: ProjectInput) => Stream.make({ id: params.id }),
  });

  resource({
    id: "invalid.undefined-value",
    key: (params: ProjectInput) => [params.id] as const,
    // @ts-expect-error Undefined is not a resource success value.
    lookup: () => Effect.succeed(undefined),
  });

  const noFailureMapping = transaction({
    id: "invalid.never-failure",
    key: () => ["never-failure"] as const,
    commit: () => Effect.succeed({ refreshed: true }),
  });
  noFailureMapping.commit(undefined, {
    // @ts-expect-error A never failure channel has no typed failure mapper.
    outcomes: { failure: (_error: never) => ({ type: "INVALID_FAILURE" }) },
  });

  transaction({
    id: "invalid.undefined-transaction-value",
    key: () => ["undefined-value"] as const,
    // @ts-expect-error Transaction success values cannot be undefined.
    commit: () => Effect.succeed(undefined),
  });

  // @ts-expect-error Streams have no actor cancellation method.
  updates.cancel(streamKey);

  type ParentInput = { readonly parentId: string };
  const parentInput = { parentId: "parent" } satisfies ParentInput;
  // @ts-expect-error A transaction retains its own parameter shape.
  save.commit(parentInput);
};

void invalidCanonicalKeys;
void save;
void updates;
const proofCount: Proofs["length"] = 41;
void proofCount;
