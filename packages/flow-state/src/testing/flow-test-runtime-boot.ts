import { Clock, Effect, Layer, type Exit } from "effect";
import { TestClock } from "effect/testing";

import type {
  FlowAppDefinition,
  FlowRuntime,
  FlowSeededResource,
  FlowTransitionRuntime,
} from "../core/api/types.js";
import { createAppDefinition } from "../descriptors/app.js";
import {
  type OwnedEffectHandle,
  ownedEffectHandleFromFiber,
} from "../core/runtime/owned-effect-runner.js";
import { createRuntime } from "../runtime/contract-runtime.js";

type FlowTestEffectRunner = (
  effect: Effect.Effect<void, never, never>,
  onExit?: (exit: Exit.Exit<void, unknown>) => void,
) => OwnedEffectHandle;

export function createFlowTestRuntimeBoot(
  app: FlowAppDefinition | undefined,
  resources: ReadonlyArray<FlowSeededResource>,
) {
  let providedLayers: ReadonlyArray<Layer.Any> = [];
  let customClock = false;
  let customClockOffset = 0;
  let clockNow = () => 0;
  let runtime: FlowRuntime<never, unknown> | undefined;

  const customClockLayer = Layer.effect(
    Clock.Clock,
    Effect.gen(function* () {
      const testClock = yield* TestClock.testClockWith(Effect.succeed);
      const currentTimeMillisUnsafe = () => testClock.currentTimeMillisUnsafe() + customClockOffset;
      const currentTimeNanosUnsafe = () =>
        BigInt(Math.floor(currentTimeMillisUnsafe() * 1_000_000));

      return {
        currentTimeMillisUnsafe,
        currentTimeMillis: Effect.sync(currentTimeMillisUnsafe),
        currentTimeNanosUnsafe,
        currentTimeNanos: Effect.sync(currentTimeNanosUnsafe),
        sleep: (duration: Parameters<typeof testClock.sleep>[0]) => testClock.sleep(duration),
        adjust: (duration: Parameters<typeof testClock.adjust>[0]) => testClock.adjust(duration),
        setTime: (timestamp: number) => testClock.setTime(timestamp),
        withLive: <A, E, R>(effect: Effect.Effect<A, E, R>) => testClock.withLive(effect),
      };
    }),
  );

  const syncClockReadSurface = (effectRuntime: FlowRuntime<never, unknown>) => {
    clockNow = () => effectRuntime.managedRuntime.runSync(Clock.currentTimeMillis);
  };

  const updateCustomClockOffset = (
    now: () => number,
    effectRuntime: FlowRuntime<never, unknown> = ensureRuntime(),
  ) => {
    const current = effectRuntime.managedRuntime.runSync(Clock.currentTimeMillis);
    customClockOffset += now() - current;
    syncClockReadSurface(effectRuntime);
  };

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
        services: [
          ...providedLayers,
          TestClock.layer(),
          ...(customClock ? [customClockLayer] : []),
        ],
      }),
    );
    syncClockReadSurface(runtime);
    runtime.resources.seedResources(resources);
    return runtime;
  };

  const currentRuntimeTimeMillis = (effectRuntime = ensureRuntime()) =>
    effectRuntime.managedRuntime.runSync(Clock.currentTimeMillis);

  const runEffect: FlowTestEffectRunner = (effect, onExit) => {
    const fiber = ensureRuntime().managedRuntime.runFork(effect);
    return ownedEffectHandleFromFiber(fiber, onExit);
  };

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
      if (runtime !== undefined) {
        updateCustomClockOffset(now, runtime);
      } else {
        customClockOffset = now();
      }
    },
  };
}
