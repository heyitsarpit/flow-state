import { flowStories } from "flow-state/inspect";

import { postsScreenMachine } from "../features/posts/machine";
import { postDetailResource, postsResource } from "../features/posts/resources";
import { fixturePosts } from "../services/layers";
import { PostsApp } from "./app";

const listSeed = {
  resources: [{ ref: postsResource.ref(), value: Object.values(fixturePosts) }],
} as const;

export const postsStories = flowStories(postsScreenMachine, [
  {
    id: "list",
    title: "Post list",
    description: "Browse the seeded post list.",
    tags: ["docs", "overview"],
    seed: listSeed,
    events: [],
    expectedState: "list",
  },
  {
    id: "detail",
    title: "Cached post detail",
    description: "Open one cached post detail.",
    tags: ["docs", "detail"],
    seed: {
      resources: [
        ...listSeed.resources,
        { ref: postDetailResource.ref(1), value: fixturePosts[1] },
      ],
    },
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
