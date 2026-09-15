// oxlint-disable-next-line anti-slop/no-large-production-file -- actor admission owns identity, validation, transaction stages, leases, and rollback at one boundary.
import {
  Cause,
  Deferred,
  Effect,
  Exit,
  Option,
  Predicate,
  Result,
  Schema,
  SchemaIssue,
} from "effect";

import { Failure, fromSchemaError, type PublicDiagnostic } from "../diagnostic/diagnostic.js";
import { appPlan, isConstructedApp, isOwnedMachineFactsFor, type App } from "../app/app.js";
import type { ContextOf, InputOf, SelectorInput } from "../definition/domain.js";
import { isAuthoredName } from "../internal/authored-name.js";
import { isStableDataDescriptor, isStableKeyList } from "../internal/stable-observation.js";
import { isConstructedMachine, type Machine, type MachineRecordValue } from "../machine/machine.js";
import type { MachineDefinition } from "../machine/grammar.js";
import type { ActorRef } from "./actor-ref.js";
import type { ActorEngine, PreparedActorEngine, PreparedActorSnapshot } from "./actor-engine.js";
import type { ActiveContextBaseline } from "./context-wave.js";
import { copyArray, copyObject } from "./collection-copies.js";

declare const actorKeyBrand: unique symbol;

declare const actorIncarnationBrand: unique symbol;

declare const localActorRefBrand: unique symbol;

/** Runtime-local stable identity shared by the later actor graphs. */
export type ActorKey = string & { [actorKeyBrand]: void };

/** One-based runtime-local actor lifetime token. */
export type ActorIncarnation = number & { [actorIncarnationBrand]: void };

/** The stable ref, key, lifetime, and lease fence for one actor admission. */
export type ActorIdentity<DefinitionValue extends MachineDefinition = MachineDefinition> = {
  ref: ActorRef<Machine<DefinitionValue>>;
  key: ActorKey;
  incarnation: ActorIncarnation;
  leaseEpoch: number;
};

/** A local ref is created only by this registry and has no durable address input. */
export type LocalActorRef<DefinitionValue extends MachineDefinition = MachineDefinition> = ActorRef<
  Machine<DefinitionValue>,
  string,
  false
> & {
  [localActorRefBrand]: void;
};

export type LocalActorIdentity<DefinitionValue extends MachineDefinition> = Omit<
  ActorIdentity<DefinitionValue>,
  "ref"
> & {
  ref: LocalActorRef<DefinitionValue>;
};

/** Terminal identity evidence retained by the owning runtime. */
export type ActorTombstone = {
  key: ActorKey;
  incarnation: ActorIncarnation;
  disposedAtSequence: number;
};

export type ActorRegistryEntry<
  DefinitionValue extends MachineDefinition = MachineDefinition,
  Actor = unknown,
> = {
  identity: ActorIdentity<DefinitionValue>;
  actor: Actor;
};

/** Identity and revision fence retained for one provider binding. */
export type ActorFence = {
  key: ActorKey;
  incarnation: ActorIncarnation;
  generation: number;
  leaseEpoch: number;
};

/** Exact selected context value for one consumer slot. */
export type ActorContextValue<
  DefinitionValue extends MachineDefinition,
  Slot extends keyof ContextOf<DefinitionValue> & string = keyof ContextOf<DefinitionValue> &
    string,
> = ContextOf<DefinitionValue>[Slot];

/** Passive provider snapshot supplied to a context selector at attachment time. */
export type ActorContextSnapshot<ProviderDefinition extends MachineDefinition> =
  SelectorInput<ProviderDefinition>;

/** One fixed consumer slot and its exact provider identity. */
export type ActorContextBinding<
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
  Slot extends keyof ContextOf<ConsumerDefinition> & string = keyof ContextOf<ConsumerDefinition> &
    string,
  ProviderRef extends ActorRef<Machine<ProviderDefinition>> = ActorRef<Machine<ProviderDefinition>>,
> = Slot extends keyof ContextOf<ConsumerDefinition> & string
  ? {
      slot: Slot;
      provider: ProviderRef;
      providerFence: ActorFence;
      select: (
        input: ActorContextSnapshot<ProviderDefinition>,
      ) => ActorContextValue<ConsumerDefinition, Slot>;
    }
  : never;

/** Logical dependency edge; it carries no ownership or command capability. */
export type ActorDependencyEdge = {
  consumer: ActorKey;
  provider: ActorKey;
  slot: string;
};

/** TODO: eliminate unknown type and use or build generics in other modules that can make these types more concrete
 *  any use of these types should rely on concrete type information as source of truth
 *  and avoid writing super defensive code when information can be inferred.
 * */
/** Exact values crossing the single structural unknown-input decoder. */
export type ActorAdmissionEnvelope = {
  app: unknown;
  implementation: unknown;
  ref: unknown;
  input: unknown;
  bindings: unknown[];
  dependencies: unknown[];
};

/** Pure graph views published to the next admission stage. */
export type ActorDependencyGraph = {
  forward: Map<ActorKey, ActorDependencyEdge[]>;
  reverse: Map<ActorKey, ActorDependencyEdge[]>;
  order: ActorKey[];
};

/** TODO: eliminate unknown type and use or build generics in other modules that can make these types more concrete  */
type EnvelopeRecord = {
  app?: unknown;
  implementation?: unknown;
  ref?: unknown;
  input?: unknown;
  bindings?: unknown;
  dependencies?: unknown;
};

type EnvelopeCaptureFailure = {
  path: (string | number)[];
  message: string;
};

type ReflectionPrototype = Exclude<WeakKey, symbol>;

type CapturedReflection = {
  prototype: ReflectionPrototype | null;
  keys: PropertyKey[];
  values: Map<PropertyKey, unknown>;
  enumerable: Set<PropertyKey>;
};

const reflectionPathSegment = (key: PropertyKey) => (Predicate.isSymbol(key) ? String(key) : key);

// RETURN_TYPE: Maps reflective failures into the diagnostic path contract without inspecting the thrown cause.
const reflectionFailure = (path: (string | number)[]): EnvelopeCaptureFailure => ({
  path,
  message: "Admission reflection failed",
});

const admissionReflectionDiagnostic = (): PublicDiagnostic =>
  Failure({
    code: "SchemaValidation",
    path: ["actorAdmission"],
    details: { reason: "reflection" },
    summary: "Actor admission reflection failed.",
    help: "Provide stable ordinary admission records.",
  });

// RETURN_TYPE: Captures every reflective operation once at the admission boundary and reports hostile traps as data.
const captureReflection = (
  value: unknown,
  path: (string | number)[],
): Result.Result<CapturedReflection, EnvelopeCaptureFailure> => {
  const captured = Result.try({
    try: () => {
      if (!Array.isArray(value) && !Predicate.isObject(value))
        return Result.fail({ path, message: "Admission value must be an object" });

      const prototype = Object.getPrototypeOf(value);
      const repeatedPrototype = Object.getPrototypeOf(value);

      if (prototype !== repeatedPrototype)
        return Result.fail({ path, message: "Admission value changed its prototype" });

      const keys = Reflect.ownKeys(value);
      const repeatedKeys = Reflect.ownKeys(value);

      if (!isStableKeyList(keys, repeatedKeys))
        return Result.fail({ path, message: "Admission value changed its own keys" });

      const values = new Map<PropertyKey, unknown>();
      const enumerable = new Set<PropertyKey>();

      for (const key of repeatedKeys) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        const repeatedDescriptor = Object.getOwnPropertyDescriptor(value, key);

        if (
          descriptor === undefined ||
          repeatedDescriptor === undefined ||
          !isStableDataDescriptor(descriptor, repeatedDescriptor)
        ) {
          return Result.fail({
            path: [...path, reflectionPathSegment(key)],
            message: "Admission value contains an unstable or accessor property",
          });
        }

        // oxlint-disable-next-line anti-slop/no-reflect-get -- the key is hostile input captured by this reflection owner.
        const read = Reflect.get(value, key);

        if (!Object.is(read, repeatedDescriptor.value)) {
          return Result.fail({
            path: [...path, reflectionPathSegment(key)],
            message: "Admission value changed during property read",
          });
        }

        values.set(key, read);

        if (repeatedDescriptor.enumerable) enumerable.add(key);
      }

      return Result.succeed({ prototype, keys: repeatedKeys, values, enumerable });
    },
    catch: () => reflectionFailure(path),
  });

  if (Result.isFailure(captured)) return Result.fail(captured.failure);

  return captured.success;
};

const captureAdmissionReflection = (
  value: unknown,
): Result.Result<CapturedReflection, PublicDiagnostic> => {
  const captured = captureReflection(value, []);

  if (Result.isFailure(captured)) return Result.fail(admissionReflectionDiagnostic());

  return Result.succeed(captured.success);
};

// RETURN_TYPE: Keeps the complete caller record behind one stable structural read before typed admission.
export const captureAdmissionRecord = (
  value: unknown,
  // oxlint-disable-next-line anti-slop/no-readonly -- NO_READONLY_CODEMOD: accepts const-inferred key tuples without requiring a caller copy.
  requiredKeys: readonly string[],
  // oxlint-disable-next-line anti-slop/no-readonly -- NO_READONLY_CODEMOD: accepts const-inferred key tuples without requiring a caller copy.
  optionalKeys: readonly string[] = [],
): Result.Result<Map<PropertyKey, unknown>, PublicDiagnostic> => {
  const captured = captureAdmissionReflection(value);

  if (Result.isFailure(captured)) return Result.fail(captured.failure);
  const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);

  if (
    (captured.success.prototype !== Object.prototype && captured.success.prototype !== null) ||
    captured.success.keys.some((key) => !Predicate.isString(key) || !allowedKeys.has(key)) ||
    requiredKeys.some((key) => !captured.success.values.has(key))
  )
    return Result.fail(admissionReflectionDiagnostic());

  return Result.succeed(new Map(captured.success.values));
};

// RETURN_TYPE: Captures one capability property without permitting a later source-object reread.
export const captureAdmissionProperty = (
  value: unknown,
  key: string,
): Result.Result<unknown, PublicDiagnostic> => {
  const captured = captureAdmissionReflection(value);

  if (Result.isFailure(captured)) return Result.fail(captured.failure);

  if (!captured.success.values.has(key)) return Result.fail(admissionReflectionDiagnostic());

  return Result.succeed(captured.success.values.get(key));
};

