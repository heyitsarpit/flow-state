import { assert, describe, it } from "@effect/vitest";
import { Effect, Predicate, Result, type Types } from "effect";

import { constructDefinitionResult } from "../construction.js";
import { definition } from "../definition.js";
import * as Diagnostic from "../../diagnostic/diagnostic.js";
import type { EventOf, InputOf, MemoryOf, StateOf } from "../definition.js";
import type {
  ContextOf,
  DefinitionValue,
  EmptyMemory,
  DefinitionConfig,
  OperationsOf,
  StateDeclaration,
} from "../domain.js";
import { isWellFormedFallback, isWellFormedText, utf8ByteLength } from "../../internal/utf8.js";
import { isConstructedOperation, readOperationAdapter } from "../../operation/operation.js";
import { resource } from "../../operation/resource.js";

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

type ResultSuccess<Value> = Value extends Result.Result<infer Success, unknown> ? Success : never;

const definitionSuccess = <Value>(result: Result.Result<Value, Diagnostic.PublicDiagnostic>) => {
  if (Result.isFailure(result)) throw result.failure;
  return result.success;
};

const Session = definitionSuccess(
  definition({
    id: "session",
    states: ["signed-out", { active: ["editing", "saving"] }],
    events: { signedOut: "bare" },
    memory: ({ input: _input }: { readonly input: void }) => ({ mode: "dark" }),
  }),
);

const OtherSession = definitionSuccess(
  definition({
    id: "other-session",
    states: ["signed-out"],
    events: {},
    memory: ({ input: _input }: { readonly input: void }) => ({ mode: "dark" }),
  }),
);

const editorSave = resource({
  id: "editor/save",
  key: (draftId: string) => [draftId] as const,
  lookup: (draftId: string) => Effect.succeed(draftId),
});

const Editor = definitionSuccess(
  definition({
    id: "editor",
    states: ["ready", { active: ["editing", "submitting"] }],
    events: {
      opened: (draftId: string, revision: number) => ({ draftId, revision }),
      closed: "bare",
    },
    context: {
      sessionState: Session.select(({ state }) => state),
      sessionMode: Session.select(({ memory }) => memory.mode),
    },
    operations: { save: editorSave },
    memory: ({ input }: { readonly input: { readonly draftId: string } }) => ({
      draftId: input.draftId,
      dirty: false,
    }),
  }),
);

const EmptyDefinition = definitionSuccess(
  definition({ id: "empty", states: ["ready"], events: {} }),
);

const ZeroArgumentDefinition = definitionSuccess(
  definition({
    id: "zero-argument",
    states: ["ready"],
    events: {},
    memory: () => ({ count: 0 }),
  }),
);

const AnnotatedInputDefinition = definitionSuccess(
  definition({
    id: "annotated-input",
    states: ["ready"],
    events: {},
    memory: ({ input }: { readonly input: { readonly key: string } }) => ({
      key: input.key,
    }),
  }),
);

const SpecialNameDefinition = definitionSuccess(
  definition({
    id: "collision",
    states: ["a.S.b", { a: ["b"] }, "S"],
    events: {},
  }),
);

export type _Id = Expect<Types.Equals<typeof Editor.id, "editor">>;

export type _State = Expect<
  Types.Equals<
    StateOf<typeof Editor>,
    typeof Editor.S.ready | typeof Editor.S.active.S.editing | typeof Editor.S.active.S.submitting
  >
>;

export type _Event = Expect<
  Types.Equals<
    EventOf<typeof Editor>,
    | ResultSuccess<ReturnType<typeof Editor.E.opened>>
    | ResultSuccess<ReturnType<typeof Editor.E.closed>>
  >
>;

export type _Input = Expect<Types.Equals<InputOf<typeof Editor>, { readonly draftId: string }>>;

export type _Memory = Expect<
  Types.Equals<MemoryOf<typeof Editor>, { draftId: string; dirty: boolean }>
>;

export type _ContextState = Expect<
  Types.Equals<ContextOf<typeof Editor>["sessionState"], StateOf<typeof Session>>
>;

export type _ContextMemory = Expect<Types.Equals<ContextOf<typeof Editor>["sessionMode"], string>>;

