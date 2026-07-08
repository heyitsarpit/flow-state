import { storyToDoc as storyToDocRuntime } from "../../dist/inspect.mjs";

import type { FlowBehaviorGateway } from "../inspect.js";
import type {
  AnyFlowMachine,
  FlowAppDefinition,
  FlowStoriesDescriptor,
  FlowStory,
  FlowStoryDocDescriptor,
} from "../core/api/types.js";

export type FlowCliStoryRegistryEntry<
  Machine extends AnyFlowMachine = AnyFlowMachine,
  FixtureName extends string = string,
> = Readonly<{
  machine: Machine;
  machineId: Machine["id"];
  story: FlowStory<Machine, FixtureName>;
  doc: FlowStoryDocDescriptor<Machine, FixtureName>;
}>;

export type FlowCliStoryRegistry = Readonly<{
  app: FlowBehaviorGateway["app"];
  machinesById: ReadonlyMap<string, AnyFlowMachine>;
  stories: ReadonlyArray<FlowCliStoryRegistryEntry>;
  storiesById: ReadonlyMap<string, FlowCliStoryRegistryEntry>;
}>;

const storyToDoc = storyToDocRuntime as <
  Machine extends AnyFlowMachine,
  FixtureName extends string,
>(
  story: FlowStory<Machine, FixtureName>,
) => FlowStoryDocDescriptor<Machine, FixtureName>;

function isMachine(value: unknown): value is AnyFlowMachine {
  return (
    value !== null &&
    typeof value === "object" &&
    "kind" in value &&
    value.kind === "machine" &&
    "id" in value &&
    typeof value.id === "string"
  );
}

export function createMachineRegistry(app: FlowAppDefinition): ReadonlyMap<string, AnyFlowMachine> {
  const machines = new Map<string, AnyFlowMachine>();

  for (const module of app.modules) {
    const registry = module.machines;
    if (registry === undefined || registry === null || typeof registry !== "object") {
      continue;
    }

    for (const machine of Object.values(registry)) {
      if (!isMachine(machine)) {
        continue;
      }

      const existing = machines.get(machine.id);
      if (existing !== undefined && existing !== machine) {
        throw new Error(
          `Duplicate machine id '${machine.id}' in the assembled app. Rename one machine before using the shared story registry.`,
        );
      }

      machines.set(machine.id, machine);
    }
  }

  return machines;
}

function appendStoryEntries<Machine extends AnyFlowMachine, FixtureName extends string>(
  descriptor: FlowStoriesDescriptor<Machine, FixtureName>,
  machinesById: ReadonlyMap<string, AnyFlowMachine>,
  seenIds: Set<string>,
  entries: Array<FlowCliStoryRegistryEntry>,
): void {
  const ownedMachine = machinesById.get(descriptor.machine.id);
  if (ownedMachine !== descriptor.machine) {
    throw new Error(
      `BehaviorGateway stories reference machine '${descriptor.machine.id}', but the assembled app does not own it.`,
    );
  }

  for (const story of descriptor.stories) {
    if (seenIds.has(story.id)) {
      throw new Error(
        `Duplicate story id '${story.id}' in BehaviorGateway.stories. Rename the story so agents can resolve it unambiguously.`,
      );
    }

    seenIds.add(story.id);
    entries.push(
      Object.freeze({
        machine: descriptor.machine,
        machineId: descriptor.machine.id,
        story,
        doc: storyToDoc(story),
      }),
    );
  }
}

export function createStoryRegistry(gateway: FlowBehaviorGateway): FlowCliStoryRegistry {
  const machinesById = createMachineRegistry(gateway.app);
  const entries: Array<FlowCliStoryRegistryEntry> = [];
  const seenIds = new Set<string>();

  for (const descriptor of gateway.stories ?? []) {
    appendStoryEntries(descriptor, machinesById, seenIds, entries);
  }

  return Object.freeze({
    app: gateway.app,
    machinesById,
    stories: Object.freeze(entries),
    storiesById: new Map(entries.map((entry) => [entry.story.id, entry])),
  });
}