const hasExactPlainKeys = (captured: CapturedReflection, expected: string[]) =>
  (captured.prototype === Object.prototype || captured.prototype === null) &&
  captured.keys.length === expected.length &&
  captured.keys.every(Predicate.isString) &&
  expected.every((key) => captured.keys.includes(key));

const captureEnvelopeArray = (
  value: unknown,
  path: (string | number)[],
): Result.Result<unknown[], EnvelopeCaptureFailure> => {
  const captured = captureReflection(value, path);

  if (Result.isFailure(captured)) return Result.fail(captured.failure);

  if (captured.success.prototype !== Array.prototype)
    return Result.fail({ path, message: "Admission envelope collection must be an array" });

  const length = captured.success.values.get("length");

  if (
    !Predicate.isNumber(length) ||
    !Number.isSafeInteger(length) ||
    length < 0 ||
    length > 0xffff_ffff
  ) {
    return Result.fail({ path, message: "Admission envelope collection must be a dense array" });
  }

  const expectedKeys = length + 1;

  if (
    captured.success.keys.length !== expectedKeys ||
    captured.success.keys.every((key, index) =>
      index === length ? key === "length" : key === String(index),
    ) === false
  ) {
    return Result.fail({ path, message: "Admission envelope collection must be dense" });
  }

  const capturedValues: unknown[] = [];

  for (let index = 0; index < length; index += 1) {
    const key = String(index);

    if (!captured.success.values.has(key) || !captured.success.enumerable.has(key)) {
      return Result.fail({
        path: [...path, index],
        message: "Admission envelope collection contains an invalid entry",
      });
    }

    capturedValues.push(captured.success.values.get(key));
  }

  return Result.succeed(capturedValues);
};

const captureEnvelope = (
  value: unknown,
): Result.Result<ActorAdmissionEnvelope, EnvelopeCaptureFailure> => {
  const captured = captureReflection(value, []);

  if (Result.isFailure(captured)) return Result.fail(captured.failure);

  if (
    (captured.success.prototype !== Object.prototype && captured.success.prototype !== null) ||
    captured.success.keys.some((key) => !Predicate.isString(key))
  )
    return Result.fail({ path: [], message: "Admission envelope must be a plain record" });

  const expectedKeys = [
    "app",
    "implementation",
    "ref",
    "input",
    "bindings",
    "dependencies",
  ] as const;

  if (
    captured.success.keys.length !== expectedKeys.length ||
    expectedKeys.some((key) => !captured.success.keys.includes(key))
  ) {
    return Result.fail({
      path: [],
      message:
        "Admission envelope must contain exactly app, implementation, ref, input, bindings, dependencies",
    });
  }

  const read = (name: keyof EnvelopeRecord): Result.Result<unknown, EnvelopeCaptureFailure> => {
    if (!captured.success.values.has(name)) {
      return Result.fail({
        path: [name],
        message: `Admission envelope field is invalid: ${name}`,
      } satisfies EnvelopeCaptureFailure);
    }

    return Result.succeed(captured.success.values.get(name));
  };

  const app = read("app");

  if (Result.isFailure(app)) return Result.fail(app.failure);
  const implementation = read("implementation");

  if (Result.isFailure(implementation)) return Result.fail(implementation.failure);
  const ref = read("ref");

  if (Result.isFailure(ref)) return Result.fail(ref.failure);
  const input = read("input");

  if (Result.isFailure(input)) return Result.fail(input.failure);
  const bindings = read("bindings");

  if (Result.isFailure(bindings)) return Result.fail(bindings.failure);
  const dependencies = read("dependencies");

  if (Result.isFailure(dependencies)) return Result.fail(dependencies.failure);

  const capturedBindings = captureEnvelopeArray(bindings.success, ["bindings"]);

  if (Result.isFailure(capturedBindings)) return Result.fail(capturedBindings.failure);
  const capturedDependencies = captureEnvelopeArray(dependencies.success, ["dependencies"]);

  if (Result.isFailure(capturedDependencies)) return Result.fail(capturedDependencies.failure);

  return Result.succeed({
    app: app.success,
    implementation: implementation.success,
    ref: ref.success,
    input: input.success,
    bindings: capturedBindings.success,
    dependencies: capturedDependencies.success,
  });
};

const ActorAdmissionEnvelopeSchema = Schema.declareConstructor<ActorAdmissionEnvelope, unknown>()(
  [],
  () => (value, _ast, options) => {
    const captured = captureEnvelope(value);

    if (Result.isSuccess(captured)) return Effect.succeed(captured.success);

    const issue = new SchemaIssue.InvalidValue(
      { message: captured.failure.message },
      value,
      options,
    );

    return Effect.fail(
      captured.failure.path.length === 0
        ? issue
        : new SchemaIssue.Pointer(captured.failure.path, issue),
    );
  },
);

const decodeAdmissionEnvelope = Schema.decodeUnknownResult(ActorAdmissionEnvelopeSchema);

/** Decodes the envelope shape once; input remains unknown and is never generically schema-decoded. */
export const decodeActorAdmissionEnvelope = (
  value: unknown,
): Result.Result<ActorAdmissionEnvelope, PublicDiagnostic> =>
  decodeAdmissionEnvelope(value).pipe(Result.mapError(fromSchemaError));

export type ActorIdentityRegistry<Actor = unknown> = {
  /** Derives the runtime/stable/app-machine/stable-ref tuple without allocating state. */
  stableKey: <DefinitionValue extends MachineDefinition>(
    ref: ActorRef<Machine<DefinitionValue>>,
    machine?: { definition: MachineDefinition },
  ) => ActorKey;
  reserveStable: <DefinitionValue extends MachineDefinition>(
    ref: ActorRef<Machine<DefinitionValue>>,
    machine?: { definition: MachineDefinition },
  ) => Result.Result<ActorIdentity<DefinitionValue>, PublicDiagnostic>;
  createLocal: <DefinitionValue extends MachineDefinition>(
    machine: Machine<DefinitionValue>,
    options?: { deferAllocationNotification?: boolean },
  ) => Result.Result<LocalActorIdentity<DefinitionValue>, PublicDiagnostic>;
  commitLocal: <DefinitionValue extends MachineDefinition>(
    identity: LocalActorIdentity<DefinitionValue>,
  ) => Result.Result<void, PublicDiagnostic>;
  reserveLocal: <DefinitionValue extends MachineDefinition>(
    identity: ActorIdentity<DefinitionValue>,
  ) => Result.Result<ActorIdentity<DefinitionValue>, PublicDiagnostic>;
  isLocalRef: (ref: unknown) => boolean;
  register: <DefinitionValue extends MachineDefinition>(
    identity: ActorIdentity<DefinitionValue>,
    actor: Actor,
  ) => Result.Result<ActorRegistryEntry<DefinitionValue, Actor>, PublicDiagnostic>;
  lookup: <DefinitionValue extends MachineDefinition>(
    ref: ActorRef<Machine<DefinitionValue>>,
  ) => Result.Result<ActorRegistryEntry<DefinitionValue, Actor>, PublicDiagnostic>;
  rollback: <DefinitionValue extends MachineDefinition>(
    identity: ActorIdentity<DefinitionValue>,
  ) => void;
  tombstone: <DefinitionValue extends MachineDefinition>(
    identity: ActorIdentity<DefinitionValue>,
    disposedAtSequence: number,
  ) => Result.Result<void, PublicDiagnostic>;
};

type RegistryOptions = {
  /** Test-only starting point; production callers use the one-based default. */
  initialIncarnation?: number;
  onAllocate?: (kind: "incarnation" | "local-ordinal") => void;
};

type StableSlot<Actor> = {
  key: ActorKey;
  entry: StoredEntry<Actor> | undefined;
  tombstone: ActorTombstone | undefined;
};

type StoredEntry<Actor> = {
  identity: unknown;
  local: boolean;
  state: "reserved" | "active" | "tombstoned";
  actor: Actor | undefined;
  hasActor: boolean;
  tombstone: ActorTombstone | undefined;
  localAllocation: LocalAllocationReservation | undefined;
  deferredLocalAllocation: boolean;
};

type LocalAllocation = {
  incarnation: ActorIncarnation;
  ordinal: number;
};

type LocalAllocationReservation = LocalAllocation & {
  recycled: boolean;
  nextIncarnationBefore: number;
  nextKeyOrdinalBefore: number;
  incarnationExhaustedBefore: boolean;
  keyOrdinalExhaustedBefore: boolean;
  nextIncarnationAfter: number;
  nextKeyOrdinalAfter: number;
};

type LocalActorRefRecord = { [key: PropertyKey]: unknown };

// Provenance marker only: this WeakSet retains no refs and is not an actor registry.
const localActorRefs = new WeakSet<LocalActorRefRecord>();

const isRegisteredEntry = <Actor>(
  entry: StoredEntry<Actor>,
): entry is StoredEntry<Actor> & { actor: Actor } => entry.state === "active" && entry.hasActor;

const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;

const missingActorRef = Failure({
  code: "MissingActorRef",
  path: ["actorRef"],
  details: { required: true },
  summary: "An actor ref is required for this operation.",
  help: "Provide the admitted stable ref or use the explicit local-actor path.",
});

const invalidIdentity = (summary: string, help: string) =>
  Failure({
    code: "InvariantViolation",
    path: ["actorRef"],
    details: {},
    summary,
    help,
  });

const disposedIdentity = () =>
  Failure({
    code: "DisposedActorRef",
    path: ["actorRef"],
    details: { disposed: true },
    summary: "This actor has been disposed and cannot accept commands.",
    help: "Acquire a valid owner/runtime and do not reuse the disposed ref.",
  });

const isValidCursor = (value: number) =>
  Number.isSafeInteger(value) && value >= 1 && value <= MAX_SAFE_INTEGER;

