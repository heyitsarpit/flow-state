import { assert, describe, it } from "@effect/vitest";
import { Result } from "effect";

import { definition } from "../../definition/definition.js";
import * as Diagnostic from "../../diagnostic/diagnostic.js";
import {
  isConstructedMachine,
  machine,
  machineResult,
  type CompiledRedirect,
  type CompiledTimer,
  type CompiledTransition,
  type MachineConfiguration,
} from "../machine.js";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;

type Expect<Value extends true> = Value;

const definitionSuccess = <Value>(result: Diagnostic.Result<Value>): Value => {
  if (Result.isFailure(result)) throw result.failure;
  return result.success;
};

const eventSuccess = <Value>(result: Diagnostic.Result<Value>): Value => definitionSuccess(result);

const Editor = definitionSuccess(
  definition({
    id: "editor",
    states: ["ready"],
    events: {
      opened: (draftId: string) => ({ draftId }),
    },
    operations: { save: { kind: "save" } },
  }),
);

const OtherEditor = definitionSuccess(
  definition({
    id: "other-editor",
    states: ["ready"],
    events: {
      opened: (draftId: string) => ({ draftId }),
    },
  }),
);

const editorMachine = machine(Editor, ({ S, E, O }) => {
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
});

type _DefinitionIdentity = Expect<Equal<typeof editorMachine.definition, typeof Editor>>;
type _StateToken = Expect<Equal<typeof editorMachine.config.default, typeof Editor.S.ready>>;

const editorGuard = (
  _input: Parameters<NonNullable<CompiledTransition<typeof Editor, "opened">["guard"]>>[0],
): boolean => true;
type _CompiledGuard = Expect<
  Equal<NonNullable<CompiledTransition<typeof Editor, "opened">["guard"]>, typeof editorGuard>
>;
type _CompiledRedirect = Expect<
  Equal<CompiledRedirect<typeof Editor>["target"], typeof Editor.S.ready>
>;
type _CompiledTimerTarget = Expect<
  Equal<CompiledTimer<typeof Editor>["target"], typeof Editor.E.opened>
>;

const typeProofs: readonly [
  _DefinitionIdentity,
  _StateToken,
  _CompiledGuard,
  _CompiledRedirect,
  _CompiledTimerTarget,
] = [true, true, true, true, true];
void typeProofs;

