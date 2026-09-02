import { Predicate } from "effect";

import { canonicalizeKey } from "./key.js";
import type { OperationKey } from "./key.js";

export const OperationAdapterTypeId: unique symbol = Symbol("operation adapter");

export const RequirementsTypeId: unique symbol = Symbol("operation requirements");

export const requirements = <Requirements>(value: never): Requirements => value;

export type RequirementsCarrier<Requirements> = Readonly<{
  [RequirementsTypeId]: (_value: never) => Requirements;
}>;

export type OperationOptions = Readonly<{ signal: AbortSignal }>;

export type DataValue<Value> = Value | undefined;

export type CancellationPlan<
  Id extends string,
  K extends OperationKey,
  Family extends "resource" | "transaction",
> = Readonly<{
  kind: "cancel";
  family: Family;
  descriptor: Id;
  key: K;
}>;

export type CacheWritePlan<Id extends string, K extends OperationKey, Value> = Readonly<{
  kind: "cache-write";
  family: "resource";
  descriptor: Id;
  key: K;
  value: Value;
}>;

export type OperationPlan<
  Kind extends string,
  Id extends string,
  P,
  K extends OperationKey,
  Options = never,
> = Readonly<{
  kind: Kind;
  descriptor: Id;
  params: P;
  key: K;
  options?: Options;
}>;

export type FiniteOutcomes<A, E, Event = unknown> = Readonly<{
  success?: (value: A) => Event;
  failure?: [E] extends [never] ? never : (error: E) => Event;
  defect?: (defect: unknown) => Event;
  interrupt?: () => Event;
}>;

export type RequirementsOf<Value> =
  Value extends RequirementsCarrier<infer Requirements> ? Requirements : never;

export const operationPlan = <
  Kind extends string,
  Id extends string,
  P,
  K extends OperationKey,
  Options = never,
>(
  kind: Kind,
  descriptor: Id,
  key: (params: P) => K,
  ...args: [params: P] | [params: P, options: Options]
): OperationPlan<Kind, Id, P, K, Options> => {
  const params = args[0];
  const base = { kind, descriptor, params, key: canonicalizeKey(key(params)) };
  return args.length === 1 ? base : { ...base, options: args[1] };
};

type ConstructedOperation = Readonly<{ kind: string }>;

const isConstructedOperationValue = (value: unknown): value is ConstructedOperation =>
  Predicate.isObject(value) && Predicate.isString(value.kind);

const constructedOperations = new WeakSet<ConstructedOperation>();

export const isConstructedOperation = (value: unknown): value is ConstructedOperation =>
  isConstructedOperationValue(value) && constructedOperations.has(value);

export const markConstructedOperation = <Value extends ConstructedOperation>(value: Value): Value => {
  constructedOperations.add(value);
  return value;
};
