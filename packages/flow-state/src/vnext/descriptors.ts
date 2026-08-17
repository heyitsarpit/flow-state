import { Duration } from "effect";
import type { Effect, Stream } from "effect";

import {
  copyCanonical,
  encodeCanonical,
  type CanonicalKeyInput,
  validateAuthoredId,
} from "./canonical.js";
import {
  DescriptorTypeId,
  freezeArray,
  InputTypeId,
  RefTypeId,
  RequirementsTypeId,
  TypeId,
} from "./internal.js";
import { usageError } from "./usage-error.js";

const typeBrand = (_: never): never => {
  throw new Error("Flow type brands are not executable");
};

const validateConfigKeys = (
  config: object,
  allowed: ReadonlySet<string>,
  operation: string,
  id: string,
): void => {
  for (const key of Object.keys(config))
    if (!allowed.has(key)) usageError("InvalidDefinition", operation, { id, key });
};

const validateDuration = (
  value: Duration.Input | undefined,
  fallback: Duration.Input,
  operation: string,
  allowInfinity: boolean,
): number => {
  const selected = value ?? fallback;
  if (allowInfinity && selected === Infinity) return Infinity;
  let milliseconds: number;
  try {
    milliseconds = Duration.toMillis(selected);
  } catch (cause) {
    return usageError("InvalidDefinition", operation, { reason: "duration" }, cause);
  }
  if (
    !Number.isSafeInteger(milliseconds) ||
    milliseconds < 0 ||
    (!allowInfinity && !Number.isFinite(milliseconds))
  )
    return usageError("InvalidDefinition", operation, { reason: "duration" });
  return milliseconds;
};

export interface Tag<Id extends string = string> {
  readonly kind: "tag";
  readonly id: Id;
  readonly [TypeId]: "Tag";
}

export const tag = <const Id extends string>(idValue: Id): Tag<Id> =>
  Object.freeze({
    kind: "tag" as const,
    id: validateAuthoredId(idValue, "tag") as Id,
    [TypeId]: "Tag" as const,
  });

export interface ResourceRef<
  Id extends string = string,
  Params extends readonly CanonicalKeyInput[] = readonly CanonicalKeyInput[],
  A = unknown,
  E = unknown,
  R = unknown,
> {
  readonly kind: "resource-ref";
  readonly descriptorId: Id;
  readonly args: Params;
  readonly identity: string;
  readonly descriptor: Readonly<{
    kind: "resource";
    id: Id;
    readonly [TypeId]: "Resource";
    readonly [RequirementsTypeId]: (_: never) => R;
    readonly [DescriptorTypeId]: (_: never) => Resource<Id, Params, A, E, R>;
  }>;
  readonly [RefTypeId]: (_: never) => readonly [A, E, R];
  readonly [TypeId]: "ResourceRef";
}

export interface Resource<
  Id extends string = string,
  Params extends readonly CanonicalKeyInput[] = readonly CanonicalKeyInput[],
  A = unknown,
  E = unknown,
  R = unknown,
> {
  readonly kind: "resource";
  readonly id: Id;
  readonly lookup: (...params: Params) => Effect.Effect<A, E, R>;
  readonly tags: ((...params: Params) => readonly Tag[]) | undefined;
  readonly placeholder: ((...params: Params) => A) | undefined;
  readonly staleTime: number;
  readonly gcTime: number;
  readonly ref: (...params: Params) => ResourceRef<Id, Params, A, E, R>;
  readonly [TypeId]: "Resource";
  readonly [RequirementsTypeId]: (_: never) => R;
  readonly [DescriptorTypeId]: (_: never) => Resource<Id, Params, A, E, R>;
}

export type ResourceConfig<
  Id extends string,
  Params extends readonly CanonicalKeyInput[],
  A,
  E,
  R,
> = Readonly<{
  id: Id;
  lookup: (...params: Params) => Effect.Effect<A, E, R>;
  tags?: (...params: Params) => readonly Tag[];
  placeholder?: (...params: Params) => A;
  staleTime?: Duration.Input;
  gcTime?: Duration.Input | typeof Infinity;
}>;

