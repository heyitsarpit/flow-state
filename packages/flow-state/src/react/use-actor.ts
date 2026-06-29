import { useLayoutEffect, useRef, useState } from "react";

import type {
  FlowActor,
  FlowMachine,
  FlowSnapshot,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "../public/types.js";
import { useFlowRuntime } from "./use-runtime.js";
import { useSource } from "./use-source.js";

function createActorShell<Machine extends FlowMachine>(
  machine: Machine,
): FlowActor<InferMachineContext<Machine>, InferMachineEvent<Machine>, InferMachineState<Machine>> {
  type ActorMachine = FlowActor<
    InferMachineContext<Machine>,
    InferMachineEvent<Machine>,
    InferMachineState<Machine>
  >["machine"];
  let snapshot = machine.getInitialSnapshot() as FlowSnapshot<
    InferMachineContext<Machine>,
    InferMachineState<Machine>,
    InferMachineEvent<Machine>
  >;

  const shell: FlowActor<
    InferMachineContext<Machine>,
    InferMachineEvent<Machine>,
    InferMachineState<Machine>
  > = {
    id: `react:${machine.id}:shell`,
    machine: machine as ActorMachine,
    send: () => shell,
    snapshot: () => snapshot,
    getSnapshot: () => snapshot,
    flush: async () => undefined,
    children: () => snapshot.children,
    receipts: () => snapshot.receipts,
    issues: () => [],
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
): FlowActor<InferMachineContext<Machine>, InferMachineEvent<Machine>, InferMachineState<Machine>> {
  const runtime = useFlowRuntime();
  const shell = useRef<
    FlowActor<InferMachineContext<Machine>, InferMachineEvent<Machine>, InferMachineState<Machine>>
  >(createActorShell(machine));
  const [liveActor, setLiveActor] = useState<Readonly<{
    readonly runtime: typeof runtime;
    readonly actor: FlowActor<
      InferMachineContext<Machine>,
      InferMachineEvent<Machine>,
      InferMachineState<Machine>
    >;
  }> | null>(null);

  if (shell.current.machine !== machine) {
    shell.current = createActorShell(machine);
  }

  const activeActor =
    liveActor?.runtime === runtime && liveActor.actor.machine === machine ? liveActor.actor : null;
  const actorForRender = activeActor ?? shell.current;

  useSource(actorForRender);

  useLayoutEffect(() => {
    const actor = runtime.createActor(machine);
    setLiveActor({
      runtime,
      actor,
    });

    return () => {
      setLiveActor((current) => (current?.actor === actor ? null : current));
      void actor.dispose();
    };
  }, [machine, runtime]);

  return actorForRender;
}
