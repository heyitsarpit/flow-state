import { Effect, Stream, type Types } from "effect";
import type { Duration } from "effect";

import { canonicalizeKey, type CanonicalKeyInput, type ReadonlyCanonical } from "../key.js";
import type {
  CacheWritePlan,
  OperationErrorOf,
  OperationOptions,
  OperationProgram,
  OperationRequirementsOf,
  OperationValueOf,
  RequirementsOf,
  ValidOperationProgram,
} from "../operation.js";
import { resource } from "../resource.js";
import type { Resource, ResourceLookupAdapter } from "../resource.js";
import { stream } from "../stream.js";
import type { FlowStream, StreamSubscribeAdapter } from "../stream.js";
import { transaction } from "../transaction.js";
import type { Transaction, TransactionCommitAdapter } from "../transaction.js";

type Expect<Value extends true> = Value;

type DirectProgram = { readonly id: string };
type EffectProgram = Effect.Effect<DirectProgram, "missing", ProjectRepo>;
type MixedProgram = DirectProgram | Effect.Effect<number, "rejected", ProjectRepo>;
type FailureOnlyProgram = Effect.Effect<never, "failed", ProjectRepo>;
type PromiseProgram = Promise<DirectProgram>;
type PromiseLikeProgram = PromiseLike<DirectProgram>;
type PromiseUnionProgram = DirectProgram | PromiseLikeProgram;
type StructuralPromiseLike<Value> = { then: PromiseLike<Value>["then"] };
declare const promiseUnionProgram: PromiseUnionProgram;
declare const structuralPromiseLikeValue: StructuralPromiseLike<number>;
declare const mixedPromiseSuccessValue: number | Promise<number>;

const acceptValidOperationProgram = <Program>(program: Program & ValidOperationProgram<Program>) =>
  program;
const identity = <Value>(value: Value) => value;

const acceptedNumber = acceptValidOperationProgram(42);
declare const failureOnlyProgram: FailureOnlyProgram;
const acceptedFailureOnlyProgram = acceptValidOperationProgram(failureOnlyProgram);

const invalidOperationPrograms = () => {
  const directUndefined = undefined;
  const directVoid = (() => {})();
  const directUnknown = identity<unknown>("unknown");
  const wrappedUndefined = Effect.succeed(undefined);
  const wrappedVoid = Effect.succeed(directVoid);
  const wrappedUnknown = Effect.succeed(directUnknown);
  const promiseProgram = Promise.resolve({ id: "project-1" });
  const promiseLikeProgram: PromiseLikeProgram = promiseProgram;

  // @ts-expect-error Undefined is not a valid Operation success.
  acceptValidOperationProgram(directUndefined);
  // @ts-expect-error Void is not a valid Operation success.
  acceptValidOperationProgram(directVoid);
  // @ts-expect-error Unknown is not a valid Operation success.
  void acceptValidOperationProgram(directUnknown);
  // @ts-expect-error Wrapped undefined is not a valid Operation success.
  void acceptValidOperationProgram(wrappedUndefined);
  // @ts-expect-error Wrapped void is not a valid Operation success.
  void acceptValidOperationProgram(wrappedVoid);
  // @ts-expect-error Wrapped unknown is not a valid Operation success.
  void acceptValidOperationProgram(wrappedUnknown);
  // @ts-expect-error Promise successes are not implicit Operation programs.
  void acceptValidOperationProgram(promiseProgram);
  // @ts-expect-error PromiseLike successes are not implicit Operation programs.
  void acceptValidOperationProgram(promiseLikeProgram);
  // @ts-expect-error PromiseLike unions remain invalid Operation programs.
  void acceptValidOperationProgram(promiseUnionProgram);
};

void invalidOperationPrograms;

const invalidWrappedPromisePrograms = () => {
  const wrappedPromise = Effect.succeed(Promise.resolve(1));
  const wrappedPromiseLike = Effect.succeed(structuralPromiseLikeValue);
  const wrappedPromiseUnion = Effect.succeed(mixedPromiseSuccessValue);

  // @ts-expect-error A Promise in an Effect success channel is not an Operation program.
  acceptValidOperationProgram(wrappedPromise);
  // @ts-expect-error A structural PromiseLike in an Effect success channel is not an Operation program.
  acceptValidOperationProgram(wrappedPromiseLike);
  // @ts-expect-error A mixed Promise success channel is not an Operation program.
  acceptValidOperationProgram(wrappedPromiseUnion);

  resource({
    id: "invalid.wrapped-promise-resource",
    key: (id: string) => [id] as const,
    // @ts-expect-error A Promise in an Effect success channel is not a resource program.
    lookup: () => wrappedPromise,
  });
  transaction({
    id: "invalid.wrapped-promise-transaction",
    // @ts-expect-error A Promise in an Effect success channel is not a transaction program.
    commit: () => wrappedPromise,
  });
  transaction({
    id: "invalid.wrapped-promise-like-transaction",
    // @ts-expect-error A structural PromiseLike in an Effect success channel is not a transaction program.
    commit: () => wrappedPromiseLike,
  });
  transaction({
    id: "invalid.wrapped-promise-union-transaction",
    // @ts-expect-error A mixed Promise success channel is not a transaction program.
    commit: () => wrappedPromiseUnion,
  });
};

void invalidWrappedPromisePrograms;

export type _DirectValue = Expect<Types.Equals<OperationValueOf<DirectProgram>, DirectProgram>>;
export type _DirectError = Expect<Types.Equals<OperationErrorOf<DirectProgram>, never>>;
export type _DirectRequirements = Expect<
  Types.Equals<OperationRequirementsOf<DirectProgram>, never>
>;
export type _EffectValue = Expect<Types.Equals<OperationValueOf<EffectProgram>, DirectProgram>>;
export type _EffectError = Expect<Types.Equals<OperationErrorOf<EffectProgram>, "missing">>;
export type _EffectRequirements = Expect<
  Types.Equals<OperationRequirementsOf<EffectProgram>, ProjectRepo>
>;
export type _MixedValue = Expect<
  Types.Equals<OperationValueOf<MixedProgram>, DirectProgram | number>
