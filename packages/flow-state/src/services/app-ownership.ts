import { Context, Layer } from "effect";

import type { FlowAppDefinition, FlowMachine, FlowModuleDefinition } from "../public/types.js";

type FlowMachineOwnership = Readonly<{
  readonly actorId: string;
  readonly appId: string;
  readonly moduleId: string;
  readonly machineName: string;
}>;

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
    for (const [machineName, machine] of Object.entries(machineRegistryOf(module))) {
      if (!owners.has(machine)) {
        owners.set(
          machine,
          Object.freeze({
            actorId: `${app.id}/${module.id}/${machineName}`,
            appId: app.id,
            moduleId: module.id,
            machineName,
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
