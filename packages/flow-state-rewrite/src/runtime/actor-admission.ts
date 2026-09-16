// oxlint-disable-next-line anti-slop/no-large-production-file -- actor admission owns identity, validation, transaction stages, leases, and rollback at one boundary.
import {
  Brand,
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
import { actorRef, type ActorRef } from "./actor-ref.js";
import type { PreparedActorSnapshot } from "./actor-engine.js";
import { copyArray, copyObject } from "./collection-copies.js";

/** Runtime-local stable identity shared by the later actor graphs. */
export type ActorKey = Brand.Branded<string, "ActorKey">;

/** One-based runtime-local actor lifetime token. */
export type ActorIncarnation = Brand.Branded<number, "ActorIncarnation">;

/** The stable ref, key, lifetime, and lease fence for one actor admission. */
export type ActorIdentity<DefinitionValue extends MachineDefinition = MachineDefinition> = {
  ref: ActorRef<Machine<DefinitionValue>>;
  key: ActorKey;
  incarnation: ActorIncarnation;
  leaseEpoch: number;
};

/** A local ref is created only by this registry and has no durable address input. */
export type LocalActorRef<DefinitionValue extends MachineDefinition = MachineDefinition> =
  Brand.Branded<ActorRef<Machine<DefinitionValue>, string, false>, "LocalActorRef">;

export type LocalActorIdentity<DefinitionValue extends MachineDefinition> = Omit<
  ActorIdentity<DefinitionValue>,
  "ref"
> & {
  ref: LocalActorRef<DefinitionValue>;
};

const makeActorKey = Brand.nominal<ActorKey>();

const makeActorIncarnation = Brand.nominal<ActorIncarnation>();

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

type ReflectableAdmissionValue = Exclude<WeakKey, symbol>;

type CapturedReflection = {
  prototype: ReflectableAdmissionValue | null;
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

const admissionReflectionDiagnostic = () =>
  Failure({
    code: "SchemaValidation",
    path: ["actorAdmission"],
    details: { reason: "reflection" },
    summary: "Actor admission reflection failed.",
    help: "Provide stable ordinary admission records.",
  });

const captureReflectionStructure = (
  value: ReflectableAdmissionValue,
  path: (string | number)[],
) => {
  const prototype = Object.getPrototypeOf(value);
  const repeatedPrototype = Object.getPrototypeOf(value);

  if (prototype !== repeatedPrototype)
    return Result.fail({ path, message: "Admission value changed its prototype" });

  const keys = Reflect.ownKeys(value);
  const repeatedKeys = Reflect.ownKeys(value);

  if (!isStableKeyList(keys, repeatedKeys))
    return Result.fail({ path, message: "Admission value changed its own keys" });

  return Result.succeed({ prototype, keys: repeatedKeys });
};

const captureReflectionProperties = (
  value: ReflectableAdmissionValue,
  path: (string | number)[],
  structure: { prototype: ReflectableAdmissionValue | null; keys: PropertyKey[] },
) => {
  const values = new Map<PropertyKey, unknown>();
  const enumerable = new Set<PropertyKey>();

  for (const key of structure.keys) {
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

  return Result.succeed({ ...structure, values, enumerable });
};

// Captures each reflective operation once and converts hostile traps into a diagnostic value.
const captureReflection = (value: unknown, path: (string | number)[]) => {
  const captured = Result.try({
    try: () => {
      if (!Array.isArray(value) && !Predicate.isObject(value))
        return Result.fail({ path, message: "Admission value must be an object" });

      const structure = captureReflectionStructure(value, path);

      if (Result.isFailure(structure)) return Result.fail(structure.failure);

      return captureReflectionProperties(value, path, structure.success);
    },
    catch: () => reflectionFailure(path),
  });

  if (Result.isFailure(captured)) return Result.fail(captured.failure);

  return captured.success;
};

const captureAdmissionReflection = (value: unknown) => {
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

const validateEnvelopeArrayLayout = (captured: CapturedReflection, path: (string | number)[]) => {
  if (captured.prototype !== Array.prototype)
    return Result.fail({ path, message: "Admission envelope collection must be an array" });

  const length = captured.values.get("length");

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
    captured.keys.length !== expectedKeys ||
    !captured.keys.every((key, index) =>
      index === length ? key === "length" : key === String(index),
    )
  ) {
    return Result.fail({ path, message: "Admission envelope collection must be dense" });
  }

  return Result.succeed(length);
};

const copyEnvelopeArrayEntries = (
  captured: CapturedReflection,
  length: number,
  path: (string | number)[],
) => {
  const capturedValues: unknown[] = [];

  for (let index = 0; index < length; index += 1) {
    const key = String(index);

    if (!captured.values.has(key) || !captured.enumerable.has(key)) {
      return Result.fail({
        path: [...path, index],
        message: "Admission envelope collection contains an invalid entry",
      });
    }

    capturedValues.push(captured.values.get(key));
  }

  return Result.succeed(capturedValues);
};

const captureEnvelopeArray = (value: unknown, path: (string | number)[]) => {
  const captured = captureReflection(value, path);

  if (Result.isFailure(captured)) return Result.fail(captured.failure);
  const length = validateEnvelopeArrayLayout(captured.success, path);

  if (Result.isFailure(length)) return Result.fail(length.failure);

  return copyEnvelopeArrayEntries(captured.success, length.success, path);
};

const readEnvelopeFields = (
  captured: CapturedReflection,
  names: Iterable<keyof EnvelopeRecord>,
) => {
  const values: unknown[] = [];

  for (const name of names) {
    if (!captured.values.has(name)) {
      return Result.fail({
        path: [name],
        message: `Admission envelope field is invalid: ${name}`,
      } satisfies EnvelopeCaptureFailure);
    }

    values.push(captured.values.get(name));
  }

  return Result.succeed(values);
};

const captureEnvelope = (value: unknown) => {
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

  const fields = readEnvelopeFields(captured.success, expectedKeys);

  if (Result.isFailure(fields)) return Result.fail(fields.failure);
  const [app, implementation, ref, input, bindings, dependencies] = fields.success;
  const capturedBindings = captureEnvelopeArray(bindings, ["bindings"]);

  if (Result.isFailure(capturedBindings)) return Result.fail(capturedBindings.failure);
  const capturedDependencies = captureEnvelopeArray(dependencies, ["dependencies"]);

  if (Result.isFailure(capturedDependencies)) return Result.fail(capturedDependencies.failure);

  return Result.succeed({
    app,
    implementation,
    ref,
    input,
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
export const decodeActorAdmissionEnvelope = (value: unknown) =>
  decodeAdmissionEnvelope(value).pipe(Result.mapError(fromSchemaError));

// FLOW_STATE_ALLOW_UNKNOWN: ActorDirectory stores the exact Deferred as an opaque heterogeneous join token.
type ActorAdmissionJoinCompletion = Deferred.Deferred<Exit.Exit<unknown, PublicDiagnostic>>;

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
  expose: <DefinitionValue extends MachineDefinition>(
    identity: ActorIdentity<DefinitionValue>,
  ) => Result.Result<ActorRegistryEntry<DefinitionValue, Actor>, PublicDiagnostic>;
  lookup: <DefinitionValue extends MachineDefinition>(
    ref: ActorRef<Machine<DefinitionValue>>,
  ) => Result.Result<ActorRegistryEntry<DefinitionValue, Actor>, PublicDiagnostic>;
  pending: <DefinitionValue extends MachineDefinition>(
    ref: ActorRef<Machine<DefinitionValue>>,
  ) => Option.Option<ActorAdmissionJoinCompletion>;
  attachPending: <DefinitionValue extends MachineDefinition>(
    identity: ActorIdentity<DefinitionValue>,
    completion: ActorAdmissionJoinCompletion,
  ) => Result.Result<void, PublicDiagnostic>;
  clearPending: <DefinitionValue extends MachineDefinition>(
    identity: ActorIdentity<DefinitionValue>,
    completion: ActorAdmissionJoinCompletion,
  ) => void;
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

// FLOW_STATE_ALLOW_UNKNOWN: stable slots retain heterogeneous machine identities and narrow them against the requested ref before exposure.
type StableSlot<Actor> =
  | { _tag: "vacant"; key: ActorKey }
  | {
      _tag: "pending";
      key: ActorKey;
      identity: unknown;
      completion: Option.Option<ActorAdmissionJoinCompletion>;
    }
  | {
      _tag: "registered";
      key: ActorKey;
      identity: unknown;
      actor: Actor;
      completion: Option.Option<ActorAdmissionJoinCompletion>;
    }
  | { _tag: "active"; key: ActorKey; identity: unknown; actor: Actor }
  | { _tag: "tombstoned"; key: ActorKey; tombstone: ActorTombstone };

// FLOW_STATE_ALLOW_UNKNOWN: local slots retain heterogeneous machine identities and compare exact identity objects before use.
type LocalEntry<Actor> = {
  identity: unknown;
  state: "reserved" | "registered" | "active";
  actor: Actor | undefined;
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

// Provenance marker only: this WeakSet retains no refs and is not an actor registry.
const localActorRefs = new WeakSet();

// RETURN_TYPE: Local entries narrow their retained actor only after registration.
const hasLocalActor = <Actor>(
  entry: LocalEntry<Actor>,
): entry is LocalEntry<Actor> & { actor: Actor } =>
  (entry.state === "registered" || entry.state === "active") && entry.actor !== undefined;

// RETURN_TYPE: The identity predicate proves the ref, machine, and authored id tuple before registry reuse.
const isActorIdentityFor = <DefinitionValue extends MachineDefinition>(
  identity: unknown,
  machine: Machine<DefinitionValue>,
  id: string,
): identity is ActorIdentity<DefinitionValue> => {
  if (!Predicate.isObject(identity)) return false;
  const ref = identity.ref;

  return Predicate.isObject(ref) && Object.is(ref.machine, machine) && ref.id === id;
};

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

// RETURN_TYPE: Keeps private mutable registry state behind the stable generic capability surface.
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
  const stableSlots = new Map<WeakKey, Map<string, StableSlot<Actor>>>();
  const localEntriesByKey = new Map<ActorKey, LocalEntry<Actor>>();

  const failure: <Value>(diagnostic: PublicDiagnostic) => Result.Result<Value, PublicDiagnostic> = (
    diagnostic,
  ) => Result.fail(diagnostic);

  const allocateIncarnation = (notify = true) => {
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
    const incarnation = makeActorIncarnation(nextIncarnation);

    if (nextIncarnation === MAX_SAFE_INTEGER) incarnationExhausted = true;
    else nextIncarnation += 1;

    if (notify) options.onAllocate?.("incarnation");

    return Result.succeed(incarnation);
  };

  const allocateLocalOrdinal = (notify = true) => {
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
  ) =>
    // SAFETY: the tuple segments make machine and ref boundaries injective even for delimiter-heavy authored names.
    makeActorKey(
      `runtime-${runtimeNonce}/stable/${tupleSegment(machine.definition.id)}/${tupleSegment(ref.id)}`,
    );

  const getStableSlot = <DefinitionValue extends MachineDefinition>(
    ref: ActorRef<Machine<DefinitionValue>>,
  ) => {
    const byId = stableSlots.get(ref.machine);

    return byId?.get(ref.id);
  };

  // RETURN_TYPE: Stable reservation failures use the registry's canonical diagnostic channel.
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

    let byId = stableSlots.get(ref.machine);

    if (byId === undefined) {
      byId = new Map();
      stableSlots.set(ref.machine, byId);
    }

    let slot = byId.get(ref.id);

    if (slot?._tag === "tombstoned") return failure(disposedIdentity());

    if (slot !== undefined && slot._tag !== "vacant") {
      const identity = slot.identity;

      if (!isActorIdentityFor(identity, ref.machine, ref.id))
        return failure(
          invalidIdentity(
            "The stable actor identity is inconsistent.",
            "Create a new runtime execution scope.",
          ),
        );

      return Result.succeed(identity);
    }

    const incarnation = allocateIncarnation();

    if (Result.isFailure(incarnation)) return failure(incarnation.failure);

    if (slot === undefined) {
      slot = {
        _tag: "vacant",
        key: stableKey(ref, machineFacts),
      };
      byId.set(ref.id, slot);
    }

    const identity: ActorIdentity<DefinitionValue> = {
      ref,
      key: slot.key,
      incarnation: incarnation.success,
      leaseEpoch: 0,
    };

    byId.set(ref.id, {
      _tag: "pending",
      key: slot.key,
      identity,
      completion: Option.none(),
    });

    return Result.succeed(identity);
  };

  // RETURN_TYPE: Local allocation failures keep the same diagnostic channel as stable reservations.
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
    const ref = Brand.nominal<LocalActorRef<DefinitionValue>>()(
      actorRef(machine, "local-" + runtimeNonce + "-" + incarnation.success),
    );

    const identity = {
      ref,
      // SAFETY: the local namespace is disjoint from stable tuple keys.
      key: makeActorKey(`runtime-${runtimeNonce}/local/${ordinal.success}`),
      incarnation: incarnation.success,
      leaseEpoch: 0,
    };

    const entry: LocalEntry<Actor> = {
      identity,
      state: "reserved",
      actor: undefined,
      localAllocation,
      deferredLocalAllocation,
    };

    localActorRefs.add(ref);
    localEntriesByKey.set(identity.key, entry);

    return Result.succeed(identity);
  };

  // RETURN_TYPE: Commit reports only the typed admission failure channel for the allocation notification.
  const commitLocal = <DefinitionValue extends MachineDefinition>(
    identity: LocalActorIdentity<DefinitionValue>,
  ): Result.Result<void, PublicDiagnostic> => {
    const entry = localEntriesByKey.get(identity.key);

    if (entry === undefined || entry.identity !== identity || !entry.deferredLocalAllocation)
      return failure(missingActorRef);

    entry.deferredLocalAllocation = false;
    options.onAllocate?.("incarnation");
    options.onAllocate?.("local-ordinal");

    return Result.succeed(undefined);
  };

  // RETURN_TYPE: Local reservation retains the same actor identity type and diagnostic channel as stable refs.
  const reserveLocal = <DefinitionValue extends MachineDefinition>(
    identity: ActorIdentity<DefinitionValue>,
  ): Result.Result<ActorIdentity<DefinitionValue>, PublicDiagnostic> => {
    const entry = localEntriesByKey.get(identity.key);

    if (
      !localActorRefs.has(identity.ref) ||
      entry === undefined ||
      entry.identity !== identity ||
      entry.state !== "reserved"
    )
      return failure(missingActorRef);

    return Result.succeed(identity);
  };

  // RETURN_TYPE: Registration retains the actor internally until the explicit exposure barrier.
  const register = <DefinitionValue extends MachineDefinition>(
    identity: ActorIdentity<DefinitionValue>,
    actor: Actor,
  ): Result.Result<ActorRegistryEntry<DefinitionValue, Actor>, PublicDiagnostic> => {
    if (localActorRefs.has(identity.ref)) {
      const entry = localEntriesByKey.get(identity.key);

      if (entry === undefined || entry.identity !== identity || entry.state !== "reserved")
        return failure(missingActorRef);
      entry.state = "registered";
      entry.actor = actor;
    } else {
      const slot = getStableSlot(identity.ref);

      if (slot?._tag !== "pending" || slot.identity !== identity) return failure(missingActorRef);

      const registered: StableSlot<Actor> = {
        _tag: "registered",
        key: slot.key,
        identity,
        actor,
        completion: slot.completion,
      };

      stableSlots.get(identity.ref.machine)?.set(identity.ref.id, registered);
    }

    return Result.succeed({ identity, actor });
  };

  // RETURN_TYPE: Exposure is the only transition that makes a registered actor visible to lookup.
  const expose = <DefinitionValue extends MachineDefinition>(
    identity: ActorIdentity<DefinitionValue>,
  ): Result.Result<ActorRegistryEntry<DefinitionValue, Actor>, PublicDiagnostic> => {
    if (!localActorRefs.has(identity.ref)) {
      const slot = getStableSlot(identity.ref);

      if (slot?._tag !== "registered" || slot.identity !== identity)
        return failure(missingActorRef);
      stableSlots.get(identity.ref.machine)?.set(identity.ref.id, {
        _tag: "active",
        key: slot.key,
        identity,
        actor: slot.actor,
      });

      return Result.succeed({ identity, actor: slot.actor });
    }

    const entry = localEntriesByKey.get(identity.key);

    if (entry === undefined || entry.identity !== identity || !hasLocalActor(entry))
      return failure(missingActorRef);
    entry.state = "active";

    return Result.succeed({ identity, actor: entry.actor });
  };

  // RETURN_TYPE: Lookup exposes only an active actor entry under the exact requested machine definition.
  const lookup = <DefinitionValue extends MachineDefinition>(
    ref: ActorRef<Machine<DefinitionValue>>,
  ): Result.Result<ActorRegistryEntry<DefinitionValue, Actor>, PublicDiagnostic> => {
    if (localActorRefs.has(ref)) return failure(missingActorRef);
    const slot = getStableSlot(ref);

    if (slot?._tag !== "active")
      return slot?._tag === "tombstoned" ? failure(disposedIdentity()) : failure(missingActorRef);
    const identity = slot.identity;

    if (!isActorIdentityFor(identity, ref.machine, ref.id)) return failure(missingActorRef);

    return Result.succeed({ identity, actor: slot.actor });
  };

  const pending = <DefinitionValue extends MachineDefinition>(
    ref: ActorRef<Machine<DefinitionValue>>,
  ) => {
    const slot = getStableSlot(ref);

    return slot?._tag === "pending" || slot?._tag === "registered"
      ? slot.completion
      : Option.none();
  };

  // RETURN_TYPE: Pending attachment reports the Directory's typed admission failure channel.
  const attachPending = <DefinitionValue extends MachineDefinition>(
    identity: ActorIdentity<DefinitionValue>,
    completion: ActorAdmissionJoinCompletion,
  ): Result.Result<void, PublicDiagnostic> => {
    const slot = getStableSlot(identity.ref);

    if (slot?._tag !== "pending" || slot.identity !== identity || Option.isSome(slot.completion))
      return failure(missingActorRef);

    stableSlots
      .get(identity.ref.machine)
      ?.set(identity.ref.id, { ...slot, completion: Option.some(completion) });

    return Result.succeed(undefined);
  };

  const clearPending = <DefinitionValue extends MachineDefinition>(
    identity: ActorIdentity<DefinitionValue>,
    completion: ActorAdmissionJoinCompletion,
  ) => {
    const slot = getStableSlot(identity.ref);

    if (
      (slot?._tag !== "pending" && slot?._tag !== "registered") ||
      slot.identity !== identity ||
      !Option.contains(slot.completion, completion)
    )
      return;

    const next: StableSlot<Actor> =
      slot._tag === "registered"
        ? {
            _tag: "registered",
            key: slot.key,
            identity: slot.identity,
            actor: slot.actor,
            completion: Option.none(),
          }
        : {
            _tag: "pending",
            key: slot.key,
            identity: slot.identity,
            completion: Option.none(),
          };

    stableSlots.get(identity.ref.machine)?.set(identity.ref.id, next);
  };

  const rollbackDeferredLocalAllocation = (entry: LocalEntry<Actor>) => {
    if (!entry.deferredLocalAllocation || entry.localAllocation === undefined) return;
    const allocation = entry.localAllocation;

    if (
      allocation.recycled ||
      nextIncarnation !== allocation.nextIncarnationAfter ||
      nextKeyOrdinal !== allocation.nextKeyOrdinalAfter
    ) {
      recycledLocalAllocations.push(allocation);

      return;
    }

    nextIncarnation = allocation.nextIncarnationBefore;
    nextKeyOrdinal = allocation.nextKeyOrdinalBefore;
    incarnationExhausted = allocation.incarnationExhaustedBefore;
    keyOrdinalExhausted = allocation.keyOrdinalExhaustedBefore;
  };

  // oxlint-disable-next-line anti-slop/no-excessive-cognitive-complexity -- one tagged ActorDirectory transition handles local and stable pre-exposure aborts.
  const rollback = <DefinitionValue extends MachineDefinition>(
    identity: ActorIdentity<DefinitionValue>,
  ) => {
    if (localActorRefs.has(identity.ref)) {
      const entry = localEntriesByKey.get(identity.key);

      if (
        entry === undefined ||
        entry.identity !== identity ||
        (entry.state !== "reserved" && entry.state !== "registered")
      )
        return;
      localEntriesByKey.delete(identity.key);
      rollbackDeferredLocalAllocation(entry);
      localActorRefs.delete(identity.ref);

      return;
    }

    const slot = getStableSlot(identity.ref);

    if ((slot?._tag === "pending" || slot?._tag === "registered") && slot.identity === identity)
      stableSlots.get(identity.ref.machine)?.set(identity.ref.id, {
        _tag: "vacant",
        key: slot.key,
      });
  };

  // RETURN_TYPE: Disposal preserves the typed diagnostic channel while moving the registered identity to terminal state.
  const tombstone = <DefinitionValue extends MachineDefinition>(
    identity: ActorIdentity<DefinitionValue>,
    disposedAtSequence: number,
  ): Result.Result<void, PublicDiagnostic> => {
    if (!Number.isSafeInteger(disposedAtSequence) || disposedAtSequence < 0) {
      return failure(
        invalidIdentity("The disposal sequence is invalid.", "Use a non-negative safe sequence."),
      );
    }

    const tombstoneValue = {
      key: identity.key,
      incarnation: identity.incarnation,
      disposedAtSequence,
    } satisfies ActorTombstone;

    if (!localActorRefs.has(identity.ref)) {
      const slot = getStableSlot(identity.ref);

      if (slot?._tag !== "active" || slot.identity !== identity) return failure(missingActorRef);
      stableSlots.get(identity.ref.machine)?.set(identity.ref.id, {
        _tag: "tombstoned",
        key: slot.key,
        tombstone: tombstoneValue,
      });

      return Result.succeed(undefined);
    }

    const entry = localEntriesByKey.get(identity.key);

    if (entry === undefined || entry.identity !== identity || entry.state !== "active")
      return failure(missingActorRef);
    localEntriesByKey.delete(identity.key);

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
    expose,
    lookup,
    pending,
    attachPending,
    clearPending,
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
// RETURN_TYPE: Keeps fresh and restored admission modes in the finite ActorAdmissionMode union for runtime dispatch.
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

// RETURN_TYPE: This guard admits non-empty strings before they become nominal actor keys.
const isActorKey = (value: unknown): value is ActorKey =>
  Predicate.isString(value) && value.length > 0;

// RETURN_TYPE: This guard narrows reflected numeric fence fields only after safe-range validation.
const isSafeNonNegativeInteger = (value: unknown): value is number =>
  Predicate.isNumber(value) && Number.isSafeInteger(value) && value >= 0;

// RETURN_TYPE: This guard narrows only positive safe integer values into the incarnation brand.
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

const lookupFailure = (slot: string, failure: PublicDiagnostic) => {
  if (failure.code === "DisposedActorRef") return failure;

  if (failure.code === "ForeignActorRef" || failure.code === "MismatchedActorRef")
    return foreignRefFailure("ref");

  if (failure.code === "MissingActorRef") return contextProviderFailure(slot, "missing");

  return failure;
};

type CapturedActorRef<DefinitionValue extends MachineDefinition = MachineDefinition> = {
  source: ActorRef<Machine<DefinitionValue>>;
  value: ActorRef<Machine<DefinitionValue>>;
  machine: Machine;
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
) => {
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

const validateFence = (fence: unknown, slot: string) => {
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
) => {
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

  // SAFETY: captureReflection proved the selector is a stable function data property; runtime
  // authority validation restores the admitted consumer/provider correlation before invocation.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reflection erases the validated provider snapshot parameter.
  const capturedSelect = select as (...args: [ActorContextSnapshot<ProviderDefinition>]) => void;

  return Result.succeed({
    slot,
    provider: provider.success,
    providerFence: providerFence.success,
    select: capturedSelect,
  });
};

const validateDependencyEdge = (edge: unknown) => {
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
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions -- reflection erases the validated slot-dependent selector correlation.
  const capturedBindings = copyArray(bindings) as unknown as ActorContextBinding<
    DefinitionValue,
    ProviderDefinition
  >[];

  return Result.succeed(capturedBindings);
};

const copyDependencyEdge = (edge: ActorDependencyEdge) => copyObject({ ...edge });

const copyGraphMap = (map: Map<ActorKey, ActorDependencyEdge[]>) =>
  new Map([...map.entries()].map(([key, edges]) => [key, edges.map(copyDependencyEdge)] as const));

const validateGraph = (
  // oxlint-disable-next-line anti-slop/no-readonly -- NO_READONLY_CODEMOD: graph validation accepts const-inferred edges without a preliminary copy.
  edges: readonly ActorDependencyEdge[],
) => {
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

  // RETURN_TYPE: The recursive depth-first visit returns the first cycle diagnostic or no failure.
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
  (Object.is(candidate.machine, captured.machine) &&
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
) => {
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
) => {
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

type DependencySlotIndex = Map<ActorKey, Map<ActorKey, Set<string>>>;

const recordDependencySlot = (index: DependencySlotIndex, edge: ActorDependencyEdge) => {
  let providers = index.get(edge.consumer);

  if (providers === undefined) {
    providers = new Map();
    index.set(edge.consumer, providers);
  }

  let slots = providers.get(edge.provider);

  if (slots === undefined) {
    slots = new Set();
    providers.set(edge.provider, slots);
  }

  const isNew = !slots.has(edge.slot);
  slots.add(edge.slot);

  return isNew;
};

type AdmissionDependencyEdges = ActorAdmissionInput<
  App,
  MachineDefinition,
  unknown
>["dependencies"];

const indexBindingDependencies = (bindings: AdmissionDependencyEdges) => {
  const index: DependencySlotIndex = new Map();

  for (const edge of bindings) recordDependencySlot(index, edge);

  return index;
};

const indexAdmittedDependencies = (dependencies: AdmissionDependencyEdges) => {
  const index: DependencySlotIndex = new Map();

  for (const edge of dependencies) {
    const validatedEdge = validateDependencyEdge(edge);

    if (Result.isFailure(validatedEdge)) return Result.fail(validatedEdge.failure);

    if (!recordDependencySlot(index, validatedEdge.success))
      return Result.fail(duplicateClaimFailure());
  }

  return Result.succeed(index);
};

const containsExpectedDependencySlots = (
  expected: DependencySlotIndex,
  actual: DependencySlotIndex,
) => {
  for (const [consumer, providers] of expected) {
    for (const [provider, slots] of providers) {
      const actualSlots = actual.get(consumer)?.get(provider);

      if (actualSlots === undefined || [...slots].some((slot) => !actualSlots.has(slot)))
        return false;
    }
  }

  return true;
};

const validateDependencyEdges = (
  bindings: AdmissionDependencyEdges,
  dependencies: AdmissionDependencyEdges,
) => {
  const expected = indexBindingDependencies(bindings);

  if (dependencies.length !== bindings.length) return Result.fail(invalidDependencyFailure());
  const actual = indexAdmittedDependencies(dependencies);

  if (Result.isFailure(actual)) return Result.fail(actual.failure);

  if (!containsExpectedDependencySlots(expected, actual.success))
    return Result.fail(invalidDependencyFailure());

  return Result.succeed(copyArray(dependencies.map(copyDependencyEdge)));
};

const planAdmitsMachine = (plan: ReturnType<typeof appPlan>, machine: Machine) =>
  isOwnedMachineFactsFor(plan.resolveMachineFacts(machine), machine);

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

const validateAdmissionMachine = <
  A extends App,
  DefinitionValue extends MachineDefinition,
  I,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
>(
  input: Pick<
    ActorAdmissionInput<A, DefinitionValue, I, ProviderDefinition>,
    "app" | "implementation" | "ref"
  >,
  authority: ActorAdmissionValidationContext<A, DefinitionValue, I>,
) => {
  if (!isConstructedApp(input.app) || input.app !== authority.app)
    return Result.fail(foreignRefFailure("app"));

  if (authority.plan !== undefined && appPlan(input.app) !== authority.plan)
    return Result.fail(foreignRefFailure("app"));

  if (input.implementation !== authority.implementation)
    return Result.fail(foreignRefFailure("app"));
  const actorRef = validateActorRef<DefinitionValue>(input.ref);

  if (Result.isFailure(actorRef)) return Result.fail(actorRef.failure);

  const plan = appPlan(input.app);

  if (!planAdmitsMachine(plan, actorRef.success.machine))
    return Result.fail(unadmittedMachineFailure(actorRef.success.machine.definition.id));

  const machineFacts = plan.resolveMachineFacts(actorRef.success.value.machine);

  if (!isOwnedMachineFactsFor(machineFacts, actorRef.success.value.machine))
    return Result.fail(unadmittedMachineFailure(actorRef.success.machine.definition.id));

  return Result.succeed({ actorRef: actorRef.success, machineFacts });
};

const validateAdmissionIdentity = <A extends App, DefinitionValue extends MachineDefinition, I>(
  actorRef: CapturedActorRef<DefinitionValue>,
  authority: ActorAdmissionValidationContext<A, DefinitionValue, I>,
) => {
  const claim = validateAdmissionClaim(actorRef.value, actorRef.source, authority);

  if (Result.isFailure(claim)) return Result.fail(claim.failure);
  const identity = authority.identity;

  if (identity !== undefined) {
    if (!isCapturedActorRef(identity.ref, actorRef)) return Result.fail(foreignRefFailure("ref"));

    if (
      identity.key === "" ||
      identity.incarnation < 1 ||
      (authority.consumerKey !== undefined && authority.consumerKey !== identity.key)
    )
      return Result.fail(foreignRefFailure("fence"));
  }

  return Result.succeed(undefined);
};

const canonicalizeAdmissionBindings = <
  DefinitionValue extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
>(
  bindings: CapturedBinding<ProviderDefinition>[],
) => {
  const canonicalBindings: ActorContextBinding<DefinitionValue, ProviderDefinition>[] = [];

  for (const capturedBinding of bindings) {
    // SAFETY: captureBinding validated and copied every binding field before authority.lookup;
    // this assertion restores the consumer/provider generic correlation erased by reflection.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- runtime authority validation restored the slot-dependent selector correlation.
    const canonicalBinding = {
      slot: capturedBinding.slot,
      provider: capturedBinding.provider.value,
      providerFence: copyObject({ ...capturedBinding.providerFence }),
      select: capturedBinding.select,
    } as ActorContextBinding<DefinitionValue, ProviderDefinition>;

    canonicalBindings.push(canonicalBinding);
  }

  return copyArray(canonicalBindings);
};

/** Validates B02 admission data without registry, provider, selector, initializer, or Effect work. */
const validateActorAdmissionUnchecked = <
  A extends App,
  DefinitionValue extends MachineDefinition,
  I,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
>(
  input: ActorAdmissionInput<A, DefinitionValue, I, ProviderDefinition>,
  authority: ActorAdmissionValidationContext<A, DefinitionValue, I>,
) => {
  const capturedInput = copyObject({
    app: input.app,
    implementation: input.implementation,
    ref: input.ref,
    machineFacts: input.machineFacts,
    input: input.input,
    bindings: input.bindings,
    dependencies: input.dependencies,
  });

  const machine = validateAdmissionMachine(capturedInput, authority);

  if (Result.isFailure(machine)) return Result.fail(machine.failure);
  const { actorRef, machineFacts } = machine.success;
  const identity = validateAdmissionIdentity(actorRef, authority);

  if (Result.isFailure(identity)) return Result.fail(identity.failure);

  const bindings = validateContextBindings(machineFacts, capturedInput.bindings, authority);

  if (Result.isFailure(bindings)) return Result.fail(bindings.failure);
  const dependencies = validateDependencyEdges(bindings.success.edges, capturedInput.dependencies);

  if (Result.isFailure(dependencies)) return Result.fail(dependencies.failure);
  const graph = validateGraph(dependencies.success);

  if (Result.isFailure(graph)) return Result.fail(graph.failure);

  const canonicalBindings = canonicalizeAdmissionBindings<DefinitionValue, ProviderDefinition>(
    bindings.success.bindings,
  );

  // SAFETY: the canonical ref, bindings, and dependency array are owned snapshots of the validated
  // input; the machine and identity values retain their exact nominal references.
  const canonicalInput = copyObject({
    app: capturedInput.app,
    implementation: capturedInput.implementation,
    ref: actorRef.value,
    machineFacts,
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
) => {
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

export const rollbackActorAdmission = (steps: AdmissionRollbackStep[]) =>
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

const normalizeAdmissionCause = <E>(cause: Cause.Cause<E>) => {
  if (Cause.hasFails(cause) || Cause.hasDies(cause) || Cause.hasInterrupts(cause)) return cause;

  return Cause.die(new Error("Actor admission completed with an empty Cause"));
};

export const normalizeActorAdmissionExit = <A, E>(exit: Exit.Exit<A, E>) =>
  Exit.isSuccess(exit) ? exit : Exit.failCause(normalizeAdmissionCause(exit.cause));

export const completeActorAdmissionExit = <A, E>(exit: Exit.Exit<A, E>) => {
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
) => {
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