>;
export type _MixedError = Expect<Types.Equals<OperationErrorOf<MixedProgram>, "rejected">>;
export type _MixedRequirements = Expect<
  Types.Equals<OperationRequirementsOf<MixedProgram>, ProjectRepo>
>;
export type _NumberProgramAccepted = Expect<Types.Equals<typeof acceptedNumber, 42>>;
export type _FailureOnlyValue = Expect<Types.Equals<OperationValueOf<FailureOnlyProgram>, never>>;
export type _FailureOnlyProgram = Expect<
  Types.Equals<typeof acceptedFailureOnlyProgram, FailureOnlyProgram>
>;
export type _FailureOnlyProgramAccepted = Expect<
  Types.Equals<ValidOperationProgram<FailureOnlyProgram>, unknown>
>;
export type _FailureOnlyError = Expect<
  Types.Equals<OperationErrorOf<FailureOnlyProgram>, "failed">
>;
export type _FailureOnlyRequirements = Expect<
  Types.Equals<OperationRequirementsOf<FailureOnlyProgram>, ProjectRepo>
>;
export type _UndefinedProgramRejected = Expect<
  Types.Equals<ValidOperationProgram<undefined>, never>
>;
export type _VoidProgramRejected = Expect<Types.Equals<ValidOperationProgram<void>, never>>;
export type _UnknownProgramRejected = Expect<Types.Equals<ValidOperationProgram<unknown>, never>>;
export type _WrappedUndefinedProgramRejected = Expect<
  Types.Equals<ValidOperationProgram<Effect.Effect<undefined>>, never>
>;
export type _WrappedVoidProgramRejected = Expect<
  Types.Equals<ValidOperationProgram<Effect.Effect<void>>, never>
>;
export type _WrappedUnknownProgramRejected = Expect<
  Types.Equals<ValidOperationProgram<Effect.Effect<unknown>>, never>
>;
export type _PromiseProgramRejected = Expect<
  Types.Equals<ValidOperationProgram<PromiseProgram>, never>
>;
export type _PromiseLikeProgramRejected = Expect<
  Types.Equals<ValidOperationProgram<PromiseLikeProgram>, never>
>;
export type _PromiseUnionProgramRejected = Expect<
  Types.Equals<ValidOperationProgram<PromiseUnionProgram>, never>
>;
export type _WrappedPromiseProgramRejected = Expect<
  Types.Equals<ValidOperationProgram<Effect.Effect<Promise<DirectProgram>>>, never>
>;
export type _WrappedPromiseLikeProgramRejected = Expect<
  Types.Equals<ValidOperationProgram<Effect.Effect<StructuralPromiseLike<DirectProgram>>>, never>
>;
export type _WrappedPromiseUnionProgramRejected = Expect<
  Types.Equals<ValidOperationProgram<Effect.Effect<DirectProgram | Promise<DirectProgram>>>, never>
>;

class ProjectRepo {
  readonly _tag = "ProjectRepo";
}

type ProjectInput = { readonly id: string };
type Project = { readonly id: string };

type CompleteProjectInput = {
  readonly id: string;
  readonly tenant: string;
  readonly requestLabel: string;
};

type NullableProjectInput = CompleteProjectInput | null;

type MismatchedProjectInput = {
  readonly id: string;
  readonly tenant: number;
  readonly requestLabel: string;
};

declare const loadProject: (id: string) => Effect.Effect<Project, "missing", ProjectRepo>;
declare const loadMixedProject: (
  id: string,
) => number | Effect.Effect<Project, "rejected", ProjectRepo>;
declare const loadFailedProject: (id: string) => Effect.Effect<never, "failed", ProjectRepo>;
declare const commitProject: (id: string) => Effect.Effect<Project, "missing", ProjectRepo>;
declare const commitMixedProject: (
  id: string,
) => number | Effect.Effect<Project, "rejected", ProjectRepo>;
declare const commitFailedProject: (id: string) => Effect.Effect<never, "failed", ProjectRepo>;

const inferredResourceKey = (params: CompleteProjectInput) => [params.id];
const inferredEffectResourceLookup = (params: CompleteProjectInput, options: OperationOptions) => {
  void params.tenant;
  void params.requestLabel;
  void options.signal;
  return loadProject(params.id);
};
const inferredFailureResourceLookup = (params: CompleteProjectInput) =>
  loadFailedProject(params.id);

const inferredDirectResource = resource({
  id: "projects.inferred-direct",
  key: (params: CompleteProjectInput) => [params.id],
  lookup: (params, options) => {
    const fullParams: CompleteProjectInput = params;
    const signal: AbortSignal = options.signal;
    void fullParams.tenant;
    void fullParams.requestLabel;
    void signal;
    return params.id.length;
  },
});

const inferredEffectResource = resource({
  id: "projects.inferred-effect",
  key: inferredResourceKey,
  lookup: inferredEffectResourceLookup,
});

const inferredMixedResource = resource({
  id: "projects.inferred-mixed",
  lookup: (params, options) => {
    const fullParams: CompleteProjectInput = params;
    const signal: AbortSignal = options.signal;
    void fullParams.tenant;
    void fullParams.requestLabel;
    void signal;
    return loadMixedProject(params.id);
  },
  key: inferredResourceKey,
});

const inferredFailureResource = resource({
  id: "projects.inferred-failure",
  key: inferredResourceKey,
  lookup: inferredFailureResourceLookup,
});

const inferredTransactionKey = (params: CompleteProjectInput) => [params.id];
const inferredEffectTransactionCommit = (
  params: CompleteProjectInput,
  options: OperationOptions,
) => {
  void params.tenant;
  void params.requestLabel;
  void options.signal;
  return commitProject(params.id);
};
const inferredFailureTransactionCommit = (params: CompleteProjectInput) =>
  commitFailedProject(params.id);

const inferredDirectTransaction = transaction({
  id: "projects.inferred-direct-transaction",
  key: (params: CompleteProjectInput) => [params.id],
  commit: (params, options) => {
    const fullParams: CompleteProjectInput = params;
    const signal: AbortSignal = options.signal;
    void fullParams.tenant;
    void fullParams.requestLabel;
    void signal;
    return params.id.length;
  },
  persist: true,
  concurrency: "serialize",
});

