import { encodeCanonical, encodeSegment, validateAuthoredId } from "./canonical.js";
import type { AnyDescriptor, Child } from "./descriptors.js";
import {
  freezeArray,
  freezeTuple,
  RequirementsTypeId,
  SelectedTypeId,
  type TupleOnly,
  TypeId,
} from "./internal.js";
import type { InputOf, RequirementsOf, SelectedOf } from "./internal.js";
import type { AnyMachine, MachineSnapshotOf } from "./machine.js";
import { usageError } from "./usage-error.js";

const typeBrand = (_: never): never => {
  throw new Error("Flow type brands are not executable");
};

export interface View<
  Id extends string = string,
  MachineValue extends AnyMachine = AnyMachine,
  Selected = unknown,
> {
  readonly kind: "view";
  readonly id: Id;
  readonly machine: MachineValue;
  readonly select: (snapshot: MachineSnapshotOf<MachineValue>) => Selected;
  readonly [TypeId]: "View";
  readonly [SelectedTypeId]: (_: never) => Selected;
}

export const view = <const Id extends string, MachineValue extends AnyMachine, const Selected>(
  machineValue: MachineValue,
  config: Readonly<{
    id: Id;
    select: (snapshot: MachineSnapshotOf<MachineValue>) => Selected;
  }>,
): View<Id, MachineValue, Selected> => {
  const id = validateAuthoredId(config.id, "view") as Id;
  for (const key of Object.keys(config))
    if (!new Set(["id", "select"]).has(key)) usageError("InvalidDefinition", "view", { id, key });
  return Object.freeze({
    kind: "view" as const,
    id,
    machine: machineValue,
    select: config.select,
    [TypeId]: "View" as const,
    [SelectedTypeId]: typeBrand,
  });
};

export type AnyView = View<string, AnyMachine, unknown>;

type VoidRootTuple<Machines extends readonly AnyMachine[]> = Readonly<{
  [Index in keyof Machines]: InputOf<Machines[Index]> extends void ? Machines[Index] : never;
}>;

type RootViewTuple<
  Machines extends readonly AnyMachine[],
  Views extends readonly AnyView[],
> = Readonly<{
  [Index in keyof Views]: Views[Index]["machine"] extends Machines[number] ? Views[Index] : never;
}>;

type MachineRequirements<Machines extends readonly AnyMachine[]> = RequirementsOf<Machines[number]>;

export interface Module<
  Id extends string = string,
  Machines extends readonly AnyMachine[] = readonly AnyMachine[],
  Views extends readonly AnyView[] = readonly AnyView[],
  R = unknown,
> {
  readonly kind: "module";
  readonly id: Id;
  readonly machines: Machines;
  readonly views: Views;
  readonly [TypeId]: "Module";
  readonly [RequirementsTypeId]: (_: never) => R;
}

export const module = <
  const Id extends string,
  const Machines extends readonly AnyMachine[],
  const Views extends readonly AnyView[],
>(
  config: Readonly<{
    id: Id;
    machines: Machines & TupleOnly<Machines> & VoidRootTuple<Machines>;
    views: Views & TupleOnly<Views> & RootViewTuple<Machines, Views>;
  }>,
): Module<Id, Machines, Views, MachineRequirements<Machines>> => {
  const id = validateAuthoredId(config.id, "module") as Id;
  for (const key of Object.keys(config))
    if (!new Set(["id", "machines", "views"]).has(key))
      usageError("InvalidDefinition", "module", { id, key });
  const roots = new Set<AnyMachine>(config.machines as readonly AnyMachine[]);
  for (const viewValue of config.views)
    if (!roots.has(viewValue.machine))
      usageError("ForeignIdentity", "module", {
        id,
        viewId: viewValue.id,
        machineId: viewValue.machine.id,
      });
  return Object.freeze({
    kind: "module" as const,
    id,
    machines: freezeTuple(config.machines),
    views: freezeTuple(config.views),
    [TypeId]: "Module" as const,
    [RequirementsTypeId]: typeBrand,
  });
};

export type AnyModule = Module<string, readonly AnyMachine[], readonly AnyView[], unknown>;

export type CompiledActivitySlot = Readonly<{
  kind: "activity";
  machineId: string;
  stateId: string;
  activityKind: string;
  ordinal: number;
  descriptorId: string | null;
}>;

export type CompiledTimerSlot = Readonly<{
  kind: "timer";
  machineId: string;
  stateId: string;
  name: string;
}>;