const negativeProofs = (): void => {
  const definitionImpostor = {
    id: Editor.id,
    S: Editor.S,
    E: Editor.E,
    operations: Editor.operations,
  };

  // @ts-expect-error hand-written structural values are not constructed definitions
  machine(definitionImpostor, ({ S }) => ({ default: S.ready, states: { ready: {} } }));

  machine(Editor, ({ S }) => {
    // @ts-expect-error a machine cannot use a state from another definition
    const foreignDefault: typeof S.ready = OtherEditor.S.ready;
    void foreignDefault;

    return { default: S.ready, states: { ready: {} } };
  });

  machine(Editor, ({ E }) => {
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

const Nested = definitionSuccess(
  definition({
    id: "nested-editor",
    states: ["idle", { active: ["editing", { dialog: ["open", "closed"] }] }],
    events: {
      changed: (value: string) => ({ value }),
      tick: "bare",
    },
    operations: { save: { kind: "save" } },
    memory: (_options: { readonly input: { readonly draftId: string } }) => ({ count: 0 }),
  }),
);

const callableActivity = () => ({ kind: "activity" as const });

const nestedMachine = machine(
  Nested,
  ({ S, E, O, onContext, onMemory, invalidate, clear }): MachineConfiguration<typeof Nested> => {
    onContext.select(
      ({ state }) => state,
      (current) => (current === S.idle ? eventSuccess(E.tick()) : null),
    );
    onMemory(({ memory }) => invalidate([memory.count]));
    onMemory.select(
      ({ memory }) => memory.count,
      (current, previous) => (current === previous ? clear([current]) : null),
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
          activities: { save: O.save, callable: callableActivity },
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
                  actions: ({ memory }) => [invalidate([memory.count])],
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
  },
);

const validNestedConfiguration = (): MachineConfiguration<typeof Nested> => ({
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

const invalidGrammarProofs = (): void => {
  // @ts-expect-error transitions admit no extra kind field
  machine(Nested, () => invalidTransitionConfiguration);
  // @ts-expect-error compound state configuration admits only its defined keys
  machine(Nested, () => invalidCompoundConfiguration);
  // @ts-expect-error timer configuration admits no finite actions
  machine(Nested, () => invalidTimerConfiguration);
};

void invalidGrammarProofs;

const assertMachineFailure = (
  result: Diagnostic.Result<unknown>,
  reason:
    | "InvalidTimerDelay"
    | "AmbiguousHandler"
    | "ExtraStateConfigurationKey"
    | "ExtraTransitionKey"
    | "ExtraTimerKey"
    | "ForbiddenTimerActions",
  path: Diagnostic.Path,
): void => {
  if (Result.isSuccess(result)) throw new Error("expected a machine diagnostic");
  assert.strictEqual(result.failure._tag, "Diagnostic");
  assert.strictEqual(result.failure.code, "InvalidMachineConfiguration");
  assert.deepStrictEqual(result.failure.path, path);
  assert.strictEqual(result.failure.details.reason, reason);
  if (reason === "InvalidTimerDelay") {
    assert.strictEqual(result.failure.details.constraint, "finite-non-negative");
  } else if (reason === "AmbiguousHandler") {
    assert.strictEqual(result.failure.details.event, "tick");
  } else {
    assert.strictEqual(result.failure.details.key, path.at(-1));
  }
};

describe("machine", () => {
  it("keeps nominal identity and exact authored values", () => {
    assert.strictEqual(isConstructedMachine(editorMachine), true);
    assert.strictEqual(isConstructedMachine({ ...editorMachine }), false);
    assert.strictEqual(editorMachine.definition, Editor);
    assert.strictEqual(editorMachine.config.default, Editor.S.ready);
  });

  it("keeps machine authoring inert", () => {
    let initializerCalls = 0;
    let eventCalls = 0;
    let selectorCalls = 0;
    let memoryPlanCalls = 0;

    const source = definitionSuccess(
      definition({
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
      }),
    );

    const result = machine(source, ({ S, onContext, onMemory }) => {
      onContext.select(
        () => {
          selectorCalls += 1;
          return S.ready;
        },
        () => null,
      );
      onMemory(() => {
        memoryPlanCalls += 1;
        return null;
      });
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
    });

    assert.strictEqual(
      result.compiled.states["S.ready"]?.handlers.changed?.[0]?.target,
      source.S.ready,
    );
    assert.deepStrictEqual(
      [initializerCalls, eventCalls, selectorCalls, memoryPlanCalls],
      [0, 0, 0, 0],
    );
  });

  it("retains activity identity", () => {
    const states = nestedMachine.compiled.states;
    const root = states[""];
    const active = states["S.active"];
    const dialog = states["S.active.S.dialog"];
    const editing = states["S.active.S.editing"];
    if (
      root === undefined ||
      active === undefined ||
      dialog === undefined ||
      editing === undefined
    ) {
      throw new Error("compiled state table is incomplete");
    }
    const changed = editing.handlers.changed?.[0];
    const refresh = active.timers.refresh;
    if (changed === undefined || refresh === undefined)
      throw new Error("compiled behavior is incomplete");

    assert.strictEqual(root.default, Nested.S.idle);
    assert.strictEqual(active.default, Nested.S.active.S.editing);
    assert.strictEqual(dialog.default, Nested.S.active.S.dialog.S.open);
    assert.strictEqual(root.handlers.tick?.[0]?.target, Nested.S.idle);
    assert.strictEqual(changed.target, Nested.S.active.S.editing);
    assert.strictEqual(refresh.target, Nested.E.tick);
    assert.strictEqual(active.activities.callable, callableActivity);
    assert.strictEqual(nestedMachine.compiled.context.length, 1);
    assert.strictEqual(nestedMachine.compiled.memory.length, 2);
  });

  it("preserves punctuation and prototype-like names", () => {
    const source = definitionSuccess(
      definition({
        id: "named",
        states: ["a.S.b", { a: ["b"] }, "S", "constructor", "__proto__", "toString"],
        events: {
          tick: "bare",
          constructor: "bare",
          ["__proto__"]: "bare",
          toString: "bare",
        },
      }),
    );
    const result = machine(source, ({ S, E }) => ({
      default: S["a.S.b"],
      states: {
        ["a.S.b"]: {},
        a: { default: S.a.S.b, states: { b: {} } },
        S: {},
        constructor: { timers: { ["__proto__"]: { delay: 1, target: E["__proto__"] } } },
        ["__proto__"]: {},
        toString: {},
      },
    }));
    assert.ok(result.compiled.states['@["a.S.b"]']);
    assert.ok(Object.hasOwn(result.compiled.states["S.constructor"]?.timers ?? {}, "__proto__"));
  });

  it("returns a typed failure for a non-finite or negative timer delay", () => {
    const invalid = (): MachineConfiguration<typeof Nested> => ({
      ...validNestedConfiguration(),
      states: {
        ...validNestedConfiguration().states,
        active: {
          ...validNestedConfiguration().states.active,
          timers: { refresh: { delay: Number.NaN, target: Nested.E.tick } },
        },
      },
    });
    const result = machineResult(Nested, () => invalid());
    assertMachineFailure(result, "InvalidTimerDelay", [
      "states",
      "active",
      "timers",
      "refresh",
      "delay",
    ]);

    assert.throws(
      () =>
        machine(Nested, () => ({
          ...validNestedConfiguration(),
          states: {
            ...validNestedConfiguration().states,
            active: {
              ...validNestedConfiguration().states.active,
              timers: { refresh: { delay: -1, target: Nested.E.tick } },
            },
          },
        })),
      Diagnostic.Error,
    );
  });

  it("returns a typed failure for ancestor and descendant handler ambiguity", () => {
    const result = machineResult(Nested, () => ({
      ...validNestedConfiguration(),
      on: { tick: Nested.S.idle },
      states: {
        ...validNestedConfiguration().states,
        idle: { on: { tick: Nested.S.idle } },
        active: {
          ...validNestedConfiguration().states.active,
          states: {
            editing: {},
            dialog: {
              default: Nested.S.active.S.dialog.S.open,
              states: { open: {}, closed: {} },
            },
          },
        },
      },
    }));
    assertMachineFailure(result, "AmbiguousHandler", ["states", "idle"]);
  });

  it("rejects extra state and behavior fields at their owning paths", () => {
    const extraRoot = validNestedConfiguration();
    Object.assign(extraRoot, { unexpected: true });
    assertMachineFailure(
      machineResult(Nested, () => extraRoot),
      "ExtraStateConfigurationKey",
      ["unexpected"],
    );

    const extraCompound = validNestedConfiguration();
    Object.assign(extraCompound.states.active, { unexpected: true });
    assertMachineFailure(
      machineResult(Nested, () => extraCompound),
      "ExtraStateConfigurationKey",
      ["states", "active", "unexpected"],
    );
  });

  it("rejects transition kind and timer action fields", () => {
    const extraTransition = validNestedConfiguration();
    Object.assign(extraTransition.states.active.states.editing, {
      on: {
        changed: Object.assign({ target: Nested.S.active.S.editing }, { kind: "transition" }),
      },
    });
    assertMachineFailure(
      machineResult(Nested, () => extraTransition),
      "ExtraTransitionKey",
      ["states", "active", "states", "editing", "on", "changed", "kind"],
    );

    const extraTimer = validNestedConfiguration();
    Object.assign(extraTimer.states.active, {
      timers: {
        refresh: Object.assign({ delay: 100, target: Nested.E.tick }, { actions: [] }),
      },
    });
    assertMachineFailure(
      machineResult(Nested, () => extraTimer),
      "ForbiddenTimerActions",
      ["states", "active", "timers", "refresh", "actions"],
    );
  });

  it("keeps authored callback defects as synchronous defects", () => {
    const failure = new Error("machine callback failed");
    assert.throws(
      () =>
        machine(Nested, () => {
          throw failure;
        }),
      failure,
    );
  });
});
