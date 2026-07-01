import type {
  FlowEvent,
  FlowEventTransitions,
  FlowGraphDescriptor,
  FlowGraphEdge,
  FlowGraphNode,
  FlowMachine,
  FlowMachineStateNode,
  FlowTransitionDefinition,
} from "./public/types.js";

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

function graphNodes<Context, Event extends FlowEvent, State extends string>(
  machine: FlowMachine<Context, Event, State>,
): ReadonlyArray<FlowGraphNode<State>> {
  return Object.freeze(
    Object.keys(machine.config.states).map((id) =>
      Object.freeze({
        id: id as State,
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

export function createGraphDescriptor<
  Context,
  Event extends FlowEvent,
  State extends string,
  Initial extends State,
  Id extends string,
  Machine extends FlowMachine<Context, Event, State, Initial, Id>,
>(machine: Machine): FlowGraphDescriptor<Machine> {
  return Object.freeze({
    kind: "graph" as const,
    machine,
    initial: machine.config.initial,
    nodes: graphNodes(machine),
    edges: graphEdges(machine),
  }) as FlowGraphDescriptor<Machine>;
}
