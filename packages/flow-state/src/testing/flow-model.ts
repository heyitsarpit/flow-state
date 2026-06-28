import {
  applyMachineEventWithMeta,
  canMachineTransition,
  planMachineEvent,
} from "../machine-transition.js";
import type {
  FlowEvent,
  FlowMachine,
  FlowModelDescriptor,
  FlowModelPath,
  FlowModelStep,
  FlowModelTraversalOptions,
  FlowSeededResource,
  FlowSnapshot,
} from "../public/types.js";

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

function defaultSerializeState<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
): string {
  return JSON.stringify({
    value: snapshot.value,
    context: snapshot.context,
  });
}

function defaultSerializeEvent<Event extends FlowEvent>(event: Event): string {
  return JSON.stringify(event);
}

function formatEvent<Event extends FlowEvent>(event: Event): string {
  const { type, ...rest } = event;
  return Object.keys(rest).length === 0 ? type : `${type} (${JSON.stringify(rest)})`;
}

function formatDescription<Context, Event extends FlowEvent, State extends string>(
  path: FlowModelPath<Context, Event, State>,
): string {
  const target = JSON.stringify(path.state.value);

  if (path.steps.length === 0) {
    return `Reaches state ${target}`;
  }

  return `Reaches state ${target}: ${path.steps.map((step) => formatEvent(step.event)).join(" -> ")}`;
}

function createPath<Context, Event extends FlowEvent, State extends string>(
  state: FlowSnapshot<Context, State, Event>,
  steps: ReadonlyArray<FlowModelStep<Context, Event, State>>,
): FlowModelPath<Context, Event, State> {
  const path = Object.freeze({
    state,
    steps,
    weight: steps.length,
    description: "",
  });

  return Object.freeze({
    ...path,
    description: formatDescription(path),
  });
}

function extendPath<Context, Event extends FlowEvent, State extends string>(
  path: FlowModelPath<Context, Event, State>,
  event: Event,
  state: FlowSnapshot<Context, State, Event>,
): FlowModelPath<Context, Event, State> {
  return createPath(
    state,
    Object.freeze([
      ...path.steps,
      Object.freeze({
        event,
        state,
      }),
    ]),
  );
}

function configuredEventsForSnapshot<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  options: FlowModelTraversalOptions<Context, Event, State>,
): ReadonlyArray<Event> {
  if (typeof options.events === "function") {
    return options.events(snapshot);
  }

  if (options.events !== undefined) {
    return options.events;
  }

  const eventTypes = Object.keys(snapshot.machine.config.states[snapshot.value]?.on ?? {});
  return Object.freeze(eventTypes.map((type) => ({ type }) as Event));
}

function nextEventsForSnapshot<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  options: FlowModelTraversalOptions<Context, Event, State>,
): ReadonlyArray<Event> {
  return configuredEventsForSnapshot(snapshot, options).filter((event) => {
    if (!canMachineTransition(snapshot, event)) {
      return false;
    }

    return options.filterEvents?.(snapshot, event) ?? true;
  });
}

function transitionSnapshot<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  event: Event,
): FlowSnapshot<Context, State, Event> {
  return applyMachineEventWithMeta(planMachineEvent(snapshot, event)).snapshot;
}

function isCoveredSubpath<Context, Event extends FlowEvent, State extends string>(
  candidate: FlowModelPath<Context, Event, State>,
  other: FlowModelPath<Context, Event, State>,
  serializeState: (snapshot: FlowSnapshot<Context, State, Event>) => string,
  serializeEvent: (event: Event) => string,
): boolean {
  if (candidate.steps.length >= other.steps.length) {
    return false;
  }

  for (const [index, step] of candidate.steps.entries()) {
    const otherStep = other.steps[index];
    if (otherStep === undefined) {
      return false;
    }
    if (serializeEvent(step.event) !== serializeEvent(otherStep.event)) {
      return false;
    }
    if (serializeState(step.state) !== serializeState(otherStep.state)) {
      return false;
    }
  }

  return true;
}