export const makeActorIdentityRegistry = <Actor = unknown>(
  options: RegistryOptions = {},
): ActorIdentityRegistry<Actor> => {
  if (options.initialIncarnation !== undefined && !isValidCursor(options.initialIncarnation)) {
    throw new RangeError("initial actor incarnation must be a positive safe integer");
  }

  const runtimeNonce = crypto.randomUUID();
  let nextIncarnation = options.initialIncarnation ?? 1;
  let nextKeyOrdinal = 1;
  let incarnationExhausted = false;
  let keyOrdinalExhausted = false;
  const recycledLocalAllocations: LocalAllocation[] = [];
  const stableSlots = new Map<MachineRecordValue, Map<string, StableSlot<Actor>>>();
  const entriesByKey = new Map<ActorKey, StoredEntry<Actor>>();

  const failure: <Value>(diagnostic: PublicDiagnostic) => Result.Result<Value, PublicDiagnostic> = (
    diagnostic,
  ) => Result.fail(diagnostic);

  const allocateIncarnation = (
    notify = true,
  ): Result.Result<ActorIncarnation, PublicDiagnostic> => {
    if (incarnationExhausted) {
      return Result.fail(
        invalidIdentity(
          "Actor identity allocation is exhausted.",
          "Create a new runtime execution scope.",
        ),
      );
    }

    if (!isValidCursor(nextIncarnation)) {
      incarnationExhausted = true;

      return Result.fail(
        invalidIdentity(
          "Actor identity allocation is exhausted.",
          "Create a new runtime execution scope.",
        ),
      );
    }

    // SAFETY: isValidCursor proves this counter is a positive safe integer before branding.
    const incarnation = nextIncarnation as ActorIncarnation;

    if (nextIncarnation === MAX_SAFE_INTEGER) incarnationExhausted = true;
    else nextIncarnation += 1;

    if (notify) options.onAllocate?.("incarnation");

    return Result.succeed(incarnation);
  };

  const allocateLocalOrdinal = (notify = true): Result.Result<number, PublicDiagnostic> => {
    if (keyOrdinalExhausted || !isValidCursor(nextKeyOrdinal)) {
      keyOrdinalExhausted = true;

      return Result.fail(
        invalidIdentity(
          "Actor identity allocation is exhausted.",
          "Create a new runtime execution scope.",
        ),
      );
    }

    const ordinal = nextKeyOrdinal;

    if (nextKeyOrdinal === MAX_SAFE_INTEGER) keyOrdinalExhausted = true;
    else nextKeyOrdinal += 1;

    if (notify) options.onAllocate?.("local-ordinal");

    return Result.succeed(ordinal);
  };

  const tupleSegment = (value: string) => `${value.length}:${value}`;

  const stableKey = <DefinitionValue extends MachineDefinition>(
    ref: ActorRef<Machine<DefinitionValue>>,
    machine: { definition: MachineDefinition } = ref.machine,
  ): ActorKey =>
    // SAFETY: the tuple segments make machine and ref boundaries injective even for delimiter-heavy authored names.
    `runtime-${runtimeNonce}/stable/${tupleSegment(machine.definition.id)}/${tupleSegment(ref.id)}` as ActorKey;

  const getStableSlot = <DefinitionValue extends MachineDefinition>(
    ref: ActorRef<Machine<DefinitionValue>>,
  ) => {
    // SAFETY: every admitted Machine is a MachineRecordValue; this map never mutates the machine.
    const machine = ref.machine as MachineRecordValue;
    const byId = stableSlots.get(machine);

    return byId?.get(ref.id);
  };

  const reserveStable = <DefinitionValue extends MachineDefinition>(
    ref: ActorRef<Machine<DefinitionValue>>,
    machineFacts?: { definition: MachineDefinition },
  ): Result.Result<ActorIdentity<DefinitionValue>, PublicDiagnostic> => {
    if (localActorRefs.has(ref)) {
      return failure(
        invalidIdentity(
          "A local actor ref cannot be used as a stable ref.",
          "Use the local actor admission path.",
        ),
      );
    }

    // SAFETY: every admitted Machine is a MachineRecordValue; this map never mutates the machine.
    const machine = ref.machine as MachineRecordValue;
    let byId = stableSlots.get(machine);

    if (byId === undefined) {
      byId = new Map();
      stableSlots.set(machine, byId);
    }

    let slot = byId.get(ref.id);

    if (slot?.tombstone !== undefined) return failure(disposedIdentity());

    if (slot?.entry !== undefined) {
      // SAFETY: a stable slot is created only by reserveStable and retains its exact identity object.
      return Result.succeed(slot.entry.identity as ActorIdentity<DefinitionValue>);
    }

    const incarnation = allocateIncarnation();

    if (Result.isFailure(incarnation)) return failure(incarnation.failure);

    if (slot === undefined) {
      slot = { key: stableKey(ref, machineFacts), entry: undefined, tombstone: undefined };
      byId.set(ref.id, slot);
    }

    const identity: ActorIdentity<DefinitionValue> = {
      ref,
      key: slot.key,
      incarnation: incarnation.success,
      leaseEpoch: 0,
    };

    const entry: StoredEntry<Actor> = {
      identity,
      local: false,
      state: "reserved",
      actor: undefined,
      hasActor: false,
      tombstone: undefined,
      localAllocation: undefined,
      deferredLocalAllocation: false,
    };

    slot.entry = entry;
    entriesByKey.set(identity.key, entry);

    return Result.succeed(identity);
  };

  const createLocal = <DefinitionValue extends MachineDefinition>(
    machine: Machine<DefinitionValue>,
    creationOptions: { deferAllocationNotification?: boolean } = {},
  ): Result.Result<LocalActorIdentity<DefinitionValue>, PublicDiagnostic> => {
    const deferredLocalAllocation = creationOptions.deferAllocationNotification === true;
    const recycled = recycledLocalAllocations.pop();
    const nextIncarnationBefore = nextIncarnation;
    const nextKeyOrdinalBefore = nextKeyOrdinal;
    const incarnationExhaustedBefore = incarnationExhausted;
    const keyOrdinalExhaustedBefore = keyOrdinalExhausted;

    const incarnation =
      recycled === undefined ? allocateIncarnation(false) : Result.succeed(recycled.incarnation);

    if (Result.isFailure(incarnation)) {
      if (recycled !== undefined) recycledLocalAllocations.push(recycled);

      return failure(incarnation.failure);
    }

    const ordinal =
      recycled === undefined ? allocateLocalOrdinal(false) : Result.succeed(recycled.ordinal);

    if (Result.isFailure(ordinal)) {
      nextIncarnation = nextIncarnationBefore;
      nextKeyOrdinal = nextKeyOrdinalBefore;
      incarnationExhausted = incarnationExhaustedBefore;
      keyOrdinalExhausted = keyOrdinalExhaustedBefore;

      if (recycled !== undefined) recycledLocalAllocations.push(recycled);

      return failure(ordinal.failure);
    }

    if (!deferredLocalAllocation) {
      options.onAllocate?.("incarnation");
      options.onAllocate?.("local-ordinal");
    }

    const localAllocation: LocalAllocationReservation = {
      incarnation: incarnation.success,
      ordinal: ordinal.success,
      recycled: recycled !== undefined,
      nextIncarnationBefore,
      nextKeyOrdinalBefore,
      incarnationExhaustedBefore,
      keyOrdinalExhaustedBefore,
      nextIncarnationAfter: nextIncarnation,
      nextKeyOrdinalAfter: nextKeyOrdinal,
    };

    // SAFETY: this object is the complete opaque local ref; its private brand is type-only.
    const ref = {
      machine,
      id: "local-" + runtimeNonce + "-" + incarnation.success,
      persist: false,
    } as LocalActorRef<DefinitionValue>;

    const identity = {
      ref,
      // SAFETY: the local namespace is disjoint from stable tuple keys.
      key: `runtime-${runtimeNonce}/local/${ordinal.success}` as ActorKey,
      incarnation: incarnation.success,
      leaseEpoch: 0,
    };

    const entry: StoredEntry<Actor> = {
      identity,
      local: true,
      state: "reserved",
      actor: undefined,
      hasActor: false,
      tombstone: undefined,
      localAllocation,
      deferredLocalAllocation,
    };

    localActorRefs.add(ref);
    entriesByKey.set(identity.key, entry);

    return Result.succeed(identity);
  };

  const commitLocal = <DefinitionValue extends MachineDefinition>(
    identity: LocalActorIdentity<DefinitionValue>,
  ): Result.Result<void, PublicDiagnostic> => {
    const entry = entriesByKey.get(identity.key);

    if (
      entry === undefined ||
      entry.identity !== identity ||
      !entry.local ||
      !entry.deferredLocalAllocation
    )
      return failure(missingActorRef);

    entry.deferredLocalAllocation = false;
    options.onAllocate?.("incarnation");
    options.onAllocate?.("local-ordinal");

    return Result.succeed(undefined);
  };

  const reserveLocal = <DefinitionValue extends MachineDefinition>(
    identity: ActorIdentity<DefinitionValue>,
  ): Result.Result<ActorIdentity<DefinitionValue>, PublicDiagnostic> => {
    const entry = entriesByKey.get(identity.key);

    if (
      !localActorRefs.has(identity.ref) ||
      entry === undefined ||
      entry.identity !== identity ||
      !entry.local ||
      entry.state !== "reserved"
    )
      return failure(missingActorRef);

    return Result.succeed(identity);
  };

  const register = <DefinitionValue extends MachineDefinition>(
    identity: ActorIdentity<DefinitionValue>,
    actor: Actor,
  ): Result.Result<ActorRegistryEntry<DefinitionValue, Actor>, PublicDiagnostic> => {
    const entry = entriesByKey.get(identity.key);

    if (entry === undefined || entry.identity !== identity) return failure(missingActorRef);

    if (entry.state === "tombstoned") return failure(disposedIdentity());

    if (entry.state !== "reserved") {
      return failure(
        invalidIdentity(
          "The actor identity is already active.",
          "Join the existing actor admission.",
        ),
      );
    }

    entry.state = "active";
    entry.actor = actor;
    entry.hasActor = true;

    return Result.succeed({ identity, actor });
  };

  const lookup = <DefinitionValue extends MachineDefinition>(
    ref: ActorRef<Machine<DefinitionValue>>,
  ): Result.Result<ActorRegistryEntry<DefinitionValue, Actor>, PublicDiagnostic> => {
    if (localActorRefs.has(ref)) return failure(missingActorRef);
    const slot = getStableSlot(ref);
    const entry = slot?.entry;

    if (entry === undefined || !isRegisteredEntry(entry)) {
      return slot?.tombstone === undefined ? failure(missingActorRef) : failure(disposedIdentity());
    }

    // SAFETY: active entries are registered through this registry and retain their exact identity object.
    return Result.succeed({
      identity: entry.identity as ActorIdentity<DefinitionValue>,
      actor: entry.actor,
    });
  };

  const rollback = <DefinitionValue extends MachineDefinition>(
    identity: ActorIdentity<DefinitionValue>,
  ) => {
    const entry = entriesByKey.get(identity.key);

    if (entry === undefined || entry.identity !== identity || entry.state !== "reserved") return;
    entriesByKey.delete(identity.key);

    if (entry.local) {
      if (entry.deferredLocalAllocation && entry.localAllocation !== undefined) {
        const allocation = entry.localAllocation;

        if (
          !allocation.recycled &&
          nextIncarnation === allocation.nextIncarnationAfter &&
          nextKeyOrdinal === allocation.nextKeyOrdinalAfter
        ) {
          nextIncarnation = allocation.nextIncarnationBefore;
          nextKeyOrdinal = allocation.nextKeyOrdinalBefore;
          incarnationExhausted = allocation.incarnationExhaustedBefore;
          keyOrdinalExhausted = allocation.keyOrdinalExhaustedBefore;
        } else {
          recycledLocalAllocations.push(allocation);
        }
      }

      localActorRefs.delete(identity.ref);

      return;
    }

    const slot = getStableSlot(identity.ref);

    if (slot !== undefined) slot.entry = undefined;
  };

  const tombstone = <DefinitionValue extends MachineDefinition>(
    identity: ActorIdentity<DefinitionValue>,
    disposedAtSequence: number,
  ): Result.Result<void, PublicDiagnostic> => {
    if (!Number.isSafeInteger(disposedAtSequence) || disposedAtSequence < 0) {
      return failure(
        invalidIdentity("The disposal sequence is invalid.", "Use a non-negative safe sequence."),
      );
    }

    const entry = entriesByKey.get(identity.key);

    if (entry === undefined || entry.identity !== identity) return failure(missingActorRef);

    if (entry.state !== "active") {
      return failure(
        invalidIdentity(
          "Only an active actor can be disposed.",
          "Complete actor admission before disposal.",
        ),
      );
    }

    const tombstoneValue = {
      key: identity.key,
      incarnation: identity.incarnation,
      disposedAtSequence,
    } satisfies ActorTombstone;

    entry.state = "tombstoned";
    entry.actor = undefined;
    entry.hasActor = false;
    entry.tombstone = tombstoneValue;

    if (!entry.local) {
      const slot = getStableSlot(identity.ref);

      if (slot !== undefined) {
        slot.entry = undefined;
        slot.tombstone = tombstoneValue;
      }
    }

    return Result.succeed(undefined);
  };

  return {
    stableKey,
    reserveStable,
    createLocal,
    reserveLocal,
    commitLocal,
    isLocalRef: (ref) => Predicate.isObject(ref) && localActorRefs.has(ref),
    register,
    lookup,
    rollback,
    tombstone,
  };
};

