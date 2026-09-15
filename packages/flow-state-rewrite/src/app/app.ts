import { Effect, Predicate, Result, Schema, SchemaIssue } from "effect";
import { isConstructedOperation, requirements } from "../operation/operation.js";
import { RequirementsTypeId } from "../operation/operation.js";
import type { RequirementsCarrier, RequirementsOf } from "../operation/operation.js";
import type { OperationDeclaration } from "../operation/operation.js";
import { AuthoredName, isAuthoredName } from "../internal/authored-name.js";
import { firstConfigurationField } from "../internal/schema-issue.js";
import { isStableDataDescriptor, isStableKeyList } from "../internal/stable-observation.js";
import {
  isConstructedMachine,
  markMachineFacts,
  type Machine,
  type MachineRecordValue,
} from "../machine/machine.js";
import type { CompiledMachine, MachineDefinition, CompiledState } from "../machine/grammar.js";

/*
 * Composition:
 *
 * Stable capture:
 *   captureConfigurationRecord, readStableDataField
 *   captureModuleConfiguration, captureAppConfiguration, captureAppModules
 *
 * Admission:
 *   ModuleSchema, AppSchema, admitModuleConfiguration, admitAppConfiguration
 *
 * Indexing:
 *   indexMachine, indexDescriptors, indexModule, indexModules
 *
 * Publication:
 *   publishAppPlan
 *
 * Assembly:
 *   module, app
 */

export type { RequirementsOf } from "../operation/operation.js";

const moduleTypeId: unique symbol = Symbol("flow-state module");

const appTypeId: unique symbol = Symbol("flow-state app");

export type AppOwner = {
  [appTypeId]: true;
};

const constructedAppPlans = new WeakMap<AppOwner, StoredAppPlan>();

type AdmittedMachineRecord = Record<string, MachineAdmission>;

type CapturedMachineRecord<RecordValue extends MachineRecord = MachineRecord> = {
  value: RecordValue;
  admitted: AdmittedMachineRecord;
};

const moduleMachineSnapshots = new WeakMap<AnyModule, AdmittedMachineRecord>();

// RETURN_TYPE: Narrows the object reference before constructed-module membership lookup.
const isModuleReference = (value: unknown): value is AnyModule =>
  typeof value === "object" && value !== null;

// SAFETY: only validated module construction marks module values; membership is the admission boundary.
// RETURN_TYPE: Preserves the constructed-module predicate required by app module admission.
const isConstructedModule = (value: unknown): value is AnyModule =>
  isModuleReference(value) && moduleMachineSnapshots.has(value);

type MachineAdmission = Machine;

type MachineRecord = Record<string, MachineRecordValue>;

// oxlint-disable-next-line anti-slop/no-readonly -- NO_READONLY_CODEMOD: app authoring accepts const-inferred module tuples without requiring callers to copy them.
type ModuleList = readonly AnyModule[];

type AppMachine<Modules extends ModuleList> = Modules[number] extends infer ModuleValue
  ? ModuleValue extends AnyModule
    ? ModuleValue["machines"][keyof ModuleValue["machines"]] extends infer MachineValue
      ? MachineValue extends Machine<infer _DefinitionValue>
        ? MachineValue
        : MachineValue extends MachineRecordValue
          ? Machine
          : never
      : never
    : never
  : never;

type AppDescriptor<Modules extends ModuleList> =
  AppMachine<Modules> extends infer MachineValue
    ? MachineValue extends Machine<infer DefinitionValue>
      ? DefinitionValue["operations"][keyof DefinitionValue["operations"]]
      : never
    : never;

type PlanMachine<Modules extends ModuleList> = AppMachine<Modules>;

type AppMachineFacts = MachineRecordValue;

const capturedMachineSources = new WeakMap<MachineRecordValue, MachineRecordValue>();

type AdmissionRecord = {
  [moduleTypeId]?: true;
  kind?: unknown;
  id?: unknown;
  machines?: unknown;
  persistenceVersion?: unknown;
  modules?: unknown;
};

type ModuleConfiguration = {
  id: unknown;
  machines: unknown;
};

type AppConfiguration = {
  id: unknown;
  persistenceVersion: unknown;
  modules: unknown;
};

export type Module<
  Id extends string = string,
  Machines extends MachineRecord = MachineRecord,
> = RequirementsCarrier<RequirementsOf<Machines[keyof Machines]>> & {
  kind: "module";
  id: Id;
  machines: Machines;
  [moduleTypeId]: true;
};

export type AnyModule = RequirementsCarrier<unknown> & {
  kind: "module";
  id: string;
  machines: MachineRecord;
  [moduleTypeId]: true;
};

type AppPlan<
  Id extends string = string,
  PersistenceVersion extends string = string,
  Modules extends ModuleList = ModuleList,
> = {
  appId: Id;
  persistenceVersion: PersistenceVersion;
  modules: Modules;
  machines: PlanMachine<Modules>[];
  descriptors: AppDescriptor<Modules>[];
  resolveMachine: (id: string) => PlanMachine<Modules> | undefined;
  resolveMachineFacts: (machine: MachineRecordValue) => AppMachineFacts | undefined;
  admitsMachine: (machine: PlanMachine<Modules>) => boolean;
  resolveDescriptor: (id: string) => AppDescriptor<Modules> | undefined;
  admitsDescriptor: (descriptor: AppDescriptor<Modules>) => boolean;
};

