import type { Layer } from "effect";
import { TestClock } from "effect/testing";

import * as flow from "../core/api/flow-core.js";
import type {
  FlowActor,
  FlowActorSnapshotTree,
  FlowAppDefinition,
  FlowAppFixtureName,
  FlowEvent,
  FlowMachine,
  FlowModelDescriptor,
  FlowRehydratedTestHarness,
  FlowRuntimeBootPayload,
  FlowSeededResource,
  FlowStartedTestBuilder,
  FlowTestHarness,
  FlowRuntime,
  FlowSnapshot,
} from "../core/api/types.js";
import { findGraphOwnershipOverlay } from "../core/orchestrator/app-ownership.js";

import { createAppDefinition } from "../descriptors/app.js";
import { fixtureResourcesForApp } from "../descriptors/inventory.js";
import { createRuntime } from "../runtime/contract-runtime.js";
import { createFlowTestBuilder } from "./flow-test.js";
import { applyInputToSnapshot } from "./apply-input-snapshot.js";
import { createFocusedTestApp } from "./focused-app.js";
import { createFlowTestRuntimeBoot } from "./flow-test-runtime-boot.js";
import {
  createRuntimeBackedStartedBuilder,
  createRuntimeBackedTestHarness,
  startRuntimeActorWithInitialSnapshot,
} from "./runtime-backed-test-harness.js";

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

export type FlowTestRehydrationConfig<
  Context,
  Event extends FlowEvent,
  State extends string,
  FixtureName extends string = never,
