import type { Duration, Effect } from "effect";

import { canonicalizeKey } from "./key.js";

import {
  OperationAdapterTypeId,
  RequirementsTypeId,
  markConstructedOperation,
  operationPlan,
  requirements,
} from "./operation.js";
import type {
  CacheWritePlan,
  CancellationPlan,
  DataValue,
  FiniteOutcomes,
  OperationOptions,
  OperationPlan,
  RequirementsCarrier,
} from "./operation.js";
import type { CanonicalKeyInput, OperationKey } from "./key.js";

type Present<Value> = [undefined] extends [Value] ? never : Value;

export type ResourceRetention<A> = Readonly<{ data?: never }> | Readonly<{ data: A }>;

export type ResourceState<A, E, K extends OperationKey> =
  | Readonly<{ status: "missing"; key: K }>
  | Readonly<{ status: "pending"; key: K; generation: number }>
  | Readonly<{ status: "ready"; key: K; generation: number; data: A }>
  | Readonly<{
      status: "refreshing";
      key: K;
      generation: number;
      data: A;
    }>
  | (Readonly<{
      status: "failure";
      key: K;
      generation: number;
      error: E;
    }> &
      ResourceRetention<A>)
  | (Readonly<{
      status: "defect";
      key: K;
      generation: number;
      defect: unknown;
    }> &
      ResourceRetention<A>)
  | (Readonly<{
      status: "interrupted";
      key: K;
      generation: number;
    }> &
      ResourceRetention<A>);

export type ResourceOutcomes<A, E, O = unknown> = Readonly<{
  value?: (value: A) => O;
  failure?: [E] extends [never] ? never : (error: E) => O;
  defect?: (defect: unknown) => O;
  interrupt?: () => O;
}>;

export type FiniteResourceOptions<A, E, O = unknown> = Readonly<{
  outcomes?: FiniteOutcomes<A, E, O>;
}>;

export type ResourceSubscriptionOptions<A, E, O = unknown> = Readonly<{
  outcomes?: ResourceOutcomes<A, E, O>;
}>;

export type ResourceLookupPlan<
  Id extends string,
  P,
  K extends OperationKey,
  Options = never,
> = OperationPlan<"resource-lookup", Id, P, K, Options>;

export type ResourceSubscriptionPlan<
  Id extends string,
  P,
  K extends OperationKey,
  Options = never,
> = OperationPlan<"resource-subscribe", Id, P, K, Options>;

export type ResourceRefetchPlan<
  Id extends string,
  P,
  K extends OperationKey,
  Options = never,
> = OperationPlan<"resource-refetch", Id, P, K, Options>;

export type ResourceLookupAdapter<P, A, E, R> = (
  params: P,
  options: OperationOptions,
) => Effect.Effect<Present<A>, E, R>;

export type ResourceAdapter<P, A, E, R> = Readonly<{
  lookup: ResourceLookupAdapter<P, A, E, R>;
}>;

type ResourceLookup<Id extends string, P, K extends OperationKey, A, E> = {
  (params: P): ResourceLookupPlan<Id, P, K>;
  <const Options extends FiniteResourceOptions<A, E>>(
    params: P,
    options: Options,
  ): ResourceLookupPlan<Id, P, K, Options>;
};

type ResourceSubscribe<Id extends string, P, K extends OperationKey, A, E> = {
  (params: P): ResourceSubscriptionPlan<Id, P, K>;
  <const Options extends ResourceSubscriptionOptions<A, E>>(
    params: P,
    options: Options,
  ): ResourceSubscriptionPlan<Id, P, K, Options>;
};

type ResourceRefetch<Id extends string, P, K extends OperationKey, A, E> = {
  (params: P): ResourceRefetchPlan<Id, P, K>;
  <const Options extends FiniteResourceOptions<A, E>>(
    params: P,
    options: Options,
  ): ResourceRefetchPlan<Id, P, K, Options>;
};

type ResourceWriteValue<A> = DataValue<A> | ((current: DataValue<A>) => DataValue<A>);

export type Resource<
  Id extends string = string,
  P = never,
  K extends OperationKey = OperationKey,
  A = never,
  E = never,
  R = never,
