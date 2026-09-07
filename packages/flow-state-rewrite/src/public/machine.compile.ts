import { Effect, Result, Stream, type Types } from "effect";

import { definition, machine, resource, stream, transaction } from "../index.js";
import type {
  EventOf,
  InputOf,
  Machine,
  MemoryOf,
  OperationOptions,
  RequirementsOf,
  StateOf,
} from "../index.js";

/*
 * Proof organization:
 *
 * Fixtures and local builders
 * Type relationships and negative authoring cases
 * Behavior suites grouped by observable law
 *
 * Compile-only proof file; no runtime scenario state is shared.
 */

type Expect<Value extends true> = Value;

interface EditorRepo {
  readonly _tag: "EditorRepo";
}

type EditorInput = { readonly draftId: string };

const editorProject = resource({
  id: "public-editor/project",
  key: ({ draftId }: EditorInput) => [draftId] as const,
  // RETURN_TYPE: Preserves EditorRepo and the missing channel for the public operation proof.
  lookup: (
    { draftId }: EditorInput,
    _options: OperationOptions,
  ): Effect.Effect<string, "missing", EditorRepo> => Effect.succeed(draftId),
});

const editorSave = transaction({
  id: "public-editor/save",
  key: ({ draftId }: EditorInput) => [draftId] as const,
  // RETURN_TYPE: Preserves EditorRepo and the rejected channel for the public operation proof.
  commit: (
    { draftId }: EditorInput,
    _options: OperationOptions,
  ): Effect.Effect<string, "rejected", EditorRepo> => Effect.succeed(draftId),
});

const editorUpdates = stream({
  id: "public-editor/updates",
  key: ({ draftId }: EditorInput) => [draftId] as const,
  // RETURN_TYPE: Preserves EditorRepo and the offline channel for the public operation proof.
  subscribe: (
    { draftId }: EditorInput,
    _options: OperationOptions,
  ): Stream.Stream<string, "offline", EditorRepo> => Stream.make(draftId),
});

const EditorResult = definition({
  id: "public-editor",
  states: ["idle", "ready"],
  events: {
    opened: (draftId: string) => ({ draftId }),
    closed: "bare",
  },
  operations: {
    project: editorProject,
    save: editorSave,
    updates: editorUpdates,
  },
  memory: ({ input }: { readonly input: { readonly draftId: string } }) => ({
    draftId: input.draftId,
    count: 0,
  }),
});

if (!Result.isSuccess(EditorResult)) throw EditorResult.failure;
const Editor = EditorResult.success;
const EditorMachineResult = machine(EditorResult, ({ S, E, onContext, onMemory }) => {
  onContext.select(
    ({ memory }) => memory.draftId,
    (current, previous) => {
      const exactCurrent: string = current;
      const exactPrevious: string | undefined = previous;
      void exactCurrent;
      void exactPrevious;
      return null;
    },
  );
  onMemory(() => Editor.operations.project.subscribe({ draftId: "memory" }));
  // @ts-expect-error memory handlers accept continuing plans, not finite plans.
  onMemory(() => Editor.operations.project.lookup({ draftId: "memory" }));
  // @ts-expect-error memory handlers accept one continuing plan, not runtime-sized arrays.
  onMemory(() => [Editor.operations.project.subscribe({ draftId: "memory" })]);
  onMemory.select(
    ({ memory }) => memory.draftId,
    (current, previous) => {
      const exactCurrent: string = current;
      const exactPrevious: string | undefined = previous;
      void exactCurrent;
      void exactPrevious;
      return Editor.operations.updates.subscribe({ draftId: current });
    },
  );
  onMemory.select(
    ({ memory }) => memory.count,
    (current, previous) => {
      const exactCurrent: number = current;
      const exactPrevious: number | undefined = previous;
      void exactCurrent;
      void exactPrevious;
      return null;
    },
  );

  return {
    default: S.idle,
    states: {
      idle: {
        on: {
          opened: {
            target: S.ready,
            guard: ({ event }) => event.draftId.length > 0,
            updateMemory: ({ event }) => ({ draftId: event.draftId }),
            actions: () => Editor.operations.project.lookup({ draftId: "action" }),
          },
        },
        redirect: {
          when: ({ state, memory, snapshot }) => state === snapshot.state && memory.count >= 0,
          target: S.idle,
        },
      },
      ready: {
        activities: {
          project: Editor.operations.project.subscribe({ draftId: "activity" }),
        },
        timers: {
          close: {
            delay: 10,
            target: E.closed,
            guard: ({ timer }) => timer.name === "close" && timer.startedAt <= timer.dueAt,
            updateMemory: ({ timer }) => ({ count: timer.dueAt - timer.startedAt }),
          },
        },
      },
    },
  };
});

if (!Result.isSuccess(EditorMachineResult)) throw EditorMachineResult.failure;
const EditorMachine = EditorMachineResult.success;

