import { childInvokesForState } from "../core/orchestrator/orchestrator-helpers.js";
import * as flow from "../core/api/flow-core.js";
import type { FlowAppDefinition, FlowMachine, FlowSeededResource } from "../core/api/types.js";
import {
  resourceDefinitionForRef,
  type AnyResourceDefinition,
} from "../core/api/resource-runtime.js";
import { createAppDefinition } from "../descriptors/app.js";

function focusedResourceInventory(
  resources: ReadonlyArray<FlowSeededResource>,
): Readonly<Record<string, AnyResourceDefinition>> {
  const definitions: Array<AnyResourceDefinition> = [];
  const seen = new WeakSet<AnyResourceDefinition>();
  for (const resource of resources) {
    const definition = resourceDefinitionForRef(resource.ref);
    if (definition === undefined || seen.has(definition)) {
      continue;
    }
    seen.add(definition);
    definitions.push(definition);
  }

  return Object.freeze(
    Object.fromEntries(definitions.map((definition, index) => [`resource${index}`, definition])),
  );
}

function childMachinesFor(machine: FlowMachine): ReadonlyArray<FlowMachine> {
  const initialSnapshot = machine.getInitialSnapshot();
  return Object.freeze(
    Object.keys(machine.config.states).flatMap((state) =>
      childInvokesForState(initialSnapshot, state).map((child) => child.config.machine),
    ),
  );
}

export function collectFocusedMachines(machine: FlowMachine): ReadonlyArray<FlowMachine> {
  const machines: Array<FlowMachine> = [];
  const visited = new Set<FlowMachine>();

  const visit = (candidate: FlowMachine): void => {
    if (visited.has(candidate)) {
      return;
    }
    visited.add(candidate);
    machines.push(candidate);
    for (const child of childMachinesFor(candidate)) {
      visit(child);
    }
  };

  visit(machine);
  return Object.freeze(machines);
}

export function focusedMachineInventory(
  machine: FlowMachine,
): Readonly<Record<string, FlowMachine>> {
  return Object.freeze(
    Object.fromEntries(
      collectFocusedMachines(machine).map((registeredMachine, index) => [
        index === 0 ? "actor" : `child${index}`,
        registeredMachine,
      ]),
    ),
  );
}

export function createFocusedTestApp(
  machine: FlowMachine,
  moduleName = "FocusedTest",
  resources: ReadonlyArray<FlowSeededResource> = [],
): FlowAppDefinition {
  return createAppDefinition({
    modules: [
      flow.module(moduleName, {
        machines: focusedMachineInventory(machine),
        resources: focusedResourceInventory(resources),
      }),
    ] as const,
  });
}
