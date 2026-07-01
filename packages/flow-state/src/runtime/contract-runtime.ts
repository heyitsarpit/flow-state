import { Effect, Layer, ManagedRuntime } from "effect";

import type {
  FlowActor,
  FlowActorStartOptions,
  FlowInspectionEvent,
  FlowInspectionExportOptions,
  FlowInspectionFilter,
  FlowInspectionListener,
  FlowInspectionObserver,
  FlowInspectionRetentionPolicy,
  FlowInspectionSnapshot,
  FlowMachine,
  FlowRuntimeBootActorSnapshot,
  FlowRuntimeBootOptions,
  FlowRuntimeBootPayload,
  FlowRuntimeHydratedBoot,
  FlowResourceHydrationEntry,
  FlowResourceRef,
  FlowResourceSnapshot,
  FlowRuntimeInspection,
  FlowRuntime,
  FlowRuntimeResources,
  FlowSeededResource,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "../core/api/types.js";
import { invalidRuntimeBootPayloadVersionDiagnostic } from "../shared/diagnostics.js";
import { HostSignals } from "../core/runtime/services/host-signals.js";
import { InspectionLog } from "../core/runtime/services/inspection.js";
import { NotificationScheduler } from "../core/runtime/services/notification-scheduler.js";
import { OrchestratorSystem } from "../core/orchestrator/orchestrator-system.js";
import { ResourceStore } from "../core/runtime/services/resource-store.js";
import { FlowRuntimePolicy } from "../core/runtime/services/runtime-policy.js";
import { TraceLog } from "../core/runtime/services/trace.js";

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

const runtimeBootPayloadVersion = "flow-state/runtime-boot.v1" as const;

// Runtime resource subscriptions are imperative host handles: they need
// explicit early release, so we track only currently-active cleanups here.
function trackRuntimeCleanup<Cleanup extends () => void>(
  cleanupRegistry: Set<() => void>,
  cleanup: Cleanup,
): Cleanup {
  let active = true;

  const release = (() => {
    if (!active) {
      return;
    }

    active = false;
    cleanupRegistry.delete(release);
    cleanup();
  }) as Cleanup & Partial<Readonly<{ unsubscribe: () => void; closed: boolean }>>;

  Object.assign(release, cleanup);
  if ("unsubscribe" in cleanup) {
    Object.assign(release, {
      unsubscribe: release,
    });
  }
  if ("closed" in cleanup) {
    Object.defineProperty(release, "closed", {
      enumerable: true,
      get: () => (cleanup as Cleanup & Readonly<{ closed: boolean }>).closed,
    });
  }

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
    hydrate: (entries: ReadonlyArray<FlowResourceHydrationEntry>) =>
      managedRuntime.runSync(Effect.flatMap(ResourceStore, (store) => store.hydrate(entries))),
    dehydrate: () =>
      managedRuntime.runSync(Effect.flatMap(ResourceStore, (store) => store.dehydrate())),
    inspect: () =>
      managedRuntime.runSync(Effect.flatMap(ResourceStore, (store) => store.inspect())),
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
    entries: (filter?: FlowInspectionFilter) =>
      managedRuntime.runSync(Effect.flatMap(InspectionLog, (log) => log.entries(filter))),
    snapshot: (filter?: FlowInspectionFilter): FlowInspectionSnapshot =>
      managedRuntime.runSync(Effect.flatMap(InspectionLog, (log) => log.snapshot(filter))),
    export: <Redacted = FlowInspectionEvent, Serialized = Redacted>(
      options?: FlowInspectionExportOptions<Redacted, Serialized>,
    ) => managedRuntime.runSync(Effect.flatMap(InspectionLog, (log) => log.export(options))),
    retention: (): FlowInspectionRetentionPolicy =>
      managedRuntime.runSync(Effect.flatMap(InspectionLog, (log) => log.retention)),
    setRetention: (policy?: FlowInspectionRetentionPolicy) =>
      managedRuntime.runSync(Effect.flatMap(InspectionLog, (log) => log.setRetention(policy))),
    subscribe: (
      listenerOrObserver: FlowInspectionListener | FlowInspectionObserver,
      filter?: FlowInspectionFilter,
    ) =>
      trackRuntimeCleanup(
        cleanupRegistry,
        managedRuntime.runSync(
          Effect.flatMap(InspectionLog, (log) => log.subscribe(listenerOrObserver, filter)),
        ),
      ),
  };
}

function createRuntimeBootPayload(
  resources: ReadonlyArray<FlowResourceHydrationEntry>,
  options?: FlowRuntimeBootOptions,
): FlowRuntimeBootPayload {
  return Object.freeze({
    version: runtimeBootPayloadVersion,
    resources,
    actors: (options?.actors ?? []).map(
      (actor) =>
        Object.freeze({
          id: actor.id,
          snapshot: actor.serialize(),
        }) satisfies FlowRuntimeBootActorSnapshot,
    ),
  });
}

function hydrateRuntimeBootPayload(payload: FlowRuntimeBootPayload): FlowRuntimeHydratedBoot {
  if (payload.version !== runtimeBootPayloadVersion) {
    throw invalidRuntimeBootPayloadVersionDiagnostic({
      expectedVersion: runtimeBootPayloadVersion,
      receivedVersion: String(payload.version),
    });
  }

  const actors = Object.freeze(
    Object.fromEntries(payload.actors.map((entry) => [entry.id, entry.snapshot])),
  ) as Readonly<Record<string, FlowRuntimeHydratedBoot["actors"][string]>>;

  return Object.freeze({
    payload,
    actors,
    actorSnapshot: (id: string) => actors[id],
  });
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
    dehydrateBoot: (options?: FlowRuntimeBootOptions) =>
      createRuntimeBootPayload(resources.dehydrate(), options),
    hydrateBoot: (payload: FlowRuntimeBootPayload) => {
      const boot = hydrateRuntimeBootPayload(payload);
      resources.hydrate(payload.resources);
      return boot;
    },
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