> = Readonly<{
  readonly snapshot: FlowSnapshot<Context, State, Event> | FlowActorSnapshotTree;
  readonly id?: string;
  readonly boot?: FlowRuntimeBootPayload;
  readonly resources?: ReadonlyArray<FlowSeededResource>;
  readonly fixtures?: ReadonlyArray<FixtureName>;
  readonly provide?: FlowTestLayers;
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
  readonly rehydrate: <Context, Event extends FlowEvent, State extends string>(
    machine: FlowMachine<Context, Event, State>,
    config: FlowTestRehydrationConfig<Context, Event, State, FlowAppFixtureName<App>>,
  ) => FlowRehydratedTestHarness<Context, Event, State>;
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
  readonly rehydrate: <Context, Event extends FlowEvent, State extends string>(
    machine: FlowMachine<Context, Event, State>,
    config: FlowTestRehydrationConfig<Context, Event, State>,
  ) => FlowRehydratedTestHarness<Context, Event, State>;
  readonly model: <Context, Event extends FlowEvent, State extends string>(
    machine: FlowMachine<Context, Event, State>,
    options?: Readonly<{ readonly input?: Partial<Context> }>,
    config?: FlowTestModelConfig<Context>,
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

function startConfiguredHarness<Context, Event extends FlowEvent, State extends string>(
  started: FlowStartedTestBuilder<Context, Event, State>,
  state: Readonly<{
    readonly layers: ReadonlyArray<Layer.Any>;
    readonly clock?: () => number;
  }>,
): FlowTestHarness<Context, Event, State> {
  const configured = state.layers.reduce((current, layer) => current.provide(layer), started);
  return (state.clock === undefined ? configured : configured.clock(state.clock)).start();
}

function startRuntimeBackedScenario<Context, Event extends FlowEvent, State extends string>(
  machine: FlowMachine<Context, Event, State>,
  app: FlowAppDefinition | undefined,
  resources: ReadonlyArray<FlowSeededResource>,
  state: Readonly<{
    readonly layers: ReadonlyArray<Layer.Any>;
    readonly input?: Partial<Context>;
    readonly clock?: () => number;
  }>,
): FlowTestHarness<Context, Event, State> {
  const runtimeApp =
    app === undefined ? createFocusedTestApp(machine, "FocusedTest", resources) : app;
  const runtimeBoot = createFlowTestRuntimeBoot(runtimeApp, resources);
  const initialSnapshot =
    state.input === undefined
      ? undefined
      : applyInputToSnapshot(
          machine.getInitialSnapshot() as FlowSnapshot<Context, State, Event>,
          state.input,
        );
  return startConfiguredHarness(
    createRuntimeBackedStartedBuilder(machine, {
      ensureRuntime: runtimeBoot.ensureRuntime,
      provide: runtimeBoot.provide,
      clock: runtimeBoot.clock,
      ...(initialSnapshot === undefined
        ? {}
        : {
            createActor: (runtime) =>
              startRuntimeActorWithInitialSnapshot(runtime, machine, initialSnapshot),
          }),
    }),
    state,
  );
}

function scenarioRuntimeApp<Context, Event extends FlowEvent, State extends string>(
  app: FlowAppDefinition,
  machine: FlowMachine<Context, Event, State>,
): FlowAppDefinition {
  if (findGraphOwnershipOverlay(app, machine) !== undefined) {
    return app;
  }

  const moduleIdBase = `FocusedScenarioRuntime:${machine.id}`;
  let moduleId = moduleIdBase;
  let suffix = 0;
  while (app.moduleMap[moduleId] !== undefined) {
    suffix += 1;
    moduleId = `${moduleIdBase}:${suffix}`;
  }

  return createAppDefinition({
    modules: [
      ...app.modules,
      flow.module(moduleId, {
        machines: {
          actor: machine,
        },
      }),
    ],
  });
}

function appScenarioResources<App extends FlowAppDefinition>(
  app: App,
  state: ScenarioState<unknown, FlowAppFixtureName<App>>,
): ReadonlyArray<FlowSeededResource> {
  return [
    ...state.fixtures.flatMap((fixture) => fixtureResourcesForApp(app, fixture)),
    ...state.resources,
  ];
}

function startFocusedHarness<Context, Event extends FlowEvent, State extends string>(
  machine: FlowMachine<Context, Event, State>,
  state: ScenarioState<Context, never>,
): FlowTestHarness<Context, Event, State> {
  return startRuntimeBackedScenario(machine, undefined, state.resources, state);
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
  return startRuntimeBackedScenario(
    machine,
    scenarioRuntimeApp(app, machine),
    appScenarioResources(app, state),
    state,
  );
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

function createRehydratedHarness<Context, Event extends FlowEvent, State extends string>(
  runtime: FlowRuntime<any, any>,
  actor: FlowActor<Context, Event, State>,
): FlowRehydratedTestHarness<Context, Event, State> {
  return createRuntimeBackedTestHarness(runtime, actor);
}

function startRehydratedHarness<
  Context,
  Event extends FlowEvent,
  State extends string,
  FixtureName extends string,
>(
  app: FlowAppDefinition | undefined,
  machine: FlowMachine<Context, Event, State>,
  config: FlowTestRehydrationConfig<Context, Event, State, FixtureName>,
): FlowRehydratedTestHarness<Context, Event, State> {
  const fixtureResources =
    app === undefined || config.fixtures === undefined
      ? []
      : config.fixtures.flatMap((fixture) => fixtureResourcesForApp(app, fixture));
  const resources = [...fixtureResources, ...(config.resources ?? [])];
  const runtimeApp =
    app === undefined ? createFocusedTestApp(machine, "FocusedRehydrate", resources) : app;
  const runtime = createRuntime(
    runtimeApp.layer({
      store: {
        kind: "store",
        mode: "test",
      },
      orchestrators: {
        kind: "orchestrators",
        mode: "test",
      },
      services: [TestClock.layer(), ...toLayerArray(config.provide)],
    }),
  );

  if (config.boot !== undefined) {
    runtime.hydrateBoot(config.boot);
  }
  runtime.resources.seedResources(resources);

  const actor = runtime.orchestrators.start(machine, {
    ...(config.id === undefined ? {} : { id: config.id }),
    snapshot: config.snapshot,
  });

  return createRehydratedHarness(runtime, actor);
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
        rehydrate: <Context, Event extends FlowEvent, State extends string>(
          machine: FlowMachine<Context, Event, State>,
          config: FlowTestRehydrationConfig<Context, Event, State, FlowAppFixtureName<App>>,
        ) => startRehydratedHarness(app, machine, config),
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
      config?: FlowTestModelConfig<Context>,
    ) => {
      const state = mergeModelConfig(options, config);
      return createFlowTestBuilder()
        .seedResources(state.resources)
        .model(machine, state.input === undefined ? undefined : { input: state.input });
    },
    rehydrate: <Context, Event extends FlowEvent, State extends string>(
      machine: FlowMachine<Context, Event, State>,
      config: FlowTestRehydrationConfig<Context, Event, State>,
    ) => startRehydratedHarness(undefined, machine, config),
  },
) as FlowTestApi;