/** Exact typed values supplied to the pre-mutation admission validator. */
export type ActorAdmissionInput<
  A extends App,
  DefinitionValue extends MachineDefinition,
  I,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> = {
  app: A;
  implementation: I;
  ref: ActorRef<Machine<DefinitionValue>>;
  /** Private app-time facts; public refs retain the authored machine identity token. */
  machineFacts?: Machine<DefinitionValue>;
  input: InputOf<DefinitionValue> | undefined;
  // oxlint-disable-next-line anti-slop/no-readonly -- NO_READONLY_CODEMOD: accepts const-inferred caller bindings before admission makes an owned copy.
  bindings: readonly ActorContextBinding<DefinitionValue, ProviderDefinition>[];
  // oxlint-disable-next-line anti-slop/no-readonly -- NO_READONLY_CODEMOD: accepts const-inferred caller dependencies before admission makes an owned copy.
  dependencies: readonly ActorDependencyEdge[];
};

/** Passive authority needed to validate one admission without reserving or executing anything. */
export type ActorAdmissionValidationContext<
  A extends App = App,
  DefinitionValue extends MachineDefinition = MachineDefinition,
  I = unknown,
> = {
  app: A;
  implementation: I;
  lookup: <ProviderDefinition extends MachineDefinition>(
    ref: ActorRef<Machine<ProviderDefinition>>,
  ) => Result.Result<ActorRegistryEntry<ProviderDefinition>, PublicDiagnostic>;
  /** True only while this authority owns a registered-but-not-yet-exposed admission. */
  isAdmissionInFlight?: (ref: ActorRef<Machine<DefinitionValue>>) => boolean;
  plan?: ReturnType<typeof appPlan>;
  identity?: ActorIdentity<DefinitionValue>;
  consumerKey?: ActorKey;
  providerFences?: Map<ActorKey, ActorFence>;
};

/** B02's pure authority seam; later transaction stages may add lifecycle capabilities. */
export type ActorAdmissionAuthority<
  A extends App = App,
  DefinitionValue extends MachineDefinition = MachineDefinition,
  I = unknown,
> = ActorAdmissionValidationContext<A, DefinitionValue, I>;

/** Successful B02 output: exact input, optional staged identity, and copied graph views. */
export type ValidatedActorAdmission<
  A extends App,
  DefinitionValue extends MachineDefinition,
  I,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> = {
  input: ActorAdmissionInput<A, DefinitionValue, I, ProviderDefinition>;
  identity: ActorIdentity<DefinitionValue> | undefined;
  edges: ActorDependencyEdge[];
  graph: ActorDependencyGraph;
};

/** Admission modes share one transaction; only the owner decides whether input is fresh or restored. */
export type ActorAdmissionMode = "fresh-local" | "fresh-stable" | "restored-stable";

/** Private construction payload separating fresh input from a materialized restore snapshot. */
export type ActorAdmissionConstruction<DefinitionValue extends MachineDefinition, Input> =
  | {
      _tag: "fresh";
      initial: PreparedActorSnapshot<DefinitionValue>;
      input: Input | undefined;
    }
  | {
      _tag: "restore";
      snapshot: PreparedActorSnapshot<DefinitionValue>;
    };

const restoreRequiresPersistedRef = () =>
  Failure({
    code: "SchemaValidation",
    path: ["actorAdmission", "restore"],
    details: { reason: "non-persisted-ref" },
    summary: "Restore data requires a persisted actor reference.",
    help: "Use an actor reference declared with persist: true for restore admission.",
  });

/** Selects fresh or restored admission from the exact ref declaration and tagged payload. */
export const resolveActorAdmissionMode = <DefinitionValue extends MachineDefinition, Input>(
  ref: ActorRef<Machine<DefinitionValue>>,
  construction: ActorAdmissionConstruction<DefinitionValue, Input>,
  identityMode: "stable" | "local" = "stable",
): Result.Result<ActorAdmissionMode, PublicDiagnostic> => {
  if (construction._tag === "restore") {
    if (identityMode === "local" || ref.persist !== true)
      return Result.fail(restoreRequiresPersistedRef());

    return Result.succeed("restored-stable");
  }

  return Result.succeed(identityMode === "local" ? "fresh-local" : "fresh-stable");
};

/** The handle is package-local until a later public actor owner publishes it. */
export type ActorHandle<DefinitionValue extends MachineDefinition, Actor = unknown> = Actor & {
  ref: ActorRef<Machine<DefinitionValue>>;
};

/** One owner-scoped release action acquired before the exposure barrier. */
export type AdmissionRollbackStep = {
  name: string;
  release: Effect.Effect<void, PublicDiagnostic>;
};

type ValidatedActorAdmissionWithIdentity<
  A extends App,
  DefinitionValue extends MachineDefinition,
  I,
  ProviderDefinition extends MachineDefinition,
> = ValidatedActorAdmission<A, DefinitionValue, I, ProviderDefinition> & {
  identity: ActorIdentity<DefinitionValue>;
};

export type ActorAdmissionPhaseOwners<
  ValidatedOwner = never,
  PreparedOwner = never,
  AttachedOwner = never,
  ActivatedOwner = never,
  RegisteredOwner = never,
> = {
  validated: ValidatedOwner;
  prepared: PreparedOwner;
  attached: AttachedOwner;
  activated: ActivatedOwner;
  registered: RegisteredOwner;
};

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- phase carriers are private capabilities with arbitrary fields but cannot be erased to unknown.
type ActorAdmissionPhaseCarrier = Record<string, unknown>;

type ActorAdmissionRollbackCarrier = ActorAdmissionPhaseCarrier & {
  rollback: AdmissionRollbackStep[];
};

type ActorAdmissionPhaseOwnerMap = ActorAdmissionPhaseOwners<
  ActorAdmissionPhaseCarrier,
  ActorAdmissionRollbackCarrier,
  ActorAdmissionRollbackCarrier,
  ActorAdmissionRollbackCarrier,
  ActorAdmissionRollbackCarrier
>;

type DefaultActorAdmissionPhaseOwners = {
  validated: never;
  prepared: never;
  attached: never;
  activated: never;
  registered: never;
};

/** Reservation is the linearization point for fresh, restored, and concurrent stable admissions. */
export type ActorAdmissionReservation<
  A extends App,
  DefinitionValue extends MachineDefinition,
  I,
  CleanupError,
  Actor,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
  ValidatedCarrier = NonNullable<unknown>,
> =
  | {
      mode: "leader";
      admissionMode: ActorAdmissionMode;
      validated: ValidatedActorAdmissionWithIdentity<A, DefinitionValue, I, ProviderDefinition> &
        ValidatedCarrier;
      rollback: AdmissionRollbackStep[];
      complete: Deferred.Deferred<
        Exit.Exit<
          ExposedActorAdmission<A, DefinitionValue, I, CleanupError, Actor, ProviderDefinition>,
          PublicDiagnostic
        >
      >;
    }
  | {
      mode: "joined";
      existing: Deferred.Deferred<
        Exit.Exit<
          ExposedActorAdmission<A, DefinitionValue, I, CleanupError, Actor, ProviderDefinition>,
          PublicDiagnostic
        >
      >;
    };

