import { Clock, type Effect, type Exit, type Layer } from "effect";
import { TestClock } from "effect/testing";

import type {
  FlowAppDefinition,
  FlowRuntime,
  FlowSeededResource,
  FlowTransitionRuntime,
} from "../core/api/types.js";
import { createAppDefinition } from "../descriptors/app.js";
import { createRuntime } from "../runtime/contract-runtime.js";

type EffectRunner = (
  effect: Effect.Effect<void, never, never>,
  onExit?: (exit: Exit.Exit<void, unknown>) => void,
) => (interruptor?: number) => void;

export function createFlowTestRuntimeBoot(
  app: FlowAppDefinition | undefined,
  resources: ReadonlyArray<FlowSeededResource>,
) {
  let providedLayers: ReadonlyArray<Layer.Any> = [];
  let customClock = false;
  let clockNow = () => 0;
  let runtime: FlowRuntime<never, unknown> | undefined;

  const ensureRuntime = () => {
    if (runtime !== undefined) {
      return runtime;
    }

    const runtimeApp = app ?? createAppDefinition({ modules: [] as const });
    runtime = createRuntime(
      runtimeApp.layer({
        store: {
          kind: "store",
          mode: "test",
        },
        orchestrators: {
          kind: "orchestrators",
          mode: "test",
        },
        services: [...providedLayers, TestClock.layer()],
      }),
    );
    if (!customClock) {
      clockNow = () => runtime!.managedRuntime.runSync(Clock.currentTimeMillis);
    }
    runtime.resources.seedResources(resources);
    return runtime;
  };

  const currentRuntimeTimeMillis = (effectRuntime = ensureRuntime()) =>
    effectRuntime.managedRuntime.runSync(Clock.currentTimeMillis);

  const runEffect: EffectRunner = (effect, onExit) =>
    ensureRuntime().managedRuntime.runCallback(
      effect,
      onExit === undefined ? undefined : { onExit },
    );

  const transitionRuntime: FlowTransitionRuntime = Object.freeze({
    now: () => clockNow(),
  });

  return {
    ensureRuntime,
    currentRuntimeTimeMillis,
    clockNow: () => clockNow(),
    runEffect,
    transitionRuntime,
    provide: (service: Layer.Any) => {
      providedLayers = [...providedLayers, service];
    },
    clock: (now: () => number) => {
      customClock = true;
      clockNow = now;
    },
  };
}
