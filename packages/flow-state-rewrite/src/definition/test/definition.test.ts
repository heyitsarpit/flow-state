import { assert, describe, it } from "@effect/vitest";
import { Predicate, Result } from "effect";

import { constructDefinitionResult } from "../construction.js";
import { definition } from "../definition.js";
import type * as Diagnostic from "../../diagnostic/diagnostic.js";
import type { EventOf, InputOf, MemoryOf, StateOf } from "../definition.js";
import type {
  ContextOf,
  DefinitionValue,
  EmptyMemory,
  DefinitionConfig,
  OperationsOf,
  StateDeclaration,
} from "../domain.js";
import { isWellFormedFallback, isWellFormedText, utf8ByteLength } from "../utf8.js";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;

type Expect<Value extends true> = Value;

type ResultSuccess<Value> = Value extends Result.Result<infer Success, unknown> ? Success : never;

const definitionSuccess = <Value>(result: Diagnostic.Result<Value>): Value => {
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
    operations: { save: { kind: "save" } },
    memory: ({ input }: { readonly input: { readonly draftId: string } }) => ({
      draftId: input.draftId,
      dirty: false,
    }),
  }),
);

const EmptyDefinition = definitionSuccess(
  definition({ id: "empty", states: ["ready"], events: {} }),
);

const SpecialNameDefinition = definitionSuccess(
  definition({
    id: "collision",
    states: ["a.S.b", { a: ["b"] }, "S"],
    events: {},
  }),
);

type _Id = Expect<Equal<typeof Editor.id, "editor">>;

type _State = Expect<
  Equal<
    StateOf<typeof Editor>,
    typeof Editor.S.ready | typeof Editor.S.active.S.editing | typeof Editor.S.active.S.submitting
  >
>;

type _Event = Expect<
  Equal<
    EventOf<typeof Editor>,
    | ResultSuccess<ReturnType<typeof Editor.E.opened>>
    | ResultSuccess<ReturnType<typeof Editor.E.closed>>
  >
>;

type _Input = Expect<Equal<InputOf<typeof Editor>, { readonly draftId: string }>>;

type _Memory = Expect<Equal<MemoryOf<typeof Editor>, { draftId: string; dirty: boolean }>>;

type _ContextState = Expect<
  Equal<ContextOf<typeof Editor>["sessionState"], StateOf<typeof Session>>
>;

type _ContextMemory = Expect<Equal<ContextOf<typeof Editor>["sessionMode"], string>>;

type _Operations = Expect<Equal<keyof OperationsOf<typeof Editor>, "save">>;

type _EmptyInput = Expect<Equal<InputOf<typeof Session>, void>>;

type _EmptyMemory = Expect<Equal<MemoryOf<typeof Session>, { mode: string }>>;

type _NoInitializer = Expect<Equal<MemoryOf<typeof EmptyDefinition>, EmptyMemory>>;

type _SpecialStateId = Expect<
  Equal<(typeof SpecialNameDefinition.S)["a.S.b"]["id"], `S|${number}:collision|${number}:5:a.S.b`>
>;

type _NestedStateId = Expect<
  Equal<(typeof SpecialNameDefinition.S.a.S.b)["id"], `S|${number}:collision|${number}:S.a.S.b`>
>;

type TypeProofs = readonly [
  _Id,
  _State,
  _Event,
  _Input,
  _Memory,
  _ContextState,
  _ContextMemory,
  _Operations,
  _EmptyInput,
  _EmptyMemory,
  _NoInitializer,
  _SpecialStateId,
  _NestedStateId,
];

const proofCount: TypeProofs["length"] = 13;
void proofCount;

