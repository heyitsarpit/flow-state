import type {
  DefinitionConstraint,
  EventOf as DefinitionEventOf,
  InputOf as DefinitionInputOf,
  MemoryOf as DefinitionMemoryOf,
  StateOf as DefinitionStateOf,
} from "../definition/domain.js";
import type { MachineRecordValue } from "../machine/machine.js";

type DefinitionOf<Value extends DefinitionConstraint | MachineRecordValue> =
  Value extends MachineRecordValue ? Value["definition"] : Value;

export type StateOf<Value extends DefinitionConstraint | MachineRecordValue> = DefinitionStateOf<
  DefinitionOf<Value>
>;

export type EventOf<Value extends DefinitionConstraint | MachineRecordValue> = DefinitionEventOf<
  DefinitionOf<Value>
>;

export type InputOf<Value extends DefinitionConstraint | MachineRecordValue> = DefinitionInputOf<
  DefinitionOf<Value>
>;

export type MemoryOf<Value extends DefinitionConstraint | MachineRecordValue> = DefinitionMemoryOf<
  DefinitionOf<Value>
>;

// Type surface: DefinitionConstraint/DefinitionEventOf/DefinitionStateOf/DefinitionInputOf/DefinitionMemoryOf/MachineRecordValue
// -> DefinitionOf normalization -> StateOf/EventOf/InputOf/MemoryOf projections
// -> curated outward App/Definition/Implementation/Machine/Operation/ActorRef/Runtime exports
// -> deferred restoration names ActorSnapshot/Persistence/PersistenceStorage/PersistenceStorageError/PersistenceCodec/PersistenceSlot/PersistenceValue/PersistenceEntry/FlowPath/FlowUsageCode/FlowUsageError.
export type { App, Module, RequirementsOf } from "../app/app.js";

export type { Definition, EventToken, StateToken } from "../definition/domain.js";

export type { Implementation } from "../implementation/implementation.js";
export type { Machine } from "../machine/machine.js";

export type { CanonicalKeyInput } from "../operation/key.js";
export type { OperationOptions } from "../operation/operation.js";

export type { FlowStream } from "../operation/stream.js";

export type { Resource } from "../operation/resource.js";
export type { Transaction } from "../operation/transaction.js";

export type { ActorRef } from "../runtime/actor-ref.js";
export type { Runtime, RuntimeSetup } from "../runtime/runtime.js";

// Deferred public types: future actor and persistence owners will publish these names.
// export type ActorSnapshot;
// export type Persistence;
// export type PersistenceStorage;
// export type PersistenceStorageError;
// export type PersistenceCodec;
// export type PersistenceSlot;
// export type PersistenceValue;
// export type PersistenceEntry;
// Deferred public types: future diagnostic owners will publish these names.
// export type FlowPath;
// export type FlowUsageCode;
// export type FlowUsageError;
