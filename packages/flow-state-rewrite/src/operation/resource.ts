import { Result, Schema } from "effect";
import type { Duration } from "effect";

import { canonicalizeKey } from "./key.js";
import { CallableSchema, firstConfigurationField } from "./configuration.js";
import { AuthoredName } from "../internal/authored-name.js";

import {
  RequirementsTypeId,
  operationPlan,
  operationPlanForDescriptor,
  publishOperation,
  requirements,
} from "./operation.js";
import type {
  CacheWritePlan,
  CancellationPlan,
  DataValue,
  FiniteOutcomes,
  OperationDescriptor,
  OperationOptions,
  OperationPlan,
  OperationErrorOf,
  OperationProgram,
  OperationRequirementsOf,
  OperationValueOf,
  ValidOperationProgram,
} from "./operation.js";
import type { CanonicalKeyInput, OperationKey, ReadonlyCanonical } from "./key.js";

/*
 * Resources:
 *
 * Public contracts
 * Configuration admission:
 *   admitResourceConfiguration
 * Admitted construction:
 *   constructResource
 * Bound methods:
 *   keyFor, getData, getState, lookup, subscribe, refetch, setData, cancel
 * Descriptor publication
 * Assembly:
 *   resource
 */

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
) => OperationProgram<A, E, R>;

type ResourceLookup<Id extends string, P, K extends OperationKey, A, E> = <
  const O extends FiniteResourceOptions<A, E> | undefined = undefined,
>(
  params: P,
  options?: O,
) => ResourceLookupPlan<Id, P, K, Exclude<O, undefined>>;

type ResourceSubscribe<Id extends string, P, K extends OperationKey, A, E> = <
  const O extends ResourceSubscriptionOptions<A, E> | undefined = undefined,
>(
  params: P,
  options?: O,
) => ResourceSubscriptionPlan<Id, P, K, Exclude<O, undefined>>;

type ResourceRefetch<Id extends string, P, K extends OperationKey, A, E> = <
  const O extends FiniteResourceOptions<A, E> | undefined = undefined,
>(
  params: P,
  options?: O,
) => ResourceRefetchPlan<Id, P, K, Exclude<O, undefined>>;

type ResourceWriteValue<A> = DataValue<A> | ((current: DataValue<A>) => DataValue<A>);

export type Resource<
  Id extends string = string,
  P = never,
  K extends OperationKey = OperationKey,
  A = never,
  E = never,
  R = never,
> = OperationDescriptor<"resource", Id, P, K, R> &
  Readonly<{
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
  }>;

type ResourceFields<Id extends string, P, K extends OperationKey, Adapter> = Readonly<{
  id: Id;
  key: (params: P) => K;
  lookup: Adapter;
  staleTime?: Duration.Input;
  gcTime?: Duration.Input;
  persist?: boolean;
}>;

export type ResourceConfig<Id extends string, P, K extends OperationKey, A, E, R> = ResourceFields<
  Id,
  P,
  K,
  ResourceLookupAdapter<P, A, E, R>
>;

const ResourceConfigurationSchema = Schema.Struct({
  id: AuthoredName,
  key: CallableSchema,
  lookup: CallableSchema,
  staleTime: Schema.optional(Schema.Unknown),
  gcTime: Schema.optional(Schema.Unknown),
  persist: Schema.optional(Schema.Boolean),
});

const decodeResourceConfiguration = Schema.decodeUnknownResult(ResourceConfigurationSchema, {
  onExcessProperty: "error",
});

const resourceConfigurationError = (failure: Schema.SchemaError) => {
  const field = firstConfigurationField(failure.issue);
  if (field === "id") return new TypeError("Operation id must be a valid authored name");
  if (field === "key") return new TypeError("Resource key must be callable");
  if (field === "lookup") return new TypeError("Resource lookup adapter must be callable");
  return new TypeError("Invalid Resource configuration");
};

type ResourceAuthoringConfig<
  Id extends string,
  P,
  K extends readonly CanonicalKeyInput[],
  Program,
> = ResourceFields<
  Id,
  P,
  K,
  (params: NoInfer<P>, options: OperationOptions) => Program & ValidOperationProgram<Program>
>;

type ResourceConstructionConfig<Id extends string, P, K extends OperationKey> = ResourceFields<
  Id,
  P,
  K,
  (params: P, options: OperationOptions) => void
>;

function admitResourceConfiguration<
  const Id extends string,
  P,
  const K extends OperationKey,
  Program,
