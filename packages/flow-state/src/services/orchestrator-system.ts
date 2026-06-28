import { Clock, Context, Effect, Exit, Layer, Option, Stream } from "effect";
import * as Duration from "effect/Duration";

import {
  afterDefinitionsForState,
  applyAfterTransitionWithMeta,
  applyMachineEventWithMeta,
  planMachineEvent,
} from "../machine-transition.js";
import { annotateNewMachineEventReceipts } from "../inspection-receipts.js";
import type {
  FlowActor,
  FlowActorSnapshotTree,
  FlowActorStartOptions,
  FlowAfterDefinition,
  FlowChildDefinition,
  FlowChildSnapshot,
  FlowEvent,
  FlowIssue,
  FlowInvalidationTarget,
  FlowInvokeDescriptor,
  FlowMachine,
  FlowReceipt,
  FlowResourceRef,
  FlowResourceSnapshot,
  FlowSnapshot,
  FlowStreamSnapshot,
  FlowTimerSnapshot,
  FlowTransactionSnapshot,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "../public/types.js";
import { enqueueReadyWork, flushReadyWork } from "../ready-work.js";
import { resourceKeyOf } from "../store/invalidation.js";
import { applyResourcePatch } from "../store/resource-patch.js";
import { controlledStreamSourceOf } from "../testing/controlled-stream.js";
import {
  transactionReceiptIdForInvalidationTarget,
  transactionRefsForInvalidationTarget,
} from "../transaction-invalidation.js";
import { FlowAppOwnership } from "./app-ownership.js";
import { clearIssue, issueFromExit, latestIssue, replaceIssue } from "./orchestrator-issues.js";
import { createTransactionController } from "./orchestrator-transactions.js";
import { ResourceStore } from "./resource-store.js";
import { TraceLog } from "./trace.js";

type AnyFlowActor = FlowActor<unknown, FlowEvent, string>;

type ActorForMachine<Machine extends FlowMachine> = FlowActor<
  InferMachineContext<Machine>,
  InferMachineEvent<Machine>,
  InferMachineState<Machine>
>;

type ActorStartOptions<Machine extends FlowMachine = FlowMachine> = FlowActorStartOptions<Machine>;

type SnapshotForMachine<Machine extends FlowMachine> = FlowSnapshot<
  InferMachineContext<Machine>,
  InferMachineState<Machine>,
  InferMachineEvent<Machine>
>;

type FlowQueryInvoke =
  | Readonly<{ readonly kind: "ensure"; readonly ref: FlowResourceRef }>
  | Readonly<{ readonly kind: "refresh"; readonly ref: FlowResourceRef }>
  | Readonly<{ readonly kind: "observe"; readonly ref: FlowResourceRef }>;
type FlowResourceCommandInvoke =
  | Readonly<{ readonly kind: "patch"; readonly ref: FlowResourceRef; readonly patch: unknown }>
  | Readonly<{ readonly kind: "invalidate"; readonly target: FlowInvalidationTarget }>;

type AnyFlowAfterDefinition = FlowAfterDefinition<string, unknown, FlowEvent>;
type AnyFlowStreamDefinition = Extract<FlowInvokeDescriptor, { readonly kind: "stream" }>;
type AnyFlowTransactionInvoke = Extract<FlowInvokeDescriptor, { readonly kind: "run" }>;
type AnyFlowSnapshot = FlowSnapshot<unknown, string, FlowEvent>;
type OwnedChildEntry = Readonly<{
  readonly actorId: string;
  readonly actor: AnyFlowActor;
  readonly definition: FlowChildDefinition;
  readonly unsubscribe: () => void;
}>;
type ResourceStoreService = Parameters<(typeof ResourceStore)["of"]>[0];

function appendNewReceipts(
  previous: ReadonlyArray<FlowReceipt>,
  next: ReadonlyArray<FlowReceipt>,
  appendTrace?: (receipt: FlowReceipt) => void,
): void {
  if (appendTrace === undefined || next.length <= previous.length) {
    return;
  }

  for (const receipt of next.slice(previous.length)) {
    appendTrace(receipt);
  }
}

function canReuseKeepAliveActor<Machine extends FlowMachine>(
  actor: AnyFlowActor | undefined,
  machine: Machine,
  options?: ActorStartOptions<Machine>,
): boolean {
  return (
    actor !== undefined &&
    options?.snapshot === undefined &&
    options?.policy === "keep-alive" &&
    actor.machine.id === machine.id
  );
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

function invokeArgsForSnapshot<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
): Readonly<{
  readonly context: Context;
  readonly value: State;
  readonly snapshot: FlowSnapshot<Context, State, Event>;
  readonly resources: FlowSnapshot<Context, State, Event>["resources"];
  readonly transactions: FlowSnapshot<Context, State, Event>["transactions"];
  readonly streams: FlowSnapshot<Context, State, Event>["streams"];
  readonly timers: FlowSnapshot<Context, State, Event>["timers"];
  readonly children: FlowSnapshot<Context, State, Event>["children"];
  readonly receipts: FlowSnapshot<Context, State, Event>["receipts"];
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

function childInvokesForState<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  value: State = snapshot.value,
): ReadonlyArray<FlowChildDefinition> {
  return normalizeInvokes(snapshot.machine.config.states[value]?.invoke).filter(
    (invoke): invoke is FlowChildDefinition => invoke.kind === "child",
  );
}

function queryInvokesForState<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  value: State = snapshot.value,
): ReadonlyArray<FlowQueryInvoke> {
  return normalizeInvokes(snapshot.machine.config.states[value]?.invoke).filter(
    (invoke): invoke is FlowQueryInvoke =>
      invoke.kind === "ensure" || invoke.kind === "refresh" || invoke.kind === "observe",
  );
}

function streamInvokesForState<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  value: State = snapshot.value,
): ReadonlyArray<AnyFlowStreamDefinition> {
  return normalizeInvokes(snapshot.machine.config.states[value]?.invoke).filter(
    (invoke): invoke is AnyFlowStreamDefinition => invoke.kind === "stream",
  );
}

