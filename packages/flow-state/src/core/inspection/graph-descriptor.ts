import type {
  AnyFlowMachine,
  FlowChildDefinition,
  FlowEvent,
  FlowGraphDescriptor,
  FlowGraphEdge,
  FlowGraphEventlessTransition,
  FlowGraphJsonOptions,
  FlowGraphNode,
  FlowGraphOwnershipOverlay,
  FlowGraphPathFromEventsOptions,
  FlowEventTransitions,
  FlowGraphChildSpec,
  FlowGraphTimedTransition,
  FlowMachine,
  FlowMachineStateNode,
  FlowTransitionDefinition,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "../api/types.js";
import { recoverMachineFamily } from "../machines/machine-family.js";
import { createFlowPathUtilities } from "../machines/flow-paths.js";
import { findGraphOwnershipOverlay } from "../orchestrator/app-ownership.js";
import { createStoryCoverage } from "./story-coverage.js";

const emptyArray = Object.freeze([]) as ReadonlyArray<never>;

function asReadonlyArray<Value>(
  value: Value | ReadonlyArray<Value> | undefined,
): ReadonlyArray<Value> {
  if (value === undefined) {
    return emptyArray;
  }

  return (Array.isArray(value) ? value : [value]) as ReadonlyArray<Value>;
}

function transitionTargets<Context, Event extends FlowEvent, State extends string>(
  source: State,
  transitions: FlowEventTransitions<Context, Event, State>,
): ReadonlyArray<State> {
  if (typeof transitions === "string") {
    return Object.freeze([transitions]);
  }

  if (Array.isArray(transitions)) {
    return Object.freeze(transitions.map((transition) => transition.target ?? source));
  }

  const transition = transitions as FlowTransitionDefinition<Context, Event, State>;
  return Object.freeze([transition.target ?? source]);
}

function childSpec(definition: FlowChildDefinition): FlowGraphChildSpec {
  return Object.freeze({
    id: definition.id,
    machineId: definition.config.machine.id,
    ...(definition.config.supervision === undefined
      ? {}
      : { supervision: definition.config.supervision }),
  });
}

function childSpecsForState<Context, Event extends FlowEvent, State extends string>(
  node: FlowMachineStateNode<Context, Event, State>,
): ReadonlyArray<FlowGraphChildSpec> {
  return Object.freeze(
    asReadonlyArray(node.invoke).flatMap((invoke) =>
      invoke.kind === "child" ? [childSpec(invoke)] : [],
    ),
  );
}

function timedTransitionsForState<Context, Event extends FlowEvent, State extends string>(
  source: State,
  node: FlowMachineStateNode<Context, Event, State>,
): ReadonlyArray<FlowGraphTimedTransition<State>> {
  return Object.freeze(
    asReadonlyArray(node.after).map((definition) =>
      Object.freeze({
        id: definition.id,
        delay: definition.config.delay,
        target: definition.config.target ?? source,
      }),
    ),
  );
}

function eventlessTransitionsForState<Context, Event extends FlowEvent, State extends string>(
  source: State,
  node: FlowMachineStateNode<Context, Event, State>,
): ReadonlyArray<FlowGraphEventlessTransition<State>> {
  if (node.always === undefined) {
    return Object.freeze([]);
  }

  return Object.freeze(
    transitionTargets(source, node.always).map((target, index) =>
      Object.freeze({
        id: `${source}:always:${index}`,
        target,
      }),
    ),
  );
}

function graphNodes<Context, Event extends FlowEvent, State extends string>(
  machine: FlowMachine<Context, Event, State>,
): ReadonlyArray<FlowGraphNode<State>> {
  const states = Object.entries(machine.config.states) as Array<
    [State, FlowMachineStateNode<Context, Event, State>]
  >;

  return Object.freeze(
    states.map(([id, node]) =>
      Object.freeze({
        id,
        terminal: node.type === "final",
        childSpecs: childSpecsForState(node),
        timedTransitions: timedTransitionsForState(id, node),
        eventlessTransitions: eventlessTransitionsForState(id, node),
      }),
    ),
  );
}

function graphEdgesForState<Context, Event extends FlowEvent, State extends string>(
  source: State,
  node: FlowMachineStateNode<Context, Event, State>,
): ReadonlyArray<FlowGraphEdge<State, Event["type"]>> {
  if (node.on === undefined) {
    return Object.freeze([]);
  }

  const edges: Array<FlowGraphEdge<State, Event["type"]>> = [];
  for (const [eventType, transitions] of Object.entries(node.on) as Array<
    [Event["type"], FlowEventTransitions<Context, Event, State> | undefined]
  >) {
    if (transitions === undefined) {
      continue;
    }

    for (const [index, target] of transitionTargets(source, transitions).entries()) {
      edges.push(
        Object.freeze({
          id: `${source}:${eventType}:${index}`,
          source,
          target,
          eventType,
          label: eventType,
        }),
      );
    }
  }

  return Object.freeze(edges);
}

function graphEdges<Context, Event extends FlowEvent, State extends string>(
  machine: FlowMachine<Context, Event, State>,
): ReadonlyArray<FlowGraphEdge<State, Event["type"]>> {
  const states = Object.entries(machine.config.states) as Array<
    [State, FlowMachineStateNode<Context, Event, State>]
  >;

  return Object.freeze(states.flatMap(([source, node]) => graphEdgesForState(source, node)));
}

function frozenValue<Value>(value: Value): Readonly<Value> {
  return Object.freeze(value);
}

function createGraphJson<Machine extends AnyFlowMachine>(
  machine: Machine,
  nodes: FlowGraphDescriptor<Machine>["nodes"],
  edges: FlowGraphDescriptor<Machine>["edges"],
  ownership?: FlowGraphOwnershipOverlay,
): ReturnType<FlowGraphDescriptor<Machine>["toJSON"]> {
  return frozenValue({
    kind: "graph" as const,
    machineId: machine.id,
    initial: machine.config.initial,
    nodes,
    edges,
    ...(ownership === undefined ? {} : { ownership }),
  });
}

export function createGraphDescriptor<Machine extends AnyFlowMachine>(
  machine: Machine,
): FlowGraphDescriptor<Machine> {
  type Context = InferMachineContext<Machine>;
  type Event = InferMachineEvent<Machine>;
  type State = InferMachineState<Machine>;
  type GraphDescriptor = FlowGraphDescriptor<Machine>;
  type GraphNode = GraphDescriptor["nodes"][number];
  type GraphEdge = GraphDescriptor["edges"][number];
  type GraphJson = ReturnType<GraphDescriptor["toJSON"]>;
  type GraphState = GraphNode["id"];
  type GraphEventType = GraphEdge["eventType"];
  type OutgoingEvents = ReturnType<GraphDescriptor["outgoingEvents"]>;
  type ReachableStates = ReturnType<GraphDescriptor["reachableStates"]>;
  type EventPath = ReturnType<GraphDescriptor["pathFromEvents"]>;

  let descriptor: GraphDescriptor;
  const familyMachine = recoverMachineFamily(machine);
  const nodes = graphNodes<Context, Event, State>(familyMachine);
  const edges = graphEdges<Context, Event, State>(familyMachine);
  const pathUtilities = createFlowPathUtilities<Context, Event, State>(
    familyMachine.getInitialSnapshot(),
  );
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const incomingEdgesMap = new Map<GraphState, Array<GraphEdge>>();
  const outgoingEventsMap = new Map<GraphState, Array<GraphEventType>>();
  const reachableTargetsMap = new Map<GraphState, Array<GraphState>>();

  for (const edge of edges) {
    const incoming = incomingEdgesMap.get(edge.target) ?? [];
    incoming.push(edge);
    incomingEdgesMap.set(edge.target, incoming);

    const outgoingEvents = outgoingEventsMap.get(edge.source) ?? [];
    if (!outgoingEvents.includes(edge.eventType)) {
      outgoingEvents.push(edge.eventType);
      outgoingEventsMap.set(edge.source, outgoingEvents);
    }

    const targets = reachableTargetsMap.get(edge.source) ?? [];
    if (!targets.includes(edge.target)) {
      targets.push(edge.target);
      reachableTargetsMap.set(edge.source, targets);
    }
  }

  const findState: GraphDescriptor["findState"] = (id) => nodeMap.get(id) as GraphNode | undefined;
  const incomingEdges: GraphDescriptor["incomingEdges"] = (state) =>
    frozenValue([...(incomingEdgesMap.get(state) ?? [])]) as ReadonlyArray<GraphEdge>;
  const outgoingEvents: GraphDescriptor["outgoingEvents"] = (state) =>
    frozenValue([...(outgoingEventsMap.get(state) ?? [])]) as OutgoingEvents;
  const reachableStates: GraphDescriptor["reachableStates"] = (fromState) => {
    const startState = (fromState ?? machine.config.initial) as GraphState;
    const visited = new Set<GraphState>();
    const queue: Array<GraphState> = [startState];
    const reachable: Array<GraphNode> = [];

    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined || visited.has(current)) {
        continue;
      }

      visited.add(current);
      const node = nodeMap.get(current);
      if (node !== undefined) {
        reachable.push(node);
      }

      for (const target of reachableTargetsMap.get(current) ?? []) {
        if (!visited.has(target)) {
          queue.push(target);
        }
      }
    }

    return frozenValue(reachable) as ReachableStates;
  };
  const shortestPaths: GraphDescriptor["shortestPaths"] = pathUtilities.shortestPaths;
  const simplePaths: GraphDescriptor["simplePaths"] = pathUtilities.simplePaths;
  const pathFromEvents: GraphDescriptor["pathFromEvents"] = (events, options) =>
    pathUtilities.pathFromEvents(
      events as ReadonlyArray<Event>,
      options as FlowGraphPathFromEventsOptions<Context, Event, State> | undefined,
    ) as EventPath;
  const storyCoverage: GraphDescriptor["storyCoverage"] = (stories) =>
    createStoryCoverage(descriptor, stories);
  const json: GraphJson = createGraphJson(machine, nodes, edges);
  const toJSON: GraphDescriptor["toJSON"] = (
    options: FlowGraphJsonOptions | string | undefined,
  ) => {
    const source =
      options !== undefined && options !== null && typeof options === "object"
        ? options.source
        : undefined;
    if (source === undefined) {
      return json;
    }

    const ownership = findGraphOwnershipOverlay(source, machine);
    if (ownership === undefined) {
      return json;
    }

    return createGraphJson(machine, nodes, edges, ownership);
  };

  descriptor = Object.freeze({
    kind: "graph" as const,
    machine,
    initial: machine.config.initial,
    nodes,
    edges,
    findState,
    incomingEdges,
    outgoingEvents,
    reachableStates,
    shortestPaths,
    simplePaths,
    pathFromEvents,
    storyCoverage,
    toJSON,
  }) as FlowGraphDescriptor<Machine>;

  return descriptor;
}
