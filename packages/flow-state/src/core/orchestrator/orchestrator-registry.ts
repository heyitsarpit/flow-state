import { Cause, Effect, Exit } from "effect";

import {
  duplicateFlowActorIdDiagnostic,
  invalidPrevalidatedTimerRestoreDiagnostic,
  invalidPrevalidatedTransactionRestoreDiagnostic,
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
import {
  afterInvokesForState,
  canReuseKeepAliveActor,
  materializeActorStartSnapshot,
  transactionInvokesForMachine,
  transactionInvokesForState,
} from "./orchestrator-helpers.js";
import type { OrchestratorActorHandle } from "./orchestrator-helpers.js";
import type { FlowMachineOwnership } from "./app-ownership.js";

type ActorLifecycleEffects = Readonly<{
  readonly flushEffect: Effect.Effect<void>;
  readonly disposeEffect: Effect.Effect<void>;
}>;

type ActorLeaseEffects = Readonly<{
  readonly releaseSync: Effect.Effect<Effect.Effect<void>>;
}>;

type RegisteredActorForMachine<Machine extends FlowMachine> = FlowActor<
  InferMachineContext<Machine>,
  InferMachineEvent<Machine>,
  InferMachineState<Machine>
> &
  ActorLifecycleEffects;
type RegisteredFlowActor = OrchestratorActorHandle & ActorLifecycleEffects;
export type RegisteredActorLease<Machine extends FlowMachine> = Readonly<{
  readonly actor: RegisteredActorForMachine<Machine>;
}> &
  ActorLeaseEffects;

type ActorStartOptions<Machine extends FlowMachine = FlowMachine> = FlowActorStartOptions<Machine>;
type FlowInspectionOwnerSeed = Omit<FlowInspectionOwner, "actorId">;
type ActorOwnerDomain = string;

type RootActorBinding = Readonly<{
  readonly actorId: string;
  readonly ownerDomain: ActorOwnerDomain;
  readonly machineOwnership?: FlowMachineOwnership;
}>;

type RegisteredActorRecord = {
  readonly actorId: string;
  readonly ownerDomain: ActorOwnerDomain;
  readonly machine: FlowMachine;
  readonly incarnation: number;
  readonly actor: RegisteredFlowActor;
  leaseCount: number;
  releaseEffect: Effect.Effect<void> | undefined;
};

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
    onActorReady?: (actor: RegisteredActorForMachine<Machine>) => void,
  ) => RegisteredActorForMachine<Machine>;
}>;

