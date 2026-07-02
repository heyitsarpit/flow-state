import { Effect } from "effect";

import { duplicateFlowActorIdDiagnostic } from "../../shared/diagnostics.js";
import type { FlowInspectionOwner } from "../inspection/inspection-events.js";
import type {
  FlowActor,
  FlowActorStartOptions,
  FlowMachine,
  FlowSnapshot,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "../api/types.js";
import { canReuseKeepAliveActor, materializeActorStartSnapshot } from "./orchestrator-helpers.js";
import type { OrchestratorActorHandle } from "./orchestrator-helpers.js";

type ActorLifecycleEffects = Readonly<{
  readonly flushEffect: Effect.Effect<void>;
  readonly disposeEffect: Effect.Effect<void>;
}>;

type RegisteredActorForMachine<Machine extends FlowMachine> = FlowActor<
  InferMachineContext<Machine>,
  InferMachineEvent<Machine>,
  InferMachineState<Machine>
> &
  ActorLifecycleEffects;
type RegisteredFlowActor = OrchestratorActorHandle & ActorLifecycleEffects;

type ActorStartOptions<Machine extends FlowMachine = FlowMachine> = FlowActorStartOptions<Machine>;
type FlowInspectionOwnerSeed = Omit<FlowInspectionOwner, "actorId">;

type SnapshotForMachine<Machine extends FlowMachine> = FlowSnapshot<
  InferMachineContext<Machine>,
  InferMachineState<Machine>,
  InferMachineEvent<Machine>
>;

type OrchestratorRegistryDeps = Readonly<{
  readonly actorIdFor: <Machine extends FlowMachine>(
    machine: Machine,
    options?: ActorStartOptions<Machine>,
  ) => string;
  readonly inspectionOwnerFor: <Machine extends FlowMachine>(
    machine: Machine,
    actorId: string,
    ownerSeed: FlowInspectionOwnerSeed,
  ) => FlowInspectionOwner;
  readonly createActor: <Machine extends FlowMachine>(
    machine: Machine,
    actorId: string,
    createOwnedActor: <ChildMachine extends FlowMachine>(
      machine: ChildMachine,
      id: string,
      owner: FlowInspectionOwnerSeed,
      onDispose?: () => void,
      initialSnapshot?: SnapshotForMachine<ChildMachine>,
    ) => RegisteredActorForMachine<ChildMachine>,
    inspectionOwner: FlowInspectionOwner,
    onDispose?: () => void,
    initialSnapshot?: SnapshotForMachine<Machine>,
  ) => RegisteredActorForMachine<Machine>;
}>;

export function createOrchestratorRegistry(deps: OrchestratorRegistryDeps) {
  const registry = new Map<string, RegisteredFlowActor>();

  const createRegisteredActor = <Machine extends FlowMachine>(
    machine: Machine,
    actorId: string,
    options?: ActorStartOptions<Machine>,
    onActorDispose?: () => void,
    ownerSeed: FlowInspectionOwnerSeed = {
      rootActorId: actorId,
    },
    initialSnapshotOverride?: SnapshotForMachine<Machine>,
  ): RegisteredActorForMachine<Machine> => {
    if (registry.has(actorId)) {
      throw duplicateFlowActorIdDiagnostic(actorId, machine.id);
    }

    const inspectionOwner = deps.inspectionOwnerFor(machine, actorId, ownerSeed);
    const actor = deps.createActor(
      machine,
      actorId,
      (childMachine, childActorId, childOwnerSeed, onChildDispose, initialChildSnapshot) =>
        createRegisteredActor(
          childMachine,
          childActorId,
          undefined,
          onChildDispose,
          childOwnerSeed,
          initialChildSnapshot,
        ),
      inspectionOwner,
      () => {
        registry.delete(actorId);
        onActorDispose?.();
      },
      initialSnapshotOverride ?? materializeActorStartSnapshot(machine, options?.snapshot),
    );
    registry.set(actor.id, actor);
    return actor;
  };

  const start = Effect.fn("OrchestratorSystem.start")(
    <Machine extends FlowMachine>(machine: Machine, options?: ActorStartOptions<Machine>) =>
      Effect.sync(() => {
        const actorId = deps.actorIdFor(machine, options);
        const existingActor = registry.get(actorId);
        if (canReuseKeepAliveActor(existingActor, machine, options)) {
          // Reattachment is keyed by the stable actor id plus machine id; the
          // generic actor shape is re-established from the caller's machine contract.
          return existingActor as RegisteredActorForMachine<Machine>;
        }

        return createRegisteredActor(machine, actorId, options, undefined, {
          rootActorId: actorId,
        });
      }),
  );

  const get = Effect.fn("OrchestratorSystem.get")((id: string) =>
    Effect.sync(() => (registry.get(id) as FlowActor | undefined) ?? null),
  );

  const stop = Effect.fn("OrchestratorSystem.stop")(function* (id: string) {
    const actor = registry.get(id);
    if (actor === undefined) {
      return;
    }

    yield* actor.disposeEffect;
  });

  const stopAll = Effect.fn("OrchestratorSystem.stopAll")(function* () {
    for (const actor of Array.from(registry.values())) {
      yield* actor.disposeEffect;
    }
    registry.clear();
  })();

  return {
    start,
    get,
    stop,
    stopAll,
  };
}
