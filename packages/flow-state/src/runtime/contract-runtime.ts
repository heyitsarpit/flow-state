import { Cause, Effect, Exit, Layer, ManagedRuntime } from "effect";

import type {
  AnyFlowMachine,
  FlowActor,
  FlowActorLease,
  FlowActorStartOptions,
  FlowInspectionEvent,
  FlowInspectionExportOptions,
  FlowInspectionFilter,
  FlowInspectionListener,
  FlowInspectionObserver,
  FlowInspectionRetentionPolicy,
  FlowInspectionSnapshot,
  FlowRuntimeBootActorSnapshot,
  FlowRuntimeBootOptions,
  FlowRuntimeBootPayload,
  FlowRuntimeDisposeOptions,
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
import {
  invalidRuntimeBootPayloadVersionDiagnostic,
  missingResourceRuntimeDetailsDiagnostic,
} from "../shared/diagnostics.js";
import { HostSignals } from "../core/runtime/services/host-signals.js";
import { InspectionLog } from "../core/runtime/services/inspection.js";
import { NotificationScheduler } from "../core/runtime/services/notification-scheduler.js";
import { OrchestratorSystem } from "../core/orchestrator/orchestrator-system.js";
import { ResourceStore } from "../core/runtime/services/resource-store.js";
import { FlowRuntimePolicy } from "../core/runtime/services/runtime-policy.js";
import { TraceLog } from "../core/runtime/services/trace.js";
import { attachSerializedResourceRef } from "../core/api/resource-runtime.js";
import type {
  FlowRuntimeAdditionalServices,
  FlowRuntimeCoreServices,
  FlowRuntimeDefaultServices,
  FlowRuntimeServiceLayer,
} from "../core/runtime/services/runtime-contracts.js";

export type RuntimeReadyLayer<AppLayer extends Layer.Any> = [FlowRuntimeCoreServices] extends [
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

function combinedFailureCause(
  exits: ReadonlyArray<Exit.Exit<unknown, unknown>>,
): Cause.Cause<unknown> | undefined {
  const failureCauses = exits
    .filter(Exit.isFailure)
    .map((exit) => exit.cause)
    .filter((cause) => !Cause.hasInterruptsOnly(cause));
  if (failureCauses.length === 0) {
    return undefined;
  }

  return failureCauses.reduce<Cause.Cause<unknown>>(
    (left, right) => Cause.combine(left, right),
    Cause.empty,
  );
}

const releaseRuntimeCleanups = Effect.fn("FlowRuntime.releaseRuntimeCleanups")(function* (
  cleanupRegistry: Set<() => void>,
) {
  const cleanupExits = yield* Effect.forEach(Array.from(cleanupRegistry), (cleanup) =>
    Effect.exit(Effect.sync(cleanup)),
  );
  cleanupRegistry.clear();

  const failureCause = combinedFailureCause(cleanupExits);
  if (failureCause !== undefined) {
    yield* Effect.failCause(failureCause);
  }
});

function runtimeDisposeRejectionFromCause(failureCause: Cause.Cause<unknown>): Error {
  const errors = Cause.prettyErrors(failureCause);
  if (errors.length <= 1) {
    if (errors[0] !== undefined) {
      return errors[0];
    }

    const squashed = Cause.squash(failureCause);
    return squashed instanceof Error
      ? squashed
      : new Error(String(squashed), {
          cause: squashed,
        });
  }

  // Promise rejection can only carry one value, so multi-cause shutdowns cross
  // the host boundary as a native aggregate while still retaining the raw Cause.
  const aggregate = new AggregateError(errors, "Flow runtime dispose failed");
  Object.defineProperty(aggregate, "cause", {
    configurable: true,
    enumerable: false,
    value: failureCause,
    writable: true,
  });
  return aggregate;
}

function runtimeDisposeAbortedError(reason: unknown): Error {
  const error = new Error(
    "Flow runtime dispose was aborted by the host before graceful shutdown completed; finalizers may still be running.",
    {
      cause: reason,
    },
  );
  error.name = "AbortError";
  return error;
}

function waitForRuntimeDispose(
  disposePromise: Promise<void>,
  disposeSettled: boolean,
  options?: FlowRuntimeDisposeOptions,
): Promise<void> {
  if (disposeSettled) {
    return disposePromise;
  }

  const signal = options?.signal;
  if (signal === undefined) {
    return disposePromise;
  }

  if (signal.aborted) {
    return Promise.reject(runtimeDisposeAbortedError(signal.reason));
  }

  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      signal.removeEventListener("abort", onAbort);
    };

    const onAbort = () => {
      cleanup();
      reject(runtimeDisposeAbortedError(signal.reason));
    };

    signal.addEventListener("abort", onAbort, { once: true });
    disposePromise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

function createRuntimeResources<AdditionalServices, LayerError>(
  managedRuntime: ManagedRuntime.ManagedRuntime<
    FlowRuntimeCoreServices | AdditionalServices,
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
          store.patch(
            ref as FlowResourceRef<string, ReadonlyArray<unknown>, ResourceValue<typeof ref>>,
            updater as (
              current: ResourceValue<typeof ref> | undefined,
            ) => ResourceValue<typeof ref>,
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
    FlowRuntimeCoreServices | AdditionalServices,
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
  runtimeLayer: FlowRuntimeServiceLayer<
    FlowRuntimeCoreServices | AdditionalServices,
    LayerError,
    never
  >,
): FlowRuntime<FlowRuntimeCoreServices | AdditionalServices, LayerError> {
  const managedRuntime = ManagedRuntime.make(runtimeLayer);
  const cleanupRegistry = new Set<() => void>();
  const resources = createRuntimeResources(managedRuntime, cleanupRegistry);
  const inspection = createRuntimeInspection(managedRuntime, cleanupRegistry);
  const ownerShutdownEffect = Effect.gen(function* () {
    const cleanupExit = yield* Effect.exit(releaseRuntimeCleanups(cleanupRegistry));
    const stopAllExit = yield* Effect.exit(
      Effect.flatMap(OrchestratorSystem, (system) => system.stopAll),
    );
    const failureCause = combinedFailureCause([cleanupExit, stopAllExit]);
    if (failureCause !== undefined) {
      yield* Effect.failCause(failureCause);
    }
  });
  const disposeEffect = Effect.exit(ownerShutdownEffect);
  let disposePromise: Promise<void> | undefined;
  let disposeSettled = false;
  const orchestrators = Object.freeze({
    start: <Machine extends AnyFlowMachine>(
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
    attach: async <Machine extends AnyFlowMachine>(
      machine: Machine,
      options?: FlowActorStartOptions<Machine>,
    ): Promise<
      FlowActorLease<
        InferMachineContext<Machine>,
        InferMachineEvent<Machine>,
        InferMachineState<Machine>
      >
    > => {
      const lease = await managedRuntime.runPromise(
        Effect.flatMap(OrchestratorSystem, (system) => system.attach(machine, options)),
      );
      let releasePromise: Promise<void> | undefined;

      return Object.freeze({
        actor: lease.actor,
        release: () => {
          if (releasePromise !== undefined) {
            return releasePromise;
          }

          const cleanup = managedRuntime.runSync(lease.releaseSync);
          releasePromise = managedRuntime.runPromise(cleanup);
          return releasePromise;
        },
      });
    },
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
      effect: Effect.Effect<A, E, FlowRuntimeCoreServices | AdditionalServices>,
      options?: Effect.RunOptions,
    ): Promise<A> => managedRuntime.runPromise(effect, options),
    runPromiseExit: <A, E>(
      effect: Effect.Effect<A, E, FlowRuntimeCoreServices | AdditionalServices>,
      options?: Effect.RunOptions,
    ): Promise<import("effect").Exit.Exit<A, LayerError | E>> =>
      managedRuntime.runPromiseExit(effect, options),
    dehydrateBoot: (options?: FlowRuntimeBootOptions) =>
      createRuntimeBootPayload(resources.dehydrate(), options),
    hydrateBoot: (payload: FlowRuntimeBootPayload) => {
      const boot = hydrateRuntimeBootPayload(payload);
      for (const entry of payload.resources) {
        if (!attachSerializedResourceRef(entry.ref)) {
          throw missingResourceRuntimeDetailsDiagnostic(entry.ref.id);
        }
      }
      resources.hydrate(payload.resources);
      return boot;
    },
    dispose: (options?: FlowRuntimeDisposeOptions) => {
      if (disposePromise !== undefined) {
        return waitForRuntimeDispose(disposePromise, disposeSettled, options);
      }

      disposePromise = managedRuntime
        .runPromise(disposeEffect)
        .then(async (ownerShutdownExit) => {
          const runtimeScopeExit = await Effect.runPromiseExit(managedRuntime.disposeEffect);
          const failureCause = combinedFailureCause([ownerShutdownExit, runtimeScopeExit]);
          if (failureCause === undefined) {
            return;
          }

          throw runtimeDisposeRejectionFromCause(failureCause);
        })
        .finally(() => {
          disposeSettled = true;
        });
      return waitForRuntimeDispose(disposePromise, disposeSettled, options);
    },
    createActor: <Machine extends AnyFlowMachine>(
      machine: Machine,
      options?: FlowActorStartOptions<Machine>,
    ) =>
      managedRuntime.runSync(
        Effect.flatMap(OrchestratorSystem, (system) => system.start(machine, options)),
      ),
  });
}

export function createRuntime(): FlowRuntime<FlowRuntimeDefaultServices, never>;
export function createRuntime<AppLayer extends Layer.Any>(
  layer: RuntimeReadyLayer<AppLayer>,
): FlowRuntime<Layer.Success<AppLayer>, Layer.Error<AppLayer>>;
export function createRuntime<AppLayer extends Layer.Any>(
  layer?: RuntimeReadyLayer<AppLayer>,
):
  | FlowRuntime<FlowRuntimeDefaultServices, never>
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
  const inspectionLog = InspectionLog.layer.pipe(Layer.provide(notificationScheduler));
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
  ) as FlowRuntimeServiceLayer<FlowRuntimeDefaultServices, never, never>;

  return layer === undefined
    ? buildRuntime<FlowRuntimeAdditionalServices<FlowRuntimeDefaultServices>, never>(
        defaultRuntimeLayer,
      )
    : (buildRuntime<FlowRuntimeAdditionalServices<Layer.Success<AppLayer>>, Layer.Error<AppLayer>>(
        layer as Layer.Layer<
          FlowRuntimeCoreServices | FlowRuntimeAdditionalServices<Layer.Success<AppLayer>>,
          Layer.Error<AppLayer>,
          never
        >,
      ) as FlowRuntime<Layer.Success<AppLayer>, Layer.Error<AppLayer>>);
}
