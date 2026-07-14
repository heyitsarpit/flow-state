import { Data } from "effect";

export interface Todo {
  readonly id: string;
  readonly text: string;
  readonly draft: string;
  readonly revision: number;
}

export interface AddTodoParams {
  readonly requestId: string;
  readonly text: string;
}

export class AddTodoRejected extends Data.TaggedError("AddTodoRejected")<{
  readonly requestId: string;
  readonly reason: string;
}> {}
