import { Context, Effect, Result, Stream, type Types } from "effect";

import {
  Implementation,
  actorRef,
  app,
  definition,
  machine,
  module,
  resource,
  runtimeSetup,
  stream,
  transaction,
} from "flow-state-rewrite";
import type * as Public from "flow-state-rewrite";
import type {
  ActorRef,
  App,
  EventOf,
  FlowStream,
  Implementation as ImplementationType,
  InputOf,
  Machine,
  MemoryOf,
  OperationOptions,
  RequirementsOf,
  Resource,
  RuntimeSetup,
  StateOf,
  Transaction,
} from "flow-state-rewrite";

type Expect<Value extends true> = Value;

// @ts-expect-error Actor snapshot is deferred until its owner exists.
export type _ActorSnapshot = Public.ActorSnapshot;
// @ts-expect-error Persistence is deferred until its owner exists.
export type _Persistence = Public.Persistence;
// @ts-expect-error Persistence storage is deferred until its owner exists.
export type _PersistenceStorage = Public.PersistenceStorage;
// @ts-expect-error Persistence storage failure is deferred until its owner exists.
export type _PersistenceStorageError = Public.PersistenceStorageError;
// @ts-expect-error Persistence codec is deferred until its owner exists.
export type _PersistenceCodec = Public.PersistenceCodec;
// @ts-expect-error Persistence slot is deferred until its owner exists.
export type _PersistenceSlot = Public.PersistenceSlot;
// @ts-expect-error Persistence value is deferred until its owner exists.
export type _PersistenceValue = Public.PersistenceValue;
// @ts-expect-error Persistence entry is deferred until its owner exists.
export type _PersistenceEntry = Public.PersistenceEntry;
// @ts-expect-error Flow path is deferred until its owner exists.
export type _FlowPath = Public.FlowPath;
// @ts-expect-error Flow usage code is deferred until its owner exists.
export type _FlowUsageCode = Public.FlowUsageCode;
// @ts-expect-error Flow usage error is deferred until its owner exists.
export type _FlowUsageError = Public.FlowUsageError;

interface RepositoryService {
  readonly load: (id: string) => string;
}

class Repository extends Context.Service<Repository, RepositoryService>()("Packed/Repository") {}

type ProjectInput = { readonly projectId: string };

const project = resource({
  id: "packed-project",
  key: ({ projectId }: ProjectInput) => [projectId] as const,
  // RETURN_TYPE: Preserves the packed Resource's "missing" failure and Repository requirement channels; removing it infers never for those channels.
  lookup: (
    { projectId }: ProjectInput,
    _options: OperationOptions,
  ): Effect.Effect<string, "missing", Repository> => Effect.succeed(projectId),
});

const save = transaction({
  id: "packed-save",
  key: ({ projectId }: ProjectInput) => [projectId] as const,
  // RETURN_TYPE: Preserves the packed Transaction's "rejected" failure and Repository requirement channels; removing it infers never for those channels.
  commit: (
    { projectId }: ProjectInput,
    _options: OperationOptions,
  ): Effect.Effect<number, "rejected", Repository> => Effect.succeed(projectId.length),
});

const updates = stream({
  id: "packed-updates",
  key: ({ projectId }: ProjectInput) => [projectId] as const,
  // RETURN_TYPE: Preserves the packed Stream's "offline" failure and Repository requirement channels; removing it infers never for those channels.
  subscribe: (
    { projectId }: ProjectInput,
    _options: OperationOptions,
  ): Stream.Stream<boolean, "offline", Repository> => Stream.make(projectId.length > 0),
});

const projectChannels: Resource<
  "packed-project",
  ProjectInput,
  readonly [string],
  string,
  "missing",
  Repository
> = project;
const projectChannelsExact: typeof project = projectChannels;
export type _TransactionChannels = Expect<
  Types.Equals<
    typeof save,
    Transaction<"packed-save", ProjectInput, readonly [string], number, "rejected", Repository>
  >
>;
export type _StreamChannels = Expect<
  Types.Equals<
    typeof updates,
    FlowStream<"packed-updates", ProjectInput, readonly [string], boolean, "offline", Repository>
  >
