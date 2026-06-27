import { Effect, Layer, ManagedRuntime } from "effect";

import type {
  FlowActor,
  FlowEvent,
  FlowMachine,
  FlowRuntime,
  FlowRuntimeResources,
  FlowSeededResource,
} from "../public/types.js";
import { HostSignals } from "../services/host-signals.js";
import { NotificationScheduler } from "../services/notification-scheduler.js";
import { OrchestratorSystem } from "../services/orchestrator-system.js";
import { ResourceStore } from "../services/resource-store.js";
import { TraceLog } from "../services/trace.js";

// Runtime resource subscriptions are imperative host handles: they need
// explicit early release, so we track only currently-active cleanups here.
function trackRuntimeCleanup(cleanupRegistry: Set<() => void>, cleanup: () => void): () => void {
  let active = true;

  const release = () => {
    if (!active) {
      return;
    }

    active = false;
    cleanupRegistry.delete(release);
    cleanup();
  };

  cleanupRegistry.add(release);
  return release;
}

function createRuntimeResources<RuntimeServices, LayerError>(
  managedRuntime: ManagedRuntime.ManagedRuntime<ResourceStore | RuntimeServices, LayerError>,
  cleanupRegistry: Set<() => void>,
): FlowRuntimeResources {
  return {
    seedResources: (resources: ReadonlyArray<FlowSeededResource>) =>
      managedRuntime.runSync(Effect.flatMap(ResourceStore, (store) => store.seed(resources))),
    subscribe: (ref, listener) =>
      trackRuntimeCleanup(
        cleanupRegistry,
        managedRuntime.runSync(
          Effect.flatMap(ResourceStore, (store) => store.subscribe(ref, listener)),
        ),
      ),
    patch: (ref, updater) =>
      managedRuntime.runSync(
        Effect.flatMap(ResourceStore, (store) =>
          store.patch(ref, (current) =>
            updater((current as Record<string, unknown> | undefined) ?? {}),
          ),
        ),
      ),
    get: (ref) => managedRuntime.runSync(Effect.flatMap(ResourceStore, (store) => store.get(ref))),
  };
}

export function createRuntime(): FlowRuntime<
  NotificationScheduler | ResourceStore | OrchestratorSystem | HostSignals | TraceLog
>;
export function createRuntime<AppLayer extends Layer.Layer<any, any, never>>(
  layer: AppLayer,
): FlowRuntime<Layer.Success<AppLayer>, Layer.Error<AppLayer>>;
export function createRuntime<AppLayer extends Layer.Layer<any, any, never>>(
  layer?: AppLayer,
): FlowRuntime<any, any> {
  const notificationScheduler = NotificationScheduler.testLayer;
  const resourceStore = ResourceStore.layer.pipe(Layer.provide(notificationScheduler));
  const runtimeLayer = (layer ??
    Layer.mergeAll(
      notificationScheduler,
      resourceStore,
      OrchestratorSystem.layer,
      HostSignals.testLayer,
      TraceLog.layer,
    )) as Layer.Layer<any, any, never>;
  const managedRuntime = ManagedRuntime.make(runtimeLayer);
  const cleanupRegistry = new Set<() => void>();
  let disposePromise: Promise<void> | undefined;
  const resources = createRuntimeResources(managedRuntime, cleanupRegistry);
  const orchestrators = Object.freeze({
    start: <ContextShape, Event extends FlowEvent, State extends string>(
      machine: FlowMachine<ContextShape, Event, State>,
      options?: Readonly<{ readonly id?: string; readonly policy?: string }>,
    ): FlowActor<ContextShape, Event, State> =>
      managedRuntime.runSync(
        Effect.flatMap(OrchestratorSystem, (system) => system.start(machine, options)),
      ),
    get: (id: string): FlowActor | null =>
      managedRuntime.runSync(Effect.flatMap(OrchestratorSystem, (system) => system.get(id))),
    stop: (id: string): Promise<void> =>
      managedRuntime.runPromise(Effect.flatMap(OrchestratorSystem, (system) => system.stop(id))),
  });

  return Object.freeze({
    kind: "runtime",
    managedRuntime,
    resources,
    orchestrators,
    runPromise: (effect, options) => managedRuntime.runPromise(effect, options),
    runPromiseExit: (effect, options) => managedRuntime.runPromiseExit(effect, options),
    dispose: () => {
      if (disposePromise !== undefined) {
        return disposePromise;
      }

      disposePromise = (async () => {
        for (const cleanup of cleanupRegistry) {
          cleanup();
        }
        cleanupRegistry.clear();

        await managedRuntime.dispose();
      })();

      return disposePromise;
    },
    createActor: <Context, Event extends FlowEvent, State extends string>(
      machine: FlowMachine<Context, Event, State>,
    ) =>
      managedRuntime.runSync(Effect.flatMap(OrchestratorSystem, (system) => system.start(machine))),
  });
}
