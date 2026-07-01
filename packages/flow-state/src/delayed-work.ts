import { Clock, Effect, Exit } from "effect";
import * as Duration from "effect/Duration";

import type { FlowTimerSnapshot } from "./core/api/types.js";

type DelayEffectRunner = (
  effect: Effect.Effect<void, never, never>,
  onExit?: (exit: Exit.Exit<void, unknown>) => void,
) => (interruptor?: number) => void;

export type DelayedWorkPlan = Readonly<{
  readonly startedAt: number;
  readonly dueAt: number;
  readonly run: (
    runEffect: DelayEffectRunner,
    onExit: (exit: Exit.Exit<void, unknown>) => void,
  ) => (interruptor?: number) => void;
}>;

export function createDelayedWorkPlan(delay: Duration.Input, now: () => number): DelayedWorkPlan {
  const startedAt = now();
  const dueAt = startedAt + Duration.toMillis(Duration.fromInputUnsafe(delay));
  return Object.freeze({
    startedAt,
    dueAt,
    run: (runEffect, onExit) => runEffect(Effect.sleep(delay), onExit),
  });
}

export function createRestoredDelayedWorkPlan(startedAt: number, dueAt: number): DelayedWorkPlan {
  return Object.freeze({
    startedAt,
    dueAt,
    run: (runEffect, onExit) =>
      runEffect(
        Effect.flatMap(Clock.currentTimeMillis, (now) =>
          Effect.sleep(Duration.millis(Math.max(0, dueAt - now))),
        ),
        onExit,
      ),
  });
}

export function seedDelayedWorkGenerations(
  snapshots: Readonly<Record<string, FlowTimerSnapshot>>,
  generations: Map<string, number>,
): void {
  for (const snapshot of Object.values(snapshots)) {
    generations.set(snapshot.id, Math.max(generations.get(snapshot.id) ?? 0, snapshot.generation));
  }
}
