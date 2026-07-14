import { Effect } from "effect";

import { createKey } from "flow-state";
import * as flow from "flow-state";

import type { Post, PostSummary, PostsUnavailable } from "../../domain/posts";
import { PostsService } from "../../services/posts-service";

export const postsResource = flow.resource<
  [],
  readonly PostSummary[],
  PostsUnavailable,
  Effect.Effect<readonly PostSummary[], PostsUnavailable, PostsService>,
  "posts.list"
>({
  id: "posts.list",
  key: () => createKey("posts", "list"),
  lookup: () => Effect.flatMap(PostsService, (service) => service.list),
  freshness: { staleAfter: "30 seconds", onInvalidate: "active" },
});

export const postDetailResource = flow.resource<
  [1 | 2],
  Post,
  PostsUnavailable,
  Effect.Effect<Post, PostsUnavailable, PostsService>,
  "posts.detail"
>({
  id: "posts.detail",
  key: (id: 1 | 2) => createKey("posts", "detail", id),
  lookup: (id: 1 | 2) => Effect.flatMap(PostsService, (service) => service.detail(id)),
  freshness: { staleAfter: "30 seconds", onInvalidate: "active" },
});
