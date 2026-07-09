import type {
  FlowEvent,
  FlowGraphPath,
  FlowGraphPathFromEventsOptions,
  FlowMachine,
  FlowModelPath,
  FlowModelTraversalOptions,
  FlowSnapshot,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "../core/api/types.js";

type FlowCliPathMachine = FlowMachine<unknown, FlowEvent, string>;

type FlowCliStoryPathRegistry = Readonly<{
  machinesById: ReadonlyMap<string, FlowCliPathMachine>;
}>;

export type FlowCliStoryPathStrategy = "simple" | "shortest";

type FlowCliStoryPathRequestOptions = Readonly<{
  machine: string;
  strategy: FlowCliStoryPathStrategy;
  events: ReadonlyArray<FlowEvent>;
  "from-state"?: string;
  "to-state"?: string;
  limit?: number;
  check: boolean;
}>;

export type FlowCliPathSummary<
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
> = Readonly<{
  finalState: State;
  stepCount: number;
  weight: number;
  events: ReadonlyArray<Event>;
}>;

export type FlowCliStoryPathRequest<Machine extends FlowCliPathMachine = FlowCliPathMachine> =
  Readonly<{
    machine: Machine;
    strategy: FlowCliStoryPathStrategy;
    check: boolean;
    events: ReadonlyArray<InferMachineEvent<Machine>>;
    fromState?: InferMachineState<Machine>;
    toState?: InferMachineState<Machine>;
    modelOptions: FlowModelTraversalOptions<
      InferMachineContext<Machine>,
      InferMachineEvent<Machine>,
      InferMachineState<Machine>
    >;
    graphOptions: FlowGraphPathFromEventsOptions<
      InferMachineContext<Machine>,
      InferMachineEvent<Machine>,
      InferMachineState<Machine>
    >;
  }>;

function stateIdsForMachine(machine: FlowCliPathMachine): ReadonlyArray<string> {
  return Object.freeze(Object.keys(machine.config.states).sort());
}

function snapshotForState<Machine extends FlowCliPathMachine>(
  machine: Machine,
  stateId: InferMachineState<Machine>,
): FlowSnapshot<
  InferMachineContext<Machine>,
  InferMachineState<Machine>,
  InferMachineEvent<Machine>
> {
  return Object.freeze({
    ...machine.getInitialSnapshot(),
    value: stateId,
  }) as unknown as FlowSnapshot<
    InferMachineContext<Machine>,
    InferMachineState<Machine>,
    InferMachineEvent<Machine>
  >;
}

function pathSummary<Event extends FlowEvent, State extends string>(
  path: FlowModelPath<unknown, Event, State>,
): FlowCliPathSummary<Event, State> {
  return Object.freeze({
    finalState: path.state.value,
    stepCount: path.steps.length,
    weight: path.weight,
    events: Object.freeze(path.steps.map((step) => step.event)),
  });
}

export function normalizeStoryPathRequest(
  registry: FlowCliStoryPathRegistry,
  options: FlowCliStoryPathRequestOptions,
): FlowCliStoryPathRequest {
  const machine = registry.machinesById.get(options.machine);

  if (machine === undefined) {
    throw new Error(
      `Unknown machine '${options.machine}'. Available machine ids: ${[
        ...registry.machinesById.keys(),
      ]
        .sort()
        .join(", ")}.`,
    );
  }

  const typedMachine = machine as FlowCliPathMachine;
  const availableStateIds = stateIdsForMachine(typedMachine);
  const fromState = options["from-state"] as InferMachineState<typeof typedMachine> | undefined;
  const toState = options["to-state"] as InferMachineState<typeof typedMachine> | undefined;
  const events = options.events as ReadonlyArray<InferMachineEvent<typeof typedMachine>>;

  if (options.check && events.length === 0) {
    throw new Error("`story paths --check` requires at least one `--event <json>` input.");
  }

  if (fromState !== undefined && !availableStateIds.includes(fromState)) {
    throw new Error(
      `Unknown start state '${fromState}' for machine '${typedMachine.id}'. Available states: ${availableStateIds.join(", ")}.`,
    );
  }

  if (toState !== undefined && !availableStateIds.includes(toState)) {
    throw new Error(
      `Unknown target state '${toState}' for machine '${typedMachine.id}'. Available states: ${availableStateIds.join(", ")}.`,
    );
  }

  const fromSnapshot =
    fromState === undefined ? undefined : snapshotForState(typedMachine, fromState);
  const toStatePredicate =
    toState === undefined
      ? undefined
      : (
          snapshot: FlowSnapshot<
            InferMachineContext<typeof typedMachine>,
            InferMachineState<typeof typedMachine>,
            InferMachineEvent<typeof typedMachine>
          >,
        ) => snapshot.value === toState;

  return Object.freeze({
    machine: typedMachine,
    strategy: options.strategy,
    check: options.check,
    events,
    ...(fromState === undefined ? {} : { fromState }),
    ...(toState === undefined ? {} : { toState }),
    modelOptions: Object.freeze({
      ...(events.length === 0 ? {} : { events }),
      ...(fromSnapshot === undefined ? {} : { fromState: fromSnapshot }),
      ...(toStatePredicate === undefined ? {} : { toState: toStatePredicate }),
      ...(options.limit === undefined ? {} : { limit: options.limit }),
    }),
    graphOptions: Object.freeze({
      ...(fromSnapshot === undefined ? {} : { fromState: fromSnapshot }),
      ...(toStatePredicate === undefined ? {} : { toState: toStatePredicate }),
    }),
  });
}

export function createStoryPathListEnvelope<Machine extends FlowCliPathMachine>(
  request: FlowCliStoryPathRequest<Machine>,
  paths: ReadonlyArray<
    FlowModelPath<
      InferMachineContext<Machine>,
      InferMachineEvent<Machine>,
      InferMachineState<Machine>
    >
  >,
) {
  return Object.freeze({
    kind: "story-path-list",
    machineId: request.machine.id,
    strategy: request.strategy,
    pathCount: paths.length,
    ...(request.fromState === undefined ? {} : { fromState: request.fromState }),
    ...(request.toState === undefined ? {} : { toState: request.toState }),
    ...(request.events.length === 0 ? {} : { events: request.events }),
    paths: Object.freeze(paths.map((path) => pathSummary(path))),
  }) satisfies FlowCliStoryPathListEnvelope<InferMachineEvent<Machine>, InferMachineState<Machine>>;
}

export function createStoryPathCheckEnvelope<Machine extends FlowCliPathMachine>(
  request: FlowCliStoryPathRequest<Machine>,
  path:
    | FlowGraphPath<
        InferMachineContext<Machine>,
        InferMachineEvent<Machine>,
        InferMachineState<Machine>
      >
    | undefined,
) {
  return Object.freeze({
    kind: "story-path-check",
    machineId: request.machine.id,
    ok: path !== undefined,
    ...(request.fromState === undefined ? {} : { fromState: request.fromState }),
    ...(request.toState === undefined ? {} : { toState: request.toState }),
    events: request.events,
    ...(path === undefined
      ? { reason: "No legal path matched the supplied event sequence." }
      : { path: pathSummary(path) }),
  }) satisfies FlowCliStoryPathCheckEnvelope<
    InferMachineEvent<Machine>,
    InferMachineState<Machine>
  >;
}

export function formatStoryPathListText(
  envelope: Readonly<{
    machineId: string;
    strategy: FlowCliStoryPathStrategy;
    pathCount: number;
    fromState?: string;
    toState?: string;
    events?: ReadonlyArray<FlowEvent>;
    paths: ReadonlyArray<FlowCliPathSummary>;
  }>,
): string {
  const shown = envelope.paths.slice(0, 12);
  const lines = [
    `story.paths ${envelope.machineId} — ${envelope.pathCount} ${envelope.pathCount === 1 ? "path" : "paths"}`,
    `strategy: ${envelope.strategy}`,
  ];

  if (envelope.fromState !== undefined) {
    lines.push(`from: ${envelope.fromState}`);
  }

  if (envelope.toState !== undefined) {
    lines.push(`to: ${envelope.toState}`);
  }

  if (envelope.events !== undefined) {
    lines.push(`events: ${envelope.events.map((event) => event.type).join(", ")}`);
  }

  if (envelope.paths.length === 0) {
    lines.push("result: none");
    return lines.join("\n");
  }

  lines.push("paths:");
  for (const path of shown) {
    lines.push(
      `  ${path.finalState}  ${path.events.map((event) => event.type).join(" -> ") || "(initial)"}`,
    );
  }
  if (shown.length < envelope.paths.length)
    lines.push(`more: ${envelope.paths.length - shown.length} paths; use --format json for all`);

  return lines.join("\n");
}

export function formatStoryPathCheckText(
  envelope: Readonly<{
    machineId: string;
    ok: boolean;
    fromState?: string;
    toState?: string;
    events: ReadonlyArray<FlowEvent>;
    reason?: string;
    path?: FlowCliPathSummary;
  }>,
): string {
  const lines = [
    `story.paths.check ${envelope.machineId} — ${envelope.ok ? "VALID" : "INVALID"}`,
    `events: ${envelope.events.map((event) => event.type).join(" -> ")}`,
  ];

  if (envelope.fromState !== undefined) {
    lines.push(`from: ${envelope.fromState}`);
  }

  if (envelope.toState !== undefined) {
    lines.push(`to: ${envelope.toState}`);
  }

  if (!envelope.ok) {
    lines.push(
      `reason: ${envelope.reason ?? "No legal path matched the supplied event sequence."}`,
    );
    return lines.join("\n");
  }

  if (envelope.path === undefined) {
    throw new Error("Expected a resolved path when formatting a valid story path check.");
  }

  lines.push(`final: ${envelope.path.finalState}`);
  return lines.join("\n");
}
export type FlowCliStoryPathListEnvelope<
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
> = Readonly<{
  kind: "story-path-list";
  machineId: string;
  strategy: FlowCliStoryPathStrategy;
  pathCount: number;
  fromState?: string;
  toState?: string;
  events?: ReadonlyArray<Event>;
  paths: ReadonlyArray<FlowCliPathSummary<Event, State>>;
}>;

export type FlowCliStoryPathCheckEnvelope<
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
> = Readonly<{
  kind: "story-path-check";
  machineId: string;
  ok: boolean;
  fromState?: string;
  toState?: string;
  events: ReadonlyArray<Event>;
  reason?: string;
  path?: FlowCliPathSummary<Event, State>;
}>;
