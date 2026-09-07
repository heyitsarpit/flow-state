import { Result, Schema } from "effect";
import type { Stream } from "effect";

import { canonicalizeKey } from "./key.js";
import { CallableSchema, firstConfigurationField } from "./configuration.js";
import { AuthoredName } from "../internal/authored-name.js";

import {
  RequirementsTypeId,
  operationPlanForDescriptor,
  publishOperation,
  requirements,
} from "./operation.js";
import type {
  OperationDescriptor,
  OperationOptions,
  OperationPlan,
  PlanOptions,
} from "./operation.js";
import type { CanonicalKeyInput, OperationKey, ReadonlyCanonical } from "./key.js";

/*
 * Streams:
 *
 * Public contracts
 *   StreamValue, StreamState, StreamOutcomes, StreamSubscriptionOptions,
 *   StreamSubscriptionPlan, StreamSubscribeAdapter, StreamConfig, FlowStream
 *
 * Shared configuration Schema and error projection
 *   StreamConfigurationSchema, decodeStreamConfiguration, streamConfigurationError
 *
 * Configuration admission
 *   StreamAuthoringConfig, admitStreamConfiguration
 *
 * Bound methods:
 *   key, getState, subscribe
 *
 * Descriptor publication
 *   streamValue, publishOperation
 *
 * Assembly:
 *   stream, constructStream
 */

export type StreamValue<V> =
  | Readonly<{ hasValue: false; latest?: never; emissionCount: 0 }>
  | Readonly<{ hasValue: true; latest: V; emissionCount: number }>;

export type StreamState<V, E, K extends OperationKey> =
  | (Readonly<{ status: "idle"; key: K; generation: null }> & StreamValue<V>)
  | (Readonly<{ status: "running"; key: K; generation: number }> & StreamValue<V>)
  | (Readonly<{ status: "complete"; key: K; generation: number }> & StreamValue<V>)
  | (Readonly<{
      status: "failure";
      key: K;
      generation: number;
      error: E;
    }> &
      StreamValue<V>)
  | (Readonly<{
      status: "defect";
      key: K;
      generation: number;
      defect: unknown;
    }> &
      StreamValue<V>)
  | (Readonly<{
      status: "interrupted";
      key: K;
      generation: number;
    }> &
      StreamValue<V>);

export type StreamOutcomes<V, E, O = unknown> = Readonly<{
  value?: (value: V) => O;
  complete?: () => O;
  failure?: [E] extends [never] ? never : (error: E) => O;
  defect?: (defect: unknown) => O;
  interrupt?: () => O;
}>;

export type StreamSubscriptionOptions<V, E, O = unknown> = Readonly<{
  outcomes?: StreamOutcomes<V, E, O>;
}>;

export type StreamSubscriptionPlan<
  Id extends string,
  P,
  K extends OperationKey,
  Options = never,
> = OperationPlan<"stream-subscribe", Id, P, K, Options>;

export type StreamSubscribeAdapter<P, V, E, R> = (
  params: P,
  options: OperationOptions,
) => Stream.Stream<V, E, R>;

type StreamSubscribe<Id extends string, P, K extends OperationKey, V, E> = <
  const O extends StreamSubscriptionOptions<V, E> | undefined = undefined,
>(
  params: P,
  options?: O,
) => StreamSubscriptionPlan<Id, P, K, PlanOptions<O>>;

export type FlowStream<
  Id extends string = string,
  P = never,
  K extends OperationKey = OperationKey,
  V = never,
  E = never,
  R = never,
> = OperationDescriptor<"stream", Id, P, K, R> &
  Readonly<{
    persist: boolean;
    getState: (key: K) => StreamState<V, E, K>;
    subscribe: StreamSubscribe<Id, P, K, V, E>;
  }>;

export type StreamConfig<Id extends string, P, K extends OperationKey, V, E, R> = Readonly<{
  id: Id;
  key: (params: P) => K;
  subscribe: StreamSubscribeAdapter<P, V, E, R>;
  persist?: boolean;
}>;

type StreamAuthoringConfig<
  Id extends string,
  P,
  K extends readonly CanonicalKeyInput[],
  V,
  E,
  R,
> = Readonly<{
  id: Id;
  key: (params: P) => K;
  subscribe: (params: NoInfer<P>, options: OperationOptions) => Stream.Stream<V, E, R>;
  persist?: boolean;
}>;

const StreamConfigurationSchema = Schema.Struct({
  id: AuthoredName,
  key: CallableSchema,
  subscribe: CallableSchema,
  persist: Schema.optional(Schema.Boolean),
});

const decodeStreamConfiguration = Schema.decodeUnknownResult(StreamConfigurationSchema, {
  onExcessProperty: "error",
});

const streamConfigurationError = (failure: Schema.SchemaError) => {
  const field = firstConfigurationField(failure.issue);
  if (field === "id") return new TypeError("Operation id must be a valid authored name");
  if (field === "key") return new TypeError("Stream key must be callable");
  if (field === "subscribe") return new TypeError("Stream subscribe adapter must be callable");
  return new TypeError("Invalid Stream configuration");
};

function admitStreamConfiguration<
  Id extends string,
  P,
  K extends readonly CanonicalKeyInput[],
  V,
  E,
  R,
>(config: StreamAuthoringConfig<Id, P, K, V, E, R>): StreamAuthoringConfig<Id, P, K, V, E, R>;
function admitStreamConfiguration(input: unknown) {
  return decodeStreamConfiguration(input).pipe(Result.getOrThrowWith(streamConfigurationError));
}

const constructStream = <
  const Id extends string,
  const P,
  const K extends readonly CanonicalKeyInput[],
  V,
  E,
  R,
>(
  admitted: StreamAuthoringConfig<Id, P, K, V, E, R>,
) => {
  type CanonicalK = ReadonlyCanonical<K>;
  const { id, key: projectKey, subscribe: subscribeAdapter, persist } = admitted;

  const key = (params: P) => canonicalizeKey(projectKey(params));

  const getState = (keyValue: CanonicalK) =>
    ({
      status: "idle",
      key: canonicalizeKey<K>(keyValue),
      generation: null,
      hasValue: false,
      emissionCount: 0,
    }) satisfies StreamState<V, E, CanonicalK>;

  const subscribe = <const O extends StreamSubscriptionOptions<V, E> | undefined = undefined>(
    params: P,
    options?: O,
  ) => operationPlanForDescriptor(streamValue, "stream-subscribe", id, projectKey, params, options);

  const streamValue: FlowStream<Id, P, CanonicalK, V, E, R> = {
    kind: "stream",
    id,
    key,
    getState,
    subscribe,
    [RequirementsTypeId]: requirements<R>,
    persist: persist ?? false,
  };
  return publishOperation(streamValue, subscribeAdapter);
};

// RETURN_TYPE: Prevents the public declaration from exposing key.ts's private CanonicalKeyRecord through inferred construction.
export const stream = <
  const Id extends string,
  const P,
  const K extends readonly CanonicalKeyInput[],
  V,
  E,
  R,
>(
  config: StreamAuthoringConfig<Id, P, K, V, E, R>,
): FlowStream<Id, P, ReadonlyCanonical<K>, V, E, R> => {
  const admitted = admitStreamConfiguration<Id, P, K, V, E, R>(config);
  return constructStream<Id, P, K, V, E, R>(admitted);
};
