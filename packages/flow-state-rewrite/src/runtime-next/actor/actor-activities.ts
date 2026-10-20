import { Option, Predicate, Result, Struct } from "effect";

import { Failure } from "../../diagnostic/diagnostic.js";
import type { Machine } from "../../machine/machine.js";
import type { MachineDefinition } from "../../machine/grammar.js";
import { canonicalizeKey } from "../../operation/key.js";
import type { OperationKey } from "../../operation/key.js";
import type { OperationDeclaration } from "../../operation/operation.js";

type OperationOf<DefinitionValue extends MachineDefinition> =
  DefinitionValue["operations"][keyof DefinitionValue["operations"]];

type RuntimeOperation = OperationDeclaration & {
  kind: "resource" | "transaction" | "stream";
  getState: (...args: never[]) => unknown;
} & (
    | { kind: "resource"; getData: (...args: never[]) => unknown }
    | { kind: "transaction" | "stream" }
  );

type PassiveOperationReader<Operation> = Pick<
  Operation,
  Extract<keyof Operation, "key" | "getData" | "getState">
>;

type OperationReadEntry<Operation> = {
  descriptor: Operation;
  reader: PassiveOperationReader<Operation>;
};

/** The actor captures these exact family readers at each store publication. */
export type ActorOperationReadCut<DefinitionValue extends MachineDefinition> = {
  [Name in keyof DefinitionValue["operations"]]: OperationReadEntry<
    DefinitionValue["operations"][Name]
  >;
};

/** Exact named passive readers for one machine definition. */
// oxlint-disable-next-line anti-slop/no-readonly -- This fixed Definition-indexed reader map is captured by one snapshot and must not let consumers replace a named capability.
export type ActorOperationReaders<DefinitionValue extends MachineDefinition> = Readonly<{
  [
    Name in keyof ActorOperationReadCut<DefinitionValue>
  ]: ActorOperationReadCut<DefinitionValue>[Name]["reader"];
}>;

interface OperationReaderLambda<DefinitionValue extends MachineDefinition> extends Struct.Lambda {
  <Entry extends OperationReadEntry<OperationOf<DefinitionValue>>>(entry: Entry): Entry["reader"];
  // oxlint-disable-next-line anti-slop/no-readonly -- Effect Struct.Lambda uses immutable type markers to preserve each mapped input family's output.
  readonly "~lambda.in": OperationReadEntry<OperationOf<DefinitionValue>>;
  // oxlint-disable-next-line anti-slop/no-readonly -- Effect Struct.Lambda requires a readonly output marker for its mapped family projection.
  readonly "~lambda.out": this["~lambda.in"]["reader"];
}

// RETURN_TYPE: The predicate proves the exact machine-slot and family-method invariants before capturing a reader from reflected entries.
const isRuntimeOperation = <
  DefinitionValue extends MachineDefinition,
  Operation extends OperationDeclaration,
>(
  machine: Machine<DefinitionValue>,
  name: string,
  operation: Operation,
): operation is Operation & OperationOf<DefinitionValue> & RuntimeOperation => {
  const ownSlot = Object.getOwnPropertyDescriptor(machine.definition.operations, name);
  const stateMethod = Object.getOwnPropertyDescriptor(operation, "getState");

  if (
    ownSlot?.value !== operation ||
    ownSlot.enumerable !== true ||
    stateMethod === undefined ||
    !("value" in stateMethod) ||
    !Predicate.isFunction(stateMethod.value)
  )
    return false;

  if (operation.kind !== "resource") return true;

  const dataMethod = Object.getOwnPropertyDescriptor(operation, "getData");

  return (
    dataMethod !== undefined && "value" in dataMethod && Predicate.isFunction(dataMethod.value)
  );
};

// RETURN_TYPE: Resolves only the machine's own admitted operation slots, retaining their Definition-indexed family type.
const resolveMachineOperation = <DefinitionValue extends MachineDefinition>(
  machine: Machine<DefinitionValue>,
  id: string,
): OperationOf<DefinitionValue> | undefined => {
  let match: OperationOf<DefinitionValue> | undefined;

  for (const [name, candidate] of Object.entries(machine.definition.operations)) {
    if (candidate.id !== id) continue;

    if (!isRuntimeOperation(machine, name, candidate) || match !== undefined) return undefined;

    match = candidate;
  }

  return match;
};

const occurrenceBrand: unique symbol = Symbol("actor operation occurrence");

// oxlint-disable-next-line anti-slop/no-readonly -- The opaque occurrence must keep its descriptor, owned canonical key, and generation fixed for stale-result fencing.
export type OperationOccurrence<DefinitionValue extends MachineDefinition> = Readonly<{
  [occurrenceBrand]: true;
  descriptor: OperationOf<DefinitionValue>;
  key: OperationKey;
  generation: number;
  activitySlot: Option.Option<string>;
}>;

type OccurrenceCursor<DefinitionValue extends MachineDefinition> = {
  occurrence: OperationOccurrence<DefinitionValue>;
};

// oxlint-disable-next-line anti-slop/no-readonly -- A prepared permit is a fixed occurrence plus one-shot commit/cancel capabilities.
export type PreparedOperationOccurrence<DefinitionValue extends MachineDefinition> = Readonly<{
  occurrence: OperationOccurrence<DefinitionValue>;
  commit(): void;
  cancel(): void;
}>;

const occurrenceFailure = () =>
  Failure({
    code: "InvariantViolation",
    path: ["actor", "operation", "generation"],
    details: { reason: "overflow" },
    summary: "Actor cannot allocate another operation occurrence.",
    help: "Dispose this actor before its operation generation is exhausted.",
  });

const keyIdentity = (key: OperationKey) => JSON.stringify(key);

