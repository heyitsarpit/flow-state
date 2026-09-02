import { Predicate, Result } from "effect";

import type { DefinitionValue as DomainValue } from "../definition/domain.js";
import type * as Diagnostic from "../diagnostic/diagnostic.js";
import { compileMachine } from "./compiler.js";
import type {
  ContextRegistration,
  Machine,
  MachineCallback,
  MachineConfiguration,
  MachineDefinition,
  MachineSelectorInput,
  MemoryHandler,
  MemoryRegistration,
  MemorySelectionHandler,
  OnMemory,
  ValidMachineConfiguration,
} from "./grammar.js";

export type {
  CompiledMachine,
  CompiledRedirect,
  CompiledState,
  CompiledTimer,
  CompiledTransition,
  MachineAction,
  MachineCallback,
  MachineConfiguration,
  MachineSnapshot,
} from "./grammar.js";

export type { Machine } from "./grammar.js";

const machineIdentity: unique symbol = Symbol("machine identity");

type MachineIdentity = { readonly [machineIdentity]: true };

const constructedMachines = new WeakSet<MachineIdentity>();

const hasMachineIdentity = (value: unknown): value is MachineIdentity =>
  Predicate.isObject(value) && machineIdentity in value;

/** Package-private nominal identity for constructed machines. */
export const isConstructedMachine = (value: unknown): boolean =>
  hasMachineIdentity(value) && constructedMachines.has(value);

const makeStoreAction = (kind: "invalidate" | "clear", targets: readonly DomainValue[]) => ({
  kind,
  targets: [...targets],
});

export const machineResult = <
  const DefinitionValue extends MachineDefinition,
  const Configuration extends MachineConfiguration<DefinitionValue>,
>(
  definition: DefinitionValue,
  callback: (
    input: MachineCallback<NoInfer<DefinitionValue>>,
  ) => Configuration & ValidMachineConfiguration<NoInfer<DefinitionValue>, Configuration>,
): Diagnostic.Result<Machine<DefinitionValue, Configuration>> => {
  const context: ContextRegistration<DefinitionValue>[] = [];
  const memory: MemoryRegistration<DefinitionValue>[] = [];

  const onContext: MachineCallback<DefinitionValue>["onContext"] = {
    select(selector, handler) {
      context.push({ selector, handler });
    },
  };

  const onMemory: OnMemory<DefinitionValue> = Object.assign(
    (handler: MemoryHandler<DefinitionValue>): void => {
      memory.push({ kind: "handler", handler });
    },
    {
      select: <const Value extends DomainValue>(
        selector: (input: MachineSelectorInput<DefinitionValue>) => Value,
        handler: MemorySelectionHandler<Value>,
      ): void => {
        memory.push({ kind: "selection", selector, handler });
      },
    },
  );

  const config: Configuration = callback({
    S: definition.S,
    E: definition.E,
    O: definition.operations,
    onContext,
    onMemory,
    invalidate: (...targets) => makeStoreAction("invalidate", targets),
    clear: (...targets) => makeStoreAction("clear", targets),
  });

  return Result.gen(function* () {
    const compiled = yield* compileMachine(definition, config, context, memory);
    const machineValue = {
      ...definition,
      definition,
      config,
      compiled,
      [machineIdentity]: true as const,
    };
    constructedMachines.add(machineValue);
    return machineValue;
  });
};

export const machine = <
  const DefinitionValue extends MachineDefinition,
  const Configuration extends MachineConfiguration<DefinitionValue>,
>(
  definition: DefinitionValue,
  callback: (
    input: MachineCallback<NoInfer<DefinitionValue>>,
  ) => Configuration & ValidMachineConfiguration<NoInfer<DefinitionValue>, Configuration>,
): Machine<DefinitionValue, Configuration> =>
  Result.getOrThrow(machineResult<DefinitionValue, Configuration>(definition, callback));
