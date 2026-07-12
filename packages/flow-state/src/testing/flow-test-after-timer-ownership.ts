import { type Effect, Exit } from "effect";

import { createDelayedWorkPlan } from "../core/scheduling/delayed-work.js";
import type {
  FlowAfterDefinition,
  FlowEvent,
  FlowReceipt,
  FlowSnapshot,
  FlowTimerSnapshot,
} from "../core/api/types.js";
import {
  type StreamTimerInterruptReason,
  timerOutcomeReceiptFacts,
  timerScheduleReceiptFacts,
} from "../core/orchestrator/stream-timer-inspection-facts.js";
import type { OwnedEffectHandle } from "../core/runtime/owned-effect-runner.js";

type HarnessSnapshot<Context, Event extends FlowEvent, State extends string> = FlowSnapshot<
  Context,
  State,
  Event
>;

type AnyAfterDefinition<
  Context,
  Event extends FlowEvent,
  State extends string,
> = FlowAfterDefinition<State, Context, Event>;

type FlowTestEffectRunner = (
  effect: Effect.Effect<void, never, never>,
  onExit?: (exit: Exit.Exit<void, unknown>) => void,
) => OwnedEffectHandle;

type ActiveHarnessAfter<State extends string> = Readonly<{
  readonly generation: number;
  readonly parentState: State;
  readonly restored: boolean;
  readonly startedAt: number;
  readonly dueAt: number;
  readonly correlationId: string | undefined;
  readonly interrupt: () => void;
}>;

type MutableActiveHarnessAfter<State extends string> = Omit<
  ActiveHarnessAfter<State>,
  "interrupt"
> & {
  interrupt: () => void;
};

type FlowTestAfterTimerOwnershipDeps<
  Context,
  Event extends FlowEvent,
  State extends string,
> = Readonly<{
  readonly currentSnapshot: () => HarnessSnapshot<Context, Event, State>;
  readonly replaceSnapshot: (next: HarnessSnapshot<Context, Event, State>) => void;
  readonly materializeSnapshot: (
    base: HarnessSnapshot<Context, Event, State>,
  ) => HarnessSnapshot<Context, Event, State>;
  readonly currentTimerSnapshots: () => Readonly<Record<string, FlowTimerSnapshot>>;
  readonly replaceTimerSnapshots: (next: Readonly<Record<string, FlowTimerSnapshot>>) => void;
  readonly appendReceipt: (
    current: HarnessSnapshot<Context, Event, State>,
    receipt: FlowReceipt,
  ) => HarnessSnapshot<Context, Event, State>;
  readonly afterInvokesForState: (
    snapshot: HarnessSnapshot<Context, Event, State>,
  ) => ReadonlyArray<AnyAfterDefinition<Context, Event, State>>;
  readonly enqueue: (work: () => void) => void;
  readonly currentCorrelationId: () => string | undefined;
  readonly withInspectionCorrelation: <Value>(
    correlationId: string | undefined,
    work: () => Value,
  ) => Value;
  readonly now: () => number;
  readonly runEffect: FlowTestEffectRunner;
  readonly applyAfterTransition: (
    current: HarnessSnapshot<Context, Event, State>,
    definition: AnyAfterDefinition<Context, Event, State>,
  ) => Readonly<{
    readonly snapshot: HarnessSnapshot<Context, Event, State>;
    readonly reentered: boolean;
  }>;
  readonly finalizeAppliedTransition: (
    current: HarnessSnapshot<Context, Event, State>,
    applied: Readonly<{
      readonly snapshot: HarnessSnapshot<Context, Event, State>;
      readonly reentered: boolean;
    }>,
  ) => HarnessSnapshot<Context, Event, State>;
}>;

function replaceTimerSnapshot(
  timers: Readonly<Record<string, FlowTimerSnapshot>>,
  id: string,
  snapshotForId: FlowTimerSnapshot,
): Readonly<Record<string, FlowTimerSnapshot>> {
  return Object.freeze({
    ...timers,
    [id]: snapshotForId,
  });
}

export function createFlowTestAfterTimerOwnership<
  Context,
  Event extends FlowEvent,
  State extends string,