const lockOwnProperties = <Value extends Record<string, unknown>>(value: Value) => {
  for (const key of Reflect.ownKeys(value)) {
    const property = Object.getOwnPropertyDescriptor(value, key);

    if (property === undefined) continue;

    if ("value" in property)
      Object.defineProperty(value, key, { configurable: false, writable: false });
    else Object.defineProperty(value, key, { configurable: false });
  }

  return value;
};

class OccurrenceValue<
  DefinitionValue extends MachineDefinition,
> implements OperationOccurrence<DefinitionValue> {
  #ownedDescriptor: OperationOf<DefinitionValue>;
  #ownedKey: OperationKey;
  #ownedGeneration: number;
  #ownedActivitySlot: Option.Option<string>;

  constructor(
    descriptor: OperationOf<DefinitionValue>,
    key: OperationKey,
    generation: number,
    activitySlot: Option.Option<string>,
  ) {
    this.#ownedDescriptor = descriptor;
    this.#ownedKey = key;
    this.#ownedGeneration = generation;
    this.#ownedActivitySlot = activitySlot;

    Object.defineProperties(this, {
      [occurrenceBrand]: { enumerable: true, get: () => true },
      descriptor: { enumerable: true, get: () => this.#ownedDescriptor },
      key: { enumerable: true, get: () => canonicalizeKey(this.#ownedKey) },
      generation: { enumerable: true, get: () => this.#ownedGeneration },
      activitySlot: { enumerable: true, get: () => this.#ownedActivitySlot },
    });
  }

  get descriptor() {
    return this.#ownedDescriptor;
  }

  get key() {
    return canonicalizeKey(this.#ownedKey);
  }

  get generation() {
    return this.#ownedGeneration;
  }

  get activitySlot() {
    return this.#ownedActivitySlot;
  }

  // RETURN_TYPE: The private unique-symbol brand must remain the literal true for nominal occurrence typing.
  get [occurrenceBrand](): true {
    return true;
  }
}

/** One actor's operation readers and bounded occurrence cursors. */
export const makeActorActivities = <DefinitionValue extends MachineDefinition>(
  machine: Machine<DefinitionValue>,
) => {
  const cursors = new Map<
    OperationOf<DefinitionValue>,
    Map<string, OccurrenceCursor<DefinitionValue>>
  >();

  let generation = 0;

  const resolveDescriptor = (id: string) => resolveMachineOperation(machine, id);

  // RETURN_TYPE: Preserves the exact mapped named-reader family rather than exposing the internal construction list.
  const captureReaders = (
    readCut: ActorOperationReadCut<DefinitionValue>,
  ): ActorOperationReaders<DefinitionValue> => {
    const mapper = Struct.lambda<OperationReaderLambda<DefinitionValue>>((entry) =>
      lockOwnProperties({ ...entry.reader }),
    );

    const readers = lockOwnProperties(Struct.map(readCut, mapper));

    return readers;
  };

  const cursorIdentity = (key: OperationKey, activitySlot: Option.Option<string>) =>
    Option.isSome(activitySlot)
      ? JSON.stringify(["activity", activitySlot.value, keyIdentity(key)])
      : JSON.stringify(["finite", keyIdentity(key)]);

  const prepareOccurrence = (
    descriptor: OperationOf<DefinitionValue>,
    key: OperationKey,
    activitySlot: Option.Option<string> = Option.none(),
  ) => {
    if (!Number.isSafeInteger(generation) || generation >= Number.MAX_SAFE_INTEGER)
      return Result.fail(occurrenceFailure());

    const ownedKey = canonicalizeKey(key);
    const nextGeneration = generation + 1;

    const occurrence: OperationOccurrence<DefinitionValue> = new OccurrenceValue(
      descriptor,
      ownedKey,
      nextGeneration,
      activitySlot,
    );

    const identity = cursorIdentity(ownedKey, activitySlot);

    generation = nextGeneration;

    let used = false;

    return Result.succeed({
      occurrence,
      commit: () => {
        if (used) return;

        used = true;

        const descriptorCursors = cursors.get(descriptor) ?? new Map();

        descriptorCursors.set(identity, { occurrence });
        cursors.set(descriptor, descriptorCursors);
      },
      cancel: () => {
        used = true;
      },
    });
  };

  const settle = (occurrence: OperationOccurrence<DefinitionValue>) => {
    const descriptorCursors = cursors.get(occurrence.descriptor);
    const identity = cursorIdentity(occurrence.key, occurrence.activitySlot);
    const cursor = descriptorCursors?.get(identity);

    if (descriptorCursors === undefined || cursor === undefined || cursor.occurrence !== occurrence)
      return false;

    descriptorCursors.delete(identity);

    if (descriptorCursors.size === 0) cursors.delete(occurrence.descriptor);

    return true;
  };

  const isLive = (occurrence: OperationOccurrence<DefinitionValue>) => {
    const descriptorCursors = cursors.get(occurrence.descriptor);
    const cursor = descriptorCursors?.get(cursorIdentity(occurrence.key, occurrence.activitySlot));

    return cursor !== undefined && cursor.occurrence === occurrence;
  };

  const evict = (
    descriptor: OperationOf<DefinitionValue>,
    key: OperationKey,
    activitySlot: Option.Option<string> = Option.none(),
  ) => {
    const descriptorCursors = cursors.get(descriptor);

    if (descriptorCursors === undefined) return;

    descriptorCursors.delete(cursorIdentity(canonicalizeKey(key), activitySlot));

    if (descriptorCursors.size === 0) cursors.delete(descriptor);
  };

  const clear = () => cursors.clear();

  return lockOwnProperties({
    captureReaders,
    prepareOccurrence,
    resolveDescriptor,
    isLive,
    settle,
    evict,
    clear,
  });
};
