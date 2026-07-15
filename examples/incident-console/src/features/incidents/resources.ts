import { Effect } from "effect";

import { createKey, createTag } from "flow-state";
import * as flow from "flow-state";

import type { Incident, IncidentFilters, IncidentPage, Runbook } from "../../domain/incidents";
import { IncidentApi, type IncidentApiFailure } from "../../services/incident-api";

export const incidentListTag = createTag("incidents:list");
export const incidentDetailTag = createTag("incidents:detail");
export const runbookTag = createTag("incidents:runbook");

export const incidentListResource = flow.resource<
  [filters: IncidentFilters],
  IncidentPage,
  IncidentApiFailure,
  Effect.Effect<IncidentPage, IncidentApiFailure, IncidentApi>,
  "incidents.list"
>({
  id: "incidents.list",
  key: (filters) => createKey("incidents", "list", filters),
  lookup: (filters) => Effect.flatMap(IncidentApi, (api) => api.list(filters)),
  tags: () => [incidentListTag],
  freshness: { staleAfter: "10 seconds", onInvalidate: "active" },
});

export const incidentDetailResource = flow.resource<
  [incidentId: string],
  Incident,
  IncidentApiFailure,
  Effect.Effect<Incident, IncidentApiFailure, IncidentApi>,
  "incidents.detail"
>({
  id: "incidents.detail",
  key: (incidentId) => createKey("incidents", "detail", incidentId),
  lookup: (incidentId) => Effect.flatMap(IncidentApi, (api) => api.detail(incidentId)),
  tags: () => [incidentDetailTag],
  freshness: { staleAfter: "10 seconds", onInvalidate: "active" },
});

export const runbookResource = flow.resource<
  [runId: string],
  Runbook,
  IncidentApiFailure,
  Effect.Effect<Runbook, IncidentApiFailure, IncidentApi>,
  "incidents.runbook"
>({
  id: "incidents.runbook",
  key: (runId) => createKey("incidents", "runbook", runId),
  lookup: (runId) => Effect.flatMap(IncidentApi, (api) => api.getRunbook(runId)),
  tags: () => [runbookTag],
  freshness: { staleAfter: "100 millis", onInvalidate: "active" },
});
