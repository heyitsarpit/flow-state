/* oxlint-disable anti-slop/no-nullish-function-contracts -- AppPlan uses undefined for synchronous lookup misses. */
import { Predicate, Result } from "effect";
import { RequirementsTypeId, type RequirementsCarrier } from "../operation/operation.js";
import type { RequirementsOf as OperationRequirementsOf } from "../operation/operation.js";
import { utf8ByteLength } from "../definition/utf8.js";
import type {
  DefinitionConstraint,
  DefinitionValue,
  OperationDeclaration,
  OperationDeclarations,
} from "../definition/domain.js";
import { isConstructedMachine } from "../machine/machine.js";
import type { CompiledMachine, Machine } from "../machine/machine.js";
import type { MachineNodeConfiguration } from "../machine/grammar.js";
import { isConstructedOperation } from "../operation/operation.js";

const moduleTypeId: unique symbol = Symbol("flow-state module");

type MachineAdmission = Pick<Machine, "id" | "definition" | "operations">;

type MachineRecord = Readonly<Record<string, MachineAdmission>>;

type AdmissionRecord = {
  readonly [moduleTypeId]?: true;
  readonly kind?: unknown;
  readonly id?: unknown;
  readonly machines?: unknown;
};

type OperationRegistry<Value extends OperationDeclarations> = Readonly<{
  [Key in keyof Value]: OperationDeclaration;
}>;

type RecordRequirements<Value> = Value extends OperationDeclarations
  ? Value extends OperationRegistry<Value>
    ? OperationRequirementsOf<Value[keyof Value]>
    : never
  : never;

type MachineRequirements<Value> = Value extends {
  readonly operations: infer Operations;
}
  ? RecordRequirements<Operations>
  : never;

export type RequirementsOf<Value> =
  Value extends RequirementsCarrier<infer Requirements>
    ? Requirements
    : Value extends { readonly operations: infer Operations }
      ? RecordRequirements<Operations>
      : Value extends readonly unknown[]
        ? MachineRequirements<Value[number]>
        : never;

type ModuleRequirements<Modules extends readonly AnyModule[]> =
  Modules[number] extends infer ModuleValue
    ? ModuleValue extends AnyModule
      ? RequirementsOf<ModuleValue>
      : never
    : never;

export type Module<
  Id extends string = string,
  Machines extends MachineRecord = MachineRecord,
> = RequirementsCarrier<MachineRequirements<Machines[keyof Machines]>> & {
  readonly kind: "module";
  readonly id: Id;
  readonly machines: Machines;
  readonly [moduleTypeId]: true;
};

export type AnyModule = {
  readonly kind: "module";
  readonly id: string;
  readonly machines: MachineRecord;
  readonly [moduleTypeId]: true;
};

export type AppPlan<
  Id extends string = string,
  PersistenceVersion extends string = string,
  Modules extends readonly AnyModule[] = readonly AnyModule[],
> = {
  readonly appId: Id;
  readonly persistenceVersion: PersistenceVersion;
  readonly modules: Modules;
  readonly machines: readonly MachineAdmission[];
  readonly descriptors: readonly OperationDeclaration[];
  readonly resolveMachine: (id: string) => MachineAdmission | undefined;
  readonly admitsMachine: (machine: MachineAdmission) => boolean;
  readonly resolveDescriptor: (id: string) => OperationDeclaration | undefined;
  readonly admitsDescriptor: (descriptor: OperationDeclaration) => boolean;
};

type FlattenModules<Modules extends readonly AnyModule[]> = number extends Modules["length"]
  ? MachineRecord
  : Modules extends readonly [infer Head, ...infer Tail]
    ? Head extends AnyModule
      ? Tail extends readonly AnyModule[]
        ? Head["machines"] & FlattenModules<Tail>
        : Head["machines"]
      : FlattenModules<Tail extends readonly AnyModule[] ? Tail : readonly []>
    : Readonly<Record<never, never>>;

export type App<
  Id extends string = string,
  PersistenceVersion extends string = string,
  Modules extends readonly AnyModule[] = readonly AnyModule[],
> = RequirementsCarrier<ModuleRequirements<Modules>> & {
  readonly kind: "app";
  readonly id: Id;
  readonly persistenceVersion: PersistenceVersion;
  readonly modules: Modules;
  readonly M: FlattenModules<Modules>;
  readonly plan: AppPlan<Id, PersistenceVersion, Modules>;
};

export type AnyApp = App;

