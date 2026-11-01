import { Predicate, Result } from "effect";

import type { EventOf } from "../definition/domain.js";
import { decodeEventPayloadResult } from "../definition/schema.js";
import { Defect, Failure, type PublicDiagnostic } from "../diagnostic/diagnostic.js";
import type { MachineAction, MachineDefinition } from "../machine/grammar.js";
import type { Machine } from "../machine/machine.js";
import { isConstructedOperationPlan } from "../operation/operation.js";
import type { OperationKey } from "../operation/key.js";
import { ownExecutableInput } from "../operation/input.js";

type RuntimeValue = Parameters<typeof Defect>[0];

type RuntimeRecord = { [key: string]: RuntimeValue };

type CapturedEnvelope = { type: string; payload: RuntimeRecord };

type CapturedField = { key: string; value: RuntimeValue };

type MaterializedActionItem<DefinitionValue extends MachineDefinition> =
  | { kind: "failure"; diagnostic: PublicDiagnostic }
  | { kind: "mapped-event"; event: EventOf<DefinitionValue> }
  | { kind: "action"; action: MachineAction<DefinitionValue> };

const planningFailure = (
  path: (string | number)[],
  summary: string,
  details: Record<string, string | number | boolean | null> = {},
) =>
  Failure({
    code: "SemanticValidation",
    path,
    details,
    summary,
    help: "Correct the event turn before the ActorEngine publishes it.",
  });

export type EventTurnAction<DefinitionValue extends MachineDefinition> = {
  // oxlint-disable-next-line anti-slop/no-readonly -- ActorEngine consumes the validated immutable action intent without modifying its operation plan.
  readonly action: MachineAction<DefinitionValue>;
};

type ValidatedEvent<DefinitionValue extends MachineDefinition> = {
  event: EventOf<DefinitionValue>;
  name: string;
};

// RETURN_TYPE: Narrows dynamic envelope fields to the record boundary used by event validation.
const isRecord = (value: RuntimeValue): value is RuntimeRecord =>
  Predicate.isObject(value) && !Array.isArray(value);

const eventNameFor = <DefinitionValue extends MachineDefinition>(
  machine: Machine<DefinitionValue>,
  type: string,
) => Object.entries(machine.definition.E).find(([, token]) => token.id === type)?.[0];

const captureField = (value: RuntimeRecord, key: PropertyKey, path: (string | number)[]) => {
  if (!Predicate.isString(key))
    return Result.fail(
      planningFailure(path, "Event envelope cannot contain symbol keys", { issue: "event" }),
    );

  const descriptor = Object.getOwnPropertyDescriptor(value, key);

  if (descriptor === undefined || !descriptor.enumerable)
    return Result.fail(
      planningFailure([...path, key], "Event envelope fields must be enumerable", {
        issue: "event",
      }),
    );

  return Result.try({
    try: () => ({
      key,
      value: "value" in descriptor ? descriptor.value : descriptor.get?.call(value),
    }),
    catch: () =>
      planningFailure([...path, key], "Event envelope field could not be read", {
        issue: "event",
      }),
  });
};

// RETURN_TYPE: Captures each envelope field once before schema decoding owns nested payload data.
const captureEnvelope = (
  value: RuntimeValue,
  path: (string | number)[],
): Result.Result<CapturedEnvelope, PublicDiagnostic> => {
  if (!isRecord(value))
    return Result.fail(
      planningFailure(path, "Event envelope must be a record", { issue: "event" }),
    );

  const prototype = Object.getPrototypeOf(value);

  if (prototype !== Object.prototype && prototype !== null)
    return Result.fail(
      planningFailure(path, "Event envelope must be a plain record", { issue: "event" }),
    );

  const keys = Result.try({
    try: () => Reflect.ownKeys(value),
    catch: () => planningFailure(path, "Event envelope could not be inspected", { issue: "event" }),
  });

  if (Result.isFailure(keys)) return Result.fail(keys.failure);

  const fields: CapturedField[] = [];

  for (const key of keys.success) {
    const field = captureField(value, key, path);

    if (Result.isFailure(field)) return Result.fail(field.failure);
    fields.push(field.success);
  }

  const type = fields.find((field) => field.key === "type")?.value;

  if (!Predicate.isString(type))
    return Result.fail(
      planningFailure(path, "Event envelope must have a string type", { issue: "event" }),
    );

  const payload: [string, RuntimeValue][] = [];

  for (const field of fields) {
    if (field.key !== "type") payload.push([field.key, field.value]);
  }

  return Result.succeed({ type, payload: Object.fromEntries(payload) });
};

