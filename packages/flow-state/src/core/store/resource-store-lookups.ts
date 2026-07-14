import { Cause, Context, Deferred, Effect, Fiber, Option, Scope } from "effect";

import { missingResourceRuntimeDetailsDiagnostic } from "../../shared/diagnostics.js";
import type { FlowResourceRef, FlowResourceSnapshot } from "../api/types.js";
import { resourceLookupForRef } from "../api/resource-runtime.js";
import { hasResourceSnapshotValue, type InternalResourceRecord } from "./resource-snapshot.js";

type ResourceState = Readonly<{
  readonly records: ReadonlyMap<string, InternalResourceRecord>;
}>;

type ResourceStateSource = Readonly<{
  readonly getSnapshot: () => ResourceState;
  readonly update: (updater: (state: ResourceState) => ResourceState) => void;
}>;

type PostFetchInvalidation = InternalResourceRecord["postFetchInvalidation"];

type InFlightLookup = {
  // This registry intentionally erases per-ref generics; lookup helpers restore them.
  readonly deferred: Deferred.Deferred<any, any>;
  readonly cancel: Deferred.Deferred<void>;
  readonly key: string;
  readonly waiterFibers: Set<Fiber.Fiber<unknown, unknown>>;
  cancelled: boolean;
  settled: boolean;
};

type LookupMode = "ensure" | "refresh";

type ResourceStoreLookupDeps = Readonly<{
  readonly source: ResourceStateSource;
  readonly lookupScope: Scope.Scope;
  readonly initialOnline?: boolean;
  readonly resourceKeyOf: (ref: FlowResourceRef) => string;
  readonly readNow: () => Effect.Effect<number>;
  readonly get: <Value>(
    ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
  ) => Effect.Effect<FlowResourceSnapshot<Value> | null>;
  readonly expirationAt: (ref: FlowResourceRef, updatedAt: number) => Option.Option<number>;
  readonly getRecord: <Value, Error>(
    state: ResourceState,
    ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
  ) => InternalResourceRecord<Value, Error>;
  readonly updateRecord: (
    state: ResourceState,
    ref: FlowResourceRef,
    updater: (current: InternalResourceRecord) => InternalResourceRecord,
  ) => ResourceState;
  readonly shouldReuseInvalidatedValue: <Value>(
    ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
    snapshot: FlowResourceSnapshot<Value>,
  ) => boolean;
  readonly isResourceAuthorized: (ref: FlowResourceRef) => boolean;
}>;

export type ResourceStoreLookupController = Readonly<{
  readonly setOnline: (nextOnline: boolean) => void;
  readonly ensure: <Value, Error, Requirements>(
    ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
  ) => Effect.Effect<Value, Error, Requirements>;
  readonly refresh: <Value, Error, Requirements>(
    ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
  ) => Effect.Effect<Value, Error, Requirements>;
}>;

function nextRequestId(record: InternalResourceRecord): string {
  return `${record.ref.id}:${record.latestRequest + 1}`;
}

