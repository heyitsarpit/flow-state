import { Effect, Option } from "effect";

import * as flow from "flow-state";
import type { FlowResourceSnapshot } from "flow-state";

import {
  IncidentPageSchema,
  IncidentSchema,
  type Incident,
  type IncidentPage,
  type IncidentPatch,
  type Runbook,
  type RunbookAccepted,
} from "../../domain/incidents";
import { IncidentApi, type IncidentApiFailure } from "../../services/incident-api";
import { incidentDetailResource, incidentListResource } from "./resources";
import { resourceValue } from "./selectors";
import type { IncidentConsoleContext, IncidentConsoleEvent } from "./types";
import { queryFromContext } from "./types";

type MutationParams = Readonly<{
  readonly incidentId: string;
  readonly patch: IncidentPatch;
  readonly optimisticIncident: Incident;
  readonly optimisticPage: Option.Option<IncidentPage>;
  readonly detailRef: ReturnType<typeof incidentDetailResource.ref>;
  readonly listRef: ReturnType<typeof incidentListResource.ref>;
}>;

type MutationSelector = Readonly<{
  readonly context: IncidentConsoleContext;
  readonly event: IncidentConsoleEvent;
  readonly resources: Readonly<Record<string, FlowResourceSnapshot>>;
}>;

export const mutateIncident = flow.transaction<
  MutationParams,
  Incident,
  IncidentApiFailure,
  IncidentApi,
  IncidentConsoleEvent
>({
  id: "incidents.mutate",
  params: ({ context, event, resources }: MutationSelector) => {
    if (event.type !== "ASSIGN" && event.type !== "CHANGE_STATUS") return null;
    const incidentId = Option.getOrUndefined(context.selectedIncidentId);
    const incident = resourceValue(resources, incidentDetailResource.id, IncidentSchema);
    if (incidentId === undefined || incident === undefined) return null;
    const patch: IncidentPatch =
      event.type === "ASSIGN"
        ? { expectedVersion: incident.version, assignee: event.assignee }
        : { expectedVersion: incident.version, status: event.status };
    const optimisticIncident: Incident = {
      ...incident,
      ...(event.type === "ASSIGN" ? { assignee: event.assignee } : { status: event.status }),
    };
    const query = queryFromContext(context);
    const page = resourceValue(resources, incidentListResource.id, IncidentPageSchema);
    return {
      incidentId,
      patch,
      optimisticIncident,
      optimisticPage: Option.fromNullishOr(page),
      detailRef: incidentDetailResource.ref(incidentId),
      listRef: incidentListResource.ref(query),
    };
  },
  preview: {
    apply: ({ params }) => [
      { ref: params.detailRef, replace: params.optimisticIncident },
      ...(Option.isNone(params.optimisticPage)
        ? []
        : [
            {
              ref: params.listRef,
              replace: {
                ...params.optimisticPage.value,
                incidents: params.optimisticPage.value.incidents.map((incident) =>
                  incident.id === params.incidentId ? params.optimisticIncident : incident,
                ),
              },
            },
          ]),
    ],
  },
  commit: ({ incidentId, patch }) =>
    Effect.flatMap(IncidentApi, (api) => api.patch(incidentId, patch)),
  invalidates: ({ params }) => [params.detailRef, params.listRef],
  routes: flow.outcomes<Incident, IncidentApiFailure, IncidentConsoleEvent>({
    success: ({ value }) => ({ type: "MUTATION_SUCCEEDED", incident: value }),
    failure: ({ error }) => ({ type: "MUTATION_FAILED", error }),
    defect: () => ({ type: "MUTATION_DEFECT" }),
    interrupt: () => ({ type: "MUTATION_INTERRUPTED" }),
  }),
  scope: { id: "incidents.selected-mutation" },
  concurrency: "reject-while-running",
});

type RunbookSelector = Readonly<{
  readonly context: IncidentConsoleContext;
}>;

export const startRunbook = flow.transaction<
  string,
  RunbookAccepted,
  IncidentApiFailure,
  IncidentApi,
  IncidentConsoleEvent
>({
  id: "incidents.start-runbook",
  params: ({ context }: RunbookSelector) =>
    Option.getOrUndefined(context.selectedIncidentId) ?? null,
  commit: (incidentId) => Effect.flatMap(IncidentApi, (api) => api.startRunbook(incidentId)),
  routes: flow.outcomes<RunbookAccepted, IncidentApiFailure, IncidentConsoleEvent>({
    success: ({ value }) => ({ type: "RUNBOOK_STARTED", runId: value.runId }),
    failure: ({ error }) => ({ type: "RUNBOOK_START_FAILED", error }),
  }),
  concurrency: "reject-while-running",
});

export const cancelRunbook = flow.transaction<
  string,
  Runbook,
  IncidentApiFailure,
  IncidentApi,
  IncidentConsoleEvent
>({
  id: "incidents.cancel-runbook",
  params: ({ context }: RunbookSelector) => Option.getOrUndefined(context.runId) ?? null,
  commit: (runId) => Effect.flatMap(IncidentApi, (api) => api.cancelRunbook(runId)),
  routes: flow.outcomes<Runbook, IncidentApiFailure, IncidentConsoleEvent>({
    success: ({ value }) => ({ type: "RUNBOOK_CANCELLED", runbook: value }),
    failure: ({ error }) => ({ type: "RUNBOOK_CANCEL_FAILED", error }),
  }),
  concurrency: "reject-while-running",
});
