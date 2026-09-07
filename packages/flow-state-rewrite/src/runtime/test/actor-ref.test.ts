import { assert, describe, it } from "@effect/vitest";
import { Result, type Types } from "effect";

import { actorRef, definition, machine } from "../../index.js";
import type { ActorRef } from "../../index.js";

type Expect<Value extends true> = Value;

const EditorResult = definition({
  id: "actor-ref/editor",
  states: ["ready"],
  events: {},
});

const editorMachine = Result.getOrThrow(
  machine(EditorResult, ({ S }) => ({
    default: S.ready,
    states: { ready: {} },
  })),
);

const ViewerResult = definition({
  id: "actor-ref/viewer",
  states: ["ready"],
  events: {},
});

const viewerMachine = Result.getOrThrow(
  machine(ViewerResult, ({ S }) => ({
    default: S.ready,
    states: { ready: {} },
  })),
);

const editorRef = actorRef(editorMachine, "primary-editor");
const undefinedOptionsEditorRef = actorRef(editorMachine, "undefined-options-editor", undefined);
const emptyOptionsEditorRef = actorRef(editorMachine, "empty-options-editor", {});
const persistedEditorRef = actorRef(editorMachine, "persisted-editor", { persist: true });
const nonPersistedEditorRef = actorRef(editorMachine, "non-persisted-editor", { persist: false });
const broadPersist: boolean = false;
const broadPersistEditorRef = actorRef(editorMachine, "broad-persist-editor", {
  persist: broadPersist,
});
const viewerRef = actorRef(viewerMachine, "primary-viewer");

const explicitlyTypedPersistedEditorRef = actorRef<
  typeof editorMachine,
  "explicitly-typed-persisted-editor",
  { readonly persist: true }
>(editorMachine, "explicitly-typed-persisted-editor", { persist: true });

const invalidCompileProofs = () => {
  // @ts-expect-error supplied persist generic requires the options argument.
  actorRef<typeof editorMachine, "missing-options", { readonly persist: true }>(
    editorMachine,
    "missing-options",
  );

  const namedExtraOptions = { persist: true, extra: true };
  // @ts-expect-error supplied ActorRef options reject extra keys in inline literals.
  actorRef(editorMachine, "inline-extra-option", { persist: true, extra: true });
  // @ts-expect-error supplied ActorRef options reject extra keys through named variables.
  actorRef(editorMachine, "named-extra-option", namedExtraOptions);
};

void invalidCompileProofs;

type DefaultEditorRef = ActorRef<typeof editorMachine, "primary-editor", false>;
type UndefinedOptionsEditorRef = ActorRef<typeof editorMachine, "undefined-options-editor", false>;
type EmptyOptionsEditorRef = ActorRef<typeof editorMachine, "empty-options-editor", false>;
type PersistedEditorRef = ActorRef<typeof editorMachine, "persisted-editor", true>;
type NonPersistedEditorRef = ActorRef<typeof editorMachine, "non-persisted-editor", false>;
type BroadPersistEditorRef = ActorRef<typeof editorMachine, "broad-persist-editor">;
type ExplicitlyTypedPersistedEditorRef = ActorRef<
  typeof editorMachine,
  "explicitly-typed-persisted-editor",
  true
>;

export type _Machine = Expect<Types.Equals<DefaultEditorRef["machine"], typeof editorMachine>>;
export type _Id = Expect<Types.Equals<DefaultEditorRef["id"], "primary-editor">>;
export type _DefaultPersist = Expect<Types.Equals<DefaultEditorRef["persist"], false>>;
export type _UndefinedOptionsPersist = Expect<
  Types.Equals<UndefinedOptionsEditorRef["persist"], false>
>;
export type _EmptyOptionsPersist = Expect<Types.Equals<EmptyOptionsEditorRef["persist"], false>>;
export type _ExplicitPersist = Expect<Types.Equals<PersistedEditorRef["persist"], true>>;
export type _ExplicitNonPersist = Expect<Types.Equals<NonPersistedEditorRef["persist"], false>>;
export type _BroadPersist = Expect<Types.Equals<BroadPersistEditorRef["persist"], boolean>>;
export type _ExplicitlyTypedPersist = Expect<
  Types.Equals<ExplicitlyTypedPersistedEditorRef["persist"], true>
>;
export type _NoOwnershipFields = Expect<
  Types.Equals<
    Extract<
      keyof DefaultEditorRef,
      "input" | "contextBindings" | "owner" | "dispose" | "send" | "subscribe" | "callback"
    >,
    never
  >
>;

const exactEditorRef: DefaultEditorRef = editorRef;
const exactUndefinedOptionsEditorRef: UndefinedOptionsEditorRef = undefinedOptionsEditorRef;
const exactEmptyOptionsEditorRef: EmptyOptionsEditorRef = emptyOptionsEditorRef;
const exactPersistedEditorRef: PersistedEditorRef = persistedEditorRef;
const exactNonPersistedEditorRef: NonPersistedEditorRef = nonPersistedEditorRef;
const exactBroadPersistEditorRef: BroadPersistEditorRef = broadPersistEditorRef;
const exactExplicitlyTypedPersistedEditorRef: ExplicitlyTypedPersistedEditorRef =
  explicitlyTypedPersistedEditorRef;