export const resource = <
  const Id extends string,
  const Params extends readonly CanonicalKeyInput[],
  A,
  E,
  R,
>(
  config: ResourceConfig<Id, Params, A, E, R>,
): Resource<Id, Params, A, E, R> => {
  const id = validateAuthoredId(config.id, "resource") as Id;
  validateConfigKeys(
    config,
    new Set(["id", "lookup", "tags", "placeholder", "staleTime", "gcTime"]),
    "resource",
    id,
  );
  const descriptorBase = {
    kind: "resource" as const,
    id,
    lookup: config.lookup,
    tags: config.tags,
    placeholder: config.placeholder,
    staleTime: validateDuration(config.staleTime, 0, "resource.staleTime", false),
    gcTime: validateDuration(config.gcTime, "5 minutes", "resource.gcTime", true),
    [TypeId]: "Resource" as const,
    [RequirementsTypeId]: typeBrand,
    [DescriptorTypeId]: typeBrand,
  };
  let descriptor: Resource<Id, Params, A, E, R>;
  const ref = (...params: Params): ResourceRef<Id, Params, A, E, R> => {
    const copiedArgs = copyCanonical(params) as Params;
    return Object.freeze({
      kind: "resource-ref" as const,
      descriptorId: id,
      args: copiedArgs,
      identity: encodeCanonical([id, copiedArgs]),
      descriptor,
      [RefTypeId]: typeBrand,
      [TypeId]: "ResourceRef" as const,
    });
  };
  descriptor = Object.freeze({ ...descriptorBase, ref });
  return descriptor;
};

export interface TransactionRef<
  Id extends string = string,
  Key = CanonicalKeyInput,
  A = unknown,
  E = unknown,
> {
  readonly kind: "transaction-ref";
  readonly descriptorId: Id;
  readonly key: Key;
  readonly identity: string;
  readonly descriptor: Readonly<{ kind: "transaction"; id: Id }>;
  readonly [RefTypeId]: (_: never) => readonly [A, E];
  readonly [TypeId]: "TransactionRef";
}

export type InvalidationTarget = ResourceRef | Tag;

export type PreviewEntry<Ref extends ResourceRef = ResourceRef> = Readonly<{
  ref: Ref;
  replace: Ref extends ResourceRef<string, readonly CanonicalKeyInput[], infer A, unknown, unknown>
    ? A
    : never;
}>;

type ExactPreviewEntries<Entries extends readonly PreviewEntry[]> = Readonly<{
  [Index in keyof Entries]: Entries[Index] extends PreviewEntry
    ? PreviewEntry<Entries[Index]["ref"]>
    : never;
}>;

type TransactionCommon<
  Id extends string,
  Params,
  A,
  E,
  R,
  PreviewEntries extends readonly PreviewEntry[] = readonly PreviewEntry[],
> = Readonly<{
  id: Id;
  preview?: Readonly<{
    apply: (options: {
      readonly params: Params;
    }) => PreviewEntries & ExactPreviewEntries<PreviewEntries>;
  }>;
  invalidates?:
    | readonly InvalidationTarget[]
    | ((options: { readonly params: Params }) => readonly InvalidationTarget[]);
  concurrency?: "reject" | "cancel" | "allow" | "serialize";
  commit: Params extends void
    ? () => Effect.Effect<A, E, R>
    : (params: Params) => Effect.Effect<A, E, R>;
}>;

export interface Transaction<
  Id extends string = string,
  Params = unknown,
  Key = CanonicalKeyInput,
  A = unknown,
  E = unknown,
  R = unknown,
  Singleton extends boolean = boolean,
