import type { FlowEvent, FlowMachine, FlowMachineConfig, FlowSnapshot } from "../core/api/types.js";
import { machineCallbackThrewDiagnostic } from "../shared/diagnostics.js";
import { copyMachineConfig } from "./config-copy.js";

function initialMachineContext<
  Context,
  Event extends FlowEvent,
  State extends string,
  Initial extends State,
  Id extends string,
  Config extends FlowMachineConfig<Id, Context, Event, State, Initial>,
>(machine: FlowMachine<Context, Event, State, Initial, Id, Config>): Context {
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
  Config extends FlowMachineConfig<Id, Context, Event, State, Initial>,
>(
  machine: FlowMachine<Context, Event, State, Initial, Id, Config>,
): FlowSnapshot<Context, Initial, Event> {
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
  const Config extends FlowMachineConfig<Id, Context, Event, State, Initial>,
>(config: Config): FlowMachine<Context, Event, State, Initial, Config["id"], Config> {
  const copiedConfig = copyMachineConfig<Context, Event, State, Initial, Id, Config>(config);
  const machine: FlowMachine<Context, Event, State, Initial, Config["id"], Config> = {
    kind: "machine",
    id: copiedConfig.id,
    config: copiedConfig,
    getInitialSnapshot: () => createSnapshot(machine),
  };
  return Object.freeze(machine);
}
