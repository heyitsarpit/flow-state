import { Effect, Layer } from "effect";

import type { Post } from "../domain/posts";
import { PostsService } from "./posts-service";

export const fixturePosts: Readonly<Record<1 | 2, Post>> = {
  1: { id: 1, title: "Flow State basics", body: "Actors own work.", revision: 1 },
  2: { id: 2, title: "Keyed resources", body: "Keys isolate cached values.", revision: 1 },
};

export const PostsLive = Layer.succeed(
  PostsService,
  PostsService.of({
    list: Effect.succeed(Object.values(fixturePosts).map(({ id, title }) => ({ id, title }))),
    detail: (id) => Effect.succeed(fixturePosts[id]),
  }),
);
