import { Result, type Types } from "effect";

import { definition } from "../../definition/definition.js";
import {
  admitEventHandlers,
  admitRedirectConfiguration,
  admitStateConfiguration,
} from "../admission.js";
import type { CompoundStateConfiguration, LeafStateConfiguration } from "../admission.js";
import type { CompiledTransition, MachineSnapshot, Redirect, StateNode } from "../grammar.js";
import { machine } from "../machine.js";
import { snapshotRecord } from "../reflection.js";

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

const EditorResult = definition({
  id: "machine-admission-compile",
  states: ["idle", "done"],
  events: {
    opened: (draftId: string) => ({ draftId }),
    closed: "bare",
  },
  memory: ({ input }: { readonly input: { readonly draftId: string } }) => ({
    draftId: input.draftId,
    count: 0,
  }),
});

if (!Result.isSuccess(EditorResult)) throw EditorResult.failure;
const Editor = EditorResult.success;

const validMachineResult = machine(EditorResult, ({ S, E }) => ({
  default: S.idle,
  states: {
    idle: {
      on: {
        opened: {
          target: S.done,
          guard: ({ event, state, memory, snapshot, S: states, E: events }) => {
            const draftId: string = event.draftId;
            const currentState: typeof state = state;
            const count: number = memory.count;
            const previousState: typeof snapshot.state = snapshot.state;
            const idle: typeof S.idle = states.idle;
            const opened: typeof E.opened = events.opened;
            void draftId;
            void currentState;
            void count;
            void previousState;
            void idle;
            void opened;
            return event.draftId.length > 0;
          },
          updateMemory: ({ event, memory }) => {
            const draftId: string = event.draftId;
            const count: number = memory.count;
            void count;
            return { draftId };
          },
          actions: ({ event, memory, snapshot }) => {
            const draftId: string = event.draftId;
            const count: number = memory.count;
            const state: typeof snapshot.state = snapshot.state;
            void draftId;
            void count;
            void state;
            return null;
          },
          reenter: S.done,
        },
      },
      redirect: {
        when: ({ state, memory, snapshot }) => {
          const currentState: typeof state = state;
          const count: number = memory.count;
          const snapshotState: typeof snapshot.state = snapshot.state;
          void currentState;
          void count;
          void snapshotState;
          return true;
        },
        target: S.idle,
      },
      timers: {
        close: {
          delay: 1,
          target: E.closed,
          guard: ({ timer, state, memory, snapshot }) => {
            const name: string = timer.name;
            const currentState: typeof state = state;
            const count: number = memory.count;
            const snapshotState: typeof snapshot.state = snapshot.state;
            void name;
            void currentState;
            void count;
            void snapshotState;
            return timer.startedAt <= timer.dueAt;
          },
          updateMemory: ({ timer }) => ({ count: timer.dueAt - timer.startedAt }),
        },
      },
    },
    done: {},
  },
}));

const idleNode = {
  kind: "leaf",
  name: "idle",
  path: ["idle"],
  token: Editor.S.idle,
  children: [],
} as const satisfies StateNode<typeof Editor>;
const rootNode = {
  kind: "compound",
  name: "",
  path: [],
  children: [idleNode],
} as const satisfies StateNode<typeof Editor>;
const leafAdmission = admitStateConfiguration({}, ["states", "idle"], idleNode);
const compoundAdmission = admitStateConfiguration(
  { default: Editor.S.idle, states: { idle: {} } },
  [],
  rootNode,
);

export type _LeafConfiguration = Expect<
  Types.Equals<Result.Result.Success<typeof leafAdmission>, LeafStateConfiguration>
>;
export type _CompoundConfiguration = Expect<
  Types.Equals<Result.Result.Success<typeof compoundAdmission>, CompoundStateConfiguration>
>;

type OpenedTransition = CompiledTransition<typeof Editor, "opened">;
type OpenedInput = Parameters<NonNullable<OpenedTransition["guard"]>>[0];
type OpenedEvent = OpenedInput["event"];
type OpenedMemory = OpenedInput["memory"];
type OpenedSnapshot = OpenedInput["snapshot"];

const handlerAdmission = admitEventHandlers<typeof Editor>(
  { on: { opened: [{ target: Editor.S.done }] } },
  ["states", "idle"],
  Editor.E,
  new Set(),
  (_value, _path) => Result.succeed(Editor.S.done),
);

type OpenedHandler = NonNullable<Result.Result.Success<typeof handlerAdmission>["opened"]>;

const redirectInput: Redirect<typeof Editor> = {
  when: ({ state, memory, snapshot }) => {
    const currentState: typeof state = state;
    const count: number = memory.count;
    const snapshotState: typeof snapshot.state = snapshot.state;
    void currentState;
    void count;
    void snapshotState;
    return true;
  },
  target: Editor.S.idle,
};
const redirectAdmission = admitRedirectConfiguration<typeof Editor>(
  redirectInput,
  ["redirect"],
  (_value, _path) => Result.succeed(Editor.S.idle),
);

export type _RedirectOutput = Expect<
  Types.Equals<Result.Result.Success<typeof redirectAdmission>, Redirect<typeof Editor>[]>
>;

export type _OpenedEvent = Expect<OpenedEvent extends { readonly draftId: string } ? true : false>;
export type _OpenedMemory = Expect<
  Types.Equals<OpenedMemory, { readonly draftId: string; readonly count: number }>
>;
export type _OpenedSnapshot = Expect<Types.Equals<OpenedSnapshot, MachineSnapshot<typeof Editor>>>;
export type _OpenedHandler = Expect<
  Types.Equals<OpenedHandler, readonly CompiledTransition<typeof Editor, "opened">[]>
>;

const reflectionResult = snapshotRecord({ child: "value" }, [], "ExpectedStateConfiguration");

if (Result.isSuccess(reflectionResult)) {
  for (const [key, property] of reflectionResult.success.properties) {
    if (key !== "child" || property.kind !== "data") continue;
    // @ts-expect-error Reflection has not established a string value.
    const child: string = property.value;
    void child;
  }
}

// Negative authoring remains after the positive relationship assertions so the
// Error directive stays attached to the rejected callback.
// RETURN_TYPE: Preserves the explicit boolean return in the negative callback-compatibility proof.
const unrelatedCallback = (_input: { readonly unrelated: true }): boolean => true;

machine(EditorResult, ({ S }) => ({
  default: S.idle,
  states: {
    idle: {
      on: {
        opened: {
          target: S.done,
          // @ts-expect-error The real Machine constructor rejects callback signatures unrelated to its causal input.
          guard: unrelatedCallback,
        },
      },
    },
    done: {},
  },
}));

void validMachineResult;
