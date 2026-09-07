import { Effect } from "effect";

import { canonicalizeKey } from "./key.js";
import type { OperationKey, ReadonlyCanonical } from "./key.js";
import { ownExecutableInput } from "./input.js";

/*
 * Operations:
 *
 * Types:
 *   OperationProgram, OperationDescriptor, OperationPlan, RequirementsCarrier
 *
 * Identity ownership:
 *   operationAdapterTypeId, attachOperationAdapter, lockOperationIdentity,
 *   publishOperation, readOperationAdapter, constructedOperations,
 *   constructedOperationPlans, operationPlanDescriptors,
 *   isConstructedOperation, isConstructedOperationPlan,
 *   isOperationPlanForDescriptor
 *
 * Plan assembly:
 *   operationPlan, operationPlanForDescriptor
 *
 * Execution adaptation:
 *   executeOperationProgram
 */

export const RequirementsTypeId: unique symbol = Symbol("operation requirements");

export type OperationKind = "resource" | "transaction" | "stream";

// RETURN_TYPE: Preserves the phantom Requirements carrier because the never input makes direct inference collapse to never.
export const requirements = <Requirements>(value: never): Requirements => value;

export type RequirementsCarrier<Requirements> = Readonly<{
  [RequirementsTypeId]: (_value: never) => Requirements;
}>;

export type OperationOptions = Readonly<{ signal: AbortSignal }>;

export type DataValue<Value> = Value | undefined;

export type OperationProgram<Value, Error, Requirements> =
  | Value
  | Effect.Effect<Value, Error, Requirements>;

export type OperationValueOf<Program> =
  Program extends Effect.Effect<infer Value, infer _Error, infer _Requirements> ? Value : Program;

export type OperationErrorOf<Program> = Effect.Error<Program>;

export type OperationRequirementsOf<Program> = Effect.Services<Program>;

export type OperationMethodResult<
  Operation,
  Name extends PropertyKey,
> = Name extends keyof Operation
  ? Operation[Name] extends (...args: never[]) => infer Result
    ? Result
    : never
  : never;

type IsAny<Value> = 0 extends 1 & Value ? true : false;
type IsUnknown<Value> = IsAny<Value> extends true ? false : unknown extends Value ? true : false;
type DirectPromiseLikeProgram<Program> = Extract<Program, PromiseLike<unknown>>;
type PromiseLikeSuccess<Program> = Extract<OperationValueOf<Program>, PromiseLike<unknown>>;

export type ValidOperationProgram<Program> =
  IsAny<Program> extends true
    ? never
    : IsUnknown<Program> extends true
      ? never
      : DirectPromiseLikeProgram<Program> extends never
        ? PromiseLikeSuccess<Program> extends never
          ? undefined extends OperationValueOf<Program>
            ? never
            : unknown
          : never
        : never;

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

export type OperationPlanKind =
  | "resource-lookup"
  | "resource-subscribe"
  | "resource-refetch"
  | "transaction-commit"
  | "stream-subscribe";

export type OperationPlan<
  Kind extends OperationPlanKind,
  Id extends string,
  P,
  K extends OperationKey,
  Options = undefined,
> = Readonly<{
  kind: Kind;
  descriptor: Id;
  params: P;
  key: K;
  options?: Options;
}>;

export type PlanOptions<Options> = Exclude<Options, undefined>;

export type FiniteOutcomes<A, E, Event = unknown> = Readonly<{
  success?: (value: A) => Event;
  failure?: [E] extends [never] ? never : (error: E) => Event;
  defect?: (defect: unknown) => Event;
  interrupt?: () => Event;
}>;

export type RequirementsOf<Value> =
  Value extends RequirementsCarrier<infer Requirements> ? Requirements : never;

export type OperationDescriptor<
  Kind extends OperationKind = OperationKind,
  Id extends string = string,
  P = never,
  K extends OperationKey = OperationKey,
  Requirements = unknown,
> = RequirementsCarrier<Requirements> &
  Readonly<{
    kind: Kind;
    id: Id;
    key: (params: P) => K;
  }>;

export type OperationDeclaration = OperationDescriptor;

export type OperationDeclarations = Readonly<Record<string, OperationDeclaration>>;

type ConstructedOperationPlan = OperationPlan<
  OperationPlanKind,
  string,
  unknown,
  OperationKey,
  unknown
>;

const operationAdapterTypeId: unique symbol = Symbol("operation adapter");

type StoredOperationAdapter = (...args: readonly never[]) => void;

type InternalOperationDescriptor = OperationDeclaration & {
  readonly [operationAdapterTypeId]: StoredOperationAdapter;
};

