import { Context, Layer } from "effect";

import type { FlowAppDefinition, FlowMachine, FlowModuleDefinition } from "../public/types.js";

export type FlowMachineOwnership = Readonly<{
  readonly actorId: string;
  readonly appId: string;
  readonly moduleId: string;
  readonly modulePath: string;
  readonly ownerPath: string;
  readonly machineName: string;
  readonly screens?: ReadonlyArray<string>;
  readonly tags?: ReadonlyArray<string>;
  readonly dependencies?: ReadonlyArray<string>;
  readonly permissions?: ReadonlyArray<string>;
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

function ownershipForApp(app: FlowAppDefinition): WeakMap<FlowMachine, FlowMachineOwnership> {
  const owners = new WeakMap<FlowMachine, FlowMachineOwnership>();
  for (const module of app.modules) {
    const modulePath = `${app.id}/${module.id}`;
    const moduleMetadata = moduleOwnershipMetadata(module);
    for (const [machineName, machine] of Object.entries(machineRegistryOf(module))) {
      if (!owners.has(machine)) {
        const ownerPath = `${modulePath}/${machineName}`;
        owners.set(
          machine,
          Object.freeze({
            actorId: ownerPath,
            appId: app.id,
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
          }),
        );
      }
    }
  }
  return owners;
}

export class FlowAppOwnership extends Context.Service<
  FlowAppOwnership,
  {
    readonly actorIdFor: (machine: FlowMachine) => string | undefined;
    readonly ownershipFor: (machine: FlowMachine) => FlowMachineOwnership | undefined;
  }
>()("@flow-state/core/internal/FlowAppOwnership") {
  static fromApp(app: FlowAppDefinition) {
    const owners = ownershipForApp(app);
    return Layer.succeed(
      FlowAppOwnership,
      FlowAppOwnership.of({
        actorIdFor: (machine) => owners.get(machine)?.actorId,
        ownershipFor: (machine) => owners.get(machine),
      }),
    );
  }
}