const validRedirectList = [
  { when: () => true, target: Editor.S.idle },
  { when: () => false, target: Editor.S.ready },
] as const;
const redirectWithExtraKey = {
  when: () => true,
  target: Editor.S.ready,
  extra: true,
};
const redirectsWithExtraKey = [
  { when: () => true, target: Editor.S.idle },
  redirectWithExtraKey,
] as const;

const validRedirectListMachineResult = machine(EditorResult, ({ S }) => ({
  default: S.idle,
  states: {
    idle: { redirect: validRedirectList },
    ready: {},
  },
}));

void validRedirectListMachineResult;

const contextSelection = EditorMachine.compiled.context[0];
if (contextSelection === undefined) throw new Error("expected a context selection");
contextSelection.use((select, handler) =>
  handler(
    select({
      state: Editor.S.idle,
      memory: { draftId: "selected", count: 0 },
      context: {},
    }),
    undefined,
  ),
);
contextSelection.use((_select, handler) => {
  // @ts-expect-error a string registration cannot accept an invented number.
  return handler(123, undefined);
});
// @ts-expect-error compiled selections do not publish widened selector fields.
void contextSelection.selector;
// @ts-expect-error compiled selections do not publish widened handler fields.
void contextSelection.handler;

const memorySelection = EditorMachine.compiled.memory.find(
  (registration) => registration.kind === "selection",
);
if (memorySelection === undefined) throw new Error("expected a memory selection");
// @ts-expect-error memory selections do not publish widened selector fields.
void memorySelection.selector;
// @ts-expect-error memory selections do not publish widened handler fields.
void memorySelection.handler;

const ZeroArgumentDefinitionResult = definition({
  id: "public-zero-argument",
  states: ["ready"],
  events: {},
  memory: () => ({ count: 0 }),
});

if (!Result.isSuccess(ZeroArgumentDefinitionResult)) {
  throw ZeroArgumentDefinitionResult.failure;
}

const ZeroArgumentDefinition = ZeroArgumentDefinitionResult.success;
const ZeroArgumentMachineResult = machine(ZeroArgumentDefinitionResult, ({ S }) => ({
  default: S.ready,
  states: { ready: {} },
}));

if (!Result.isSuccess(ZeroArgumentMachineResult)) throw ZeroArgumentMachineResult.failure;
const ZeroArgumentMachine = ZeroArgumentMachineResult.success;

const NoInitializerDefinitionResult = definition({
  id: "public-no-initializer",
  states: ["ready"],
  events: {},
});

if (!Result.isSuccess(NoInitializerDefinitionResult)) {
  throw NoInitializerDefinitionResult.failure;
}

const NoInitializerDefinition = NoInitializerDefinitionResult.success;
const NoInitializerMachineResult = machine(NoInitializerDefinitionResult, ({ S }) => ({
  default: S.ready,
  states: { ready: {} },
}));

if (!Result.isSuccess(NoInitializerMachineResult)) throw NoInitializerMachineResult.failure;
const NoInitializerMachine = NoInitializerMachineResult.success;

export type _Machine = Expect<Types.Equals<typeof EditorMachine, Machine<typeof Editor>>>;
export type _Definition = Expect<Types.Equals<typeof EditorMachine.definition, typeof Editor>>;
export type _MachineState = Expect<
  Types.Equals<StateOf<typeof EditorMachine>, StateOf<typeof Editor>>
>;
export type _MachineEvent = Expect<
  Types.Equals<EventOf<typeof EditorMachine>, EventOf<typeof Editor>>
>;
export type _Compiled = Expect<
  Types.Equals<typeof EditorMachine.compiled, Machine<typeof Editor>["compiled"]>
>;
export type _MachineRequirements = Expect<
  Types.Equals<RequirementsOf<typeof EditorMachine>, EditorRepo>
>;
export type _Input = Expect<
  Types.Equals<InputOf<typeof EditorMachine.definition>, { readonly draftId: string }>
>;
export type _MachineInput = Expect<
  Types.Equals<InputOf<typeof EditorMachine>, { readonly draftId: string }>
>;
export type _DefinitionInput = Expect<
  Types.Equals<InputOf<typeof Editor>, { readonly draftId: string }>
>;
export type _Memory = Expect<
  Types.Equals<MemoryOf<typeof EditorMachine.definition>, { draftId: string; count: number }>
>;
export type _MachineMemory = Expect<
  Types.Equals<MemoryOf<typeof EditorMachine>, { draftId: string; count: number }>
>;
export type _DefinitionMemory = Expect<
  Types.Equals<MemoryOf<typeof Editor>, { draftId: string; count: number }>
>;
export type _InputAgreement = Expect<
  Types.Equals<InputOf<typeof Editor>, InputOf<typeof EditorMachine.definition>>
>;
export type _MachineInputAgreement = Expect<
  Types.Equals<InputOf<typeof Editor>, InputOf<typeof EditorMachine>>
>;
export type _MemoryAgreement = Expect<
  Types.Equals<MemoryOf<typeof Editor>, MemoryOf<typeof EditorMachine.definition>>
>;
export type _MachineMemoryAgreement = Expect<
  Types.Equals<MemoryOf<typeof Editor>, MemoryOf<typeof EditorMachine>>
