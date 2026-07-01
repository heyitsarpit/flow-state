import type { FlowEvent, FlowMachine, FlowMachineConfig, FlowSnapshot } from "../core/api/types.js";
import { machineCallbackThrewDiagnostic } from "../shared/diagnostics.js";

function initialMachineContext<
  Context,
  Event extends FlowEvent,
  State extends string,
  Initial extends State,
  Id extends string,
>(machine: FlowMachine<Context, Event, State, Initial, Id>): Context {
  try {
    return machine.config.context();
  } catch (cause) {
    throw machineCallbackThrewDiagnostic({
      machineId: machine.id,
      callback: "context",
      cause,
    });
  }
}

function createSnapshot<
  Context,
  Event extends FlowEvent,
  State extends string,
  Initial extends State,
  Id extends string,
>(machine: FlowMachine<Context, Event, State, Initial, Id>): FlowSnapshot<Context, Initial, Event> {
  return Object.freeze({
    machine,
    value: machine.config.initial,
    context: initialMachineContext(machine),
    resources: {},
    transactions: {},
    streams: {},
    timers: {},
    children: {},
    receipts: [],
  });
}

export function createMachineDefinition<
  Context,
  Event extends FlowEvent,
  State extends string,
  Initial extends State,
  const Id extends string,
>(
  config: FlowMachineConfig<Id, Context, Event, State, Initial>,
): FlowMachine<Context, Event, State, Initial, Id> {
  const machine: FlowMachine<Context, Event, State, Initial, Id> = {
    kind: "machine",
    id: config.id,
    config,
    getInitialSnapshot: () => createSnapshot(machine),
  };
  return Object.freeze(machine);
}
