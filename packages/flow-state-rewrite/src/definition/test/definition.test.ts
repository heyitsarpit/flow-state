import { assert, describe, it } from "@effect/vitest";
import { Predicate, Result, Schema } from "effect";

import { createDefinitionRuntime } from "../construction.js";
import { definition } from "../definition.js";
import type { EventOf, InputOf, MemoryOf, StateOf } from "../definition.js";
import type {
  ContextOf,
  DefinitionValue,
  EmptyMemory,
  OperationsOf,
  StateDeclaration,
} from "../domain.js";
import { isWellFormedFallback, isWellFormedText, utf8ByteLength } from "../utf8.js";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;

type Expect<Value extends true> = Value;

const Session = definition({
  id: "session",
  states: ["signed-out", { active: ["editing", "saving"] }],
  events: { signedOut: null },
  memory: ({ input: _input }: { readonly input: void }) => ({ mode: "dark" }),
});

const OtherSession = definition({
  id: "other-session",
  states: ["signed-out"],
  events: {},
  memory: ({ input: _input }: { readonly input: void }) => ({ mode: "dark" }),
});

const Editor = definition({
  id: "editor",
  states: ["ready", { active: ["editing", "submitting"] }],
  events: {
    opened: (draftId: string, revision: number) => ({ draftId, revision }),
    closed: null,
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
});

const EmptyDefinition = definition({ id: "empty", states: ["ready"], events: {} });

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
    ReturnType<typeof Editor.E.opened> | ReturnType<typeof Editor.E.closed>
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
];

const proofCount: TypeProofs["length"] = 11;
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
  createDefinitionRuntime({
    id: name,
    states: [name],
    events: { [name]: null },
    context: { [name]: Session.select(({ state }) => state) },
    operations: { [name]: { kind: "operation" } },
  });

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
    assert.strictEqual(Editor.E.opened("draft", 3).type, "E|6:editor|6:opened");
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

    const value = createDefinitionRuntime(source);
    states[0] = "changed";
    operation.kind = "changed";

    assert.deepStrictEqual([initializerCalls, eventCalls, selectorCalls], [0, 0, 0]);
    assert.strictEqual(value.states[0], "ready");
    assert.deepStrictEqual(value.operations.save, { kind: "save" });
  });

  it("constructs writable nominal event values", () => {
    const event = Editor.E.opened("draft", 3);
    assert.strictEqual(event.draftId, "draft");
    assert.strictEqual(event.revision, 3);
    assert.strictEqual(event.type, "E|6:editor|6:opened");
    assert.strictEqual(Object.isFrozen(event), false);
    assert.strictEqual(Object.isFrozen(Editor.E.opened), false);
  });

  it("uses Schema for ordinary invalid definition structure", () => {
    const invalidStates: readonly DefinitionValue[] = [
      [],
      ["same", "same"],
      [{ first: ["leaf"], second: ["leaf"] }],
      makeNestedStates(11),
    ];

    for (const states of invalidStates) {
      assert.throws(
        () => createDefinitionRuntime({ id: "invalid", states, events: {} }),
        Schema.SchemaError,
      );
    }
    assert.doesNotThrow(() =>
      createDefinitionRuntime({ id: "nested", states: makeNestedStates(10), events: {} }),
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
    }

    const rejected = ["", "a".repeat(257), "bad\u0000name", "bad\u007fname", "\uD800", "\uDC00"];
    for (const name of rejected) {
      const invalidDefinitions: readonly (readonly [string, DefinitionValue])[] = [
        ["id", { id: name, states: ["ready"], events: {} }],
        ["state", { id: "valid", states: [name], events: {} }],
        ["event", { id: "valid", states: ["ready"], events: { [name]: null } }],
        [
          "context",
          {
            id: "valid",
            states: ["ready"],
            events: {},
            context: { [name]: Session.select(({ state }) => state) },
          },
        ],
        [
          "operation",
          {
            id: "valid",
            states: ["ready"],
            events: {},
            operations: { [name]: { kind: "operation" } },
          },
        ],
      ];
      for (const [field, input] of invalidDefinitions) {
        assert.throws(() => createDefinitionRuntime(input), Schema.SchemaError, field);
      }
    }
    assert.notStrictEqual("café", "cafe\u0301");
  });

  it("validates declarations and event payload objects with Schema", () => {
    const invalidDefinitions: readonly DefinitionValue[] = [
      { id: "extra", states: ["ready"], events: {}, extra: true },
      { id: "event", states: ["ready"], events: { changed: 42 } },
      { id: "context", states: ["ready"], events: {}, context: { fake: {} } },
      { id: "operation", states: ["ready"], events: {}, operations: { save: {} } },
      { id: "memory", states: ["ready"], events: {}, memory: 42 },
    ];
    for (const input of invalidDefinitions) {
      assert.throws(() => createDefinitionRuntime(input), Schema.SchemaError);
    }

    const invalidPayloads = [() => ({ type: "reserved" }), () => [], () => new Date()];
    for (const [index, factory] of invalidPayloads.entries()) {
      const value = createDefinitionRuntime({
        id: `event-${index}`,
        states: ["ready"],
        events: { changed: factory },
      });
      const event = value.E.changed;
      if (!Predicate.isFunction(event)) throw new Error("Expected event constructor");
      assert.throws(() => event(), Schema.SchemaError);
    }
  });

  it("preserves authored callback defects", () => {
    const failure = new Error("event failed");
    const value = createDefinitionRuntime({
      id: "throwing-event",
      states: ["ready"],
      events: {
        changed: () => {
          throw failure;
        },
      },
    });
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