type StoredAppPlan = Omit<AppPlan, "admitsMachine" | "admitsDescriptor"> & {
  admitsMachine: (machine: never) => boolean;
  admitsDescriptor: (descriptor: never) => boolean;
};

type FlattenModules<Modules extends ModuleList> = number extends Modules["length"]
  ? Record<never, never>
  : // oxlint-disable-next-line anti-slop/no-readonly -- NO_READONLY_CODEMOD: tuple recursion must match const-inferred module tuples without widening their element types.
    Modules extends readonly [infer Head extends AnyModule, ...infer Tail extends ModuleList]
    ? Head["machines"] & FlattenModules<Tail>
    : Record<never, never>;

export type App<
  Id extends string = string,
  PersistenceVersion extends string = string,
  Modules extends ModuleList = ModuleList,
> = RequirementsCarrier<RequirementsOf<Modules[number]>> &
  AppOwner & {
    kind: "app";
    id: Id;
    persistenceVersion: PersistenceVersion;
    modules: Modules;
    M: FlattenModules<Modules>;
  };

export type ModuleConfig<Id extends string, Machines extends MachineRecord> = {
  id: Id;
  machines: Machines;
};

export type AppConfig<
  Id extends string,
  PersistenceVersion extends string,
  Modules extends ModuleList,
> = {
  id: Id;
  persistenceVersion: PersistenceVersion;
  modules: Modules;
};

// RETURN_TYPE: Narrows the object reference before constructed-app membership lookup.
const isAppReference = (value: unknown): value is AppOwner =>
  typeof value === "object" && value !== null;

// SAFETY: only app construction records successful App identities in this package-private set.
// RETURN_TYPE: Preserves the constructed-app predicate required by the public admission check.
export const isConstructedApp = (value: unknown): value is App =>
  isAppReference(value) && constructedAppPlans.has(value);

const invalid = (message: string): never => {
  throw new Error(message);
};

export const appPlan = <
  const Id extends string,
  const PersistenceVersion extends string,
  const Modules extends ModuleList,
>(
  appValue: App<Id, PersistenceVersion, Modules>,
) => {
  const plan = constructedAppPlans.get(appValue);

  if (plan === undefined) invalid("App plan requires an App constructed by app()");

  // SAFETY: app() stores this plan under the same nominal App identity with the same generic inputs.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the private identity map preserves the App and AppPlan generic correlation.
  return plan as unknown as AppPlan<Id, PersistenceVersion, Modules>;
};

export const isOwnedMachineFactsFor = <DefinitionValue extends MachineDefinition>(
  value: unknown,
  source: Machine<DefinitionValue>,
): value is Machine<DefinitionValue> =>
  isConstructedMachine(value) && capturedMachineSources.get(value) === source;

type AppIndexes<
  Descriptor extends OperationDeclaration = OperationDeclaration,
  MachineValue extends MachineAdmission = MachineAdmission,
> = {
  /** Authored module identifiers used to reject duplicate module records. */
  moduleIds: Set<string>;
  /** Authored machine properties used to reject duplicate App.M keys. */
  machineKeys: Set<string>;
  /** Machine object identities used to reject the same machine value twice. */
  machineValues: Set<MachineValue>;
  /** Machine definition identifiers used for plan machine lookup. */
  machineIds: Map<string, MachineValue>;
  /** Authored machine properties used to publish the flattened App.M record. */
  machineRecord: Record<string, MachineValue>;
  /** Operation descriptor identifiers used for plan descriptor lookup. */
  descriptorIds: Map<string, Descriptor>;
  /** Captured per-machine operation values reused by machine-fact publication. */
  operationCatalogs: Map<MachineValue, Map<string, Descriptor>>;
};

// RETURN_TYPE: Narrows decoded configuration to the owned admission record shape.
const isRecord = (value: unknown): value is AdmissionRecord => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
};

const captureConfigurationRecord = (value: unknown, expected: string[], label: string) => {
  const record = isRecord(value) ? value : undefined;

  if (record === undefined) return Result.fail(`${label} must be an object`);
  const actual = Reflect.ownKeys(record);
  const repeated = Reflect.ownKeys(record);

  if (!isStableKeyList(actual, repeated)) return Result.fail(`${label} changed during admission`);

  if (actual.some((key) => !Predicate.isString(key)))
    return Result.fail(`${label} cannot contain symbol keys`);

  if (actual.length !== expected.length || expected.some((key) => !actual.includes(key))) {
    return Result.fail(`${label} must contain exactly ${expected.join(", ")}`);
  }

  return Result.succeed(record);
};

