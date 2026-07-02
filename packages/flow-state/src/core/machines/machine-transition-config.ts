import type {
  FlowAfterDefinition,
  FlowEvent,
  FlowEventTransitions,
  FlowSnapshot,
  FlowTransitionDefinition,
} from "../api/types.js";

function isReadonlyArray<T>(value: T | ReadonlyArray<T>): value is ReadonlyArray<T> {
  return Array.isArray(value);
}

function normalizeTransitionDefinitions<Context, Event extends FlowEvent, State extends string>(
  configured: FlowEventTransitions<Context, Event, State> | undefined,
): ReadonlyArray<FlowTransitionDefinition<Context, Event, State>> {
  if (configured === undefined) {
    return [];
  }

  if (typeof configured === "string") {
    return [{ target: configured as State }];
  }

  if (Array.isArray(configured)) {
    return configured as ReadonlyArray<FlowTransitionDefinition<Context, Event, State>>;
  }

  return [configured as FlowTransitionDefinition<Context, Event, State>];
}

export function transitionsFor<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  eventType: Event["type"],
): ReadonlyArray<FlowTransitionDefinition<Context, Event, State>> {
  return normalizeTransitionDefinitions(
    snapshot.machine.config.states[snapshot.value]?.on?.[eventType] as
      | FlowEventTransitions<Context, Event, State>
      | undefined,
  );
}

export function alwaysTransitionsFor<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
): ReadonlyArray<FlowTransitionDefinition<Context, Event, State>> {
  return normalizeTransitionDefinitions(
    snapshot.machine.config.states[snapshot.value]?.always as
      | FlowEventTransitions<Context, Event, State>
      | undefined,
  );
}

function normalizeAfterDefinitions<Context, Event extends FlowEvent, State extends string>(
  configured:
    | FlowAfterDefinition<State, Context, Event>
    | ReadonlyArray<FlowAfterDefinition<State, Context, Event>>
    | undefined,
): ReadonlyArray<FlowAfterDefinition<State, Context, Event>> {
  if (configured === undefined) {
    return [];
  }

  return isReadonlyArray(configured) ? configured : [configured];
}

export function afterDefinitionsForState<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
): ReadonlyArray<FlowAfterDefinition<State, Context, Event>> {
  return normalizeAfterDefinitions(
    snapshot.machine.config.states[snapshot.value]?.after as
      | FlowAfterDefinition<State, Context, Event>
      | ReadonlyArray<FlowAfterDefinition<State, Context, Event>>
      | undefined,
  );
}
