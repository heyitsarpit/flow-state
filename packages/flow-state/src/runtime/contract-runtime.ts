import { Effect, Layer, ManagedRuntime } from "effect";

import type {
  FlowActor,
  FlowActorStartOptions,
  FlowInspectionEvent,
  FlowMachine,
  FlowResourceRef,
  FlowResourceSnapshot,
  FlowRuntimeInspection,
  FlowRuntime,
  FlowRuntimeResources,
  FlowSeededResource,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "../public/types.js";
import { HostSignals } from "../services/host-signals.js";
import { InspectionLog } from "../services/inspection.js";
import { NotificationScheduler } from "../services/notification-scheduler.js";
import { OrchestratorSystem } from "../services/orchestrator-system.js";
import { ResourceStore } from "../services/resource-store.js";
import { TraceLog } from "../services/trace.js";

type ResourceValue<Ref extends FlowResourceRef> =
  Ref extends FlowResourceRef<string, ReadonlyArray<unknown>, infer Value> ? Value : never;

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

function releaseRuntimeCleanups(cleanupRegistry: Set<() => void>): void {
  for (const cleanup of cleanupRegistry) {
    cleanup();
  }
  cleanupRegistry.clear();
}

function createRuntimeResources<RuntimeServices, LayerError>(
  managedRuntime: ManagedRuntime.ManagedRuntime<ResourceStore | RuntimeServices, LayerError>,
  cleanupRegistry: Set<() => void>,
): FlowRuntimeResources {
  return {
    seedResources: (resources: ReadonlyArray<FlowSeededResource>) =>
      managedRuntime.runSync(Effect.flatMap(ResourceStore, (store) => store.seed(resources))),
    subscribe: <Ref extends FlowResourceRef>(
      ref: Ref,
      listener: (snapshot: FlowResourceSnapshot<ResourceValue<Ref>>) => void,
    ) =>
      trackRuntimeCleanup(
        cleanupRegistry,
        managedRuntime.runSync(
          Effect.flatMap(ResourceStore, (store) =>
            store.subscribe(
              ref as FlowResourceRef<string, ReadonlyArray<unknown>, ResourceValue<Ref>>,
              listener,
            ),
          ),
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
    get: <Ref extends FlowResourceRef>(ref: Ref): FlowResourceSnapshot<ResourceValue<Ref>> | null =>
      managedRuntime.runSync(
        Effect.flatMap(ResourceStore, (store) =>
          store.get(ref as FlowResourceRef<string, ReadonlyArray<unknown>, ResourceValue<Ref>>),
        ),
      ),
  };
}

function createRuntimeInspection<RuntimeServices, LayerError>(
  managedRuntime: ManagedRuntime.ManagedRuntime<InspectionLog | RuntimeServices, LayerError>,
  cleanupRegistry: Set<() => void>,
): FlowRuntimeInspection {
  return {
    entries: () => managedRuntime.runSync(Effect.flatMap(InspectionLog, (log) => log.entries)),
    subscribe: (listener: (event: FlowInspectionEvent) => void) =>
      trackRuntimeCleanup(
        cleanupRegistry,
        managedRuntime.runSync(Effect.flatMap(InspectionLog, (log) => log.subscribe(listener))),
      ),
  };
}

export function createRuntime(): FlowRuntime<
  | NotificationScheduler
  | ResourceStore
  | OrchestratorSystem
  | HostSignals
  | InspectionLog
  | TraceLog
>;
export function createRuntime<AppLayer extends Layer.Layer<any, any, never>>(
  layer: AppLayer,
): FlowRuntime<Layer.Success<AppLayer>, Layer.Error<AppLayer>>;
export function createRuntime<AppLayer extends Layer.Layer<any, any, never>>(
  layer?: AppLayer,
): FlowRuntime<any, any> {
  const notificationScheduler = NotificationScheduler.testLayer;
  const hostSignals = HostSignals.testLayer;
  const resourceStore = ResourceStore.layer.pipe(
    Layer.provide(Layer.mergeAll(notificationScheduler, hostSignals)),
  );
  const inspectionLog = InspectionLog.layer;
  const traceLog = TraceLog.layer;
  const orchestratorSystem = OrchestratorSystem.layer.pipe(
    Layer.provide(Layer.mergeAll(resourceStore, inspectionLog, traceLog)),
  );
  const runtimeLayer = (layer ??
    Layer.mergeAll(
      notificationScheduler,
      resourceStore,
      orchestratorSystem,
      hostSignals,
      inspectionLog,
      traceLog,
    )) as Layer.Layer<any, any, never>;
  const managedRuntime = ManagedRuntime.make(runtimeLayer);
  const cleanupRegistry = new Set<() => void>();
  const resources = createRuntimeResources(managedRuntime, cleanupRegistry);
  const inspection = createRuntimeInspection(managedRuntime, cleanupRegistry);
  const disposeEffect = Effect.gen(function* () {
    yield* Effect.sync(() => {
      releaseRuntimeCleanups(cleanupRegistry);
    });
    yield* Effect.flatMap(OrchestratorSystem, (system) => system.stopAll);
  });
  let disposePromise: Promise<void> | undefined;
  const orchestrators = Object.freeze({
    start: <Machine extends FlowMachine>(
      machine: Machine,
      options?: FlowActorStartOptions<Machine>,
    ): FlowActor<
      InferMachineContext<Machine>,
      InferMachineEvent<Machine>,
      InferMachineState<Machine>
    > =>
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
    inspection,
    orchestrators,
    runPromise: (effect, options) => managedRuntime.runPromise(effect, options),
    runPromiseExit: (effect, options) => managedRuntime.runPromiseExit(effect, options),
    dispose: () => {
      if (disposePromise !== undefined) {
        return disposePromise;
      }

      disposePromise = managedRuntime
        .runPromise(disposeEffect)
        .then(() => Effect.runPromise(managedRuntime.disposeEffect));
      return disposePromise;
    },
    createActor: <Machine extends FlowMachine>(
      machine: Machine,
      options?: FlowActorStartOptions<Machine>,
    ) =>
      managedRuntime.runSync(
        Effect.flatMap(OrchestratorSystem, (system) => system.start(machine, options)),
      ),
  });
}