> {
  readonly kind: "transaction";
  readonly id: Id;
  readonly commit: Params extends void
    ? () => Effect.Effect<A, E, R>
    : (params: Params) => Effect.Effect<A, E, R>;
  readonly key: ((params: Params) => Key) | undefined;
  readonly preview: TransactionCommon<Id, Params, A, E, R>["preview"];
  readonly invalidates: TransactionCommon<Id, Params, A, E, R>["invalidates"];
  readonly concurrency: "reject" | "cancel" | "allow" | "serialize";
  readonly ref: Singleton extends true
    ? () => TransactionRef<Id, readonly [], A, E>
    : (key: Key) => TransactionRef<Id, Key, A, E>;
  readonly [TypeId]: "Transaction";
  readonly [RequirementsTypeId]: (_: never) => R;
  readonly [DescriptorTypeId]: (_: never) => Transaction<Id, Params, Key, A, E, R, Singleton>;
}

type CommitEffect = (...args: never[]) => Effect.Effect<unknown, unknown, unknown>;
type CommitParams<Commit extends CommitEffect> =
  Parameters<Commit> extends readonly [] ? void : Parameters<Commit>[0];
type CommitSuccess<Commit extends CommitEffect> =
  ReturnType<Commit> extends Effect.Effect<infer A, unknown, unknown> ? A : never;
type CommitError<Commit extends CommitEffect> =
  ReturnType<Commit> extends Effect.Effect<unknown, infer E, unknown> ? E : never;
type CommitRequirements<Commit extends CommitEffect> =
  ReturnType<Commit> extends Effect.Effect<unknown, unknown, infer R> ? R : never;

export const transaction = <
  const Id extends string,
  const Commit extends CommitEffect,
  const Key extends CanonicalKeyInput = readonly [],
  const PreviewEntries extends readonly PreviewEntry[] = readonly [],
>(
  config: TransactionCommon<
    Id,
    CommitParams<Commit>,
    CommitSuccess<Commit>,
    CommitError<Commit>,
    CommitRequirements<Commit>,
    PreviewEntries
  > &
    (CommitParams<Commit> extends void
      ? { readonly commit: Commit; readonly key?: never }
      : { readonly commit: Commit; readonly key: (params: CommitParams<Commit>) => Key }) &
    (number extends Parameters<Commit>["length"]
      ? never
      : Parameters<Commit>["length"] extends 0 | 1
        ? unknown
        : never),
): Transaction<
  Id,
  CommitParams<Commit>,
  CommitParams<Commit> extends void ? readonly [] : Key,
  CommitSuccess<Commit>,
  CommitError<Commit>,
  CommitRequirements<Commit>,
  CommitParams<Commit> extends void ? true : false
> => {
  const id = validateAuthoredId(config.id, "transaction") as Id;
  validateConfigKeys(
    config,
    new Set(["id", "key", "preview", "commit", "invalidates", "concurrency"]),
    "transaction",
    id,
  );
  type Result = Transaction<
    Id,
    CommitParams<Commit>,
    CommitParams<Commit> extends void ? readonly [] : Key,
    CommitSuccess<Commit>,
    CommitError<Commit>,
    CommitRequirements<Commit>,
    CommitParams<Commit> extends void ? true : false
  >;
  let descriptor: Result;
  const refImplementation = (...args: readonly unknown[]): TransactionRef => {
    if (config.key === undefined && args.length !== 0)
      return usageError("InvalidCanonicalValue", "transaction.ref", {
        id,
        reason: "singleton-arity",
      });
    if (config.key !== undefined && args.length !== 1)
      return usageError("InvalidCanonicalValue", "transaction.ref", { id, reason: "key-arity" });
    const copiedKey = copyCanonical(config.key === undefined ? [] : args[0]);
    return Object.freeze({
      kind: "transaction-ref" as const,
      descriptorId: id,
      key: copiedKey,
      identity: encodeCanonical([id, copiedKey]),
      descriptor,
      [RefTypeId]: typeBrand,
      [TypeId]: "TransactionRef" as const,
    });
  };
  const ref = refImplementation as Result["ref"];
  descriptor = Object.freeze({
    kind: "transaction" as const,
    id,
    commit: config.commit,
    key: config.key,
    preview:
      config.preview === undefined ? undefined : Object.freeze({ apply: config.preview.apply }),
    invalidates: Array.isArray(config.invalidates)
      ? freezeArray(config.invalidates)
      : config.invalidates,
    concurrency: config.concurrency ?? "cancel",
    ref,
    [TypeId]: "Transaction" as const,
    [RequirementsTypeId]: typeBrand,
    [DescriptorTypeId]: typeBrand,
  }) as Result;
  return descriptor;
};