void exactEditorRef;
void exactUndefinedOptionsEditorRef;
void exactEmptyOptionsEditorRef;
void exactPersistedEditorRef;
void exactNonPersistedEditorRef;
void exactBroadPersistEditorRef;
void exactExplicitlyTypedPersistedEditorRef;

// @ts-expect-error actor refs retain the exact machine family.
const foreignMachineRef: ActorRef<typeof editorMachine> = viewerRef;
void foreignMachineRef;

describe("actorRef", () => {
  it("returns inert identity and persistence metadata", () => {
    assert.deepStrictEqual(Object.keys(editorRef).sort(), ["id", "machine", "persist"]);
    assert.strictEqual(editorRef.machine, editorMachine);
    assert.strictEqual(editorRef.id, "primary-editor");
    assert.strictEqual(editorRef.persist, false);
    assert.strictEqual(undefinedOptionsEditorRef.persist, false);
    assert.strictEqual(emptyOptionsEditorRef.persist, false);
    assert.strictEqual(persistedEditorRef.machine, editorMachine);
    assert.strictEqual(persistedEditorRef.id, "persisted-editor");
    assert.strictEqual(persistedEditorRef.persist, true);
    assert.strictEqual(nonPersistedEditorRef.persist, false);
    assert.strictEqual(broadPersistEditorRef.persist, false);
    assert.strictEqual(explicitlyTypedPersistedEditorRef.persist, true);

    for (const field of [
      "input",
      "contextBindings",
      "owner",
      "dispose",
      "send",
      "subscribe",
      "callback",
    ]) {
      assert.strictEqual(Object.hasOwn(editorRef, field), false);
    }
  });

  it("captures options independently for each ActorRef", () => {
    const options = { persist: false };
    const first = actorRef(editorMachine, "first-capture", options);
    options.persist = true;
    const second = actorRef(editorMachine, "second-capture", options);

    assert.strictEqual(first.persist, false);
    assert.strictEqual(second.persist, true);
  });

  it("rejects unconstructed machines and invalid authored stable IDs", () => {
    assert.throws(() => actorRef({ ...editorMachine }, "valid-id"), TypeError);
    assert.throws(() => actorRef(editorMachine, ""), TypeError);
    assert.throws(() => actorRef(editorMachine, "bad\u0000id"), TypeError);
    assert.throws(() => actorRef(editorMachine, "\uD800"), TypeError);
    assert.throws(() => actorRef(editorMachine, "a".repeat(257)), TypeError);
  });

  it("preserves machine-before-id admission precedence", () => {
    assert.throws(
      () => actorRef({ ...editorMachine }, ""),
      /^actorRef machine must be a constructed Machine$/u,
    );
  });

  it("rejects malformed options at the runtime boundary", () => {
    const actorRefWithOptions = (options: unknown) => {
      // @ts-expect-error hostile runtime input intentionally bypasses the authored options type.
      return actorRef(editorMachine, "invalid-options", options);
    };

    for (const options of [null, [], "options", true, 1, Symbol("options"), () => true]) {
      assert.throws(() => actorRefWithOptions(options), TypeError);
    }
    for (const options of [
      { persist: "yes" },
      { persist: undefined },
      { persist: true, extra: false },
      { extra: false },
      { [Symbol("persist")]: true },
    ]) {
      assert.throws(() => actorRefWithOptions(options), TypeError);
    }

    const nonEnumerable = {};
    Object.defineProperty(nonEnumerable, "persist", {
      value: true,
      enumerable: false,
      writable: false,
      configurable: false,
    });
    assert.strictEqual(actorRefWithOptions(nonEnumerable).persist, true);

    let getterCalls = 0;
    const accessor = {};
    Object.defineProperty(accessor, "persist", {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return true;
      },
    });
    assert.throws(() => actorRefWithOptions(accessor), TypeError);
    assert.strictEqual(getterCalls, 0);

    let keyReads = 0;
    const flappingKeys = new Proxy(
      { persist: true },
      {
        ownKeys: (target) => {
          keyReads += 1;
          return keyReads === 1 ? Reflect.ownKeys(target) : [];
        },
      },
    );
    assert.throws(() => actorRefWithOptions(flappingKeys), TypeError);
    assert.strictEqual(keyReads, 2);

    let descriptorReads = 0;
    const flappingDescriptor = new Proxy(
      { persist: true },
      {
        getOwnPropertyDescriptor: (target, key) => {
          const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
          if (key !== "persist" || descriptor === undefined) return descriptor;
          descriptorReads += 1;
          return { ...descriptor, value: descriptorReads === 1 };
        },
      },
    );
    assert.throws(() => actorRefWithOptions(flappingDescriptor), TypeError);
    assert.strictEqual(descriptorReads, 2);

    const revoked = Proxy.revocable({ persist: true }, {});
    revoked.revoke();
    assert.throws(() => actorRefWithOptions(revoked.proxy), TypeError);
  });
});