type ActorAdmissionPhase<Phase extends string, Value, IncludeRollback extends boolean = true> = {
  phase: Phase;
} & (IncludeRollback extends true ? { rollback: AdmissionRollbackStep[] } : NonNullable<unknown>) &
  Value;

type PreparedActorAdmissionValue<
  A extends App,
  DefinitionValue extends MachineDefinition,
  I,
  ProviderDefinition extends MachineDefinition,
  Snapshot,
  Mailbox,
> = {
  validated: ValidatedActorAdmissionWithIdentity<A, DefinitionValue, I, ProviderDefinition>;
  snapshot: Snapshot;
  mailbox: Mailbox;
};

type AttachedActorAdmissionValue<DefinitionValue extends MachineDefinition> = {
  context: ContextOf<DefinitionValue>;
  edges: ActorDependencyEdge[];
};

type RegisteredActorAdmissionValue<DefinitionValue extends MachineDefinition, Actor, Lease> = {
  sealed: true;
  actor: ActorHandle<DefinitionValue, Actor>;
  lease: Lease;
};

/** Prepared state owns the silent baseline and bounded mailbox. */
export type PreparedActorAdmission<
  A extends App,
  DefinitionValue extends MachineDefinition,
  I,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
  Snapshot = PreparedActorSnapshot<DefinitionValue>,
  Mailbox = PreparedActorEngine<DefinitionValue>["mailbox"],
  Value = PreparedActorAdmissionValue<A, DefinitionValue, I, ProviderDefinition, Snapshot, Mailbox>,
> = ActorAdmissionPhase<"prepared", Value>;

/** Attached state has exact context values and the fixed dependency edges installed. */
export type AttachedActorAdmission<
  DefinitionValue extends MachineDefinition,
  Value = AttachedActorAdmissionValue<DefinitionValue>,
> = ActorAdmissionPhase<"attached", Value>;

/** Activated state has crossed the silent baseline/mailbox barrier but is not public. */
export type ActivatedActorAdmission<
  DefinitionValue extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
  Value = {
    baseline: ActiveContextBaseline<DefinitionValue, ProviderDefinition>;
    engine: ActorEngine<DefinitionValue>;
  },
> = ActorAdmissionPhase<"activated", Value>;

/** Registration seals the actor identity before a handle or lease can escape. */
export type RegisteredActorAdmission<
  A extends App,
  DefinitionValue extends MachineDefinition,
  I,
  CleanupError,
  Actor,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
  Value = RegisteredActorAdmissionValue<
    DefinitionValue,
    Actor,
    ActorLease<A, DefinitionValue, I, CleanupError, Actor, ProviderDefinition>
  >,
> = ActorAdmissionPhase<"registered", Value>;

/** The sole individual disposal authority; it is returned only in exposed state. */
export type ActorLease<
  A extends App,
  DefinitionValue extends MachineDefinition,
  I,
  CleanupError,
  Actor,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> = {
  actor: ActorHandle<DefinitionValue, Actor>;
  admission: ValidatedActorAdmissionWithIdentity<A, DefinitionValue, I, ProviderDefinition>;
  cleanup: Option.Option<Cause.Cause<CleanupError>>;
  dispose: () => Effect.Effect<void, PublicDiagnostic>;
};

/** Inputs for the one owner-scoped terminal disposal operation. */
export type ActorLeaseOptions<
  A extends App,
  DefinitionValue extends MachineDefinition,
  I,
  CleanupError,
  Actor,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> = {
  actor: ActorHandle<DefinitionValue, Actor>;
  admission: ValidatedActorAdmission<A, DefinitionValue, I, ProviderDefinition> & {
    identity: ActorIdentity<DefinitionValue>;
  };
  cleanup: Effect.Effect<void, PublicDiagnostic>;
  /** Tombstoning is deliberately called only after cleanup succeeds. */
  tombstone?: () => Result.Result<void, PublicDiagnostic>;
  cleanupCause?: Option.Option<Cause.Cause<CleanupError>>;
};

/** Exposed state is the only stage that escapes the transaction. */
export type ExposedActorAdmission<
  A extends App,
  DefinitionValue extends MachineDefinition,
  I,
  CleanupError,
  Actor,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
  Value = {
    actor: ActorHandle<DefinitionValue, Actor>;
    lease: ActorLease<A, DefinitionValue, I, CleanupError, Actor, ProviderDefinition>;
  },
> = ActorAdmissionPhase<"exposed", Value, false>;

/** Narrow owner capabilities consumed by this transaction; B04/B07/B09 remain the real owners. */
export type ActorAdmissionTransactionAuthority<
  A extends App,
  DefinitionValue extends MachineDefinition,
  I,
  CleanupError = PublicDiagnostic,
  Actor = unknown,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
  Owners extends ActorAdmissionPhaseOwnerMap = DefaultActorAdmissionPhaseOwners,
> = ActorAdmissionValidationContext<A, DefinitionValue, I> & {
  reserveOrJoin: (
    validated: ValidatedActorAdmission<A, DefinitionValue, I, ProviderDefinition>,
  ) => Effect.Effect<
    ActorAdmissionReservation<
      A,
      DefinitionValue,
      I,
      CleanupError,
      Actor,
      ProviderDefinition,
      Owners["validated"]
    >,
    PublicDiagnostic
  >;
  prepare: (
    validated: ValidatedActorAdmissionWithIdentity<A, DefinitionValue, I, ProviderDefinition> &
      Owners["validated"],
    mode: ActorAdmissionMode,
  ) => Effect.Effect<Owners["prepared"], PublicDiagnostic>;
  attach: (prepared: Owners["prepared"]) => Effect.Effect<Owners["attached"], PublicDiagnostic>;
  activate: (attached: Owners["attached"]) => Effect.Effect<Owners["activated"], PublicDiagnostic>;
  register: (
    activated: Owners["activated"],
  ) => Effect.Effect<Owners["registered"], PublicDiagnostic>;
  expose: (
    registered: Owners["registered"],
  ) => Effect.Effect<
    ExposedActorAdmission<A, DefinitionValue, I, CleanupError, Actor, ProviderDefinition>,
    PublicDiagnostic
  >;
};

const isActorKey = (value: unknown): value is ActorKey =>
  Predicate.isString(value) && value.length > 0;

const isSafeNonNegativeInteger = (value: unknown): value is number =>
  Predicate.isNumber(value) && Number.isSafeInteger(value) && value >= 0;

const isActorIncarnation = (value: unknown): value is ActorIncarnation =>
  isSafeNonNegativeInteger(value) && value >= 1 && value <= MAX_SAFE_INTEGER;

const contextProviderFailure = (
  slot: string,
  provider: "missing" | "ambiguous" | "foreign" | "stale" | "invalid",
) =>
  Failure({
    code: "MissingContextProvider",
    path: ["contextBindings", slot],
    details: { provider },
    summary: "The required context provider is not admitted.",
    help: "Admit the exact provider ref before constructing the consumer.",
  });

const duplicateClaimFailure = () =>
  Failure({
    code: "DuplicateActorClaim",
    path: ["actorRef"],
    details: { claim: "duplicate" },
    summary: "This stable actor is already claimed incompatibly.",
    help: "Join the existing ensure or use a distinct stable identity.",
  });

const unadmittedMachineFailure = (machine: unknown) =>
  Failure({
    code: "UnadmittedMachine",
    path: ["machine"],
    details: { machine: Predicate.isString(machine) ? machine : "unknown" },
    summary: "This machine is not admitted by the application plan.",
    help: "Include the machine in the app before runtime construction.",
  });

const foreignRefFailure = (reason: "app" | "machine" | "ref" | "fence") =>
  Failure({
    code: "ForeignActorRef",
    path: ["actorRef"],
    details: { reason },
    summary: "The actor ref belongs to a different admission authority.",
    help: "Use a ref and provider graph from this app and runtime.",
  });

const malformedBindingFailure = (slot: string) => contextProviderFailure(slot, "invalid");

const invalidDependencyFailure = () =>
  Failure({
    code: "InvariantViolation",
    path: ["contextBindings"],
    details: { reason: "invalid-edge" },
    summary: "A context dependency edge is invalid.",
    help: "Use one consumer, provider, and authored slot per edge.",
  });

const cycleFailure = (cycle: ActorKey[]) =>
  Failure({
    code: "ContextDependencyCycle",
    path: ["contextBindings"],
    details: { cycle: cycle.join(">") },
    summary: "Context bindings contain a dependency cycle.",
    help: "Remove the cycle and keep provider dependencies acyclic.",
  });

const lookupFailure = (slot: string, failure: PublicDiagnostic): PublicDiagnostic => {
  if (failure.code === "DisposedActorRef") return failure;

  if (failure.code === "ForeignActorRef" || failure.code === "MismatchedActorRef")
    return foreignRefFailure("ref");

  if (failure.code === "MissingActorRef") return contextProviderFailure(slot, "missing");

  return failure;
};

type CapturedActorRef<DefinitionValue extends MachineDefinition = MachineDefinition> = {
  source: ActorRef<Machine<DefinitionValue>>;
  value: ActorRef<Machine<DefinitionValue>>;
  machine: MachineRecordValue;
  id: string;
  persist: boolean;
};

// RETURN_TYPE: The copied ref preserves exact machine/id/persist identity while removing hostile property access.
const copyActorRef = <DefinitionValue extends MachineDefinition>(
  machine: MachineRecordValue,
  id: string,
  persist: boolean,
) => {
  const snapshot = { machine, id, persist };

  // SAFETY: captureReflection and isConstructedMachine proved the exact nominal machine value.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return snapshot as ActorRef<Machine<DefinitionValue>>;
};

