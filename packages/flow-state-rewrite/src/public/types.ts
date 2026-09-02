export type { CanonicalKeyInput } from "../operation/key.js";
export type { OperationOptions } from "../operation/operation.js";

export type { FlowStream } from "../operation/stream.js";

export type { Resource } from "../operation/resource.js";
export type { Transaction } from "../operation/transaction.js";

export type { App, Module, RequirementsOf } from "../app/app.js";

export type {
  Definition,
  EventOf,
  EventToken,
  InputOf,
  MemoryOf,
  StateOf,
  StateToken,
} from "../definition/domain.js";

export type { Implementation } from "../implementation/implementation.js";
export type { Machine } from "../machine/machine.js";

import type { Definition } from "../definition/domain.js";
import type { DefinitionValue } from "../definition/domain.js";
import type { Machine as MachineType } from "../machine/machine.js";
import type { CanonicalKeyInput as CanonicalValue } from "../operation/key.js";

export type ActorRef<_Machine extends MachineType = MachineType> = {
  readonly machine: _Machine;
  readonly id: string;
};

export type ActorSnapshot = Readonly<Record<string, DefinitionValue>>;
export type RuntimeSetup = Definition;
export type Runtime = Definition;
export type Persistence = Definition;
export type PersistenceStorage = Definition;
export type PersistenceStorageError = Error;
export type PersistenceCodec = Definition;
export type PersistenceSlot = Definition;
export type PersistenceValue = CanonicalValue;
export type PersistenceEntry = Definition;
