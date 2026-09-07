import { assert, describe, it } from "@effect/vitest";
import { Effect, Result, Stream, type Types } from "effect";

import { definition } from "../../definition/definition.js";
import type * as Diagnostic from "../../diagnostic/diagnostic.js";
import type { OperationOptions } from "../../operation/operation.js";
import { resource } from "../../operation/resource.js";
import { stream } from "../../operation/stream.js";
import { transaction } from "../../operation/transaction.js";
import type { InvalidMachineConfigurationReason } from "../diagnostic.js";
import {
  isConstructedMachine,
  machine,
  type CompiledRedirect,
  type CompiledMachine,
  type CompiledState,
  type CompiledTimer,
  type CompiledTransition,
  type Machine,
  type MachineAction,
  type MachineActivity,
} from "../machine.js";

/*
 * Proof organization:
 *
 * Fixtures and local builders
 * Type relationships and negative authoring cases
 * Behavior suites grouped by observable law
 *
 * Mutable setup remains local to its scenario.
 */

type Expect<Value extends true> = Value;

export type _MachineConfigurationReasons = Expect<
  Types.Equals<
    InvalidMachineConfigurationReason,
    | "ConfigurationNotRecord"
    | "NonStringConfigurationKey"
    | "UnexpectedConfigurationField"
    | "StateConfigurationMismatch"
    | "ExpectedFunction"
    | "UnknownStateToken"
    | "UnknownEventToken"
    | "InvalidStateToken"
    | "TransitionObjectRequired"
    | "ExpectedTransition"
    | "ExpectedEventHandlers"
    | "UnknownEventHandler"
    | "EmptyEventHandlerList"
    | "EmptyRedirectList"
    | "ExpectedRedirect"
    | "ExpectedTimer"
    | "InvalidTimerDelay"
    | "ExpectedActivities"
    | "ExpectedStateConfiguration"
    | "MissingCompoundStateFields"
    | "InvalidDefaultTarget"
    | "ExpectedLeafConfiguration"
    | "InvalidCompoundState"
    | "InvalidTokenTables"
    | "AmbiguousHandler"
  >
>;

const resultSuccess = <Value>(result: Result.Result<Value, Diagnostic.PublicDiagnostic>) => {
  if (Result.isFailure(result)) throw result.failure;
  return result.success;
};

const save = transaction({
  id: "editor/save",
  commit: (_options: OperationOptions) => Effect.succeed("saved"),
});

const nestedProject = resource({
  id: "nested/project",
  key: (projectId: number) => [projectId] as const,
  lookup: (projectId: number, _options: OperationOptions) => Effect.succeed(projectId),
});

const nestedUpdates = stream({
  id: "nested/updates",
  key: (projectId: number) => [projectId] as const,
  subscribe: (projectId: number, _options: OperationOptions) => Stream.make(projectId),
});

const EditorResult = definition({
  id: "editor",
  states: ["ready"],
  events: {
    opened: (draftId: string) => ({ draftId }),
  },
  operations: { save },
});
const Editor = resultSuccess(EditorResult);

const OtherEditorResult = definition({
  id: "other-editor",
  states: ["ready"],
  events: {
    opened: (draftId: string) => ({ draftId }),
  },
});
const OtherEditor = resultSuccess(OtherEditorResult);

const editorMachine = resultSuccess(
  machine(EditorResult, ({ S, E, O }) => {
    const ready: typeof Editor.S.ready = S.ready;
    const opened: typeof Editor.E.opened = E.opened;
    const save: typeof Editor.operations.save = O.save;

    void ready;
    void opened;
    void save;

    return {
      default: S.ready,
      states: {
        ready: {},
      },
    };
  }),
);

export type _DefinitionIdentity = Expect<
  Types.Equals<typeof editorMachine.definition, typeof Editor>
