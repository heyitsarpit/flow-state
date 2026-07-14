import * as flow from "flow-state";
import type { FlowAppDefinition } from "flow-state";

import { PostsModule } from "../features/posts/module";

type PostsModules = readonly [typeof PostsModule];

export const PostsApp: FlowAppDefinition<PostsModules> = flow.app({
  modules: [PostsModule] as const,
});
