import * as flow from "flow-state";

import { createIncidentApiLayer } from "../services/incident-api";
import { IncidentApp } from "./app";

export const createIncidentAppLayer = () =>
  IncidentApp.layer({
    store: flow.store.memory(),
    orchestrators: flow.orchestrators.live(),
    services: [createIncidentApiLayer()],
  });
