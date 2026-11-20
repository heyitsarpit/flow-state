import { Clock, Effect, Exit, Option, Predicate, Result, Scope } from "effect";

import { definition } from "../../definition/definition.js";
import { Failure } from "../../diagnostic/diagnostic.js";
import type { PublicDiagnostic } from "../../diagnostic/diagnostic.js";
import { machine, type Machine } from "../../machine/machine.js";
import type { MachineDefinition } from "../../machine/grammar.js";
import { resource } from "../../operation/resource.js";
import type { ResourceState } from "../../operation/resource.js";
import type { OperationKey } from "../../operation/key.js";
import { actorRef } from "../../runtime/actor-ref.js";
import type { ActorOperationReadCut } from "../actor/actor-activities.js";
import type { ActorOperationRunner, OperationFact } from "../actor/actor-operation-work.js";
import { makeActorDirectory } from "../actor/actor-directory.js";
import { prepareActorEngine } from "../actor/actor-engine.js";
import type { ActorStore } from "../actor/actor-state.js";
import type { DetachedLifecycleWork } from "../actor/lifecycle-work.js";
import type { ContextCoordinator } from "../context/context-coordinator.js";
import { makeEvidenceJournal } from "../evidence/evidence-journal.js";
import { makeRuntimeEvidencePolicy } from "../runtime-services.js";
import type { ActorSnapshot } from "../runtime.js";

const CounterDefinitionResult = definition({
  id: "runtime-next/p06-fixture-counter",
  states: ["idle", "active"],
  events: { go: (amount: number) => ({ amount }) },
  memory: () => ({ count: 0 }),
});

export const CounterDefinition = Result.getOrThrow(CounterDefinitionResult);

export const CounterMachine = Result.getOrThrow(
  machine(CounterDefinitionResult, ({ S }) => ({
    default: S.idle,
    states: {
      idle: {
        on: {
          go: {
            target: S.active,
            updateMemory: ({ snapshot, event }) => ({
              count: snapshot.memory.count + event.amount,
            }),
          },
        },
      },
      active: {
        on: {
          go: {
            target: S.active,
            updateMemory: ({ snapshot, event }) => ({
              count: snapshot.memory.count + event.amount,
            }),
          },
        },
      },
    },
  })),
);

// RETURN_TYPE: This fixture must satisfy the exact named-reader ActorSnapshot contract.
export const counterSnapshot = (): ActorSnapshot<typeof CounterDefinition> => ({
  state: CounterDefinition.S.idle,
  memory: { count: 0 },
  context: {},
  lifecycle: "prepared",
  O: {},
  timers: [],
  issues: [],
  revision: 0,
  observedStoreRevision: 0,
});

const ChainDefinitionResult = definition({
  id: "runtime-next/p06-fixture-chain",
  states: ["ready"],
  events: { step: (left: number) => ({ left }) },
  memory: () => ({ count: 0 }),
});

export const ChainDefinition = Result.getOrThrow(ChainDefinitionResult);

export const chainSteps: number[] = [];

export const ChainMachine = Result.getOrThrow(
  machine(ChainDefinitionResult, ({ S, E }) => ({
    default: S.ready,
    states: {
      ready: {
        on: {
          step: {
            target: S.ready,
            updateMemory: ({ snapshot, event }) => {
              chainSteps.push(event.left);

              return { count: snapshot.memory.count + 1 };
            },
            actions: ({ event }) => {
              const actions: never[] = [];

              if (event.left > 0)
                Reflect.set(actions, 0, Result.getOrThrow(E.step(event.left - 1)));

              return actions;
            },
          },
        },
      },
    },
  })),
);

// RETURN_TYPE: This fixture must satisfy the exact named-reader ActorSnapshot contract.
export const chainSnapshot = (): ActorSnapshot<typeof ChainDefinition> => ({
  state: ChainDefinition.S.ready,
  memory: { count: 0 },
  context: {},
  lifecycle: "prepared",
  O: {},
  timers: [],
  issues: [],
  revision: 0,
  observedStoreRevision: 0,
});

const NestedDefinitionResult = definition({
  id: "runtime-next/p06-fixture-nested",
  states: ["ready"],
  events: { go: (payload: { nested: { amount: number } }) => ({ payload }) },
  memory: () => ({ count: 0 }),
});

export const NestedDefinition = Result.getOrThrow(NestedDefinitionResult);

export const NestedMachine = Result.getOrThrow(
  machine(NestedDefinitionResult, ({ S }) => ({
    default: S.ready,
    states: {
      ready: {
        on: {
          go: {
            target: S.ready,
            updateMemory: ({ snapshot, event }) => ({
              count: snapshot.memory.count + event.payload.nested.amount,
            }),
          },
        },
      },
    },
  })),
);

