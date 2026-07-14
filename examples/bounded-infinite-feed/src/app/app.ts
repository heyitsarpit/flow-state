import * as flow from "flow-state";
import type { FlowAppDefinition } from "flow-state";

import { FeedModule } from "../features/feed/module";

type FeedModules = readonly [typeof FeedModule];

export const FeedApp: FlowAppDefinition<FeedModules> = flow.app({
  modules: [FeedModule] as const,
});