function afterInvokesForState<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  value: State = snapshot.value,
): ReadonlyArray<FlowAfterDefinition<State, Context, Event>> {
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
  snapshot: FlowSnapshot<Context, State, Event>,
  value: State = snapshot.value,
): ReadonlyArray<AnyFlowTransactionInvoke> {
  return normalizeInvokes(snapshot.machine.config.states[value]?.invoke).filter(
    (invoke): invoke is AnyFlowTransactionInvoke => invoke.kind === "run",
  );
}

function resourceCommandInvokesForState<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  value: State = snapshot.value,
): ReadonlyArray<FlowResourceCommandInvoke> {
  return normalizeInvokes(snapshot.machine.config.states[value]?.invoke).filter(
    (invoke): invoke is FlowResourceCommandInvoke =>
      invoke.kind === "patch" || invoke.kind === "invalidate",
  );
}

function childSnapshotForDefinition<State extends string>(
  definition: FlowChildDefinition,
  parentState: State,
  actorId: string,
  state: string = definition.config.machine.config.initial,
  status: FlowChildSnapshot["status"] = "active",
  snapshot?: AnyFlowSnapshot,
): FlowChildSnapshot {
  const base = {
    id: definition.id,
    actorId,
    status,
    state,
    ...(snapshot === undefined ? {} : { snapshot: toActorSnapshotTree(snapshot) }),
    parentState,
  };

  return Object.freeze(
    definition.config.supervision === undefined
      ? base
      : {
          ...base,
          supervision: definition.config.supervision,
        },
  );
}

function childActorId(parentActorId: string, childId: string): string {
  return `${parentActorId}/${childId}`;
}

function toActorSnapshotTree(snapshot: AnyFlowSnapshot): FlowActorSnapshotTree {
  return Object.freeze({
    value: snapshot.value,
    context: snapshot.context,
    resources: snapshot.resources,
    transactions: snapshot.transactions,
    streams: snapshot.streams,
    timers: snapshot.timers,
    children: snapshot.children,
    receipts: snapshot.receipts,
  });
}

function restoreChildActorSnapshot<ChildMachine extends FlowMachine>(
  definition: FlowChildDefinition<ChildMachine>,
  child: FlowChildSnapshot,
): SnapshotForMachine<ChildMachine> | undefined {
  if (child.snapshot !== undefined) {
    return Object.freeze({
      ...definition.config.machine.getInitialSnapshot(),
      value: child.snapshot.value,
      context: child.snapshot.context,
      resources: child.snapshot.resources,
      transactions: child.snapshot.transactions,
      streams: child.snapshot.streams,
      timers: child.snapshot.timers,
      children: child.snapshot.children,
      receipts: child.snapshot.receipts,
    }) as SnapshotForMachine<ChildMachine>;
  }

  if (child.state === undefined) {
    return undefined;
  }

  return Object.freeze({
    ...definition.config.machine.getInitialSnapshot(),
    value: child.state,
  }) as SnapshotForMachine<ChildMachine>;
}

function isFinalMachineState<Machine extends FlowMachine>(
  machine: Machine,
  state: string,
): boolean {
  const configuredState = machine.config.states[state as InferMachineState<Machine>];
  return configuredState?.type === "final";
}

function childStatusForActor(actor: AnyFlowActor): FlowChildSnapshot["status"] {
  const issues = actor.issues();
  const issue = latestIssue(issues);
  if (issue === undefined) {
    return isFinalMachineState(actor.machine, String(actor.snapshot().value))
      ? "success"
      : "active";
  }

  if (issue.kind === "interrupt") {
    return "interrupt";
  }

  return "failure";
}