const inferredEffectTransaction = transaction({
  id: "projects.inferred-effect-transaction",
  key: inferredTransactionKey,
  commit: inferredEffectTransactionCommit,
});

const inferredMixedTransaction = transaction({
  id: "projects.inferred-mixed-transaction",
  commit: (params, options) => {
    const fullParams: CompleteProjectInput = params;
    const signal: AbortSignal = options.signal;
    void fullParams.tenant;
    void fullParams.requestLabel;
    void signal;
    return commitMixedProject(params.id);
  },
  key: inferredTransactionKey,
});

const inferredFailureTransaction = transaction({
  id: "projects.inferred-failure-transaction",
  key: inferredTransactionKey,
  commit: inferredFailureTransactionCommit,
});

const inferredConstantTransaction = transaction({
  id: "projects.inferred-constant-transaction",
  key: () => ["constant"],
  commit: (options) => {
    const signal: AbortSignal = options.signal;
    void signal;
    return 42;
  },
  persist: true,
  concurrency: "allow",
});

const inferredParameterlessDirectTransaction = transaction({
  id: "projects.inferred-parameterless-direct-transaction",
  commit: (options) => {
    const signal: AbortSignal = options.signal;
    void signal;
    const value: number = options.signal.aborted ? 0 : 42;
    return value;
  },
  persist: true,
  concurrency: "allow",
});

const inferredParameterlessEffectTransaction = transaction({
  id: "projects.inferred-parameterless-effect-transaction",
  commit: (options) => {
    const signal: AbortSignal = options.signal;
    void signal;
    return commitProject("project-1");
  },
});

const inferredParameterlessMixedTransaction = transaction({
  id: "projects.inferred-parameterless-mixed-transaction",
  commit: (options) => {
    const signal: AbortSignal = options.signal;
    void signal;
    const value: number = options.signal.aborted ? 0 : 42;
    return Math.random() > 0.5 ? value : commitMixedProject("project-1");
  },
});

const inferredParameterlessFailureTransaction = transaction({
  id: "projects.inferred-parameterless-failure-transaction",
  commit: (options) => {
    const signal: AbortSignal = options.signal;
    void signal;
    return commitFailedProject("project-1");
  },
});

const inferredNullableTransaction = transaction({
  id: "projects.inferred-nullable-transaction",
  key: (params: NullableProjectInput) => [params?.id ?? "none"],
  commit: (params, options) => {
    const fullParams: NullableProjectInput = params;
    const signal: AbortSignal = options.signal;
    void fullParams;
    void signal;
    return params?.id ?? "none";
  },
});

const mismatchedResource = () => {
  resource({
    id: "projects.mismatched-input",
    key: inferredResourceKey,
    // @ts-expect-error Resource adapters retain the complete key-anchored P.
    lookup: (params: MismatchedProjectInput, _options: OperationOptions) => params.id,
  });
};

void mismatchedResource;

const mismatchedTransaction = () => {
  transaction({
    id: "projects.mismatched-transaction-input",
    // @ts-expect-error Transaction adapters retain the complete key-anchored P.
    key: inferredTransactionKey,
    // @ts-expect-error Transaction adapters retain the complete key-anchored P.
    commit: (params: MismatchedProjectInput, _options: OperationOptions) => params.id,
  });
};

void mismatchedTransaction;

const mismatchedNarrowTransaction = () => {
  transaction({
    id: "projects.mismatched-narrow-transaction-input",
    // @ts-expect-error Narrowed commit rejection also rejects the fallback overload at the key.
    key: (params: NullableProjectInput) => [params?.id ?? "none"],
    // @ts-expect-error A keyed commit cannot narrow nullable full P, even with the same K.
    commit: (params: CompleteProjectInput, _options: OperationOptions) => params.id,
  });
};

void mismatchedNarrowTransaction;

type ResourceChannels<Value> =
  Value extends Resource<infer _Id, infer _P, infer _K, infer A, infer E, infer R>
    ? readonly [A, E, R]
    : never;

type TransactionChannels<Value> =
  Value extends Transaction<infer _Id, infer _P, infer _K, infer A, infer E, infer R>
    ? readonly [A, E, R]
    : never;

export type _InferredDirectChannels = Expect<
  Types.Equals<ResourceChannels<typeof inferredDirectResource>, readonly [number, never, never]>
>;
export type _InferredDirectParams = Expect<
  Types.Equals<Parameters<typeof inferredDirectResource.key>[0], CompleteProjectInput>
>;
export type _InferredDirectKey = Expect<
  Types.Equals<ReturnType<typeof inferredDirectResource.key>, readonly [string]>
>;
export type _InferredEffectChannels = Expect<
  Types.Equals<
    ResourceChannels<typeof inferredEffectResource>,
    readonly [Project, "missing", ProjectRepo]
  >
>;
export type _InferredMixedChannels = Expect<
  Types.Equals<
    ResourceChannels<typeof inferredMixedResource>,
    readonly [number | Project, "rejected", ProjectRepo]
  >
>;
export type _InferredFailureChannels = Expect<
  Types.Equals<
    ResourceChannels<typeof inferredFailureResource>,
    readonly [never, "failed", ProjectRepo]
  >
>;
export type _InferredDirectTransactionChannels = Expect<
  Types.Equals<
    TransactionChannels<typeof inferredDirectTransaction>,
    readonly [number, never, never]
  >
>;
export type _InferredDirectTransactionParams = Expect<
  Types.Equals<Parameters<typeof inferredDirectTransaction.key>[0], CompleteProjectInput>
>;
export type _InferredDirectTransactionKey = Expect<
  Types.Equals<ReturnType<typeof inferredDirectTransaction.key>, readonly [string]>
>;
export type _InferredEffectTransactionChannels = Expect<
  Types.Equals<
    TransactionChannels<typeof inferredEffectTransaction>,
    readonly [Project, "missing", ProjectRepo]
  >
>;
export type _InferredMixedTransactionChannels = Expect<
  Types.Equals<
    TransactionChannels<typeof inferredMixedTransaction>,
    readonly [number | Project, "rejected", ProjectRepo]
  >
>;
export type _InferredFailureTransactionChannels = Expect<
  Types.Equals<
    TransactionChannels<typeof inferredFailureTransaction>,
    readonly [never, "failed", ProjectRepo]
  >
