import { Effect } from "effect";

import {
  duplicateFlowActorIdDiagnostic,
  invalidFlowActorStartDiagnostic,
} from "../../shared/diagnostics.js";
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
import type { FlowMachineOwnership } from "./app-ownership.js";

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
type ActorOwnerDomain = string;

type RootActorBinding = Readonly<{
  readonly actorId: string;
  readonly ownerDomain: ActorOwnerDomain;
  readonly machineOwnership?: FlowMachineOwnership;
}>;

type RegisteredActorRecord = Readonly<{
  readonly actorId: string;
  readonly ownerDomain: ActorOwnerDomain;
  readonly machine: FlowMachine;
  readonly incarnation: number;
  readonly actor: RegisteredFlowActor;
}>;

type SnapshotForMachine<Machine extends FlowMachine> = FlowSnapshot<
  InferMachineContext<Machine>,
  InferMachineState<Machine>,
  InferMachineEvent<Machine>
>;

type OrchestratorRegistryDeps = Readonly<{
  readonly rootBindingFor: <Machine extends FlowMachine>(
    machine: Machine,
    options?: ActorStartOptions<Machine>,
  ) => RootActorBinding;
  readonly inspectionOwnerFor: <Machine extends FlowMachine>(
    machine: Machine,
    actorId: string,
    ownerSeed: FlowInspectionOwnerSeed,
    machineOwnership?: FlowMachineOwnership,
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
  const registry = new Map<string, RegisteredActorRecord>();
  let nextIncarnation = 0;

  function validateStartPolicy<Machine extends FlowMachine>(
    machine: Machine,
    options?: ActorStartOptions<Machine>,
  ): void {
    if (options?.policy !== undefined && options.policy !== "keep-alive") {
      throw invalidFlowActorStartDiagnostic({
        reason: "unsupported-policy",
        machineId: machine.id,
        policy: String(options.policy),
      });
    }
  }

  const createRegisteredActor = <Machine extends FlowMachine>(
    machine: Machine,
    actorId: string,
    ownerDomain: ActorOwnerDomain,
    options?: ActorStartOptions<Machine>,
    onActorDispose?: () => void,
    ownerSeed: FlowInspectionOwnerSeed = {
      rootActorId: actorId,
    },
    initialSnapshotOverride?: SnapshotForMachine<Machine>,
    machineOwnership?: FlowMachineOwnership,
  ): RegisteredActorForMachine<Machine> => {
    if (registry.has(actorId)) {
      throw duplicateFlowActorIdDiagnostic(actorId, machine.id);
    }
    validateStartPolicy(machine, options);

    const inspectionOwner = deps.inspectionOwnerFor(machine, actorId, ownerSeed, machineOwnership);
    let record!: RegisteredActorRecord;
    const actor = deps.createActor(
      machine,
      actorId,
      (childMachine, childActorId, childOwnerSeed, onChildDispose, initialChildSnapshot) =>
        createRegisteredActor(
          childMachine,
          childActorId,
          ownerDomain,
          undefined,
          onChildDispose,
          childOwnerSeed,
          initialChildSnapshot,
        ),
      inspectionOwner,
      () => {
        if (registry.get(actorId) === record) {
          registry.delete(actorId);
        }
        onActorDispose?.();
      },
      initialSnapshotOverride ?? materializeActorStartSnapshot(machine, options?.snapshot),
    );
    record = Object.freeze({
      actorId,
      ownerDomain,
      machine,
      incarnation: nextIncarnation++,
      actor,
    });
    registry.set(actor.id, record);
    return actor;
  };

  const start = Effect.fn("OrchestratorSystem.start")(
    <Machine extends FlowMachine>(machine: Machine, options?: ActorStartOptions<Machine>) =>
      Effect.sync(() => {
        validateStartPolicy(machine, options);
        const binding = deps.rootBindingFor(machine, options);
        const existingRecord = registry.get(binding.actorId);
        if (
          existingRecord !== undefined &&
          existingRecord.ownerDomain === binding.ownerDomain &&
          canReuseKeepAliveActor(existingRecord.actor, machine, options)
        ) {
          // Reattachment is keyed by the stable actor id, owner domain, and exact
          // machine definition; the generic actor shape is re-established from
          // the caller's machine contract.
          return existingRecord.actor as RegisteredActorForMachine<Machine>;
        }

        return createRegisteredActor(
          machine,
          binding.actorId,
          binding.ownerDomain,
          options,
          undefined,
          {
            rootActorId: binding.actorId,
          },
          undefined,
          binding.machineOwnership,
        );
      }),
  );

  const get = Effect.fn("OrchestratorSystem.get")((id: string) =>
    Effect.sync(() => (registry.get(id)?.actor as FlowActor | undefined) ?? null),
  );

  const stop = Effect.fn("OrchestratorSystem.stop")(function* (id: string) {
    const record = registry.get(id);
    if (record === undefined) {
      return;
    }

    yield* record.actor.disposeEffect;
  });

  const stopAll = Effect.fn("OrchestratorSystem.stopAll")(function* () {
    for (const record of Array.from(registry.values())) {
      yield* record.actor.disposeEffect;
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
