import type {
  AnyFlowMachine,
  FlowEvent,
  FlowMachine,
  FlowMachineStateNode,
  FlowSnapshot,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "../api/types.js";

export type FlowMachineFamily<Machine extends AnyFlowMachine> = FlowMachine<
  InferMachineContext<Machine>,
  InferMachineEvent<Machine>,
  InferMachineState<Machine>
>;

/**
 * Recovers the authored callback family carried by FlowMachine's private type marker.
 * The runtime value is unchanged; this module is the sole owner of bridges from
 * non-recursive inventory and snapshot projections back to definitions created by
 * flow.machine. Public authored and packed callback families remain exact.
 */
export function recoverMachineFamily<Machine extends AnyFlowMachine>(
  machine: Machine,
): FlowMachineFamily<Machine> & Machine {
  return machine as FlowMachineFamily<Machine> & Machine;
}

export function recoverSnapshotStateNode<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  state: State,
): FlowMachineStateNode<Context, Event, State> | undefined {
  return snapshot.machine.config.states[state] as
    | FlowMachineStateNode<Context, Event, State>
    | undefined;
}

export function initialSnapshotForMachine<Machine extends AnyFlowMachine>(
  machine: Machine,
): FlowSnapshot<
  InferMachineContext<Machine>,
  InferMachineState<Machine>,
  InferMachineEvent<Machine>
> {
  return recoverMachineFamily(machine).getInitialSnapshot();
}
