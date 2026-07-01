import type {
  FlowChildDefinition,
  FlowEvent,
  FlowEventTransitions,
  FlowGraphChildSpec,
  FlowGraphDescriptor,
  FlowGraphEdge,
  FlowGraphEventlessTransition,
  FlowGraphNode,
  FlowGraphTimedTransition,
  FlowMachine,
  FlowMachineStateNode,
  FlowTransitionDefinition,
} from "./public/types.js";

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