const readStableDataField = (value: AdmissionRecord, name: string, label: string) => {
  const descriptor = Object.getOwnPropertyDescriptor(value, name);
  const repeatedDescriptor = Object.getOwnPropertyDescriptor(value, name);

  if (
    descriptor === undefined ||
    repeatedDescriptor === undefined ||
    !isStableDataDescriptor(descriptor, repeatedDescriptor)
  ) {
    return Result.fail(`${label} field is invalid: ${name}`);
  }

  return Result.succeed(repeatedDescriptor.value);
};

const captureModuleConfiguration = (value: unknown) => {
  const record = captureConfigurationRecord(value, ["id", "machines"], "Module configuration");

  if (Result.isFailure(record)) return record;
  const id = readStableDataField(record.success, "id", "Module configuration");

  if (Result.isFailure(id)) return id;
  const machines = readStableDataField(record.success, "machines", "Module configuration");

  if (Result.isFailure(machines)) return machines;

  return Result.succeed({
    id: id.success,
    machines: machines.success,
  } satisfies ModuleConfiguration);
};

const captureAppConfiguration = (value: unknown) => {
  const record = captureConfigurationRecord(
    value,
    ["id", "persistenceVersion", "modules"],
    "App configuration",
  );

  if (Result.isFailure(record))
    return Result.fail({ path: [], message: record.failure } satisfies AppConfigurationFailure);
  const id = readStableDataField(record.success, "id", "App configuration");

  if (Result.isFailure(id))
    return Result.fail({ path: ["id"], message: id.failure } satisfies AppConfigurationFailure);

  const persistenceVersion = readStableDataField(
    record.success,
    "persistenceVersion",
    "App configuration",
  );

  if (Result.isFailure(persistenceVersion))
    return Result.fail({
      path: ["persistenceVersion"],
      message: persistenceVersion.failure,
    } satisfies AppConfigurationFailure);
  const modules = readStableDataField(record.success, "modules", "App configuration");

  if (Result.isFailure(modules))
    return Result.fail({
      path: ["modules"],
      message: modules.failure,
    } satisfies AppConfigurationFailure);

  return Result.succeed({
    id: id.success,
    persistenceVersion: persistenceVersion.success,
    modules: modules.success,
  } satisfies AppConfiguration);
};

// RETURN_TYPE: Preserves the entry tuple consumed by exact machine-record capture.
const captureMachineEntry = (
  record: AdmissionRecord,
  name: string,
): Result.Result<[string, MachineAdmission], string> => {
  const descriptor = Object.getOwnPropertyDescriptor(record, name);
  const repeatedDescriptor = Object.getOwnPropertyDescriptor(record, name);

  if (descriptor === undefined || repeatedDescriptor === undefined)
    return Result.fail(`Module machine is invalid: ${name}`);

  if (
    isStableDataDescriptor(descriptor, repeatedDescriptor) &&
    repeatedDescriptor.enumerable &&
    isConstructedMachine(repeatedDescriptor.value)
  ) {
    return Result.succeed([name, repeatedDescriptor.value]);
  }

  return Result.fail(`Module machine is invalid: ${name}`);
};

function captureMachineRecord<RecordValue extends MachineRecord>(
  value: RecordValue,
): Result.Result<CapturedMachineRecord<RecordValue>, string>;
function captureMachineRecord(value: unknown): Result.Result<CapturedMachineRecord, string>;
// RETURN_TYPE: Keeps the generic capture overload compatible with its schema failure channel.
function captureMachineRecord(value: unknown): Result.Result<CapturedMachineRecord, string> {
  const record = isRecord(value) ? value : undefined;

  if (record === undefined) return Result.fail("Module machines must be a plain record");
  const keys = Reflect.ownKeys(record);
  const repeatedKeys = Reflect.ownKeys(record);

  if (!isStableKeyList(keys, repeatedKeys))
    return Result.fail("Module machines changed during admission");

  const entries: Array<[string, MachineAdmission]> = [];

  for (const key of repeatedKeys) {
    const name = isAuthoredName(key) ? key : undefined;

    if (name === undefined) return Result.fail("Module machine keys must be authored strings");
    const entry = captureMachineEntry(record, name);

    if (Result.isFailure(entry)) return Result.fail(entry.failure);
    entries.push(entry.success);
  }

  const machineValues = new Set<MachineAdmission>();
  const machineIds = new Set<string>();

  for (const [, machine] of entries) {
    if (machineValues.has(machine))
      return Result.fail(`Module machine value is duplicated: ${String(machine.definition.id)}`);

    if (machineIds.has(machine.definition.id))
      return Result.fail(`Module machine id is duplicated: ${String(machine.definition.id)}`);
    machineValues.add(machine);
    machineIds.add(machine.definition.id);
  }

  // SAFETY: entries preserve every stable authored key and its constructed machine identity.
  const snapshot: MachineRecord = Object.fromEntries(entries);

  // SAFETY: snapshot preserves every authored key from the validated RecordValue input.
  return Result.succeed({
    // SAFETY: stable admitted entries preserve the caller's exact machine-record keys and values.
    value: snapshot,
    admitted: Object.fromEntries(entries),
  });
}

type ModuleAdmission<
  Id extends string = string,
  RecordValue extends MachineRecord = MachineRecord,
> = {
  id: Id;
  captured: CapturedMachineRecord<RecordValue>;
};