function createContractActor<Machine extends FlowMachine>(
  machine: Machine,
  id = machine.id,
  createOwnedActor: <ChildMachine extends FlowMachine>(
    machine: ChildMachine,
    id: string,
    onDispose?: () => void,
    initialSnapshot?: SnapshotForMachine<ChildMachine>,
  ) => ActorForMachine<ChildMachine>,
  resourceStore: ResourceStoreService,
  runtimeContext: Context.Context<any>,
  onDispose?: () => void,
  appendTrace?: (receipt: FlowReceipt) => void,
  initialSnapshot?: SnapshotForMachine<Machine>,
): ActorForMachine<Machine> {
  const typedMachine = machine as ActorForMachine<Machine>["machine"];
  let snapshot = (initialSnapshot ??
    typedMachine.getInitialSnapshot()) as SnapshotForMachine<Machine>;
  let issues: ReadonlyArray<FlowIssue> = [];
  const listeners = new Map<number, () => void>();
  const runEffect = Effect.runCallbackWith(runtimeContext);
  const runSyncExit = Effect.runSyncExitWith(runtimeContext);
  const transitionRuntime = Object.freeze({
    now: () => {
      const exit = runSyncExit(Clock.currentTimeMillis);
      return Exit.isSuccess(exit) ? exit.value : Date.now();
    },
  });
  const ownedChildren = new Map<string, OwnedChildEntry>();
  const ownedQueries = new Map<
    string,
    {
      readonly kind: FlowQueryInvoke["kind"];
      readonly ref: FlowResourceRef;
      cancelLookup: (interruptor?: number) => void;
      releaseObservation: () => void;
    }
  >();
  const ownedStreams = new Map<
    string,
    {
      readonly definition: AnyFlowStreamDefinition;
      readonly generation: number;
      interrupt: (interruptor?: number) => void;
    }
  >();
  const ownedAfters = new Map<
    string,
    {
      readonly definition: AnyFlowAfterDefinition;
      readonly generation: number;
      readonly parentState: InferMachineState<Machine>;
      readonly startedAt: number;
      readonly dueAt: number;
      interrupt: (interruptor?: number) => void;
    }
  >();
  const knownResourceRefs = new Map<string, FlowResourceRef>();
  const streamGenerations = new Map<string, number>();
  const timerGenerations = new Map<string, number>();
  let nextListenerId = 0;
  let nextInspectionCorrelationId = 0;
  let disposed = false;

  const rememberResourceRef = (ref: FlowResourceRef) => {
    knownResourceRefs.set(resourceKeyOf(ref), ref);
  };

  const replaceSnapshot = (
    nextSnapshot: SnapshotForMachine<Machine>,
    notifyListenersAfter = false,
  ) => {
    appendNewReceipts(snapshot.receipts, nextSnapshot.receipts, appendTrace);
    snapshot = nextSnapshot;
    if (notifyListenersAfter) {
      notifyListeners();
    }
  };

  const appendReceipt = (receipt: FlowReceipt, notifyListenersAfter = false) => {
    replaceSnapshot(
      Object.freeze({
        ...snapshot,
        receipts: [...snapshot.receipts, receipt],
      }),
      notifyListenersAfter,
    );
  };

  const annotateMachineEventReceipts = (
    previousReceiptCount: number,
    nextSnapshot: SnapshotForMachine<Machine>,
    sourceActorId?: string,
  ): SnapshotForMachine<Machine> =>
    annotateNewMachineEventReceipts(nextSnapshot, previousReceiptCount, {
      ...(sourceActorId === undefined ? {} : { sourceActorId }),
      targetActorId: id,
      correlationId: `${id}:event:${++nextInspectionCorrelationId}`,
    }) as SnapshotForMachine<Machine>;

  const dispatchMachineEvent = (event: InferMachineEvent<Machine>, sourceActorId?: string) => {
    if (disposed) {
      return;
    }

    const previousReceiptCount = snapshot.receipts.length;
    const plan = planMachineEvent(snapshot, event, transitionRuntime);
    const applied = applyMachineEventWithMeta(plan, transitionRuntime);
    let nextSnapshot = reconcileStateOwnedWork(snapshot, applied.snapshot, applied.reentered);
    if (plan.matched && plan.transition.submit !== undefined) {
      nextSnapshot = transactionController.start(nextSnapshot, plan.transition.submit, {
        parentState: nextSnapshot.value,
        trigger: "event",
        event,
        stateOwned: false,
      });
    }
    replaceSnapshot(
      annotateMachineEventReceipts(previousReceiptCount, nextSnapshot, sourceActorId),
      true,
    );
  };

  const dispatchOwnedMachineEvent = (event: InferMachineEvent<Machine>) => {
    dispatchMachineEvent(event, id);
  };

  const notifyListeners = () => {
    for (const listener of Array.from(listeners.values())) {
      listener();
    }
  };

  const replaceIssues = (nextIssues: ReadonlyArray<FlowIssue>, notifyListenersAfter = false) => {
    issues = nextIssues;
    if (notifyListenersAfter) {
      notifyListeners();
    }
  };

  const currentResourceSnapshot = (ref: FlowResourceRef): FlowResourceSnapshot | undefined => {
    const exit = runSyncExit(resourceStore.get(ref));
    return Exit.isSuccess(exit) ? exit.value : undefined;
  };

  const updateResourceSnapshot = (
    ref: FlowResourceRef,
    nextResource: FlowResourceSnapshot | undefined,
    notifyListenersAfter = false,
  ) => {
    if (nextResource === undefined) {
      return;
    }

    rememberResourceRef(ref);

    replaceSnapshot(
      Object.freeze({
        ...snapshot,
        resources: {
          ...snapshot.resources,
          [ref.id]: nextResource,
        },
      }),
      notifyListenersAfter,
    );
  };

  const startStateOwnedQueries = (
    current: SnapshotForMachine<Machine>,
  ): SnapshotForMachine<Machine> => {
    const definitions = queryInvokesForState(current);
    if (definitions.length === 0) {
      return current;
    }

    const nextResources: Record<string, FlowResourceSnapshot> = {
      ...current.resources,
    };
    const nextReceipts = [...current.receipts];
    let changed = false;

    for (const definition of definitions) {
      const key = `${definition.kind}:${definition.ref.id}`;
      if (ownedQueries.has(key)) {
        continue;
      }

      changed = true;
      const seededSnapshot = currentResourceSnapshot(definition.ref);
      if (seededSnapshot !== undefined) {
        rememberResourceRef(definition.ref);
        nextResources[definition.ref.id] = seededSnapshot;
      }
      nextReceipts.push({
        type: "query:start",
        id: definition.ref.id,
        mode: definition.kind,
        parentState: current.value,
      });

      const entry: {
        readonly kind: FlowQueryInvoke["kind"];
        readonly ref: FlowResourceRef;
        cancelLookup: (interruptor?: number) => void;
        releaseObservation: () => void;
      } = {
        kind: definition.kind,
        ref: definition.ref,
        cancelLookup: () => {},
        releaseObservation: () => {},
      };
      ownedQueries.set(key, entry);

      if (definition.kind === "observe") {
        runEffect(
          resourceStore.subscribe(definition.ref, (nextResource: FlowResourceSnapshot) => {
            enqueueReadyWork(actor, () => {
              if (disposed || ownedQueries.get(key) !== entry) {
                return;
              }

              updateResourceSnapshot(definition.ref, nextResource, true);
            });
          }),
          {
            onExit: (exit) => {
              if (Exit.isSuccess(exit)) {
                entry.releaseObservation = exit.value;
                return;
              }

              enqueueReadyWork(actor, () => {
                if (disposed || ownedQueries.get(key) !== entry) {
                  return;
                }

                const issue = issueFromExit("resource", definition.ref.id, exit);
                if (issue !== undefined) {
                  replaceIssues(replaceIssue(issues, issue), true);
                }
              });
            },
          },
        );
      }

      const lookup =
        definition.kind === "refresh"
          ? resourceStore.refresh(definition.ref)
          : resourceStore.ensure(definition.ref);

      entry.cancelLookup = runEffect(lookup, {
        onExit: (exit) => {
          enqueueReadyWork(actor, () => {
            if (disposed) {
              return;
            }

            if (definition.kind === "observe" && ownedQueries.get(key) !== entry) {
              return;
            }

            updateResourceSnapshot(definition.ref, currentResourceSnapshot(definition.ref), true);
            const issue = issueFromExit("resource", definition.ref.id, exit);
            replaceIssues(
              issue === undefined
                ? clearIssue(issues, "resource", definition.ref.id)
                : replaceIssue(issues, issue),
              true,
            );

            if (definition.kind !== "observe") {
              ownedQueries.delete(key);
            }
          });
        },
      });
    }

    if (!changed) {
      return current;
    }

    return Object.freeze({
      ...current,
      resources: nextResources,
      receipts: nextReceipts,
    });
  };

  const stopStateOwnedQueries = (
    current: SnapshotForMachine<Machine>,
  ): SnapshotForMachine<Machine> => {
    if (ownedQueries.size === 0) {
      return current;
    }

    for (const [key, entry] of Array.from(ownedQueries.entries())) {
      ownedQueries.delete(key);
      entry.cancelLookup();
      entry.releaseObservation();
    }

    return current;
  };

  const syncResourceSnapshots = (
    currentResources: Readonly<Record<string, FlowResourceSnapshot>>,
    refs: ReadonlyArray<FlowResourceRef>,
  ): Record<string, FlowResourceSnapshot> => {
    const nextResources: Record<string, FlowResourceSnapshot> = {
      ...currentResources,
    };

    for (const ref of refs) {
      rememberResourceRef(ref);
      const nextResource = currentResourceSnapshot(ref);
      if (nextResource !== undefined) {
        nextResources[ref.id] = nextResource;
      }
    }

    return nextResources;
  };

  const transactionController = createTransactionController<Machine>({
    currentSnapshot: () => snapshot,
    replaceSnapshot,
    currentIssues: () => issues,
    replaceIssues,
    dispatchOwnedMachineEvent,
    enqueue: (work) => {
      enqueueReadyWork(actor, work);
    },
    isDisposed: () => disposed,
    now: transitionRuntime.now,
    runEffect: (effect, onExit) => runEffect(effect, onExit === undefined ? undefined : { onExit }),
    runSyncExit,
    resourceStore,
    currentResourceSnapshot,
    syncResourceSnapshots,
    knownResourceRefs: () => knownResourceRefs.values(),
    invokeArgsForSnapshot: (current) => invokeArgsForSnapshot(current),
  });

  const startStateOwnedResourceCommands = (
    current: SnapshotForMachine<Machine>,
  ): SnapshotForMachine<Machine> => {
    const definitions = resourceCommandInvokesForState(current);
    if (definitions.length === 0) {
      return current;
    }

    let nextResources: Record<string, FlowResourceSnapshot> = {
      ...current.resources,
    };
    const nextReceipts = [...current.receipts];
    let nextIssues = issues;

    for (const definition of definitions) {
      if (definition.kind === "patch") {
        const exit = runSyncExit(
          resourceStore.patch(definition.ref, (currentValue) =>
            applyResourcePatch(currentValue, definition.patch),
          ),
        );
        nextResources = syncResourceSnapshots(nextResources, [definition.ref]);
        const issue = issueFromExit("resource", definition.ref.id, exit);
        nextIssues =
          issue === undefined
            ? clearIssue(nextIssues, "resource", definition.ref.id)
            : replaceIssue(nextIssues, issue);
        if (Exit.isSuccess(exit)) {
          nextReceipts.push({
            type: "resource:patch",
            id: definition.ref.id,
            parentState: current.value,
          });
        }
        continue;
      }

      const exit = runSyncExit(resourceStore.invalidate(definition.target));
      const targetId = transactionReceiptIdForInvalidationTarget(definition.target);
      nextResources = syncResourceSnapshots(
        nextResources,
        transactionRefsForInvalidationTarget(knownResourceRefs.values(), definition.target),
      );
      const issue = issueFromExit("resource", targetId, exit);
      nextIssues =
        issue === undefined
          ? clearIssue(nextIssues, "resource", targetId)
          : replaceIssue(nextIssues, issue);
      if (Exit.isSuccess(exit)) {
        nextReceipts.push({
          type: "resource:invalidate",
          id: targetId,
          count: exit.value,
          parentState: current.value,
        });
      }
    }

    replaceIssues(nextIssues);

    return Object.freeze({
      ...current,
      resources: nextResources,
      receipts: nextReceipts,
    });
  };

  const startStateOwnedTransactions = (
    current: SnapshotForMachine<Machine>,
  ): SnapshotForMachine<Machine> => {
    const definitions = transactionInvokesForState(current);
    if (definitions.length === 0) {
      return current;
    }

    let next = current;
    for (const definition of definitions) {
      next = transactionController.start(next, definition.transaction, {
        parentState: current.value,
        trigger: "state",
        stateOwned: true,
      });
    }

    return next;
  };

  const startStateOwnedAfters = (
    current: SnapshotForMachine<Machine>,
  ): SnapshotForMachine<Machine> => {
    const definitions = afterInvokesForState(current);
    if (definitions.length === 0) {
      return current;
    }

    const nextTimers: Record<string, FlowTimerSnapshot> = {
      ...current.timers,
    };
    const nextReceipts = [...current.receipts];
    let changed = false;

    for (const definition of definitions) {
      if (ownedAfters.has(definition.id)) {
        continue;
      }

      changed = true;
      const startedAt = transitionRuntime.now();
      const generation = (timerGenerations.get(definition.id) ?? 0) + 1;
      const dueAt =
        startedAt + Duration.toMillis(Duration.fromInputUnsafe(definition.config.delay));
      timerGenerations.set(definition.id, generation);
      nextTimers[definition.id] = {
        id: definition.id,
        status: "scheduled",
        generation,
        parentState: current.value,
        startedAt,
        dueAt,
      };
      nextReceipts.push({
        type: "timer:start",
        id: definition.id,
        generation,
        parentState: current.value,
        dueAt,
      });

      const entry: {
        readonly definition: AnyFlowAfterDefinition;
        readonly generation: number;
        readonly parentState: InferMachineState<Machine>;
        readonly startedAt: number;
        readonly dueAt: number;
        interrupt: (interruptor?: number) => void;
      } = {
        definition,
        generation,
        parentState: current.value,
        startedAt,
        dueAt,
        interrupt: () => {},
      };
      ownedAfters.set(definition.id, entry);
      entry.interrupt = runEffect(Effect.sleep(definition.config.delay), {
        onExit: (exit) => {
          enqueueReadyWork(actor, () => {
            if (disposed || ownedAfters.get(definition.id) !== entry || !Exit.isSuccess(exit)) {
              return;
            }

            ownedAfters.delete(definition.id);
            const endedAt = transitionRuntime.now();
            const applied = applyAfterTransitionWithMeta(
              Object.freeze({
                ...snapshot,
                timers: {
                  ...snapshot.timers,
                  [definition.id]: {
                    id: definition.id,
                    status: "fired",
                    generation: entry.generation,
                    parentState: entry.parentState,
                    startedAt: entry.startedAt,
                    dueAt: entry.dueAt,
                    endedAt,
                  },
                },
                receipts: [
                  ...snapshot.receipts,
                  {
                    type: "timer:fire",
                    id: definition.id,
                    generation: entry.generation,
                    parentState: entry.parentState,
                    dueAt: entry.dueAt,
                    endedAt,
                  } satisfies FlowReceipt,
                ],
              }) as SnapshotForMachine<Machine>,
              definition,
              transitionRuntime,
            );
            replaceSnapshot(
              annotateMachineEventReceipts(
                snapshot.receipts.length,
                reconcileStateOwnedWork(snapshot, applied.snapshot, applied.reentered),
                id,
              ),
              true,
            );
          });
        },
      });
    }

    return changed
      ? Object.freeze({
          ...current,
          timers: nextTimers,
          receipts: nextReceipts,
        })
      : current;
  };

  const startStateOwnedStreams = (
    current: SnapshotForMachine<Machine>,
  ): SnapshotForMachine<Machine> => {
    const definitions = streamInvokesForState(current);
    if (definitions.length === 0) {
      return current;
    }

    const nextStreams: Record<string, FlowStreamSnapshot> = {
      ...current.streams,
    };
    const nextReceipts = [...current.receipts];
    let nextIssues = issues;
    let changed = false;

    for (const definition of definitions) {
      if (ownedStreams.has(definition.id)) {
        continue;
      }

      changed = true;
      const generation = (streamGenerations.get(definition.id) ?? 0) + 1;
      streamGenerations.set(definition.id, generation);
      nextStreams[definition.id] = {
        id: definition.id,
        status: "running",
        generation,
        emitted: 0,
      };
      nextReceipts.push({
        type: "stream:start",
        id: definition.id,
        generation,
        parentState: current.value,
      });
      nextIssues = clearIssue(nextIssues, "stream", definition.id);

      const entry: {
        readonly definition: AnyFlowStreamDefinition;
        readonly generation: number;
        interrupt: (interruptor?: number) => void;
      } = {
        definition,
        generation,
        interrupt: () => {},
      };
      ownedStreams.set(definition.id, entry);
      const params = definition.config.params?.(invokeArgsForSnapshot(current));
      const stream = definition.config.subscribe({ params } as never);
      const applyStreamValue = (value: unknown) => {
        enqueueReadyWork(actor, () => {
          if (disposed || ownedStreams.get(definition.id) !== entry) {
            return;
          }

          replaceSnapshot(
            Object.freeze({
              ...snapshot,
              streams: {
                ...snapshot.streams,
                [definition.id]: {
                  id: definition.id,
                  status: "running",
                  generation,
                  emitted: (snapshot.streams[definition.id]?.emitted ?? 0) + 1,
                  value,
                },
              },
            }),
            true,
          );

          const routedValue = definition.config.routes?.value?.(value as never);
          if (routedValue !== undefined) {
            dispatchOwnedMachineEvent(routedValue as InferMachineEvent<Machine>);
          }
        });
      };
      const finishStream = (exit: Exit.Exit<unknown, unknown>) => {
        enqueueReadyWork(actor, () => {
          if (disposed || ownedStreams.get(definition.id) !== entry) {
            return;
          }

          ownedStreams.delete(definition.id);
          const issue = issueFromExit("stream", definition.id, exit);
          const status: FlowStreamSnapshot["status"] = Exit.isSuccess(exit)
            ? "success"
            : issue?.kind === "interrupt"
              ? "interrupt"
              : "failure";
          replaceIssues(
            issue === undefined
              ? clearIssue(issues, "stream", definition.id)
              : replaceIssue(issues, issue),
          );
          replaceSnapshot(
            Object.freeze({
              ...snapshot,
              streams: {
                ...snapshot.streams,
                [definition.id]: {
                  id: definition.id,
                  status,
                  generation,
                  emitted: snapshot.streams[definition.id]?.emitted ?? 0,
                  value: snapshot.streams[definition.id]?.value,
                  error: issue?.error,
                },
              },
              receipts: [
                ...snapshot.receipts,
                {
                  type: `stream:${status === "success" ? "done" : issue?.kind === "interrupt" ? "interrupt" : issue?.kind === "defect" ? "defect" : "failure"}`,
                  id: definition.id,
                  generation,
                } satisfies FlowReceipt,
              ],
            }),
            true,
          );

          const routedEvent = Exit.isSuccess(exit)
            ? definition.config.routes?.done?.()
            : issue?.kind === "interrupt"
              ? definition.config.routes?.interrupt?.()
              : issue?.kind === "failure"
                ? definition.config.routes?.failure?.(issue.error as never)
                : issue?.kind === "defect"
                  ? definition.config.routes?.defect?.(issue.cause)
                  : undefined;
          if (routedEvent !== undefined) {
            dispatchOwnedMachineEvent(routedEvent as InferMachineEvent<Machine>);
          }
        });
      };
      const controlledStreamSource = controlledStreamSourceOf(stream);

      if (controlledStreamSource !== undefined) {
        const unsubscribe = controlledStreamSource.subscribe({
          onValue: applyStreamValue,
          onFailure: (error) => {
            finishStream(Exit.fail(error));
          },
          onDone: () => {
            finishStream(Exit.void);
          },
        });
        entry.interrupt = () => {
          unsubscribe();
        };
        continue;
      }

      entry.interrupt = runEffect(
        Stream.runForEach(stream, (value) => Effect.sync(() => applyStreamValue(value))),
        {
          onExit: finishStream,
        },
      );
    }

    if (!changed) {
      return current;
    }

    replaceIssues(nextIssues);

    return Object.freeze({
      ...current,
      streams: nextStreams,
      receipts: nextReceipts,
    });
  };

  const stopStateOwnedAfters = (
    current: SnapshotForMachine<Machine>,
  ): SnapshotForMachine<Machine> => {
    if (ownedAfters.size === 0) {
      return current;
    }

    const nextTimers: Record<string, FlowTimerSnapshot> = {
      ...current.timers,
    };
    const nextReceipts = [...current.receipts];

    for (const [afterId, entry] of Array.from(ownedAfters.entries())) {
      ownedAfters.delete(afterId);
      entry.interrupt();
      const endedAt = transitionRuntime.now();
      nextTimers[afterId] = {
        id: afterId,
        status: "interrupt",
        generation: entry.generation,
        parentState: entry.parentState,
        startedAt: entry.startedAt,
        dueAt: entry.dueAt,
        endedAt,
      };
      nextReceipts.push({
        type: "timer:interrupt",
        id: afterId,
        generation: entry.generation,
        parentState: entry.parentState,
        dueAt: entry.dueAt,
        endedAt,
      });
    }

    return Object.freeze({
      ...current,
      timers: nextTimers,
      receipts: nextReceipts,
    });
  };

  const stopStateOwnedStreams = (
    current: SnapshotForMachine<Machine>,
    parentState: InferMachineState<Machine> = current.value,
    routeInterrupts = false,
  ): SnapshotForMachine<Machine> => {
    if (ownedStreams.size === 0) {
      return current;
    }

    const nextStreams: Record<string, FlowStreamSnapshot> = {
      ...current.streams,
    };
    const nextReceipts = [...current.receipts];
    let nextIssues = issues;

    for (const [streamId, entry] of Array.from(ownedStreams.entries())) {
      ownedStreams.delete(streamId);
      entry.interrupt();
      const priorStream = current.streams[streamId];
      nextStreams[streamId] = {
        id: streamId,
        status: "interrupt",
        generation: entry.generation,
        ...(priorStream?.emitted === undefined ? {} : { emitted: priorStream.emitted }),
        value: priorStream?.value,
      };
      nextReceipts.push({
        type: "stream:interrupt",
        id: streamId,
        generation: entry.generation,
        parentState,
      });
      nextIssues = replaceIssue(nextIssues, {
        kind: "interrupt",
        source: "stream",
        id: streamId,
      });

      const routedInterrupt = routeInterrupts
        ? entry.definition.config.routes?.interrupt?.()
        : undefined;
      if (routedInterrupt !== undefined) {
        enqueueReadyWork(actor, () => {
          const latest = snapshot.streams[streamId];
          if (latest?.status !== "interrupt" || latest.generation !== entry.generation) {
            return;
          }

          dispatchOwnedMachineEvent(routedInterrupt as InferMachineEvent<Machine>);
        });
      }
    }

    replaceIssues(nextIssues);
    return Object.freeze({
      ...current,
      streams: nextStreams,
      receipts: nextReceipts,
    });
  };

  const attachOwnedChild = <ChildMachine extends FlowMachine>(
    definition: FlowChildDefinition<ChildMachine>,
    actorId: string,
    initialChildSnapshot?: SnapshotForMachine<ChildMachine>,
  ): OwnedChildEntry => {
    let nextEntry: OwnedChildEntry | undefined;
    const ownedActor = createOwnedActor(
      definition.config.machine,
      actorId,
      () => {
        const currentEntry = ownedChildren.get(definition.id);
        if (currentEntry !== nextEntry || disposed) {
          return;
        }

        ownedChildren.delete(definition.id);
        replaceIssues(clearIssue(issues, "child", definition.id));
        const priorChild =
          snapshot.children[definition.id] ??
          childSnapshotForDefinition(definition, snapshot.value, actorId);
        const { [definition.id]: _removedChild, ...remainingChildren } = snapshot.children;

        replaceSnapshot(
          Object.freeze({
            ...snapshot,
            children: remainingChildren,
            receipts: [
              ...snapshot.receipts,
              {
                type: "child:stop",
                id: definition.id,
                actorId,
                parentState: priorChild.parentState ?? snapshot.value,
              } satisfies FlowReceipt,
            ],
          }),
          true,
        );
      },
      initialChildSnapshot,
    );
    const unsubscribe = ownedActor.subscribe(() => {
      if (disposed) {
        return;
      }

      const currentEntry = ownedChildren.get(definition.id);
      if (currentEntry === undefined || currentEntry !== nextEntry) {
        return;
      }

      const currentChild = snapshot.children[definition.id];
      if (currentChild === undefined) {
        return;
      }

      const childIssue = latestIssue(currentEntry.actor.issues());
      const childActorSnapshot = currentEntry.actor.snapshot() as AnyFlowSnapshot;
      const nextStatus = childStatusForActor(currentEntry.actor);
      const nextChild = childSnapshotForDefinition(
        definition,
        currentChild.parentState ?? snapshot.value,
        actorId,
        String(childActorSnapshot.value),
        nextStatus,
        childActorSnapshot,
      );
      const nextChildIssues =
        childIssue === undefined
          ? clearIssue(issues, "child", definition.id)
          : replaceIssue(issues, {
              kind: childIssue.kind,
              source: "child",
              id: definition.id,
              error: childIssue.error,
              cause: childIssue.cause,
            });
      const receiptType =
        nextStatus === "success"
          ? "child:success"
          : childIssue?.kind === "interrupt"
            ? "child:interrupt"
            : childIssue?.kind === "defect"
              ? "child:defect"
              : childIssue?.kind === "failure"
                ? "child:failure"
                : undefined;
      replaceIssues(nextChildIssues);
      if (nextStatus === "success") {
        ownedChildren.delete(definition.id);
        currentEntry.unsubscribe();
        const { [definition.id]: _removedChild, ...remainingChildren } = snapshot.children;
        replaceSnapshot(
          Object.freeze({
            ...snapshot,
            children: remainingChildren,
            receipts:
              receiptType !== undefined && currentChild.status !== nextStatus
                ? [
                    ...snapshot.receipts,
                    {
                      type: receiptType,
                      id: definition.id,
                      actorId,
                      parentState: currentChild.parentState ?? snapshot.value,
                    } satisfies FlowReceipt,
                  ]
                : snapshot.receipts,
          }),
          true,
        );
        void currentEntry.actor.dispose();
        return;
      }

      replaceSnapshot(
        Object.freeze({
          ...snapshot,
          children: {
            ...snapshot.children,
            [definition.id]: nextChild,
          },
          receipts:
            receiptType !== undefined && currentChild.status !== nextStatus
              ? [
                  ...snapshot.receipts,
                  {
                    type: receiptType,
                    id: definition.id,
                    actorId,
                    parentState: currentChild.parentState ?? snapshot.value,
                  } satisfies FlowReceipt,
                ]
              : snapshot.receipts,
        }),
        true,
      );
    });

    nextEntry = {
      actorId,
      actor: ownedActor as unknown as AnyFlowActor,
      definition,
      unsubscribe,
    };
    ownedChildren.set(definition.id, nextEntry);
    return nextEntry;
  };

  const startStateOwnedChildren = (
    current: SnapshotForMachine<Machine>,
  ): SnapshotForMachine<Machine> => {
    const definitions = childInvokesForState(current);
    if (definitions.length === 0) {
      return current;
    }

    const nextChildren: Record<string, FlowChildSnapshot> = {
      ...current.children,
    };
    const nextReceipts = [...current.receipts];

    for (const definition of definitions) {
      let entry = ownedChildren.get(definition.id);
      if (entry === undefined) {
        const ownedActorId = childActorId(id, definition.id);
        entry = attachOwnedChild(definition, ownedActorId);
        nextReceipts.push({
          type: "child:start",
          id: definition.id,
          actorId: ownedActorId,
          parentState: current.value,
        });
      }
      const ensuredEntry = entry;
      if (ensuredEntry === undefined) {
        throw new Error(`Missing owned child actor for ${definition.id}`);
      }

      const nextStatus = childStatusForActor(ensuredEntry.actor);
      if (nextStatus === "success") {
        ownedChildren.delete(definition.id);
        ensuredEntry.unsubscribe();
        nextReceipts.push({
          type: "child:success",
          id: definition.id,
          actorId: ensuredEntry.actorId,
          parentState: current.value,
        });
        void ensuredEntry.actor.dispose();
        continue;
      }

      const childActorSnapshot = ensuredEntry.actor.snapshot() as AnyFlowSnapshot;
      nextChildren[definition.id] = childSnapshotForDefinition(
        definition,
        current.value,
        ensuredEntry.actorId,
        String(childActorSnapshot.value),
        nextStatus,
        childActorSnapshot,
      );
    }

    return Object.freeze({
      ...current,
      children: nextChildren,
      receipts: nextReceipts,
    });
  };

  const stopStateOwnedChildren = (
    current: SnapshotForMachine<Machine>,
    retainStopped: boolean,
  ): SnapshotForMachine<Machine> => {
    if (ownedChildren.size === 0) {
      return retainStopped || Object.keys(current.children).length === 0
        ? current
        : Object.freeze({
            ...current,
            children: {},
          });
    }

    const nextChildren: Record<string, FlowChildSnapshot> = retainStopped
      ? { ...current.children }
      : {};
    const nextReceipts = [...current.receipts];
    let nextIssues = issues;

    for (const [definitionId, entry] of Array.from(ownedChildren.entries())) {
      const priorChild =
        current.children[definitionId] ??
        childSnapshotForDefinition(entry.definition, current.value, entry.actorId);

      ownedChildren.delete(definitionId);
      entry.unsubscribe();
      void entry.actor.dispose();
      nextIssues = clearIssue(nextIssues, "child", definitionId);
      nextReceipts.push({
        type: "child:stop",
        id: definitionId,
        actorId: entry.actorId,
        parentState: priorChild.parentState ?? current.value,
      });

      if (retainStopped) {
        nextChildren[definitionId] = Object.freeze({
          ...priorChild,
          status: "stopped" as const,
        });
      }
    }

    replaceIssues(nextIssues);
    return Object.freeze({
      ...current,
      children: nextChildren,
      receipts: nextReceipts,
    });
  };

  const rehydrateStateOwnedChildren = (current: SnapshotForMachine<Machine>) => {
    for (const definition of childInvokesForState(current)) {
      const child = current.children[definition.id];
      if (child?.status !== "active" || ownedChildren.has(definition.id)) {
        continue;
      }

      attachOwnedChild(
        definition,
        child.actorId ?? childActorId(id, definition.id),
        restoreChildActorSnapshot(definition, child),
      );
    }
  };

  const reconcileStateOwnedWork = (
    previous: SnapshotForMachine<Machine>,
    next: SnapshotForMachine<Machine>,
    reentered: boolean,
  ): SnapshotForMachine<Machine> => {
    if (previous.value === next.value && !reentered) {
      return next;
    }

    return startStateOwnedChildren(
      startStateOwnedStreams(
        startStateOwnedAfters(
          startStateOwnedTransactions(
            startStateOwnedResourceCommands(
              startStateOwnedQueries(
                stopStateOwnedChildren(
                  stopStateOwnedStreams(
                    stopStateOwnedAfters(
                      transactionController.interrupt(
                        stopStateOwnedQueries(next),
                        "state-owned",
                        previous.value,
                      ),
                    ),
                    previous.value,
                    true,
                  ),
                  false,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  };

  const activateStateOwnedWork = () => {
    replaceSnapshot(
      startStateOwnedChildren(
        startStateOwnedStreams(
          startStateOwnedAfters(
            startStateOwnedTransactions(
              startStateOwnedResourceCommands(startStateOwnedQueries(snapshot)),
            ),
          ),
        ),
      ),
    );
  };

  const actor: ActorForMachine<Machine> = {
    id,
    machine: typedMachine,
    subscribe: (listener) => {
      if (disposed) {
        return () => undefined;
      }

      const wasDetached = listeners.size === 0;
      const listenerId = nextListenerId++;
      listeners.set(listenerId, listener);
      if (wasDetached) {
        appendReceipt({ type: "actor:subscribe", id });
      }

      let active = true;
      return () => {
        if (!active) {
          return;
        }

        active = false;
        listeners.delete(listenerId);
        if (!disposed && listeners.size === 0) {
          appendReceipt({ type: "actor:unsubscribe", id });
        }
      };
    },
    getSnapshot: () => snapshot,
    snapshot: () => snapshot,
    send: (event) => {
      if (disposed) {
        return actor;
      }

      dispatchMachineEvent(event);
      return actor;
    },
    flush: async () => {
      await flushReadyWork(actor);
      for (const entry of Array.from(ownedChildren.values())) {
        await entry.actor.flush();
      }
    },
    children: () => snapshot.children,
    receipts: () => snapshot.receipts,
    issues: () => issues,
    retryChild: (childId) => {
      if (disposed) {
        return false;
      }

      const entry = ownedChildren.get(childId);
      const child = snapshot.children[childId];
      if (entry === undefined || child?.status !== "failure") {
        return false;
      }

      ownedChildren.delete(childId);
      entry.unsubscribe();
      void entry.actor.dispose();
      replaceIssues(clearIssue(issues, "child", childId));
      replaceSnapshot(
        startStateOwnedChildren(
          Object.freeze({
            ...snapshot,
            receipts: [
              ...snapshot.receipts,
              {
                type: "child:retry",
                id: childId,
                actorId: entry.actorId,
                parentState: child.parentState ?? snapshot.value,
              } satisfies FlowReceipt,
            ],
          }),
        ),
        true,
      );
      return true;
    },
    retryTransaction: (transactionId) => {
      if (disposed) {
        return false;
      }

      const nextSnapshot = transactionController.retry(transactionId);
      if (nextSnapshot === undefined) {
        return false;
      }

      replaceSnapshot(nextSnapshot, true);
      return true;
    },
    resetTransaction: (transactionId) => {
      if (disposed) {
        return false;
      }

      const transaction = snapshot.transactions[transactionId];
      if (
        transaction === undefined ||
        transaction.status === "idle" ||
        transaction.status === "pending"
      ) {
        return false;
      }

      replaceIssues(clearIssue(issues, "transaction", transactionId));
      replaceSnapshot(
        Object.freeze({
          ...snapshot,
          transactions: {
            ...snapshot.transactions,
            [transactionId]: {
              id: transactionId,
              status: "idle",
            } satisfies FlowTransactionSnapshot,
          },
          receipts: [
            ...snapshot.receipts,
            {
              type: "transaction:reset",
              id: transactionId,
              parentState: snapshot.value,
            } satisfies FlowReceipt,
          ],
        }) as SnapshotForMachine<Machine>,
        true,
      );
      return true;
    },
    dispose: async () => {
      if (disposed) {
        return;
      }

      disposed = true;
      const stoppedChildrenSnapshot = stopStateOwnedChildren(
        stopStateOwnedStreams(
          stopStateOwnedAfters(
            transactionController.interrupt(stopStateOwnedQueries(snapshot), "all"),
          ),
          snapshot.value,
        ),
        true,
      );
      replaceSnapshot(
        Object.freeze({
          ...stoppedChildrenSnapshot,
          receipts: [
            ...stoppedChildrenSnapshot.receipts,
            { type: "actor:dispose", id } satisfies FlowReceipt,
          ],
        }),
      );
      onDispose?.();
      notifyListeners();
      listeners.clear();
    },
  };

  if (initialSnapshot === undefined) {
    appendReceipt({ type: "actor:start", id });
    activateStateOwnedWork();
  } else {
    rehydrateStateOwnedChildren(snapshot);
  }

  return actor;
}

export class OrchestratorSystem extends Context.Service<
  OrchestratorSystem,
  {
    readonly start: <Machine extends FlowMachine>(
      machine: Machine,
      options?: ActorStartOptions<Machine>,
    ) => Effect.Effect<
      FlowActor<
        InferMachineContext<Machine>,
        InferMachineEvent<Machine>,
        InferMachineState<Machine>
      >
    >;
    readonly get: (id: string) => Effect.Effect<FlowActor | null>;
    readonly stop: (id: string) => Effect.Effect<void>;
    readonly stopAll: Effect.Effect<void>;
  }
>()("@flow-state/core/OrchestratorSystem") {
  static readonly layer = Layer.effect(
    OrchestratorSystem,
    Effect.gen(function* () {
      const registry = yield* Effect.acquireRelease(
        Effect.sync(() => new Map<string, AnyFlowActor>()),
        (actors) =>
          Effect.gen(function* () {
            for (const actor of Array.from(actors.values())) {
              yield* Effect.promise(() => actor.dispose());
            }
            actors.clear();
          }),
      );

      const trace = yield* TraceLog;
      const appOwnership = Option.getOrUndefined(yield* Effect.serviceOption(FlowAppOwnership));
      const resourceStore = yield* ResourceStore;
      const runtimeContext = yield* Effect.context<any>();
      const appendTrace = (receipt: FlowReceipt) => {
        Effect.runSync(trace.append(receipt));
      };

      const createRegisteredActor = <Machine extends FlowMachine>(
        machine: Machine,
        actorId: string,
        options?: ActorStartOptions<Machine>,
        onActorDispose?: () => void,
      ): ActorForMachine<Machine> => {
        if (registry.has(actorId)) {
          throw new Error(`Actor with id '${actorId}' already exists`);
        }

        const actor = createContractActor(
          machine,
          actorId,
          (childMachine, childActorId, onChildDispose) =>
            createRegisteredActor(childMachine, childActorId, undefined, onChildDispose),
          resourceStore,
          runtimeContext,
          () => {
            registry.delete(actorId);
            onActorDispose?.();
          },
          appendTrace,
          options?.snapshot as SnapshotForMachine<Machine> | undefined,
        );
        registry.set(actor.id, actor as unknown as AnyFlowActor);
        return actor;
      };

      const start = Effect.fn("OrchestratorSystem.start")(
        <Machine extends FlowMachine>(machine: Machine, options?: ActorStartOptions<Machine>) =>
          Effect.sync(() => {
            const actorId = options?.id ?? appOwnership?.actorIdFor(machine) ?? machine.id;
            const existingActor = registry.get(actorId);
            if (canReuseKeepAliveActor(existingActor, machine, options)) {
              // Reattachment is keyed by the stable actor id plus machine id; the
              // generic actor shape is re-established from the caller's machine contract.
              return existingActor as unknown as ActorForMachine<Machine>;
            }

            return createRegisteredActor(machine, actorId, options);
          }),
      );

      const get = Effect.fn("OrchestratorSystem.get")((id: string) =>
        Effect.sync(() => registry.get(id) ?? null),
      );

      const stop = Effect.fn("OrchestratorSystem.stop")(function* (id: string) {
        const actor = registry.get(id);
        if (actor === undefined) {
          return;
        }

        yield* Effect.promise(() => actor.dispose());
      });

      const stopAll = Effect.fn("OrchestratorSystem.stopAll")(function* () {
        for (const actor of Array.from(registry.values())) {
          yield* Effect.promise(() => actor.dispose());
        }
        registry.clear();
      })();

      return OrchestratorSystem.of({
        start,
        get,
        stop,
        stopAll,
      });
    }),
  );
}
