import { Context, Effect } from "effect";

import type { Post, PostSummary, PostsUnavailable } from "../domain/posts";

export interface PostsServiceShape {
  readonly list: Effect.Effect<readonly PostSummary[], PostsUnavailable>;
  readonly detail: (id: 1 | 2) => Effect.Effect<Post, PostsUnavailable>;
}

export class PostsService extends Context.Service<PostsService, PostsServiceShape>()(
  "basic-cached-posts/PostsService",
) {}
