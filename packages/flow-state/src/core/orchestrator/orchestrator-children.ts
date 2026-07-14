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
  FlowActor,
  FlowChildDefinition,
  FlowChildSnapshot,
  FlowIssue,
  FlowMachine,
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

type ActorLifecycleEffects = Readonly<{
  readonly flushEffect: Effect.Effect<void>;
  readonly disposeEffect: Effect.Effect<void>;
}>;

type RegisteredFlowActor = OrchestratorActorHandle &
  Pick<SelectionSource<unknown>, "subscribe"> &
  ActorLifecycleEffects;

type RegisteredActorForMachine<Machine extends FlowMachine> = FlowActor<
  InferMachineContext<Machine>,
  InferMachineEvent<Machine>,
  InferMachineState<Machine>
> &
  ActorLifecycleEffects;

type SnapshotForMachine<Machine extends FlowMachine> = FlowSnapshot<
  InferMachineContext<Machine>,
  InferMachineState<Machine>,
  InferMachineEvent<Machine>
>;

type OwnedChildEntry = Readonly<{
  readonly actorId: string;
  readonly actor: RegisteredFlowActor;
  readonly definition: FlowChildDefinition;
  readonly correlationId: string | undefined;
  readonly unsubscribe: () => void;
}>;

type OwnedChildControllerDeps<Machine extends FlowMachine> = Readonly<{
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
  readonly createOwnedActor: <ChildMachine extends FlowMachine>(
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
  readonly runDisposeEffect: (actor: RegisteredFlowActor) => Promise<void>;
}>;

export function createOwnedChildController<Machine extends FlowMachine>(
  deps: OwnedChildControllerDeps<Machine>,
) {
  const ownedChildren = new Map<string, OwnedChildEntry>();

  const attachOwnedChild = <ChildMachine extends FlowMachine>(
    definition: FlowChildDefinition<ChildMachine>,
    actorId: string,
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
          childSnapshotForDefinition(definition, snapshot.value, actorId);
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
          void deps.runDisposeEffect(currentEntry.actor);
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
      actor: ownedActor,
      definition,
      correlationId,
      unsubscribe,
    };
    ownedChildren.set(definition.id, nextEntry);
    return nextEntry;
  };

  const startStateOwnedChildren = (
    current: SnapshotForMachine<Machine>,
    spawnReason: ChildLifecycleSpawnReason = "state-entry",
    generationSeedSnapshotFor?: (
      definition: FlowChildDefinition,
    ) => SnapshotForMachine<FlowMachine> | undefined,
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
      let created = false;
      if (entry === undefined) {
        entry = attachOwnedChild(
          definition,
          childActorId(deps.parentActorId, definition.id),
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
        void deps.runDisposeEffect(ensuredEntry.actor);
        continue;
      }

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
        childSnapshotForDefinition(entry.definition, current.value, entry.actorId);

      ownedChildren.delete(definitionId);
      entry.unsubscribe();
      void deps.runDisposeEffect(entry.actor);
      nextIssues = clearIssue(nextIssues, "child", definitionId);
      nextReceipts.push({
        type: "child:stop",
        id: definitionId,
        ...childStopReceiptFacts(entry.definition, entry.actorId, stopReason, {
          ownerPath: deps.ownerPath,
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
      }
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
    void deps.runDisposeEffect(entry.actor);
    deps.replaceIssues(clearIssue(issues, "child", childId));
    deps.replaceSnapshot(
      startStateOwnedChildren(
        Object.freeze({
          ...snapshot,
          receipts: [
            ...snapshot.receipts,
            {
              type: "child:retry",
              id: childId,
              ...childRetryReceiptFacts(entry.definition, entry.actorId, "manual", {
                ownerPath: deps.ownerPath,
                parentState: child.parentState ?? snapshot.value,
                state: child.state,
                supervision: child.supervision,
              }),
            } satisfies FlowReceipt,
          ],
        }),
        "retry",
        (definition) =>
          definition.id === childId
            ? restoreChildActorSnapshot(entry.definition, child)
            : undefined,
      ),
      true,
    );
    return true;
  };

  return {
    ownedEntries: () => Array.from(ownedChildren.values()),
    startStateOwnedChildren,
    stopStateOwnedChildren,
    rehydrateStateOwnedChildren,
    retryChild,
  };
}