export type ModuleConfig<Id extends string, Machines extends MachineRecord> = {
  readonly id: Id;
  readonly machines: Machines;
};

export type AppConfig<
  Id extends string,
  PersistenceVersion extends string,
  Modules extends readonly AnyModule[],
> = {
  readonly id: Id;
  readonly persistenceVersion: PersistenceVersion;
  readonly modules: Modules;
};

const invalid = (message: string): never => {
  throw new Error(message);
};

type AppIndexes = {
  readonly moduleIds: Set<string>;
  readonly machineKeys: Set<string>;
  readonly machineValues: Set<MachineAdmission>;
  readonly machineIds: Map<string, MachineAdmission>;
  readonly machines: MachineAdmission[];
  readonly descriptorIds: Map<string, OperationDeclaration>;
  readonly descriptors: OperationDeclaration[];
};

function freezeOwnedRecord<RecordValue extends MachineRecord>(value: RecordValue): RecordValue;
function freezeOwnedRecord(value: MachineRecord) {
  const snapshot = { ...value };
  // oxlint-disable-next-line anti-slop/no-object-freeze -- Flow-owned records are closed snapshots.
  Object.freeze(snapshot);
  return snapshot;
}

function freezeOwnedArray<
  ArrayValue extends readonly (AnyModule | MachineAdmission | OperationDeclaration)[],
>(value: ArrayValue): ArrayValue;
function freezeOwnedArray(
  value: readonly (AnyModule | MachineAdmission | OperationDeclaration)[],
): readonly (AnyModule | MachineAdmission | OperationDeclaration)[] {
  const snapshot = [...value];
  // oxlint-disable-next-line anti-slop/no-object-freeze -- Flow-owned arrays are closed snapshots.
  Object.freeze(snapshot);
  return snapshot;
}

const isRecord = (value: unknown): value is AdmissionRecord => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const hasOnlyStringKeys = (value: unknown): boolean =>
  isRecord(value) && Reflect.ownKeys(value).every((key) => Predicate.isString(key));

const hasValidName = (value: unknown): value is string => {
  if (!Predicate.isString(value) || value.length === 0) return false;
  if (
    value.split("").some((character) => {
      const code = character.codePointAt(0);
      return code !== undefined && (code <= 0x1f || code === 0x7f);
    })
  ) {
    return false;
  }
  return !Result.isFailure(utf8ByteLength(value, 256));
};

const assertExactKeys = (
  value: AdmissionRecord,
  expected: readonly string[],
  label: string,
): void => {
  const actual = Reflect.ownKeys(value).filter(Predicate.isString);
  if (actual.length !== Reflect.ownKeys(value).length)
    invalid(`${label} cannot contain symbol keys`);
  const expectedSet = new Set(expected);
  if (actual.length !== expected.length || actual.some((key) => !expectedSet.has(key))) {
    invalid(`${label} must contain exactly ${expected.join(", ")}`);
  }
};

const isMachineValue = (value: MachineAdmission): value is MachineAdmission & Machine =>
  isConstructedMachine(value);

const isModuleValue = (value: unknown): value is AnyModule => {
  if (!isRecord(value)) return false;
  return (
    value[moduleTypeId] === true &&
    value.kind === "module" &&
    Predicate.isString(value.id) &&
    isRecord(value.machines)
  );
};

const isDescriptor = (value: unknown): value is OperationDeclaration & { readonly id: string } =>
  isConstructedOperation(value) &&
  isRecord(value) &&
  hasValidName(value.id) &&
  (value.kind === "resource" || value.kind === "transaction" || value.kind === "stream");

const validateMachineOperations = (machine: MachineAdmission): void => {
  for (const [operationName, descriptor] of Object.entries(machine.operations)) {
    if (!isDescriptor(descriptor))
      invalid(`Module operation descriptor is invalid: ${String(operationName)}`);
  }
};

type FlowOwnedGraphNode =
  | Machine
  | MachineAdmission
  | MachineRecord
  | AnyModule
  | Module
  | DefinitionConstraint
  | MachineNodeConfiguration<DefinitionConstraint>
  | CompiledMachine
  | OperationDeclarations
  | OperationDeclaration
  | readonly DefinitionValue[]
  | readonly (AnyModule | MachineAdmission | OperationDeclaration)[];

type FlowOwnedValue = FlowOwnedGraphNode | DefinitionValue;

const isFlowOwnedObject = (value: FlowOwnedValue): value is FlowOwnedGraphNode =>
  Predicate.isObject(value);

