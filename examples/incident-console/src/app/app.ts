import * as flow from "flow-state";
import type { FlowAppDefinition } from "flow-state";

import { IncidentsModule } from "../features/incidents/module";

type IncidentModules = readonly [typeof IncidentsModule];

export const IncidentApp: FlowAppDefinition<IncidentModules> = flow.app({
  modules: [IncidentsModule] as const,
});