// RETURN_TYPE: This fixture must satisfy the exact named-reader ActorSnapshot contract.
export const nestedSnapshot = (): ActorSnapshot<typeof NestedDefinition> => ({
  state: NestedDefinition.S.ready,
  memory: { count: 0 },
  context: {},
  lifecycle: "prepared",
  O: {},
  timers: [],
  issues: [],
  revision: 0,
  observedStoreRevision: 0,
});

const cache = resource({
  id: "runtime-next/p06-fixture-cache",
  key: (id: number) => [id] as const,
  lookup: (id: number) => (id < 0 ? Effect.fail("negative") : Effect.succeed(id)),
});

export const storeRunner: ActorOperationRunner<typeof StoreDefinition> = {
  runFinite: (plan) =>
    "params" in plan && Predicate.isNumber(plan.params)
      ? Effect.succeed(plan.params)
      : Effect.die(new Error("Store fixture received a foreign operation plan")),
  runActivity: () => Effect.void,
};

const StoreDefinitionResult = definition({
  id: "runtime-next/p06-fixture-store",
  states: ["ready", "subscribed", "replacement", "off"],
  events: {
    fetch: (id: number) => ({ id }),
    start: () => ({}),
    replace: () => ({}),
    stop: () => ({}),
  },
  operations: { cache },
  memory: () => ({ count: 0 }),
});

export const StoreDefinition = Result.getOrThrow(StoreDefinitionResult);

export const StoreMachine = Result.getOrThrow(
  machine(StoreDefinitionResult, ({ S, O }) => ({
    default: S.ready,
    states: {
      ready: {
        on: {
          fetch: {
            target: S.ready,
            updateMemory: ({ snapshot }) => ({ count: snapshot.memory.count + 1 }),
            actions: ({ event }) => O.cache.lookup(event.id),
          },
          start: { target: S.subscribed },
        },
      },
      subscribed: {
        activities: { cache: O.cache.subscribe(7) },
        on: { replace: { target: S.replacement }, stop: { target: S.off } },
      },
      replacement: {
        activities: { cache: O.cache.subscribe(7) },
        on: { stop: { target: S.off } },
      },
      off: {},
    },
  })),
);

// RETURN_TYPE: The store fixture must carry its exact cache reader family.
export const storeSnapshot = (): ActorSnapshot<typeof StoreDefinition> => ({
  state: StoreDefinition.S.ready,
  memory: { count: 0 },
  context: {},
  lifecycle: "prepared",
  O: {
    cache: { key: cache.key, getState: cache.getState, getData: cache.getData },
  },
  timers: [],
  issues: [],
  revision: 0,
  observedStoreRevision: 0,
});

const ContextProviderResult = definition({
  id: "runtime-next/p06-context-provider",
  states: ["ready", "changed"],
  events: {},
});

export const ContextProvider = Result.getOrThrow(ContextProviderResult);

export const ContextProviderMachine = Result.getOrThrow(
  machine(ContextProviderResult, ({ S }) => ({
    default: S.ready,
    states: { ready: {}, changed: {} },
  })),
);

// RETURN_TYPE: This provider fixture must satisfy the exact ActorSnapshot contract.
export const contextProviderSnapshot = (): ActorSnapshot<typeof ContextProvider> => ({
  state: ContextProvider.S.changed,
  memory: {},
  context: {},
  lifecycle: "prepared",
  O: {},
  timers: [],
  issues: [],
  revision: 0,
  observedStoreRevision: 0,
});

const ContextDefinitionResult = definition({
  id: "runtime-next/p06-context-consumer",
  states: ["ready"],
  events: { go: () => ({}) },
  context: { value: ContextProvider.select(({ state }) => state) },
  memory: () => ({ observedChanged: false }),
});

export const ContextDefinition = Result.getOrThrow(ContextDefinitionResult);

export const ContextMachine = Result.getOrThrow(
  machine(ContextDefinitionResult, ({ S }) => ({
    default: S.ready,
    states: {
      ready: {
        on: {
          go: {
            target: S.ready,
            updateMemory: ({ snapshot }) => ({
              observedChanged: snapshot.context.value === ContextProvider.S.changed,
            }),
          },
        },
      },
    },
  })),
);

// RETURN_TYPE: This consumer fixture must satisfy the exact ActorSnapshot contract.
export const contextSnapshot = (): ActorSnapshot<typeof ContextDefinition> => ({
  state: ContextDefinition.S.ready,
  memory: { observedChanged: false },
  context: { value: ContextProvider.S.ready },
  lifecycle: "prepared",
  O: {},
  timers: [],
  issues: [],
  revision: 0,
  observedStoreRevision: 0,
});