export function createOrchestratorRegistry(deps: OrchestratorRegistryDeps) {
  const registry = new Map<string, RegisteredActorRecord>();
  let nextIncarnation = 0;
  let closing = false;

  const combineFailureCause = (exits: ReadonlyArray<Exit.Exit<unknown, never>>) => {
    const failureCauses = exits.filter(Exit.isFailure).map((exit) => exit.cause);
    if (failureCauses.length === 0) {
      return undefined;
    }

    return failureCauses.reduce<Cause.Cause<never>>(
      (left, right) => Cause.combine(left, right),
      Cause.empty,
    );
  };

  function validateStartPolicy<Machine extends FlowMachine>(
    machine: Machine,
    options?: ActorStartOptions<Machine>,
  ): void {
    if (closing) {
      throw invalidFlowActorStartDiagnostic({
        reason: "runtime-closing",
        machineId: machine.id,
      });
    }

    if (options?.policy !== undefined && options.policy !== "keep-alive") {
      throw invalidFlowActorStartDiagnostic({
        reason: "unsupported-policy",
        machineId: machine.id,
        policy: String(options.policy),
      });
    }
  }

  function validateRestoredTransactions<Machine extends FlowMachine>(
    machine: Machine,
    snapshot: SnapshotForMachine<Machine>,
  ): void {
    const allowedTransactionIds = Array.from(
      new Set(transactionInvokesForState(snapshot).map(({ transaction }) => transaction.id)),
    ).sort();
    const knownTransactionIds = Array.from(
      new Set(transactionInvokesForMachine(machine).map(({ transaction }) => transaction.id)),
    ).sort();

    for (const [transactionId, transaction] of Object.entries(snapshot.transactions)) {
      if (!knownTransactionIds.includes(transactionId)) {
        throw invalidPrevalidatedTransactionRestoreDiagnostic({
          machineId: machine.id,
          transactionId,
          parentState: String(snapshot.value),
          status: transaction.status,
          reason: "transaction-id-not-in-machine",
          allowedTransactionIds: knownTransactionIds,
        });
      }

      if (transaction.status === "queued") {
        throw invalidPrevalidatedTransactionRestoreDiagnostic({
          machineId: machine.id,
          transactionId,
          parentState: String(snapshot.value),
          status: transaction.status,
          reason: "queued-transaction-restore-not-supported",
          allowedTransactionIds,
        });
      }

      if (transaction.status === "pending") {
        if (!allowedTransactionIds.includes(transactionId)) {
          throw invalidPrevalidatedTransactionRestoreDiagnostic({
            machineId: machine.id,
            transactionId,
            parentState: String(snapshot.value),
            status: transaction.status,
            reason: "pending-transaction-not-in-restored-state",
            allowedTransactionIds,
          });
        }

        const hasStartReceipt = snapshot.receipts.some(
          (receipt) => receipt.type === "transaction:start" && receipt.id === transactionId,
        );
        if (!hasStartReceipt) {
          throw invalidPrevalidatedTransactionRestoreDiagnostic({
            machineId: machine.id,
            transactionId,
            parentState: String(snapshot.value),
            status: transaction.status,
            reason: "pending-transaction-missing-start-receipt",
            allowedTransactionIds,
          });
        }
      }
    }
  }

  function validateRestoredTimers<Machine extends FlowMachine>(
    machine: Machine,
    snapshot: SnapshotForMachine<Machine>,
  ): void {
    const allowedTimerIds = Array.from(
      new Set(afterInvokesForState(snapshot).map((definition) => definition.id)),
    ).sort();

    for (const [timerId, timer] of Object.entries(snapshot.timers)) {
      if (timer.status !== "scheduled") {
        continue;
      }

      if (!allowedTimerIds.includes(timerId)) {
        throw invalidPrevalidatedTimerRestoreDiagnostic({
          machineId: machine.id,
          timerId,
          parentState: timer.parentState,
          status: timer.status,
          startedAt: timer.startedAt,
          dueAt: timer.dueAt,
          reason: "scheduled-timer-not-in-restored-state",
          allowedTimerIds,
        });
      }

      if (timer.dueAt < timer.startedAt) {
        throw invalidPrevalidatedTimerRestoreDiagnostic({
          machineId: machine.id,
          timerId,
          parentState: timer.parentState,
          status: timer.status,
          startedAt: timer.startedAt,
          dueAt: timer.dueAt,
          reason: "scheduled-timer-negative-remaining-duration",
          allowedTimerIds,
        });
      }
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
    const existingRecord = registry.get(actorId);
    if (existingRecord !== undefined) {
      throw duplicateFlowActorIdDiagnostic({
        actorId,
        machineId: machine.id,
        existingOwnerDomain: existingRecord.ownerDomain,
        attemptedOwnerDomain: ownerDomain,
      });
    }
    validateStartPolicy(machine, options);
    const initialSnapshot =
      initialSnapshotOverride ?? materializeActorStartSnapshot(machine, options?.snapshot);
    if (initialSnapshot !== undefined) {
      validateRestoredTransactions(machine, initialSnapshot);
      validateRestoredTimers(machine, initialSnapshot);
    }

    const inspectionOwner = deps.inspectionOwnerFor(machine, actorId, ownerSeed, machineOwnership);
    const incarnation = nextIncarnation++;
    let record: RegisteredActorRecord | undefined;
    const installActorAuthority = (actor: RegisteredActorForMachine<Machine>) => {
      record = {
        actorId,
        ownerDomain,
        machine,
        incarnation,
        actor,
        leaseCount: 0,
        releaseEffect: undefined,
      };
      registry.set(actor.id, record);
    };

    try {
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
          if (record !== undefined && registry.get(actorId) === record) {
            registry.delete(actorId);
          }
          onActorDispose?.();
        },
        initialSnapshot,
        installActorAuthority,
      );

      if (record === undefined) {
        installActorAuthority(actor);
      }

      return actor;
    } catch (error) {
      if (record !== undefined && registry.get(actorId) === record) {
        registry.delete(actorId);
      }
      throw error;
    }
  };

  const disposeRecord = (record: RegisteredActorRecord): Effect.Effect<void> => {
    if (record.releaseEffect !== undefined) {
      return record.releaseEffect;
    }

    record.releaseEffect = record.actor.disposeEffect;
    return record.releaseEffect;
  };

  const releaseRecordLease = (record: RegisteredActorRecord): Effect.Effect<void> => {
    if (record.leaseCount > 0) {
      record.leaseCount -= 1;
    }

    if (record.leaseCount > 0) {
      return Effect.void;
    }

    if (registry.get(record.actorId) !== record) {
      return Effect.void;
    }

    return disposeRecord(record);
  };

  const leaseRecord = <Machine extends FlowMachine>(
    record: RegisteredActorRecord,
  ): RegisteredActorLease<Machine> => {
    let released = false;

    return Object.freeze({
      actor: record.actor as RegisteredActorForMachine<Machine>,
      releaseSync: Effect.sync(() => {
        if (released) {
          return Effect.void;
        }

        released = true;
        return releaseRecordLease(record);
      }),
    });
  };

  const start = Effect.fn("OrchestratorSystem.start")(
    <Machine extends FlowMachine>(machine: Machine, options?: ActorStartOptions<Machine>) =>
      Effect.sync(() => {
        validateStartPolicy(machine, options);
        const binding = deps.rootBindingFor(machine, options);
        const existingRecord = registry.get(binding.actorId);
        if (
          existingRecord !== undefined &&
          existingRecord.releaseEffect === undefined &&
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

  const startWithInitialSnapshot = Effect.fn("OrchestratorSystem.startWithInitialSnapshot")(
    <Machine extends FlowMachine>(
      machine: Machine,
      initialSnapshot: SnapshotForMachine<Machine>,
      options?: Omit<ActorStartOptions<Machine>, "snapshot">,
    ) =>
      Effect.sync(() => {
        validateStartPolicy(machine, options);
        const binding = deps.rootBindingFor(machine, options);
        return createRegisteredActor(
          machine,
          binding.actorId,
          binding.ownerDomain,
          options,
          undefined,
          {
            rootActorId: binding.actorId,
          },
          initialSnapshot,
          binding.machineOwnership,
        );
      }),
  );

  function attachActor<Machine extends FlowMachine>(
    machine: Machine,
    options?: ActorStartOptions<Machine>,
  ): Effect.Effect<RegisteredActorLease<Machine>> {
    return Effect.gen(function* () {
      validateStartPolicy(machine, options);
      const binding = deps.rootBindingFor(machine, options);
      const existingRecord = registry.get(binding.actorId);
      if (
        existingRecord !== undefined &&
        existingRecord.ownerDomain === binding.ownerDomain &&
        canReuseKeepAliveActor(existingRecord.actor, machine, options)
      ) {
        if (existingRecord.releaseEffect !== undefined) {
          yield* existingRecord.releaseEffect;
          return yield* attachActor(machine, options);
        }

        existingRecord.leaseCount += 1;
        return leaseRecord<Machine>(existingRecord);
      }

      const actor = createRegisteredActor(
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
      const record = registry.get(actor.id);
      if (record === undefined) {
        throw duplicateFlowActorIdDiagnostic({
          actorId: binding.actorId,
          machineId: machine.id,
          attemptedOwnerDomain: binding.ownerDomain,
        });
      }

      record.leaseCount += 1;
      return leaseRecord<Machine>(record);
    });
  }

  const attach = Effect.fn("OrchestratorSystem.attach")(attachActor);

  const get = Effect.fn("OrchestratorSystem.get")((id: string) =>
    Effect.sync(() => (registry.get(id)?.actor as FlowActor | undefined) ?? null),
  );

  const stop = Effect.fn("OrchestratorSystem.stop")(function* (id: string) {
    const record = registry.get(id);
    if (record === undefined) {
      return;
    }

    yield* disposeRecord(record);
  });

  const stopAll = Effect.fn("OrchestratorSystem.stopAll")(function* () {
    closing = true;
    const disposeExits = yield* Effect.forEach(Array.from(registry.values()), (record) =>
      Effect.exit(disposeRecord(record)),
    );
    registry.clear();
    const failureCause = combineFailureCause(disposeExits);
    if (failureCause !== undefined) {
      yield* Effect.failCause(failureCause);
    }
  })();

  return {
    start,
    startWithInitialSnapshot,
    attach,
    get,
    stop,
    stopAll,
  };
}
