import * as flow from "flow-state";

import type { Post, PostsUnavailable } from "../../domain/posts";
import { postDetailResource, postsResource } from "./resources";

export interface PostsScreenContext {
  readonly selectedPostId: 1 | 2;
}
export type PostsScreenEvent =
  | { readonly type: "OPEN_POST"; readonly postId: 1 | 2 }
  | { readonly type: "BACK" }
  | { readonly type: "REFRESH" }
  | { readonly type: "REFRESHED"; readonly post: Post }
  | { readonly type: "REFRESH_FAILED"; readonly error: PostsUnavailable }
  | { readonly type: "REFRESH_DEFECT" }
  | { readonly type: "REFRESH_INTERRUPTED" }
  | { readonly type: "RETRY" };

const detailParams = ({ context }: flow.ResourceParams<PostsScreenContext>) =>
  [context.selectedPostId] as const;

export const postsScreenMachine = flow.machine<PostsScreenContext, PostsScreenEvent>()({
  id: "posts.screen",
  initial: "list",
  context: () => ({ selectedPostId: 1 }),
  states: {
    list: {
      invoke: [flow.ensure(postsResource.ref())],
      on: {
        OPEN_POST: {
          target: "detail",
          update: ({ event }) =>
            event.type === "OPEN_POST" ? { selectedPostId: event.postId } : {},
        },
        REFRESH: { target: "list", reenter: true },
        RETRY: { target: "list", reenter: true },
      },
    },
    detail: {
      invoke: [flow.ensure(postDetailResource, { params: detailParams })],
      on: {
        BACK: { target: "list" },
        OPEN_POST: {
          target: "detail",
          reenter: true,
          update: ({ event }) =>
            event.type === "OPEN_POST" ? { selectedPostId: event.postId } : {},
        },
        REFRESH: { target: "refreshing" },
        RETRY: { target: "detail", reenter: true },
      },
    },
    refreshing: {
      invoke: [
        flow.refresh(postDetailResource, {
          params: detailParams,
          routes: flow.outcomes<Post, PostsUnavailable, PostsScreenEvent>({
            success: ({ value }) => ({ type: "REFRESHED", post: value }),
            failure: ({ error }) => ({ type: "REFRESH_FAILED", error }),
            defect: () => ({ type: "REFRESH_DEFECT" }),
            interrupt: () => ({ type: "REFRESH_INTERRUPTED" }),
          }),
        }),
      ],
      on: {
        BACK: { target: "list" },
        REFRESH: { target: "refreshing", reenter: true },
        REFRESHED: { target: "detail" },
        REFRESH_FAILED: { target: "detail" },
        REFRESH_DEFECT: { target: "detail" },
        REFRESH_INTERRUPTED: { target: "detail" },
      },
    },
  },
});

export type PostsScreenState = flow.InferMachineState<typeof postsScreenMachine>;
