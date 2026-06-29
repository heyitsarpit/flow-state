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
import { FlowRuntimePolicy } from "../services/runtime-policy.js";
import { TraceLog } from "../services/trace.js";

type DefaultRuntimeServices =
  | NotificationScheduler
  | ResourceStore
  | OrchestratorSystem
  | HostSignals
  | InspectionLog
  | TraceLog;
type RuntimeCoreServices = ResourceStore | OrchestratorSystem | InspectionLog;
type RuntimeAdditionalServices<RuntimeServices> = Exclude<RuntimeServices, RuntimeCoreServices>;
export type RuntimeReadyLayer<AppLayer extends Layer.Any> = [RuntimeCoreServices] extends [
  Layer.Success<AppLayer>,
]
  ? Layer.Services<AppLayer> extends never
    ? AppLayer & Layer.Layer<Layer.Success<AppLayer>, Layer.Error<AppLayer>, never>
    : never
  : never;

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

function createRuntimeResources<AdditionalServices, LayerError>(
  managedRuntime: ManagedRuntime.ManagedRuntime<
    RuntimeCoreServices | AdditionalServices,
    LayerError
  >,
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

function createRuntimeInspection<AdditionalServices, LayerError>(
  managedRuntime: ManagedRuntime.ManagedRuntime<
    RuntimeCoreServices | AdditionalServices,
    LayerError
  >,
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

function buildRuntime<AdditionalServices, LayerError>(
  runtimeLayer: Layer.Layer<RuntimeCoreServices | AdditionalServices, LayerError, never>,
): FlowRuntime<RuntimeCoreServices | AdditionalServices, LayerError> {
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
    kind: "runtime" as const,
    managedRuntime,
    resources,
    inspection,
    orchestrators,
    runPromise: <A, E>(
      effect: Effect.Effect<A, E, RuntimeCoreServices | AdditionalServices>,
      options?: Effect.RunOptions,
    ): Promise<A> => managedRuntime.runPromise(effect, options),
    runPromiseExit: <A, E>(
      effect: Effect.Effect<A, E, RuntimeCoreServices | AdditionalServices>,
      options?: Effect.RunOptions,
    ): Promise<import("effect").Exit.Exit<A, LayerError | E>> =>
      managedRuntime.runPromiseExit(effect, options),
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

export function createRuntime(): FlowRuntime<DefaultRuntimeServices, never>;
export function createRuntime<AppLayer extends Layer.Any>(
  layer: RuntimeReadyLayer<AppLayer>,
): FlowRuntime<Layer.Success<AppLayer>, Layer.Error<AppLayer>>;
export function createRuntime<AppLayer extends Layer.Any>(
  layer?: RuntimeReadyLayer<AppLayer>,
):
  | FlowRuntime<DefaultRuntimeServices, never>
  | FlowRuntime<Layer.Success<AppLayer>, Layer.Error<AppLayer>> {
  const notificationScheduler = NotificationScheduler.testLayer;
  const hostSignals = HostSignals.testLayer;
  const runtimePolicy = FlowRuntimePolicy.layer({
    store: {
      kind: "store",
      mode: "test",
    },
    orchestrators: {
      kind: "orchestrators",
      mode: "test",
    },
  }).pipe(Layer.provide(Layer.mergeAll(notificationScheduler, hostSignals)));
  const resourceStore = ResourceStore.layer.pipe(
    Layer.provide(Layer.mergeAll(notificationScheduler, hostSignals, runtimePolicy)),
  );
  const inspectionLog = InspectionLog.layer;
  const traceLog = TraceLog.layer;
  const orchestratorSystem = OrchestratorSystem.layer.pipe(
    Layer.provide(Layer.mergeAll(resourceStore, inspectionLog, traceLog, runtimePolicy)),
  );
  const defaultRuntimeLayer = Layer.mergeAll(
    notificationScheduler,
    resourceStore,
    orchestratorSystem,
    hostSignals,
    inspectionLog,
    traceLog,
  ) as Layer.Layer<DefaultRuntimeServices, never, never>;

  return layer === undefined
    ? buildRuntime<RuntimeAdditionalServices<DefaultRuntimeServices>, never>(defaultRuntimeLayer)
    : (buildRuntime<RuntimeAdditionalServices<Layer.Success<AppLayer>>, Layer.Error<AppLayer>>(
        layer as Layer.Layer<
          RuntimeCoreServices | RuntimeAdditionalServices<Layer.Success<AppLayer>>,
          Layer.Error<AppLayer>,
          never
        >,
      ) as FlowRuntime<Layer.Success<AppLayer>, Layer.Error<AppLayer>>);
}
