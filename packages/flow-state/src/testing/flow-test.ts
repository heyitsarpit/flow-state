import type { Layer } from "effect";

import {
  type ChildLifecycleSpawnReason,
  type ChildLifecycleStopReason,
  childStartReceiptFacts,
  childStopReceiptFacts,
} from "../core/orchestrator/child-lifecycle-inspection-facts.js";
import type {
  FlowAppDefinition,
  FlowChildDefinition,
  FlowChildSnapshot,
  FlowEvent,
  FlowIssue,
  FlowInvokeDescriptor,
  FlowMachine,
  FlowReceipt,
  FlowResourceRef,
  FlowResourceSnapshot,
  FlowSeededResource,
  FlowSnapshot,
  FlowStartedTestBuilder,
  FlowTestBuilder,
  FlowTestCache,
  FlowTestHarness,
  FlowTestProgressBounds,
  FlowTestStreamSnapshot,
  FlowTimerSnapshot,
} from "../core/api/types.js";
import {
  afterDefinitionsForState,
  applyAfterTransitionWithMeta,
  applyMachineEventWithMeta,
  canMachineTransition,
  planMachineEvent,
} from "../core/machines/machine-transition.js";
import { annotateNewMachineEventReceipts } from "../core/inspection/inspection-receipts.js";
import {
  dispatchReadyWork,
  enqueueReadyWork,
  flushReadyWork,
  startReadyWork,
} from "../core/scheduling/ready-work.js";
import {
  type OrchestratorActorHandle,
  childActorId,
  childInvokesForState,
  childSnapshotForDefinition,
  childStatusForActor,
} from "../core/orchestrator/orchestrator-helpers.js";
import { receiptWithCorrelation } from "../core/inspection/receipt-correlation.js";
import { fixtureResourcesForApp } from "../descriptors/inventory.js";
import { createFlowTestAfterTimerOwnership } from "./flow-test-after-timer-ownership.js";
import { createFlowModel } from "./flow-model.js";
import { createFlowTestProgressControls } from "./flow-test-progress-controls.js";
import { createFlowTestReadSurface } from "./flow-test-read-surface.js";
import { createFlowTestRuntimeBoot } from "./flow-test-runtime-boot.js";
import { createFlowTestStreamOwnership } from "./flow-test-stream-ownership.js";
import { createFlowTestTransactionBookkeeping } from "./flow-test-transaction-bookkeeping.js";

type BuilderState<App extends FlowAppDefinition | undefined = undefined> = Readonly<{
  readonly app?: App;
  readonly resources: ReadonlyArray<FlowSeededResource>;
  readonly fixtures: ReadonlyArray<string>;
}>;

type HarnessSnapshot<Context, Event extends FlowEvent, State extends string> = FlowSnapshot<
  Context,
  State,
  Event
>;

type AnyStreamDefinition = Extract<FlowInvokeDescriptor, { readonly kind: "stream" }>;
type AnyTransactionInvoke = Extract<FlowInvokeDescriptor, { readonly kind: "run" }>;

type ActiveHarnessChild = Readonly<{
  readonly actorId: string;
  readonly actor: OrchestratorActorHandle &
    Readonly<{
      readonly subscribe: (listener: () => void) => () => void;
    }>;
  readonly definition: FlowChildDefinition;
  readonly correlationId: string | undefined;
  readonly unsubscribe: () => void;
}>;

const defaultProgressBounds: FlowTestProgressBounds = Object.freeze({
  maxTicks: 20,
  maxFibers: 10,
});

function createIdleSnapshot(id: string): FlowResourceSnapshot {
  return {
    id,
    status: "idle",
    availability: "empty",
    activity: "idle",
    freshness: "fresh",
    isPlaceholderData: false,
  };
}

function createSuccessSnapshot(id: string, value: unknown): FlowResourceSnapshot {
  return {
    id,
    status: "success",
    availability: "value",
    activity: "idle",
    freshness: "fresh",
    value,
    isPlaceholderData: false,
  };
}

function createCache(resources: ReadonlyArray<FlowSeededResource>): Readonly<{
  readonly byId: Map<string, FlowResourceSnapshot>;
  readonly refsById: Map<string, FlowResourceRef>;
  readonly inspector: FlowTestCache;
}> {
  const byId = new Map<string, FlowResourceSnapshot>();
  const refsById = new Map<string, FlowResourceRef>();
  for (const resource of resources) {
    byId.set(resource.ref.id, createSuccessSnapshot(resource.ref.id, resource.value));
    refsById.set(resource.ref.id, resource.ref);
  }
  return {
    byId,
    refsById,
    inspector: {
      query: (id) => byId.get(id),
    },
  };
}