>;
export type _Machine = Expect<Types.Equals<typeof editorMachine, Machine<typeof Editor>>>;
export type _CompiledMachine = Expect<
  Types.Equals<typeof editorMachine.compiled, CompiledMachine<typeof Editor>>
>;
// @ts-expect-error Machine does not publish authored configuration.
void editorMachine.config;

const editorGuard = (
  _input: Parameters<NonNullable<CompiledTransition<typeof Editor, "opened">["guard"]>>[0],
) => true;
export type _CompiledGuard = Expect<
  Types.Equals<
    NonNullable<CompiledTransition<typeof Editor, "opened">["guard"]>,
    typeof editorGuard
  >
>;
export type _CompiledRedirect = Expect<
  Types.Equals<CompiledRedirect<typeof Editor>["target"], typeof Editor.S.ready>
>;
export type _CompiledTimerTarget = Expect<
  Types.Equals<CompiledTimer<typeof Editor>["target"], typeof Editor.E.opened>
>;
export type _LeafCompiledStateChildren = Expect<
  Types.Equals<Extract<CompiledState<typeof Editor>, { kind: "leaf" }>["children"], readonly []>
>;
export type _CompoundCompiledStateChildren = Expect<
  Types.Equals<
    Extract<CompiledState<typeof Editor>, { kind: "compound" }>["children"],
    readonly string[]
  >
>;

const compiledStateNarrowingProofs = (state: CompiledState<typeof Editor>) => {
  if (state.kind === "leaf") {
    void state.state;
    void state.children;
    // @ts-expect-error leaf states do not have a default child state
    void state.default;
    // @ts-expect-error compiled leaf states retain their definition identity
    const foreignLeafState: typeof state.state = OtherEditor.S.ready;
    void foreignLeafState;
    return;
  }

  void state.default;
  void state.children;
  // @ts-expect-error compound states do not have a leaf state token
  void state.state;
  // @ts-expect-error compiled compound states retain their definition identity
  const foreignCompoundDefault: typeof state.default = OtherEditor.S.ready;
  void foreignCompoundDefault;
};

void compiledStateNarrowingProofs;

const negativeProofs = () => {
  const definitionImpostor = {
    id: Editor.id,
    S: Editor.S,
    E: Editor.E,
    operations: Editor.operations,
  };

  // @ts-expect-error hand-written structural values are not constructed definitions
  machine(Result.succeed(definitionImpostor), () => ({
    default: Editor.S.ready,
    states: { ready: {} },
  }));

  machine(EditorResult, ({ S }) => {
    // @ts-expect-error a machine cannot use a state from another definition
    const foreignDefault: typeof S.ready = OtherEditor.S.ready;
    void foreignDefault;

    return { default: S.ready, states: { ready: {} } };
  });

  machine(EditorResult, ({ E }) => {
    // @ts-expect-error event constructors retain their definition identity
    const foreignEvent: typeof Editor.E.opened = OtherEditor.E.opened;
    void foreignEvent;

    void E.opened("draft");

    // @ts-expect-error event constructors retain their authored argument tuple
    E.opened(1);

    return { default: Editor.S.ready, states: { ready: {} } };
  });
};

void negativeProofs;

const NestedResult = definition({
  id: "nested-editor",
  states: ["idle", { active: ["editing", { dialog: ["open", "closed"] }] }],
  events: {
    changed: (value: string) => ({ value }),
    tick: "bare",
  },
  operations: { save, project: nestedProject, updates: nestedUpdates },
  memory: (_options: { readonly input: { readonly draftId: string } }) => ({ count: 0 }),
});
const Nested = resultSuccess(NestedResult);

