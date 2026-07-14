import { Effect, Exit } from "effect";

import {
  createDelayedWorkPlan,
  createRestoredDelayedWorkPlan,
  seedDelayedWorkGenerations,
  type DelayedWorkPlan,
} from "../scheduling/delayed-work.js";
import type {
  FlowAfterDefinition,
  FlowEvent,
  FlowMachine,
  FlowSnapshot,
  FlowTimerSnapshot,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "../api/types.js";
import { receiptWithCorrelation } from "../inspection/receipt-correlation.js";
import {
  type StreamTimerInterruptReason,
  timerOutcomeReceiptFacts,
  timerScheduleReceiptFacts,
} from "./stream-timer-inspection-facts.js";
import type { OwnedEffectRunner } from "../runtime/owned-effect-runner.js";

type SnapshotForMachine<Machine extends FlowMachine> = FlowSnapshot<
  InferMachineContext<Machine>,
  InferMachineState<Machine>,
  InferMachineEvent<Machine>
>;

type AnyFlowAfterDefinition = FlowAfterDefinition<string, unknown, FlowEvent>;

type AfterTimerOwnershipDeps<Machine extends FlowMachine> = Readonly<{
  readonly generationSeedSnapshot?: SnapshotForMachine<Machine>;
  readonly currentSnapshot: () => SnapshotForMachine<Machine>;
  readonly replaceSnapshot: (
    next: SnapshotForMachine<Machine>,
    notifyListenersAfter?: boolean,
  ) => void;
  readonly enqueue: (work: () => void) => void;
  readonly currentCorrelationId: () => string | undefined;
  readonly isDisposed: () => boolean;
  readonly now: () => number;
  readonly runEffect: OwnedEffectRunner;
  readonly aftersForState: (
    snapshot: SnapshotForMachine<Machine>,
  ) => ReadonlyArray<AnyFlowAfterDefinition>;
  readonly applyAfterTransition: (
    current: SnapshotForMachine<Machine>,
    definition: AnyFlowAfterDefinition,
    entry: Readonly<{
      readonly generation: number;
      readonly parentState: InferMachineState<Machine>;
      readonly restored: boolean;
      readonly startedAt: number;
      readonly dueAt: number;
      readonly endedAt: number;
      readonly correlationId: string | undefined;
    }>,
  ) => SnapshotForMachine<Machine>;
}>;

type OwnedAfterEntry<Machine extends FlowMachine> = {
  readonly definition: AnyFlowAfterDefinition;
  readonly generation: number;
  readonly parentState: InferMachineState<Machine>;
  readonly restored: boolean;
  readonly startedAt: number;
  readonly dueAt: number;
  readonly correlationId: string | undefined;
  interrupt: (interruptor?: number) => void;
  awaitExit: Effect.Effect<void, unknown>;
};

export function createAfterTimerOwnershipController<Machine extends FlowMachine>(
  deps: AfterTimerOwnershipDeps<Machine>,
) {
  const ownedAfters = new Map<string, OwnedAfterEntry<Machine>>();
  const timerGenerations = new Map<string, number>();
  const interruptedFinalizers: Array<Effect.Effect<void, unknown>> = [];

  if (deps.generationSeedSnapshot !== undefined) {
    seedDelayedWorkGenerations(deps.generationSeedSnapshot.timers ?? {}, timerGenerations);
  }

  const ownAfter = (
    definition: AnyFlowAfterDefinition,
    entry: OwnedAfterEntry<Machine>,
    plan: DelayedWorkPlan,
  ) => {
    ownedAfters.set(definition.id, entry);
    const handle = plan.run(deps.runEffect, (exit) => {
      deps.enqueue(() => {
        if (
          deps.isDisposed() ||
          ownedAfters.get(definition.id) !== entry ||
          !Exit.isSuccess(exit)
        ) {
          return;
        }

        ownedAfters.delete(definition.id);
        const endedAt = deps.now();
        deps.replaceSnapshot(
          deps.applyAfterTransition(deps.currentSnapshot(), definition, {
            generation: entry.generation,
            parentState: entry.parentState,
            restored: entry.restored,
            startedAt: entry.startedAt,
            dueAt: entry.dueAt,
            endedAt,
            correlationId: entry.correlationId,
          }),
          true,
        );
      });
    });
    entry.interrupt = handle;
    entry.awaitExit = handle.awaitExit;
  };

  const startStateOwnedAfters = (
    current: SnapshotForMachine<Machine>,
  ): SnapshotForMachine<Machine> => {
    seedDelayedWorkGenerations(current.timers, timerGenerations);
    const definitions = deps.aftersForState(current);
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
      const plan = createDelayedWorkPlan(definition.config.delay, deps.now);
      const generation = (timerGenerations.get(definition.id) ?? 0) + 1;
      timerGenerations.set(definition.id, generation);
      nextTimers[definition.id] = {
        id: definition.id,
        status: "scheduled",
        generation,
        parentState: current.value,
        startedAt: plan.startedAt,
        dueAt: plan.dueAt,
      };
      nextReceipts.push(
        receiptWithCorrelation(
          {
            type: "timer:start",
            id: definition.id,
            generation,
            parentState: current.value,
            ...timerScheduleReceiptFacts(plan.startedAt, plan.dueAt, false),
          },
          deps.currentCorrelationId(),
        ),
      );

      const entry: OwnedAfterEntry<Machine> = {
        definition,
        generation,
        parentState: current.value,
        restored: false,
        startedAt: plan.startedAt,
        dueAt: plan.dueAt,
        correlationId: deps.currentCorrelationId(),
        interrupt: () => {},
        awaitExit: Effect.void,
      };
      ownAfter(definition, entry, plan);
    }

    return changed
      ? Object.freeze({
          ...current,
          timers: nextTimers,
          receipts: nextReceipts,
        })
      : current;
  };

  const rehydrateStateOwnedAfters = (
    current: SnapshotForMachine<Machine>,
  ): SnapshotForMachine<Machine> => {
    seedDelayedWorkGenerations(current.timers, timerGenerations);
    const nextReceipts = [...current.receipts];
    let changed = false;

    for (const definition of deps.aftersForState(current)) {
      const priorTimer = current.timers[definition.id];
      if (priorTimer?.status !== "scheduled" || ownedAfters.has(definition.id)) {
        continue;
      }

      changed = true;
      const plan = createRestoredDelayedWorkPlan(priorTimer.startedAt, priorTimer.dueAt);
      const entry: OwnedAfterEntry<Machine> = {
        definition,
        generation: priorTimer.generation,
        parentState: priorTimer.parentState as InferMachineState<Machine>,
        restored: true,
        startedAt: priorTimer.startedAt,
        dueAt: priorTimer.dueAt,
        correlationId: undefined,
        interrupt: () => {},
        awaitExit: Effect.void,
      };
      ownAfter(definition, entry, plan);
      nextReceipts.push(
        receiptWithCorrelation(
          {
            type: "timer:resume",
            id: definition.id,
            generation: priorTimer.generation,
            parentState: priorTimer.parentState,
            ...timerScheduleReceiptFacts(priorTimer.startedAt, priorTimer.dueAt, true),
          },
          deps.currentCorrelationId(),
        ),
      );
    }

    return changed
      ? Object.freeze({
          ...current,
          receipts: nextReceipts,
        })
      : current;
  };

  const stopStateOwnedAfters = (
    current: SnapshotForMachine<Machine>,
    ownershipSnapshot: SnapshotForMachine<Machine> = current,
    interruptReason: StreamTimerInterruptReason = "dispose",
  ): SnapshotForMachine<Machine> => {
    const snapshotOnlyAfterIds = deps
      .aftersForState(ownershipSnapshot)
      .map((definition) => definition.id)
      .filter(
        (afterId) => !ownedAfters.has(afterId) && current.timers[afterId]?.status === "scheduled",
      );
    if (ownedAfters.size === 0 && snapshotOnlyAfterIds.length === 0) {
      return current;
    }

    const nextTimers: Record<string, FlowTimerSnapshot> = {
      ...current.timers,
    };
    const nextReceipts = [...current.receipts];

    for (const [afterId, entry] of Array.from(ownedAfters.entries())) {
      ownedAfters.delete(afterId);
      entry.interrupt();
      if (interruptReason === "dispose") {
        interruptedFinalizers.push(entry.awaitExit);
      }
      const endedAt = deps.now();
      nextTimers[afterId] = {
        id: afterId,
        status: "interrupt",
        generation: entry.generation,
        parentState: entry.parentState,
        startedAt: entry.startedAt,
        dueAt: entry.dueAt,
        endedAt,
      };
      nextReceipts.push(
        receiptWithCorrelation(
          {
            type: "timer:interrupt",
            id: afterId,
            generation: entry.generation,
            parentState: entry.parentState,
            interruptReason,
            ...timerOutcomeReceiptFacts(entry.startedAt, entry.dueAt, endedAt, entry.restored),
          },
          deps.currentCorrelationId(),
        ),
      );
    }

    for (const afterId of snapshotOnlyAfterIds) {
      const priorTimer = current.timers[afterId];
      if (priorTimer?.status !== "scheduled") {
        continue;
      }

      const endedAt = deps.now();
      nextTimers[afterId] = {
        ...priorTimer,
        status: "interrupt",
        endedAt,
      };
      nextReceipts.push(
        receiptWithCorrelation(
          {
            type: "timer:interrupt",
            id: afterId,
            ...(priorTimer.generation === undefined ? {} : { generation: priorTimer.generation }),
            parentState: priorTimer.parentState,
            ...(priorTimer.dueAt === undefined || priorTimer.startedAt === undefined
              ? {}
              : timerOutcomeReceiptFacts(priorTimer.startedAt, priorTimer.dueAt, endedAt, true)),
            interruptReason,
          },
          deps.currentCorrelationId(),
        ),
      );
    }

    return Object.freeze({
      ...current,
      timers: nextTimers,
      receipts: nextReceipts,
    });
  };

  return {
    drainInterruptedFinalizers: () => {
      const finalizers = interruptedFinalizers.splice(0);
      return finalizers;
    },
    rehydrateStateOwnedAfters,
    startStateOwnedAfters,
    stopStateOwnedAfters,
  };
}
