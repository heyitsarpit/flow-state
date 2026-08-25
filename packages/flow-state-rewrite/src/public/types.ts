export type Definition = Readonly<Record<string, unknown>>;
export type StateToken = string & { readonly __flowStateRewriteStateToken: "StateToken" };
export type EventToken = string & { readonly __flowStateRewriteEventToken: "EventToken" };
export type StateOf<_Definition extends Definition = Definition> = StateToken;
export type EventOf<_Definition extends Definition = Definition> = EventToken;
export type Machine = Definition;
export type MemoryOf<_Definition extends Definition = Definition> = Readonly<
  Record<string, unknown>
>;
export type InputOf<_Definition extends Definition = Definition> = unknown;
export type RequirementsOf<_Definition extends Definition = Definition> = never;
export type Resource = Definition;
export type Transaction = Definition;
export type ActorRef<_Machine extends Machine = Machine> = Readonly<{
  readonly machine: _Machine;
  readonly id: string;
}>;
export type ActorSnapshot = Readonly<Record<string, unknown>>;
export type Module = Definition;
export type App = Definition;
export type RuntimeSetup = Definition;
export type Runtime = Definition;
export type Implementation = Definition;
export type Persistence = Definition;
export type PersistenceStorage = Definition;
export type PersistenceStorageError = Error;
export type PersistenceCodec = Definition;
export type PersistenceSlot = Definition;
export type PersistenceValue = unknown;
export type PersistenceEntry = Definition;
export type CanonicalKeyInput = unknown;
export type FlowPath = readonly (string | number)[];
export type FlowUsageCode =
  | "InvalidCanonicalValue"
  | "ForeignActorRef"
  | "MismatchedActorRef"
  | "MissingActorRef"
  | "DisposedActorRef"
  | "RuntimeNotReady"
  | "RuntimeDisposed"
  | "MissingContextProvider"
  | "ContextDependencyCycle"
  | "DuplicateActorClaim"
  | "UnadmittedMachine"
  | "ActorNotActive"
  | "InvalidOperationPlan"
  | "WrongOperationKind"
  | "OperationNotPending"
  | "OperationAlreadySettled"
  | "DuplicateStreamDeclaration"
  | "BlockedByDependents";
