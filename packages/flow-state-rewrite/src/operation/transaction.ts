import type { Effect } from "effect";

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
  FiniteOutcomes,
  OperationOptions,
  OperationPlan,
  RequirementsCarrier,
} from "./operation.js";
import type { CanonicalKeyInput, OperationKey } from "./key.js";

type Present<Value> = [undefined] extends [Value] ? never : Value;

type ParameterlessTransactionConfig<Id extends string, A, E, R> = Readonly<{
  id: Id;
  key?: never;
  commit: (options: OperationOptions) => Effect.Effect<Present<A>, E, R>;
  persist?: boolean;
  concurrency?: TransactionConcurrency;
}>;

export type TransactionState<A, E, K extends OperationKey> =
  | Readonly<{ status: "idle"; key: K }>
  | Readonly<{ status: "pending"; key: K; generation: number }>
  | Readonly<{ status: "success"; key: K; generation: number; value: A }>
  | Readonly<{ status: "failure"; key: K; generation: number; error: E }>
  | Readonly<{
      status: "defect";
      key: K;
      generation: number;
      defect: unknown;
    }>
  | Readonly<{ status: "interrupted"; key: K; generation: number }>
  | Readonly<{
      status: "unknown";
      key: K;
      generation: number;
      reconcileRequired: true;
    }>;

export type TransactionCommitOptions<P, A, E, O = unknown> = Readonly<{
  outcomes?: FiniteOutcomes<A, E, O>;
  writes?: (
    context: Readonly<{ params: P; value: A }>,
  ) => readonly CacheWritePlan<string, OperationKey, unknown>[];
}>;

export type TransactionCommitPlan<
  Id extends string,
  P,
  K extends OperationKey,
  Options = never,
> = OperationPlan<"transaction-commit", Id, P, K, Options>;

export type TransactionCommitAdapter<P, A, E, R> = [P] extends [undefined]
  ? (options: OperationOptions) => Effect.Effect<Present<A>, E, R>
  : (params: P, options: OperationOptions) => Effect.Effect<Present<A>, E, R>;

export type TransactionAdapter<P, A, E, R> = Readonly<{
  commit: TransactionCommitAdapter<P, A, E, R>;
}>;

type TransactionCommit<Id extends string, P, K extends OperationKey, A, E> = {
  (params: P): TransactionCommitPlan<Id, P, K>;
  <const Options extends TransactionCommitOptions<P, A, E>>(
    params: P,
    options: Options,
  ): TransactionCommitPlan<Id, P, K, Options>;
};

export type Transaction<
  Id extends string = string,
  P = never,
  K extends OperationKey = OperationKey,
  A = never,
  E = never,
  R = never,
> = RequirementsCarrier<R> &
  Readonly<{
    kind: "transaction";
    id: Id;
    key: (params: P) => K;
    getState: (key: K) => TransactionState<A, E, K>;
    commit: TransactionCommit<Id, P, K, A, E>;
    cancel: (key: K) => CancellationPlan<Id, K, "transaction">;
    persist: boolean;
    concurrency: TransactionConcurrency;
    [OperationAdapterTypeId]: TransactionAdapter<P, A, E, R>;
  }>;

export type TransactionConcurrency = "reject" | "cancel" | "allow" | "serialize";

export type TransactionConfig<Id extends string, P, K extends OperationKey, A, E, R> = Readonly<{
  id: Id;
  key: (params: P) => K;
  commit: TransactionCommitAdapter<P, A, E, R>;
  persist?: boolean;
  concurrency?: TransactionConcurrency;
}>;

const createTransaction = <
  Id extends string,
  P,
  K extends OperationKey,
  A,
  E,
  R,
>(config: TransactionConfig<Id, P, K, A, E, R>): Transaction<Id, P, K, A, E, R> => {
  const { id, key: projectKey, commit: commitAdapter, persist, concurrency } = config;
  const key = (params: P): K => canonicalizeKey(projectKey(params));

  function commit(params: P): TransactionCommitPlan<Id, P, K>;
  function commit<const Options extends TransactionCommitOptions<P, A, E>>(
    params: P,
    options: Options,
  ): TransactionCommitPlan<Id, P, K, Options>;
  function commit<const Options extends TransactionCommitOptions<P, A, E>>(
    ...args: [params: P] | [params: P, options: Options]
  ): TransactionCommitPlan<Id, P, K, Options> {
    return operationPlan("transaction-commit", id, projectKey, ...args);
  }

  const transactionValue: Transaction<Id, P, K, A, E, R> = {
    kind: "transaction",
    id,
    key,
    getState: (keyValue) => ({ status: "idle", key: canonicalizeKey(keyValue) }),
    commit,
    cancel: (keyValue) => ({
      kind: "cancel",
      family: "transaction",
      descriptor: id,
      key: canonicalizeKey(keyValue),
    }),
    persist: persist ?? false,
    concurrency: concurrency ?? "cancel",
    [OperationAdapterTypeId]: { commit: commitAdapter },
    [RequirementsTypeId]: requirements<R>,
  };
  return markConstructedOperation(transactionValue);
};

export function transaction<const Id extends string, A, E, R>(
  config: ParameterlessTransactionConfig<Id, A, E, R>,
): Transaction<Id, undefined, readonly [], A, E, R>;

export function transaction<
  const Id extends string,
  const K extends readonly CanonicalKeyInput[],
  A,
  E,
  R,
>(
  config: Readonly<{
    id: Id;
    key: () => K;
    commit: (options: OperationOptions) => Effect.Effect<Present<A>, E, R>;
    persist?: boolean;
    concurrency?: TransactionConcurrency;
  }>,
): Transaction<Id, undefined, K, A, E, R>;

export function transaction<
  const Id extends string,
  const P,
  const K extends readonly CanonicalKeyInput[],
  A,
  E,
  R,
>(config: TransactionConfig<Id, P, K, A, E, R>): Transaction<Id, P, K, A, E, R>;

export function transaction<
  const Id extends string,
  const P,
  const K extends OperationKey,
  A,
  E,
  R,
>(
  config: Readonly<{
    id: Id;
    key?: (params: P) => K;
    commit: TransactionCommitAdapter<P, A, E, R>;
    persist?: boolean;
    concurrency?: TransactionConcurrency;
  }>,
):
  | Transaction<Id, undefined, readonly [], A, E, R>
  | Transaction<Id, P, K, A, E, R> {
  if (config.key === undefined) {
    return createTransaction({
      id: config.id,
      key: (_params: undefined) => [] as const,
      commit: config.commit,
      persist: config.persist,
      concurrency: config.concurrency,
    });
  }

  return createTransaction(config);
}
