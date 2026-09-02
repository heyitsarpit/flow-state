import type { Stream } from "effect";

import { canonicalizeKey } from "./key.js";

import {
  OperationAdapterTypeId,
  RequirementsTypeId,
  markConstructedOperation,
  operationPlan,
  requirements,
} from "./operation.js";
import type { OperationOptions, OperationPlan, RequirementsCarrier } from "./operation.js";
import type { CanonicalKeyInput, OperationKey } from "./key.js";

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

export type StreamAdapter<P, V, E, R> = Readonly<{
  subscribe: StreamSubscribeAdapter<P, V, E, R>;
}>;

type StreamSubscribe<Id extends string, P, K extends OperationKey, V, E> = {
  (params: P): StreamSubscriptionPlan<Id, P, K>;
  <const Options extends StreamSubscriptionOptions<V, E>>(
    params: P,
    options: Options,
  ): StreamSubscriptionPlan<Id, P, K, Options>;
};

export type FlowStream<
  Id extends string = string,
  P = never,
  K extends OperationKey = OperationKey,
  V = never,
  E = never,
  R = never,
> = RequirementsCarrier<R> &
  Readonly<{
    kind: "stream";
    id: Id;
    key: (params: P) => K;
    persist: boolean;
    getState: (key: K) => StreamState<V, E, K>;
    subscribe: StreamSubscribe<Id, P, K, V, E>;
    [OperationAdapterTypeId]: StreamAdapter<P, V, E, R>;
  }>;

export type StreamConfig<Id extends string, P, K extends OperationKey, V, E, R> = Readonly<{
  id: Id;
  key: (params: P) => K;
  subscribe: StreamSubscribeAdapter<P, V, E, R>;
  persist?: boolean;
}>;

export const stream = <
  const Id extends string,
  const P,
  const K extends readonly CanonicalKeyInput[],
  V,
  E,
  R,
>(
  config: StreamConfig<Id, P, K, V, E, R>,
): FlowStream<Id, P, K, V, E, R> => {
  const { id, key: projectKey, subscribe: subscribeAdapter, persist } = config;
  const key = (params: P): K => canonicalizeKey(projectKey(params));

  function subscribe(params: P): StreamSubscriptionPlan<Id, P, K>;
  function subscribe<const Options extends StreamSubscriptionOptions<V, E>>(
    params: P,
    options: Options,
  ): StreamSubscriptionPlan<Id, P, K, Options>;
  function subscribe<const Options extends StreamSubscriptionOptions<V, E>>(
    ...args: [params: P] | [params: P, options: Options]
  ): StreamSubscriptionPlan<Id, P, K, Options> {
    return operationPlan("stream-subscribe", id, projectKey, ...args);
  }

  const streamValue: FlowStream<Id, P, K, V, E, R> = {
    kind: "stream",
    id,
    key,
    getState: (keyValue) => ({
      status: "idle",
      key: canonicalizeKey(keyValue),
      generation: null,
      hasValue: false,
      emissionCount: 0,
    }),
    subscribe,
    [OperationAdapterTypeId]: { subscribe: subscribeAdapter },
    [RequirementsTypeId]: requirements<R>,
    persist: persist ?? false,
  };
  return markConstructedOperation(streamValue);
};