type AppConfigurationFailure = {
  path: PropertyKey[];
  message: string;
};

type AppModulesFailure = {
  path: number[];
  message: string;
};

// RETURN_TYPE: Preserves the reflected own-key list for dense indexed module capture.
const readAppModuleKeys = (array: unknown[]): Result.Result<PropertyKey[], AppModulesFailure> => {
  const keys = Reflect.ownKeys(array);
  const repeatedKeys = Reflect.ownKeys(array);

  if (!isStableKeyList(keys, repeatedKeys))
    return Result.fail({ path: [], message: "App modules changed during admission" });

  return Result.succeed(repeatedKeys);
};

const isOrdinaryAppModuleArray = (array: unknown[]) => {
  const prototype = Object.getPrototypeOf(array);
  const repeatedPrototype = Object.getPrototypeOf(array);

  return (
    prototype === Array.prototype &&
    repeatedPrototype === Array.prototype &&
    prototype === repeatedPrototype
  );
};

// RETURN_TYPE: Preserves the stable numeric length required by indexed module capture.
const readAppModuleLength = (array: unknown[]): Result.Result<number, AppModulesFailure> => {
  const length = Object.getOwnPropertyDescriptor(array, "length");
  const repeatedLength = Object.getOwnPropertyDescriptor(array, "length");

  if (length === undefined)
    return Result.fail({ path: [], message: "App modules must be an array" });

  if (repeatedLength === undefined)
    return Result.fail({ path: [], message: "App modules must be an array" });

  if (!isStableDataDescriptor(length, repeatedLength))
    return Result.fail({ path: [], message: "App modules must be an array" });

  if (
    !Predicate.isNumber(repeatedLength.value) ||
    !Number.isSafeInteger(repeatedLength.value) ||
    repeatedLength.value < 0 ||
    repeatedLength.value > 0xffff_ffff
  )
    return Result.fail({ path: [], message: "App modules must be an array" });

  return Result.succeed(repeatedLength.value);
};

const isCanonicalAppModuleKeyList = (keys: PropertyKey[], length: number) => {
  const expectedKeyCount = length + 1;

  if (
    keys.length !== expectedKeyCount ||
    keys.every((key, index) => (index === length ? key === "length" : key === String(index))) ===
      false
  )
    return false;

  return true;
};

// RETURN_TYPE: Preserves indexed descriptor admission and its public module failure path.
const captureAppModuleEntry = (
  array: unknown[],
  index: number,
): Result.Result<AnyModule, AppModulesFailure> => {
  const name = String(index);
  const descriptor = Object.getOwnPropertyDescriptor(array, name);
  const repeatedDescriptor = Object.getOwnPropertyDescriptor(array, name);

  if (descriptor === undefined)
    return Result.fail({
      path: [index],
      message: "App modules must be constructed module records",
    });

  if (repeatedDescriptor === undefined)
    return Result.fail({
      path: [index],
      message: "App modules must be constructed module records",
    });

  if (!isStableDataDescriptor(descriptor, repeatedDescriptor) || !repeatedDescriptor.enumerable)
    return Result.fail({
      path: [index],
      message: "App modules must be constructed module records",
    });

  if (!isConstructedModule(repeatedDescriptor.value))
    return Result.fail({
      path: [index],
      message: "App modules must be constructed module records",
    });

  return Result.succeed(repeatedDescriptor.value);
};

// RETURN_TYPE: Publishes captured module entries as the App admission collection.
const captureAppModules = (value: unknown): Result.Result<AnyModule[], AppModulesFailure> => {
  if (!Array.isArray(value))
    return Result.fail({ path: [], message: "App modules must be an array" });
  const array = value;
  const keys = readAppModuleKeys(array);

  if (Result.isFailure(keys)) return Result.fail(keys.failure);

  if (!isOrdinaryAppModuleArray(array))
    return Result.fail({
      path: [],
      message: "App modules must be constructed module records",
    });
  const length = readAppModuleLength(array);

  if (Result.isFailure(length)) return Result.fail(length.failure);

  if (!isCanonicalAppModuleKeyList(keys.success, length.success))
    return Result.fail({
      path: [],
      message: "App modules must be constructed module records",
    });

  const modules: AnyModule[] = [];

  for (let index = 0; index < length.success; index += 1) {
    const entry = captureAppModuleEntry(array, index);

    if (Result.isFailure(entry)) return Result.fail(entry.failure);
    modules.push(entry.success);
  }

  return Result.succeed(modules);
};

// RETURN_TYPE: Recursive issue descent retains the first leaf for the module failure projector.
const firstModuleSchemaIssue = (issue: SchemaIssue.Issue): SchemaIssue.Issue => {
  if ("issues" in issue) {
    const first = issue.issues.at(0);

    return first === undefined ? issue : firstModuleSchemaIssue(first);
  }

  if ("issue" in issue) return firstModuleSchemaIssue(issue.issue);

  return issue;
};

