// oxlint-disable-next-line anti-slop/no-large-production-file -- snapshot admission, prepared mailbox activation, the serial consumer, and publication share one actor-lifetime owner; splitting would add cross-owner state and callback plumbing.
import {
  Cause,
  Deferred,
  Effect,
  Exit,
  Fiber,
  PubSub,
  Predicate,
  Queue,
  Result,
  Schema,
  Scope,
  Stream,
} from "effect";

import type { EventOf } from "../definition/domain.js";
import { decodeEventPayloadResult } from "../definition/schema.js";
import {
  Defect,
  Diagnostic,
  Failure,
  Interrupt,
  type PublicDiagnostic,
} from "../diagnostic/diagnostic.js";
import {
  isConstructedMachine,
  type Machine,
  type MachineRecordValue,
  type MachineSnapshot,
} from "../machine/machine.js";
import type { MachineAction, MachineDefinition } from "../machine/grammar.js";
import { canonicalizeKey, equalCanonicalKey, type OperationKey } from "../operation/key.js";
import { isConstructedOperation, type OperationDeclaration } from "../operation/operation.js";
import type { ActorFence, ActorIdentity } from "./actor-admission.js";
import type { ActorRef } from "./actor-ref.js";
import { copyObject } from "./collection-copies.js";
import {
  isEventForMachine,
  planTurn,
  type OperationOccurrenceFence,
  type ProjectionFact,
  type StoreChangeReference,
  type TurnCause,
  type TurnPlan,
} from "./turn-plan.js";

/** The smallest finite prepared mailbox required by the host contract. */
export const ACTOR_MAILBOX_CAPACITY = 64;

/** A public command is an already-admitted nominal event envelope. */
export type ActorCommand<DefinitionValue extends MachineDefinition> = EventOf<DefinitionValue>;

/** Lifecycle is repeated here until the lifecycle owner becomes executable. */
export type ActorLifecycle = "prepared" | "active" | "suspended" | "disposed";

export type OperationProjection = {
  descriptor: OperationDeclaration;
  key: OperationKey;
  status: "pending" | "running" | "succeeded" | "failed" | "cancelled";
};

export type TimerProjection = {
  name: string;
  startedAt: number;
  dueAt: number;
};

/** The complete owned value exposed at one publication boundary. */
export type ActorSnapshot<DefinitionValue extends MachineDefinition> =
  MachineSnapshot<DefinitionValue> & {
    lifecycle: ActorLifecycle;
    operations: OperationProjection[];
    timers: TimerProjection[];
    issues: PublicDiagnostic[];
    /** Publicly visible publication revision; machine-turn revision stays private. */
    revision: number;
    observedStoreRevision: number;
  };

declare const preparedActorSnapshotBrand: unique symbol;

/** A snapshot copied and admitted for one exact machine before engine preparation. */
export type PreparedActorSnapshot<DefinitionValue extends MachineDefinition> =
  ActorSnapshot<DefinitionValue> & {
    [preparedActorSnapshotBrand]: void;
  };

/**
 * A typed P02 store result is the only store capability needed by this slice.
 * A successful commit is an atomic store-owner result: validation, ownership,
 * and result copying happen inside that owner before it returns.
 */
export type ActorStoreResult<DefinitionValue extends MachineDefinition> = {
  revision: number;
  changed: StoreChangeReference<DefinitionValue>[];
};

export type ActorStore<DefinitionValue extends MachineDefinition> = {
  /**
   * The owner constructs its result with makeActorStoreResult before exposing the
   * mutation; a successful return is therefore already a valid owned cut.
   */
  commit: (
    actions: MachineAction<DefinitionValue>[],
  ) => Result.Result<ActorStoreResult<DefinitionValue>, PublicDiagnostic>;
};

export type ActorPublication<DefinitionValue extends MachineDefinition> = {
  readonly fence: ActorFence;
  readonly snapshot: ActorSnapshot<DefinitionValue>;
  readonly store: ActorStoreResult<DefinitionValue>;
  readonly publicationRevision: number;
  readonly machineTurnRevision: number;
  readonly cause: TurnCause<DefinitionValue>;
};

/** Journal permit held across the short store commit interval. */
export type PreparedActorEvidence<DefinitionValue extends MachineDefinition> = {
  finalize: (publication: ActorPublication<DefinitionValue>) => number;
  cancel: () => Result.Result<void, PublicDiagnostic>;
};

export type DispatchReceipt = {
  publicationRevision: number;
  evidenceSequence: number;
};

/** This cell is package-private in use; actorHandle never exposes it. */
export type AcknowledgedDispatch = {
  admitted: boolean;
  completion: Deferred.Deferred<DispatchReceipt, PublicDiagnostic>;
};

export type ActorCommandHandler<DefinitionValue extends MachineDefinition> = (
  command: ActorCommand<DefinitionValue>,
) => Effect.Effect<void, PublicDiagnostic, Scope.Scope>;

export type ActorEvidenceAcceptor<DefinitionValue extends MachineDefinition> = (
  publication: ActorPublication<DefinitionValue>,
  before: ActorSnapshot<DefinitionValue>,
  phase: "prepare" | "accept",
) => Result.Result<number | PreparedActorEvidence<DefinitionValue>, PublicDiagnostic>;

/** A public mailbox fact carries no transition result or acknowledgement handle. */
export type ActorMailboxFact<DefinitionValue extends MachineDefinition> =
  | {
      _tag: "command";
      fence: ActorFence;
      command: ActorCommand<DefinitionValue>;
      acknowledgement?: Deferred.Deferred<DispatchReceipt, PublicDiagnostic>;
    }
  | {
      _tag: "projection";
      fence: ActorFence;
      fact: ProjectionFact;
    };

export type ActorFactDisposition<DefinitionValue extends MachineDefinition> =
  | {
      _tag: "accepted";
      fact: Extract<ActorMailboxFact<DefinitionValue>, { _tag: "command" }>;
    }
  | {
      _tag: "discarded";
      reason: "stale-fence";
    };

export type ActorEngineInput<DefinitionValue extends MachineDefinition> = {
  identity: ActorIdentity<DefinitionValue>;
  /** App-time machine facts used for planning; the identity ref retains the public machine token. */
  machine?: Machine<DefinitionValue>;
  fence: ActorFence;
  initial: PreparedActorSnapshot<DefinitionValue>;
  initialMachineTurnRevision?: number;
  actorCell?: { cut?: ActorCellCut<DefinitionValue> };
  scope: Scope.Scope;
  store?: ActorStore<DefinitionValue>;
  acceptEvidence?: ActorEvidenceAcceptor<DefinitionValue>;
  onSnapshot?: (snapshot: ActorSnapshot<DefinitionValue>, machineTurnRevision: number) => void;
  onCommand?: ActorCommandHandler<DefinitionValue> | undefined;
};

export interface ActorEngine<DefinitionValue extends MachineDefinition> {
  ref: ActorRef<Machine<DefinitionValue>>;
  fence: ActorFence;
  machineTurnRevision: () => number;
  snapshot: () => ActorSnapshot<DefinitionValue>;
  preflightLifecyclePublication: (initial: boolean) => Result.Result<void, PublicDiagnostic>;
  commitLifecyclePublication: (
    lifecycle: ActorLifecycle,
    initial: boolean,
  ) => Result.Result<
    {
      publicationRevision: number;
      machineTurnRevision: number;
      notify: () => Result.Result<void, PublicDiagnostic>;
    },
    PublicDiagnostic
  >;
  send: (command: ActorCommand<DefinitionValue>) => void;
  dispatch: (command: ActorCommand<DefinitionValue>) => AcknowledgedDispatch;
  dispatchFact: (fact: ProjectionFact) => Result.Result<void, PublicDiagnostic>;
  snapshots: Stream.Stream<ActorSnapshot<DefinitionValue>>;
  drain: () => Effect.Effect<void, PublicDiagnostic>;
  shutdown: () => Effect.Effect<void, PublicDiagnostic>;
}

export interface PreparedActorEngine<DefinitionValue extends MachineDefinition> {
  phase: "prepared";
  send: (command: ActorCommand<DefinitionValue>) => void;
  dispatch: (command: ActorCommand<DefinitionValue>) => AcknowledgedDispatch;
  activate: () => Effect.Effect<ActorEngine<DefinitionValue>, PublicDiagnostic>;
  abandon: () => void;
}