const freezeFlowNode = (value: FlowOwnedGraphNode): void => {
  // oxlint-disable-next-line anti-slop/no-object-freeze -- validated Flow-owned graph nodes are closed snapshots.
  Object.freeze(value);
};

const freezeFlowGraph = (
  value: FlowOwnedValue,
  visited = new WeakSet<FlowOwnedGraphNode>(),
): void => {
  if (Predicate.isFunction(value) || !isFlowOwnedObject(value)) return;
  if (Array.isArray(value)) {
    if (visited.has(value)) return;
    visited.add(value);
    for (const child of value) freezeFlowGraph(child, visited);
    freezeFlowNode(value);
    return;
  }
  if (visited.has(value)) return;
  visited.add(value);
  for (const [key, child] of Object.entries(value)) freezeFlowGraphChild(key, child, visited);
  freezeFlowNode(value);
};

const freezeFlowGraphChild = (
  key: string,
  child: FlowOwnedValue,
  visited: WeakSet<FlowOwnedGraphNode>,
): void => {
  if (key === "activities") {
    if (isFlowOwnedObject(child)) {
      // oxlint-disable-next-line anti-slop/no-object-freeze -- Activity containers are Flow-owned while their values are user-owned.
      Object.freeze(child);
    }
    return;
  }
  if (key === "operations" && isFlowOwnedObject(child)) {
    for (const descriptor of Object.values(child)) {
      if (isFlowOwnedObject(descriptor)) {
        // oxlint-disable-next-line anti-slop/no-object-freeze -- Operation descriptors are Flow-owned graph nodes.
        Object.freeze(descriptor);
      }
    }
    // oxlint-disable-next-line anti-slop/no-object-freeze -- Operation registries are Flow-owned graph nodes.
    Object.freeze(child);
    return;
  }
  freezeFlowGraph(child, visited);
};

const freezeMachine = (machine: MachineAdmission): void => {
  freezeFlowGraph(machine);
};

const validateModuleMachines = (machines: MachineRecord): void => {
  const machineValues = new Set<MachineAdmission>();
  const machineIds = new Set<string>();
  for (const [name, machine] of Object.entries(machines)) {
    if (!hasValidName(name)) invalid(`Module machine key is invalid: ${String(name)}`);
    if (!isMachineValue(machine)) invalid(`Module machine is invalid: ${String(name)}`);
    if (machineValues.has(machine))
      invalid(`Module machine value is duplicated: ${String(machine.id)}`);
    if (machineIds.has(machine.id))
      invalid(`Module machine id is duplicated: ${String(machine.id)}`);
    validateMachineOperations(machine);
    freezeMachine(machine);
    machineValues.add(machine);
    machineIds.add(machine.id);
  }
};

const moduleRequirements = <Machines extends MachineRecord>(
  value: never,
): MachineRequirements<Machines[keyof Machines]> => value;

export const module = <const Id extends string, const Machines extends MachineRecord>(
  config: ModuleConfig<Id, Machines>,
): Module<Id, Machines> => {
  if (!isRecord(config)) invalid("Module configuration must be an object");
  assertExactKeys(config, ["id", "machines"], "Module configuration");
  if (!hasValidName(config.id)) invalid("Module id must be a valid authored name");
  if (!isRecord(config.machines)) invalid("Module machines must be a record");
  if (!hasOnlyStringKeys(config.machines)) invalid("Module machine keys must be strings");

  validateModuleMachines(config.machines);

  const moduleValue: Module<Id, Machines> = {
    kind: "module",
    id: config.id,
    machines: freezeOwnedRecord(config.machines),
    [moduleTypeId]: true,
    [RequirementsTypeId]: moduleRequirements,
  };
  // oxlint-disable-next-line anti-slop/no-object-freeze -- module metadata is a Flow-owned closed record.
  return Object.freeze(moduleValue);
};

const appRequirements = <Modules extends readonly AnyModule[]>(
  value: never,
): ModuleRequirements<Modules> => value;

const flattenMachines = <Modules extends readonly AnyModule[]>(
  modules: Modules,
): FlattenModules<Modules> => {
  const entries: [string, MachineAdmission][] = [];
  for (const moduleValue of modules) {
    for (const [name, machine] of Object.entries(moduleValue.machines)) {
      entries.push([name, machine]);
    }
  }
  // SAFETY: every entry came from the validated exact module machine records; flattening preserves keys and values.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- validated exact records preserve the inferred keyed intersection.
  const flattened = Object.fromEntries(entries) as FlattenModules<Modules>;
  // oxlint-disable-next-line anti-slop/no-object-freeze -- App.M is the immutable closed admission record.
  Object.freeze(flattened);
  return flattened;
};

