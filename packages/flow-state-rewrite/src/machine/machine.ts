import { Result } from "effect";

import type { DefinitionValue as DomainValue } from "../definition/domain.js";
import type {
  RequirementsCarrier,
  RequirementsOf as OperationRequirementsOf,
} from "../operation/operation.js";
import type * as Diagnostic from "../diagnostic/diagnostic.js";
import { compileMachine } from "./compiler.js";
import type {
  CompiledMachine,
  ContextRegistration,
  MachineCallback,
  MachineConfiguration,
  MachineDefinition,
  MachineSelectorInput,
  MachineStoreAction,
  MemoryHandler,
  MemoryRegistration,
  MemorySelectionHandler,
  OnMemory,
  ValidMachineConfiguration,
} from "./grammar.js";
import { makeSelection } from "./grammar.js";

/*
 * Machine authoring:
 *
 * Identity and public contracts:
 *   OperationRequirements, Machine, MachineRequirementsOf, MachineRecordValue
 *   constructedMachines, isMachineReference, isConstructedMachine
 *
 * Registration collection:
 *   collectRegistrations, makeSelection
 *
 * Store plans:
 *   makeStoreAction
 *
 * Compilation/publication:
 *   compileMachine, publishMachine
 *
 * Public assembly:
 *   machine
 */

export type {
  CompiledMachine,
  CompiledRedirect,
  CompiledState,
  CompiledTimer,
  CompiledTransition,
  MachineAction,
  MachineActivity,
  MachineActivityPlan,
  MachineCallback,
  MachineSnapshot,
} from "./grammar.js";

type OperationRequirements<DefinitionValue extends MachineDefinition> = OperationRequirementsOf<
  DefinitionValue["operations"][keyof DefinitionValue["operations"]]
>;

export type Machine<DefinitionValue extends MachineDefinition = MachineDefinition> = Readonly<{
  definition: DefinitionValue;
  compiled: CompiledMachine<DefinitionValue>;
}> &
  RequirementsCarrier<OperationRequirements<DefinitionValue>>;

export type MachineRequirementsOf<Value> = OperationRequirementsOf<Value>;

export type MachineRecordValue = RequirementsCarrier<unknown> & {
  readonly definition: MachineDefinition;
};

const constructedMachines = new WeakSet<MachineRecordValue>();

// RETURN_TYPE: Narrows unknown to WeakSet.has's MachineRecordValue input; removal produces TS2345.
const isMachineReference = (value: unknown): value is MachineRecordValue =>
  typeof value === "object" && value !== null;

// RETURN_TYPE: Preserves Machine narrowing after nominal WeakSet admission for runtime and app consumers.
export const isConstructedMachine = (value: unknown): value is Machine =>
  isMachineReference(value) && constructedMachines.has(value);

const collectRegistrations = <DefinitionValue extends MachineDefinition>() => {
  const context: ContextRegistration<DefinitionValue>[] = [];
  const memory: MemoryRegistration<DefinitionValue>[] = [];

  const onContext: MachineCallback<DefinitionValue>["onContext"] = {
    select(selector, handler) {
      context.push(makeSelection(selector, handler));
    },
  };

  const onMemory: OnMemory<DefinitionValue> = Object.assign(
    (handler: MemoryHandler<DefinitionValue>) => {
      memory.push({ kind: "handler", handler });
    },
    {
      select: <const Value extends DomainValue>(
        selector: (input: MachineSelectorInput<DefinitionValue>) => Value,
        handler: MemorySelectionHandler<DefinitionValue, Value>,
      ) => {
        memory.push({ kind: "selection", ...makeSelection(selector, handler) });
      },
    },
  );

  return { context, memory, onContext, onMemory };
};

// RETURN_TYPE: Preserves the readonly non-empty target tuple after array-spread construction.
const makeStoreAction = <DefinitionValue extends MachineDefinition>(
  kind: MachineStoreAction<DefinitionValue>["kind"],
  targets: MachineStoreAction<DefinitionValue>["targets"],
): MachineStoreAction<DefinitionValue> => ({ kind, targets: [...targets] });

const publishMachine = <DefinitionValue extends MachineDefinition>(
  definition: DefinitionValue,
  compiled: CompiledMachine<DefinitionValue>,
) => {
  // SAFETY: the requirements carrier is package-private and type-only; runtime Machine owns this two-field shell.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the private type-only carrier has no runtime field; this shell is the complete admitted Machine value.
  const machineValue = { definition, compiled } as Machine<DefinitionValue>;
  constructedMachines.add(machineValue);
  return machineValue;
};

export const machine = <
  const DefinitionValue extends MachineDefinition,
  const Configuration extends MachineConfiguration<DefinitionValue>,
>(
  definitionResult: Result.Result<DefinitionValue, Diagnostic.PublicDiagnostic>,
  callback: (
    input: MachineCallback<NoInfer<DefinitionValue>>,
  ) => Configuration & ValidMachineConfiguration<NoInfer<DefinitionValue>, Configuration>,
) =>
  Result.flatMap(definitionResult, (definition) => {
    const registrations = collectRegistrations<DefinitionValue>();

    const configuration = callback({
      S: definition.S,
      E: definition.E,
      O: definition.operations,
      onContext: registrations.onContext,
      onMemory: registrations.onMemory,
      invalidate: (...targets) => makeStoreAction<DefinitionValue>("invalidate", targets),
      clear: (...targets) => makeStoreAction<DefinitionValue>("clear", targets),
    });

    return Result.map(
      compileMachine(definition, configuration, registrations.context, registrations.memory),
      (compiled) => publishMachine(definition, compiled),
    );
  });