const validateActorRef = <DefinitionValue extends MachineDefinition = MachineDefinition>(
  ref: unknown,
): Result.Result<CapturedActorRef<DefinitionValue>, PublicDiagnostic> => {
  const captured = captureAdmissionReflection(ref);

  if (Result.isFailure(captured)) return Result.fail(captured.failure);

  if (!hasExactPlainKeys(captured.success, ["machine", "id", "persist"]))
    return Result.fail(foreignRefFailure("ref"));

  const machine = captured.success.values.get("machine");
  const id = captured.success.values.get("id");
  const persist = captured.success.values.get("persist");

  if (!isConstructedMachine(machine) || !isAuthoredName(id) || !Predicate.isBoolean(persist))
    return Result.fail(foreignRefFailure("ref"));

  // SAFETY: captureReflection proved ref is an exact ordinary record and the caller's typed ref is the source identity.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const source = ref as ActorRef<Machine<DefinitionValue>>;

  return Result.succeed({
    source,
    value: copyActorRef<DefinitionValue>(machine, id, persist),
    machine,
    id,
    persist,
  });
};

// RETURN_TYPE: Promotes a stable captured ref into the private canonical actor-ref seam.
export const captureActorRef = <DefinitionValue extends MachineDefinition = MachineDefinition>(
  ref: unknown,
): Result.Result<ActorRef<Machine<DefinitionValue>>, PublicDiagnostic> => {
  const captured = validateActorRef<DefinitionValue>(ref);

  if (Result.isFailure(captured)) return Result.fail(captured.failure);

  return Result.succeed(captured.success.value);
};

type CapturedBinding<ProviderDefinition extends MachineDefinition = MachineDefinition> = {
  slot: string;
  provider: CapturedActorRef<ProviderDefinition>;
  providerFence: ActorFence;
  select: (...args: [ActorContextSnapshot<ProviderDefinition>]) => void;
};

const validateFence = (
  fence: unknown,
  slot: string,
): Result.Result<ActorFence, PublicDiagnostic> => {
  const captured = captureAdmissionReflection(fence);

  if (Result.isFailure(captured)) return Result.fail(captured.failure);

  if (!hasExactPlainKeys(captured.success, ["key", "incarnation", "generation", "leaseEpoch"]))
    return Result.fail(malformedBindingFailure(slot));

  const key = captured.success.values.get("key");
  const incarnation = captured.success.values.get("incarnation");
  const generation = captured.success.values.get("generation");
  const leaseEpoch = captured.success.values.get("leaseEpoch");

  if (
    !isActorKey(key) ||
    !isActorIncarnation(incarnation) ||
    !isSafeNonNegativeInteger(generation) ||
    !isSafeNonNegativeInteger(leaseEpoch)
  )
    return Result.fail(malformedBindingFailure(slot));

  return Result.succeed({
    key,
    incarnation,
    generation,
    leaseEpoch,
  });
};

const captureBinding = <ProviderDefinition extends MachineDefinition = MachineDefinition>(
  binding: unknown,
): Result.Result<CapturedBinding<ProviderDefinition>, PublicDiagnostic> => {
  const captured = captureAdmissionReflection(binding);

  if (Result.isFailure(captured)) return Result.fail(captured.failure);
  const slotValue = captured.success.values.get("slot");
  const slot = Predicate.isString(slotValue) ? slotValue : "unknown";

  if (!hasExactPlainKeys(captured.success, ["slot", "provider", "providerFence", "select"]))
    return Result.fail(malformedBindingFailure(slot));

  const provider = validateActorRef<ProviderDefinition>(captured.success.values.get("provider"));

  if (Result.isFailure(provider)) {
    return provider.failure.code === "SchemaValidation"
      ? Result.fail(provider.failure)
      : Result.fail(malformedBindingFailure(slot));
  }

  const providerFence = validateFence(captured.success.values.get("providerFence"), slot);

  if (Result.isFailure(providerFence)) return Result.fail(providerFence.failure);
  const select = captured.success.values.get("select");

  if (!Predicate.isString(slotValue) || !Predicate.isFunction(select))
    return Result.fail(malformedBindingFailure(slot));

  // SAFETY: captureReflection proved the selector is a stable function data property; its typed
  // input/output correlation remains owned by the admitted consumer/provider definitions.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return Result.succeed({
    slot,
    provider: provider.success,
    providerFence: providerFence.success,
    select: select as (...args: [ActorContextSnapshot<ProviderDefinition>]) => void,
  });
};

const validateDependencyEdge = (
  edge: unknown,
): Result.Result<ActorDependencyEdge, PublicDiagnostic> => {
  const captured = captureAdmissionReflection(edge);

  if (Result.isFailure(captured)) return Result.fail(captured.failure);

  if (!hasExactPlainKeys(captured.success, ["consumer", "provider", "slot"]))
    return Result.fail(invalidDependencyFailure());
  const consumer = captured.success.values.get("consumer");
  const provider = captured.success.values.get("provider");
  const slot = captured.success.values.get("slot");

  if (!isActorKey(consumer) || !isActorKey(provider) || !isAuthoredName(slot))
    return Result.fail(invalidDependencyFailure());

  return Result.succeed({ consumer, provider, slot });
};

const appendEdge = (
  map: Map<ActorKey, ActorDependencyEdge[]>,
  key: ActorKey,
  edge: ActorDependencyEdge,
) => {
  const edges = map.get(key);

  if (edges === undefined) map.set(key, [edge]);
  else edges.push(edge);
};

const copyCapturedBinding = <ProviderDefinition extends MachineDefinition>(
  binding: CapturedBinding<ProviderDefinition>,
) =>
  copyObject({
    slot: binding.slot,
    provider: binding.provider.value,
    providerFence: copyObject({ ...binding.providerFence }),
    select: binding.select,
  });

// RETURN_TYPE: Owns binding records before runtime admission can reserve or start an actor.
export const captureActorContextBindings = <
  DefinitionValue extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
>(
  value: unknown,
): Result.Result<ActorContextBinding<DefinitionValue, ProviderDefinition>[], PublicDiagnostic> => {
  const captured = captureEnvelopeArray(value, ["bindings"]);

  if (Result.isFailure(captured)) return Result.fail(admissionReflectionDiagnostic());
  const bindings = [];

  for (const value of captured.success) {
    const binding = captureBinding<ProviderDefinition>(value);

    if (Result.isFailure(binding)) return Result.fail(binding.failure);
    bindings.push(copyCapturedBinding(binding.success));
  }

  // SAFETY: each element was captured as a complete stable binding; runtime authority validation
  // later restores the consumer/provider slot correlation before reservation.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return Result.succeed(
    // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- runtime reflection erased the generic selector correlation.
    copyArray(bindings) as unknown as ActorContextBinding<DefinitionValue, ProviderDefinition>[],
  );
};

const copyDependencyEdge = (edge: ActorDependencyEdge) => copyObject({ ...edge });

const copyGraphMap = (map: Map<ActorKey, ActorDependencyEdge[]>) =>
  new Map([...map.entries()].map(([key, edges]) => [key, edges.map(copyDependencyEdge)] as const));

const validateGraph = (
  // oxlint-disable-next-line anti-slop/no-readonly -- NO_READONLY_CODEMOD: graph validation accepts const-inferred edges without a preliminary copy.
  edges: readonly ActorDependencyEdge[],
): Result.Result<ActorDependencyGraph, PublicDiagnostic> => {
  const forward = new Map<ActorKey, ActorDependencyEdge[]>();
  const reverse = new Map<ActorKey, ActorDependencyEdge[]>();
  const nodes: ActorKey[] = [];
  const seenNodes = new Set<ActorKey>();
  const seenEdges = new Set<string>();

  for (const edge of edges) {
    const identity = `${edge.consumer}\u0000${edge.provider}\u0000${edge.slot}`;

    if (seenEdges.has(identity)) return Result.fail(duplicateClaimFailure());
    seenEdges.add(identity);

    if (!seenNodes.has(edge.consumer)) {
      seenNodes.add(edge.consumer);
      nodes.push(edge.consumer);
    }

    if (!seenNodes.has(edge.provider)) {
      seenNodes.add(edge.provider);
      nodes.push(edge.provider);
    }

    appendEdge(forward, edge.consumer, edge);
    appendEdge(reverse, edge.provider, edge);
  }

  const colors = new Map<ActorKey, "gray" | "black">();
  const order: ActorKey[] = [];

  const visit = (node: ActorKey, path: ActorKey[]): PublicDiagnostic | undefined => {
    const color = colors.get(node);

    if (color === "gray") {
      const start = path.indexOf(node);

      return cycleFailure(path.slice(start < 0 ? 0 : start));
    }

    if (color === "black") return undefined;
    colors.set(node, "gray");
    const outgoing = forward.get(node) ?? [];

    for (const edge of outgoing) {
      const failure = visit(edge.provider, [...path, edge.provider]);

      if (failure !== undefined) return failure;
    }

    colors.set(node, "black");
    order.push(node);

    return undefined;
  };

  for (const node of nodes) {
    const failure = visit(node, [node]);

    if (failure !== undefined) return Result.fail(failure);
  }

  return Result.succeed(
    copyObject({
      forward: copyGraphMap(forward),
      reverse: copyGraphMap(reverse),
      order: copyArray(order),
    }),
  );
};

const sameProviderFence = <DefinitionValue extends MachineDefinition>(
  identity: ActorIdentity<DefinitionValue>,
  fence: ActorFence,
) =>
  identity.key === fence.key &&
  identity.incarnation === fence.incarnation &&
  identity.leaseEpoch === fence.leaseEpoch;

const isCapturedActorRef = <DefinitionValue extends MachineDefinition>(
  candidate: ActorRef<Machine<DefinitionValue>>,
  captured: CapturedActorRef<DefinitionValue>,
) =>
  candidate === captured.source ||
  candidate === captured.value ||
  (candidate.machine === captured.machine &&
    candidate.id === captured.id &&
    candidate.persist === captured.persist);

const sameFence = (left: ActorFence, right: ActorFence) =>
  left.key === right.key &&
  left.incarnation === right.incarnation &&
  left.generation === right.generation &&
  left.leaseEpoch === right.leaseEpoch;

const validateContextBinding = <
  A extends App,
  DefinitionValue extends MachineDefinition,
  I,
  ProviderDefinition extends MachineDefinition,