export interface FlowStream<
  Id extends string = string,
  Params extends readonly unknown[] = readonly unknown[],
  A = unknown,
  E = unknown,
  R = unknown,
> {
  readonly kind: "stream";
  readonly id: Id;
  readonly subscribe: (...params: Params) => Stream.Stream<A, E, R>;
  readonly [TypeId]: "Stream";
  readonly [RequirementsTypeId]: (_: never) => R;
  readonly [DescriptorTypeId]: (_: never) => FlowStream<Id, Params, A, E, R>;
}

export const stream = <const Id extends string, const Params extends readonly unknown[], A, E, R>(
  config: Readonly<{ id: Id; subscribe: (...params: Params) => Stream.Stream<A, E, R> }>,
): FlowStream<Id, Params, A, E, R> => {
  const id = validateAuthoredId(config.id, "stream") as Id;
  validateConfigKeys(config, new Set(["id", "subscribe"]), "stream", id);
  return Object.freeze({
    kind: "stream" as const,
    id,
    subscribe: config.subscribe,
    [TypeId]: "Stream" as const,
    [RequirementsTypeId]: typeBrand,
    [DescriptorTypeId]: typeBrand,
  });
};

export interface MachineLike<Input = unknown, R = unknown> {
  readonly id: string;
  readonly [InputTypeId]: (_: never) => Input;
  readonly [RequirementsTypeId]: (_: never) => R;
}

export interface Child<Id extends string = string, Machine extends MachineLike = MachineLike> {
  readonly kind: "child";
  readonly id: Id;
  readonly machine: Machine;
  readonly [TypeId]: "Child";
  readonly [RequirementsTypeId]: Machine[typeof RequirementsTypeId];
  readonly [DescriptorTypeId]: (_: never) => Child<Id, Machine>;
}

export const child = <const Id extends string, Machine extends MachineLike>(
  config: Readonly<{ id: Id; machine: Machine }>,
): Child<Id, Machine> => {
  const id = validateAuthoredId(config.id, "child") as Id;
  validateConfigKeys(config, new Set(["id", "machine"]), "child", id);
  return Object.freeze({
    kind: "child" as const,
    id,
    machine: config.machine,
    [TypeId]: "Child" as const,
    [RequirementsTypeId]: typeBrand,
    [DescriptorTypeId]: typeBrand,
  });
};

export interface AnyResource {
  readonly kind: "resource";
  readonly id: string;
  readonly [TypeId]: "Resource";
  readonly [RequirementsTypeId]: (_: never) => unknown;
  readonly [DescriptorTypeId]: (_: never) => unknown;
}
export interface AnyTransaction {
  readonly kind: "transaction";
  readonly id: string;
  readonly [TypeId]: "Transaction";
  readonly [RequirementsTypeId]: (_: never) => unknown;
  readonly [DescriptorTypeId]: (_: never) => unknown;
}
export interface AnyStream {
  readonly kind: "stream";
  readonly id: string;
  readonly [TypeId]: "Stream";
  readonly [RequirementsTypeId]: (_: never) => unknown;
  readonly [DescriptorTypeId]: (_: never) => unknown;
}
export interface AnyChild {
  readonly kind: "child";
  readonly id: string;
  readonly machine: MachineLike;
  readonly [TypeId]: "Child";
  readonly [RequirementsTypeId]: (_: never) => unknown;
  readonly [DescriptorTypeId]: (_: never) => unknown;
}
export type AnyDescriptor = AnyResource | AnyTransaction | AnyStream | AnyChild;

export const descriptorList = (values: readonly AnyDescriptor[]): readonly AnyDescriptor[] =>
  freezeArray(values);
