import { Result, Schema } from "effect";

import { canonicalizeKey } from "./key.js";
import { CallableSchema, firstConfigurationField } from "./configuration.js";
import { AuthoredName } from "../internal/authored-name.js";

import { RequirementsTypeId, operationPlan, publishOperation, requirements } from "./operation.js";
import type {
  CacheWritePlan,
  CancellationPlan,
  FiniteOutcomes,
  OperationDescriptor,
  OperationErrorOf,
  OperationOptions,
  OperationPlan,
  OperationProgram,
  OperationRequirementsOf,
  OperationValueOf,
  PlanOptions,
  ValidOperationProgram,
} from "./operation.js";
import type { CanonicalKeyInput, OperationKey, ReadonlyCanonical } from "./key.js";

/*
 * Transactions:
 *
 * Public contracts and overload constraints
 *   ParameterlessTransactionConfig, TransactionImplementationConfig,
 *   TransactionKeyedAuthoringConfig, TransactionParameterlessAuthoringConfig,
 *   transaction overloads and implementation constraints
 *
 * Configuration capture and Schema admission
 *   TransactionConfigurationSchema, decodeTransactionConfiguration,
 *   transactionConfigurationError, admitTransactionConfiguration
 *
 * Normalized construction
 *   TransactionConstructionConfig, createTransaction
 *
 * Bound methods
 *   key, commit, getState, cancel
 *
 * Descriptor publication
 *   transactionValue, publishOperation
 *
 * Assembly
 *   transaction overloads and implementation
 */