const constructedOperations = new WeakSet<OperationDeclaration>();
const constructedOperationPlans = new WeakSet();
const operationPlanDescriptors = new WeakMap<ConstructedOperationPlan, OperationDeclaration>();

// oxlint-disable-next-line anti-slop/no-runtime-typeof -- identity membership must not probe revoked proxies.
// RETURN_TYPE: Predicate return supplies OperationDeclaration narrowing for the subsequent identity membership check.
const isOperationReference = (value: unknown): value is OperationDeclaration =>
  typeof value === "object" && value !== null;

// SAFETY: only Operation family constructors and validated Definition admission mark descriptors; identity membership establishes OperationDeclaration.
// RETURN_TYPE: Predicate return preserves OperationDeclaration narrowing after constructed-operation identity membership.
export const isConstructedOperation = (value: unknown): value is OperationDeclaration =>
  isOperationReference(value) && constructedOperations.has(value);

const lockOperationIdentity = (descriptor: OperationDeclaration) => {
  Object.defineProperty(descriptor, "kind", { configurable: false, writable: false });
  Object.defineProperty(descriptor, "id", { configurable: false, writable: false });
};

const attachOperationAdapter = (descriptor: OperationDeclaration, adapter: unknown) => {
  Object.defineProperty(descriptor, operationAdapterTypeId, {
    configurable: false,
    enumerable: false,
    value: adapter,
    writable: false,
  });
  lockOperationIdentity(descriptor);
};

const markConstructedOperation = <Value extends OperationDeclaration>(value: Value) => {
  constructedOperations.add(value);
  return value;
};

export const publishOperation = <Descriptor extends OperationDeclaration>(
  descriptor: Descriptor,
  adapter: unknown,
) => {
  attachOperationAdapter(descriptor, adapter);
  return markConstructedOperation(descriptor);
};

export const readOperationAdapter = (descriptor: OperationDeclaration) => {
  // SAFETY: publishOperation defines this non-enumerable property before the descriptor is published.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the private adapter field is installed at the operation-construction boundary and restores its stored callable.
  return (descriptor as InternalOperationDescriptor)[operationAdapterTypeId];
};

// oxlint-disable-next-line anti-slop/no-runtime-typeof -- identity membership must not probe revoked proxies.
// RETURN_TYPE: Predicate return preserves the constructed-plan narrowing required by descriptor identity lookup.
export const isConstructedOperationPlan = (value: unknown): value is ConstructedOperationPlan =>
  typeof value === "object" && value !== null && constructedOperationPlans.has(value);

export const isOperationPlanForDescriptor = (value: unknown, descriptor: OperationDeclaration) =>
  isConstructedOperationPlan(value) && operationPlanDescriptors.get(value) === descriptor;

export function operationPlan<
  Kind extends OperationPlanKind,
  Id extends string,
  P,
  K extends OperationKey,
  const O = undefined,
>(
  kind: Kind,
  id: Id,
  key: (params: P) => K,
  params: P,
  options?: O,
): OperationPlan<Kind, Id, P, ReadonlyCanonical<K>, PlanOptions<O>>;

export function operationPlan<
  Kind extends OperationPlanKind,
  Id extends string,
  P,
  const O = undefined,
>(kind: Kind, descriptor: Id, key: (params: P) => OperationKey, params: P, options?: O) {
  const ownedParams = ownExecutableInput(params);
  const canonicalKey = canonicalizeKey(key(ownedParams));
  const base = {
    kind,
    descriptor,
    params: ownedParams,
    key: canonicalKey,
  };
  // oxlint-disable-next-line anti-slop/no-object-freeze -- this is the ownership seam that prevents reassignment of owned P/K references before work starts.
  const plan = options === undefined ? Object.freeze(base) : Object.freeze({ ...base, options });
  constructedOperationPlans.add(plan);
  return plan;
}

// RETURN_TYPE: Keeps the public plan declaration on ReadonlyCanonical<K> instead of exposing key.ts's private CanonicalKeyRecord.
export const operationPlanForDescriptor = <
  Kind extends OperationPlanKind,
  Id extends string,
  P,
  K extends OperationKey,
  const O = undefined,
>(
  descriptor: OperationDeclaration,
  kind: Kind,
  id: Id,
  key: (params: P) => K,
  params: P,
  options?: O,
): OperationPlan<Kind, Id, P, ReadonlyCanonical<K>, PlanOptions<O>> => {
  const plan = operationPlan(kind, id, key, params, options);
  operationPlanDescriptors.set(plan, descriptor);
  return plan;
};

export const executeOperationProgram = <Value, Error, Requirements>(
  thunk: () => OperationProgram<Value, Error, Requirements>,
) =>
  Effect.suspend(() => {
    const program = thunk();
    return Effect.isEffect(program) ? program : Effect.succeed(program);
  });