>(
  binding: CapturedBinding<ProviderDefinition>,
  authority: ActorAdmissionValidationContext<A, DefinitionValue, I>,
): Result.Result<
  {
    edge: ActorDependencyEdge;
    providerRef: ActorRef<Machine<ProviderDefinition>>;
  },
  PublicDiagnostic
> => {
  const slot = binding.slot;
  const plan = appPlan(authority.app);

  if (!planAdmitsMachine(plan, binding.provider.machine))
    return Result.fail(unadmittedMachineFailure(binding.provider.machine.definition.id));

  const provider = authority.lookup(binding.provider.value);

  if (Result.isFailure(provider)) return Result.fail(lookupFailure(slot, provider.failure));
  const providerIdentity = provider.success.identity;

  if (!isCapturedActorRef(providerIdentity.ref, binding.provider))
    return Result.fail(foreignRefFailure("ref"));

  if (!sameProviderFence(providerIdentity, binding.providerFence))
    return Result.fail(contextProviderFailure(slot, "stale"));

  const currentFence = authority.providerFences?.get(providerIdentity.key);

  if (currentFence === undefined) return Result.fail(contextProviderFailure(slot, "missing"));

  if (!sameFence(currentFence, binding.providerFence))
    return Result.fail(contextProviderFailure(slot, "stale"));

  const consumer = authority.identity?.key ?? authority.consumerKey;

  if (consumer === undefined) return Result.fail(invalidDependencyFailure());

  return Result.succeed({
    edge: { consumer, provider: providerIdentity.key, slot },
    providerRef: providerIdentity.ref,
  });
};

const validateContextBindings = <
  A extends App,
  DefinitionValue extends MachineDefinition,
  I,
  ProviderDefinition extends MachineDefinition,
>(
  machine: MachineRecordValue,
  // oxlint-disable-next-line anti-slop/no-readonly -- NO_READONLY_CODEMOD: accepts const-inferred bindings before validating and copying them.
  bindings: readonly ActorContextBinding<DefinitionValue, ProviderDefinition>[],
  authority: ActorAdmissionValidationContext<A, DefinitionValue, I>,
): Result.Result<
  {
    bindings: CapturedBinding<ProviderDefinition>[];
    edges: ActorDependencyEdge[];
  },
  PublicDiagnostic
> => {
  const contextKeys = Object.keys(machine.definition.context);
  const seenSlots = new Set<string>();
  const capturedBindings: CapturedBinding<ProviderDefinition>[] = [];
  const bindingEdges: ActorDependencyEdge[] = [];

  for (const binding of bindings) {
    const captured = captureBinding<ProviderDefinition>(binding);

    if (Result.isFailure(captured)) return Result.fail(captured.failure);
    const slot = captured.success.slot;

    if (!contextKeys.includes(slot)) return Result.fail(malformedBindingFailure(slot));

    if (seenSlots.has(slot)) return Result.fail(contextProviderFailure(slot, "ambiguous"));
    seenSlots.add(slot);
    const edge = validateContextBinding(captured.success, authority);

    if (Result.isFailure(edge)) return Result.fail(edge.failure);
    capturedBindings.push({
      ...captured.success,
      provider: {
        ...captured.success.provider,
        value: edge.success.providerRef,
      },
    });
    bindingEdges.push(edge.success.edge);
  }

  for (const slot of contextKeys) {
    if (!seenSlots.has(slot)) return Result.fail(contextProviderFailure(slot, "missing"));
  }

  return Result.succeed({
    bindings: copyArray(capturedBindings),
    edges: copyArray(bindingEdges),
  });
};

const validateDependencyEdges = (
  // oxlint-disable-next-line anti-slop/no-readonly -- NO_READONLY_CODEMOD: validation traverses const-inferred edges without mutating them.
  bindings: readonly ActorDependencyEdge[],
  // oxlint-disable-next-line anti-slop/no-readonly -- NO_READONLY_CODEMOD: validation traverses const-inferred edges without mutating them.
  dependencies: readonly ActorDependencyEdge[],
) => {
  const expected = new Map<ActorKey, Map<ActorKey, Set<string>>>();

  for (const edge of bindings) {
    let providers = expected.get(edge.consumer);

    if (providers === undefined) {
      providers = new Map();
      expected.set(edge.consumer, providers);
    }

    let slots = providers.get(edge.provider);

    if (slots === undefined) {
      slots = new Set();
      providers.set(edge.provider, slots);
    }

    slots.add(edge.slot);
  }

  const actual = new Map<ActorKey, Map<ActorKey, Set<string>>>();

  if (dependencies.length !== bindings.length) return Result.fail(invalidDependencyFailure());

  for (const edge of dependencies) {
    const validatedEdge = validateDependencyEdge(edge);

    if (Result.isFailure(validatedEdge)) return Result.fail(validatedEdge.failure);
    const admittedEdge = validatedEdge.success;
    let providers = actual.get(admittedEdge.consumer);

    if (providers === undefined) {
      providers = new Map();
      actual.set(admittedEdge.consumer, providers);
    }

    let slots = providers.get(admittedEdge.provider);

    if (slots === undefined) {
      slots = new Set();
      providers.set(admittedEdge.provider, slots);
    }

    if (slots.has(admittedEdge.slot)) return Result.fail(duplicateClaimFailure());
    slots.add(admittedEdge.slot);
  }

  for (const [consumer, providers] of expected) {
    for (const [provider, slots] of providers) {
      const actualSlots = actual.get(consumer)?.get(provider);

      if (actualSlots === undefined || [...slots].some((slot) => !actualSlots.has(slot)))
        return Result.fail(invalidDependencyFailure());
    }
  }

  return Result.succeed(copyArray(dependencies.map(copyDependencyEdge)));
};

const planAdmitsMachine = (plan: ReturnType<typeof appPlan>, machine: MachineRecordValue) =>
  // SAFETY: app-plan membership is an identity check; this boundary never reads Machine fields from the record.
  plan.admitsMachine(machine as Machine);

const validateAdmissionClaim = <A extends App, DefinitionValue extends MachineDefinition, I>(
  ref: ActorRef<Machine<DefinitionValue>>,
  sourceRef: ActorRef<Machine<DefinitionValue>>,
  authority: ActorAdmissionValidationContext<A, DefinitionValue, I>,
) => {
  const existing = authority.lookup(ref);

  if (Result.isSuccess(existing)) {
    if (authority.isAdmissionInFlight?.(sourceRef) !== true)
      return Result.fail(duplicateClaimFailure());
  } else if (existing.failure.code !== "MissingActorRef") {
    return Result.fail(existing.failure);
  }

  return Result.succeed(undefined);
};

/** Validates B02 admission data without registry, provider, selector, initializer, or Effect work. */
// oxlint-disable-next-line complexity -- one pure validator owns the ordered no-mutation admission checks.
const validateActorAdmissionUnchecked = <
  A extends App,
  DefinitionValue extends MachineDefinition,
  I,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
>(
  input: ActorAdmissionInput<A, DefinitionValue, I, ProviderDefinition>,
  authority: ActorAdmissionValidationContext<A, DefinitionValue, I>,
): Result.Result<
  ValidatedActorAdmission<A, DefinitionValue, I, ProviderDefinition>,
  PublicDiagnostic
> => {
  const capturedInput = copyObject({
    app: input.app,
    implementation: input.implementation,
    ref: input.ref,
    machineFacts: input.machineFacts,
    input: input.input,
    bindings: input.bindings,
    dependencies: input.dependencies,
  });

  if (!isConstructedApp(capturedInput.app) || capturedInput.app !== authority.app)
    return Result.fail(foreignRefFailure("app"));

  if (authority.plan !== undefined && appPlan(capturedInput.app) !== authority.plan)
    return Result.fail(foreignRefFailure("app"));

  if (capturedInput.implementation !== authority.implementation)
    return Result.fail(foreignRefFailure("app"));
  const actorRef = validateActorRef<DefinitionValue>(capturedInput.ref);

  if (Result.isFailure(actorRef)) return Result.fail(actorRef.failure);

  const plan = appPlan(capturedInput.app);

  if (!planAdmitsMachine(plan, actorRef.success.machine))
    return Result.fail(unadmittedMachineFailure(actorRef.success.machine.definition.id));

  const machineFacts = plan.resolveMachineFacts(actorRef.success.value.machine);

  if (!isOwnedMachineFactsFor(machineFacts, actorRef.success.value.machine))
    return Result.fail(unadmittedMachineFailure(actorRef.success.machine.definition.id));

  const typedMachineFacts = machineFacts;

  const claim = validateAdmissionClaim(actorRef.success.value, actorRef.success.source, authority);

  if (Result.isFailure(claim)) return Result.fail(claim.failure);

  if (authority.identity !== undefined) {
    if (!isCapturedActorRef(authority.identity.ref, actorRef.success))
      return Result.fail(foreignRefFailure("ref"));

    if (
      authority.identity.key === "" ||
      authority.identity.incarnation < 1 ||
      (authority.consumerKey !== undefined && authority.consumerKey !== authority.identity.key)
    )
      return Result.fail(foreignRefFailure("fence"));
  }

  const bindings = validateContextBindings(machineFacts, capturedInput.bindings, authority);

  if (Result.isFailure(bindings)) return Result.fail(bindings.failure);
  const dependencies = validateDependencyEdges(bindings.success.edges, capturedInput.dependencies);

  if (Result.isFailure(dependencies)) return Result.fail(dependencies.failure);
  const graph = validateGraph(dependencies.success);

  if (Result.isFailure(graph)) return Result.fail(graph.failure);

  const canonicalBindings: ActorContextBinding<DefinitionValue, ProviderDefinition>[] = [];

  for (const capturedBinding of bindings.success.bindings) {
    // SAFETY: captureBinding validated and copied every binding field before authority.lookup;
    // this assertion restores the consumer/provider generic correlation erased by reflection.
    canonicalBindings.push({
      slot: capturedBinding.slot,
      provider: capturedBinding.provider.value,
      providerFence: copyObject({ ...capturedBinding.providerFence }),
      select: capturedBinding.select,
    } as ActorContextBinding<DefinitionValue, ProviderDefinition>);
  }

  // SAFETY: the canonical ref, bindings, and dependency array are owned snapshots of the validated
  // input; the machine and identity values retain their exact nominal references.
  const canonicalInput = copyObject({
    app: capturedInput.app,
    implementation: capturedInput.implementation,
    ref: actorRef.success.value,
    machineFacts: typedMachineFacts,
    input: capturedInput.input,
    bindings: copyArray(canonicalBindings),
    dependencies: dependencies.success,
  });

  return Result.succeed({
    input: canonicalInput,
    identity: authority.identity,
    edges: dependencies.success,
    graph: graph.success,
  });
};

