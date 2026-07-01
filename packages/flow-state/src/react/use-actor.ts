import { useLayoutEffect, useRef, useState } from "react";

import type {
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
} from "../services/orchestrator-helpers.js";
import { useFlowRuntime } from "./use-runtime.js";
import { useSource } from "./use-source.js";

function createActorShell<Machine extends FlowMachine>(
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
    snapshot: () => snapshot,
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

export function useFlowActor<Machine extends FlowMachine>(
  machine: Machine,
  options?: FlowActorStartOptions<Machine>,
): FlowActor<InferMachineContext<Machine>, InferMachineEvent<Machine>, InferMachineState<Machine>> {
  const runtime = useFlowRuntime();
  const shell = useRef<
    FlowActor<InferMachineContext<Machine>, InferMachineEvent<Machine>, InferMachineState<Machine>>
  >(createActorShell(machine, options));
  const shellInputs = useRef<
    Readonly<{
      readonly machine: Machine;
      readonly id: string;
      readonly snapshot: FlowActorStartOptions<Machine>["snapshot"];
    }>
  >({
    machine,
    id: options?.id ?? `react:${machine.id}:shell`,
    snapshot: options?.snapshot,
  });
  const [liveActor, setLiveActor] = useState<Readonly<{
    readonly runtime: typeof runtime;
    readonly id: string;
    readonly snapshot: FlowActorStartOptions<Machine>["snapshot"];
    readonly actor: FlowActor<
      InferMachineContext<Machine>,
      InferMachineEvent<Machine>,
      InferMachineState<Machine>
    >;
  }> | null>(null);

  const shellId = options?.id ?? `react:${machine.id}:shell`;

  if (
    shellInputs.current.machine !== machine ||
    shellInputs.current.id !== shellId ||
    shellInputs.current.snapshot !== options?.snapshot
  ) {
    shell.current = createActorShell(machine, options);
    shellInputs.current = {
      machine,
      id: shellId,
      snapshot: options?.snapshot,
    };
  }

  const activeActor =
    liveActor?.runtime === runtime &&
    liveActor.actor.machine === machine &&
    liveActor.id === shellId &&
    liveActor.snapshot === options?.snapshot
      ? liveActor.actor
      : null;
  const actorForRender = activeActor ?? shell.current;

  useSource(actorForRender);

  useLayoutEffect(() => {
    const actor = runtime.createActor(machine, options);
    setLiveActor({
      runtime,
      id: shellId,
      snapshot: options?.snapshot,
      actor,
    });

    return () => {
      setLiveActor((current) => (current?.actor === actor ? null : current));
      void actor.dispose();
    };
  }, [machine, options?.id, options?.policy, options?.snapshot, runtime]);

  return actorForRender;
}
