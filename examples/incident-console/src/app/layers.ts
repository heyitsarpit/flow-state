import * as flow from "flow-state";

import { createIncidentApiLayer } from "../services/incident-api";
import { IncidentApp } from "./app";

const incidentApiUrl = () =>
  new URL(process.env.NEXT_PUBLIC_INCIDENT_API_URL ?? "http://127.0.0.1:5190");

export const createIncidentAppLayer = () =>
  IncidentApp.layer({
    store: flow.store.memory(),
    orchestrators: flow.orchestrators.live(),
    services: [createIncidentApiLayer(incidentApiUrl())],
  });