export interface ActorHandle<DefinitionValue extends MachineDefinition> {
  ref: ActorRef<Machine<DefinitionValue>>;
  send: (command: ActorCommand<DefinitionValue>) => void;
}

type ConsumerFiberState = {
  current: Fiber.Fiber<void, PublicDiagnostic> | undefined;
  exit: Exit.Exit<void, PublicDiagnostic> | undefined;
};

export type ActorCellCut<DefinitionValue extends MachineDefinition> = {
  publication: Omit<ActorPublication<DefinitionValue>, "cause">;
  evidenceSequence: number;
};

type PreparedCut<DefinitionValue extends MachineDefinition> = {
  publication: ActorPublication<DefinitionValue>;
  evidenceSequence: number | PreparedActorEvidence<DefinitionValue>;
};

type DrainState = {
  processing: boolean;
  waiters: Deferred.Deferred<void>[];
};

const mailboxAdmissionFailure = (reason: "closed" | "full") =>
  Failure({
    code: "InvariantViolation",
    path: ["mailbox", reason],
    details: { reason },
    summary: reason === "closed" ? "Actor mailbox is closed" : "Actor mailbox is full",
    help: "Send only while the actor mailbox is active and has capacity.",
  });

const foreignEventFailure = () =>
  Failure({
    code: "SemanticValidation",
    path: ["event"],
    details: { issue: "foreign-event" },
    summary: "Event belongs to a different machine definition",
    help: "Send an event created by this actor's machine definition.",
  });

const shutdownFailure = () => Interrupt();

const clearMailbox = <DefinitionValue extends MachineDefinition>(
  mailbox: Queue.Queue<ActorMailboxFact<DefinitionValue>>,
) => {
  while (Queue.sizeUnsafe(mailbox) > 0) Queue.takeUnsafe(mailbox);
};

// RETURN_TYPE: Snapshot copies preserve the complete actor snapshot contract.
const copySnapshot = <DefinitionValue extends MachineDefinition>(
  snapshot: ActorSnapshot<DefinitionValue>,
): ActorSnapshot<DefinitionValue> => {
  const memory = { ...snapshot.memory };
  const context: ActorSnapshot<DefinitionValue>["context"] = { ...snapshot.context };

  const operations = snapshot.operations.map((operation) => ({
    ...operation,
    key: canonicalizeKey(operation.key),
  }));

  const timers = snapshot.timers.map((timer) => ({ ...timer }));
  const issues = [...snapshot.issues];

  return { ...snapshot, memory, context, operations, timers, issues };
};

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- reflected record fields remain unknown until recursive snapshot admission.
type SnapshotRecord = Record<PropertyKey, unknown>;

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- recursive reflection tracks both admitted records and dense arrays as object identities.
type SnapshotReference = SnapshotRecord | unknown[];

type SnapshotPath = (string | number)[];

const preparedSnapshots = new WeakMap<SnapshotReference, MachineRecordValue>();

const preparedSnapshotFailure = (path: (string | number)[], reason: string) =>
  Failure({
    code: "InvariantViolation",
    path,
    details: { reason },
    summary: "Prepared actor snapshot is invalid",
    help: "Provide a complete snapshot produced for the exact constructed machine.",
  });

type DataPropertyDescriptor = PropertyDescriptor & { value: unknown };

// RETURN_TYPE: Snapshot reflection must narrow data descriptors before reading their values.
const isDataProperty = (
  descriptor: PropertyDescriptor | undefined,
): descriptor is DataPropertyDescriptor => descriptor !== undefined && "value" in descriptor;

// RETURN_TYPE: Enumerable data descriptors are the only reflected values admitted into owned snapshots.
const isEnumerableDataProperty = (
  descriptor: PropertyDescriptor | undefined,
): descriptor is DataPropertyDescriptor =>
  isDataProperty(descriptor) && descriptor.enumerable === true;

const captureSnapshotRecordUnchecked = (value: unknown, path: SnapshotPath) => {
  if (!Predicate.isObject(value)) return Result.fail(preparedSnapshotFailure(path, "record"));
  const prototype = Object.getPrototypeOf(value);

  if (prototype !== Object.prototype && prototype !== null)
    return Result.fail(preparedSnapshotFailure(path, "record"));
  const keys = Reflect.ownKeys(value);
  const stringKeys = keys.filter(Predicate.isString);

  if (stringKeys.length !== keys.length)
    return Result.fail(preparedSnapshotFailure(path, "record-keys"));
  const descriptors = stringKeys.map((key) => Object.getOwnPropertyDescriptor(value, key));

  if (descriptors.some((descriptor) => !isEnumerableDataProperty(descriptor)))
    return Result.fail(preparedSnapshotFailure(path, "data-properties"));

  const captured: SnapshotRecord = {};

  for (const [index, key] of stringKeys.entries()) {
    const descriptor = descriptors[index];

    if (!isEnumerableDataProperty(descriptor))
      return Result.fail(preparedSnapshotFailure([...path, key], "data-properties"));
    Object.defineProperty(captured, key, {
      configurable: true,
      enumerable: true,
      value: descriptor.value,
      writable: true,
    });
  }

  return Result.succeed(captured);
};

const captureSnapshotRecord = (value: unknown, path: SnapshotPath) => {
  const captured = Result.try({
    try: () => captureSnapshotRecordUnchecked(value, path),
    catch: () => preparedSnapshotFailure(path, "reflection"),
  });

  if (Result.isFailure(captured)) return Result.fail(captured.failure);

  return captured.success;
};

// RETURN_TYPE: Array capture must narrow before reading own descriptors.
const isPlainSnapshotArray = (value: unknown): value is unknown[] =>
  Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype;

// RETURN_TYPE: Dense array admission uses the validated length as a numeric bound.
const isSnapshotArrayLength = (value: unknown): value is number =>
  Predicate.isNumber(value) && Number.isSafeInteger(value) && value >= 0 && value <= 0xffff_ffff;

const hasDenseSnapshotArrayKeys = (keys: PropertyKey[], length: number) =>
  keys.length === length + 1 &&
  keys[length] === "length" &&
  keys.slice(0, length).every((key, index) => key === String(index));

const copySnapshotArrayProperties = (value: unknown[], length: number, path: SnapshotPath) => {
  const captured: unknown[] = [];

  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));

    if (!isEnumerableDataProperty(descriptor))
      return Result.fail(preparedSnapshotFailure([...path, index], "data-properties"));
    captured.push(descriptor.value);
  }

  return Result.succeed(captured);
};

const captureSnapshotArray = (value: unknown, path: SnapshotPath) => {
  const captured = Result.try({
    try: () => {
      if (!isPlainSnapshotArray(value))
        return Result.fail(preparedSnapshotFailure(path, "dense-array"));
      const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");

      if (!isDataProperty(lengthDescriptor) || lengthDescriptor.enumerable)
        return Result.fail(preparedSnapshotFailure(path, "dense-array"));
      const length = lengthDescriptor.value;

      if (!isSnapshotArrayLength(length))
        return Result.fail(preparedSnapshotFailure(path, "dense-array"));
      const keys = Reflect.ownKeys(value);

      if (!hasDenseSnapshotArrayKeys(keys, length))
        return Result.fail(preparedSnapshotFailure(path, "dense-array"));

      return copySnapshotArrayProperties(value, length, path);
    },
    catch: () => preparedSnapshotFailure(path, "reflection"),
  });

  if (Result.isFailure(captured)) return Result.fail(captured.failure);

  return captured.success;
};

const hasExactKeys = (
  value: SnapshotRecord,
  // oxlint-disable-next-line anti-slop/no-readonly -- NO_READONLY_CODEMOD: accepts const-inferred key tuples without copying them.
  expected: readonly string[],
) => {
  const keys = Reflect.ownKeys(value);

  return (
    keys.length === expected.length &&
    keys.every((key) => Predicate.isString(key) && expected.includes(key))
  );
};

// RETURN_TYPE: Timer and revision admission rely on the number guard after safe-integer validation.
const isSafeSnapshotInteger = (value: unknown): value is number =>
  Predicate.isNumber(value) && Number.isSafeInteger(value);

