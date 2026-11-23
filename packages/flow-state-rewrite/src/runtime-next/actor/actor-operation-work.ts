import { Cause, Data, Deferred, Effect, Exit, FiberMap, Option, Result } from "effect";

import { Defect } from "../../diagnostic/diagnostic.js";
import type { PublicDiagnostic } from "../../diagnostic/diagnostic.js";
import type { MachineAction, MachineActivity, MachineDefinition } from "../../machine/grammar.js";
import type { OperationKey } from "../../operation/key.js";
import type { StructuralReadonlyWhenNonempty } from "../structural-copy.js";
import type { OperationOccurrence } from "./actor-activities.js";
import type { OperationLaunch, OperationStop } from "./actor-operation-cut.js";

// FLOW_STATE_ALLOW_UNKNOWN: The Definition-indexed runner carries heterogeneous operation success, failure, and stream values across the private execution boundary.
type OperationValue = unknown;

export type OperationOutcome = Data.TaggedEnum<{
  success: { value: OperationValue };
  failure: { error: OperationValue };
  defect: { diagnostic: PublicDiagnostic };
  interrupt: Record<never, never>;
}>;

export type OperationFact<D extends MachineDefinition> = Data.TaggedEnum<{
  value: { occurrence: OperationOccurrence<D>; value: OperationValue };
  complete: { occurrence: OperationOccurrence<D> };
  terminal: { occurrence: OperationOccurrence<D>; outcome: OperationOutcome };
}>;

const outcomeData = Data.taggedEnum<OperationOutcome>();

/** P07 supplies the Definition's executable adapter and captured service environment. */
export type ActorOwnedActionPlan<D extends MachineDefinition> = StructuralReadonlyWhenNonempty<
  MachineAction<D>,
  never
>;

export type ActorOwnedActivityPlan<D extends MachineDefinition> = StructuralReadonlyWhenNonempty<
  MachineAction<D> | MachineActivity<D>,
  never
>;

export interface ActorOperationRunner<D extends MachineDefinition> {
  runFinite(
    plan: ActorOwnedActionPlan<D>,
    signal: AbortSignal,
    occurrence: OperationOccurrence<D>,
  ): Effect.Effect<OperationValue, OperationValue>;
  runActivity(
    plan: ActorOwnedActivityPlan<D>,
    signal: AbortSignal,
    occurrence: OperationOccurrence<D>,
    emit: (value: OperationValue) => Effect.Effect<void, PublicDiagnostic>,
  ): Effect.Effect<void, OperationValue>;
}

/** Classify the complete Exit before mailbox admission; no raw Cause enters an actor fact. */
// RETURN_TYPE: The outcome must retain the common discriminated union across every Exit branch.
export const operationOutcome = (
  exit: Exit.Exit<OperationValue, OperationValue>,
): OperationOutcome => {
  if (Exit.isSuccess(exit)) return outcomeData.success({ value: exit.value });

  const cause = exit.cause;

  if (Cause.hasDies(cause)) {
    const defect = Cause.findDefect(cause);

    return outcomeData.defect({
      diagnostic: Defect(Result.isSuccess(defect) ? defect.success : "Unclassified defect"),
    });
  }

  if (Cause.hasInterruptsOnly(cause)) return outcomeData.interrupt();

  const failure = Cause.findErrorOption(cause);

  return Option.isSome(failure)
    ? outcomeData.failure({ error: failure.value })
    : outcomeData.defect({ diagnostic: Defect("Unclassifiable operation failure") });
};

/** Finite actions share descriptor/key slots; continuing work also owns its declaration slot. */
export const operationSlotFor = (
  descriptorId: string,
  key: OperationKey,
  activitySlot: Option.Option<string> = Option.none(),
) =>
  Option.isNone(activitySlot)
    ? JSON.stringify([descriptorId, key])
    : JSON.stringify(["activity", descriptorId, activitySlot.value, key]);

export const operationSlot = <D extends MachineDefinition>(occurrence: OperationOccurrence<D>) =>
  operationSlotFor(occurrence.descriptor.id, occurrence.key, occurrence.activitySlot);