>;
export type _ResourceRequirements = Expect<
  Types.Equals<RequirementsOf<typeof project>, Repository>
>;
export type _TransactionRequirements = Expect<
  Types.Equals<RequirementsOf<typeof save>, Repository>
>;
export type _StreamRequirements = Expect<Types.Equals<RequirementsOf<typeof updates>, Repository>>;

const editorResult = definition({
  id: "packed-editor",
  states: ["idle", "ready"],
  events: {
    opened: (projectId: string) => ({ projectId }),
    closed: "bare",
  },
  operations: { project, save, updates },
  memory: ({ input }: { readonly input: ProjectInput }) => ({
    projectId: input.projectId,
    count: 0,
  }),
});

if (!Result.isSuccess(editorResult)) throw editorResult.failure;
const Editor = editorResult.success;
const editorMachineResult = machine(editorResult, ({ S }) => ({
  default: S.idle,
  states: {
    idle: { on: { opened: { target: S.ready } } },
    ready: { on: { closed: { target: S.idle } } },
  },
}));

if (!Result.isSuccess(editorMachineResult)) throw editorMachineResult.failure;
const EditorMachine = editorMachineResult.success;
const editorModule = module({ id: "packed-editor-module", machines: { editor: EditorMachine } });
const EditorApp = app({
  id: "packed-editor-app",
  persistenceVersion: "1",
  modules: [editorModule] as const,
});

const repository = Repository.of({ load: (id) => id });
const completeImplementation = Implementation.succeed(Repository, repository);
const setup = runtimeSetup({ app: EditorApp, implementation: completeImplementation });
const runtimeSetupValue: RuntimeSetup<typeof EditorApp> = setup;
const editorRef = actorRef(EditorMachine, "primary-editor", { persist: true });

export type _DefinitionInput = Expect<Types.Equals<InputOf<typeof Editor>, ProjectInput>>;
export type _DefinitionMemory = Expect<
  Types.Equals<MemoryOf<typeof Editor>, { projectId: string; count: number }>
>;
export type _Machine = Expect<Types.Equals<typeof EditorMachine, Machine<typeof Editor>>>;
export type _MachineState = Expect<
  Types.Equals<StateOf<typeof EditorMachine>, StateOf<typeof Editor>>
>;
export type _MachineEvent = Expect<
  Types.Equals<EventOf<typeof EditorMachine>, EventOf<typeof Editor>>
>;
export type _MachineInput = Expect<Types.Equals<InputOf<typeof EditorMachine>, ProjectInput>>;
export type _MachineRequirements = Expect<
  Types.Equals<RequirementsOf<typeof EditorMachine>, Repository>
>;
export type _App = Expect<
  Types.Equals<typeof EditorApp, App<"packed-editor-app", "1", readonly [typeof editorModule]>>
>;
export type _AppRequirements = Expect<Types.Equals<RequirementsOf<typeof EditorApp>, Repository>>;
export type _Setup = Expect<Types.Equals<typeof runtimeSetupValue, RuntimeSetup<typeof EditorApp>>>;
export type _ActorRef = Expect<
  Types.Equals<typeof editorRef, ActorRef<typeof EditorMachine, "primary-editor", true>>
>;

const otherEditorResult = definition({
  id: "packed-other-editor",
  states: ["idle"],
  events: {},
});
if (!Result.isSuccess(otherEditorResult)) throw otherEditorResult.failure;
const otherMachineResult = machine(otherEditorResult, ({ S }) => ({
  default: S.idle,
  states: { idle: {} },
}));
if (!Result.isSuccess(otherMachineResult)) throw otherMachineResult.failure;
const otherMachine = otherMachineResult.success;

// @ts-expect-error ActorRef retains the exact machine identity.
const foreignMachineRef: typeof editorRef = actorRef(otherMachine, "primary-editor", {
  persist: true,
});

const implementationValue: ImplementationType<Repository, never, never> = completeImplementation;
const implementationTypeValue = Implementation.succeed(Repository, repository);

const copiedMachineRef = actorRef({ ...EditorMachine }, "copied-machine");

void foreignMachineRef;
void copiedMachineRef;
void projectChannelsExact;
void implementationValue;
void implementationTypeValue;