> = RequirementsCarrier<R> &
  Readonly<{
    kind: "resource";
    id: Id;
    key: (params: P) => K;
    getData: (key: K) => DataValue<A>;
    getState: (key: K) => ResourceState<A, E, K>;
    lookup: ResourceLookup<Id, P, K, A, E>;
    subscribe: ResourceSubscribe<Id, P, K, A, E>;
    refetch: ResourceRefetch<Id, P, K, A, E>;
    setData: <Value extends ResourceWriteValue<A>>(
      key: K,
      value: Value,
    ) => CacheWritePlan<Id, K, Value>;
    cancel: (key: K) => CancellationPlan<Id, K, "resource">;
    persist: boolean;
    staleTime?: Duration.Input;
    gcTime?: Duration.Input;
    [OperationAdapterTypeId]: ResourceAdapter<P, A, E, R>;
  }>;

export type ResourceConfig<Id extends string, P, K extends OperationKey, A, E, R> = Readonly<{
  id: Id;
  key: (params: P) => K;
  lookup: ResourceLookupAdapter<P, A, E, R>;
  staleTime?: Duration.Input;
  gcTime?: Duration.Input;
  persist?: boolean;
}>;

export const resource = <
  const Id extends string,
  const P,
  const K extends readonly CanonicalKeyInput[],
  A,
  E,
  R,
>(
  config: ResourceConfig<Id, P, K, A, E, R>,
): Resource<Id, P, K, A, E, R> => {
  const { id, key: projectKey, lookup: lookupAdapter, staleTime, gcTime, persist } = config;
  const keyFor = (params: P): K => canonicalizeKey(projectKey(params));

  const getData = (key: K): DataValue<A> => {
    canonicalizeKey(key);
    return undefined;
  };
  const getState = (key: K): ResourceState<A, E, K> => ({
    status: "missing",
    key: canonicalizeKey(key),
  });

  function lookup(params: P): ResourceLookupPlan<Id, P, K>;
  function lookup<const Options extends FiniteResourceOptions<A, E>>(
    params: P,
    options: Options,
  ): ResourceLookupPlan<Id, P, K, Options>;
  function lookup<const Options extends FiniteResourceOptions<A, E>>(
    ...args: [params: P] | [params: P, options: Options]
  ): ResourceLookupPlan<Id, P, K, Options> {
    return operationPlan("resource-lookup", id, projectKey, ...args);
  }

  function subscribe(params: P): ResourceSubscriptionPlan<Id, P, K>;
  function subscribe<const Options extends ResourceSubscriptionOptions<A, E>>(
    params: P,
    options: Options,
  ): ResourceSubscriptionPlan<Id, P, K, Options>;
  function subscribe<const Options extends ResourceSubscriptionOptions<A, E>>(
    ...args: [params: P] | [params: P, options: Options]
  ): ResourceSubscriptionPlan<Id, P, K, Options> {
    return operationPlan("resource-subscribe", id, projectKey, ...args);
  }

  function refetch(params: P): ResourceRefetchPlan<Id, P, K>;
  function refetch<const Options extends FiniteResourceOptions<A, E>>(
    params: P,
    options: Options,
  ): ResourceRefetchPlan<Id, P, K, Options>;
  function refetch<const Options extends FiniteResourceOptions<A, E>>(
    ...args: [params: P] | [params: P, options: Options]
  ): ResourceRefetchPlan<Id, P, K, Options> {
    return operationPlan("resource-refetch", id, projectKey, ...args);
  }

  const setData = <Value extends ResourceWriteValue<A>>(
    key: K,
    value: Value,
  ): CacheWritePlan<Id, K, Value> => ({
    kind: "cache-write",
    family: "resource",
    descriptor: id,
    key: canonicalizeKey(key),
    value,
  });
  const cancel = (key: K): CancellationPlan<Id, K, "resource"> => ({
    kind: "cancel",
    family: "resource",
    descriptor: id,
    key: canonicalizeKey(key),
  });

  const resourceValue: Omit<Resource<Id, P, K, A, E, R>, "staleTime" | "gcTime"> & {
    staleTime?: Duration.Input;
    gcTime?: Duration.Input;
  } = {
    kind: "resource",
    id,
    getData,
    getState,
    lookup,
    subscribe,
    refetch,
    setData,
    cancel,
    [OperationAdapterTypeId]: { lookup: lookupAdapter },
    [RequirementsTypeId]: requirements<R>,
    persist: persist ?? false,
    key: keyFor,
  };
  if (staleTime !== undefined) resourceValue.staleTime = staleTime;
  if (gcTime !== undefined) resourceValue.gcTime = gcTime;
  return markConstructedOperation(resourceValue);
};
