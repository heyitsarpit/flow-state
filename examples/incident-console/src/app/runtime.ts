import * as flow from "flow-state";

import { createIncidentAppLayer } from "./layers";

export const createIncidentRuntime = () => flow.runtime(createIncidentAppLayer());

