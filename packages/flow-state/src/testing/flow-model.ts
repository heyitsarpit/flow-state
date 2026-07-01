import type { Layer } from "effect";

import { createFlowPathUtilities } from "../flow-paths.js";
import type {
  FlowEvent,
  FlowMachine,
  FlowModelDescriptor,
  FlowModelReplayConfig,
  FlowModelPath,
  FlowSeededResource,
  FlowSnapshot,
  FlowTestHarness,
} from "../public/types.js";

import { createFlowTestBuilder } from "./flow-test.js";

function createSuccessSnapshot(id: string, value: unknown) {
  return {
    id,
    status: "success" as const,
    availability: "value" as const,
    activity: "idle" as const,
    freshness: "fresh" as const,
    value,
    isPlaceholderData: false,
  };
}

function materializeSeededResources(
  resources: ReadonlyArray<FlowSeededResource>,
): Readonly<Record<string, ReturnType<typeof createSuccessSnapshot>>> {
  const snapshots = new Map<string, ReturnType<typeof createSuccessSnapshot>>();

  for (const resource of resources) {
    snapshots.set(resource.ref.id, createSuccessSnapshot(resource.ref.id, resource.value));
  }

  return Object.freeze(Object.fromEntries(snapshots.entries()));
}

function applyInput<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  input?: Partial<Context>,
): FlowSnapshot<Context, State, Event> {
  if (input === undefined) {
    return snapshot;
  }

  return Object.freeze({
    ...snapshot,
    context: Object.freeze({
      ...(snapshot.context as Record<string, unknown>),
      ...(input as Record<string, unknown>),
    }) as Context,
  });
}

function toLayerArray(
  provide: FlowModelReplayConfig["provide"] | undefined,
): ReadonlyArray<Layer.Any> {
  if (provide === undefined) {
    return [];
  }

  if (Array.isArray(provide)) {
    return provide;
  }

  return [provide as Layer.Any];
}

function replayPath<Context, Event extends FlowEvent, State extends string>(
  machine: FlowMachine<Context, Event, State>,
  resources: ReadonlyArray<FlowSeededResource>,
  input: Partial<Context> | undefined,
  path: FlowModelPath<Context, Event, State>,
  options: FlowModelReplayConfig | undefined,
): FlowTestHarness<Context, Event, State> {
  const started = createFlowTestBuilder()
    .seedResources(resources)
    .start(machine, input === undefined ? undefined : { input });
  const configured = toLayerArray(options?.provide).reduce(
    (current, layer) => current.provide(layer),
    started,
  );
  const harness = (
    options?.clock === undefined ? configured : configured.clock(options.clock)
  ).start();

  for (const step of path.steps) {
    harness.send(step.event);
  }

  return harness;
}

export function createFlowModel<Context, Event extends FlowEvent, State extends string>(
  machine: FlowMachine<Context, Event, State>,
  resources: ReadonlyArray<FlowSeededResource>,
  input?: Partial<Context>,
): FlowModelDescriptor<FlowMachine<Context, Event, State>> {
  const baseSnapshot = Object.freeze({
    ...machine.getInitialSnapshot(),
    resources: materializeSeededResources(resources),
  }) as FlowSnapshot<Context, State, Event>;
  const initial = applyInput(baseSnapshot, input);
  const pathUtilities = createFlowPathUtilities(initial);

  return Object.freeze({
    kind: "model" as const,
    machine,
    getShortestPaths: pathUtilities.shortestPaths,
    getSimplePaths: pathUtilities.simplePaths,
    replay: (path, options) => replayPath(machine, resources, input, path, options),
  });
}
