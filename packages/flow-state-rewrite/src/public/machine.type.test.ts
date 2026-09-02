import { Result } from "effect";

import { definition, machine } from "../index.js";
import type { EventOf, InputOf, MemoryOf, StateOf } from "../index.js";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;

type Expect<Value extends true> = Value;

const EditorResult = definition({
  id: "public-editor",
  states: ["idle", "ready"],
  events: {
    opened: (draftId: string) => ({ draftId }),
    closed: "bare",
  },
  memory: ({ input }: { readonly input: { readonly draftId: string } }) => ({
    draftId: input.draftId,
    count: 0,
  }),
});

if (Result.isSuccess(EditorResult)) {
  const Editor = EditorResult.success;
  const EditorMachine = machine(Editor, ({ S, E, onMemory }) => {
    onMemory.select(
      ({ memory }) => memory.draftId,
      (current, previous) => {
        const exactCurrent: string = current;
        const exactPrevious: string | undefined = previous;
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
              actions: ({ memory }) => ({ kind: memory.draftId }),
            },
          },
          redirect: {
            when: ({ state, memory, snapshot }) => state === snapshot.state && memory.count >= 0,
            target: S.idle,
          },
        },
        ready: {
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

  type _Input = Expect<Equal<InputOf<typeof EditorMachine>, { readonly draftId: string }>>;
  type _Memory = Expect<Equal<MemoryOf<typeof EditorMachine>, { draftId: string; count: number }>>;
  type _State = Expect<
    Equal<StateOf<typeof EditorMachine>, typeof Editor.S.idle | typeof Editor.S.ready>
  >;
  type _Event = Expect<Equal<EventOf<typeof EditorMachine>, EventOf<typeof Editor>>>;

  const typeProofs: readonly [_Input, _Memory, _State, _Event] = [true, true, true, true];

  void typeProofs;
  void EditorMachine;
}