const indexMachine = (name: string, machine: MachineAdmission, indexes: AppIndexes): void => {
  if (indexes.machineKeys.has(name)) invalid(`App machine property is duplicated: ${name}`);
  if (indexes.machineValues.has(machine))
    invalid(`App machine value is duplicated: ${String(machine.id)}`);
  if (indexes.machineIds.has(machine.id))
    invalid(`App machine id is duplicated: ${String(machine.id)}`);
  indexes.machineKeys.add(name);
  indexes.machineValues.add(machine);
  indexes.machineIds.set(machine.id, machine);
  indexes.machines.push(machine);
};

const indexDescriptors = (machine: MachineAdmission, indexes: AppIndexes): void => {
  for (const [operationName, descriptor] of Object.entries(machine.operations)) {
    if (isDescriptor(descriptor)) {
      const existing = indexes.descriptorIds.get(descriptor.id);
      if (existing !== undefined && existing !== descriptor)
        invalid(`App operation descriptor is duplicated: ${String(descriptor.id)}`);
      if (existing === undefined) {
        // oxlint-disable-next-line anti-slop/no-object-freeze -- admitted descriptors are immutable plan nodes.
        Object.freeze(descriptor);
        indexes.descriptorIds.set(descriptor.id, descriptor);
        indexes.descriptors.push(descriptor);
      }
    } else {
      invalid(`App operation descriptor is invalid: ${String(operationName)}`);
    }
  }
};

const indexModule = (moduleValue: AnyModule, indexes: AppIndexes): void => {
  if (indexes.moduleIds.has(moduleValue.id))
    invalid(`App module id is duplicated: ${String(moduleValue.id)}`);
  indexes.moduleIds.add(moduleValue.id);

  for (const [name, machine] of Object.entries(moduleValue.machines)) {
    indexMachine(name, machine, indexes);
    indexDescriptors(machine, indexes);
  }
};

export const app = <
  const Id extends string,
  const PersistenceVersion extends string,
  const Modules extends readonly AnyModule[],
>(
  config: AppConfig<Id, PersistenceVersion, Modules>,
): App<Id, PersistenceVersion, Modules> => {
  if (!isRecord(config)) invalid("App configuration must be an object");
  assertExactKeys(config, ["id", "persistenceVersion", "modules"], "App configuration");
  if (!hasValidName(config.id)) invalid("App id must be a valid authored name");
  if (!hasValidName(config.persistenceVersion))
    invalid("Persistence version must be a valid authored name");
  if (!Array.isArray(config.modules)) invalid("App modules must be an array");

  const modules = freezeOwnedArray(config.modules);
  const indexes: AppIndexes = {
    moduleIds: new Set<string>(),
    machineKeys: new Set<string>(),
    machineValues: new Set<Machine>(),
    machineIds: new Map<string, Machine>(),
    machines: [],
    descriptorIds: new Map<string, OperationDeclaration>(),
    descriptors: [],
  };

  for (const moduleValue of modules) {
    if (!isModuleValue(moduleValue)) invalid("App modules must be constructed module records");
    indexModule(moduleValue, indexes);
  }

  const machineSet = new Set(indexes.machines);
  const descriptorSet = new Set(indexes.descriptors);
  const plan: AppPlan<Id, PersistenceVersion, Modules> = {
    appId: config.id,
    persistenceVersion: config.persistenceVersion,
    modules,
    machines: freezeOwnedArray(indexes.machines),
    descriptors: freezeOwnedArray(indexes.descriptors),
    resolveMachine: (id) => indexes.machineIds.get(id),
    admitsMachine: (machine) => machineSet.has(machine),
    resolveDescriptor: (id) => indexes.descriptorIds.get(id),
    admitsDescriptor: (descriptor) => descriptorSet.has(descriptor),
  };
  // oxlint-disable-next-line anti-slop/no-object-freeze -- AppPlan is the immutable Flow-owned index.
  Object.freeze(plan);

  const appValue: App<Id, PersistenceVersion, Modules> = {
    kind: "app",
    id: config.id,
    persistenceVersion: config.persistenceVersion,
    modules,
    M: flattenMachines(modules),
    plan,
    [RequirementsTypeId]: appRequirements,
  };
  // oxlint-disable-next-line anti-slop/no-object-freeze -- app metadata and admission are closed after compilation.
  return Object.freeze(appValue);
};