// RETURN_TYPE: Payload schema admission is paired with event identity before this guard is consumed.
// RETURN_TYPE: Gives primary and mapped envelopes the same Definition-indexed diagnostic boundary.
export const validateEventEnvelope = <DefinitionValue extends MachineDefinition>(
  machine: Machine<DefinitionValue>,
  value: RuntimeValue,
  path: (string | number)[],
): Result.Result<ValidatedEvent<DefinitionValue>, PublicDiagnostic> => {
  const captured = captureEnvelope(value, path);

  if (Result.isFailure(captured)) return Result.fail(captured.failure);

  const name = eventNameFor(machine, captured.success.type);

  if (name === undefined)
    return Result.fail(
      planningFailure(path, "Event belongs to a different machine definition", {
        issue: "foreign-event",
      }),
    );

  const decoded = decodeEventPayloadResult(captured.success.payload);

  if (Result.isFailure(decoded))
    return Result.fail(
      Failure({
        code: "SchemaValidation",
        path,
        details: { issue: "event-payload" },
        summary: "Mapped event payload is invalid",
        help: "Return an event created by the matching Definition event token.",
      }),
    );

  const event = {
    ...decoded.success,
    type: captured.success.type,
  } satisfies RuntimeRecord;

  if (!isEventEnvelopeFor(machine, event))
    return Result.fail(
      planningFailure(path, "Event envelope belongs to a different machine", {
        issue: "foreign-event",
      }),
    );

  return Result.succeed({ event, name });
};

const operationForId = <DefinitionValue extends MachineDefinition>(
  machine: Machine<DefinitionValue>,
  id: RuntimeValue,
) =>
  Predicate.isString(id)
    ? Object.values(machine.definition.operations).find((operation) => operation.id === id)
    : undefined;

// RETURN_TYPE: The token lookup binds a schema-decoded envelope to this Machine's event union.
const isEventEnvelopeFor = <DefinitionValue extends MachineDefinition>(
  machine: Machine<DefinitionValue>,
  value: RuntimeRecord,
): value is EventOf<DefinitionValue> =>
  Predicate.isString(value.type) &&
  Object.values(machine.definition.E).some((token) => token.id === value.type);

// RETURN_TYPE: Narrows dynamic operation keys to the canonical array container accepted by plans.
const isArrayKey = (value: RuntimeValue): value is OperationKey => Array.isArray(value);

const isValidStoreAction = <DefinitionValue extends MachineDefinition>(
  machine: Machine<DefinitionValue>,
  value: RuntimeRecord,
) => {
  if (value.kind !== "invalidate" && value.kind !== "clear") return false;

  if (!Array.isArray(value.targets) || value.targets.length === 0) return false;

  return value.targets.every(
    (target) =>
      Array.isArray(target) &&
      target.length === 2 &&
      Object.values(machine.definition.operations).some(
        (operation) => operation === target[0] && operation.kind === "resource",
      ) &&
      isArrayKey(target[1]),
  );
};

// RETURN_TYPE: Narrows the captured runtime plan to this Machine's Definition-indexed action union.
const isConstructedOperationForMachine = <DefinitionValue extends MachineDefinition>(
  machine: Machine<DefinitionValue>,
  value: RuntimeValue,
): value is MachineAction<DefinitionValue> => {
  if (!isRecord(value) || !isArrayKey(value.key)) return false;
  const operation = operationForId(machine, value.descriptor);

  if (operation === undefined) return false;

  return value.kind === "resource-lookup" || value.kind === "resource-refetch"
    ? operation.kind === "resource"
    : value.kind === "transaction-commit" && operation.kind === "transaction";
};

