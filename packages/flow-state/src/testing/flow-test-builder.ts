import type {
  FlowAppDefinition,
  FlowEvent,
  FlowMachine,
  FlowModelDescriptor,
  FlowSeededResource,
  FlowStartedTestBuilder,
  FlowTestBuilder,
} from "../core/api/types.js";
import { fixtureResourcesForApp } from "../descriptors/inventory.js";

type BuilderState<App extends FlowAppDefinition | undefined = undefined> = Readonly<{
  readonly app?: App;
  readonly resources: ReadonlyArray<FlowSeededResource>;
  readonly fixtures: ReadonlyArray<string>;
}>;

type FlowTestBuilderFactoryDeps = Readonly<{
  readonly createHarness: <Context, Event extends FlowEvent, State extends string>(
    machine: FlowMachine<Context, Event, State>,
    app: FlowAppDefinition | undefined,
    resources: ReadonlyArray<FlowSeededResource>,
    input?: Partial<Context>,
  ) => FlowStartedTestBuilder<Context, Event, State>;
  readonly createModel: () => <Context, Event extends FlowEvent, State extends string>(
    machine: FlowMachine<Context, Event, State>,
    resources: ReadonlyArray<FlowSeededResource>,
    input?: Partial<Context>,
  ) => FlowModelDescriptor<FlowMachine<Context, Event, State>>;
}>;

type LegacyFlowTestApi = {
  <Context, Event extends FlowEvent, State extends string>(
    machine: FlowMachine<Context, Event, State>,
  ): FlowStartedTestBuilder<Context, Event, State>;
};

function resolvedBuilderResources<App extends FlowAppDefinition | undefined>(
  state: BuilderState<App>,
): ReadonlyArray<FlowSeededResource> {
  if (state.app === undefined) {
    return state.resources;
  }

  const app: FlowAppDefinition = state.app;
  return [
    ...state.fixtures.flatMap((fixture) => fixtureResourcesForApp(app, fixture)),
    ...state.resources,
  ];
}

export function createFlowTestBuilderFactory(deps: FlowTestBuilderFactoryDeps) {
  function createFlowTestBuilder<App extends FlowAppDefinition | undefined = undefined>(
    state: BuilderState<App> = { resources: [], fixtures: [] } as BuilderState<App>,
  ): FlowTestBuilder<App> {
    return {
      app: <NextApp extends FlowAppDefinition>(app: NextApp) =>
        createFlowTestBuilder<NextApp>({
          ...state,
          app,
        }),
      seedResources: (resources: ReadonlyArray<FlowSeededResource>) =>
        createFlowTestBuilder<App>({
          ...state,
          resources,
        }),
      seedModuleFixtures: (fixture: string) =>
        createFlowTestBuilder<App>({
          ...state,
          fixtures: [...state.fixtures, fixture],
        }),
      start: <Context, Event extends FlowEvent, State extends string>(
        machine: FlowMachine<Context, Event, State>,
        options?: Readonly<{ readonly input?: Partial<Context> }>,
      ) => deps.createHarness(machine, state.app, resolvedBuilderResources(state), options?.input),
      model: <Context, Event extends FlowEvent, State extends string>(
        machine: FlowMachine<Context, Event, State>,
        options?: Readonly<{ readonly input?: Partial<Context> }>,
      ) => deps.createModel()(machine, resolvedBuilderResources(state), options?.input),
    } as unknown as FlowTestBuilder<App>;
  }

  const flowTest = (<Context, Event extends FlowEvent, State extends string>(
    machine: FlowMachine<Context, Event, State>,
  ) => createFlowTestBuilder().start(machine)) as LegacyFlowTestApi;

  return {
    createFlowTestBuilder,
    flowTest,
  };
}
