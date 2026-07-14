import { flowStories } from "flow-state/inspect";

import { postsScreenMachine } from "../features/posts/machine";
import { PostsApp } from "./app";

export const postsStories = flowStories(postsScreenMachine, [
  { id: "list", title: "Post list", events: [], expectedState: "list" },
  {
    id: "detail",
    title: "Cached post detail",
    events: [{ type: "OPEN_POST", postId: 1 }],
    expectedState: "detail-1",
  },
]);

type BehaviorGatewayContract = Readonly<{
  readonly app: typeof PostsApp;
  readonly stories: readonly [typeof postsStories];
}>;

export const BehaviorGateway: BehaviorGatewayContract = {
  app: PostsApp,
  stories: [postsStories],
} as const;