type ParameterlessTransactionConfig<Id extends string, Program> = Readonly<{
  id: Id;
  key?: never;
  commit: (options: OperationOptions) => Program & ValidOperationProgram<Program>;
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
  ? (options: OperationOptions) => OperationProgram<A, E, R>
  : (params: P, options: OperationOptions) => OperationProgram<A, E, R>;

type TransactionCommit<Id extends string, P, K extends OperationKey, A, E> = <
  const O extends TransactionCommitOptions<P, A, E> | undefined = undefined,
>(
  params: P,
  options?: O,
) => TransactionCommitPlan<Id, P, K, PlanOptions<O>>;

export type Transaction<
  Id extends string = string,
  P = never,
  K extends OperationKey = OperationKey,
  A = never,
  E = never,
  R = never,
> = OperationDescriptor<"transaction", Id, P, K, R> &
  Readonly<{
    getState: (key: K) => TransactionState<A, E, K>;
    commit: TransactionCommit<Id, P, K, A, E>;
    cancel: (key: K) => CancellationPlan<Id, K, "transaction">;
    persist: boolean;
    concurrency: TransactionConcurrency;
  }>;

export type TransactionConcurrency = "reject" | "cancel" | "allow" | "serialize";

export type TransactionConfig<Id extends string, P, K extends OperationKey, A, E, R> = Readonly<{
  id: Id;
  key: (params: P) => K;
  commit: TransactionCommitAdapter<P, A, E, R>;
  persist?: boolean;
  concurrency?: TransactionConcurrency;
}>;

type TransactionImplementationConfig =
  | Readonly<{
      id: string;
      commit: (options: OperationOptions) => TransactionImplementationProgram;
      persist?: boolean;
      concurrency?: TransactionConcurrency;
    }>
  | Readonly<{
      id: string;
      key: (params: never) => OperationKey;
      commit: (params: never, options: OperationOptions) => TransactionImplementationProgram;
      persist?: boolean;
      concurrency?: TransactionConcurrency;
    }>;

type TransactionImplementationProgram =
  | Record<never, never>
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null;

type TransactionImplementationResult = Readonly<{
  kind: "transaction";
  id: string;
}>;

type TransactionKeyedAuthoringConfig<
  Id extends string,
  P,
  K extends readonly CanonicalKeyInput[],
  Program,
> = Readonly<{
  id: Id;
  key: (params: P) => K;
  commit: (...args: readonly never[]) => Program;
  persist?: boolean | undefined;
  concurrency?: TransactionConcurrency | undefined;
}>;

type TransactionParameterlessAuthoringConfig<Id extends string, Program> = Readonly<{
  id: Id;
  commit: (...args: readonly never[]) => Program;
  persist?: boolean | undefined;
  concurrency?: TransactionConcurrency | undefined;
}>;

const TransactionConfigurationSchema = Schema.Struct({
  id: AuthoredName,
  key: Schema.optionalKey(CallableSchema),
  commit: CallableSchema,
  persist: Schema.optional(Schema.Boolean),
  concurrency: Schema.optional(Schema.Literals(["reject", "cancel", "allow", "serialize"])),
});

type TransactionConfiguration = typeof TransactionConfigurationSchema.Type;

const decodeTransactionConfiguration = Schema.decodeUnknownResult(TransactionConfigurationSchema, {
  onExcessProperty: "error",
});

const transactionConfigurationError = (failure: Schema.SchemaError) => {
  const field = firstConfigurationField(failure.issue);
  if (field === "id") return new TypeError("Operation id must be a valid authored name");
  if (field === "key") return new TypeError("Transaction key must be callable");
  if (field === "commit") return new TypeError("Transaction commit adapter must be callable");
  return new TypeError("Invalid Transaction configuration");
};

function admitTransactionConfiguration<
  const Id extends string,
  P,
  const K extends readonly CanonicalKeyInput[],
  Program,
>(
  config: TransactionKeyedAuthoringConfig<Id, P, K, Program>,
): TransactionKeyedAuthoringConfig<Id, P, K, Program>;
function admitTransactionConfiguration<const Id extends string, Program>(
  config: TransactionParameterlessAuthoringConfig<Id, Program>,
): TransactionParameterlessAuthoringConfig<Id, Program>;
function admitTransactionConfiguration(input: unknown): TransactionConfiguration;
function admitTransactionConfiguration(input: unknown) {
  return decodeTransactionConfiguration(input).pipe(
    Result.getOrThrowWith(transactionConfigurationError),
  );
}

type TransactionConstructionConfig<
  Id extends string,
  P,
  K extends OperationKey,
  Program,
> = Readonly<{
  id: Id;
  key: (params: P) => K;
  commit: (...args: readonly never[]) => Program;
  persist?: boolean | undefined;
  concurrency?: TransactionConcurrency | undefined;
}>;

const createTransaction = <Id extends string, P, K extends OperationKey, Program>(
  config: TransactionConstructionConfig<Id, P, K, Program>,
) => {
  // Normalized construction
  type A = OperationValueOf<Program>;
  type E = OperationErrorOf<Program>;
  type R = OperationRequirementsOf<Program>;
  type CanonicalK = ReadonlyCanonical<K>;
  const { id, key: projectKey, commit: commitAdapter, persist, concurrency } = config;

  // Bound methods
  const key = (params: P) => {
    return canonicalizeKey(projectKey(params));
  };

  const commit = <const O extends TransactionCommitOptions<P, A, E> | undefined = undefined>(
    params: P,
    options?: O,
  ) => operationPlan("transaction-commit", id, projectKey, params, options);

  const getState = (keyValue: ReadonlyCanonical<K>) => ({
    status: "idle" as const,
    key: canonicalizeKey<K>(keyValue),
  });

  const cancel = (keyValue: ReadonlyCanonical<K>) => ({
    kind: "cancel" as const,
    family: "transaction" as const,
    descriptor: id,
    key: canonicalizeKey<K>(keyValue),
  });

  // Descriptor publication
  const transactionValue: Transaction<Id, P, CanonicalK, A, E, R> = {
    kind: "transaction",
    id,
    key,
    getState,
    commit,
    cancel,
    persist: persist ?? false,
    concurrency: concurrency ?? "cancel",
    [RequirementsTypeId]: requirements<R>,
  };
  return publishOperation(transactionValue, commitAdapter);
};

export function transaction<
  const Id extends string,
  const K extends readonly CanonicalKeyInput[],
  const Key extends (params: never) => OperationKey,
  Program,
>(
  config: Readonly<{
    id: Id;
    key: Key & ((params: Parameters<Key>[0]) => K);
    commit: Parameters<Key> extends []
      ? never
      : (
          params: NoInfer<Parameters<Key>[0]>,
          options: OperationOptions,
        ) => Program & ValidOperationProgram<Program>;
    persist?: boolean;
    concurrency?: TransactionConcurrency;
  }>,
): Transaction<
  Id,
  Parameters<Key>[0],
  ReadonlyCanonical<K>,
  OperationValueOf<Program>,
  OperationErrorOf<Program>,
  OperationRequirementsOf<Program>
>;

export function transaction<
  const Id extends string,
  const K extends readonly CanonicalKeyInput[],
  Program,
>(
  config: Readonly<{
    id: Id;
    key: () => K;
    commit: (options: OperationOptions) => Program & ValidOperationProgram<Program>;
    persist?: boolean;
    concurrency?: TransactionConcurrency;
  }>,
): Transaction<
  Id,
  undefined,
  ReadonlyCanonical<K>,
  OperationValueOf<Program>,
  OperationErrorOf<Program>,
  OperationRequirementsOf<Program>
>;

export function transaction<const Id extends string, Program>(
  config: ParameterlessTransactionConfig<Id, Program>,
): Transaction<
  Id,
  undefined,
  readonly [],
  OperationValueOf<Program>,
  OperationErrorOf<Program>,
  OperationRequirementsOf<Program>
>;

// RETURN_TYPE: Preserves overload compatibility between keyed and parameterless transaction constructors; removal produced TS2394.
export function transaction(
  config: TransactionImplementationConfig,
): TransactionImplementationResult {
  if ("key" in config) {
    const captured = {
      id: config.id,
      key: config.key,
      commit: config.commit,
      persist: config.persist,
      concurrency: config.concurrency,
    };
    if (
      Reflect.ownKeys(config).some(
        (property) =>
          property !== "id" &&
          property !== "key" &&
          property !== "commit" &&
          property !== "persist" &&
          property !== "concurrency",
      )
    )
      Object.defineProperty(captured, "extra", { enumerable: true, value: true });

    const admitted = admitTransactionConfiguration(captured);
    const { id, key, commit, persist, concurrency } = admitted;
    const normalizedConfig = { id, key, commit, persist, concurrency };
    return createTransaction(normalizedConfig);
  }

  const captured = {
    id: config.id,
    commit: config.commit,
    persist: config.persist,
    concurrency: config.concurrency,
  };
  if (
    Reflect.ownKeys(config).some(
      (property) =>
        property !== "id" &&
        property !== "key" &&
        property !== "commit" &&
        property !== "persist" &&
        property !== "concurrency",
    )
  )
    Object.defineProperty(captured, "extra", { enumerable: true, value: true });

  const admitted = admitTransactionConfiguration(captured);
  const { id, commit, persist, concurrency } = admitted;
  const key = () => [] as const;
  const normalizedConfig = { id, key, commit, persist, concurrency };
  return createTransaction(normalizedConfig);
}