function normalizeInvokes(
  configured: FlowInvokeDescriptor | ReadonlyArray<FlowInvokeDescriptor> | undefined,
): ReadonlyArray<FlowInvokeDescriptor> {
  if (configured === undefined) {
    return [];
  }

  if (Array.isArray(configured)) {
    return configured;
  }

  return [configured as FlowInvokeDescriptor];
}

function streamInvokesForState<Context, Event extends FlowEvent, State extends string>(
  snapshot: HarnessSnapshot<Context, Event, State>,
  value: State = snapshot.value,
): ReadonlyArray<AnyStreamDefinition> {
  return normalizeInvokes(snapshot.machine.config.states[value]?.invoke).filter(
    (invoke): invoke is AnyStreamDefinition => invoke.kind === "stream",
  );
}

function afterInvokesForState<Context, Event extends FlowEvent, State extends string>(
  snapshot: HarnessSnapshot<Context, Event, State>,
  value: State = snapshot.value,
) {
  if (value === snapshot.value) {
    return afterDefinitionsForState(snapshot);
  }

  return afterDefinitionsForState(
    Object.freeze({
      ...snapshot,
      value,
    }),
  );
}

function transactionInvokesForState<Context, Event extends FlowEvent, State extends string>(
  snapshot: HarnessSnapshot<Context, Event, State>,
  value: State = snapshot.value,
): ReadonlyArray<AnyTransactionInvoke> {
  return normalizeInvokes(snapshot.machine.config.states[value]?.invoke).filter(
    (invoke): invoke is AnyTransactionInvoke => invoke.kind === "run",
  );
}

function invokeArgsForSnapshot<Context, Event extends FlowEvent, State extends string>(
  snapshot: HarnessSnapshot<Context, Event, State>,
): Readonly<{
  readonly context: Context;
  readonly value: State;
  readonly snapshot: HarnessSnapshot<Context, Event, State>;
  readonly resources: HarnessSnapshot<Context, Event, State>["resources"];
  readonly transactions: HarnessSnapshot<Context, Event, State>["transactions"];
  readonly streams: HarnessSnapshot<Context, Event, State>["streams"];
  readonly timers: HarnessSnapshot<Context, Event, State>["timers"];
  readonly children: HarnessSnapshot<Context, Event, State>["children"];
  readonly receipts: HarnessSnapshot<Context, Event, State>["receipts"];
}> {
  return {
    context: snapshot.context,
    value: snapshot.value,
    snapshot,
    resources: snapshot.resources,
    transactions: snapshot.transactions,
    streams: snapshot.streams,
    timers: snapshot.timers,
    children: snapshot.children,
    receipts: snapshot.receipts,
  };
}