const isSafeSnapshotRevision = (value: unknown) =>
  Predicate.isNumber(value) && isSafeSnapshotInteger(value) && value >= 0;

// RETURN_TYPE: Snapshot operation admission requires descriptor identity in the constructed machine.
const isSnapshotOperation = (
  machine: MachineRecordValue,
  value: unknown,
): value is OperationDeclaration =>
  isConstructedOperation(value) &&
  Object.values(machine.definition.operations).some((descriptor) => descriptor === value);

const collectSnapshotIdentities = (machine: MachineRecordValue) => {
  const identities = new WeakSet<SnapshotReference>();
  const visited = new WeakSet<SnapshotReference>();

  const visitStateTable = (value: unknown) => {
    if (!Predicate.isObject(value) || visited.has(value)) return;
    visited.add(value);
    const kind = Object.getOwnPropertyDescriptor(value, "kind");

    if (isDataProperty(kind) && kind.value === "state") {
      identities.add(value);

      return;
    }

    for (const key of Reflect.ownKeys(value)) {
      if (!Predicate.isString(key)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);

      if (isDataProperty(descriptor)) visitStateTable(descriptor.value);
    }
  };

  const visitContextSelector = (
    selector: PropertyDescriptor | undefined,
    visitDefinition: (value: unknown) => void,
  ) => {
    if (!isDataProperty(selector) || !Predicate.isObject(selector.value)) return;
    identities.add(selector.value);
    const provider = Object.getOwnPropertyDescriptor(selector.value, "provider");

    if (isDataProperty(provider)) visitDefinition(provider.value);
  };

  const visitContext = (value: unknown, visitDefinition: (value: unknown) => void) => {
    if (!Predicate.isObject(value)) return;

    for (const key of Reflect.ownKeys(value)) {
      if (!Predicate.isString(key)) continue;
      visitContextSelector(Object.getOwnPropertyDescriptor(value, key), visitDefinition);
    }
  };

  const visitDefinition = (value: unknown) => {
    if (!Predicate.isObject(value) || visited.has(value)) return;
    visited.add(value);
    const stateTable = Object.getOwnPropertyDescriptor(value, "S");

    if (isDataProperty(stateTable)) visitStateTable(stateTable.value);
    const context = Object.getOwnPropertyDescriptor(value, "context");

    if (isDataProperty(context)) visitContext(context.value, visitDefinition);
  };

  visitDefinition(machine.definition);

  return identities;
};

const isSnapshotLeaf = (value: unknown, identities: WeakSet<SnapshotReference>) =>
  value === null ||
  Predicate.isBoolean(value) ||
  Predicate.isString(value) ||
  Predicate.isNumber(value) ||
  Predicate.isBigInt(value) ||
  Predicate.isSymbol(value) ||
  Predicate.isUndefined(value) ||
  Predicate.isFunction(value) ||
  (Predicate.isObjectOrArray(value) && (identities.has(value) || isConstructedOperation(value)));

// RETURN_TYPE: Recursive snapshot copying retains the canonical typed validation failure channel.
const captureSnapshotData = (
  value: unknown,
  path: SnapshotPath,
  identities: WeakSet<SnapshotReference>,
  seen: WeakSet<SnapshotReference>,
): Result.Result<unknown, PublicDiagnostic> => {
  if (isSnapshotLeaf(value, identities)) return Result.succeed(value);

  if (!Predicate.isObjectOrArray(value))
    return Result.fail(preparedSnapshotFailure(path, "unsupported-value"));

  if (seen.has(value)) return Result.fail(preparedSnapshotFailure(path, "cycle"));
  seen.add(value);

  const captured = Array.isArray(value)
    ? captureSnapshotArrayData(value, path, identities, seen)
    : captureSnapshotRecordData(value, path, identities, seen);

  seen.delete(value);

  return captured;
};

// RETURN_TYPE: Recursive snapshot copying retains the canonical typed validation failure channel.
const captureSnapshotArrayData = (
  value: unknown[],
  path: SnapshotPath,
  identities: WeakSet<SnapshotReference>,
  seen: WeakSet<SnapshotReference>,
): Result.Result<unknown[], PublicDiagnostic> => {
  const captured = captureSnapshotArray(value, path);

  if (Result.isFailure(captured)) return captured;
  const owned: unknown[] = [];

  for (const [index, child] of captured.success.entries()) {
    const admitted = captureSnapshotData(child, [...path, index], identities, seen);

    if (Result.isFailure(admitted)) return Result.fail(admitted.failure);
    owned.push(admitted.success);
  }

  return Result.succeed(owned);
};

// RETURN_TYPE: Recursive snapshot copying retains the canonical typed validation failure channel.
const captureSnapshotRecordData = (
  value: SnapshotReference,
  path: SnapshotPath,
  identities: WeakSet<SnapshotReference>,
  seen: WeakSet<SnapshotReference>,
): Result.Result<SnapshotRecord, PublicDiagnostic> => {
  const captured = captureSnapshotRecord(value, path);

  if (Result.isFailure(captured)) return captured;
  const owned: SnapshotRecord = {};

  for (const key of Object.keys(captured.success)) {
    const admitted = captureSnapshotData(captured.success[key], [...path, key], identities, seen);

    if (Result.isFailure(admitted)) return Result.fail(admitted.failure);
    Object.defineProperty(owned, key, {
      configurable: true,
      enumerable: true,
      value: admitted.success,
      writable: true,
    });
  }

  return Result.succeed(owned);
};