export interface AppPlan {
  readonly appId: string;
  readonly persistenceVersion: string;
  readonly modules: readonly AnyModule[];
  readonly roots: readonly AnyMachine[];
  readonly dynamicMachines: readonly AnyMachine[];
  readonly machines: readonly AnyMachine[];
  readonly descriptors: readonly AnyDescriptor[];
  readonly views: readonly AnyView[];
  readonly activitySlots: readonly CompiledActivitySlot[];
  readonly timerSlots: readonly CompiledTimerSlot[];
  readonly persistenceFingerprint: string;
  readonly rootActorId: (machine: AnyMachine) => string | undefined;
  readonly resolveMachine: (id: string) => AnyMachine | undefined;
  readonly resolveDescriptor: (id: string) => AnyDescriptor | undefined;
  readonly resolveView: (id: string) => AnyView | undefined;
  readonly admitsCreation: (machine: AnyMachine) => boolean;
  readonly isRoot: (machine: AnyMachine) => boolean;
}

type ModuleRequirements<Modules extends readonly AnyModule[]> = RequirementsOf<Modules[number]>;
type DynamicRequirements<Dynamic extends readonly AnyMachine[]> = RequirementsOf<Dynamic[number]>;

export interface App<
  Id extends string = string,
  PersistenceVersion extends string = string,
  Modules extends readonly AnyModule[] = readonly AnyModule[],
  Dynamic extends readonly AnyMachine[] = readonly AnyMachine[],
  R = unknown,
> {
  readonly kind: "app";
  readonly id: Id;
  readonly persistenceVersion: PersistenceVersion;
  readonly modules: Modules;
  readonly dynamicMachines: Dynamic;
  readonly plan: AppPlan;
  readonly [TypeId]: "App";
  readonly [RequirementsTypeId]: (_: never) => R;
}

const collision = (namespace: string, id: string, firstKind: string, secondKind: string): never =>
  usageError("AppPlanCollision", "app", {
    namespace,
    id,
    firstKind,
    secondKind,
  });

