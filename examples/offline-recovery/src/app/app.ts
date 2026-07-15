import * as flow from "flow-state";
import type { FlowAppDefinition } from "flow-state";

import { OfflineModule } from "../features/offline/module";

type OfflineModules = readonly [typeof OfflineModule];

export const OfflineApp: FlowAppDefinition<OfflineModules> = flow.app({
  modules: [OfflineModule] as const,
});
