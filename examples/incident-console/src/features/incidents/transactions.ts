import { Effect, Option, Result } from "effect";

import * as flow from "flow-state";
import type { FlowResourceSnapshot } from "flow-state";

import {
  IncidentPageSchema,
  IncidentSchema,
  IncidentCommand,
  applyIncidentPatch,
  decideIncidentCommand,
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
import { activeRunId, queryFromContext, selectedIncidentId } from "./types";
import { IncidentEvents } from "./vocabulary";

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
    const incident = resourceValue(resources, incidentDetailResource.id, IncidentSchema);
    if (incident === undefined) return null;
    const command =
      event.type === "ASSIGN"
        ? IncidentCommand.assign(event.assignee)
        : IncidentCommand.changeStatus(event.status);
    const decision = decideIncidentCommand(incident, command);
    if (Result.isFailure(decision)) return null;
    const incidentId = selectedIncidentId(context);
    const patch = decision.success;
    const optimisticIncident = applyIncidentPatch(incident, patch);
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
    success: ({ value }) => IncidentEvents.mutationSucceeded(value),
    failure: ({ error }) => IncidentEvents.mutationFailed(error),
    defect: IncidentEvents.mutationDefect,
    interrupt: IncidentEvents.mutationInterrupted,
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
  params: ({ context }: RunbookSelector) => selectedIncidentId(context),
  commit: (incidentId) => Effect.flatMap(IncidentApi, (api) => api.startRunbook(incidentId)),
  routes: flow.outcomes<RunbookAccepted, IncidentApiFailure, IncidentConsoleEvent>({
    success: ({ value }) => IncidentEvents.runbookStarted(value.runId),
    failure: ({ error }) => IncidentEvents.runbookStartFailed(error),
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
  params: ({ context }: RunbookSelector) => activeRunId(context),
  commit: (runId) => Effect.flatMap(IncidentApi, (api) => api.cancelRunbook(runId)),
  routes: flow.outcomes<Runbook, IncidentApiFailure, IncidentConsoleEvent>({
    success: ({ value }) => IncidentEvents.runbookCancelled(value),
    failure: ({ error }) => IncidentEvents.runbookCancelFailed(error),
  }),
  concurrency: "reject-while-running",
});

