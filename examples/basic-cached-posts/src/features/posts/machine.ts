import * as flow from "flow-state";

import { postDetailResource, postsResource } from "./resources";

export type PostsScreenState = "list" | "detail-1" | "detail-2" | "refreshing-1" | "refreshing-2";
export interface PostsScreenContext {
  readonly selectedPostId?: 1 | 2;
}
export type PostsScreenEvent =
  | { readonly type: "OPEN_POST"; readonly postId: 1 | 2 }
  | { readonly type: "BACK" }
  | { readonly type: "REFRESH" }
  | { readonly type: "RETRY" };

const selectPost = ({ event }: { readonly event: PostsScreenEvent }): Partial<PostsScreenContext> =>
  event.type === "OPEN_POST" ? { selectedPostId: event.postId } : {};

export const postsScreenMachine = flow.machine<
  PostsScreenContext,
  PostsScreenEvent,
  PostsScreenState
>({
  id: "posts.screen",
  initial: "list",
  context: () => ({}),
  states: {
    list: {
      invoke: [flow.ensure(postsResource.ref())],
      on: {
        OPEN_POST: [
          {
            target: "refreshing-1",
            guard: ({ context, event }) =>
              event.type === "OPEN_POST" && event.postId === 1 && context.selectedPostId === 1,
            update: selectPost,
          },
          {
            target: "refreshing-2",
            guard: ({ context, event }) =>
              event.type === "OPEN_POST" && event.postId === 2 && context.selectedPostId === 2,
            update: selectPost,
          },
          {
            target: "detail-1",
            guard: ({ event }) => event.type === "OPEN_POST" && event.postId === 1,
            update: selectPost,
          },
          {
            target: "detail-2",
            guard: ({ event }) => event.type === "OPEN_POST" && event.postId === 2,
            update: selectPost,
          },
        ],
        REFRESH: { target: "list", reenter: true },
        RETRY: { target: "list", reenter: true },
      },
    },
    "detail-1": {
      invoke: [flow.ensure(postDetailResource.ref(1))],
      on: {
        BACK: { target: "list" },
        REFRESH: { target: "refreshing-1" },
        RETRY: { target: "detail-1", reenter: true },
      },
    },
    "detail-2": {
      invoke: [flow.ensure(postDetailResource.ref(2))],
      on: {
        BACK: { target: "list" },
        REFRESH: { target: "refreshing-2" },
        RETRY: { target: "detail-2", reenter: true },
      },
    },
    "refreshing-1": {
      invoke: [flow.refresh(postDetailResource.ref(1))],
      on: { BACK: { target: "list" }, REFRESH: { target: "refreshing-1", reenter: true } },
    },
    "refreshing-2": {
      invoke: [flow.refresh(postDetailResource.ref(2))],
      on: { BACK: { target: "list" }, REFRESH: { target: "refreshing-2", reenter: true } },
    },
  },
});