const negativeProofs = (): void => {
  const sessionSelector = Session.select(({ memory }) => memory.mode);
  const otherSelector = OtherSession.select(({ memory }) => memory.mode);

  // @ts-expect-error selectors retain their originating definition
  const cross: typeof sessionSelector = otherSelector;
  void cross;

  // @ts-expect-error unknown state names are rejected
  void Editor.S.unknown;

  // @ts-expect-error event arguments retain their authored tuple
  Editor.E.opened("draft", "wrong");

  const acceptEvent = (event: EventOf<typeof Editor>): void => void event;
  // @ts-expect-error event envelopes are nominal
  acceptEvent({ type: Editor.E.closed.id });

  const acceptState = (state: StateOf<typeof Editor>): void => void state;
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
      operations: { [name]: { kind: "operation" } },
    }),
  );

const diagnosticFrom = <Value>(result: Diagnostic.Result<Value>): Diagnostic.Error => {
  if (Result.isFailure(result)) return result.failure;
  throw new Error("expected a diagnostic result");
};

type DiagnosticExpectation = Pick<Diagnostic.Error, "code" | "path" | "details"> &
  Partial<Pick<Diagnostic.Error, "summary" | "help">>;

const assertDiagnosticError = (error: Diagnostic.Error, expected: DiagnosticExpectation): void => {
  assert.deepStrictEqual(
    {
      _tag: error._tag,
      code: error.code,
      path: error.path,
      details: error.details,
    },
    {
      _tag: "Diagnostic",
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
  result: Diagnostic.Result<Value>,
  expected: Pick<Diagnostic.Error, "code" | "path" | "details">,
): void => {
  assertDiagnosticError(diagnosticFrom(result), expected);
};

const makeNestedStates = (depth: number): readonly StateDeclaration[] => {
  let states: readonly StateDeclaration[] = ["leaf"];
  for (let level = depth; level > 0; level -= 1) {
    states = [{ ["level" + level]: states }];
  }
  return states;
};

describe("definition", () => {
  it("preserves exact definition types and compiles inert runtime tokens", () => {
    assert.strictEqual(Editor.id, "editor");
    assert.strictEqual(Editor.S.ready.name, "S.ready");
    assert.strictEqual(Editor.S.active.S.editing.name, "S.active.S.editing");
    assert.strictEqual(Editor.E.opened.name, "opened");
    assert.strictEqual(definitionSuccess(Editor.E.opened("draft", 3)).type, "E|6:editor|6:opened");
    const closed = definitionSuccess(Editor.E.closed());
    assert.strictEqual(closed.type, "E|6:editor|6:closed");
    assert.deepStrictEqual(Object.keys(closed), ["type"]);
    assert.strictEqual(Editor.context.sessionState.provider, Session);
    assert.deepStrictEqual(Editor.operations, { save: { kind: "save" } });
  });

  it("copies authored containers without invoking callbacks", () => {
    let initializerCalls = 0;
    let eventCalls = 0;
    let selectorCalls = 0;
    const states = ["ready"];
    const operation = { kind: "save" };
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
        selected: Session.select(() => {
          selectorCalls += 1;
          return "selected";
        }),
      },
      operations: { save: operation },
      memory: ({ input }: { readonly input: { readonly id: string } }) => {
        initializerCalls += 1;
        return { id: input.id };
      },
    };

    const value = definitionSuccess(definition(source));
    states[0] = "changed";
    operation.kind = "changed";

    assert.deepStrictEqual([initializerCalls, eventCalls, selectorCalls], [0, 0, 0]);
    assert.strictEqual(value.states[0], "ready");
    assert.deepStrictEqual(value.operations.save, { kind: "save" });
  });

  it("constructs writable nominal event values", () => {
    const event = definitionSuccess(Editor.E.opened("draft", 3));
    assert.strictEqual(event.draftId, "draft");
    assert.strictEqual(event.revision, 3);
    assert.strictEqual(event.type, "E|6:editor|6:opened");
    assert.strictEqual(Object.isFrozen(event), false);
    assert.strictEqual(Object.isFrozen(Editor.E.opened), false);
    Object.assign(event, { draftId: "changed" });
    assert.strictEqual(event.draftId, "changed");
  });

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
    const accepted = [
      "a".repeat(256),
      "é".repeat(128),
      "€".repeat(85) + "a",
      "😀".repeat(64),
      "__proto__",
      "café",
      "cafe\u0301",
    ];
    for (const name of accepted) {
      const value = namedDefinition(name);
      assert.strictEqual(value.id, name);
      assert.strictEqual(value.states[0], name);
      assert.strictEqual(value.E[name]?.name, name);
      assert.strictEqual(value.context[name]?.provider.id, "session");
      assert.strictEqual(Object.hasOwn(value.operations, name), true);
      if (name === "__proto__") {
        const state = value.S[name];
        if (state === undefined || !("kind" in state)) {
          throw new Error("Expected an own state token");
        }
        assert.strictEqual(Object.hasOwn(value.S, name), true);
        assert.strictEqual(state.name, "S.__proto__");
        assert.strictEqual(state.id, "S|9:__proto__|11:S.__proto__");
      }
    }

    const rejected = ["", "a".repeat(257), "bad\u0000name", "bad\u007fname", "\uD800", "\uDC00"];
    for (const name of rejected) {
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
          path,
          details: { issue: "Composite" },
        });
      }
    }
    assert.notStrictEqual("café", "cafe\u0301");
  });

  it("keeps colliding state spellings distinct", () => {
    const value = SpecialNameDefinition;

    assert.notStrictEqual(value.S["a.S.b"].id, value.S.a.S.b.id);
    assert.strictEqual(value.S.S.id, "S|9:collision|3:1:S");
    assert.strictEqual(value.S["a.S.b"].id, "S|9:collision|7:5:a.S.b");
  });

  it("rejects malformed declaration containers", () => {
    const hiddenEvents = {};
    Object.defineProperty(hiddenEvents, "changed", { value: "bare" });
    const invalidContainers: readonly [string, unknown][] = [
      ["events", new Date()],
      ["events", Object(Symbol("events"))],
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
      path: [],
      details: { issue: "InvalidType" },
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
      details: { issue: "InvalidType" },
    });
  });

  it("rejects cyclic state declarations before recursive decoding", () => {
    const states: unknown[] = [];
    states.push(states);
    assertDiagnostic(constructDefinitionResult({ id: "cyclic", states, events: {} }), {
      code: "SchemaValidation",
      path: ["states"],
      details: { issue: "Composite" },
    });
    assertDiagnostic(
      constructDefinitionResult({ id: "deep", states: makeNestedStates(11), events: {} }),
      {
        code: "SchemaValidation",
        path: ["states"],
        details: { issue: "Composite" },
      },
    );
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
    const invalidDefinitions: readonly [string, DefinitionValue, readonly (string | number)[]][] = [
      ["extra", { id: "extra", states: ["ready"], events: {}, extra: true }, ["extra"]],
      ["event", { id: "event", states: ["ready"], events: { changed: 42 } }, ["events", "changed"]],
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
        details: { issue: "InvalidType" },
      });
    }
  });

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

  it("preserves authored callback defects", () => {
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
    const result = event();
    assertDiagnosticError(diagnosticFrom(result), {
      code: "Panic",
      path: [],
      details: {},
      summary: "Unexpected runtime defect",
      help: "Inspect the original cause at the host boundary.",
    });
    assert.strictEqual(
      Object.getOwnPropertyDescriptor(diagnosticFrom(result), "cause")?.value,
      failure,
    );
  });

  it("maps schema decoder defects to Panic failures", () => {
    const defect = new Error("schema defect");
    const invalid = new Proxy(
      {},
      {
        ownKeys: () => {
          throw defect;
        },
      },
    );
    const result = constructDefinitionResult(invalid);
    assertDiagnosticError(diagnosticFrom(result), {
      code: "Panic",
      path: [],
      details: {},
      summary: "Unexpected runtime defect",
      help: "Inspect the original cause at the host boundary.",
    });
    assert.strictEqual(
      Object.getOwnPropertyDescriptor(diagnosticFrom(result), "cause")?.value,
      defect,
    );
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
