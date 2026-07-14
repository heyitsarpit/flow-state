import { Data } from "effect";

export interface PostSummary {
  readonly id: 1 | 2;
  readonly title: string;
}

export interface Post extends PostSummary {
  readonly body: string;
  readonly revision: number;
}

export class PostsUnavailable extends Data.TaggedError("PostsUnavailable")<{
  readonly operation: "list" | "detail";
  readonly message: string;
}> {}