/** Validates admission without allowing hostile input reflection to escape the Result boundary. */
// RETURN_TYPE: The public validator preserves its typed diagnostic channel across reflective traps.
export const validateActorAdmission = <
  A extends App,
  DefinitionValue extends MachineDefinition,
  I,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
>(
  input: ActorAdmissionInput<A, DefinitionValue, I, ProviderDefinition>,
  authority: ActorAdmissionValidationContext<A, DefinitionValue, I>,
): Result.Result<
  ValidatedActorAdmission<A, DefinitionValue, I, ProviderDefinition>,
  PublicDiagnostic
> => {
  const captured = Result.try({
    try: () => validateActorAdmissionUnchecked(input, authority),
    catch: admissionReflectionDiagnostic,
  });

  if (Result.isFailure(captured)) return Result.fail(captured.failure);

  return captured.success;
};

/** Reanchors all validated consumer topology to the identity fence allocated by the runtime. */
export const normalizeValidatedActorAdmission = <
  A extends App,
  DefinitionValue extends MachineDefinition,
  I,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
>(
  validated: ValidatedActorAdmission<A, DefinitionValue, I, ProviderDefinition>,
  consumerKey: ActorKey,
): Result.Result<
  ValidatedActorAdmission<A, DefinitionValue, I, ProviderDefinition>,
  PublicDiagnostic
> => {
  const edges = copyArray(
    validated.edges.map((edge) => copyObject({ ...edge, consumer: consumerKey })),
  );

  const graph = validateGraph(edges);

  if (Result.isFailure(graph)) return Result.fail(graph.failure);

  return Result.succeed({
    ...validated,
    input: copyObject({ ...validated.input, dependencies: edges }),
    edges,
    graph: graph.success,
  });
};

const rollbackAdmission = (steps: AdmissionRollbackStep[]) =>
  Effect.gen(function* () {
    let cleanupCause: Cause.Cause<PublicDiagnostic> | undefined;

    for (let index = steps.length - 1; index >= 0; index -= 1) {
      const step = steps[index];

      if (step === undefined) continue;
      const released = yield* Effect.exit(step.release);

      if (Exit.isFailure(released)) {
        cleanupCause =
          cleanupCause === undefined
            ? Cause.fromReasons([...released.cause.reasons])
            : Cause.fromReasons([...cleanupCause.reasons, ...released.cause.reasons]);
      }
    }

    if (cleanupCause !== undefined) yield* Effect.failCause(cleanupCause);
  });

const normalizeAdmissionCause = <E>(cause: Cause.Cause<E>): Cause.Cause<E> => {
  if (Cause.hasFails(cause) || Cause.hasDies(cause) || Cause.hasInterrupts(cause)) return cause;

  return Cause.die(new Error("Actor admission completed with an empty Cause"));
};

const normalizeAdmissionExit = <A, E>(exit: Exit.Exit<A, E>): Exit.Exit<A, E> =>
  Exit.isSuccess(exit) ? exit : Exit.failCause(normalizeAdmissionCause(exit.cause));

const completeAdmissionExit = <A, E>(exit: Exit.Exit<A, E>): Effect.Effect<A, E> => {
  if (Exit.isSuccess(exit)) return Effect.succeed(exit.value);

  return Effect.failCause(normalizeAdmissionCause(exit.cause));
};

const makeTerminalEffect = <Value, Error, Requirements>(
  operation: Effect.Effect<Value, Error, Requirements>,
  retryOnFailure = false,
) => {
  let completion: Deferred.Deferred<Exit.Exit<Value, Error>> | undefined;

  const resolve = (exit: Exit.Exit<Value, Error>) =>
    Exit.isSuccess(exit) ? Effect.succeed(exit.value) : Effect.failCause(exit.cause);

  return () => {
    return Effect.suspend(() => {
      if (completion !== undefined)
        return Deferred.await(completion).pipe(Effect.flatMap((exit) => resolve(exit)));
      const cell = Deferred.makeUnsafe<Exit.Exit<Value, Error>>();
      completion = cell;

      return Effect.uninterruptible(
        Effect.exit(operation).pipe(
          Effect.flatMap((exit) =>
            Effect.gen(function* () {
              yield* Deferred.succeed(cell, exit);

              if (retryOnFailure && Exit.isFailure(exit) && completion === cell)
                completion = undefined;

              return exit;
            }),
          ),
          Effect.flatMap((exit) => resolve(exit)),
        ),
      );
    });
  };
};

/**
 * Creates the only individual disposal authority for one exposed actor.
 * Concurrent callers share one in-flight attempt; failed cleanup remains
 * retryable, while successful cleanup and tombstoning are terminal.
 */
export const makeActorLease = <
  A extends App,
  DefinitionValue extends MachineDefinition,
  I,
  CleanupError,
  Actor,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
>(
  options: ActorLeaseOptions<A, DefinitionValue, I, CleanupError, Actor, ProviderDefinition>,
): ActorLease<A, DefinitionValue, I, CleanupError, Actor, ProviderDefinition> => {
  const dispose = makeTerminalEffect(
    options.cleanup.pipe(
      Effect.flatMap(() => {
        if (options.tombstone === undefined) return Effect.succeed(undefined);
        const tombstoned = options.tombstone();

        return Result.isSuccess(tombstoned)
          ? Effect.succeed(undefined)
          : Effect.fail(tombstoned.failure);
      }),
    ),
    true,
  );

  return {
    actor: options.actor,
    admission: options.admission,
    cleanup: options.cleanupCause ?? Option.none(),
    dispose,
  };
};

type AdmissionTransactionPhase =
  | "reserved"
  | "prepared"
  | "attached"
  | "activated"
  | "registered"
  | "exposed";

type AdmissionTransactionState = {
  phase: AdmissionTransactionPhase;
  rollback: AdmissionRollbackStep[];
};

type AdmissionTransactionOwner = {
  state: () => AdmissionTransactionState;
  advance: (
    phase: Exclude<AdmissionTransactionPhase, "reserved" | "exposed">,
    rollback: AdmissionRollbackStep[],
  ) => void;
  expose: () => void;
};

const makeAdmissionTransactionOwner = (
  initialRollback: AdmissionRollbackStep[],
): AdmissionTransactionOwner => {
  let current: AdmissionTransactionState = {
    phase: "reserved",
    rollback: initialRollback,
  };

  return {
    state: () => current,
    advance: (phase, rollback) => {
      current = { phase, rollback };
    },
    expose: () => {
      current = { phase: "exposed", rollback: current.rollback };
    },
  };
};

/** Runs one validated reservation through preparation, attachment, activation, registration, and exposure. */
export const admitActor = <
  A extends App,
  DefinitionValue extends MachineDefinition,
  I,
  CleanupError = PublicDiagnostic,
  Actor = unknown,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
  Owners extends ActorAdmissionPhaseOwnerMap = DefaultActorAdmissionPhaseOwners,
>(
  input: ActorAdmissionInput<A, DefinitionValue, I, ProviderDefinition>,
  authority: ActorAdmissionTransactionAuthority<
    A,
    DefinitionValue,
    I,
    CleanupError,
    Actor,
    ProviderDefinition,
    Owners
  >,
): Effect.Effect<
  ExposedActorAdmission<A, DefinitionValue, I, CleanupError, Actor, ProviderDefinition>,
  PublicDiagnostic
> =>
  Effect.gen(function* () {
    const validation = validateActorAdmission(input, authority);

    if (Result.isFailure(validation)) return yield* Effect.fail(validation.failure);

    const reservation = yield* Effect.uninterruptible(authority.reserveOrJoin(validation.success));

    if (reservation.mode === "joined") {
      const terminal = yield* Deferred.await(reservation.existing);

      return yield* completeAdmissionExit(terminal);
    }

    const transactionOwner = makeAdmissionTransactionOwner(reservation.rollback);

    const includeReservation = (steps: AdmissionRollbackStep[]) =>
      reservation.rollback.length === 0 || steps[0] === reservation.rollback[0]
        ? steps
        : [...reservation.rollback, ...steps];

    const transaction = Effect.gen(function* () {
      // Keep the scheduler handoff inside the reservation rollback owner. An interrupted
      // leader must settle the shared completion and release the reserved identity.
      yield* Effect.yieldNow;

      const prepared = yield* authority.prepare(reservation.validated, reservation.admissionMode);
      transactionOwner.advance("prepared", includeReservation(prepared.rollback));

      const attached = yield* authority.attach(prepared);
      transactionOwner.advance("attached", includeReservation(attached.rollback));

      const activated = yield* authority.activate(attached);
      transactionOwner.advance("activated", includeReservation(activated.rollback));

      const registered = yield* authority.register(activated);
      transactionOwner.advance("registered", includeReservation(registered.rollback));

      const result = yield* authority.expose(registered);
      transactionOwner.expose();

      return result;
    });

    // Restore interruption only while the phase transaction runs. The surrounding mask keeps
    // rollback and the shared terminal Deferred completion owned by this leader.
    const completed = yield* Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        const primary = yield* Effect.exit(restore(transaction));

        if (Exit.isSuccess(primary) || transactionOwner.state().phase === "exposed") return primary;
        const cleanup = yield* Effect.exit(rollbackAdmission(transactionOwner.state().rollback));

        if (Exit.isFailure(cleanup))
          return Exit.failCause(
            Cause.fromReasons([...primary.cause.reasons, ...cleanup.cause.reasons]),
          );

        return primary;
      }).pipe(
        Effect.flatMap((terminal) => {
          const normalized = normalizeAdmissionExit(terminal);

          return Deferred.succeed(reservation.complete, normalized).pipe(Effect.as(normalized));
        }),
      ),
    );

    return yield* completeAdmissionExit(completed);
  });
