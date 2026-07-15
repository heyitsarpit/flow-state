import { flowStories } from "flow-state/inspect";

import { todoEditorMachine } from "../features/todos/machine";
import { todoResource } from "../features/todos/resources";
import { OptimisticApp } from "./app";

const initialTodo = { id: "todo-1", text: "Initial todo", draft: "", revision: 0 } as const;

export const optimisticStories = flowStories(todoEditorMachine, [
  {
    id: "editing",
    title: "Editing",
    seed: { resources: [{ ref: todoResource.ref(), value: initialTodo }] },
    events: [],
    expectedState: "editing",
  },
  {
    id: "draft-example",
    title: "Explicit draft patch",
    seed: {
      resources: [
        {
          ref: todoResource.ref(),
          value: initialTodo,
        },
      ],
    },
    events: [{ type: "EDIT_EXAMPLE" }],
    expectedState: "draft-example",
  },
]);

type BehaviorGatewayContract = Readonly<{
  readonly app: typeof OptimisticApp;
  readonly stories: readonly [typeof optimisticStories];
}>;

export const BehaviorGateway: BehaviorGatewayContract = {
  app: OptimisticApp,
  stories: [optimisticStories],
};