// RETURN_TYPE: Snapshot admission narrows decoded values to owned string-keyed records.
const isSnapshotRecord = (value: unknown): value is SnapshotRecord =>
  Predicate.isObject(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const admitSnapshotData = (machine: MachineRecordValue, value: unknown, path: SnapshotPath) => {
  const captured = captureSnapshotData(
    value,
    path,
    collectSnapshotIdentities(machine),
    new WeakSet<SnapshotReference>(),
  );

  if (Result.isFailure(captured)) return Result.fail(captured.failure);
  const decoded = decodeEventPayloadResult(captured.success);

  if (Result.isFailure(decoded))
    return Result.fail(preparedSnapshotFailure(path, "definition-value"));

  if (!isSnapshotRecord(captured.success))
    return Result.fail(preparedSnapshotFailure(path, "record"));

  return Result.succeed(captured.success);
};

// RETURN_TYPE: Operation statuses need a domain predicate after reading external snapshot data.
const isOperationProjectionStatus = (value: unknown): value is OperationProjection["status"] =>
  value === "pending" ||
  value === "running" ||
  value === "succeeded" ||
  value === "failed" ||
  value === "cancelled";

const admitSnapshotOperation = (machine: MachineRecordValue, rawEntry: unknown, index: number) => {
  const entry = captureSnapshotRecord(rawEntry, ["operations", index]);

  if (Result.isFailure(entry) || !hasExactKeys(entry.success, ["descriptor", "key", "status"]))
    return Result.fail(preparedSnapshotFailure(["operations", index], "entry-shape"));

  const descriptor = entry.success.descriptor;

  if (!isSnapshotOperation(machine, descriptor))
    return Result.fail(preparedSnapshotFailure(["operations", index, "descriptor"], "operation"));
  const status = entry.success.status;

  if (!isOperationProjectionStatus(status))
    return Result.fail(preparedSnapshotFailure(["operations", index, "status"], "status"));

  // SAFETY: Operation validation above proves the captured key is the operation-key input accepted by the private projection seam.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the key walker performs the final runtime admission and ownership copy.
  const key = canonicalizeKey(entry.success.key as OperationKey);

  return Result.succeed(copyObject({ descriptor, key, status }));
};

const admitSnapshotOperations = (machine: MachineRecordValue, value: unknown) => {
  const captured = captureSnapshotArray(value, ["operations"]);

  if (Result.isFailure(captured)) return Result.fail(captured.failure);
  const owned: OperationProjection[] = [];

  for (const [index, rawEntry] of captured.success.entries()) {
    const admitted = admitSnapshotOperation(machine, rawEntry, index);

    if (Result.isFailure(admitted)) return Result.fail(admitted.failure);
    owned.push(admitted.success);
  }

  return Result.succeed(owned);
};

// RETURN_TYPE: Validated timer projections expose numeric timestamps after runtime checks.
const admitSnapshotTimers = (
  value: unknown,
): Result.Result<TimerProjection[], PublicDiagnostic> => {
  const captured = captureSnapshotArray(value, ["timers"]);

  if (Result.isFailure(captured)) return Result.fail(captured.failure);
  const expectedKeys = ["name", "startedAt", "dueAt"] as const;
  const owned: TimerProjection[] = [];

  for (const [index, rawEntry] of captured.success.entries()) {
    const entry = captureSnapshotRecord(rawEntry, ["timers", index]);

    if (Result.isFailure(entry) || !hasExactKeys(entry.success, expectedKeys))
      return Result.fail(preparedSnapshotFailure(["timers", index], "entry-shape"));
    const name = entry.success.name;

    if (!Predicate.isString(name))
      return Result.fail(preparedSnapshotFailure(["timers", index, "name"], "name"));
    const startedAt = entry.success.startedAt;
    const dueAt = entry.success.dueAt;

    if (!isSafeSnapshotInteger(startedAt) || !isSafeSnapshotInteger(dueAt))
      return Result.fail(preparedSnapshotFailure(["timers", index], "timestamp"));
    owned.push({ name, startedAt, dueAt });
  }

  return Result.succeed(owned);
};

const admitSnapshotIssues = (value: unknown) => {
  const captured = captureSnapshotArray(value, ["issues"]);

  if (Result.isFailure(captured)) return Result.fail(captured.failure);
  const owned: PublicDiagnostic[] = [];

  for (const [index, issue] of captured.success.entries()) {
    if (
      !(issue instanceof Diagnostic) ||
      Object.getPrototypeOf(issue) !== Diagnostic.prototype ||
      !Schema.is(Diagnostic)(issue)
    )
      return Result.fail(preparedSnapshotFailure(["issues", index], "diagnostic"));
    const decoded = Schema.decodeUnknownResult(Diagnostic)(issue);

    if (Result.isFailure(decoded))
      return Result.fail(preparedSnapshotFailure(["issues", index], "diagnostic"));
    owned.push(decoded.success);
  }

  return Result.succeed(owned);
};

/** Admits and owns one complete prepared snapshot for the exact constructed machine. */
// RETURN_TYPE: This constructor preserves the prepared brand and typed diagnostic failure channel.
export const prepareActorSnapshot = <DefinitionValue extends MachineDefinition>(
  machine: Machine<DefinitionValue>,
  snapshot: unknown,
): Result.Result<PreparedActorSnapshot<DefinitionValue>, PublicDiagnostic> => {
  const admitted = Result.try({
    try: () =>
      Result.gen(function* () {
        if (!isConstructedMachine(machine))
          return yield* Result.fail(preparedSnapshotFailure(["machine"], "constructed-machine"));
        const captured = yield* captureSnapshotRecord(snapshot, []);

        const expectedKeys = [
          "state",
          "memory",
          "context",
          "lifecycle",
          "operations",
          "timers",
          "issues",
          "revision",
          "observedStoreRevision",
        ] as const;

        if (!hasExactKeys(captured, expectedKeys))
          return yield* Result.fail(preparedSnapshotFailure([], "complete-shape"));

        const leaves = Object.values(machine.compiled.states).filter(
          (state) => state.kind === "leaf",
        );

        if (!leaves.some((state) => Object.is(state.state, captured.state)))
          return yield* Result.fail(preparedSnapshotFailure(["state"], "leaf-identity"));

        const memory = yield* admitSnapshotData(machine, captured.memory, ["memory"]);

        if (machine.definition.memory === undefined && !hasExactKeys(memory, []))
          return yield* Result.fail(preparedSnapshotFailure(["memory"], "unexpected-keys"));

        const context = yield* admitSnapshotData(machine, captured.context, ["context"]);
        const contextKeys = Object.keys(machine.definition.context);

        if (!hasExactKeys(context, contextKeys))
          return yield* Result.fail(preparedSnapshotFailure(["context"], "machine-keys"));

        if (captured.lifecycle !== "prepared")
          return yield* Result.fail(preparedSnapshotFailure(["lifecycle"], "prepared"));

        if (!isSafeSnapshotRevision(captured.revision))
          return yield* Result.fail(preparedSnapshotFailure(["revision"], "revision"));

        if (!isSafeSnapshotRevision(captured.observedStoreRevision))
          return yield* Result.fail(preparedSnapshotFailure(["observedStoreRevision"], "revision"));

        const operations = yield* admitSnapshotOperations(machine, captured.operations);
        const timers = yield* admitSnapshotTimers(captured.timers);
        const issues = yield* admitSnapshotIssues(captured.issues);

        // SAFETY: captured data is stable; recursive DefinitionValue, exact machine state, lifecycle, revision, projections, and canonical issue checks establish this complete snapshot shape.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- this is the sole named constructor for the private prepared snapshot brand.
        const owned = copySnapshot({
          state: captured.state,
          memory,
          context,
          lifecycle: captured.lifecycle,
          operations,
          timers,
          issues,
          revision: captured.revision,
          observedStoreRevision: captured.observedStoreRevision,
        } as ActorSnapshot<DefinitionValue>);

        // SAFETY: the WeakMap entry is the runtime brand; the type-only property cannot be forged by callers.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the constructor adds the private prepared snapshot brand.
        const prepared = owned as PreparedActorSnapshot<DefinitionValue>;
        preparedSnapshots.set(prepared, machine);

        return prepared;
      }),
    catch: () => preparedSnapshotFailure([], "reflection"),
  });

  if (Result.isFailure(admitted)) return Result.fail(admitted.failure);

  return Result.isFailure(admitted.success)
    ? Result.fail(admitted.success.failure)
    : Result.succeed(admitted.success.success);
};

/** Verifies the private prepared-snapshot brand without re-admitting caller-shaped data. */
export const verifyPreparedActorSnapshot = <DefinitionValue extends MachineDefinition>(
  machine: Machine<DefinitionValue>,
  snapshot: unknown,
) => {
  if (!isConstructedMachine(machine) || !Predicate.isObject(snapshot))
    return Result.fail(preparedSnapshotFailure([], "brand"));
  const preparedMachine = preparedSnapshots.get(snapshot);

  if (preparedMachine !== machine) return Result.fail(preparedSnapshotFailure([], "brand"));

  // SAFETY: the exact machine-keyed WeakMap membership above is the runtime prepared-snapshot brand.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- restore the private brand after WeakMap validation.
  return Result.succeed(snapshot as PreparedActorSnapshot<DefinitionValue>);
};

// RETURN_TYPE: Store result copies preserve the owner's exact changed-reference domain type.
const copyStoreResult = <DefinitionValue extends MachineDefinition>(
  store: ActorStoreResult<DefinitionValue>,
): ActorStoreResult<DefinitionValue> => {
  const changed = store.changed.map((reference) => ({
    ...reference,
    key: canonicalizeKey(reference.key),
  }));

  return {
    revision: store.revision,
    changed,
  };
};

const isCurrentFence = (current: ActorFence, incoming: ActorFence) =>
  current.key === incoming.key &&
  current.incarnation === incoming.incarnation &&
  current.generation === incoming.generation &&
  current.leaseEpoch === incoming.leaseEpoch;

const projectionOccurrence = (fact: ProjectionFact) => {
  switch (fact._tag) {
    case "completion-projection":
      return fact.completion.fence;
    case "stream-projection":
      return fact.fact.fence;
    case "context-projection":
    case "lifecycle-projection":
    case "store-projection":
    case "timer-projection":
      return undefined;
    default:
      return undefined;
  }
};

/** Fences a trusted command fact before it reaches the turn-planning boundary. */
// RETURN_TYPE: Fence admission preserves the generic command-fact discriminated union.
export const fenceActorFact = <DefinitionValue extends MachineDefinition>(
  current: ActorFence,
  fact: Extract<ActorMailboxFact<DefinitionValue>, { _tag: "command" }>,
): ActorFactDisposition<DefinitionValue> =>
  isCurrentFence(current, fact.fence)
    ? { _tag: "accepted", fact }
    : { _tag: "discarded", reason: "stale-fence" };

const nextRevision = (current: number, path: string[]) => {
  if (!Number.isSafeInteger(current) || current < 0 || current >= Number.MAX_SAFE_INTEGER)
    return Result.fail(
      Failure({
        code: "InvariantViolation",
        path,
        details: { current },
        summary: "Revision counter cannot advance",
        help: "Use a non-negative safe revision below the counter limit.",
      }),
    );

  return Result.succeed(current + 1);
};

type ActorCutCommit<DefinitionValue extends MachineDefinition> =
  | {
      _tag: "event";
      prepare: () => Result.Result<PreparedCut<DefinitionValue>, PublicDiagnostic>;
      commitStore: () => Result.Result<ActorStoreResult<DefinitionValue>, PublicDiagnostic>;
    }
  | {
      _tag: "record";
      prepare: () => Result.Result<PreparedCut<DefinitionValue>, PublicDiagnostic>;
    }
  | {
      _tag: "passive" | "lifecycle";
      publication: ActorCellCut<DefinitionValue>["publication"];
    };

const cutFailure = (diagnostic: PublicDiagnostic, preserveCut = false) => ({
  diagnostic,
  preserveCut,
});

/** The ActorCell's one synchronous store/publication/Journal cut. */
const commitActorCut = <DefinitionValue extends MachineDefinition>(
  cell: ActorCellCut<DefinitionValue>,
  snapshots: PubSub.PubSub<ActorSnapshot<DefinitionValue>>,
  cut: ActorCutCommit<DefinitionValue>,
) => {
  const install = <Publication extends ActorCellCut<DefinitionValue>["publication"]>(
    publication: Publication,
  ) => {
    cell.publication = publication;
    PubSub.publishUnsafe(snapshots, publication.snapshot);

    return publication;
  };

  if (cut._tag === "event") {
    const prepared = cut.prepare();

    if (Result.isFailure(prepared)) return Result.fail(cutFailure(prepared.failure));

    const store = cut.commitStore();

    if (Result.isFailure(store)) {
      if (typeof prepared.success.evidenceSequence !== "number") {
        const cancelled = prepared.success.evidenceSequence.cancel();

        if (Result.isFailure(cancelled)) return Result.fail(cutFailure(cancelled.failure));
      }

      return Result.fail(cutFailure(store.failure));
    }

    if (store.success.revision < cell.publication.snapshot.observedStoreRevision) {
      if (typeof prepared.success.evidenceSequence !== "number") {
        const cancelled = prepared.success.evidenceSequence.cancel();

        if (Result.isFailure(cancelled)) return Result.fail(cutFailure(cancelled.failure));
      }

      return Result.fail(
        cutFailure(
          Failure({
            code: "InvariantViolation",
            path: ["store", "revision"],
            details: {
              revision: store.success.revision,
              previous: cell.publication.snapshot.observedStoreRevision,
            },
            summary: "Store revision would move backwards",
            help: "Commit a monotonic P02 store result before publication.",
          }),
          true,
        ),
      );
    }

    // Final value construction uses only the validated result returned by the store owner.
    const publication = install({
      ...prepared.success.publication,
      snapshot: {
        ...prepared.success.publication.snapshot,
        observedStoreRevision: store.success.revision,
      },
      store: store.success,
    } satisfies ActorPublication<DefinitionValue>);

    const evidenceSequence =
      typeof prepared.success.evidenceSequence === "number"
        ? prepared.success.evidenceSequence
        : prepared.success.evidenceSequence.finalize(publication);

    cell.evidenceSequence = evidenceSequence;

    return Result.succeed({ publication, evidenceSequence });
  }

  if (cut._tag === "record") {
    const prepared = cut.prepare();

    if (Result.isFailure(prepared)) return Result.fail(cutFailure(prepared.failure));

    const publication = install(prepared.success.publication);

    const evidenceSequence =
      typeof prepared.success.evidenceSequence === "number"
        ? prepared.success.evidenceSequence
        : prepared.success.evidenceSequence.finalize(publication);

    cell.evidenceSequence = evidenceSequence;

    return Result.succeed({ publication, evidenceSequence });
  }

  const publication = install(cut.publication);

  return Result.succeed({ publication, evidenceSequence: cell.evidenceSequence });
};

const invokeResult = <Value>(callback: () => Result.Result<Value, PublicDiagnostic>) => {
  const captured = Result.try({
    try: callback,
    catch: (cause) => (cause instanceof Diagnostic ? cause : Defect(cause)),
  });

  if (Result.isFailure(captured)) return Result.fail(captured.failure);

  return captured.success;
};

const storeValueKind = (value: unknown) => {
  if (value === null || Predicate.isObjectOrArray(value)) return "object";

  if (Predicate.isFunction(value)) return "function";

  if (Predicate.isString(value)) return "string";

  if (Predicate.isNumber(value)) return "number";

  if (Predicate.isBoolean(value)) return "boolean";

  if (Predicate.isBigInt(value)) return "bigint";

  if (Predicate.isSymbol(value)) return "symbol";

  return "undefined";
};

/** Copies the result an ActorStore owner returns from one commit. */
export const makeActorStoreResult = <DefinitionValue extends MachineDefinition>(store: unknown) =>
  invokeResult(() => {
    if (!Predicate.isObjectOrArray(store))
      return Result.fail(
        Failure({
          code: "InvariantViolation",
          path: ["store", "result"],
          details: { kind: storeValueKind(store) },
          summary: "Store commit returned an invalid result",
          help: "Return one safe revision and a finite changed-reference list.",
        }),
      );
    // SAFETY: the shape checks below establish the fields needed by the owned result copy.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- runtime admission narrows an external store result.
    const candidate = store as Partial<ActorStoreResult<DefinitionValue>>;
    const revision = candidate.revision;

    if (
      !Predicate.isNumber(revision) ||
      !Number.isSafeInteger(revision) ||
      revision < 0 ||
      !Array.isArray(candidate.changed)
    )
      return Result.fail(
        Failure({
          code: "InvariantViolation",
          path: ["store", "result"],
          details: { revision: revision ?? null },
          summary: "Store commit returned an invalid result",
          help: "Return one safe revision and a finite changed-reference list.",
        }),
      );

    return Result.succeed(copyStoreResult({ revision, changed: candidate.changed }));
  });

const projectionFence = (fact: ProjectionFact) => {
  switch (fact._tag) {
    case "timer-projection":
    case "lifecycle-projection":
      return fact.fence;
    case "completion-projection":
      return fact.completion.fence.actor;
    case "stream-projection":
      return fact.fact.fence.actor;
    case "context-projection":
      return fact.provider.fence;
    case "store-projection":
      return fact.fact.fence;
  }
};

const makeEngine = <DefinitionValue extends MachineDefinition>(
  input: ActorEngineInput<DefinitionValue>,
  mailbox: Queue.Queue<ActorMailboxFact<DefinitionValue>>,
  barrier: Deferred.Deferred<void>,
  setClosed: (failure?: PublicDiagnostic) => void,
  isClosed: () => boolean,
  consumerFiber: ConsumerFiberState,
  state: ActorCellCut<DefinitionValue>,
  snapshots: PubSub.PubSub<ActorSnapshot<DefinitionValue>>,
  pending: Set<Deferred.Deferred<DispatchReceipt, PublicDiagnostic>>,
  drainState: DrainState,
  enqueueCommand: (
    command: ActorCommand<DefinitionValue>,
    acknowledgement: Deferred.Deferred<DispatchReceipt, PublicDiagnostic> | undefined,
    throwOnFailure: boolean,
  ) => boolean,
) => {
  const contextCursors = new Map<string, { fence: ActorFence; revision: number }>();

  const occurrenceCursors = new Map<
    OperationDeclaration,
    Array<{ key: OperationKey; ordinal: number }>
  >();

  const contextProviders = (fact: Extract<ProjectionFact, { _tag: "context-projection" }>) =>
    fact.projection?.providers ?? [fact.provider];

  const acceptsContextRevision = (
    fact: Extract<ProjectionFact, { _tag: "context-projection" }>,
  ) => {
    let changed = false;

    for (const provider of contextProviders(fact)) {
      const current = contextCursors.get(provider.slot);

      if (current === undefined) {
        changed = true;
        continue;
      }

      if (!isCurrentFence(current.fence, provider.fence) || provider.revision < current.revision)
        return false;

      if (provider.revision > current.revision) changed = true;
    }

    return changed;
  };

  const rememberContextRevision = (
    fact: Extract<ProjectionFact, { _tag: "context-projection" }>,
  ) => {
    for (const provider of contextProviders(fact))
      contextCursors.set(provider.slot, {
        fence: provider.fence,
        revision: provider.revision,
      });
  };

  const acceptsOccurrence = (occurrence: OperationOccurrenceFence) => {
    const current = occurrenceCursors
      .get(occurrence.descriptor)
      ?.find((entry) => equalCanonicalKey(entry.key, occurrence.key));

    return current === undefined || occurrence.ordinal > current.ordinal;
  };

  const rememberOccurrence = (occurrence: OperationOccurrenceFence) => {
    const entries = occurrenceCursors.get(occurrence.descriptor) ?? [];
    const index = entries.findIndex((entry) => equalCanonicalKey(entry.key, occurrence.key));
    const next = { key: occurrence.key, ordinal: occurrence.ordinal };

    if (index === -1) entries.push(next);
    else entries[index] = next;
    occurrenceCursors.set(occurrence.descriptor, entries);
  };

  const settleSuccess = (
    acknowledgement: Deferred.Deferred<DispatchReceipt, PublicDiagnostic> | undefined,
    receipt: DispatchReceipt,
  ) => {
    if (acknowledgement !== undefined) {
      pending.delete(acknowledgement);
      Deferred.doneUnsafe(acknowledgement, Effect.succeed(receipt));
    }
  };

  const notifyDrained = () => {
    if (drainState.processing || Queue.sizeUnsafe(mailbox) !== 0) return;
    const waiters = drainState.waiters.splice(0);

    for (const waiter of waiters) Deferred.doneUnsafe(waiter, Effect.succeed(undefined));
  };

  const settleFailure = (
    acknowledgement: Deferred.Deferred<DispatchReceipt, PublicDiagnostic> | undefined,
    failure: PublicDiagnostic,
  ) => {
    if (acknowledgement !== undefined) {
      pending.delete(acknowledgement);
      Deferred.doneUnsafe(acknowledgement, Effect.fail(failure));
    }
  };

  const notifySnapshot = (snapshot: ActorSnapshot<DefinitionValue>, machineTurnRevision: number) =>
    invokeResult(() => {
      input.onSnapshot?.(snapshot, machineTurnRevision);

      return Result.succeed(undefined);
    });

  const evidenceSequenceFor = (
    publication: ActorPublication<DefinitionValue>,
    phase: "prepare" | "accept",
  ) => {
    const accepted =
      input.acceptEvidence === undefined
        ? Result.succeed(undefined)
        : invokeResult(() => input.acceptEvidence!(publication, state.publication.snapshot, phase));

    if (Result.isFailure(accepted)) return Result.fail(accepted.failure);

    return accepted.success === undefined
      ? nextRevision(state.evidenceSequence, ["evidenceSequence"])
      : accepted;
  };

  const validateEvidenceSequence = (sequence: number) => {
    if (!Number.isSafeInteger(sequence) || sequence <= state.evidenceSequence)
      return Result.fail(
        Failure({
          code: "InvariantViolation",
          path: ["evidenceSequence"],
          details: { sequence, previous: state.evidenceSequence },
          summary: "Evidence sequence must advance monotonically",
          help: "Accept evidence with one new positive sequence number.",
        }),
      );

    return Result.succeed(sequence);
  };

  const prepareCut = (
    candidate: ActorSnapshot<DefinitionValue>,
    machineTurnRevision: number,
    cause: TurnCause<DefinitionValue>,
  ) => {
    const publicationRevision = nextRevision(state.publication.snapshot.revision, [
      "publicationRevision",
    ]);

    if (Result.isFailure(publicationRevision)) return Result.fail(publicationRevision.failure);

    const preparedSnapshot = copySnapshot({
      ...candidate,
      revision: publicationRevision.success,
      observedStoreRevision: state.publication.snapshot.observedStoreRevision,
    });

    const publication: ActorPublication<DefinitionValue> = {
      fence: input.fence,
      snapshot: preparedSnapshot,
      store: copyStoreResult({
        revision: state.publication.snapshot.observedStoreRevision,
        changed: [],
      }),
      publicationRevision: publicationRevision.success,
      machineTurnRevision,
      cause,
    };

    const evidenceSequence = evidenceSequenceFor(publication, "prepare");

    if (Result.isFailure(evidenceSequence)) {
      return Result.fail(evidenceSequence.failure);
    }

    const validatedEvidenceSequence =
      typeof evidenceSequence.success === "number"
        ? validateEvidenceSequence(evidenceSequence.success)
        : evidenceSequence;

    if (Result.isFailure(validatedEvidenceSequence)) {
      if (typeof evidenceSequence.success !== "number") evidenceSequence.success.cancel();

      return Result.fail(validatedEvidenceSequence.failure);
    }

    return Result.succeed({
      publication,
      evidenceSequence: validatedEvidenceSequence.success,
    });
  };

  const publishCut = (
    candidate: ActorSnapshot<DefinitionValue>,
    machineTurnRevision: number,
    store: ActorStoreResult<DefinitionValue>,
    cause: TurnCause<DefinitionValue>,
  ) =>
    commitActorCut(state, snapshots, {
      _tag: "record",
      prepare: () => {
        const publicationRevision = nextRevision(state.publication.snapshot.revision, [
          "publicationRevision",
        ]);

        if (Result.isFailure(publicationRevision)) return Result.fail(publicationRevision.failure);

        if (
          !Number.isSafeInteger(store.revision) ||
          store.revision < state.publication.snapshot.observedStoreRevision
        )
          return Result.fail(
            Failure({
              code: "InvariantViolation",
              path: ["store", "revision"],
              details: {
                revision: store.revision,
                previous: state.publication.snapshot.observedStoreRevision,
              },
              summary: "Store revision would move backwards",
              help: "Commit a monotonic P02 store result before publication.",
            }),
          );

        const snapshot = copySnapshot({
          ...candidate,
          revision: publicationRevision.success,
          observedStoreRevision: store.revision,
        });

        const publication: ActorPublication<DefinitionValue> = {
          fence: input.fence,
          snapshot,
          store: copyStoreResult(store),
          publicationRevision: snapshot.revision,
          machineTurnRevision,
          cause,
        };

        const evidenceSequence = evidenceSequenceFor(publication, "prepare");

        if (Result.isFailure(evidenceSequence)) return Result.fail(evidenceSequence.failure);

        const validatedEvidenceSequence =
          typeof evidenceSequence.success === "number"
            ? validateEvidenceSequence(evidenceSequence.success)
            : evidenceSequence;

        if (Result.isFailure(validatedEvidenceSequence)) {
          if (typeof evidenceSequence.success !== "number") evidenceSequence.success.cancel();

          return Result.fail(validatedEvidenceSequence.failure);
        }

        return Result.succeed({
          publication,
          evidenceSequence: validatedEvidenceSequence.success,
        });
      },
    });

  const publishIssue = (failure: PublicDiagnostic, cause: TurnCause<DefinitionValue>) =>
    publishCut(
      { ...state.publication.snapshot, issues: [failure] },
      state.publication.machineTurnRevision,
      { revision: state.publication.snapshot.observedStoreRevision, changed: [] },
      cause,
    );

  const publishPassive = (candidate: ActorSnapshot<DefinitionValue>) => {
    const revision = nextRevision(state.publication.snapshot.revision, ["publicationRevision"]);

    if (Result.isFailure(revision)) return Result.fail(revision.failure);

    const snapshot = copySnapshot({
      ...candidate,
      revision: revision.success,
    });

    commitActorCut(state, snapshots, {
      _tag: "passive",
      publication: {
        ...state.publication,
        snapshot,
        publicationRevision: snapshot.revision,
      },
    });

    return Result.succeed(snapshot);
  };

  const acknowledgeIssue = (
    acknowledgement: Deferred.Deferred<DispatchReceipt, PublicDiagnostic> | undefined,
    failure: PublicDiagnostic,
    cause: TurnCause<DefinitionValue>,
  ) =>
    Effect.gen(function* () {
      const published = publishIssue(failure, cause);

      if (Result.isFailure(published)) {
        setClosed(published.failure.diagnostic);

        return yield* Effect.fail(published.failure.diagnostic);
      }

      settleFailure(acknowledgement, failure);

      const observed = notifySnapshot(
        published.success.publication.snapshot,
        published.success.publication.machineTurnRevision,
      );

      if (Result.isFailure(observed)) {
        setClosed(observed.failure);

        return yield* Effect.fail(observed.failure);
      }
    });

  const storeResultFor = (actions: MachineAction<DefinitionValue>[]) => {
    if (input.store === undefined)
      return Result.succeed({
        revision: state.publication.snapshot.observedStoreRevision,
        changed: [],
      });
    const result = invokeResult(() => input.store!.commit(actions));

    if (Result.isFailure(result)) return Result.fail(result.failure);

    return Result.succeed(result.success);
  };

  const processPlan = (
    plan: TurnPlan<DefinitionValue>,
    acknowledgement: Deferred.Deferred<DispatchReceipt, PublicDiagnostic> | undefined,
  ) => {
    if (plan._tag === "noop") {
      settleSuccess(acknowledgement, {
        publicationRevision: state.publication.snapshot.revision,
        evidenceSequence: state.evidenceSequence,
      });

      return Effect.succeed(true);
    }

    if (plan._tag === "projection-plan") {
      const passive =
        plan.cause.fact._tag === "store-projection" ||
        (plan.cause.fact._tag === "context-projection" && plan.candidate.issues.length === 0);

      const projected: Result.Result<ActorSnapshot<DefinitionValue>, PublicDiagnostic> = passive
        ? publishPassive(plan.candidate)
        : (() => {
            const committed = publishCut(
              plan.candidate,
              state.publication.machineTurnRevision,
              { revision: plan.candidate.observedStoreRevision, changed: [] },
              plan.cause,
            );

            return Result.isFailure(committed)
              ? Result.fail(committed.failure.diagnostic)
              : Result.succeed(committed.success.publication.snapshot);
          })();

      if (Result.isFailure(projected)) {
        setClosed(projected.failure);

        return Effect.fail(projected.failure);
      }

      const observed = notifySnapshot(projected.success, state.publication.machineTurnRevision);

      if (Result.isFailure(observed)) {
        setClosed(observed.failure);

        return Effect.fail(observed.failure);
      }

      return Effect.succeed(false);
    }

    const publicationRevision = nextRevision(state.publication.snapshot.revision, [
      "publicationRevision",
    ]);

    const machineTurnRevision = nextRevision(state.publication.machineTurnRevision, [
      "machineTurnRevision",
    ]);

    if (Result.isFailure(publicationRevision))
      return acknowledgeIssue(acknowledgement, publicationRevision.failure, plan.cause).pipe(
        Effect.as(false),
      );

    if (Result.isFailure(machineTurnRevision))
      return acknowledgeIssue(acknowledgement, machineTurnRevision.failure, plan.cause).pipe(
        Effect.as(false),
      );

    const actions = plan.actions.map((intent) => intent.action);

    const published = commitActorCut(state, snapshots, {
      _tag: "event",
      prepare: () =>
        prepareCut({ ...plan.candidate, issues: [] }, machineTurnRevision.success, plan.cause),
      commitStore: () => storeResultFor(actions),
    });

    if (Result.isFailure(published)) {
      if (published.failure.preserveCut) {
        settleFailure(acknowledgement, published.failure.diagnostic);

        return Effect.succeed(false);
      }

      return acknowledgeIssue(acknowledgement, published.failure.diagnostic, plan.cause).pipe(
        Effect.as(false),
      );
    }

    settleSuccess(acknowledgement, {
      publicationRevision: published.success.publication.publicationRevision,
      evidenceSequence: published.success.evidenceSequence,
    });

    const observed = notifySnapshot(
      published.success.publication.snapshot,
      published.success.publication.machineTurnRevision,
    );

    if (Result.isFailure(observed)) {
      setClosed(observed.failure);

      return Effect.fail(observed.failure);
    }

    for (const mappedEvent of plan.mappedEvents) enqueueCommand(mappedEvent, undefined, true);

    return Effect.succeed(true);
  };

  const processCommand = (
    fact: Extract<ActorMailboxFact<DefinitionValue>, { _tag: "command" }>,
  ) => {
    const planned = planTurn({
      _tag: "event",
      machine: input.machine ?? input.identity.ref.machine,
      snapshot: state.publication.snapshot,
      event: fact.command,
      fence: input.fence,
    });

    if (Result.isFailure(planned))
      return acknowledgeIssue(fact.acknowledgement, planned.failure, {
        _tag: "event",
        event: fact.command,
      });

    return processPlan(planned.success, fact.acknowledgement).pipe(
      Effect.flatMap((runUserWork) =>
        runUserWork && input.onCommand !== undefined
          ? Scope.provide(input.scope)(input.onCommand(fact.command))
          : Effect.void,
      ),
    );
  };

  const processProjection = (
    fact: Extract<ActorMailboxFact<DefinitionValue>, { _tag: "projection" }>,
  ) => {
    if (fact.fact._tag === "context-projection" && !acceptsContextRevision(fact.fact))
      return Effect.void;
    const occurrence = projectionOccurrence(fact.fact);

    if (occurrence !== undefined && !acceptsOccurrence(occurrence)) return Effect.void;

    const planned = planTurn({
      _tag: "projection",
      snapshot: state.publication.snapshot,
      fact: fact.fact,
      fence: input.fence,
    });

    if (Result.isFailure(planned))
      return Effect.gen(function* () {
        const published = publishIssue(planned.failure, {
          _tag: "projection",
          fact: fact.fact,
        });

        if (Result.isFailure(published)) return yield* Effect.fail(published.failure.diagnostic);

        const observed = notifySnapshot(
          published.success.publication.snapshot,
          published.success.publication.machineTurnRevision,
        );

        if (Result.isFailure(observed)) {
          setClosed(observed.failure);

          return yield* Effect.fail(observed.failure);
        }
      });

    return processPlan(planned.success, undefined).pipe(
      Effect.map(() => {
        if (fact.fact._tag === "context-projection") rememberContextRevision(fact.fact);

        if (occurrence !== undefined) rememberOccurrence(occurrence);
      }),
    );
  };

  const consume = Effect.gen(function* () {
    yield* Deferred.await(barrier);
    yield* Effect.forever(
      Effect.gen(function* () {
        const fact = yield* Queue.take(mailbox);
        drainState.processing = true;

        if (fact._tag === "command") {
          const disposition = fenceActorFact(input.fence, fact);

          if (disposition._tag === "accepted") yield* processCommand(disposition.fact);
          else
            settleSuccess(fact.acknowledgement, {
              publicationRevision: state.publication.snapshot.revision,
              evidenceSequence: state.evidenceSequence,
            });
        } else if (isCurrentFence(input.fence, fact.fence)) {
          yield* processProjection(fact);
        }
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            drainState.processing = false;
            notifyDrained();
          }),
        ),
      ),
    );
  });

  const dispatch = (command: ActorCommand<DefinitionValue>) => {
    const completion = Deferred.makeUnsafe<DispatchReceipt, PublicDiagnostic>();
    const admitted = enqueueCommand(command, completion, false);

    if (!admitted) return { admitted: false, completion };
    pending.add(completion);

    return { admitted: true, completion };
  };

  const dispatchFact = (fact: ProjectionFact) => {
    if (isClosed()) return Result.fail(mailboxAdmissionFailure("closed"));

    const offered = Queue.offerUnsafe(mailbox, {
      _tag: "projection",
      fence: fact._tag === "context-projection" ? input.fence : projectionFence(fact),
      fact,
    });

    return offered ? Result.succeed(undefined) : Result.fail(mailboxAdmissionFailure("full"));
  };

  const drain = () =>
    Effect.gen(function* () {
      if (!drainState.processing && Queue.sizeUnsafe(mailbox) === 0) return;
      const waiter = yield* Deferred.make<void>();
      drainState.waiters.push(waiter);
      yield* Deferred.await(waiter);
    });

  const preflightLifecyclePublication = (initial: boolean) => {
    if (initial) return Result.succeed(undefined);
    const revision = nextRevision(state.publication.snapshot.revision, ["publicationRevision"]);

    return Result.isFailure(revision) ? Result.fail(revision.failure) : Result.succeed(undefined);
  };

  const commitLifecyclePublication = (lifecycle: ActorLifecycle, initial: boolean) => {
    const machineTurnRevision = state.publication.machineTurnRevision;

    const revision = initial
      ? Result.succeed(state.publication.snapshot.revision)
      : nextRevision(state.publication.snapshot.revision, ["publicationRevision"]);

    if (Result.isFailure(revision)) return Result.fail(revision.failure);

    const snapshot = copySnapshot({
      ...state.publication.snapshot,
      lifecycle,
      revision: revision.success,
    });

    commitActorCut(state, snapshots, {
      _tag: "lifecycle",
      publication: {
        ...state.publication,
        snapshot,
        publicationRevision: snapshot.revision,
      },
    });

    return Result.succeed({
      publicationRevision: snapshot.revision,
      machineTurnRevision,
      notify: initial
        ? () => Result.succeed(undefined)
        : () => notifySnapshot(snapshot, machineTurnRevision),
    });
  };

  const shutdownEffect = () =>
    Scope.provide(input.scope)(
      Effect.gen(function* () {
        setClosed();
        const fiber = consumerFiber.current;

        if (fiber !== undefined) {
          const currentFiber = yield* Effect.fiber;

          if (fiber !== currentFiber) {
            yield* Fiber.interrupt(fiber);
            yield* Fiber.await(fiber);
          }
        }

        yield* Queue.shutdown(mailbox);
        yield* PubSub.shutdown(snapshots);
        notifyDrained();
      }),
    );

  const engine = {
    ref: input.identity.ref,
    fence: input.fence,
    machineTurnRevision: () => state.publication.machineTurnRevision,
    snapshot: () => state.publication.snapshot,
    preflightLifecyclePublication,
    commitLifecyclePublication,
    send: (command: ActorCommand<DefinitionValue>) => {
      enqueueCommand(command, undefined, true);
    },
    dispatch,
    dispatchFact,
    snapshots: Stream.fromPubSub(snapshots),
    drain,
    shutdown: shutdownEffect,
  } satisfies ActorEngine<DefinitionValue>;

  return { engine, consume };
};