const isValidCacheOrCancelAction = <DefinitionValue extends MachineDefinition>(
  machine: Machine<DefinitionValue>,
  value: RuntimeRecord,
) => {
  if (!isArrayKey(value.key)) return false;
  const operation = operationForId(machine, value.descriptor);

  if (operation === undefined) return false;

  if (value.kind === "cache-write")
    return (
      value.family === "resource" && operation.kind === "resource" && Object.hasOwn(value, "value")
    );

  return (
    value.kind === "cancel" &&
    !Object.hasOwn(value, "value") &&
    ((value.family === "resource" && operation.kind === "resource") ||
      (value.family === "transaction" && operation.kind === "transaction"))
  );
};

// RETURN_TYPE: Proves one finite action belongs to the current Machine and action grammar.
const isValidAction = <DefinitionValue extends MachineDefinition>(
  machine: Machine<DefinitionValue>,
  value: RuntimeValue,
): value is MachineAction<DefinitionValue> => {
  if (!isRecord(value)) return false;

  return isValidStoreAction(machine, value) || isValidCacheOrCancelAction(machine, value);
};

// RETURN_TYPE: Validates the complete batch before intents or mapped continuations escape.
export const materializeActions = <DefinitionValue extends MachineDefinition>(
  machine: Machine<DefinitionValue>,
  value: RuntimeValue,
): Result.Result<
  {
    actions: EventTurnAction<DefinitionValue>[];
    mappedEvents: EventOf<DefinitionValue>[];
  },
  PublicDiagnostic
> => {
  if (value === null || value === undefined)
    return Result.succeed({ actions: [], mappedEvents: [] });

  const batch: RuntimeValue[] = Array.isArray(value) ? value : [value];
  const actions: EventTurnAction<DefinitionValue>[] = [];
  const mappedEvents: EventOf<DefinitionValue>[] = [];

  for (const [ordinal, item] of batch.entries()) {
    const materialized = materializeActionItem(machine, item, ordinal);

    if (materialized.kind === "failure") return Result.fail(materialized.diagnostic);

    if (materialized.kind === "mapped-event") mappedEvents.push(materialized.event);
    else actions.push({ action: materialized.action });
  }

  return Result.succeed({ actions, mappedEvents });
};

const materializeActionItem = <DefinitionValue extends MachineDefinition>(
  machine: Machine<DefinitionValue>,
  item: RuntimeValue,
  ordinal: number,
) => {
  if (isConstructedOperationPlan(item)) {
    const owned = Result.try({
      try: () => ownExecutableInput(item),
      catch: () =>
        planningFailure(["actions", ordinal], "Operation plan could not be captured", {
          issue: "invalid-action",
        }),
    });

    if (Result.isFailure(owned))
      return {
        kind: "failure",
        diagnostic: owned.failure,
      } satisfies MaterializedActionItem<DefinitionValue>;

    if (!isConstructedOperationForMachine(machine, owned.success))
      return {
        kind: "failure",
        diagnostic: planningFailure(["actions", ordinal], "Action batch contains an invalid item", {
          issue: "invalid-action",
        }),
      } satisfies MaterializedActionItem<DefinitionValue>;

    return {
      kind: "action",
      action: owned.success,
    } satisfies MaterializedActionItem<DefinitionValue>;
  }

  const mapped = validateEventEnvelope(machine, item, ["actions", ordinal]);

  if (Result.isSuccess(mapped))
    return {
      kind: "mapped-event",
      event: mapped.success.event,
    } satisfies MaterializedActionItem<DefinitionValue>;

  if (!isValidAction(machine, item))
    return {
      kind: "failure",
      diagnostic: planningFailure(["actions", ordinal], "Action batch contains an invalid item", {
        issue: "invalid-action",
      }),
    } satisfies MaterializedActionItem<DefinitionValue>;

  return { kind: "action", action: item } satisfies MaterializedActionItem<DefinitionValue>;
};