>(deps: FlowTestAfterTimerOwnershipDeps<Context, Event, State>) {
  const activeAfters = new Map<string, MutableActiveHarnessAfter<State>>();
  const timerGenerations = new Map<string, number>();

  const startStateOwnedAfters = (
    current: HarnessSnapshot<Context, Event, State>,
  ): HarnessSnapshot<Context, Event, State> => {
    const definitions = deps.afterInvokesForState(current);
    if (definitions.length === 0) {
      return current;
    }

    let next = current;

    for (const definition of definitions) {
      if (activeAfters.has(definition.id)) {
        continue;
      }

      const plan = createDelayedWorkPlan(definition.config.delay, deps.now);
      const generation = (timerGenerations.get(definition.id) ?? 0) + 1;
      timerGenerations.set(definition.id, generation);
      deps.replaceTimerSnapshots(
        replaceTimerSnapshot(deps.currentTimerSnapshots(), definition.id, {
          id: definition.id,
          status: "scheduled",
          generation,
          parentState: current.value,
          startedAt: plan.startedAt,
          dueAt: plan.dueAt,
        }),
      );
      next = deps.appendReceipt(next, {
        type: "timer:start",
        id: definition.id,
        generation,
        parentState: current.value,
        ...timerScheduleReceiptFacts(plan.startedAt, plan.dueAt, false),
      });

      const entry: MutableActiveHarnessAfter<State> = {
        generation,
        parentState: current.value,
        restored: false,
        startedAt: plan.startedAt,
        dueAt: plan.dueAt,
        correlationId: deps.currentCorrelationId(),
        interrupt: () => {},
      };
      activeAfters.set(definition.id, entry);
      entry.interrupt = plan.run(deps.runEffect, (exit) => {
        deps.enqueue(() => {
          const active = activeAfters.get(definition.id);
          if (active === undefined || active !== entry || !Exit.isSuccess(exit)) {
            return;
          }

          deps.withInspectionCorrelation(entry.correlationId, () => {
            activeAfters.delete(definition.id);
            const endedAt = deps.now();
            deps.replaceTimerSnapshots(
              replaceTimerSnapshot(deps.currentTimerSnapshots(), definition.id, {
                id: definition.id,
                status: "fired",
                generation,
                parentState: entry.parentState,
                startedAt: entry.startedAt,
                dueAt: entry.dueAt,
                endedAt,
              }),
            );
            const currentSnapshot = deps.appendReceipt(deps.currentSnapshot(), {
              type: "timer:fire",
              id: definition.id,
              generation,
              parentState: entry.parentState,
              ...timerOutcomeReceiptFacts(entry.startedAt, entry.dueAt, endedAt, entry.restored),
            });
            const applied = deps.applyAfterTransition(currentSnapshot, definition);
            deps.replaceSnapshot(deps.finalizeAppliedTransition(currentSnapshot, applied));
          });
        });
      });
    }

    return deps.materializeSnapshot(next);
  };

  const stopStateOwnedAfters = (
    current: HarnessSnapshot<Context, Event, State>,
    interruptReason: StreamTimerInterruptReason = "dispose",
  ): HarnessSnapshot<Context, Event, State> => {
    if (activeAfters.size === 0) {
      return current;
    }

    let next = current;

    for (const [afterId, active] of Array.from(activeAfters.entries())) {
      activeAfters.delete(afterId);
      active.interrupt();
      const endedAt = deps.now();
      deps.replaceTimerSnapshots(
        replaceTimerSnapshot(deps.currentTimerSnapshots(), afterId, {
          id: afterId,
          status: "interrupt",
          generation: active.generation,
          parentState: active.parentState,
          startedAt: active.startedAt,
          dueAt: active.dueAt,
          endedAt,
        }),
      );
      next = deps.appendReceipt(next, {
        type: "timer:interrupt",
        id: afterId,
        generation: active.generation,
        parentState: active.parentState,
        interruptReason,
        ...timerOutcomeReceiptFacts(active.startedAt, active.dueAt, endedAt, active.restored),
      });
    }

    return deps.materializeSnapshot(next);
  };

  return Object.freeze({
    activeAfterEntries: () =>
      Array.from(activeAfters.entries()).map(([id, entry]) => ({
        id,
        dueAt: entry.dueAt,
        parentState: entry.parentState,
      })),
    startStateOwnedAfters,
    stopStateOwnedAfters,
  });
}
