import type {
  FlowAppDefinition,
  FlowEvent,
  FlowMachine,
  FlowSeededResource,
  FlowSnapshot,
  FlowStartedTestBuilder,
} from "../core/api/types.js";
import { createFlowModel } from "./flow-model.js";
import { createFocusedTestApp } from "./focused-app.js";
import { createFlowTestBuilderFactory } from "./flow-test-builder.js";
import { createFlowTestRuntimeBoot } from "./flow-test-runtime-boot.js";
import { applyInputToSnapshot } from "./apply-input-snapshot.js";
import {
  createRuntimeBackedStartedBuilder,
  startRuntimeActorWithInitialSnapshot,
} from "./runtime-backed-test-harness.js";

function createHarness<Context, Event extends FlowEvent, State extends string>(
  machine: FlowMachine<Context, Event, State>,
  app: FlowAppDefinition | undefined,
  resources: ReadonlyArray<FlowSeededResource>,
  input?: Partial<Context>,
): FlowStartedTestBuilder<Context, Event, State> {
  const runtimeApp =
    app === undefined ? createFocusedTestApp(machine, "FocusedTest", resources) : app;
  const runtimeBoot = createFlowTestRuntimeBoot(runtimeApp, resources);
  const initialSnapshot =
    input === undefined
      ? undefined
      : applyInputToSnapshot(
          machine.getInitialSnapshot() as FlowSnapshot<Context, State, Event>,
          input,
        );

  return createRuntimeBackedStartedBuilder(machine, {
    ensureRuntime: runtimeBoot.ensureRuntime,
    provide: runtimeBoot.provide,
    clock: runtimeBoot.clock,
    ...(initialSnapshot === undefined
      ? {}
      : {
          createActor: (runtime) =>
            startRuntimeActorWithInitialSnapshot(runtime, machine, initialSnapshot),
        }),
  });
}

const flowTestBuilderFacade = createFlowTestBuilderFactory({
  createHarness,
  createModel: () => createFlowModel,
});

export const createFlowTestBuilder = flowTestBuilderFacade.createFlowTestBuilder;

export const flowTest = <Context, Event extends FlowEvent, State extends string>(
  machine: FlowMachine<Context, Event, State>,
): FlowStartedTestBuilder<Context, Event, State> => createHarness(machine, undefined, []);