function createHarness<Context, Event extends FlowEvent, State extends string>(
  machine: FlowMachine<Context, Event, State>,
  app: FlowAppDefinition | undefined,
  resources: ReadonlyArray<FlowSeededResource>,
  input?: Partial<Context>,
): FlowStartedTestBuilder<Context, Event, State> {
  const cacheState = createCache(resources);
  const cache = cacheState.inspector;
  const knownResourceRefs = cacheState.refsById;
  const ownedChildren = new Map<string, ActiveHarnessChild>();
  let transactions: HarnessSnapshot<Context, Event, State>["transactions"] = {};
  let issues: ReadonlyArray<FlowIssue> = [];
  let childSnapshots: Readonly<Record<string, FlowChildSnapshot>> = {};
  let streamSnapshots: Readonly<Record<string, FlowTestStreamSnapshot>> = {};
  let timerSnapshots: Readonly<Record<string, FlowTimerSnapshot>> = {};
  const runtimeBoot = createFlowTestRuntimeBoot(app, resources);
  const { ensureRuntime, currentRuntimeTimeMillis, transitionRuntime } = runtimeBoot;
  let activeInspectionCorrelationId: string | undefined;

  const withInspectionCorrelation = <Value>(
    correlationId: string | undefined,
    work: () => Value,
  ): Value => {
    const previous = activeInspectionCorrelationId;
    activeInspectionCorrelationId = correlationId;
    try {
      return work();
    } finally {
      activeInspectionCorrelationId = previous;
    }
  };

  const materializeResources = () =>
    Object.fromEntries(
      Array.from(knownResourceRefs.entries()).map(([id]) => [
        id,
        cache.query(id) ?? createIdleSnapshot(id),
      ]),
    );

  const materializeSnapshot = (
    base: HarnessSnapshot<Context, Event, State>,
  ): HarnessSnapshot<Context, Event, State> =>
    Object.freeze({
      ...base,
      resources: materializeResources(),
      transactions,
      streams: streamSnapshots,
      timers: timerSnapshots,
      children: childSnapshots,
    });

  const applyInput = (
    base: HarnessSnapshot<Context, Event, State>,
  ): HarnessSnapshot<Context, Event, State> => {
    if (input === undefined) {
      return base;
    }

    return Object.freeze({
      ...base,
      context: Object.freeze({
        ...(base.context as Record<string, unknown>),
        ...(input as Record<string, unknown>),
      }) as Context,
    });
  };

  let snapshot = materializeSnapshot(
    applyInput(machine.getInitialSnapshot() as HarnessSnapshot<Context, Event, State>),
  );
  let nextInspectionCorrelationId = 0;

  const replaceSnapshot = (next: HarnessSnapshot<Context, Event, State>) => {
    snapshot = materializeSnapshot(next);
  };

  const annotateMachineEventReceipts = (
    previousReceiptCount: number,
    nextSnapshot: HarnessSnapshot<Context, Event, State>,
    correlationId: string,
    sourceActorId?: string,
  ): HarnessSnapshot<Context, Event, State> =>
    annotateNewMachineEventReceipts(nextSnapshot, previousReceiptCount, {
      ...(sourceActorId === undefined ? {} : { sourceActorId }),
      targetActorId: machine.id,
      correlationId,
    }) as HarnessSnapshot<Context, Event, State>;

  const dispatchMachineEvent = (event: Event, sourceActorId?: string) => {
    const previousReceiptCount = snapshot.receipts.length;
    const correlationId = `${machine.id}:event:${++nextInspectionCorrelationId}`;
    const next = withInspectionCorrelation(correlationId, () => {
      const plan = planMachineEvent(snapshot, event, transitionRuntime);
      const applied = applyMachineEventWithMeta(plan, transitionRuntime);
      let correlatedSnapshot = reconcileStateOwnedWork(
        snapshot,
        applied.snapshot,
        applied.reentered,
      );
      if (plan.matched && plan.transition.submit !== undefined) {
        correlatedSnapshot = startTransaction(correlatedSnapshot, plan.transition.submit, {
          event,
          parentState: correlatedSnapshot.value,
          stateOwned: false,
          trigger: "event",
          correlationId,
        });
      }
      return correlatedSnapshot;
    });
    replaceSnapshot(
      annotateMachineEventReceipts(previousReceiptCount, next, correlationId, sourceActorId),
    );
    return harness;
  };

  const dispatchOwnedMachineEvent = (event: Event) => dispatchMachineEvent(event, machine.id);

  const replaceStreamSnapshots = (next: Readonly<Record<string, FlowTestStreamSnapshot>>) => {
    streamSnapshots = next;
  };

  const replaceChildSnapshot = (
    id: string,
    snapshotForId: FlowChildSnapshot,
  ): Readonly<Record<string, FlowChildSnapshot>> =>
    Object.freeze({
      ...childSnapshots,
      [id]: snapshotForId,
    });

  const removeChildSnapshot = (id: string): Readonly<Record<string, FlowChildSnapshot>> => {
    const { [id]: _removed, ...rest } = childSnapshots;
    return Object.freeze(rest);
  };

  const appendReceipt = (
    current: HarnessSnapshot<Context, Event, State>,
    receipt: FlowReceipt,
  ): HarnessSnapshot<Context, Event, State> =>
    Object.freeze({
      ...current,
      receipts: [
        ...current.receipts,
        receiptWithCorrelation(receipt, activeInspectionCorrelationId),
      ],
    });

  const streamOwnership = createFlowTestStreamOwnership({
    currentSnapshot: () => snapshot,
    replaceSnapshot,
    materializeSnapshot,
    currentStreamSnapshots: () => streamSnapshots,
    replaceStreamSnapshots,
    currentIssues: () => issues,
    replaceIssues: (nextIssues) => {
      issues = nextIssues;
    },
    appendReceipt,
    streamInvokesForState,
    invokeArgsForSnapshot,
    dispatchOwnedMachineEvent,
    enqueue: (work) => {
      enqueueReadyWork(harness, work);
    },
    withInspectionCorrelation,
    currentCorrelationId: () => activeInspectionCorrelationId,
  });

  const { activeStreamIds, startStateOwnedStreams, stopStateOwnedStreams } = streamOwnership;

  const afterTimerOwnership = createFlowTestAfterTimerOwnership({
    currentSnapshot: () => snapshot,
    replaceSnapshot,
    materializeSnapshot,
    currentTimerSnapshots: () => timerSnapshots,
    replaceTimerSnapshots: (nextTimerSnapshots) => {
      timerSnapshots = nextTimerSnapshots;
    },
    appendReceipt,
    afterInvokesForState,
    enqueue: (work) => {
      enqueueReadyWork(harness, work);
    },
    currentCorrelationId: () => activeInspectionCorrelationId,
    withInspectionCorrelation,
    now: () => currentRuntimeTimeMillis(),
    runEffect: runtimeBoot.runEffect,
    applyAfterTransition: (current, definition) =>
      applyAfterTransitionWithMeta(current, definition, transitionRuntime),
    finalizeAppliedTransition: (current, applied) =>
      annotateMachineEventReceipts(
        current.receipts.length,
        reconcileStateOwnedWork(current, applied.snapshot, applied.reentered),
        `${machine.id}:event:${++nextInspectionCorrelationId}`,
        machine.id,
      ),
  });

  const { activeAfterEntries, startStateOwnedAfters, stopStateOwnedAfters } = afterTimerOwnership;
  const transactionBookkeeping = createFlowTestTransactionBookkeeping({
    currentSnapshot: () => snapshot,
    replaceSnapshot,
    materializeSnapshot,
    currentIssues: () => issues,
    replaceIssues: (nextIssues) => {
      issues = nextIssues;
    },
    currentTransactions: () => transactions,
    replaceTransactions: (nextTransactions) => {
      transactions = nextTransactions;
    },
    appendReceipt,
    currentCorrelationId: () => activeInspectionCorrelationId,
    withInspectionCorrelation,
    ensureRuntime,
    currentRuntimeTimeMillis,
    clockNow: runtimeBoot.clockNow,
    cacheById: cacheState.byId,
    knownResourceRefs,
    invokeArgsForSnapshot,
    transactionInvokesForState,
    dispatchOwnedMachineEvent,
    enqueue: (work) => {
      enqueueReadyWork(harness, work);
    },
  });

  const {
    activeTransactionIds,
    activeTransactionFiberCount,
    startTransaction,
    startStateOwnedTransactions,
    interruptTransactions,
    retryTransaction,
    resetTransaction,
  } = transactionBookkeeping;

  const attachOwnedChild = <ChildMachine extends FlowMachine>(
    definition: FlowChildDefinition<ChildMachine>,
    actorId: string,
  ): ActiveHarnessChild => {
    const actor = ensureRuntime().createActor(definition.config.machine, { id: actorId });
    const unsubscribe = actor.subscribe(() => {
      dispatchReadyWork(harness, () => {
        const active = ownedChildren.get(definition.id);
        if (active === undefined || active.actor !== actor) {
          return;
        }

        childSnapshots = replaceChildSnapshot(
          definition.id,
          childSnapshotForDefinition(
            definition,
            snapshot.value,
            actorId,
            String(actor.snapshot().value),
            childStatusForActor(actor),
            actor.snapshot(),
          ),
        );
        replaceSnapshot(
          materializeSnapshot(
            Object.freeze({
              ...snapshot,
              children: childSnapshots,
            }),
          ),
        );
      });
    });

    return {
      actorId,
      actor,
      definition,
      correlationId: undefined,
      unsubscribe,
    };
  };

  const startStateOwnedChildren = (
    current: HarnessSnapshot<Context, Event, State>,
    spawnReason: ChildLifecycleSpawnReason = "state-entry",
  ): HarnessSnapshot<Context, Event, State> => {
    const definitions = childInvokesForState(current);
    if (definitions.length === 0) {
      return current;
    }

    let next = current;

    for (const definition of definitions) {
      let entry = ownedChildren.get(definition.id);
      let created = false;
      if (entry === undefined) {
        entry = attachOwnedChild(definition, childActorId(machine.id, definition.id));
        ownedChildren.set(definition.id, entry);
        created = true;
      }

      const childActorSnapshot = entry.actor.snapshot();
      if (created) {
        next = appendReceipt(next, {
          type: "child:start",
          id: definition.id,
          ...childStartReceiptFacts(definition, entry.actorId, spawnReason, {
            parentState: current.value,
            state: String(childActorSnapshot.value),
          }),
        });
      }

      childSnapshots = replaceChildSnapshot(
        definition.id,
        childSnapshotForDefinition(
          definition,
          current.value,
          entry.actorId,
          String(childActorSnapshot.value),
          childStatusForActor(entry.actor),
          childActorSnapshot,
        ),
      );
    }

    return materializeSnapshot(
      Object.freeze({
        ...next,
        children: childSnapshots,
      }),
    );
  };

  const stopStateOwnedChildren = (
    current: HarnessSnapshot<Context, Event, State>,
    stopReason: ChildLifecycleStopReason = "state-exit",
  ): HarnessSnapshot<Context, Event, State> => {
    if (ownedChildren.size === 0) {
      if (Object.keys(childSnapshots).length === 0) {
        return current;
      }

      childSnapshots = {};
      return materializeSnapshot(
        Object.freeze({
          ...current,
          children: childSnapshots,
        }),
      );
    }

    let next = current;

    for (const [definitionId, entry] of Array.from(ownedChildren.entries())) {
      const priorChild =
        childSnapshots[definitionId] ??
        childSnapshotForDefinition(entry.definition, current.value, entry.actorId);

      ownedChildren.delete(definitionId);
      entry.unsubscribe();
      childSnapshots = removeChildSnapshot(definitionId);
      void entry.actor.dispose();
      next = appendReceipt(next, {
        type: "child:stop",
        id: definitionId,
        ...childStopReceiptFacts(entry.definition, entry.actorId, stopReason, {
          parentState: priorChild.parentState ?? current.value,
          state: priorChild.state,
          supervision: priorChild.supervision,
        }),
      });
    }

    return materializeSnapshot(
      Object.freeze({
        ...next,
        children: childSnapshots,
      }),
    );
  };

  const reconcileStateOwnedWork = (
    previous: HarnessSnapshot<Context, Event, State>,
    next: HarnessSnapshot<Context, Event, State>,
    reentered: boolean,
  ): HarnessSnapshot<Context, Event, State> => {
    if (previous.value === next.value && !reentered) {
      return materializeSnapshot(next);
    }

    return startStateOwnedChildren(
      startStateOwnedStreams(
        startStateOwnedAfters(
          startStateOwnedTransactions(
            stopStateOwnedChildren(
              stopStateOwnedStreams(
                stopStateOwnedAfters(
                  interruptTransactions(next, "state-owned", previous.value),
                  "state-exit",
                ),
                previous.value,
                "state-exit",
              ),
            ),
          ),
        ),
      ),
    );
  };

  const progressControls = createFlowTestProgressControls({
    currentHarness: () => harness,
    currentSnapshot: () => snapshot,
    ensureRuntime,
    currentRuntimeTimeMillis,
    activeTransactionIds,
    activeTransactionFiberCount,
    activeStreamIds,
    activeAfterEntries,
    defaultProgressBounds,
  });

  const { pendingWorkSnapshot, advance, advanceToNextTimer, waitForProgress, settle } =
    progressControls;

  const readSurface = createFlowTestReadSurface({
    currentSnapshot: () => snapshot,
    currentIssues: () => issues,
    currentTransactions: () => transactions,
    currentTimerSnapshots: () => timerSnapshots,
    currentStreamSnapshots: () => streamSnapshots,
    cache,
  });

  const harness: FlowTestHarness<Context, Event, State> = {
    state: () => snapshot.value,
    context: () => snapshot.context,
    snapshot: () => snapshot,
    send: (event) => {
      dispatchReadyWork(harness, () => {
        dispatchMachineEvent(event);
      });
      return harness;
    },
    sendAll: (events) => {
      for (const event of events) {
        harness.send(event);
      }
      return harness;
    },
    can: (event) => canMachineTransition(snapshot, event, transitionRuntime),
    children: () => snapshot.children,
    ...readSurface,
    pendingWork: () => pendingWorkSnapshot(),
    retryTransaction: (id) => retryTransaction(id),
    resetTransaction: (id) => resetTransaction(id),
    flush: () => flushReadyWork(harness),
    advance,
    advanceToNextTimer: () => advanceToNextTimer(),
    advanceUntilIdle: (bounds) =>
      waitForProgress(
        "advanceUntilIdle",
        () => {
          const pending = pendingWorkSnapshot();
          return pending.ready === 0 && pending.nextAfterMillis === undefined;
        },
        (pending) => pending.ready === 0 && pending.nextAfterMillis === undefined,
        bounds,
      ),
    until: (predicate, bounds) =>
      waitForProgress(
        "until",
        () => predicate(harness),
        (pending) => pending.ready === 0 && pending.nextAfterMillis === undefined,
        bounds,
        "predicate",
      ),
    untilState: (target, bounds) =>
      waitForProgress(
        "untilState",
        () =>
          typeof target === "function"
            ? target(snapshot.value, snapshot)
            : snapshot.value === target,
        (pending) => pending.ready === 0 && pending.nextAfterMillis === undefined,
        bounds,
        typeof target === "function" ? "state predicate" : `state '${target}'`,
      ),
    untilReceipt: (predicate, bounds) =>
      waitForProgress(
        "untilReceipt",
        () => snapshot.receipts.some((receipt) => predicate(receipt, snapshot.receipts)),
        (pending) => pending.ready === 0 && pending.nextAfterMillis === undefined,
        bounds,
        "receipt predicate",
      ),
    untilIssue: (predicate, bounds) =>
      waitForProgress(
        "untilIssue",
        () => issues.some((issue) => predicate(issue, issues)),
        (pending) => pending.ready === 0 && pending.nextAfterMillis === undefined,
        bounds,
        "issue predicate",
      ),
    settle,
  };

  replaceSnapshot(
    startStateOwnedChildren(
      startStateOwnedStreams(startStateOwnedAfters(startStateOwnedTransactions(snapshot))),
    ),
  );
  startReadyWork(harness);

  const started: FlowStartedTestBuilder<Context, Event, State> = Object.assign(harness, {
    provide: (service: Layer.Any) => {
      runtimeBoot.provide(service);
      return started;
    },
    clock: (now: () => number) => {
      runtimeBoot.clock(now);
      return started;
    },
    start: () => harness,
  });

  return started;
}