>(config: ResourceAuthoringConfig<Id, P, K, Program>): ResourceAuthoringConfig<Id, P, K, Program>;
function admitResourceConfiguration(input: unknown) {
  return decodeResourceConfiguration(input).pipe(Result.getOrThrowWith(resourceConfigurationError));
}

const constructResource = <
  const Id extends string,
  P,
  const K extends readonly CanonicalKeyInput[],
  A,
  E,
  R,
>(
  admitted: ResourceConstructionConfig<Id, P, K>,
) => {
  type CanonicalK = ReadonlyCanonical<K>;
  const { id, key: projectKey, lookup: lookupAdapter, staleTime, gcTime, persist } = admitted;
  const keyFor = (params: P) => canonicalizeKey(projectKey(params));

  // RETURN_TYPE: Preserves the public DataValue<A> result so the generic data channel is not collapsed to inferred undefined.
  const getData = (key: CanonicalK): DataValue<A> => {
    canonicalizeKey<K>(key);
    return undefined;
  };

  // RETURN_TYPE: Preserves the readonly ResourceState<A, E, CanonicalK> discriminant union; inferring this object caused TS2322.
  const getState = (key: CanonicalK): ResourceState<A, E, CanonicalK> => ({
    status: "missing",
    key: canonicalizeKey<K>(key),
  });

  function lookup<const O extends FiniteResourceOptions<A, E> | undefined = undefined>(
    params: P,
    options?: O,
  ) {
    return operationPlan("resource-lookup", id, projectKey, params, options);
  }

  const subscribe = <const O extends ResourceSubscriptionOptions<A, E> | undefined = undefined>(
    params: P,
    options?: O,
  ) =>
    operationPlanForDescriptor(
      resourceValue,
      "resource-subscribe",
      id,
      projectKey,
      params,
      options,
    );

  const refetch = <const O extends FiniteResourceOptions<A, E> | undefined = undefined>(
    params: P,
    options?: O,
  ) => operationPlan("resource-refetch", id, projectKey, params, options);

  // RETURN_TYPE: Preserves the readonly CacheWritePlan<Id, CanonicalK, Value> publication and its generic value; inferring this object caused TS2322.
  const setData = <Value extends ResourceWriteValue<A>>(
    key: CanonicalK,
    value: Value,
  ): CacheWritePlan<Id, CanonicalK, Value> => {
    return {
      kind: "cache-write",
      family: "resource",
      descriptor: id,
      key: canonicalizeKey<K>(key),
      value,
    };
  };

  // RETURN_TYPE: Preserves the readonly CancellationPlan<Id, CanonicalK, "resource"> family discriminant; inferring this object caused TS2322.
  const cancel = (key: CanonicalK): CancellationPlan<Id, CanonicalK, "resource"> => {
    return {
      kind: "cancel",
      family: "resource",
      descriptor: id,
      key: canonicalizeKey<K>(key),
    };
  };

  const resourceValue: Resource<Id, P, CanonicalK, A, E, R> = {
    kind: "resource",
    id,
    getData,
    getState,
    lookup,
    subscribe,
    refetch,
    setData,
    cancel,
    [RequirementsTypeId]: requirements<R>,
    persist: persist ?? false,
    key: keyFor,
    // oxlint-disable-next-line anti-slop/no-conditional-empty-object-spread -- The exact conditional spread omits an absent optional field while preserving configured values.
    ...(staleTime === undefined ? {} : { staleTime }),
    // oxlint-disable-next-line anti-slop/no-conditional-empty-object-spread -- The exact conditional spread omits an absent optional field while preserving configured values.
    ...(gcTime === undefined ? {} : { gcTime }),
  };
  return publishOperation(resourceValue, lookupAdapter);
};

export function resource<
  const Id extends string,
  P,
  const K extends readonly CanonicalKeyInput[],
  Program,
>(
  config: ResourceAuthoringConfig<Id, P, K, Program>,
): Resource<
  Id,
  P,
  ReadonlyCanonical<K>,
  OperationValueOf<Program>,
  OperationErrorOf<Program>,
  OperationRequirementsOf<Program>
>;

export function resource<
  const Id extends string,
  P,
  const K extends readonly CanonicalKeyInput[],
  Program,
>(config: ResourceAuthoringConfig<Id, P, K, Program>) {
  const admitted = admitResourceConfiguration<Id, P, K, Program>(config);
  type A = OperationValueOf<Program>;
  type E = OperationErrorOf<Program>;
  type R = OperationRequirementsOf<Program>;
  return constructResource<Id, P, K, A, E, R>(admitted);
}
