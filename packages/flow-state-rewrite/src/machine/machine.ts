import type { Brand } from "effect";

import type { DefinitionIdentity } from "../definition/domain.js";

type MachineDefinition = Brand.Brand<"flow-state/Definition"> &
  DefinitionIdentity & {
    readonly S: object;
    readonly E: object;
    readonly operations: object;
  };

type StateNode<DefinitionValue extends MachineDefinition> =
  DefinitionValue["S"][keyof DefinitionValue["S"]];

type MachineLeafConfiguration = Readonly<Record<never, never>>;

export type MachineCallback<DefinitionValue extends MachineDefinition> = {
  readonly S: DefinitionValue["S"];
  readonly E: DefinitionValue["E"];
  readonly O: DefinitionValue["operations"];
};

export type MachineConfiguration<DefinitionValue extends MachineDefinition> = {
  readonly default: StateNode<DefinitionValue>;
  readonly states: {
    readonly [Name in keyof DefinitionValue["S"] & string]: MachineLeafConfiguration;
  };
};

export type Machine<
  DefinitionValue extends MachineDefinition = MachineDefinition,
  Configuration extends MachineConfiguration<DefinitionValue> =
    MachineConfiguration<DefinitionValue>,
> = {
  readonly definition: DefinitionValue;
  readonly config: Configuration;
};

export const machine = <
  const DefinitionValue extends MachineDefinition,
  const Configuration extends MachineConfiguration<NoInfer<DefinitionValue>>,
>(
  definition: DefinitionValue,
  callback: (input: MachineCallback<NoInfer<DefinitionValue>>) => Configuration,
): Machine<DefinitionValue, Configuration> => {
  const config = callback({
    S: definition.S,
    E: definition.E,
    O: definition.operations,
  });

  return { definition, config };
};