const projectModuleConfigurationFailure = (failure: Schema.SchemaError) => {
  if (firstConfigurationField(failure.issue) === "id")
    return invalid("Module id must be a valid authored name");
  const issue = firstModuleSchemaIssue(failure.issue);

  if (issue._tag === "InvalidValue" && issue.annotations?.message !== undefined)
    return invalid(issue.annotations.message);

  return invalid("Invalid Module configuration");
};

const OwnedMachineRecordSchema = Schema.declareConstructor<CapturedMachineRecord, unknown>()(
  [],
  () => (value, _ast, options) => {
    const captured = captureMachineRecord(value);

    return Effect.fromResult(captured).pipe(
      Effect.mapError((message) => new SchemaIssue.InvalidValue({ message }, value, options)),
    );
  },
);

const ModuleFieldsSchema = Schema.Struct({
  id: AuthoredName,
  machines: OwnedMachineRecordSchema,
});

const decodeModuleFields = Schema.decodeUnknownResult(ModuleFieldsSchema, {
  onExcessProperty: "error",
});

const ModuleSchema = Schema.declareConstructor<ModuleAdmission, unknown>()(
  [],
  () => (value, _ast, options) => {
    const capturedConfiguration = captureModuleConfiguration(value);

    if (Result.isFailure(capturedConfiguration))
      return Effect.fail(
        new SchemaIssue.InvalidValue({ message: capturedConfiguration.failure }, value, options),
      );
    const decoded = decodeModuleFields(capturedConfiguration.success);

    if (Result.isFailure(decoded)) return Effect.fail(decoded.failure.issue);

    return Effect.succeed({ id: decoded.success.id, captured: decoded.success.machines });
  },
);

const decodeModule = Schema.decodeUnknownResult(ModuleSchema);

type AppAdmission<
  Id extends string = string,
  PersistenceVersion extends string = string,
  Modules extends ModuleList = ModuleList,
> = {
  id: Id;
  persistenceVersion: PersistenceVersion;
  modules: Modules;
};

const ConstructedModuleArraySchema = Schema.declareConstructor<AnyModule[], unknown>()(
  [],
  () => (value, _ast, options) => {
    const captured = captureAppModules(value);

    return Effect.fromResult(captured).pipe(
      Effect.mapError(({ path, message }) => {
        const issue = new SchemaIssue.InvalidValue({ message }, value, options);

        return path.length === 0 ? issue : new SchemaIssue.Pointer(path, issue);
      }),
    );
  },
);

const AppFieldsSchema = Schema.Struct({
  id: AuthoredName,
  persistenceVersion: AuthoredName,
  modules: ConstructedModuleArraySchema,
});

const decodeAppFields = Schema.decodeUnknownResult(AppFieldsSchema, {
  onExcessProperty: "error",
});

// RETURN_TYPE: Recursive issue descent retains the first leaf for the App failure projector.
const firstAppSchemaIssue = (issue: SchemaIssue.Issue): SchemaIssue.Issue => {
  if ("issues" in issue) {
    const first = issue.issues.at(0);

    return first === undefined ? issue : firstAppSchemaIssue(first);
  }

  if ("issue" in issue) return firstAppSchemaIssue(issue.issue);

  return issue;
};

const projectAppConfigurationFailure = (failure: Schema.SchemaError) => {
  const issue = firstAppSchemaIssue(failure.issue);

  if (issue._tag === "InvalidValue" && issue.annotations?.message !== undefined)
    return invalid(issue.annotations.message);
  const field = firstConfigurationField(failure.issue);

  if (field === "id") return invalid("App id must be a valid authored name");

  if (field === "persistenceVersion")
    return invalid("Persistence version must be a valid authored name");

  return invalid("Invalid App configuration");
};

const AppSchema = Schema.declareConstructor<AppAdmission, unknown>()(
  [],
  () => (value, _ast, options) => {
    const capturedConfiguration = captureAppConfiguration(value);

    if (Result.isFailure(capturedConfiguration)) {
      const issue = new SchemaIssue.InvalidValue(
        { message: capturedConfiguration.failure.message },
        value,
        options,
      );

      return Effect.fail(
        capturedConfiguration.failure.path.length === 0
          ? issue
          : new SchemaIssue.Pointer(capturedConfiguration.failure.path, issue),
      );
    }

    const decoded = decodeAppFields(capturedConfiguration.success);

    if (Result.isFailure(decoded)) return Effect.fail(decoded.failure.issue);

    return Effect.succeed(decoded.success);
  },
);

const decodeApp = Schema.decodeUnknownResult(AppSchema);

function admitModuleConfiguration<Id extends string, Machines extends MachineRecord>(
  config: ModuleConfig<Id, Machines>,
): ModuleAdmission<Id, Machines>;
function admitModuleConfiguration(input: unknown): ModuleAdmission;
// RETURN_TYPE: Overload implementation return anchors the decoded module admission shape.
function admitModuleConfiguration(input: unknown): ModuleAdmission {
  return decodeModule(input).pipe(Result.getOrThrowWith(projectModuleConfigurationFailure));
}

function admitAppConfiguration<
  Id extends string,
  PersistenceVersion extends string,
  Modules extends ModuleList,