export type _Operations = Expect<Types.Equals<keyof OperationsOf<typeof Editor>, "save">>;

export type _EmptyInput = Expect<Types.Equals<InputOf<typeof Session>, void>>;

export type _EmptyMemory = Expect<Types.Equals<MemoryOf<typeof Session>, { mode: string }>>;

export type _NoInitializer = Expect<Types.Equals<MemoryOf<typeof EmptyDefinition>, EmptyMemory>>;

export type _NoInitializerInput = Expect<Types.Equals<InputOf<typeof EmptyDefinition>, void>>;

export type _ZeroArgumentInput = Expect<Types.Equals<InputOf<typeof ZeroArgumentDefinition>, void>>;

export type _ZeroArgumentMemory = Expect<
  Types.Equals<MemoryOf<typeof ZeroArgumentDefinition>, { count: number }>
>;

export type _AnnotatedInput = Expect<
  Types.Equals<InputOf<typeof AnnotatedInputDefinition>, { readonly key: string }>
>;

export type _AnnotatedMemory = Expect<
  Types.Equals<MemoryOf<typeof AnnotatedInputDefinition>, { key: string }>
>;

export type _SpecialStateId = Expect<
  Types.Equals<
    (typeof SpecialNameDefinition.S)["a.S.b"]["id"],
    `S|${number}:collision|${number}:${number}:a.S.b`
  >
>;

export type _NestedStateId = Expect<
  Types.Equals<
    (typeof SpecialNameDefinition.S.a.S.b)["id"],
    `S|${number}:collision|${number}:S.a.S.b`
  >
>;

const negativeProofs = () => {
  const sessionSelector = Session.select(({ memory }) => memory.mode);
  const otherSelector = OtherSession.select(({ memory }) => memory.mode);

  // @ts-expect-error selectors retain their originating definition
  const cross: typeof sessionSelector = otherSelector;
  void cross;

  // @ts-expect-error unknown state names are rejected
  void Editor.S.unknown;

  // @ts-expect-error event arguments retain their authored tuple
  Editor.E.opened("draft", "wrong");

  const acceptEvent = (event: EventOf<typeof Editor>) => void event;
  // @ts-expect-error event envelopes are nominal
  acceptEvent({ type: Editor.E.closed.id });

  const acceptState = (state: StateOf<typeof Editor>) => void state;
  // @ts-expect-error state tokens are nominal
  acceptState({ kind: "state", name: "S.ready", id: Editor.S.ready.id });

  // @ts-expect-error derived context is readonly
  Editor.context.sessionMode = Session.select(({ memory }) => memory.mode);

  definition({
    id: "bad-memory",
    states: ["ready"],
    events: {},
    // @ts-expect-error initializers return memory objects
    memory: (_options: { readonly input: string }) => "not-memory",
  });

  definition({
    id: "bad-event",
    states: ["ready"],
    // @ts-expect-error event factories return payload objects
    events: { invalid: () => "not-payload" },
  });
};

void negativeProofs;

const namedDefinition = (name: string) =>
  definitionSuccess(
    definition({
      id: name,
      states: [name],
      events: { [name]: "bare" },
      context: { [name]: Session.select(({ state }) => state) },
      operations: {
        [name]: resource({
          id: name,
          key: () => [] as const,
          lookup: () => Effect.succeed(name),
        }),
      },
    }),
  );

const diagnosticFrom = <Value>(result: Result.Result<Value, Diagnostic.PublicDiagnostic>) => {
  if (Result.isFailure(result) && result.failure instanceof Diagnostic.Diagnostic) {
    return result.failure;
  }
  throw new Error("expected a diagnostic result");
};

type DiagnosticExpectation = Pick<Diagnostic.Diagnostic, "code" | "path" | "details"> &
  Partial<Pick<Diagnostic.Diagnostic, "classification" | "summary" | "help">>;