const compilePlan = (
  appId: string,
  persistenceVersion: string,
  modules: readonly AnyModule[],
  dynamicSeeds: readonly AnyMachine[],
): AppPlan => {
  const moduleIds = new Map<string, AnyModule>();
  const machineIds = new Map<string, AnyMachine>();
  const descriptorIds = new Map<string, AnyDescriptor>();
  const viewIds = new Map<string, AnyView>();
  const rootOwners = new Map<AnyMachine, AnyModule>();
  const roots: AnyMachine[] = [];
  const dynamics: AnyMachine[] = [];
  const machines: AnyMachine[] = [];
  const descriptors: AnyDescriptor[] = [];
  const views: AnyView[] = [];
  const activitySlots: CompiledActivitySlot[] = [];
  const timerSlots: CompiledTimerSlot[] = [];

  for (const moduleValue of modules) {
    const prior = moduleIds.get(moduleValue.id);
    if (prior !== undefined) collision("module", moduleValue.id, prior.kind, moduleValue.kind);
    moduleIds.set(moduleValue.id, moduleValue);
    for (const root of moduleValue.machines) {
      const priorOwner = rootOwners.get(root);
      if (priorOwner !== undefined && priorOwner !== moduleValue)
        collision("root-owner", root.id, priorOwner.id, moduleValue.id);
      if (priorOwner === moduleValue) continue;
      rootOwners.set(root, moduleValue);
      roots.push(root);
    }
    for (const viewValue of moduleValue.views) {
      if (!moduleValue.machines.includes(viewValue.machine))
        usageError("ForeignIdentity", "app.view", {
          moduleId: moduleValue.id,
          viewId: viewValue.id,
          machineId: viewValue.machine.id,
        });
      const priorView = viewIds.get(viewValue.id);
      if (priorView !== undefined && priorView !== viewValue)
        collision("view", viewValue.id, priorView.kind, viewValue.kind);
      if (priorView === undefined) {
        viewIds.set(viewValue.id, viewValue);
        views.push(viewValue);
      }
    }
  }

  const visitMachine = (machineValue: AnyMachine): void => {
    const prior = machineIds.get(machineValue.id);
    if (prior !== undefined) {
      if (prior !== machineValue)
        collision("machine", machineValue.id, prior.kind, machineValue.kind);
      return;
    }
    machineIds.set(machineValue.id, machineValue);
    machines.push(machineValue);
    for (const descriptor of machineValue.descriptors) {
      const priorDescriptor = descriptorIds.get(descriptor.id);
      if (priorDescriptor !== undefined && priorDescriptor !== descriptor)
        collision("descriptor", descriptor.id, priorDescriptor.kind, descriptor.kind);
      if (priorDescriptor === undefined) {
        descriptorIds.set(descriptor.id, descriptor);
        descriptors.push(descriptor);
      }
      if (descriptor.kind === "child") visitMachine((descriptor as Child).machine as AnyMachine);
    }
    for (const [stateName, state] of Object.entries(machineValue.states)) {
      const stateToken = machineValue.definition.S[stateName];
      if (stateToken === undefined)
        return usageError("ForeignIdentity", "app.machine", {
          machineId: machineValue.id,
          stateName,
        });
      for (const [ordinal, activity] of (state.activities ?? []).entries())
        activitySlots.push(
          Object.freeze({
            kind: "activity" as const,
            machineId: machineValue.id,
            stateId: stateToken.id,
            activityKind: activity.activityKind,
            ordinal,
            descriptorId: activity.descriptor?.id ?? null,
          }),
        );
      for (const name of Object.keys(state.timers ?? {}))
        timerSlots.push(
          Object.freeze({
            kind: "timer" as const,
            machineId: machineValue.id,
            stateId: stateToken.id,
            name,
          }),
        );
    }
  };

  for (const root of roots) visitMachine(root);
  for (const dynamic of dynamicSeeds) {
    if (!dynamics.includes(dynamic)) dynamics.push(dynamic);
    visitMachine(dynamic);
  }

  const rootIds = new Map<AnyMachine, string>();
  for (const root of roots)
    rootIds.set(root, `root|${encodeSegment(appId)}|${encodeSegment(root.id)}`);

  const fingerprint = encodeCanonical({
    appId,
    persistenceVersion,
    machines: machines.map((machineValue) => ({
      id: machineValue.id,
      states: Object.values(machineValue.definition.S).map((state) => state.id),
      events: Object.values(machineValue.definition.E).map((event) => event.id),
    })),
    descriptors: descriptors.map((descriptor) => [descriptor.kind, descriptor.id]),
    activitySlots,
    timerSlots,
  });

  const plan: AppPlan = {
    appId,
    persistenceVersion,
    modules: freezeArray(modules),
    roots: freezeArray(roots),
    dynamicMachines: freezeArray(dynamics),
    machines: freezeArray(machines),
    descriptors: freezeArray(descriptors),
    views: freezeArray(views),
    activitySlots: freezeArray(activitySlots),
    timerSlots: freezeArray(timerSlots),
    persistenceFingerprint: fingerprint,
    rootActorId: (machineValue) => rootIds.get(machineValue),
    resolveMachine: (id) => machineIds.get(id),
    resolveDescriptor: (id) => descriptorIds.get(id),
    resolveView: (id) => viewIds.get(id),
    admitsCreation: (machineValue) => machineIds.get(machineValue.id) === machineValue,
    isRoot: (machineValue) => rootIds.has(machineValue),
  };
  return Object.freeze(plan);
};

export const app = <
  const Id extends string,
  const PersistenceVersion extends string,
  const Modules extends readonly AnyModule[],
  const Dynamic extends readonly AnyMachine[] = readonly [],
>(
  config: Readonly<{
    id: Id;
    persistenceVersion: PersistenceVersion;
    modules: Modules & TupleOnly<Modules>;
    dynamicMachines?: Dynamic & TupleOnly<Dynamic>;
  }>,
): App<
  Id,
  PersistenceVersion,
  Modules,
  Dynamic,
  ModuleRequirements<Modules> | DynamicRequirements<Dynamic>
> => {
  const id = validateAuthoredId(config.id, "app") as Id;
  for (const key of Object.keys(config))
    if (!new Set(["id", "persistenceVersion", "modules", "dynamicMachines"]).has(key))
      usageError("InvalidDefinition", "app", { id, key });
  const persistenceVersion = validateAuthoredId(
    config.persistenceVersion,
    "app.persistenceVersion",
  ) as PersistenceVersion;
  const modules = freezeTuple(config.modules);
  const dynamicMachines = freezeTuple((config.dynamicMachines ?? []) as Dynamic);
  const result: App<
    Id,
    PersistenceVersion,
    Modules,
    Dynamic,
    ModuleRequirements<Modules> | DynamicRequirements<Dynamic>
  > = {
    kind: "app",
    id,
    persistenceVersion,
    modules,
    dynamicMachines,
    plan: compilePlan(id, persistenceVersion, modules, dynamicMachines),
    [TypeId]: "App",
    [RequirementsTypeId]: typeBrand,
  };
  return Object.freeze(result);
};

export type SelectedViewOutput<ViewValue extends AnyView> = SelectedOf<ViewValue>;