export function createFlowTestBuilder<App extends FlowAppDefinition | undefined = undefined>(
  state: BuilderState<App> = { resources: [], fixtures: [] } as BuilderState<App>,
): FlowTestBuilder<App> {
  return {
    app: <NextApp extends FlowAppDefinition>(app: NextApp) =>
      createFlowTestBuilder<NextApp>({
        ...state,
        app,
      }),
    seedResources: (resources: ReadonlyArray<FlowSeededResource>) =>
      createFlowTestBuilder<App>({
        ...state,
        resources,
      }),
    seedModuleFixtures: (fixture: string) =>
      createFlowTestBuilder<App>({
        ...state,
        fixtures: [...state.fixtures, fixture],
      }),
    start: <Context, Event extends FlowEvent, State extends string>(
      machine: FlowMachine<Context, Event, State>,
      options?: Readonly<{ readonly input?: Partial<Context> }>,
    ) => {
      const fixtureResources =
        state.app === undefined
          ? []
          : state.fixtures.flatMap((fixture) => fixtureResourcesForApp(state.app!, fixture));

      return createHarness(
        machine,
        state.app,
        [...fixtureResources, ...state.resources],
        options?.input,
      );
    },
    model: <Context, Event extends FlowEvent, State extends string>(
      machine: FlowMachine<Context, Event, State>,
      options?: Readonly<{ readonly input?: Partial<Context> }>,
    ) => {
      const fixtureResources =
        state.app === undefined
          ? []
          : state.fixtures.flatMap((fixture) => fixtureResourcesForApp(state.app!, fixture));

      return createFlowModel(machine, [...fixtureResources, ...state.resources], options?.input);
    },
  } as unknown as FlowTestBuilder<App>;
}

type LegacyFlowTestApi = {
  <Context, Event extends FlowEvent, State extends string>(
    machine: FlowMachine<Context, Event, State>,
  ): FlowStartedTestBuilder<Context, Event, State>;
};

export const flowTest = (<Context, Event extends FlowEvent, State extends string>(
  machine: FlowMachine<Context, Event, State>,
) => createFlowTestBuilder().start(machine)) as LegacyFlowTestApi;