const resourceAction: MachineAction<typeof Nested> = nestedProject.lookup(1);
const resourceRefetchAction: MachineAction<typeof Nested> = nestedProject.refetch(1);
const resourceSetDataAction: MachineAction<typeof Nested> = nestedProject.setData(
  nestedProject.key(1),
  1,
);
const resourceCancelAction: MachineAction<typeof Nested> = nestedProject.cancel(
  nestedProject.key(1),
);
const transactionAction: MachineAction<typeof Nested> = save.commit(undefined);
const transactionCancelAction: MachineAction<typeof Nested> = save.cancel(save.key(undefined));
const clearAction: MachineAction<typeof Nested> = {
  kind: "clear",
  targets: [[nestedProject, nestedProject.key(1)]],
};
const storeAction: MachineAction<typeof Nested> = {
  kind: "invalidate",
  targets: [[nestedProject, nestedProject.key(1)]],
};
const resourceActivity: MachineActivity<typeof Nested> = nestedProject.subscribe(1);
const streamActivity: MachineActivity<typeof Nested> = nestedUpdates.subscribe(1);
// @ts-expect-error continuing stream plans are not finite machine actions.
const streamAction: MachineAction<typeof Nested> = nestedUpdates.subscribe(1);
// @ts-expect-error finite resource plans are not machine activities.
const finiteResourceActivity: MachineActivity<typeof Nested> = nestedProject.lookup(1);
// @ts-expect-error operation descriptors are not machine activities.
const transactionActivity: MachineActivity<typeof Nested> = save;
// @ts-expect-error runtime-sized arrays are not machine activities.
const activityArray: MachineActivity<typeof Nested> = [resourceActivity];
// @ts-expect-error unknown plan kinds are not machine actions.
const unknownAction: MachineAction<typeof Nested> = { kind: "unknown" };
// @ts-expect-error store invalidation requires at least one exact resource target.
const emptyStoreAction: MachineAction<typeof Nested> = { kind: "invalidate", targets: [] };
const transactionStoreAction: MachineAction<typeof Nested> = {
  kind: "invalidate",
  // @ts-expect-error transaction descriptors cannot be invalidated.
  targets: [[save, save.key()]],
};
const wrongKeyStoreAction: MachineAction<typeof Nested> = {
  kind: "invalidate",
  // @ts-expect-error the key tuple must match the resource descriptor.
  targets: [[nestedProject, [1, 2]]],
};

void resourceAction;
void resourceRefetchAction;
void resourceSetDataAction;
void resourceCancelAction;
void transactionAction;
void transactionCancelAction;
void clearAction;
void storeAction;
void resourceActivity;
void streamActivity;
void streamAction;
void transactionActivity;
void finiteResourceActivity;
void activityArray;
void unknownAction;
void emptyStoreAction;
void transactionStoreAction;
void wrongKeyStoreAction;

const nestedMachine = resultSuccess(
  machine(NestedResult, ({ S, E, O, onContext, onMemory, invalidate }) => {
    onContext.select(
      ({ state }) => state,
      (current) => (current === S.idle ? resultSuccess(E.tick()) : null),
    );
    onMemory(({ memory }) => nestedProject.subscribe(memory.count));
    onMemory.select(
      ({ memory }) => memory.count,
      (current, previous) => (current === previous ? nestedProject.subscribe(current) : null),
    );

    return {
      default: S.idle,
      on: {
        tick: {
          target: S.idle,
          guard: ({ event }) => {
            // @ts-expect-error bare events expose no payload fields
            return event.value === undefined;
          },
        },
      },
      states: {
        idle: {},
        active: {
          default: S.active.S.editing,
          timers: {
            refresh: {
              delay: 100,
              target: E.tick,
              guard: ({ timer }) => timer.name === "refresh" && timer.startedAt <= timer.dueAt,
              updateMemory: ({ timer }) => ({ count: timer.name.length }),
            },
          },
          states: {
            editing: {
              on: {
                changed: {
                  target: S.active.S.editing,
                  guard: ({ event }) => event.value.length > 0,
                  updateMemory: ({ event }) => ({ count: event.value.length }),
                  actions: ({ memory }) => [invalidate([O.project, O.project.key(memory.count)])],
                  reenter: S.active.S.editing,
                },
              },
            },
            dialog: {
              default: S.active.S.dialog.S.open,
              states: {
                open: {},
                closed: {
                  redirect: {
                    when: ({ state, memory, snapshot }) =>
                      state === snapshot.state && memory.count >= 0,
                    target: S.idle,
                  },
                },
              },
            },
          },
        },
      },
    };
  }),
);