/** Start a replacement under a gate; the engine releases it after publication acknowledgement. */
export const startOperationWork = <D extends MachineDefinition>(input: {
  fibers: FiberMap.FiberMap<string, void>;
  runner: ActorOperationRunner<D>;
  plan: MachineAction<D> | MachineActivity<D>;
  continuing: boolean;
  occurrence: OperationOccurrence<D>;
  offer(fact: OperationFact<D>): Effect.Effect<void, PublicDiagnostic>;
}) =>
  Effect.gen(function* () {
    const gate = Deferred.makeUnsafe<void>();
    const abort = new AbortController();
    const factData = Data.taggedEnum<OperationFact<D>>();
    const send = (fact: OperationFact<D>) => input.offer(fact);

    const worker = Deferred.await(gate).pipe(
      Effect.flatMap(() =>
        input.continuing
          ? Effect.exit(
              input.runner.runActivity(input.plan, abort.signal, input.occurrence, (value) =>
                send(factData.value({ occurrence: input.occurrence, value })),
              ),
            ).pipe(
              Effect.flatMap((exit) =>
                Exit.isSuccess(exit)
                  ? send(factData.complete({ occurrence: input.occurrence }))
                  : send(
                      factData.terminal({
                        occurrence: input.occurrence,
                        outcome: operationOutcome(exit),
                      }),
                    ),
              ),
            )
          : Effect.exit(input.runner.runFinite(input.plan, abort.signal, input.occurrence)).pipe(
              Effect.flatMap((exit) =>
                send(
                  factData.terminal({
                    occurrence: input.occurrence,
                    outcome: operationOutcome(exit),
                  }),
                ),
              ),
            ),
      ),
      Effect.onInterrupt(() => Effect.sync(() => abort.abort())),
    );

    yield* FiberMap.run(input.fibers, operationSlot(input.occurrence), {
      startImmediately: true,
      propagateInterruption: true,
    })(worker);

    return gate;
  });

/** The engine supplies its FiberMap and committed launch batch; this helper starts no independent owner. */
export const startOperationLaunches = <D extends MachineDefinition>(input: {
  fibers: FiberMap.FiberMap<string, void>;
  runner: ActorOperationRunner<D>;
  launches: OperationLaunch<D>[];
  offer(fact: OperationFact<D>): Effect.Effect<void, PublicDiagnostic>;
}) =>
  Effect.forEach(
    input.launches,
    (launch) =>
      startOperationWork({
        fibers: input.fibers,
        runner: input.runner,
        plan: launch.plan,
        continuing: launch.continuing,
        occurrence: launch.permit.occurrence,
        offer: (fact) => input.offer(fact),
      }),
    { concurrency: 1 },
  );

/** Remove prior state-local activity fibers before starting replacements. */
export const stopOperationWork = <D extends MachineDefinition>(
  fibers: FiberMap.FiberMap<string, void>,
  stops: OperationStop<D>[],
) =>
  Effect.forEach(
    stops,
    (stop) =>
      FiberMap.remove(
        fibers,
        operationSlotFor(stop.descriptor.id, stop.key, Option.some(stop.activitySlot)),
      ),
    { concurrency: 1, discard: true },
  );

/** Stop superseded activities, then start only continuing launches whose slots remain live after mapped turns. */
export const finishEventOperationWork = <D extends MachineDefinition>(input: {
  fibers: FiberMap.FiberMap<string, void>;
  runner: ActorOperationRunner<D>;
  launches: OperationLaunch<D>[];
  stops: OperationStop<D>[];
  isLive(occurrence: OperationOccurrence<D>): boolean;
  offer(fact: OperationFact<D>): Effect.Effect<void, PublicDiagnostic>;
}) =>
  Effect.gen(function* () {
    yield* stopOperationWork(input.fibers, input.stops);

    const launches = input.launches.filter(
      (launch) => !launch.continuing || input.isLive(launch.permit.occurrence),
    );

    return yield* startOperationLaunches({
      fibers: input.fibers,
      runner: input.runner,
      launches,
      offer: (fact) => input.offer(fact),
    });
  });