export function createResourceStoreLookupController(
  deps: ResourceStoreLookupDeps,
): ResourceStoreLookupController {
  const inFlightLookups = new Map<string, InFlightLookup>();
  const pausedLookups = new Map<string, Deferred.Deferred<void>>();
  let online = deps.initialOnline ?? true;

  const getInFlightLookup = (ref: FlowResourceRef): InFlightLookup | undefined =>
    inFlightLookups.get(deps.resourceKeyOf(ref));

  const pruneLookupWaiters = (lookup: InFlightLookup): number => {
    // Interrupted waiters may not run their own finalizers before lookup completion.
    // Prune from the lookup owner before deciding whether a generation can publish.
    lookup.waiterFibers.forEach((waiter) => {
      if (waiter.pollUnsafe() !== undefined) {
        lookup.waiterFibers.delete(waiter);
      }
    });

    return lookup.waiterFibers.size;
  };

  const releaseLookupWaiter = (lookup: InFlightLookup): Effect.Effect<void> =>
    Effect.gen(function* () {
      if (
        pruneLookupWaiters(lookup) > 0 ||
        lookup.settled ||
        inFlightLookups.get(lookup.key) !== lookup
      ) {
        return;
      }

      lookup.cancelled = true;
      inFlightLookups.delete(lookup.key);
      yield* Deferred.succeed(lookup.cancel, undefined);
    });

  const trackLookupWaiter = (lookup: InFlightLookup): Effect.Effect<void> =>
    Effect.gen(function* () {
      const waiter = Fiber.getCurrent();
      if (waiter === undefined) {
        return yield* Effect.die("Resource lookup waiter must run inside an Effect fiber");
      }

      lookup.waiterFibers.add(waiter);
      yield* Fiber.await(waiter).pipe(
        Effect.andThen(releaseLookupWaiter(lookup)),
        Effect.forkIn(deps.lookupScope, { startImmediately: true }),
      );
    });

  const awaitLookupResult = <Value, Error, Requirements>(
    lookup: InFlightLookup,
  ): Effect.Effect<Value, Error, Requirements> =>
    Effect.gen(function* () {
      yield* Effect.context<Requirements>();
      const awaited = Deferred.await(
        lookup.deferred as Deferred.Deferred<Value, Error>,
      ) as Effect.Effect<Value, Error, Requirements>;
      return yield* awaited;
    });

  const awaitLookup = <Value, Error, Requirements>(
    lookup: InFlightLookup,
  ): Effect.Effect<Value, Error, Requirements> =>
    Effect.gen(function* () {
      yield* trackLookupWaiter(lookup);
      return yield* awaitLookupResult<Value, Error, Requirements>(lookup);
    });

  const setOnline = (nextOnline: boolean): void => {
    if (online === nextOnline) {
      return;
    }

    online = nextOnline;
    if (!nextOnline) {
      return;
    }

    const resumptions = Array.from(pausedLookups.values());
    pausedLookups.clear();
    for (const deferred of resumptions) {
      Effect.runSync(Deferred.succeed(deferred, void 0));
    }
  };

  const cancelPausedLookup = <Value>(
    ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
  ): void => {
    deps.source.update((state) =>
      deps.updateRecord(state, ref, (current) => {
        if (current.activity !== "paused") {
          return current;
        }

        return {
          ...current,
          activity: "idle",
          freshness: current.freshness === "invalidated" ? "invalidated" : "stale",
          requestId: Option.none(),
          revision: current.revision + 1,
        };
      }),
    );
  };

  const pauseLookupUntilOnline = <Value>(
    ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
    mode: LookupMode,
    cancel: Deferred.Deferred<void>,
  ): Effect.Effect<void> =>
    Effect.gen(function* () {
      if (online) {
        return;
      }

      const key = deps.resourceKeyOf(ref);
      const deferred = yield* Deferred.make<void>();
      pausedLookups.set(key, deferred);

      deps.source.update((state) =>
        deps.updateRecord(state, ref, (current) => ({
          ...current,
          activity: "paused",
          freshness: mode === "refresh" ? "stale" : current.freshness,
          requestId: Option.none(),
          revision: current.revision + 1,
        })),
      );

      yield* Effect.raceFirst(
        Deferred.await(deferred),
        Deferred.await(cancel).pipe(
          Effect.andThen(
            Effect.sync(() => {
              cancelPausedLookup(ref);
            }),
          ),
          Effect.andThen(Effect.interrupt),
        ),
      ).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            if (pausedLookups.get(key) === deferred) {
              pausedLookups.delete(key);
            }
          }),
        ),
      );
    });

  const runLookup = <Value, Error, Requirements>(
    ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
    mode: LookupMode,
  ): Effect.Effect<Value, Error, Requirements> =>
    Effect.gen(function* () {
      if (!deps.isResourceAuthorized(ref)) {
        return yield* Effect.die(missingResourceRuntimeDetailsDiagnostic(ref.id));
      }
      const lookup = resourceLookupForRef<Value, Error, Requirements>(ref);
      if (lookup === undefined) {
        return yield* Effect.die(missingResourceRuntimeDetailsDiagnostic(ref.id));
      }

      const key = deps.resourceKeyOf(ref);
      const existingLookup = getInFlightLookup(ref);
      if (existingLookup !== undefined) {
        return yield* awaitLookup<Value, Error, Requirements>(existingLookup);
      }

      const context = yield* Effect.context<Requirements>();
      const deferred = yield* Deferred.make<Value, Error>();
      const cancel = yield* Deferred.make<void>();

      const performLookup = (nextMode: LookupMode): Effect.Effect<Value, Error, Requirements> =>
        Effect.gen(function* () {
          yield* pauseLookupUntilOnline(ref, nextMode, cancel);
          yield* deps.readNow();
          let requestId = "";
          let requestNumber = 0;

          deps.source.update((state) =>
            deps.updateRecord(state, ref, (current) => {
              requestNumber = current.latestRequest + 1;
              requestId = nextRequestId(current);

              return {
                ...current,
                activity: "fetching",
                freshness: nextMode === "refresh" ? "stale" : current.freshness,
                requestId: Option.some(requestId),
                latestRequest: requestNumber,
                postFetchInvalidation: "none",
                revision: current.revision + 1,
              };
            }),
          );

          const exit = yield* Effect.exit(
            Effect.raceFirst(
              lookup.pipe(Effect.provideContext(context as Context.Context<Requirements>)),
              Deferred.await(cancel).pipe(Effect.andThen(Effect.interrupt)),
            ),
          );
          if (
            !inFlightLookup.cancelled &&
            pruneLookupWaiters(inFlightLookup) === 0 &&
            !inFlightLookup.settled
          ) {
            inFlightLookup.cancelled = true;
            inFlightLookups.delete(key);
          }

          if (inFlightLookup.cancelled && exit._tag === "Success") {
            return yield* Effect.interrupt;
          }

          const finishTime = yield* deps.readNow();
          const nextExpiresAt = deps.expirationAt(ref, finishTime);
          const failReason =
            exit._tag === "Failure" ? exit.cause.reasons.find(Cause.isFailReason) : undefined;
          const settledRecord = deps.getRecord<Value, Error>(deps.source.getSnapshot(), ref);
          const postFetchInvalidation: PostFetchInvalidation =
            settledRecord.latestRequest === requestNumber
              ? settledRecord.postFetchInvalidation
              : "none";

          deps.source.update((state) =>
            deps.updateRecord(state, ref, (current) => {
              if (current.latestRequest !== requestNumber) {
                return current;
              }

              if (exit._tag === "Success") {
                return {
                  ...current,
                  value: Option.some(exit.value),
                  previousValue: current.value,
                  error: Option.none(),
                  activity: "idle",
                  freshness: postFetchInvalidation === "none" ? "fresh" : "invalidated",
                  updatedAt: Option.some(finishTime),
                  invalidatedAt:
                    postFetchInvalidation === "none" ? Option.none() : current.invalidatedAt,
                  expiresAt: nextExpiresAt,
                  requestId: Option.some(requestId),
                  postFetchInvalidation: "none",
                  revision: current.revision + 1,
                };
              }

              return {
                ...current,
                previousValue: Option.isSome(current.value) ? current.value : current.previousValue,
                error:
                  failReason === undefined ? current.error : Option.some(failReason.error as Error),
                activity: "idle",
                freshness: postFetchInvalidation === "none" ? "stale" : "invalidated",
                requestId: Option.some(requestId),
                invalidatedAt: current.invalidatedAt,
                postFetchInvalidation: "none",
                revision: current.revision + 1,
              };
            }),
          );

          if (postFetchInvalidation === "refresh") {
            return yield* performLookup("refresh");
          }

          if (exit._tag === "Success") {
            return exit.value;
          }

          return yield* Effect.failCause(exit.cause as Cause.Cause<Error>);
        });

      const inFlightLookup: InFlightLookup = {
        cancel,
        cancelled: false,
        deferred,
        key,
        settled: false,
        waiterFibers: new Set(),
      };
      inFlightLookups.set(key, inFlightLookup);
      yield* trackLookupWaiter(inFlightLookup);

      const lookupFiber = performLookup(mode).pipe(
        Effect.matchCauseEffect({
          onFailure: (cause) =>
            Effect.sync(() => {
              inFlightLookup.settled = true;
            }).pipe(Effect.andThen(Deferred.failCause(deferred, cause))),
          onSuccess: (value) =>
            Effect.sync(() => {
              inFlightLookup.settled = true;
            }).pipe(Effect.andThen(Deferred.succeed(deferred, value))),
        }),
        Effect.ensuring(
          Effect.sync(() => {
            inFlightLookups.delete(key);
          }),
        ),
      );
      yield* Effect.forkIn(lookupFiber, deps.lookupScope, {
        startImmediately: true,
      });

      return yield* awaitLookupResult<Value, Error, Requirements>(inFlightLookup);
    });

  const ensure = <Value, Error, Requirements>(
    ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
  ): Effect.Effect<Value, Error, Requirements> =>
    Effect.flatMap(deps.get(ref), (snapshot) => {
      if (snapshot === null) {
        return runLookup(ref, "ensure");
      }

      if (
        snapshot.freshness === "fresh" &&
        hasResourceSnapshotValue(snapshot) &&
        !snapshot.isPlaceholderData
      ) {
        return Effect.succeed(snapshot.value);
      }

      if (deps.shouldReuseInvalidatedValue(ref, snapshot) && hasResourceSnapshotValue(snapshot)) {
        return Effect.succeed(snapshot.value);
      }

      return runLookup(ref, "ensure");
    });

  const refresh = <Value, Error, Requirements>(
    ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
  ): Effect.Effect<Value, Error, Requirements> => runLookup(ref, "refresh");

  return {
    ensure,
    refresh,
    setOnline,
  };
}
