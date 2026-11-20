import { Cause, Effect, Exit, Result, Scope } from "effect";

import { definition } from "../../definition/definition.js";
import type { PublicDiagnostic } from "../../diagnostic/diagnostic.js";
import type { MachineDefinition } from "../../machine/grammar.js";
import { machine } from "../../machine/machine.js";
import { resource } from "../../operation/resource.js";
import type { ActorSnapshot } from "../runtime.js";
import type { ActorOperationReadCut, OperationOccurrence } from "../actor/actor-activities.js";
import { makeActorFixture, type ActorFixtureOptions } from "./actor-fixture.js";
import type { ActorStore } from "../actor/actor-state.js";
import type { ActorOperationRunner } from "../actor/actor-operation-work.js";

export const activityCache = resource({
  id: "runtime-next/activity-identity-cache",
  key: (id: number) => [id] as const,
  lookup: (id: number) => Effect.succeed(id),
});

const ActivityDefinitionResult = definition({
  id: "runtime-next/activity-identity",
  states: ["outside", { active: ["A", "B", "C"] }],
  events: {
    enter: () => ({}),
    moveB: (continueChain: boolean) => ({ continueChain }),
    moveC: () => ({}),
    backA: () => ({}),
    exit: () => ({}),
    chain: () => ({}),
  },
  operations: { cache: activityCache },
  memory: () => ({ count: 0 }),
});

export const ActivityDefinition = Result.getOrThrow(ActivityDefinitionResult);

export const ActivityMachine = Result.getOrThrow(
  machine(ActivityDefinitionResult, ({ S, E, O }) => ({
    default: S.outside,
    states: {
      outside: { on: { enter: { target: S.active.S.A } } },
      active: {
        default: S.active.S.A,
        activities: { parent: O.cache.subscribe(8) },
        states: {
          A: {
            activities: {
              first: O.cache.subscribe(7),
              second: O.cache.subscribe(7),
            },
            on: {
              moveB: {
                target: S.active.S.B,
                actions: ({ event }) => {
                  const actions: never[] = [];

                  if (event.continueChain) Reflect.set(actions, 0, Result.getOrThrow(E.moveC()));

                  return actions.length > 0 ? actions : null;
                },
              },
              backA: { target: S.active.S.A },
              exit: { target: S.outside },
              chain: {
                target: S.active.S.A,
                actions: () => {
                  const actions: never[] = [];

                  Reflect.set(actions, 0, Result.getOrThrow(E.moveB(true)));
                  Reflect.set(actions, 1, O.cache.lookup(13));

                  return actions;
                },
              },
            },
          },
          B: {
            activities: { transient: O.cache.subscribe(7) },
            on: {
              moveC: { target: S.active.S.C },
              backA: { target: S.active.S.A },
              exit: { target: S.outside },
            },
          },
          C: { on: { exit: { target: S.outside } } },
        },
      },
    },
  })),
);

const activityReadCut = () =>
  ({
    cache: {
      descriptor: activityCache,
      reader: {
        key: activityCache.key,
        getState: activityCache.getState,
        getData: activityCache.getData,
      },
    },
  }) satisfies ActorOperationReadCut<typeof ActivityDefinition>;

export const activityStore: ActorStore<typeof ActivityDefinition> = {
  captureReadCut: activityReadCut,
  prepare: () => Result.succeed(prepareActivityStorePermit()),
  prepareProjection: () => Result.succeed(prepareActivityStorePermit()),
};

let activityStoreRevision = 0;

const prepareActivityStorePermit = () => {
  const revision = activityStoreRevision + 1;

  return {
    revision,
    readCut: activityReadCut(),
    commit: () => {
      activityStoreRevision = revision;

      return { revision, changed: [] };
    },
    cancel: () => {},
  };
};

export const activitySnapshot = (state: ActorSnapshot<typeof ActivityDefinition>["state"]) =>
  ({
    state,
    memory: { count: 0 },
    context: {},
    lifecycle: "prepared",
    O: {
      cache: {
        key: activityCache.key,
        getState: activityCache.getState,
        getData: activityCache.getData,
      },
    },
    timers: [],
    issues: [],
    revision: 0,
    observedStoreRevision: 0,
  }) satisfies ActorSnapshot<typeof ActivityDefinition>;

export type ActivityRun = {
  plan: Parameters<ActorOperationRunner<typeof ActivityDefinition>["runActivity"]>[0];
  occurrence: OperationOccurrence<typeof ActivityDefinition>;
  signal: AbortSignal;
};

type ActivityFixture<D extends MachineDefinition> = Effect.Success<
  ReturnType<typeof makeActorFixture<D>>
>;

type ActivityFixtureToClose<D extends MachineDefinition, E> = Omit<ActivityFixture<D>, "close"> & {
  close: () => Effect.Effect<void, E>;
};

export const closeActivityFixture = <D extends MachineDefinition, E>(
  fixture: ActivityFixtureToClose<D, E>,
) =>
  Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      const closed = yield* Effect.exit(restore(fixture.close()));

      if (Exit.isFailure(closed)) {
        const fallbackReasons: Cause.Reason<E | PublicDiagnostic>[] = [];
        const journal = yield* Effect.exit(fixture.journal.close());
        const ownerScope = yield* Effect.exit(Scope.close(fixture.ownerScope, Exit.void));

        if (Exit.isFailure(journal)) fallbackReasons.push(...journal.cause.reasons);

        if (Exit.isFailure(ownerScope)) fallbackReasons.push(...ownerScope.cause.reasons);

        return yield* Effect.failCause(
          fallbackReasons.length === 0
            ? closed.cause
            : Cause.fromReasons([...closed.cause.reasons, ...fallbackReasons]),
        );
      }
    }),
  );

export const acquireActivityFixture = <D extends MachineDefinition>(
  options: ActorFixtureOptions<D>,
) =>
  Effect.acquireRelease(makeActorFixture(options), (fixture) =>
    closeActivityFixture(fixture).pipe(Effect.orDie),
  );

export const activityRunner: (
  starts: ActivityRun[],
  finalizers: OperationOccurrence<typeof ActivityDefinition>[],
  onStarted: (run: ActivityRun) => void,
  onFinite?: () => void,
  onFinalized?: (run: ActivityRun) => void,
  onFiniteFinalized?: () => void,
) => ActorOperationRunner<typeof ActivityDefinition> = (
  starts: ActivityRun[],
  finalizers: OperationOccurrence<typeof ActivityDefinition>[],
  onStarted: (run: ActivityRun) => void,
  onFinite: () => void = () => {},
  onFinalized: (run: ActivityRun) => void = () => {},
  onFiniteFinalized: () => void = () => {},
) =>
  ({
    runFinite: () =>
      Effect.sync(onFinite).pipe(
        Effect.andThen(Effect.never),
        Effect.ensuring(Effect.sync(onFiniteFinalized)),
      ),
    runActivity: (plan, signal, occurrence) => {
      const run = { plan, occurrence, signal };

      return Effect.sync(() => {
        starts.push(run);
        onStarted(run);
      }).pipe(
        Effect.andThen(Effect.never),
        Effect.ensuring(
          Effect.sync(() => {
            finalizers.push(occurrence);
            onFinalized(run);
          }),
        ),
      );
    },
  }) satisfies ActorOperationRunner<typeof ActivityDefinition>;
