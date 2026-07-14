import * as flow from "flow-state";

import type { PostsScreenContext, PostsScreenState } from "./machine";

export interface PostsScreenSelection {
  readonly screen: "list" | "detail";
  readonly selectedPostId?: 1 | 2;
  readonly refreshing: boolean;
}

export const postsScreenView = flow.view<
  PostsScreenContext,
  PostsScreenState,
  PostsScreenSelection
>({
  id: "posts.screen.view",
  sources: ["context"],
  select: ({ context, value }) => ({
    screen: value === "list" ? "list" : "detail",
    ...(context.selectedPostId === undefined ? {} : { selectedPostId: context.selectedPostId }),
    refreshing: value === "refreshing-1" || value === "refreshing-2",
  }),
});