const assertDiagnosticError = (error: Diagnostic.Diagnostic, expected: DiagnosticExpectation) => {
  assert.deepStrictEqual(
    {
      _tag: error._tag,
      classification: error.classification,
      code: error.code,
      path: error.path,
      details: error.details,
    },
    {
      _tag: "Diagnostic",
      classification: expected.classification ?? "Failure",
      code: expected.code,
      path: expected.path,
      details: expected.details,
    },
  );
  assert.ok(error.summary.length > 0);
  assert.ok(error.help.length > 0);
  if (expected.summary !== undefined) assert.strictEqual(error.summary, expected.summary);
  if (expected.help !== undefined) assert.strictEqual(error.help, expected.help);
};

const assertDiagnostic = <Value>(
  result: Result.Result<Value, Diagnostic.PublicDiagnostic>,
  expected: Pick<Diagnostic.Diagnostic, "code" | "path" | "details">,
) => {
  assertDiagnosticError(diagnosticFrom(result), expected);
};

const makeNestedStates = (depth: number) => {
  let states: readonly StateDeclaration[] = ["leaf"];
  for (let level = depth; level > 0; level -= 1) {
    states = [{ ["level" + level]: states }];
  }
  return states;
};

const acceptedAuthoredNames = [
  "a".repeat(256),
  "é".repeat(128),
  "€".repeat(85) + "a",
  "😀".repeat(64),
  "__proto__",
  "café",
  "cafe\u0301",
];

const rejectedAuthoredNames = [
  "",
  "a".repeat(257),
  "bad\u0000name",
  "bad\u007fname",
  "\uD800",
  "\uDC00",
];

const assertAcceptedAuthoredName = (name: string) => {
  const value = namedDefinition(name);
  assert.strictEqual(value.id, name);
  assert.strictEqual(value.states[0], name);
  assert.strictEqual(value.E[name]?.name, name);
  assert.strictEqual(value.context[name]?.provider.id, "session");
  assert.strictEqual(Object.hasOwn(value.operations, name), true);
  if (name !== "__proto__") return;

  const state = value.S[name];
  if (state === undefined || !("kind" in state)) throw new Error("Expected an own state token");
  assert.strictEqual(Object.hasOwn(value.S, name), true);
  assert.strictEqual(state.name, "S.__proto__");
  assert.strictEqual(state.id, "S|9:__proto__|11:S.__proto__");
};

const assertRejectedAuthoredName = (name: string) => {
  const invalidDefinitions: readonly [readonly (string | number)[], DefinitionValue][] = [
    [["id"], { id: name, states: ["ready"], events: {} }],
    [["states", 0], { id: "valid", states: [name], events: {} }],
    [["events"], { id: "valid", states: ["ready"], events: { [name]: "bare" } }],
    [
      ["context"],
      {
        id: "valid",
        states: ["ready"],
        events: {},
        context: { [name]: Session.select(({ state }) => state) },
      },
    ],
    [
      ["operations"],
      {
        id: "valid",
        states: ["ready"],
        events: {},
        operations: { [name]: { kind: "operation" } },
      },
    ],
  ];
  for (const [path, input] of invalidDefinitions) {
    assertDiagnostic(constructDefinitionResult(input), {
      code: "SchemaValidation",
      path: path[0] === "operations" ? [...path, name] : path,
      details: { issue: "Composite" },
    });
  }
};

