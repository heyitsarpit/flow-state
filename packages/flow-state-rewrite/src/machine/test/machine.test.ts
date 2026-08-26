import { assert, describe, it } from "@effect/vitest";

import { definition } from "../../definition/definition.js";
import { machine } from "../machine.js";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;

type Expect<Value extends true> = Value;

const Editor = definition({
  id: "editor",
  states: ["ready"],
  events: {
    opened: (draftId: string) => ({ draftId }),
  },
  operations: { save: { kind: "save" } },
});

const OtherEditor = definition({
  id: "other-editor",
  states: ["ready"],
  events: {
    opened: (draftId: string) => ({ draftId }),
  },
});

const definitionImpostor = {
  id: Editor.id,
  S: Editor.S,
  E: Editor.E,
  operations: Editor.operations,
};

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

type TypeProofs = readonly [_DefinitionIdentity, _StateToken];

const proofCount: TypeProofs["length"] = 2;
void proofCount;

const negativeProofs = (): void => {
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

describe("machine", () => {
  it("retains the definition and leaves retained work inert", () => {
    let initializerCalls = 0;
    let eventCalls = 0;

    const source = definition({
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

    const result = machine(source, ({ S }) => ({ default: S.ready, states: { ready: {} } }));

    assert.strictEqual(result.definition, source);
    assert.strictEqual(result.config.default, source.S.ready);
    assert.deepStrictEqual(result.config.states, { ready: {} });
    assert.deepStrictEqual([initializerCalls, eventCalls], [0, 0]);
  });
});