/** Prepares one bounded real mailbox without starting a consumer or user work. */
// RETURN_TYPE: This boundary exposes the prepared phase and its typed diagnostic channel.
export const prepareActorEngine = <DefinitionValue extends MachineDefinition>(
  input: ActorEngineInput<DefinitionValue>,
  options?: { capacity?: number },
): Effect.Effect<PreparedActorEngine<DefinitionValue>, PublicDiagnostic> =>
  Effect.gen(function* () {
    const admittedInitial = verifyPreparedActorSnapshot(
      input.machine ?? input.identity.ref.machine,
      input.initial,
    );

    if (Result.isFailure(admittedInitial)) return yield* Effect.fail(admittedInitial.failure);
    const initialMachineTurnRevision = input.initialMachineTurnRevision ?? 0;

    if (
      !Number.isSafeInteger(initialMachineTurnRevision) ||
      initialMachineTurnRevision < 0 ||
      initialMachineTurnRevision > admittedInitial.success.revision
    )
      return yield* Effect.fail(preparedSnapshotFailure(["machineTurnRevision"], "revision"));

    const requestedCapacity = options?.capacity ?? ACTOR_MAILBOX_CAPACITY;

    if (!Number.isSafeInteger(requestedCapacity) || requestedCapacity < ACTOR_MAILBOX_CAPACITY) {
      return yield* Effect.die(
        new RangeError(`Actor mailbox capacity must be at least ${ACTOR_MAILBOX_CAPACITY}`),
      );
    }

    const mailbox = yield* Queue.bounded<ActorMailboxFact<DefinitionValue>>(requestedCapacity);
    const barrier = yield* Deferred.make<void>();
    const snapshots = yield* PubSub.unbounded<ActorSnapshot<DefinitionValue>>({ replay: 1 });
    const initial = copySnapshot(admittedInitial.success);
    PubSub.publishUnsafe(snapshots, initial);

    const state: ActorCellCut<DefinitionValue> = {
      publication: {
        fence: input.fence,
        snapshot: initial,
        store: { revision: initial.observedStoreRevision, changed: [] },
        publicationRevision: initial.revision,
        machineTurnRevision: initialMachineTurnRevision,
      },
      evidenceSequence: 0,
    };

    if (input.actorCell !== undefined) input.actorCell.cut = state;

    const pending = new Set<Deferred.Deferred<DispatchReceipt, PublicDiagnostic>>();
    const drainState: DrainState = { processing: false, waiters: [] };
    let closed = false;
    const consumerFiber: ConsumerFiberState = { current: undefined, exit: undefined };

    const settlePending = (failure: PublicDiagnostic = shutdownFailure()) => {
      for (const acknowledgement of pending)
        Deferred.doneUnsafe(acknowledgement, Effect.fail(failure));
      pending.clear();
    };

    const setClosed = (failure: PublicDiagnostic = shutdownFailure()) => {
      if (closed) return;
      closed = true;
      clearMailbox(mailbox);
      settlePending(failure);
      Queue.failCauseUnsafe(mailbox, Cause.die(mailboxAdmissionFailure("closed")));
    };

    const isClosed = () => closed;

    const enqueueCommand = (
      command: ActorCommand<DefinitionValue>,
      acknowledgement: Deferred.Deferred<DispatchReceipt, PublicDiagnostic> | undefined,
      throwOnFailure: boolean,
    ) => {
      let failure: PublicDiagnostic | undefined;

      if (!isEventForMachine(input.machine ?? input.identity.ref.machine, command))
        failure = foreignEventFailure();
      else if (closed) failure = mailboxAdmissionFailure("closed");
      else if (
        !Queue.offerUnsafe(
          mailbox,
          acknowledgement === undefined
            ? { _tag: "command", fence: input.fence, command }
            : { _tag: "command", fence: input.fence, command, acknowledgement },
        )
      )
        failure = mailboxAdmissionFailure("full");

      if (failure === undefined) return true;

      if (acknowledgement !== undefined) Deferred.doneUnsafe(acknowledgement, Effect.fail(failure));

      if (throwOnFailure) {
        // oxlint-disable-next-line anti-slop/no-throw-in-effect-gen -- synchronous send must report admission failure immediately.
        throw failure;
      }

      return false;
    };

    yield* Scope.addFinalizer(input.scope, PubSub.shutdown(snapshots));
    yield* Scope.addFinalizer(
      input.scope,
      Effect.sync(() => {
        setClosed();
      }),
    );

    const activation = yield* Effect.cached(
      Scope.provide(input.scope)(
        Effect.gen(function* () {
          if (closed) return yield* Effect.fail(mailboxAdmissionFailure("closed"));

          const { engine, consume } = makeEngine(
            input,
            mailbox,
            barrier,
            setClosed,
            isClosed,
            consumerFiber,
            state,
            snapshots,
            pending,
            drainState,
            enqueueCommand,
          );

          const fiber = yield* consume.pipe(Effect.forkScoped({ startImmediately: true }));
          consumerFiber.current = fiber;
          yield* Effect.gen(function* () {
            const exit = yield* Fiber.await(fiber);
            consumerFiber.exit = exit;

            if (Exit.isFailure(exit)) setClosed();
          }).pipe(Effect.forkScoped({ startImmediately: true }));
          yield* Deferred.succeed(barrier, undefined);

          return engine;
        }),
      ),
    );

    const activate = () => activation;

    const dispatch = (command: ActorCommand<DefinitionValue>) => {
      const completion = Deferred.makeUnsafe<DispatchReceipt, PublicDiagnostic>();
      const admitted = enqueueCommand(command, completion, false);

      if (!admitted) return { admitted: false, completion };
      pending.add(completion);

      return { admitted: true, completion };
    };

    return {
      phase: "prepared",
      send: (command) => {
        enqueueCommand(command, undefined, true);
      },
      dispatch,
      activate,
      abandon: () => {
        if (closed) return;
        setClosed();
      },
    };
  });

/** The public actor projection contains only identity and synchronous command admission. */
// RETURN_TYPE: This boundary intentionally exposes only the minimal actor handle shape.
export const actorHandle = <DefinitionValue extends MachineDefinition>(
  engine: ActorEngine<DefinitionValue>,
): ActorHandle<DefinitionValue> => ({
  ref: engine.ref,
  send: engine.send,
});