>;
export type _InferredConstantTransactionChannels = Expect<
  Types.Equals<
    TransactionChannels<typeof inferredConstantTransaction>,
    readonly [number, never, never]
  >
>;
export type _InferredConstantTransactionKey = Expect<
  Types.Equals<ReturnType<typeof inferredConstantTransaction.key>, readonly ["constant"]>
>;
export type _InferredConstantTransactionParams = Expect<
  Types.Equals<Parameters<typeof inferredConstantTransaction.key>[0], undefined>
>;
export type _InferredParameterlessDirectChannels = Expect<
  Types.Equals<
    TransactionChannels<typeof inferredParameterlessDirectTransaction>,
    readonly [number, never, never]
  >
>;
export type _InferredParameterlessDirectKey = Expect<
  Types.Equals<ReturnType<typeof inferredParameterlessDirectTransaction.key>, readonly []>
>;
export type _InferredParameterlessDirectParams = Expect<
  Types.Equals<Parameters<typeof inferredParameterlessDirectTransaction.key>[0], undefined>
>;
export type _InferredParameterlessEffectChannels = Expect<
  Types.Equals<
    TransactionChannels<typeof inferredParameterlessEffectTransaction>,
    readonly [Project, "missing", ProjectRepo]
  >
>;
export type _InferredParameterlessMixedChannels = Expect<
  Types.Equals<
    TransactionChannels<typeof inferredParameterlessMixedTransaction>,
    readonly [number | Project, "rejected", ProjectRepo]
  >
>;
export type _InferredParameterlessFailureChannels = Expect<
  Types.Equals<
    TransactionChannels<typeof inferredParameterlessFailureTransaction>,
    readonly [never, "failed", ProjectRepo]
  >
>;
export type _InferredNullableTransactionParams = Expect<
  Types.Equals<Parameters<typeof inferredNullableTransaction.key>[0], NullableProjectInput>
>;

const projectAdapter: ResourceLookupAdapter<ProjectInput, Project, "missing", ProjectRepo> = (
  { id }: ProjectInput,
  { signal }: { readonly signal: AbortSignal },
) => {
  void signal;
  return Effect.succeed({ id });
};

const project = resource({
  id: "projects.by-id",
  key: ({ id }: ProjectInput) => [id] as const,
  lookup: projectAdapter,
});

const directProjectAdapter: ResourceLookupAdapter<ProjectInput, Project, never, never> = ({
  id,
}) => ({ id });
const directProject = resource({
  id: "projects.direct",
  key: ({ id }: ProjectInput) => [id] as const,
  lookup: directProjectAdapter,
});
void directProject;

const saveAdapter: TransactionCommitAdapter<ProjectInput, Project, "rejected", ProjectRepo> = (
  params: ProjectInput,
  { signal }: { readonly signal: AbortSignal },
) => {
  void signal;
  return Effect.succeed({ id: params.id });
};

const save = transaction({
  id: "projects.save",
  key: (params: ProjectInput) => [params.id] as const,
  commit: saveAdapter,
});

const directSaveAdapter: TransactionCommitAdapter<ProjectInput, Project, never, never> = ({
  id,
}) => ({ id });
const directSave = transaction({
  id: "projects.direct-save",
  key: ({ id }: ProjectInput) => [id] as const,
  commit: directSaveAdapter,
});
void directSave;

const updatesAdapter: StreamSubscribeAdapter<ProjectInput, Project, "offline", ProjectRepo> = (
  { id }: ProjectInput,
  { signal }: { readonly signal: AbortSignal },
) => {
  void signal;
  return Stream.make({ id });
};

const updates = stream({
  id: "projects.updates",
  key: ({ id }: ProjectInput) => [id] as const,
  subscribe: updatesAdapter,
});

const directUpdatesAdapter: StreamSubscribeAdapter<ProjectInput, Project, never, never> = ({
  id,
}) => Stream.make({ id });
const directUpdates = stream({
  id: "projects.direct-updates",
  key: ({ id }: ProjectInput) => [id] as const,
  subscribe: directUpdatesAdapter,
});
void directUpdates;

const projectKey = project.key({ id: "project-1" });
const exactCanonicalKey = canonicalizeKey(["project-1", { scope: "project" }] as const);
const mutableCanonicalSource: [string, { scope: string }] = ["project-1", { scope: "project" }];
const readonlyCanonicalKey = canonicalizeKey(mutableCanonicalSource);
declare const unadmittedRecord: { readonly child: unknown };
const unadmittedChild = unadmittedRecord.child;
// Private record admission remains owner-local; this fixture covers only the public child boundary.
// @ts-expect-error An unadmitted child cannot be treated as a canonical input.
const unadmittedCanonicalChild: CanonicalKeyInput = unadmittedChild;
void unadmittedCanonicalChild;
// @ts-expect-error Canonical keys reject undefined values.
canonicalizeKey([undefined]);
// @ts-expect-error Canonical keys reject bigint values.
canonicalizeKey([1n]);
// @ts-expect-error Canonical keys reject symbol values.
canonicalizeKey([Symbol("invalid")]);
// @ts-expect-error Canonical keys reject function values.
canonicalizeKey([() => "invalid"]);
// @ts-expect-error Canonical keys reject undefined nested values.
canonicalizeKey([{ nested: undefined }]);
// @ts-expect-error Canonicalized outer tuples are readonly.
readonlyCanonicalKey[0] = "changed";
// @ts-expect-error Canonicalized nested records are readonly.
readonlyCanonicalKey[1].scope = "changed";
declare const depth16: ReadonlyCanonical<[[[[[[[[[[[[[[[[[string]]]]]]]]]]]]]]]]]>;
// @ts-expect-error ReadonlyCanonical keeps the depth-16 container readonly.
depth16[0][0][0][0][0][0][0][0][0][0][0][0][0][0][0][0][0] = "changed";
declare let depth17: ReadonlyCanonical<[[[[[[[[[[[[[[[[[[string]]]]]]]]]]]]]]]]]]>;
depth17[0][0][0][0][0][0][0][0][0][0][0][0][0][0][0][0][0][0] = "changed";
declare const depth17Invalid: [[[[[[[[[[[[[[[[[[undefined]]]]]]]]]]]]]]]]]];
// @ts-expect-error Canonical input rejects undefined even at the depth cutoff.
canonicalizeKey(depth17Invalid);
const projectState = project.getState(projectKey);
const transactionKey = save.key({ id: "project-1" });
const transactionState = save.getState(transactionKey);
const streamKey = updates.key({ id: "project-1" });
const streamState = updates.getState(streamKey);
const defaultRefreshAdapter: TransactionCommitAdapter<
  undefined,
  { refreshed: boolean },
  never,
  never
