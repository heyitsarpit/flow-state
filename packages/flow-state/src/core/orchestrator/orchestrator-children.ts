import { Effect } from "effect";

import {
  type ChildLifecycleSpawnReason,
  type ChildLifecycleStopReason,
  childLifecycleReceiptFacts,
  childRetryReceiptFacts,
  childStartReceiptFacts,
  childStopReceiptFacts,
} from "./child-lifecycle-inspection-facts.js";
import { missingOwnedChildActorBug } from "../../shared/diagnostics.js";
import type {
  AnyFlowMachine,
  FlowActor,
  FlowChildDefinition,
  FlowChildSnapshot,
  FlowIssue,
  FlowReceipt,
  FlowSnapshot,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "../api/types.js";
import { issueFactsFromReceipts } from "../inspection/receipt-summary.js";
import { receiptWithCorrelation } from "../inspection/receipt-correlation.js";
import type { SelectionSource } from "../../shared/contracts.js";
import {
  type OrchestratorActorHandle,
  childActorId,
  childInvokesForState,
  childSnapshotForDefinition,
  childStatusForActor,
  restoreChildActorSnapshot,
} from "./orchestrator-helpers.js";
import { clearIssue, latestIssue, replaceIssue } from "./orchestrator-issues.js";
import type { OwnedEffectHandle, OwnedEffectRunner } from "../runtime/owned-effect-runner.js";

type ActorLifecycleEffects = Readonly<{
  readonly flushEffect: Effect.Effect<void, unknown>;
  readonly disposeEffect: Effect.Effect<void, unknown>;
}>;

type RegisteredFlowActor = OrchestratorActorHandle &
  Pick<SelectionSource<unknown>, "subscribe"> &
  ActorLifecycleEffects;

type RegisteredActorForMachine<Machine extends AnyFlowMachine> = FlowActor<
  InferMachineContext<Machine>,
  InferMachineEvent<Machine>,
  InferMachineState<Machine>
> &
  ActorLifecycleEffects;

type SnapshotForMachine<Machine extends AnyFlowMachine> = FlowSnapshot<
  InferMachineContext<Machine>,
  InferMachineState<Machine>,
  InferMachineEvent<Machine>
>;

type OwnedChildEntry = Readonly<{
  readonly actorId: string;
  readonly generation: number;
  readonly actor: RegisteredFlowActor;
  readonly definition: FlowChildDefinition;
  readonly correlationId: string | undefined;
  readonly unsubscribe: () => void;
}>;

type PendingChildBoundary = {
  readonly actorId: string;
  readonly generation: number;
  readonly spawnReason: ChildLifecycleSpawnReason;
  readonly correlationId: string | undefined;
  readonly generationSeedSnapshot?: SnapshotForMachine<AnyFlowMachine>;
};

type OwnedChildControllerDeps<Machine extends AnyFlowMachine> = Readonly<{
  readonly currentSnapshot: () => SnapshotForMachine<Machine>;
  readonly replaceSnapshot: (
    next: SnapshotForMachine<Machine>,
    notifyListenersAfter?: boolean,
  ) => void;
  readonly currentIssues: () => ReadonlyArray<FlowIssue>;
  readonly replaceIssues: (
    nextIssues: ReadonlyArray<FlowIssue>,
    notifyListenersAfter?: boolean,
  ) => void;
  readonly createOwnedActor: <ChildMachine extends AnyFlowMachine>(
    machine: ChildMachine,
    id: string,
    onDispose?: () => void,
    initialSnapshot?: SnapshotForMachine<ChildMachine>,
    generationSeedSnapshot?: SnapshotForMachine<ChildMachine>,
  ) => RegisteredActorForMachine<ChildMachine>;
  readonly parentActorId: string;
  readonly ownerPath: string | undefined;
  readonly currentCorrelationId: () => string | undefined;
  readonly isDisposed: () => boolean;
  readonly dispatch: (work: () => void) => void;
  readonly runEffect: OwnedEffectRunner;
}>;

export function createOwnedChildController<Machine extends AnyFlowMachine>(
  deps: OwnedChildControllerDeps<Machine>,
) {
  const ownedChildren = new Map<string, OwnedChildEntry>();
  const childGenerations = new Map<string, number>();
  const pendingChildBoundaries = new Map<string, PendingChildBoundary>();
  const pendingChildBoundarySettlements = new Map<string, OwnedEffectHandle>();

  const attachOwnedChild = <ChildMachine extends AnyFlowMachine>(
    definition: FlowChildDefinition<ChildMachine>,
    actorId: string,
    generation: number,
    correlationId?: string,
    initialChildSnapshot?: SnapshotForMachine<ChildMachine>,
    generationSeedSnapshot?: SnapshotForMachine<ChildMachine>,
  ): OwnedChildEntry => {
    let nextEntry: OwnedChildEntry | undefined;
    const ownedActor = deps.createOwnedActor(
      definition.config.machine,
      actorId,
      () => {
        const currentEntry = ownedChildren.get(definition.id);
        if (currentEntry === undefined || currentEntry !== nextEntry || deps.isDisposed()) {
          return;
        }

        const snapshot = deps.currentSnapshot();
        const issues = deps.currentIssues();
        ownedChildren.delete(definition.id);
        deps.replaceIssues(clearIssue(issues, "child", definition.id));
        const priorChild =
          snapshot.children[definition.id] ??
          childSnapshotForDefinition(definition, snapshot.value, actorId, generation);
        const { [definition.id]: _removedChild, ...remainingChildren } = snapshot.children;

        deps.replaceSnapshot(
          Object.freeze({
            ...snapshot,
            children: remainingChildren,
            receipts: [
              ...snapshot.receipts,
              receiptWithCorrelation(
                {
                  type: "child:stop",
                  id: definition.id,
                  ...childStopReceiptFacts(definition, actorId, "child-dispose", {
                    ownerPath: deps.ownerPath,
                    generation: currentEntry.generation,
                    parentState: priorChild.parentState ?? snapshot.value,
                    state: priorChild.state,
                    supervision: priorChild.supervision,
                  }),
                } satisfies FlowReceipt,
                currentEntry.correlationId,
              ),
            ],
          }),
          true,
        );
      },
      initialChildSnapshot,
      generationSeedSnapshot,
    );
    const unsubscribe = ownedActor.subscribe(() => {
      deps.dispatch(() => {
        if (deps.isDisposed()) {
          return;
        }

        const currentEntry = ownedChildren.get(definition.id);
        if (currentEntry === undefined || currentEntry !== nextEntry) {
          return;
        }

        const snapshot = deps.currentSnapshot();
        const issues = deps.currentIssues();
        const currentChild = snapshot.children[definition.id];
        if (currentChild === undefined) {
          return;
        }

        const childIssue = latestIssue(currentEntry.actor.issues());
        const childActorSnapshot = currentEntry.actor.getSnapshot();
        const nextStatus = childStatusForActor(currentEntry.actor);
        const nextChild = childSnapshotForDefinition(
          definition,
          currentChild.parentState ?? snapshot.value,
          actorId,
          currentEntry.generation,
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
                ...(childIssue.handled === undefined ? {} : { handled: childIssue.handled }),
                facts: issueFactsFromReceipts(definition.id, {
                  correlationId: currentEntry.correlationId,
                  parentState: currentChild.parentState ?? snapshot.value,
                  receipts: snapshot.receipts,
                  relatedIds: [actorId, ...(childIssue.facts?.relatedIds ?? [])],
                }),
              });
        const receiptFacts = childLifecycleReceiptFacts(definition, actorId, {
          ownerPath: deps.ownerPath,
          generation: currentEntry.generation,
          parentState: currentChild.parentState ?? snapshot.value,
          state: String(childActorSnapshot.value),
          supervision: nextChild.supervision,
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
        deps.replaceIssues(nextChildIssues);
        if (nextStatus === "success") {
          ownedChildren.delete(definition.id);
          currentEntry.unsubscribe();
          const { [definition.id]: _removedChild, ...remainingChildren } = snapshot.children;
          deps.replaceSnapshot(
            Object.freeze({
              ...snapshot,
              children: remainingChildren,
              receipts:
                receiptType !== undefined && currentChild.status !== nextStatus
                  ? [
                      ...snapshot.receipts,
                      receiptWithCorrelation(
                        {
                          type: receiptType,
                          id: definition.id,
                          ...receiptFacts,
                        } satisfies FlowReceipt,
                        currentEntry.correlationId,
                      ),
                    ]
                  : snapshot.receipts,
            }),
            true,
          );
          deps.runEffect(currentEntry.actor.disposeEffect);
          return;
        }

        deps.replaceSnapshot(
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
                    receiptWithCorrelation(
                      {
                        type: receiptType,
                        id: definition.id,
                        ...receiptFacts,
                      } satisfies FlowReceipt,
                      currentEntry.correlationId,
                    ),
                  ]
                : snapshot.receipts,
          }),
          true,
        );
      });
    });

    nextEntry = {
      actorId,
      generation,
      actor: ownedActor,
      definition,
      correlationId,
      unsubscribe,
    };
    ownedChildren.set(definition.id, nextEntry);
    return nextEntry;
  };

  const dispatchPendingChildBoundarySettlement = (childId: string, actorId: string) => {
    deps.dispatch(() => {
      settlePendingChildBoundary(childId, actorId);
    });
  };

  const awaitPendingChildBoundary = (
    childId: string,
    entry: OwnedChildEntry,
    pending: PendingChildBoundary,
  ) => {
    pendingChildBoundaries.set(childId, pending);
    const settlement = deps.runEffect(
      entry.actor.disposeEffect.pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            dispatchPendingChildBoundarySettlement(childId, entry.actorId);
          }),
        ),
      ),
    );
    pendingChildBoundarySettlements.set(childId, settlement);
  };

  const settlePendingChildBoundary = (childId: string, actorId: string) => {
    if (deps.isDisposed()) {
      return;
    }

    const pending = pendingChildBoundaries.get(childId);
    if (pending === undefined || pending.actorId !== actorId) {
      return;
    }

    pendingChildBoundaries.delete(childId);
    pendingChildBoundarySettlements.delete(childId);
    const current = deps.currentSnapshot();
    const liveDefinition = childInvokesForState(current).find(
      (definition) => definition.id === childId,
    );
    if (liveDefinition === undefined) {
      const { [childId]: _removedChild, ...remainingChildren } = current.children;
      deps.replaceSnapshot(
        Object.freeze({
          ...current,
          children: remainingChildren,
        }),
        true,
      );
      return;
    }

    if (ownedChildren.has(childId)) {
      return;
    }

    const entry = attachOwnedChild(
      liveDefinition,
      pending.actorId,
      pending.generation,
      pending.correlationId,
      undefined,
      pending.generationSeedSnapshot as SnapshotForMachine<typeof liveDefinition.config.machine>,
    );
    const childActorSnapshot = entry.actor.getSnapshot();
    const nextStatus = childStatusForActor(entry.actor);
    const receiptFacts = {
      ownerPath: deps.ownerPath,
      generation: pending.generation,
      parentState: current.value,
      state: String(childActorSnapshot.value),
    } as const;

    if (nextStatus === "success") {
      ownedChildren.delete(childId);
      entry.unsubscribe();
      deps.runEffect(entry.actor.disposeEffect);
      const { [childId]: _removedChild, ...remainingChildren } = current.children;
      deps.replaceSnapshot(
        Object.freeze({
          ...current,
          children: remainingChildren,
          receipts: [
            ...current.receipts,
            {
              type: "child:start",
              id: childId,
              ...childStartReceiptFacts(
                liveDefinition,
                pending.actorId,
                pending.spawnReason,
                receiptFacts,
              ),
            } satisfies FlowReceipt,
            {
              type: "child:success",
              id: childId,
              ...childLifecycleReceiptFacts(liveDefinition, pending.actorId, receiptFacts),
            } satisfies FlowReceipt,
          ],
        }),
        true,
      );
      return;
    }

    deps.replaceSnapshot(
      Object.freeze({
        ...current,
        children: {
          ...current.children,
          [childId]: childSnapshotForDefinition(
            liveDefinition,
            current.value,
            pending.actorId,
            pending.generation,
            String(childActorSnapshot.value),
            nextStatus,
            childActorSnapshot,
          ),
        },
        receipts: [
          ...current.receipts,
          {
            type: "child:start",
            id: childId,
            ...childStartReceiptFacts(
              liveDefinition,
              pending.actorId,
              pending.spawnReason,
              receiptFacts,
            ),
          } satisfies FlowReceipt,
        ],
      }),
      true,
    );
  };

  const startStateOwnedChildren = (
    current: SnapshotForMachine<Machine>,
    spawnReason: ChildLifecycleSpawnReason = "state-entry",
    generationSeedSnapshotFor?: (
      definition: FlowChildDefinition,
    ) => SnapshotForMachine<AnyFlowMachine> | undefined,
  ): SnapshotForMachine<Machine> => {
    const definitions = childInvokesForState(current);
    for (const [childId, child] of Object.entries(current.children)) {
      childGenerations.set(childId, Math.max(childGenerations.get(childId) ?? 0, child.generation));
    }
    if (definitions.length === 0) {
      return current;
    }

    const nextChildren: Record<string, FlowChildSnapshot> = {
      ...current.children,
    };
    const nextReceipts = [...current.receipts];

    for (const definition of definitions) {
      if (pendingChildBoundaries.has(definition.id)) {
        continue;
      }

      let entry = ownedChildren.get(definition.id);
      let created = false;
      if (entry === undefined) {
        const generation = (childGenerations.get(definition.id) ?? 0) + 1;
        childGenerations.set(definition.id, generation);
        entry = attachOwnedChild(
          definition,
          childActorId(deps.parentActorId, definition.id),
          generation,
          deps.currentCorrelationId(),
          undefined,
          generationSeedSnapshotFor?.(definition) as SnapshotForMachine<
            typeof definition.config.machine
          >,
        );
        created = true;
      }
      const ensuredEntry = entry;
      if (ensuredEntry === undefined) {
        throw missingOwnedChildActorBug(definition.id);
      }

      const childActorSnapshot = ensuredEntry.actor.getSnapshot();
      const nextStatus = childStatusForActor(ensuredEntry.actor);
      const receiptFacts = {
        ownerPath: deps.ownerPath,
        generation: ensuredEntry.generation,
        parentState: current.value,
        state: String(childActorSnapshot.value),
      } as const;
      if (created) {
        nextReceipts.push({
          type: "child:start",
          id: definition.id,
          ...childStartReceiptFacts(definition, ensuredEntry.actorId, spawnReason, receiptFacts),
        });
      }
      if (nextStatus === "success") {
        ownedChildren.delete(definition.id);
        ensuredEntry.unsubscribe();
        nextReceipts.push({
          type: "child:success",
          id: definition.id,
          ...childLifecycleReceiptFacts(definition, ensuredEntry.actorId, receiptFacts),
        });
        deps.runEffect(ensuredEntry.actor.disposeEffect);
        continue;
      }

      nextChildren[definition.id] = childSnapshotForDefinition(
        definition,
        current.value,
        ensuredEntry.actorId,
        ensuredEntry.generation,
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
    stopReason: ChildLifecycleStopReason = "state-exit",
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
    let nextIssues = deps.currentIssues();

    for (const [definitionId, entry] of Array.from(ownedChildren.entries())) {
      const priorChild =
        current.children[definitionId] ??
        childSnapshotForDefinition(
          entry.definition,
          current.value,
          entry.actorId,
          entry.generation,
        );

      ownedChildren.delete(definitionId);
      entry.unsubscribe();
      nextIssues = clearIssue(nextIssues, "child", definitionId);
      nextReceipts.push({
        type: "child:stop",
        id: definitionId,
        ...childStopReceiptFacts(entry.definition, entry.actorId, stopReason, {
          ownerPath: deps.ownerPath,
          generation: entry.generation,
          parentState: priorChild.parentState ?? current.value,
          state: priorChild.state,
          supervision: priorChild.supervision,
        }),
      });

      if (retainStopped) {
        nextChildren[definitionId] = Object.freeze({
          ...priorChild,
          status: "stopped" as const,
        });
        continue;
      }

      childGenerations.set(definitionId, entry.generation + 1);
      awaitPendingChildBoundary(definitionId, entry, {
        actorId: entry.actorId,
        generation: entry.generation + 1,
        spawnReason: "state-entry",
        correlationId: deps.currentCorrelationId(),
      });
    }

    deps.replaceIssues(nextIssues);
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
        child.actorId ?? childActorId(deps.parentActorId, definition.id),
        child.generation,
        undefined,
        restoreChildActorSnapshot(definition, child),
      );
    }
  };

  const retryChild = (childId: string): boolean => {
    if (deps.isDisposed()) {
      return false;
    }

    const snapshot = deps.currentSnapshot();
    const issues = deps.currentIssues();
    const entry = ownedChildren.get(childId);
    const child = snapshot.children[childId];
    if (entry === undefined || child?.status !== "failure") {
      return false;
    }

    ownedChildren.delete(childId);
    entry.unsubscribe();
    const retryGenerationSeedSnapshot = restoreChildActorSnapshot(entry.definition, child);
    const retryGeneration = child.generation + 1;
    childGenerations.set(childId, retryGeneration);
    const pendingRetryBoundary: PendingChildBoundary =
      retryGenerationSeedSnapshot === undefined
        ? {
            actorId: entry.actorId,
            generation: retryGeneration,
            spawnReason: "retry",
            correlationId: deps.currentCorrelationId(),
          }
        : {
            actorId: entry.actorId,
            generation: retryGeneration,
            spawnReason: "retry",
            correlationId: deps.currentCorrelationId(),
            generationSeedSnapshot: retryGenerationSeedSnapshot,
          };
    awaitPendingChildBoundary(childId, entry, pendingRetryBoundary);
    deps.replaceIssues(clearIssue(issues, "child", childId));
    deps.replaceSnapshot(
      Object.freeze({
        ...snapshot,
        children: snapshot.children,
        receipts: [
          ...snapshot.receipts,
          {
            type: "child:retry",
            id: childId,
            ...childRetryReceiptFacts(entry.definition, entry.actorId, "manual", {
              ownerPath: deps.ownerPath,
              generation: retryGeneration,
              parentState: child.parentState ?? snapshot.value,
              state: child.state,
              supervision: child.supervision,
            }),
          } satisfies FlowReceipt,
        ],
      }),
      true,
    );
    return true;
  };

  return {
    ownedEntries: () => Array.from(ownedChildren.values()),
    pendingBoundaryEffects: () =>
      Array.from(pendingChildBoundarySettlements.values(), (settlement) => settlement.awaitExit),
    startStateOwnedChildren,
    stopStateOwnedChildren,
    rehydrateStateOwnedChildren,
    retryChild,
  };
}