const validNestedConfiguration = () => ({
  default: Nested.S.idle,
  states: {
    idle: {},
    active: {
      default: Nested.S.active.S.editing,
      states: {
        editing: {},
        dialog: {
          default: Nested.S.active.S.dialog.S.open,
          states: { open: {}, closed: {} },
        },
      },
    },
  },
});

const transitionWithExtraKind = {
  target: Nested.S.active.S.editing,
  kind: "transition",
};

const invalidTransitionConfiguration = {
  ...validNestedConfiguration(),
  states: {
    ...validNestedConfiguration().states,
    active: {
      ...validNestedConfiguration().states.active,
      states: {
        ...validNestedConfiguration().states.active.states,
        editing: { on: { changed: transitionWithExtraKind } },
      },
    },
  },
};

const invalidCompoundConfiguration = {
  ...validNestedConfiguration(),
  states: {
    ...validNestedConfiguration().states,
    active: { ...validNestedConfiguration().states.active, unexpected: true },
  },
};

const timerWithActions = {
  delay: 100,
  target: Nested.E.tick,
  actions: [],
};

const invalidTimerConfiguration = {
  ...validNestedConfiguration(),
  states: {
    ...validNestedConfiguration().states,
    active: {
      ...validNestedConfiguration().states.active,
      timers: { refresh: timerWithActions },
    },
  },
};

const invalidGrammarProofs = () => {
  // @ts-expect-error transitions admit no extra kind field
  machine(NestedResult, () => invalidTransitionConfiguration);
  // @ts-expect-error compound state configuration admits only its defined keys
  machine(NestedResult, () => invalidCompoundConfiguration);
  // @ts-expect-error timer configuration admits no finite actions
  machine(NestedResult, () => invalidTimerConfiguration);
};

void invalidGrammarProofs;

const expectCompoundState = (state: CompiledState<typeof Nested>) => {
  if (state.kind !== "compound") throw new Error("expected a compound compiled state");
  return state;
};

const expectLeafState = (state: CompiledState<typeof Nested>) => {
  if (state.kind !== "leaf") throw new Error("expected a leaf compiled state");
  return state;
};

