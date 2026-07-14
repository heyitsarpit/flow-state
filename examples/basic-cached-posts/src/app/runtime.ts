import * as flow from "flow-state";

import { PostsAppLayer, PostsTestAppLayer } from "./layers";

export const createPostsRuntime = () => flow.runtime(PostsAppLayer);
export const createPostsTestRuntime = () => flow.runtime(PostsTestAppLayer);