>;
export type _ZeroArgumentDefinitionInput = Expect<
  Types.Equals<InputOf<typeof ZeroArgumentDefinition>, void>
>;
export type _ZeroArgumentMachineInput = Expect<
  Types.Equals<InputOf<typeof ZeroArgumentMachine>, void>
>;
export type _ZeroArgumentMachineDefinitionInput = Expect<
  Types.Equals<InputOf<typeof ZeroArgumentMachine.definition>, void>
>;
export type _ZeroArgumentInputAgreement = Expect<
  Types.Equals<
    InputOf<typeof ZeroArgumentDefinition>,
    InputOf<typeof ZeroArgumentMachine.definition>
  >
>;
export type _ZeroArgumentMachineInputAgreement = Expect<
  Types.Equals<InputOf<typeof ZeroArgumentDefinition>, InputOf<typeof ZeroArgumentMachine>>
>;
export type _ZeroArgumentDefinitionMemory = Expect<
  Types.Equals<MemoryOf<typeof ZeroArgumentDefinition>, { count: number }>
>;
export type _ZeroArgumentMachineMemory = Expect<
  Types.Equals<MemoryOf<typeof ZeroArgumentMachine>, { count: number }>
>;
export type _ZeroArgumentMachineDefinitionMemory = Expect<
  Types.Equals<MemoryOf<typeof ZeroArgumentMachine.definition>, { count: number }>
>;
export type _ZeroArgumentMemoryAgreement = Expect<
  Types.Equals<
    MemoryOf<typeof ZeroArgumentDefinition>,
    MemoryOf<typeof ZeroArgumentMachine.definition>
  >
>;
export type _ZeroArgumentMachineMemoryAgreement = Expect<
  Types.Equals<MemoryOf<typeof ZeroArgumentDefinition>, MemoryOf<typeof ZeroArgumentMachine>>
>;
export type _NoInitializerDefinitionInput = Expect<
  Types.Equals<InputOf<typeof NoInitializerDefinition>, void>
>;
export type _NoInitializerMachineInput = Expect<
  Types.Equals<InputOf<typeof NoInitializerMachine>, void>
>;
export type _NoInitializerInputAgreement = Expect<
  Types.Equals<InputOf<typeof NoInitializerDefinition>, InputOf<typeof NoInitializerMachine>>
>;
export type _NoInitializerDefinitionMemory = Expect<
  Types.Equals<MemoryOf<typeof NoInitializerDefinition>, Readonly<Record<never, never>>>
>;
export type _NoInitializerMachineMemory = Expect<
  Types.Equals<MemoryOf<typeof NoInitializerMachine>, Readonly<Record<never, never>>>
>;
export type _NoInitializerMemoryAgreement = Expect<
  Types.Equals<MemoryOf<typeof NoInitializerDefinition>, MemoryOf<typeof NoInitializerMachine>>
>;
export type _State = Expect<
  Types.Equals<
    StateOf<typeof EditorMachine.definition>,
    typeof Editor.S.idle | typeof Editor.S.ready
  >
>;
export type _Event = Expect<
  Types.Equals<EventOf<typeof EditorMachine.definition>, EventOf<typeof Editor>>
>;

// @ts-expect-error authored configuration is not part of the public Machine surface.
void EditorMachine.config;

type StructuralDefinition = {
  readonly id: string;
  readonly memory: () => { readonly value: number };
};

type StructuralMachine = {
  readonly definition: typeof Editor;
};

// @ts-expect-error public extractors require the nominal Definition constraint.
type _StructuralDefinitionInput = InputOf<StructuralDefinition>;
// @ts-expect-error public extractors require the nominal Definition constraint.
type _StructuralDefinitionMemory = MemoryOf<StructuralDefinition>;
// @ts-expect-error public extractors do not recursively unwrap arbitrary objects.
type _StructuralMachineInput = InputOf<StructuralMachine>;
// @ts-expect-error public extractors do not recursively unwrap arbitrary objects.
type _StructuralMachineMemory = MemoryOf<StructuralMachine>;

// Negative authoring remains after the positive relationship assertions so each
// Error directive stays attached to its exact rejected expression.
const invalidRedirectProofs = () => {
  // @ts-expect-error inline redirects admit only when and target.
  machine(EditorResult, ({ S }) => ({
    default: S.idle,
    states: {
      idle: { redirect: { when: () => true, target: S.ready, extra: true } },
      ready: {},
    },
  }));
  // @ts-expect-error named redirects admit only when and target.
  machine(EditorResult, () => ({
    default: Editor.S.idle,
    states: {
      idle: { redirect: redirectWithExtraKey },
      ready: {},
    },
  }));
  // @ts-expect-error every redirect-list element must admit only when and target.
  machine(EditorResult, () => ({
    default: Editor.S.idle,
    states: {
      idle: { redirect: redirectsWithExtraKey },
      ready: {},
    },
  }));
};

void invalidRedirectProofs;

void EditorMachine;
void ZeroArgumentMachine;
void NoInitializerMachine;