type FixtureResourceState = ResourceState<number, string, [number]>;

const invalidResourceOutcome = () =>
  Result.fail(
    Failure({
      code: "SemanticValidation",
      path: ["store", "fixture", "projection"],
      details: { reason: "outcome-shape" },
      summary: "Store fixture rejected an incompatible resource outcome",
      help: "Use the cache adapter's numeric value or string failure.",
    }),
  );

// RETURN_TYPE: All terminal branches share the resource descriptor's exact state family.
const projectedTerminalState = (
  fact: Extract<OperationFact<typeof StoreDefinition>, { _tag: "terminal" }>,
  key: [number],
): Result.Result<FixtureResourceState, PublicDiagnostic> => {
  const generation = fact.occurrence.generation;

  if (fact.outcome._tag === "success" && Predicate.isNumber(fact.outcome.value))
    return Result.succeed({ status: "ready", key, generation, data: fact.outcome.value });

  if (fact.outcome._tag === "failure" && Predicate.isString(fact.outcome.error))
    return Result.succeed({ status: "failure", key, generation, error: fact.outcome.error });

  if (fact.outcome._tag === "defect")
    return Result.succeed({
      status: "defect",
      key,
      generation,
      defect: fact.outcome.diagnostic,
    });

  if (fact.outcome._tag === "interrupt")
    return Result.succeed({ status: "interrupted", key, generation });

  return invalidResourceOutcome();
};

// RETURN_TYPE: Every resource outcome branch must share one exact descriptor state family.
const projectedResourceState = (
  fact: OperationFact<typeof StoreDefinition>,
  key: [number],
): Result.Result<FixtureResourceState, PublicDiagnostic> => {
  const generation = fact.occurrence.generation;

  if (fact._tag === "value" && Predicate.isNumber(fact.value))
    return Result.succeed({ status: "ready", key, generation, data: fact.value });

  return fact._tag === "terminal" ? projectedTerminalState(fact, key) : invalidResourceOutcome();
};

/** A fallible store permit with a captured empty read cut for actor cut scenarios. */
export const makeStoreFixture = () => {
  let revision = 0;
  let rejectNext = false;
  let beforeCommit = () => {};

  let states = new Map<string, ResourceState<number, string, [number]>>();

  // RETURN_TYPE: A captured cut must preserve the Definition-indexed reader signature.
  const readCutFor = (
    // oxlint-disable-next-line anti-slop/no-readonly -- This input is one retained immutable publication cut.
    values: ReadonlyMap<string, ResourceState<number, string, [number]>>,
  ): ActorOperationReadCut<typeof StoreDefinition> => ({
    cache: {
      descriptor: cache,
      reader: {
        key: cache.key,
        getState: (key) => values.get(JSON.stringify(key)) ?? cache.getState(key),
        getData: (key) => {
          const state = values.get(JSON.stringify(key));

          return state !== undefined && "data" in state ? state.data : undefined;
        },
      },
    },
  });

  const port: ActorStore<typeof StoreDefinition> = {
    captureReadCut: () => readCutFor(states),
    prepare() {
      if (rejectNext) {
        rejectNext = false;

        return Result.fail(
          Failure({
            code: "SemanticValidation",
            path: ["store", "fixture"],
            details: { reason: "precommit" },
            summary: "Store rejected a staged operation",
            help: "Retry the event after the store accepts new work.",
          }),
        );
      }

      const next = revision + 1;

      return Result.succeed({
        revision: next,
        readCut: readCutFor(states),
        commit: () => {
          beforeCommit();
          revision = next;

          return { revision, changed: [] };
        },
        cancel: () => {},
      });
    },
    prepareProjection(fact) {
      if (!Object.is(fact.occurrence.descriptor, cache) || fact._tag === "complete")
        return Result.fail(
          Failure({
            code: "SemanticValidation",
            path: ["store", "fixture", "projection"],
            details: { reason: "unsupported" },
            summary: "Store fixture expected a resource value or terminal outcome",
            help: "Project a cache fact from the live actor occurrence.",
          }),
        );

      const key: OperationKey = fact.occurrence.key;

      if (key.length !== 1 || !Predicate.isNumber(key[0]))
        return Result.fail(
          Failure({
            code: "SemanticValidation",
            path: ["store", "fixture", "projection"],
            details: { reason: "unsupported-outcome" },
            summary: "Store fixture expected a numeric resource success",
            help: "Use its numeric cache adapter.",
          }),
        );

      const ownedKey: [number] = [key[0]];
      const projected = projectedResourceState(fact, ownedKey);

      if (Result.isFailure(projected)) return Result.fail(projected.failure);

      const nextStates = new Map(states);
      nextStates.set(JSON.stringify(key), projected.success);
      const next = revision + 1;

      return Result.succeed({
        revision: next,
        readCut: readCutFor(nextStates),
        commit: () => {
          beforeCommit();
          states = nextStates;
          revision = next;

          return { revision, changed: [{ descriptor: cache, key }] };
        },
        cancel: () => {},
      });
    },
  };

  return {
    port,
    revision: () => revision,
    reject: () => {
      rejectNext = true;
    },
    onCommit: (callback: () => void) => {
      beforeCommit = callback;
    },
  };
};