describe("definition", () => {
  describe("constructed values and ownership", () => {
    it("preserves exact definition types and compiles inert runtime tokens", () => {
      assert.strictEqual(Editor.id, "editor");
      assert.strictEqual(Editor.S.ready.name, "S.ready");
      assert.strictEqual(Editor.S.active.S.editing.name, "S.active.S.editing");
      assert.strictEqual(Editor.E.opened.name, "opened");
      assert.strictEqual(
        definitionSuccess(Editor.E.opened("draft", 3)).type,
        "E|6:editor|6:opened",
      );
      const closed = definitionSuccess(Editor.E.closed());
      assert.strictEqual(closed.type, "E|6:editor|6:closed");
      assert.deepStrictEqual(Object.keys(closed), ["type"]);
      assert.strictEqual(Editor.context.sessionState.provider, Session);
      assert.strictEqual(Editor.operations.save.kind, "resource");
    });

    it("owns decoded containers without invoking callbacks", () => {
      let initializerCalls = 0;
      let eventCalls = 0;
      let selectorCalls = 0;
      const states = ["ready"];
      const operation = resource({
        id: "copied/save",
        key: () => [] as const,
        lookup: () => Effect.succeed("saved"),
      });
      const selector = Session.select(() => {
        selectorCalls += 1;
        return "selected";
      });
      const source = {
        id: "copied",
        states,
        events: {
          changed: () => {
            eventCalls += 1;
            return {};
          },
        },
        context: {
          selected: selector,
        },
        operations: { save: operation },
        memory: ({ input }: { readonly input: { readonly id: string } }) => {
          initializerCalls += 1;
          return { id: input.id };
        },
      };

      const value = definitionSuccess(definition(source));
      const authoredEvent = source.events.changed;
      const authoredMemory = source.memory;
      source.id = "changed";
      states[0] = "changed";
      Reflect.set(source.events, "changed", undefined);
      Reflect.set(source.context, "selected", undefined);
      Reflect.set(source.operations, "save", undefined);

      assert.deepStrictEqual([initializerCalls, eventCalls, selectorCalls], [0, 0, 0]);
      assert.strictEqual(value.id, "copied");
      assert.strictEqual(value.states[0], "ready");
      assert.strictEqual(Predicate.isFunction(value.E.changed), true);
      assert.notStrictEqual(value.context, source.context);
      assert.strictEqual(value.context.selected, selector);
      assert.strictEqual(value.context.selected.provider, Session);
      assert.notStrictEqual(value.operations, source.operations);
      assert.strictEqual(value.operations.save, operation);
      assert.strictEqual(value.operations.save.kind, "resource");
      assert.strictEqual(Object.isFrozen(authoredEvent), false);
      assert.strictEqual(Object.isFrozen(authoredMemory), false);
      assert.strictEqual(Object.isFrozen(value.context.selected), false);
      assert.strictEqual(Object.isFrozen(value.context.selected.selector), false);
      assert.deepStrictEqual(authoredEvent(), {});
      assert.deepStrictEqual(authoredMemory({ input: { id: "runtime" } }), { id: "runtime" });
    });

    it("allocates independent empty declaration containers", () => {
      const first = definitionSuccess(
        definition({ id: "first-empty", states: ["ready"], events: {} }),
      );
      const second = definitionSuccess(
        definition({ id: "second-empty", states: ["ready"], events: {} }),
      );

      assert.notStrictEqual(first.context, second.context);
      assert.notStrictEqual(first.operations, second.operations);
      Reflect.set(
        first.context,
        "selected",
        Session.select(({ state }) => state),
      );
      Reflect.set(first.operations, "save", editorSave);
      assert.strictEqual(Object.hasOwn(second.context, "selected"), false);
      assert.strictEqual(Object.hasOwn(second.operations, "save"), false);
    });

    it("does not invoke a zero-argument memory initializer during construction", () => {
      let initializerCalls = 0;
      const memory = () => {
        initializerCalls += 1;
        return { count: 0 };
      };
      const value = definitionSuccess(
        definition({ id: "inert-zero-argument", states: ["ready"], events: {}, memory }),
      );

      assert.strictEqual(initializerCalls, 0);
      assert.strictEqual(value.memory, memory);
    });

    it("retains constructed operation descriptors by identity", () => {
      const lookup = (projectId: string) => Effect.succeed(projectId);
      const projectResource = resource({
        id: "definition/project",
        key: (projectId: string) => [projectId] as const,
        lookup,
      });
      const value = definitionSuccess(
        definition({
          id: "definition-with-operation",
          states: ["ready"],
          events: {},
          operations: { project: projectResource },
        }),
      );
      const retained = value.operations.project;

      assert.strictEqual(retained.kind, "resource");
      assert.strictEqual(retained.id, "definition/project");
      assert.strictEqual(retained, projectResource);
      assert.strictEqual(retained.lookup, projectResource.lookup);
      assert.strictEqual(readOperationAdapter(retained), lookup);
      assert.strictEqual(Object.isFrozen(value.operations), false);
      assert.strictEqual(isConstructedOperation(retained), true);
      assert.strictEqual(Reflect.set(retained, "id", "changed"), false);
      assert.strictEqual(Reflect.set(retained, "kind", "stream"), false);
      assert.strictEqual(retained.id, "definition/project");
      assert.strictEqual(retained.kind, "resource");
    });

    it("publishes readonly-by-type definition values without runtime freezing", () => {
      const event = definitionSuccess(Editor.E.opened("draft", 3));
      assert.strictEqual(event.draftId, "draft");
      assert.strictEqual(event.revision, 3);
      assert.strictEqual(event.type, "E|6:editor|6:opened");
      assert.strictEqual(Object.isFrozen(event), false);
      assert.strictEqual(Object.isFrozen(Editor), false);
      assert.strictEqual(Object.isFrozen(Editor.states), false);
      assert.strictEqual(Object.isFrozen(Editor.states[1]), false);
      assert.strictEqual(Object.isFrozen(Editor.S), false);
      assert.strictEqual(Object.isFrozen(Editor.S.ready), false);
      assert.strictEqual(Object.isFrozen(Editor.S.active), false);
      assert.strictEqual(Object.isFrozen(Editor.S.active.S), false);
      assert.strictEqual(Object.isFrozen(Editor.E), false);
      assert.strictEqual(Object.isFrozen(Editor.E.opened), false);
      assert.strictEqual(Object.isFrozen(Editor.context), false);
      assert.strictEqual(Object.isFrozen(Editor.context.sessionMode), false);
      assert.strictEqual(Object.isFrozen(Editor.operations), false);
      assert.strictEqual(Reflect.set(event, "draftId", "changed"), true);
      assert.strictEqual(event.draftId, "changed");
    });
  });

  describe("schema and authored-name admission", () => {
    it("uses Schema for ordinary invalid definition structure", () => {
      const invalidStates: readonly DefinitionValue[] = [
        ["same", "same"],
        [{ first: ["leaf"], second: ["leaf"] }],
        makeNestedStates(11),
      ];

      for (const states of invalidStates) {
        assertDiagnostic(constructDefinitionResult({ id: "invalid", states, events: {} }), {
          code: "SchemaValidation",
          path: ["states"],
          details: { issue: "Composite" },
        });
      }
      assertDiagnostic(constructDefinitionResult({ id: "invalid", states: [], events: {} }), {
        code: "SchemaValidation",
        path: ["states"],
        details: { issue: "Composite" },
      });
      assert.strictEqual(
        Result.isSuccess(definition({ id: "nested", states: makeNestedStates(10), events: {} })),
        true,
      );
    });

    it("preserves exact spelling and rejects invalid authored names", () => {
      for (const name of acceptedAuthoredNames) assertAcceptedAuthoredName(name);
      for (const name of rejectedAuthoredNames) assertRejectedAuthoredName(name);
      assert.notStrictEqual("café", "cafe\u0301");
    });

    it("keeps colliding state spellings distinct", () => {
      const value = SpecialNameDefinition;

      assert.notStrictEqual(value.S["a.S.b"].id, value.S.a.S.b.id);
      assert.strictEqual(value.S.S.id, "S|9:collision|3:1:S");
      assert.strictEqual(value.S["a.S.b"].id, "S|9:collision|7:5:a.S.b");
    });

    it("rejects malformed declaration containers", () => {
      let getterCalls = 0;
      const getterEvents = {};
      Object.defineProperty(getterEvents, "changed", {
        enumerable: true,
        get: () => {
          getterCalls += 1;
          return "bare";
        },
      });
      const hiddenEvents = {};
      Object.defineProperty(hiddenEvents, "changed", { value: "bare" });
      const invalidContainers: readonly [string, unknown][] = [
        ["events", new Date()],
        ["events", Object(Symbol("events"))],
        ["events", getterEvents],
        ["events", hiddenEvents],
        ["context", new Date()],
        ["context", Object(Symbol("context"))],
        ["operations", new Date()],
        ["operations", Object(Symbol("operations"))],
      ];

      for (const [field, container] of invalidContainers) {
        assertDiagnostic(
          constructDefinitionResult({
            id: "invalid-container",
            states: ["ready"],
            events: {},
            [field]: container,
          }),
          {
            code: "SchemaValidation",
            path: [field],
            details: { issue: "Composite" },
          },
        );
      }
      assert.strictEqual(getterCalls, 0);

      assert.strictEqual(
        Result.isSuccess(
          constructDefinitionResult({
            id: "own-fields",
            states: ["ready"],
            events: Object.assign(Object.create(null), { changed: "bare" }),
          }),
        ),
        true,
      );
    });

    it("preserves Schema field and list admission precedence", () => {
      const omitted = definitionSuccess(
        constructDefinitionResult({ id: "omitted", states: ["ready"], events: {} }),
      );
      const explicitUndefined = definitionSuccess(
        constructDefinitionResult({
          id: "explicit-undefined",
          states: ["ready"],
          events: {},
          context: undefined,
          operations: undefined,
        }),
      );
      assert.deepStrictEqual(explicitUndefined.context, {});
      assert.deepStrictEqual(explicitUndefined.operations, {});
      assert.notStrictEqual(omitted.context, explicitUndefined.context);
      assert.notStrictEqual(omitted.operations, explicitUndefined.operations);

      assertDiagnostic(constructDefinitionResult({ states: ["ready"], events: {} }), {
        code: "SchemaValidation",
        path: ["id"],
        details: { issue: "Composite" },
      });
      assertDiagnostic(
        constructDefinitionResult({ id: "wrong-events", states: ["ready"], events: 42 }),
        {
          code: "SchemaValidation",
          path: ["events"],
          details: { issue: "Composite" },
        },
      );
      assertDiagnostic(
        constructDefinitionResult({ id: "excess", states: ["ready"], events: {}, extra: true }),
        {
          code: "SchemaValidation",
          path: ["extra"],
          details: { issue: "Composite" },
        },
      );
      assertDiagnostic(constructDefinitionResult({ states: [42], events: {}, extra: true }), {
        code: "SchemaValidation",
        path: ["extra"],
        details: { issue: "Composite" },
      });
      assertDiagnostic(
        constructDefinitionResult({
          id: "invalid-later",
          states: ["ready", 42],
          events: {},
        }),
        {
          code: "SchemaValidation",
          path: ["states", 1],
          details: { issue: "Composite" },
        },
      );

      const sparseStates: unknown[] = [];
      sparseStates[1] = "ready";
      assertDiagnostic(
        constructDefinitionResult({ id: "sparse", states: sparseStates, events: {} }),
        {
          code: "SchemaValidation",
          path: ["states", 0],
          details: { issue: "Composite" },
        },
      );
    });

    it("rejects invalid nested event payload values", () => {
      const value = definitionSuccess(
        constructDefinitionResult({
          id: "nested-payload",
          states: ["ready"],
          events: {
            changed: () => ({ nested: { values: [new Date()] } }),
          },
        }),
      );
      const event = value.E.changed;
      if (!Predicate.isFunction(event)) throw new Error("Expected event constructor");

      assertDiagnostic(event(), {
        code: "SchemaValidation",
        path: ["nested"],
        details: { issue: "Composite" },
      });

      const registeredState = definitionSuccess(
        constructDefinitionResult({
          id: "registered-state-payload",
          states: ["ready"],
          events: { changed: () => ({ state: Editor.S.ready }) },
        }),
      );
      const registeredStateEvent = registeredState.E.changed;
      if (!Predicate.isFunction(registeredStateEvent))
        throw new Error("Expected event constructor");
      const registeredStatePayload = definitionSuccess(registeredStateEvent());
      assert.strictEqual(registeredStatePayload.state, Editor.S.ready);

      const forgedState = definitionSuccess(
        constructDefinitionResult({
          id: "forged-state-payload",
          states: ["ready"],
          events: {
            changed: () => ({
              state: { kind: "state", name: new Date(), id: new Date() },
            }),
          },
        }),
      );
      const forgedStateEvent = forgedState.E.changed;
      if (!Predicate.isFunction(forgedStateEvent)) throw new Error("Expected event constructor");
      assertDiagnostic(forgedStateEvent(), {
        code: "SchemaValidation",
        path: ["state"],
        details: { issue: "Composite" },
      });

      const symbolPayload = definitionSuccess(
        constructDefinitionResult({
          id: "symbol-payload",
          states: ["ready"],
          events: {
            changed: () => ({ [Symbol("invalid")]: "value" }),
          },
        }),
      );
      const symbolEvent = symbolPayload.E.changed;
      if (!Predicate.isFunction(symbolEvent)) throw new Error("Expected event constructor");
      assertDiagnostic(symbolEvent(), {
        code: "SchemaValidation",
        path: [],
        details: { issue: "Encoding" },
      });
    });

    it("rejects inherited operation declaration fields", () => {
      const operation = Object.create({ kind: "save" });
      assertDiagnostic(
        constructDefinitionResult({
          id: "inherited-operation",
          states: ["ready"],
          events: {},
          operations: { save: operation },
        }),
        {
          code: "SchemaValidation",
          path: ["operations", "save"],
          details: { issue: "Composite" },
        },
      );
    });

    it("validates declarations and event payload objects with Schema", () => {
      const invalidMarker = null;
      const invalidDefinitions: readonly [string, DefinitionValue, readonly (string | number)[]][] =
        [
          ["extra", { id: "extra", states: ["ready"], events: {}, extra: true }, ["extra"]],
          [
            "event",
            { id: "event", states: ["ready"], events: { changed: 42 } },
            ["events", "changed"],
          ],
          [
            "context",
            { id: "context", states: ["ready"], events: {}, context: { fake: {} } },
            ["context", "fake"],
          ],
          [
            "operation",
            { id: "operation", states: ["ready"], events: {}, operations: { save: {} } },
            ["operations", "save"],
          ],
          ["memory", { id: "memory", states: ["ready"], events: {}, memory: 42 }, ["memory"]],
          [
            "invalid-marker",
            { id: "invalid-marker", states: ["ready"], events: { changed: invalidMarker } },
            ["events", "changed"],
          ],
          [
            "unknown-marker",
            { id: "unknown-marker", states: ["ready"], events: { changed: "empty" } },
            ["events", "changed"],
          ],
        ];
      for (const [_field, input, path] of invalidDefinitions) {
        assertDiagnostic(constructDefinitionResult(input), {
          code: "SchemaValidation",
          path,
          details: { issue: "Composite" },
        });
      }

      const invalidPayloads = [() => ({ type: "reserved" }), () => new Date()];
      for (const [index, factory] of invalidPayloads.entries()) {
        const value = definitionSuccess(
          constructDefinitionResult({
            id: `event-${index}`,
            states: ["ready"],
            events: { changed: factory },
          }),
        );
        const event = value.E.changed;
        if (!Predicate.isFunction(event)) throw new Error("Expected event constructor");
        assertDiagnostic(event(), {
          code: "SchemaValidation",
          path: [],
          details: { issue: index === 0 ? "Composite" : "Encoding" },
        });
      }
    });
  });

  describe("diagnostic and callback boundaries", () => {
    it("returns the canonical diagnostic at the synchronous definition boundary", () => {
      // SAFETY: this fixture intentionally crosses the runtime decoder boundary with an unknown property.
      const invalid = {
        id: "invalid-definition",
        states: ["ready"],
        events: {},
        extra: true,
      } as DefinitionConfig;
      assertDiagnostic(definition(invalid), {
        code: "SchemaValidation",
        path: ["extra"],
        details: { issue: "Composite" },
      });
    });

    it("lets authored event callbacks throw their original exception", () => {
      const failure = new Error("event failed");
      const value = definitionSuccess(
        definition({
          id: "throwing-event",
          states: ["ready"],
          events: {
            changed: () => {
              throw failure;
            },
          },
        }),
      );
      const event = value.E.changed;
      if (!Predicate.isFunction(event)) throw new Error("Expected event constructor");
      assert.throws(() => event(), failure);
    });

    it("keeps native and fallback text validation in parity", () => {
      const values = ["plain", "é", "€", "😀", "\uD800", "\uDC00"];
      for (const value of values) {
        assert.strictEqual(isWellFormedText(value), isWellFormedFallback(value));
      }
      assert.deepStrictEqual(utf8ByteLength("😀".repeat(64), 256), Result.succeed(256));
      assert.deepStrictEqual(utf8ByteLength("a".repeat(257), 256), Result.fail("too-large"));
    });
  });
});
