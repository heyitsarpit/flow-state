import type { Layer } from "effect";

import type {
  FlowAppDefinition,
  FlowAppFixtureName,
  FlowEvent,
  FlowMachine,
  FlowModelDescriptor,
  FlowSeededResource,
  FlowStartedTestBuilder,
  FlowTestHarness,
} from "../public/types.js";

import { createFlowTestBuilder } from "./flow-test.js";

type FlowTestLayers = Layer.Any | ReadonlyArray<Layer.Any>;

export type FlowTestWithConfig<Context, FixtureName extends string = never> = Readonly<{
  readonly input?: Partial<Context>;
  readonly resources?: ReadonlyArray<FlowSeededResource>;
  readonly fixtures?: ReadonlyArray<FixtureName>;
  readonly provide?: FlowTestLayers;
  readonly clock?: () => number;
}>;

export type FlowTestModelConfig<Context, FixtureName extends string = never> = Readonly<{
  readonly input?: Partial<Context>;
  readonly resources?: ReadonlyArray<FlowSeededResource>;
  readonly fixtures?: ReadonlyArray<FixtureName>;
}>;

type ScenarioState<Context, FixtureName extends string> = Readonly<{
  readonly resources: ReadonlyArray<FlowSeededResource>;
  readonly fixtures: ReadonlyArray<FixtureName>;
  readonly layers: ReadonlyArray<Layer.Any>;
  readonly input?: Partial<Context>;
  readonly clock?: () => number;
}>;

export type FlowTestScenarioBuilder<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
  FixtureName extends string = never,
> = Readonly<{
  readonly with: (
    config: FlowTestWithConfig<Context, FixtureName>,
  ) => FlowTestScenarioBuilder<Context, Event, State, FixtureName>;
  readonly run: (events?: ReadonlyArray<Event>) => FlowTestHarness<Context, Event, State>;
}>;

export type FlowTestAppBuilder<App extends FlowAppDefinition> = Readonly<{
  readonly scenario: <Context, Event extends FlowEvent, State extends string>(
    machine: FlowMachine<Context, Event, State>,
    options?: Readonly<{ readonly input?: Partial<Context> }>,
  ) => FlowTestScenarioBuilder<Context, Event, State, FlowAppFixtureName<App>>;
  readonly model: <Context, Event extends FlowEvent, State extends string>(
    machine: FlowMachine<Context, Event, State>,
    options?: Readonly<{ readonly input?: Partial<Context> }>,
    config?: FlowTestModelConfig<Context, FlowAppFixtureName<App>>,
  ) => FlowModelDescriptor<FlowMachine<Context, Event, State>>;
}>;

export type FlowTestApi = {
  <Context, Event extends FlowEvent, State extends string>(
    machine: FlowMachine<Context, Event, State>,
    options?: Readonly<{ readonly input?: Partial<Context> }>,
  ): FlowTestScenarioBuilder<Context, Event, State>;
  readonly app: <App extends FlowAppDefinition>(app: App) => FlowTestAppBuilder<App>;
  readonly model: <Context, Event extends FlowEvent, State extends string>(
    machine: FlowMachine<Context, Event, State>,
    options?: Readonly<{ readonly input?: Partial<Context> }>,
  ) => FlowModelDescriptor<FlowMachine<Context, Event, State>>;
};

function toLayerArray(provide: FlowTestLayers | undefined): ReadonlyArray<Layer.Any> {
  if (provide === undefined) {
    return [];
  }
  if (Array.isArray(provide)) {
    return provide;
  }
  return [provide as Layer.Any];
}

function mergeScenarioState<Context, FixtureName extends string>(
  current: ScenarioState<Context, FixtureName>,
  config: FlowTestWithConfig<Context, FixtureName>,
): ScenarioState<Context, FixtureName> {
  return Object.freeze({
    resources: config.resources === undefined ? current.resources : config.resources,
    fixtures:
      config.fixtures === undefined ? current.fixtures : [...current.fixtures, ...config.fixtures],
    layers:
      config.provide === undefined
        ? current.layers
        : [...current.layers, ...toLayerArray(config.provide)],
    ...(config.input === undefined
      ? current.input === undefined
        ? {}
        : { input: current.input }
      : { input: config.input }),
    ...(config.clock === undefined
      ? current.clock === undefined
        ? {}
        : { clock: current.clock }
      : { clock: config.clock }),
  });
}

function createEmptyScenarioState<Context, FixtureName extends string = never>(): ScenarioState<
  Context,
  FixtureName
> {
  return Object.freeze({
    resources: [],
    fixtures: [],
    layers: [],
  });
}

function startFocusedHarness<Context, Event extends FlowEvent, State extends string>(
  machine: FlowMachine<Context, Event, State>,
  state: ScenarioState<Context, never>,
): FlowTestHarness<Context, Event, State> {
  const builder = createFlowTestBuilder().seedResources(state.resources);
  const started = builder.start(
    machine,
    state.input === undefined ? undefined : { input: state.input },
  );
  const configured = state.layers.reduce((current, layer) => current.provide(layer), started);

  return (state.clock === undefined ? configured : configured.clock(state.clock)).start();
}

function startAppHarness<
  Context,
  Event extends FlowEvent,
  State extends string,
  App extends FlowAppDefinition,
