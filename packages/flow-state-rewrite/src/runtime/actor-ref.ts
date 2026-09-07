import { Effect, Predicate, Result, Schema, SchemaIssue, type Types } from "effect";

import { AuthoredName } from "../internal/authored-name.js";
import { firstConfigurationField } from "../internal/schema-issue.js";
import { isStableDataDescriptor, isStableKeyList } from "../internal/stable-observation.js";
import { isConstructedMachine, type MachineRecordValue } from "../machine/machine.js";

/*
 * Actor references:
 *
 * Public contracts and inference:
 *   ActorRef, ActorRefOptions, PersistOf
 *
 * Options reflection and capture:
 *   captureActorRefOptions, invalidActorRefOptions
 *
 * Exact Schema admission:
 *   ConstructedMachineSchema, ActorRefOptionsSchema, ActorRefInputSchema
 *   decodeActorRefOptionsFields, decodeActorRefInput
 *
 * First-field error projection:
 *   firstActorRefInputField, projectActorRefInputFailure
 *
 * Persist normalization and public assembly:
 *   actorRef
 */

declare const actorRefBrand: unique symbol;

export type ActorRef<
  MachineValue extends MachineRecordValue = MachineRecordValue,
  Id extends string = string,
  Persist extends boolean = boolean,
> = {
  readonly machine: MachineValue;
  readonly id: Id;
  readonly persist: Persist;
  readonly [actorRefBrand]: void;
};

export type ActorRefOptions = {
  readonly persist?: boolean;
};

type PersistOf<Options extends ActorRefOptions | undefined> = Options extends undefined
  ? false
  : Options extends { readonly persist: infer Persist extends boolean }
    ? Persist
    : Options extends { readonly persist?: boolean }
      ? "persist" extends keyof Options
        ? boolean
        : false
      : false;

const invalidActorRefOptions = () => {
  throw new TypeError("actorRef options must contain only an optional boolean persist");
};

const captureActorRefOptions = (value: unknown) => {
  // oxlint-disable-next-line anti-slop/no-raw-try-catch -- caller-controlled options reflection must become a stable Schema admission failure.
  try {
    if (!Predicate.isObject(value)) return Result.fail(undefined);

    const keys = Reflect.ownKeys(value);
    const repeatedKeys = Reflect.ownKeys(value);
    if (!isStableKeyList(keys, repeatedKeys)) return Result.fail(undefined);
    if (repeatedKeys.length === 0) return Result.succeed({});
    if (repeatedKeys.length !== 1 || repeatedKeys[0] !== "persist") return Result.fail(undefined);

    const descriptor = Object.getOwnPropertyDescriptor(value, "persist");
    const repeatedDescriptor = Object.getOwnPropertyDescriptor(value, "persist");
    if (
      descriptor === undefined ||
      repeatedDescriptor === undefined ||
      !isStableDataDescriptor(descriptor, repeatedDescriptor)
    ) {
      return Result.fail(undefined);
    }

    return Result.succeed({ persist: repeatedDescriptor.value });
  } catch {
    return Result.fail(undefined);
  }
};

const ConstructedMachineSchema = Schema.declare<MachineRecordValue>(
  // RETURN_TYPE: Predicate required by Schema.declare to retain constructed-machine narrowing.
  (value: unknown): value is MachineRecordValue => isConstructedMachine(value),
  { identifier: "ConstructedMachine" },
);

const ActorRefOptionsFields = Schema.Struct({
  persist: Schema.optionalKey(Schema.Boolean),
});

const decodeActorRefOptionsFields = Schema.decodeUnknownResult(ActorRefOptionsFields, {
  onExcessProperty: "error",
});

const ActorRefOptionsSchema = Schema.declareConstructor<ActorRefOptions, unknown>()(
  [],
  () => (value, ast, options) => {
    const invalid = () => Effect.fail(new SchemaIssue.InvalidType(ast, value, options));
    const decodeCaptured = (captured: unknown) => {
      const decoded = decodeActorRefOptionsFields(captured, options);
      return Result.isSuccess(decoded)
        ? Effect.succeed(decoded.success)
        : Effect.fail(decoded.failure.issue);
    };

    const captured = captureActorRefOptions(value);
    return Result.isFailure(captured) ? invalid() : decodeCaptured(captured.success);
  },
);

const ActorRefInputSchema = Schema.Struct({
  machine: ConstructedMachineSchema,
  id: AuthoredName,
  options: Schema.optionalKey(ActorRefOptionsSchema),
});

const decodeActorRefInput = Schema.decodeUnknownResult(ActorRefInputSchema, {
  onExcessProperty: "error",
});

const firstActorRefInputField = (failure: Schema.SchemaError) =>
  firstConfigurationField(failure.issue);

const projectActorRefInputFailure = (failure: Schema.SchemaError) => {
  const field = firstActorRefInputField(failure);
  if (field === "machine") throw new TypeError("actorRef machine must be a constructed Machine");
  if (field === "id") throw new TypeError("actorRef id must be a valid authored name");
  return invalidActorRefOptions();
};

export function actorRef<const MachineValue extends MachineRecordValue, const Id extends string>(
  machine: MachineValue,
  id: Id,
  options?: undefined,
): ActorRef<MachineValue, Id, false>;

export function actorRef<
  const MachineValue extends MachineRecordValue,
  const Id extends string,
  const Options extends ActorRefOptions,
>(
  machine: MachineValue,
  id: Id,
  options: Options & Types.NoExcessProperties<ActorRefOptions, Options>,
): ActorRef<MachineValue, Id, PersistOf<Options>>;

export function actorRef(machine: MachineRecordValue, id: string, options?: unknown) {
  const input = options === undefined ? { machine, id } : { machine, id, options };
  const decoded = decodeActorRefInput(input);
  if (Result.isFailure(decoded)) return projectActorRefInputFailure(decoded.failure);

  // SAFETY: this object is the complete inert actor-ref value; the brand is type-only.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the private brand has no runtime field; machine, id, and persist are the complete admitted ActorRef value.
  return {
    machine: decoded.success.machine,
    id: decoded.success.id,
    persist: decoded.success.options?.persist ?? false,
  } as ActorRef;
}