function filterPaths<Context, Event extends FlowEvent, State extends string>(
  paths: ReadonlyArray<FlowModelPath<Context, Event, State>>,
  options: FlowModelTraversalOptions<Context, Event, State>,
): ReadonlyArray<FlowModelPath<Context, Event, State>> {
  const filtered =
    options.toState === undefined ? paths : paths.filter((path) => options.toState?.(path.state));

  if (options.allowDuplicatePaths === true) {
    return filtered;
  }

  const serializeState = options.serializeState ?? defaultSerializeState<Context, Event, State>;
  const serializeEvent = options.serializeEvent ?? defaultSerializeEvent<Event>;

  return filtered.filter(
    (candidate, candidateIndex) =>
      !filtered.some(
        (other, otherIndex) =>
          otherIndex !== candidateIndex &&
          isCoveredSubpath(candidate, other, serializeState, serializeEvent),
      ),
  );
}

function shortestPaths<Context, Event extends FlowEvent, State extends string>(
  initial: FlowSnapshot<Context, State, Event>,
  options: FlowModelTraversalOptions<Context, Event, State>,
): ReadonlyArray<FlowModelPath<Context, Event, State>> {
  const serializeState = options.serializeState ?? defaultSerializeState<Context, Event, State>;
  const maxDepth = options.maxDepth ?? 8;
  const limit = options.limit ?? 256;
  const initialPath = createPath(initial, Object.freeze([]));
  const queue: Array<FlowModelPath<Context, Event, State>> = [initialPath];
  const visited = new Set<string>([serializeState(initial)]);
  const discovered: Array<FlowModelPath<Context, Event, State>> = [initialPath];
  let traversed = 0;

  while (queue.length > 0 && traversed < limit) {
    const current = queue.shift()!;
    if (current.steps.length >= maxDepth) {
      continue;
    }

    for (const event of nextEventsForSnapshot(current.state, options)) {
      const next = transitionSnapshot(current.state, event);
      const nextKey = serializeState(next);
      if (visited.has(nextKey)) {
        continue;
      }

      visited.add(nextKey);
      const nextPath = extendPath(current, event, next);
      discovered.push(nextPath);
      queue.push(nextPath);
      traversed += 1;

      if (traversed >= limit) {
        break;
      }
    }
  }

  return filterPaths(discovered, options);
}

function simplePaths<Context, Event extends FlowEvent, State extends string>(
  initial: FlowSnapshot<Context, State, Event>,
  options: FlowModelTraversalOptions<Context, Event, State>,
): ReadonlyArray<FlowModelPath<Context, Event, State>> {
  const serializeState = options.serializeState ?? defaultSerializeState<Context, Event, State>;
  const maxDepth = options.maxDepth ?? 8;
  const limit = options.limit ?? 256;
  const initialPath = createPath(initial, Object.freeze([]));
  const discovered: Array<FlowModelPath<Context, Event, State>> = [initialPath];
  let traversed = 0;

  const visit = (current: FlowModelPath<Context, Event, State>, seen: ReadonlySet<string>) => {
    if (current.steps.length >= maxDepth || traversed >= limit) {
      return;
    }

    for (const event of nextEventsForSnapshot(current.state, options)) {
      const next = transitionSnapshot(current.state, event);
      const nextKey = serializeState(next);
      if (seen.has(nextKey)) {
        continue;
      }

      const nextPath = extendPath(current, event, next);
      discovered.push(nextPath);
      traversed += 1;
      visit(nextPath, new Set([...seen, nextKey]));

      if (traversed >= limit) {
        break;
      }
    }
  };

  visit(initialPath, new Set([serializeState(initial)]));
  return filterPaths(discovered, options);
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

  return Object.freeze({
    kind: "model" as const,
    machine,
    getShortestPaths: (options = {}) => shortestPaths(options.fromState ?? initial, options),
    getSimplePaths: (options = {}) => simplePaths(options.fromState ?? initial, options),
  });
}
