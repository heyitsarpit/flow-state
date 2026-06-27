import type {
  FlowAppDefinition,
  FlowEvent,
  FlowIssue,
  FlowMachine,
  FlowResourceSnapshot,
  FlowSeededResource,
  FlowSnapshot,
  FlowStartedTestBuilder,
  FlowStreamSnapshot,
  FlowTestBuilder,
  FlowTestCache,
  FlowTestHarness,
  FlowTransactionSnapshot,
} from "../public/types.js";
import { canMachineTransition, planMachineEvent } from "../machine-transition.js";

type BuilderState = Readonly<{
  readonly app?: FlowAppDefinition;
  readonly resources: ReadonlyArray<FlowSeededResource>;
  readonly fixtures: ReadonlyArray<string>;
}>;

function createIdleSnapshot(id: string): FlowResourceSnapshot {
  return {
    id,
    status: "idle",
    availability: "empty",
    activity: "idle",
    freshness: "fresh",
    isPlaceholderData: false,
  };
}

function createSuccessSnapshot(id: string, value: unknown): FlowResourceSnapshot {
  return {
    id,
    status: "success",
    availability: "value",
    activity: "idle",
    freshness: "fresh",
    value,
    isPlaceholderData: false,
  };
}

function createCache(resources: ReadonlyArray<FlowSeededResource>): FlowTestCache {
  const byId = new Map<string, FlowResourceSnapshot>();
  for (const resource of resources) {
    byId.set(resource.ref.id, createSuccessSnapshot(resource.ref.id, resource.value));
  }
  return {
    query: (id) => byId.get(id),
  };
}

function createHarness<Context, Event extends FlowEvent, State extends string>(
  machine: FlowMachine<Context, Event, State>,
  resources: ReadonlyArray<FlowSeededResource>,
): FlowStartedTestBuilder<Context, Event, State> {
  const cache = createCache(resources);
  const issues: ReadonlyArray<FlowIssue> = [];
  const streams: Readonly<Record<string, FlowStreamSnapshot>> = {};
  const transactions: Readonly<Record<string, FlowTransactionSnapshot>> = {};
  let snapshot = machine.getInitialSnapshot() as FlowSnapshot<Context, State, Event>;

  const harness: FlowTestHarness<Context, Event, State> = {
    state: () => snapshot.value,
    context: () => snapshot.context,
    snapshot: () => ({
      ...snapshot,
      resources: Object.fromEntries(
        resources.map((resource) => [
          resource.ref.id,
          cache.query(resource.ref.id) ?? createIdleSnapshot(resource.ref.id),
        ]),
      ),
      transactions,
      streams,
    }),
    send: (event) => {
      snapshot = planMachineEvent(harness.snapshot(), event).nextSnapshot;
      return harness;
    },
    can: (event) => canMachineTransition(harness.snapshot(), event),
    cache: () => cache,
    transactions: () => transactions,
    streams: () => streams,
    issues: () => issues,
    flush: async () => undefined,
    advance: async (_duration) => undefined,
    settle: async (_bounds) => undefined,
  };

  const started: FlowStartedTestBuilder<Context, Event, State> = Object.assign(harness, {
    provide: (_service: unknown) => started,
    clock: (_now: () => number) => started,
    start: () => harness,
  });

  snapshot = harness.snapshot();

  return started;
}

function createBuilder(state: BuilderState = { resources: [], fixtures: [] }): FlowTestBuilder {
  return {
    app: (app) =>
      createBuilder({
        ...state,
        app,
      }),
    seedResources: (resources) =>
      createBuilder({
        ...state,
        resources,
      }),
    seedModuleFixtures: (fixture) =>
      createBuilder({
        ...state,
        fixtures: [...state.fixtures, fixture],
      }),
    start: <Context, Event extends FlowEvent, State extends string>(
      machine: FlowMachine<Context, Event, State>,
    ) => {
      void state.app;
      void state.fixtures;
      return createHarness(machine, state.resources);
    },
  };
}

export const flowTest = Object.assign(
  ((machine?: FlowMachine): FlowTestBuilder | FlowStartedTestBuilder => {
    const builder = createBuilder();
    return machine === undefined ? builder : builder.start(machine);
  }) as ((machine?: FlowMachine) => FlowTestBuilder | FlowStartedTestBuilder) & FlowTestBuilder,
  createBuilder(),
  {
    app: (app: FlowAppDefinition) => createBuilder().app(app),
    model: (machine: FlowMachine) =>
      Object.freeze({
        kind: "model" as const,
        machine,
      }),
  },
);
