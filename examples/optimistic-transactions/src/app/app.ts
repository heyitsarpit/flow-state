import * as flow from "flow-state";
import type { FlowAppDefinition } from "flow-state";

import { TodosModule } from "../features/todos/module";

type OptimisticModules = readonly [typeof TodosModule];
export const OptimisticApp: FlowAppDefinition<OptimisticModules> = flow.app({
  modules: [TodosModule] as const,
});