>(
  config: AppConfig<Id, PersistenceVersion, Modules>,
): AppAdmission<Id, PersistenceVersion, Modules>;
function admitAppConfiguration(input: unknown): AppAdmission;
// RETURN_TYPE: Overload implementation return anchors the decoded app admission shape.
function admitAppConfiguration(input: unknown): AppAdmission {
  return decodeApp(input).pipe(Result.getOrThrowWith(projectAppConfigurationFailure));
}

const indexMachine = <
  Descriptor extends OperationDeclaration,
  MachineValue extends MachineAdmission,
>(
  name: string,
  machine: MachineValue,
  indexes: AppIndexes<Descriptor, MachineValue>,
) => {
  if (indexes.machineKeys.has(name)) invalid(`App machine property is duplicated: ${name}`);

  if (indexes.machineValues.has(machine))
    invalid(`App machine value is duplicated: ${String(machine.definition.id)}`);

  if (indexes.machineIds.has(machine.definition.id))
    invalid(`App machine id is duplicated: ${String(machine.definition.id)}`);
  indexes.machineKeys.add(name);
  indexes.machineValues.add(machine);
  indexes.machineIds.set(machine.definition.id, machine);
  indexes.machineRecord[name] = machine;
};

const isCapturedOperation = <Descriptor extends OperationDeclaration>(
  value: unknown,
  descriptorValue: unknown,
): value is Descriptor => isConstructedOperation(value) && value === descriptorValue;

// oxlint-disable-next-line anti-slop/no-excessive-cognitive-complexity -- one boundary owns the stable key, descriptor, and identity observations.
const indexDescriptors = <
  Descriptor extends OperationDeclaration,
  MachineValue extends MachineAdmission,
>(
  machine: MachineValue,
  indexes: AppIndexes<Descriptor, MachineValue>,
) => {
  const operations = machine.definition.operations;
  const catalog = new Map<string, Descriptor>();
  const keys = Object.keys(operations);
  const repeatedKeys = Object.keys(operations);

  if (!isStableKeyList(keys, repeatedKeys)) {
    invalid("App operation catalog changed during admission");

    return;
  }

  for (const key of repeatedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(operations, key);
    const repeatedDescriptor = Object.getOwnPropertyDescriptor(operations, key);
    // SAFETY: the operation key is captured from the stable own-key list; Reflect.get is the required hostile-proxy observation.
    // oxlint-disable-next-line anti-slop/no-reflect-get
    const reflected = Reflect.get(operations, key);

    if (
      descriptor === undefined ||
      repeatedDescriptor === undefined ||
      !isStableDataDescriptor(descriptor, repeatedDescriptor) ||
      !repeatedDescriptor.enumerable ||
      !isCapturedOperation<Descriptor>(reflected, repeatedDescriptor.value)
    ) {
      invalid(`App operation descriptor is invalid: ${key}`);

      return;
    }

    const operation = reflected;
    catalog.set(key, operation);
    const existing = indexes.descriptorIds.get(operation.id);

    if (existing !== undefined && existing !== operation) {
      invalid(`App operation descriptor is duplicated: ${String(operation.id)}`);

      return;
    }

    if (existing === undefined) {
      // SAFETY: the admitted machine is indexed into the same AppDescriptor union that owns this map.
      indexes.descriptorIds.set(operation.id, operation);
    }
  }

  indexes.operationCatalogs.set(machine, catalog);
};

type AdmittedMachineRecordFor<ModuleValue extends AnyModule> = {
  [Key in keyof ModuleValue["machines"]]: ModuleValue["machines"][Key];
};

const indexModule = <Modules extends ModuleList, ModuleValue extends Modules[number]>(
  moduleValue: ModuleValue,
  indexes: AppIndexes<AppDescriptor<Modules>, PlanMachine<Modules>>,
) => {
  if (indexes.moduleIds.has(moduleValue.id))
    invalid(`App module id is duplicated: ${String(moduleValue.id)}`);
  indexes.moduleIds.add(moduleValue.id);

  const machines = moduleMachineSnapshots.get(moduleValue);

  if (machines === undefined) invalid("App modules must be constructed module records");
  // SAFETY: module construction stores this exact module's admitted machine values in the private snapshot.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the private snapshot preserves ModuleValue machine keys and values.
  const admittedMachines = machines as AdmittedMachineRecordFor<ModuleValue>;

  for (const [name, machine] of Object.entries(admittedMachines)) {
    indexMachine(name, machine, indexes);
    indexDescriptors(machine, indexes);
  }
};

const indexModules = <Modules extends ModuleList>(modules: Modules) => {
  const indexes: AppIndexes<AppDescriptor<Modules>, PlanMachine<Modules>> = {
    moduleIds: new Set<string>(),
    machineKeys: new Set<string>(),
    machineValues: new Set(),
    machineIds: new Map(),
    machineRecord: Object.create(null),
    descriptorIds: new Map(),
    operationCatalogs: new Map(),
  };

  for (const moduleValue of modules) indexModule(moduleValue, indexes);

  return indexes;
};

type StateCaptureContainer = Record<string, unknown> | unknown[];