describe("machine", () => {
  describe("publication and callback laws", () => {
    it("keeps nominal identity and exact authored values", () => {
      assert.strictEqual(isConstructedMachine(editorMachine), true);
      assert.strictEqual(isConstructedMachine({ ...editorMachine }), false);
      let hasTrapCalls = 0;
      const proxiedMachine = new Proxy(editorMachine, {
        has: () => {
          hasTrapCalls += 1;
          return true;
        },
      });
      assert.strictEqual(isConstructedMachine(proxiedMachine), false);
      assert.strictEqual(hasTrapCalls, 0);
      const revokedMachine = Proxy.revocable(editorMachine, {});
      revokedMachine.revoke();
      assert.strictEqual(isConstructedMachine(revokedMachine.proxy), false);
      assert.strictEqual(editorMachine.definition, Editor);
      assert.strictEqual(editorMachine.compiled.states["S.ready"]?.kind, "leaf");
      assert.deepStrictEqual(Object.keys(nestedMachine.compiled.states), [
        "",
        "S.idle",
        "S.active",
        "S.active.S.editing",
        "S.active.S.dialog",
        "S.active.S.dialog.S.open",
        "S.active.S.dialog.S.closed",
      ]);
    });

    it("keeps machine authoring inert", () => {
      let initializerCalls = 0;
      let eventCalls = 0;
      let selectorCalls = 0;
      let contextHandlerCalls = 0;
      let memoryPlanCalls = 0;
      let memorySelectorCalls = 0;
      let memorySelectionHandlerCalls = 0;
      const sourceResult = definition({
        id: "inert",
        states: ["ready"],
        events: {
          changed: () => {
            eventCalls += 1;
            return {};
          },
        },
        memory: (_options: { readonly input: void }) => {
          initializerCalls += 1;
          return { ready: true };
        },
      });
      const source = resultSuccess(sourceResult);
      const result = resultSuccess(
        machine(sourceResult, ({ S, onContext, onMemory }) => {
          onContext.select(
            () => {
              selectorCalls += 1;
              return S.ready;
            },
            () => {
              contextHandlerCalls += 1;
              return null;
            },
          );
          onMemory(() => {
            memoryPlanCalls += 1;
            return null;
          });
          onMemory.select(
            ({ memory }) => {
              memorySelectorCalls += 1;
              return memory.ready;
            },
            () => {
              memorySelectionHandlerCalls += 1;
              return null;
            },
          );
          return {
            default: S.ready,
            states: {
              ready: {
                on: {
                  changed: { target: S.ready },
                },
              },
            },
          };
        }),
      );
      assert.strictEqual(
        result.compiled.states["S.ready"]?.handlers.changed?.[0]?.target,
        source.S.ready,
      );
      assert.deepStrictEqual(
        [
          initializerCalls,
          eventCalls,
          selectorCalls,
          contextHandlerCalls,
          memoryPlanCalls,
          memorySelectorCalls,
          memorySelectionHandlerCalls,
        ],
        [0, 0, 0, 0, 0, 0, 0],
      );
      assert.strictEqual(result.compiled.memory[1]?.kind, "selection");
    });

    it("retains callable selection registrations", () => {
      const contextRegistration = nestedMachine.compiled.context[0];
      if (contextRegistration === undefined) throw new Error("expected a context selection");
      assert.deepStrictEqual(Object.keys(contextRegistration), ["use"]);
      const event = contextRegistration.use((select, handler) =>
        handler(select({ state: Nested.S.idle, memory: { count: 0 }, context: {} }), undefined),
      );
      if (event === null || event === false) throw new Error("expected a selected event");
      assert.strictEqual(event.type, resultSuccess(Nested.E.tick()).type);

      const memoryRegistration = nestedMachine.compiled.memory.find(
        (registration) => registration.kind === "selection",
      );
      if (memoryRegistration === undefined) throw new Error("expected a memory selection");
      assert.deepStrictEqual(Object.keys(memoryRegistration), ["kind", "use"]);
      const plan = memoryRegistration.use((select, handler) =>
        handler(select({ state: Nested.S.idle, memory: { count: 1 }, context: {} }), undefined),
      );
      assert.strictEqual(plan, null);
    });

    it("owns registration arrays at publication", () => {
      let registerContextLater = () => {};
      let registerMemoryLater = () => {};
      let registerMemorySelectionLater = () => {};
      const source = definition({ id: "registration", states: ["idle"], events: {} });
      const result = machine(source, ({ S, onContext, onMemory }) => {
        onContext.select(
          ({ state }) => state,
          () => null,
        );
        onMemory(() => null);
        onMemory.select(
          ({ state }) => state,
          () => null,
        );
        registerContextLater = () =>
          onContext.select(
            ({ state }) => state,
            () => null,
          );
        registerMemoryLater = () => onMemory(() => null);
        registerMemorySelectionLater = () =>
          onMemory.select(
            ({ state }) => state,
            () => null,
          );
        return { default: S.idle, states: { idle: {} } };
      });
      const compiled = resultSuccess(result).compiled;
      assert.strictEqual(compiled.context.length, 1);
      assert.strictEqual(compiled.memory.length, 2);

      registerContextLater();
      registerMemoryLater();
      registerMemorySelectionLater();

      assert.strictEqual(compiled.context.length, 1);
      assert.strictEqual(compiled.memory.length, 2);
    });

    it("matches Definition Results and invokes only successful callbacks", () => {
      let successCallbackCalls = 0;
      const successfulMachine = machine(EditorResult, ({ S }) => {
        successCallbackCalls += 1;
        return { default: S.ready, states: { ready: {} } };
      });
      assert.strictEqual(successCallbackCalls, 1);
      if (Result.isFailure(successfulMachine)) throw successfulMachine.failure;
      assert.strictEqual(successfulMachine.success.definition, Editor);

      const definitionFailure = Result.map(
        definition({ id: "failed-definition", states: [], events: {} }),
        () => Editor,
      );
      if (Result.isSuccess(definitionFailure)) throw new Error("expected Definition failure");
      let callbackCalls = 0;
      const machineResult = machine(definitionFailure, () => {
        callbackCalls += 1;
        throw new Error("machine callback must not run");
      });
      assert.strictEqual(callbackCalls, 0);
      if (Result.isSuccess(machineResult)) throw new Error("expected machine failure");
      assert.strictEqual(machineResult.failure, definitionFailure.failure);
    });
  });

  describe("compiled behavior identity", () => {
    it("retains activity identity", () => {
      const states = nestedMachine.compiled.states;
      const stateAt = (key: string) => {
        const state = states[key];
        if (state === undefined) throw new Error(`missing compiled state: ${key}`);
        return state;
      };
      const root = expectCompoundState(stateAt(""));
      const active = expectCompoundState(stateAt("S.active"));
      const dialog = expectCompoundState(stateAt("S.active.S.dialog"));
      const editing = expectLeafState(stateAt("S.active.S.editing"));
      const changed = editing.handlers.changed?.[0];
      const refresh = active.timers.refresh;
      if (changed === undefined || refresh === undefined)
        throw new Error("compiled behavior is incomplete");

      assert.strictEqual(root.default, Nested.S.idle);
      assert.strictEqual(active.default, Nested.S.active.S.editing);
      assert.strictEqual(dialog.default, Nested.S.active.S.dialog.S.open);
      assert.strictEqual(editing.state, Nested.S.active.S.editing);
      assert.deepStrictEqual(editing.children, []);
      assert.strictEqual(root.handlers.tick?.[0]?.target, Nested.S.idle);
      assert.strictEqual(changed.target, Nested.S.active.S.editing);
      assert.strictEqual(refresh.target, Nested.E.tick);
      assert.deepStrictEqual(active.activities, {});
      assert.strictEqual(nestedMachine.compiled.context.length, 1);
      assert.strictEqual(nestedMachine.compiled.memory.length, 2);
    });

    it("preserves punctuation and prototype-like names", () => {
      const sourceResult = definition({
        id: "named",
        states: ["a.S.b", { a: ["b"] }, "S", "constructor", "__proto__", "toString"],
        events: {
          tick: "bare",
          constructor: "bare",
          ["__proto__"]: "bare",
          toString: "bare",
        },
      });
      const result = resultSuccess(
        machine(sourceResult, ({ S, E }) => ({
          default: S["a.S.b"],
          states: {
            ["a.S.b"]: {},
            a: { default: S.a.S.b, states: { b: {} } },
            S: {},
            constructor: { timers: { ["__proto__"]: { delay: 1, target: E["__proto__"] } } },
            ["__proto__"]: {},
            toString: {},
          },
        })),
      );
      assert.ok(result.compiled.states['@["a.S.b"]']);
      assert.ok(Object.hasOwn(result.compiled.states["S.constructor"]?.timers ?? {}, "__proto__"));
    });

    it("keeps authored callback defects as synchronous defects", () => {
      const failure = new Error("machine callback failed");
      assert.throws(
        () =>
          machine(NestedResult, () => {
            throw failure;
          }),
        failure,
      );
    });
  });
});