> = ({ signal }) => {
  void signal;
  return Effect.succeed({ refreshed: true });
};
const defaultRefresh = transaction({
  id: "projects.refresh",
  commit: defaultRefreshAdapter,
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
const lookupWithoutOptions = project.lookup({ id: "project-1" });
const lookupWithUndefined = project.lookup({ id: "project-1" }, undefined);
const subscribeWithoutOptions = project.subscribe({ id: "project-1" });
const subscribeWithUndefined = project.subscribe({ id: "project-1" }, undefined);
const refetchWithoutOptions = project.refetch({ id: "project-1" });
const refetchWithUndefined = project.refetch({ id: "project-1" }, undefined);
const commitWithoutOptions = save.commit({ id: "project-1" });
const commitWithUndefined = save.commit({ id: "project-1" }, undefined);
const streamWithoutOptions = updates.subscribe({ id: "project-1" });
const streamWithUndefined = updates.subscribe({ id: "project-1" }, undefined);
const mutableKeyTransaction = transaction({
  id: "projects.mutable-key",
  key: (params: ProjectInput) => [params.id],
  commit: (params: ProjectInput) => Effect.succeed({ id: params.id }),
});
const mutableTransactionKey = mutableKeyTransaction.key({ id: "project-1" });
// @ts-expect-error Transaction keys are canonical readonly values.
mutableTransactionKey[0] = "changed";
// RETURN_TYPE: Preserves the mutable tuple/record input needed to prove recursive canonicalization publishes readonly keys.
const nestedKey = (_params: ProjectInput): [{ scope: string[] }] => [{ scope: ["project"] }];
const nestedResource = resource({
  id: "projects.nested-resource",
  key: nestedKey,
  lookup: () => Effect.succeed({ id: "project-1" }),
});
const nestedTransaction = transaction({
  id: "projects.nested-transaction",
  key: nestedKey,
  commit: () => Effect.succeed({ id: "project-1" }),
});
const nestedStream = stream({
  id: "projects.nested-stream",
  key: nestedKey,
  subscribe: () => Stream.make({ id: "project-1" }),
});
const nestedResourceKey = nestedResource.key({ id: "project-1" });
const nestedResourcePlan = nestedResource.lookup({ id: "project-1" });
const nestedTransactionKey = nestedTransaction.key({ id: "project-1" });
const nestedTransactionPlan = nestedTransaction.commit({ id: "project-1" });
const nestedStreamKey = nestedStream.key({ id: "project-1" });
const nestedStreamPlan = nestedStream.subscribe({ id: "project-1" });
// @ts-expect-error Resource key records are recursively readonly.
nestedResourceKey[0].scope[0] = "changed";
// @ts-expect-error Resource plan keys are recursively readonly.
nestedResourcePlan.key[0].scope[0] = "changed";
// @ts-expect-error Transaction key records are recursively readonly.
nestedTransactionKey[0].scope[0] = "changed";
// @ts-expect-error Transaction plan keys are recursively readonly.
nestedTransactionPlan.key[0].scope[0] = "changed";
// @ts-expect-error Stream key records are recursively readonly.
nestedStreamKey[0].scope[0] = "changed";
// @ts-expect-error Stream plan keys are recursively readonly.
nestedStreamPlan.key[0].scope[0] = "changed";
const lookupPlan = project.lookup(
  { id: "project-1" },
  {
    outcomes: {
      success: (value: Project) => ({ type: "PROJECT_READY", value }),
      failure: (error: "missing") => ({ type: "PROJECT_MISSING", error }),
    },
  },
);
const commitPlan = save.commit(
  { id: "project-1" },
  {
    writes: ({ params, value }: { readonly params: ProjectInput; readonly value: Project }) => [
      project.setData(project.key(params), value),
    ],
    outcomes: {
      success: (value: Project) => ({ type: "PROJECT_SAVED", value }),
      failure: (error: "rejected") => ({ type: "PROJECT_REJECTED", error }),
      defect: (defect: unknown) => ({ type: "PROJECT_DEFECT", defect }),
      interrupt: () => ({ type: "PROJECT_INTERRUPTED" }),
    },
  },
);
const streamPlan = updates.subscribe(
  { id: "project-1" },
  {
    outcomes: {
      value: (value: Project) => ({ type: "PROJECT_UPDATE", value }),
      failure: (error: "offline") => ({ type: "PROJECT_OFFLINE", error }),
      complete: () => ({ type: "PROJECT_COMPLETE" }),
      defect: (defect: unknown) => ({ type: "PROJECT_STREAM_DEFECT", defect }),
      interrupt: () => ({ type: "PROJECT_STREAM_INTERRUPTED" }),
    },
  },
);
const exactLookupSuccess = (value: Project) => ({ type: "PROJECT_READY", value }) as const;
const exactLookupOptions = {
  outcomes: { success: exactLookupSuccess },
} as const;
const exactLookupPlan = project.lookup({ id: "project-1" }, exactLookupOptions);
const exactSubscribeSuccess = (value: Project) => ({ type: "PROJECT_SUBSCRIBED", value }) as const;
const exactSubscribeOptions = {
  outcomes: { value: exactSubscribeSuccess },
} as const;
const exactSubscribePlan = project.subscribe({ id: "project-1" }, exactSubscribeOptions);
const exactRefetchFailure = (error: "missing") =>
  ({ type: "PROJECT_REFETCH_FAILED", error }) as const;
const exactRefetchOptions = {
  outcomes: { failure: exactRefetchFailure },
} as const;
const exactRefetchPlan = project.refetch({ id: "project-1" }, exactRefetchOptions);
const exactCommitFailure = (error: "rejected") => ({ type: "PROJECT_REJECTED", error }) as const;
const exactCommitOptions = {
  outcomes: { failure: exactCommitFailure },
} as const;
const exactCommitPlan = save.commit({ id: "project-1" }, exactCommitOptions);
const exactStreamValue = (value: Project) => ({ type: "PROJECT_UPDATE", value }) as const;
const exactStreamOptions = {
  outcomes: { value: exactStreamValue },
} as const;
const exactStreamPlan = updates.subscribe({ id: "project-1" }, exactStreamOptions);
const cacheWritePlan = project.setData(projectKey, { id: "project-1" });
const resourceCancelPlan = project.cancel(projectKey);
const transactionCancelPlan = save.cancel(transactionKey);

const readonlyAuxiliaryPlans = () => {
  // @ts-expect-error Cache write plan fields are readonly by type.
  cacheWritePlan.kind = "cache-write";
  // @ts-expect-error Resource cancellation fields are readonly by type.
  resourceCancelPlan.family = "resource";
  // @ts-expect-error Transaction cancellation fields are readonly by type.
  transactionCancelPlan.descriptor = "projects.changed";
};
void readonlyAuxiliaryPlans;

// Positive compile cases preserve operation inference and plan relationships.
export type _ProjectKey = Expect<Types.Equals<typeof projectKey, readonly [string]>>;
export type _ProjectDescriptorKind = Expect<Types.Equals<typeof project.kind, "resource">>;
export type _ProjectDescriptorId = Expect<Types.Equals<typeof project.id, "projects.by-id">>;
export type _ProjectParams = Expect<Types.Equals<Parameters<typeof project.key>[0], ProjectInput>>;
export type _ExactCanonicalKey = Expect<
  Types.Equals<typeof exactCanonicalKey, readonly ["project-1", { readonly scope: "project" }]>
>;
export type _ReadonlyCanonicalKey = Expect<
  Types.Equals<typeof readonlyCanonicalKey, readonly [string, { readonly scope: string }]>
>;
export type _ResourceDefaultId = Expect<Types.Equals<Resource["id"], string>>;
export type _TransactionDefaultId = Expect<Types.Equals<Transaction["id"], string>>;
export type _StreamDefaultId = Expect<Types.Equals<FlowStream["id"], string>>;
export type _ProjectValue = Expect<
  Types.Equals<ReturnType<typeof project.getData>, Project | undefined>
>;
export type _ProjectRequirements = Expect<
  Types.Equals<RequirementsOf<typeof project>, ProjectRepo>
>;
export type _ProjectAdapter = Expect<
  Types.Equals<ReturnType<typeof projectAdapter>, OperationProgram<Project, "missing", ProjectRepo>>
>;
export type _DirectProject = Expect<
  Types.Equals<ReturnType<typeof directProjectAdapter>, OperationProgram<Project, never, never>>
>;
export type _DirectSave = Expect<
  Types.Equals<ReturnType<typeof directSaveAdapter>, OperationProgram<Project, never, never>>
>;
export type _DirectUpdates = Expect<
  Types.Equals<ReturnType<typeof directUpdatesAdapter>, Stream.Stream<Project>>
>;
export type _ProjectStaleTime = Expect<
  Types.Equals<typeof project.staleTime, Duration.Input | undefined>
>;
export type _ProjectGcTime = Expect<
  Types.Equals<typeof project.gcTime, Duration.Input | undefined>
>;
export type _CacheWriteDescriptor = Expect<
  Types.Equals<typeof cacheWritePlan.descriptor, "projects.by-id">
>;
export type _CacheWriteFamily = Expect<Types.Equals<typeof cacheWritePlan.family, "resource">>;
export type _CacheWriteKey = Expect<Types.Equals<typeof cacheWritePlan.key, readonly [string]>>;
export type _ResourceCancelDescriptor = Expect<
  Types.Equals<typeof resourceCancelPlan.descriptor, "projects.by-id">
>;
export type _ResourceCancelFamily = Expect<
  Types.Equals<typeof resourceCancelPlan.family, "resource">
>;
export type _ResourceCancelKey = Expect<
  Types.Equals<typeof resourceCancelPlan.key, readonly [string]>
>;
export type _SaveValue = Expect<
  Types.Equals<ReturnType<typeof save.commit>["params"], ProjectInput>
>;
export type _SaveDescriptorKind = Expect<Types.Equals<typeof save.kind, "transaction">>;
export type _SaveDescriptorId = Expect<Types.Equals<typeof save.id, "projects.save">>;
export type _SaveParams = Expect<Types.Equals<Parameters<typeof save.key>[0], ProjectInput>>;
export type _SaveKey = Expect<
  Types.Equals<ReturnType<NonNullable<typeof save.key>>, readonly [string]>
>;
export type _SavePlanKey = Expect<Types.Equals<typeof commitPlan.key, readonly [string]>>;
export type _SaveAdapter = Expect<
  Types.Equals<ReturnType<typeof saveAdapter>, OperationProgram<Project, "rejected", ProjectRepo>>
>;
export type _RefreshKey = Expect<
  Types.Equals<ReturnType<typeof refresh.key>, readonly ["refresh"]>
>;
export type _RefreshPlan = Expect<Types.Equals<typeof refreshPlan.key, readonly ["refresh"]>>;
export type _RefreshParams = Expect<Types.Equals<typeof refreshPlan.params, undefined>>;
export type _RefreshOptionsParams = Expect<
  Types.Equals<typeof refreshOptionsPlan.params, undefined>
>;
export type _TransactionCancelDescriptor = Expect<
  Types.Equals<typeof transactionCancelPlan.descriptor, "projects.save">
>;
export type _TransactionCancelFamily = Expect<
  Types.Equals<typeof transactionCancelPlan.family, "transaction">
>;
export type _TransactionCancelKey = Expect<
  Types.Equals<typeof transactionCancelPlan.key, readonly [string]>
>;
export type _SaveRequirements = Expect<Types.Equals<RequirementsOf<typeof save>, ProjectRepo>>;
export type _StreamValue = Expect<
  Types.Equals<ReturnType<typeof updates.subscribe>["params"], ProjectInput>
>;
export type _StreamDescriptorKind = Expect<Types.Equals<typeof updates.kind, "stream">>;
export type _StreamDescriptorId = Expect<Types.Equals<typeof updates.id, "projects.updates">>;
export type _StreamParams = Expect<Types.Equals<Parameters<typeof updates.key>[0], ProjectInput>>;
export type _StreamRequirements = Expect<Types.Equals<RequirementsOf<typeof updates>, ProjectRepo>>;
export type _StreamAdapter = Expect<
  Types.Equals<ReturnType<typeof updatesAdapter>, Stream.Stream<Project, "offline", ProjectRepo>>
>;
export type _LookupKey = Expect<Types.Equals<typeof lookupPlan.key, readonly [string]>>;
export type _CommitParams = Expect<Types.Equals<typeof commitPlan.params, ProjectInput>>;
export type _StreamKey = Expect<Types.Equals<typeof streamPlan.key, readonly [string]>>;
export type _CommitWrites = Expect<
  Types.Equals<
    ReturnType<NonNullable<NonNullable<typeof commitPlan.options>["writes"]>>,
    CacheWritePlan<"projects.by-id", readonly [string], Project>[]
  >
>;
export type _DefaultRefreshKey = Expect<
  Types.Equals<ReturnType<typeof defaultRefresh.key>, readonly []>
>;
export type _DefaultRefreshPlanKey = Expect<
  Types.Equals<typeof defaultRefreshPlan.key, readonly []>
>;
export type _DefaultRefreshParams = Expect<
  Types.Equals<typeof defaultRefreshPlan.params, undefined>
>;
export type _DefaultRefreshAdapterOptions = Expect<
  Types.Equals<Parameters<typeof defaultRefreshAdapter>, [OperationOptions]>
>;
export type _LookupUndefined = Expect<
  Types.Equals<typeof lookupWithoutOptions, typeof lookupWithUndefined>
>;
export type _SubscribeUndefined = Expect<
  Types.Equals<typeof subscribeWithoutOptions, typeof subscribeWithUndefined>
>;
export type _RefetchUndefined = Expect<
  Types.Equals<typeof refetchWithoutOptions, typeof refetchWithUndefined>
>;
export type _CommitUndefined = Expect<
  Types.Equals<typeof commitWithoutOptions, typeof commitWithUndefined>
>;
export type _StreamUndefined = Expect<
  Types.Equals<typeof streamWithoutOptions, typeof streamWithUndefined>
>;
export type _MutableTransactionKey = Expect<
  Types.Equals<typeof mutableTransactionKey, readonly [string]>
>;
export type _NestedResourceKey = Expect<
  Types.Equals<typeof nestedResourceKey, readonly [{ readonly scope: readonly string[] }]>
>;
export type _NestedResourcePlanKey = Expect<
  Types.Equals<typeof nestedResourcePlan.key, readonly [{ readonly scope: readonly string[] }]>
>;
export type _NestedTransactionKey = Expect<
  Types.Equals<typeof nestedTransactionKey, readonly [{ readonly scope: readonly string[] }]>
>;
export type _NestedTransactionPlanKey = Expect<
  Types.Equals<typeof nestedTransactionPlan.key, readonly [{ readonly scope: readonly string[] }]>
>;
export type _NestedStreamKey = Expect<
  Types.Equals<typeof nestedStreamKey, readonly [{ readonly scope: readonly string[] }]>
>;
export type _NestedStreamPlanKey = Expect<
  Types.Equals<typeof nestedStreamPlan.key, readonly [{ readonly scope: readonly string[] }]>
>;
export type _LookupOutcome = Expect<
  Types.Equals<
    ReturnType<NonNullable<NonNullable<typeof exactLookupPlan.options>["outcomes"]>["success"]>,
    ReturnType<typeof exactLookupSuccess>
  >
>;
export type _LookupPlanOptions = Expect<
  Types.Equals<NonNullable<typeof exactLookupPlan.options>, typeof exactLookupOptions>
>;
export type _SubscribeOutcome = Expect<
  Types.Equals<
    ReturnType<NonNullable<NonNullable<typeof exactSubscribePlan.options>["outcomes"]>["value"]>,
    ReturnType<typeof exactSubscribeSuccess>
  >
>;
export type _SubscribePlanOptions = Expect<
  Types.Equals<NonNullable<typeof exactSubscribePlan.options>, typeof exactSubscribeOptions>
>;
export type _RefetchOutcome = Expect<
  Types.Equals<
    ReturnType<NonNullable<NonNullable<typeof exactRefetchPlan.options>["outcomes"]>["failure"]>,
    ReturnType<typeof exactRefetchFailure>
  >
>;
export type _RefetchPlanOptions = Expect<
  Types.Equals<NonNullable<typeof exactRefetchPlan.options>, typeof exactRefetchOptions>
>;
export type _CommitOutcome = Expect<
  Types.Equals<
    ReturnType<NonNullable<NonNullable<typeof exactCommitPlan.options>["outcomes"]>["failure"]>,
    ReturnType<typeof exactCommitFailure>
  >
>;
export type _CommitPlanOptions = Expect<
  Types.Equals<NonNullable<typeof exactCommitPlan.options>, typeof exactCommitOptions>
>;
export type _StreamOutcome = Expect<
  Types.Equals<
    ReturnType<NonNullable<NonNullable<typeof exactStreamPlan.options>["outcomes"]>["value"]>,
    ReturnType<typeof exactStreamValue>
  >
>;
export type _StreamPlanOptions = Expect<
  Types.Equals<NonNullable<typeof exactStreamPlan.options>, typeof exactStreamOptions>
>;
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

const invalidKeyedTransactionPrograms = () => {
  const key = (params: ProjectInput) => [params.id];
  const directUndefined = undefined;
  const directVoid = (() => {})();
  const directUnknown = identity<unknown>("unknown");
  const wrappedUndefined = Effect.succeed(undefined);
  const wrappedVoid = Effect.succeed(directVoid);
  const wrappedUnknown = Effect.succeed(directUnknown);
  const promiseProgram = Promise.resolve({ id: "project-1" });
  const promiseLikeProgram: PromiseLike<Project> = promiseProgram;

  transaction({
    id: "invalid.direct-undefined-transaction",
    // @ts-expect-error The invalid program also makes this keyed fallback inapplicable.
    key,
    // @ts-expect-error Undefined is not a transaction success value.
    commit: () => directUndefined,
  });
  transaction({
    id: "invalid.direct-void-transaction",
    // @ts-expect-error The invalid program also makes this keyed fallback inapplicable.
    key,
    // @ts-expect-error Void is not a transaction success value.
    commit: () => directVoid,
  });
  transaction({
    id: "invalid.direct-unknown-transaction",
    // @ts-expect-error The invalid program also makes this keyed fallback inapplicable.
    key,
    // @ts-expect-error Unknown is not a transaction success value.
    commit: () => directUnknown,
  });
  transaction({
    id: "invalid.promise-transaction-program",
    // @ts-expect-error The invalid program also makes this keyed fallback inapplicable.
    key,
    // @ts-expect-error Promise successes are not implicit Operation programs.
    commit: () => promiseProgram,
  });
  transaction({
    id: "invalid.wrapped-undefined-transaction",
    // @ts-expect-error The invalid program also makes this keyed fallback inapplicable.
    key,
    // @ts-expect-error Wrapped undefined is not a transaction success value.
    commit: () => wrappedUndefined,
  });
  transaction({
    id: "invalid.wrapped-void-transaction",
    // @ts-expect-error The invalid program also makes this keyed fallback inapplicable.
    key,
    // @ts-expect-error Wrapped void is not a transaction success value.
    commit: () => wrappedVoid,
  });
  transaction({
    id: "invalid.wrapped-unknown-transaction",
    // @ts-expect-error The invalid program also makes this keyed fallback inapplicable.
    key,
    // @ts-expect-error Wrapped unknown is not a transaction success value.
    commit: () => wrappedUnknown,
  });
  transaction({
    id: "invalid.promise-like-transaction",
    // @ts-expect-error The invalid program also makes this keyed fallback inapplicable.
    key,
    // @ts-expect-error PromiseLike successes are not implicit Operation programs.
    commit: () => promiseLikeProgram,
  });
  transaction({
    id: "invalid.promise-union-transaction",
    // @ts-expect-error The invalid program also makes this keyed fallback inapplicable.
    key,
    // @ts-expect-error PromiseLike unions remain invalid Operation programs.
    commit: () => promiseUnionProgram,
  });
};

void invalidKeyedTransactionPrograms;

const invalidParameterlessTransactionPrograms = () => {
  const directUndefined = undefined;
  const directVoid = (() => {})();
  const directUnknown = identity<unknown>("unknown");
  const wrappedUndefined = Effect.succeed(undefined);
  const wrappedVoid = Effect.succeed(directVoid);
  const wrappedUnknown = Effect.succeed(directUnknown);
  const promiseProgram = Promise.resolve({ id: "project-1" });
  const promiseLikeProgram: PromiseLike<Project> = promiseProgram;

  transaction({
    id: "invalid.parameterless-direct-undefined-transaction",
    // @ts-expect-error Undefined is not a transaction success value.
    commit: (options) => {
      void options.signal;
      return directUndefined;
    },
  });
  transaction({
    id: "invalid.parameterless-direct-void-transaction",
    // @ts-expect-error Void is not a transaction success value.
    commit: (options) => {
      void options.signal;
      return directVoid;
    },
  });
  transaction({
    id: "invalid.parameterless-direct-unknown-transaction",
    // @ts-expect-error Unknown is not a transaction success value.
    commit: (options) => {
      void options.signal;
      return directUnknown;
    },
  });
  transaction({
    id: "invalid.parameterless-wrapped-undefined-transaction",
    // @ts-expect-error Wrapped undefined is not a transaction success value.
    commit: (options) => {
      void options.signal;
      return wrappedUndefined;
    },
  });
  transaction({
    id: "invalid.parameterless-wrapped-void-transaction",
    // @ts-expect-error Wrapped void is not a transaction success value.
    commit: (options) => {
      void options.signal;
      return wrappedVoid;
    },
  });
  transaction({
    id: "invalid.parameterless-wrapped-unknown-transaction",
    // @ts-expect-error Wrapped unknown is not a transaction success value.
    commit: (options) => {
      void options.signal;
      return wrappedUnknown;
    },
  });
  transaction({
    id: "invalid.parameterless-promise-transaction",
    // @ts-expect-error Promise successes are not implicit Operation programs.
    commit: (options) => {
      void options.signal;
      return promiseProgram;
    },
  });
  transaction({
    id: "invalid.parameterless-promise-like-transaction",
    // @ts-expect-error PromiseLike successes are not implicit Operation programs.
    commit: (options) => {
      void options.signal;
      return promiseLikeProgram;
    },
  });
  transaction({
    id: "invalid.parameterless-promise-union-transaction",
    // @ts-expect-error PromiseLike unions remain invalid Operation programs.
    commit: (options) => {
      void options.signal;
      return promiseUnionProgram;
    },
  });
};

void invalidParameterlessTransactionPrograms;

const invalidCanonicalKeys = () => {
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
    // @ts-expect-error Invalid key shape also rejects the fallback overload.
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

  resource({
    id: "invalid.promise-resource",
    key: (params: ProjectInput) => [params.id] as const,
    // @ts-expect-error Promise adapters are not implicit Operation programs.
    lookup: () => Promise.resolve({ id: "project-1" }),
  });

  transaction({
    id: "invalid.undefined-transaction-value",
    // @ts-expect-error The invalid program also makes this keyed fallback inapplicable.
    key: () => ["undefined-value"] as const,
    // @ts-expect-error Undefined is not a transaction success value.
    commit: () => Effect.succeed(undefined),
  });

  transaction({
    id: "invalid.promise-transaction",
    // @ts-expect-error The invalid program also makes this keyed fallback inapplicable.
    key: () => ["promise-value"] as const,
    // @ts-expect-error Promise adapters are not implicit Operation programs.
    commit: () => Promise.resolve({ refreshed: true }),
  });

  // @ts-expect-error Streams have no actor cancellation method.
  updates.cancel(streamKey);

  type ParentInput = { readonly parentId: string };
  const parentInput = { parentId: "parent" } satisfies ParentInput;
  // @ts-expect-error A transaction retains its own parameter shape.
  save.commit(parentInput);
};

void invalidCanonicalKeys;
void updates;
