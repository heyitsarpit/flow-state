import { Context, Layer } from "effect";

import type {
  FlowAppDefinition,
  FlowGraphOwnershipOverlay,
  FlowMachine,
  FlowModuleDefinition,
} from "../api/types.js";

export type FlowMachineOwnership = FlowGraphOwnershipOverlay &
  Readonly<{
    readonly actorId: string;
    readonly appId: string;
  }>;

export type FlowMachineOwnershipStatus =
  | Readonly<{
      readonly kind: "owned";
      readonly ownership: FlowMachineOwnership;
    }>
  | Readonly<{
      readonly kind: "ambiguous";
      readonly ownerships: ReadonlyArray<FlowMachineOwnership>;
    }>
  | Readonly<{
      readonly kind: "unregistered";
    }>;

function copyOptionalStrings(
  values: ReadonlyArray<string> | undefined,
): ReadonlyArray<string> | undefined {
  return values === undefined ? undefined : Object.freeze([...values]);
}

function moduleOwnershipMetadata(module: FlowModuleDefinition) {
  return Object.freeze({
    screens: copyOptionalStrings(module.meta.screens),
    tags: copyOptionalStrings(module.meta.tags),
    dependencies: copyOptionalStrings(module.meta.dependencies),
    permissions: copyOptionalStrings(module.meta.permissions),
  });
}

function isFlowMachine(value: unknown): value is FlowMachine {
  return (
    value !== null &&
    typeof value === "object" &&
    "kind" in value &&
    (value as { readonly kind?: unknown }).kind === "machine"
  );
}

function machineRegistryOf(module: FlowModuleDefinition): Readonly<Record<string, FlowMachine>> {
  const machines = (module as Record<string, unknown>).machines;
  if (machines === undefined || machines === null || typeof machines !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(machines).filter(([, machine]) => isFlowMachine(machine)),
  ) as Readonly<Record<string, FlowMachine>>;
}

function graphOwnershipOverlay(
  module: FlowModuleDefinition,
  machineName: string,
  appId?: string,
): FlowGraphOwnershipOverlay {
  const moduleMetadata = moduleOwnershipMetadata(module);
  const modulePath = appId === undefined ? module.id : `${appId}/${module.id}`;
  const ownerPath = `${modulePath}/${machineName}`;

  return Object.freeze({
    ...(appId === undefined ? {} : { appId }),
    moduleId: module.id,
    modulePath,
    ownerPath,
    machineName,
    ...(moduleMetadata.screens === undefined ? {} : { screens: moduleMetadata.screens }),
    ...(moduleMetadata.tags === undefined ? {} : { tags: moduleMetadata.tags }),
    ...(moduleMetadata.dependencies === undefined
      ? {}
      : { dependencies: moduleMetadata.dependencies }),
    ...(moduleMetadata.permissions === undefined
      ? {}
      : { permissions: moduleMetadata.permissions }),
  });
}

function findMachineOwnershipInModule(
  module: FlowModuleDefinition,
  machine: FlowMachine,
  appId?: string,
): FlowGraphOwnershipOverlay | undefined {
  for (const [machineName, candidate] of Object.entries(machineRegistryOf(module))) {
    if (candidate === machine) {
      return graphOwnershipOverlay(module, machineName, appId);
    }
  }

  return undefined;
}

export function findGraphOwnershipOverlay(
  source: FlowAppDefinition | FlowModuleDefinition,
  machine: FlowMachine,
): FlowGraphOwnershipOverlay | undefined {
  if (source.kind === "module") {
    return findMachineOwnershipInModule(source, machine);
  }

  for (const module of source.modules) {
    const ownership = findMachineOwnershipInModule(module, machine, source.id);
    if (ownership !== undefined) {
      return ownership;
    }
  }

  return undefined;
}

function ownershipForApp(app: FlowAppDefinition): WeakMap<FlowMachine, FlowMachineOwnershipStatus> {
  const owners = new WeakMap<FlowMachine, FlowMachineOwnershipStatus>();
  for (const module of app.modules) {
    for (const [machineName, machine] of Object.entries(machineRegistryOf(module))) {
      const ownership = graphOwnershipOverlay(module, machineName, app.id);
      const machineOwnership = Object.freeze({
        actorId: ownership.ownerPath,
        appId: app.id,
        ...ownership,
      }) satisfies FlowMachineOwnership;
      const existing = owners.get(machine);
      if (existing === undefined) {
        owners.set(
          machine,
          Object.freeze({
            kind: "owned",
            ownership: machineOwnership,
          }),
        );
        continue;
      }

      owners.set(
        machine,
        Object.freeze({
          kind: "ambiguous",
          ownerships: Object.freeze([
            ...(existing.kind === "owned"
              ? [existing.ownership]
              : existing.kind === "ambiguous"
                ? existing.ownerships
                : []),
            machineOwnership,
          ]),
        }),
      );
    }
  }
  return owners;
}

export class FlowAppOwnership extends Context.Service<
  FlowAppOwnership,
  {
    readonly appId: string;
    readonly ownershipStatusFor: (machine: FlowMachine) => FlowMachineOwnershipStatus;
  }
>()("flow-state/internal/FlowAppOwnership") {
  static fromApp(app: FlowAppDefinition) {
    const owners = ownershipForApp(app);
    return Layer.succeed(
      FlowAppOwnership,
      FlowAppOwnership.of({
        appId: app.id,
        ownershipStatusFor: (machine) =>
          owners.get(machine) ??
          Object.freeze({
            kind: "unregistered",
          }),
      }),
    );
  }
}
