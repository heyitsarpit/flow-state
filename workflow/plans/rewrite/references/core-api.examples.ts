// Supporting final-target API illustration. Not compiled or run for this proposal.
// Normative requirements live in Statecharts.plan and ApplicationsAndActors.plan.

import { Result } from "effect";
import { definition, machine } from "flow-state";

const Editor = definition({
  id: "Todos/Editor",
  states: ["READY", { SAVING: ["REQUESTED", "COMMITTING"] }],
  events: {
    SaveRequested: (title: string) => ({ title }),
    SaveCompleted: "bare",
  },
  memory: ({ input }: { input: { todoId: string } }) => ({
    todoId: input.todoId,
    draft: "",
  }),
});

const editorMachine = machine(Editor, ({ S }) => ({
  default: S.READY,
  states: {
    READY: {
      on: {
        SaveRequested: {
          target: S.SAVING.S.REQUESTED,
          updateMemory: ({ event }) => ({ draft: event.title }),
        },
      },
    },
    SAVING: {
      default: S.SAVING.S.REQUESTED,
      states: { REQUESTED: {}, COMMITTING: {} },
    },
  },
}));

if (Result.isFailure(Editor)) {
  // Editor.failure is canonical Diagnostic. machine did not invoke its callback.
} else {
  const completed = Editor.success.E.SaveCompleted();
  if (Result.isSuccess(completed)) {
    // completed.success is the exact nominal event envelope.
  }
}
