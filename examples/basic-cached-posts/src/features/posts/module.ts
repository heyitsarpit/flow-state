import * as flow from "flow-state";

import { postsScreenMachine } from "./machine";
import { postDetailResource, postsResource } from "./resources";
import { postsScreenView } from "./view";

export const PostsModule = flow.module("Posts", {
  resources: { list: postsResource, detail: postDetailResource },
  machines: { screen: postsScreenMachine },
  views: { screen: postsScreenView },
});