>(
  app: App,
  machine: FlowMachine<Context, Event, State>,
  state: ScenarioState<Context, FlowAppFixtureName<App>>,
): FlowTestHarness<Context, Event, State> {
  type AppHarnessBuilder = Readonly<{
    readonly seedModuleFixtures: (fixture: FlowAppFixtureName<App>) => AppHarnessBuilder;
    readonly start: (
      machine: FlowMachine<Context, Event, State>,
      options?: Readonly<{ readonly input?: Partial<Context> }>,
    ) => FlowStartedTestBuilder<Context, Event, State>;
  }>;

  let builder = createFlowTestBuilder()
    .app(app)
    .seedResources(state.resources) as unknown as AppHarnessBuilder;
  for (const fixture of state.fixtures) {
    builder = builder.seedModuleFixtures(fixture);
  }

  const started = builder.start(
    machine,
    state.input === undefined ? undefined : { input: state.input },
  );
  const configured = state.layers.reduce((current, layer) => current.provide(layer), started);

  return (state.clock === undefined ? configured : configured.clock(state.clock)).start();
}

function createFocusedScenarioBuilder<Context, Event extends FlowEvent, State extends string>(
  machine: FlowMachine<Context, Event, State>,
  state: ScenarioState<Context, never>,
): FlowTestScenarioBuilder<Context, Event, State> {
  return Object.freeze({
    with: (config) => createFocusedScenarioBuilder(machine, mergeScenarioState(state, config)),
    run: (events) => {
      const harness = startFocusedHarness(machine, state);
      return events === undefined ? harness : harness.sendAll(events);
    },
  });
}

function createAppScenarioBuilder<
  Context,
  Event extends FlowEvent,
  State extends string,
  App extends FlowAppDefinition,
>(
  app: App,
  machine: FlowMachine<Context, Event, State>,
  state: ScenarioState<Context, FlowAppFixtureName<App>>,
): FlowTestScenarioBuilder<Context, Event, State, FlowAppFixtureName<App>> {
  return Object.freeze({
    with: (config) => createAppScenarioBuilder(app, machine, mergeScenarioState(state, config)),
    run: (events) => {
      const harness = startAppHarness(app, machine, state);
      return events === undefined ? harness : harness.sendAll(events);
    },
  });
}

function scenarioOptions<Context>(
  options?: Readonly<{ readonly input?: Partial<Context> }>,
): FlowTestWithConfig<Context> {
  return options?.input === undefined ? {} : { input: options.input };
}

function mergeModelConfig<Context, FixtureName extends string>(
  options: Readonly<{ readonly input?: Partial<Context> }> | undefined,
  config: FlowTestModelConfig<Context, FixtureName> | undefined,
): ScenarioState<Context, FixtureName> {
  const withOptions = mergeScenarioState(
    createEmptyScenarioState<Context, FixtureName>(),
    scenarioOptions(options) as FlowTestWithConfig<Context, FixtureName>,
  );

  return config === undefined
    ? withOptions
    : mergeScenarioState(withOptions, config as FlowTestWithConfig<Context, FixtureName>);
}

function createAppModel<
  Context,
  Event extends FlowEvent,
  State extends string,
  App extends FlowAppDefinition,
>(
  app: App,
  machine: FlowMachine<Context, Event, State>,
  state: ScenarioState<Context, FlowAppFixtureName<App>>,
): FlowModelDescriptor<FlowMachine<Context, Event, State>> {
  type AppModelBuilder = Readonly<{
    readonly seedModuleFixtures: (fixture: FlowAppFixtureName<App>) => AppModelBuilder;
    readonly model: (
      machine: FlowMachine<Context, Event, State>,
      options?: Readonly<{ readonly input?: Partial<Context> }>,
    ) => FlowModelDescriptor<FlowMachine<Context, Event, State>>;
  }>;

  let builder = createFlowTestBuilder()
    .app(app)
    .seedResources(state.resources) as unknown as AppModelBuilder;
  for (const fixture of state.fixtures) {
    builder = builder.seedModuleFixtures(fixture);
  }

  return builder.model(machine, state.input === undefined ? undefined : { input: state.input });
}

export const test = Object.assign(
  <Context, Event extends FlowEvent, State extends string>(
    machine: FlowMachine<Context, Event, State>,
    options?: Readonly<{ readonly input?: Partial<Context> }>,
  ) =>
    createFocusedScenarioBuilder(
      machine,
      mergeScenarioState(createEmptyScenarioState(), scenarioOptions(options)),
    ),
  {
    app: <App extends FlowAppDefinition>(app: App): FlowTestAppBuilder<App> =>
      Object.freeze({
        scenario: <Context, Event extends FlowEvent, State extends string>(
          machine: FlowMachine<Context, Event, State>,
          options?: Readonly<{ readonly input?: Partial<Context> }>,
        ) =>
          createAppScenarioBuilder(
            app,
            machine,
            mergeScenarioState(
              createEmptyScenarioState<Context, FlowAppFixtureName<App>>(),
              scenarioOptions(options) as FlowTestWithConfig<Context, FlowAppFixtureName<App>>,
            ),
          ),
        model: <Context, Event extends FlowEvent, State extends string>(
          machine: FlowMachine<Context, Event, State>,
          options?: Readonly<{ readonly input?: Partial<Context> }>,
          config?: FlowTestModelConfig<Context, FlowAppFixtureName<App>>,
        ) =>
          createAppModel(
            app,
            machine,
            mergeModelConfig<Context, FlowAppFixtureName<App>>(options, config),
          ),
      }),
    model: <Context, Event extends FlowEvent, State extends string>(
      machine: FlowMachine<Context, Event, State>,
      options?: Readonly<{ readonly input?: Partial<Context> }>,
    ) => createFlowTestBuilder().model(machine, options),
  },
) as FlowTestApi;
