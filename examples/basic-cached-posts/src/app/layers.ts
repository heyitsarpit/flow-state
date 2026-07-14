import * as flow from "flow-state";

import { PostsLive } from "../services/layers";
import { PostsApp } from "./app";

export const PostsAppLayer = PostsApp.layer({
  store: flow.store.memory(),
  orchestrators: flow.orchestrators.live(),
  services: [PostsLive],
});

export const PostsTestAppLayer = PostsApp.layer({
  store: flow.store.test(),
  orchestrators: flow.orchestrators.test(),
  services: [PostsLive],
});