type ActorFixtureOverrides<D extends MachineDefinition> = {
  initialMachineTurnRevision: number;
  restored: boolean;
  store: ActorStore<D>;
  operationRunner: ActorOperationRunner<D>;
  context: ContextCoordinator;
  onSnapshot: (snapshot: ActorSnapshot<D>) => void;
  onObserverIssue: (issue: PublicDiagnostic) => void;
  work: DetachedLifecycleWork;
  validateProviders: Effect.Effect<void, PublicDiagnostic>;
  journalCapacity: number;
  evidencePolicy: (
    base: ReturnType<typeof makeRuntimeEvidencePolicy>,
  ) => ReturnType<typeof makeRuntimeEvidencePolicy>;
};

/** Sparse test knobs override the fixture defaults; actor domain fields remain required. */
export type ActorFixtureOptions<D extends MachineDefinition> = {
  machine: Machine<D>;
  initial: ActorSnapshot<D>;
} & Partial<ActorFixtureOverrides<D>>;

/** Genuine private actor setup shared by the assigned P06 behavior scenarios. */
export const makeActorFixture = <D extends MachineDefinition>(options: ActorFixtureOptions<D>) =>
  Effect.gen(function* () {
    const ownerScope = yield* Scope.make();
    const app = {};
    const plan = {};

    const journal = Result.getOrThrow(
      makeEvidenceJournal({
        app,
        plan,
        ownerScope,
        capacity: options.journalCapacity ?? 64,
      }),
    );

    const directory = makeActorDirectory<string>({ machines: [options.machine] });
    const ref = actorRef(options.machine, "p06-fixture");
    const admission = Result.getOrThrow(directory.reserve({ kind: "stable", ref }));

    if (admission._tag !== "create")
      return yield* Effect.die(new Error("Fixture expected a fresh actor"));

    const identity = admission.reservation.identity;
    const credit = Result.getOrThrow(journal.registerActor(identity));
    const clock = yield* Clock.Clock;

    const preparedExit = yield* Effect.exit(
      prepareActorEngine({
        machine: options.machine,
        ref,
        identity,
        initial: options.initial,
        initialMachineTurnRevision: options.initialMachineTurnRevision ?? 0,
        restored: options.restored ?? false,
        journal,
        credit,
        provenance: { app, plan, actor: identity },
        evidence:
          options.evidencePolicy === undefined
            ? makeRuntimeEvidencePolicy(journal, clock)
            : options.evidencePolicy(makeRuntimeEvidencePolicy(journal, clock)),
        store: options.store === undefined ? Option.none() : Option.some(options.store),
        operationRunner:
          options.operationRunner === undefined
            ? Option.none()
            : Option.some(options.operationRunner),
        context: options.context === undefined ? Option.none() : Option.some(options.context),
        onSnapshot:
          options.onSnapshot === undefined
            ? Option.none<(snapshot: ActorSnapshot<D>) => void>()
            : Option.some(options.onSnapshot),
        onObserverIssue:
          options.onObserverIssue === undefined
            ? Option.none()
            : Option.some(options.onObserverIssue),
        work: options.work ?? { resources: [], tasks: [], deadlines: [] },
        validateProviders: options.validateProviders ?? Effect.void,
      }).pipe(Effect.provideService(Scope.Scope, ownerScope)),
    );

    if (Exit.isFailure(preparedExit)) {
      credit.release();
      yield* journal.close();
      yield* Scope.close(ownerScope, Exit.void);

      return yield* Effect.failCause(preparedExit.cause);
    }

    const prepared = preparedExit.value;

    const close = () =>
      Effect.gen(function* () {
        yield* prepared.shutdown();
        yield* journal.close();
        yield* Scope.close(ownerScope, Exit.void);
      });

    return { prepared, journal, credit, directory, ref, identity, app, plan, ownerScope, close };
  });