const isStateCaptureContainer = (value: unknown): value is StateCaptureContainer =>
  Array.isArray(value) || Predicate.isObject(value);

const isStateToken = (value: unknown) =>
  Predicate.isObject(value) &&
  value.kind === "state" &&
  Predicate.isString(value.name) &&
  Predicate.isString(value.id);

// oxlint-disable-next-line anti-slop/no-excessive-cognitive-complexity -- recursive state validation keeps one cycle-aware ownership check at the capture boundary.
const isStateTable = (
  value: unknown,
  active = new WeakSet<StateCaptureContainer>(),
): value is Record<string, unknown> => {
  if (!Predicate.isObject(value) || Array.isArray(value) || isStateToken(value)) return false;

  if (active.has(value)) return false;

  active.add(value);

  for (const key of Object.keys(value)) {
    const child = value[key];

    if (isStateToken(child)) continue;

    if (
      !Predicate.isObject(child) ||
      Array.isArray(child) ||
      !Object.prototype.hasOwnProperty.call(child, "S") ||
      !isStateTable(child.S, active)
    )
      return false;
  }

  active.delete(value);

  return true;
};

const isStateBranch = (
  value: unknown,
): value is Record<string, unknown> & { S: Record<string, unknown> } =>
  Predicate.isObject(value) &&
  !Array.isArray(value) &&
  !isStateToken(value) &&
  Object.prototype.hasOwnProperty.call(value, "S") &&
  isStateTable(value.S);

const copyRecord = <Value, CopiedValue>(
  source: Record<string, Value>,
  copy: (value: Value) => CopiedValue,
): Record<string, CopiedValue> => {
  const result: Record<string, CopiedValue> = Object.create(null);

  for (const key of Object.keys(source)) {
    const value = source[key];

    if (value !== undefined) result[key] = copy(value);
  }

  return result;
};

const copyAuthoredStates = (value: unknown[]): unknown[] => {
  const seen = new WeakMap<StateCaptureContainer, unknown>();

  const copy = (current: unknown): unknown => {
    if (!isStateCaptureContainer(current)) return current;
    const existing = seen.get(current);

    if (existing !== undefined) return existing;

    if (Array.isArray(current)) {
      const result: unknown[] = [];
      seen.set(current, result);

      for (const item of current) result.push(copy(item));

      return result;
    }

    const result: Record<string, unknown> = Object.create(null);
    seen.set(current, result);

    for (const [key, item] of Object.entries(current)) result[key] = copy(item);

    return result;
  };

  // SAFETY: the recursive copy preserves the authored state container shape while owning every structural nested container.
  return copy(value) as unknown[];
};

const copyStateTable = <Value>(source: Value): Value => {
  const seen = new WeakMap<StateCaptureContainer, unknown>();

  const copy = (current: unknown): unknown => {
    if (!isStateTable(current) && !isStateBranch(current)) return current;
    const existing = seen.get(current);

    if (existing !== undefined) return existing;
    const result: Record<string, unknown> = Object.create(null);
    seen.set(current, result);

    for (const key of Object.keys(current)) {
      const value = current[key];

      result[key] = isStateBranch(value) ? copy(value) : value;
    }

    if (isStateBranch(current)) result.S = copy(current.S);

    return result;
  };

  // SAFETY: the caller supplies the app-time runtime state table, and the recursive copy preserves its exact generic shape.
  return copy(source) as Value;
};

const copyCapturedOperations = (
  catalog: Map<string, OperationDeclaration>,
): Record<string, OperationDeclaration> => {
  const result: Record<string, OperationDeclaration> = Object.create(null);

  for (const [key, descriptor] of catalog) result[key] = descriptor;

  return result;
};

const copyMachineDefinition = (
  source: MachineDefinition,
  operationCatalog: Map<string, OperationDeclaration>,
): MachineDefinition => {
  const authoredStates = (source as MachineDefinition & { states?: unknown[] }).states;

  return {
    ...source,
    // oxlint-disable-next-line anti-slop/no-conditional-empty-object-spread -- preserve the optional authored state container while copying the definition.
    ...(authoredStates === undefined ? {} : { states: copyAuthoredStates(authoredStates) }),
    S: copyStateTable(source.S),
    E: copyRecord(source.E, (event) => event),
    context: copyRecord(source.context, (selector) => selector),
    operations: copyCapturedOperations(operationCatalog),
  };
};

// RETURN_TYPE: The state discriminant and private DefinitionValue correlation must remain visible to the capture owner.
const copyCompiledState = <DefinitionValue extends MachineDefinition>(
  source: CompiledState<DefinitionValue>,
): CompiledState<DefinitionValue> => {
  // SAFETY: source.handlers contains only admitted event-name keys; each transition record is cloned without changing its DefinitionValue witness.
  const handlers = Object.fromEntries(
    Object.entries(source.handlers).map(([name, transitions]) => [
      name,
      transitions === undefined ? undefined : transitions.map((transition) => ({ ...transition })),
    ]),
  ) as CompiledState<DefinitionValue>["handlers"];

  const copied = {
    ...source,
    handlers,
    redirects: source.redirects.map((redirect) => ({ ...redirect })),
    activities: copyRecord(source.activities, (activity) => activity),
    timers: copyRecord(source.timers, (timer) => ({ ...timer })),
    children: [...source.children],
  };

  // SAFETY: the discriminant and state-specific fields are retained from the admitted compiled state; only structural containers are replaced.
  return copied as CompiledState<DefinitionValue>;
};

