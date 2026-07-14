import type { Layer } from "effect";

import { createFlowPathUtilities } from "../core/machines/flow-paths.js";
import type {
  FlowEvent,
  FlowAppDefinition,
  FlowMachine,
  FlowModelDescriptor,
  FlowModelReplayConfig,
  FlowModelPath,
  FlowSeededResource,
  FlowSnapshot,
  FlowTestHarness,
} from "../core/api/types.js";

import { applyInputToSnapshot } from "./apply-input-snapshot.js";
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
  app: FlowAppDefinition | undefined,
  resources: ReadonlyArray<FlowSeededResource>,
  input: Partial<Context> | undefined,
  path: FlowModelPath<Context, Event, State>,
  options: FlowModelReplayConfig | undefined,
): FlowTestHarness<Context, Event, State> {
  const builder = createFlowTestBuilder().seedResources(resources);
  const started = (app === undefined ? builder : builder.app(app)).start(
    machine,
    input === undefined ? undefined : { input },
  );
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

async function replayPathFlushed<Context, Event extends FlowEvent, State extends string>(
  machine: FlowMachine<Context, Event, State>,
  app: FlowAppDefinition | undefined,
  resources: ReadonlyArray<FlowSeededResource>,
  input: Partial<Context> | undefined,
  path: FlowModelPath<Context, Event, State>,
  options: FlowModelReplayConfig | undefined,
): Promise<FlowTestHarness<Context, Event, State>> {
  const harness = replayPath(machine, app, resources, input, path, options);
  await harness.flush();
  return harness;
}

export function createFlowModel<Context, Event extends FlowEvent, State extends string>(
  machine: FlowMachine<Context, Event, State>,
  app: FlowAppDefinition | undefined,
  resources: ReadonlyArray<FlowSeededResource>,
  input?: Partial<Context>,
): FlowModelDescriptor<FlowMachine<Context, Event, State>> {
  const machineInitialSnapshot = machine.getInitialSnapshot();
  const baseSnapshot = Object.freeze({
    ...machineInitialSnapshot,
    resources: materializeSeededResources(resources),
    receipts: Object.freeze([
      ...machineInitialSnapshot.receipts,
      Object.freeze({ type: "actor:start" as const, id: machine.id }),
    ]),
  }) as FlowSnapshot<Context, State, Event>;
  const initial = applyInputToSnapshot(baseSnapshot, input);
  const pathUtilities = createFlowPathUtilities<Context, Event, State>(initial);

  const descriptor: FlowModelDescriptor<FlowMachine<Context, Event, State>> = {
    kind: "model" as const,
    machine,
    getShortestPaths: pathUtilities.shortestPaths,
    getSimplePaths: pathUtilities.simplePaths,
    replay: (path, options) => replayPath(machine, app, resources, input, path, options),
    replayFlushed: (path, options) =>
      replayPathFlushed(machine, app, resources, input, path, options),
  };
  return Object.freeze(descriptor);
}
