import { Option } from "effect";

import * as flow from "flow-state";

import {
  IncidentPageSchema,
  IncidentSchema,
  RunbookSchema,
  type Incident,
  type IncidentEvent,
  type IncidentPage,
  type Runbook,
} from "../../domain/incidents";
import { IncidentApiFailure } from "../../services/incident-api";
import { incidentDetailResource, incidentListResource, runbookResource } from "./resources";
import { matchingResourceSnapshot, resourceValue } from "./selectors";
import type { IncidentConsoleContext, QueueFilters } from "./types";
import type { IncidentConsoleState } from "./machine";

export interface IncidentConsoleSelection {
  readonly state: IncidentConsoleState;
  readonly screen: "queue" | "detail";
  readonly filters: QueueFilters;
  readonly cursor: string | undefined;
  readonly selectedIncidentId: string | undefined;
  readonly page: IncidentPage | undefined;
  readonly incident: Incident | undefined;
  readonly queueStatus: "loading" | "ready" | "refreshing" | "empty" | "failure";
  readonly detailStatus: "idle" | "loading" | "refreshing" | "ready" | "not-found" | "failure";
  readonly mutationPending: boolean;
  readonly conflict: Incident | undefined;
  readonly timeline: ReadonlyArray<IncidentEvent>;
  readonly timelineGap: boolean;
  readonly timelineConnection: IncidentConsoleContext["timelineConnection"];
  readonly runbook: Runbook | undefined;
  readonly runbookActive: boolean;
  readonly feedback: string | undefined;
  readonly issueCount: number;
}

export const incidentConsoleView = flow.view<
  IncidentConsoleContext,
  IncidentConsoleState,
  IncidentConsoleSelection
>({
  id: "incidents.console.view",
  sources: ["context", "resources", "transactions", "children", "issues"],
  select: ({ value, context, resources, transactions, children, issues }) => {
    const selectedIncidentId = Option.getOrUndefined(context.selectedIncidentId);
    const listSnapshot = matchingResourceSnapshot(resources, incidentListResource.id);
    const detailSnapshot = matchingResourceSnapshot(resources, incidentDetailResource.id);
    const page = resourceValue(resources, incidentListResource.id, IncidentPageSchema);
    const cachedIncident = resourceValue(resources, incidentDetailResource.id, IncidentSchema);
    const detailError = detailSnapshot?.status === "failure" ? detailSnapshot.error : undefined;
    const incident =
      detailError instanceof IncidentApiFailure && detailError.status === 404
        ? undefined
        : cachedIncident;
    const child = children["incidents.runbook"];
    const runbook =
      child?.snapshot === undefined
        ? undefined
        : resourceValue(child.snapshot.resources, runbookResource.id, RunbookSchema);
    return {
      state: value,
      screen: value === "queue" ? "queue" : "detail",
      filters: context.filters,
      cursor: Option.getOrUndefined(context.cursor),
      selectedIncidentId,
      page,
      incident,
      queueStatus:
        listSnapshot?.status === "failure"
          ? "failure"
          : listSnapshot?.status === "loading" || listSnapshot === undefined
            ? "loading"
            : page?.incidents.length === 0
              ? "empty"
              : listSnapshot.activity === "fetching"
                ? "refreshing"
                : "ready",
      detailStatus:
        context.selectedIncidentId._tag === "None"
          ? "idle"
          : detailSnapshot?.status === "failure"
            ? detailError instanceof IncidentApiFailure && detailError.status === 404
              ? "not-found"
              : "failure"
            : detailSnapshot?.status === "loading" || detailSnapshot === undefined
              ? "loading"
              : value === "refreshing-detail" || detailSnapshot.activity === "fetching"
                ? "refreshing"
                : "ready",
      mutationPending: transactions["incidents.mutate"]?.status === "pending",
      conflict: Option.getOrUndefined(context.conflict),
      timeline: context.timeline,
      timelineGap: context.timelineGap,
      timelineConnection: context.timelineConnection,
      runbook,
      runbookActive:
        value === "starting-runbook" || value === "runbook" || value === "replacing-runbook",
      feedback: Option.getOrUndefined(context.feedback),
      issueCount: issues.length,
    };
  },
});