const copyCompiledMachine = <DefinitionValue extends MachineDefinition>(
  source: CompiledMachine<DefinitionValue>,
): CompiledMachine<DefinitionValue> => ({
  states: copyRecord(source.states, copyCompiledState),
  context: source.context.map((registration) => ({ ...registration })),
  memory: source.memory.map((registration) => ({ ...registration })),
});

const captureMachineFacts = <DefinitionValue extends MachineDefinition>(
  source: Machine<DefinitionValue>,
  operationCatalog: Map<string, OperationDeclaration>,
): Machine<DefinitionValue> => {
  // SAFETY: App construction has already admitted this machine; the private shell retains its exact typed definition and compiled behavior while the public shell remains the identity token.
  // SAFETY: the cloned definition and compiled containers retain the source machine's private generic correlation.
  const captured = markMachineFacts({
    definition: copyMachineDefinition(source.definition, operationCatalog),
    compiled: copyCompiledMachine(source.compiled),
  } as Machine<DefinitionValue>);

  capturedMachineSources.set(captured, source);

  return captured;
};

const publishAppPlan = <
  Id extends string,
  PersistenceVersion extends string,
  Modules extends ModuleList,
>(
  admitted: AppAdmission<Id, PersistenceVersion, Modules>,
  indexes: AppIndexes<AppDescriptor<Modules>, PlanMachine<Modules>>,
) => {
  // SAFETY: retain a publication copy; the private identity list remains owned by App construction.
  const privateDescriptors: AppDescriptor<Modules>[] = [...indexes.descriptorIds.values()];
  const descriptors = privateDescriptors.slice();
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the admitted module tuple supplies this exact PlanMachine union.
  const planMachines = [...indexes.machineValues];

  const machineFacts = new Map<MachineRecordValue, AppMachineFacts>(
    planMachines.map((machine) => {
      const operationCatalog =
        indexes.operationCatalogs.get(machine) ??
        invalid("App operation catalog was not captured for an admitted machine");

      return [
        machine,
        // SAFETY: every indexed machine is admitted as a constructed MachineRecordValue.
        captureMachineFacts(machine, operationCatalog),
      ];
    }),
  );

  // SAFETY: the ID map contains only machines admitted from the exact module tuple.
  const resolveMachine = (id: string) => indexes.machineIds.get(id);

  const resolveMachineFacts = (machine: MachineRecordValue): AppMachineFacts | undefined => {
    const captured = machineFacts.get(machine);

    if (captured === undefined) return undefined;

    return captured;
  };

  return {
    appId: admitted.id,
    persistenceVersion: admitted.persistenceVersion,
    modules: admitted.modules,
    machines: planMachines,
    descriptors,
    // SAFETY: the ID map contains only identities admitted from the exact module machine records.
    resolveMachine,
    resolveMachineFacts,
    admitsMachine: (candidate) =>
      Predicate.isObject(candidate) && indexes.machineValues.has(candidate),
    resolveDescriptor: (id: string) => indexes.descriptorIds.get(id),
    admitsDescriptor: (candidate) =>
      Predicate.isObject(candidate) &&
      privateDescriptors.some((descriptor) => descriptor === candidate),
  } satisfies AppPlan<Id, PersistenceVersion, Modules>;
};

export const module = <const Id extends string, const Machines extends MachineRecord>(
  config: ModuleConfig<Id, Machines>,
) => {
  const admitted = admitModuleConfiguration(config);

  const moduleValue: Module<Id, Machines> = {
    kind: "module",
    id: admitted.id,
    machines: admitted.captured.value,
    [moduleTypeId]: true,
    [RequirementsTypeId]: requirements,
  };

  moduleMachineSnapshots.set(moduleValue, admitted.captured.admitted);

  return moduleValue;
};

export const app = <
  const Id extends string,
  const PersistenceVersion extends string,
  const Modules extends ModuleList,
>(
  config: AppConfig<Id, PersistenceVersion, Modules>,
) => {
  const admitted = admitAppConfiguration(config);
  const indexes = indexModules(admitted.modules);
  const plan = publishAppPlan(admitted, indexes);

  // SAFETY: every key and value was admitted by indexMachine in this traversal.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the admitted record retains the inferred keyed machine intersection.
  const machineRecord = indexes.machineRecord as FlattenModules<Modules>;

  // RETURN_TYPE: Preserves the exact generic App shell and requirement carrier at assembly.
  const appValue: App<Id, PersistenceVersion, Modules> = {
    kind: "app",
    id: admitted.id,
    persistenceVersion: admitted.persistenceVersion,
    modules: admitted.modules,
    M: machineRecord,
    [appTypeId]: true,
    [RequirementsTypeId]: requirements,
  };

  constructedAppPlans.set(appValue, plan);

  return appValue;
};
