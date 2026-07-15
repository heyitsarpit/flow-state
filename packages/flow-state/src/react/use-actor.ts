import { useLayoutEffect, useRef, useState } from "react";

import type {
  AnyFlowMachine,
  FlowActor,
  FlowActorStartOptions,
  FlowMachine,
  FlowSnapshot,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "../core/api/types.js";
import {
  materializeActorStartSnapshot,
  toActorSnapshotTree,
} from "../core/orchestrator/orchestrator-helpers.js";
import { useFlowRuntime } from "./use-runtime.js";
import { useSource } from "./use-source.js";

function createActorShell<Machine extends AnyFlowMachine>(
  machine: Machine,
  options?: FlowActorStartOptions<Machine>,
): FlowActor<InferMachineContext<Machine>, InferMachineEvent<Machine>, InferMachineState<Machine>> {
  const snapshot =
    materializeActorStartSnapshot(machine, options?.snapshot) ??
    (machine.getInitialSnapshot() as FlowSnapshot<
      InferMachineContext<Machine>,
      InferMachineState<Machine>,
      InferMachineEvent<Machine>
    >);

  const shell: FlowActor<
    InferMachineContext<Machine>,
    InferMachineEvent<Machine>,
    InferMachineState<Machine>
  > = {
    id: options?.id ?? `react:${machine.id}:shell`,
    machine: machine as FlowMachine<
      InferMachineContext<Machine>,
      InferMachineEvent<Machine>,
      InferMachineState<Machine>
    >,
    send: () => shell,
    getSnapshot: () => snapshot,
    flush: async () => undefined,
    children: () => snapshot.children,
    receipts: () => snapshot.receipts,
    issues: () => [],
    serialize: () => toActorSnapshotTree(snapshot),
    retryChild: () => false,
    retryTransaction: () => false,
    resetTransaction: () => false,
    dispose: async () => undefined,
    subscribe: () => () => undefined,
  };

  return shell;
}

type ActorFor<Machine extends AnyFlowMachine> = FlowActor<
  InferMachineContext<Machine>,
  InferMachineEvent<Machine>,
  InferMachineState<Machine>
>;

type ActorAttachment<Machine extends AnyFlowMachine, Runtime> =
  | Readonly<{
      readonly kind: "ready";
      readonly runtime: Runtime;
      readonly machine: Machine;
      readonly id: string;
      readonly policy: FlowActorStartOptions<Machine>["policy"];
      readonly snapshot: FlowActorStartOptions<Machine>["snapshot"];
      readonly actor: ActorFor<Machine>;
    }>
  | Readonly<{
      readonly kind: "failure";
      readonly runtime: Runtime;
      readonly machine: Machine;
      readonly id: string;
      readonly policy: FlowActorStartOptions<Machine>["policy"];
      readonly snapshot: FlowActorStartOptions<Machine>["snapshot"];
      readonly error: unknown;
    }>;

export function useActor<Machine extends AnyFlowMachine>(
  machine: Machine,
  options?: FlowActorStartOptions<Machine>,
): FlowActor<InferMachineContext<Machine>, InferMachineEvent<Machine>, InferMachineState<Machine>> {
  const runtime = useFlowRuntime();
  const shellId = options?.id ?? machine.id;
  const shell = useRef<Readonly<{
    readonly machine: Machine;
    readonly id: string;
    readonly snapshot: FlowActorStartOptions<Machine>["snapshot"];
    readonly actor: ActorFor<Machine>;
  }> | null>(null);
  const [attachment, setAttachment] = useState<ActorAttachment<Machine, typeof runtime> | null>(
    null,
  );

  if (
    shell.current === null ||
    shell.current.machine !== machine ||
    shell.current.id !== shellId ||
    shell.current.snapshot !== options?.snapshot
  ) {
    shell.current = {
      machine,
      id: shellId,
      snapshot: options?.snapshot,
      actor: createActorShell(machine, options),
    };
  }

  const currentShell = shell.current;
  const currentAttachment =
    attachment?.runtime === runtime &&
    attachment.machine === machine &&
    attachment.id === shellId &&
    attachment.policy === options?.policy &&
    attachment.snapshot === options?.snapshot
      ? attachment
      : null;

  if (currentAttachment?.kind === "failure") {
    throw currentAttachment.error;
  }

  const actorForRender = currentAttachment?.actor ?? currentShell.actor;

  useSource(actorForRender);

  useLayoutEffect(() => {
    let active = true;
    let release: (() => Promise<void>) | undefined;
    const attachPrepared = runtime.orchestrators.attach as typeof runtime.orchestrators.attach &
      (<PreparedMachine extends AnyFlowMachine>(
        preparedMachine: PreparedMachine,
        preparedOptions: FlowActorStartOptions<PreparedMachine>,
        preparedSnapshot: FlowSnapshot<
          InferMachineContext<PreparedMachine>,
          InferMachineState<PreparedMachine>,
          InferMachineEvent<PreparedMachine>
        >,
      ) => Promise<
        Readonly<{
          readonly actor: ActorFor<PreparedMachine>;
          readonly release: () => Promise<void>;
        }>
      >);
    const attach = attachPrepared(
      machine,
      {
        ...options,
        id: shellId,
        policy: "keep-alive",
        snapshot: undefined,
      },
      currentShell.actor.getSnapshot(),
    );

    void attach.then(
      (lease) => {
        if (!active) {
          void lease.release();
          return;
        }

        release = lease.release;
        setAttachment({
          kind: "ready",
          runtime,
          machine,
          id: shellId,
          policy: options?.policy,
          snapshot: options?.snapshot,
          actor: lease.actor,
        });
      },
      (error: unknown) => {
        if (!active) {
          return;
        }

        setAttachment({
          kind: "failure",
          runtime,
          machine,
          id: shellId,
          policy: options?.policy,
          snapshot: options?.snapshot,
          error,
        });
      },
    );

    return () => {
      active = false;
      if (release !== undefined) {
        void release();
      }
    };
  }, [currentShell, machine, options?.id, options?.policy, options?.snapshot, runtime, shellId]);

  return actorForRender;
}
